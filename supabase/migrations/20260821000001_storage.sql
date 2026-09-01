-- =====================================================================
-- storage 버킷·정책 (dev 실측, 2026-08-21)
-- baseline은 public 스키마 전용이라 storage 몫을 여기서 재현한다.
-- 구 sql/ 체계 storage 관련 파일들의 스쿼시 결과물.
-- idempotent — 재실행 안전.
-- =====================================================================

-- 버킷 3종
insert into storage.buckets (id, name, public)
values
  ('banners', 'banners', true),
  ('mentor-applications', 'mentor-applications', false),
  ('performance-guides', 'performance-guides', false)
on conflict (id) do update set public = excluded.public;

-- storage.objects 정책 6종
drop policy if exists "banners bucket public read" on storage.objects;
create policy "banners bucket public read"
  on storage.objects for select to anon, authenticated
  using (bucket_id = 'banners');

drop policy if exists "banners bucket admin insert" on storage.objects;
create policy "banners bucket admin insert"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'banners' and is_winning_admin());

drop policy if exists "banners bucket admin update" on storage.objects;
create policy "banners bucket admin update"
  on storage.objects for update to authenticated
  using (bucket_id = 'banners' and is_winning_admin())
  with check (bucket_id = 'banners' and is_winning_admin());

drop policy if exists "banners bucket admin delete" on storage.objects;
create policy "banners bucket admin delete"
  on storage.objects for delete to authenticated
  using (bucket_id = 'banners' and is_winning_admin());

drop policy if exists "mentor proof admin read" on storage.objects;
create policy "mentor proof admin read"
  on storage.objects for select to authenticated
  using (bucket_id = 'mentor-applications' and is_winning_admin());

drop policy if exists "performance guides owner read" on storage.objects;
create policy "performance guides owner read"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'performance-guides'
    and (storage.foldername(name))[1] = (auth.uid())::text
  );
