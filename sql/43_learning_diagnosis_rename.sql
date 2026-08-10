-- =====================================================================
-- 무료진단 → 학습진단 리네이밍: DB 데이터 값 + 테이블/제약/인덱스/트리거/정책 개명
-- Supabase SQL Editor에서 수동 실행 필요. (idempotent — 여러 번 실행해도 안전)
--
-- 실행 대상: dev(gjowqdiopinhixfivnkx, 서울) 전용. 운영 DB는 이 파일을 개별
--           적용하지 않는다 — 운영은 이후 dev 덤프 재생성으로 일괄 이관한다.
--
-- 선행 조건: 00_base_schema.sql(free_diagnosis_* 3종) + 20/30/34 시드가 이미
--           적용된 DB. 3부(정책 재생성)는 대상 테이블 존재를 전제로 한다.
--
-- 포함:
--   1) 데이터 값 갱신 — program_categories 1행 / page_contents 1행 / banners 3행
--   2) 스키마 객체 개명 — 테이블 3, 제약 8, 명시 인덱스 6, 트리거 3
--   3) RLS 정책 6종 재생성 (구 이름 drop + 신 이름 create)
--   4) PostgREST 스키마 캐시 리로드
--   5) schema_migrations 마커 기록
--
-- 실측(2026-08-06, dev Management API 직접 조회):
--   - free_diagnosis_{questions,options,programs} 세 테이블 모두 **0행**.
--     따라서 데이터 이동/백필 블록이 없다. 순수 DDL + 값 UPDATE 뿐이다.
--   - '학습진단' / '/learning-diagnosis' 기존 행 없음 → 유니크 충돌 없음.
--   - 개명 대상 객체는 31건이 전부다. 그 밖의 객체(시퀀스/뷰)는 존재하지 않는다.
--
-- 멱등 보장:
--   - 값 UPDATE는 where 절이 **구 값에만** 매칭되므로 재실행 시 자연 no-op이다.
--   - alter table / alter index 는 IF EXISTS 를 지원한다.
--   - alter table ... rename constraint 와 alter trigger ... rename to 는
--     문법상 IF EXISTS 가 없다 → pg_constraint / pg_trigger 존재 확인 후에만
--     실행하는 do 블록으로 감쌌다.
--   - 정책은 구 이름·신 이름 모두 drop if exists 한 뒤 create 한다.
--
-- 트랜잭션 분리 판단:
--   1부(값)와 2부(스키마)를 **별도 트랜잭션**으로 둔다.
--   - 두 작업은 서로 의존하지 않는다. 값 UPDATE는 program_categories/
--     page_contents/banners 를, 개명은 free_diagnosis_* 3종을 건드리며 교집합이
--     없다. 한쪽이 실패해도 다른 쪽을 되돌릴 이유가 없다.
--   - 각 부가 개별적으로 멱등이므로 부분 적용 후 재실행으로 안전하게 이어붙는다.
--   - 개명 DDL은 ACCESS EXCLUSIVE 락을 잡는다. 값 UPDATE까지 같은 트랜잭션에
--     묶으면 락 보유 구간이 불필요하게 길어져 앱/PostgREST 쿼리를 더 오래 막는다.
-- =====================================================================


-- =====================================================================
-- 1부 — 데이터 값 갱신 (작업 A)
--
-- 비교는 정확 일치 대신 공백을 흡수하는 형태로 쓴다. 실측상 '무료 진단'(가운데
-- 공백) 표기는 없지만, 어드민에서 수기 입력된 값에 앞뒤/중간 공백이 섞여 있어도
-- 놓치지 않게 하는 무료 방어다.
-- =====================================================================
begin;

-- ---------------------------------------------------------------------
-- 1) program_categories — 대상 1행 (name '무료진단', link '/free-diagnosis')
--    name 과 link 는 서로 독립 컬럼이라 한 문장으로 묶지 않는다. 묶으면 link 만
--    일치하는 다른 행까지 name 이 덮어써질 수 있다.
-- ---------------------------------------------------------------------
update public.program_categories
set name = '학습진단'
where replace(name, ' ', '') = '무료진단';

update public.program_categories
set link = '/learning-diagnosis'
where btrim(link) = '/free-diagnosis';

