-- =====================================================================
-- 회차 회계를 부여 원장(program_access_grants) 기반으로 전환
-- Supabase SQL Editor 에서 실행하세요. (idempotent - 여러 번 실행해도 안전)
-- =====================================================================
--
-- 배경 — sql/64 검증에서 나온 결함 A~E (2026-08-12 dev 재현)
--
--   sql/64 는 **기간 계산은 모든 경계에서 정확하다**(KST·달력·윤년·배타
--   상한 전부 실측 통과). 문제는 **회차 회계**뿐이었다 — sql/64
--   fn_sync_program_access_cache(7절)가 (사용자, program_key) 1행짜리
--   집계 스칼라(quota_total/quota_used/expires_at)에 여러 부여를 뭉개
--   넣은 것이 근본 원인이다.
--
--   결함 A — 만료된 미사용 회차가 재구매 시 부활한다
--     sql/64 §7 집계가 `revoked_at is null` 만 걸고 **만료 필터가 없어서**
--     이미 기간이 끝난 부여의 granted_sessions 까지 합산에 들어갔다.
--     실측: 42,000원 12개월 30회권을 0회 쓰고 만료 → 3,500원 1회권 구매 →
--     무기한 31회.
--
--   결함 B — 무기한 부여 하나가 그 program_key 의 기간 상한을 영구
--     무력화한다. **회차뿐 아니라 입장 게이트에도 있다**(2차 조사,
--     아래 "정정 2" 참고) — sql/64 §10 fn_program_access_state 의
--     allowed 판정도 같은 오염된 캐시 스칼라를 본다.
--
--   결함 C — 환불 후 재구매 시 잔여가 어긋난다
--     quota_used 는 생애 누적인데 quota_total 은 살아있는 부여만
--     합산한다. 회수 시 meta - 'quota_total' 로 총량만 지우고 used 는
--     남겨, 재구매 후 quota_total=2/quota_used=2 = 잔여 0 이 된다(결제는
--     됐는데 앱은 "횟수를 모두 사용했어요"를 띄운다, 에러 0줄).
--
--   결함 D — meta 캐스팅에 가드가 없다
--     sql/64 10)절 fn_program_access_state 의
--     `(pa.meta ->> 'quota_total')::int` 에 정규식 가드가 없다. meta 가
--     오염되면 22P02 로 함수 전체가 죽고, api/create-service-ticket.js:
--     156-163 의 `if (error) fail-closed` 때문에 **정상 결제자가 403**
--     을 맞는다.
--
--   결함 E — sql 스위트 재실행이 sql/60 에서 깨진다
--     sql/53 이 susi-1/2/3 를 삽입(program_key NULL) → sql/60 이 그
--     program_key 를 'susi' 로 백필 → sql/64 §3 products_entitlement_
--     shape_check(program_key not null 이면 duration_months·
--     session_quota 중 최소 하나 필요)를 susi 가 위반 → 이미 그
--     제약이 걸린 DB 에서 53→60 을 재실행하면 60 의 UPDATE 자체가
--     23514 로 즉시 실패한다. 수정 위치는 sql/60(아래 "결함 E 수정
--     위치" 참고).
--
-- ---------------------------------------------------------------------
-- 2026-08-12 팀 리드 정정 5건 — 이 버전에 전부 반영했다
-- ---------------------------------------------------------------------
-- Stripe·Orb·Metronome·Lago 4개 시스템 공식 문서 재조사(Lago 는 오픈소스라
-- 스키마 마이그레이션 이력까지 확인) 결과 최초 설계에서 다음을 정정한다.
--
--   정정 1 — 소비 원장은 신규 테이블이 아니다. 배포된
--     performance_credit_ledger 에 grant_id 컬럼 하나만 추가한다(최초
--     설계와 동일한 결론이었다). **반대 부호 되돌림(reversal_of)은
--     채택하지 않는다** — 최초 설계에서 "스키마만 채택, 호출부 없음"
--     으로 넣었던 것을 철회한다. 이유: Lago 가 링크 테이블(1 아웃바운드
--     ↔ N 인바운드 부분 차감)을 두는 것은 하나의 소비가 여러 부여에
--     걸쳐 분할될 수 있어서인데, 우리는 **1 소비 = 1 회차 = 1 부여**라
--     분할 자체가 없다. 환불은 부여 행의 revoked_at 으로 닫히고, 그
--     부여에 귀속된 소비(원장 행)는 살아있는 집계에서 함께 빠진다 —
--     반대 부호 거래를 추가할 이유가 없다(아래 1)절).
--
--   정정 2 — 결함 B 는 회차가 아니라 **입장 게이트**에도 있다.
--     sql/64 §10 fn_program_access_state 의 allowed 가
--     `coalesce(pa.access_expires_at, pa.expires_at)` — 오염된 캐시
--     스칼라 — 로 기간을 판정한다. api/create-service-ticket.js:151 이
--     이 함수를 부르므로, 무기한 1회권 보유자는 30회권의 12개월 기간이
--     끝난 뒤에도 **앱 입장 자체**를 영구 통과한다(5)절에서 이미
--     "살아있는 부여 존재"로 판정하도록 재작성했다 — 이 정정은 그
--     설계가 옳았음을 재확인한 것이고 코드 변경은 없다).
--
--   정정 3 — priority 컬럼을 넣지 않는다(철회).
--     Stripe 의 명시적 priority 는 프로모션·SLA 크레딧처럼 "만료일과
--     무관하게 먼저 태울 부여"가 있을 때 쓴다. 우리 6종은 전부 유상이고
--     그런 정책이 없다 — 나중에 필요해지면 컬럼 하나 추가해 ORDER BY
--     맨 앞에 끼우면 된다(지금 추상화를 미리 만들 이유가 없다). 확정
--     소비 순서는 `expires_at asc nulls last, starts_at asc, created_at
--     asc, id asc` — 만료 임박 우선, 동률이면 먼저 시작한 부여, 마지막
--     은 결정적 tie-break. **단가 기반 tie-break(Orb 방식)도 채택하지
--     않는다** — 우리에 대입하면 무기한 1회권(3,500원)을 30회권(회차당
--     1,400원)보다 먼저 태워 소멸 위험 낮은 쪽을 먼저 쓰는 반대 결과가
--     된다.
--
--   정정 4 — program_access.meta 의 quota_total/quota_used/
--     wc_mixed_term 을 판정에서 배제하는 것으로는 부족해서 **물리적으로
--     삭제**한다(3)절 일회성 정리 + 4)절 fn_sync_program_access_cache
--     재작성으로 이후에도 다시 쌓이지 않게 한다). expires_at/
--     access_expires_at 컬럼은 남기되(배포된 소비 함수·기존 리더가
--     읽는 미러) 판정 근거에서는 계속 뺀다. **program_access 행 자체는
--     남긴다** — 캐시가 아니라 access_status='suspended'(운영자 제재,
--     결제로 자동 해제되면 안 됨)·memo 등 어드민/CS 용 표시값을 담는
--     별개 도메인 객체다. 재작성된 소비 함수(6)절)는 이 행에서
--     **제재만** 읽는다 — 기간·회차는 원장에서만 판정한다.
--
--   정정 5 — 잠금 순서. 배포된 consume_performance_credit 은
--     advisory lock 없이 program_access 행을 직접 잠근다. sql/64 의
--     부여·회수 경로는 "orders 행 → advisory(salt 101, 사용자 단위) →
--     program_access_grants" 순서다(실측: sql/64 677·900행 두 곳 모두
--     `hashtextextended(v_order.user_id::text, 101)`). 소비가 그 반대
--     순서로 program_access 를 먼저 잠그면 두 경로의 잠금 순서가
--     어긋난다. 6)절 재작성에서 **같은 salt 101 을 프로필 단위로** 먼저
--     잡고, 그 뒤에만 program_access_grants 를 잠근다(orders 행은
--     소비 경로가 아예 건드리지 않으므로 그 앞 구간은 해당 없다). 이
--     lock 이 프로필 단위라 같은 사용자의 동시 요청(더블클릭 포함)도
--     자동 직렬화되므로, 최초 설계에 있던 세션 전용 advisory lock
--     (salt 102)은 제거한다 — 중복이었다. 멱등 조회(session_id 로
--     기존 원장 행 찾기)는 이 lock 을 잡은 **뒤**에 두어 already_charged
--     판정이 소진 판정보다 항상 먼저 성립하게 한다.
--
-- ---------------------------------------------------------------------
-- 왜 새 테이블을 만들지 않고 performance_credit_ledger 를 확장하는가
-- ---------------------------------------------------------------------
-- 배포된 consume_performance_credit(uuid,uuid,text) 를 pg_proc.prosrc 로
-- 전문 실측(2026-08-12)한 결과, 이미 정확히 "부여별 소비 원장"의 형태를
-- 가진 테이블이 배포돼 있었다:
--   performance_credit_ledger(id, session_id UNIQUE, profile_id, delta
--   smallint default -1, reason text, created_at) — FK session_id →
--   performance_sessions(id) CASCADE, FK profile_id → profiles(id)
--   CASCADE. dev 실측 0행.
-- 없는 것은 "어느 부여에서 빠졌는지"(grant_id) 하나뿐이다. 새 병렬
-- 테이블을 만들면 두 원장이 서로 다른 진실을 가질 위험이 생기고,
-- 기존 UNIQUE(session_id)가 이미 이중 차감 방어를 문자 그대로 제공하는데
-- 새로 발명할 이유가 없다. dev 가 0행이라 grant_id 를 **즉시 NOT NULL**
-- 로 걸 수 있다(정정 1).
--
-- 되돌림(반대 부호 거래)을 쓰지 않는 이유 — 정정 1 인용, 반복하지 않는다.
--
-- ---------------------------------------------------------------------
-- 결함 E 수정 위치 — 이 파일이 아니라 sql/60
-- ---------------------------------------------------------------------
-- 원인은 sql/60 의 백필 CASE 문이 service_key='susi' 를
-- program_key='susi' 로 매핑하는 것이다. susi 상품은 sql/64 §2 시드
-- 목록(goal/mentor/suhaeng 10종)에 없어 duration_months·session_quota
-- 가 영원히 NULL 이고, susi 의 programs 행 자체가 is_active=false(SSO
-- 입장 앱이 아직 없다)라 program_key 를 가질 실익도 없다.
--
-- 이 파일이 아니라 sql/60 을 고친 이유:
--   · 실패 지점이 sql/60 의 UPDATE 문 자체다 — sql/65 는 순서상
--     sql/64 보다 뒤에 실행되므로, 이 파일에 무엇을 넣어도 sql/60
--     실행 시점의 실패를 막을 수 없다.
--   · susi 의 duration_months·session_quota "정답"이 없다 — 값을
--     지어내 shape check 를 통과시키는 것은 상품 정책 결정, 범위 밖.
--   · sql/53 은 마커 문자열 보호 조항이 있고 "손볼 일이 생기면 새
--     번호의 후속 파일로 처리할 것"이라고 명시한다 — sql/60 에는 그런
--     제약이 없다.
--   · 2026-08-12 dev 의 susi 상품은 0행이다 — sql/60 의 CASE 문 한 줄을
--     고쳐도 **현재 dev 데이터는 전혀 바뀌지 않는다.**
-- 수정 내용: sql/60 §2 백필 UPDATE 의 CASE 문에서
-- `when 'susi' then 'susi'` 분기를 제거해 `else program_key`(= NULL
-- 유지)로 떨어지게 한다.
--
-- ---------------------------------------------------------------------
-- 0) 조사 (2026-08-12 dev(gjowqdiopinhixfivnkx) 실측)
-- ---------------------------------------------------------------------
-- a) baseline: products 10 / coupons 3 / orders 1 / order_items 2 /
--    profiles 8 / programs 5 / program_access 1 / program_access_grants
--    0. 그 1행(7456b574…)의 meta 는 이미 `{}` — 3)절 정리 UPDATE 는
--    지금 데이터를 바꾸지 않는다(비용 0 확인).
-- b) performance_credit_ledger 실측 스키마 — id uuid pk / session_id
--    uuid unique not null, FK→performance_sessions CASCADE / profile_id
--    uuid not null, FK→profiles CASCADE / delta smallint not null
--    default -1 / reason text nullable / created_at timestamptz not
--    null default now(). dev 0행. RLS on, select own 정책 1개뿐.
-- c) performance_sessions 실측 — id/profile_id(FK→profiles CASCADE)/
--    status/기타 폼 컬럼. dev 0행. RLS select own 1개.
-- d) consume_performance_credit(uuid,uuid,text) 전문 실측
--    (pg_proc.prosrc) — SECURITY DEFINER, proacl=
--    `{postgres=X/postgres,service_role=X/postgres}`.
--    p_reason 기본값 'recommend-topics:first-success' —
--    pg_get_function_identity_arguments 는 기본값을 안 보여줘서 최초
--    CREATE OR REPLACE 가 42P13 으로 실패했고, pg_get_function_
--    arguments 로 재확인해 기본값을 포함시켜 재적용했다(DDL 전체가
--    원자적으로 롤백됐음을 information_schema 로 재확인 후 재시도).
-- e) sql/64 677·900행 — 부여·회수 advisory lock 은 둘 다
--    `hashtextextended(v_order.user_id::text, 101)`. 6)절이 그대로 쓴다.
-- f) products susi 상품 실측 — service_key='susi' 조건 0행(2026-08-12).
--    결함 E 는 지금 안 보이지만 스위트 재실행에서 재현된다(검증 절
--    begin/rollback 으로 직접 재현 확인).
--
-- 반환 status 어휘 6종 (consume_performance_credit, 전부 보존):
--   session_not_found | already_charged | no_entitlement |
--   entitlement_expired | quota_exhausted | charged
-- 반환 키 8종 (전부 보존): status, charged, quota_total, quota_used,
--   quota_remaining, plan_ends_at, ledger_id, program_key.
-- suspended(제재)는 새 status 를 만들지 않고 entitlement_expired 로
-- 흡수한다 — 배포본 자신이 원래 `access_status in ('expired',
-- 'suspended')` 를 같은 status 로 묶었다(실측 원문 6)단계).
--
-- ---------------------------------------------------------------------
-- 보고만 하고 손대지 않은 것 (팀 리드 지시)
-- ---------------------------------------------------------------------
--   · mentor 프로그램(mentor-1, 50,000원 1회권)의 소비 경로가 없다.
--     consume_performance_credit 은 c_program_key := 'suhaeng' 상수로
--     고정돼 있고(배포본 원문 그대로, 이 파일도 유지), 이 저장소·미머지
--     performance-app 어디에도 mentor 회차를 차감하는 코드를 확인할
--     방법이 없다(grep 0건). 오프라인 상담이라 그럴 수 있으나 확인은
--     안 됐다. 시그니처를 바꿀 수 없어 program_key 인자로 일반화하지
--     않았다 — 사실만 보고.
--   · performance_credit_ledger 의 RLS — on, 정책은
--     `performance_credit_ledger_select_own`(select, profile_id =
--     auth.uid()) 1개뿐이다. insert/update/delete 정책이 없어 RLS
--     기본거부로 SECURITY DEFINER 경유만 실질적으로 쓸 수 있다(단,
--     anon/authenticated 에 테이블 레벨 INSERT/UPDATE/DELETE 권한 자체는
--     Supabase 기본 부여로 남아 있다 — RLS 로만 막힌 상태, 성능앱 소유
--     테이블이라 범위 밖).
--
-- ---------------------------------------------------------------------
-- 이 파일이 하지 않는 것 (명시적 제외)
-- ---------------------------------------------------------------------
--   · susi 의 duration_months/session_quota 값 결정 — 상품 정책 결정,
--     범위 밖.
--   · performance_credit_ledger 의 anon/authenticated 테이블 레벨 권한
--     회수 — 성능앱 소유 테이블의 권한 모델 변경, 범위 밖(위 보고 항목).
--   · fn_grant_program_access_for_order / fn_revoke_program_access_for_
--     order 본문 수정 — sql/64 그대로 쓴다.
--   · quota 0 + 기간 유효 상태의 "입장" 허용/차단 — sql/64 §10 과 동일
--     하게 미결로 남긴다.
-- =====================================================================


