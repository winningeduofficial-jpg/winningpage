-- =====================================================================
-- 오프라인 수강 도메인 테이블 이원화 정리 — enrollments 로 단일화
-- Supabase SQL Editor 에서 실행하세요. (idempotent - 여러 번 실행해도 안전)
-- =====================================================================
--
-- 배경 — 실제 고장
--   이 저장소에 오프라인 수강 도메인 테이블이 두 벌 존재했다.
--     무접두어: enrollments(19컬럼) payments(11) refunds(13)
--               program_categories(10) terms(13)
--     접두어:   admin_enrollments(25) admin_payments(16) admin_refunds(15)
--               admin_program_categories(5) admin_programs(6)
--               admin_classes(30) admin_terms(5)
--   src/pages/Admin.jsx 의 제네릭 CRUD 'enrollments' 설정(1646행)이
--   실제로 쓰는 table 은 무접두어 'enrollments' 다 — 어드민이 오프라인
--   수강생을 등록하면 이 테이블에 쌓인다. 반면 api/create-service-ticket.js
--   의 checkEnrollmentPayment (구 158행)는 'admin_enrollments' 를 조회해
--   결제 완료 여부로 앱 입장을 판정했다. 서로 다른 테이블이라 정상 등록한
--   오프라인 수강생은 앱에 절대 못 들어가는 구조였다 — 둘 다 dev 실측
--   0행이라 아직 아무도 겪지 않았을 뿐이다. admin_* 나머지 6개
--   (admin_payments/admin_refunds/admin_program_categories/admin_programs/
--   admin_classes/admin_terms) 는 저장소 전체에서 참조 0건(주석 언급
--   제외, grep 확인) — 처음부터 아무 코드도 쓴 적 없는 고아 테이블이다.
--
--   이 파일은 (1) create-service-ticket.js 를 enrollments 로 정정하고
--   (선언은 이 파일이 아니라 api/create-service-ticket.js 자체 수정으로
--   반영 — 이 SQL 파일은 스키마 쪽만 다룬다) (2) 참조가 전혀 없던
--   admin_* 7개 테이블을 삭제해 "두 벌 존재" 자체를 없앤다. 6개월 뒤
--   누군가 admin_enrollments 를 다시 만들지 않도록 이 배경을 남긴다.
--
-- ---------------------------------------------------------------------
-- 0) 조사 (2026-08-11 dev 실측)
-- ---------------------------------------------------------------------
-- a) checkEnrollmentPayment(api/create-service-ticket.js, 구 157-176행)
--    select 컬럼: id, profile_id, category_name, program_name, class_name,
--    payment_status, application_status. 판정: category_name/program_name/
--    class_name 을 이어붙인 문자열에 config.payment_keywords 부분일치
--    (isPaidStatus) AND isPaidStatus(payment_status). application_status
--    는 select 만 되고 판정에는 쓰이지 않는다(기존 코드 그대로 — 이번
--    작업에서 판정 로직을 바꾸지 않는다, 팀 리드 지시).
--
-- b) enrollments(19컬럼) vs admin_enrollments(25컬럼) 컬럼 대조
--    (information_schema.columns 실측). 판정에 필요한 7개 컬럼이
--    enrollments 에 전부 "동일한 이름"으로 존재한다 — 컬럼명을 맞출
--    필요가 전혀 없었다:
--      id                 uuid  (양쪽 동일)
--      profile_id         uuid  (양쪽 동일, nullable, FK→profiles ON DELETE SET NULL)
--      category_name      text  (양쪽 동일)
--      program_name       text  (양쪽 동일)
--      class_name         text  (양쪽 동일)
--      payment_status     text  (양쪽 동일, default 다름 — 둘 다 '납부대기')
--      application_status text  (양쪽 동일, default 다름: enrollments
--                                 '신청완료' / admin_enrollments '추첨대기'
--                                 — 어차피 판정에 안 쓰이는 컬럼이라 무관)
--    admin_enrollments 에만 있고 enrollments 에 없는 컬럼(class_id, capacity,
--    region, discount_rate, unpaid_amount, application_route)은 판정
--    로직이 참조하지 않아 이관 대상이 아니다. enrollments 에만 있고
--    admin_enrollments 에 없는 student_name(admin 쪽은 applicant_name)도
--    이번 select 목록에 없어 무관하다. 결론: 컬럼명 치환 없이 select 문의
--    from 절만 admin_enrollments → enrollments 로 바꾸면 된다.
--
-- c) src/pages/Admin.jsx:1646-1692 'enrollments' config — table:
--    'enrollments', columns/fields 에 category_name/program_name/
--    class_name/payment_status 가 전부 포함되어 어드민이 실제로 채우는
--    값과 판정 조건이 맞물린다. payment_status 옵션은
--    ['납부대기','납부완료','미납','취소요청','환불완료'] — isPaidStatus 의
--    '납부완료' 키워드와 일치, DENIED_PAYMENT_STATUSES 의 '미납'/'환불'/
--    '취소' 와도 일치(부분일치 포함). 판정 어휘 자체는 이번 작업 범위 밖
--    (팀 리드 지시)이라 손대지 않았다.
--
-- d) admin_* 7개 테이블 행수(전부 count(*) 실측) — 전부 0행:
--      admin_enrollments 0 / admin_payments 0 / admin_refunds 0 /
--      admin_program_categories 0 / admin_programs 0 / admin_classes 0 /
--      admin_terms 0.
--    참고로 무접두어 쪽(건드리지 않음)도 enrollments 0 / payments 0 /
--    refunds 0 / program_categories 6 / terms 8.
--
-- e) FK 의존 순서(pg_constraint 실측, 전부 ON DELETE SET NULL):
--      admin_refunds.payment_id       → admin_payments(id)
--      admin_payments.enrollment_id   → admin_enrollments(id)
--      admin_enrollments.class_id     → admin_classes(id)
--      admin_enrollments.profile_id   → profiles(id)   -- profiles 는 안 지움
--      admin_classes.program_id       → admin_programs(id)
--      admin_classes.term_id          → admin_terms(id)
--      admin_programs.category_id     → admin_program_categories(id)
--    드롭 순서(자식→부모): admin_refunds, admin_payments,
--    admin_enrollments, admin_classes, admin_programs,
--    admin_program_categories, admin_terms. admin_terms 는 admin_classes
--    가 유일한 참조자라 admin_classes 이후 아무 때나 드롭해도 안전하다.
--
-- f) 외부 참조 객체 전수 확인 — 결과: 없음.
--    · pg_views: admin_(enrollments|payments|refunds|program_categories|
--      programs|classes|terms) 를 정의에 포함한 뷰 0건.
--    · pg_proc.prosrc: 위 패턴을 본문에 포함한 함수 0건.
--    · pg_trigger: 각 admin_* 테이블 자신에 걸린 set_updated_at 트리거만
--      있다(set_admin_classes_updated_at 등 7건, 전부 자기 테이블 self
--      트리거이자 범용 함수 set_updated_at() 호출 — admin_* 전용 함수가
--      아니라 DROP TABLE 시 테이블과 함께 자동 삭제되며 함수 자체는 다른
--      테이블도 쓰므로 안전하다).
--    · pg_policies: 각 admin_* 테이블 자신에 걸린 "<table>_admin_all"
--      정책(is_admin(), ALL) 7건 — 전부 자기 테이블 소유 정책이라 DROP
--      TABLE 시 함께 삭제된다. 외부에서 admin_* 를 읽는 정책은 없다.
--    즉 admin_* 7개는 서로를 제외하면 완전히 고립된 테이블이었다.
--
-- ---------------------------------------------------------------------
-- 결정
-- ---------------------------------------------------------------------
--   · CASCADE 를 쓰지 않는다(팀 리드 지시) — 위 e)절 순서대로 하나씩
--     RESTRICT 로 드롭한다. 예상 밖 의존이 있으면 이 자체가 에러로
--     드러난다(그런 의존은 f)절에서 이미 없음을 확인했다).
--   · 데이터가 하나라도 있으면 예외를 던지고 드롭 자체를 하지 않는다 —
--     sql/ 파일은 운영에서도 실행될 수 있어, 운영에 이 테이블들에 데이터가
--     있을 가능성을 배제할 수 없기 때문이다(이번 작업은 운영 DB 접근
--     금지 지시로 운영 데이터 유무를 확인하지 못했다).
--   · terms(무접두어, 13컬럼, user_term_agreements 가 FK 로 참조)는 이
--     작업 대상이 아니다 — admin_terms(5컬럼, 고아)와 이름만 비슷한 별개
--     테이블이라 절대 건드리지 않는다(팀 리드 지시).
-- ---------------------------------------------------------------------

