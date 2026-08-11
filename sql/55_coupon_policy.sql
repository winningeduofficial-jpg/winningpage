-- =====================================================================
-- 쿠폰 판정 DB 통합 + 사용 이력(쿠폰별 사용 횟수 제한)
-- Supabase SQL Editor 에서 실행하세요. (idempotent - 여러 번 실행해도 안전)
-- =====================================================================
--
-- 배경 — 현재 상태(실측)
--   쿠폰 유효성 판정이 DB에 전혀 없고 src/pages/Checkout.jsx(:186-210) 와
--   api/create-order.js(:88-106) 두 곳에 JS로 중복 구현돼 있었다. 결함 4개:
--     1) today 를 클라이언트 시계로 계산 → 시계 조작으로 만료 쿠폰 부활 가능.
--     2) 그 today 가 UTC라 KST 기준 9시간 구멍(자정~09시 KST에 전날 만료
--        쿠폰이 아직 살아있음).
--     3) valid_until IS NULL(무기한 쿠폰)을 `.gte('valid_until', today)`가
--        걸러내 over40k-3000/over80k-5000 두 활성 쿠폰이 dev에서 아무 데서도
--        선택 불가능했다. 게다가 Checkout.jsx:303 applyCouponCode 가 "로드된
--        목록에서만" 코드를 찾아, 유효한 코드에 "유효하지 않은 쿠폰
--        코드입니다"라고 거짓 안내를 했다.
--     4) 사용 이력이 없어 무제한 재사용 가능(dev 주문 5건 전부 signup-6000).
--
-- 설계 — 사용자 확정 사항
--   · 판정을 DB 함수(RPC)로 통합, 사용 이력도 이번에 함께 도입.
--   · valid_until IS NULL = 무기한(이용권 program_access.expires_at 과 동일
--     규약). 필터링(`.gte`)이 아니라 "만료일이 있고 지났을 때만 expired" 로
--     뒤집는다 — NULL 쿠폰이 자연히 무기한으로 통과한다.
--   · KST 고정(UTC+9, DST 없음). `+ interval '9 hours'` 하드코딩 대신 명명
--     타임존 'Asia/Seoul' 사용(now() at time zone 'Asia/Seoul' 은 STABLE로도
--     충분 — 이 파일의 함수들은 IMMUTABLE 이 필요 없다).
--
-- 사용 횟수 제한 — 쿠폰마다 다르다 (2026-08-11 사용자 확정, 추가)
--   최초 설계는 "1인 1회"를 fn_coupon_is_redeemed 에 하드코딩했으나, 배포 전
--   실사용 쿠폰을 보니 성격이 갈렸다 — signup-6000(회원가입 축하)은 1회가
--   맞지만, over40k-3000/over80k-5000 은 코드 없이 금액 조건으로만 자동
--   노출되는 상시 할인이라 매 주문 적용이 자연스럽다. 하드코딩대로 배포하면
--   상시 할인 2종이 사실상 1회용으로 죽는다. 그래서 coupons.max_uses_per_user
--   컬럼(양수=N회, 아래 0번 절 — 기본값은 2026-08-11 P2-6 정정으로 1)을 두고
--   fn_coupon_is_redeemed 를 "존재하면 소진"에서 "건수가 이 값에 도달하면
--   소진"으로 바꿨다 — 헬퍼 하나에 판정을 모으는 기존 설계는 그대로
--   유지(세 함수가 각자 판정하면 방금 없앤 중복이 되살아난다).
--
-- 소진 판정 — cron 없는 지연 평가 (핵심 설계)
--   주문 생성 시점에 "소진"을 확정 기록하면 결제 중도 이탈자의 쿠폰이 영구
--   잠긴다(운영에 pending 주문이 다수 존재). 반대로 결제 승인(webhook) 시점
--   에만 기록하면, 같은 쿠폰으로 동시에 만들어진 두 pending 주문이 각각
--   승인될 수 있다. 그래서 "소진 여부"를 저장하지 않고, coupon_redemptions
--   (이 쿠폰이 어떤 주문에 귀속됐는지의 사실 기록) 을 orders.status 와 조인해
--   "지금 이 순간" 평가한다(fn_coupon_is_redeemed).
--
--   2026-08-11 P0-1 정정 — 화이트리스트에서 블랙리스트로 뒤집었다.
--   이전 버전은 "orders.status in ('paid','waiting_deposit') 또는 30분 이내
--   pending" 일 때만 소진으로 쳤다(화이트리스트). 문제: api/toss-webhook.js
--   의 mapStatus() 는 CANCELED·PARTIAL_CANCELED·EXPIRED 를 전부 'canceled'
--   하나로 접는데, 'canceled' 는 이 화이트리스트에 없어 "미소진(재사용 가능)"
--   으로 떨어졌다 — 즉 1,000원짜리 부분환불 한 번으로 1인 1회 쿠폰이
--   무제한 재사용 가능해졌다(program_access 는 balanceAmount>0 이면 회수를
--   스킵해 이용권은 그대로 유지되는데 쿠폰만 부활하는 비대칭이었다). 지금은
--   반대로 "미소진임이 확실한 경우만" 열거하고 나머지는 전부 소진으로
--   막는다 — 모르는 상태(향후 'refunded' 같은 새 상태가 생겨도)가 "쓸 수
--   있음"이 아니라 "쓸 수 없음"으로 떨어지게 한다:
--     · status = 'failed' → 소진 아님. 결제창 자체가 열리지 않았거나 승인이
--       거절된, 진짜 이탈이다. 재시도는 항상 열려 있어야 한다.
--     · status = 'pending' AND 생성 후 30분 경과 → 소진 아님(소프트 홀드
--       해제, 근거는 아래 그대로).
--     · 그 외 전부('paid'·'waiting_deposit'·'canceled'·30분 이내 'pending'
--       ·향후 추가될 미지의 상태) → 소진.
--   'canceled'(환불·부분환불·가상계좌 미입금 만료를 전부 포함)가 이제
--   "소진"에 남는다는 뜻이다 — 이건 의도한 정책 변경이다. "환불하면 쿠폰을
--   돌려준다"는 아무도 결정한 적이 없는 정책이었고(그냥 화이트리스트의
--   누락된 빈틈이었다), 걷어내는 지금이 맞다. 정말로 쿠폰을 돌려주고 싶은
--   경우(예: 전액 환불이 명백한 판매자 귀책)는 운영자가 아래 2)절
--   voided_at 을 통해 "명시적으로" 되돌린다 — 사고가 아니라 결정이어야
--   한다(P1-4 와 직결).
--   시간창(30분)·상태 열거는 public.fn_coupon_is_redeemed 한 곳에만 리터럴로
--   박아 fn_usable_coupons/fn_coupon_by_code/fn_redeem_coupons/
--   fn_revalidate_order_coupons 전부가 항상 같은 값을 본다(드리프트 방지).
--
-- 동시성 — SERIALIZABLE 대신 advisory lock
--   이 프로젝트 api/ 층에 40001(serialization_failure) 재시도 인프라가 0개라
--   SERIALIZABLE/REPEATABLE READ 는 쓰지 않는다(도입하면 사용자에게 500 이
--   노출된다). 그렇다고 단순 조건부 UPDATE 로도 못 막는다 — "이 쿠폰을 이미
--   그 유저가 살아있는 주문에 물렸는가"는 다른 테이블(orders)과 조인한 EXISTS
--   판정이라 단일 UPDATE 문의 WHERE 재평가로는 표현이 안 되고, 또
--   coupon_redemptions 에는 사용자가 쿠폰을 여러 번(과거 실패 시도 포함)
--   가질 수 있어 단순 UNIQUE(coupon_id,user_id) 로도 못 막는다(그러면 실패한
--   주문 이후 재구매까지 막힌다). 그래서 fn_redeem_coupons 안에서 쿠폰마다
--   advisory lock 으로 직렬화한다 — 트랜잭션 종료 시 자동 해제되고, 쿠폰 id
--   오름차순으로만 잠그므로(coupons.id 정렬) 여러 쿠폰을 같이 담아도 잠금
--   순서가 항상 같아 데드락이 생기지 않는다. READ COMMITTED 그대로 안전하다.
--   2026-08-11 P1-6/P3 로 잠금 키를 두 종류로 늘렸다 — 아래 4)절 참고.
--
-- 판정 결과는 필터하지 않고 이유와 함께 반환한다 (fn_usable_coupons)
--   기존엔 min_amount 미달 쿠폰이 이유 없이 opacity-45 로만 보였고,
--   valid_until NULL 쿠폰은 목록에서 조용히 사라졌다. fn_usable_coupons 는
--   coupons 테이블의 행을 하나도 걸러내지 않고 eligible boolean + reason
--   text(코드値, 한국어 문구 아님 — 프런트가 매핑)를 함께 반환한다.
--   2026-08-11 P1-1 정정 — "걸러내지 않는다"는 원칙을 is_active=false 에
--   한해서만 뒤집었다. 아래 3)절에서 이유를 설명한다. reason 목록도
--   login_required/sold_out 이 늘어 6종이 됐다(below_min_amount / expired /
--   already_used / inactive / login_required / sold_out).
--
-- RLS·어드민 복구 경로
--   program_access 에 admin 정책이 없어 어드민이 복구를 못 하는 문제가 이미
--   있었다(sql/54_program_access_grant.sql 이 다루는 영역과는 별개로, RLS
--   설계 관점에서 같은 실수를 반복하지 않기 위해 여기 남긴다). 이 도메인
--   (orders/coupons/order_items)은 애초에 admin 정책이 하나도 없다
--   (00_base_schema.sql 실측 — orders/coupons 는 select-own/public-read
--   뿐이다). coupon_redemptions 도 본인 조회(select own)만 RLS 로 열고,
--   쓰기는 전부 SECURITY DEFINER 함수(fn_redeem_coupons, service_role 전용)
--   경유로만 가능하게 잠근다 — 팀 리드 지시대로다. 그 위에 is_admin()
--   (20_landing_renewal.sql:18, 이미 anon/authenticated/service_role 에
--   grant된 기존 헬퍼)로 어드민 조회/수정을 여는 정책을 둔다(2026-08-11
--   P1-4 로 "삭제"는 이 정책에서 뺐다 — 바로 아래 문단).
--
--   2026-08-11 P1-4 정정 — "Studio 에서 직접 redemption 행을 지워 되돌려줄
--   수 있어야 한다"는 이전 지시는 폐기한다. 삭제는 감사 원장을 스스로
--   파괴하는 행위라 program_access 사건과 정반대 실수다(그때는 "복구할 길이
--   없다"가 문제였는데, 삭제 허용은 "복구한 기록조차 안 남는다"가 문제다).
--   대신 coupon_redemptions.voided_at/void_reason(1-b절)을 두고, 되돌림은
--   UPDATE(void) 로만 하게 한다 — 이 정책도 for select/for update 로만 열고
--   for delete 는 아예 만들지 않는다(정책이 없는 커맨드는 RLS 기본값이
--   거부다). 단 이건 anon/authenticated 경로(PostgREST, 향후 Admin.jsx 화면)
--   기준이고, Supabase Studio 대시보드 자체는 프로젝트 소유자 인증으로
--   postgres 롤(BYPASSRLS)에 연결되므로 이 RLS 로 막히지 않는다 — 그건 RLS
--   설계로 해결할 수 있는 층이 아니라 "Studio 에서는 이제 DELETE 대신 UPDATE
--   voided_at 문을 실행하라"는 운영 규약으로 남긴다(아래 1-d절 참고).
--
-- orders.coupon_id (단일 컬럼) 처리
--   coupon_redemptions 가 생긴 뒤로 "이 주문에 어떤 쿠폰(들)이 적용됐는가"의
--   정본은 coupon_redemptions 다(N개 지원). orders.coupon_id 는 이 레포
--   전체에서 create-order.js가 쓰기만 하고 아무도 읽지 않는다(grep 실측 —
--   MyPage.jsx/Admin.jsx 어디에도 소비처가 없다). 그래서 스키마를 깨지 않고
--   "대표 쿠폰 1개, 참고용" 으로 계속 채운다(적용된 쿠폰 중 첫 번째, 없으면
--   NULL) — 향후 이 컬럼을 읽는 화면이 생겨도 완전히 빈 값보다 낫다.
--   2026-08-11 P1-4 로 orders_coupon_id_fkey 의 삭제 규칙을 SET NULL 에서
--   RESTRICT 로 바꿨다(1-c절) — "참고용"이라는 성격은 그대로지만, 한 번이라도
--   주문에 물린 쿠폰은 coupon_redemptions 와 마찬가지로 삭제로 사라지지
--   않아야 한다는 원칙을 이 컬럼에도 동일하게 적용한다.
--
-- 쿠폰 할인액의 분해 보존 (P1-4, orders.discount_amount 를 쪼갤지 판단)
--   orders.discount_amount 는 상품 할인 + 쿠폰 할인의 합이라 그 자체로는
--   분해가 안 되지만, coupon_redemptions.discount_amount(적용 당시 실제
--   할인액, 쿠폰별 1행)가 이미 그 분해 정보를 갖고 있다 — 신규 컬럼을
--   추가하지 않는다. 정산 시 아래 조회로 상품 할인/쿠폰 할인을 분리한다:
--     select o.id, o.discount_amount as total_discount,
--            coalesce(sum(cr.discount_amount), 0) as coupon_discount,
--            o.discount_amount - coalesce(sum(cr.discount_amount), 0) as product_discount
--       from public.orders o
--       left join public.coupon_redemptions cr on cr.order_id = o.id and cr.voided_at is null
--      where o.id = :order_id
--      group by o.id, o.discount_amount;
--
-- 0번 절을 이 파일에 두는 이유 (10 이 아니라 55)
--   coupons 테이블 자체는 sql/10_pricing_orders.sql 이 만든다. 그런데 그
--   파일은 이미 적용된 마이그레이션이라 컬럼을 소급해 끼워 넣지 않고, 여기서
--   ALTER 로 보강한다 — dev 는 이미 10 이 적용된 뒤라 이 ALTER 가 실제로
--   컬럼을 추가하는 경로다.
-- =====================================================================
--
-- 2026-08-11 하드닝 패스 — 요약 (사용자 확정: P0+P1 전부 지금 수정)
--   적대적 검증에서 P0 2건 + P1 다수가 dev 실측으로 확인됐다. 이 패스가
--   다루는 항목과 위치(세부 근거는 각 항목 옆 절 주석):
--     P0-1 환불이 쿠폰을 부활시킴          → 위 "소진 판정" 절, 블랙리스트 전환
--     P0-2 승인 시점 재검증 없음            → 3-c) fn_revalidate_order_coupons
--     P1-1 fn_usable_coupons 가 RLS 를 넓힘  → 3) is_active 필터 + code 제거, 3-b) 코드 전용 함수
--     P1-2 signup-6000 개명                → 보류(아래 "P1-2 보류" 절 참고, 이번 패스에서 실행하지 않음)
--     P1-4 감사 원장이 삭제로 되돌아감       → 1-b)~1-d) voided_at + FK + RLS + fn_void_coupon_redemption
--     P1-5 orders.status 에 CHECK 없음      → 0-d)
--     P1-6 전체 발행량 제한 없음            → 0-b), 2-b), 4)
--     P1-7 비회원이 횟수 제한 우회          → 3)/3-b)/4) login_required
--     P1-8 stacking 기본 허용 + 0원 주문 갇힘 → 0-c), 4)
--     P2-6 위험한 값(무제한)이 기본값        → 0) 절 하단 DEFAULT 변경
--     P3   errcode/LATERAL 중복호출/tie-break/fail-open/락 키 앨리어싱
--          → 4)절 각각 표시
--   함수 시그니처가 바뀌는 항목(fn_coupon_is_redeemed 4번째 인자 추가,
--   fn_usable_coupons 반환 컬럼에서 code 제거)은 PostgreSQL 이 CREATE OR
--   REPLACE 로 처리하지 못한다 — 실측(_scratch_test/​_scratch_ret 로 이
--   dev 프로젝트에서 직접 검증, 흔적은 정리함): 인자를 default 값과 함께
--   덧붙이기만 해도 REPLACE 가 아니라 별도 오버로드가 새로 생겨 기존
--   3-인자 시그니처가 옛 동작 그대로 남는다(권한도 새로 생긴 쪽만 다시
--   초기화됨). 그래서 이 두 함수는 아래에서 명시적으로 DROP FUNCTION 한 뒤
--   CREATE 한다 — 재적용 후 반드시 pg_proc.proacl 로 권한을 재확인한다.
--
-- P1-2 해소 (2026-08-11, 후속) — signup-6000 개명은 uuid 전환으로 처리됐다.
--   이 절은 원래 "개명은 증상만 처리하는 임시방편이고, coupons.id 를
--   surrogate key(uuid)로 + 사람이 읽는 핸들을 slug 로 분리하는 마이그레이션이
--   예정돼 있으니 지금 문자열 id 를 개명하면 FK 마이그레이션을 두 번 하게
--   된다" 며 개명을 보류해 뒀다. 그 마이그레이션이
--   sql/56_surrogate_uuid_keys.sql 로 적용됐다:
--     coupons.id   text 'signup-6000' → uuid 대체키
--     coupons.slug text 'signup-2000'  (실제 할인액 2,000원 — 개명이 여기서 반영)
--   그래서 이 파일에서 쿠폰을 지목하는 문장은 전부 slug 기준으로 바뀌었고
--   (0)절 시드 UPDATE), 함수들의 쿠폰 식별자 인자·반환은 text → uuid 다.
--   예고했던 수정 지점(4)절 advisory lock 의 hashtextextended 는 text 만
--   받는다 — uuid 는 암시적으로 캐스팅되지 않는다)도 ::text 캐스팅으로
--   함께 반영했다.
--
-- 전제 — sql/56_surrogate_uuid_keys.sql 이 먼저 적용돼 있어야 한다
-- ---------------------------------------------------------------------
--   아래 함수들은 coupons.id 가 uuid 라는 전제로 작성돼 있다. 전환 전
--   스키마(text id)에서 실행하면 language sql 함수들(fn_coupon_is_redeemed
--   등)은 생성 시점 본문 검사에서 uuid = text 비교로 실패하고, plpgsql
--   함수들은 생성은 되지만 호출 시 깨진다 — 후자가 더 위험하다(조용히
--   어긋난다). 그래서 파일 맨 앞에 전제 검사 가드를 두어 즉시 멈춘다.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 전제 검사 (실패 시 즉시 중단). 빈 DB 경로에서는 sql/10_pricing_orders.sql
-- 이 처음부터 coupons.id 를 uuid 로 만들므로 이 가드는 통과한다.
-- ---------------------------------------------------------------------
do $$
declare
  v_type text;
