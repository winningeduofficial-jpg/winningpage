-- =====================================================================
-- 상품 → 프로그램(이용 권한) 관계를 DB 로 이전
-- Supabase SQL Editor 에서 실행하세요. (idempotent - 여러 번 실행해도 안전)
-- =====================================================================
--
-- 배경 — 감사 결과 M3 (P0)
--   "이 상품을 사면 어떤 프로그램 권한이 생기는가"라는 규칙이 DB 에 없고
--   api/_lib/programAccess.js 의 하드코딩 객체(SERVICE_KEY_TO_PROGRAM_KEY)에만
--   있었다. products.service_key 에는 FK 도 CHECK 도 없어 이 매핑이 실제로
--   맞는지 DB 가 전혀 검증하지 못했다 — dev 가 'goal', 운영이 'target' 으로
--   갈려 있던 사고(sql/54_program_access_grant.sql "goal → target 전환" 절)가
--   이 구조에서 비롯됐다.
--
-- ---------------------------------------------------------------------
-- 0) 조사 (2026-08-11 dev 실측)
-- ---------------------------------------------------------------------
-- a) service_key → program_key 매핑 사본 실제 위치 (grep 전수 확인, 4곳)
--    · api/_lib/programAccess.js:68-71 SERVICE_KEY_TO_PROGRAM_KEY
--        — 결제 확정 시 program_access 에 권한을 부여/회수하는 정본 매핑.
--          이 파일에서 DB 조회로 교체한다(아래 3절).
--    · api/create-service-ticket.js:7-22 SERVICE_CONFIGS[key].program_keys
--        — SSO 입장권 발급 전 program_access 를 조회할 program_key 후보
--          배열. goal 항목이 ['goal','target'] 관용을 갖고 있었다(아래 4절).
--    · src/lib/paidServiceAccess.js:5-61 PAID_SERVICE_CONFIGS
--        — "이 서비스가 SSO 입장 흐름을 타는가"를 링크 텍스트 키워드로
--          판정하는 클라이언트 표시 로직. service_key→program_key 매핑이
--          아니라 "SSO 앱이 있는 서비스 목록"(suhaeng·goal 2건)이라 이번
--          작업의 매핑 사본이 아니다 — 손대지 않는다(아래 3절 판단 근거).
--    · src/pages/PaymentSuccess.jsx:40-48 SERVICE_ENTRY
--        — 부여 성공 후 "프로그램 시작하기" CTA 목적지(program_key→link).
--          이것도 매핑이 아니라 "현재 목적지 페이지가 있는 프로그램 목록"
--          이라 손대지 않는다(아래 3절 판단 근거).
--    src/pages/services/Callmentor.jsx·InDepthResearch.jsx·SelfAssessment.jsx
--    는 grep 매칭이 "PAID_SERVICE_CONFIGS 미등록" 이라는 주석뿐 — 매핑
--    사본이 아니다.
--
-- b) programs 스키마(sql/00_base_schema.sql:853-864)·현재 데이터.
--    id uuid / program_key text unique not null / name text not null /
--    app_url text(nullable) / is_active boolean default true /
--    sort_order int default 1. 현재 2행 — 둘 다 app_url = null:
--      target   '위닝 목표관리 프로그램'  app_url=null  is_active=true
--      suhaeng  '위닝 수행평가 프로그램'  app_url=null  is_active=true
--    sql/54_program_access_grant.sql "app_url 은 비워 둔다" 절 — 자식 앱
--    주소의 정본은 서버 환경변수(GOAL_SERVICE_URL 등)이지 DB 가 아니다.
--
-- c) api/create-service-ticket.js — SERVICE_CONFIGS 는 suhaeng·goal 2건뿐.
--    goal.program_keys = ['goal','target'] 관용이 실재한다(아래 4절에서 처리).
--    susi·mentor·diagnose 는 이 파일에 아예 등록되어 있지 않다 — SSO 입장
--    앱 자체가 없다는 뜻이라 이번 SQL 로 programs 행을 추가해도 이 파일의
--    SERVICE_CONFIGS 는 건드리지 않는다(입장 앱이 생기는 시점의 별도 작업).
--
-- d) susi·mentor·diagnose 의 app_url 단서 — 저장소 전체(.env.example 키
--    이름 포함, 값 아님)에 SUSI_SERVICE_URL / MENTOR_SERVICE_URL /
--    DIAGNOSE_SERVICE_URL 류 환경변수가 **하나도 없다**(grep 확인).
--    .env.example 에 있는 서비스 URL 키는 SUHAENG_SERVICE_URL ·
--    GOAL_SERVICE_URL 둘뿐이다. TARGET_SERVICE_URL 조차 .env.example 에는
--    없다(코드의 fallback 참조만 존재). → 지어내지 않고 3행 모두 app_url
--    을 null 로 둔다. b)절과 같은 이유로 이 레포가 app_url 을 읽지도 않는다.
--
-- e) program_access.program_key FK — sql/00_base_schema.sql:1043-1044
--    program_access_program_key_fkey → programs(program_key) ON DELETE
--    CASCADE. 기존 FK 로, 이 작업은 건드리지 않는다(팀 리드 지시는 새
--    "products → programs" FK 에만 해당).
--
-- f) products 실측 스키마(dev, information_schema) — id uuid pk /
--    slug text unique not null / service_key text not null (그룹핑용,
--    FK·CHECK 없음) / 그 외 sql/10_pricing_orders.sql:17-33 그대로.
--    dev 14행 분포: diagnose 1 / goal 4 / mentor 1 / suhaeng 5 / susi 3.
--
-- g) order_items 실측(sql/56_surrogate_uuid_keys.sql 3절) — product_id
--    uuid FK→products(id) ON DELETE SET NULL(관계) / product_slug text
--    (구매 시점 스냅샷, FK 없음) / service_key text(스냅샷, FK 없음).
--    "관계 컬럼과 스냅샷 컬럼을 분리한다"는 선례가 이미 이 저장소에 있다
--    — 아래 2절 (다)안 선택의 직접적 근거.
--
-- ---------------------------------------------------------------------
-- 결정 1 — products.service_key 는 그대로 둔다 ((가)/(나) 기각, (다) 채택)
-- ---------------------------------------------------------------------
--   (가) programs 에 'goal' 을 추가 → 'target' 과 중복 개념이 생겨 기각
--        (팀 리드 지시로 이미 배제).
--   (나) products.service_key 를 'goal'→'target' 으로 변경 → 기각.
--        service_key 는 프론트 그룹핑·라우팅에 실사용 중이다(grep 확인):
--          · src/lib/products.js:15-24 groupByService 가 service_key 로
--            상품을 묶어 Pricing 화면에 서비스 카드 단위를 만든다.
--          · src/pages/Pricing.jsx:9 주석 "service_key → 서비스 상세 라우트".
--          · src/pages/services/GoalManagement.jsx:685 가 service_key=
--            'goal' 문자열로 목표관리 상품을 직접 조회한다(programAccess.js
--            2026-08-11 주석에 이미 명시된 제약).
--          · api/create-order.js:115 가 결제 시점 order_items.service_key
--            스냅샷에 이 값을 그대로 옮긴다 — 과거 주문의 스냅샷 값까지
--            바꾸는 대규모 소급이 필요해진다.
--        즉 'goal'→'target' 전환은 이 저장소 3곳 이상을 함께 고쳐야 하는
--        광범위한 변경인데, 정작 얻는 이득(그룹핑 키 명칭 통일)이 없다 —
--        service_key 는 "상품을 사람이 그룹 짓는 키"이지 "권한 키"가
--        아니어도 되기 때문이다.
--   (다) products 에 별도 컬럼 program_key 를 추가하고 그것에만 FK 를
--        건다. service_key 는 프론트 그룹핑 용도로 그대로 둔다. → 채택.
--        위 g)절 order_items.product_id/product_slug 분리 선례와 같은
--        원칙("관계"와 "표시·그룹핑용 값"을 분리)이라 이 저장소 관용과
--        일관된다.
--
-- 결정 2 — nullable (NOT NULL 로 하지 않는다)
--   기준: "권한을 주지 않는 상품이 앞으로 생길 수 있는가". 지금 14개는
--   전부 권한을 준다(susi·mentor·diagnose 포함, 사용자 확정). 하지만
--   NOT NULL 로 걸면 앞으로 "입장 앱이 없는 부가 상품"(예: 오프라인 특강
--   1회권처럼 App 권한이 필요 없는 상품)이 생길 때마다 실체 없는 programs
--   행을 억지로 만들어야 한다(placeholder anti-pattern). FK 는 nullable
--   컬럼에서도 non-null 값에 대해서는 그대로 강제되므로, "권한 없음"을
--   NULL 로 명시적으로 표현할 수 있게 열어 둔다. 지금 14행은 전부
--   프로그램을 가지므로 이 파일이 전수 백필해 현재 시점 NULL 은 0건이다
--   (아래 확인용 쿼리).
--
-- 결정 3 — FK 는 ON DELETE RESTRICT
--   프로그램을 지우면 그 상품이 무엇을 주는지 알 수 없게 되므로 CASCADE
--   는 쓰지 않는다(팀 리드 지시). RESTRICT 로 걸어 programs 행 삭제 자체를
--   막는다 — program_access 쪽 기존 CASCADE(위 e절)와는 의도가 다르다는
--   점에 주의: program_access 는 "권한 부여 이력"이라 프로그램이 없어지면
--   이력도 같이 정리돼도 되지만, products 는 "판매 상품 정의"라 프로그램이
--   없어져도 과거에 무엇을 팔았는지 정의는 남아야 한다.
--
-- ---------------------------------------------------------------------
-- 1) programs : susi·mentor·diagnose 3행 추가
-- ---------------------------------------------------------------------
--   program_key — products.service_key 값과 정확히 동일('susi'/'mentor'
--   /'diagnose'). goal→target 같은 새 이름 변환을 만들지 않는다.
--   name — 새로 짓지 않는다. products.service_name 을 그대로 쓴다
--   (susi='위닝 수시예측', mentor='위닝 콜멘토', diagnose='위닝 학습진단').
--   기존 target/suhaeng 2행이 "OO 프로그램" 접미사를 붙인 패턴처럼 보이나
--   suhaeng 행 이름('위닝 수행평가 프로그램')이 대응 service_name('위닝
--   AI수행평가')과 'AI' 유무가 달라 기계적 변환 규칙이라고 확신할 수 없다
--   (sql/54 주석: 운영 실데이터를 보고 수기로 정한 값). 그래서 애매한
--   경우의 원칙대로 service_name 원문을 그대로 쓴다 — 이름 정정이
--   필요하면 운영자가 나중에 Supabase Studio 에서 고치면 된다.
--   app_url — 위 0-d)절 결과 단서가 전혀 없어 null.
--   is_active — false. 세 서비스 모두 SSO 입장 앱이 아직 없다
--   (target_url 도, 그 근거가 될 환경변수 키 자체도 없음 — 0-c/0-d절).
--   programs_select_active 정책(sql/00_base_schema.sql:2068 부근)을 쓰는
--   화면이 앞으로 생기면 "활성"이 "실제로 입장 가능"을 뜻하게 될 텐데,
--   지금 true 로 켜 두면 존재하지 않는 앱을 노출할 위험이 있다. 앱이
--   생기면 그때 true 로 바꾼다.
-- ---------------------------------------------------------------------
insert into public.programs (program_key, name, app_url, is_active, sort_order)
values
  ('susi',     '위닝 수시예측', null, false, 3),
  ('mentor',   '위닝 콜멘토',   null, false, 4),
  ('diagnose', '위닝 학습진단', null, false, 5)
