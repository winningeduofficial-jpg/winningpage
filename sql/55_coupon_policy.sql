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
-- 발급형 쿠폰(쿠폰함) — 조건형과 공존 (2026-08-11 사용자 확정, 추가)
--   지금까지 coupons 에 "소유자" 개념이 없었다. 그래서 slug 'signup-2000'
--   (회원가입 축하 쿠폰)이 가입 여부와 무관하게 전역에 떠 있었고, code 도
--   없어 모든 체크아웃 화면에 자동 노출됐다 — 실제 동작은 "전 회원 상시 1회
--   할인"이라 이름과 동작이 어긋나 있었다.
--
--   축을 하나 추가한다: coupons.grant_type (0-e절).
--     'auto'    조건형. 조건(금액·기간)만 맞으면 누구나 — over40k-3000,
--               over80k-5000. 지금까지의 전 쿠폰이 여기 해당하므로 DEFAULT 다
--               (기존 3행 중 2행은 무변경, 회귀 없음).
--     'granted' 발급형. coupon_grants 에 살아있는 발급 행이 있어야 쓸 수 있다
--               — signup-2000 이 여기로 옮겨온다.
--
--   Stripe 는 coupon(할인 규칙)과 promotion_code(사용 권리)를 테이블 두 개로
--   쪼개 제한 축을 전부 권리 쪽에 붙인다(API 2026-07-29 확인:
--   promotion_code.customer/expires_at/max_redemptions/times_redeemed/
--   restrictions.*). 그 구조를 이식하지 않는다 — 우리 쿠폰은 3장이고 규칙과
--   권리가 1:1이라 테이블을 쪼개면 조인과 어드민 화면 단계만 늘고 얻는 게
--   없다. 대신 "누가 쓸 수 있는가"만 별도 테이블(coupon_grants)로 떼고,
--   나머지 제한(금액·기간·횟수·발행량·결합)은 지금처럼 coupons 에 남긴다.
--
--   판정은 헬퍼 하나(2-c절 fn_coupon_is_granted)에 모은다 —
--   fn_coupon_is_redeemed 가 시간창·상태 블랙리스트를 혼자 들고 있는 것과
--   같은 패턴이다. fn_usable_coupons / fn_coupon_by_code /
--   fn_redeem_coupons / fn_revalidate_order_coupons 넷이 전부 이 헬퍼만
--   부른다(각자 판정하면 방금 없앤 중복이 되살아난다). 목록에서 빼지 않고
--   eligible=false + reason='not_granted' 로 돌려준다 — 조용히 사라지면 왜
--   못 쓰는지 설명할 수 없다는 이 파일의 기존 원칙 그대로다.
--
--   발급 지점은 가입 트리거다(1-j절) — Supabase Auth Hooks 도 cron 도 필요
--   없다(pg_cron 부재는 제약이 아니었다). AFTER INSERT ... FOR EACH ROW 는
--   사용자당 정확히 한 번 실행되고, 부분 유니크 인덱스가 어떤 경로의 중복
--   호출도 막아 멱등성이 공짜로 따라온다.
--
--   ⚠️ 발급 실패가 회원가입을 막아서는 안 된다. 1-j)절 참고 — 트리거 함수
--   본문 전체를 EXCEPTION 블록으로 감싸 어떤 실패도 warning 으로 삼킨다.
--   (트리거를 따로 두는 것만으로는 격리되지 않는다 — 같은 트랜잭션이라
--   예외가 그대로 INSERT 를 되돌린다. 격리는 오직 EXCEPTION 블록이 한다.)
--
--   발급 만료일(per-grant expires_at)은 만들지 않았다 — 판단 근거는 1-h)절.
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
--   2026-08-11 발급형 추가 — not_granted 가 늘어 7종이다(below_min_amount /
--   expired / already_used / inactive / login_required / sold_out /
--   not_granted). 발급형 쿠폰을 발급받지 않은 사람에게도 행은 그대로 보이고
--   이유만 not_granted 로 붙는다.
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
-- 0-e) coupons.grant_type / coupons.grant_on_signup : 발급형 쿠폰 축
--    (2026-08-11 사용자 확정). 설계 배경은 파일 상단 "발급형 쿠폰(쿠폰함)" 절.
--
--    grant_type
--      'auto'    조건형(DEFAULT). 지금까지의 모든 쿠폰이 여기 해당한다 —
--                기존 3행이 전부 이 기본값을 받으므로 아래 시드 UPDATE 가
--                건드리는 signup 계열 외에는 동작이 완전히 그대로다.
--      'granted' 발급형. coupon_grants 에 살아있는 발급 행이 있는 사용자만
--                쓸 수 있다(2-c절 fn_coupon_is_granted).
--      CHECK 로 두 값만 허용한다 — 이 컬럼은 판정 분기의 근거라, 오타 한 번이
--      "아무 조건 없이 열린 쿠폰"으로 조용히 떨어진다(이 파일이 반복해서
--      막아 온 fail-open 유형). '.includes()' 류의 부분 문자열 매칭은
--      쓰지 않는다 — 과거 'inactive'.includes('active') 로 무료 입장이 열린
--      전례가 있다.
--
--    grant_on_signup
--      "가입 시 자동 발급 대상인가". 1-j)절 트리거가 발급할 쿠폰을 이 플래그로
--      **찾는다** — 트리거 본문에 slug 를 하드코딩하지 않는다(하드코딩하면
--      쿠폰을 하나 바꿀 때마다 DB 함수를 고쳐야 하고, 어드민 화면에서 손댈
--      수 없는 정책이 생긴다).
--      grant_type='granted' 가 아닌 쿠폰에는 켤 수 없게 CHECK 로 묶는다 —
--      조건형 쿠폰을 발급 대상으로 표시하는 건 무의미한 상태이고, 그런 행이
--      생기면 트리거가 아무 효과 없는 행을 사용자마다 하나씩 쌓는다.
--
--    발급형이면서 grant_on_signup=false 인 쿠폰(=어드민이 손으로만 발급)도
--    정상 상태다 — 이벤트·보상 쿠폰이 그 자리다.
-- ---------------------------------------------------------------------
alter table public.coupons
  add column if not exists grant_type text not null default 'auto';

