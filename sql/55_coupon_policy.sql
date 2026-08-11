-- =====================================================================
-- 쿠폰 판정 DB 통합 + 사용 이력(쿠폰별 사용 횟수 제한)
-- Supabase SQL Editor 에서 실행하세요. (idempotent - 여러 번 실행해도 안전)
-- =====================================================================
--
-- 파일 번호 경위
--   이 워크트리(checkout-renewal) 시점 기준으로 sql/ 최대 접두어는 54
--   (54_program_access_grant.sql, 이 파일에 커밋됨) 다. 다른 워크트리들을
--   훑어보면 54_goal_management.sql · 54_performance_app.sql 도 각자 54를
--   쓰고 있어 번호가 이미 여러 갈래로 갈라진 상태다(sql/52 가 이미
--   goal-app-shell 브랜치와 충돌했던 전례 — 54_program_access_grant.sql:6-12
--   참고). 이 글 작성 시점에 55를 쓰는 워크트리는 하나도 없었지만, 머지
--   순서에 따라 이 번호도 밀릴 수 있다. 실제 선행 의존은 없다 —
--   coupons/orders/order_items(10_pricing_orders.sql)·is_admin()
--   (20_landing_renewal.sql) 만 있으면 이 파일은 단독 실행 가능하다.
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
--   컬럼(NULL=무제한, 아래 0번 절)을 두고 fn_coupon_is_redeemed 를 "존재하면
--   소진"에서 "건수가 이 값에 도달하면 소진"으로 바꿨다 — 헬퍼 하나에 판정을
--   모으는 기존 설계는 그대로 유지(세 함수가 각자 판정하면 방금 없앤 중복이
--   되살아난다).
--
-- 소진 판정 — cron 없는 지연 평가 (핵심 설계)
--   주문 생성 시점에 "소진"을 확정 기록하면 결제 중도 이탈자의 쿠폰이 영구
--   잠긴다(운영에 pending 주문이 다수 존재). 반대로 결제 승인(webhook) 시점
--   에만 기록하면, 같은 쿠폰으로 동시에 만들어진 두 pending 주문이 각각
--   승인될 수 있다. 그래서 "소진 여부"를 저장하지 않고, coupon_redemptions
--   (이 쿠폰이 어떤 주문에 귀속됐는지의 사실 기록) 을 orders.status 와 조인해
--   "지금 이 순간" 평가한다(fn_coupon_is_redeemed):
--     · orders.status in ('paid','waiting_deposit') → 확정 소진.
--       (가상계좌는 이미 confirm-payment.js 가 승인 즉시 waiting_deposit 으로
--        찍는다 — 입금까지 며칠 걸려도 이 시점부터 확정 소진이다.)
--     · orders.status = 'pending' → 최근 30분 이내에 생성된 것만 소진으로
--       친다(소프트 홀드). 근거: waiting_deposit 로 분리되지 않는 pending 은
--       "결제창을 띄우고 완료도 실패도 되지 않은 채 이탈"한 경우뿐이다(카드/
--       간편결제는 결제창 안에서 수 분 내 끝나거나 USER_CANCEL 로 즉시
--       처리된다 — Checkout.jsx:372-378). 이런 이탈은 실패 콜백이 항상
--       오는 게 아니라(네트워크 끊김, 탭 종료) pending 이 DB에 무기한 남을 수
--       있다. 30분이면 새로고침·재시도에 충분한 유예이고, 쿠폰은 재고가
--       아니라 판정 규칙이라 길게 잠겨도 재고 손실이 없다 — 다만 무기한으로
--       두면 정당한 재구매 시도까지 막으므로 시간창을 둔다. cron/리퍼 없이
--       "created_at >= now() - 30분" 조건 하나로 자동 해제된다.
--     · failed / canceled → 소진 아님(재사용 가능). 즉 재시도는 항상 열려
--       있다.
--   시간창은 public.fn_coupon_is_redeemed 한 곳에만 리터럴로 박아 fn_usable_
--   coupons/fn_redeem_coupons 양쪽이 항상 같은 값을 본다(드리프트 방지).
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
--   pg_advisory_xact_lock(hashtextextended('coupon_id:user_id', 0)) 로 (쿠폰,
--   사용자) 쌍을 직렬화한다 — 트랜잭션 종료 시 자동 해제되고, 쿠폰 id
--   오름차순으로만 잠그므로(coupons.id 정렬) 여러 쿠폰을 같이 담아도 잠금
--   순서가 항상 같아 데드락이 생기지 않는다. READ COMMITTED 그대로 안전하다.
--
-- 판정 결과는 필터하지 않고 이유와 함께 반환한다 (fn_usable_coupons)
--   기존엔 min_amount 미달 쿠폰이 이유 없이 opacity-45 로만 보였고,
--   valid_until NULL 쿠폰은 목록에서 조용히 사라졌다. fn_usable_coupons 는
--   coupons 테이블의 행을 하나도 걸러내지 않고 eligible boolean + reason
--   text(코드値, 한국어 문구 아님 — 프런트가 매핑)를 함께 반환한다. reason 은
--   below_min_amount / expired / already_used / inactive 4종을 구분한다
--   (활성인데 조건도 다 맞으면 reason = null). is_active=false(운영자가
--   내린 쿠폰)까지 목록에 올라오는 것은 의도다 — "쿠폰을 걸러내지 말라"는
--   지시를 문자 그대로 지켰고, 판매 종료 쿠폰을 화면에 노출할지는 표시
--   계층(Checkout.jsx) 판단으로 넘긴다(이 프로젝트는 실제로 reason='inactive'
--   를 화면에서 숨기기로 했다 — 판매 중이 아닌 쿠폰을 고객에게 보여줄
--   이유가 없다. api/create-order.js:55-56 절 참고).
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
--   grant된 기존 헬퍼)로 전체 CRUD 를 여는 관리자 정책을 하나 더 둔다 —
--   환불 처리 후 어드민이 Supabase 테이블 에디터에서 직접 redemption 행을
--   지워 쿠폰을 되돌려줄 수 있어야 하기 때문이다(서비스 롤 키 없이도 복구
--   가능해야 한다는 게 program_access 사건의 교훈이다). 이 도메인은
--   is_winning_admin()(4단계 role, 랜딩/CMS 전용)이 아니라 orders 도메인이
--   이미 쓰는 이분법 is_admin() 을 그대로 따른다 — Admin.jsx 에 orders/
--   coupons/refund_requests 화면 자체가 아직 없어 참고할 선례가 없고, 굳이
--   두 관리자 체계를 섞을 이유가 없다.
--
-- orders.coupon_id (단일 컬럼) 처리
--   coupon_redemptions 가 생긴 뒤로 "이 주문에 어떤 쿠폰(들)이 적용됐는가"의
--   정본은 coupon_redemptions 다(N개 지원). orders.coupon_id 는 이 레포
--   전체에서 create-order.js 가 쓰기만 하고 아무도 읽지 않는다(grep 실측 —
--   MyPage.jsx/Admin.jsx 어디에도 소비처가 없다). 그래서 스키마를 깨지 않고
--   "대표 쿠폰 1개, 참고용" 으로 계속 채운다(적용된 쿠폰 중 첫 번째, 없으면
--   NULL) — 향후 이 컬럼을 읽는 화면이 생겨도 완전히 빈 값보다 낫고, FK
--   제약(orders_coupon_id_fkey)도 이미 걸려 있어 걷어낼 실익이 없다.
--
-- 0번 절을 이 파일에 두는 이유 (10 이 아니라 55)
--   coupons 테이블 자체는 sql/10_pricing_orders.sql 이 만든다. 그런데 이
--   파일(55)은 이 글 작성 시점까지 커밋도 안 됐고 dev 에만 적용된 미완성
--   마이그레이션이라, 컬럼을 10 에 소급해 끼워 넣는 대신 55 에서 ALTER 로
--   보강했다 — 파일 수를 늘리지 않으면서도(sql/56 신설 없이) 번호 순서대로
--   (10 → 55) 실행하면 신규 DB 도 최종 형태로 바로 만들어진다. dev 는 이미
--   10 이 적용된 뒤라 이 ALTER 가 실제로 컬럼을 추가하는 경로다.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 0) coupons.max_uses_per_user : 쿠폰별 1인당 사용 가능 횟수.
--    NULL = 무제한 규약. 이 프로젝트는 이미 program_access.expires_at
--    NULL=무기한, coupons.valid_until NULL=무기한 을 쓰고 있어 같은 의미를
--    다른 표현(0, -1, 'infinity')으로 새로 만들지 않고 그대로 따른다. 0 은
--    "쓸 수 없음"이라는 제3의 의미가 되어 혼란만 만들므로 CHECK 로 막는다.
--    컬럼 기본값은 (DEFAULT 절 없이) NULL 이다 — 즉 앞으로 운영자가 새
--    쿠폰을 추가할 때 이 값을 명시하지 않으면 무제한이 기본이 된다는 뜻이니,
--    1인 1회로 걸고 싶은 쿠폰은 반드시 값을 채워야 한다(이 규약은 코드
--    주석에만 있고 어드민 UI 가드는 이 파일 범위 밖이다).
-- ---------------------------------------------------------------------
alter table public.coupons
  add column if not exists max_uses_per_user integer;

