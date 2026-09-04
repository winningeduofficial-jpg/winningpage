-- =====================================================================
-- storage.objects 정책 복구 (2026-09-04)
--
-- 증상: 운영 관리자웹 "팝업 관리"에서 이미지 업로드가 계속 실패한다는 문의.
--
-- 원인(prod 실측, 2026-09-04): storage.objects 는 RLS 가 켜져 있는데
-- pg_policies 에 storage 스키마 정책이 0개다. 20260821000001_storage.sql 은
-- prod 에 적용 기록(statements 13개, create policy 6개)이 남아 있으므로 적용
-- 이후 어떤 경로로 정책만 사라진 상태다. 정책이 없으면 authenticated 관리자의
-- banners 버킷 insert 가 RLS 에 막혀 관리자웹의 모든 이미지·파일 업로드
-- (팝업·배너·공지 첨부 등 AdminEngine 업로드 전부)가 실패한다.
-- dev 는 같은 6개 정책이 정상 존재한다.
--
-- 조치: 20260821000001_storage.sql 의 정책 6종을 그대로 다시 만든다.
-- drop if exists + create 라 재실행 안전(idempotent) — dev 처럼 이미 있으면
-- 동일 정의로 재생성될 뿐이다. 버킷 upsert 는 prod 버킷 설정(file_size_limit·
-- allowed_mime_types 가 대시보드에서 따로 잡혀 있음)을 건드리지 않도록 뺐다.
-- =====================================================================

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