-- ---------------------------------------------------------------------
-- 2) page_contents — 대상 1행 (slug '/free-diagnosis')
--    menu_label/title 을 slug 보다 **먼저** 갱신한다. slug 를 먼저 바꾸면 뒤이은
--    문장이 구 slug 로 행을 못 찾는다. where 에 구/신 slug 를 둘 다 넣어,
--    slug 만 갱신되고 라벨이 남은 부분 적용 상태에서도 이어서 복구된다.
-- ---------------------------------------------------------------------
update public.page_contents
set menu_label = '학습진단',
    title      = '학습진단'
where btrim(slug) in ('/free-diagnosis', '/learning-diagnosis')
  and (
    replace(coalesce(menu_label, ''), ' ', '') = '무료진단'
    or replace(coalesce(title, ''), ' ', '') = '무료진단'
  );

update public.page_contents
set slug = '/learning-diagnosis'
where btrim(slug) = '/free-diagnosis';

-- ---------------------------------------------------------------------
-- 3) banners — 대상 3행 (button_link '/free-diagnosis', id 1·2·3)
-- ---------------------------------------------------------------------
update public.banners
set button_link = '/learning-diagnosis'
where btrim(button_link) = '/free-diagnosis';

commit;


-- =====================================================================
-- 2부 — 스키마 객체 개명 (작업 B)
--
-- 순서: 테이블 → 제약 → 인덱스 → 트리거.
-- 테이블을 먼저 바꾸므로 이후 문장은 전부 **신 테이블명**을 대상으로 쓴다.
-- PK/UNIQUE 제약이 만든 자동 인덱스 5개는 제약 rename 을 따라가므로 별도
-- 처리하지 않는다. 아래 인덱스 6건은 create index 로 명시 생성된 것들이다.
-- =====================================================================
begin;

-- ---------------------------------------------------------------------
-- 1) 테이블 3종
-- ---------------------------------------------------------------------
alter table if exists public.free_diagnosis_questions rename to learning_diagnosis_questions;
alter table if exists public.free_diagnosis_options   rename to learning_diagnosis_options;
alter table if exists public.free_diagnosis_programs  rename to learning_diagnosis_programs;

-- ---------------------------------------------------------------------
-- 2) 제약 8종
--    alter table ... rename constraint 에는 제약명 IF EXISTS 가 없다.
--    pg_constraint 를 조회해 존재할 때만 실행한다(테이블 부재 시에도 no-op).
-- ---------------------------------------------------------------------
do $$
declare
  r record;
begin
  for r in
    select * from (values
      ('learning_diagnosis_questions'::text, 'free_diagnosis_questions_pkey'::text,                    'learning_diagnosis_questions_pkey'::text),
      ('learning_diagnosis_questions',       'free_diagnosis_questions_question_key_key',              'learning_diagnosis_questions_question_key_key'),
      ('learning_diagnosis_questions',       'free_diagnosis_questions_input_type_check',              'learning_diagnosis_questions_input_type_check'),
      ('learning_diagnosis_options',         'free_diagnosis_options_pkey',                            'learning_diagnosis_options_pkey'),
      ('learning_diagnosis_options',         'free_diagnosis_options_question_id_fkey',                'learning_diagnosis_options_question_id_fkey'),
      ('learning_diagnosis_options',         'free_diagnosis_options_question_key_fkey',               'learning_diagnosis_options_question_key_fkey'),
      ('learning_diagnosis_programs',        'free_diagnosis_programs_pkey',                           'learning_diagnosis_programs_pkey'),
      ('learning_diagnosis_programs',        'free_diagnosis_programs_program_key_key',                'learning_diagnosis_programs_program_key_key')
    ) as t(tbl, old_name, new_name)
  loop
    if exists (
      select 1
      from pg_constraint c
      join pg_class     rel on rel.oid = c.conrelid
      join pg_namespace n   on n.oid   = rel.relnamespace
      where n.nspname = 'public'
        and rel.relname = r.tbl
        and c.conname   = r.old_name
    ) then
      execute format('alter table public.%I rename constraint %I to %I', r.tbl, r.old_name, r.new_name);
    end if;
  end loop;
end $$;

-- ---------------------------------------------------------------------
-- 3) 명시 인덱스 6종 (제약 자동 생성 인덱스 5개는 위 2)에서 함께 개명됨)
-- ---------------------------------------------------------------------
alter index if exists public.free_diagnosis_questions_sort_idx        rename to learning_diagnosis_questions_sort_idx;
alter index if exists public.idx_free_diagnosis_questions_active_order rename to idx_learning_diagnosis_questions_active_order;
alter index if exists public.free_diagnosis_options_question_sort_idx  rename to learning_diagnosis_options_question_sort_idx;
alter index if exists public.idx_free_diagnosis_options_question_order rename to idx_learning_diagnosis_options_question_order;
alter index if exists public.free_diagnosis_programs_sort_idx          rename to learning_diagnosis_programs_sort_idx;
alter index if exists public.idx_free_diagnosis_programs_active_order  rename to idx_learning_diagnosis_programs_active_order;

