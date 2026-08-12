-- =====================================================================
-- 입결정보 4개년 → 2개년(2025·2026) 전환 + 마스터 xlsx 17컬럼 수용.
-- Supabase SQL Editor / Management API에서 수동 실행 필요.
-- 선행: sql/43_admission_results.sql 이 실행되어 있어야 한다.
--
-- 배경:
--  sql/43은 수시·정시를 recruitment_period 축으로 합친 통합 테이블을
--  지었지만, 이번 전환의 원본 3종(입결_마스터_2개년.xlsx /
--  build_ipgyeol.py / 입결검색.html) 어디에도 모집시기(수시/정시)
--  개념이 없다. 정시 데이터는 로컬·dev·운영 전부 0행이었고 신규 소스도
--  수시만 담고 있어, 값이 항상 '수시' 하나뿐인 축을 유지하는 비용
--  (뷰 group by 1축, 셀렉터 인덱스 1종, 프론트 상수·필터)만 남는다.
--  → 컬럼째 제거하고 admission_results 를 수시 전용 테이블로 확정한다.
--
--  동시에 마스터 xlsx 의 신규 지표 5종(합격자 평균/최저, 10과목
--  평균/최저, 최초합 평균)을 컬럼으로 수용하고, 진성 중복 29행을
--  가르는 variant_seq 를 추가해 유일성 인덱스를 재정의한다. 기존
--  유일성 인덱스에는 main_track 이 빠져 있어, 마스터 xlsx 를 그대로
--  적재하면 중심전형(교과 vs 종합)만 다른 983행이 조용히 거부된다.
--
-- ⚠️ 재실행 안전성 — 이 파일은 **완전한 idempotent 가 아니다.**
--    (0a) `delete from public.admission_results` 는 매 실행마다 전량을
--    지운다. 즉 최초 실행 이후 43,170행을 적재한 상태에서 이 파일을
--    다시 돌리면 그 43k행이 전부 사라진다(스키마 변경 부분은 전부
--    `if (not) exists` 라 재실행해도 무해하다).
--    이 함정을 줄이기 위해 (0) 백업은 고정 이름이 아니라
--    `admission_results_backup_YYYYMMDD_HH24MISS` 로 **실행 시각마다
--    새 테이블**을 만든다. 명세 §6.3이 경고한 "백업이
--    create table if not exists 라 2회차엔 갱신되지 않아 43k행이 백업
--    없이 삭제되는" 사고는 이 방식으로 해소된다.
--    그래도 **최초 1회 실행이 원칙**이다. 재실행하면 백업 테이블이
--    계속 쌓이므로, 검증이 끝난 백업은 수동으로 drop 할 것.
--
-- ⚠️ 데이터 파기 — dev 434행(더미 시드)은 복구 스크립트가 없다.
--    (0) 이 자동 백업을 뜨지만, 파일 밖 백업도 권장한다:
--      \copy public.admission_results to 'admission_results_backup.csv' csv header
--    운영 DB에는 테이블 자체가 없으므로(= sql/43 미실행) 파기 대상이 없다.
--
-- ⚠️ trending_departments 큐레이션 행은 상세 딥링크용 university_key /
--    department_key 를 갖는데, 이번 전환으로 키 체계가 슬러그(biz-admin 류)
--    → 한글 정규화 키로 바뀐다. 기존 행은 전부 존재하지 않는 (u,d)를
--    가리키게 되므로 **적재 후 재큐레이션이 필요**하다(이 파일은 손대지 않는다).
--
-- security_invoker = true : 뷰 실행 권한을 호출자 권한으로 강제해 기반
-- 테이블 admission_results 의 RLS 를 뷰에서도 동일하게 존중하게 한다.
-- (sql/43:42-45 관례 유지)
-- =====================================================================

begin;

-- gin_trgm_ops 를 스키마 한정 없이 쓰기 위해 extensions 를 search_path 에
-- 얹는다. 이 파일의 모든 객체는 public. 으로 한정돼 있으므로 부작용이 없다.
set local search_path = public, extensions, pg_temp;