alter table public.coupons
  drop constraint if exists coupons_max_uses_per_user_check;
alter table public.coupons
  add constraint coupons_max_uses_per_user_check
  check (max_uses_per_user is null or max_uses_per_user > 0);

comment on column public.coupons.max_uses_per_user is
  '1인당 사용 가능 횟수. NULL = 무제한(상시 할인 쿠폰). 양의 정수 N = 사용자당 N회까지(예: 1인 1회 쿠폰은 1). 0/음수는 CHECK 로 금지.';

-- 시드값 (사용자 확정, 2026-08-11): signup-6000(회원가입 축하, 1인 1회)만
-- 명시적으로 1을 채운다. over40k-3000/over80k-5000 은 컬럼 기본값(NULL =
-- 무제한)이 곧 원하는 값이라 별도 UPDATE 가 필요 없다.
update public.coupons set max_uses_per_user = 1
  where id = 'signup-6000' and max_uses_per_user is distinct from 1;

-- ---------------------------------------------------------------------
-- 1) coupon_redemptions : 쿠폰 사용 이력 (어떤 쿠폰이 어떤 사용자의 어떤
--    주문에 쓰였는지). orders 와 조인해 소진을 판정하므로 order_id 필수.
-- ---------------------------------------------------------------------
create table if not exists public.coupon_redemptions (
  id              bigint generated always as identity primary key,
  coupon_id       text not null references public.coupons (id) on delete cascade,
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
);

