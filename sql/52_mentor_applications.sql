-- =====================================================================
-- 이용신청 > 멘토신청(/mentor-apply) 데이터 레이어.
-- Supabase SQL Editor / Management API에서 수동 실행 필요. (idempotent)
--
-- 포함:
--   1) public.mentor_applications 테이블 (멘토 지원서 1건 = 1행, proof_file_name 포함)
--   2) 조회용 인덱스 3종 (created_at desc / status / request_ip)
--   3) RLS — enable + 어드민 정책 1개만 (클라이언트 정책 미부여)
--   4) updated_at 트리거 (공용 public.set_updated_at() 재사용)
--   5) Storage 버킷 'mentor-applications'(비공개) + file_size_limit(50MB)·
--      allowed_mime_types(PDF/PNG/JPG/HWP) + 어드민 read 정책
--      — 전역 업로드 상한 실측 완료(52428800 = 50MB, dev·운영 동일). 시안 원문은
--      100MB 였으나 사용자 승인 하에 50MB로 정렬(2026-08-10, 상세는 (4) 절 참고)
--   6) public.phone_verifications.purpose CHECK 확장 ('mentor_apply' 추가)
--
-- 배경 / 설계 결정 (docs/mentor-apply-spec.md 「백엔드 / 데이터」, 2026-08-10 확정):
--  - 지원자는 **비회원**이다. 로그인 없이 폼을 제출하므로 auth.uid()로
--    "본인 행"을 판정할 수단이 없고, anon insert 정책을 열면 누구나
--    임의의 행을 무제한 밀어넣을 수 있다(휴대폰 인증·rate limit·파일 검증이
--    전부 우회된다). 그래서 이 테이블에는 **클라이언트 insert/select 정책을
--    하나도 두지 않는다.** RLS enable + 정책 미부여 = 전면 거부이고,
--    제출 경로는 오직 service_role을 쓰는 api/mentor-apply.js 하나다.
--  - 그럼에도 `revoke all on table ... from anon, authenticated`(README
--    「서버 전용 테이블」의 phone_verifications 등이 쓰는 패턴)는 걸지 않는다.
--    테이블 권한은 RLS보다 먼저 평가되므로, 회수하면 DB 레벨에서 동일한
--    authenticated 롤인 **어드민의 조회까지 함께 막힌다**(46번 파일이 기록한
--    컬럼 GRANT 기각 사유와 같은 함정). 이 테이블은 어드민이 브라우저에서
--    읽어야 하므로 권한은 남기고 RLS 정책으로만 통제한다.
--  - user_id는 nullable로 두되 비회원 제출이라 **항상 null**이다. 추후 회원
--    연동을 대비한 컬럼 자리만 잡아둔 것이라 인덱스는 만들지 않는다
--    (전부 null인 컬럼의 인덱스는 비용만 든다).
--  - Storage 버킷은 **비공개(public = false)**. anon insert 정책을 만들지
--    않으므로 업로드도 service_role 서버 경유만 가능하다. 어드민은 select
--    정책으로 목록을 얻은 뒤 createSignedUrl(path, TTL)로 열람한다
--    (비공개 버킷이라 getPublicUrl은 동작하지 않는다 — banners 버킷용
--    Admin.jsx 관용구를 그대로 쓰면 안 된다).
--
-- 의존성:
--   - 00_base_schema.sql : public.is_winning_admin(), public.set_updated_at(),
--                          extensions의 gen_random_uuid()
--   - auth.users (user_id FK)
--   - 40_auth_signup.sql : public.phone_verifications 테이블 — (6)이 이 테이블의
--                          purpose CHECK를 확장한다. 이 파일보다 먼저 실행되어
--                          있어야 한다.
--   (1)~(5)는 위 의존성과 별개로 다른 마이그레이션과 독립 실행 가능하다.
--
-- 주의:
--   - admin 판정은 반드시 public.is_winning_admin()을 쓴다(is_admin() 아님).
--     profiles를 재참조하는 서브쿼리를 정책에 직접 쓰면 42P17 infinite
--     recursion으로 어드민 쓰기가 전부 막힌다(README 「RLS admin 판정」).
--   - storage.objects 정책 생성은 Supabase 프로젝트 권한 구성에 따라 SQL
--     Editor의 postgres 롤로 실패할 수 있다(42501). 그 경우 대시보드
--     Storage > Policies에서 동일한 정의로 수동 생성할 것
--     (31_storage_policies.sql:13-15와 같은 주의사항).
-- =====================================================================

