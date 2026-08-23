-- ---------------------------------------------------------------------
-- 「매출 및 결제」 메뉴를 권한 마스터에 등록한다.
--
-- 화면은 RevenueAdmin.tsx, 원천은 admin_revenue_items 뷰(20260823000011).
-- 바로 앞 20260823000012 에서 없앤 수기 장부 3종의 자리를 대신한다.
--
-- 정렬은 705 — 매출·결제관리 그룹(710~770)의 맨 앞에 온다. 이 그룹에서 제일
-- 자주 보는 화면이라 위에 둔다.
--
-- ⚠️ 「실무 관리자」 묶음에는 넣지 않는다. 매출·결제관리는 그 묶음에 항목이
--    하나도 없어(20260822000010 규칙 3 = default deny) 그룹 자체가 안 보이는 게
--    설계다. 여기에 하나라도 넣으면 그 원칙이 깨진다.
-- ---------------------------------------------------------------------

insert into public.admin_resources (key, group_title, label, sort_order)
values ('revenue', '매출·결제관리', '매출 및 결제', 705)
on conflict (key) do update
  set group_title = excluded.group_title,
      label       = excluded.label,
      sort_order  = excluded.sort_order,
      is_active   = true;


-- 코드(ADMIN_SECTION_KEYS)와 개수가 맞는지 확인한다. 45 + 1 = 46.
do $$
declare
  n int;
begin
  select count(*) into n from public.admin_resources;

  if n <> 47 then
    raise exception 'admin_resources 가 % 행입니다 — 47 이 아니면 코드의 ADMIN_SECTION_KEYS 와 어긋난 것입니다.', n;
  end if;
end $$;
