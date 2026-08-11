-- =====================================================================
-- 목표관리 어드민 선행 마이그레이션
--   (1) 온보딩 대학·학과 선택지 뷰 goal_university_options 신설
--   (2) 어드민 RLS 조임 — goal_students / goal_daily_records /
--       goal_probability_logs 의 어드민 정책을 for all → for select
-- Supabase SQL Editor / Management API에서 수동 실행 필요.
-- 선행: sql/55_goal_management.sql
--
-- 근거: docs/figma-goal/goal-admin-spec.md §5-3 · §5-4 · §3-D1 · §3-D7
--
-- ⚠ 번호에 대하여. 명세 §5-4 는 이 파일을 `56_goal_admin_options_rls.sql`
--   이라 적었지만, 56 은 이미 `56_goal_jungsi_optional.sql`(정시 확률 2열
--   NOT NULL 해제, dev 적용 완료)이 점유하고 있다. 그래서 57 로 올린다.
--   명세 §5-4 가 이 파일에 함께 담으라고 했던 세 번째 산출물(정시 확률
--   NOT NULL 해제)은 **56 이 이미 수행했으므로 여기서 반복하지 않는다.**
--
-- 재실행 안전성: 전 문장이 idempotent 하다(create or replace view /
--   drop policy if exists → create policy). sql/55 와 이 파일을 어느
--   순서로 몇 번 실행해도 최종 상태가 같아진다 — 그러려면 sql/55 본문도
--   같은 커밋에서 `_admin_select` 형태로 고쳐야 하고, 실제로 고쳤다.
-- =====================================================================


-- ---------------------------------------------------------------------
-- (1) 온보딩 대학·학과 선택지 뷰
--
--     목표관리 온보딩이 고를 수 있는 (대학, 학과) 조합의 정본은
--     goal_university_cuts 다(명세 §3-D1). 이 표를 (대학, 학과) 단위로
--     접고, 학교유형별로 필요한 컷을 실제로 보유했는지를 플래그로 준다.
--
--     security_invoker = true : 기반 테이블의 RLS 를 뷰에서도 존중시킨다
--     (39번:26 / 43번:124-125 / 55번:614 관례, PostgreSQL 17).
--     따라서 goal_university_cuts_public_read(anon·authenticated, select,
--     is_active) 가 그대로 적용된다 — 뷰가 RLS 우회로가 되지 않는다.
--
--     avg_cut is not null 을 플래그 조건에 넣는 이유: 컷 행은 있는데
--     값이 null 인 상태("컷 미확보")가 합법이고, 그 조합을 고른 학생은
--     api/goal/intake.js 가 422 로 되돌린다. 목록에 띄우면 안 된다.
--
--     🟠 입도(granularity) 계약
--     has_normal / has_special / has_jungsi 는 group by 4열
--     (university_key, university_name, department_key, department_name)
--     **안에서만** 참이 된다. 정시 컷을 학과명 없이(대학 단위로) 넣으면
--     그 대학의 모든 (대학, 학과) 행에서 has_jungsi = false 가 되어
--     정시 확률이 영원히 미산출로 남는다. 정시 컷의 대학명·학과명은
--     수시 컷과 글자 하나까지 같아야 한다.
--
--     ⚠ has_jungsi 는 **노출 필터로 쓰지 않는다**(명세 개정 3, Q1=(b)).
--       정시 컷이 없어도 수시 확률만으로 온보딩을 완료시키므로, 온보딩
--       클라이언트는 일반고면 has_normal, 특목·자사고면 has_special 만
--       필터로 건다. has_jungsi 는 어드민이 "정시 컷 없는 조합"을 뽑아
--       채워 넣기 위한 진단용 플래그로만 남긴다.
-- ---------------------------------------------------------------------
create or replace view public.goal_university_options
with (security_invoker = true) as
select
    university_key,
    university_name,
    department_key,
    department_name,
    bool_or(cut_type = 'normal'  and avg_cut is not null) as has_normal,
    bool_or(cut_type = 'special' and avg_cut is not null) as has_special,
    bool_or(cut_type = 'jungsi'  and avg_cut is not null) as has_jungsi
from public.goal_university_cuts
where is_active
group by 1, 2, 3, 4;

comment on view public.goal_university_options is
    '목표관리 온보딩 대학·학과 선택지. goal_university_cuts 를 (대학, 학과) 단위로 접고 학교유형별 필요 컷 보유 여부를 플래그로 준다. 노출 필터는 has_normal(일반고) / has_special(특목·자사고) 둘뿐이다 — has_jungsi 는 노출 조건이 아니라 진단용이다(정시 컷이 없으면 정시 확률만 null 로 남고 온보딩은 통과한다, 명세 개정 3 Q1=(b)). security_invoker = true 로 기반 테이블 RLS 를 상속한다.';