-- ---------------------------------------------------------------------
-- (1) 멘토 지원서 테이블
--     CHECK 제약은 create table 안에 인라인으로 둔다(43_admission_results.sql
--     관례). 셀렉트 3종의 옵션이 2026-08-10에 전부 확정되어 세 컬럼 모두
--     제약을 건다. 나머지 셀렉트(거주지역/입시이력/최종전형/고교유형)는 옵션
--     확정 문서가 없어 제약을 걸지 않는다 — 틀린 화이트리스트는 제출 자체를
--     조용히 실패시키므로 근거 없이 넣지 않는다.
-- ---------------------------------------------------------------------
create table if not exists public.mentor_applications (
    id      uuid primary key default gen_random_uuid(),
    user_id uuid references auth.users(id) on delete set null,  -- 비회원 제출이므로 항상 null. 추후 회원 연동 대비 컬럼만 유지
    status  text not null default 'submitted',                  -- submitted|screening|interview|training|active|rejected

    -- 1. 지원자 정보
    name             text not null,
    birth_date       text not null,   -- 'YYYYMMDD' 8자리 (달력 입력이 아니라 자리수 입력이라 text)
    phone            text not null,
    email            text not null,
    residence_region text not null,   -- 부산·경남|수도권|대구·경북|충청·강원|호남·제주|해외

    -- 2. 대학 및 합격 전형
    university            text not null,
    major                 text not null,
    admission_year        int  not null,
    enrollment_status     text not null,   -- 재학|휴학|졸업
    admission_history     text not null,   -- 현역|재수|삼수+
    final_admission_track text not null,   -- 수시|정시
    exam_results          text not null,   -- 2000자

    -- 3. 출신 고등학교
    highschool_region text not null,
    highschool_name   text not null,
    highschool_type   text not null,       -- 12종
    gpa_average       numeric(4,2),        -- 선택
    csat_summary      text,                -- 선택

    -- 4. 멘토 역량
    consult_fields         text[] not null,  -- 복수선택 6종
    strongest_field_reason text   not null,  -- 600자
    consult_grades         text[] not null,  -- 복수선택 6종
    weekly_capacity        text   not null,  -- 1~2회|3~5회|6~9회|10회 이상
    available_timeslot     text   not null,  -- 평일 오후|평일 저녁|주말 오전|주말 오후|주말 저녁 (단일 선택)
    motivation             text   not null,  -- 1000자
    strengths              text   not null,  -- 1000자
    ineffective_method     text   not null,  -- 600자
    situation_answer       text   not null,  -- 800자
    tutoring_experience    text,             -- 선택 500자

    -- 5. 증빙 및 동의
    proof_file_path   text not null,   -- storage object path (버킷 mentor-applications)
    proof_file_name   text,            -- 클라이언트가 올린 원본 파일명(기록용). 저장 경로는 서버가 UUID로 생성하므로 원본명이 경로에 남지 않는다
    phone_verified_at timestamptz,
    request_ip        inet,           -- 제출 요청 IP. rate limit 판정용 (phone_verifications.request_ip 선례와 동일 타입/널 허용)
    agree_terms       boolean not null default false,
    agree_privacy     boolean not null default false,
    agree_identity    boolean not null default false,
    agree_marketing   boolean not null default false,
    agree_ad          boolean not null default false,

    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),

    constraint mentor_applications_enrollment_status_check
        check (enrollment_status in ('재학', '휴학', '졸업')),
    constraint mentor_applications_weekly_capacity_check
        check (weekly_capacity in ('1~2회', '3~5회', '6~9회', '10회 이상')),
    constraint mentor_applications_available_timeslot_check
        check (available_timeslot in ('평일 오후', '평일 저녁', '주말 오전', '주말 오후', '주말 저녁'))
);

