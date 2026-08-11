-- =====================================================================
-- 이용 기간·회차 정본화 + 부여 원장 신설 (감사 결과 M1 / M6 / M15)
-- Supabase SQL Editor 에서 실행하세요. (idempotent - 여러 번 실행해도 안전)
-- =====================================================================
--
-- 배경 — 감사 결과 M1 (이용 기간·회차가 아무 데도 없다)
--   상품명 문자열에는 기간과 회차가 적혀 있는데(`[12개월 30회 이용권] 위닝
--   수행평가`) 그 정보가 사는 곳이 products.name 한국어 문자열 하나뿐이었다.
--   products 에 기간 컬럼도 회차 컬럼도 없었다(2026-08-11 dev 실측).
--   결과: 3,500원 1회권 구매자와 42,000원 12개월 30회권 구매자의 DB 상 권한이
--   완전히 동일했다.
--
--   program_access 에는 기간 컬럼이 4개(2쌍 중복) 있는데
--     access_started_at / access_expires_at
--     starts_at         / expires_at
--   부여 시 시작일 2개만 채우고 만료일 2개는 일부러 비웠다
--   (api/_lib/programAccess.js 파일 상단 "만료(기간)는 채우지 않는다 — 근거가
--   없다" 절이 그 사실을 자백한다). 그리고 입장 판정(api/create-service-ticket.js)
--   이 select 하는 것은 id, payment_status, access_status 셋뿐이었다.
--   즉 **한 번 부여된 권한은 영구적이었다.** 1개월권 구매자가 3년 뒤에도 들어간다.
--
-- 배경 — 감사 결과 M6 (부여 출처가 없다)
--   부여 단위가 (사용자, 프로그램) 이라 어느 주문이 이 권한을 만들었는지 기록할
--   자리가 없었다. 그래서 B주문을 환불하면 회수가 (user, program_key) 전체를
--   닫아 A주문으로 받은 권한까지 함께 죽었고, 관리자 수동 부여와 결제 부여를
--   데이터로 구별할 수 없었다.
--   실제 사례가 dev 에 있다(2026-08-12 재확인):
--     id=7456b574-2165-48b0-b63f-dec992c2676f / program_key='target'
--     payment_status='paid' / access_status='active' / paid_amount=0
--     memo='QA temp - goal-jungsi-optional verification, keep per instruction'
--   이 사용자 명의의 orders 행이 0건이다 — 돈이 오간 기록 없이 유료 권한이
--   활성 상태다. 관리자 수동 부여로 보이지만 데이터만으로는 확정할 수 없다.
--   그게 M6 의 증상이고, 5)절 원장이 그 상태를 앞으로 만들 수 없게 만든다.
--
-- 배경 — 감사 결과 M15 (같은 uuid 를 담는 식별 컬럼 3개)
--   program_access 의 id(FK → profiles, 정본) / profile_id(FK 없음) /
--   user_id(FK 없음) 가 모두 같은 uuid 를 담는데 등호 제약이 없었다. 판정은
--   3컬럼 OR 순회, 회수는 id 1컬럼만 봐서 **비대칭이라 회수 후에도 권한이 남을
--   수 있었다.** 3)절 등호 CHECK 이 그 비대칭을 닫는다.
--
-- ---------------------------------------------------------------------
-- 왜 이 형태인가 — 6개월 뒤 읽는 사람이 되돌리지 않도록
-- ---------------------------------------------------------------------
-- (가) 왜 program_entitlements 를 새로 만들지 않고 program_access.meta 를
--      계속 쓰는가
--        dev DB 에 public.consume_performance_credit(uuid,uuid,text) 가 이미
--        배포돼 있다(SECURITY DEFINER, prosecdef=true — 2026-08-12 pg_proc
--        실측). 그 함수가 회차·만료 계약을 이미 못박았다:
--          · plan_ends_at = coalesce(access_expires_at, expires_at)
--          · 회차 = meta->>'quota_total' / meta->>'quota_used'
--          · **키 부재 = NULL = 무제한 폴백** (함수 본문 4)-ㄱ 주석에 명시)
--          · 행 선택 = (id or profile_id or user_id) 3컬럼 OR + for update
--          · 만료 판정 = plan_ends_at <= now() → entitlement_expired
--        회차를 새 테이블·새 컬럼으로 옮기면 이 배포된 함수가 키 부재를 만나
--        **무제한으로 fail-open** 한다. 에러 0건, 로그 0줄, 유료 회차만 조용히
--        사라진다. 그래서 정본 위치는 meta 로 유지하고, 원장(5절)을 그 위에
--        얹는다. 타입 컬럼 이전은 performance-app 머지 + 그 RPC 재작성 후의
--        별 작업이다.
--        이 파일이 그 함수를 편하게 해 주는 지점: 만료를 access_expires_at
--        **과** expires_at 두 컬럼에 같은 값으로 함께 쓴다(미러). 리더가
--        coalesce(access_expires_at, expires_at) 이므로, 무기한 부여 때
--        access_expires_at=NULL 만 쓰고 expires_at 을 안 건드리면 낡은
--        expires_at 이 이겨서 **정상 결제자가 차단된다.** 두 컬럼을 함께 쓰는
--        것이 유일하게 안전하다. 중복 컬럼 제거는 이번 범위가 아니다.
--
-- (나) 왜 timestamptz + interval 을 쓰지 않고 timestamp 도메인으로 계산하는가
--        dev 는 TimeZone=UTC 다(실측). 2026-08-12 dev 에서 직접 측정:
--          KST 1/31 00:00 = '2026-01-30 15:00+00'
--          그 값 + interval '1 mon'                  → '2026-02-28 15:00+00'
--                                                     = KST 3/1 00:00  ← 하루 틀림
--          timestamp 도메인 계산(4절 헬퍼)            → '2026-02-27 15:00+00'
--                                                     = KST 2/28 00:00  ← 정답
--        `timestamptz + interval '1 mon'` 은 세션 GUC(TimeZone)에 의존해
--        "UTC 달의 말일"로 클램프하므로 KST 달력과 어긋난다. 그래서 판정·계산
--        경로에서 timestamptz + interval 을 **절대 쓰지 않는다.**
--        4)절 헬퍼가 쓰는 함수는 전부 IMMUTABLE 이다(2026-08-12 pg_proc 실측):
--          timezone(text, timestamptz)=immutable, timezone(text, timestamp)=
--          immutable, date_trunc(text, timestamp)=immutable, make_interval=
--          immutable. ⚠ date_trunc(text, **timestamptz**) 는 STABLE 이므로
--          헬퍼는 반드시 `at time zone` 으로 timestamp 도메인에 먼저 내린 뒤
--          date_trunc 를 부른다. 순서를 바꾸면 IMMUTABLE 선언이 거짓이 된다.
--
-- (다) 만료값의 의미론 = **배타 상한**
--        확정 정책이 "기간 종료 = 만료일 24시(= 익일 00시)" 다. 그래서 저장값은
--        "이 시각 이전까지 유효"인 배타 상한이고, 판정은 `now() < expires_at` 이다.
--        배포된 consume_performance_credit 도 `plan_ends_at <= now()` 를 만료로
--        읽어 같은 의미론이다(실측 확인).
--        **표시용 만료일 = 저장값 - interval '1 day' 의 KST 날짜부.** 이 -1 일은
--        표시 계층에만 존재한다(1/31 결제 1개월권 → 저장 KST 2/28 00:00, 화면
--        만료일 2/27).
--
-- (라) 재구매 = 기간 연장(순차 체이닝). 시작점은
--        greatest(결제일 KST 00시, 해당 program_key 의 살아있는 max(expires_at))
--        GREATEST 는 NULL 을 무시한다(실측) → 선행 부여 없음 / 무기한 선행 모두
--        자동으로 결제일 앵커가 된다.
--        ⚠ **월 산술은 비결합적이다.** 1/31 에 1개월권을 두 번 사면
--          1회차 만료 KST 2/28 → 2회차 만료 KST 3/28 이고,
--          직접 2개월권은 KST 3/31 이다 — 3일 손실.
--          클램프된 2/28 이 새 앵커가 되어 "31일" 앵커가 영구 소실되기 때문이고,
--          손실은 1회 3일에서 멈춘다(2/28 → 3/28 → 4/28). 원 결제일의
--          day-of-month 를 별도 보관하면 피할 수 있으나 그건 정책 결정이라
--          하지 않는다("기간 연장"이라는 확정 문구의 문자적 구현을 택했다).
--
-- (마) 파생 기간을 굳혀 저장하지 않고 살아있는 원장에서 매번 재계산하는 이유
--        굳히면 A주문 환불이 B주문의 starts_at 을 낡은 값으로 남겨 정상 결제자를
--        과소부여한다. 캐시(program_access)는 항상 살아있는 원장 행의 함수다.
--
-- (바) 무기한 회차권과 기간제 회차권이 같은 program_key='suhaeng' 을 공유한다
--        suhaeng-1 = 무기한 1회 / suhaeng-2·6·14·30 = 기간제. 캐시 1행의 정수
--        카운터 1쌍으로는 확정 정책 두 줄("N회권은 기간이 상한, 만료 시 소멸"
--        + "무기한 2종은 그 예외")을 동시에 만족할 수 없다. 이 파일은
--        **결제를 절대 막지 않고**, 원장에 사실을 온전히 보존하고, 캐시는
--        access_expires_at=NULL + quota_total=합계 + meta.wc_mixed_term=true
--        로 표시만 한다. 반대 선택(만료일을 유한값으로)은 확정 정책 문장을
--        직접 위반하므로 후보가 아니다. 정책 확정은 미결 항목이고, 해당 보유자는
--        파일 말미 감시 쿼리 (f) 로 열거된다(현재 0명).
--
-- ---------------------------------------------------------------------
-- 0) 조사 (2026-08-12 dev(gjowqdiopinhixfivnkx) 실측)
-- ---------------------------------------------------------------------
-- a) 규모: products 10 / orders 1 / order_items 2 / program_access 1 /
--    programs 5 / profiles 8. TimeZone=UTC.
-- b) products 컬럼: duration_months·session_quota 없음(이 파일이 추가한다).
--    10행 전부 program_key not null → 1)절 shape CHECK 위반 0행.
-- c) program_access 1행: profile_id = id, user_id = NULL
--    → 3)절 등호 CHECK 위반 0행(NOT VALID 불필요).
-- d) program_access 제약: pkey(id, program_key) / payment_status CHECK
--    (unpaid|pending|paid|refunded|cancelled) / access_status CHECK
--    (inactive|active|expired|suspended) / id → profiles(id) CASCADE /
--    program_key → programs(program_key) **CASCADE**.
--    인덱스 7개(uniq_program_access_id_program_key, idx_program_access_id_program
--    는 pkey 와 중복 — 정리는 이번 범위 아님).
--    RLS on, 정책 1개(program_access_select_own, SELECT).
-- e) profiles.id → auth.users(id) **ON DELETE CASCADE**.
-- f) order_items: id bigint PK / order_id text → orders CASCADE /
--    product_id uuid → products SET NULL. dev 2행 모두 product_id 채워짐.
--    api/create-order.js 가 quantity 를 항상 리터럴 1 로 보내고 product id 를
--    new Set 으로 중복 제거하므로 quantity<>1 · 같은 상품 중복 라인은 도달 불가.
-- g) program_access_grants·_wc_program_access_before_backfill 둘 다 미존재.
-- h) SQLSTATE WC001~WC009 사용 중(sql/55/58/59/61/62) → 이 파일은 WC010~WC012.
-- i) 배포된 public.consume_performance_credit(uuid,uuid,text) 존재
--    (SECURITY DEFINER). 정의 원문은 미머지 performance-app 브랜치에 있다.
-- j) 만료 자동 전이(cron)는 만들 수 없다 — pg_cron·pg_net 미설치,
--    vercel.json crons 0건. 그래서 만료는 판정 시점 lazy 계산이며,
--    저장된 access_status='expired' 는 "거부만 하고 허용은 못 하는" 단조
--    캐시로만 남는다(어떤 코드도 그 값을 쓰지 않는다).
--
-- ---------------------------------------------------------------------
-- 이 파일이 하지 않는 것 (명시적 제외 — 지우거나 앞당기지 말 것)
-- ---------------------------------------------------------------------
--   · program_entitlements 신설 / program_access rename·drop  → 위 (가)
--   · 회차를 타입 컬럼으로 이전, 새 소비 함수 신설            → 위 (가)
--   · 기간 중복 컬럼(starts_at/access_started_at/expires_at) 삭제,
--     잉여 인덱스 2개 삭제, M15 컬럼 삭제·판정 축소
--       42703 위험 + sql/00_base_schema.sql:1087-1092 가 인덱스 6개를
--       IF NOT EXISTS 로 재생성한다 → 운영 재생성이 sql/ 재실행이면 지운
--       인덱스가 부활해 조용히 다시 막는다. 운영 재생성 커밋에 붙일 편도 작업.
--   · 만료 자동 전이(cron)                                    → 위 j)
--   · SSO 티켓 payload 에 만료·회차·readonly 추가 (외부 앱 계약 변경)
--   · enrollments(오프라인 수강) 경로의 만료 — 그 테이블에 기간 컬럼이 0개다
--   · 부분취소 → 라인 단위 자동 회수 (토스 응답에 라인 정보가 없다)
--   · refund_requests 완료 → 자동 회수 트리거 (별 작업)
--   · 어드민 수동 부여·회수 UI (Admin.jsx 에 해당 config 자체가 없다)
--   · paid_amount 의 쿠폰 할인 반영 — 할인은 주문 레벨(sql/58 3절
--     amount = list_amount - discount_amount)이고 order_items 에 할인 컬럼이
--     없다. 기존 결함을 **승계**한다. 그래서 원장 paid_amount 에는 >= 0 만
--     걸고 정산 정본이라고 주장하지 않는다(5절 컬럼 주석에 명시).
--   · 백필(과거 paid 주문 → 원장) — 별 파일. 실행 전 스냅샷 필수이고,
--     dev 의 실제 대상 2건이 모두 미결 결정 사항이다(파일 말미 참고).
-- =====================================================================