alter table public.coupons
  drop constraint if exists coupons_grant_type_check;
alter table public.coupons
  add constraint coupons_grant_type_check
  check (grant_type in ('auto', 'granted'));

alter table public.coupons
  add column if not exists grant_on_signup boolean not null default false;

alter table public.coupons
  drop constraint if exists coupons_grant_on_signup_check;
alter table public.coupons
  add constraint coupons_grant_on_signup_check
  check (not grant_on_signup or grant_type = 'granted');

comment on column public.coupons.grant_type is
  '쿠폰 배포 방식. auto(기본) = 조건형, 금액·기간 조건만 맞으면 누구나. granted = 발급형, coupon_grants 에 살아있는 발급 행이 있는 사용자만 사용 가능(fn_coupon_is_granted).';
comment on column public.coupons.grant_on_signup is
  '가입 시 자동 발급 대상 여부. 1-j)절 on_auth_user_created_coupon_grant 트리거가 이 플래그로 발급 대상을 찾는다(slug 하드코딩 금지). grant_type=granted 인 쿠폰에만 켤 수 있다.';

-- 시드값 (사용자 확정, 2026-08-11): signup 계열만 발급형으로 전환한다.
-- over40k-3000/over80k-5000 은 "금액 조건 상시 할인" 이라 조건형을 유지한다
-- (DEFAULT 'auto' 를 그대로 받으므로 UPDATE 자체가 없다).
--
-- ⚠️ 이 UPDATE 만으로는 아무에게도 발급되지 않는다. 전환 직후 signup-2000 은
--    "기존 회원 전원에게 not_granted" 가 되어 사실상 비활성 쿠폰이 된다 —
--    신규 가입자만 1-j)절 트리거로 발급받는다. 기존 사용자 소급 발급은
--    의도적으로 이 파일에 넣지 않았다(누구에게 줄지·이미 쓴 사람을 어떻게
--    볼지가 정책 결정이라 팀 리드 판정 사안이다. 선택지와 결과는 팀 보고 참고).
update public.coupons
   set grant_type = 'granted', grant_on_signup = true
 where slug = 'signup-2000'
   and (grant_type is distinct from 'granted' or grant_on_signup is distinct from true);

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

