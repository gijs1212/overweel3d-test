drop policy if exists "Published portfolio projects are public" on public.portfolio_projects;
drop policy if exists "Admins manage portfolio projects" on public.portfolio_projects;
create policy "Visitors view published portfolio projects" on public.portfolio_projects
  for select to anon using (is_published);
create policy "Users view published portfolio projects" on public.portfolio_projects
  for select to authenticated using (is_published or public.has_role((select auth.uid()), 'admin'));
create policy "Admins insert portfolio projects" on public.portfolio_projects
  for insert to authenticated with check (public.has_role((select auth.uid()), 'admin'));
create policy "Admins update portfolio projects" on public.portfolio_projects
  for update to authenticated using (public.has_role((select auth.uid()), 'admin'))
  with check (public.has_role((select auth.uid()), 'admin'));
create policy "Admins delete portfolio projects" on public.portfolio_projects
  for delete to authenticated using (public.has_role((select auth.uid()), 'admin'));

drop policy if exists "Published portfolio media are public" on public.portfolio_project_media;
drop policy if exists "Admins manage portfolio media" on public.portfolio_project_media;
create policy "Visitors view published portfolio media" on public.portfolio_project_media
  for select to anon using (
    exists (select 1 from public.portfolio_projects project where project.id = project_id and project.is_published)
  );
create policy "Users view published portfolio media" on public.portfolio_project_media
  for select to authenticated using (
    exists (select 1 from public.portfolio_projects project where project.id = project_id and project.is_published)
    or public.has_role((select auth.uid()), 'admin')
  );
create policy "Admins insert portfolio media" on public.portfolio_project_media
  for insert to authenticated with check (public.has_role((select auth.uid()), 'admin'));
create policy "Admins update portfolio media" on public.portfolio_project_media
  for update to authenticated using (public.has_role((select auth.uid()), 'admin'))
  with check (public.has_role((select auth.uid()), 'admin'));
create policy "Admins delete portfolio media" on public.portfolio_project_media
  for delete to authenticated using (public.has_role((select auth.uid()), 'admin'));