-- ---------------------------------------------------------------------
-- 1) products : 이용 기간·회차 (M1 정본)
--    NULL 규약은 이 저장소 기존 규약과 같다 — NULL = 무기한/무제한
--    (coupons.valid_until, coupons.max_uses_per_user, max_redemptions 동일).
-- ---------------------------------------------------------------------
alter table public.products add column if not exists duration_months integer;
alter table public.products add column if not exists session_quota  integer;

comment on column public.products.duration_months is
  '이용 기간(개월). NULL = 무기한. 달력 개월이며 30일 고정이 아니다 — 1/31 결제 1개월권의 만료는 2/28 이다(sql/64 (나)·4)절 헬퍼).';
comment on column public.products.session_quota is
  '이용 회차. NULL = 무제한. 기간이 상한이다 — 만료 시 잔여 회차는 소멸한다(duration_months 가 NULL 인 무기한 상품은 기간이 없으므로 소멸도 없다: mentor-1, suhaeng-1).';


-- ---------------------------------------------------------------------
-- 2) 시드 — 상품 10종 (2026-08-11 사용자 확정)
--    ⚠ CHECK 을 거는 3)절보다 **먼저** 실행되어야 한다. 순서를 뒤집으면
--      기존 10행이 전부 shape CHECK 을 위반해 ALTER 가 실패한다.
--    slug 를 키로 쓴다 — products.slug 는 UNIQUE(실측)이고 상품명(name)은
--    어드민이 문구를 고칠 수 있어 키로 쓸 수 없다(sql/53 이 susi-30 라벨을
--    정정한 선례가 정확히 그 사고다).
-- ---------------------------------------------------------------------
update public.products p
   set duration_months = v.m,
       session_quota   = v.q
  from (values
    ('goal-1m',     1::int,  null::int),
    ('goal-3m',     3,       null),
    ('goal-6m',     6,       null),
    ('goal-12m',    12,      null),
    -- 무기한 1회권 2종. "기간이 상한" 정책의 의도된 예외다(사용자가 그 사실을
    -- 알고 무기한을 선택했다). ⚠ mentor 는 programs 에서 inactive 이고
    -- api/create-service-ticket.js SERVICE_CONFIGS 에도 없다 → 이 회차 1 을
    -- 집행할 입장 경로·차감 지점이 코드에 0개다. 값만 넣고 집행은 없다.
    ('mentor-1',    null,    1),
    ('suhaeng-1',   null,    1),
    ('suhaeng-2',   1,       2),
    ('suhaeng-6',   3,       6),
    ('suhaeng-14',  6,       14),
    ('suhaeng-30',  12,      30)
  ) as v(slug, m, q)
 where p.slug = v.slug;