-- ---------------------------------------------------------------------
-- 4) 트리거 3종
--    alter trigger ... rename to 에는 IF EXISTS 구문 자체가 없다.
--    pg_trigger 를 조회해 존재할 때만 실행한다.
-- ---------------------------------------------------------------------
do $$
declare
  r record;
begin
  for r in
    select * from (values
      ('learning_diagnosis_questions'::text, 'set_free_diagnosis_questions_updated_at'::text, 'set_learning_diagnosis_questions_updated_at'::text),
      ('learning_diagnosis_options',         'set_free_diagnosis_options_updated_at',         'set_learning_diagnosis_options_updated_at'),
      ('learning_diagnosis_programs',        'set_free_diagnosis_programs_updated_at',        'set_learning_diagnosis_programs_updated_at')
    ) as t(tbl, old_name, new_name)
  loop
    if exists (
      select 1
      from pg_trigger   tg
      join pg_class     rel on rel.oid = tg.tgrelid
      join pg_namespace n   on n.oid   = rel.relnamespace
      where n.nspname = 'public'
        and rel.relname = r.tbl
        and tg.tgname   = r.old_name
        and not tg.tgisinternal
    ) then
      execute format('alter trigger %I on public.%I rename to %I', r.old_name, r.tbl, r.new_name);
    end if;
  end loop;
end $$;

commit;


-- =====================================================================
-- 3부 — RLS 정책 6종 개명
--
-- 정책 이름은 밑줄이 아니라 **공백** 구분이다('free diagnosis options admin all').
-- alter policy ... rename to 도 가능하지만, 저장소(00_base_schema.sql)의 기존
-- 패턴이 "drop if exists → create" 이므로 그 형태를 따른다. 본문(using /
-- with check)은 00_base_schema.sql 원문 그대로 옮겼다.
-- 구 이름과 신 이름을 **둘 다** drop if exists 한 뒤 create 하므로 재실행 안전하다.
--
-- 2부에서 테이블이 이미 개명됐으므로 전부 신 테이블명을 대상으로 한다.
-- alter table 과 달리 drop policy 의 IF EXISTS 는 정책만 보호하고 테이블
-- 부재는 막아주지 않는다 — 선행 조건(00 적용 완료)을 전제로 한다.
-- =====================================================================
begin;

-- ---------------------------------------------------------------------
-- 1) learning_diagnosis_questions
-- ---------------------------------------------------------------------
drop policy if exists "free diagnosis questions admin all"     on public."learning_diagnosis_questions";
drop policy if exists "learning diagnosis questions admin all" on public."learning_diagnosis_questions";
create policy "learning diagnosis questions admin all" on public."learning_diagnosis_questions" as PERMISSIVE for ALL to public
  using ((EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = 'admin'::text)))))
  with check ((EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = 'admin'::text)))));

drop policy if exists "free diagnosis questions public read"     on public."learning_diagnosis_questions";
drop policy if exists "learning diagnosis questions public read" on public."learning_diagnosis_questions";
create policy "learning diagnosis questions public read" on public."learning_diagnosis_questions" as PERMISSIVE for SELECT to public
  using ((is_active = true));

-- ---------------------------------------------------------------------
-- 2) learning_diagnosis_options
-- ---------------------------------------------------------------------
drop policy if exists "free diagnosis options admin all"     on public."learning_diagnosis_options";
drop policy if exists "learning diagnosis options admin all" on public."learning_diagnosis_options";
create policy "learning diagnosis options admin all" on public."learning_diagnosis_options" as PERMISSIVE for ALL to public
  using ((EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = 'admin'::text)))))
  with check ((EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = 'admin'::text)))));

drop policy if exists "free diagnosis options public read"     on public."learning_diagnosis_options";
drop policy if exists "learning diagnosis options public read" on public."learning_diagnosis_options";
create policy "learning diagnosis options public read" on public."learning_diagnosis_options" as PERMISSIVE for SELECT to public
  using ((is_active = true));