begin
  select c.data_type into v_type
    from information_schema.columns c
   where c.table_schema = 'public' and c.table_name = 'coupons' and c.column_name = 'id';

  if v_type is null then
    raise exception 'public.coupons 가 없다 — sql/10_pricing_orders.sql 을 먼저 실행하세요.';
  end if;
  if v_type <> 'uuid' then
    raise exception 'coupons.id 가 아직 % 다 — sql/56_surrogate_uuid_keys.sql 을 먼저 적용하세요.', v_type;
  end if;
end $$;

-- ---------------------------------------------------------------------
-- 0) coupons.max_uses_per_user : 쿠폰별 1인당 사용 가능 횟수.
--    NULL = 무제한 규약. 이 프로젝트는 이미 program_access.expires_at
--    NULL=무기한, coupons.valid_until NULL=무기한 을 쓰고 있어 같은 의미를
--    다른 표현(0, -1, 'infinity')으로 새로 만들지 않고 그대로 따른다. 0 은
--    "쓸 수 없음"이라는 제3의 의미가 되어 혼란만 만들므로 CHECK 로 막는다.
--
--    2026-08-11 P2-6 정정 — 컬럼 기본값을 (DEFAULT 없음 = NULL) 에서 1로
--    뒤집었다. 어드민 UI 가 없어 운영자가 Supabase Studio 에서 이 컬럼을
--    직접 채우는데, DEFAULT 가 NULL(무제한)이면 값을 깜빡 빼먹은 신규
--    쿠폰이 곧바로 무제한 쿠폰이 된다 — 위험한 쪽이 기본값이면 안 된다.
--    "상시 할인" 처럼 진짜 무제한을 의도하는 쿠폰만 이제 NULL 을 명시적으로
--    채워야 한다. DEFAULT 변경은 이후의 INSERT 에만 적용되고 기존 행의
--    저장값은 절대 바꾸지 않는다(over40k-3000/over80k-5000 은 그대로 NULL,
--    signup-6000 은 아래 UPDATE 로 그대로 1 유지) — 그래서 이 한 줄만으로
--    기존 3행에 회귀가 없다.
-- ---------------------------------------------------------------------
alter table public.coupons
  add column if not exists max_uses_per_user integer;