-- 기대: 10행 갱신. dev 실측 slug·program_key 매핑(2026-08-12):
--   goal-1m/3m/6m/12m → target / mentor-1 → mentor / suhaeng-* → suhaeng


-- ---------------------------------------------------------------------
-- 3) products CHECK 3개
--    멱등 규약은 sql/58 과 동일 — drop constraint if exists → add constraint.
-- ---------------------------------------------------------------------
alter table public.products
  drop constraint if exists products_duration_months_positive_check;
alter table public.products
  add constraint products_duration_months_positive_check
  check (duration_months is null or duration_months > 0);

alter table public.products
  drop constraint if exists products_session_quota_positive_check;
alter table public.products
  add constraint products_session_quota_positive_check
  check (session_quota is null or session_quota > 0);

-- 신규 상품이 조용히 "무기한 무제한"이 되는 경로를 막는다. 이 저장소엔 상품
-- 편집 어드민 화면이 없어 Supabase Studio 직접 입력이 유일한 경로이고(sql/58
-- 1절과 같은 전제), 두 컬럼을 둘 다 비운 상품은 결제되면 영구 무제한 권한이
-- 된다 — 되돌릴 수 없는 손실이라 DB 제약이 유일한 방어선이다.
-- program_key 가 없는 상품(= 권한을 부여하지 않는 상품)은 대상이 아니다.
alter table public.products
  drop constraint if exists products_entitlement_shape_check;
alter table public.products
  add constraint products_entitlement_shape_check
  check (program_key is null or duration_months is not null or session_quota is not null);

comment on constraint products_entitlement_shape_check on public.products is
  '권한을 부여하는 상품(program_key not null)은 기간이나 회차 중 최소 하나를 반드시 가져야 한다. 둘 다 NULL 이면 결제 시 영구 무제한 권한이 되고 되돌릴 수 없다(M1, 2026-08-12).';


-- ---------------------------------------------------------------------
-- 4) program_access 식별 컬럼 등호 제약 (M15)
--    위반 0행 실측 → NOT VALID 불필요, 즉시 VALID 로 걸린다.
--    이 제약이 걸린 순간 "판정은 3컬럼 OR, 회수는 id 1컬럼"이라는 비대칭이
--    닫힌다 — 3컬럼 OR ≡ id 단일이 관례가 아니라 **제약으로 증명**된다.
--    그래서 아래 8)절 판정 함수는 id 단일 조회로 쓸 수 있고, 배포된
--    consume_performance_credit 의 3컬럼 OR 잠금과도 같은 행을 본다.
--    ⚠ 컬럼 삭제·판정 축소는 하지 않는다 — 그 RPC 가 3컬럼 OR 로 행을
--      잠그므로, 등호가 증명된 뒤 순서 의존 없이 나중에 할 수 있는 일이다.
-- ---------------------------------------------------------------------
alter table public.program_access
  drop constraint if exists program_access_identity_equality_check;
alter table public.program_access
  add constraint program_access_identity_equality_check
  check ((profile_id is null or profile_id = id)
     and (user_id    is null or user_id    = id));

comment on constraint program_access_identity_equality_check on public.program_access is
  'id(정본, FK → profiles) / profile_id / user_id 는 같은 uuid 여야 한다. 이 등호가 없으면 3컬럼 OR 판정과 id 단일 회수가 서로 다른 행을 봐서 회수 후에도 권한이 남는다(M15, 2026-08-12).';


-- ---------------------------------------------------------------------
-- 5) KST 달력 산술 헬퍼 (IMMUTABLE)
--    근거는 파일 상단 (나) 절. 판정·계산 경로에서 timestamptz + interval 을
--    쓰지 말고 반드시 이 두 함수를 경유할 것.
-- ---------------------------------------------------------------------
create or replace function public.fn_kst_day_start(p_ts timestamptz)
returns timestamptz
language sql
immutable
as $$
  -- timestamptz → (at time zone) timestamp → date_trunc(immutable 판) →
  -- (at time zone) timestamptz. 세션 GUC 를 타지 않는다.
  select (date_trunc('day', p_ts at time zone 'Asia/Seoul') at time zone 'Asia/Seoul');
$$;

comment on function public.fn_kst_day_start(timestamptz) is
  '주어진 시각이 속한 KST 날짜의 00:00 을 돌려준다. 기간 시작 앵커 계산용(확정 정책: 기간 시작 = 결제 확정일 KST 00시). 세션 TimeZone 에 의존하지 않는다(sql/64 (나)).';

create or replace function public.fn_add_months_kst(p_ts timestamptz, p_months integer)
returns timestamptz
language sql
immutable
as $$
  -- p_months IS NULL = 무기한 → NULL 을 돌려준다(호출부가 그 규약에 의존한다).
  -- make_interval(months => n) 은 달력 개월이라 말일을 클램프한다:
  --   KST 1/31 + 1개월 = KST 2/28,  KST 2/29(윤년) + 12개월 = KST 2/28.
  select case
           when p_months is null then null
           else ((date_trunc('day', p_ts at time zone 'Asia/Seoul')
                  + make_interval(months => p_months)) at time zone 'Asia/Seoul')
         end;
$$;

comment on function public.fn_add_months_kst(timestamptz, integer) is
  'KST 달력 기준 개월 덧셈. 반환값은 이용 기간의 **배타 상한**이다(만료일 24시 = 익일 00시). p_months IS NULL → NULL(무기한). timestamptz + interval 은 세션 TimeZone 에 의존해 하루 틀리므로 쓰지 말 것(sql/64 (나)).';


-- ---------------------------------------------------------------------
-- 6) program_access_grants : 부여 원장 (M6)
--
--    왜 원장이 필요한가
--      부여 단위가 (사용자, 프로그램) 뿐이면 "어느 주문이 이 권한을 만들었나"를
--      적을 자리가 없다. 그 결과 B주문 환불이 A주문 권한까지 닫고, 재부여
--      경로가 없고, 관리자 수동 부여와 결제 부여를 데이터로 구별할 수 없다.
--      program_access 는 이제 이 원장의 **파생 캐시**다(배포된
--      consume_performance_credit 이 그 테이블을 읽으므로 계속 유지된다).
--
--    DELETE 금지. 회수는 revoked_at / revoke_reason 을 채우는 것뿐이다.
-- ---------------------------------------------------------------------
create table if not exists public.program_access_grants (
  id               uuid primary key default gen_random_uuid(),

  -- profiles CASCADE — program_access_id_fkey 가 이미 profiles ON DELETE
  -- CASCADE 이고 profiles.id 는 auth.users ON DELETE CASCADE 다(실측).
  -- RESTRICT 로 두면 사용자 삭제가 원장 때문에 실패한다.
  profile_id       uuid    not null references public.profiles(id)          on delete cascade,

  -- programs RESTRICT — program_access.program_key 는 CASCADE 지만 그 규칙을
  -- 원장에 복제하면 programs 1행 삭제로 유료 부여 이력이 조용히 사라진다.
  -- products.program_key(RESTRICT, sql/60)를 따른다.
  program_key      text    not null references public.programs(program_key) on delete restrict,

  -- orders / order_items RESTRICT — 유료 주문 삭제를 원장이 막는 것이 옳다.
  -- order_items 는 주문 삭제 시 CASCADE 지만 그 CASCADE 가 이 RESTRICT 에
  -- 걸려 실패한다(의도한 동작 — 원장이 있는 주문은 지울 수 없다).
  order_id         text            references public.orders(id)             on delete restrict,
  order_item_id    bigint          references public.order_items(id)        on delete restrict,

  -- products SET NULL + product_slug 스냅샷. order_items 규약(sql/56 3절)과 동일.
  product_id       uuid            references public.products(id)           on delete set null,
  product_slug     text,

  granted_by       text    not null check (granted_by in ('payment','admin','promotion','qa')),

  -- ⚠ 의도적으로 FK 를 걸지 않는다. profiles ON DELETE SET NULL 을 걸면
  --   관리자 계정 삭제가 이 컬럼을 NULL 로 UPDATE 하고, 그 UPDATE 가 아래
  --   pag_admin_actor_check 를 위반해 23514 로 실패한다(감사 이력이 계정
  --   삭제를 막는 형태가 된다). RESTRICT 로 걸면 auth.users → profiles
  --   CASCADE 삭제가 막힌다. 어느 쪽도 옳지 않다 — 감사 원장의 "누가 했나"는
  --   행위자가 지워져도 남아야 하는 사실이므로 product_slug 와 같은 성격의
  --   **스냅샷**으로 둔다.
  granted_by_actor uuid,

  granted_months   integer check (granted_months   is null or granted_months   > 0),
  granted_sessions integer check (granted_sessions is null or granted_sessions > 0),

  paid_amount      integer not null default 0 check (paid_amount >= 0),

  starts_at        timestamptz not null,
  expires_at       timestamptz,          -- NULL = 무기한. 배타 상한((다) 절).

  revoked_at       timestamptz,
  revoke_reason    text,
  memo             text,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),

  -- 결제 부여는 반드시 주문 라인에 앵커된다. 역도 성립한다(주문 라인이 있는
  -- 부여는 결제 부여다). 이 짝 CHECK 이 M6 을 관례에서 제약으로 올린다 —
  -- dev 의 출처 불명 1행(7456b574…, paid/active, paid_amount=0, 주문 0건)
  -- 같은 상태는 이제 granted_by='admin' + granted_by_actor 없이 만들 수 없다.
  constraint pag_payment_order_pairing_check
    check ((granted_by = 'payment') = (order_id is not null)),
  constraint pag_payment_item_pairing_check
    check ((granted_by = 'payment') = (order_item_id is not null)),

  -- 관리자 수동 부여는 행위자를 남겨야 한다. "누가 공짜 권한을 줬는지 모른다"가
  -- M6 의 실제 피해였다.
  constraint pag_admin_actor_check
    check (granted_by <> 'admin' or granted_by_actor is not null),

  constraint pag_revoke_pairing_check
    check ((revoked_at is null) = (revoke_reason is null)),

  constraint pag_period_order_check
    check (expires_at is null or expires_at > starts_at),

  -- products_entitlement_shape_check 와 같은 불변식을 부여 시점 스냅샷에도 건다.
  constraint pag_entitlement_shape_check
    check (not (granted_months is null and granted_sessions is null)),

  -- 만료는 granted_months 에서 파생된다 — 한쪽만 채운 행은 계산 버그의 흔적이다.
  constraint pag_expiry_derivation_check
    check ((granted_months is null) = (expires_at is null))
);

