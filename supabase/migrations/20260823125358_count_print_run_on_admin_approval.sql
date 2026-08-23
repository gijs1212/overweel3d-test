-- Count one completed print run at the moment an admin confirms a matched
-- order/plate. The whole update is atomic so the order screen immediately
-- reflects the new remaining count.

alter table public.print_jobs drop constraint if exists print_jobs_status_check;
alter table public.print_jobs add constraint print_jobs_status_check
  check (status in ('queued','suggested','approved','printing','paused','awaiting_next_run','completed','mismatch','cancelled'));

create or replace function public.approve_and_count_print_job_run(
  p_suggestion_job_id uuid,
  p_plate_number integer
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_suggestion public.print_jobs%rowtype;
  v_job public.print_jobs%rowtype;
  v_order public.orders%rowtype;
  v_runs jsonb;
  v_statuses jsonb;
  v_total_plates integer;
  v_run_number integer;
  v_remaining integer;
  v_completed boolean;
  v_completed_plates integer;
  v_observed_file text;
begin
  if (select auth.uid()) is null or not public.has_role((select auth.uid()), 'admin'::public.app_role) then
    raise exception 'Alleen een admin kan een printrun goedkeuren' using errcode = '42501';
  end if;
  if p_plate_number is null or p_plate_number < 1 then
    raise exception 'Ongeldig plaatnummer' using errcode = '22023';
  end if;

  select * into v_suggestion from public.print_jobs where id = p_suggestion_job_id for update;
  if not found then return jsonb_build_object('counted', false, 'reason', 'suggestion_not_found'); end if;
  if v_suggestion.status <> 'suggested' then return jsonb_build_object('counted', false, 'reason', 'suggestion_not_active'); end if;
  if v_suggestion.printer_id is null then return jsonb_build_object('counted', false, 'reason', 'printer_missing'); end if;

  select * into v_order from public.orders where id = v_suggestion.order_id for update;
  if not found or v_order.status in ('completed', 'cancelled') then
    return jsonb_build_object('counted', false, 'reason', 'order_closed');
  end if;
  if p_plate_number > greatest(coalesce(v_order.total_plates, 0), 1) then
    return jsonb_build_object('counted', false, 'reason', 'plate_out_of_range');
  end if;

  select * into v_job from public.print_jobs
  where order_id = v_suggestion.order_id and plate_number = p_plate_number
  for update;
  if not found then return jsonb_build_object('counted', false, 'reason', 'plate_job_not_found'); end if;
  if v_job.status in ('completed', 'cancelled') or v_job.runs_completed >= v_job.runs_required then
    return jsonb_build_object('counted', false, 'reason', 'already_fully_printed');
  end if;

  v_total_plates := greatest(coalesce(v_order.total_plates, 0), v_job.plate_number);
  v_runs := case when jsonb_typeof(v_order.plate_runs_completed) = 'array' then v_order.plate_runs_completed else '[]'::jsonb end;
  v_statuses := case when jsonb_typeof(v_order.plate_print_statuses) = 'array' then v_order.plate_print_statuses else '[]'::jsonb end;
  while jsonb_array_length(v_runs) < v_total_plates loop v_runs := v_runs || '0'::jsonb; end loop;
  while jsonb_array_length(v_statuses) < v_total_plates loop v_statuses := v_statuses || 'false'::jsonb; end loop;

  v_run_number := greatest(coalesce(v_job.runs_completed, 0), coalesce((v_runs ->> (v_job.plate_number - 1))::integer, 0)) + 1;
  v_run_number := least(v_run_number, v_job.runs_required);
  v_remaining := greatest(v_job.runs_required - v_run_number, 0);
  v_completed := v_remaining = 0;
  v_observed_file := coalesce(nullif(v_suggestion.observed_file_name, ''), nullif(v_job.observed_file_name, ''), v_job.expected_file_name);

  insert into public.print_runs (print_job_id, printer_id, run_number, observed_file_name, status, completed_at, filament_used_grams, raw_status)
  values (v_job.id, v_suggestion.printer_id, v_run_number, v_observed_file, 'completed', now(), v_job.estimated_filament_grams,
    jsonb_build_object('source', 'admin_approval', 'suggestionJobId', v_suggestion.id, 'approvedBy', (select auth.uid())))
  on conflict (print_job_id, run_number) do update set
    printer_id = excluded.printer_id,
    observed_file_name = excluded.observed_file_name,
    status = 'completed',
    completed_at = excluded.completed_at,
    filament_used_grams = excluded.filament_used_grams,
    raw_status = excluded.raw_status;

  if v_suggestion.id <> v_job.id then
    update public.print_jobs set status = 'queued', printer_id = null, suggested_at = null,
      observed_file_name = null, approved_at = null, approved_by = null
    where id = v_suggestion.id;
  end if;

  update public.print_jobs set
    runs_completed = v_run_number,
    status = case when v_completed then 'completed' else 'awaiting_next_run' end,
    printer_id = v_suggestion.printer_id,
    completed_at = case when v_completed then now() else null end,
    approved_at = now(),
    approved_by = (select auth.uid()),
    observed_file_name = v_observed_file,
    comparison = coalesce(v_job.comparison, '{}'::jsonb) || jsonb_build_object(
      'match', true,
      'countedByAdminAt', now(),
      'countedSuggestionJobId', v_suggestion.id,
      'remainingRuns', v_remaining
    )
  where id = v_job.id;

  v_runs := jsonb_set(v_runs, array[(v_job.plate_number - 1)::text], to_jsonb(v_run_number));
  v_statuses := jsonb_set(v_statuses, array[(v_job.plate_number - 1)::text], to_jsonb(v_completed));
  select count(*)::integer into v_completed_plates
  from jsonb_array_elements(v_statuses) as item(value)
  where item.value = 'true'::jsonb;

  update public.orders set
    plate_runs_completed = v_runs,
    plate_print_statuses = v_statuses,
    plates_completed = v_completed_plates,
    filament_used_g = coalesce(filament_used_g, 0) + coalesce(v_job.estimated_filament_grams, 0),
    print_duration_minutes = coalesce(print_duration_minutes, 0) + coalesce(v_job.estimated_duration_minutes, 0)
  where id = v_job.order_id;

  insert into public.order_events (order_id, event_type, event_description, performed_by, visible_to_customer)
  values (
    v_job.order_id,
    'print_run_completed',
    case when v_completed
      then format('Plaat %s is volledig geprint (%s van %s printruns).', v_job.plate_number, v_run_number, v_job.runs_required)
      else format('Plaat %s: printrun %s van %s voltooid; nog %s te printen.', v_job.plate_number, v_run_number, v_job.runs_required, v_remaining)
    end,
    (select auth.uid()),
    true
  );

  return jsonb_build_object(
    'counted', true,
    'runNumber', v_run_number,
    'runsRequired', v_job.runs_required,
    'remainingRuns', v_remaining,
    'completed', v_completed,
    'plateNumber', v_job.plate_number
  );
end;
$$;

revoke all on function public.approve_and_count_print_job_run(uuid, integer) from public, anon;
grant execute on function public.approve_and_count_print_job_run(uuid, integer) to authenticated;