-- ---------------------------------------------------------------------
-- (0) 백업 스냅샷 — 실행 시각으로 이름을 지어 매 실행마다 새로 뜬다.
--     ⚠️ public 스키마 테이블은 PostgREST 로 자동 노출된다(Supabase 린터
--     rls_disabled_in_public). 원본은 RLS 가 걸려 있는데 백업 사본만
--     무방비로 두지 않도록 생성 직후 RLS 를 켜고 정책은 부여하지 않는다
--     (= anon/authenticated 전면 차단, service role 로만 조회 가능).
--     drop 시점: (5) 유일성 인덱스 + 적재 후 데이터 검증이 끝난 뒤 수동 drop.
-- ---------------------------------------------------------------------
do $$
declare
    v_backup_name text;
    v_rows        bigint;
begin
    if to_regclass('public.admission_results') is null then
        raise exception 'public.admission_results 가 없다. sql/43_admission_results.sql 을 먼저 실행할 것.';
    end if;

    execute 'select count(*) from public.admission_results' into v_rows;

    if v_rows = 0 then
        raise notice '[백업] admission_results 가 0행이라 백업 테이블을 만들지 않는다.';
        return;
    end if;

    -- clock_timestamp() : 트랜잭션 시각이 아닌 실제 벽시계 → 실행마다 다른 이름.
    v_backup_name := 'admission_results_backup_'
                     || to_char(clock_timestamp(), 'YYYYMMDD_HH24MISS');

    execute format('create table public.%I as select * from public.admission_results', v_backup_name);
    execute format('alter table public.%I enable row level security', v_backup_name);

    raise notice '[백업] % 행을 public.% 로 스냅샷했다.', v_rows, v_backup_name;
end
$$;

-- ---------------------------------------------------------------------
-- (0a) ⚠️ 기존 데이터 파기. (0) 의 백업 테이블에 행이 남아 있는지 먼저
--     확인할 것. dev 434행은 더미 시드이고 university_key/department_key
--     가 슬러그 체계라 신규 한글 정규화 키와 혼재하면 Q1/Q2 뷰에 이중 키가
--     노출된다. 2023/2024 행은 신규 소스에 없어 갱신도 불가능하다.
--     CHECK·컬럼 추가보다 먼저 비워야 한다 — 기존 434행은 main_track이
--     구 표기('학생부교과')라 (3)의 CHECK를 즉시 위반해 마이그레이션
--     전체가 롤백된다.
-- ---------------------------------------------------------------------
delete from public.admission_results;

-- ---------------------------------------------------------------------
-- (1) 신규 지표 컬럼 — 마스터 xlsx K~Q열.
--     grade_85 / grade_90 은 sql/43:68-69 에 이미 있으나, 구버전 DB 를
--     대비해 if not exists 로 함께 선언하고 코멘트만 갱신한다.
--     7종 전부 커버리지 1% 미만이며 v1 화면에는 노출하지 않는다
--     (적재만 하고 Q3 select 에서 제외 — 명세 §10.1 Q5 확정).
-- ---------------------------------------------------------------------
alter table public.admission_results
    add column if not exists grade_85         numeric(4,2),  -- K 교과등급 85%컷
    add column if not exists grade_90         numeric(4,2),  -- L 교과등급 90%컷
    add column if not exists grade_avg        numeric(4,2),  -- M 합격자 평균등급
    add column if not exists grade_min        numeric(4,2),  -- N 합격자 최저등급
    add column if not exists grade_avg10      numeric(4,2),  -- O 합격자 평균등급(10과목)
    add column if not exists grade_min10      numeric(4,2),  -- P 합격자 최저등급(10과목)
    add column if not exists grade_first_avg  numeric(4,2);  -- Q 최초합격자 평균등급