-- ---------------------------------------------------------------------
-- 1) performance_credit_ledger : 부여 원장으로 승격
--    DELETE 금지(원장 관례, sql/64 §6 program_access_grants 와 동일).
--    반대 부호 되돌림은 쓰지 않는다(정정 1) — grant_id 하나만 추가한다.
-- ---------------------------------------------------------------------
alter table public.performance_credit_ledger
  add column if not exists grant_id uuid references public.program_access_grants(id) on delete restrict;

-- dev 0행이라 즉시 NOT NULL 가능(정정 1). 소비(delta<0)든 향후 다른
-- 용도든, 이 파일이 적용하는 함수는 항상 grant_id 를 채운다.
alter table public.performance_credit_ledger
  alter column grant_id set not null;

comment on column public.performance_credit_ledger.grant_id is
  '이 소비가 차감된 부여(program_access_grants.id). 회차 잔여는 이제 이 컬럼으로 부여별로 계산한다 — (사용자, program_key) 1행 집계가 아니다(결함 A/B/C, sql/65). program_key 컬럼을 원장에 따로 두지 않는다 — grant_id → grants.program_key 파생값이고, 파생 컬럼을 심는 것이 애초에 고치는 병이다.';

create index if not exists performance_credit_ledger_grant_idx
  on public.performance_credit_ledger (grant_id);


