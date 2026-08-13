-- =====================================================================
-- 수행평가 인앱 이식 — 앱 스키마 (P2)
-- Supabase SQL Editor에서 수동 실행 필요. (idempotent — 여러 번 실행해도 안전)
--
-- 53_performance.sql(P1)이 **어드민 지식베이스**(winning_assessment_knowledge_items)를
-- 잠그고 검색 RPC를 교정했다면, 이 파일은 **학생 산출물**을 담는 층을 신설한다.
-- 목적지 저장소에는 세션·리포트·메시지·첨부·진행단계를 담을 테이블이 하나도
-- 없다(명세서 §8.1 「학생 산출물 저장 테이블은 전무하다」).
--
-- 포함:
--   (1) 8테이블 — performance_sessions / _messages / _attachments / _topics /
--       _reports / _submissions / _credit_ledger / _session_vectors
--   (2) 인덱스 · updated_at 트리거
--   (3) RLS — 전 테이블 소유자 전용(어드민/서버는 service_role로 우회)
--   (4) RPC ① consume_performance_credit  — 멱등 회차 차감(단일 트랜잭션)
--   (5) RPC ② match_student_performance_sessions — 학생 과거 수행 유사도 검색
--   (6) Storage 버킷 performance-guides(private) + 소유자 경로 정책
--
-- 근거 문서: docs/수행평가-상세-명세.md
--   §8.3 단일 Supabase 재설계안(컬럼 정의 정본)
--   §8.6 API 엔드포인트 계약(누가 쓰는가 = RLS 설계 근거)
--   §8.8 파일 업로드·보관 정책(버킷·경로·용량·MIME)
--   §9.2 「1회」의 정의, §9.3 회차 차감 규칙(정본)
--
-- 의존성:
--   - 00_base_schema.sql : public.profiles, public.program_access,
--                          public.set_updated_at(), public.is_admin(),
--                          extensions.vector
--   - 53_performance.sql 과는 **독립**이다(참조 객체가 겹치지 않는다).
--     다만 실행 순서는 번호대로 53 → 54 를 권장한다.
--
-- 배포 순서:
--   이 파일을 **먼저** 실행한 뒤 `api/performance/*` 앱 코드를 배포한다.
--   테이블이 없는 상태로 새 코드가 뜨면 PGRST205(relation not found)로
--   전 엔드포인트가 죽는다.
--
-- ---------------------------------------------------------------------
-- 이 마이그레이션의 주요 결정 8가지 (요약 — 각 섹션에 상세 근거)
-- ---------------------------------------------------------------------
--  ① 소유자 식별은 `profiles.id`(= auth.uid()) 하나다. 외부 앱의 text
--     `students.code` / `main_id` 축은 폐기한다(명세서 §8.2 결함 #4 —
--     text 컬럼이라 FK·RLS를 걸 수 없고 동명이인 충돌이 난다).
--  ② `performance_sessions.school_type`에 리터럴 기본값 `'일반고'`를
--     **넣지 않는다.** 외부 앱 `api/login.js:65`의 하드코딩은 이식 금지이며,
--     값이 없으면 null로 두고 프롬프트에서 `미입력`을 렌더한다(§8.3).
--  ③ 외부 앱의 `selected_topic = '주제|||상세'` 결합 저장과 오타 컬럼
--     `selected_topic_detai`는 이식하지 않는다. 주제는 정규화된
--     `performance_topics` 행이고 세션은 `selected_topic_id`로 가리킨다.
--  ④ `performance_credit_ledger.session_id`에 UNIQUE — 회차 차감 멱등성의
--     핵심이다. "재추천은 무차감"이 코드 규율이 아니라 **스키마 제약**으로
--     보장된다(§9.3 「결정(멱등 차감)」 3항).
--  ⑤ 차감 지점은 **주제 추천 최초 성공 1곳뿐**이다. 외부 앱의 4지점
--     선차감(recommend-topics / analyze-assessment-storage / evaluate-text /
--     find-resources)은 버그이므로 이식하지 않는다(§9.3 「이식 금지」).
--  ⑥ `quota_total` sentinel이 외부 앱과 **반전**돼 있다. 외부는 0 = 무제한,
--     여기서는 **0 = 소진 / null = 무제한**이다. 상세는 (4-a) 절.
--  ⑦ RLS는 소유자 전용이고 클라이언트 write는 최소면적만 연다. 세션 하위
--     테이블은 SECURITY DEFINER 헬퍼 `performance_owns_session()`으로
--     소유권을 판정해 정책이 매 행 RLS를 재귀 평가하지 않게 한다((3-a) 절).
--  ⑧ `performance_credit_ledger`는 클라이언트 write 정책을 **하나도 만들지
--     않는다.** 차감은 서버 RPC(service_role)만 한다.
-- =====================================================================


-- =====================================================================
-- (1) 테이블
-- =====================================================================
-- 전부 신규 테이블이므로 `create table if not exists` 하나로 재실행 안전성이
-- 충족된다(기존 테이블을 고치는 게 아니라 없으면 만드는 것뿐이다).
-- 컬럼을 나중에 추가할 때는 이 파일이 아니라 새 번호 마이그레이션에서
-- `alter table ... add column if not exists`로 한다 — 러너가 없어 접두어가 곧
-- 실행 순서인 이 저장소에서, 이미 실행된 파일을 수정하면 실행 이력과
-- 파일 내용이 어긋나기 때문이다(README 「sql/ 실행 순서」).


