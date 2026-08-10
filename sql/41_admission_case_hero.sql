-- =====================================================================
-- 수시정시 합격사례 히어로(합격률 + 대학 로고 스트립) 어드민 전환.
-- Supabase SQL Editor에서 수동 실행 필요. (idempotent — 여러 번 실행해도 안전)
--
-- 배경: src/components/admission/AcceptanceRateHero.jsx 가 '5개년 평균
-- 95.4%' 문구와 대학 로고 12종(src/assets/admission/universities/*.png
-- static import)을 소스에 하드코딩하고 있어, 연도가 바뀌거나 로고가
-- 추가/교체될 때마다 배포가 필요하다. 이를 어드민에서 관리할 수 있도록
-- 두 테이블로 분리한다.
--
-- 포함:
--   1) admission_acceptance_rates 신규 테이블 (연도별 합격률)
--      + is_active/sort_order 인덱스 + RLS(public read / admin write)
--      + 2021~2025 5개년 시드 (on conflict do nothing — 재실행 안전)
--   2) admission_case_logos 신규 테이블 (히어로 대학 로고 스트립)
--      + is_active/sort_order 인덱스 + RLS(public read / admin write)
--      시드 없음 — 프론트가 번들 로고 12종으로 폴백한다.
--
-- 주의: 이 마이그레이션을 적용하지 않아도 공개 페이지는 폴백 값으로
-- 현재와 동일하게 동작한다. 다만 어드민(Admin.jsx의 acceptanceRates /
-- admissionCaseLogos 섹션)은 테이블이 없으면 조회/저장이 실패하므로
-- 어드민 배포 전에 이 파일을 먼저 실행할 것.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1) admission_acceptance_rates : 연도별 목표 대학 합격률
--    공개 페이지는 is_active 행의 개수를 'N개년 평균', rate 평균을
--    표시 숫자로 사용한다. 평균 계산은 프론트에서 한다(뷰 없음).
-- ---------------------------------------------------------------------
create table if not exists public.admission_acceptance_rates (
    id uuid default gen_random_uuid() not null,
    year integer not null,
    rate numeric(5,2) default 0 not null,
    sort_order integer default 0,
    is_active boolean default true,
    created_at timestamp with time zone default now(),
    updated_at timestamp with time zone default now(),
    constraint admission_acceptance_rates_pkey primary key (id),
    constraint admission_acceptance_rates_year_key unique (year),
    constraint admission_acceptance_rates_rate_range check (rate >= 0 and rate <= 100)
);

-- 이미 테이블이 존재하는 환경(부분 적용)에서도 컬럼이 수렴하도록 보강
alter table public.admission_acceptance_rates add column if not exists year integer;
alter table public.admission_acceptance_rates add column if not exists rate numeric(5,2) default 0;
alter table public.admission_acceptance_rates add column if not exists sort_order integer default 0;
alter table public.admission_acceptance_rates add column if not exists is_active boolean default true;
alter table public.admission_acceptance_rates add column if not exists created_at timestamp with time zone default now();
alter table public.admission_acceptance_rates add column if not exists updated_at timestamp with time zone default now();

create index if not exists admission_acceptance_rates_active_idx
  on public.admission_acceptance_rates using btree (is_active);
create index if not exists admission_acceptance_rates_sort_order_idx
  on public.admission_acceptance_rates using btree (sort_order);

alter table public.admission_acceptance_rates enable row level security;

drop policy if exists "admission_acceptance_rates_public_read" on public."admission_acceptance_rates";
create policy "admission_acceptance_rates_public_read" on public."admission_acceptance_rates" as PERMISSIVE for SELECT to anon,authenticated
  using ((is_active = true) OR public.is_winning_admin());

drop policy if exists "admission_acceptance_rates_admin_all" on public."admission_acceptance_rates";
create policy "admission_acceptance_rates_admin_all" on public."admission_acceptance_rates" as PERMISSIVE for ALL to public
  using (public.is_winning_admin())
  with check (public.is_winning_admin());