comment on table public.program_access_grants is
  '이용 권한 부여 원장(M6). 부여 1건 = 1행이며 DELETE 하지 않는다(회수는 revoked_at/revoke_reason). program_access 는 이 원장에서 파생된 캐시다 — 기간·회차·금액은 살아있는(revoked_at is null) 행에서 매번 재계산된다(sql/64 (마)).';

comment on column public.program_access_grants.granted_by is
  '부여 출처. payment=결제(order_id·order_item_id 필수) / admin=관리자 수동(granted_by_actor 필수) / promotion / qa. 이 컬럼이 없던 시절에는 결제 부여와 수동 부여를 데이터로 구별할 수 없었다(M6).';
comment on column public.program_access_grants.granted_by_actor is
  '수동 부여를 실행한 관리자 profiles.id 스냅샷. **FK 없음** — 행위자 삭제가 감사 이력을 지우거나 계정 삭제를 막지 않도록 의도적으로 스냅샷이다(테이블 정의 주석 참고).';
comment on column public.program_access_grants.paid_amount is
  '이 부여 라인의 결제 금액(order_items.price * quantity 스냅샷). ⚠ 정산 정본이 아니다 — 쿠폰 할인은 주문 레벨(orders.discount_amount)에만 있고 order_items 에 할인 컬럼이 없어 라인 단위 실수령액을 계산할 근거가 없다(기존 결함 승계, sql/64 제외 목록).';
comment on column public.program_access_grants.expires_at is
  '이용 기간의 **배타 상한**. NULL = 무기한. now() < expires_at 이 "만료일 24시까지"를 정확히 표현한다. 화면 표시용 만료일은 이 값 - 1일의 KST 날짜부다(sql/64 (다)).';
comment on column public.program_access_grants.granted_months is
  '부여 시점 products.duration_months 스냅샷. 상품 정의가 나중에 바뀌어도 이미 판 기간은 바뀌지 않는다.';
comment on column public.program_access_grants.granted_sessions is
  '부여 시점 products.session_quota 스냅샷. NULL = 무제한.';

-- 주문 라인당 살아있는 부여 1건. 회수 후 재부여는 새 행으로 성립한다.
-- ⚠ 부분 유니크는 ON CONFLICT arbiter 추론이 안 된다(42P10). 이 파일은
--   ON CONFLICT 를 쓰지 않는다 — 부여 RPC 가 orders 행을 for update 로 잠근
--   뒤 명시적 `if exists(...) then skip` 을 하므로 동시 진입(confirm-payment 와
--   toss-webhook 이 같은 주문에 동시 도착)이 같은 락에 줄 선다. 이 인덱스는
--   그 논리가 틀렸을 때 23505 로 드러나는 **DB 백스톱**이다.
create unique index if not exists program_access_grants_live_item_uniq
  on public.program_access_grants (order_item_id)
  where order_item_id is not null and revoked_at is null;

-- 캐시 재계산의 주 조회 경로.
create index if not exists program_access_grants_live_profile_program_idx
  on public.program_access_grants (profile_id, program_key)
  where revoked_at is null;

-- 회수(주문 단위)와 고아 감시 쿼리의 조회 경로.
create index if not exists program_access_grants_order_idx
  on public.program_access_grants (order_id);

-- RLS. insert/update/delete 정책을 만들지 않는다 = SECURITY DEFINER RPC 전용
-- (service_role 은 RLS 를 우회하므로 서버 경로는 영향받지 않는다).
alter table public.program_access_grants enable row level security;

drop policy if exists "program_access_grants_select_own" on public.program_access_grants;
create policy "program_access_grants_select_own" on public.program_access_grants
  for select to authenticated
  using (profile_id = auth.uid());

-- 이름 규약 <테이블>_admin_<동사>_all + public.is_admin() 판정은
-- sql/46_profiles_role_hardening.sql / sql/59 3절과 같다.
drop policy if exists "program_access_grants_admin_select_all" on public.program_access_grants;
create policy "program_access_grants_admin_select_all" on public.program_access_grants
  for select to authenticated
  using (public.is_admin());


