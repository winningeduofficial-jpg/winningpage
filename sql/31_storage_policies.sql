-- =====================================================================
-- Storage 버킷/RLS 정책 명문화 + admin 판정 통일 (계획서 docs/landing-image-admin-plan.md 2절)
-- Supabase SQL Editor에서 수동 실행 필요. (idempotent — 여러 번 실행해도 안전)
--
-- 포함:
--   1) storage.buckets 'banners' 존재 확인/공개(public) 보정
--   2) storage.objects 'banners' 버킷 정책:
--      public read + is_winning_admin() insert/update/delete
--   3) university_acceptances write 정책 is_admin() → is_winning_admin() 교체
--   4) banners 테이블 구식 profiles 서브쿼리 정책 4개 drop
--
-- 주의:
--   - storage.objects 정책 생성은 Supabase 프로젝트 권한 구성에 따라 SQL Editor의
--     postgres 롤로 실패할 수 있다(42501). 그 경우 대시보드 Storage > Policies에서
--     아래와 동일한 정의로 수동 생성할 것.
--   - is_winning_admin()은 00_base_schema.sql:1330 정의(security definer,
--     role in ('admin','admin_basic','admin_manager','admin_master'))를 그대로 사용한다.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1) banners 버킷 존재 확인 + public 보정
--    (publicUrl 접근은 버킷 public 플래그 기준 — URL 자체는 환경별 상이하므로 SQL에 넣지 않음)
-- ---------------------------------------------------------------------
insert into storage.buckets (id, name, public)
select 'banners', 'banners', true
where not exists (
  select 1 from storage.buckets where id = 'banners'
);

update storage.buckets
set public = true
where id = 'banners'
  and public is distinct from true;

-- ---------------------------------------------------------------------
-- 2) storage.objects 'banners' 버킷 정책
--    [감사] 실행 전 기존 정책을 확인해, 일반 authenticated 유저에게 write를 허용하는
--    정책(예: bucket_id 조건만 있고 admin 판정이 없는 insert/update/delete)이 있으면
--    별도로 drop 할 것 — 정책명이 환경(대시보드 생성 이력)마다 달라 여기서 일괄 drop하지 않는다:
--      select policyname, cmd, roles, qual, with_check
--      from pg_policies
--      where schemaname = 'storage' and tablename = 'objects';
-- ---------------------------------------------------------------------
drop policy if exists "banners bucket public read" on storage.objects;
create policy "banners bucket public read" on storage.objects
  for select to anon, authenticated
  using (bucket_id = 'banners');

drop policy if exists "banners bucket admin insert" on storage.objects;
create policy "banners bucket admin insert" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'banners' and public.is_winning_admin());

drop policy if exists "banners bucket admin update" on storage.objects;
create policy "banners bucket admin update" on storage.objects
  for update to authenticated
  using (bucket_id = 'banners' and public.is_winning_admin())
  with check (bucket_id = 'banners' and public.is_winning_admin());

drop policy if exists "banners bucket admin delete" on storage.objects;
create policy "banners bucket admin delete" on storage.objects
  for delete to authenticated
  using (bucket_id = 'banners' and public.is_winning_admin());

-- ---------------------------------------------------------------------
-- 3) university_acceptances : admin write 판정을 is_winning_admin()으로 통일
--    20_landing_renewal.sql의 is_admin()(role = 'admin'만 인정)을
--    운영 admin 4단계 role 체계와 동일한 is_winning_admin()으로 교체.
--    public read 정책은 그대로 둔다.
-- ---------------------------------------------------------------------
drop policy if exists "university_acceptances admin write" on public.university_acceptances;
create policy "university_acceptances admin write" on public.university_acceptances
  for all
  using (public.is_winning_admin())
  with check (public.is_winning_admin());

-- ---------------------------------------------------------------------
-- 4) banners 테이블 : 구식 profiles 서브쿼리 정책 drop
--    profiles를 직접 서브쿼리하는 정책은 profiles RLS 재귀(42P17) 위험이 있고
--    role = 'admin' 단일 판정이라 admin 4단계 체계와도 어긋난다.
--    admin write는 "Admin can manage banners" / "banners_admin_all"(is_admin() 기반,
--    00_base_schema.sql:1717·1726)이 계속 담당하므로 drop만 하고 재생성하지 않는다.
-- ---------------------------------------------------------------------
drop policy if exists "banners_admin_select" on public."banners";
drop policy if exists "banners_admin_insert" on public."banners";
drop policy if exists "banners_admin_update" on public."banners";
drop policy if exists "banners_admin_delete" on public."banners";