-- ---------------------------------------------------------------------
-- 1-1) 2021~2025 시드
--      Figma 1929:656 원본 데이터. 합계 477 / 5 = 95.4 —
--      기존 하드코딩 '5개년 평균 95.4%'와 정확히 일치한다.
--      year UNIQUE + on conflict do nothing 이므로 재실행해도
--      관리자가 어드민에서 수정한 rate 값을 덮어쓰지 않는다.
-- ---------------------------------------------------------------------
insert into public.admission_acceptance_rates (year, rate, sort_order, is_active)
values
    (2021, 92, 1, true),
    (2022, 97, 2, true),
    (2023, 95, 3, true),
    (2024, 95, 4, true),
    (2025, 98, 5, true)
on conflict (year) do nothing;

-- ---------------------------------------------------------------------
-- 2) admission_case_logos : 히어로 하단 대학 로고 스트립
--    display_height_rem — 로고별 표시 높이(rem). 시안이 로고마다 높이가
--      달라서(1.1~2.4rem) 일괄 크기를 줄 수 없다. 너비는 프론트가
--      width:auto + object-contain 으로 원본 종횡비를 보존한다.
--    opacity — 시안에서 일부 로고(KAIST/UNIST 0.7, HUFS 0.8)만 감광 처리.
--    시드 없음: 행이 0건이면 프론트가 번들 로고 12종으로 폴백한다.
--    (첫 행을 넣는 순간 번들 폴백이 통째로 꺼지므로 12종을 모두 등록할 것)
-- ---------------------------------------------------------------------
create table if not exists public.admission_case_logos (
    id uuid default gen_random_uuid() not null,
    name text not null,
    logo_url text default '' not null,
    display_height_rem numeric(5,3) default 2,
    opacity numeric(3,2) default 1,
    sort_order integer default 0,
    is_active boolean default true,
    created_at timestamp with time zone default now(),
    updated_at timestamp with time zone default now(),
    constraint admission_case_logos_pkey primary key (id),
    constraint admission_case_logos_height_range check (display_height_rem > 0 and display_height_rem <= 10),
    constraint admission_case_logos_opacity_range check (opacity > 0 and opacity <= 1)
);

alter table public.admission_case_logos add column if not exists name text;
alter table public.admission_case_logos add column if not exists logo_url text default '';
alter table public.admission_case_logos add column if not exists display_height_rem numeric(5,3) default 2;
alter table public.admission_case_logos add column if not exists opacity numeric(3,2) default 1;
alter table public.admission_case_logos add column if not exists sort_order integer default 0;
alter table public.admission_case_logos add column if not exists is_active boolean default true;
alter table public.admission_case_logos add column if not exists created_at timestamp with time zone default now();
alter table public.admission_case_logos add column if not exists updated_at timestamp with time zone default now();

create index if not exists admission_case_logos_active_idx
  on public.admission_case_logos using btree (is_active);
create index if not exists admission_case_logos_sort_order_idx
  on public.admission_case_logos using btree (sort_order);

alter table public.admission_case_logos enable row level security;

drop policy if exists "admission_case_logos_public_read" on public."admission_case_logos";
create policy "admission_case_logos_public_read" on public."admission_case_logos" as PERMISSIVE for SELECT to anon,authenticated
  using ((is_active = true) OR public.is_winning_admin());

drop policy if exists "admission_case_logos_admin_all" on public."admission_case_logos";
create policy "admission_case_logos_admin_all" on public."admission_case_logos" as PERMISSIVE for ALL to public
  using (public.is_winning_admin())
  with check (public.is_winning_admin());

-- =====================================================================
-- 검증용 SELECT (실행 후 수동 확인용 — 주석 해제하고 실행)
-- =====================================================================
-- select year, rate, sort_order, is_active from public.admission_acceptance_rates order by sort_order;
-- select count(*) as years, round(avg(rate), 1) as average
--   from public.admission_acceptance_rates where is_active = true;  -- 기대값: 5 / 95.4
-- select count(*) from public.admission_case_logos;                  -- 기대값: 0 (시드 없음)