-- ---------------------------------------------------------------------
-- 2) fn_program_access_grants_summary : 부여별 원장에서 재계산하는
--    단일 정본. consume_performance_credit(6절)과
--    fn_program_access_state(7절)가 이 함수 하나만 거쳐 원장을 읽는다.
--
--    live_count/quota_total/quota_used/unlimited_sessions 는 **만료되지
--    않고 회수되지 않은** 부여만 본다(결함 A/B 의 해소 지점). expires_at
--    /unlimited_period 는 **회수되지 않은 부여 전체**(만료 여부 무관)를
--    본다 — "지금까지의 기간 상한이 언제였나"를 표시하는 값이라 이미
--    지난 만료일도 보여야 한다(sql/64 (바)절의 무기한·기간제 혼합 표시
--    관례를 그대로 승계 — 표시는 뭉개져도 게이트는 뭉개지지 않는다).
-- ---------------------------------------------------------------------
create or replace function public.fn_program_access_grants_summary(
  p_profile_id  uuid,
  p_program_key text
)
returns table (
  live_count          integer,
  quota_total         integer,
  quota_used          integer,
  expires_at          timestamptz,
  unlimited_period    boolean,
  unlimited_sessions  boolean
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select
    coalesce((
      select count(*)
        from public.program_access_grants g
       where g.profile_id = p_profile_id and g.program_key = p_program_key
         and g.revoked_at is null
         and (g.expires_at is null or g.expires_at > now())
    ), 0)::int as live_count,

    (
      select case when bool_or(g.granted_sessions is null) then null
                  else sum(g.granted_sessions) end
        from public.program_access_grants g
       where g.profile_id = p_profile_id and g.program_key = p_program_key
         and g.revoked_at is null
         and (g.expires_at is null or g.expires_at > now())
    )::int as quota_total,

    coalesce((
      select sum(-l.delta)
        from public.performance_credit_ledger l
        join public.program_access_grants g on g.id = l.grant_id
       where g.profile_id = p_profile_id and g.program_key = p_program_key
         and g.revoked_at is null
         and (g.expires_at is null or g.expires_at > now())
    ), 0)::int as quota_used,

    (
      select case when bool_or(g.expires_at is null) then null else max(g.expires_at) end
        from public.program_access_grants g
       where g.profile_id = p_profile_id and g.program_key = p_program_key
         and g.revoked_at is null
    ) as expires_at,

    coalesce((
      select bool_or(g.expires_at is null)
        from public.program_access_grants g
       where g.profile_id = p_profile_id and g.program_key = p_program_key
         and g.revoked_at is null
    ), false) as unlimited_period,

    coalesce((
      select bool_or(g.granted_sessions is null)
        from public.program_access_grants g
       where g.profile_id = p_profile_id and g.program_key = p_program_key
         and g.revoked_at is null
         and (g.expires_at is null or g.expires_at > now())
    ), false) as unlimited_sessions;
$$;

comment on function public.fn_program_access_grants_summary(uuid, text) is
  '부여 원장(program_access_grants)+소비 원장(performance_credit_ledger)에서 회차·기간 요약을 매번 재계산한다. 굳혀 저장하지 않는다(sql/64 (마)절과 동일 원칙). consume_performance_credit·fn_program_access_state 공용 정본(sql/65).';

revoke all on function public.fn_program_access_grants_summary(uuid, text) from public, anon, authenticated;
grant execute on function public.fn_program_access_grants_summary(uuid, text) to service_role;


-- ---------------------------------------------------------------------
-- 3) program_access.meta 일회성 정리 (정정 4)
--    quota_total/quota_used/wc_mixed_term 을 물리적으로 삭제한다.
--    dev 실측 0-a 절 — 현재 이 세 키를 가진 행이 없어 이 UPDATE 는
--    지금 0행을 바꾼다(비용 0). 이후에도 다시 쌓이지 않도록 4)절이
--    fn_sync_program_access_cache 자체를 재작성한다 — 이 UPDATE 만으로는
--    다음 결제/환불에서 곧바로 되살아난다.
-- ---------------------------------------------------------------------
update public.program_access
   set meta = coalesce(meta, '{}'::jsonb) - 'quota_total' - 'quota_used' - 'wc_mixed_term'
 where meta ?| array['quota_total', 'quota_used', 'wc_mixed_term'];


