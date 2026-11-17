create or replace function public.record_manual_order_plate_run(
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
  v_remaining integer;
  v_completed_plates integer;
begin
  if (select auth.uid()) is null
     or not public.has_role((select auth.uid()), 'admin'::public.app_role) then
    raise exception 'Alleen een admin kan een printrun registreren' using errcode = '42501';
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
  where order_id = p_order_id and plate_number = p_plate_number
  for update;

  v_required_runs := greatest(
    1,
    coalesce((v_required ->> (p_plate_number - 1))::integer, 1),
    coalesce(v_job.runs_required, 1)
  );
  v_completed_runs := least(v_required_runs, greatest(
    0,
    coalesce((v_runs ->> (p_plate_number - 1))::integer, 0),
    coalesce(v_job.runs_completed, 0)
  ));

  if v_completed_runs >= v_required_runs then
    return jsonb_build_object(
      'counted', false,
      'reason', 'already_completed',
      'plateNumber', p_plate_number,
      'runsCompleted', v_completed_runs,
      'runsRequired', v_required_runs,
      'remaining', 0,
      'completed', true,
      'plateRunsCompleted', v_runs,
      'platePrintStatuses', v_statuses,
      'plateRunsRequired', v_required
    );
  end if;

  v_completed_runs := v_completed_runs + 1;
  v_remaining := greatest(0, v_required_runs - v_completed_runs);
  v_runs := jsonb_set(v_runs, array[(p_plate_number - 1)::text], to_jsonb(v_completed_runs));
  v_statuses := jsonb_set(v_statuses, array[(p_plate_number - 1)::text], to_jsonb(v_remaining = 0));
  v_required := jsonb_set(v_required, array[(p_plate_number - 1)::text], to_jsonb(v_required_runs));

  select count(*)::integer into v_completed_plates
  from jsonb_array_elements(v_statuses) item(value)
  where item.value = 'true'::jsonb;

  update public.orders
  set plate_runs_completed = v_runs,
      plate_print_statuses = v_statuses,
      plate_runs_required_per_plate = v_required,
      plates_completed = v_completed_plates
  where id = p_order_id;

  if v_job.id is not null then
    update public.print_jobs
    set runs_required = v_required_runs,
        runs_completed = v_completed_runs,
        status = case when v_remaining = 0 then 'completed' else status end,
        completed_at = case when v_remaining = 0 then coalesce(completed_at, now()) else null end
    where id = v_job.id;
  end if;

  insert into public.order_events(order_id, event_type, event_description, performed_by, visible_to_customer)
  values (
    p_order_id,
    'plate_printed',
    'Plaat ' || p_plate_number || ': uitvoering ' || v_completed_runs || ' van ' || v_required_runs || ' is als geprint geregistreerd.',
    (select auth.uid()),
    true
  );

  return jsonb_build_object(
    'counted', true,
    'plateNumber', p_plate_number,
    'runsCompleted', v_completed_runs,
    'runsRequired', v_required_runs,
    'remaining', v_remaining,
    'completed', v_remaining = 0,
    'platesCompleted', v_completed_plates,
    'plateRunsCompleted', v_runs,
    'platePrintStatuses', v_statuses,
    'plateRunsRequired', v_required
  );
end;
$$;

revoke all on function public.record_manual_order_plate_run(uuid, integer) from public, anon;
grant execute on function public.record_manual_order_plate_run(uuid, integer) to authenticated;