comment on column public.admission_results.grade_85        is '교과등급 85%컷(최종등록자 전과목). 마스터 xlsx K열. 154건 — 2025학년도 전용, v1 화면 미노출.';
comment on column public.admission_results.grade_90        is '교과등급 90%컷(최종등록자 전과목). 마스터 xlsx L열. 111건 — 2025학년도 전용, v1 화면 미노출.';
comment on column public.admission_results.grade_avg       is '합격자 평균등급(전과목). 마스터 xlsx M열. 커버리지 0.33% — 유일하게 양연도에 값이 있는 신규 지표, v1 화면 미노출.';
comment on column public.admission_results.grade_min       is '합격자 최저등급(전과목). 마스터 xlsx N열. 89건 — 2026학년도 전용, v1 화면 미노출.';
comment on column public.admission_results.grade_avg10     is '합격자 평균등급(반영 10과목). 마스터 xlsx O열. 238건 — 2026학년도 전용, v1 화면 미노출.';
comment on column public.admission_results.grade_min10     is '합격자 최저등급(반영 10과목). 마스터 xlsx P열. 238건 — 2026학년도 전용, v1 화면 미노출.';
comment on column public.admission_results.grade_first_avg is '최초합격자 평균등급. 마스터 xlsx Q열. 192건 — 2025학년도 전용, v1 화면 미노출.';

-- ---------------------------------------------------------------------
-- (2) 분할모집 변별 컬럼.
--     자연키 (학년도,대학,중심전형,전형유형,전형명,모집단위) 로도 갈라지지
--     않는 진성 중복이 28그룹 / 초과 29행 존재한다(정원내·정원외, 단계별
--     분할모집 추정 — xlsx 에 구분 컬럼이 없다).
--     default 0 이므로 "실수로 같은 행을 두 번 임포트" 는 여전히 유일성
--     인덱스가 막고, 의도된 분할모집만 로더가 1,2,… 를 명시 부여해 통과한다.
-- ---------------------------------------------------------------------
alter table public.admission_results
    add column if not exists variant_seq smallint not null default 0;

comment on column public.admission_results.variant_seq is
    '동일 자연키 분할모집 변별자. 0=단일. 로더가 그룹 내 (quota desc, competition_rate desc, source_row asc) 정렬 순서로 결정적 부여.';

-- ---------------------------------------------------------------------
-- (3) 값 도메인 CHECK — 마스터 xlsx 실측값으로 확정.
--     main_track: 기존 DDL 주석은 '학생부교과|학생부종합|…' 이었으나 소스
--     실측값은 접두어 없는 '교과|종합|논술|실기' 4종이다. 원문 무손실을
--     택한다 — 표시 레이어(constants.js formatTrackTags, DetailView.jsx
--     trackBadge)가 어차피 /^학생부/ 를 제거하므로 화면 결과는 동일하다.
--     screening_category: xlsx 실측 11종 + 미분류 대비 '기타'.
-- ---------------------------------------------------------------------
alter table public.admission_results
    drop constraint if exists admission_results_main_track_check,
    add  constraint admission_results_main_track_check
        check (main_track is null or main_track in ('교과','종합','논술','실기','기타'));

alter table public.admission_results
    drop constraint if exists admission_results_screening_category_check,
    add  constraint admission_results_screening_category_check
        check (screening_category is null or screening_category in (
            '일반','추천형','지역인재','농어촌','기회균형','특성화고',
            '특수교육','논술','실기','성인학습자','재외국민','기타'));

comment on column public.admission_results.main_track is
    '중심전형: 교과|종합|논술|실기|기타. 마스터 xlsx C열 원문 그대로(접두어 없음).';
comment on column public.admission_results.screening_category is
    '전형유형 11종: 일반|추천형|지역인재|농어촌|기회균형|특성화고|특수교육|논술|실기|성인학습자|재외국민 (+기타). 마스터 xlsx D열 원문.';
