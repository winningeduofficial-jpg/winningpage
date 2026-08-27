-- QA A8/A9 (2026-08-27) — 랜딩 히어로 캐러셀 배너별 노출 시간(초)을 어드민에서 설정 가능하게 한다.
--
-- 왜 컬럼 추가인가 —
--   HeroSection.tsx의 MAIN_BANNER_INTERVAL(10s)/SIDE_BANNER_INTERVAL(5s)이 코드에
--   하드코딩돼 있어 배너마다 다른 노출 시간을 줄 수 없었다. 배너 행 단위로 값을 받아
--   캐러셀이 활성 슬라이드의 display_seconds만큼 머물게 한다.
--
-- 기본값 10/5는 기존 하드코딩 값과 동일해 마이그레이션 직후 화면 동작이 바뀌지 않는다.

alter table public.banners
  add column if not exists display_seconds integer not null default 10;

alter table public.banners
  add constraint banners_display_seconds_check
  check (display_seconds between 1 and 600);

comment on column public.banners.display_seconds is
  '랜딩 캐러셀에서 이 배너가 머무는 시간(초), QA A8/A9 2026-08-27';

alter table public.home_side_banners
  add column if not exists display_seconds integer not null default 5;

alter table public.home_side_banners
  add constraint home_side_banners_display_seconds_check
  check (display_seconds between 1 and 600);

comment on column public.home_side_banners.display_seconds is
  '랜딩 캐러셀에서 이 배너가 머무는 시간(초), QA A8/A9 2026-08-27';