-- ---------------------------------------------------------------------
-- 3) learning_diagnosis_programs
-- ---------------------------------------------------------------------
drop policy if exists "free diagnosis programs admin all"     on public."learning_diagnosis_programs";
drop policy if exists "learning diagnosis programs admin all" on public."learning_diagnosis_programs";
create policy "learning diagnosis programs admin all" on public."learning_diagnosis_programs" as PERMISSIVE for ALL to public
  using ((EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = 'admin'::text)))))
  with check ((EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = 'admin'::text)))));

drop policy if exists "free diagnosis programs public read"     on public."learning_diagnosis_programs";
drop policy if exists "learning diagnosis programs public read" on public."learning_diagnosis_programs";
create policy "learning diagnosis programs public read" on public."learning_diagnosis_programs" as PERMISSIVE for SELECT to public
  using ((is_active = true));

-- RLS enable 은 테이블 rename 을 따라가므로 재설정이 필요 없다. 다만 신규 설치
-- 경로에서 누락되는 일이 없도록 멱등하게 한 번 더 보장한다.
alter table public."learning_diagnosis_questions" enable row level security;
alter table public."learning_diagnosis_options"   enable row level security;
alter table public."learning_diagnosis_programs"  enable row level security;

commit;


-- =====================================================================
-- 4부 — PostgREST 스키마 캐시 리로드
-- 테이블명이 바뀌었으므로 리로드하지 않으면 supabase-js 가 신 테이블을
-- 404(PGRST205)로 응답한다. 트랜잭션 밖에서 실행한다.
-- =====================================================================
notify pgrst, 'reload schema';


-- =====================================================================
-- 5부 — schema_migrations 마커
--
-- 이 파일의 어느 문장도 마커로 가드되지 않는다(전부 자연 멱등). 마커는 순수
-- "적용 완료" 감사 기록이다. 따라서 sql/20 처럼 무조건 기록하지 않고,
-- sql/30 의 "대상이 실제로 그 상태일 때만 기록" 패턴을 따라 개명이 실제로
-- 끝났을 때에만 남긴다. 실패/부분 적용 상태에서는 마커가 생기지 않는다.
-- =====================================================================

-- 20_landing_renewal.sql 과 동일 정의 (20 미적용 상태에서도 이 파일이 돌도록)
create table if not exists public.schema_migrations (
  version     text primary key,
  applied_at  timestamptz not null default now()
);

insert into public.schema_migrations (version)
select '43_learning_diagnosis_rename_v1'
where to_regclass('public.learning_diagnosis_questions') is not null
  and to_regclass('public.learning_diagnosis_options')   is not null
  and to_regclass('public.learning_diagnosis_programs')  is not null
  and to_regclass('public.free_diagnosis_questions')     is null
  and to_regclass('public.free_diagnosis_options')       is null
  and to_regclass('public.free_diagnosis_programs')      is null
  and not exists (
    select 1 from public.program_categories where replace(name, ' ', '') = '무료진단'
  )
  and not exists (
    select 1 from public.page_contents where btrim(slug) = '/free-diagnosis'
  )
  and not exists (
    select 1 from public.banners where btrim(button_link) = '/free-diagnosis'
  )
  and not exists (
    select 1 from public.schema_migrations
    where version = '43_learning_diagnosis_rename_v1'
  );


-- =====================================================================
-- 검증용 SELECT (실행 후 수동 확인용 — 주석 해제하고 실행)
-- =====================================================================

-- 1) 테이블 — free_diagnosis_* 0건 / learning_diagnosis_* 3건이어야 한다
-- select c.relname
-- from pg_class c
-- join pg_namespace n on n.oid = c.relnamespace
-- where n.nspname = 'public'
--   and c.relkind = 'r'
--   and (c.relname like '%free_diagnosis%' or c.relname like '%learning_diagnosis%')
-- order by c.relname;

-- 2) 구 이름 잔존 객체 — 결과 0행이어야 한다 (제약/인덱스/트리거/정책)
-- select 'constraint' as kind, c.conname as name
--   from pg_constraint c
--   join pg_class rel on rel.oid = c.conrelid
--   join pg_namespace n on n.oid = rel.relnamespace
--  where n.nspname = 'public' and c.conname like '%free_diagnosis%'
-- union all
-- select 'index', i.indexname
--   from pg_indexes i
--  where i.schemaname = 'public' and i.indexname like '%free_diagnosis%'
-- union all
-- select 'trigger', tg.tgname
--   from pg_trigger tg
--   join pg_class rel on rel.oid = tg.tgrelid
--   join pg_namespace n on n.oid = rel.relnamespace
--  where n.nspname = 'public' and not tg.tgisinternal and tg.tgname like '%free_diagnosis%'
-- union all
-- select 'policy', p.policyname
--   from pg_policies p
--  where p.schemaname = 'public' and p.policyname like '%free diagnosis%';

