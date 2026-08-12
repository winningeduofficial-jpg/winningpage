-- =====================================================================
-- 70_coupon_cap_derivation.sql
-- coupons.max_uses_per_user 를 grant_type 의 파생값으로 고정 — granted+NULL
-- 구멍(NULL=1 이 CHECK 를 통과하는 케이스) 봉합
-- Supabase SQL Editor 에서 실행하세요. (idempotent - 여러 번 실행해도 안전)
-- =====================================================================
--
-- 배경 (2026-08-12 팀 리드 지시, dev(gjowqdiopinhixfivnkx) 실측)
--   coupons 의 개인별 사용횟수 제한은 지금 CHECK 두 개로 나뉘어 있다
--   (sql/68_enrollment_request_pair.sql 5-d-2)/5-d-3)절):
--     coupons_per_user_cap_requires_grant_check
--       check (grant_type = 'granted' or max_uses_per_user is null)
--     coupons_granted_cap_is_one_check
--       check (grant_type <> 'granted' or max_uses_per_user = 1)
--   이 둘을 같이 통과시켜 보면 도달 가능한 조합이 3개다(전수조사 실측):
--     auto+NULL      — 두 CHECK 모두 좌변이 참(grant_type<>'granted')이라 통과.
--     granted+1      — 두 CHECK 모두 우변이 참이라 통과.
--     granted+NULL   — 구멍. coupons_per_user_cap_requires_grant_check 는
--       좌변(grant_type='granted')이 이미 참이라 통과하고,
--       coupons_granted_cap_is_one_check 는 `max_uses_per_user = 1` 이
--       `NULL = 1` 이 되어 NULL 로 평가된다 — PostgreSQL CHECK 는 결과가
--       FALSE 일 때만 위반이고 NULL 은 "위반 아님"으로 통과시킨다. 즉
--       "발급형인데 개인별 상한이 없다(=사실상 무제한)"는 상태가 CHECK
--       두 겹을 그대로 뚫는다 — 이 파일이 닫는 구멍이 정확히 이것이다.
--
--   실질 피해가 아직 없는 이유는 이 구멍에 값을 밀어넣는 쓰기 경로가
--   지금 하나도 없어서다(어드민 UI 에 이 두 컬럼을 함께 편집하는 화면이
--   없다, "CouponAdmin 파생 UI 복구 필요" 절 참고) — 그래도 sql/68
--   5-d-3)절이 이미 "CHECK 만 지우면 조용히 이중 소진이 열린다"고 경고한
--   같은 종류의 fail-open 이라 방치하지 않는다.
--
-- 해법 — 등식 하나로 통합 (사용자 확정, 변경 금지)
--   두 개의 편측 CHECK 대신 "max_uses_per_user 는 grant_type 의 함수다"를
--   그대로 등식으로 못 박는다:
--     max_uses_per_user is not distinct from (case when grant_type = 'granted' then 1 end)
--   grant_type='granted' 이면 우변이 1 로 고정되어 좌변도 반드시 1 이어야
--   하고(granted+NULL 이 이제 명시적으로 FALSE 로 걸린다), grant_type='auto'
--   면 우변이 NULL 이 되어 좌변도 반드시 NULL 이어야 한다(IS NOT DISTINCT
--   FROM 은 NULL 을 NULL 과만 같다고 본다 — 여기서만 CHECK 의 "NULL=통과"
--   함정을 역이용해 등식을 완성한다). auto+1 처럼 임의의 값을 넣는 경로
--   자체가 사라진다 — "1인당 횟수"라는 개념 자체가 grant_type='granted'
--   에만 존재하므로, 이 컬럼은 더 이상 독립적으로 입력받을 값이 아니라
--   grant_type 을 정하는 순간 자동으로 정해지는 파생값이다. 그래서 아래
--   0-b)절에서 DEFAULT(sql/55_coupon_policy.sql 0)절이 P2-6 정정으로 걸어둔
--   1)도 함께 걷어낸다 — 파생값에 정적 기본값을 남겨두면 grant_type만
--   바꾸고 max_uses_per_user 를 그대로 둔 UPDATE 가 이 새 등식 제약에
--   조용히 위반되는 대신, 애초에 "기본값이 있으니 안 채워도 된다"는
--   잘못된 기대를 어드민 화면에 계속 남긴다.
--
-- CouponAdmin 파생 UI 복구 필요 (다음 사람에게)
--   이 파일은 DB 제약만 고친다. src/components/admin/CouponAdmin.jsx 가
--   grant_type 과 max_uses_per_user 를 각각 독립된 입력 필드로 그리고
--   있다면(미확인 — 이 저장소 파일 소유권 밖), 이 등식이 적용된 뒤로는
--   grant_type='granted' 선택 시 max_uses_per_user 를 1로 자동 고정하고
--   입력을 잠그거나, grant_type='auto' 선택 시 자동으로 NULL 로 비우는
--   파생 UI 로 바꿔야 한다 — 그러지 않으면 어드민이 두 필드를 어긋나게
--   채운 저장 시도가 전부 23514 로 실패하는데, 원인(파생 등식)이 화면
--   어디에도 설명되어 있지 않아 왜 저장이 안 되는지 알 수 없다.
--
-- 해제 절차 (sql/68 5-d-3)절과 동일 원칙 — max_uses_per_user > 1 을 다시
--   지원해야 하는 날, 이 파일의 coupons_cap_derived_from_grant_type_check
--   하나만으로는 안 된다. sql/68 5-d-3)절의 coupons_granted_cap_is_one_check
--   /coupon_redemptions_single_use_uidx 두 겹(둘 다 "N=1 고정"을 전제로
--   서비스 코드/RLS 우회 경로까지 막는 DB 백스톱이다)도 함께 다시 설계해야
--   하고, 이 파일이 만드는 등식 제약도 "case 분기가 1 이 아닌 N 을 반환"
--   하도록 같이 고쳐야 한다. 셋 중 하나만 고치면 나머지 둘과 정의가
--   어긋나 조용히 잘못된 상태(등식은 통과하는데 단일사용 unique 는 여전히
--   1회로 막는, 혹은 그 반대)가 된다.
-- =====================================================================