on conflict (program_key) do nothing;

-- ---------------------------------------------------------------------
-- 2) products.program_key : 관계 컬럼 추가 + 백필 + FK
-- ---------------------------------------------------------------------
alter table public.products
  add column if not exists program_key text;

comment on column public.products.program_key is
  '이 상품이 부여하는 이용 권한(programs.program_key). service_key(그룹핑·라우팅용, 불변 스냅샷 원본)와 별개 컬럼이다 — goal→target 처럼 표시용 키와 권한 키가 다를 수 있어서다(M3, 2026-08-11). NULL 허용 = "이 상품은 앱 이용 권한을 주지 않는다"는 명시적 상태.';

-- 백필. service_key → program_key 는 goal 만 이름이 바뀌고(→target,
-- 2026-08-11 사용자 확정, api/_lib/programAccess.js 참고) 나머지는
-- 문자열이 그대로 같다. dev 실측 14행 전부 이 case 중 하나에 해당
-- (0-f절) — 대응 없는 service_key 가 있으면 program_key 가 null 로 남고,
-- 바로 아래 FK 추가 단계에서는 걸리지 않지만(FK 는 non-null 값만 검증)
-- 이 파일 끝 확인용 쿼리 2)에서 드러난다.
--
-- ⚠ 2026-08-12 수정(sql/65 결함 E) — susi 분기를 제거했다. susi 는
--   duration_months·session_quota 가 없고(sql/64 §2 시드 목록에 susi가
--   없다) programs.susi 도 is_active=false(SSO 입장 앱이 아직 없다,
--   위 1)절 주석) — program_key='susi' 로 매핑해도 실제로 쓰는 곳이
--   없는데, sql/64 §3 products_entitlement_shape_check(program_key not
--   null 이면 duration_months·session_quota 중 최소 하나 필요)를 이
--   백필이 위반해 그 제약이 이미 걸린 DB 에서 53→60 을 재실행하면 이
--   UPDATE 자체가 23514 로 실패한다(sql/65 헤더 "결함 E" 참고). susi를
--   program_key=NULL 로 남기면 위 컬럼 주석의 "이 상품은 앱 이용 권한을
--   주지 않는다"는 원래 의도와도 더 맞다. 2026-08-12 현재 dev 의 susi
--   상품은 0행이라 이 수정은 현재 데이터를 바꾸지 않는다(sql/65 0-f절
--   실측) — 향후 재실행 안전성만을 위한 수정이다.
update public.products
   set program_key = case service_key
         when 'goal'     then 'target'
         when 'suhaeng'  then 'suhaeng'
         when 'mentor'   then 'mentor'
         when 'diagnose' then 'diagnose'
         else program_key
       end
 where program_key is null;

