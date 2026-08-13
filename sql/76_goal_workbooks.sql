-- =====================================================================
-- 76_goal_workbooks.sql
-- 목표관리(/app/goal) "나의 노력" 화면(과목별 문제집 진도) 데이터 레이어.
-- Supabase SQL Editor / Management API에서 수동 실행 필요.
-- (이 repo에 마이그레이션 러너 없음 — 55~72번과 동일하게 파일 전체를
--  붙여넣고 실행한다.) idempotent — 여러 번 실행해도 안전.
--
-- 포함:
--   1) public.goal_workbooks  학생별 문제집(과목·제목·진도) 다건
--   2) RLS — select own + admin select, 쓰기는 service_role 전용
--      (55_goal_management.sql:718-731 관례 그대로 — 클라이언트 write 정책 0건.
--       완독 판정(current_page >= total_pages → status='done')을 API가
--       계산해 저장하므로, 클라이언트 write를 열면 임의로 진도를 조작할
--       여지가 생긴다)
--   3) updated_at 트리거 (공용 public.set_updated_at() 재사용)
--
-- 대상 UI: src/pages/goal/Efforts.jsx + src/components/goal/plan/EffortSubjectCard.jsx
-- (과목 4카드: 국어/수학/영어/탐구, 완독 스택) + modals/AddWorkbookModal.jsx.
-- 과목 정본은 src/components/goal/subjectTokens.js 5종(korean/math/english/
-- science/etc) — 온보딩 계산 모듈(goal_students)과 무관한 자기완결 도메인이라
-- 여기 CHECK 리터럴도 그 5종을 그대로 쓴다(한글 라벨이 아니라 id).
--
-- 의존성:
--   - 00_base_schema.sql : public.is_winning_admin(), public.set_updated_at()
--   - 55_goal_management.sql : public.goal_students(profile_id) — FK 대상.
--     학생이 온보딩을 완료해 goal_students 행을 갖고 있어야 문제집을 등록할
--     수 있다(목표관리 서비스 자체가 이용권 게이트 뒤에 있어 이 순서가
--     자연스럽다 — api/goal/workbooks.js도 openGoalSession으로 같은 게이트를
--     탄다). auth.users를 직접 참조하지 않는 이유는 이 테이블이 goal_students
--     행 삭제(예: 재온보딩 정책 확정 후 초기화)에 종속돼야 하기 때문이다
--     (on delete cascade).
--   **api/goal/workbooks.js 배포 전 반드시 선행 실행** — 테이블 없이 배포하면
--   문제집 등록이 전량 실패한다.
--   **dev DB 적용 금지 — 이 브랜치 범위는 파일 작성까지다.**
-- =====================================================================

-- ---------------------------------------------------------------------
-- (1) 문제집
-- ---------------------------------------------------------------------
create table if not exists public.goal_workbooks (
    id bigint generated always as identity primary key,

    -- goal_students.profile_id(≡ auth.users.id)를 참조한다. 학생 삭제 시
    -- 문제집도 함께 정리한다(위 의존성 주석 참고).
    profile_id uuid not null references public.goal_students(profile_id) on delete cascade,

    -- subjectTokens.js KNOWN_SUBJECT_IDS와 정확히 같은 5종. 한글 라벨('국어' 등)이
    -- 아니라 id를 저장한다 — 표시 문자열은 프론트가 매핑한다(도메인/표시 분리).
    subject text not null,

    title text not null,

    total_pages integer not null,
    current_page integer not null default 0,

    -- 완독 판정은 API가 계산해 저장한다(current_page >= total_pages → 'done').
    -- DB CHECK로 두 컬럼을 교차 검증하지 않는다 — 문제집 전체 페이지 수를
    -- 나중에 줄이는 편집(총 240p → 200p)이 들어오면 그 트랜잭션 순간에
    -- current_page > total_pages 인 중간 상태를 만들 수 있어야 하고, 그 뒤
    -- API가 즉시 status를 재계산해 정합을 맞춘다.
    status text not null default 'reading',

    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),

    constraint goal_workbooks_subject_check
        check (subject in ('korean', 'math', 'english', 'science', 'etc')),
    constraint goal_workbooks_status_check
        check (status in ('reading', 'done')),
    constraint goal_workbooks_title_check
        check (char_length(title) between 1 and 100),
    constraint goal_workbooks_total_pages_check
        check (total_pages > 0),
    constraint goal_workbooks_current_page_check
        check (current_page >= 0)
);