comment on table public.mentor_applications is
    '콜멘토 대학생 멘토 지원서(비회원 제출). 쓰기는 service_role(api/mentor-apply.js)만, 읽기는 어드민만. sql/52_mentor_applications.sql 참고.';

comment on column public.mentor_applications.user_id is
    '비회원 제출이라 현재는 항상 null. 추후 회원 연동 대비 컬럼만 확보(인덱스 없음).';

comment on column public.mentor_applications.proof_file_path is
    '비공개 버킷 mentor-applications의 object path. 열람은 createSignedUrl(path, TTL) — getPublicUrl 불가.';

comment on column public.mentor_applications.proof_file_name is
    '클라이언트가 올린 원본 파일명(기록용, 경로에는 쓰이지 않음). 사용자 입력이므로 화면에 표시할 때 반드시 이스케이프할 것(XSS 방지).';

comment on column public.mentor_applications.request_ip is
    '제출 요청 IP. api/mentor-apply.js의 checkSubmitLimits()가 이 컬럼으로 IP 기준 rate limit을 조회한다.';

-- `create table if not exists`는 이미 만들어진 테이블에는 아무 효과가 없어
-- 컬럼을 추가하지 않는다. 이 파일을 이미 실행한 DB(request_ip 도입 이전
-- 버전으로 mentor_applications가 이미 존재하는 경우)를 위한 별도 문.
alter table public.mentor_applications
    add column if not exists request_ip inet;

-- 위와 동일한 이유 — proof_file_name은 signed upload URL 방식(클라이언트→Storage
-- 직접 업로드) 도입 시점에 추가된 컬럼이라, 그 이전에 이 파일을 실행한 DB에는
-- 없다. 이미 테이블이 있는 DB를 위한 별도 문.
alter table public.mentor_applications
    add column if not exists proof_file_name text;

-- 어드민 목록(최신순) / 상태 필터용 인덱스.
create index if not exists mentor_applications_created_at_idx
    on public.mentor_applications (created_at desc);

create index if not exists mentor_applications_status_idx
    on public.mentor_applications (status);

-- api/mentor-apply.js의 checkSubmitLimits(supabase, 'request_ip', ip, 3600)가
-- 타는 IP 기준 rate limit 조회용. phone_verifications_ip_idx(40번 파일)와 동일 패턴.
create index if not exists mentor_applications_ip_idx
    on public.mentor_applications (request_ip, created_at desc)
    where request_ip is not null;

-- ---------------------------------------------------------------------
-- (2) RLS — 어드민 정책 1개만
--     클라이언트(anon·authenticated) insert/select 정책은 의도적으로 두지
--     않는다. 정책 없는 RLS는 전면 거부이므로 지원자는 이 테이블에 직접
--     접근할 수 없고, 제출은 RLS를 우회하는 service_role 경로만 남는다.
--     명세 원문은 `for all to public`이지만 이 저장소의 admin write 정책
--     관례(43_admission_results.sql / 31_storage_policies.sql)를 따라
--     `to authenticated`로 좁힌다 — is_winning_admin()이 auth.uid() 기반이라
--     anon은 어차피 통과하지 못하므로 동작 차이는 없고, 의도가 더 분명해진다.
-- ---------------------------------------------------------------------
alter table public.mentor_applications enable row level security;

drop policy if exists "mentor_applications admin all" on public.mentor_applications;
create policy "mentor_applications admin all" on public.mentor_applications
    as permissive for all to authenticated
    using (public.is_winning_admin())
    with check (public.is_winning_admin());

-- ---------------------------------------------------------------------
-- (3) updated_at 트리거 — 저장소 공용 함수 재사용
--     (00_base_schema.sql:1432 public.set_updated_at()). 새 함수를 만들지 않는다.
-- ---------------------------------------------------------------------
drop trigger if exists trg_mentor_applications_updated_at on public.mentor_applications;
create trigger trg_mentor_applications_updated_at
    before update on public.mentor_applications
    for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------