-- ---------------------------------------------------------------------
-- 0) 사전점검 — 지금 granted+NULL 구멍에 실제로 걸린 행이 있는지 먼저
--    확인한다. 있으면 진행을 막는다(조용히 넘어가 데이터를 임의로
--    고치지 않는다) — sql/68 이 반복해 온 "raise warning 후 계속"이
--    아니라 "raise exception 으로 즉시 중단"이다. 이 파일이 봉합하는
--    구멍 자체가 만들어낸 행이라 값을 추측해 자동 정정할 근거가 없고,
--    새 등식 제약을 무조건 추가하면 그 행이 있는 채로는 아래 2)절이
--    23514 로 죽어 이 파일 자체가 절반만 적용된 상태로 실패한다 — 원인이
--    분명한 이 DO 블록에서 먼저 멈추는 편이 낫다.
-- ---------------------------------------------------------------------
do $$
declare
  v_bad int;
begin
  select count(*) into v_bad
    from public.coupons
   where max_uses_per_user is distinct from (case when grant_type = 'granted' then 1 end);

  if v_bad > 0 then
    raise exception 'coupons 에 grant_type/max_uses_per_user 파생 등식을 어기는 행 % 개 발견(granted+NULL 구멍 또는 그 밖의 불일치) — 아래 2)절 CHECK 추가가 23514 로 실패하기 전에 먼저 값을 바로잡아라. granted 는 max_uses_per_user=1, auto 는 max_uses_per_user=NULL 이어야 한다(sql/70).', v_bad;
  end if;
end $$;


-- ---------------------------------------------------------------------
-- 1) 옛 편측 CHECK 두 개 제거 — 위 배경 절에서 설명한 구멍의 원인.
--    아래 2)절 등식 하나가 이 둘을 완전히 대체한다(교집합이 아니라
--    구멍을 메운 상위 호환 — 옛 CHECK 를 통과하던 auto+NULL/granted+1
--    은 새 등식도 그대로 통과하고, 옛 CHECK 만 통과하던 granted+NULL
--    은 새 등식에서 비로소 막힌다).
-- ---------------------------------------------------------------------
alter table public.coupons drop constraint if exists coupons_per_user_cap_requires_grant_check;
alter table public.coupons drop constraint if exists coupons_granted_cap_is_one_check;


-- ---------------------------------------------------------------------
-- 2) 파생 등식 CHECK — 위 배경 절 "해법" 그대로.
-- ---------------------------------------------------------------------
alter table public.coupons drop constraint if exists coupons_cap_derived_from_grant_type_check;
alter table public.coupons add constraint coupons_cap_derived_from_grant_type_check
  check (max_uses_per_user is not distinct from (case when grant_type = 'granted' then 1 end));