alter table public.coupons
  drop constraint if exists coupons_max_uses_per_user_check;
alter table public.coupons
  add constraint coupons_max_uses_per_user_check
  check (max_uses_per_user is null or max_uses_per_user > 0);

alter table public.coupons
  alter column max_uses_per_user set default 1;

comment on column public.coupons.max_uses_per_user is
  '1인당 사용 가능 횟수. 기본값 1(사용자당 1회, 2026-08-11 P2-6). NULL = 무제한(상시 할인 쿠폰, 반드시 명시적으로 채워야 한다). 양의 정수 N = 사용자당 N회까지. 0/음수는 CHECK 로 금지.';

-- 시드값 (사용자 확정, 2026-08-11): signup 계열(회원가입 축하, 1인 1회)만
-- 명시적으로 1을 채운다. over40k-3000/over80k-5000 은 원래도 NULL(무제한)
-- 이었고 DEFAULT 변경이 기존 행을 건드리지 않으므로 별도 UPDATE 불필요.
-- 지목은 slug 로 한다 — id 는 이제 uuid 대체키라 리터럴로 쓸 수 없다
-- (sql/56_surrogate_uuid_keys.sql). slug 는 'signup-2000'(실제 할인액 반영).
update public.coupons set max_uses_per_user = 1
  where slug = 'signup-2000' and max_uses_per_user is distinct from 1;

-- ---------------------------------------------------------------------
-- 0-b) coupons.max_redemptions : 쿠폰 전체 발행량 상한 (P1-6, 2026-08-11).
--    NULL = 무제한(기존 3쿠폰 전부 여기 해당 — 하드닝 이전과 동일 동작).
--    사용자 무관 카운트라 게스트(user_id NULL) 사용도 이 상한에 걸린다 —
--    "선착순 N명" 이벤트를 표현할 유일한 손잡이가 지금까지 없었다(Stripe 의
--    max_redemptions/times_redeemed 와 같은 역할). 소진 판정은 2-b)절
--    fn_coupon_global_redeemed 가 전담한다(fn_coupon_is_redeemed 와 같은
--    "실시간 조인 평가" 설계 — 별도 카운터 컬럼을 두면 이중 기록이 되어
--    coupon_redemptions 와 어긋날 수 있다).
-- ---------------------------------------------------------------------
alter table public.coupons
  add column if not exists max_redemptions integer;
alter table public.coupons
  drop constraint if exists coupons_max_redemptions_check;
alter table public.coupons
  add constraint coupons_max_redemptions_check
  check (max_redemptions is null or max_redemptions > 0);

comment on column public.coupons.max_redemptions is
  '쿠폰 전체 발행량 상한(사용자 무관, 게스트 포함). NULL = 무제한. fn_coupon_global_redeemed 가 이 값과 coupon_redemptions 건수를 비교해 판정한다.';

-- ---------------------------------------------------------------------
-- 0-c) coupons.stackable : 다른 쿠폰과 동시 적용 가능 여부 (P1-8, 2026-08-11).
--    기본 false — Shopify 공식이 "결합은 기본 꺼짐, 할인마다 수동 설정"인
--    것과 같은 방향이다. 기존 3쿠폰은 전부 이 기본값을 받으므로, 여러 장을
--    동시에 선택해도 하나만 적용된다(4)절 fn_redeem_coupons 정산 로직).
--    지금까지 안 터진 건 dev 쿠폰들의 min_amount 조건이 자연히 겹치지 않아
--    보였을 뿐, subtotal 이 80,000원을 넘으면 signup-6000 + over80k-5000 이
--    동시 eligible 이라 실제로는 이미 결합 가능한 상태였다.
-- ---------------------------------------------------------------------
alter table public.coupons
  add column if not exists stackable boolean not null default false;

comment on column public.coupons.stackable is
  '다른 쿠폰과 동시 적용 가능 여부. false(기본) = 비결합 — 같은 주문에 비결합 쿠폰이 여럿 선택되면 그중 할인액이 가장 큰 1장만 적용한다. true = stacking 대상에서 제외하고 항상 함께 적용한다.';

-- ---------------------------------------------------------------------
-- 0-d) orders.status CHECK (P1-5, 2026-08-11).
--    허용값은 지금까지 주석에만 있는 계약이었다(sql/10_pricing_orders.sql:47,
--    api/confirm-payment.js:18, api/toss-webhook.js:41 세 곳이 각자 같은
--    문장을 반복해 적어 두고 있었다 — 누군가 'refunded' 같은 새 값을
--    들여오면 이 파일의 모든 판정(fn_coupon_is_redeemed 의 상태 블랙리스트
--    포함)이 조용히 깨진다). sql/10 은 이미 적용된 파일이라 소급 수정
--    대신 coupons.max_uses_per_user 를 다룬 것과 같은 패턴으로 여기서
--    ALTER 로 보강한다. 적용 전 dev 실측: orders 1행, status='paid' — 위반 없음.
-- ---------------------------------------------------------------------
alter table public.orders
  drop constraint if exists orders_status_check;
alter table public.orders
  add constraint orders_status_check
  check (status in ('pending', 'paid', 'waiting_deposit', 'failed', 'canceled'));

-- ---------------------------------------------------------------------
-- 1) coupon_redemptions : 쿠폰 사용 이력 (어떤 쿠폰이 어떤 사용자의 어떤
--    주문에 쓰였는지). orders 와 조인해 소진을 판정하므로 order_id 필수.
-- ---------------------------------------------------------------------
create table if not exists public.coupon_redemptions (
  id              bigint generated always as identity primary key,
  -- uuid — coupons.id 가 대체키로 바뀌었다(sql/56_surrogate_uuid_keys.sql).
  -- 이미 이 테이블이 존재하는 DB 에서는 이 CREATE 가 no-op 이고, 컬럼 타입
  -- 전환은 56 의 2-e)절이 수행한다. 삭제 규칙(cascade)은 아래 1-c)절이
  -- restrict 로 덮는다 — 여기 리터럴은 신규 생성 시의 초기값일 뿐이다.
  coupon_id       uuid not null references public.coupons (id) on delete cascade,
  -- nullable: 비회원(guest) 결제는 안정적 식별자가 없어 사용 횟수 제한을
  -- 적용할 수 없다(orders.user_id 도 이미 nullable — 같은 한계를 그대로
  -- 물려받는다). guest 는 fn_coupon_is_redeemed 판정에서 항상 "미소진"으로
  -- 취급된다(아래 함수 참고) — 기존에도 guest 에게는 아무 제한이 없었으므로
  -- 회귀가 아니다.
  user_id         uuid references auth.users (id) on delete cascade,
  order_id        text not null references public.orders (id) on delete cascade,
  -- 적용 당시 실제 할인액(감사·표시용). coupons.discount_amount 를 나중에
  -- 관리자가 바꿔도 과거 주문의 할인 내역은 이 값으로 고정 보존된다.
  discount_amount integer not null,
  created_at      timestamptz not null default now()
  -- voided_at/void_reason 은 1-b)절에서 추가한다(이 CREATE 문 자체는 dev 에
  -- 이미 적용돼 idempotent 가드로 no-op 이라 여기 직접 넣지 않고 ALTER 로
  -- 보강한다 — 위 orders.status CHECK 와 같은 이유).
);

-- 소진 판정 조인(coupon_id, user_id)과 만료 시간창(created_at) 조회 경로.
create index if not exists coupon_redemptions_coupon_user_idx
  on public.coupon_redemptions (coupon_id, user_id) where user_id is not null;
-- 어드민 복구(주문 기준으로 redemption 찾기) · order_items 와 대칭되는 인덱스.
create index if not exists coupon_redemptions_order_idx
  on public.coupon_redemptions (order_id);

comment on table public.coupon_redemptions is
  '쿠폰 사용 이력. 소진 여부는 이 테이블 단독이 아니라 orders.status 와 조인해 판정 시점에 평가한다(fn_coupon_is_redeemed) — sql/55_coupon_policy.sql 상단 주석 참고. voided_at 이 NULL 이 아니면 판정에서 제외된다(관리자 명시적 취소, P1-4).';

-- ---------------------------------------------------------------------
-- 1-b) coupon_redemptions.voided_at/void_reason (P1-4, 2026-08-11).
--    "쿠폰 사용을 되돌린다"는 지금까지 Studio 에서 행을 DELETE 하는
--    방식으로만 상정돼 있었다(이 파일 상단 옛 주석 — 정정 완료). 삭제는
--    되돌린 사실 자체를 지워 감사 근거가 사라진다. 되돌림은 여기부터는
--    UPDATE(voided_at = now()) 로만 한다 — 판정 함수(2)절)가
--    voided_at is null 인 행만 "살아있는 사용"으로 센다.
-- ---------------------------------------------------------------------
alter table public.coupon_redemptions
  add column if not exists voided_at timestamptz;
