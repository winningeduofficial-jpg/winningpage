-- =====================================================================
-- 이용신청 > 멘토신청(/mentor-apply) §7 FAQ 어드민 전환.
-- Supabase SQL Editor / Management API에서 수동 실행 필요. (idempotent)
--
-- 포함:
--   1) public.mentor_apply_faqs 테이블 — FAQ 질문·답변 5문항
--   2) public.mentor_apply_copy 테이블 — 반복되지 않는 단문 카피 키-값
--      (이번엔 FAQ 섹션 헤더 3키만 시드하지만, 이후 다른 섹션 카피가
--      들어올 자리로 설계한다)
--   3) 조회용 인덱스 1종 (mentor_apply_faqs: is_active, sort_order, created_at)
--   4) RLS — 공개 read(anon, authenticated) + 어드민 전권
--      (52_mentor_applications.sql의 admin write 정책 관례를 따라
--      public.is_winning_admin() 사용 — is_admin() 아님)
--   5) updated_at 트리거 2종 (공용 public.set_updated_at() 재사용)
--   6) 시드 — mentor_apply_faqs 5행 + mentor_apply_copy 3행
--      (public.schema_migrations 마커 가드로 최초 1회만 적용, 이후
--      어드민이 편집한 값은 재실행으로 덮어쓰지 않는다)
--
-- 폴백 동작 (중요):
--   이 마이그레이션을 적용하지 않아도 공개 페이지(/mentor-apply)는
--   src/data/mentorApply.js의 MENTOR_FAQ / FAQ_SECTION 번들 상수로
--   폴백해 현재와 동일하게 동작한다. 다만 어드민 화면
--   (mentorApplyFaqs / mentorApplyCopy)은 테이블이 없으면 조회·저장이
--   실패하므로 **어드민 배포 전에 이 파일을 먼저 실행**해야 한다.
--
-- 의존성:
--   - 00_base_schema.sql : public.is_winning_admin(), public.set_updated_at(),
--                          extensions의 gen_random_uuid()
--   - 다른 마이그레이션과 독립 실행 가능
--
-- 주의:
--   - admin 판정은 반드시 public.is_winning_admin()을 쓴다(is_admin() 아님).
--   - 시드 문구는 src/data/mentorApply.js의 MENTOR_FAQ / FAQ_SECTION을
--     한 글자도 바꾸지 않고 그대로 옮겼다. `[예시] ` 접두어도 그대로
--     유지한다 — 운영자가 확정 문구로 교체하며 직접 떼는 것이 전제다.
-- =====================================================================

