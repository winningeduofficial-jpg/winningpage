-- ---------------------------------------------------------------------
-- 「매출 조정」·「매출 정산」·「일일정산」 메뉴를 권한 마스터에서 뺀다.
--
-- 왜
--   셋 다 운영자가 손으로 적는 수기 장부였고 실제 결제와 연결이 없었다. 앞의 둘은
--   화면이 그리던 컬럼(payer_name/program_name/sale_amount/paid_amount)이 **실제
--   payments 스키마에 하나도 없어서** 빈 화면으로 떠 있었다(2026-08-23 실측).
--   대체재는 orders/order_items 를 보는 「매출 및 결제」다
--   (admin_revenue_items 뷰 — 20260823000011).
--
--   코드 쪽에서 같은 커밋에 MENU_GROUPS·ADMIN_SECTION_KEYS·CONFIGS 에서 뺐다.
--   admin_resources 는 그 메뉴 구성의 사본이라 여기서도 빼야 한다 — 안 빼면
--   권한 화면에만 남아, 줄 수는 있는데 화면은 없는 유령 항목이 된다.
--
-- ⚠️ 권한 행은 자동으로 정리된다 — admin_role_permissions·admin_member_permissions
--    의 resource_key 가 admin_resources(key) 를 ON DELETE CASCADE 로 참조한다.
--
-- ⚠️ **테이블(payments, daily_settlements)은 지우지 않는다.** 화면만 없앤다.
--    운영 DB 에 손으로 적어둔 기록이 남아 있을 수 있고, 지우면 되돌릴 수 없다.
--    payments 는 order_id 를 들고 있어 토스 연동 쪽에서 쓰일 여지도 있다.
--    정말 버릴지는 운영 데이터를 확인한 뒤 별도로 판단할 것.
-- ---------------------------------------------------------------------

delete from public.admin_resources
 where key in ('payments', 'settlements', 'dailySettlements');


-- 코드(ADMIN_SECTION_KEYS)와 개수가 맞는지 확인한다. 재편 이후 48 → 45.
do $$
declare
  n int;
begin
  select count(*) into n from public.admin_resources;

  if n <> 46 then
    raise exception 'admin_resources 가 % 행입니다 — 46 가 아니면 코드의 ADMIN_SECTION_KEYS 와 어긋난 것입니다.', n;
  end if;
end $$;


-- =====================================================================
-- 확인용 (실행 후 눈으로 볼 것 — 아래는 주석, 자동 실행되지 않는다)
-- =====================================================================
-- select group_title, count(*) from public.admin_resources
--  group by 1 order by min(sort_order);   -- 매출·결제관리가 7 → 4
