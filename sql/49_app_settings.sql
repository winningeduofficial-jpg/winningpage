-- =====================================================================
-- 전역 앱 설정 키-값 테이블. Supabase SQL Editor에서 수동 실행 필요.
-- (idempotent — 여러 번 실행해도 안전)
--
-- 배경: 대입모집요강 "연도별 관리" 도입(2026-08-06) — 공개 노출 연도를
-- 관리자가 명시적으로 지정해야 한다(최신 연도 자동 노출 금지, 준비 중
-- 데이터 조기 노출 방지). 지금까지 AdmissionGuidelines.jsx:86의
-- ACTIVE_ADMISSION_YEAR = 2027 하드코딩을 이 테이블의 값으로 대체한다.
--
-- page_contents(slug 기반 마케팅 콘텐츠)나 admission_universities(대학
-- 속성)에 얹지 않고 전용 테이블을 신설한 이유: 전역 설정은 두 테이블
-- 어느 도메인에도 속하지 않고, 억지로 얹으면 의미가 뒤틀린다(page_contents
-- 는 title/subtitle/body/버튼 같은 콘텐츠 스키마다). 전용 키-값 테이블은
-- 앞으로 다른 전역 설정이 생겨도 스키마 변경 없이 행만 추가하면 된다.
--
-- ⚠ public read가 무조건 true다. 이 테이블에 비밀값(키·토큰·내부 URL)을
--    넣지 마라. 공개 페이지가 읽어야 하는 전역 설정만 담는다.
-- =====================================================================

create table if not exists public.app_settings (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz not null default now()
);

alter table public.app_settings enable row level security;

drop policy if exists "app_settings_public_read" on public.app_settings;
create policy "app_settings_public_read" on public.app_settings
  as permissive for select to anon, authenticated
  using (true);

drop policy if exists "app_settings_admin_write" on public.app_settings;
create policy "app_settings_admin_write" on public.app_settings
  as permissive for all to authenticated
  using (is_winning_admin())
  with check (is_winning_admin());

insert into public.app_settings (key, value)
values ('admission_active_year', '2027'::jsonb)
on conflict (key) do nothing;

-- 확인용:
-- select * from app_settings;

-- 롤백(주의 — 이 값을 읽는 코드가 배포된 뒤엔 되돌리지 마라):
-- drop policy if exists "app_settings_public_read" on public.app_settings;
-- drop policy if exists "app_settings_admin_write" on public.app_settings;
-- drop table if exists public.app_settings;