-- 소진 판정 조인(coupon_id, user_id)과 만료 시간창(created_at) 조회 경로.
create index if not exists coupon_redemptions_coupon_user_idx
  on public.coupon_redemptions (coupon_id, user_id) where user_id is not null;
-- 어드민 복구(주문 기준으로 redemption 찾기) · order_items 와 대칭되는 인덱스.
create index if not exists coupon_redemptions_order_idx
  on public.coupon_redemptions (order_id);

comment on table public.coupon_redemptions is
  '쿠폰 사용 이력. 소진 여부는 이 테이블 단독이 아니라 orders.status 와 조인해 판정 시점에 평가한다(fn_coupon_is_redeemed) — sql/55_coupon_policy.sql 상단 주석 참고.';

alter table public.coupon_redemptions enable row level security;

drop policy if exists "coupon_redemptions select own" on public.coupon_redemptions;
create policy "coupon_redemptions select own" on public.coupon_redemptions
  for select using (auth.uid() = user_id);

-- 어드민 복구 경로 (program_access 사건 재발 방지 — 위 배경 주석 참고).
-- select 정책과 별개의 PERMISSIVE 정책이라 OR 로 합쳐진다.
drop policy if exists "coupon_redemptions admin manage" on public.coupon_redemptions;
create policy "coupon_redemptions admin manage" on public.coupon_redemptions
  for all using (public.is_admin()) with check (public.is_admin());

-- ---------------------------------------------------------------------
-- 2) fn_coupon_is_redeemed : 소진 판정 내부 헬퍼 (fn_usable_coupons /
--    fn_redeem_coupons 공용 — 30분 시간창과 횟수 비교 기준을 한 곳에서만
--    관리한다). 클라이언트가 직접 부를 이유가 없다(임의 user_id 로 남의
--    사용 이력을 캐물을 수 있다) — anon/authenticated 에 grant 하지 않는다.
--    SECURITY DEFINER 라 이 함수를 호출하는 상위 함수(fn_usable_coupons 등)의
--    실행 컨텍스트(정의자 권한)에서는 이 revoke 와 무관하게 정상 호출된다.
--    2026-08-11: "1건이라도 있으면 소진"(exists) 에서 coupons.max_uses_per_
--    user 와 건수를 비교하는 방식으로 바꿨다. max_uses_per_user 가 NULL
--    (무제한)이면 건수를 셀 것도 없이 항상 false(미소진) — 상시 할인
--    쿠폰(over40k-3000/over80k-5000)이 이 한 줄로 무제한이 된다. 시그니처는
--    그대로다(호출측 fn_usable_coupons/fn_redeem_coupons 수정 불필요).
-- ---------------------------------------------------------------------
create or replace function public.fn_coupon_is_redeemed(
  p_coupon_id text,
  p_user_id   uuid,
  p_at        timestamptz default now()
)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
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
      and (
        o.status in ('paid', 'waiting_deposit')
        or (o.status = 'pending' and cr.created_at >= p_at - interval '30 minutes')
      )
  )
  select
    p_user_id is not null
    and c.max_uses_per_user is not null
    and used.cnt >= c.max_uses_per_user
  from c, used;