-- 2-b) 신 이름 객체 수 — 제약 8 / 인덱스 11(명시 6 + 제약 자동 5) / 트리거 3 / 정책 6
-- select 'constraint' as kind, count(*)
--   from pg_constraint c
--   join pg_class rel on rel.oid = c.conrelid
--   join pg_namespace n on n.oid = rel.relnamespace
--  where n.nspname = 'public' and c.conname like '%learning_diagnosis%'
-- union all
-- select 'index', count(*) from pg_indexes
--  where schemaname = 'public' and indexname like '%learning_diagnosis%'
-- union all
-- select 'trigger', count(*)
--   from pg_trigger tg
--   join pg_class rel on rel.oid = tg.tgrelid
--   join pg_namespace n on n.oid = rel.relnamespace
--  where n.nspname = 'public' and not tg.tgisinternal and tg.tgname like '%learning_diagnosis%'
-- union all
-- select 'policy', count(*) from pg_policies
--  where schemaname = 'public' and policyname like '%learning diagnosis%';

-- 3) 데이터 값 — old 열이 전부 0, new 열이 1/1/3 이어야 한다
-- select 'program_categories' as tbl,
--        count(*) filter (where replace(name, ' ', '') = '무료진단' or btrim(link) = '/free-diagnosis') as old_rows,
--        count(*) filter (where name = '학습진단' and link = '/learning-diagnosis')                     as new_rows
--   from public.program_categories
-- union all
-- select 'page_contents',
--        count(*) filter (where btrim(slug) = '/free-diagnosis' or replace(coalesce(menu_label, ''), ' ', '') = '무료진단'),
--        count(*) filter (where slug = '/learning-diagnosis' and menu_label = '학습진단' and title = '학습진단')
--   from public.page_contents
-- union all
-- select 'banners',
--        count(*) filter (where btrim(button_link) = '/free-diagnosis'),
--        count(*) filter (where button_link = '/learning-diagnosis')
--   from public.banners;

-- 4) 마커 — 1행이어야 한다
-- select version, applied_at from public.schema_migrations
--  where version = '43_learning_diagnosis_rename_v1';