-- ---------------------------------------------------------------------
-- 4) fn_sync_program_access_cache 재작성 (정정 4)
--    sql/64 §7 본문에서 **meta 계산 부분만** 바꿨다 — payment_status/
--    access_status 전이, 두 만료 컬럼 미러(access_expires_at/expires_at),
--    paid_amount, starts_at 등 나머지 로직은 전부 sql/64 원문 그대로다.
--    meta 는 이제 quota_total/quota_used/wc_mixed_term 을 **절대 쓰지
--    않고**, 그 세 키가 남아 있으면 매번 지운다(자기 정화 — 3)절 일회성
--    정리가 나중에 다시 필요해지지 않는다). 반환 jsonb 의 quota_total/
--    unlimited_sessions/mixed_term 필드는 **로그·응답 전용**으로 계속
--    계산한다(confirm-payment.js 가 console.log 로만 쓴다, DB 에
--    저장되지 않는다) — 반환 형태를 바꾸면 그 로그 호출부와 어긋난다.
-- ---------------------------------------------------------------------
create or replace function public.fn_sync_program_access_cache(
  p_profile_id           uuid,
  p_program_key          text,
  p_empty_payment_status text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_live            int;
  v_unlimited_term  boolean;
  v_has_term        boolean;
  v_max_expires     timestamptz;
  v_unlimited_quota boolean;
  v_quota_total     int;
  v_paid_sum        int;
  v_min_start       timestamptz;
  v_expires_cache   timestamptz;
  v_mixed           boolean;
begin
  select count(*),
         bool_or(g.expires_at is null),
         bool_or(g.expires_at is not null),
         max(g.expires_at),
         bool_or(g.granted_sessions is null),
         coalesce(sum(g.granted_sessions), 0),
         coalesce(sum(g.paid_amount), 0),
         min(g.starts_at)
    into v_live, v_unlimited_term, v_has_term, v_max_expires,
         v_unlimited_quota, v_quota_total, v_paid_sum, v_min_start
    from public.program_access_grants g
   where g.profile_id  = p_profile_id
     and g.program_key = p_program_key
     and g.revoked_at is null;

  -- ── 살아있는 부여가 없다 ──────────────────────────────────────────
  if v_live = 0 then
    if p_empty_payment_status is null then
      return jsonb_build_object('program_key', p_program_key, 'action', 'noop', 'live_grants', 0);
    end if;

    update public.program_access pa
       set payment_status    = p_empty_payment_status,
           access_status     = 'inactive',
           access_expires_at = null,
           expires_at        = null,
           paid_amount       = 0,
           -- quota_total/quota_used/wc_mixed_term 을 더 이상 쓰지 않는다
           -- (정정 4) — 남아 있으면 지운다. 다른 키는 건드리지 않는다.
           meta              = (coalesce(pa.meta, '{}'::jsonb) - 'quota_total' - 'quota_used' - 'wc_mixed_term'),
           updated_at        = now()
     where pa.id = p_profile_id
       and pa.program_key = p_program_key;

    return jsonb_build_object('program_key', p_program_key, 'action', 'closed',
                              'live_grants', 0, 'payment_status', p_empty_payment_status);
  end if;

  -- ── 살아있는 부여가 있다 → 기간·금액을 재계산(회차는 meta 에 쓰지 않는다) ──
  v_expires_cache := case when v_unlimited_term then null else v_max_expires end;
  v_mixed         := v_unlimited_term and v_has_term;

  insert into public.program_access as pa (
    id, program_key, payment_status, access_status, paid_amount, paid_at,
    access_started_at, starts_at, access_expires_at, expires_at,
    profile_id, user_id, meta, updated_at
  ) values (
    p_profile_id, p_program_key, 'paid', 'active', v_paid_sum, v_min_start,
    v_min_start, v_min_start, v_expires_cache, v_expires_cache,
    p_profile_id, p_profile_id,
    '{}'::jsonb,
    now()
  )
  on conflict (id, program_key) do update set
    payment_status    = 'paid',
    access_status     = 'active',
    paid_amount       = excluded.paid_amount,
    paid_at           = excluded.paid_at,
    access_started_at = excluded.access_started_at,
    starts_at         = excluded.starts_at,
    access_expires_at = excluded.access_expires_at,
    expires_at        = excluded.expires_at,
    profile_id        = excluded.profile_id,
    user_id           = excluded.user_id,
    -- 다른 키는 보존하고 회차 관련 3개 키만 지운다(정정 4 — 물리적 삭제,
    -- 자기 정화). 이 함수가 그 키들을 다시는 쓰지 않으므로 한 번 지워지면
    -- 재부여·재환불을 거듭해도 되살아나지 않는다.
    meta = coalesce(pa.meta, '{}'::jsonb) - 'quota_total' - 'quota_used' - 'wc_mixed_term',
    updated_at = now();

  return jsonb_build_object(
    'program_key',        p_program_key,
    'action',             'synced',
    'live_grants',        v_live,
    'expires_at',         v_expires_cache,
    'unlimited_period',   coalesce(v_unlimited_term, false),
    'unlimited_sessions', coalesce(v_unlimited_quota, false),
    'quota_total',        case when v_unlimited_quota then null else v_quota_total end,
    'mixed_term',         coalesce(v_mixed, false),
    'paid_amount',        v_paid_sum
  );
end;
$$;

comment on function public.fn_sync_program_access_cache(uuid, text, text) is
  'program_access(캐시)를 program_access_grants(원장)의 살아있는 행에서 재계산한다. sql/64 원문에서 meta 계산만 재작성했다(정정 4) — quota_total/quota_used/wc_mixed_term 을 더 이상 meta 에 쓰지 않고, 남아 있으면 지운다. 반환 jsonb 의 quota_total 등은 로그 전용이며 저장되지 않는다.';

revoke all on function public.fn_sync_program_access_cache(uuid, text, text) from public, anon, authenticated;
grant execute on function public.fn_sync_program_access_cache(uuid, text, text) to service_role;


-- ---------------------------------------------------------------------
-- 5) program_access_grants 관련 추가 컬럼 없음 (정정 3)
--    priority 컬럼은 넣지 않는다 — 위 헤더 "정정 3" 참고. 소비 순서는
--    6)절의 ORDER BY 로만 표현한다.
-- ---------------------------------------------------------------------