-- ---------------------------------------------------------------------
-- 1-d-2) coupons 어드민 RLS — 어드민 "쿠폰관리" 화면의 전제 (2026-08-11).
--    coupons 의 정책은 지금까지 "coupons public read"(qual: is_active = true)
--    단 하나였다(dev pg_policies 실측). 그래서 anon/authenticated 경로로는
--      ① is_active=false 쿠폰이 아예 보이지 않고(어드민 목록에 판매 종료
--         쿠폰이 뜰 수 없다)
--      ② INSERT/UPDATE 가 전부 거부된다(쓰기 정책이 0개 = RLS 기본 거부)
--    였다. 이 파일이 지금까지 남긴 결함 절들 — 0)절 max_uses_per_user
--    DEFAULT 를 1로 뒤집은 것, 1-b)절 voided_at, 1-g)절 void RPC — 이 전부
--    "어드민 UI 가 없어 운영자가 Supabase Studio(postgres 롤, BYPASSRLS)로
--    직접 조작한다" 는 전제 위에 서 있었다. 그 전제를 없애는 화면
--    (src/components/admin/CouponAdmin.jsx)은 브라우저에서 anon 키 + 관리자
--    JWT 로 접속하므로 DB 레벨 롤이 authenticated 다 — is_admin() 경로가
--    열려 있지 않으면 목록도 저장도 성립하지 않는다.
--
--    커맨드별로 쪼갠다. 1-d)절과 같은 원칙이다 — for all 하나로 열면 DELETE
--    까지 함께 열린다.
--      select : is_active=false 까지 어드민에게 보인다. 기존 "coupons public
--               read" 는 PERMISSIVE 라 같은 커맨드의 정책이 OR 로 결합되므로
--               공개 조회 동작(활성 쿠폰만)은 무변경이다.
--      insert/update : 생성·수정.
--      delete : 정책을 만들지 않는다(= RLS 기본 거부). 근거 2개.
--               ① coupons 는 orders.coupon_id 와 coupon_redemptions.coupon_id
--                  두 FK 의 ON DELETE RESTRICT 대상이다(1-c절) — 한 번이라도
--                  주문에 물린 쿠폰은 어차피 지울 수 없다. 화면에 삭제 버튼을
--                  두면 "쓰인 쿠폰만 실패하는" 버튼이 된다.
--               ② 한 번도 안 쓰인 쿠폰이라도 이 도메인의 정본 손잡이는
--                  is_active=false 다(3)절 fn_usable_coupons 가 비활성 행을
--                  목록에서 뺀다). 1-d)절이 coupon_redemptions 에 for delete
--                  를 만들지 않은 것과 같은 판단이다.
--
--    ⚠️ 별건으로 제안된 `revoke select (code) on public.coupons from anon,
--    authenticated`(anon 이 테이블 조회로 code 를 통째로 읽는 문제)는 이
--    파일에서 적용하지 않는다 — 컬럼 레벨 권한은 RLS 보다 먼저, 롤 단위로
--    평가되므로 관리자(DB 레벨에선 같은 authenticated 롤)까지 함께 막혀
--    쿠폰관리 화면의 code 편집이 즉시 죽는다. sql/46_profiles_role_hardening
--    .sql 이 `revoke update (role)` 을 기각한 것과 정확히 같은 이유다. anon
--    노출을 막으려면 컬럼 권한이 아니라 "coupons public read" 정책을 컬럼이
--    아닌 행 단위로 다시 설계하거나(예: code is null 인 행만 공개) 공개
--    조회를 fn_usable_coupons 전용으로 좁히는 쪽이어야 한다 — 별도 판단 사안.
-- ---------------------------------------------------------------------
drop policy if exists "coupons admin select" on public.coupons;
drop policy if exists "coupons admin insert" on public.coupons;
drop policy if exists "coupons admin update" on public.coupons;

create policy "coupons admin select" on public.coupons
  for select using (public.is_admin());

create policy "coupons admin insert" on public.coupons
  for insert with check (public.is_admin());

