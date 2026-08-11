-- =====================================================================
-- 콘텐츠 도메인 고아 admin_* 테이블 7개 삭제
-- Supabase SQL Editor 에서 실행하세요. (idempotent - 여러 번 실행해도 안전)
-- =====================================================================
--
-- 배경 — sql/61(오프라인 수강 도메인)과 같은 성격의 고아가 콘텐츠
--   도메인에도 7개 있다.
--     무접두어: banners(3행) faqs(30행) galleries(22행) notices(3행)
--               popups(1행)
--     접두어:   admin_banners admin_faqs admin_galleries admin_notices
--               admin_popups admin_cancel_reasons admin_discount_reasons
--               (전부 0행)
--   admin_cancel_reasons/admin_discount_reasons 는 무접두어 짝이 아예
--   없다 — 처음부터 아무 코드도 쓴 적 없는 고아 테이블이다.
--   src/pages/Admin.jsx 의 제네릭 CRUD 는 무접두어(banners/faqs/galleries/
--   notices/popups) 쪽을 쓴다. api/, src/ 전수 grep 참조 0건.
--
-- ---------------------------------------------------------------------
-- 0) 조사 (2026-08-11 dev 실측)
-- ---------------------------------------------------------------------
-- a) 대상 7개 행수(전부 count(*) 실측) — 전부 0행:
--      admin_banners 0 / admin_faqs 0 / admin_galleries 0 /
--      admin_notices 0 / admin_popups 0 / admin_cancel_reasons 0 /
--      admin_discount_reasons 0.
--    참고로 무접두어 쪽(건드리지 않음)은 banners 3 / faqs 30 /
--    galleries 22 / notices 3 / popups 1.
--
-- b) FK 의존(pg_constraint 실측) — 대상 7개 사이/외부 어디에도 FK 관계
--    없음(자식·부모 어느 방향으로도 0건). 서로 완전히 독립이라 드롭
--    순서는 무관하다.
--
-- c) 외부 참조 객체 전수 확인 — 결과: 없음.
--    · pg_views: 대상 7개를 정의에 포함한 뷰 0건.
--    · pg_proc.prosrc: 위 패턴을 본문에 포함한 함수 0건.
--    · pg_trigger: 각 테이블 자신에 걸린 set_updated_at 트리거만 있다
--      (set_admin_banners_updated_at 등 7건, 전부 자기 테이블 self
--      트리거이자 범용 함수 set_updated_at() 호출 — DROP TABLE 시 테이블과
--      함께 자동 삭제되며 함수 자체는 다른 테이블도 쓰므로 안전하다).
--    · pg_policies: 각 테이블 자신에 걸린 "<table>_admin_all" 정책
--      (is_admin(), ALL) 7건 — 전부 자기 테이블 소유 정책이라 DROP TABLE
--      시 함께 삭제된다. 외부에서 대상 7개를 읽는 정책은 없다.
--    즉 대상 7개는 서로를 포함해 완전히 고립된 테이블이었다.
--
-- d) api/, src/ 코드 참조 재확인 — 0건.
--
-- ---------------------------------------------------------------------
-- 결정
-- ---------------------------------------------------------------------
--   · CASCADE 를 쓰지 않는다 — FK 의존이 없어 순서는 무관하지만, sql/61
--     과 동일하게 IF EXISTS ... RESTRICT 로 하나씩 드롭한다. 예상 밖
--     의존이 있으면 이 자체가 에러로 드러난다(그런 의존은 위 c)절에서
--     이미 없음을 확인했다).
--   · 데이터가 하나라도 있으면 예외를 던지고 드롭 자체를 하지 않는다 —
--     sql/ 파일은 운영에서도 실행될 수 있어, 운영에 이 테이블들에 데이터가
--     있을 가능성을 배제할 수 없기 때문이다(이번 작업은 운영 DB 접근
--     금지 지시로 운영 데이터 유무를 확인하지 못했다).
--   · 무접두어 짝(banners/faqs/galleries/notices/popups)은 이 작업
--     대상이 아니다 — 실데이터가 있어 절대 건드리지 않는다.
--   · SQLSTATE 는 sql/61 이 WC008 을 마지막으로 썼다(기존 WC001~WC008
--     은 sql/55/58/59/61) — 같은 "고아 테이블에 데이터가 남아 있어 드롭을
--     중단" 의미지만 도메인이 다르므로(오프라인 수강 vs 콘텐츠) 재사용하지
--     않고 새 코드 WC009 를 배정한다.
-- ---------------------------------------------------------------------

