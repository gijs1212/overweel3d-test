create or replace function public.decrement_manual_order_plate_run(
  p_order_id uuid,
  p_plate_number integer
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_order public.orders%rowtype;
  v_job public.print_jobs%rowtype;
  v_runs jsonb;
  v_statuses jsonb;
  v_required jsonb;
  v_required_runs integer;
  v_completed_runs integer;
  v_completed_plates integer;
  v_reversed_run boolean := false;
begin
  if (select auth.uid()) is null
     or not public.has_role((select auth.uid()), 'admin'::public.app_role) then
    raise exception 'Alleen een admin kan een printrun corrigeren' using errcode = '42501';
  end if;
  if p_plate_number is null or p_plate_number < 1 then
    raise exception 'Ongeldig plaatnummer' using errcode = '22023';
  end if;

  select * into v_order
  from public.orders
  where id = p_order_id
  for update;
  if not found then raise exception 'Bestelling niet gevonden'; end if;
  if p_plate_number > greatest(coalesce(v_order.total_plates, 0), 0) then
    raise exception 'Plaat % bestaat niet in deze bestelling', p_plate_number using errcode = '22023';
  end if;

  v_runs := case when jsonb_typeof(v_order.plate_runs_completed) = 'array' then v_order.plate_runs_completed else '[]'::jsonb end;
  v_statuses := case when jsonb_typeof(v_order.plate_print_statuses) = 'array' then v_order.plate_print_statuses else '[]'::jsonb end;
  v_required := case when jsonb_typeof(v_order.plate_runs_required_per_plate) = 'array' then v_order.plate_runs_required_per_plate else '[]'::jsonb end;
  while jsonb_array_length(v_runs) < v_order.total_plates loop v_runs := v_runs || '0'::jsonb; end loop;
  while jsonb_array_length(v_statuses) < v_order.total_plates loop v_statuses := v_statuses || 'false'::jsonb; end loop;
  while jsonb_array_length(v_required) < v_order.total_plates loop v_required := v_required || '1'::jsonb; end loop;

  select * into v_job
  from public.print_jobs
  where order_id = p_order_id
    and plate_number = p_plate_number
    and active
  for update;

  v_required_runs := greatest(
    1,
    coalesce((v_required ->> (p_plate_number - 1))::integer, 1),
    coalesce(v_job.runs_required, 1)
  );
  v_completed_runs := greatest(
    0,
    coalesce((v_runs ->> (p_plate_number - 1))::integer, 0),
    coalesce(v_job.runs_completed, 0)
  );

  if v_completed_runs = 0 then
    return jsonb_build_object(
      'decremented', false,
      'reason', 'no_completed_runs',
      'plateNumber', p_plate_number,
      'runsCompleted', 0,
      'runsRequired', v_required_runs,
      'remaining', v_required_runs,
      'completed', false,
      'plateRunsCompleted', v_runs,
      'platePrintStatuses', v_statuses,
      'plateRunsRequired', v_required
    );
  end if;

  if v_job.id is not null then
    update public.print_runs
    set status = 'cancelled',
        completed_at = null,
        raw_status = coalesce(raw_status, '{}'::jsonb) || jsonb_build_object(
          'correctedByAdminAt', now(),
          'correctedBy', (select auth.uid())
        )
    where print_job_id = v_job.id
      and run_number = v_completed_runs
      and status = 'completed'
    returning true into v_reversed_run;

    update public.print_jobs
    set runs_completed = v_completed_runs - 1,
        status = 'queued',
        completed_at = null,
        printer_id = null,
        suggested_at = null,
        approved_at = null,
        approved_by = null
    where id = v_job.id;
  end if;

  v_completed_runs := v_completed_runs - 1;
  v_runs := jsonb_set(v_runs, array[(p_plate_number - 1)::text], to_jsonb(v_completed_runs));
  v_statuses := jsonb_set(v_statuses, array[(p_plate_number - 1)::text], 'false'::jsonb);
  v_required := jsonb_set(v_required, array[(p_plate_number - 1)::text], to_jsonb(v_required_runs));

  select count(*)::integer into v_completed_plates
  from jsonb_array_elements(v_statuses) item(value)
  where item.value = 'true'::jsonb;

  update public.orders
  set plate_runs_completed = v_runs,
      plate_print_statuses = v_statuses,
      plate_runs_required_per_plate = v_required,
      plates_completed = v_completed_plates,
      filament_used_g = case when v_reversed_run then greatest(0, coalesce(filament_used_g, 0) - coalesce(v_job.estimated_filament_grams, 0)) else filament_used_g end,
      print_duration_minutes = case when v_reversed_run then greatest(0, coalesce(print_duration_minutes, 0) - coalesce(v_job.estimated_duration_minutes, 0)) else print_duration_minutes end
  where id = p_order_id;

  insert into public.order_events(order_id, event_type, event_description, performed_by, visible_to_customer)
  values (
    p_order_id,
    'plate_print_correction',
    'Correctie plaat ' || p_plate_number || ': aantal geprinte uitvoeringen teruggezet naar ' || v_completed_runs || ' van ' || v_required_runs || '.',
    (select auth.uid()),
    true
  );

  return jsonb_build_object(
    'decremented', true,
    'plateNumber', p_plate_number,
    'runsCompleted', v_completed_runs,
    'runsRequired', v_required_runs,
    'remaining', greatest(0, v_required_runs - v_completed_runs),
    'completed', false,
    'platesCompleted', v_completed_plates,
    'plateRunsCompleted', v_runs,
    'platePrintStatuses', v_statuses,
    'plateRunsRequired', v_required
  );
end;
$$;

revoke all on function public.decrement_manual_order_plate_run(uuid, integer) from public, anon;
grant execute on function public.decrement_manual_order_plate_run(uuid, integer) to authenticated;