do $$
declare
  v_total bigint := 0;
  v_n     bigint;
  t       text;
begin
  foreach t in array array[
    'admin_refunds', 'admin_payments', 'admin_enrollments',
    'admin_classes', 'admin_programs', 'admin_program_categories',
    'admin_terms'
  ] loop
    if to_regclass('public.' || t) is not null then
      execute format('select count(*) from public.%I', t) into v_n;
      v_total := v_total + v_n;
    end if;
  end loop;

  if v_total > 0 then
    raise exception 'admin_* 테이블에 데이터가 % 행 있다. 이관 판단 전에는 삭제하지 않는다.', v_total
      using errcode = 'WC008';
  end if;

  -- 여기까지 왔으면 admin_* 7개(존재하는 것만) 전부 0행 — 자식→부모
  -- 순서로 RESTRICT 드롭. 이미 없는 테이블은 IF EXISTS 로 no-op(재실행
  -- 멱등성).
  drop table if exists public.admin_refunds restrict;
  drop table if exists public.admin_payments restrict;
  drop table if exists public.admin_enrollments restrict;
  drop table if exists public.admin_classes restrict;
  drop table if exists public.admin_programs restrict;
  drop table if exists public.admin_program_categories restrict;
  drop table if exists public.admin_terms restrict;