-- ---------------------------------------------------------------------
-- 7) fn_sync_program_access_cache : 캐시 재계산 (부여·회수 공용 단일 정본)
--
--    부여와 회수가 서로 다른 재계산 식을 갖는 순간 한쪽만 고쳐지는 사고가
--    난다(api/_lib/programAccess.js 파일 상단 "부여만 있으면 손실이 난다"와
--    같은 원칙). 그래서 재계산은 이 함수 한 곳에만 둔다.
--
--    p_empty_payment_status
--      살아있는 원장 행이 하나도 남지 않았을 때 캐시 payment_status 에 쓸 값.
--      NULL(부여 경로) → 아무것도 하지 않는다.
--      'refunded'/'cancelled'(회수 경로) → 기존 행을 닫는다. **INSERT 하지
--      않는다** — 회수는 "이미 있는 권한을 닫는" 동작이고, 없던 권한 행을
--      취소 이력으로 만들어 내면 안 된다(기존 revokeProgramAccessForOrder 의
--      "insert 하지 않는다" 규약을 그대로 승계).
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
  v_extra           jsonb;
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

    -- quota_used 는 남긴다 — 소비는 이미 일어난 사실이고, 환불 뒤에도 이력으로
    -- 필요하다. quota_total 을 지우면 배포된 consume_performance_credit 은
    -- "키 부재 = 무제한"으로 읽지만, 같은 함수가 payment_status in
    -- ('refunded','cancelled') 를 먼저 entitlement_expired 로 끊으므로
    -- 무제한으로 새어 나가지 않는다(그 함수 6)단계).
    -- wc_mixed_term 도 함께 지운다(더 이상 혼합 상태가 아니다).
    update public.program_access pa
       set payment_status    = p_empty_payment_status,
           access_status     = 'inactive',
           access_expires_at = null,
           expires_at        = null,
           paid_amount       = 0,
           meta              = (coalesce(pa.meta, '{}'::jsonb) - 'quota_total' - 'wc_mixed_term'),
           updated_at        = now()
     where pa.id = p_profile_id
       and pa.program_key = p_program_key;

    return jsonb_build_object('program_key', p_program_key, 'action', 'closed',
                              'live_grants', 0, 'payment_status', p_empty_payment_status);
  end if;

  -- ── 살아있는 부여가 있다 → 기간·회차·금액을 전부 재계산 ──────────
  -- 무기한 부여가 하나라도 섞여 있으면 기간 만료가 성립하지 않는다((바) 절).
  v_expires_cache := case when v_unlimited_term then null else v_max_expires end;
  v_mixed         := v_unlimited_term and v_has_term;
  v_extra         := case when v_mixed then jsonb_build_object('wc_mixed_term', true)
                          else '{}'::jsonb end;

  insert into public.program_access as pa (
    id, program_key, payment_status, access_status, paid_amount, paid_at,
    access_started_at, starts_at, access_expires_at, expires_at,
    profile_id, user_id, meta, updated_at
  ) values (
    p_profile_id, p_program_key, 'paid', 'active', v_paid_sum, v_min_start,
    v_min_start, v_min_start, v_expires_cache, v_expires_cache,
    -- 4)절 등호 CHECK 을 만족시킨다. 배포된 consume_performance_credit 이
    -- 3컬럼 OR 로 행을 찾으므로 세 컬럼을 함께 채우는 것이 여전히 필요하다.
    p_profile_id, p_profile_id,
    (case when v_unlimited_quota then '{}'::jsonb
          else jsonb_build_object('quota_total', v_quota_total, 'quota_used', 0) end) || v_extra,
    now()
  )
  on conflict (id, program_key) do update set
    -- 만료를 payment_status 에 절대 쓰지 않는다. api/_lib/programAccess.js 의
    -- REVOKED_PAYMENT_STATUSES=['refunded','cancelled'] 가 "회수된 행"을
    -- 판별하므로, 만료를 여기 표기하면 정상 재구매가 "환불 복원"으로 오인된다.
    -- 돈은 정상 수령했으니 paid 가 사실이고, "만료 후 기록 조회 허용" 정책과도
    -- 일치한다. 만료는 8)절 판정 함수가 계산으로 끊는다.
    payment_status    = 'paid',
    access_status     = 'active',
    paid_amount       = excluded.paid_amount,
    -- 첫 결제 흔적을 보존한다 — min(starts_at) 은 재구매로 뒤로 밀리지 않는다.
    paid_at           = excluded.paid_at,
    access_started_at = excluded.access_started_at,
    starts_at         = excluded.starts_at,
    -- 두 만료 컬럼에 같은 값을 함께 쓴다(미러). 리더가 coalesce 라서
    -- 한쪽만 쓰면 낡은 값이 이긴다 — 파일 상단 (가) 절.
    access_expires_at = excluded.access_expires_at,
    expires_at        = excluded.expires_at,
    profile_id        = excluded.profile_id,
    user_id           = excluded.user_id,
    -- quota_used 는 **절대 초기화하지 않는다.** 소비 사실은 사실이다.
    -- 잠긴 행 안에서 기존 meta 를 읽고 쓰므로 consume_performance_credit 의
    -- jsonb_set 과 경합하지 않는다(ON CONFLICT DO UPDATE 는 그 행을 잠근다).
    -- v_quota_total < quota_used 가 되어도 깎지 않는다 — 잔여 계산은 배포된
    -- 소비 RPC 의 greatest(total-used, 0) 에 맡긴다.
    meta = (
      case when v_unlimited_quota
           -- 무제한으로 올라간 경우: quota_total 만 지운다(키 부재 = 무제한).
           -- quota_used 는 이력이라 남긴다.
           then (coalesce(pa.meta, '{}'::jsonb) - 'quota_total')
           else coalesce(pa.meta, '{}'::jsonb) || jsonb_build_object(
                  'quota_total', v_quota_total,
                  'quota_used',
                  case when (pa.meta ->> 'quota_used') ~ '^-?[0-9]+$'
                       then greatest((pa.meta ->> 'quota_used')::int, 0)
                       else 0 end)
           end
      - 'wc_mixed_term'
    ) || v_extra,
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
  'program_access(캐시)를 program_access_grants(원장)의 살아있는 행에서 재계산한다. 부여·회수 양쪽이 같은 식을 쓰도록 정본을 한 곳에 둔 것이다. quota_used 는 절대 초기화하지 않고, 살아있는 부여가 0건일 때 p_empty_payment_status 가 NULL 이면 아무것도 하지 않는다(sql/64 7절).';

revoke all on function public.fn_sync_program_access_cache(uuid, text, text) from public, anon, authenticated;
grant execute on function public.fn_sync_program_access_cache(uuid, text, text) to service_role;


