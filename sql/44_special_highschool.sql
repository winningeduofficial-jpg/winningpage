-- =====================================================================
-- 특목고합격 페이지 신규 스키마.
-- Supabase SQL Editor에서 수동 실행 필요. (idempotent — 여러 번 실행해도 안전)
--
-- 배경: 특목고합격 페이지는 코드는 수시정시합격(admission_*)과 공용하되
-- 데이터는 완전히 분리한다. 기존 admission_posts / admission_acceptance_rates
-- / admission_case_logos 의 DDL·제약·인덱스·RLS 는 이 파일에서 단 한 글자도
-- 건드리지 않는다. 특히 admission_acceptance_rates_year_key UNIQUE 제약은
-- 절대 drop 하지 않는다 (scope 컬럼 추가안은 라이브 수시정시 화면 회귀
-- 위험 때문에 검토 후 기각됨).
--
-- 히어로 대학 로고 스트립은 신규 테이블을 만들지 않는다. 기존
-- public.admission_case_logos 를 특목고 페이지가 그대로 공유한다(시안
-- 실측 결과 로고 12종·1행 7개/2행 5개 배치가 수시정시와 완전 동일). 이
-- 파일에는 로고 관련 DDL 이 없다.
--
-- special_highschool_cases 는 상세 페이지가 없다(시안에 상세 화면 없음)
-- → 본문/첨부/썸네일 컬럼을 두지 않는다. 카드에 렌더되는 값만 컬럼으로
-- 존재한다.
--
-- 포함:
--   1) special_highschool_cases 신규 테이블 (특목고 합격 사례 카드)
--      + is_active·school_type / sort_order / year 인덱스 3종
--      + school_type CHECK(자사고/외고/영재고/과학고) + RLS
--      + 합격 사례 38건 시드 (테이블이 비어있을 때만 — UNIQUE 없음)
--   2) special_highschool_acceptance_rates 신규 테이블 (연도별 합격률)
--      컬럼명이 admission_acceptance_rates 와 정확히 동일 — 공용 프론트
--      컴포넌트(AcceptanceRateHero)와 공용 어드민 요약 컴포넌트
--      (AcceptanceRateSummary)가 year/rate/sort_order/is_active 만 읽는다.
--      + is_active/sort_order 인덱스 + RLS
--      + 2021~2025 5개년 시드 (year UNIQUE + on conflict do nothing)
--
-- 두 테이블 모두 RLS 는 is_winning_admin() 기준. profiles 직접 서브쿼리는
-- 42P17 infinite recursion 으로 관리자 쓰기가 전부 막히므로 반드시
-- public.is_winning_admin() 을 통해 판정한다 (41번과 동일 패턴).
--
-- Storage 정책 불필요: 특목고 카드는 이미지를 쓰지 않는다(폴더 도형은
-- CSS/SVG). 31_storage_policies.sql 무변경.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1) special_highschool_cases : 특목고 합격 사례 카드
--    상세 페이지 없음 — 카드에 렌더되는 값만 컬럼으로 존재한다.
--    UNIQUE 제약 없음: 자연 유일키가 없다. 시드 안에 이미
--    김천고/2021/김O훈 과 해운대고/2022/김O훈 처럼 동명이인 마스킹
--    충돌이 존재한다. UNIQUE 를 걸면 정당한 데이터 입력이 어드민에서
--    막힌다.
-- ---------------------------------------------------------------------
create table if not exists public.special_highschool_cases (
    id uuid default gen_random_uuid() not null,
    school_name text not null,
    school_type text not null,
    year integer not null,
    student_name text not null,
    result_label text default '합격자' not null,
    middle_school text default '' not null,
    sort_order integer default 0,
    is_active boolean default true,
    created_at timestamp with time zone default now(),
    updated_at timestamp with time zone default now(),
    constraint special_highschool_cases_pkey primary key (id),
    constraint special_highschool_cases_year_range check (year >= 2000 and year <= 2100)
);