create policy "coupons admin update" on public.coupons
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
-- 1-h) coupon_grants : 발급형 쿠폰의 "사용 권리" 원장 (2026-08-11).
--    coupons 가 규칙(얼마·언제·몇 번)이라면 이 테이블은 권리(누가)다.
--    grant_type='granted' 인 쿠폰은 여기 살아있는 행이 있어야만 쓸 수 있다.
--
--    삭제하지 않는다 — revoked_at 으로 회수한다.
--      이 파일 1-b/1-d/1-g 절이 coupon_redemptions 에 대해 내린 것과 같은
--      판단이다. "누구에게 언제 발급했고 언제 회수했는가" 는 금액이 걸린
--      사실이라 원장에서 지우면 안 된다. 그래서 아래 RLS 에 delete 정책이
--      없고(정책이 없는 커맨드는 RLS 기본 거부), 회수 RPC 도 UPDATE 만 한다.
--
--    유니크는 "살아있는 발급" 에만 건다 (부분 유니크 인덱스).
--      전체 유니크(coupon_id, user_id)로 잡으면 재발급이 기존 행의 UPDATE 가
--      되어 직전 회수 사유(revoke_reason)가 덮어써진다 — 회수→재발급 이력이
--      통째로 사라진다. `where revoked_at is null` 부분 유니크로 잡으면
--      "동시에 살아있는 발급은 최대 1건" 은 그대로 보장되면서 회수된 과거
--      행은 그대로 남는다.
--      ⚠️ 부분 유니크 인덱스는 ON CONFLICT 의 arbiter 로 자동 추론되지
--      않는다(42P10) — 아래 INSERT 들은 반드시 인덱스와 **똑같은** 술어를
--      `on conflict (coupon_id, user_id) where revoked_at is null` 로 적어야
--      한다. 이 술어를 빼먹으면 발급이 조용히 실패하는 게 아니라 에러가
--      나므로(42P10) 배포 전에 드러난다.
--
--    per-grant 만료일(expires_at)을 두지 않았다 — "복사 vs 참조" 판정.
--      제안 형태에는 `expires_at timestamptz  -- null = coupons.valid_until 을
--      따른다` 가 있었다. 넣지 않는 쪽으로 판정했고 근거는 셋이다.
--        ① NULL 규약이 이 프로젝트에서 이미 "무제한/무기한" 인데, 여기서만
--           "상위 정의를 따른다(= 유한할 수도 있다)" 로 의미가 바뀐다.
--           같은 기호가 두 뜻을 가지면 어드민 화면이 NULL 을 ∞ 로 그리는
--           순간 화면이 거짓말을 한다.
--        ② 그리고 참조든 복사든 **쿠폰 자신의 valid_until 은 어차피 모든
--           쿠폰에 그대로 걸린다**(3)/3-b)/4)절이 발급 여부와 무관하게
--           평가한다). 즉 발급 만료일은 조건을 좁히기만 할 수 있고 늘릴 수는
--           없다 — 두 만료일은 독립적인 AND 조건이라 "어느 쪽이 이기나" 를
--           정할 일 자체가 없었다. 컬럼을 두지 않으면 그 AND 항이 사라질
--           뿐이고, "정의를 따른다" 는 참조 동작이 그대로 남는다.
--        ③ 실제로 필요해지는 규칙은 "가입 후 N일" 인데, 그건 발급 행마다
--           날짜를 복사(freeze)하는 게 아니라 granted_at + coupons 의 기간
--           설정을 **참조해 계산**하는 쪽이 맞다. granted_at 을 남겨 뒀으므로
--           그때 coupons 에 컬럼 하나(예: grant_valid_days)를 더하는 순전한
--           추가 변경으로 가능하다. 지금 컬럼을 만들면 화면·RPC·판정에
--           타임존까지(coupons.valid_until 은 date, 이건 timestamptz) 얽힌
--           두 번째 만료 축이 요구 없이 먼저 생긴다.
--
--    user_id 는 NOT NULL + ON DELETE CASCADE.
--      1-c)절이 coupon_redemptions.user_id 를 SET NULL 로 정한 것과 다르다.
--      거기는 "누가 썼는지" 가 비어도 할인액·주문 연결이라는 사실이 남지만,
--      여기는 소유자가 곧 이 행의 존재 이유라 소유자 없는 발급은 의미가
--      없다(NOT NULL 이라 SET NULL 자체가 불가능하기도 하다). 계정 삭제를
--      RESTRICT 로 막으면 탈퇴·개인정보 삭제가 쿠폰 때문에 불가능해지므로
--      CASCADE 가 유일하게 성립하는 선택이다.
--    coupon_id 는 RESTRICT — 1-c)절과 동일(쿠폰 삭제 대신 is_active=false).
-- ---------------------------------------------------------------------
create table if not exists public.coupon_grants (
  id            bigint generated always as identity primary key,
  coupon_id     uuid not null references public.coupons (id) on delete restrict,
  user_id       uuid not null references auth.users (id) on delete cascade,
  granted_at    timestamptz not null default now(),
  -- 발급 출처. 'signup' = 1-j)절 가입 트리거, 'admin' = 어드민 화면(1-i절
  -- fn_grant_coupon). 'event' 는 아직 생산자가 없지만(대량 발급 배치 등)
  -- 열거에 미리 넣어 둔다 — 새 출처가 생길 때 CHECK 를 고치는 것보다
  -- 값 하나를 미리 허용해 두는 편이 마이그레이션 한 번을 줄인다.
  granted_by    text not null,
  revoked_at    timestamptz,
  revoke_reason text
);

alter table public.coupon_grants
  drop constraint if exists coupon_grants_granted_by_check;
alter table public.coupon_grants
  add constraint coupon_grants_granted_by_check
  check (granted_by in ('signup', 'admin', 'event'));

-- 살아있는 발급은 (쿠폰, 사용자)당 최대 1건. 회수된 과거 행은 제한 없이 남는다.
create unique index if not exists coupon_grants_live_uidx
  on public.coupon_grants (coupon_id, user_id) where revoked_at is null;
-- 어드민 발급 관리(쿠폰별 드릴다운) 조회 경로. 회수된 행까지 전부 본다.
create index if not exists coupon_grants_coupon_idx
  on public.coupon_grants (coupon_id);

comment on table public.coupon_grants is
  '발급형 쿠폰(coupons.grant_type=granted)의 사용 권리 원장. 절대 DELETE 하지 않는다 — 회수는 revoked_at UPDATE 로만 한다(fn_revoke_coupon_grant). 살아있는 발급은 (coupon_id, user_id)당 1건(부분 유니크 인덱스).';
comment on column public.coupon_grants.granted_by is
  '발급 출처. signup = 가입 트리거, admin = 어드민 화면, event = 예약(생산자 미정).';
comment on column public.coupon_grants.revoked_at is
  '관리자가 이 발급을 회수한 시각. NULL = 유효. 판정(fn_coupon_is_granted)은 NULL 인 행만 본다.';
comment on column public.coupon_grants.revoke_reason is
  '회수 사유(자유 텍스트, 관리자 기입). revoked_at 이 NULL 이면 의미 없음.';

alter table public.coupon_grants enable row level security;

