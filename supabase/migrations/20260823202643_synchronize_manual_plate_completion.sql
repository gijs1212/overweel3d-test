create or replace function public.synchronize_order_plate_jobs()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_job public.print_jobs%rowtype;
  v_runs jsonb;
  v_statuses jsonb;
  v_required jsonb;
  v_total_plates integer;
  v_required_runs integer;
  v_order_runs integer;
  v_completed_runs integer;
  v_manual_complete boolean;
  v_completed_plates integer;
begin
  v_total_plates := greatest(coalesce(new.total_plates, 0), 0);
  v_runs := case when jsonb_typeof(new.plate_runs_completed) = 'array' then new.plate_runs_completed else '[]'::jsonb end;
  v_statuses := case when jsonb_typeof(new.plate_print_statuses) = 'array' then new.plate_print_statuses else '[]'::jsonb end;
  v_required := case when jsonb_typeof(new.plate_runs_required_per_plate) = 'array' then new.plate_runs_required_per_plate else '[]'::jsonb end;

  while jsonb_array_length(v_runs) < v_total_plates loop v_runs := v_runs || '0'::jsonb; end loop;
  while jsonb_array_length(v_statuses) < v_total_plates loop v_statuses := v_statuses || 'false'::jsonb; end loop;
  while jsonb_array_length(v_required) < v_total_plates loop v_required := v_required || '1'::jsonb; end loop;

  for v_job in
    select *
    from public.print_jobs
    where order_id = new.id
      and plate_number between 1 and v_total_plates
    order by plate_number
    for update
  loop
    v_required_runs := greatest(
      1,
      coalesce((v_required ->> (v_job.plate_number - 1))::integer, 1),
      coalesce(v_job.runs_required, 1),
      coalesce(v_job.runs_completed, 0)
    );
    v_order_runs := greatest(0, coalesce((v_runs ->> (v_job.plate_number - 1))::integer, 0));
    v_manual_complete := coalesce((v_statuses ->> (v_job.plate_number - 1))::boolean, false);
    v_completed_runs := least(
      v_required_runs,
      greatest(
        coalesce(v_job.runs_completed, 0),
        v_order_runs,
        case when v_manual_complete then v_required_runs else 0 end
      )
    );

    update public.print_jobs
    set
      runs_required = v_required_runs,
      runs_completed = v_completed_runs,
      status = case when v_completed_runs >= v_required_runs then 'completed' else status end,
      completed_at = case
        when v_completed_runs >= v_required_runs then coalesce(completed_at, now())
        else completed_at
      end
    where id = v_job.id;

    v_runs := jsonb_set(v_runs, array[(v_job.plate_number - 1)::text], to_jsonb(v_completed_runs));
    v_statuses := jsonb_set(v_statuses, array[(v_job.plate_number - 1)::text], to_jsonb(v_completed_runs >= v_required_runs));
    v_required := jsonb_set(v_required, array[(v_job.plate_number - 1)::text], to_jsonb(v_required_runs));
  end loop;

  select count(*)::integer
  into v_completed_plates
  from jsonb_array_elements(v_statuses) item(value)
  where item.value = 'true'::jsonb;

  new.plate_runs_completed := v_runs;
  new.plate_print_statuses := v_statuses;
  new.plate_runs_required_per_plate := v_required;
  new.plates_completed := v_completed_plates;
  return new;
end;
$$;

drop trigger if exists synchronize_order_plate_jobs on public.orders;
create trigger synchronize_order_plate_jobs
before update of plate_print_statuses, plate_runs_required_per_plate
on public.orders
for each row
execute function public.synchronize_order_plate_jobs();

create or replace function public.refresh_order_plate_data(p_order_id uuid)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_order public.orders%rowtype;
begin
  if (select auth.uid()) is null or not public.has_role((select auth.uid()), 'admin'::public.app_role) then
    raise exception 'Alleen een admin kan plaatgegevens verversen' using errcode = '42501';
  end if;

  update public.orders
  set
    plate_print_statuses = plate_print_statuses,
    plate_runs_required_per_plate = plate_runs_required_per_plate
  where id = p_order_id
  returning * into v_order;

  if not found then
    return jsonb_build_object('refreshed', false, 'reason', 'order_not_found');
  end if;

  return jsonb_build_object(
    'refreshed', true,
    'orderId', v_order.id,
    'platePrintStatuses', v_order.plate_print_statuses,
    'plateRunsCompleted', v_order.plate_runs_completed,
    'plateRunsRequired', v_order.plate_runs_required_per_plate,
    'platesCompleted', v_order.plates_completed
  );
end;
$$;

revoke all on function public.refresh_order_plate_data(uuid) from public, anon;
grant execute on function public.refresh_order_plate_data(uuid) to authenticated;

-- Repair existing orders whose manual completed status had not reached the
-- print_jobs counters. This uses the same trigger as all future updates.
update public.orders
set
  plate_print_statuses = plate_print_statuses,
  plate_runs_required_per_plate = plate_runs_required_per_plate
where exists (select 1 from public.print_jobs job where job.order_id = orders.id);