alter table public.coupon_redemptions
  add column if not exists void_reason text;

comment on column public.coupon_redemptions.voided_at is
  '관리자가 이 쿠폰 사용을 명시적으로 무효화한 시각. NULL = 유효(정상 소진으로 집계됨). 절대 행을 DELETE 하지 않는다 — 이 컬럼으로 되돌린다(P1-4).';
comment on column public.coupon_redemptions.void_reason is
  '무효화 사유(자유 텍스트, 관리자 기입). voided_at 이 NULL 이면 의미 없음.';

-- ---------------------------------------------------------------------
-- 1-c) coupon_redemptions/orders 의 FK 삭제 규칙 강화 (P1-4, 2026-08-11).
--    기존: coupon_redemptions 의 coupon_id/user_id/order_id 세 FK가 전부
--    ON DELETE CASCADE — Studio 에서 coupons 행 하나를 지우면 그 쿠폰의
--    사용 이력이 통째로 사라졌다(부가세·매출 정산, 카드사 분쟁에 제시할
--    근거가 없어진다). orders_coupon_id_fkey 는 ON DELETE SET NULL 로
--    이미 비대칭이었다(실측: confdeltype 'n'/'c' 혼재).
--
--    새 규칙 — 컬럼 성격별로 다르게 정한다(하나로 통일하지 않는다):
--      · coupon_redemptions.coupon_id  : CASCADE → RESTRICT.
--        이 행 자체가 "이 쿠폰이 쓰였다"는 감사 사실이라 쿠폰이 지워진다고
--        같이 사라지면 안 된다. 삭제하려면 먼저 이력을 정리해야 하므로
--        관리자가 실수로 지우는 걸 DB가 막아준다(비활성화는 is_active=false
--        로 계속 가능 — 삭제 자체를 막을 뿐 운영 흐름은 그대로다).
--      · coupon_redemptions.order_id   : CASCADE → RESTRICT.
--        order_id 는 NOT NULL 이라 SET NULL 이 불가능하고, 이 행은 애초에
--        "그 주문에" 쿠폰이 얼마 적용됐는지의 기록이라 order 없이는 의미가
--        없다 — order 를 지우려면 먼저 redemption 을 정리해야 한다.
--      · coupon_redemptions.user_id    : CASCADE 유지가 아니라 SET NULL.
--        RESTRICT 로 막으면 계정 삭제(회원 탈퇴, 개인정보 삭제 요청)가
--        쿠폰 이력 때문에 아예 불가능해진다 — orders.user_id 가 이미
--        SET NULL(auth.users FK)을 쓰는 것과 같은 패턴을 그대로 따른다.
--        행 자체(할인액·주문 연결)는 남고 "누구였는지"만 비게 된다.
--      · orders.coupon_id              : SET NULL → RESTRICT.
--        "참고용" 컬럼이라도(파일 상단 절 참고) 실제 사용 이력이 있는
--        쿠폰이라면 coupon_redemptions 와 같은 원칙(삭제 대신 비활성화)을
--        적용한다 — 비대칭을 없앤다.
--    영향 확인: api/·src/ 어디에도 orders/coupons 를 DELETE 하는 코드가
--    없다(grep 실측) — 애플리케이션 코드 경로는 전혀 영향받지 않고, 오직
--    Studio 에서의 수동 삭제 시도만 이제 막힌다(그 경우도 위 voided_at 로
--    되돌리면 삭제할 이유 자체가 없어진다).
-- ---------------------------------------------------------------------
alter table public.coupon_redemptions
  drop constraint if exists coupon_redemptions_coupon_id_fkey;
alter table public.coupon_redemptions
  add constraint coupon_redemptions_coupon_id_fkey
  foreign key (coupon_id) references public.coupons (id) on delete restrict;

alter table public.coupon_redemptions
  drop constraint if exists coupon_redemptions_order_id_fkey;
alter table public.coupon_redemptions
  add constraint coupon_redemptions_order_id_fkey
  foreign key (order_id) references public.orders (id) on delete restrict;

alter table public.coupon_redemptions
  drop constraint if exists coupon_redemptions_user_id_fkey;
alter table public.coupon_redemptions
  add constraint coupon_redemptions_user_id_fkey
  foreign key (user_id) references auth.users (id) on delete set null;

alter table public.orders
  drop constraint if exists orders_coupon_id_fkey;
alter table public.orders
  add constraint orders_coupon_id_fkey
  foreign key (coupon_id) references public.coupons (id) on delete restrict;

alter table public.coupon_redemptions enable row level security;

drop policy if exists "coupon_redemptions select own" on public.coupon_redemptions;
create policy "coupon_redemptions select own" on public.coupon_redemptions
  for select using (auth.uid() = user_id);

-- ---------------------------------------------------------------------
-- 1-d) 어드민 조회/취소(void) 경로 (P1-4, 2026-08-11 정정).
--    이전엔 "coupon_redemptions admin manage" 하나로 for all(= select/
--    insert/update/delete 전부)을 열어, program_access 사건(관리자 복구
--    경로가 아예 없어 서비스 롤 키 없이는 복구 불가능했던 전례)을 반복하지
--    않으려 했다. 그런데 for all 은 DELETE 까지 열어버려 바로 위에서 막은
--    "삭제로 이력이 사라지는" 문제를 RLS 층에서 다시 열어주는 모순이었다.
--    select/update 두 개로 쪼개고 delete 정책은 아예 만들지 않는다 —
--    정책이 없는 커맨드는 RLS 기본값이 거부이므로 anon/authenticated 경로
--    (PostgREST, 향후 Admin.jsx 화면)로는 관리자도 이 테이블 행을 지울 수
--    없다. (Supabase Studio 대시보드 자체는 postgres 롤로 접속해 RLS를
--    우회한다 — 그건 이 정책으로 막을 수 있는 층이 아니다. Studio 에서
--    되돌릴 땐 DELETE 대신 `update coupon_redemptions set voided_at = now(),
--    void_reason = '...' where id = :id` 를 실행하는 것이 새 운영 규약이다.)
-- ---------------------------------------------------------------------
drop policy if exists "coupon_redemptions admin manage" on public.coupon_redemptions;
drop policy if exists "coupon_redemptions admin select" on public.coupon_redemptions;
drop policy if exists "coupon_redemptions admin update" on public.coupon_redemptions;

create policy "coupon_redemptions admin select" on public.coupon_redemptions
  for select using (public.is_admin());

create policy "coupon_redemptions admin update" on public.coupon_redemptions
  for update using (public.is_admin()) with check (public.is_admin());

-- 1-e) signup-6000 개명(P1-2)은 sql/56_surrogate_uuid_keys.sql 이 해소했다 —
-- 파일 상단 "P1-2 해소" 절 참고. 쿠폰 지목은 이제 slug('signup-2000') 다.

-- ---------------------------------------------------------------------
-- 1-f) 전환 이전(text 쿠폰 식별자) 시그니처 정리 — 반드시 아래 함수 생성보다
--    먼저 실행돼야 한다.
--
--    uuid 전환(sql/56_surrogate_uuid_keys.sql)으로 쿠폰 식별자를 받는 인자·
--    반환 타입이 text → uuid 로 바뀌었다. PostgreSQL 은 인자 타입이 다르면
--    CREATE OR REPLACE 가 아니라 **새 오버로드**를 만들고(이 파일 상단
--    "함수 시그니처가 바뀌는 항목" 절에서 dev 로 직접 재현한 그 동작),
--    반환 컬럼 타입이 바뀌면 REPLACE 자체를 거부한다("cannot change return
--    type of existing function").
--
--    오버로드가 남는 것은 단순한 잔재가 아니라 사고 경로다:
--      · fn_redeem_coupons 가 text[] 판과 uuid[] 판 두 벌 존재하면, PostgREST
--        가 받은 JSON 문자열 배열은 양쪽 모두에 캐스팅 가능해 어느 쪽이
--        선택될지 호출자가 통제할 수 없다(구 판이 뽑히면 uuid 컬럼과 text
--        비교로 실패하거나, 최악의 경우 옛 판정 로직으로 주문이 생긴다).
--      · fn_usable_coupons/fn_coupon_by_code/fn_revalidate_order_coupons 는
--        시그니처가 그대로이고 반환 컬럼 타입만 바뀌므로 DROP 없이는 아예
--        갱신되지 않는다.
--    그래서 구 시그니처를 전부 명시적으로 DROP 한다. 빈 DB 에서는 전부
--    no-op 이다(if exists). DROP 후 반드시 pg_proc.proacl 로 권한을
--    재확인한다(파일 맨 끝 확인용 조회).
-- ---------------------------------------------------------------------
drop function if exists public.fn_coupon_is_redeemed(text, uuid, timestamptz);
drop function if exists public.fn_coupon_is_redeemed(text, uuid, timestamptz, text);
drop function if exists public.fn_coupon_global_redeemed(text, timestamptz);
drop function if exists public.fn_coupon_global_redeemed(text, timestamptz, text);
drop function if exists public.fn_coupon_by_code(text, integer);
drop function if exists public.fn_revalidate_order_coupons(text);
drop function if exists public.fn_redeem_coupons(text, uuid, text, text, jsonb, integer, integer, text[]);

-- ---------------------------------------------------------------------
-- 1-g) fn_void_coupon_redemption : 관리자 전용 취소(void) RPC (P1-4,
--    2026-08-11). 1-d)절 RLS(admin select/update)만으로도 인증된 관리자는
--    voided_at 을 직접 UPDATE 할 수 있지만, 향후 만들어질 어드민
--    "쿠폰관리" 화면이 호출하기엔 단일 RPC 가 더 다루기 쉽다(입력 검증 +
--    "이미 무효화된 행"과 "존재하지 않는 행"을 구분한 에러 + 갱신된 행을
--    한 번에 돌려준다). SECURITY DEFINER 로 RLS 를 우회하므로 is_admin()
--    을 함수 내부에서 직접 검사한다(RLS 정책과 별개의 게이트). 절대 DELETE
--    하지 않는다 — voided_at 만 UPDATE 한다(파일 상단 P1-4 절 원칙).
-- ---------------------------------------------------------------------
create or replace function public.fn_void_coupon_redemption(
  p_redemption_id bigint,
  p_reason        text default null
)
returns public.coupon_redemptions
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_row public.coupon_redemptions;
begin
  if not public.is_admin() then
    raise exception 'not_authorized' using errcode = '42501';
  end if;

  update public.coupon_redemptions
     set voided_at   = now(),
         void_reason = p_reason
   where id = p_redemption_id
     and voided_at is null
  returning * into v_row;

  if v_row.id is null then
    raise exception 'redemption_not_found_or_already_voided' using errcode = 'WC002';
  end if;

  return v_row;