-- 쓰기 정책을 하나도 만들지 않는다 — insert/update/delete 전부 RLS 기본 거부다.
-- 발급·회수는 오직 아래 1-i)절 SECURITY DEFINER RPC 두 개로만 가능하다.
-- 이 판단은 의도적이다: coupon_redemptions 는 어드민 update 정책이 열려 있어
-- fn_void_coupon_redemption 의 "일방향 감사 기록" 보장이 PostgREST PATCH 한
-- 번으로 우회된다는 지적을 이미 받았다(voided_at 을 다시 null 로 되돌릴 수
-- 있다). 같은 실수를 새 테이블에서 반복하지 않는다 — 회수 되돌리기가 필요하면
-- 그건 "재발급"(새 행)이지 "회수 기록 지우기" 가 아니다.
drop policy if exists "coupon_grants select own" on public.coupon_grants;
create policy "coupon_grants select own" on public.coupon_grants
  for select to authenticated using (auth.uid() = user_id);

drop policy if exists "coupon_grants admin select" on public.coupon_grants;
create policy "coupon_grants admin select" on public.coupon_grants
  for select to authenticated using (public.is_admin());

-- ---------------------------------------------------------------------
-- 1-i) 발급/회수 RPC (관리자 전용). 1-g) fn_void_coupon_redemption 과 같은
--    형태다 — SECURITY DEFINER 로 RLS 를 우회하므로 is_admin() 을 함수
--    안에서 직접 검사하고, 갱신된 행 전체를 돌려준다.
--
--    errcode (기존 WC001=invalid_amount, WC002=redemption 없음/이미 무효 에 이어)
--      WC003 : 발급이 없거나 이미 회수됨 (fn_revoke_coupon_grant)
--      WC004 : 발급할 수 없는 쿠폰 (조건형이거나 존재하지 않음, fn_grant_coupon)
-- ---------------------------------------------------------------------
create or replace function public.fn_grant_coupon(
  p_coupon_id uuid,
  p_user_id   uuid
)
returns public.coupon_grants
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_grant_type text;
  v_row        public.coupon_grants;
begin
  if not public.is_admin() then
    raise exception 'not_authorized' using errcode = '42501';
  end if;

  select c.grant_type into v_grant_type
    from public.coupons c
   where c.id = p_coupon_id;

  -- 없는 쿠폰도 "발급할 수 없는 쿠폰" 이다(coalesce 로 NULL 까지 함께 잡는다).
  -- 조건형 쿠폰에 발급 행을 만들면 판정에서 아무 효과가 없는 유령 행이 된다.
  if coalesce(v_grant_type, '') <> 'granted' then
    raise exception 'coupon_not_grantable' using errcode = 'WC004';
  end if;

  -- 멱등: 이미 살아있는 발급이 있으면 아무것도 하지 않고 그 행을 돌려준다
  -- (에러가 아니다 — 두 번 눌러도 같은 결과여야 한다).
  -- 부분 유니크 인덱스를 arbiter 로 쓰려면 술어를 그대로 다시 적어야 한다(42P10).
  insert into public.coupon_grants (coupon_id, user_id, granted_by)
  values (p_coupon_id, p_user_id, 'admin')
  on conflict (coupon_id, user_id) where revoked_at is null do nothing
  returning * into v_row;

  if v_row.id is null then
    select g.* into v_row
      from public.coupon_grants g
     where g.coupon_id = p_coupon_id
       and g.user_id = p_user_id
       and g.revoked_at is null;
  end if;

  return v_row;
end;
$$;

comment on function public.fn_grant_coupon(uuid, uuid) is
  '관리자 전용. 발급형 쿠폰을 한 사용자에게 발급한다(멱등 — 이미 살아있는 발급이 있으면 그 행을 그대로 반환). 조건형이거나 없는 쿠폰이면 errcode=WC004. 관리자가 아니면 42501.';

revoke all on function public.fn_grant_coupon(uuid, uuid) from public, anon;
grant execute on function public.fn_grant_coupon(uuid, uuid) to authenticated, service_role;

create or replace function public.fn_revoke_coupon_grant(
  p_grant_id bigint,
  p_reason   text default null
)
returns public.coupon_grants
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_row public.coupon_grants;
begin
  if not public.is_admin() then
    raise exception 'not_authorized' using errcode = '42501';
  end if;

  update public.coupon_grants
     set revoked_at    = now(),
         revoke_reason = p_reason
   where id = p_grant_id
     and revoked_at is null
  returning * into v_row;

  if v_row.id is null then
    raise exception 'grant_not_found_or_already_revoked' using errcode = 'WC003';
  end if;

  return v_row;
end;
$$;

comment on function public.fn_revoke_coupon_grant(bigint, text) is
  '관리자 전용. 발급 1건을 회수한다(revoked_at UPDATE) — 절대 DELETE 하지 않는다. 없거나 이미 회수됐으면 errcode=WC003. 관리자가 아니면 42501. 되돌리려면 되살리는 게 아니라 다시 발급한다(새 행).';

revoke all on function public.fn_revoke_coupon_grant(bigint, text) from public, anon;
grant execute on function public.fn_revoke_coupon_grant(bigint, text) to authenticated, service_role;