-- 이미 테이블이 존재하는 환경(부분 적용)에서도 컬럼이 수렴하도록 보강
alter table public.special_highschool_cases add column if not exists school_name text;
alter table public.special_highschool_cases add column if not exists school_type text;
alter table public.special_highschool_cases add column if not exists year integer;
alter table public.special_highschool_cases add column if not exists student_name text;
alter table public.special_highschool_cases add column if not exists result_label text default '합격자';
alter table public.special_highschool_cases add column if not exists middle_school text default '';
alter table public.special_highschool_cases add column if not exists sort_order integer default 0;
alter table public.special_highschool_cases add column if not exists is_active boolean default true;
alter table public.special_highschool_cases add column if not exists created_at timestamp with time zone default now();
alter table public.special_highschool_cases add column if not exists updated_at timestamp with time zone default now();

-- 탭 값 CHECK — 재실행 시 값 목록을 갱신할 수 있도록 drop 후 add
alter table public.special_highschool_cases
  drop constraint if exists special_highschool_cases_school_type_check;
alter table public.special_highschool_cases
  add constraint special_highschool_cases_school_type_check
  check (school_type in ('자사고', '외고', '영재고', '과학고'));

create index if not exists special_highschool_cases_active_type_idx
  on public.special_highschool_cases using btree (is_active, school_type);
create index if not exists special_highschool_cases_sort_order_idx
  on public.special_highschool_cases using btree (sort_order);
create index if not exists special_highschool_cases_year_idx
  on public.special_highschool_cases using btree (year desc);

alter table public.special_highschool_cases enable row level security;

drop policy if exists "special_highschool_cases_public_read" on public."special_highschool_cases";
create policy "special_highschool_cases_public_read" on public."special_highschool_cases" as PERMISSIVE for SELECT to anon,authenticated
  using ((is_active = true) OR public.is_winning_admin());

drop policy if exists "special_highschool_cases_admin_all" on public."special_highschool_cases";
create policy "special_highschool_cases_admin_all" on public."special_highschool_cases" as PERMISSIVE for ALL to public
  using (public.is_winning_admin())
  with check (public.is_winning_admin());

-- ---------------------------------------------------------------------
-- 1-1) 합격 사례 38건 시드
--
-- [개인정보] 학생명은 전부 마스킹된 값이다. 실명을 이 파일에 되돌려
--   넣지 말 것.
-- [학교명 표기] 시안(3건)에는 "부산일과고"로 적혀 있다. 실존 학교명은
--   부산일과학고등학교이나, 시안 정본 표기를 따르기로 사용자가
--   확정했다.
-- [school_type] 시안 카드에는 학교 유형 텍스트가 없다 — 학교명 기반
--   추정 분류다. 부산국제고 6건은 시안 탭에 '국제고'가 없어 '외고'로
--   편입했다(시안 탭 카피를 바꾸지 않는 쪽 선택). 영재고는 데이터
--   0건이다. 사용자 확인 필요 항목.
-- [정렬] sort_order 는 시안의 카드 배치 순서(좌→우, 상→하)다. 공개
--   페이지는 sort_order asc → year desc → created_at asc 로 읽는다.
-- [멱등] UNIQUE 제약이 없으므로 "테이블이 비어있을 때만" insert 한다.
--   관리자가 전 행을 삭제한 상태에서 재실행하면 38건이 되살아난다 —
--   마이그레이션 재실행은 의도적 행위이므로 허용한다.
-- ---------------------------------------------------------------------
insert into public.special_highschool_cases
  (school_name, school_type, year, student_name, result_label, middle_school, sort_order, is_active)
select seed.school_name, seed.school_type, seed.year, seed.student_name,
       seed.result_label, seed.middle_school, seed.sort_order, seed.is_active