end;
$$;

comment on function public.fn_void_coupon_redemption(bigint, text) is
  '관리자 전용. 쿠폰 사용 이력 1건을 명시적으로 무효화(voided_at=now())한다 — 절대 DELETE 하지 않는다. 이미 무효화됐거나 존재하지 않으면 errcode=WC002. 관리자가 아니면 errcode=42501.';

revoke all on function public.fn_void_coupon_redemption(bigint, text) from public, anon;
grant execute on function public.fn_void_coupon_redemption(bigint, text) to authenticated, service_role;

-- ---------------------------------------------------------------------
-- 2) fn_coupon_is_redeemed : 소진 판정 내부 헬퍼 (fn_usable_coupons /
--    fn_coupon_by_code / fn_redeem_coupons / fn_revalidate_order_coupons
--    공용 — 상태 블랙리스트와 시간창을 한 곳에서만 관리한다). 클라이언트가
--    직접 부를 이유가 없다(임의 user_id 로 남의 사용 이력을 캐물을 수
--    있다) — anon/authenticated 에 grant 하지 않는다. SECURITY DEFINER 라
--    이 함수를 호출하는 상위 함수의 실행 컨텍스트(정의자 권한)에서는 이
--    revoke 와 무관하게 정상 호출된다.
--
--    p_coupon_id 는 uuid 다(sql/56_surrogate_uuid_keys.sql 전환 반영).
--    구 text 시그니처는 위 1-f)절이 DROP 한다.
--
--    2026-08-11 하드닝 — 세 가지를 바꿨다:
--      · P0-1: "미소진임이 확실한 경우"만 열거하는 블랙리스트로 뒤집었다
--        (파일 상단 "소진 판정" 절 참고) — status='failed', 또는
--        status='pending' 이면서 30분 시간창 밖인 경우만 미소진이고 나머지
--        전부(paid/waiting_deposit/canceled/시간창 내 pending/미지의 상태)
--        는 소진으로 센다.
--      · P1-4: voided_at is null 조건 추가 — 관리자가 명시적으로 되돌린
--        사용 이력은 카운트에서 빠진다.
--      · P0-2: 4번째 인자 p_exclude_order_id 를 추가했다. 결제 승인
--        재검증(3-c) fn_revalidate_order_coupons)이 "이 주문 자신의
--        redemption 행 때문에 이 주문 자신이 막히는" 자기참조를 피하려면
--        그 행을 카운트에서 빼야 한다. 인자를 그냥 덧붙이면 REPLACE 가 아니라
--        새 오버로드가 생겨 기존 3-인자 호출이 옛 로직 그대로 남으므로(이
--        dev 프로젝트에서 직접 재현·확인함), 아래에서 DROP 후 CREATE 한다.
--      · P3: 존재하지 않는 coupon_id 로 호출되면 이전엔 c CTE 가 0행이라
--        전체 쿼리가 NULL 을 반환했다(= fail-open, 호출측 IF 문에서 NULL 은
--        "거짓"으로 취급돼 소진 아님으로 새 나갔다). coalesce(..., true) 로
--        모르는 쿠폰은 fail-closed(소진 취급)로 막는다 — 이 파일의 P0-1
--        원칙("모르는 상태는 소진")과 동일하다.
-- ---------------------------------------------------------------------
create or replace function public.fn_coupon_is_redeemed(
  p_coupon_id         uuid,
  p_user_id           uuid,
  p_at                timestamptz default now(),
  p_exclude_order_id  text default null
)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce(
    (
      with c as (
        select max_uses_per_user
        from public.coupons
        where id = p_coupon_id
      ),
      used as (
        select count(*) as cnt
        from public.coupon_redemptions cr
        join public.orders o on o.id = cr.order_id
        where cr.coupon_id = p_coupon_id
          and p_user_id is not null
          and cr.user_id = p_user_id
          and cr.voided_at is null
          and (p_exclude_order_id is null or cr.order_id <> p_exclude_order_id)
          and not (
            o.status = 'failed'
            or (o.status = 'pending' and cr.created_at < p_at - interval '30 minutes')
          )
      )
      select
        p_user_id is not null
        and c.max_uses_per_user is not null
        and used.cnt >= c.max_uses_per_user
      from c, used
    ),
    true
  );
$$;

revoke all on function public.fn_coupon_is_redeemed(uuid, uuid, timestamptz, text)
  from public, anon, authenticated;
grant execute on function public.fn_coupon_is_redeemed(uuid, uuid, timestamptz, text) to service_role;

-- ---------------------------------------------------------------------
-- 2-b) fn_coupon_global_redeemed : 전체 발행량(max_redemptions) 소진 판정
--    (P1-6, 2026-08-11). fn_coupon_is_redeemed 와 같은 상태 블랙리스트·
--    voided_at·exclude_order_id 규칙을 쓰되 user_id 조건이 없다 — 게스트를
--    포함해 그 쿠폰의 "살아있는" 사용 전체를 센다. 로직을 fn_coupon_is_
--    redeemed 안에 합치지 않고 별도 함수로 둔 이유: 두 함수는 서로 다른
--    카운트(사용자별 vs 전체)를 비교하는 서로 다른 컬럼(max_uses_per_user
--    vs max_redemptions)에 대해 판단해 하나로 합치면 분기가 더 읽기
--    어려워진다 — 대신 상태 판정 리터럴은 동일하게 맞춰 드리프트를 막는다.
-- ---------------------------------------------------------------------
create or replace function public.fn_coupon_global_redeemed(
  p_coupon_id         uuid,
  p_at                timestamptz default now(),
  p_exclude_order_id  text default null
)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce(
    (
      with c as (
        select max_redemptions
        from public.coupons
        where id = p_coupon_id
      ),
      used as (
        select count(*) as cnt
        from public.coupon_redemptions cr
        join public.orders o on o.id = cr.order_id
        where cr.coupon_id = p_coupon_id
          and cr.voided_at is null
          and (p_exclude_order_id is null or cr.order_id <> p_exclude_order_id)
          and not (
            o.status = 'failed'
            or (o.status = 'pending' and cr.created_at < p_at - interval '30 minutes')
          )
      )
      select
        c.max_redemptions is not null
        and used.cnt >= c.max_redemptions
      from c, used
    ),
    true
  );
$$;

revoke all on function public.fn_coupon_global_redeemed(uuid, timestamptz, text)
  from public, anon, authenticated;
grant execute on function public.fn_coupon_global_redeemed(uuid, timestamptz, text) to service_role;

-- ---------------------------------------------------------------------
-- 3) fn_usable_coupons : 사용 가능 쿠폰 목록 (클라이언트 + 서버 공용 조회).
--
--    2026-08-11 P1-1 하드닝 — 이 함수는 SECURITY DEFINER + anon/
--    authenticated grant 인데 is_active 필터가 없어, RLS "coupons public
--    read"(is_active=true) 가 감추는 비활성 행을 anon 에게 그대로
--    노출했다. 게다가 c.code 를 반환해, 미출시 프로모션을 is_active=false
--    로 등록해두면 인증 없이 `rpc/fn_usable_coupons {"p_subtotal":0}` 한
--    번으로 코드와 전 조건을 얻을 수 있었다(지금 dev 쿠폰 3장이 전부
--    code IS NULL 이라 안 터졌을 뿐이다). 그래서:
--      · code 컬럼을 반환에서 뺐다 — 코드 조회 전용 함수(3-b)로 분리한다.
--      · is_active=false 행을 WHERE 로 제외한다. Checkout.jsx 의
--        visibleCoupons 가 이미 isActive 로 걸러 화면에 안 보였으므로
--        화면 회귀는 없다(applyCouponCode 의 코드 조회 경로는 이 함수가
--        아니라 3-b)를 쓰도록 API/클라이언트 쪽에서 바뀌어야 한다 — 팀
--        보고 참고). is_active=false 행이 사라지므로 reason='inactive' 는
--        이 함수에서는 더 이상 나오지 않는다(코드 전용 함수 3-b)에서는
--        여전히 나올 수 있다 — 아래 참고).
--      · P1-6/P1-7 판정을 추가해 reason 에 sold_out/login_required 가
--        늘었다.
--    반환 컬럼이 바뀌므로(code 제거) CREATE OR REPLACE 로 반환 타입을 바꿀
--    수 없다(cannot change return type of existing function, 이 dev
--    프로젝트에서 직접 재현·확인함) — DROP 후 CREATE 한다.
-- ---------------------------------------------------------------------
drop function if exists public.fn_usable_coupons(integer);