-- ---------------------------------------------------------------------
-- 8) fn_grant_program_access_for_order : 부여 (M1 + M6)
--
--    시그니처는 현행 JS(grantProgramAccessForOrder)와 1:1 대응이라 호출부
--    변경이 최소다. "돈이 들어왔는가" 판정은 계속 호출자 책임이다(현행 규약 —
--    가상계좌 waiting_deposit 에서는 부르지 않는다).
--
--    라인 단위 거절은 **예외가 아니라 skipped 배열**이다. 결제 승인은 이미
--    났으므로 부여 실패가 승인을 되돌리면 안 된다(현행 규약 승계).
-- ---------------------------------------------------------------------
create or replace function public.fn_grant_program_access_for_order(
  p_order_id        text,
  p_user_id         uuid,
  p_paid_at         timestamptz default null,
  p_restore_revoked boolean     default false
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_order        public.orders;
  v_existing     public.program_access;
  v_item         record;
  v_paid_at      timestamptz;
  v_anchor       timestamptz;
  v_start        timestamptz;
  v_expires      timestamptz;
  v_key          text;
  v_item_count   int    := 0;
  v_inserted     int    := 0;
  v_skipped      jsonb  := '[]'::jsonb;
  v_service_keys text[] := '{}';
  v_blocked      text[] := '{}';   -- suspended / revoked_not_restored 로 막힌 key
  v_keys         text[] := '{}';   -- 재계산 대상 key
  v_sync         jsonb  := '[]'::jsonb;
begin
  -- 1) 주문 잠금. 같은 주문에 confirm-payment 와 toss-webhook 이 동시에
  --    들어와도 여기서 직렬화된다 → 아래 exists() 멱등 검사가 TOCTOU 를 타지
  --    않는다(6절 부분 유니크는 그 논리가 틀렸을 때의 백스톱).
  select * into v_order from public.orders where id = p_order_id for update;
  if not found then
    raise exception 'order_not_found' using errcode = 'WC010';
  end if;

  -- 2) 소유자 확인. 조용한 오부여(남의 주문번호 하나로 권한 획득)를 막는다.
  --    p_user_id 가 NULL 인 경우까지 잡으려고 is distinct from 을 쓴다.
  if v_order.user_id is not null and v_order.user_id is distinct from p_user_id then
    raise exception 'order_user_mismatch' using errcode = 'WC011';
  end if;

  -- 비회원 결제(api/create-order.js 는 로그인 없이도 주문을 만든다)는 부여 대상이
  -- 없다. 에러가 아니라 skip 이다 — 운영자 수동 처리 대상(현행 동작 유지).
  if v_order.user_id is null then
    return jsonb_build_object(
      'ok', true, 'granted', '[]'::jsonb, 'service_keys', '[]'::jsonb,
      'skipped', jsonb_build_array(jsonb_build_object('reason', 'order_has_no_user')),
      'ledger_inserted', 0, 'synced', '[]'::jsonb);
  end if;

  -- 3) 같은 사용자에 대한 부여·회수를 직렬화한다. 주문 락만으로는 **서로 다른
  --    두 주문**이 같은 (사용자, program_key) 의 max(expires_at) 를 동시에 읽어
  --    체이닝이 깨진다(둘 다 같은 앵커에서 시작해 한쪽 기간이 사라진다).
  --    salt 101 — sql/55 가 쿠폰 도메인에 1/2, sql/59 가 환불에 100 을 쓴다.
  --    락 순서는 부여·회수 모두 "주문 행 → advisory" 로 동일해 데드락이 없다.
  perform pg_advisory_xact_lock(hashtextextended(v_order.user_id::text, 101));

  -- 4) 기간 시작 앵커 = 결제 확정일 KST 00시(확정 정책).
  v_paid_at := coalesce(p_paid_at, v_order.paid_at, now());
  v_anchor  := public.fn_kst_day_start(v_paid_at);

  select count(*) into v_item_count from public.order_items where order_id = p_order_id;
  if v_item_count = 0 then
    -- 현행 JS 와 같은 error 문자열. src/pages/PaymentSuccess.jsx 의
    -- PERMANENT_ACCESS_ERRORS 가 이 값을 "영구 실패"로 안내한다.
    return jsonb_build_object(
      'ok', false, 'error', 'no_order_items', 'granted', '[]'::jsonb,
      'service_keys', '[]'::jsonb, 'skipped', '[]'::jsonb,
      'ledger_inserted', 0, 'synced', '[]'::jsonb);
  end if;

  -- 5) 라인 순회. order_items.id asc 로 **결정적 순서** — 같은 program_key 의
  --    여러 라인이 순차 체이닝되므로 순서가 흔들리면 결과가 흔들린다.
  --
  --    상품 조회는 product_id → product_slug 폴백이다. 기간·회차는 상품 **행**
  --    단위 값이라 기존의 service_key 매핑으로는 얻을 수 없다(같은
  --    service_key='suhaeng' 안에 1회권과 30회권이 함께 있다). product_id 는
  --    상품 삭제 시 SET NULL 되므로 slug 스냅샷으로 한 번 더 받는다.
  --    products.id 는 PK, products.slug 는 UNIQUE 이고 두 분기가
  --    (product_id is null) 로 배타이므로 최대 1행만 매칭된다.
  for v_item in
    select oi.id as order_item_id, oi.quantity, oi.price,
           oi.product_slug, oi.service_key,
           p.id as product_id, p.program_key, p.duration_months, p.session_quota
      from public.order_items oi
      left join public.products p
             on p.id = oi.product_id
             or (oi.product_id is null and p.slug = oi.product_slug)
     where oi.order_id = p_order_id
     order by oi.id asc
  loop
    if v_item.service_key is not null
       and not (v_item.service_key = any(v_service_keys)) then
      v_service_keys := v_service_keys || v_item.service_key;
    end if;

    -- (a) 입장할 프로그램이 없는 상품(수시예측 등) 또는 상품 행 자체가 사라진
    --     라인. 현행 JS 와 같은 이유 문자열을 쓴다.
    if v_item.program_key is null then
      v_skipped := v_skipped || jsonb_build_object(
        'order_item_id', v_item.order_item_id, 'product_slug', v_item.product_slug,
        'service_key', v_item.service_key, 'program_key', null,
        'reason', 'no_program_key_mapping');
      continue;
    end if;

    -- (b) 수량 배수 해석은 근거가 없어 추측하지 않는다. api/create-order.js 가
    --     quantity 를 항상 리터럴 1 로 보내므로 도달 불가 경로다.
    if v_item.quantity <> 1 then
      v_skipped := v_skipped || jsonb_build_object(
        'order_item_id', v_item.order_item_id, 'product_slug', v_item.product_slug,
        'service_key', v_item.service_key, 'program_key', v_item.program_key,
        'reason', 'unsupported_quantity');
      continue;
    end if;

    -- (c) products_entitlement_shape_check 를 우회한 데이터 방어. 여기서
    --     통과시키면 영구 무제한 권한이 생기고 되돌릴 수 없다 → fail-closed.
    if v_item.duration_months is null and v_item.session_quota is null then
      raise exception 'product_entitlement_spec_missing'
        using errcode = 'WC012',
              detail  = format('order_item_id=%s product_slug=%s program_key=%s',
                               v_item.order_item_id, v_item.product_slug, v_item.program_key);
    end if;

    select * into v_existing
      from public.program_access
     where id = v_order.user_id and program_key = v_item.program_key
       for update;

    if found then
      -- (d) 운영자 제재는 결제로 자동 해제되지 않는다. 원장 행도 만들지 않고
      --     아래 재계산 대상에서도 제외한다 — 재계산이 돌면 access_status 가
      --     active 로 덮여 제재가 무력화된다.
      if v_existing.access_status = 'suspended' then
        v_skipped := v_skipped || jsonb_build_object(
          'order_item_id', v_item.order_item_id, 'product_slug', v_item.product_slug,
          'service_key', v_item.service_key, 'program_key', v_item.program_key,
          'reason', 'suspended_by_admin');
        if not (v_item.program_key = any(v_blocked)) then
          v_blocked := v_blocked || v_item.program_key;
        end if;
        continue;
      end if;

      -- (e) 회수된 행을 되살릴 권한은 "새 돈이 방금 들어온" 경로에만 있다.
      --     멱등 재응답·웹훅 재전송은 p_restore_revoked=false 로 들어온다.
      if not p_restore_revoked
         and v_existing.payment_status in ('refunded', 'cancelled') then
        v_skipped := v_skipped || jsonb_build_object(
          'order_item_id', v_item.order_item_id, 'product_slug', v_item.product_slug,
          'service_key', v_item.service_key, 'program_key', v_item.program_key,
          'reason', 'revoked_not_restored');
        if not (v_item.program_key = any(v_blocked)) then
          v_blocked := v_blocked || v_item.program_key;
        end if;
        continue;
      end if;
    end if;

    -- (f) 멱등. 이 주문 라인으로 만든 살아있는 원장 행이 이미 있으면 다시 넣지
    --     않는다(성공 페이지 새로고침·웹훅 재전송).
    if exists (
      select 1 from public.program_access_grants g
       where g.order_item_id = v_item.order_item_id and g.revoked_at is null
    ) then
      v_skipped := v_skipped || jsonb_build_object(
        'order_item_id', v_item.order_item_id, 'product_slug', v_item.product_slug,
        'service_key', v_item.service_key, 'program_key', v_item.program_key,
        'reason', 'already_granted');
      continue;
    end if;

    -- (g) 시작·종료 계산. 같은 program_key 안에서 순차 체이닝된다((라) 절).
    --     집계 쿼리는 항상 1행을 돌려주고 GREATEST 는 NULL 을 무시하므로,
    --     선행 부여 없음 / 무기한 선행 모두 자동으로 v_anchor 가 된다.
    select greatest(v_anchor, max(g.expires_at)) into v_start
      from public.program_access_grants g
     where g.profile_id  = v_order.user_id
       and g.program_key = v_item.program_key
       and g.revoked_at is null;
    v_start   := coalesce(v_start, v_anchor);
    v_expires := public.fn_add_months_kst(v_start, v_item.duration_months);

    insert into public.program_access_grants (
      profile_id, program_key, order_id, order_item_id,
      product_id, product_slug, granted_by,
      granted_months, granted_sessions, paid_amount, starts_at, expires_at
    ) values (
      v_order.user_id, v_item.program_key, p_order_id, v_item.order_item_id,
      v_item.product_id, v_item.product_slug, 'payment',
      v_item.duration_months, v_item.session_quota,
      coalesce(v_item.price, 0) * coalesce(v_item.quantity, 1),
      v_start, v_expires
    );
    v_inserted := v_inserted + 1;
  end loop;

  -- 6) 재계산 대상 = **이 주문의 살아있는 원장 행이 가리키는 program_key 전체**
  --    (이번 호출에서 새로 넣은 것만이 아니다). 이렇게 두면 1회차에 캐시 쓰기가
  --    실패했던 주문이 새로고침·웹훅 재전송으로 자동 복구된다 —
  --    api/confirm-payment.js 가 의존하는 "재시도가 복구 경로다" 규약이 원장
  --    도입 뒤에도 유지된다. (d)/(e) 로 막힌 key 는 제외한다.
  select coalesce(array_agg(distinct g.program_key), '{}')
    into v_keys
    from public.program_access_grants g
   where g.order_id = p_order_id
     and g.revoked_at is null
     and not (g.program_key = any(v_blocked));

  foreach v_key in array v_keys loop
    v_sync := v_sync || public.fn_sync_program_access_cache(v_order.user_id, v_key, null);
  end loop;

  return jsonb_build_object(
    'ok',              true,
    -- granted = "이 주문으로 지금 권한이 살아 있는 program_key". 새로 넣은 것만
    -- 담으면 성공 페이지를 새로고침할 때(전부 already_granted) 빈 배열이 되어
    -- src/pages/PaymentSuccess.jsx 의 입장 CTA 가 사라진다.
    'granted',         to_jsonb(v_keys),
    'service_keys',    to_jsonb(v_service_keys),
    'skipped',         v_skipped,
    'ledger_inserted', v_inserted,
    'synced',          v_sync
  );
