-- =====================================================================
-- 66_performance_credit_reversal.sql
-- 회차 차감 되돌림(reversal) 표현 복원 + 콜멘토 소비를 받을 수 있는
-- 형태로 session_id 제약 완화(스키마만 — 소비 함수는 배선하지 않는다)
-- Supabase SQL Editor 에서 실행하세요. (idempotent - 여러 번 실행해도 안전)
-- =====================================================================
--
-- 배경 — 사용자 확정 정책 (2026-08-12, 원문)
--   "mentor는 나중에 "콜멘토 예약 확정"이면 일단 차감. 이후 "멘토"의
--   상황에 따라 바뀌면 회복 등 다시 산정."
--
--   콜멘토 회차는 (1) 예약이 확정되는 시점에 차감하고, (2) 이후 멘토
--   사정으로 상담이 취소·변경되면 그 차감 "한 건"만 되돌린다(회복).
--   이용권 자체는 살아 있다 — program_access_grants.revoked_at 으로
--   부여 전체를 닫는 환불과는 다른 사건이다.
--
--   sql/65 정정 1 은 "반대 부호 되돌림(reversal_of)은 채택하지 않는다"
--   며 최초 설계에서 이미 넣었던 것을 철회했다(근거: 세션 단위
--   되돌림을 호출하는 코드가 0건, 환불은 부여 회수로 다 해소된다).
--   그 판단이 위 정책 확인으로 뒤집혔다 — "부여는 살아있는데 소비 1건
--   만 되돌리는" 사건은 부여 회수로 표현할 수 없다. 이 파일이
--   reversal_of 를 되살린다.
--
-- ---------------------------------------------------------------------
-- 조사 (2026-08-12 dev(gjowqdiopinhixfivnkx) 실측)
-- ---------------------------------------------------------------------
-- a) performance_credit_ledger 현재 제약(팀 리드 지시문의 전제 재검증) —
--    pg_constraint 전수 조회 결과 pkey / profile_id_fkey / session_id_fkey
--    / session_id_key(UNIQUE) / grant_id_fkey 5개뿐이다. 팀 리드가 언급한
--    `performance_credit_ledger_debit_requires_grant_check` 는 **현재 DB
--    에 존재하지 않는다** — grant_id 가 sql/65 §1 에서 이미 무조건
--    NOT NULL 로 걸렸고(정정 1), 그 조건부 CHECK 는 애초에 반영되지
--    않은 상태다. 이 파일은 그 CHECK 를 되살리지 않는다(대상이 없다).
-- b) 소비량 집계 — sql/65 §2 fn_program_access_grants_summary.quota_used
--    와 §6 consume_performance_credit 6)/already_charged 분기 모두
--    `coalesce(sum(-l.delta), 0)` 로 이미 **delta 합산 기반**이다.
--    `count(*)` 가 아니다(팀 리드 지시문 우려는 sql/65 이전 설계 기준
--    이었던 것으로 보인다 — 실측으로 기각). 즉 되돌림 행(delta>0)을
--    추가하는 것만으로 잔여 계산이 자동으로 정확해진다 — 이 파일은
--    집계 함수 본문을 전혀 고치지 않는다(검증 V1 참고).
-- c) consume_performance_credit(uuid,uuid,text) 전문 재확인(pg_proc.prosrc)
--    — INSERT 문이 (session_id, profile_id, grant_id, delta, reason) 5
--    컬럼만 채우고 `on conflict (session_id) do nothing` 을 쓴다(sql/65
--    §6). 이 파일이 추가하는 모든 컬럼(reversal_of/source_kind)은
--    NULL 허용이거나 DEFAULT 가 있어 이 INSERT 문을 고치지 않아도
--    그대로 동작한다(아래 "consume_performance_credit 영향 판정" 참고).
-- d) premium_consult_requests 실측 — 컬럼 10개(id/name/phone/email/
--    service/message/status/admin_note/created_at/updated_at), dev
--    0행, RLS 정책은 `premium_consult_requests_admin_all`(ALL, public
--    role — 즉 is_winning_admin() 없이는 실질적으로 접근 불가한 어드민
--    전용) 1개뿐이고 anon/authenticated INSERT 정책이 없다. 이 저장소
--    코드베이스 전체(src/**, api/**)에서 `premium_consult` 문자열이
--    쓰이는 곳은 sql/47 의 주석 2줄뿐 — 실제로 이 테이블에 쓰거나
--    읽는 프론트/API 코드가 0건이다. 정의 파일 sql/48_premium_consult.sql
--    은 sql/47 §PII 보유기간 확정 대기로 아직 작성되지 않았다(2026-08-12
--    현재도 미작성 — `ls sql/` 확인).
--
--    결론 — premium_consult_requests 는 **콜멘토 "예약 확정" 시스템이
--    아니다.** name/phone/email/service/message 로 구성된 범용 "프리미엄
--    상담 신청(문의)" 인테이크 폼이며(service 는 자유 텍스트로 보임,
--    dev 0행이라 실제 값 확인 불가), 예약 시각·확정 상태·프로그램
--    연결 컬럼이 전혀 없다. src/pages/services/Callmentor.jsx 자체가
--    JSDoc 에 "신청/결제/멘토선택 등 하위 플로우는 이번 범위 제외"라고
--    명시하고, 메인 CTA 는 alertServiceNotReady(서비스 준비중 안내),
--    하단 CTA 는 /pricing 으로 임시 연결한다 — "예약 확정" 이라는
--    사건 자체가 이 저장소 어디에도 없다(팀 리드의 사전 조사와 일치,
--    재확인).
--
-- ---------------------------------------------------------------------
-- 이 파일이 하는 것 — 요약
-- ---------------------------------------------------------------------
--   1) reversal_of 컬럼 복원(self-FK) + 이중 되돌림 방지 유니크.
--   2) delta 부호 CHECK(원본<0 / 되돌림>0).
--   3) 되돌림 행 무결성 트리거 — 원본과 profile_id/grant_id/
--      source_kind 가 일치하고 delta 가 정확히 상쇄되는지 강제한다
--      (CHECK 로는 다른 행을 볼 수 없어 트리거가 필요하다).
--   4) source_kind 컬럼 + session_id nullable 완화. 콜멘토(또는 향후
--      세션이 아닌 다른 소비원)를 받을 수 있도록 하되, suhaeng 경로의
--      기존 보장(세션당 원본 1건)은 그대로 둔다.
--   5) 콜멘토 소비 함수의 향후 모양을 주석으로 남긴다(배선하지 않음).
--
-- ---------------------------------------------------------------------
-- 되돌림 표현 설계 — 팀 리드 초안(session_id 공유)과 다르게 간 이유
-- ---------------------------------------------------------------------
-- 팀 리드가 제시한 초안은 `unique (session_id) where reversal_of is
-- null` — 즉 되돌림 행도 원본과 **같은 session_id** 를 갖는 것을
-- 전제했다. 그대로 가면 기존 `performance_credit_ledger_session_id_key`
-- (평범한 전체 UNIQUE)를 부분 유니크로 바꿔야 하는데, 그러면
-- consume_performance_credit 의 `on conflict (session_id) do nothing`
-- 이 arbiter 인덱스를 못 찾아 42P10(there is no unique or exclusion
-- constraint matching the ON CONFLICT specification)으로 **그 함수
-- 자체가 깨진다** — Postgres 는 부분 유니크 인덱스를 ON CONFLICT
-- arbiter 로 쓰려면 해당 인덱스의 predicate 를 ON CONFLICT 절에도 똑같이
-- 명시해야 한다. 이걸 피하려면 함수 본문을 고쳐야 하는데, 그건 "배포된
-- 함수를 깨뜨리면 안 된다"는 절대 규칙과 정면으로 부딪힌다.
--
-- 대신 이 파일은 **되돌림 행의 session_id 를 항상 NULL 로 둔다.**
-- 되돌림이 "가리키는 세션"은 reversal_of → 원본 행 → 원본의 session_id
-- 로 조인하면 항상 구할 수 있어 정보 손실이 없다. 이러면:
--   · performance_credit_ledger_session_id_key 는 **한 글자도 안 바뀐다**
--     (평범한 전체 UNIQUE 그대로) — "세션당 원본 소비 1건" 보장이
--     기존과 동일하게 유지된다(검증 V3).
--   · consume_performance_credit 의 INSERT ... on conflict (session_id)
--     do nothing 은 그 함수가 스스로 넣는 행이 항상 reversal_of IS NULL
--     (원본 차감)이므로 영향이 전혀 없다 — **이 파일은 그 함수를 단
--     한 줄도 고치지 않는다**(검증 V4).
--   · 콜멘토(향후 source_kind='mentor_call_booking') 소비도 session_id
--     가 필요 없으므로 같은 규칙(session_id NULL)을 그대로 따른다 —
--     "원본이든 되돌림이든, 세션 기반이 아닌 소비는 session_id 를
--     안 쓴다"는 단일 규칙 하나로 수렴한다(아래 4)절 CHECK).
--
-- ---------------------------------------------------------------------
-- consume_performance_credit 영향 판정 (배포본을 실제로 고치지 않는다)
-- ---------------------------------------------------------------------
-- 이 파일이 추가하는 컬럼은 reversal_of(nullable, 기본값 없음 → NULL)
-- 와 source_kind(not null, default 'performance_session') 둘뿐이다.
-- consume_performance_credit 의 INSERT 문은 컬럼 목록을 명시하므로
-- (session_id, profile_id, grant_id, delta, reason) 이 함수가 이
-- 두 컬럼을 몰라도 그대로 컴파일·실행된다 — reversal_of 는 NULL,
-- source_kind 는 DEFAULT 'performance_session' 으로 채워지고, 이는
-- 정확히 "원본 suhaeng 차감"의 의미와 일치한다(4)절 CHECK 를 항상
-- 만족). session_id 를 NOT NULL → nullable 로 완화하는 것도 이 함수가
-- 항상 검증된 실제 session_id(p_session_id, 소유권 확인 통과분)만
-- 넣으므로 동작에 영향이 없다. 시그니처·반환 jsonb 8키·status 어휘
-- 6종·SECURITY DEFINER·proacl 은 이 파일에서 손대지 않는다(검증 V4).
--
-- ---------------------------------------------------------------------
-- 향후 콜멘토 소비 함수 모양 (미구현 — 스키마만 준비, 배선 없음)
-- ---------------------------------------------------------------------
-- 예약 확정 이벤트/테이블이 이 저장소에 없어(위 조사 d) 지금 만들면
-- 죽은 코드다(만료 컬럼 4개 사건의 재발). 콜멘토 예약 시스템이 생기면
-- 아래 형태를 참고한다:
--
--   consume_mentor_call_credit(
--     p_booking_id uuid,               -- 콜멘토 예약 테이블(미정) PK
--     p_profile_id uuid,
--     p_reason     text default 'call-mentor:booking-confirmed'
--   ) returns jsonb
--
--   · c_program_key constant text := '<mentor 의 실제 program_key>'
--     (program-key-target-canonical 메모 — 확정값을 신설 시점에 확인할 것).
--   · 소유권 확인은 예약 테이블에서(그 테이블이 생긴 뒤 결정).
--   · 멱등 조회는 session_id 가 아니라 **새 참조 컬럼**으로 한다 —
--     예: performance_credit_ledger 에 booking_ref uuid 컬럼을 추가하고
--     (예약 테이블이 생긴 뒤 FK 로 확정) `unique (booking_ref) where
--     reversal_of is null` 을 걸면 session_id 경로와 동일한 이중차감
--     방지 패턴이 된다. 지금 이 컬럼을 미리 만들지 않는 이유는 가리킬
--     테이블이 없어 FK 를 걸 수 없고, 예약 테이블 설계가 나오기 전에
--     컬럼 모양(uuid vs bigint, 컬럼명)을 추측하면 나중에 또 고쳐야
--     하기 때문(YAGNI — sql/65 정정 3 이 priority 컬럼을 철회한 것과
--     같은 이유).
--   · INSERT 는 source_kind='mentor_call_booking', session_id=NULL,
--     grant_id=<선택된 mentor 부여>, delta=-1, reversal_of=NULL.
--   · 회복(되돌림) 함수는 suhaeng/mentor 공용 범용 함수 하나로 가능하다
--     — 예: reverse_performance_credit(p_ledger_id uuid, p_reason text)
--     가 원본 행을 조회해 grant_id/profile_id/source_kind 를 그대로
--     상속하고 delta = -원본.delta, session_id/booking_ref = NULL,
--     reversal_of = p_ledger_id 로 INSERT 한다 — 이 파일의 3)절
--     트리거가 그 무결성을 이미 강제하므로 함수 본문은 얇아도 된다.
--     "회복"이 정확히 언제 발동하는지(멘토가 직접 취소 vs 어드민 대행)
--     는 예약 시스템 설계 시 함께 정할 사안.
--
-- =====================================================================


-- ---------------------------------------------------------------------
-- 1) reversal_of 컬럼 복원 + 이중 되돌림 방지
--    같은 원본을 두 번 되돌릴 수 없다 — 부분 유니크 인덱스로 강제한다
--    (reversal_of 가 NULL 인 원본 행은 이 인덱스 대상이 아니다).
-- ---------------------------------------------------------------------
alter table public.performance_credit_ledger
  add column if not exists reversal_of uuid references public.performance_credit_ledger(id) on delete restrict;

create unique index if not exists performance_credit_ledger_reversal_of_uniq
  on public.performance_credit_ledger (reversal_of)
  where reversal_of is not null;

comment on column public.performance_credit_ledger.reversal_of is
  '이 행이 되돌리는 원본 소비 행(self-FK, 같은 테이블). NULL = 원본 차감. 정책: 콜멘토 등 "예약 확정 시 차감 → 멘토 사정으로 취소·변경 시 그 차감 1건만 되돌림"(사용자 확정, sql/66) — 부여 전체를 닫는 환불(program_access_grants.revoked_at)과는 다른 사건이다. 되돌림 행의 session_id 는 항상 NULL 이다(아래 4절 CHECK, 원본 세션은 reversal_of 조인으로 구한다). performance_credit_ledger_reversal_of_uniq 로 같은 원본의 이중 되돌림을 막는다.';


-- ---------------------------------------------------------------------
-- 2) delta 부호 CHECK — 원본 차감은 음수, 되돌림은 양수.
--    (정확한 상쇄 크기 일치는 CHECK 로 표현 불가 — 3)절 트리거가 담당.)
-- ---------------------------------------------------------------------
alter table public.performance_credit_ledger
  drop constraint if exists performance_credit_ledger_reversal_sign_check;
alter table public.performance_credit_ledger
  add constraint performance_credit_ledger_reversal_sign_check
  check (
    (reversal_of is null     and delta < 0)
    or
    (reversal_of is not null and delta > 0)
  );

comment on constraint performance_credit_ledger_reversal_sign_check on public.performance_credit_ledger is
  '원본 소비 행(reversal_of is null)은 delta<0, 되돌림 행(reversal_of is not null)은 delta>0. quota_used 집계가 sum(-delta) 라 이 부호만으로 되돌림이 자동으로 잔여를 회복시킨다(sql/65 §2/§6, count(*) 아님 — sql/66 조사 b).';


-- ---------------------------------------------------------------------
-- 3) 되돌림 행 무결성 트리거
--    CHECK 는 다른 행을 볼 수 없어 "원본과 grant_id/profile_id/
--    source_kind 가 일치하는가", "delta 크기가 정확히 상쇄되는가",
--    "원본 자체가 이미 되돌림 행은 아닌가(되돌림의 되돌림 금지)"는
--    BEFORE INSERT 트리거로 강제한다. UPDATE 는 이 테이블 관례상
--    (원장, DELETE/UPDATE 금지 — sql/65 §1 주석) 애초에 일어나지
--    않는 것으로 보고 INSERT 에만 건다.
-- ---------------------------------------------------------------------
create or replace function public.performance_credit_ledger_validate_reversal()
returns trigger
language plpgsql
as $$
declare
  v_orig public.performance_credit_ledger;
begin
  if new.reversal_of is null then
    return new;
  end if;

  select * into v_orig
    from public.performance_credit_ledger
   where id = new.reversal_of;
  -- FK 가 이미 존재를 보장하므로 not found 는 도달 불가에 가깝지만
  -- for update 없이 조회하는 구간이라 방어적으로 남긴다.
  if not found then
    raise exception 'reversal_target_not_found' using errcode = 'WC013';
  end if;

  if v_orig.reversal_of is not null then
    raise exception 'reversal_of_a_reversal_not_allowed' using errcode = 'WC014';
  end if;

  if new.grant_id is distinct from v_orig.grant_id then
    raise exception 'reversal_grant_mismatch' using errcode = 'WC015';
  end if;

  if new.profile_id is distinct from v_orig.profile_id then
    raise exception 'reversal_profile_mismatch' using errcode = 'WC016';
  end if;

  if new.source_kind is distinct from v_orig.source_kind then
    raise exception 'reversal_source_kind_mismatch' using errcode = 'WC017';
  end if;

  if new.delta <> -v_orig.delta then
    raise exception 'reversal_delta_magnitude_mismatch' using errcode = 'WC018';
  end if;

  return new;
end;
$$;

comment on function public.performance_credit_ledger_validate_reversal() is
  '되돌림 행(reversal_of not null)이 원본 행과 grant_id/profile_id/source_kind 를 그대로 상속하고 delta 가 정확히 상쇄(new.delta = -원본.delta)되는지 강제한다. WC013=원본 없음(방어적, FK 로 사실상 불가) / WC014=되돌림의 되돌림 금지 / WC015=grant_id 불일치 / WC016=profile_id 불일치 / WC017=source_kind 불일치 / WC018=delta 크기 불일치. sql/66.';

drop trigger if exists performance_credit_ledger_validate_reversal_trg on public.performance_credit_ledger;
create trigger performance_credit_ledger_validate_reversal_trg
  before insert on public.performance_credit_ledger
  for each row execute function public.performance_credit_ledger_validate_reversal();


-- ---------------------------------------------------------------------
-- 4) source_kind 컬럼 + session_id nullable 완화 (콜멘토 등 세션이
--    아닌 소비원을 받을 수 있는 형태로).
--
--    performance_credit_ledger.session_id 는 performance_sessions FK
--    라 콜멘토(예약이지 수행평가 세션이 아니다) 소비를 기록할 자리가
--    없다 — 이게 팀 리드가 지적한 핵심 설계 문제다. 아래 CHECK 로
--    "session_id 는 source_kind='performance_session' 인 원본 행에만
--    필수, 그 외(콜멘토 원본 + 모든 되돌림)는 항상 NULL"을 강제한다.
--
--    performance_credit_ledger_session_id_key(전체 UNIQUE)는 그대로
--    둔다 — 위 "되돌림 표현 설계" 절 참고, 건드리면
--    consume_performance_credit 의 ON CONFLICT 가 깨진다.
-- ---------------------------------------------------------------------
alter table public.performance_credit_ledger
  add column if not exists source_kind text not null default 'performance_session';

alter table public.performance_credit_ledger
  drop constraint if exists performance_credit_ledger_source_kind_check;
alter table public.performance_credit_ledger
  add constraint performance_credit_ledger_source_kind_check
  check (source_kind in ('performance_session', 'mentor_call_booking'));

comment on column public.performance_credit_ledger.source_kind is
  '이 소비 행이 무엇을 차감한 것인지. performance_session(기본값, 배포된 consume_performance_credit 이 이 값으로 남긴다) / mentor_call_booking(콜멘토, 소비 함수 미구현 — 위 헤더 "향후 콜멘토 소비 함수 모양" 참고, sql/66). 새 종류가 생기면 CHECK 목록에 추가한다.';

alter table public.performance_credit_ledger
  alter column session_id drop not null;

alter table public.performance_credit_ledger
  drop constraint if exists performance_credit_ledger_session_id_shape_check;
alter table public.performance_credit_ledger
  add constraint performance_credit_ledger_session_id_shape_check
  check (
    (reversal_of is null and source_kind = 'performance_session' and session_id is not null)
    or
    (reversal_of is null and source_kind <> 'performance_session' and session_id is null)
    or
    (reversal_of is not null and session_id is null)
  );

comment on constraint performance_credit_ledger_session_id_shape_check on public.performance_credit_ledger is
  'session_id 는 source_kind=performance_session 인 원본 차감 행에만 필수다. 콜멘토 등 다른 소비원의 원본 행과 모든 되돌림 행(reversal_of not null)은 session_id 를 항상 NULL 로 둔다 — 원본 세션이 필요하면 reversal_of → 원본 행 → session_id 로 조인해서 구한다(sql/66, "되돌림 표현 설계" 절).';


-- =====================================================================
-- 확인용 (실행 후 눈으로 볼 것 — 아래는 주석, 자동 실행되지 않는다)
-- =====================================================================
--
-- V1) 스키마 확인
-- select column_name, is_nullable, column_default from information_schema.columns
--  where table_schema='public' and table_name='performance_credit_ledger'
--    and column_name in ('reversal_of','source_kind','session_id')
--  order by column_name;
--                            -- 기대: reversal_of nullable/no default,
--                            --       source_kind not null/'performance_session',
--                            --       session_id nullable/no default
-- select conname from pg_constraint where conrelid = 'public.performance_credit_ledger'::regclass order by conname;
--                            -- 기대: 기존 5개 + reversal_sign_check + source_kind_check
--                            --       + session_id_shape_check = 8개 CHECK/FK/PK/UNIQUE 계
-- select indexname from pg_indexes where tablename='performance_credit_ledger';
--                            -- 기대: pkey / session_id_key(그대로, 부분 아님) / grant_idx
--                            --       + 이번에 추가한 reversal_of_uniq(부분 유니크)
--
-- V2) 소비량 집계 회귀 없음 확인 — 부여 1개, 원본 차감 2건, 되돌림 1건 → 잔여 +1
-- begin;
--   -- 부여/차감/되돌림 임시 삽입 후 fn_program_access_grants_summary 로 quota_used 확인
--   -- (실제 실행은 profiles/program_access_grants/performance_sessions FK 를
--   --  만족해야 하므로 아래 5)번 실측 절차 참고)
-- rollback;
--
-- V3) 세션당 원본 1건 보장이 그대로인지 — 같은 session_id 로 원본 2건 시도 → 여전히 23505
-- V4) consume_performance_credit 무회귀 — 차감 1회 → 재호출 already_charged,
--     반환 8키·status 6종 그대로, overload 1개, proacl 보존.
-- V5) 이중 되돌림 방지 — 같은 reversal_of 로 두 번째 INSERT 시도 → 23505(부분 유니크).
-- V6) 다른 grant_id/profile_id/source_kind 로 되돌림 시도 → WC015/WC016/WC017.
-- V7) delta 크기 불일치 되돌림 시도(예: 원본 -1 인데 되돌림 +2) → WC018.
--
-- =====================================================================
-- 적용 이력
-- =====================================================================
-- dev(gjowqdiopinhixfivnkx) 적용·검증: 2026-08-12. 운영 DB
-- (ucjlcvqvinspmrasvsug)는 이 작업 범위에서 읽기조차 하지 않았다(지시).
-- =====================================================================