-- ---------------------------------------------------------------------
-- 1-1. performance_sessions — 수행평가 세션 1건
--      외부 앱 `api_sessions` + `conversations` 통합 대체(명세서 §8.3).
--
--      외부 `conversations`는 main_id당 1행 upsert라 회원당 진행 중 수행평가가
--      구조적으로 1건이었고 두 번째를 시작하면 첫 번째가 덮였다(§8.2 결함 #1).
--      여기서는 세션이 독립 행이라 회원당 N건이 자연스럽다 — 시안
--      `3754:3121`(저장 리포트 3건)과 `3754:4349`(추가 수행평가 진행하기)가
--      N을 전제한다.
--
--      세션 id는 **리소스 ID일 뿐 인증 수단이 아니다**(§8.6 공통 규약).
--      외부는 세션 행이 크리덴셜을 겸했다.
-- ---------------------------------------------------------------------
create table if not exists public."performance_sessions" (
    id uuid default gen_random_uuid() not null,
    profile_id uuid not null,

    status text default 'draft'::text not null,
    current_step smallint default 1 not null,
    completed_steps smallint[] default '{}'::smallint[] not null,

    -- STEP1 폼 입력값이 정본이다. 외부는 `고1 1학기` 결합 문자열이었고
    -- (`index.html:1672`) 여기서는 분리 저장 후 표시 시점에 결합한다.
    grade_label text,
    semester text,

    -- profiles.school_type(00_base_schema.sql:796)의 **세션 시점 스냅샷**.
    --   · 리터럴 기본값 `'일반고'`를 넣지 않는다 — 외부 앱
    --     `api/login.js:65`의 하드코딩은 이식 금지다(§8.3 Q61-ⓔ).
    --     기본값을 넣으면 프로필이 비어 있는 계정의 프롬프트에 사실이 아닌
    --     '일반고'가 **에러 없이** 주입되고, 그 결과가 리포트에 그대로 남는다.
    --   · STEP1 폼에서 다시 묻지 않는다. 가입 RPC `complete_signup_profile`이
    --     필수로 채우고(00_base_schema.sql:1155-1156) 마이페이지가 편집한다.
    --   · 세션에 사본을 두는 이유는 가입 후 프로필을 바꿔도 **과거 세션의
    --     프롬프트 입력이 흔들리지 않게** 고정하기 위함이다.
    --   · 프로필 값도 없으면 null. 프롬프트에는 `미입력`을 렌더한다(§12.1).
    school_type text,

    -- 외부는 `subject`에 `교과군 / 과목명`을 결합 저장했다(`index.html:1006`).
    subject_group text,
    subject text,

    -- 선택 입력. 프롬프트 기본값 리터럴 `'없음'`은 애플리케이션이 유지한다
    -- (`api/recommend-topics.js:81`) — DB 기본값으로 올리지 않는다.
    -- '없음'은 "입력하지 않았다"가 아니라 "이전 주제가 없다고 답했다"이며,
    -- 두 상태를 DB에서 구분할 수 있어야 한다.
    previous_topic text,

    career_goal text,

    guide_input_mode text,
    guide_freetext text,
    -- 안내문 분석 구조화 결과(§8.4). 외부는 평문 문자열 누적이었다
    -- (`api/analyze-assessment-storage.js:122-130`).
    guide_json jsonb,

    submission_format text,
    -- 제출폼 필드 스키마 스냅샷. 외부는 DOM `data-schema` 속성 왕복이라
    -- 클라이언트가 위조할 수 있었다(`index.html:2411`) → 서버 소유로 승격.
    submission_schema jsonb,

    -- 외부의 `주제|||상세` 결합 문자열 + 오타 컬럼 `selected_topic_detai`
    -- 대체. FK는 performance_topics 생성 이후 (1-9)에서 붙인다(순환 참조).
    selected_topic_id uuid,

    created_at timestamp with time zone default now() not null,
    updated_at timestamp with time zone default now() not null,

    constraint performance_sessions_pkey primary key (id),
    constraint performance_sessions_status_check
        check (status = any (array['draft'::text, 'in_progress'::text, 'completed'::text, 'archived'::text])),
    constraint performance_sessions_current_step_check
        check (current_step between 1 and 5),
    constraint performance_sessions_guide_input_mode_check
        check (guide_input_mode is null or guide_input_mode = any (array['upload'::text, 'manual'::text])),
    -- 명세서 §8.3은 `career_goal text not null`이지만 §8.6은 세션 생성을
    -- `POST session.js { action:'create', basicInfo? }`로 **basicInfo 없이도**
    -- 허용한다. 두 규정을 그대로 합치면 STEP1 이전에 만들어지는 draft 세션이
    -- 23502(not-null violation)로 막힌다.
    -- → NOT NULL을 status 조건부 CHECK로 낮춘다: draft는 비워둘 수 있고,
    --   진행 이후 단계로 넘어가는 순간 반드시 채워져 있어야 한다.
    --   프롬프트에 진로가 비어 들어가는 것을 막는다는 원래 의도는 보존된다.
    constraint performance_sessions_career_goal_required_check
        check (status = 'draft'::text or career_goal is not null)
);

alter table public."performance_sessions" drop constraint if exists performance_sessions_profile_id_fkey;
alter table public."performance_sessions"
    add constraint performance_sessions_profile_id_fkey
    foreign key (profile_id) references public.profiles(id) on delete cascade;

comment on table public."performance_sessions" is
    '수행평가 세션 1건(회원당 N건). 외부 앱 api_sessions + conversations 통합 대체. id는 리소스 ID일 뿐 인증 수단이 아니다.';
comment on column public."performance_sessions".school_type is
    'profiles.school_type의 세션 시점 스냅샷. 값이 없으면 null — 리터럴 기본값(''일반고'') 금지(외부 앱 api/login.js:65 하드코딩 이식 금지).';
comment on column public."performance_sessions".selected_topic_id is
    '확정 주제. 외부 앱의 selected_topic = ''주제|||상세'' 결합 문자열과 오타 컬럼 selected_topic_detai를 대체한다.';


-- ---------------------------------------------------------------------
-- 1-2. performance_messages — 채팅 타임라인
-- ---------------------------------------------------------------------
create table if not exists public."performance_messages" (
    id uuid default gen_random_uuid() not null,
    session_id uuid not null,
    seq integer not null,
    role text not null,
    kind text default 'text'::text not null,
    body text,
    -- 카드/폼 데이터. kind='card'일 때 인라인 카드의 렌더 입력이 된다.
    payload jsonb,
    created_at timestamp with time zone default now() not null,

    constraint performance_messages_pkey primary key (id),
    constraint performance_messages_role_check
        check (role = any (array['ai'::text, 'user'::text, 'system'::text])),
    constraint performance_messages_kind_check
        check (kind = any (array['text'::text, 'loading'::text, 'card'::text])),
    -- 정렬 키 중복 방지. 서버가 seq를 조립하므로 재시도·다중 탭에서 같은
    -- seq가 두 번 들어오면 타임라인 순서가 비결정적이 된다.
    constraint performance_messages_session_seq_key unique (session_id, seq)
);

alter table public."performance_messages" drop constraint if exists performance_messages_session_id_fkey;
alter table public."performance_messages"
    add constraint performance_messages_session_id_fkey
    foreign key (session_id) references public.performance_sessions(id) on delete cascade;

comment on table public."performance_messages" is '수행평가 채팅 타임라인. 서버(service_role)만 write한다.';


-- ---------------------------------------------------------------------
-- 1-3. performance_attachments — 안내문 이미지
--
--      분석 API는 storage path가 아니라 **이 테이블의 id만** 받는다(§8.8 IDOR).
--      외부 `analyze-assessment-storage.js`는 `image_path`를 요청 본문 그대로
--      받아 검증 없이 download(:68)·remove(:120)하고 내용을 응답(:136)했다 —
--      유효한 세션 하나면 버킷 내 임의 경로를 읽고 지울 수 있었다.
-- ---------------------------------------------------------------------
create table if not exists public."performance_attachments" (
    id uuid default gen_random_uuid() not null,
    session_id uuid not null,

    -- nullable이다. 90일 cron 또는 24시간 TTL 스윕이 원본을 지우고 나면
    -- 이 경로는 무효 포인터가 되므로 null로 되돌린다(§8.3).
    storage_path text,

    -- 업로드 시점 값만 신뢰한다. 클라이언트가 분석 요청에 실어 보내는
    -- mime 값은 무시한다(§8.3).
    mime_type text,
    byte_size integer,

    -- pending = 업로드만 됨(파일 존재) / done·failed = 분석 종료
    ocr_status text default 'pending'::text not null,
    -- 장별 원문. 통합 구조화 JSON은 performance_sessions.guide_json이다.
    ocr_text text,

    -- 실제 Storage 원본 삭제 시각(§8.8). null이면 원본이 아직 살아 있다.
    deleted_at timestamp with time zone,
    created_at timestamp with time zone default now() not null,

    constraint performance_attachments_pkey primary key (id),
    constraint performance_attachments_ocr_status_check
        check (ocr_status = any (array['pending'::text, 'done'::text, 'failed'::text]))
);

alter table public."performance_attachments" drop constraint if exists performance_attachments_session_id_fkey;
alter table public."performance_attachments"
    add constraint performance_attachments_session_id_fkey
    foreign key (session_id) references public.performance_sessions(id) on delete cascade;

comment on table public."performance_attachments" is
    '안내문 이미지 첨부. 분석 API는 storage_path가 아니라 이 행의 id만 받는다(IDOR 차단, 명세서 §8.8).';
comment on column public."performance_attachments".deleted_at is
    'Storage 원본 실제 삭제 시각. 90일 보관 cron(api/performance/cleanup-attachments.js)과 24시간 pending 스윕이 채운다.';


-- ---------------------------------------------------------------------
-- 1-4. performance_topics — 추천 주제 후보
-- ---------------------------------------------------------------------
create table if not exists public."performance_topics" (
    id uuid default gen_random_uuid() not null,
    session_id uuid not null,

    -- 재추천 회차(1..). 재추천 시 이전 라운드 title 배제에 쓴다(§12).
    round smallint default 1 not null,
    idx smallint not null,

    -- 모델 산출물
    title text,
    -- 서버 조립값(모델 산출물 아님, §13). 부제는 고정 문자열
    -- `통합 수행평가 설계 리포트`, 태그 4개는 [학년, 교과군/과목, 진로,
    -- '설계 리포트']로 전부 세션 파생이다.
    subtitle text,
    tags text[],

    -- 6요소 **고정 배열** [{id,label,text} × 6]. 순서는 시안 3754:4872 기준:
    --   선정 근거 → 핵심 내용 → 이전 주제와의 연결 → 다른 과목 연계 포인트
    --   → 점수 강점 → 추후 심화 방향
    -- 외부 프롬프트는 7항목을 냈고(시안에 없는 `추천 이유` 포함, 순서도 일부
    -- 반대) 상세 모달이 필터 없이 전량 렌더해 시안에 없는 섹션이 떴다
    -- (`api/recommend-topics.js:157-164`, `index.html:1904`). 정본은 6이다.
    detail jsonb,

    selected boolean default false not null,
    created_at timestamp with time zone default now() not null,

    constraint performance_topics_pkey primary key (id),
    constraint performance_topics_idx_check check (idx between 1 and 3),
    constraint performance_topics_round_check check (round >= 1),
    -- 한 라운드에 카드 3장, 같은 자리에 두 장이 들어가지 않는다.
    -- 재시도로 같은 라운드가 두 번 저장되는 것도 막는다.
    constraint performance_topics_session_round_idx_key unique (session_id, round, idx)
);

alter table public."performance_topics" drop constraint if exists performance_topics_session_id_fkey;
alter table public."performance_topics"
    add constraint performance_topics_session_id_fkey
    foreign key (session_id) references public.performance_sessions(id) on delete cascade;

comment on table public."performance_topics" is '추천 주제 후보(라운드당 3장). detail은 6요소 고정 배열 [{id,label,text}×6].';


-- ---------------------------------------------------------------------
-- 1-5. performance_reports — 설계/평가/최종 리포트
--
--      외부는 리포트 4종(plan/evaluation/draft/final_submission)을 한 테이블에
--      sparse하게 넣고 세션 컨텍스트(학생명·학년·과목·진로·주제)를 행마다
--      4번 중복 비정규화했다(§8.2 결함 #3). 여기서는 컨텍스트가 세션에만 있다.
--
--      **draft는 리포트가 아니다.** 외부는 중간저장을 report_type='draft'
--      리포트 행으로 넣고 report_content에 안내 문구를 채웠으며 그 문구까지
--      임베딩했다(`api/_lib/reports.js:264`, `:276`, `:279-280`).
--      목적지에서 draft는 performance_submissions.is_draft로만 표현한다.
-- ---------------------------------------------------------------------
create table if not exists public."performance_reports" (
    id uuid default gen_random_uuid() not null,
    session_id uuid not null,

    report_type text not null,
    -- §8.5 블록 스키마. 평문이 아니라 구조화 JSON이다(§8.4 결정).
    sections jsonb not null,

    -- 평가 리포트 종합 점수(0~100). 시안 3754:4512 상단 `86/100` 카드용.
    -- 모델 응답 스키마는 string으로 받고 서버가 parseInt 후 여기 저장한다
    -- (§8.4 — gemini-2.5-flash structured output 결함 완화).
    score smallint,
    summary text,

    -- 재현성. 설계 리포트는 `design-v2`(CORE_PRINCIPLES 주입) 고정이며
    -- 미주입 비교본(`design-v1`)은 A/B 검증용으로만 별도 기록한다(§12.1).
    model text,
    prompt_version text,

    created_at timestamp with time zone default now() not null,

    constraint performance_reports_pkey primary key (id),
    constraint performance_reports_report_type_check
        check (report_type = any (array['design'::text, 'evaluation'::text, 'final_submission'::text])),
    constraint performance_reports_score_check
        check (score is null or score between 0 and 100)
);

alter table public."performance_reports" drop constraint if exists performance_reports_session_id_fkey;
alter table public."performance_reports"
    add constraint performance_reports_session_id_fkey
    foreign key (session_id) references public.performance_sessions(id) on delete cascade;

comment on table public."performance_reports" is
    '설계/평가/최종 리포트 3종. 외부 앱의 draft 리포트 행은 이식하지 않는다(중간저장은 performance_submissions.is_draft).';


-- ---------------------------------------------------------------------
-- 1-6. performance_submissions — 학생 작성물
-- ---------------------------------------------------------------------
create table if not exists public."performance_submissions" (
    id uuid default gen_random_uuid() not null,
    session_id uuid not null,

    -- `추가 평가 받기` 시 증가
    revision smallint default 1 not null,

    -- {[fieldKey]: value} 자유 키. 초판의 {topic,intro,body,conclusion} 4필드
    -- 고정은 오류였다 — 제출 스키마가 8종이고 문항형은 최대 20필드다
    -- (`index.html:2141-2229`, `:2152`).
    fields jsonb not null,
    -- 필드별 글자수. 시안 카운터(`356자`)와 동일 계산식을 공유하며
    -- §9.3 최소 길이 판정에도 쓴다.
    char_counts jsonb,

    is_draft boolean default true not null,
    is_final boolean default false not null,
    finalized_at timestamp with time zone,
    -- 외부 `api/finalize-submission.js:59-71`의 action 값 승계
    finalize_reason text,
    submitted_at timestamp with time zone,

    created_at timestamp with time zone default now() not null,
    updated_at timestamp with time zone default now() not null,

    constraint performance_submissions_pkey primary key (id),
    constraint performance_submissions_revision_check check (revision >= 1),
    constraint performance_submissions_finalize_reason_check
        check (finalize_reason is null or finalize_reason = any (array['confirm'::text, 'new_assessment'::text])),
    -- draft 원자적 upsert 키
    constraint performance_submissions_session_revision_key unique (session_id, revision)
);

alter table public."performance_submissions" drop constraint if exists performance_submissions_session_id_fkey;
alter table public."performance_submissions"
    add constraint performance_submissions_session_id_fkey
    foreign key (session_id) references public.performance_sessions(id) on delete cascade;

-- 최종 확정 멱등 가드. 외부는 조건 없는 insert라 재시도·다중 탭에 중복 행이
-- 쌓였다(`api/finalize-submission.js:46-72`). 부분 UNIQUE는 테이블 제약으로
-- 표현할 수 없어 인덱스로 만든다.
create unique index if not exists performance_submissions_one_final_per_session_idx
    on public."performance_submissions" using btree (session_id)
    where (is_final = true);

comment on table public."performance_submissions" is
    '학생 작성물. fields는 자유 키 jsonb(문항형 최대 20필드). 세션당 is_final 행은 부분 UNIQUE 인덱스로 최대 1건.';


-- ---------------------------------------------------------------------
-- 1-7. performance_credit_ledger — 회차 차감 원장
--
--      **session_id UNIQUE가 이 파일에서 가장 중요한 제약이다.**
--      "1회 = 수행평가 세션 1건"(§9.2 사용자 확정)이라는 과금 단위가
--      코드 규율이 아니라 스키마로 강제된다. 세션 안에서 주제를 몇 번
--      재추천하든 원장 행은 1개를 넘을 수 없으므로 이중 차감이 물리적으로
--      불가능하다(§9.3 「결정(멱등 차감)」 3항).
-- ---------------------------------------------------------------------
create table if not exists public."performance_credit_ledger" (
    id uuid default gen_random_uuid() not null,
    session_id uuid not null,
    profile_id uuid not null,

    -- 기본 -1(1회 차감). 명세서는 보정 행(+1)으로 CS 처리를 상정하지만,
    -- session_id UNIQUE 때문에 같은 세션에 보정 행을 **추가**할 수는 없다.
    -- 두 규정이 충돌하므로 여기서는 UNIQUE(= 이중 차감 불가)를 우선한다.
    -- CS 보정은 (ㄱ) 이 행의 delta를 0으로 update 하거나
    -- (ㄴ) program_access.meta.quota_used를 어드민이 직접 조정하는 방식으로
    -- 한다. 어느 쪽이든 service_role 경로이며 클라이언트 write는 없다.
    delta smallint default -1 not null,
    -- 예: 'recommend-topics:first-success'
    reason text,
    created_at timestamp with time zone default now() not null,

    constraint performance_credit_ledger_pkey primary key (id),
    constraint performance_credit_ledger_session_id_key unique (session_id)
);

alter table public."performance_credit_ledger" drop constraint if exists performance_credit_ledger_session_id_fkey;
alter table public."performance_credit_ledger"
    add constraint performance_credit_ledger_session_id_fkey
    foreign key (session_id) references public.performance_sessions(id) on delete cascade;

alter table public."performance_credit_ledger" drop constraint if exists performance_credit_ledger_profile_id_fkey;
alter table public."performance_credit_ledger"
    add constraint performance_credit_ledger_profile_id_fkey
    foreign key (profile_id) references public.profiles(id) on delete cascade;

comment on table public."performance_credit_ledger" is
    '회차 차감 원장. session_id UNIQUE가 멱등 가드다(세션당 최대 1회 차감). 클라이언트 write 정책 없음 — 차감은 consume_performance_credit RPC(service_role)만 한다.';


-- ---------------------------------------------------------------------
-- 1-8. performance_session_vectors — 학생 과거 수행 RAG
--
--      초판 §8.2가 통째로 누락했던 층이다. 외부 앱은 학생 산출물을 임베딩해
--      주제 추천·설계 리포트 프롬프트에 재주입하며(`api/_lib/reports.js:162-238`
--      → `api/recommend-topics.js:122-123`, `api/find-resources.js:416-417`)
--      이것이 "이미 했던 주제 반복 금지" 규칙의 동력이다.
--
--      임베딩 단위가 **세션 1건**이라 PK가 session_id다. 외부는 리포트 4종을
--      각각 임베딩해 검색 상위 4건이 전부 같은 주제로 채워질 수 있었다.
-- ---------------------------------------------------------------------
create table if not exists public."performance_session_vectors" (
    session_id uuid not null,
    profile_id uuid not null,

    -- 프롬프트 렌더용 비정규화 사본(세션이 archived 돼도 검색 결과가 스스로
    -- 설명 가능해야 한다)
    grade_label text,
    subject_group text,
    subject text,
    career_goal text,
    topic_title text,

    -- 설계+평가 본문 압축본
    summary_text text,
    -- 임베딩 입력. 외부 조립(`api/_lib/reports.js:9-23`)에서 **학생코드(11행)·
    -- 학생명(12행) 2줄은 제거하고 이식**한다 — PII를 벡터에 넣을 이유가 없고
    -- 동명이인이 유사도를 오염시킨다.
    search_text text,

    -- 차원 768은 winning_assessment_knowledge_items.embedding(00_base_schema.sql:969)
    -- 및 api/_lib/performance/embeddings.js의 DEFAULT_EMBEDDING_DIMENSION과
    -- 반드시 일치해야 한다. 차원 변경은 인덱스 재생성 + 전량 재임베딩을 동반한다.
    embedding vector(768),
    embedding_model text,
    embedding_status text default 'pending'::text not null,
    embedding_error text,
    embedded_at timestamp with time zone,

    -- **평가 리포트 생성 또는 최종 제출 확정 시에만 true 승격.**
    -- 외부는 draft도 rag_use=true라 미완성 초안이 "과거 실적"으로 프롬프트에
    -- 들어갔다(`api/_lib/reports.js:279`). 그래서 기본값이 false다.
    rag_use boolean default false not null,
    -- 무변경 재임베딩 스킵
    content_hash text,

    created_at timestamp with time zone default now() not null,
    updated_at timestamp with time zone default now() not null,

    constraint performance_session_vectors_pkey primary key (session_id),
    constraint performance_session_vectors_embedding_status_check
        check (embedding_status = any (array['pending'::text, 'done'::text, 'error'::text]))
);

alter table public."performance_session_vectors" drop constraint if exists performance_session_vectors_session_id_fkey;
alter table public."performance_session_vectors"
    add constraint performance_session_vectors_session_id_fkey
    foreign key (session_id) references public.performance_sessions(id) on delete cascade;

alter table public."performance_session_vectors" drop constraint if exists performance_session_vectors_profile_id_fkey;
alter table public."performance_session_vectors"
    add constraint performance_session_vectors_profile_id_fkey
    foreign key (profile_id) references public.profiles(id) on delete cascade;

comment on table public."performance_session_vectors" is
    '학생 과거 수행 RAG 벡터(임베딩 단위 = 세션 1건). rag_use는 평가 리포트 생성/최종 확정 시에만 true로 승격한다.';
comment on column public."performance_session_vectors".search_text is
    '임베딩 입력. 외부 앱 조립에서 학생코드·학생명 2줄을 제거하고 이식했다(PII 배제 + 동명이인 유사도 오염 방지).';


-- ---------------------------------------------------------------------
-- 1-9. 순환 FK — performance_sessions.selected_topic_id → performance_topics
--      두 테이블이 서로를 참조하므로 테이블 생성 이후에 붙인다.
--      on delete set null: 주제 행이 사라져도 세션은 남아야 한다.
-- ---------------------------------------------------------------------
alter table public."performance_sessions" drop constraint if exists performance_sessions_selected_topic_id_fkey;
alter table public."performance_sessions"
    add constraint performance_sessions_selected_topic_id_fkey
    foreign key (selected_topic_id) references public.performance_topics(id) on delete set null;


-- =====================================================================
-- (2) 인덱스 · 트리거
-- =====================================================================
-- RLS 정책이 매 행 서브쿼리를 돌지 않게 하려면 두 가지가 함께 필요하다:
--   ㄱ. (3-0)의 SECURITY DEFINER 헬퍼 — 상위 테이블 RLS 재평가 제거
--   ㄴ. 아래 session_id 인덱스 — 하위 테이블을 세션으로 좁힐 때의 스캔 제거
-- 헬퍼 안의 조회는 performance_sessions_pkey(PK) 단일 조회라 별도 인덱스가
-- 필요 없다. 여기서 만드는 것은 "세션의 자식 행들"을 읽는 애플리케이션
-- 조회 경로용이다.

create index if not exists performance_sessions_profile_updated_idx
    on public."performance_sessions" using btree (profile_id, updated_at desc);
create index if not exists performance_sessions_profile_status_idx
    on public."performance_sessions" using btree (profile_id, status);

-- performance_messages / performance_topics / performance_submissions 는 별도
-- session_id 인덱스를 만들지 않는다 — UNIQUE 제약이 이미 같은 선두 컬럼의
-- btree 인덱스를 만들어 두기 때문이다(각각 (session_id, seq) /
-- (session_id, round, idx) / (session_id, revision)). 같은 모양을 한 번 더
-- 만들면 조회는 빨라지지 않고 쓰기 비용만 확실히 는다.
-- `order by revision desc` 같은 역순 정렬도 btree 후방 스캔으로 해결된다.

create index if not exists performance_attachments_session_idx
    on public."performance_attachments" using btree (session_id);
-- 24시간 TTL 스윕(ocr_status='pending' 고아 파일) 대상 조회용(§8.8)
create index if not exists performance_attachments_pending_sweep_idx
    on public."performance_attachments" using btree (ocr_status, created_at)
    where (deleted_at is null);
-- 90일 보관 cron(분석 완료분 전체) 대상 조회용(§8.8)
create index if not exists performance_attachments_retention_idx
    on public."performance_attachments" using btree (created_at)
    where (deleted_at is null);

create index if not exists performance_reports_session_type_idx
    on public."performance_reports" using btree (session_id, report_type, created_at desc);

create index if not exists performance_credit_ledger_profile_idx
    on public."performance_credit_ledger" using btree (profile_id, created_at desc);

-- 벡터 인덱스는 00_base_schema.sql:1101 패턴을 준용한다.
--   · opclass = vector_cosine_ops — RPC가 쓰는 거리 연산자가 `<=>`(코사인)이다.
--   · 부분 인덱스 술어 `where embedding is not null`이 RPC 조건과 일치해야
--     인덱스가 실제로 선택된다.
create index if not exists performance_session_vectors_embedding_hnsw_idx
    on public."performance_session_vectors" using hnsw (embedding vector_cosine_ops)
    where (embedding is not null);
-- 소유자 격리 + rag_use 필터를 한 번에 좁힌다(RPC ②의 선행 필터).
create index if not exists performance_session_vectors_profile_rag_idx
    on public."performance_session_vectors" using btree (profile_id, rag_use);

-- updated_at 트리거 — 공용 public.set_updated_at()(00_base_schema.sql:1432) 재사용.
-- 새 함수를 만들지 않는다.
drop trigger if exists set_performance_sessions_updated_at on public."performance_sessions";
create trigger set_performance_sessions_updated_at
    before update on public."performance_sessions"
    for each row execute function public.set_updated_at();

drop trigger if exists set_performance_submissions_updated_at on public."performance_submissions";
create trigger set_performance_submissions_updated_at
    before update on public."performance_submissions"
    for each row execute function public.set_updated_at();

drop trigger if exists set_performance_session_vectors_updated_at on public."performance_session_vectors";
create trigger set_performance_session_vectors_updated_at
    before update on public."performance_session_vectors"
    for each row execute function public.set_updated_at();


-- =====================================================================
-- (3) RLS
-- =====================================================================
-- ---------------------------------------------------------------------
-- (3-a) 설계 근거 — 왜 대부분이 "읽기 전용"인가
-- ---------------------------------------------------------------------
-- 명세서 §8.3의 RLS 제안은 "전 performance_* 테이블에 소유자 기준
-- select/insert/update 허용, delete 금지. **AI 산출물 write는 service_role만**"
-- 이다. 뒤 문장이 앞 문장을 실질적으로 좁힌다 — §8.6 엔드포인트 표를 실측하면
-- **클라이언트가 직접 write하는 경로가 하나도 없다.**
--
--   세션 생성/갱신  → POST·PATCH api/performance/session.js
--   첨부 등록       → POST api/performance/upload-url.js (경로도 서버가 조립)
--   안내문 분석     → POST api/performance/analyze-guide.js
--   주제            → POST api/performance/recommend-topics.js
--   설계 리포트     → POST api/performance/design-report.js
--   제출물          → PUT  api/performance/submission.js
--   평가 리포트     → POST api/performance/evaluate.js
--   최종 확정       → POST api/performance/finalize.js
--
-- 전부 Bearer 검증 + 이용권 재판정을 거치는 서버리스 핸들러이고 service_role로
-- 붙으므로 RLS를 우회한다. 반면 **읽기**는 클라이언트 supabase-js 직접
-- select가 정본이다 — §8.6 「저장 리포트 조회는 엔드포인트를 만들지 않는다」.
--
-- 따라서 정책은 다음과 같이 연다.
--   · 전 8테이블: 소유자 SELECT
--   · write 정책은 **8테이블 모두 하나도 만들지 않는다**(INSERT·UPDATE·DELETE).
--
-- 명세서 문언(select/insert/update 전 테이블)보다 좁다. 사유는 위 실측이며,
-- 나중에 클라이언트 직접 write 경로가 실제로 생기면 그때 해당 테이블·컬럼
-- 범위로 다시 연다. 넓게 열어두고 안 쓰는 것보다 좁게 열고 필요할 때 여는 쪽이
-- 되돌리기 쉽다.
--
-- ⚠ 초안에는 performance_sessions / performance_submissions에 소유자
--   INSERT·UPDATE 정책이 있었다("사용자 소유 데이터라 안전한 범위"). 철회한다 —
--   Postgres RLS는 **행 단위**라 컬럼을 가릴 수 없고, 이 두 테이블의 컬럼 중
--   상당수가 서버 소유이기 때문이다.
--     ㄱ. 미차감 세션 동시 1개 제한(§9.3, 무료 vision 게이트 남용 차단)은
--         두 테이블에 걸친 조건이라 DB 제약으로 표현할 수 없고 (8)-ㄷ대로
--         `api/performance/session.js`의 409 UNCHARGED_SESSION_EXISTS 하나로만
--         강제된다. 소유자 INSERT가 열려 있으면 supabase-js로
--         `insert({profile_id: 내 uid})`를 반복해 미차감 세션을 무한 생성할 수
--         있고, 그러면 회차 차감 없이 analyze-guide(Gemini vision)를 계속 부를
--         수 있다(진입에 이용권은 필요하지만 회차는 소비되지 않는다).
--     ㄴ. `guide_json`(1-1)·`submission_schema`(1-1)는 "외부 앱은 클라이언트가
--         위조할 수 있었다 → 서버 소유로 승격"이 도입 사유다. 소유자 UPDATE는
--         그 위조 경로를 그대로 되살린다(`status`/`completed_steps`/
--         `selected_topic_id`도 같다).
--   실제 write는 전부 service_role 핸들러라 이 철회로 잃는 기능이 없다.
--
-- ---------------------------------------------------------------------
-- (3-b) 어드민 정책을 만들지 않는 이유
-- ---------------------------------------------------------------------
-- 53_performance.sql은 어드민 정책을 `is_admin()`으로 만들었다. 그건 그 테이블을
-- **브라우저 supabase 클라이언트로 직접** CRUD하는 어드민 화면이 이미 존재하기
-- 때문이다(`src/pages/Admin.jsx`의 위닝DB 3개 섹션). performance_* 8테이블에는
-- 그런 화면이 **아직 없다.** 서버·운영 경로는 전부 service_role(RLS 우회)이라
-- 정책 없이도 동작한다.
-- → 지금은 만들지 않는다. 어드민 화면이 생기면 그때 `is_admin()` 기준 SELECT
--   정책을 추가한다(`is_winning_admin()`이 아니다 — 53번의 판단과 일치시킨다:
--   role 3종 확장분은 profiles_role_check 때문에 이 DB에 존재할 수 없고,
--   is_winning_admin()의 JWT email 매칭 축은 profiles.email에 UNIQUE가 없어
--   판정만 넓어진다).
--
-- ⚠ 53번과 마찬가지로 `revoke all on table ... from anon, authenticated`는
--   걸지 않는다. 테이블 권한은 RLS보다 먼저 평가되므로 회수하면 소유자 읽기
--   경로까지 함께 죽는다(46·52·53번이 반복 기록한 함정).
-- ---------------------------------------------------------------------

-- ---------------------------------------------------------------------
-- (3-0) 공용 헬퍼 — 세션 소유권 판정
--       (테이블 생성 이후에 둔다 — language sql 함수는 생성 시점에 본문이
--        파싱·검증되므로 performance_sessions보다 먼저 만들 수 없다.)
-- ---------------------------------------------------------------------
-- 세션 하위 6테이블(messages/attachments/topics/reports/submissions/vectors)의
-- RLS 정책은 전부 "이 행의 session_id가 내 세션인가"를 묻는다. 이를 정책 본문에
-- `exists (select 1 from public.performance_sessions s where ...)`로 직접 쓰면
-- 두 가지 비용이 생긴다.
--
--   ㄱ. 서브쿼리가 performance_sessions의 RLS를 **다시** 통과해야 한다.
--       즉 하위 테이블 1행마다 상위 테이블 정책이 한 번 더 평가된다.
--   ㄴ. 정책 본문이 6곳에 복제되어, 나중에 소유권 규칙이 바뀌면 6곳을
--       모두 고쳐야 한다(하나라도 빠뜨리면 조용히 뚫린다).
--
-- SECURITY DEFINER 함수로 감싸면 ㄱ이 사라진다(함수 안에서는 RLS가 적용되지
-- 않는다). 함수가 하는 일은 PK 등가 조회 1건이므로 `performance_sessions_pkey`
-- 단일 인덱스 조회로 끝난다. ㄴ도 정의가 한 곳으로 모여 해소된다.
--
-- 노출 위험은 없다 — 이 함수는 boolean만 돌려주고, 판정 기준이
-- `auth.uid()` 고정이라 인자로 남의 세션 id를 넣어도 false만 나온다.
-- (세션 id의 존재 여부는 알 수 없다 — 없는 id와 남의 id가 모두 false다.)
create or replace function public.performance_owns_session(p_session_id uuid)
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $function$
  select exists (
    select 1
    from public.performance_sessions s
    where s.id = p_session_id
      and s.profile_id = auth.uid()
  );
$function$;

comment on function public.performance_owns_session(uuid) is
    '수행평가 세션 하위 테이블 RLS용 소유권 판정. SECURITY DEFINER라 상위 테이블 RLS를 재평가하지 않는다. auth.uid() 고정 기준이므로 인자로 남의 세션 id를 넣어도 false만 반환한다.';


alter table public."performance_sessions" enable row level security;
alter table public."performance_messages" enable row level security;
alter table public."performance_attachments" enable row level security;
alter table public."performance_topics" enable row level security;
alter table public."performance_reports" enable row level security;
alter table public."performance_submissions" enable row level security;
alter table public."performance_credit_ledger" enable row level security;
alter table public."performance_session_vectors" enable row level security;

-- performance_sessions — 소유자 select만. write는 service_role 핸들러 전용이다((3-a) ⚠).
drop policy if exists "performance_sessions_select_own" on public."performance_sessions";
create policy "performance_sessions_select_own" on public."performance_sessions"
    as PERMISSIVE for SELECT to authenticated
    using (profile_id = auth.uid());

-- 초안의 소유자 write 정책 철회분. 이미 적용된 DB에서도 사라지도록 drop만 남긴다
-- (재실행 안전). 다시 만들지 않는다 — 사유는 (3-a) ⚠.
drop policy if exists "performance_sessions_insert_own" on public."performance_sessions";
drop policy if exists "performance_sessions_update_own" on public."performance_sessions";

-- performance_messages — 소유자 select만
drop policy if exists "performance_messages_select_own" on public."performance_messages";
create policy "performance_messages_select_own" on public."performance_messages"
    as PERMISSIVE for SELECT to authenticated
    using (public.performance_owns_session(session_id));

-- performance_attachments — 소유자 select만
drop policy if exists "performance_attachments_select_own" on public."performance_attachments";
create policy "performance_attachments_select_own" on public."performance_attachments"
    as PERMISSIVE for SELECT to authenticated
    using (public.performance_owns_session(session_id));

-- performance_topics — 소유자 select만
drop policy if exists "performance_topics_select_own" on public."performance_topics";
create policy "performance_topics_select_own" on public."performance_topics"
    as PERMISSIVE for SELECT to authenticated
    using (public.performance_owns_session(session_id));

-- performance_reports — 소유자 select만
drop policy if exists "performance_reports_select_own" on public."performance_reports";
create policy "performance_reports_select_own" on public."performance_reports"
    as PERMISSIVE for SELECT to authenticated
    using (public.performance_owns_session(session_id));

-- performance_submissions — 소유자 select만. 제출물 저장은 PUT api/performance/submission.js다.
drop policy if exists "performance_submissions_select_own" on public."performance_submissions";
create policy "performance_submissions_select_own" on public."performance_submissions"
    as PERMISSIVE for SELECT to authenticated
    using (public.performance_owns_session(session_id));

-- 초안의 소유자 write 정책 철회분(위 sessions와 같은 사유, (3-a) ⚠).
drop policy if exists "performance_submissions_insert_own" on public."performance_submissions";
drop policy if exists "performance_submissions_update_own" on public."performance_submissions";

-- performance_credit_ledger — 소유자 select만. **write 정책 없음.**
-- 차감은 consume_performance_credit RPC(service_role 전용)만 한다.
-- 클라이언트가 insert/update/delete를 시도하면 RLS가 0행으로 막는다.
drop policy if exists "performance_credit_ledger_select_own" on public."performance_credit_ledger";
create policy "performance_credit_ledger_select_own" on public."performance_credit_ledger"
    as PERMISSIVE for SELECT to authenticated
    using (profile_id = auth.uid());

-- performance_session_vectors — 소유자 select만.
-- 검색 RPC ②가 SECURITY INVOKER라 이 정책이 2차 방어선이 된다.
drop policy if exists "performance_session_vectors_select_own" on public."performance_session_vectors";
create policy "performance_session_vectors_select_own" on public."performance_session_vectors"
    as PERMISSIVE for SELECT to authenticated
    using (profile_id = auth.uid());


-- =====================================================================
-- (4) RPC ① consume_performance_credit — 멱등 회차 차감
-- =====================================================================
-- ---------------------------------------------------------------------
-- (4-a) ⚠️ quota sentinel — 외부 앱과 **의미가 반전**돼 있다
-- ---------------------------------------------------------------------
-- 외부 앱은 `limit === 0`을 **무제한**으로 해석한다
-- (`api/_lib/sessions.js:229` — `if (limit !== 0 && count >= limit)`).
-- 그런데 같은 앱의 신규 SSO 학생 생성 코드가 **정확히 `call_limit: 0`으로**
-- 계정을 만든다(`api/login.js:222-223`, `:373-374`). 즉 그 규칙을 그대로
-- 이식했다면 **이식 첫날부터 모든 신규 사용자가 무제한**이 되어 이용권 상품
-- 자체가 무력화된다. 게다가 UI도 `if(!limit) return`으로 게이지를 숨겨
-- (`index.html:3027`) 아무도 눈치채지 못한다.
--
-- 그래서 목적지 규칙은 다음과 같이 **반전**한다(명세서 §9.3 「무제한 sentinel」).
--
--     quota_total = null   →  무제한 (어드민/결제 경로만 부여 가능)
--     quota_total = 0      →  **소진**  ← 외부에서는 무제한이던 값이다
--     quota_total > 0      →  잔여 = quota_total - quota_used
--
-- 이 반전은 조용한 실패를 만든다 — 값이 그대로여도 의미가 정반대라 어떤 에러도
-- 나지 않고 과금만 무력화되기 때문이다. 외부 앱 코드를 참고해 이 함수를 고칠
-- 일이 생기면 **반드시 이 주석을 먼저 읽어라.**
--
-- ---------------------------------------------------------------------
-- (4-b) 회차 저장 위치 — program_access.meta
-- ---------------------------------------------------------------------
-- 명세서 §9.3 「결정(멱등 차감)」 2항이 지정한다:
--   "INSERT가 실제 성공한 경우에만 `program_access.meta.quota_used`를
--    `jsonb_set`으로 원자 증가."
-- §9.4 파이프라인 2단계도 결제 시 적립을 같은 위치로 못박는다:
--   "`program_access`를 upsert: program_key='suhaeng', ...,
--    `meta = {quota_total, quota_used:0}`"
-- → 정본은 `program_access.meta.quota_total` / `.quota_used`이며,
--   `program_access`에 신규 컬럼을 만들지 않는다.
--
-- program_key는 `'suhaeng'` 고정이다. 신규 자산은 `performance` 네이밍이지만
-- 이 값은 운영 DB·`api/_lib/serviceAccess.js`의 `SERVICE_CONFIGS.suhaeng`·
-- 랜딩 `ServicePricingSection serviceKey="suhaeng"`에 이미 박혀 있어 개명 대상이
-- 아니다. 바꾸면 결제-이용권 연결이 끊어진다(명세서 §9.4 「service_key는 바꾸지
-- 않는다」).
--
-- ---------------------------------------------------------------------
-- (4-c) 행 선택 — program_access의 PK는 (id, program_key)다
-- ---------------------------------------------------------------------
-- 이 테이블에는 사용자를 가리키는 컬럼이 3개 있다: `id`(PK 구성, profiles FK),
-- `profile_id`, `user_id`. `api/_lib/serviceAccess.js:checkProgramAccessTable`도
-- 세 컬럼을 차례로 훑는다. 여기서도 같은 우선순위(id → profile_id → user_id)로
-- 1행만 잡고 `for update`로 잠근다 — 잠그지 않으면 두 탭이 같은 quota_used를
-- 읽어 둘 다 +1 해 한 번이 공짜가 된다(외부 앱 `incrementCallCount`의 read-then-
-- write 결함, §9.3 BLOCK 항목).
--
-- ---------------------------------------------------------------------
-- (4-d) 반환 vs 예외 — 명세서와 다르게 구현한 지점
-- ---------------------------------------------------------------------
-- 명세서 §9.3은 소진 시 `QUOTA_EXHAUSTED` **raise**, 이용권 없음 시
-- `NO_ENTITLEMENT` **raise**를 적었다. 이 함수는 대신 **구조화된 jsonb를
-- 반환**한다. 사유 3가지:
--   ㄱ. §9.3이 규정한 소진 응답 계약이
--       `409 { code:'QUOTA_EXHAUSTED', quotaRemaining:0, planEndsAt }`인데,
--       raise는 **문자열 하나**만 전달할 수 있어 planEndsAt을 실을 수 없다.
--       호출부가 다시 program_access를 조회해야 하고, 그러면 방금 잠갔던 값과
--       달라질 수 있다(TOCTOU).
--   ㄲ. PostgREST는 raise를 HTTP 4xx/5xx로 매핑하며 호출부가 **에러 메시지
--       문자열을 파싱**해 code를 복원해야 한다. 문구를 고치는 순간 조용히 깨진다.
--   ㄷ. 예외는 트랜잭션을 abort시키므로, 나중에 이 RPC를 다른 서버 트랜잭션
--       안에서 호출하면 바깥 작업까지 함께 롤백된다.
-- **차감 실패가 요청 실패로 전파되어야 한다(fail-closed)는 §9.3 5항은 그대로
-- 지켜진다** — 호출부가 `status`를 보고 409/403을 만들면 되고, 이 함수는
-- 차감에 성공하지 못한 어떤 경우에도 `charged:true`를 돌려주지 않는다.
--
-- 반환 계약:
--   {
--     status: 'charged' | 'already_charged' | 'quota_exhausted'
--           | 'no_entitlement' | 'entitlement_expired' | 'session_not_found',
--     charged: boolean,          -- 이번 호출에서 실제로 차감했는가
--     quota_total: int | null,   -- null = 무제한
--     quota_used: int,
--     quota_remaining: int | null,
--     plan_ends_at: timestamptz | null,
--     ledger_id: uuid | null,
--     program_key: 'suhaeng'
--   }
--
-- 호출부 매핑(§8.6 엔드포인트 표):
--   charged / already_charged → 200 계속 진행(`charged` 필드 그대로 응답)
--   quota_exhausted           → 409 QUOTA_EXHAUSTED { quotaRemaining, planEndsAt }
--   no_entitlement            → 403 NO_ENTITLEMENT
--   entitlement_expired       → 403 ENTITLEMENT_EXPIRED { planEndsAt } — 사유를
--                               나눠야 화면이 "결제하세요"와 "기간이 끝났어요"를
--                               구분해 안내할 수 있다((4-e)).
--   session_not_found         → 403 NOT_SESSION_OWNER (존재/소유를 구분하지 않는다)
--
-- ---------------------------------------------------------------------
-- (4-e) 이용권 유효성 — 행이 있다고 유효한 것이 아니다
-- ---------------------------------------------------------------------
-- 초안은 program_key와 소유자 컬럼만 매칭해 행을 잡았다. 그러면 환불
-- (`payment_status='refunded'`)·정지(`access_status='suspended'`)·기간 만료된
-- 행이라도 meta만 비어 있으면 **무제한으로 차감이 성립**한다. 명세서 §2.2가
-- 외부 앱의 결함으로 지목한 바로 그 동작이다 — "결제가 만료·환불된 뒤에도 살아
-- 있는 session_id로 AI 호출이 계속된다. 목적지는 api/performance/* 각 요청이
-- 매번 재판정하는 것을 권위로 둔다."
--
-- 그래서 단계 6에서 다음을 확인하고, 어긋나면 `entitlement_expired`로 가른다.
--   · access_status  not in ('expired','suspended')
--   · payment_status not in ('refunded','cancelled')
--   · coalesce(access_expires_at, expires_at) is null or > now()
-- 같은 조건을 단계 2의 `order by` 선두에도 둔다 — 한 회원에게 만료 행과 신규
-- 결제 행이 함께 있으면 유효한 쪽을 잡아야 표시값(serviceAccess.js
-- findProgramAccessRow)과 차감 대상이 같은 행을 가리킨다.
--
-- ⚠ 허용 목록(`= 'active'`, `= 'paid'`)이 아니라 **거부 목록**인 이유:
--   진입 게이트 `serviceAccess.js:checkProgramAccessTable`은
--   `isPaidStatus`/`isActiveStatus`의 부분 문자열 매칭 때문에 `'unpaid'`
--   (`'unpaid'.includes('paid')`)와 `'inactive'`(`.includes('active')`)를
--   **통과시킨다.** 여기만 허용 목록으로 조이면 게이트는 통과했는데 차감에서만
--   막히는 사용자가 생긴다(셸에 들어와서 STEP3에서 403). 두 계층을 함께 조이는
--   것은 P15 작업이며 (8)-ㅁ에 남겼다. 지금은 명세가 결함으로 지목한 3가지
--   (환불·정지·기간 만료)만 확실히 막는다.
--
-- ⚠ 게이트(`hasPaidServiceAccess`)는 `access_expires_at`/`expires_at`을 아예
--   보지 않는다(pre-existing). 만료 배치도 저장소에 없다(§11-Q56). 즉 만료
--   판정은 지금 이 RPC가 유일한 지점이다 — 게이트 쪽 수정은 목표관리(goal)까지
--   함께 판정이 바뀌는 변경이라 이 파일에서 하지 않고 (8)-ㅁ으로 넘긴다.
-- ---------------------------------------------------------------------

-- ⚠️⚠️⚠️ 구버전 경고 (2026-08-12) ⚠️⚠️⚠️
-- 아래 consume_performance_credit 정의는 **meta 기반 구버전**이다(program_access.meta.
-- quota_total/quota_used를 읽고 쓴다). `checkout-renewal` 브랜치(아직 push 전)가
-- sql/64~66에서 이 함수를 **부여 원장(program_access_grants) 기반**으로 완전히
-- 재작성해 dev DB(gjowqdiopinhixfivnkx)에 이미 배포했다 — program_access.meta의
-- quota_total/quota_used 키는 그쪽 배포로 물리적으로 삭제됐고, program_access.
-- access_expires_at/expires_at도 표시·호환 전용 미러로 강등됐다(정본 아님).
-- 시그니처와 반환 키 8개(status/charged/quota_total/quota_used/quota_remaining/
-- plan_ends_at/ledger_id/program_key)는 동일하게 유지되므로 호출부 코드는 그대로다.
--
-- 이 저장소는 마이그레이션 러너가 없어 **파일 번호가 곧 수동 실행 순서**다.
-- 이 54번 파일을 재실행하면 아래 create or replace가 checkout-renewal의 신버전을
-- 덮어쓴다 — 다만 **조용히 meta 회계로 되돌아가지는 않는다.** checkout-renewal이
-- `performance_credit_ledger.grant_id`를 NOT NULL로 추가했는데, 구버전 본문은
-- 그 컬럼을 채우지 않으므로 **첫 차감 시도에서 즉시 23502(not-null violation)로
-- 큰소리로 실패한다.** 회계가 틀린 채 조용히 도는 것보다는 낫지만, 여전히 원인이
-- 바로 보이지 않으면 헤매게 된다 — 54번을 재실행했다면 반드시 sql/64~66을 다시
-- 적용해라(순서 그대로).
-- ⚠️⚠️⚠️ ---------------------------- ⚠️⚠️⚠️
--
-- 시그니처가 바뀔 수 있으므로 같은 이름의 모든 오버로드를 oid로 훑어 drop한다
-- (53_performance.sql (3-a)와 같은 방어 — 오버로드가 공존하면 PostgREST가
-- 42725 function is not unique로 깨진다).
do $$
declare
  fn record;
begin
  for fn in
    select p.oid::regprocedure as sig
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public'
       and p.proname = 'consume_performance_credit'
  loop
    raise notice '54_performance_app: dropping %', fn.sig::text;
    execute format('drop function if exists %s', fn.sig);
  end loop;
end;
$$;

create or replace function public.consume_performance_credit(
    p_session_id uuid,
    p_profile_id uuid,
    p_reason text default 'recommend-topics:first-success'
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  -- 회차가 붙는 program_access.program_key. 신규 자산은 performance 네이밍이지만
  -- 이 값은 운영 DB·env에 이미 박힌 기존 값이라 개명하지 않는다((4-b) 참조).
  c_program_key constant text := 'suhaeng';

  v_owns          boolean;
  v_access        public.program_access%rowtype;
  v_has_access    boolean;
  v_plan_ends_at  timestamptz;
  v_quota_raw     text;
  v_quota_total   integer;
  v_quota_used    integer;
  v_remaining     integer;
  v_ledger_id     uuid;
begin
  -- ── 1) 세션 존재 + 소유권. SECURITY DEFINER라 RLS가 적용되지 않으므로
  --       여기서 직접 확인해야 한다. 존재하지 않는 세션과 남의 세션을
  --       같은 결과로 묶어 세션 id 존재 여부가 새지 않게 한다.
  select exists (
    select 1
      from public.performance_sessions s
     where s.id = p_session_id
       and s.profile_id = p_profile_id
  ) into v_owns;

  if not v_owns then
    return jsonb_build_object(
      'status', 'session_not_found',
      'charged', false,
      'quota_total', null,
      'quota_used', 0,
      'quota_remaining', null,
      'plan_ends_at', null,
      'ledger_id', null,
      'program_key', c_program_key
    );
  end if;

  -- ── 2) 이용권 행을 잠근다. serviceAccess.js와 같은 컬럼 우선순위
  --       (id → profile_id → user_id)로 정확히 1행만 잡는다((4-c) 참조).
  --
  --       ⚠ 원장 조회(단계 3)보다 **먼저** 잠근다. 순서를 뒤집으면 같은 세션에
  --         동시 요청 2건(주제 추천 더블클릭·재시도)에서 T2가 잠금을 기다리기
  --         전에 원장을 읽어 `v_ledger_id = null`을 얻고, T1 커밋 뒤 잠금을
  --         얻어 **갱신된** quota_used로 단계 7의 소진 판정을 평가한다. T1이
  --         마지막 회차를 썼다면 이미 차감이 끝난 자기 세션이 already_charged가
  --         아니라 quota_exhausted(→409)로 막힌다 — §9.3 「이미 차감된 세션은
  --         계속 진행 허용, 막는 것은 새 세션 시작뿐」 위반이다.
  --         잠금 하에서 읽어야 단계 5의 멱등 반환이 단계 7의 소진 판정보다
  --         반드시 먼저 성립한다.
  select pa.* into v_access
    from public.program_access pa
   where pa.program_key = c_program_key
     and (pa.id = p_profile_id or pa.profile_id = p_profile_id or pa.user_id = p_profile_id)
   order by
     -- 유효한 행을 먼저 잡는다((4-e)). 환불·정지·만료된 잔여 행이 살아 있고
     -- 새 결제 행이 따로 있으면, 우선순위가 뒤집혀 표시값과 차감 대상이 갈린다.
     -- `api/_lib/serviceAccess.js:findProgramAccessRow`의 statusRank와 같은 축이다.
     case
       when pa.access_status not in ('expired', 'suspended')
        and pa.payment_status not in ('refunded', 'cancelled')
        and (coalesce(pa.access_expires_at, pa.expires_at) is null
             or coalesce(pa.access_expires_at, pa.expires_at) > now())
       then 0
       else 1
     end,
     case
       when pa.id = p_profile_id then 0
       when pa.profile_id = p_profile_id then 1
       else 2
     end,
     coalesce(pa.updated_at, pa.created_at) desc nulls last
   limit 1
     for update;

  v_has_access := found;

  -- ── 3) 이미 차감된 세션인가 (멱등 판정). session_id UNIQUE 덕분에 원장 행
  --       존재 = 차감 완료다. "다른 주제 다시 추천"이 무차감인 것은 코드 규율이
  --       아니라 이 제약의 결과다(§9.3).
  select l.id into v_ledger_id
    from public.performance_credit_ledger l
   where l.session_id = p_session_id;

  if not v_has_access then
    -- 이용권 행이 없다. 이미 차감된 세션이라면(원장 행 존재) 진행은 계속
    -- 허용해야 한다 — 이미 값을 지불한 세션을 이용권 만료로 되막지 않는다는
    -- §9.3 정정("막는 것은 새 세션 시작뿐")과 같은 취지다.
    if v_ledger_id is not null then
      return jsonb_build_object(
        'status', 'already_charged',
        'charged', false,
        'quota_total', null,
        'quota_used', 0,
        'quota_remaining', null,
        'plan_ends_at', null,
        'ledger_id', v_ledger_id,
        'program_key', c_program_key
      );
    end if;

    return jsonb_build_object(
      'status', 'no_entitlement',
      'charged', false,
      'quota_total', null,
      'quota_used', 0,
      'quota_remaining', null,
      'plan_ends_at', null,
      'ledger_id', null,
      'program_key', c_program_key
    );
  end if;

  v_plan_ends_at := coalesce(v_access.access_expires_at, v_access.expires_at);

  -- ── 4) sentinel 해석. (4-a)의 반전 규칙을 그대로 따른다.
  --       **키 부재와 오염을 갈라 처리한다** — 원인이 다르고 안전한 폴백도 다르다.
  --
  --       ㄱ. 키 부재(meta에 quota_total이 없음) → null = 무제한.
  --           §9.4 결제 파이프라인(P15)이 아직 없어 meta를 채우는 주체가
  --           존재하지 않는 현재 상태를 "잠금"이 아니라 "무제한"으로 두는
  --           **의도적 임시 결정**이다. 회차를 부여할 방법이 없는 동안 전
  --           사용자를 막으면 서비스가 아예 열리지 않는다.
  --           ⚠ 이 폴백은 fail-open이다 — 지금 프로덕션에 올리면 이용권 보유자
  --             전원이 무제한이 되어 '3개월 6회' 상품이 무력화된다(외부 앱
  --             `call_limit: 0` = 무제한 결함과 같은 실패 형태, 방향만 반대).
  --             그래서 (ㄱ) 아래 `raise warning`으로 관측 가능하게 남기고,
  --             (ㄴ) (8)-ㄱ을 **배포 게이트**로 승격했다: P15 없이 프로덕션에
  --             올리지 않는다. P15가 붙으면 meta가 항상 채워지므로 키 부재는
  --             이상 상태가 되고, 이 분기는 fail-closed로 뒤집는다.
  --       ㄴ. 오염(키는 있는데 정수 문자열이 아님) → 0 = **소진**(fail-closed).
  --           meta는 자유 jsonb라 값이 무엇이든 들어올 수 있다. 직접
  --           `::integer` 캐스팅은 22P02로 함수를 터뜨려 정상 사용자의 주제
  --           추천까지 막으므로 정규식으로 거른다. 다만 거른 값을 키 부재와
  --           같게 취급하면 **데이터 손상이 조용히 무제한으로 승격된다** —
  --           손상은 "부여 경로가 없어서 비어 있음"과 원인이 다르므로 막고
  --           운영이 고치게 한다(원장은 건드리지 않으니 복구는 meta 수정뿐이다).
  v_quota_raw := v_access.meta ->> 'quota_total';

  if v_quota_raw is null then
    v_quota_total := null;
    raise warning 'consume_performance_credit: quota_total 미설정 → 무제한 폴백 (profile=%, program_access=%, P15 전 임시 동작)',
      p_profile_id, v_access.id;
  elsif v_quota_raw ~ '^-?[0-9]+$' then
    v_quota_total := v_quota_raw::integer;
  else
    v_quota_total := 0;   -- 오염 → 소진(fail-closed)
    raise warning 'consume_performance_credit: quota_total 오염(%) → 소진 처리 (profile=%, program_access=%)',
      v_quota_raw, p_profile_id, v_access.id;
  end if;

  v_quota_used := case
    when (v_access.meta ->> 'quota_used') ~ '^-?[0-9]+$'
      then (v_access.meta ->> 'quota_used')::integer
    else 0
  end;

  if v_quota_used < 0 then
    v_quota_used := 0;
  end if;
  if v_quota_total is not null and v_quota_total < 0 then
    v_quota_total := 0;   -- 음수 총량은 소진으로 읽는다((4-a) sentinel)
  end if;

  -- ── 5) 이미 차감된 세션이면 여기서 멱등 반환(이중 차감 없음).
  if v_ledger_id is not null then
    v_remaining := case when v_quota_total is null then null
                        else greatest(v_quota_total - v_quota_used, 0) end;

    return jsonb_build_object(
      'status', 'already_charged',
      'charged', false,
      'quota_total', v_quota_total,
      'quota_used', v_quota_used,
      'quota_remaining', v_remaining,
      'plan_ends_at', v_plan_ends_at,
      'ledger_id', v_ledger_id,
      'program_key', c_program_key
    );
  end if;

  -- ── 6) 이용권 자체가 아직 유효한가((4-e)). 단계 5보다 **뒤에** 둔다 —
  --       이미 차감이 끝난 세션은 만료·환불 뒤에도 계속 진행시킨다(§9.3 정정).
  --       여기서 막는 것은 "새 세션의 첫 차감"뿐이다.
  if v_access.access_status in ('expired', 'suspended')
     or v_access.payment_status in ('refunded', 'cancelled')
     or (v_plan_ends_at is not null and v_plan_ends_at <= now()) then
    return jsonb_build_object(
      'status', 'entitlement_expired',
      'charged', false,
      'quota_total', v_quota_total,
      'quota_used', v_quota_used,
      'quota_remaining', case when v_quota_total is null then null
                              else greatest(v_quota_total - v_quota_used, 0) end,
      'plan_ends_at', v_plan_ends_at,
      'ledger_id', null,
      'program_key', c_program_key
    );
  end if;

  -- ── 7) 소진 판정. quota_total is null → 무제한이라 이 분기를 타지 않는다.
  --       quota_total = 0 이면 quota_used(0) >= 0 이 참이라 즉시 소진이다
  --       — 외부 앱에서 무제한이던 값이 여기서는 소진이다((4-a)).
  if v_quota_total is not null and v_quota_used >= v_quota_total then
    return jsonb_build_object(
      'status', 'quota_exhausted',
      'charged', false,
      'quota_total', v_quota_total,
      'quota_used', v_quota_used,
      'quota_remaining', 0,
      'plan_ends_at', v_plan_ends_at,
      'ledger_id', null,
      'program_key', c_program_key
    );
  end if;

  -- ── 8) 차감 성립 = 원장 INSERT 성공. on conflict do nothing이 반환을 비우면
  --       같은 순간 다른 트랜잭션이 먼저 넣은 것이므로 이중 차감하지 않는다.
  insert into public.performance_credit_ledger (session_id, profile_id, delta, reason)
  values (p_session_id, p_profile_id, -1, coalesce(nullif(btrim(p_reason), ''), 'recommend-topics:first-success'))
  on conflict (session_id) do nothing
  returning id into v_ledger_id;

  if v_ledger_id is null then
    -- 경합 패배. 상대 트랜잭션이 quota_used를 올렸으므로 여기서는 올리지 않는다.
    -- (단계 2에서 먼저 잠그므로 같은 이용권 행을 잡은 두 요청은 여기까지 오지
    --  않고 단계 5에서 갈린다. 이 분기는 이용권 행이 서로 다른 예외 경로용
    --  2차 방어선이다.)
    select l.id into v_ledger_id
      from public.performance_credit_ledger l
     where l.session_id = p_session_id;

    -- 잠금 하에 다시 읽어 최신 사용량을 돌려준다.
    select pa.meta into v_access.meta
      from public.program_access pa
     where pa.program_key = v_access.program_key
       and pa.id = v_access.id;

    v_quota_used := case
      when (v_access.meta ->> 'quota_used') ~ '^-?[0-9]+$'
        then (v_access.meta ->> 'quota_used')::integer
      else v_quota_used
    end;
    v_remaining  := case when v_quota_total is null then null
                         else greatest(v_quota_total - v_quota_used, 0) end;

    return jsonb_build_object(
      'status', 'already_charged',
      'charged', false,
      'quota_total', v_quota_total,
      'quota_used', v_quota_used,
      'quota_remaining', v_remaining,
      'plan_ends_at', v_plan_ends_at,
      'ledger_id', v_ledger_id,
      'program_key', c_program_key
    );
  end if;

  -- ── 9) INSERT가 실제 성공한 경우에만 사용량을 올린다(§9.3 2항).
  --       무제한(quota_total is null)이어도 사용량은 기록한다 — 운영 통계와
  --       CS에 필요하고, 나중에 무제한을 회수해도 이력이 남는다.
  v_quota_used := v_quota_used + 1;

  update public.program_access pa
     set meta = jsonb_set(coalesce(pa.meta, '{}'::jsonb), '{quota_used}', to_jsonb(v_quota_used), true),
         updated_at = now()
   where pa.id = v_access.id
     and pa.program_key = v_access.program_key;

  v_remaining := case when v_quota_total is null then null
                      else greatest(v_quota_total - v_quota_used, 0) end;

  return jsonb_build_object(
    'status', 'charged',
    'charged', true,
    'quota_total', v_quota_total,
    'quota_used', v_quota_used,
    'quota_remaining', v_remaining,
    'plan_ends_at', v_plan_ends_at,
    'ledger_id', v_ledger_id,
    'program_key', c_program_key
  );
end;
$function$;

comment on function public.consume_performance_credit(uuid, uuid, text) is
    '수행평가 회차 멱등 차감(단일 트랜잭션). 차감 지점은 주제 추천 최초 성공 1곳뿐이며 performance_credit_ledger.session_id UNIQUE가 멱등 가드다. quota는 program_access.meta.{quota_total,quota_used}이고 sentinel은 키 부재=무제한(P15 전 임시) / 0·오염=소진(외부 앱의 0=무제한과 반전). 이용권 행은 잠근 뒤 환불·정지·기간 만료를 확인해 entitlement_expired로 가른다. 예외 대신 status jsonb를 반환한다 — 호출부가 409/403을 만든다.';

-- 이 함수는 **서버 전용**이다. 클라이언트가 직접 호출할 이유가 없고, 호출할 수
-- 있으면 자기 세션에 임의로 차감을 일으킬 수 있다(회차를 태우는 자해 + 원장
-- 오염). 함수 EXECUTE 기본값이 PUBLIC이므로 명시적으로 회수한다.
--
-- ⚠ 53번이 "revoke를 걸지 않는다"고 적은 것은 **테이블 권한** 이야기다
--   (테이블 권한은 RLS보다 먼저 평가돼 어드민 조회까지 막힌다). 여기서 회수하는
--   것은 **함수 EXECUTE**이고, 이 함수를 부르는 주체는 service_role 하나뿐이라
--   같은 함정이 아니다.
revoke all on function public.consume_performance_credit(uuid, uuid, text) from public;
revoke all on function public.consume_performance_credit(uuid, uuid, text) from anon;
revoke all on function public.consume_performance_credit(uuid, uuid, text) from authenticated;
grant execute on function public.consume_performance_credit(uuid, uuid, text) to service_role;


-- =====================================================================
-- (5) RPC ② match_student_performance_sessions — 학생 과거 수행 유사도 검색
-- =====================================================================
-- 외부 앱 `api/_lib/reports.js:162-238` `loadRelevantAssessmentReports`가 쓰던
-- `match_student_reports_all_subjects(query_embedding, filter_student_code text,
-- match_count, match_threshold)`의 재설계본이다.
--
-- 이식하는 것:
--   · threshold 기본값 **0.48**(외부 `matchThreshold = 0.48`, §12.3 튜닝값)
--   · match_count 기본값 8
--   · 반환 필드 구성 — 외부 프롬프트 렌더러
--     `formatRelevantAssessmentReportsForPrompt`(`reports.js:218-238`)가 실제로
--     읽는 것은 과목·주제·진로·내용요약뿐이다. 여기에 subject_group(교과군
--     분리 저장의 결과)과 정렬/표시용 created_at, similarity를 더한다.
--
-- 이식하지 않는 것:
--   · `filter_student_code text` — legacy 이름/코드 매칭 산물이라 동명이인
--     충돌이 나고 FK를 걸 수 없다(§8.2 결함 #4). `filter_profile_id uuid`로
--     대체하며 NOT NULL을 강제한다.
--   · 임베딩 단위를 리포트 4종 각각으로 두던 방식 — 상위 4건이 전부 같은
--     주제로 채워질 수 있었다. 여기서는 세션 1건 = 벡터 1개(PK가 session_id).
--
-- 53번 `match_winning_suhaeng_all_subjects`의 작성 스타일(`1 - (e <=> q)`
-- 유사도, `embedding is not null`, `order by e <=> q asc`,
-- `limit least(match_count, 20)`)을 그대로 따르되 **소유자 격리 3중 방어**를
-- 넣는다. 남의 리포트가 검색되면 안 된다:
--   ㄱ. `filter_profile_id is null` → 즉시 예외. 필터 누락이 전체 스캔이 되는
--       사고를 원천 차단한다(외부는 studentCode가 비면 조용히 전체 폴백으로
--       떨어졌다, `reports.js:196-210`).
--   ㄴ. `auth.uid()`가 있는데 인자와 다르면 → 예외. 학생 세션이 남의
--       profile_id를 넣어 탐침하는 것을 막는다(service_role은 auth.uid()가
--       null이라 이 검사를 통과한다).
--   ㄷ. where 절 `v.profile_id = filter_profile_id` + SECURITY INVOKER.
--       invoker라 authenticated 호출에는 (3)의 RLS 정책이 한 번 더 적용된다.
--
-- rag_use 필터는 `coalesce(rag_use, true)`가 아니라 **`= true`** 다.
-- 53번/00번의 지식베이스 테이블은 `rag_use boolean default true`(옵트아웃)라
-- coalesce 폴백이 옳았지만, 여기 컬럼은 `not null default false`(옵트인)이며
-- "평가 리포트 생성 또는 최종 제출 확정 시에만 true 승격"이 규정이다(§8.3).
-- coalesce(.., true)를 쓰면 그 규정이 무력화된다.

do $$
declare
  fn record;
begin
  for fn in
    select p.oid::regprocedure as sig
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public'
       and p.proname = 'match_student_performance_sessions'
  loop
    raise notice '54_performance_app: dropping %', fn.sig::text;
    execute format('drop function if exists %s', fn.sig);
  end loop;
end;
$$;

create or replace function public.match_student_performance_sessions(
    query_embedding vector,
    filter_profile_id uuid,
    match_count integer default 8,
    match_threshold double precision default 0.48
)
returns table(
    session_id uuid,
    grade_label text,
    subject_group text,
    subject text,
    career_goal text,
    topic_title text,
    summary_text text,
    created_at timestamp with time zone,
    similarity double precision
)
language plpgsql
stable
as $function$
begin
  -- (ㄱ) 필터 누락 = 전체 스캔 사고. 조용히 0행이 아니라 터뜨린다.
  if filter_profile_id is null then
    raise exception 'match_student_performance_sessions: filter_profile_id는 null일 수 없다(소유자 격리 필수).'
      using errcode = '22004';
  end if;

  -- (ㄴ) 인증된 호출자는 자기 자신만 조회할 수 있다.
  --      service_role 서버 호출은 auth.uid()가 null이라 통과한다.
  if auth.uid() is not null and auth.uid() <> filter_profile_id then
    raise exception 'match_student_performance_sessions: 다른 사용자의 수행 기록은 조회할 수 없다.'
      using errcode = '42501';
  end if;

  return query
  select
    v.session_id,
    v.grade_label,
    v.subject_group,
    v.subject,
    v.career_goal,
    v.topic_title,
    v.summary_text,
    v.created_at,
    1 - (v.embedding <=> query_embedding) as similarity
  from public.performance_session_vectors v
  where v.profile_id = filter_profile_id          -- (ㄷ) 소유자 격리
    and v.rag_use = true
    and v.embedding is not null
    and 1 - (v.embedding <=> query_embedding) >= match_threshold
  order by v.embedding <=> query_embedding asc
  limit least(coalesce(match_count, 8), 20);
end;
$function$;

comment on function public.match_student_performance_sessions(vector, uuid, integer, double precision) is
    '학생 과거 수행 리포트 유사도 검색(임베딩 단위 = 세션 1건). 외부 앱 match_student_reports_all_subjects의 재설계본 — text student_code 대신 uuid profile_id로 소유자를 격리한다. threshold 기본 0.48. SECURITY INVOKER + filter_profile_id NOT NULL + auth.uid() 일치 검사 3중 방어.';

revoke all on function public.match_student_performance_sessions(vector, uuid, integer, double precision) from public;
revoke all on function public.match_student_performance_sessions(vector, uuid, integer, double precision) from anon;
grant execute on function public.match_student_performance_sessions(vector, uuid, integer, double precision) to authenticated;
grant execute on function public.match_student_performance_sessions(vector, uuid, integer, double precision) to service_role;


-- =====================================================================
-- (6) Storage — performance-guides 버킷 (private)
-- =====================================================================
-- 52_mentor_applications.sql (4)의 "비공개 버킷" 패턴을 그대로 따른다.
-- 외부 앱 버킷 `assessment-images`(경로 `{main_id}/{session_id}/{purpose}/{uuid}{ext}`)는
-- 폐기하고 신규 버킷으로 만든다. `purpose` 세그먼트는 제거한다 — 외부
-- `api/storage-signed-upload-url.js:34-36`의 `'evaluation'` 분기는 프론트가
-- 절대 호출하지 않는 데드 분기다(명세서 §8.3).
--
-- 경로 규칙(명세서 §8.8 「버킷 / 경로」 행. 초판 §8.5가 개정 후 §8.8로 이동했다):
--
--     performance-guides/{profile_id}/{session_id}/{uuid}.{ext}
--
-- 첫 세그먼트가 소유자 uid라 `storage.foldername(name)[1]`만으로 소유권을
-- 판정할 수 있다. **경로는 서버가 조립**하며 클라이언트 입력을 반영하지 않는다
-- (§8.6 upload-url.js).
--
-- 안내문에는 학번·이름이 인쇄돼 있을 수 있으므로 public 버킷이면 경로만 알아도
-- 누구나 열람할 수 있게 된다 — 반드시 public = false를 유지한다.
insert into storage.buckets (id, name, public)
values ('performance-guides', 'performance-guides', false)
on conflict (id) do nothing;

update storage.buckets
set public = false
where id = 'performance-guides'
  and public is distinct from false;

-- file_size_limit / allowed_mime_types는 52번과 같은 이유로 **별도 문**으로
-- 분리한다 — 프로젝트 마이그레이션 버전에 따라 컬럼이 없을 수 있고(42703),
-- 실패해도 위 버킷 생성에는 영향이 없어야 한다.
--
--   file_size_limit: 10MB = 10 * 1024 * 1024 = 10485760 bytes
--     명세서 §8.8 「파일당/합계 최대 용량 10MB / 25MB — 서버 강제」.
--     합계 25MB는 세션 단위 누적이라 Storage 계층에서 표현할 수 없다 →
--     api/performance/upload-url.js가 performance_attachments.byte_size 합으로
--     강제한다(413 FILE_TOO_LARGE).
--   allowed_mime_types: PNG / JPG·JPEG / WEBP 만 허용(§8.8).
--     HEIC는 명시적 거부 대상이다 — 목록에 없으므로 Storage가 막고,
--     프론트도 accept를 `image/jpeg,image/png,image/webp`로 좁힌다.
update storage.buckets
set file_size_limit = 10485760,
    allowed_mime_types = array[
        'image/png',
        'image/jpeg',
        'image/webp'
    ]
where id = 'performance-guides';

-- ---------------------------------------------------------------------
-- storage.objects 정책
--   ⚠ storage.objects 정책 생성은 Supabase 프로젝트 권한 구성에 따라 SQL
--     Editor의 postgres 롤로 실패할 수 있다(42501). 그 경우 대시보드
--     Storage > Policies에서 아래와 **동일한 정의**로 수동 생성할 것
--     (31·52번이 같은 주의를 기록했다).
--
--   업로드는 서버가 발급한 signed upload URL로 이뤄지고(§8.6 upload-url.js)
--   그 토큰은 service_role이 만들므로 정책 없이도 통과한다. **그래서 소유자
--   insert/update 정책은 만들지 않는다** — 만들면 로그인만 한 계정(이용권
--   유무와 무관)이 supabase-js로 자기 uid 하위에 직접 업로드할 수 있게 되고,
--   그 경로에는 5장 상한·세션 합계 25MB·performance_attachments 행이 하나도
--   적용되지 않는다. 게다가 cleanup 잡은 그 테이블의 행만 순회하므로 DB 행
--   없는 객체는 90일 cron·24시간 스윕 어느 쪽에도 잡히지 않아 영구 잔존한다
--   (= 업로드 카드의 `90일 후 자동 삭제` 고지가 그 경로에서만 거짓이 된다).
--   `mentor-applications` 버킷도 같은 이유로 insert 정책이 없다(sql/52 (4)).
--   ⚠ 이 두 정책은 초판에 존재했다 — 이미 54번을 실행한 DB는
--     `sql/55_performance_guide_hardening.sql` (1)이 drop한다.
--
--   delete 정책은 만들지 않는다 — 원본 삭제는 90일 보관 cron과 분석 후
--   정리(둘 다 service_role)만 한다. 학생이 임의로 지우면
--   performance_attachments.deleted_at 기록과 실제 상태가 어긋난다.
-- ---------------------------------------------------------------------
drop policy if exists "performance guides owner read" on storage.objects;
create policy "performance guides owner read" on storage.objects
    for select to authenticated
    using (
      bucket_id = 'performance-guides'
      and (storage.foldername(name))[1] = auth.uid()::text
    );


-- =====================================================================
-- (7) 명세서와 다르게 구현한 지점 — 한눈에 보기
-- =====================================================================
--  ① `performance_sessions.career_goal`을 NOT NULL 대신 status 조건부 CHECK로
--     낮췄다. §8.3은 NOT NULL이지만 §8.6이 basicInfo 없는 세션 생성을 허용해
--     draft 세션이 23502로 막히기 때문이다. draft가 아닌 상태에서는 여전히
--     필수라 원래 의도(프롬프트에 빈 진로가 들어가지 않게)는 보존된다.
--  ② `consume_performance_credit`이 QUOTA_EXHAUSTED / NO_ENTITLEMENT를
--     **raise하지 않고 status jsonb로 반환**한다. 사유는 (4-d) 3가지
--     (planEndsAt 동반 불가 / 에러 문자열 파싱 의존 / 트랜잭션 abort 전파).
--     fail-closed 요건은 그대로 지켜진다.
--  ③ RLS가 명세서 문언(전 테이블 select/insert/update)보다 좁다. §8.6 실측상
--     클라이언트 직접 write 경로가 0건이므로 **8테이블 전부 SELECT만** 연다.
--     사유는 (3-a) — RLS는 행 단위라 서버 소유 컬럼(guide_json·submission_schema
--     ·status)을 가릴 수 없고, 소유자 INSERT는 미차감 세션 1개 제한을 우회시킨다.
--  ④ `performance_credit_ledger`의 보정 행(+1) 상정과 session_id UNIQUE가
--     충돌한다. UNIQUE(이중 차감 불가)를 우선하고, CS 보정은 기존 행 delta
--     update 또는 program_access.meta 직접 조정으로 한다(1-7 주석).
--  ⑤ RPC ②의 rag_use 필터가 `coalesce(rag_use, true)`가 아니라 `= true`다.
--     이 컬럼은 옵트인(default false)이라 coalesce 폴백을 쓰면 "평가/최종
--     확정 시에만 승격" 규정이 무력화된다. (5) 주석 참조.
--  ⑥ `performance_session_vectors`에 명세서 컬럼 표에 없던 `created_at` /
--     `updated_at`을 추가했다. §8.3이 제안한 RPC 반환 필드에 `created_at`이
--     있는데 컬럼 표에는 없어 그대로는 만들 수 없다.
--  ⑦ `consume_performance_credit`이 명세서에 없는 `entitlement_expired`
--     status를 추가로 반환한다. §9.3은 "program_access 행 없음 →
--     NO_ENTITLEMENT"만 규정하지만, 환불·정지·기간 만료된 행을 유효한 행과 같게
--     다루면 §2.2가 외부 앱의 결함으로 지목한 "만료·환불 뒤에도 호출이 계속되는"
--     동작이 그대로 재현된다. 사유는 (4-e).
--  ⑧ 어드민 RLS 정책을 만들지 않았다. 사유는 (3-b) — performance_* 를 직접
--     조회하는 어드민 화면이 아직 없고 서버 경로는 service_role이라 RLS를
--     우회한다. 화면이 생기면 `is_admin()` 기준 SELECT 정책을 추가한다.
--
-- ---------------------------------------------------------------------
-- (8) 이 파일이 **해결하지 않는** 선행 공백 (배포 전 확인)
-- ---------------------------------------------------------------------
--  ㄱ. 🚧 **배포 게이트 — P15 없이 프로덕션에 올리지 않는다.**
--      결제 → 회차 부여 경로가 아직 없다(명세서 §9.4 BLOCK).
--      `api/confirm-payment.js`에 `program_access` 문자열이 0건이라 meta에
--      quota_total을 넣는 주체가 존재하지 않는다. 그래서 (4)의 sentinel 폴백을
--      "키 없음 = 무제한"으로 두었다 — 그러지 않으면 회차를 받을 방법이 없는
--      상태에서 전 사용자가 즉시 소진 판정을 받는다.
--      **이 폴백은 fail-open이다.** 이 상태로 배포하면 이용권 보유자 전원이
--      무제한이 되어 '3개월 6회' 상품이 조용히 무력화된다(에러 0건, 과금만
--      사라진다 — 외부 앱 `call_limit:0`=무제한 결함과 같은 실패 형태).
--      · 관측: 폴백을 탈 때마다 `raise warning`이 남는다(단계 4). 배포 전
--        `log_min_messages`가 warning 이상인지 확인하고, 이 경고가 나오면
--        회차 부여가 아직 안 붙은 것이다.
--      · 릴리스 체크리스트: P15(products ALTER + confirm-payment 회차 부여)
--        완료 → 기존 이용자 meta 백필 → 그 다음에야 이 폴백을 fail-closed로
--        뒤집고(키 부재 = 소진) 프로덕션 배포. 순서를 바꾸지 않는다.
--      · 오염 값(정수 문자열이 아님)은 이미 fail-closed다 — 키 부재와 원인이
--        달라 무제한으로 승격시키지 않는다((4) 단계 4-ㄴ).
--  ㄴ. **admin_enrollments 경로 이용자는 회차가 없다.**
--      `api/_lib/serviceAccess.js:hasPaidServiceAccess`는 program_access가
--      없어도 admin_enrollments의 결제 상태로 접근을 허용한다. 그런 이용자는
--      program_access 행이 없어 이 RPC가 `no_entitlement`를 돌려준다.
--      명세서 §9.3이 "program_access 행 없음 → NO_ENTITLEMENT"로 못박고
--      §9.4가 부여 경로를 결제·어드민 2가지로 제한하므로 명세를 따랐으나,
--      **기존 enrollment 이용자가 있다면 P15에서 program_access 백필이 필요**하다.
--  ㄷ. **미차감 세션 동시 1개 제한**(§9.3 무료 vision 게이트 차단)은 여기서
--      강제하지 않는다. "원장 행이 없는 세션"은 두 테이블에 걸친 조건이라
--      단일 부분 UNIQUE 인덱스로 표현할 수 없다.
--      → `api/performance/session.js`가 create 시 검사해
--        `409 UNCHARGED_SESSION_EXISTS { sessionId }`를 낸다.
--  ㄹ. 90일 보관 cron(`api/performance/cleanup-attachments.js` + vercel.json
--      `crons`)은 아직 없다. 인덱스만 미리 깔아 두었다((2) 절).
--  ㅁ. **stale program_access 행 + 진입 게이트의 판정 공백** (P15 착수 전 확인).
--      이 RPC는 (4-e)대로 환불·정지·기간 만료를 걸러내지만, 진입 게이트
--      `api/_lib/serviceAccess.js:checkProgramAccessTable`은 그렇지 않다.
--      · 게이트는 `access_expires_at`/`expires_at`을 **아예 보지 않는다** —
--        기간 만료 판정은 지금 이 RPC 한 곳에만 있다. 만료 배치도 없다(§11-Q56).
--      · 게이트의 `isPaidStatus`/`isActiveStatus`는 부분 문자열 매칭이라
--        `'unpaid'`(`.includes('paid')`)와 `'inactive'`(`.includes('active')`)를
--        통과시킨다. 그래서 (4-e)를 허용 목록으로 조이지 않고 거부 목록으로 뒀다.
--      · 게이트는 program_access가 실패해도 `admin_enrollments`로 통과시키므로,
--        환불된 옛 행(meta={quota_total:3, quota_used:3})이 남은 채 어드민
--        경로로 재결제한 사용자는 셸에서 "소진"을 보고 차감에서 막힌다.
--        지금은 meta를 채우는 주체가 없어(위 ㄱ) 드러나지 않지만 P15와 동시에
--        표면화된다 → P15에서 두 계층을 함께 조이고 stale 행을 정리한다.
-- =====================================================================


-- =====================================================================
-- 검증용 SELECT (실행 후 수동 확인용 — 주석 해제하고 실행)
-- =====================================================================
-- -- 8테이블 생성 확인 (8행이어야 정상)
-- select table_name from information_schema.tables
--  where table_schema = 'public' and table_name like 'performance\_%' order by 1;
--
-- -- RLS 전부 켜짐 확인 (rowsecurity = true 8행)
-- select relname, relrowsecurity from pg_class
--  where relnamespace = 'public'::regnamespace and relname like 'performance\_%' order by 1;
--
-- -- 정책 목록 — 8테이블 × SELECT 1개 = 총 8행이어야 정상(write 정책 0건, (3-a))
-- select tablename, policyname, cmd from pg_policies
--  where schemaname = 'public' and tablename like 'performance\_%' order by 1, 3, 2;
--
-- -- school_type에 기본값이 없어야 정상(column_default = null)
-- select column_name, column_default, is_nullable from information_schema.columns
--  where table_schema = 'public' and table_name = 'performance_sessions'
--    and column_name in ('school_type', 'career_goal', 'grade_label', 'semester');
--
-- -- 회차 멱등 가드 확인 (UNIQUE(session_id) 1건)
-- select conname, pg_get_constraintdef(oid) from pg_constraint
--  where conrelid = 'public.performance_credit_ledger'::regclass and contype = 'u';
--
-- -- 함수 2종 + 헬퍼 확인
-- select p.oid::regprocedure, p.prosecdef as security_definer
--   from pg_proc p join pg_namespace n on n.oid = p.pronamespace
--  where n.nspname = 'public'
--    and p.proname in ('consume_performance_credit', 'match_student_performance_sessions', 'performance_owns_session');
--
-- -- consume_performance_credit이 service_role 전용인지 확인
-- select proacl from pg_proc where proname = 'consume_performance_credit';
--
-- -- 버킷 확인 (public = false, 10485760, PNG/JPEG/WEBP)
-- select id, public, file_size_limit, allowed_mime_types from storage.buckets where id = 'performance-guides';
--
-- -- storage 정책 3건 확인
-- select policyname, cmd from pg_policies
--  where schemaname = 'storage' and tablename = 'objects' and policyname like 'performance guides%';
