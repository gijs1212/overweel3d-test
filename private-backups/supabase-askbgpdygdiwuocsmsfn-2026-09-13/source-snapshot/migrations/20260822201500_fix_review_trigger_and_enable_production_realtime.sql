drop trigger if exists verify_product_review on public.product_reviews;
create trigger verify_product_review before insert on public.product_reviews
for each row execute function public.verify_product_review();

drop policy if exists "Public read approved review photos" on storage.objects;
create policy "Public read approved review photos" on storage.objects for select to anon, authenticated
using (
  bucket_id = 'orders' and name like 'reviews/%'
  and exists (
    select 1 from public.product_reviews review
    where review.status = 'approved' and review.photos ? storage.objects.name
  )
);

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'printers'
  ) then
    alter publication supabase_realtime add table public.printers;
  end if;
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'printer_ams_slots'
  ) then
    alter publication supabase_realtime add table public.printer_ams_slots;
  end if;
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'print_jobs'
  ) then
    alter publication supabase_realtime add table public.print_jobs;
  end if;
end $$;

notify pgrst, 'reload schema';
