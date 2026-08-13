-- =====================================================================
-- 결제·환불 규정 동의를 가입이 아니라 "첫 결제 시점"에 원장(user_term_agreements)
-- 으로 추적한다.
--
-- 배경: legalDocs.js/CHECKOUT_AGREEMENTS 에 결제 서비스 이용약관·결제 관련
-- 개인정보 수집·이용 동의서·환불 규정 본문과 /payment-terms·/payment-consent·
-- /refund 라우트는 이미 있었는데, 실제로 이 문서에 동의를 받는 화면(체크박스)이
-- 어디에도 없었다(CHECKOUT_AGREEMENTS 는 export 만 되고 아무 파일도 import 하지
-- 않는 죽은 코드였다). 가입 시 필수 약관(terms.code='student_service'/
-- 'parent_service')이 이미 제30~34조를 포함한 전문이라 가입 단계 갭은 아니다 —
-- 결제 단계 갭이다(Figma 1882:10111 "결제하기" 화면 실측 — "[구매 전
-- 안내사항]" 체크박스 1개 + "결제 서비스 이용 약관, 개인정보 처리 동의" 체크박스
-- 1개, 총 2개).
--
-- 설계: sql/40 의 기존 원장(terms/user_term_agreements)을 그대로 확장한다.
-- 새 상수·새 테이블을 만들지 않는다. audience='common' 이므로
-- complete_signup_profile 의 기존 루프(sql/40 [7], t.audience in
-- (v_member_type,'common'))가 가입 시점에 이 세 항목도 자동으로
-- agreed=false 로 깔아둔다(else false 분기, RPC 시그니처 변경 불필요) —
-- 첫 결제에서 fn_agree_payment_terms() 가 그 행들을 agreed=true 로 갱신한다.
--
-- 화면은 체크박스 2개지만 원장은 3행이다 — "결제 서비스 이용 약관, 개인정보
-- 처리 동의" 체크박스 하나가 payment_terms·payment_consent 두 문서를
-- CHECKOUT_AGREEMENTS.paymentAgreement 처럼 묶어서 보여주고 한 번에 동의
-- 처리한다(문서별 원장 행은 분리 — 나중에 결제 개인정보 동의서만 개정돼도
-- 재동의 대상을 문서 단위로 특정할 수 있어야 한다).
-- =====================================================================

insert into public.terms
  (code, version, audience, title, route, is_required, profile_column, sort_order)
select
  v.code, 'v1', v.audience, v.title, v.route, v.is_required, v.profile_column, v.sort_order
from (
  values
    ('refund_notice',   'common', '구매 전 확인사항(환불 규정)',
     '/refund',          true, null, 190),
    ('payment_terms',   'common', '결제 서비스 이용약관',
     '/payment-terms',   true, null, 200),
    ('payment_consent', 'common', '결제 관련 개인정보 수집·이용 동의',
     '/payment-consent', true, null, 210)
) as v(code, audience, title, route, is_required, profile_column, sort_order)
where not exists (
  select 1 from public.terms t
  where t.code = v.code and t.version = 'v1'
);

-- ---------------------------------------------------------------------
-- fn_agree_payment_terms() : 첫 결제 시점 결제 약관 동의 기록
--
-- user_term_agreements 는 클라이언트 insert/update 정책이 없다(sql/40 [3]
-- 주석 — "동의 기록은 반드시 security definer RPC 를 통해서만"). 그래서
-- ParentCheckout.jsx 가 체크박스 2개를 채운 뒤 결제 버튼을 누르는 순간
-- 이 함수를 호출해 원장에 agreed=true 를 쓴다. 이후 재결제·다른 자녀
-- 결제에서는 이미 agreed=true 이므로 화면이 이 단계를 건너뛴다(멱등 upsert).
-- ---------------------------------------------------------------------
create or replace function public.fn_agree_payment_terms()
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_user_id uuid := auth.uid();
begin
  if v_user_id is null then
    raise exception 'not_authenticated';
  end if;

  insert into public.user_term_agreements (user_id, term_id, agreed)
  select v_user_id, t.id, true
  from public.terms t
  where t.is_active
    and t.code in ('refund_notice', 'payment_terms', 'payment_consent')
  on conflict (user_id, term_id) do update
  set agreed    = true,
      agreed_at = now();

  return jsonb_build_object('ok', true);
end;
$function$;

revoke all on function public.fn_agree_payment_terms() from public, anon;
grant execute on function public.fn_agree_payment_terms() to authenticated;