-- ---------------------------------------------------------------------
-- 1-j) 가입 시 자동 발급 트리거 (2026-08-11).
--
--    왜 handle_new_user() 를 고치지 않고 트리거를 따로 두는가
--      · handle_new_user() 는 회원 도메인 소유이고 프로덕션에서 이미 돌고
--        있다(sql/00_base_schema.sql:1243). 쿠폰 사정으로 그 함수를 고치면
--        가입 경로 전체가 이 파일의 변경 대상이 된다.
--      · 실측(2026-08-11): dev 의 auth.users 에는 non-internal 트리거가
--        **0개**다 — 선언된 on_auth_user_created 가 dev 에 존재하지 않는다
--        (회원 도메인 담당이 봐야 할 별건. 이 파일은 복원하지 않는다).
--        handle_new_user 확장 방식이었다면 dev 에서 발급 자체가 성립하지
--        않았을 것이다. 트리거를 따로 두면 그 함수의 존재 여부와 무관하게
--        동작한다.
--      · 문제가 생기면 이 트리거 하나만 DROP 하면 된다(가입 경로 무손상).
--      트리거 실행 순서는 이름 오름차순이라 on_auth_user_created(있는 DB
--      에서는) → on_auth_user_created_coupon_grant 순서다. 어차피 이 함수는
--      profiles 를 보지 않고 auth.users 행만 쓰므로 순서 의존이 없다.
--
--    ⚠️ 발급 실패가 가입을 막지 않는다는 보장은 오직 EXCEPTION 블록이 한다.
--      트리거를 따로 두는 것만으로는 격리되지 않는다 — AFTER INSERT 트리거는
--      INSERT 와 같은 트랜잭션에서 실행돼, 여기서 예외가 새어 나가면 가입
--      INSERT 자체가 롤백된다. 그래서 본문 전체를 서브트랜잭션(BEGIN ...
--      EXCEPTION)으로 감싸고 `when others` 로 전부 삼킨다. 삼킨다고 흔적이
--      없으면 안 되므로 raise warning 으로 sqlstate 와 함께 남긴다
--      (Supabase 프로젝트 로그에서 조회 가능).
--      이 방어는 실제 시나리오를 겨냥한다: coupon_grants 가 아직 없는 DB에
--      이 트리거만 먼저 배포되거나(관계 없음 = 42P01), 인덱스·CHECK 가
--      바뀌거나, coupons 조회가 락에 걸리는 경우 — 전부 가입이 아니라 쿠폰만
--      실패해야 한다.
--
--    어떤 쿠폰을 발급할지는 데이터로 찾는다 — slug 하드코딩 금지(0-e절).
--      is_active/valid_until 도 함께 본다. 이미 판매 종료했거나 기간이 지난
--      쿠폰을 신규 가입자에게 계속 발급하면 아무도 못 쓰는 행만 사용자마다
--      하나씩 쌓인다. 운영자가 쿠폰을 내리는 손잡이(is_active=false)가 곧
--      "신규 발급 중단" 이 되는 편이 화면 하나로 이해된다.
--
--    멱등성: AFTER INSERT ... FOR EACH ROW 는 사용자당 한 번이고, 그 위에
--      부분 유니크 인덱스 + ON CONFLICT DO NOTHING 이 어떤 경로의 중복
--      호출(수동 재실행, 향후 백필 배치)도 조용히 흡수한다.
--
--    권한: SECURITY DEFINER 이고 grant 를 따로 조정하지 않는다 —
--      auth.users 에 INSERT 하는 롤(supabase_auth_admin)이 트리거 함수에
--      EXECUTE 를 갖고 있어야 하는데, 기존 handle_new_user 가 PUBLIC EXECUTE
--      (proacl '=X/postgres' 실측)로 프로덕션에서 동작 중인 선례를 그대로
--      따른다. 직접 호출은 불가능하다(트리거 함수는 트리거 컨텍스트 밖에서
--      호출하면 즉시 에러) — PUBLIC EXECUTE 를 남겨도 공격 표면이 없다.
-- ---------------------------------------------------------------------
create or replace function public.fn_grant_signup_coupons()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  begin
    insert into public.coupon_grants (coupon_id, user_id, granted_by)
    select c.id, new.id, 'signup'
      from public.coupons c
     where c.grant_type = 'granted'
       and c.grant_on_signup = true
       and c.is_active = true
       and (c.valid_until is null
            or c.valid_until >= (now() at time zone 'Asia/Seoul')::date)
    on conflict (coupon_id, user_id) where revoked_at is null do nothing;
  exception
    when others then
      -- 쿠폰 발급 실패가 회원가입을 실패시켜서는 안 된다(파일 상단 절).
      raise warning 'fn_grant_signup_coupons failed for user %: % (%)',
        new.id, sqlerrm, sqlstate;
  end;

  return new;
end;
$$;

comment on function public.fn_grant_signup_coupons() is
  'auth.users AFTER INSERT 트리거. coupons.grant_on_signup 인 발급형 쿠폰을 신규 가입자에게 발급한다. 본문 전체가 EXCEPTION 블록이라 어떤 실패도 가입을 막지 않는다(warning 만 남는다).';

