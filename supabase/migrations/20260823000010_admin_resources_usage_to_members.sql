-- ---------------------------------------------------------------------
-- 일일 입장·이용 현황을 「서비스 관리」에서 「회원관리」로 옮긴다.
--
-- 왜
--   두 화면은 "누가 언제 들어와서 무엇을 썼나"를 보는 것이라 서비스 운영이 아니라
--   회원에 붙는다(사용자 확정 2026-08-23). 20260823000002 에서는 서비스 관리에
--   뒀는데 그 판단을 뒤집는다.
--
-- 사이드바(MENU_GROUPS)와 같이 움직여야 한다 — admin_resources 는 그 메뉴 구성의
-- 사본이고, 권한 화면(AdminRolesAdmin / AdminMembersAdmin)이 group_title 로 묶어
-- 그린다. 한쪽만 고치면 권한 화면에만 옛 위치가 남는다.
--
-- ⚠️ key 는 바뀌지 않으므로 기존 권한 행은 전부 유효하다. 「실무 관리자」 묶음도
--    두 그룹 모두 부여 대상이라(회원관리=view, 서비스 관리=edit) 재조정이 필요한데,
--    아래에서 회원관리 규칙(view)에 맞춘다.
-- ---------------------------------------------------------------------

-- ── 먼저: 다른 브랜치가 넣은 premiumAchievements 의 그룹명을 재편안에 맞춘다 ──
--
-- 20260823000003_premium_achievements 가 이 화면을 **재편 전 그룹명 '메인 관리'**로
-- 넣었다. 그 마이그레이션은 20260823000002(대분류 재편)와 나란히 작성돼서 새 이름을
-- 몰랐다. 그대로 두면 사이드바에는 없는 그룹이 권한 화면에만 뜨고, 아래 가드도 걸린다.
--
-- sort_order 도 옮긴다 — 원 주석의 의도는 "멘토스 소개 옆"인데, 재편으로 메인화면
-- 관리가 110~160 으로 밀려서 65 는 팝업 관리보다도 앞에 서 버린다.
update public.admin_resources
   set group_title = '메인화면 관리',
       sort_order  = 165
 where key = 'premiumAchievements'
   and group_title = '메인 관리';


update public.admin_resources
   set group_title = '회원관리',
       sort_order  = case key
                       when 'dailyEntries' then 620
                       when 'usageStatus'  then 630
                     end
 where key in ('dailyEntries', 'usageStatus');

-- 「실무 관리자」는 회원 관련 메뉴를 읽기 전용으로만 본다(20260822000010 9-b 규칙).
-- 서비스 관리에 있을 때는 edit 였으므로 여기서 view 로 낮춘다.
update public.admin_role_permissions p
   set level = 'view'
  from public.admin_roles r
 where p.role_id = r.id
   and r.name = '실무 관리자'
   and p.resource_key in ('dailyEntries', 'usageStatus');


-- 옮긴 뒤에도 대분류가 7개 그대로인지 확인한다. 오타로 새 그룹이 생기면 사이드바에는
-- 없는 그룹이 권한 화면에만 뜬다.
do $$
declare
  stale text;
begin
  select string_agg(distinct group_title, ', ')
    into stale
    from public.admin_resources
   where group_title not in ('메인화면 관리', '입시정보 관리', '고객안내 관리',
                             '서비스 관리', '회원관리', '매출·결제관리', '직원관리');

  if stale is not null then
    raise exception 'admin_resources 에 알 수 없는 대분류가 있습니다: %', stale;
  end if;
end $$;


-- =====================================================================
-- 확인용 (실행 후 눈으로 볼 것 — 아래는 주석, 자동 실행되지 않는다)
-- =====================================================================
-- select group_title, label, sort_order from public.admin_resources
--  where key in ('dailyEntries','usageStatus');   -- 둘 다 회원관리 620/630