from (values
  ('광양제철고'::text, '자사고'::text, 2022::integer, '정O희'::text, '합격자'::text, ''::text, 1::integer, true::boolean),
  ('용인외대부고',  '자사고', 2022, '정O인', '합격자', '',         2,  true),
  ('현대청운고',    '자사고', 2022, '이O수', '합격자', '',         3,  true),
  ('해운대고',      '자사고', 2022, '김O훈', '합격자', '',         4,  true),
  ('김천고',        '자사고', 2021, '김O훈', '합격자', '',         5,  true),
  ('현대청운고',    '자사고', 2021, '천O영', '합격자', '화명중',   6,  true),
  ('포항제철고',    '자사고', 2021, '김O린', '합격자', '용호중',   7,  true),
  ('거창대성고',    '자사고', 2021, '김O진', '합격자', '',         8,  true),
  ('김천고',        '자사고', 2021, '박O일', '합격자', '중앙중',   9,  true),
  ('김천고',        '자사고', 2021, '노O우', '합격자', '브니엘중', 10, true),
  ('부산일과고',    '과학고', 2021, '이O진', '합격자', '',         11, true),
  ('부산일과고',    '과학고', 2021, '양O연', '합격자', '금명중',   12, true),
  ('부산국제고',    '외고',   2021, '박O준', '합격자', '',         13, true),
  ('부산국제고',    '외고',   2021, '김O형', '합격자', '',         14, true),
  ('부일외고',      '외고',   2021, '박O경', '합격자', '',         15, true),
  ('부일외고',      '외고',   2021, '김O하', '합격자', '',         16, true),
  ('부일외고',      '외고',   2021, '조O지', '합격자', '화신중',   17, true),
  ('부산일과고',    '과학고', 2020, '유O진', '합격생', '',         18, true),
  ('부산과학고',    '과학고', 2020, '윤O경', '합격자', '',         19, true),
  ('광양제철고',    '자사고', 2020, '서O미', '합격자', '',         20, true),
  ('김천고',        '자사고', 2020, '윤O현', '합격자', '',         21, true),
  ('부산국제고',    '외고',   2020, '김O희', '합격생', '',         22, true),
  ('부산과학고',    '과학고', 2020, '이O윤', '합격자', '',         23, true),
  ('부산국제고',    '외고',   2020, '김O지', '합격자', '',         24, true),
  ('부산국제고',    '외고',   2020, '김O현', '합격자', '',         25, true),
  ('부산외고',      '외고',   2020, '이O아', '합격생', '',         26, true),
  ('경남외고',      '외고',   2020, '김O주', '합격자', '',         27, true),
  ('부일외고',      '외고',   2020, '정O혁', '합격자', '',         28, true),
  ('해운대고',      '자사고', 2019, '조O서', '합격자', '용수중',   29, true),
  ('광양제철고',    '자사고', 2019, '이O조', '합격생', '화명중',   30, true),
  ('부일외고',      '외고',   2019, '윤O서', '합격자', '',         31, true),
  ('광양제철고',    '자사고', 2019, '강O주', '합격자', '덕천여중', 32, true),
  ('부산국제고',    '외고',   2019, '이O주', '합격자', '화명동',   33, true),
  ('부일외고',      '외고',   2019, '이O성', '합격생', '분포중',   34, true),
  ('현대청운고',    '자사고', 2019, '오O혁', '합격자', '',         35, true),
  ('김천고',        '자사고', 2018, '박O규', '합격자', '사직중',   36, true),
  ('광양제철고',    '자사고', 2019, '이O원', '합격자', '화명중',   37, true),
  ('해운대고',      '자사고', 2018, '김O원', '합격생', '동평중',   38, true)
) as seed(school_name, school_type, year, student_name, result_label, middle_school, sort_order, is_active)
where not exists (select 1 from public.special_highschool_cases);