end;
$$;

comment on function public.fn_grant_program_access_for_order(text, uuid, timestamptz, boolean) is
  '주문 하나에 대해 이용 권한을 부여한다(M1/M6). 호출자가 "돈이 들어왔다"를 확인한 뒤에만 부를 것. 라인별 거절은 예외가 아니라 skipped 배열이다(결제 승인을 되돌리지 않는다). WC010=주문 없음 / WC011=소유자 불일치 / WC012=상품에 기간·회차가 둘 다 없음. granted 는 이 주문으로 살아 있는 program_key 전체라 멱등 재호출에도 같은 값을 돌려준다.';

revoke all on function public.fn_grant_program_access_for_order(text, uuid, timestamptz, boolean)
  from public, anon, authenticated;
grant execute on function public.fn_grant_program_access_for_order(text, uuid, timestamptz, boolean)
  to service_role;


-- ---------------------------------------------------------------------
-- 9) fn_revoke_program_access_for_order : 회수 (M6 의 핵심 수정)
--
--    **이 주문의 원장 행만 닫는다.** 다른 주문의 행은 건드리지 않는다 —
--    "B주문 환불이 A주문 권한까지 닫는다"가 M6 의 실제 피해였고, 기존
--    revokeProgramAccessForOrder 는 (user, program_key) 전체를 닫았다.
-- ---------------------------------------------------------------------
create or replace function public.fn_revoke_program_access_for_order(
  p_order_id       text,
  p_user_id        uuid,
  p_payment_status text default 'refunded',   -- 'refunded' | 'cancelled'
  p_reason         text default 'order_revoked'
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_order   public.orders;
  v_status  text;
  v_reason  text;
  v_keys    text[] := '{}';
  v_key     text;
  v_closed  int    := 0;
  v_sync    jsonb  := '[]'::jsonb;
begin
  select * into v_order from public.orders where id = p_order_id for update;
  if not found then
    raise exception 'order_not_found' using errcode = 'WC010';
  end if;

  -- 비회원 결제는 부여된 적이 없으니 회수할 것도 없다(현행 동작 — 에러가 아니다).
  if v_order.user_id is null then
    return jsonb_build_object(
      'ok', true, 'revoked', '[]'::jsonb, 'recalculated', '[]'::jsonb,
      'skipped', jsonb_build_array(jsonb_build_object('reason', 'order_has_no_user')),
      'ledger_closed', 0, 'synced', '[]'::jsonb);
  end if;

  -- 8절 3)단계와 같은 락 순서(주문 행 → advisory)라 데드락이 없다.
  perform pg_advisory_xact_lock(hashtextextended(v_order.user_id::text, 101));

  -- 돈이 실제로 들어왔던 주문의 취소 = refunded, 입금 전 종결 = cancelled.
  -- 어휘는 program_access_payment_status_check 및 api/_lib/programAccess.js 의
  -- REVOKED_PAYMENT_STATUSES 와 동일해야 한다 — 그 상수가 "회수된 행"을
  -- 판별하므로 값이 갈리면 회수 행이 재부여 보호를 못 받는다.
  v_status := case when p_payment_status in ('refunded', 'cancelled')
                   then p_payment_status else 'refunded' end;
  v_reason := coalesce(nullif(btrim(p_reason), ''), 'order_revoked');

  -- 이 주문의 살아있는 원장 행만 닫는다. 이미 닫힌 행은 건드리지 않으므로
  -- 웹훅 재전송에 멱등이다(revoked_at 이 첫 회수 시각으로 고정된다).
  with closed as (
    update public.program_access_grants g
       set revoked_at    = now(),
           revoke_reason = v_reason,
           updated_at    = now()
     where g.order_id = p_order_id
       and g.revoked_at is null
    returning g.program_key
  )
  select coalesce(array_agg(distinct program_key), '{}'), count(*)
    into v_keys, v_closed
    from closed;

  -- 이번 호출에서 닫은 것이 없더라도, 이 주문이 건드린 program_key 는 재계산해
  -- 둔다(재전송으로 들어온 회수가 1회차에 캐시 쓰기를 실패했을 때의 복구 경로).
  if array_length(v_keys, 1) is null then
    select coalesce(array_agg(distinct g.program_key), '{}')
      into v_keys
      from public.program_access_grants g
     where g.order_id = p_order_id;
  end if;

  -- 영향받은 key 마다 살아있는 원장 행으로 재계산한다.
  --   · 남아 있으면 → paid/active 유지 + 기간·회차·금액 재계산
  --     (다른 주문으로 받은 권한이 살아남는다 = M6 수정)
  --   · 하나도 없으면 → v_status/inactive 로 닫고 만료 2컬럼 NULL
  foreach v_key in array v_keys loop
    v_sync := v_sync || public.fn_sync_program_access_cache(v_order.user_id, v_key, v_status);
  end loop;

  return jsonb_build_object(
    'ok',            true,
    'revoked',       to_jsonb(v_keys),
    'recalculated',  to_jsonb(v_keys),
    'skipped',       '[]'::jsonb,
    'ledger_closed', v_closed,
    'synced',        v_sync
  );
end;
$$;

comment on function public.fn_revoke_program_access_for_order(text, uuid, text, text) is
  '주문 하나에 대해 이용 권한을 회수한다(M6). 이 주문의 원장 행만 revoked_at 으로 닫고, 영향받은 program_key 를 살아있는 원장 행으로 재계산한다 — 다른 주문으로 받은 권한은 살아남는다(기존 JS 는 (user, program_key) 전체를 닫아 A주문 권한까지 죽였다). 원장 행은 DELETE 하지 않는다.';

revoke all on function public.fn_revoke_program_access_for_order(text, uuid, text, text)
  from public, anon, authenticated;
grant execute on function public.fn_revoke_program_access_for_order(text, uuid, text, text)
  to service_role;


-- ---------------------------------------------------------------------
-- 10) fn_program_access_state : 입장 판정 단일 정본 (M1 집행 지점)
--
--     id 단일 조회다. 4)절 등호 CHECK 이 배포된 RPC 의 3컬럼 OR 와 동치를
--     보장하고, PK 가 (id, program_key) 이므로 program_key 당 최대 1행이다 →
--     기존 판정부의 maybeSingle() 이 다행에서 PGRST116 을 내고 그 에러를
--     `if (error) continue` 가 삼켜 결제자가 로그 0줄로 403 을 맞던 경로가
--     이 함수에서는 구조적으로 사라진다.
--
--     allowed 에 **회차를 넣지 않는다.** 게이트는 기간만 본다. 회차는 소비
--     지점(배포된 consume_performance_credit)이 본다 — "회차 0 + 기간 유효"
--     상태의 입장 허용/차단은 확정 정책에 없는 미결 항목이고, 게이트를 기간
--     전용으로 두면 현행 동작(새 세션 첫 차감만 막힘)이 그대로 유지된다.
--
--     STABLE + write-back 없음. cron 이 없어(0절 j) 만료는 계산으로만 판정한다.
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
          -- 배타 상한. 만료일 23:59:59 는 통과, 익일 00:00:00 은 차단.
          -- 배포된 consume_performance_credit 의 `plan_ends_at <= now()`
          -- 만료 판정과 같은 의미론이다.
          and (coalesce(pa.access_expires_at, pa.expires_at) is null
               or now() < coalesce(pa.access_expires_at, pa.expires_at)))     as allowed,
         case
           when pa.payment_status <> 'paid'   then 'not_paid'
           when pa.access_status  <> 'active' then 'access_status_' || pa.access_status
           when coalesce(pa.access_expires_at, pa.expires_at) is not null
                and now() >= coalesce(pa.access_expires_at, pa.expires_at)
             then 'period_expired'
           else 'ok'
         end                                                                  as reason,
         coalesce(pa.access_expires_at, pa.expires_at)                        as expires_at,
         (coalesce(pa.access_expires_at, pa.expires_at) is null)              as unlimited_period,
         (pa.meta ->> 'quota_total')::int                                     as quota_total,
         (pa.meta ->> 'quota_used')::int                                      as quota_used,
         -- 배포된 RPC 계약: quota_total 키 부재 = 무제한. meta 가 NULL 이어도
         -- (NULL ? 'x') is not true → true 로 떨어진다.
         ((pa.meta ? 'quota_total') is not true)                              as unlimited_sessions
    from public.program_access pa
   where pa.id = p_profile_id
     and pa.program_key = any(p_program_keys);