create index if not exists products_program_key_idx on public.products (program_key);

alter table public.products
  drop constraint if exists products_program_key_fkey;
alter table public.products
  add constraint products_program_key_fkey
  foreign key (program_key) references public.programs (program_key)
  on delete restrict;

comment on constraint products_program_key_fkey on public.products is
  '상품이 부여하는 프로그램 권한. ON DELETE RESTRICT — 프로그램을 지우면 그 상품이 무엇을 주는지 알 수 없게 되므로 삭제 자체를 막는다(M3, 2026-08-11). program_access_program_key_fkey(programs 참조, CASCADE)와 의도가 다르다 — 그쪽은 권한 "이력", 이쪽은 상품 "정의"라 삭제 시 함께 지워지면 안 된다.';

-- =====================================================================
-- 확인용 (실행 후 눈으로 볼 것 — 아래는 주석, 자동 실행되지 않는다)
-- =====================================================================
-- 1) programs 5행 — susi/mentor/diagnose 가 is_active=false, app_url=null 로 추가됐는지.
-- select program_key, name, app_url, is_active, sort_order
--   from public.programs order by sort_order;
--
-- 2) products.program_key NULL 0건인지(백필 누락 확인).
-- select service_key, program_key, count(*)
--   from public.products group by service_key, program_key order by service_key;
-- select count(*) from public.products where program_key is null;  -- 기대: 0
--
-- 3) FK 가 실제로 거부하는지 (begin...rollback 안에서).
-- begin;
--   update public.products set program_key = '__not_a_program__'
--     where slug = 'goal-1m';
-- rollback;
--   → 기대: ERROR 23503 (foreign_key_violation), constraint
--     "products_program_key_fkey".
--
-- begin;
--   delete from public.programs where program_key = 'target';
-- rollback;
--   → 기대: ERROR 23503 (foreign_key_violation) — products 가 참조 중이라
--     RESTRICT 로 거부돼야 한다(goal 4행이 program_key='target' 참조).
--
-- 4) 재실행 멱등성 — 이 파일을 다시 실행해도 위 1)~2) 결과가 그대로인지.
-- =====================================================================
--
-- 적용 이력
-- =====================================================================
-- dev(gjowqdiopinhixfivnkx) 적용·검증 완료: 2026-08-11.
--   1) programs 5행 확인 — target/suhaeng(기존, is_active=true) +
--      susi/mentor/diagnose(신규, is_active=false, app_url=null) 그대로.
--   2) products.program_key NULL 0건, service_key→program_key 5개 그룹
--      전부 기대값과 일치(diagnose→diagnose 1 / goal→target 4 /
--      mentor→mentor 1 / suhaeng→suhaeng 5 / susi→susi 3, 합 14).
--   3) FK 위반 시도 2건 모두 23503 으로 거부 확인(begin...rollback):
--      products.program_key 에 존재하지 않는 값 UPDATE, programs.target
--      DELETE(참조 중인 goal 4행 때문에 RESTRICT 발동) — 둘 다 기대대로 실패.
--   4) 재실행 — 전체 재적용 후 1)~2) 결과 동일(0행 변경, on conflict do
--      nothing + where program_key is null 백필이 재실행에서 no-op).
--   운영 반영은 별도 절차(dev sql 정본 재생성 → 운영 diff → 마이그레이션).
--   운영 DB(ucjlcvqvinspmrasvsug)는 이 작업 범위에서 접근하지 않았다(지시).
-- =====================================================================