-- ---------------------------------------------------------------------
-- 2) special_highschool_acceptance_rates : 연도별 특목고 합격률
--    컬럼명은 admission_acceptance_rates 와 정확히 동일하게 맞춘다 —
--    공용 프론트 컴포넌트(AcceptanceRateHero)와 공용 어드민 요약
--    컴포넌트(AcceptanceRateSummary)가 year/rate/sort_order/is_active
--    만 읽는다.
-- ---------------------------------------------------------------------
create table if not exists public.special_highschool_acceptance_rates (
    id uuid default gen_random_uuid() not null,
    year integer not null,
    rate numeric(5,2) default 0 not null,
    sort_order integer default 0,
    is_active boolean default true,
    created_at timestamp with time zone default now(),
    updated_at timestamp with time zone default now(),
    constraint special_highschool_acceptance_rates_pkey primary key (id),
    constraint special_highschool_acceptance_rates_year_key unique (year),
    constraint special_highschool_acceptance_rates_rate_range check (rate >= 0 and rate <= 100)
);

alter table public.special_highschool_acceptance_rates add column if not exists year integer;
alter table public.special_highschool_acceptance_rates add column if not exists rate numeric(5,2) default 0;
alter table public.special_highschool_acceptance_rates add column if not exists sort_order integer default 0;
alter table public.special_highschool_acceptance_rates add column if not exists is_active boolean default true;
alter table public.special_highschool_acceptance_rates add column if not exists created_at timestamp with time zone default now();
alter table public.special_highschool_acceptance_rates add column if not exists updated_at timestamp with time zone default now();

create index if not exists special_highschool_acceptance_rates_active_idx
  on public.special_highschool_acceptance_rates using btree (is_active);
create index if not exists special_highschool_acceptance_rates_sort_order_idx
  on public.special_highschool_acceptance_rates using btree (sort_order);

alter table public.special_highschool_acceptance_rates enable row level security;

drop policy if exists "special_highschool_acceptance_rates_public_read" on public."special_highschool_acceptance_rates";
create policy "special_highschool_acceptance_rates_public_read" on public."special_highschool_acceptance_rates" as PERMISSIVE for SELECT to anon,authenticated
  using ((is_active = true) OR public.is_winning_admin());

drop policy if exists "special_highschool_acceptance_rates_admin_all" on public."special_highschool_acceptance_rates";
create policy "special_highschool_acceptance_rates_admin_all" on public."special_highschool_acceptance_rates" as PERMISSIVE for ALL to public
  using (public.is_winning_admin())
  with check (public.is_winning_admin());

-- ---------------------------------------------------------------------
-- 2-1) 2021~2025 시드
--      이 5개 값은 수시정시(41_admission_case_hero.sql) 시드와 동일한
--      시안 재현용 플레이스홀더다. 특목고 실제 합격률이 확정되면
--      어드민(특목고합격 > 연도별 합격률)에서 교체해야 한다.
--      합계 477 / 5 = 95.4 — 시안 큰 숫자 '95.4%'와 정확히 일치한다.
--      ★ '5개년 평균'이 정본이다(Figma 2239:1754 네이티브 해상도 재확인).
--      축소 스크린샷에서 '6개년'으로 보이는 것은 판독 아티팩트다.
--      year UNIQUE + on conflict do nothing 이므로 재실행해도 관리자가
--      어드민에서 수정한 rate 값을 덮어쓰지 않는다.
-- ---------------------------------------------------------------------
insert into public.special_highschool_acceptance_rates (year, rate, sort_order, is_active)
values
    (2021, 92, 1, true),
    (2022, 97, 2, true),
    (2023, 95, 3, true),
    (2024, 95, 4, true),
    (2025, 98, 5, true)
on conflict (year) do nothing;

-- =====================================================================
-- 검증용 SELECT (실행 후 수동 확인용 — 주석 해제하고 실행)
-- =====================================================================
-- select count(*) from public.special_highschool_cases;                        -- 기대: 38
-- select school_type, count(*) from public.special_highschool_cases group by 1; -- 기대: 자사고 19 / 외고 14 / 과학고 5
-- select count(*) as years, round(avg(rate),1) from public.special_highschool_acceptance_rates where is_active = true; -- 기대: 5 / 95.4
-- select count(*) from public.special_highschool_cases where student_name not like '%O%';  -- 기대: 0 (전건 마스킹 확인)