grant select on public.goal_university_options to anon, authenticated;


-- ---------------------------------------------------------------------
-- (2) 어드민 정책을 읽기 전용으로 좁힌다.
--
--     근거: 어드민 CRUD 는 브라우저 supabase 클라이언트 직접 접근이고
--     (src/pages/Admin.jsx 의 buildListQuery / saveRow / deleteRow),
--     RLS 는 행 단위라 컬럼을 가리지 못한다. for all 이면 어드민 세션에서
--     base_ideal_susi = 100 UPDATE 가 그대로 통과한다 — 확률 게이지를
--     사람이 손으로 고칠 수 있게 되는 것이고, 그건 이 도메인에서
--     원본(구 시스템)의 병리를 그대로 재생산하는 일이다(명세 §3-D7).
--     어드민 화면은 이 세 표에 대해 쓰기 UI 를 하나도 만들지 않는다.
--
--     api/goal/* 는 service_role 로 RLS 를 우회하므로 영향받지 않는다
--     (api/_lib/supabaseAdmin.js). 학생 본인 읽기 정책(*_select_own)도
--     건드리지 않는다.
--
--     goal_university_cuts_admin_all 은 **그대로 둔다** — 어드민이 유일하게
--     편집하는 표이고, 컷 관리 탭의 CRUD 가 그 정책 위에서 동작한다.
--
--     두 이름(_admin_all / _admin_select)을 모두 drop 한 뒤 create 하는
--     이유: sql/55 가 수동 재실행을 전제한 idempotent 파일이라, 이 파일이
--     먼저 실행된 뒤 sql/55 가 재실행되는 순서가 실제로 발생한다. 양쪽
--     파일이 양쪽 이름을 drop 해야 42710(중복 정책)이 나지 않고 실행
--     순서와 무관해진다.
-- ---------------------------------------------------------------------
drop policy if exists "goal_students_admin_all"            on public.goal_students;
drop policy if exists "goal_students_admin_select"         on public.goal_students;
drop policy if exists "goal_daily_records_admin_all"       on public.goal_daily_records;
drop policy if exists "goal_daily_records_admin_select"    on public.goal_daily_records;
drop policy if exists "goal_probability_logs_admin_all"    on public.goal_probability_logs;
drop policy if exists "goal_probability_logs_admin_select" on public.goal_probability_logs;

create policy "goal_students_admin_select" on public.goal_students
    as permissive for select to authenticated
    using (public.is_winning_admin());

create policy "goal_daily_records_admin_select" on public.goal_daily_records
    as permissive for select to authenticated
    using (public.is_winning_admin());

create policy "goal_probability_logs_admin_select" on public.goal_probability_logs
    as permissive for select to authenticated
    using (public.is_winning_admin());


-- =====================================================================
-- 검증 SELECT (실행 후 눈으로 확인할 것)
-- =====================================================================
-- -- 어드민 정책 3개가 전부 cmd = 'SELECT' 인가, 컷 표만 ALL 로 남았는가
-- select tablename, policyname, cmd
--   from pg_policies
--  where schemaname = 'public' and tablename like 'goal\_%'
--  order by tablename, policyname;
--
-- -- 뷰가 security_invoker 로 생성됐는가
-- select relname, reloptions
--   from pg_class
--  where relname = 'goal_university_options';


-- =====================================================================
-- 되돌리기(롤백) — 실행하지 마라. 필요할 때만 수동으로 복사해서 쓴다.
-- ⚠ 되돌리면 어드민 세션에서 학생 확률 컬럼 UPDATE 가 다시 통과한다.
-- =====================================================================
-- drop view if exists public.goal_university_options;
--
-- drop policy if exists "goal_students_admin_select"         on public.goal_students;
-- drop policy if exists "goal_daily_records_admin_select"    on public.goal_daily_records;
-- drop policy if exists "goal_probability_logs_admin_select" on public.goal_probability_logs;
--
-- create policy "goal_students_admin_all" on public.goal_students
--     as permissive for all to authenticated
--     using (public.is_winning_admin()) with check (public.is_winning_admin());
-- create policy "goal_daily_records_admin_all" on public.goal_daily_records
--     as permissive for all to authenticated
--     using (public.is_winning_admin()) with check (public.is_winning_admin());
-- create policy "goal_probability_logs_admin_all" on public.goal_probability_logs
--     as permissive for all to authenticated
--     using (public.is_winning_admin()) with check (public.is_winning_admin());
