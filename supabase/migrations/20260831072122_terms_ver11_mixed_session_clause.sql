-- 서비스 이용약관 Ver11 docx(2026-08-31 수령분)의 제33조의1 ⑧ 후문 단서를 DB 약관에 반영한다.
-- "단, 1개 서비스에 기간과 회차가 동시에 적용되는 서비스는 회차제로 산정한다"
-- — 혼합 상품(기간+회차 동시 적용, 예: 수행평가 6개월 14회)의 환불 산정 유형을
-- 회차제로 확정하는 문언. 환불 Ver10 설계의 미결 쟁점(혼합 상품 적용 유형)에 대한
-- 고객사 답변이 약관 문안으로 들어온 것이다.
--
-- 대상: 활성 refund_policy(v3), service_fulltext(v5) 두 행의 같은 ⑧ 문단.
-- 방식: 기존 문장 전체를 치환(append). 원문 docx의 단서가 한다체("산정한다")로
-- 주변 합니다체와 어긋나지만 원문 그대로 반영하고 마침표만 보충한다 —
-- 문체 정리는 고객사 다음 개정 때 제안할 사항이지 DB가 임의로 고칠 것이 아니다.
--
-- 멱등: 이미 단서가 들어간 행은 where 조건(단서 미포함)에서 걸러져 재실행에 안전하다.

update public.terms
set content = replace(
  content,
  '동일한 서비스가 회차제와 기간제로 각각 판매되는 경우, 회원이 구매 시 선택한 판매 유형에 따라 제7항(기간제) 또는 본 항(회차제)을 적용합니다.',
  '동일한 서비스가 회차제와 기간제로 각각 판매되는 경우, 회원이 구매 시 선택한 판매 유형에 따라 제7항(기간제) 또는 본 항(회차제)을 적용합니다. 단, 1개 서비스에 기간과 회차가 동시에 적용되는 서비스는 회차제로 산정한다.'
)
where code in ('refund_policy', 'service_fulltext')
  and is_active = true
  and content like '%제7항(기간제) 또는 본 항(회차제)을 적용합니다.%'
  and content not like '%회차제로 산정한다%';

-- 반영 검증 — 활성 두 행 모두 단서를 포함해야 한다. 아니면 마이그레이션 실패로 알린다.
do $$
declare
  missing int;
begin
  select count(*) into missing
  from public.terms
  where code in ('refund_policy', 'service_fulltext')
    and is_active = true
    and content not like '%회차제로 산정한다%';
  if missing > 0 then
    raise exception '혼합 상품 회차제 단서 미반영 행 %건 — 활성 약관 본문이 예상과 다르다', missing;
  end if;
end $$;
