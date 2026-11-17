alter table public.discount_codes
  add column if not exists product_id uuid
  references public.products(id)
  on delete cascade;

create index if not exists discount_codes_product_id_idx
  on public.discount_codes(product_id)
  where product_id is not null;

notify pgrst, 'reload schema';