drop trigger if exists on_auth_user_created_coupon_grant on auth.users;
create trigger on_auth_user_created_coupon_grant
  after insert on auth.users
  for each row execute function public.fn_grant_signup_coupons();

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
-- 2-c) fn_coupon_is_granted : 발급 여부 판정 내부 헬퍼 (2026-08-11).
--    fn_usable_coupons / fn_coupon_by_code / fn_redeem_coupons /
--    fn_revalidate_order_coupons 네 곳이 전부 이 함수만 부른다 — 발급 규칙을
--    한 곳에 모으는 것이 이 파일의 기존 패턴이다(fn_coupon_is_redeemed 가
--    상태 블랙리스트·시간창을 혼자 들고 있는 것과 같다).
--
--    조건형(grant_type='auto')은 항상 true 를 돌려준다. 즉 호출측은 쿠폰
--    종류를 신경 쓰지 않고 무조건 이 함수를 부르면 된다 — "발급형일 때만
--    확인" 같은 분기가 호출측에 복제되면 그게 곧 드리프트다.
--
--    게스트(p_user_id IS NULL)는 발급형 쿠폰에서 항상 false 다. 권리는
--    사람에게 붙으므로 소유자를 특정할 수 없으면 성립하지 않는다 —
--    max_uses_per_user 가 걸린 쿠폰에 login_required 를 붙이는 것과 같은
--    방향이고, 실제로 3)/3-b)절 CASE 는 login_required 를 먼저 평가해
--    "로그인하면 될 수도 있다" 를 우선 안내한다.
--
--    fail-closed: 없는 쿠폰 id 로 부르면 c CTE 가 0행이라 전체가 NULL 이
--    되므로 coalesce(..., false) 로 "발급 안 됨" 을 돌려준다 —
--    fn_coupon_is_redeemed 가 모르는 쿠폰을 "소진" 으로 막는 것과 같은
--    방향이다(불리언의 방향이 반대라 기본값도 반대다).
--
--    만료 판정이 없는 이유는 1-h)절 참고(발급 만료일 컬럼을 두지 않았다 —
--    쿠폰 자신의 valid_until 은 3)/3-b)/4)절이 발급 여부와 독립적으로 이미
--    평가한다).
-- ---------------------------------------------------------------------
create or replace function public.fn_coupon_is_granted(
  p_coupon_id uuid,
  p_user_id   uuid
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
        select grant_type
        from public.coupons
        where id = p_coupon_id
      )
      select
        c.grant_type <> 'granted'
        or exists (
          select 1
          from public.coupon_grants g
          where g.coupon_id = p_coupon_id
            and p_user_id is not null
            and g.user_id = p_user_id
            and g.revoked_at is null
        )
      from c
    ),
    false
  );
$$;

comment on function public.fn_coupon_is_granted(uuid, uuid) is
  '발급 판정 정본. 조건형(grant_type=auto)은 항상 true. 발급형은 coupon_grants 에 회수되지 않은 발급 행이 있어야 true. 게스트(user_id NULL)는 발급형에서 항상 false. 없는 쿠폰은 false(fail-closed).';