$$;

comment on function public.fn_program_access_state(uuid, text[]) is
  '입장 판정 단일 정본(M1). allowed 는 payment_status=paid + access_status=active + 기간 미만료(배타 상한)만 본다 — 회차는 소비 지점이 판정한다. 만료를 payment_status 에 기록하지 않으므로 만료 후에도 기록 조회는 허용된다(확정 정책). 행이 없으면 0행을 돌려준다 = 미보유(호출부가 fail-closed 로 읽을 것).';

revoke all on function public.fn_program_access_state(uuid, text[]) from public, anon, authenticated;
grant execute on function public.fn_program_access_state(uuid, text[]) to service_role;


-- =====================================================================
-- 확인용 (실행 후 눈으로 볼 것 — 아래는 주석, 자동 실행되지 않는다)
-- =====================================================================
--
-- V0) 마이그레이션 직후
-- select slug, program_key, duration_months, session_quota
--   from public.products order by slug;                       -- 기대: 10행, 시드 표와 일치
-- select conname from pg_constraint where conname in (
--   'products_duration_months_positive_check','products_session_quota_positive_check',
--   'products_entitlement_shape_check','program_access_identity_equality_check');
--                                                             -- 기대: 4행
-- select count(*) from public.program_access
--  where not ((profile_id is null or profile_id = id) and (user_id is null or user_id = id));
--                                                             -- 기대: 0
--
-- V1) 달력 클램프 — 세션 GUC 를 바꿔가며 두 번 실행해 값이 같은지 확인할 것
--     (set time zone 'UTC' / set time zone 'Asia/Seoul').
-- select public.fn_add_months_kst(('2026-01-31'::timestamp at time zone 'Asia/Seoul'), 1)   -- KST 2026-02-28 00:00
--      , public.fn_add_months_kst(('2024-02-29'::timestamp at time zone 'Asia/Seoul'), 12)  -- KST 2025-02-28 00:00
--      , public.fn_add_months_kst(('2026-08-31'::timestamp at time zone 'Asia/Seoul'), 6)   -- KST 2027-02-28 00:00
--      , public.fn_add_months_kst(('2026-03-15'::timestamp at time zone 'Asia/Seoul'), 1);  -- KST 2026-04-15 00:00
--
-- V2) 배타 상한 경계
-- select ('2026-02-27 23:59:59'::timestamp at time zone 'Asia/Seoul')
--         < ('2026-02-28 00:00:00'::timestamp at time zone 'Asia/Seoul') as should_be_true;
-- select ('2026-02-28 00:00:00'::timestamp at time zone 'Asia/Seoul')
--         < ('2026-02-28 00:00:00'::timestamp at time zone 'Asia/Seoul') as should_be_false;
--
-- V3) 체이닝의 비결합성 — (라) 절에 기록한 3일 손실을 눈으로 확인한다.
-- with a as (select ('2026-01-31'::timestamp at time zone 'Asia/Seoul') as anchor)
-- select public.fn_add_months_kst(anchor, 1)                                as chain_step1,   -- KST 2/28
--        public.fn_add_months_kst(public.fn_add_months_kst(anchor, 1), 1)   as chain_step2,   -- KST 3/28
--        public.fn_add_months_kst(anchor, 2)                               as direct_2m      -- KST 3/31
--   from a;
--
-- V5) 정합성 감시 — 운영 반영 후에도 주기적으로 볼 것
-- (a) 주문 → 권한 고아: paid 주문인데 원장 행이 없다
-- select o.id, o.paid_at from public.orders o
--  where o.paid_at is not null and o.user_id is not null
--    and not exists (select 1 from public.program_access_grants g where g.order_id = o.id);
--
-- (b) 권한 → 출처 고아: 살아있는 유료 권한인데 원장 행이 없다 (M6 잔재)
-- select pa.id, pa.program_key, pa.paid_amount, pa.memo, pa.created_at
--   from public.program_access pa
--  where pa.payment_status = 'paid' and pa.access_status = 'active'
--    and not exists (select 1 from public.program_access_grants g
--                     where g.profile_id = pa.id and g.program_key = pa.program_key
--                       and g.revoked_at is null);
--
-- (c) 환불 완료인데 살아있는 권한 — 회수 호출부가 api/toss-webhook.js 하나뿐이라
--     운영자가 refund_requests 를 completed 로 바꿔도 권한이 남는 구조적 구멍의 관측.
-- select r.id, r.order_id, r.status, pa.program_key, pa.payment_status, pa.access_status
--   from public.refund_requests r
--   join public.orders o on o.id = r.order_id
--   join public.program_access pa on pa.id = o.user_id
--  where r.status = 'completed' and pa.payment_status = 'paid' and pa.access_status = 'active';
--
-- (d) 캐시 ↔ 원장 만료 불일치 (기대 0행)
-- select pa.id, pa.program_key,
--        coalesce(pa.access_expires_at, pa.expires_at) as cached, x.expected
--   from public.program_access pa
--   join (select g.profile_id, g.program_key,
--                case when bool_or(g.expires_at is null) then null else max(g.expires_at) end as expected
--           from public.program_access_grants g where g.revoked_at is null
--          group by 1, 2) x
--     on x.profile_id = pa.id and x.program_key = pa.program_key
--  where coalesce(pa.access_expires_at, pa.expires_at) is distinct from x.expected;
--
-- (e) 두 만료 컬럼 불일치 (미러 규약 위반, 기대 0행)
-- select id, program_key, access_expires_at, expires_at from public.program_access
--  where access_expires_at is distinct from expires_at;
--
-- (f) 무기한·기간제 혼합 보유자 열거 ((바) 절 미결 항목, 현재 기대 0행)
-- select profile_id, program_key, count(*) from public.program_access_grants
--  where revoked_at is null group by 1, 2
-- having bool_or(expires_at is null) and bool_or(expires_at is not null);
--
-- (g) program_access 다행 점검 — 운영 재생성 후 필수.
--     dev 에는 uq_program_access_profile_program(부분 UNIQUE)이 실재하지만
--     운영에 없으면 (profile_id, program_key) 다행이 생길 수 있다.
-- select id, program_key, count(*) from public.program_access group by 1, 2 having count(*) > 1;
--
-- =====================================================================
-- 남겨 둔 것 — 이 파일이 **일부러** 하지 않은 결정 (지시 없이 채우지 말 것)
-- =====================================================================
-- · 과거 paid 주문의 원장 백필. dev 의 실제 대상은 2건이고 둘 다 미결이다:
--     1) order_1785898468780_adf9e6aa (paid, 2026-08-05,
--        mentor-1 50,000 + goal-1m 30,000) — 권한 행 0개. 소급 부여 여부 미결.
--     2) program_access 1행 7456b574-2165-48b0-b63f-dec992c2676f / 'target' /
--        paid·active / paid_amount=0 / 주문 0건 / memo='QA temp …' — 원장
--        근거가 없어 백필 대상이 아니고, 처분하지 않으면 위 (b) 감시에 계속
--        걸리며 **영구 무기한**으로 남는다. 처분 방법(원장에 granted_by='qa'
--        행을 만들 것인가 / 행을 닫을 것인가)은 결정 사항이다.
--   백필을 실행할 때는 반드시 먼저
--     create table _wc_program_access_before_backfill as select * from public.program_access;
--   로 스냅샷을 뜬 뒤, 게이트(코드 S3)가 이미 배포된 상태에서만 할 것 —
--   순서를 뒤집으면 예고 없이 사용자가 잠긴다.
-- · 무기한·기간제 혼합(program_key='suhaeng' 공유) 정책 — (바) 절.
-- · 회차 0 + 기간 유효 상태의 입장 허용/차단 — 10)절.
-- · 체이닝 3일 손실 수락 여부 — (라) 절.
-- · enrollments(오프라인 수강) 경로의 기간 정책 — 그 테이블에 기간 컬럼이 0개다.
-- =====================================================================
--
-- 적용 이력
-- =====================================================================
-- dev(gjowqdiopinhixfivnkx) 적용·검증: 2026-08-12. 운영 반영은 별도 절차
-- (dev sql 정본 재생성 → 운영 diff → 마이그레이션). 운영 DB
-- (ucjlcvqvinspmrasvsug)는 이 작업 범위에서 읽기조차 하지 않았다(사용자 지시).
