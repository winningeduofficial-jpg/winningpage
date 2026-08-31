-- =====================================================================
-- 「위닝 생기부 DB」 어드민 메뉴 제거 (QA 230).
--
-- 근거: 위닝측 지적 — 생기부(학교생활기록부) 원문 보관이 2026-07-29부터
--       불법이라 해당 메뉴를 내려야 한다. 법률 이슈라 단독 최우선 처리.
--
-- 코드 쪽에서 같은 커밋으로 지운 것 3곳:
--   - src/pages/admin/adminSectionKeys.ts  (라우트 목록 → /admin/winningStudentRecordDb 소멸)
--   - src/pages/Admin.tsx                  (MENU_GROUPS 「위닝 DB」 섹션 항목)
--   - src/pages/admin/configs/winning.ts   (CONFIGS 정의)
-- admin_resources 는 그 메뉴 구성의 사본이므로(테이블 주석 참고) 여기서 같이
-- 지운다. 남겨두면 권한 화면(AdminRolesAdmin / AdminMembersAdmin)에 화면이
-- 없는 유령 항목이 계속 뜬다.
--
-- 권한 행은 FK 가 on delete cascade 라(20260822000010 3·5절)
-- admin_role_permissions / admin_member_permissions 에서 자동으로 함께 빠진다.
--
-- ⚠️ 이 마이그레이션은 **메뉴만** 지운다. 실제 적재 데이터
--    (winning_assessment_knowledge_items 중 knowledge_type = 'student_record_pattern')
--    와 그 값을 허용하는 CHECK 제약은 건드리지 않았다 — 보관 자체가 불법이라면
--    데이터 파기가 별도로 필요하고, 그건 되돌릴 수 없어 위닝측 확인 후 별건으로
--    처리한다. 아래 확인용 쿼리로 잔존 건수를 볼 수 있다.
--    (해당 유형은 수행평가 RAG 대상이 아니다 — api/performance/admin-embed.ts
--     RAG_KNOWLEDGE_TYPES, RPC match_winning_suhaeng_all_subjects 둘 다 제외.)
--
-- 재실행 시 no-op.
-- =====================================================================

delete from public.admin_resources
 where key = 'winningStudentRecordDb';

-- 코드에서 지운 키가 테이블에 남아 있지 않은지 확인. 남아 있다면 위 delete 가
-- 먹지 않았다는 뜻이라 조용히 넘기지 않는다(20260823000002 의 유령 항목 검사와 같은 취지).
do $$
begin
  if exists (select 1 from public.admin_resources where key = 'winningStudentRecordDb') then
    raise exception 'admin_resources 에 winningStudentRecordDb 가 남아 있습니다 — 화면 없는 유령 권한 항목이 됩니다.';
  end if;
end $$;


-- =====================================================================
-- 확인용 (실행 후 눈으로 볼 것 — 아래는 주석, 자동 실행되지 않는다)
-- =====================================================================
-- 1) 서비스 관리 대분류가 18행 → 17행이 됐는지.
-- select group_title, count(*) from public.admin_resources
--  group by 1 order by min(sort_order);
--
-- 2) 파기 여부를 정해야 하는 잔존 생기부 데이터 건수.
-- select count(*) from public.winning_assessment_knowledge_items
--  where knowledge_type = 'student_record_pattern';