$$;

revoke all on function public.fn_coupon_is_redeemed(text, uuid, timestamptz)
  from public, anon, authenticated;
grant execute on function public.fn_coupon_is_redeemed(text, uuid, timestamptz) to service_role;

-- ---------------------------------------------------------------------
-- 3) fn_usable_coupons : 사용 가능 쿠폰 목록 (클라이언트 + 서버 공용 조회).
--    coupons 를 걸러내지 않고 전 행에 eligible/reason 을 붙여 반환한다.
-- ---------------------------------------------------------------------
create or replace function public.fn_usable_coupons(p_subtotal integer default 0)
returns table (
  id              text,
  code            text,
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
    c.code,
    c.title,
    c.discount_amount,
    c.min_amount,
    c.valid_until,
    c.is_active,
    (
      c.is_active
      and (c.valid_until is null or c.valid_until >= v_today)
      and coalesce(p_subtotal, 0) >= c.min_amount
      and not public.fn_coupon_is_redeemed(c.id, v_user_id, now())
    ) as eligible,
    case
      when not c.is_active then 'inactive'
      when c.valid_until is not null and c.valid_until < v_today then 'expired'
      when coalesce(p_subtotal, 0) < c.min_amount then 'below_min_amount'
      when public.fn_coupon_is_redeemed(c.id, v_user_id, now()) then 'already_used'
      else null
    end as reason
  from public.coupons c
  order by c.discount_amount desc;
end;
$$;

comment on function public.fn_usable_coupons(integer) is
  '쿠폰 판정 정본. coupons 전 행에 eligible/reason(below_min_amount|expired|already_used|inactive)을 붙여 반환 — 필터링은 프런트 표시 계층 판단.';

revoke all on function public.fn_usable_coupons(integer) from public;
-- authenticated 뿐 아니라 anon 도 포함한다. api/create-order.js:115-123 이
-- "비회원 결제 허용" 이라 명시하고(userId=null 도 정상 흐름), Checkout.jsx
-- 의 기존 쿠폰 조회에도 로그인 게이트가 없었다 — anon 을 빼면 비회원
-- 결제자에게서 쿠폰 선택 기능 자체가 사라지는 회귀가 된다.
grant execute on function public.fn_usable_coupons(integer) to anon, authenticated, service_role;

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
-- ---------------------------------------------------------------------
create or replace function public.fn_redeem_coupons(
  p_order_id      text,
  p_user_id       uuid,
  p_customer_email text,
  p_order_name    text,
  p_items         jsonb,    -- [{product_id, service_key, name, list_price, price, quantity}]
  p_list_amount   integer,
  p_subtotal      integer,  -- products 합산 판매가 (쿠폰 적용 전)
  p_coupon_ids    text[]
)
returns table (
  order_id           text,
  amount             integer,
  discount_amount    integer,
  coupon_discount    integer,
  applied_coupon_ids text[]
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_now              timestamptz := now();
  v_coupon           record;
  v_coupon_discount  integer := 0;
  v_applied_ids      text[] := '{}';
  v_applied_discounts integer[] := '{}';
  v_discount_total   integer;
  v_amount           integer;
  v_coupon_id_repr   text;
begin
  if p_order_id is null or p_subtotal is null or p_list_amount is null then
    raise exception 'order_id/list_amount/subtotal required';
  end if;

  -- 1) 쿠폰 판정 (DB 쓰기는 아직 없음 — 주문이 아직 존재하지 않아도 되는
  --    단계). coupons.id 오름차순으로 순회해 advisory lock 순서를 고정한다
  --    (여러 쿠폰을 같이 담아도 두 트랜잭션이 서로 다른 순서로 잠그며
  --    맞물리는 데드락이 나지 않는다 — 위 파일 상단 "동시성" 절 참고).
  for v_coupon in
    select c.id, c.discount_amount, c.min_amount, c.valid_until, c.is_active
    from public.coupons c
    where c.id = any (coalesce(p_coupon_ids, '{}'::text[]))
    order by c.id
  loop
    if p_user_id is not null then
      -- (coupon_id, user_id) 쌍을 트랜잭션 종료까지 잠근다. 같은 쌍을 노리는
      -- 동시 요청은 여기서 대기하고, 먼저 커밋된 트랜잭션의 redemption 이
      -- 아래 fn_coupon_is_redeemed 재판정에 반영된 뒤에야 통과 여부가
      -- 갈린다 — SERIALIZABLE 없이 READ COMMITTED 로도 이중 소진을 막는다.
      perform pg_advisory_xact_lock(
        hashtextextended(v_coupon.id || ':' || p_user_id::text, 0)
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
    if public.fn_coupon_is_redeemed(v_coupon.id, p_user_id, v_now) then
      continue;
    end if;

    v_coupon_discount   := v_coupon_discount + v_coupon.discount_amount;
    v_applied_ids       := array_append(v_applied_ids, v_coupon.id);
    v_applied_discounts := array_append(v_applied_discounts, v_coupon.discount_amount);
  end loop;

  -- 합산 할인은 소계를 넘지 못한다(기존 Checkout.jsx:235 / create-order.js:105
  -- 와 동일 규칙 — Math.min(sum, subtotal)).
  v_coupon_discount := least(v_coupon_discount, p_subtotal);
  v_discount_total  := (p_list_amount - p_subtotal) + v_coupon_discount;
  v_amount          := greatest(0, p_list_amount - v_discount_total);

  if v_amount <= 0 then
    -- 기존 api/create-order.js:111-113 과 동일 규칙(결제 금액 0원 이하 거부).
    -- 예외로 함수 전체(= 이 트랜잭션)가 롤백되므로 orders/order_items/
    -- coupon_redemptions 어느 것도 남지 않는다.
    raise exception 'invalid_amount';
  end if;

  -- 대표 쿠폰 1개만 orders.coupon_id 에 참고용으로 남긴다(위 파일 상단
  -- "orders.coupon_id 처리" 절 참고 — 정본은 coupon_redemptions).
  v_coupon_id_repr := case when array_length(v_applied_ids, 1) > 0
                       then v_applied_ids[1] else null end;

  -- 2) 주문 헤더
  insert into public.orders
    (id, user_id, status, order_name, list_amount, discount_amount, amount, coupon_id, customer_email)
  values
    (p_order_id, p_user_id, 'pending', p_order_name, p_list_amount, v_discount_total, v_amount, v_coupon_id_repr, p_customer_email);

  -- 3) 주문 아이템
  insert into public.order_items (order_id, product_id, service_key, name, list_price, price, quantity)
  select
    p_order_id,
    i ->> 'product_id',
    i ->> 'service_key',
    i ->> 'name',
    coalesce((i ->> 'list_price')::integer, 0),
    coalesce((i ->> 'price')::integer, 0),
    coalesce((i ->> 'quantity')::integer, 1)
  from jsonb_array_elements(coalesce(p_items, '[]'::jsonb)) as i;

  -- 4) 쿠폰 귀속(사용 이력). discount_amount 는 위 판정 시점 값을 그대로
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

comment on function public.fn_redeem_coupons(text, uuid, text, text, jsonb, integer, integer, text[]) is
  '서버 전용(service_role). 주문/주문아이템 생성 + 쿠폰 귀속을 한 트랜잭션으로 원자 처리. subtotal/list_amount 는 호출측이 products 로 계산한 신뢰값이어야 한다.';

revoke all on function public.fn_redeem_coupons(text, uuid, text, text, jsonb, integer, integer, text[])
  from public, anon, authenticated;
grant execute on function public.fn_redeem_coupons(text, uuid, text, text, jsonb, integer, integer, text[])
  to service_role;

-- =====================================================================
-- 확인용 (실행 후 눈으로 볼 것)
-- =====================================================================
-- select * from public.fn_usable_coupons(0);       -- 3장 모두 노출, 소액은 below_min_amount
-- select * from public.fn_usable_coupons(50000);   -- over40k-3000 만 eligible 전환
-- select * from public.fn_usable_coupons(90000);   -- over40k-3000 + over80k-5000 eligible