comment on table public.goal_workbooks is
    '목표관리 "나의 노력" 화면의 과목별 문제집(사용자당 다건). Efforts.jsx + EffortSubjectCard.jsx가 소비한다. 쓰기는 service_role(api/goal/workbooks.js)만, 읽기는 본인과 어드민. sql/76_goal_workbooks.sql 참고.';
comment on column public.goal_workbooks.profile_id is
    'goal_students.profile_id FK. auth.users를 직접 참조하지 않고 goal_students를 경유한다 — 학생 마스터가 삭제되면 문제집도 함께 정리된다(on delete cascade).';
comment on column public.goal_workbooks.subject is
    '과목 id. src/components/goal/subjectTokens.js KNOWN_SUBJECT_IDS 5종과 정확히 일치해야 한다(korean/math/english/science/etc) — 한글 라벨이 아니다.';
comment on column public.goal_workbooks.title is
    '문제집 이름(사용자 입력, 최대 100자). AddWorkbookModal.jsx "문제집 이름" 필드.';
comment on column public.goal_workbooks.total_pages is
    '전체 페이지 수. 0보다 커야 한다 — 0이면 진도율(current/total)이 나눗셈 불능이 된다.';
comment on column public.goal_workbooks.current_page is
    '현재 페이지 수. status 재계산의 입력값(current_page >= total_pages → done). 카드 진도율 표시는 보류 상태라 이 컬럼은 저장만 되고 UI에 퍼센트로는 아직 노출되지 않는다.';
comment on column public.goal_workbooks.status is
    'reading = 읽는 중(EffortSubjectCard "공부 중인 책" 영역에 노출). done = 완독(완독 스택에 누적, completed 카운트에 반영). API가 current_page/total_pages 비교로 매 쓰기마다 재계산해 저장한다 — 클라이언트가 이 값을 직접 보낼 수 없다.';
comment on column public.goal_workbooks.created_at is
    '행 생성 시각.';
comment on column public.goal_workbooks.updated_at is
    '마지막 갱신 시각. 트리거 trg_goal_workbooks_updated_at이 공용 public.set_updated_at()으로 채운다.';

create index if not exists goal_workbooks_profile_subject_idx
    on public.goal_workbooks (profile_id, subject);

-- 이미 이 파일을 실행한 DB에 컬럼을 나중에 늘릴 때만 여기에 추가한다
-- (create table if not exists 는 컬럼을 추가하지 않는다):
-- alter table public.goal_workbooks add column if not exists <col> <type>;

-- ---------------------------------------------------------------------
-- (2) RLS — 55_goal_management.sql:718-731 관례 그대로.
--     select own + admin select. 쓰기(insert/update/delete) 정책은
--     하나도 두지 않는다 — status/진도 조작을 막는 유일한 방어선이
--     service_role 전용 쓰기 경로(api/goal/workbooks.js)이기 때문이다.
--     revoke ... from anon, authenticated 는 걸지 않는다 — 테이블 권한이
--     RLS보다 먼저 평가돼 어드민 조회까지 막힌다(52번/46번 기각 사유와 동일).
-- ---------------------------------------------------------------------
alter table public.goal_workbooks enable row level security;

drop policy if exists "goal_workbooks_select_own" on public.goal_workbooks;
create policy "goal_workbooks_select_own" on public.goal_workbooks
    as permissive for select to authenticated
    using (profile_id = auth.uid());

drop policy if exists "goal_workbooks_admin_all" on public.goal_workbooks;
create policy "goal_workbooks_admin_all" on public.goal_workbooks
    as permissive for all to authenticated
    using (public.is_winning_admin())
    with check (public.is_winning_admin());

-- ---------------------------------------------------------------------
-- (3) updated_at 트리거 — 저장소 공용 함수 재사용(00_base_schema.sql:1432
--     public.set_updated_at()). 새 함수를 만들지 않는다.
-- ---------------------------------------------------------------------
drop trigger if exists trg_goal_workbooks_updated_at on public.goal_workbooks;
create trigger trg_goal_workbooks_updated_at
    before update on public.goal_workbooks
    for each row execute function public.set_updated_at();


-- =====================================================================
-- 검증용 SELECT (실행 후 수동 확인용 — 주석 해제하고 실행)
-- =====================================================================
-- select count(*) from public.goal_workbooks;  -- 최초 실행 직후 0행이 정상
-- select policyname, cmd, roles from pg_policies where tablename = 'goal_workbooks';  -- select 2개(own/admin_all)만, insert/update/delete 정책 0건이 정상
-- select conname, contype from pg_constraint where conrelid = 'public.goal_workbooks'::regclass;  -- p(id) 1 + f(profile_id) 1 + c(check) 5