end $$;

-- SQLSTATE 배정 (기존 WC001~WC007 는 sql/55/58/59)
--   WC008  admin_legacy_tables_not_empty   admin_* 고아 테이블 중 하나
--                                          이상에 데이터가 있어 드롭을
--                                          중단함(수동 이관 판단 필요).

-- =====================================================================
-- 확인용 (실행 후 눈으로 볼 것 — 아래는 주석, 자동 실행되지 않는다)
-- =====================================================================
-- 1) admin_* 7개가 실제로 사라졌는지(전부 null 기대).
-- select to_regclass('public.admin_enrollments'),
--        to_regclass('public.admin_payments'),
--        to_regclass('public.admin_refunds'),
--        to_regclass('public.admin_program_categories'),
--        to_regclass('public.admin_programs'),
--        to_regclass('public.admin_classes'),
--        to_regclass('public.admin_terms');
--
-- 2) 무접두어 세트 + terms 는 그대로 남아 있는지(전부 not null 기대).
-- select to_regclass('public.enrollments'), to_regclass('public.payments'),
--        to_regclass('public.refunds'), to_regclass('public.program_categories'),
--        to_regclass('public.terms');
--
-- 3) 가드 동작 확인 — 반드시 begin...rollback 안에서.
-- begin;
--   insert into public.admin_enrollments default values; -- 재실행 전 임시 확인용
--   -- 위 insert 후 이 파일을 다시 돌리면 WC008 로 멈춰야 한다.
-- rollback;
--
-- 4) 재실행 멱등성 — 이 파일을 다시 실행해도 에러 없이 no-op(1)의
--    결과가 그대로인지.
-- =====================================================================
--
-- 적용 이력
-- =====================================================================
-- dev(gjowqdiopinhixfivnkx) 적용·검증 완료: 2026-08-11.
--   0) admin_* 7개 전부 0행 확인, FK 의존 순서(e절) 실측 확인, 외부 참조
--      객체(뷰/함수/트리거/정책) 0건 확인(f절).
--   1) admin_* 7개 to_regclass 전부 null, enrollments/payments/refunds/
--      program_categories/terms 5개 전부 not null(그대로 존재) 확인.
--   2) 가드 작동 확인 — begin 블록 안에서 admin_enrollments 에 1행
--      insert 후 이 do 블록을 재실행해 WC008 로 예외 발생·중단 확인,
--      rollback 으로 원복.
--   3) 재실행 멱등성 확인 — 전체 재적용 시 에러 없이 no-op.
--   운영 반영은 별도 절차(dev sql 정본 재생성 → 운영 diff → 마이그레이션).
--   운영 DB(ucjlcvqvinspmrasvsug)는 이 작업 범위에서 접근하지 않았다(지시).
-- =====================================================================
