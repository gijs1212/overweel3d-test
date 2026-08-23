-- Secure Home Assistant access and atomic manual plate completion.

create table public.home_assistant_tokens (
  id uuid primary key default gen_random_uuid(),
  name text not null default 'Home Assistant' check (char_length(name) between 1 and 80),
  token_hash text not null unique check (token_hash ~ '^[0-9a-f]{64}$'),
  active boolean not null default true,
  last_used_at timestamptz,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

alter table public.home_assistant_tokens enable row level security;
create policy "Admins manage Home Assistant tokens"
on public.home_assistant_tokens for all to authenticated
using (public.has_role((select auth.uid()), 'admin'))
with check (public.has_role((select auth.uid()), 'admin'));

grant select, insert, update, delete on public.home_assistant_tokens to authenticated;

alter table public.print_jobs
  add column if not exists approved_via text
  check (approved_via is null or approved_via in ('admin', 'home_assistant'));

create or replace function public.mark_print_job_run_from_integration(p_job_id uuid)
returns jsonb
language plpgsql
security definer
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
  if not found then raise exception 'Printplaat niet gevonden.'; end if;

  select * into v_order from public.orders where id = v_job.order_id for update;
  if not found or v_order.status in ('completed', 'cancelled') then
    raise exception 'Bestelling is niet meer actief.';
  end if;

  v_total_plates := greatest(coalesce(v_order.total_plates, 0), v_job.plate_number);
  v_runs := case when jsonb_typeof(v_order.plate_runs_completed) = 'array' then v_order.plate_runs_completed else '[]'::jsonb end;
  v_statuses := case when jsonb_typeof(v_order.plate_print_statuses) = 'array' then v_order.plate_print_statuses else '[]'::jsonb end;
  while jsonb_array_length(v_runs) < v_total_plates loop v_runs := v_runs || '0'::jsonb; end loop;
  while jsonb_array_length(v_statuses) < v_total_plates loop v_statuses := v_statuses || 'false'::jsonb; end loop;

  v_run_number := greatest(coalesce(v_job.runs_completed, 0), coalesce((v_runs ->> (v_job.plate_number - 1))::integer, 0)) + 1;
  v_completed := v_run_number >= v_job.runs_required;

  update public.print_jobs set
    runs_completed = v_run_number,
    status = case when v_completed then 'completed' else 'queued' end,
    completed_at = case when v_completed then now() else null end,
    approved_at = null,
    approved_by = null,
    approved_via = null,
    comparison = coalesce(comparison, '{}'::jsonb) || jsonb_build_object('lastManualCompletion', now(), 'source', 'home_assistant')
  where id = v_job.id;

  v_runs := jsonb_set(v_runs, array[(v_job.plate_number - 1)::text], to_jsonb(v_run_number));
  v_statuses := jsonb_set(v_statuses, array[(v_job.plate_number - 1)::text], to_jsonb(v_completed));
  update public.orders set plate_runs_completed = v_runs, plate_print_statuses = v_statuses where id = v_job.order_id;

  insert into public.order_events(order_id, event_type, event_description, visible_to_customer)
  values (v_job.order_id, 'plate_printed', 'Plaat ' || v_job.plate_number || ' is als geprint geregistreerd via Home Assistant.', true);

  return jsonb_build_object('counted', true, 'plateNumber', v_job.plate_number, 'runNumber', v_run_number, 'completed', v_completed);
end;
$$;

revoke all on function public.mark_print_job_run_from_integration(uuid) from public, anon, authenticated;
grant execute on function public.mark_print_job_run_from_integration(uuid) to service_role;

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
  if v_job.approved_at is null or (v_job.approved_by is null and coalesce(v_job.approved_via, '') <> 'home_assistant') then
    return jsonb_build_object('counted', false, 'reason', 'approval_required');
  end if;

  select * into v_order from public.orders where id = v_job.order_id for update;
  if v_order.status in ('completed', 'cancelled') then return jsonb_build_object('counted', false, 'reason', 'order_closed'); end if;
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
    approved_via = case when v_completed then approved_via else null end,
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