create or replace function public.fn_usable_coupons(p_subtotal integer default 0)
returns table (
  -- uuid (sql/56_surrogate_uuid_keys.sql 전환). 반환 컬럼은 늘리지 않았다 —
  -- slug 를 함께 돌려주면 편하겠지만, 이 함수는 anon 에 열려 있는 판정
  -- 전용 창구이고 화면(Checkout.jsx)은 id 를 불투명한 선택 키로만 쓴다.
  -- 어드민처럼 사람이 읽는 핸들이 필요한 소비자는 coupons 테이블을 직접
  -- 조회한다(그쪽은 RLS 로 통제된다).
  id              uuid,
  title           text,
  discount_amount integer,
  min_amount      integer,
  valid_until     date,
  is_active       boolean,
  eligible        boolean,
  reason          text
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_user_id uuid := auth.uid();
  -- date 캐스팅 전 KST 로 변환 — UTC 자정~09시 구멍(팀 리드 지시 배경 절)
  -- 방어. 명명 타임존을 쓰고 `+ interval '9 hours'` 는 쓰지 않는다.
  v_today   date := (now() at time zone 'Asia/Seoul')::date;
begin
  return query
  select
    c.id,
    c.title,
    c.discount_amount,
    c.min_amount,
    c.valid_until,
    c.is_active,
    (
      c.is_active
      and (c.valid_until is null or c.valid_until >= v_today)
      and coalesce(p_subtotal, 0) >= c.min_amount
      and (c.max_uses_per_user is null or v_user_id is not null)
      and not chk.is_redeemed
      and not chk.is_sold_out
    ) as eligible,
    case
      when not c.is_active then 'inactive'
      when c.valid_until is not null and c.valid_until < v_today then 'expired'
      when coalesce(p_subtotal, 0) < c.min_amount then 'below_min_amount'
      when c.max_uses_per_user is not null and v_user_id is null then 'login_required'
      when chk.is_sold_out then 'sold_out'
      when chk.is_redeemed then 'already_used'
      else null
    end as reason
  from public.coupons c
  -- P3: fn_coupon_is_redeemed/fn_coupon_global_redeemed 를 행당 두 번씩
  -- (eligible 한 번, reason 한 번) 부르던 것을 LATERAL 로 한 번만 계산해
  -- eligible/reason 양쪽에서 재사용한다.
  cross join lateral (
    select
      public.fn_coupon_is_redeemed(c.id, v_user_id, now()) as is_redeemed,
      public.fn_coupon_global_redeemed(c.id, now()) as is_sold_out
  ) as chk
  where c.is_active = true
  -- P3: 할인액이 같은 쿠폰이 여럿이면 정렬이 안정적이지 않았다 — tie-break 를
  -- 추가한다. 전환 후에는 c.id 가 uuid(무작위)라 tie-break 로 쓰면 순서가
  -- 환경마다·재시드마다 달라진다 — c.slug 로 잡는다(유니크하므로 tie-break
  -- 로 충분하고, 전환 전 text id 정렬과 사실상 같은 순서가 나온다).
  order by c.discount_amount desc, c.slug;
end;
$$;

comment on function public.fn_usable_coupons(integer) is
  '쿠폰 판정 정본(활성 쿠폰만). eligible/reason(below_min_amount|expired|already_used|inactive|login_required|sold_out)을 붙여 반환 — inactive 는 구조상 이 함수에서는 나오지 않는다(is_active=false 행 자체를 제외). 코드는 반환하지 않는다 — fn_coupon_by_code 참고.';

revoke all on function public.fn_usable_coupons(integer) from public;
-- authenticated 뿐 아니라 anon 도 포함한다. api/create-order.js:115-123 이
-- "비회원 결제 허용" 이라 명시하고(userId=null 도 정상 흐름), Checkout.jsx
-- 의 기존 쿠폰 조회에도 로그인 게이트가 없었다 — anon 을 빼면 비회원
-- 결제자에게서 쿠폰 선택 기능 자체가 사라지는 회귀가 된다.
grant execute on function public.fn_usable_coupons(integer) to anon, authenticated, service_role;

-- ---------------------------------------------------------------------
-- 3-b) fn_coupon_by_code : 코드 직접 입력 조회 전용 (P1-1, 2026-08-11 신설).
--
--    fn_usable_coupons 에서 code 를 빼면서 생긴 빈자리다. 이 함수는 "코드를
--    입력으로만 받고 절대 code 컬럼을 반환하지 않는다" — 정확히 아는 코드
--    하나를 맞혔는지 확인하는 단일 조회라 fn_usable_coupons 의 취약점
--    (무인증으로 전체 목록·코드를 한 번에 덤프)과는 위협 모델이 다르다(공격
--    표면이 "코드 하나 추측"으로 줄어든다 — 인증 없는 대량 코드 스캔은 여전히
--    막혀 있고, 개별 코드 추측을 완전히 막으려면 별도 rate limit 이 필요한데
--    이 파일(DB 함수) 범위 밖이다).
--    is_active=false 쿠폰도 code 로 정확히 맞히면 계속 반환한다(reason=
--    'inactive') — applyCouponCode 의 기존 UX("코드는 인식됐지만 지금은
--    조건 미충족")를 그대로 유지하기 위해서다. 로그인 게이트(P1-7)와
--    전체 발행량(P1-6) 판정도 fn_usable_coupons 와 동일하게 적용한다.
-- ---------------------------------------------------------------------
-- 반환 컬럼 id 가 text → uuid 로 바뀌어 REPLACE 가 거부된다. DROP 은 위
-- 1-f)절이 한다(구 시그니처 정리와 같은 사안이라 한 곳에 모았다).
create or replace function public.fn_coupon_by_code(p_code text, p_subtotal integer default 0)
returns table (
  id              uuid,
  title           text,
  discount_amount integer,
  min_amount      integer,
  valid_until     date,
  is_active       boolean,
  eligible        boolean,
  reason          text
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_user_id uuid := auth.uid();
  v_today   date := (now() at time zone 'Asia/Seoul')::date;
  v_code    text := lower(trim(coalesce(p_code, '')));
begin
  if v_code = '' then
    return;
  end if;

  return query
  select
    c.id,
    c.title,
    c.discount_amount,
    c.min_amount,
    c.valid_until,
    c.is_active,
    (
      c.is_active
      and (c.valid_until is null or c.valid_until >= v_today)
      and coalesce(p_subtotal, 0) >= c.min_amount
      and (c.max_uses_per_user is null or v_user_id is not null)
      and not chk.is_redeemed
      and not chk.is_sold_out
    ) as eligible,
    case
      when not c.is_active then 'inactive'
      when c.valid_until is not null and c.valid_until < v_today then 'expired'
      when coalesce(p_subtotal, 0) < c.min_amount then 'below_min_amount'
      when c.max_uses_per_user is not null and v_user_id is null then 'login_required'
      when chk.is_sold_out then 'sold_out'
      when chk.is_redeemed then 'already_used'
      else null
    end as reason
  from public.coupons c
  cross join lateral (
    select
      public.fn_coupon_is_redeemed(c.id, v_user_id, now()) as is_redeemed,
      public.fn_coupon_global_redeemed(c.id, now()) as is_sold_out
  ) as chk
  where c.code is not null
    and lower(c.code) = v_code
  limit 1;
end;
$$;

comment on function public.fn_coupon_by_code(text, integer) is
  '코드 직접 입력 조회 전용. code 를 입력으로만 받고 반환하지 않는다(P1-1). 못 찾으면 0행 — 클라이언트는 이를 "유효하지 않은 쿠폰 코드"로 안내한다.';

revoke all on function public.fn_coupon_by_code(text, integer) from public;
grant execute on function public.fn_coupon_by_code(text, integer) to anon, authenticated, service_role;

-- ---------------------------------------------------------------------
-- 3-c) fn_revalidate_order_coupons : 결제 승인 직전 재검증 (P0-2, 2026-08-11
--    신설). api/confirm-payment.js 에 "coupon" 문자열이 0번 등장한다(grep
--    실측) — 30분 소프트 홀드가 풀린 뒤 결제해도 아무도 막지 않아, 같은
--    쿠폰이 서로 다른 두 paid 주문에 붙을 수 있었다(시나리오는 팀 보고 참고).
--    이 함수는 특정 주문(p_order_id)에 이미 붙어 있는 쿠폰 귀속들이 "지금도"
--    유효한지 판정한다 — 그 주문 자신의 redemption 행은 카운트에서 제외해야
--    "자기 자신 때문에 자기가 막히는" 자기참조 오류를 피한다(fn_coupon_is_
--    redeemed/fn_coupon_global_redeemed 의 p_exclude_order_id 인자가 이걸
--    위해 있다).
--
--    service_role 전용 — 호출측(api/confirm-payment.js, 이 함수 밖의 다른
--    에이전트 담당)이 토스 승인 API를 부르기 직전에 호출해, ok=false 행이
--    하나라도 있으면 승인을 진행하지 않고 사용자에게 안내해야 한다. 실패한
--    쿠폰 id 를 그대로 반환해 어떤 쿠폰이 문제인지 호출측이 알 수 있다.
--    비회원 주문(user_id NULL)은 애초에 사용 횟수 제한이 걸리지 않으므로
--    (guest 는 fn_coupon_is_redeemed 가 항상 false) 항상 ok=true 로 통과한다
--    — 전체 발행량(max_redemptions) 판정은 게스트에도 걸리므로 그 경우는
--    ok=false 가 나올 수 있다(의도된 동작).
-- ---------------------------------------------------------------------
-- 반환 컬럼 coupon_id 가 text → uuid. DROP 은 위 1-f)절이 한다.
-- 호출측(api/confirm-payment.js)은 이 값을 응답 필드 couponId 로 그대로
-- 실어 보낼 뿐 문자열로 가공하지 않으므로 코드 변경이 필요 없다.
create or replace function public.fn_revalidate_order_coupons(p_order_id text)
returns table (
  coupon_id uuid,
  ok        boolean,
  reason    text
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user_id uuid;
  v_now     timestamptz := now();
begin
  select o.user_id into v_user_id
    from public.orders o
   where o.id = p_order_id;

  return query
  select
    cr.coupon_id,
    not (
      public.fn_coupon_is_redeemed(cr.coupon_id, v_user_id, v_now, p_order_id)
      or public.fn_coupon_global_redeemed(cr.coupon_id, v_now, p_order_id)
    ) as ok,
    case
      when public.fn_coupon_is_redeemed(cr.coupon_id, v_user_id, v_now, p_order_id)
        then 'already_used'
      when public.fn_coupon_global_redeemed(cr.coupon_id, v_now, p_order_id)
        then 'sold_out'
      else null
    end as reason
  from public.coupon_redemptions cr
  where cr.order_id = p_order_id
    and cr.voided_at is null;
end;
$$;

comment on function public.fn_revalidate_order_coupons(text) is
  'service_role 전용. 결제 승인 직전 호출 — p_order_id 에 귀속된 쿠폰들이 지금도 유효한지, 그 주문 자신의 redemption 은 제외하고 재판정한다(P0-2). 행이 없으면 이 주문에 쿠폰이 없다는 뜻(통과). ok=false 행이 있으면 승인을 진행하지 않아야 한다.';

revoke all on function public.fn_revalidate_order_coupons(text)
  from public, anon, authenticated;
grant execute on function public.fn_revalidate_order_coupons(text) to service_role;

-- ---------------------------------------------------------------------
-- 4) fn_redeem_coupons : 서버 전용. 주문(orders/order_items) 생성과 쿠폰
--    귀속(coupon_redemptions)을 한 함수 호출 = 한 트랜잭션으로 묶는다.
--    "주문 생성이 실패하면 소진도 남지 않아야 한다"를 만족하는 가장 단순한
--    방법은 아예 같은 트랜잭션에 넣는 것이다 — orders insert 가 실패하면
--    (예: PK 충돌) 함수 전체가 롤백되어 coupon_redemptions 도 함께 사라진다.
--    subtotal/list_amount 는 호출측(api/create-order.js)이 products 테이블로
--    계산한 신뢰값을 받는다 — 이 함수는 금액을 재계산하지 않는다(과금
--    정본은 여전히 products.price 다). service_role 전용이라 클라이언트가
--    임의 금액을 실어 보낼 경로 자체가 없다.
--
--    2026-08-11 하드닝 — 입출력 시그니처(파라미터·반환 컬럼)는 그대로다.
--    내부 판정 로직만 바뀐다:
--      · P1-7: max_uses_per_user 가 있는(=사용 횟수 제한이 걸린) 쿠폰은
--        p_user_id 가 NULL(게스트)이면 건너뛴다 — 로그아웃 한 번으로 제한을
--        무력화하던 구멍을 막는다. 상시 할인(max_uses_per_user NULL)은
--        그대로 게스트에게 열려 있다(회귀 없음).
--      · P1-6: fn_coupon_global_redeemed 로 전체 발행량도 확인해 건너뛴다.
--        전체 발행량 판정을 게스트를 포함해 직렬화하려면 (coupon_id,
--        user_id) 쌍 락만으로는 부족해 쿠폰 단독 락을 추가했다(아래 락
--        절 참고).
--      · P1-8: stacking — 비결합(stackable=false) 쿠폰이 여럿 선택되면
--        할인액이 가장 큰 1장만 남기고 나머지는 적용하지 않는다(적용
--        목록에서 조용히 빠진다 — 예외를 던지지 않는다. 클라이언트는
--        반환된 applied_coupon_ids 와 자신이 보낸 p_coupon_ids 를 대조해
--        "어느 쿠폰이 왜 빠졌는지"를 안내할 수 있다).
--      · P1-8: 0원 주문 갇힘 — 쿠폰 할인 합이 소계와 같아지면(=결제 금액이
--        0원이 되면) 이전엔 통째로 invalid_amount 예외를 던져 사용자가
--        "어느 쿠폰을 빼야 하는지" 알 방법이 없었다. 이제 소계를 0으로
--        만드는 마지막 쿠폰(들)만 건너뛰고 나머지는 그대로 적용한다 —
--        전체 주문 실패는 상품 가격 자체가 0원인 경우(쿠폰과 무관)에만
--        최후 방어선으로 남는다. 토스 최소 결제금액은 1차 출처로 확인하지
--        못했다(미검증) — 임의 최소 금액 상수를 만들지 않고 "정확히
--        0원이 되지 않는다"만 보장한다.
--      · P3: errcode 부여 — api/create-order.js:129 가
--        redeemError.message === 'invalid_amount' 로 메시지 문자열을
--        비교하고 있었다(취약 — 메시지 문구가 바뀌면 조용히 깨진다).
--        errcode 'WC001' 을 붙였다 — 호출측은 이제 error.code === 'WC001'
--        로 판별해야 한다(메시지 문자열은 호환을 위해 그대로 둔다).
-- ---------------------------------------------------------------------
create or replace function public.fn_redeem_coupons(
  p_order_id      text,
  p_user_id       uuid,
  p_customer_email text,
  p_order_name    text,
  p_items         jsonb,    -- [{product_id, product_slug, service_key, name, list_price, price, quantity}]
                             -- product_id 는 uuid(products.id) 문자열, product_slug 는 구매 시점
                             -- 스냅샷(products.slug, 없으면 null 허용 — sql/56_surrogate_uuid_keys.sql
                             -- 3)절, 구 클라이언트 호환).
  p_list_amount   integer,
  p_subtotal      integer,  -- products 합산 판매가 (쿠폰 적용 전)
  -- uuid[] (sql/56_surrogate_uuid_keys.sql 전환). 클라이언트가 보내는
  -- couponIds 는 fn_usable_coupons/fn_coupon_by_code 가 준 uuid 문자열이고,
  -- PostgREST 가 JSON 문자열 배열을 uuid[] 로 캐스팅해 넘긴다 —
  -- api/create-order.js 는 값을 가공하지 않아 코드 변경이 필요 없다.
  -- 구 text[] 오버로드는 위 1-f)절이 DROP 한다(두 판이 공존하면 어느 쪽이
  -- 뽑히는지 호출자가 통제할 수 없다).
  p_coupon_ids    uuid[]
)
returns table (
  order_id           text,
  amount             integer,
  discount_amount    integer,
  coupon_discount    integer,
  applied_coupon_ids uuid[]
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_now              timestamptz := now();
  v_coupon           record;
  v_coupon_discount  integer := 0;
  v_applied_ids      uuid[] := '{}';
  v_applied_discounts integer[] := '{}';
  -- 후보 배열(P1-8 stacking 정산 전, 개별 판정을 통과한 쿠폰들).
  v_cand_ids         uuid[] := '{}';
  v_cand_discounts   integer[] := '{}';
  v_cand_stackable   boolean[] := '{}';
  v_best_nonstack_idx integer;
  v_i                integer;
  v_discount_total   integer;
  v_amount           integer;
  v_coupon_id_repr   uuid;
begin
  if p_order_id is null or p_subtotal is null or p_list_amount is null then
    raise exception 'order_id/list_amount/subtotal required';
  end if;

  -- 1) 쿠폰 판정 (DB 쓰기는 아직 없음 — 주문이 아직 존재하지 않아도 되는
  --    단계). coupons.slug 오름차순으로 순회해 advisory lock 순서를 고정한다
  --    (여러 쿠폰을 같이 담아도 두 트랜잭션이 서로 다른 순서로 잠그며
  --    맞물리는 데드락이 나지 않는다 — 위 파일 상단 "동시성" 절 참고).
  --    전환 전에는 id(text) 오름차순이었다. 데드락 방지에 필요한 것은 "모든
  --    트랜잭션이 동일한 전순서를 쓴다" 뿐이고 slug 는 유니크 NOT NULL 이라
  --    그 조건을 만족한다. uuid 대신 slug 를 쓰는 이유는 순회 순서가 곧
  --    stacking 동률 tie-break 우선순위(아래 2)/3)단계)이기 때문이다 —
  --    uuid 로 잡으면 그 우선순위가 환경마다 무작위로 달라지는데, slug 는
  --    전환 전 text id 순서를 그대로 물려받아 기존 동작이 보존된다.
  for v_coupon in
    select c.id, c.slug, c.discount_amount, c.min_amount, c.valid_until, c.is_active,
           c.max_uses_per_user, c.max_redemptions, c.stackable
    from public.coupons c
    where c.id = any (coalesce(p_coupon_ids, '{}'::uuid[]))
    order by c.slug
  loop
    -- P1-6: 쿠폰 단독 락. 전체 발행량 판정은 게스트를 포함해 모두 걸려야
    -- 하므로 (coupon_id, user_id) 쌍 락만으로는 서로 다른 사용자(또는
    -- user_id 가 없는 게스트끼리)의 동시 요청을 직렬화하지 못한다. 상한이
    -- 없는(max_redemptions is null) 쿠폰은 지킬 게 없어 락을 생략한다.
    -- ::text 캐스팅이 필수다 — hashtextextended 는 text 만 받고 uuid 는
    -- 암시적으로 캐스팅되지 않는다(전환 전 이 파일이 예고해 둔 수정 지점).
    if v_coupon.max_redemptions is not null then
      perform pg_advisory_xact_lock(hashtextextended(v_coupon.id::text, 1));
    end if;

    if p_user_id is not null then
      -- (coupon_id, user_id) 쌍을 트랜잭션 종료까지 잠근다. 같은 쌍을 노리는
      -- 동시 요청은 여기서 대기하고, 먼저 커밋된 트랜잭션의 redemption 이
      -- 아래 fn_coupon_is_redeemed 재판정에 반영된 뒤에야 통과 여부가
      -- 갈린다 — SERIALIZABLE 없이 READ COMMITTED 로도 이중 소진을 막는다.
      -- P3: 예전엔 `coupon_id || ':' || user_id` 로 문자열을 이어붙여 해시
      -- 했는데, coupon_id 자체에 ':' 이 들어가면 다른 (coupon,user) 쌍과
      -- 같은 문자열이 만들어질 수 있었다(예: id='a:b'+user='c' 와
      -- id='a'+user='b:c' 가 둘 다 'a:b:c'). 문자열을 잇지 않고
      -- hashtextextended 의 salt 인자에 user_id 해시를 실어 두 값을
      -- 섞는다 — salt=2 로 위 전역 락(salt=1)과 네임스페이스도 분리한다.
      -- (uuid 전환 후에도 문자열 이어붙이기를 되살리지 않는다. ':' 앨리어싱
      --  위험은 uuid 형식상 사라졌지만 salt 방식이 이미 더 안전하다.)
      perform pg_advisory_xact_lock(
        hashtextextended(v_coupon.id::text, hashtextextended(p_user_id::text, 2))
      );
    end if;

    if not v_coupon.is_active then
      continue;
    end if;
    if v_coupon.valid_until is not null
       and v_coupon.valid_until < (v_now at time zone 'Asia/Seoul')::date then
      continue;
    end if;
    if p_subtotal < v_coupon.min_amount then
      continue;
    end if;
    -- P1-7: 사용 횟수 제한이 걸린 쿠폰은 로그인 필수. 상시 할인
    -- (max_uses_per_user is null)은 게스트에게 계속 열려 있다.
    if v_coupon.max_uses_per_user is not null and p_user_id is null then
      continue;
    end if;
    if public.fn_coupon_is_redeemed(v_coupon.id, p_user_id, v_now) then
      continue;
    end if;
    -- P1-6: 전체 발행량 소진.
    if public.fn_coupon_global_redeemed(v_coupon.id, v_now) then
      continue;
    end if;

    v_cand_ids       := array_append(v_cand_ids, v_coupon.id);
    v_cand_discounts := array_append(v_cand_discounts, v_coupon.discount_amount);
    v_cand_stackable := array_append(v_cand_stackable, v_coupon.stackable);
  end loop;

  -- 2) P1-8 stacking 정산 — 비결합(stackable=false) 후보 중 할인액이 가장
  --    큰 1장만 남긴다. 동률이면 배열에서 먼저 나온(coupons.slug 오름차순이
  --    이미 순회 순서였다) 쪽을 남긴다 — 안정적 tie-break.
  v_best_nonstack_idx := null;
  for v_i in 1 .. coalesce(array_length(v_cand_ids, 1), 0) loop
    if not v_cand_stackable[v_i] then
      if v_best_nonstack_idx is null
         or v_cand_discounts[v_i] > v_cand_discounts[v_best_nonstack_idx] then
        v_best_nonstack_idx := v_i;
      end if;
    end if;
  end loop;

  -- 3) 최종 적용 목록 조립 — stackable=true 는 전부, stackable=false 는
  --    위에서 고른 1장만. 동시에 P1-8 의 0원 방지: 이 쿠폰까지 더하면
  --    누적 할인이 소계에 도달(=결제 금액 0원)하는 경우 그 쿠폰만
  --    건너뛴다(전체 주문을 실패시키지 않는다). coupons.slug 오름차순
  --    (v_cand_* 배열의 원래 순서)을 그대로 적용 우선순위로 쓴다 —
  --    먼저 선택 가능했던 쿠폰이 먼저 자리를 차지한다.
  for v_i in 1 .. coalesce(array_length(v_cand_ids, 1), 0) loop
    if v_cand_stackable[v_i] or v_i = v_best_nonstack_idx then
      if v_coupon_discount + v_cand_discounts[v_i] >= p_subtotal then
        continue;
      end if;
      v_applied_ids       := array_append(v_applied_ids, v_cand_ids[v_i]);
      v_applied_discounts := array_append(v_applied_discounts, v_cand_discounts[v_i]);
      v_coupon_discount    := v_coupon_discount + v_cand_discounts[v_i];
    end if;
  end loop;

  -- 방어적 클램프(이론상 위 루프가 이미 보장하지만, 향후 로직 변경 시
  -- 이중 안전장치로 남겨둔다) — 기존 Checkout.jsx:235 / create-order.js:105
  -- 와 동일 규칙(Math.min(sum, subtotal)).
  v_coupon_discount := least(v_coupon_discount, p_subtotal);
  v_discount_total  := (p_list_amount - p_subtotal) + v_coupon_discount;
  v_amount          := greatest(0, p_list_amount - v_discount_total);

  if v_amount <= 0 then
    -- 위 3)단계가 쿠폰으로 인한 0원화는 이미 막았으므로, 여기 도달한다면
    -- 쿠폰과 무관하게 상품 자체가 0원(list_amount = subtotal = 0)인
    -- 경우뿐이다 — 그 경우는 기존과 동일하게 주문을 막는다. 예외로
        -- 함수 전체(= 이 트랜잭션)가 롤백되므로 orders/order_items/
    -- coupon_redemptions 어느 것도 남지 않는다.
    -- P3: 메시지 문자열 비교(api/create-order.js:129)가 취약해 errcode 를
    -- 붙였다 — 호출측은 error.code === 'WC001' 로 판별해야 한다.
    raise exception 'invalid_amount' using errcode = 'WC001';
  end if;

  -- 대표 쿠폰 1개만 orders.coupon_id 에 참고용으로 남긴다(위 파일 상단
  -- "orders.coupon_id 처리" 절 참고 — 정본은 coupon_redemptions).
  v_coupon_id_repr := case when array_length(v_applied_ids, 1) > 0
                       then v_applied_ids[1] else null end;

  -- 4) 주문 헤더
  insert into public.orders
    (id, user_id, status, order_name, list_amount, discount_amount, amount, coupon_id, customer_email)
  values
    (p_order_id, p_user_id, 'pending', p_order_name, p_list_amount, v_discount_total, v_amount, v_coupon_id_repr, p_customer_email);

  -- 5) 주문 아이템. product_id(uuid, 관계)와 product_slug(text, 구매 시점
  --    스냅샷)를 함께 박는다 — 호출측이 둘 다 실어 보낸다(sql/56_surrogate_
  --    uuid_keys.sql 3)절, api/create-order.js p_items). product_slug 가
  --    없으면(구 클라이언트) null 을 그대로 허용한다.
  insert into public.order_items (order_id, product_id, product_slug, service_key, name, list_price, price, quantity)
  select
    p_order_id,
    (i ->> 'product_id')::uuid,
    i ->> 'product_slug',
    i ->> 'service_key',
    i ->> 'name',
    coalesce((i ->> 'list_price')::integer, 0),
    coalesce((i ->> 'price')::integer, 0),
    coalesce((i ->> 'quantity')::integer, 1)
  from jsonb_array_elements(coalesce(p_items, '[]'::jsonb)) as i;

  -- 6) 쿠폰 귀속(사용 이력). discount_amount 는 위 판정 시점 값을 그대로
  --    쓴다(귀속 시점 재조회하지 않음 — coupons 값이 그 사이 바뀌어도
  --    판정에 쓴 값과 기록값이 어긋나지 않는다).
  if array_length(v_applied_ids, 1) > 0 then
    insert into public.coupon_redemptions (coupon_id, user_id, order_id, discount_amount)
    select v_applied_ids[gs.i], p_user_id, p_order_id, v_applied_discounts[gs.i]
    from generate_subscripts(v_applied_ids, 1) as gs(i);
  end if;

  return query
  select p_order_id, v_amount, v_discount_total, v_coupon_discount, v_applied_ids;
