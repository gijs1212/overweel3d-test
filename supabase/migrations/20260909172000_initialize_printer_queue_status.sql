create or replace function public.set_printer_queue_item_color_status()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  if new.status in ('queued','blocked') then
    if public.printer_queue_colors_available(new) then
      new.status := 'queued';
      new.blocked_reason := null;
    else
      new.status := 'blocked';
      new.blocked_reason := 'Vereist filament zit niet correct in de AMS.';
    end if;
  end if;
  return new;
end;
$$;
revoke all on function public.set_printer_queue_item_color_status() from public, anon, authenticated;
drop trigger if exists set_queue_color_status_before_write on public.printer_queue_items;
create trigger set_queue_color_status_before_write
before insert or update of printer_id, required_colors on public.printer_queue_items
for each row execute function public.set_printer_queue_item_color_status();
