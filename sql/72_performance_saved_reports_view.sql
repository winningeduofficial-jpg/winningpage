-- =====================================================================
-- 수행평가 저장 리포트 집계 뷰 (로드맵 P12)
-- Supabase SQL Editor에서 수동 실행 필요. (idempotent — 여러 번 실행해도 안전)
--
-- 명세서 §8.6:1836 이 규정한 목록 조회 계약을 구현한다:
--   v_performance_saved_reports(session_id, topic_title, grade_label,
--     subject_group, subject, career_goal, updated_at, has_design,
--     has_evaluation, has_final, design_report_id, evaluation_report_id,
--     final_report_id)
-- 외부의 최신 50건 하드 절단(`api/report-list.js:22`)과 클라이언트 그룹핑
-- (`index.html:2830-2860`)을 대체하며, `api/performance/reports.js`가
-- `updated_at` 커서 페이지네이션의 정렬 기준으로 이 뷰를 쓴다.
--
-- ── final_report_id 출처 — 명세 문면과 실제 구현이 갈리는 지점
--    §8.6 문면은 "has_final/final_report_id ← performance_submissions
--    (is_final=true)"로 읽히지만, sql/58_performance_submission.sql (5)
--    `finalize_performance_submission` RPC는 최종 확정과 **같은 트랜잭션**에서
--    `performance_reports`에 `report_type='final_submission'` 행을 upsert하고
--    (부분 UNIQUE `performance_reports_one_final_per_session_idx`로 세션당
--    1건), 그 행의 `sections`가 `SectionedReportView`가 그대로 소비할 수
--    있는 봉투(`{v:1,type:'final_submission',sections}`, `finalize.js:290-311`)
--    다. `performance_submissions.id`는 원본 제출 필드만 갖고 있어 그 자체로는
--    섹션 렌더가 불가능하다. 그래서 `final_report_id`는 `design_report_id`/
--    `evaluation_report_id`와 대칭으로 **performance_reports.id**를 가리키게
--    한다 — 셋 다 같은 테이블·같은 봉투 모양이라 상세 API가 리포트 3종을
--    동일한 방식으로 조회·렌더할 수 있다. `is_final`과 `final_submission` 리포트
--    존재는 같은 RPC가 한 트랜잭션에서 함께 커밋하므로 `has_final` 값은 어느
--    소스를 봐도 동일하다.
--
-- ── updated_at — 정렬·커서 기준이라 정확해야 한다
--    세션 자체 갱신(`performance_sessions.updated_at`) / 리포트 3종 중 최근
--    갱신(`performance_reports.updated_at`, sql/57 (1)에서 추가) / 제출본
--    갱신(`performance_submissions.updated_at`, draft 저장 포함) 중 **최댓값**.
--    `greatest()`는 NULL 인자를 무시하는 PostgreSQL 동작이라(`goal_student_state`
--    뷰 주석, sql/55) 리포트·제출본이 아예 없는 세션에서도 `s.updated_at`(NOT
--    NULL) 하나로 안전하게 값이 떨어진다.
--
-- ── security_invoker = true
--    뷰 자체가 아니라 기반 테이블의 기존 소유자 SELECT RLS 정책
--    (`performance_sessions_select_own` 등, sql/54_performance_app.sql (3))이
--    그대로 적용되게 한다. 39/43/48/50/54/55/68번이 이미 쓰는 저장소 관례를
--    따른다. `api/performance/reports.js`는 service_role 클라이언트로 이 뷰를
--    조회하므로 RLS 자체는 우회되지만, 향후 클라이언트 직접 select 경로가
--    생기더라도 소유자 격리가 깨지지 않는다.
--
-- 의존성:
--   - 54_performance_app.sql : performance_sessions / performance_topics /
--                               performance_reports / performance_submissions
--   - 57_performance_design_report.sql : performance_reports.updated_at 컬럼
--   - 58_performance_submission.sql : performance_reports 부분 UNIQUE 3종
--     (세션당 report_type별 최대 1행이 이 뷰의 `max(id) filter` 안전성 전제)
-- ---------------------------------------------------------------------

create or replace view public.v_performance_saved_reports
with (security_invoker = true) as
select
    s.id as session_id,
    t.title as topic_title,
    s.grade_label,
    s.subject_group,
    s.subject,
    s.career_goal,
    greatest(s.updated_at, rpt.reports_updated_at, sub.submissions_updated_at) as updated_at,
    rpt.design_report_id is not null as has_design,
    rpt.evaluation_report_id is not null as has_evaluation,
    rpt.final_report_id is not null as has_final,
    rpt.design_report_id,
    rpt.evaluation_report_id,
    rpt.final_report_id
from public.performance_sessions s
left join public.performance_topics t
    on t.id = s.selected_topic_id
-- 세션당 report_type별 최대 1행(58번 부분 UNIQUE 3종)이라
-- array_agg(...)[1] filter가 곧 "그 종류의 유일한 행 id, 없으면 null"이다.
-- uuid에는 max() 집계가 없어(42883) array_agg 인덱싱으로 같은 결과를 낸다.
left join lateral (
    select
        (array_agg(pr.id) filter (where pr.report_type = 'design'))[1] as design_report_id,
        (array_agg(pr.id) filter (where pr.report_type = 'evaluation'))[1] as evaluation_report_id,
        (array_agg(pr.id) filter (where pr.report_type = 'final_submission'))[1] as final_report_id,
        max(pr.updated_at) as reports_updated_at
    from public.performance_reports pr
    where pr.session_id = s.id
) rpt on true
-- draft 저장까지 포함한 "가장 최근 손댄 시각"을 updated_at에 반영하기 위한
-- 별도 집계. final_report_id는 위 rpt에서 이미 나오므로 여기서는 id를
-- 다시 뽑지 않는다.
left join lateral (
    select max(ps.updated_at) as submissions_updated_at
    from public.performance_submissions ps
    where ps.session_id = s.id
) sub on true;

comment on view public.v_performance_saved_reports is
    '수행평가 저장 리포트 목록 집계(명세서 §8.6:1836). design/evaluation/final_report_id는 전부 performance_reports.id(세션당 종류별 최대 1행, sql/58 부분 UNIQUE) — final도 performance_submissions.id가 아니라 report_type=''final_submission'' 행을 가리켜야 SectionedReportView가 그대로 렌더할 수 있다. security_invoker=true로 기반 테이블 소유자 RLS를 상속한다.';

grant select on public.v_performance_saved_reports to authenticated, service_role;

-- =====================================================================
-- 검증용 SELECT (실행 후 수동 확인용 — 주석 해제하고 실행)
-- =====================================================================
-- select count(*) from information_schema.views
-- where table_schema = 'public' and table_name = 'v_performance_saved_reports';
--
-- select count(*) from information_schema.columns
-- where table_schema = 'public' and table_name = 'v_performance_saved_reports';
-- -- 13이어야 한다 (session_id, topic_title, grade_label, subject_group,
-- -- subject, career_goal, updated_at, has_design, has_evaluation, has_final,
-- -- design_report_id, evaluation_report_id, final_report_id).
--
-- select * from public.v_performance_saved_reports order by updated_at desc limit 5;