-- =====================================================================
-- 롤백 SQL (주석 — 실행되지 않는다. 되돌려야 할 때만 수동으로 해제해 사용)
--
-- 주의: 롤백은 이 파일을 적용한 직후 상태만 되돌린다. 이후 어드민에서 값이
-- 수정됐다면 그 수정분까지 함께 지워진다. 또 프런트엔드 코드가 이미 신 이름을
-- 쓰고 있다면 롤백 후 반드시 코드도 함께 되돌려야 한다.
-- =====================================================================
--
-- begin;
--   update public.banners set button_link = '/free-diagnosis'
--    where btrim(button_link) = '/learning-diagnosis';
--   update public.page_contents set slug = '/free-diagnosis'
--    where btrim(slug) = '/learning-diagnosis';
--   update public.page_contents set menu_label = '무료진단', title = '무료진단'
--    where btrim(slug) = '/free-diagnosis';
--   update public.program_categories set link = '/free-diagnosis'
--    where btrim(link) = '/learning-diagnosis';
--   update public.program_categories set name = '무료진단'
--    where replace(name, ' ', '') = '학습진단';
-- commit;
--
-- begin;
--   -- 정책 (구 이름으로 재생성)
--   drop policy if exists "learning diagnosis questions admin all"  on public."learning_diagnosis_questions";
--   drop policy if exists "learning diagnosis questions public read" on public."learning_diagnosis_questions";
--   drop policy if exists "learning diagnosis options admin all"    on public."learning_diagnosis_options";
--   drop policy if exists "learning diagnosis options public read"  on public."learning_diagnosis_options";
--   drop policy if exists "learning diagnosis programs admin all"   on public."learning_diagnosis_programs";
--   drop policy if exists "learning diagnosis programs public read" on public."learning_diagnosis_programs";
--
--   -- 트리거
--   alter trigger set_learning_diagnosis_questions_updated_at on public.learning_diagnosis_questions rename to set_free_diagnosis_questions_updated_at;
--   alter trigger set_learning_diagnosis_options_updated_at   on public.learning_diagnosis_options   rename to set_free_diagnosis_options_updated_at;
--   alter trigger set_learning_diagnosis_programs_updated_at  on public.learning_diagnosis_programs  rename to set_free_diagnosis_programs_updated_at;
--
--   -- 인덱스
--   alter index if exists public.learning_diagnosis_questions_sort_idx         rename to free_diagnosis_questions_sort_idx;
--   alter index if exists public.idx_learning_diagnosis_questions_active_order rename to idx_free_diagnosis_questions_active_order;
--   alter index if exists public.learning_diagnosis_options_question_sort_idx  rename to free_diagnosis_options_question_sort_idx;
--   alter index if exists public.idx_learning_diagnosis_options_question_order rename to idx_free_diagnosis_options_question_order;
--   alter index if exists public.learning_diagnosis_programs_sort_idx          rename to free_diagnosis_programs_sort_idx;
--   alter index if exists public.idx_learning_diagnosis_programs_active_order  rename to idx_free_diagnosis_programs_active_order;
--
--   -- 제약
--   alter table public.learning_diagnosis_questions rename constraint learning_diagnosis_questions_pkey                 to free_diagnosis_questions_pkey;
--   alter table public.learning_diagnosis_questions rename constraint learning_diagnosis_questions_question_key_key     to free_diagnosis_questions_question_key_key;
--   alter table public.learning_diagnosis_questions rename constraint learning_diagnosis_questions_input_type_check     to free_diagnosis_questions_input_type_check;
--   alter table public.learning_diagnosis_options   rename constraint learning_diagnosis_options_pkey                   to free_diagnosis_options_pkey;
--   alter table public.learning_diagnosis_options   rename constraint learning_diagnosis_options_question_id_fkey       to free_diagnosis_options_question_id_fkey;
--   alter table public.learning_diagnosis_options   rename constraint learning_diagnosis_options_question_key_fkey      to free_diagnosis_options_question_key_fkey;
--   alter table public.learning_diagnosis_programs  rename constraint learning_diagnosis_programs_pkey                  to free_diagnosis_programs_pkey;
--   alter table public.learning_diagnosis_programs  rename constraint learning_diagnosis_programs_program_key_key       to free_diagnosis_programs_program_key_key;
--
--   -- 테이블
--   alter table if exists public.learning_diagnosis_questions rename to free_diagnosis_questions;
--   alter table if exists public.learning_diagnosis_options   rename to free_diagnosis_options;
--   alter table if exists public.learning_diagnosis_programs  rename to free_diagnosis_programs;
--
--   -- 정책 (구 이름 create — 본문은 00_base_schema.sql 원문)
--   create policy "free diagnosis questions admin all" on public."free_diagnosis_questions" as PERMISSIVE for ALL to public
--     using ((EXISTS ( SELECT 1 FROM profiles WHERE ((profiles.id = auth.uid()) AND (profiles.role = 'admin'::text)))))
--     with check ((EXISTS ( SELECT 1 FROM profiles WHERE ((profiles.id = auth.uid()) AND (profiles.role = 'admin'::text)))));
--   create policy "free diagnosis questions public read" on public."free_diagnosis_questions" as PERMISSIVE for SELECT to public
--     using ((is_active = true));
--   create policy "free diagnosis options admin all" on public."free_diagnosis_options" as PERMISSIVE for ALL to public
--     using ((EXISTS ( SELECT 1 FROM profiles WHERE ((profiles.id = auth.uid()) AND (profiles.role = 'admin'::text)))))
--     with check ((EXISTS ( SELECT 1 FROM profiles WHERE ((profiles.id = auth.uid()) AND (profiles.role = 'admin'::text)))));
--   create policy "free diagnosis options public read" on public."free_diagnosis_options" as PERMISSIVE for SELECT to public
--     using ((is_active = true));
--   create policy "free diagnosis programs admin all" on public."free_diagnosis_programs" as PERMISSIVE for ALL to public
--     using ((EXISTS ( SELECT 1 FROM profiles WHERE ((profiles.id = auth.uid()) AND (profiles.role = 'admin'::text)))))
--     with check ((EXISTS ( SELECT 1 FROM profiles WHERE ((profiles.id = auth.uid()) AND (profiles.role = 'admin'::text)))));
--   create policy "free diagnosis programs public read" on public."free_diagnosis_programs" as PERMISSIVE for SELECT to public
--     using ((is_active = true));
-- commit;
--
-- delete from public.schema_migrations where version = '43_learning_diagnosis_rename_v1';
-- notify pgrst, 'reload schema';