comment on constraint coupons_cap_derived_from_grant_type_check on public.coupons is
  'max_uses_per_user 는 grant_type 의 파생값이다(2026-08-12 팀 리드 확정, sql/70). grant_type=''granted'' → max_uses_per_user 는 반드시 1, grant_type=''auto'' → 반드시 NULL. 이 등식이 대체하기 전 sql/68_enrollment_request_pair.sql 5-d-2)/5-d-3)절의 편측 CHECK 두 개(coupons_per_user_cap_requires_grant_check/coupons_granted_cap_is_one_check)는 granted+NULL 조합을 막지 못하는 구멍이 있었다 — `max_uses_per_user = 1` 이 `NULL = 1` 로 NULL 평가되어 CHECK 를 통과했기 때문이다(PostgreSQL CHECK 는 FALSE 일 때만 위반, NULL 은 통과). N>1 지원으로 이 파생을 풀어야 하는 날에는 이 제약 하나만 고치지 말 것 — sql/68 5-d-3)절의 coupons_granted_cap_is_one_check/coupon_redemptions_single_use_uidx(둘 다 "N=1 고정" 전제의 DB 백스톱)도 반드시 함께 재설계하라. CouponAdmin 화면이 grant_type↔max_uses_per_user 를 파생 관계로 그리지 않는 독립 입력 필드라면 그 UI 도 함께 복구해야 한다(sql/70 파일 상단 참고).';


-- ---------------------------------------------------------------------
-- 3) 정적 DEFAULT 제거 — sql/55_coupon_policy.sql 0)절 P2-6 정정이 걸어둔
--    `alter column max_uses_per_user set default 1`을 걷어낸다. 파생값이
--    된 이상 "값을 안 채우면 1"이라는 고정 기본값은 오히려 위험하다 —
--    grant_type 을 'auto'(DEFAULT)로 두고 max_uses_per_user 를 생략해
--    INSERT 하면, 옛 DEFAULT(1) 때문에 auto+1 이 되어 위 2)절 등식에
--    즉시 23514 로 걸린다(과거엔 값을 안 채워도 "안전한 쪽(1회 제한)"
--    으로 조용히 떨어졌는데, 지금은 파생 등식이 있어 조용히 떨어질 값
--    자체가 없다 — 명시적으로 채우거나 실패해야 한다는 게 이 파일의
--    설계다). 기존 행의 저장값은 이 ALTER 로 바뀌지 않는다 — DEFAULT
--    제거는 이후의 INSERT 에만 영향을 준다.
-- ---------------------------------------------------------------------
alter table public.coupons alter column max_uses_per_user drop default;


-- =====================================================================
-- 확인용 (실행 후 눈으로 볼 것 — 아래는 주석, 자동 실행되지 않는다)
-- =====================================================================
--
-- V1) granted+NULL 이 이제 23514 로 막히는지.
--     update public.coupons set max_uses_per_user = null
--      where slug = 'signup-2000'; -- grant_type='granted' 그대로 두고 시도
--     -- 실패해야 정상(coupons_cap_derived_from_grant_type_check).
--
-- V2) auto+NULL / granted+1(현재 dev 실물 3행 그대로)은 통과해야 한다.
--     select slug, grant_type, max_uses_per_user from public.coupons order by slug;
--     -- signup-2000: granted/1, over40k-3000: auto/NULL, over80k-5000: auto/NULL
--     -- 이 세 행이 그대로 남아 있으면(=UPDATE 없이 SELECT 만) 이 파일
--     -- 적용 자체는 기존 데이터에 영향이 없었다는 뜻.
--
-- V3) 옛 DEFAULT 가 제거됐는지.
--     select column_default from information_schema.columns
--      where table_schema='public' and table_name='coupons'
--        and column_name='max_uses_per_user';
--     -- null 이어야 한다(과거엔 '1').
--
-- V4) 옛 CHECK 두 개가 사라지고 새 등식 하나만 남았는지.
--     select conname, pg_get_constraintdef(oid) from pg_constraint
--      where conrelid = 'public.coupons'::regclass
--        and conname like 'coupons_%cap%';
--     -- coupons_cap_derived_from_grant_type_check 하나만 나와야 한다.
--
-- =====================================================================
-- 적용 이력
-- =====================================================================
-- 미적용 — 이 파일은 작성만 완료했다(2026-08-12). 적용·검증은 별도
-- 담당자가 수행한다(운영 DB(ucjlcvqvinspmrasvsug)는 이 작업 범위에서
-- 읽기조차 하지 않았다).
-- =====================================================================