-- ---------------------------------------------------------------------
-- 6) consume_performance_credit : 원장 기반 재작성
--    시그니처(p_session_id uuid, p_profile_id uuid, p_reason text
--    default 'recommend-topics:first-success')와 반환 형태(jsonb 8키)를
--    그대로 유지한다.
--
--    잠금 순서(정정 5) — advisory(salt 101, 프로필 단위, sql/64 부여·
--    회수와 동일 축) → program_access_grants for update. program_access
--    행은 락 없이 읽기만 한다(제재 여부만, 정정 4).
-- ---------------------------------------------------------------------
create or replace function public.consume_performance_credit(
  p_session_id uuid,
  p_profile_id uuid,
  p_reason     text default 'recommend-topics:first-success'::text
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  -- 배포본과 동일 — 회차가 붙는 program_key 는 운영 DB·env 에 이미 박힌
  -- 기존 값이라 개명하지 않는다. mentor 소비 경로는 없다(위 헤더 "보고만
  -- 하고 손대지 않은 것" 참고).
  c_program_key constant text := 'suhaeng';

  v_owns        boolean;
  v_ledger_id   uuid;
  v_summary     record;
  v_access      public.program_access;

  v_grant       record;
  v_selected_id uuid;
  v_live_count  int := 0;
  v_ever_exists boolean;
  v_consumed    int;
begin
  -- 1) 세션 존재 + 소유권. 배포본과 동일 — SECURITY DEFINER 라 RLS 가
  --    적용되지 않으므로 여기서 직접 확인한다.
  select exists (
    select 1
      from public.performance_sessions s
     where s.id = p_session_id
       and s.profile_id = p_profile_id
  ) into v_owns;

  if not v_owns then
    return jsonb_build_object(
      'status', 'session_not_found', 'charged', false,
      'quota_total', null, 'quota_used', 0, 'quota_remaining', null,
      'plan_ends_at', null, 'ledger_id', null, 'program_key', c_program_key
    );
  end if;

  -- 2) 잠금 순서 정정(정정 5). sql/64 부여·회수와 같은 salt(101)를
  --    프로필 단위로 잡는다 — program_access_grants 를 이 lock 없이
  --    직접 잠그면(배포본의 원래 버그) sql/64 의 "orders → advisory(101)
  --    → grants" 순서와 어긋나 데드락 가능성이 생긴다. 프로필 단위라
  --    같은 사용자의 동시 요청(더블클릭 포함)도 이 lock 하나로 자동
  --    직렬화된다 — 세션 전용 lock 을 따로 둘 필요가 없다(최초 설계의
  --    salt 102 를 제거했다).
  perform pg_advisory_xact_lock(hashtextextended(p_profile_id::text, 101));

  -- 3) 이미 차감된 세션인가(멱등). lock 을 잡은 **뒤**에 조회한다 —
  --    already_charged 판정이 아래 소진 판정보다 반드시 먼저 성립해야
  --    한다(정정 5). UNIQUE(session_id) 가 세션당 원장 행을 최대
  --    1개로 강제하므로 행 존재 = 차감 완료다(배포본과 동일 계약).
  select l.id into v_ledger_id
    from public.performance_credit_ledger l
   where l.session_id = p_session_id;

  if v_ledger_id is not null then
    select * into v_summary
      from public.fn_program_access_grants_summary(p_profile_id, c_program_key);

    return jsonb_build_object(
      'status', 'already_charged', 'charged', false,
      'quota_total', v_summary.quota_total, 'quota_used', v_summary.quota_used,
      'quota_remaining', case when v_summary.quota_total is null then null
                              else greatest(v_summary.quota_total - v_summary.quota_used, 0) end,
      'plan_ends_at', v_summary.expires_at, 'ledger_id', v_ledger_id,
      'program_key', c_program_key
    );
  end if;

  -- 4) 운영자 제재만 program_access 캐시에서 읽는다(정정 4) — 기간·
  --    회차는 원장에서만 판정한다(아래 5)절). 결제로 자동 해제되면 안
  --    되는 신호라 그대로 존중한다. 잠금 없는 평범한 읽기 — 이 컬럼을
  --    쓰는 어드민 경로가 아직 없고(sql/64 §8-(d)), 있더라도
  --    program_access_grants 를 건드리지 않으므로 위 2)절 lock 과
  --    경합하지 않는다. 새 status 를 만들지 않고 entitlement_expired
  --    로 흡수한다 — 배포본 자신이 이미 expired/suspended 를 같은
  --    status 로 묶었다.
  select * into v_access
    from public.program_access
   where id = p_profile_id and program_key = c_program_key;

  if found and v_access.access_status = 'suspended' then
    return jsonb_build_object(
      'status', 'entitlement_expired', 'charged', false,
      'quota_total', null, 'quota_used', 0, 'quota_remaining', null,
      'plan_ends_at', null, 'ledger_id', null, 'program_key', c_program_key
    );
  end if;

  -- 5) 살아있고 만료되지 않은 부여를 소비 순서로 잠근다(정정 3).
  --    priority 컬럼 없이 만료 임박 우선, 동률이면 먼저 시작한 부여,
  --    마지막은 결정적 tie-break. 매 호출 잠금 폭을 동일하게 유지하려고
  --    이미 선택한 뒤에도 나머지 후보를 계속 순회한다.
  v_selected_id := null;
  for v_grant in
    select g.id, g.granted_sessions
      from public.program_access_grants g
     where g.profile_id  = p_profile_id
       and g.program_key = c_program_key
       and g.revoked_at is null
       and (g.expires_at is null or g.expires_at > now())
     order by g.expires_at asc nulls last, g.starts_at asc, g.created_at asc, g.id asc
       for update
  loop
    v_live_count := v_live_count + 1;

    if v_selected_id is not null then
      continue;
    end if;

    if v_grant.granted_sessions is null then
      v_selected_id := v_grant.id;   -- 무제한 부여. 즉시 채택.
      continue;
    end if;

    select coalesce(sum(-l.delta), 0) into v_consumed
      from public.performance_credit_ledger l
     where l.grant_id = v_grant.id;

    if v_grant.granted_sessions - v_consumed > 0 then
      v_selected_id := v_grant.id;
    end if;
  end loop;

  if v_live_count = 0 then
    -- 살아있는 부여가 없다. "한 번도 없었다"와 "있었지만 전부 회수·
    -- 만료됐다"를 구분한다(배포본의 no_entitlement/entitlement_expired
    -- 어휘를 그대로 승계).
    select exists (
      select 1 from public.program_access_grants g
       where g.profile_id = p_profile_id and g.program_key = c_program_key
    ) into v_ever_exists;

    return jsonb_build_object(
      'status', case when v_ever_exists then 'entitlement_expired' else 'no_entitlement' end,
      'charged', false,
      'quota_total', null, 'quota_used', 0, 'quota_remaining', null,
      'plan_ends_at', null, 'ledger_id', null, 'program_key', c_program_key
    );
  end if;

  if v_selected_id is null then
    -- 살아있는 부여는 있으나 전부 소진됐다.
    select * into v_summary
      from public.fn_program_access_grants_summary(p_profile_id, c_program_key);

    return jsonb_build_object(
      'status', 'quota_exhausted', 'charged', false,
      'quota_total', v_summary.quota_total, 'quota_used', v_summary.quota_used,
      'quota_remaining', 0, 'plan_ends_at', v_summary.expires_at,
      'ledger_id', null, 'program_key', c_program_key
    );
  end if;

  -- 6) 차감 성립 = 원장 INSERT 성공. UNIQUE(session_id) 경합 패배(동시
  --    요청이 advisory lock 창 밖에서 겹치는 극단 케이스의 2차 방어선
  --    — 사실상 2)절 lock 이 이미 직렬화하므로 도달 불가에 가깝다)는
  --    이중 차감하지 않고 already_charged 로 응답한다.
  insert into public.performance_credit_ledger (session_id, profile_id, grant_id, delta, reason)
  values (
    p_session_id, p_profile_id, v_selected_id, -1,
    coalesce(nullif(btrim(p_reason), ''), 'recommend-topics:first-success')
  )
  on conflict (session_id) do nothing
  returning id into v_ledger_id;

  if v_ledger_id is null then
    select l.id into v_ledger_id
      from public.performance_credit_ledger l
     where l.session_id = p_session_id;

    select * into v_summary
      from public.fn_program_access_grants_summary(p_profile_id, c_program_key);

    return jsonb_build_object(
      'status', 'already_charged', 'charged', false,
      'quota_total', v_summary.quota_total, 'quota_used', v_summary.quota_used,
      'quota_remaining', case when v_summary.quota_total is null then null
                              else greatest(v_summary.quota_total - v_summary.quota_used, 0) end,
      'plan_ends_at', v_summary.expires_at, 'ledger_id', v_ledger_id,
      'program_key', c_program_key
    );
  end if;

  select * into v_summary
    from public.fn_program_access_grants_summary(p_profile_id, c_program_key);

  -- program_access.meta 는 더 이상 회차 표시 캐시를 쓰지 않는다(정정
  -- 4) — write-back 하지 않는다. quota_total/quota_used 는 매 조회 시
  -- fn_program_access_grants_summary 가 원장에서 다시 계산한다.
  return jsonb_build_object(
    'status', 'charged', 'charged', true,
    'quota_total', v_summary.quota_total, 'quota_used', v_summary.quota_used,
    'quota_remaining', case when v_summary.quota_total is null then null
                            else greatest(v_summary.quota_total - v_summary.quota_used, 0) end,
    'plan_ends_at', v_summary.expires_at, 'ledger_id', v_ledger_id,
    'program_key', c_program_key
  );