-- 마커 테이블 (20_landing_renewal.sql / 30_landing_admin_media.sql과 동일
-- — 신규/부분 설치 대비 재선언)
create table if not exists public.schema_migrations (
  version     text primary key,
  applied_at  timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- (1) mentor_apply_faqs — FAQ 질문·답변
-- ---------------------------------------------------------------------
create table if not exists public.mentor_apply_faqs (
    id         uuid primary key default gen_random_uuid(),
    question   text not null,
    answer     text not null default '',
    sort_order integer not null default 0,
    is_active  boolean not null default true,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

comment on table public.mentor_apply_faqs is
    '멘토신청(/mentor-apply) §7 FAQ 문항. 공개 읽기는 is_active=true만, 쓰기는 어드민만. sql/53_mentor_apply_faq_admin.sql 참고. 테이블이 없거나 0행이면 프론트는 src/data/mentorApply.js의 MENTOR_FAQ로 폴백한다.';

create index if not exists mentor_apply_faqs_display_idx
    on public.mentor_apply_faqs (is_active, sort_order, created_at);

drop trigger if exists trg_mentor_apply_faqs_updated_at on public.mentor_apply_faqs;
create trigger trg_mentor_apply_faqs_updated_at
    before update on public.mentor_apply_faqs
    for each row execute function public.set_updated_at();

alter table public.mentor_apply_faqs enable row level security;

drop policy if exists "mentor_apply_faqs public read" on public.mentor_apply_faqs;
create policy "mentor_apply_faqs public read" on public.mentor_apply_faqs
    as permissive for select to anon, authenticated
    using (is_active = true);

drop policy if exists "mentor_apply_faqs admin all" on public.mentor_apply_faqs;
create policy "mentor_apply_faqs admin all" on public.mentor_apply_faqs
    as permissive for all to authenticated
    using (public.is_winning_admin())
    with check (public.is_winning_admin());

-- ---------------------------------------------------------------------
-- (2) mentor_apply_copy — 반복되지 않는 단문 카피 키-값
--     이번엔 FAQ 섹션 헤더 3키만 시드하지만, 이후 다른 섹션(히어로·카드·폼)의
--     단문 카피가 필요해지면 같은 테이블에 행만 추가하면 된다.
--     컬럼명은 key/value가 아니라 copy_key/copy_value로 모호성을 피한다.
-- ---------------------------------------------------------------------
create table if not exists public.mentor_apply_copy (
    copy_key   text primary key,             -- 예: 'faq.eyebrow'
    copy_value text not null default '',
    label      text not null default '',     -- 어드민 목록/폼에 보여줄 사람이 읽는 이름
    sort_order integer not null default 0,
    updated_at timestamptz not null default now()
);

comment on table public.mentor_apply_copy is
    '멘토신청(/mentor-apply)의 반복되지 않는 단문 카피 키-값 저장소. 현재는 §7 FAQ 헤더 3키만 시드. 공개 읽기 전체 허용, 쓰기는 어드민만. sql/53_mentor_apply_faq_admin.sql 참고. 테이블이 없거나 특정 키가 없으면 프론트는 src/data/mentorApply.js의 FAQ_SECTION 해당 키로 폴백한다.';

drop trigger if exists trg_mentor_apply_copy_updated_at on public.mentor_apply_copy;
create trigger trg_mentor_apply_copy_updated_at
    before update on public.mentor_apply_copy
    for each row execute function public.set_updated_at();

alter table public.mentor_apply_copy enable row level security;

drop policy if exists "mentor_apply_copy public read" on public.mentor_apply_copy;
create policy "mentor_apply_copy public read" on public.mentor_apply_copy
    as permissive for select to anon, authenticated
    using (true);

drop policy if exists "mentor_apply_copy admin all" on public.mentor_apply_copy;
create policy "mentor_apply_copy admin all" on public.mentor_apply_copy
    as permissive for all to authenticated
    using (public.is_winning_admin())
    with check (public.is_winning_admin());

-- ---------------------------------------------------------------------
-- (3) 시드 — 최초 1회만(마커 '53_mentor_apply_faq_admin_seed_v1' 가드).
--     src/data/mentorApply.js MENTOR_FAQ / FAQ_SECTION 원문을 그대로 옮긴다.
-- ---------------------------------------------------------------------
insert into public.mentor_apply_faqs (question, answer, sort_order, is_active)
select v.question, v.answer, v.sort_order, true
from (
  values
    ('과외나 멘토링 경험이 없어도 지원할 수 있나요?',
     '[예시] 네, 지원할 수 있습니다. 과외·멘토링 경험은 지원서에서도 선택 항목입니다. 선발된 멘토에게는 상담 진행 방식과 기록 방법을 안내하는 멘토 교육이 제공됩니다.',
     1),
    ('상담은 어떻게 진행되나요?',
     '[예시] 1:1 비대면 전화 상담으로 진행됩니다. 지원서에 적어 주신 상담 가능 분야와 학년, 시간대를 기준으로 학생이 배정됩니다.',
     2),
    ('내신이나 수능 성적이 낮으면 불리한가요?',
     '[예시] 성적 자체로 불리해지지 않습니다. 내신 평균과 수능 성적 요약은 선택 항목이며, 기재하신 경우 상담 매칭에 참고합니다. 선발에서 더 중요하게 보는 것은 본인이 무엇을 언제 어떻게 바꿨는지 설명할 수 있는가입니다.',
     3),
    ('학기 중에 일정이 바쁘면 어떻게 하나요?',
     '[예시] 주당 상담 가능 횟수는 1~2회부터 선택할 수 있고, 상담 가능 시간대도 직접 고를 수 있습니다. 학기 일정에 맞춰 부담이 적은 범위로 시작하시면 됩니다. 다만 이미 약속된 상담 시간은 지켜 주시고, 사정이 생기면 미리 알려 주세요.',
     4),
    ('제출한 개인정보는 어떻게 관리되나요?',
     '[예시] 지원서에 제출하신 정보는 멘토 선발과 상담 배정 목적으로만 사용합니다. 증빙 서류는 비공개 저장소에 보관되며 담당자만 열람할 수 있습니다. 수집 항목과 보유 기간 등 자세한 내용은 개인정보 수집 및 이용 동의와 개인정보처리방침에서 확인하실 수 있습니다.',
     5)
) as v(question, answer, sort_order)
where not exists (
  select 1 from public.schema_migrations
  where version = '53_mentor_apply_faq_admin_seed_v1'
);

-- ⚠ faq.title_lead 값 '지원 전 '의 끝 공백 1칸은 원문이다(src/data/mentorApply.js
--   FAQ_SECTION.titleLead 주석 참고). 이 공백이 없으면 공개 화면에서 강조 스팬과
--   붙어 "지원 전궁금한 점"으로 렌더된다. 아래 리터럴에 반드시 포함할 것 — 지우지 말 것.
insert into public.mentor_apply_copy (copy_key, copy_value, label, sort_order)
select v.copy_key, v.copy_value, v.label, v.sort_order
from (
  values
    ('faq.eyebrow',      'FAQ',       'FAQ 아이브로',      1),
    ('faq.title_lead',   '지원 전 ', 'FAQ 제목(앞부분)',  2),
    ('faq.title_accent', '궁금한 점', 'FAQ 제목(강조)',    3)
) as v(copy_key, copy_value, label, sort_order)
where not exists (
  select 1 from public.schema_migrations
  where version = '53_mentor_apply_faq_admin_seed_v1'
);

insert into public.schema_migrations (version)
select '53_mentor_apply_faq_admin_seed_v1'
where not exists (
  select 1 from public.schema_migrations
  where version = '53_mentor_apply_faq_admin_seed_v1'
);

-- =====================================================================
-- 검증용 SELECT (실행 후 수동 확인용 — 주석 해제하고 실행)
-- =====================================================================
-- select count(*) from public.mentor_apply_faqs;                       -- 5행이 정상(최초 실행 직후)
-- select copy_key, length(copy_value) from public.mentor_apply_copy order by sort_order;  -- faq.title_lead 길이에 끝 공백 1칸 포함 확인
-- select policyname, cmd, roles from pg_policies where tablename = 'mentor_apply_faqs';    -- public read 1개 + admin all 1개
-- select policyname, cmd, roles from pg_policies where tablename = 'mentor_apply_copy';    -- public read 1개 + admin all 1개