revoke all on function public.fn_coupon_is_granted(uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.fn_coupon_is_granted(uuid, uuid) to service_role;

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
      -- 발급형(grant_type='granted')은 발급받은 사람만. 조건형은 항상 true 라
      -- 이 항이 회귀를 만들지 않는다(2-c절).
      and chk.is_granted
      and not chk.is_redeemed
      and not chk.is_sold_out
    ) as eligible,
    case
      when not c.is_active then 'inactive'
      when c.valid_until is not null and c.valid_until < v_today then 'expired'
      when coalesce(p_subtotal, 0) < c.min_amount then 'below_min_amount'
      -- login_required 를 not_granted 보다 먼저 본다 — 비로그인 상태에서
      -- "당신에게 발급되지 않았다" 는 사실이 아니라 확인할 수 없다는 뜻이다.
      when c.max_uses_per_user is not null and v_user_id is null then 'login_required'
      when not chk.is_granted then 'not_granted'
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
      public.fn_coupon_global_redeemed(c.id, now()) as is_sold_out,
      public.fn_coupon_is_granted(c.id, v_user_id) as is_granted
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
  '쿠폰 판정 정본(활성 쿠폰만). eligible/reason(below_min_amount|expired|already_used|inactive|login_required|sold_out|not_granted)을 붙여 반환 — inactive 는 구조상 이 함수에서는 나오지 않는다(is_active=false 행 자체를 제외). 코드는 반환하지 않는다 — fn_coupon_by_code 참고.';

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
      -- 발급형(grant_type='granted')은 발급받은 사람만. 조건형은 항상 true 라
      -- 이 항이 회귀를 만들지 않는다(2-c절).
      and chk.is_granted
      and not chk.is_redeemed
      and not chk.is_sold_out
    ) as eligible,
    case
      when not c.is_active then 'inactive'
      when c.valid_until is not null and c.valid_until < v_today then 'expired'
      when coalesce(p_subtotal, 0) < c.min_amount then 'below_min_amount'
      -- login_required 를 not_granted 보다 먼저 본다 — 비로그인 상태에서
      -- "당신에게 발급되지 않았다" 는 사실이 아니라 확인할 수 없다는 뜻이다.
      when c.max_uses_per_user is not null and v_user_id is null then 'login_required'
      when not chk.is_granted then 'not_granted'
      when chk.is_sold_out then 'sold_out'
      when chk.is_redeemed then 'already_used'
      else null
    end as reason
  from public.coupons c
  cross join lateral (
    select
      public.fn_coupon_is_redeemed(c.id, v_user_id, now()) as is_redeemed,
      public.fn_coupon_global_redeemed(c.id, now()) as is_sold_out,
      public.fn_coupon_is_granted(c.id, v_user_id) as is_granted
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

  -- 2026-08-11 발급형 추가 — 발급이 회수된 뒤 승인이 오면 막아야 한다
  -- (주문 생성 시점엔 발급이 있었지만 승인 직전에 관리자가 회수한 경우).
  -- 판정 3종을 LATERAL 로 행당 한 번씩만 계산해 ok/reason 양쪽에서 쓴다 —
  -- 3)절이 같은 이유로 이미 쓰는 패턴이고, 이전 판은 함수를 행당 4번
  -- (ok 2 + reason 2) 불렀다. 발급 판정을 그대로 덧붙이면 6번이 된다.
  return query
  select
    cr.coupon_id,
    (chk.is_granted and not chk.is_redeemed and not chk.is_sold_out) as ok,
    case
      when not chk.is_granted then 'not_granted'
      when chk.is_redeemed then 'already_used'
      when chk.is_sold_out then 'sold_out'
      else null
    end as reason
  from public.coupon_redemptions cr
  cross join lateral (
    select
      public.fn_coupon_is_redeemed(cr.coupon_id, v_user_id, v_now, p_order_id) as is_redeemed,
      public.fn_coupon_global_redeemed(cr.coupon_id, v_now, p_order_id) as is_sold_out,
      public.fn_coupon_is_granted(cr.coupon_id, v_user_id) as is_granted
  ) as chk
  where cr.order_id = p_order_id
    and cr.voided_at is null;
end;
$$;

comment on function public.fn_revalidate_order_coupons(text) is
  'service_role 전용. 결제 승인 직전 호출 — p_order_id 에 귀속된 쿠폰들이 지금도 유효한지, 그 주문 자신의 redemption 은 제외하고 재판정한다(P0-2). 판정 축은 3개다: 발급(not_granted) / 1인 사용 횟수(already_used) / 전체 발행량(sold_out). 행이 없으면 이 주문에 쿠폰이 없다는 뜻(통과). ok=false 행이 있으면 승인을 진행하지 않아야 한다.';

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
--      · 2026-08-11 발급형: fn_coupon_is_granted 판정을 추가했다 — 발급형
--        쿠폰(grant_type='granted')은 발급받지 않은 사용자·게스트에게서
--        조용히 빠진다(다른 판정 실패와 동일하게 continue — 예외를 던지지
--        않는다. 클라이언트는 applied_coupon_ids 대조로 안내한다).
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
    -- 발급형 쿠폰은 발급받은 사람만(2-c절). 조건형은 항상 통과라 회귀 없음.
    -- 판정을 여기서 다시 쓰지 않고 헬퍼를 부르는 이유는 이 파일의 기존
    -- 원칙 그대로다 — 네 함수가 각자 판정하면 드리프트가 생긴다.
    if not public.fn_coupon_is_granted(v_coupon.id, p_user_id) then
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
--   fn_grant_coupon / fn_revoke_coupon_grant     → authenticated, service_role
--   fn_coupon_is_granted 포함 나머지 4개           → service_role 만
--   fn_grant_signup_coupons                      → 트리거 함수(PUBLIC EXECUTE, 1-j절)
-- select proname, pg_get_function_identity_arguments(oid) as args, proacl from pg_proc where proname in (
--   'fn_coupon_is_redeemed','fn_coupon_global_redeemed','fn_usable_coupons',
--   'fn_coupon_by_code','fn_revalidate_order_coupons','fn_redeem_coupons',
--   'fn_void_coupon_redemption','fn_coupon_is_granted','fn_grant_coupon',
--   'fn_revoke_coupon_grant','fn_grant_signup_coupons'
-- );
--
-- 발급형 전환 확인 (2026-08-11):
-- select slug, grant_type, grant_on_signup, is_active from public.coupons order by slug;
--   → signup-2000 만 granted/true. over40k-3000·over80k-5000 은 auto/false.
-- select count(*) from public.coupon_grants;
--   → 전환 직후 0. 신규 가입자부터 트리거가 채운다(기존 회원 소급 발급은
--     별도 판정 사안 — 0-e)절 ⚠️ 주석 참고).
-- select tgname from pg_trigger where tgrelid = 'auth.users'::regclass and not tgisinternal;
--   → on_auth_user_created_coupon_grant 가 보여야 한다.