end;
$$;

comment on function public.consume_performance_credit(uuid, uuid, text) is
  '회차 1개 차감(원장 기반, sql/65). 시그니처·반환 형태(jsonb 8키)·status 어휘 6종은 배포본과 동일. 살아있고 만료되지 않은 부여를 expires_at asc nulls last 순으로 소진한다 — 만료·회수된 부여는 대상에서 빠진다(결함 A/B/C 해소). 잠금 순서는 advisory(101, 프로필 단위) → program_access_grants for update(정정 5). program_access 는 제재 여부만 읽는다(정정 4). program_access.meta 에 write-back 하지 않는다.';

-- 배포본 proacl 실측값과 동일하게 유지 — public/anon/authenticated 실행권한 없음, service_role 만.
revoke all on function public.consume_performance_credit(uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.consume_performance_credit(uuid, uuid, text) to service_role;


-- ---------------------------------------------------------------------
-- 7) fn_program_access_state : 입장 판정 재작성 (결함 B/D 해소)
--    시그니처·반환 컬럼 7종은 sql/64 §10 과 동일하게 유지한다 —
--    api/create-service-ticket.js:151 호출부가 이 형태에 의존한다.
--
--    결함 B(정정 2, 입장 게이트까지 확대) 해소 — "만료되지 않은
--    살아있는 부여가 있는가"를 fn_program_access_grants_summary.
--    live_count 로 판정한다. bool_or(expires_at is null) 스칼라 하나에
--    뭉개지 않는다.
--
--    결함 D 해소 — program_access.meta 를 **전혀 읽지 않는다**(캐스팅
--    자체가 사라졌다). quota_total/quota_used/expires_at/unlimited_*
--    는 전부 fn_program_access_grants_summary 가 원장에서 정수·
--    타임스탬프 타입으로 돌려준다.
--
--    payment_status/access_status(결제 여부·관리자 제재)는 여전히
--    program_access 캐시에서 읽는다 — 부여 원장에 대응 개념이 없다.
--    캐시와 원장이 어긋날 때 **기간은 원장이, 제재 여부는 캐시가**
--    정본이라는 분담이다(정정 4).
-- ---------------------------------------------------------------------
create or replace function public.fn_program_access_state(
  p_profile_id  uuid,
  p_program_keys text[]
)
returns table (
  program_key        text,
  allowed            boolean,
  reason             text,
  expires_at         timestamptz,
  unlimited_period   boolean,
  quota_total        integer,
  quota_used         integer,
  unlimited_sessions boolean
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select pa.program_key,
         (pa.payment_status = 'paid'
          and pa.access_status = 'active'
          and s.live_count > 0)                                       as allowed,
         case
           when pa.payment_status <> 'paid'   then 'not_paid'
           when pa.access_status  <> 'active' then 'access_status_' || pa.access_status
           when s.live_count = 0              then 'period_expired'
           else 'ok'
         end                                                           as reason,
         s.expires_at,
         s.unlimited_period,
         s.quota_total,
         s.quota_used,
         s.unlimited_sessions
    from public.program_access pa
   cross join lateral public.fn_program_access_grants_summary(p_profile_id, pa.program_key) as s
   where pa.id = p_profile_id
     and pa.program_key = any(p_program_keys);
$$;

comment on function public.fn_program_access_state(uuid, text[]) is
  '입장 판정 단일 정본(sql/64 M1, sql/65 로 원장 기반 재작성). allowed 는 payment_status=paid + access_status=active + 살아있고 만료되지 않은 부여 존재를 본다(단일 스칼라로 뭉개지 않는다 — 결함 B, 정정 2로 입장 게이트까지 확인). meta jsonb 캐스팅을 전혀 하지 않는다(결함 D). 행이 없으면 0행 = 미보유.';

revoke all on function public.fn_program_access_state(uuid, text[]) from public, anon, authenticated;
grant execute on function public.fn_program_access_state(uuid, text[]) to service_role;


-- =====================================================================
-- 확인용 (실행 후 눈으로 볼 것 — 아래는 주석, 자동 실행되지 않는다)
-- =====================================================================
--
-- V1) 스키마 확인
-- select column_name, is_nullable from information_schema.columns
--  where table_schema='public' and table_name='performance_credit_ledger' and column_name='grant_id';
--                                                             -- 기대: is_nullable = 'NO'
-- select conname from pg_constraint where conrelid = 'public.performance_credit_ledger'::regclass;
--                                                             -- 기대: pkey / session_id 유니크(원래 이름) / FK 3개(session_id·profile_id·grant_id)
-- select count(*) from information_schema.columns
--  where table_schema='public' and table_name='program_access_grants' and column_name='priority';
--                                                             -- 기대: 0 (정정 3, priority 없음)
-- select count(*) from public.program_access where meta ?| array['quota_total','quota_used','wc_mixed_term'];
--                                                             -- 기대: 0
--
-- V2) overload 정확히 1개씩인지
-- select proname, count(*) from pg_proc
--  where pronamespace = 'public'::regnamespace
--    and proname in ('consume_performance_credit','fn_program_access_state','fn_program_access_grants_summary','fn_sync_program_access_cache')
--  group by proname;
--
-- V3) proacl 보존 확인
-- select proname, proacl from pg_proc
--  where pronamespace = 'public'::regnamespace and proname = 'consume_performance_credit';
-- -- 기대: {postgres=X/postgres,service_role=X/postgres} (배포본과 동일)
--
-- =====================================================================
-- 적용 이력
-- =====================================================================
-- dev(gjowqdiopinhixfivnkx) 적용·검증: 2026-08-12(1차) → 팀 리드 정정
-- 5건 반영 재적용·재검증: 2026-08-12(2차, 이 버전). 운영 반영은 별도
-- 절차. 운영 DB(ucjlcvqvinspmrasvsug)는 이 작업 범위에서 읽기조차
-- 하지 않았다(지시).
-- =====================================================================