comment on column public.admission_results.note is
    '적재 시 품질 플래그. 문구 정본은 로더 scripts/build-admission-results-csv.py 의 NOTE_RATE_ZERO / NOTE_CUT_INVERSION 상수다: ''경쟁률 0 → 결측 승격''(141건), ''50%컷 > 70%컷 (원문 유지)''(601건). 한 행에 둘 다 붙으면 ''; '' 로 잇는다. 값 보정은 하지 않고 플래그만 남긴다.';

-- ---------------------------------------------------------------------
-- (4a) recruitment_period 축 제거.
--      뷰(admission_result_*_index)가 이 컬럼을 select/group by 에서
--      참조하므로 컬럼을 먼저 지우면 "cannot drop column … other objects
--      depend on it" 로 실패한다. 반드시
--        뷰 → 인덱스 → CHECK → 컬럼
--      순서로 지운다(뷰 재생성은 (5a)).
--      유일성 인덱스도 이 컬럼을 물고 있어 drop column 이 암묵 삭제하지만,
--      (5) 에서 재정의하는 대상이므로 여기서 명시적으로 먼저 지운다.
-- ---------------------------------------------------------------------
drop view if exists public.admission_result_university_index;
drop view if exists public.admission_result_department_index;

drop index if exists public.admission_results_unique_key_idx;
drop index if exists public.admission_results_selector_idx;

alter table public.admission_results
    drop constraint if exists admission_results_recruitment_period_check,
    drop column if exists recruitment_period;

comment on table public.admission_results is
    '입결 통합 테이블(long 포맷). 2026-08-11 sql/54 로 recruitment_period 축을 제거해 **수시 전용**이 됐다(원본 자료에 모집시기 개념이 없음). 정본 소스는 입결_마스터_2개년.xlsx(2025·2026학년도 43,170행). sql/43_admission_results.sql + sql/54_admission_results_2yr.sql 참고.';

-- ---------------------------------------------------------------------
-- (5) 유일성 인덱스 재구성.
--     기존 키에는 main_track / screening_category 가 없었고,
--     recruitment_period 는 (4a) 에서 컬럼째 삭제됐다. 마스터 xlsx 를
--     (학년도,대학,모집단위,전형명) 으로 집계하면 중복 1,015그룹 / 2,031행이
--     나오고 그중 983그룹은 중심전형(교과 vs 종합)만 다른 별개 행이다.
--     기존 인덱스 그대로면 983행이 조용히 손실된다.
--     표현식 인덱스(constraint 불가) — coalesce 로 null 을 빈 문자열과 동일
--     취급해야 null 끼리 중복이 통과하는 사고를 막는다.
-- ---------------------------------------------------------------------
create unique index if not exists admission_results_unique_key_idx
    on public.admission_results (
        result_year,
        university_key,
        department_key,
        (coalesce(main_track, '')),
        (coalesce(screening_category, '')),
        admission_track,
        (coalesce(subject_reflection, '')),
        variant_seq
    );

-- ---------------------------------------------------------------------
-- (5a) 집계 뷰 2종 재생성 (recruitment_period 축 제거 반영).
--      셀렉터 인덱스 admission_results_selector_idx 는 재정의가 아니라
--      **폐기**한다((4a) 에서 drop). recruitment_period 를 빼면 남는 축은
--      university_key 하나뿐인데, (5) 유일성 인덱스와
--      admission_results_detail_idx (university_key, department_key,
--      result_year) 가 이미 university_key 를 선두 컬럼으로 갖고 있어
--      단일 컬럼 인덱스를 새로 만들어도 옵티마이저가 얻을 것이 없다.
--      뷰는 select 목록에서 컬럼이 줄어드는 변경이라 create or replace view
--      로는 반영되지 않는다("cannot drop columns from view") — (4a) 에서
--      이미 drop view 를 했으므로 여기서는 순수 재생성이다.
-- ---------------------------------------------------------------------