-- (4) Storage 버킷 'mentor-applications' — 비공개
--     31_storage_policies.sql:24-33의 "존재 확인 insert + public 플래그 보정
--     update" 패턴을 따르되, 여기서는 public = false가 목표값이다.
--     증빙 파일에는 학교·성적 등 개인정보가 담기므로 public 버킷이면
--     경로만 알면 누구나 열람할 수 있게 된다 — 반드시 false를 유지한다.
--
--     첨부 업로드가 signed upload URL 방식(클라이언트 → Storage 직접 업로드,
--     api/mentor-apply.js를 거치지 않음)으로 바뀌면서 Storage 계층 자체의
--     file_size_limit / allowed_mime_types가 실질적인 방어선이 된다
--     (Vercel Functions의 4.5MB body 상한을 우회하려는 목적이므로 서버 측
--     크기 검증을 더 이상 거치지 않는다).
-- ---------------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('mentor-applications', 'mentor-applications', false)
on conflict (id) do nothing;

update storage.buckets
set public = false
where id = 'mentor-applications'
  and public is distinct from false;

-- file_size_limit(bytes) / allowed_mime_types는 storage.buckets에 이미 있는
-- 컬럼이라고 알려져 있으나(Supabase 표준 스키마), 프로젝트 생성 시점의
-- 마이그레이션 버전에 따라 없을 수도 있다. 위 insert/update와 별도 문으로
-- 분리해 — 이 update가 실패(컬럼 없음, undefined_column 42703)해도 위의
-- 버킷 생성/public 보정에는 영향이 없게 한다. 실행자는 이 문이 정상
-- 종료되는지 확인할 것 — 실패하면 대시보드 Storage 설정에서 수동으로
-- 크기/타입 제한을 걸어야 한다.
--
--   file_size_limit: 50MB = 50 * 1024 * 1024 = 52428800 bytes
--     시안 원문은 100MB(104857600)였으나, 아래 [중요] 절의 전역 상한 실측
--     결과(52428800 = 50MB)에 맞춰 사용자 승인 하에 50MB로 확정했다
--     (2026-08-10). 100MB를 걸어도 전역 상한이 먼저 막아 의미가 없었다.
--   allowed_mime_types: PDF·PNG·JPG·HWP만 허용.
--     - application/pdf, image/png, image/jpeg : 표준 MIME, 이견 없음.
--     - HWP는 표준 MIME이 없어 실무에서 여러 값이 혼재한다. 브라우저/OS별로
--       업로드 시 붙이는 값이 달라 아래 3개를 모두 허용한다:
--         application/x-hwp          (가장 널리 통용, 다수 뷰어/스토리지 예시)
--         application/haansofthwp    (한글과컴퓨터 자체 표기)
--         application/vnd.hancom.hwp (IANA 벤더 트리 형식 표기)
--       브라우저가 위 목록에 없는 값(예: application/octet-stream)을 붙여
--       업로드가 막히면, 실행자는 실제 브라우저가 보낸 Content-Type을
--       확인해 이 배열에 추가할 것.
update storage.buckets
set file_size_limit = 52428800,
    allowed_mime_types = array[
        'application/pdf',
        'image/png',
        'image/jpeg',
        'application/x-hwp',
        'application/haansofthwp',
        'application/vnd.hancom.hwp'
    ]
where id = 'mentor-applications';

-- =====================================================================
-- [확정 2026-08-10] Supabase 프로젝트 전역 업로드 상한 — SQL로 제어 불가
--   Supabase는 버킷별 file_size_limit과 별개로 **프로젝트 전역** Storage
--   업로드 상한이 있다. Management API `/v1/projects/{ref}/config/storage`
--   로 실측한 결과 **전역 상한 = 52428800 bytes(50MB)**이고, dev
--   (gjowqdiopinhixfivnkx)·운영(ucjlcvqvinspmrasvsug) 두 프로젝트 모두
--   동일하다. 버킷 file_size_limit을 그보다 크게 걸어도 전역 상한이 먼저
--   막으므로, 위 update 문의 file_size_limit을 전역 상한과 같은 52428800에
--   맞췄다(시안 원문 100MB에서 사용자 승인 하에 50MB로 변경).
--
--   향후 100MB(또는 그 이상)가 필요해지면 Supabase 요금제를 먼저 확인하고
--   대시보드 → Project Settings → Storage에서 전역 업로드 상한을 상향하는
--   작업이 **선행**돼야 한다 — 그 전까지 버킷 값을 100MB로 되돌려도 무의미하다.
-- =====================================================================