do $$
declare
  v_total bigint := 0;
  v_n     bigint;
  t       text;
begin
  foreach t in array array[
    'admin_banners', 'admin_faqs', 'admin_galleries', 'admin_notices',
    'admin_popups', 'admin_cancel_reasons', 'admin_discount_reasons'
  ] loop
    if to_regclass('public.' || t) is not null then
      execute format('select count(*) from public.%I', t) into v_n;
      v_total := v_total + v_n;
    end if;
  end loop;

  if v_total > 0 then
    raise exception '콘텐츠 도메인 admin_* 테이블에 데이터가 % 행 있다. 이관 판단 전에는 삭제하지 않는다.', v_total
      using errcode = 'WC009';
  end if;

  -- 여기까지 왔으면 대상 7개(존재하는 것만) 전부 0행 — FK 의존이 없어
  -- 순서는 무관하지만 sql/61 과 동일하게 IF EXISTS 로 하나씩 RESTRICT
  -- 드롭한다. 이미 없는 테이블은 IF EXISTS 로 no-op(재실행 멱등성).
  drop table if exists public.admin_banners restrict;
  drop table if exists public.admin_faqs restrict;
  drop table if exists public.admin_galleries restrict;
  drop table if exists public.admin_notices restrict;
  drop table if exists public.admin_popups restrict;
  drop table if exists public.admin_cancel_reasons restrict;
  drop table if exists public.admin_discount_reasons restrict;
end $$;

-- SQLSTATE 배정 (기존 WC001~WC008 는 sql/55/58/59/61)
--   WC009  admin_content_orphan_tables_not_empty   콘텐츠 도메인 admin_*
--                                                   고아 테이블 중 하나
--                                                   이상에 데이터가 있어
--                                                   드롭을 중단함(수동
--                                                   이관 판단 필요).

-- =====================================================================
-- 확인용 (실행 후 눈으로 볼 것 — 아래는 주석, 자동 실행되지 않는다)
-- =====================================================================
-- 1) 대상 7개가 실제로 사라졌는지(전부 null 기대).
-- select to_regclass('public.admin_banners'),
--        to_regclass('public.admin_faqs'),
--        to_regclass('public.admin_galleries'),
--        to_regclass('public.admin_notices'),
--        to_regclass('public.admin_popups'),
--        to_regclass('public.admin_cancel_reasons'),
--        to_regclass('public.admin_discount_reasons');
--
-- 2) 무접두어 짝은 행수 그대로 남아 있는지(banners 3 / faqs 30 /
--    galleries 22 / notices 3 / popups 1 기대).
-- select (select count(*) from public.banners),
--        (select count(*) from public.faqs),
--        (select count(*) from public.galleries),
--        (select count(*) from public.notices),
--        (select count(*) from public.popups);
--
-- 3) 가드 동작 확인 — 반드시 begin...rollback 안에서.
-- begin;
--   insert into public.admin_banners default values; -- 재실행 전 임시 확인용
--   -- 위 insert 후 이 파일을 다시 돌리면 WC009 로 멈춰야 한다.
-- rollback;
--
-- 4) 재실행 멱등성 — 이 파일을 다시 실행해도 에러 없이 no-op(1)의
--    결과가 그대로인지.
-- =====================================================================
--
-- 적용 이력
-- =====================================================================
-- dev(gjowqdiopinhixfivnkx) 적용·검증 완료: 2026-08-11.
--   0) 대상 7개 전부 0행 확인, FK 의존 0건 확인, 외부 참조 객체
--      (뷰/함수/트리거/정책) 0건 확인, api/·src/ 코드 참조 0건 확인.
--   1) 대상 7개 to_regclass 전부 null, banners/faqs/galleries/notices/
--      popups 5개는 행수 그대로(3/30/22/3/1) 확인.
--   2) 가드 작동 확인 — begin 블록 안에서 admin_banners 에 1행 insert 후
--      이 do 블록을 재실행해 WC009 로 예외 발생·중단 확인, rollback 으로
--      원복.
--   3) 재실행 멱등성 확인 — 전체 재적용 시 에러 없이 no-op.
--   운영 반영은 별도 절차(dev sql 정본 재생성 → 운영 diff → 마이그레이션).
--   운영 DB(ucjlcvqvinspmrasvsug)는 이 작업 범위에서 접근하지 않았다(지시).
-- =====================================================================
