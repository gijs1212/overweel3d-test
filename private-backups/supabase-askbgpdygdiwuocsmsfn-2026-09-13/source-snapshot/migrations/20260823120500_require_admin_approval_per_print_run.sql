-- Require an explicit admin confirmation for every individual print run.
-- Matching a Bambu filename/plate only creates a suggestion; it never counts.

create or replace function public.complete_print_job_run(
  p_job_id uuid,
  p_printer_id uuid,
  p_observed_file_name text,
  p_raw_status jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_job public.print_jobs%rowtype;
  v_order public.orders%rowtype;
  v_run_number integer;
  v_total_plates integer;
  v_runs jsonb;
  v_statuses jsonb;
  v_completed boolean;
begin
  select * into v_job from public.print_jobs where id = p_job_id for update;
  if not found then return jsonb_build_object('counted', false, 'reason', 'job_not_found'); end if;
  if v_job.printer_id is distinct from p_printer_id then return jsonb_build_object('counted', false, 'reason', 'printer_mismatch'); end if;
  if v_job.status not in ('printing', 'paused') then return jsonb_build_object('counted', false, 'reason', 'already_counted'); end if;
  if v_job.approved_by is null or v_job.approved_at is null then
    return jsonb_build_object('counted', false, 'reason', 'admin_approval_required');
  end if;

  select * into v_order from public.orders where id = v_job.order_id for update;
  v_total_plates := greatest(coalesce(v_order.total_plates, 0), v_job.plate_number);
  v_runs := case when jsonb_typeof(v_order.plate_runs_completed) = 'array' then v_order.plate_runs_completed else '[]'::jsonb end;
  v_statuses := case when jsonb_typeof(v_order.plate_print_statuses) = 'array' then v_order.plate_print_statuses else '[]'::jsonb end;
  while jsonb_array_length(v_runs) < v_total_plates loop v_runs := v_runs || '0'::jsonb; end loop;
  while jsonb_array_length(v_statuses) < v_total_plates loop v_statuses := v_statuses || 'false'::jsonb; end loop;

  v_run_number := greatest(coalesce(v_job.runs_completed, 0), coalesce((v_runs ->> (v_job.plate_number - 1))::integer, 0)) + 1;
  v_completed := v_run_number >= v_job.runs_required;
  insert into public.print_runs (print_job_id, printer_id, run_number, observed_file_name, status, completed_at, filament_used_grams, raw_status)
  values (v_job.id, p_printer_id, v_run_number, p_observed_file_name, 'completed', now(), v_job.estimated_filament_grams, coalesce(p_raw_status, '{}'::jsonb))
  on conflict (print_job_id, run_number) do update set status = 'completed', completed_at = excluded.completed_at,
    observed_file_name = excluded.observed_file_name, filament_used_grams = excluded.filament_used_grams, raw_status = excluded.raw_status;

  update public.print_jobs set
    runs_completed = v_run_number,
    status = case when v_completed then 'completed' else 'suggested' end,
    completed_at = case when v_completed then now() else null end,
    observed_file_name = p_observed_file_name,
    approved_at = case when v_completed then approved_at else null end,
    approved_by = case when v_completed then approved_by else null end,
    suggested_at = case when v_completed then suggested_at else now() end
  where id = v_job.id;

  v_runs := jsonb_set(v_runs, array[(v_job.plate_number - 1)::text], to_jsonb(v_run_number));
  v_statuses := jsonb_set(v_statuses, array[(v_job.plate_number - 1)::text], to_jsonb(v_completed));
  update public.orders set plate_runs_completed = v_runs, plate_print_statuses = v_statuses,
    filament_used_g = coalesce(filament_used_g, 0) + coalesce(v_job.estimated_filament_grams, 0),
    print_duration_minutes = coalesce(print_duration_minutes, 0) + coalesce(v_job.estimated_duration_minutes, 0)
  where id = v_job.order_id;

  return jsonb_build_object('counted', true, 'runNumber', v_run_number, 'completed', v_completed, 'nextApprovalRequired', not v_completed);
end;
$$;

revoke execute on function public.complete_print_job_run(uuid, uuid, text, jsonb) from public, anon, authenticated;
grant execute on function public.complete_print_job_run(uuid, uuid, text, jsonb) to service_role;