end;
$$;

comment on function public.fn_redeem_coupons(text, uuid, text, text, jsonb, integer, integer, uuid[]) is
  '서버 전용(service_role). 주문/주문아이템 생성 + 쿠폰 귀속을 한 트랜잭션으로 원자 처리. subtotal/list_amount 는 호출측이 products 로 계산한 신뢰값이어야 한다. p_items[].product_id 는 products.id(uuid 문자열)를, p_items[].product_slug 는 products.slug(사람이 읽는 스냅샷)를 받는다 — order_items 에 관계(product_id, uuid FK)와 스냅샷(product_slug, text)을 함께 저장한다(sql/56_surrogate_uuid_keys.sql 3)절). invalid_amount 예외는 errcode=WC001 (P3, 2026-08-11).';

revoke all on function public.fn_redeem_coupons(text, uuid, text, text, jsonb, integer, integer, uuid[])
  from public, anon, authenticated;
grant execute on function public.fn_redeem_coupons(text, uuid, text, text, jsonb, integer, integer, uuid[])
  to service_role;

-- =====================================================================
-- 확인용 (실행 후 눈으로 볼 것)
-- =====================================================================
-- 반환 id 가 uuid 라 눈으로 알아보려면 coupons.slug 를 조인한다.
-- select u.*, c.slug from public.fn_usable_coupons(0) u join public.coupons c on c.id = u.id;
--   → slug 'signup-2000' 만 eligible(상시 할인 2종은 below_min_amount).
--     비로그인(anon) 컨텍스트에서는 signup 계열이 login_required 다.
-- select u.*, c.slug from public.fn_usable_coupons(50000) u join public.coupons c on c.id = u.id;
--   → over40k-3000 이 추가로 eligible 전환.
-- select u.*, c.slug from public.fn_usable_coupons(90000) u join public.coupons c on c.id = u.id;
--   → over40k-3000 + over80k-5000 eligible (단 stacking 은 fn_redeem_coupons 에서 1장으로 정산됨)
--
-- 시그니처(전환 후 uuid 인자·반환)와 권한을 함께 확인한다 — 1-f)절 DROP 이
-- 권한을 초기화하므로 재적용 후 반드시 본다. 목표:
--   fn_usable_coupons / fn_coupon_by_code        → anon, authenticated, service_role
--   fn_void_coupon_redemption                    → authenticated, service_role
--   나머지 4개                                    → service_role 만
-- select proname, pg_get_function_identity_arguments(oid) as args, proacl from pg_proc where proname in (
--   'fn_coupon_is_redeemed','fn_coupon_global_redeemed','fn_usable_coupons',
--   'fn_coupon_by_code','fn_revalidate_order_coupons','fn_redeem_coupons',
--   'fn_void_coupon_redemption'
-- );