-- 대학 인덱스 — 검색 뷰 진입 시 1회 (Q1)
-- university_name 은 같은 university_key 안에서 표기 흔들림이 있을 수 있어
-- min() 으로 대표값 하나를 고정한다(응답 순서에 따라 라벨이 바뀌는 것 방지).
create or replace view public.admission_result_university_index
with (security_invoker = true) as
select
    university_key,
    min(university_name)           as university_name,
    count(distinct department_key) as dept_count
from public.admission_results
where university_key is not null
  and is_active = true
group by university_key;

-- 모집단위 인덱스 — 대학 선택 시 (Q2)
-- tracks = 그 모집단위에 존재하는 main_track distinct 배열. 셀렉터 행의
-- 전형 태그("교과·종합")를 그리는 데 쓴다.
create or replace view public.admission_result_department_index
with (security_invoker = true) as
select
    university_key,
    department_key,
    min(department_name) as department_name,
    array_agg(distinct main_track) filter (where main_track is not null) as tracks
from public.admission_results
where university_key is not null
  and department_key is not null
  and is_active = true
group by university_key, department_key;

grant select on public.admission_result_university_index to anon, authenticated;
grant select on public.admission_result_department_index to anon, authenticated;

-- ---------------------------------------------------------------------
-- (6) 43k행 규모에 맞춘 어드민 인덱스.
--     어드민 목록은 order: 'result_year' + 대학명·모집단위·전형명 ilike
--     검색이라, 434행 시절에는 없어도 됐던 정렬 인덱스가 필수가 된다.
--     trgm 은 검색이 서버 ilike 일 때만 의미가 있다.
-- ---------------------------------------------------------------------
create index if not exists admission_results_admin_order_idx
    on public.admission_results (result_year desc, id desc);

create extension if not exists pg_trgm with schema extensions;

create index if not exists admission_results_search_trgm_idx
    on public.admission_results
    using gin ((university_name || ' ' || department_name || ' ' || admission_track) gin_trgm_ops);

-- ---------------------------------------------------------------------
-- (7) sql/43 누락분 보정 — trending_departments updated_at 트리거.
--     sql/43:186-197 은 updated_at 컬럼을 두고도 트리거를 붙이지 않아
--     어드민에서 수정해도 값이 생성 시각에 머물러 있었다.
-- ---------------------------------------------------------------------
drop trigger if exists trg_trending_departments_updated_at on public.trending_departments;
create trigger trg_trending_departments_updated_at
    before update on public.trending_departments
    for each row execute function public.set_updated_at();

commit;

-- =====================================================================
-- 검증용 SELECT (실행 후 수동 확인용 — 주석 해제하고 실행)
-- =====================================================================
-- -- 백업 스냅샷 목록 (검증 후 수동 drop 대상)
-- select table_name from information_schema.tables
--  where table_schema = 'public' and table_name like 'admission_results_backup_%';
--
-- -- recruitment_period 가 사라졌는지 (0행이어야 정상)
-- select column_name from information_schema.columns
--  where table_schema = 'public' and table_name = 'admission_results'
--    and column_name = 'recruitment_period';
--
-- -- 컬럼 수 31 기대 (26 - 1 + 6)
-- select count(*) from information_schema.columns
--  where table_schema = 'public' and table_name = 'admission_results';
--
-- -- 인덱스: unique_key / detail / admin_order / search_trgm 4종.
-- -- selector_idx 는 폐기됐으므로 나오면 안 된다.
-- select indexname from pg_indexes
--  where schemaname = 'public' and tablename = 'admission_results' order by indexname;
--
-- -- 뷰 2종이 recruitment_period 없이 재생성됐는지
-- select table_name, column_name from information_schema.columns
--  where table_schema = 'public'
--    and table_name in ('admission_result_university_index','admission_result_department_index')
--  order by table_name, ordinal_position;
--
-- -- 적재 전이므로 0행. 적재는 별도 스테이징 SQL 로 수행한다(명세 §6.5).
-- select count(*) from public.admission_results;
