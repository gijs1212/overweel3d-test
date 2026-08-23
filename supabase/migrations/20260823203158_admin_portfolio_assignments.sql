create table if not exists public.portfolio_projects (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(trim(title)) between 1 and 120),
  description text not null default '',
  is_published boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.portfolio_project_media (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.portfolio_projects(id) on delete cascade,
  storage_path text not null unique,
  original_filename text not null,
  mime_type text not null default 'application/octet-stream',
  file_size bigint not null default 0,
  is_cover boolean not null default false,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists portfolio_projects_public_order_idx
  on public.portfolio_projects (is_published, sort_order, created_at desc);
create index if not exists portfolio_project_media_project_idx
  on public.portfolio_project_media (project_id, sort_order, created_at);

alter table public.portfolio_projects enable row level security;
alter table public.portfolio_project_media enable row level security;

drop policy if exists "Published portfolio projects are public" on public.portfolio_projects;
create policy "Published portfolio projects are public" on public.portfolio_projects
  for select to anon, authenticated using (is_published or public.has_role((select auth.uid()), 'admin'));
drop policy if exists "Admins manage portfolio projects" on public.portfolio_projects;
create policy "Admins manage portfolio projects" on public.portfolio_projects
  for all to authenticated using (public.has_role((select auth.uid()), 'admin'))
  with check (public.has_role((select auth.uid()), 'admin'));

drop policy if exists "Published portfolio media are public" on public.portfolio_project_media;
create policy "Published portfolio media are public" on public.portfolio_project_media
  for select to anon, authenticated using (
    exists (select 1 from public.portfolio_projects project where project.id = project_id and project.is_published)
    or public.has_role((select auth.uid()), 'admin')
  );
drop policy if exists "Admins manage portfolio media" on public.portfolio_project_media;
create policy "Admins manage portfolio media" on public.portfolio_project_media
  for all to authenticated using (public.has_role((select auth.uid()), 'admin'))
  with check (public.has_role((select auth.uid()), 'admin'));

drop policy if exists "Public read portfolio media" on storage.objects;
create policy "Public read portfolio media" on storage.objects
  for select to anon, authenticated using (bucket_id = 'orders' and name like 'portfolio/%');
drop policy if exists "Admins upload portfolio media" on storage.objects;
create policy "Admins upload portfolio media" on storage.objects
  for insert to authenticated with check (
    bucket_id = 'orders' and name like 'portfolio/%' and public.has_role((select auth.uid()), 'admin')
  );
drop policy if exists "Admins update portfolio media" on storage.objects;
create policy "Admins update portfolio media" on storage.objects
  for update to authenticated using (
    bucket_id = 'orders' and name like 'portfolio/%' and public.has_role((select auth.uid()), 'admin')
  ) with check (
    bucket_id = 'orders' and name like 'portfolio/%' and public.has_role((select auth.uid()), 'admin')
  );
drop policy if exists "Admins delete portfolio media" on storage.objects;
create policy "Admins delete portfolio media" on storage.objects
  for delete to authenticated using (
    bucket_id = 'orders' and name like 'portfolio/%' and public.has_role((select auth.uid()), 'admin')
  );

drop trigger if exists update_portfolio_projects_updated_at on public.portfolio_projects;
create trigger update_portfolio_projects_updated_at before update on public.portfolio_projects
for each row execute function public.update_updated_at();