-- storage.objects 정책:
--   - anon/authenticated insert 정책은 **만들지 않는다.** 업로드는 오직
--     api/mentor-apply.js의 service_role 경유(파일 MIME·크기 검증, 경로
--     서버 생성, rate limit이 그 라우트에 있다).
--   - 어드민 select만 허용해 목록 조회 + createSignedUrl 열람이 되게 한다.
drop policy if exists "mentor proof admin read" on storage.objects;
create policy "mentor proof admin read" on storage.objects
    for select to authenticated
    using (bucket_id = 'mentor-applications' and public.is_winning_admin());

-- ---------------------------------------------------------------------
-- (6) public.phone_verifications.purpose CHECK 확장 — 'mentor_apply' 추가
--     api/send-phone-code.js의 ALLOWED_PURPOSES에는 'mentor_apply'가 이미
--     추가되어 있으나, 40_auth_signup.sql:527-528의 CHECK가
--     ('signup', 'parent_signup', 'phone_change')만 허용해 mentor_apply
--     발송의 phone_verifications insert가 23514(check violation)로 실패한다.
--
--     이 insert는 알림톡 발송 **이후**에 일어난다 — 실패하면 지원자는 인증
--     문자를 받고 발송 요금은 나갔는데 code_hash가 저장되지 않아 verify가
--     불가능해진다. 즉 본인인증이 영구히 완료될 수 없어 폼 제출 자체가 막힌다.
--
--     제약명 근거: 40_auth_signup.sql:527-528의 CHECK는 컬럼 정의에 인라인으로
--     붙은 이름 없는(unnamed) 제약이다. Postgres는 이런 경우
--     `<table>_<column>_check` 규칙으로 자동 명명하므로 실제 제약명은
--     phone_verifications_purpose_check로 확인된다. 다른 이름으로 바뀐
--     DB가 있다면(수동 생성 등) 아래로 먼저 재확인할 것:
--       select conname from pg_constraint
--         where conrelid = 'public.phone_verifications'::regclass and contype = 'c';
--
--     참고: 40_auth_signup.sql:1287에도 동일한 형태의 purpose CHECK
--     (values 'signup'/'under14_guardian'/'phone_change')가 있으나 이는
--     public.identity_verifications 소속으로 별개 테이블이다 — 여기서는
--     건드리지 않는다.
-- ---------------------------------------------------------------------
alter table public.phone_verifications
    drop constraint if exists phone_verifications_purpose_check;
alter table public.phone_verifications
    add constraint phone_verifications_purpose_check
    check (purpose in ('signup', 'parent_signup', 'phone_change', 'mentor_apply'));

-- =====================================================================
-- 검증용 SELECT (실행 후 수동 확인용 — 주석 해제하고 실행)
-- =====================================================================
-- select count(*) from public.mentor_applications;                                    -- 0행이 정상(신규 테이블)
-- select conname from pg_constraint where conrelid = 'public.mentor_applications'::regclass and contype = 'c';  -- CHECK 3종
-- select policyname, cmd, roles from pg_policies where tablename = 'mentor_applications';                        -- 어드민 정책 1개만이어야 정상
-- select id, public from storage.buckets where id = 'mentor-applications';                                       -- public = false 확인
-- select id, file_size_limit, allowed_mime_types from storage.buckets where id = 'mentor-applications';          -- 52428800 / PDF·PNG·JPG·HWP 배열 확인
-- select policyname, cmd from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname = 'mentor proof admin read';
-- select conname, pg_get_constraintdef(oid) from pg_constraint
--   where conrelid = 'public.phone_verifications'::regclass and conname = 'phone_verifications_purpose_check';  -- mentor_apply 포함 확인
