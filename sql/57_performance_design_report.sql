-- =====================================================================
-- 57. 수행평가 설계 리포트 — 주제 확정 + 리포트 생성을 한 트랜잭션으로 묶는 층
--
--   실행 순서: 54_performance_app.sql 이후(55·56과는 독립이나 번호 순으로 실행).
--   이 파일 단독으로도 idempotent다(`add column if not exists` /
--   `create unique index if not exists` / `create or replace function`).
--
--   대상 4건
--     (1) performance_reports.topic_id / updated_at 추가
--     (2) 세션당 design 리포트 1행을 강제하는 부분 UNIQUE 인덱스
--     (3) performance_sessions.design_generation_count / design_attempt_count 추가
--     (4) RPC commit_performance_design_report — 주제 확정 + 리포트 저장 단일 트랜잭션
--
--   ⚠ 배포 선행 실행 필수
--     `api/performance/design-report.js`가 (3)의 두 컬럼을 select 목록에 넣고
--     (4)의 RPC를 호출한다. 이 파일 없이 새 코드가 뜨면
--       · 컬럼 부재  → PostgREST 42703으로 라우트 전체가 죽고,
--       · 함수 부재  → 모델을 다 부른 뒤 마지막 커밋에서 42883으로 터진다
--         (사용자는 로딩만 오래 보고 500을 받는다).
--     55번 `guide_analysis_count`·56번 `topic_attempt_count`와 같은 선행 조건이다.
-- =====================================================================


-- ---------------------------------------------------------------------
-- (1) performance_reports — topic_id / updated_at
--
--   topic_id
--     설계 리포트는 "어느 주제로 만든 것인가"가 곧 그 리포트의 정체성이다.
--     세션의 `selected_topic_id`만으로도 유도할 수는 있지만, 그건 **세션의 현재
--     상태**이고 리포트 행이 만들어진 시점의 주제와 같다는 보장이 스키마에 없다.
--     재생성(아래 (4))이 두 값을 항상 같이 쓰므로 어긋날 일이 없게 하려면 리포트
--     쪽에도 못을 박아 두는 편이 낫다 — 나중에 "이 리포트는 어느 주제 것인가"를
--     조인 한 번으로 답할 수 있고, 주제 행이 지워지면 함께 정리된다.
--
--     `evaluation`/`final_submission` 리포트는 이 값이 null이다(주제 단위가 아니다).
--     그래서 NOT NULL을 걸지 않는다.
--
--   updated_at
--     설계 리포트는 세션당 1행을 **덮어쓰며** 재생성한다((2) 참조). created_at만
--     있으면 재생성이 흔적을 남기지 않아 "언제 만든 리포트를 보고 있는지"를 아무도
--     모른다. 트리거는 걸지 않는다 — performance_* 테이블에 write하는 주체가
--     service_role 서버리스뿐이라 갱신 지점이 (4)의 RPC 하나이고, 거기서 명시적으로
--     찍는 편이 "어디서 바뀌는지"가 코드에 보인다.
-- ---------------------------------------------------------------------
alter table public."performance_reports"
    add column if not exists topic_id uuid;

alter table public."performance_reports"
    add column if not exists updated_at timestamp with time zone default now() not null;

alter table public."performance_reports" drop constraint if exists performance_reports_topic_id_fkey;
alter table public."performance_reports"
    add constraint performance_reports_topic_id_fkey
    foreign key (topic_id) references public.performance_topics(id) on delete set null;

comment on column public."performance_reports".topic_id is
    '설계 리포트가 만들어진 대상 주제(performance_topics). evaluation/final_submission은 null. 주제 행이 지워져도 리포트는 남기므로 on delete set null이다.';
comment on column public."performance_reports".updated_at is
    '마지막 갱신 시각. 설계 리포트는 세션당 1행을 덮어쓰며 재생성하므로(부분 UNIQUE) created_at만으로는 재생성 시점을 알 수 없다.';


-- ---------------------------------------------------------------------
-- (2) 세션당 design 리포트는 1행 — 부분 UNIQUE 인덱스
--
--   왜 1행인가
--     §8.6이 저장 리포트 조회를 위해 규정한 집계 뷰
--     `v_performance_saved_reports(..., design_report_id, evaluation_report_id,
--     final_report_id)`가 **세션당 리포트 id를 종류별로 하나씩** 들고 있다. 즉
--     "세션 1건 = 설계 리포트 1건"이 이미 조회 계약이다. 재생성(§9.3 「설계 리포트
--     생성·재생성 | 없음 (재생성 상한 2회)」)을 새 행 추가로 구현하면 그 뷰가
--     어느 행을 골라야 하는지 정의되지 않고, 프론트는 "가장 최근 것"을 추측해야 한다.
--
--   그래서 재생성은 **같은 행을 덮어쓴다.** 이 인덱스가 그 upsert의 충돌 대상이며
--   (아래 (4)의 `on conflict (session_id) where report_type = 'design'`),
--   동시 요청 2건이 같은 세션에 두 행을 만드는 것도 함께 막는다.
--   `performance_submissions_one_final_per_session_idx`(54번 1-6)와 같은 수법이다 —
--   부분 UNIQUE는 테이블 제약으로 표현할 수 없어 인덱스로 만든다.
--
--   ⚠ 이미 세션당 design 행이 2개 이상인 DB에서는 이 인덱스 생성이 실패한다.
--     `api/performance/design-report.js`가 이 파일과 함께 처음 들어오는 신규 기능이라
--     그런 행은 존재할 수 없지만, 실패하면 중복을 먼저 정리해야 한다는 뜻이다.
-- ---------------------------------------------------------------------
create unique index if not exists performance_reports_one_design_per_session_idx
    on public."performance_reports" using btree (session_id)
    where (report_type = 'design');


-- ---------------------------------------------------------------------
-- (3) performance_sessions — 설계 리포트 생성 횟수 2축
--
--   56번이 주제 추천에서 확립한 것과 **같은 2축 분리**다. 한 축으로 합치면 둘 중
--   하나가 반드시 깨진다:
--
--     · design_generation_count = **성공한** 생성 수. 사용자에게 보이는 상한이며
--       §9.3 「설계 리포트 생성·재생성 | 없음 (재생성 상한 2회)」 / §8.6
--       `429 RATE_LIMITED{limit:2}`가 이 값을 센다. 최초 1회 + 재생성 2회 = 3.
--       (§9.2 단가 근거의 `3(설계)`와 같은 셈법이다 — 56번이 `MAX_ROUNDS=3`을
--        같은 근거로 정했다.)
--
--     · design_attempt_count = **실제 모델 호출 시도** 수(성공·실패 모두).
--       구조 실패(422 `MODEL_CONTRACT_VIOLATION` / 503 `MODEL_UNAVAILABLE`)는
--       무차감이고 리포트 행도 남기지 않으므로 위 생성 카운터가 오르지 않는다.
--       즉 실패만 반복하는 경로에 상한이 없고, 1회당 임베딩 2회 + 최대 6회
--       (과부하 재시도 3 × 구조 재시도 2)의 Gemini 생성 호출이 나간다.
--       55번 `guide_analysis_count`·56번 `topic_attempt_count`와 완전히 같은 구멍이다.
--
--   **차감을 늘려 막지 않는다**(§9.2 「과금과 남용 방지를 분리한다」). 설계 리포트는
--   애초에 무차감 단계라(§9.3) 회차는 억제 수단이 될 수도 없다.
--
--   갱신 주체·시점
--     서버(service_role)만 갱신한다 — performance_* 8테이블 전부 클라이언트 write
--     정책이 없다(54번 (2)).
--       · attempt  : **모델을 실제로 부르기 직전**에 +1(실패도 세야 상한이 의미를 갖는다).
--       · generation: (4)의 RPC 안에서, 리포트 저장과 **같은 트랜잭션**으로 +1.
--     저장분을 그대로 돌려주는 멱등 재생(replay)은 모델을 부르지 않으므로 둘 다 올리지 않는다.
-- ---------------------------------------------------------------------
alter table public."performance_sessions"
    add column if not exists design_generation_count integer default 0 not null;

alter table public."performance_sessions"
    add column if not exists design_attempt_count integer default 0 not null;

comment on column public."performance_sessions".design_generation_count is
    '설계 리포트를 실제로 생성·재생성한 누적 횟수(성공만). 상한 3(최초 1 + 재생성 2, §9.3) 초과 시 429 RATE_LIMITED. commit_performance_design_report가 리포트 저장과 같은 트랜잭션에서 올린다.';
comment on column public."performance_sessions".design_attempt_count is
    '설계 리포트(api/performance/design-report.js)가 실제로 모델을 호출한 누적 시도 횟수(성공·실패 모두 포함). 구조 실패는 무차감 + 리포트 무기록이라 생성 상한이 오르지 않으므로, 남용 상한을 이 값으로 따로 건다(§9.2 — 회차를 더 깎아 막지 않는다). 멱등 재생은 올리지 않는다.';


-- ---------------------------------------------------------------------
-- (4) RPC commit_performance_design_report — 주제 확정 + 리포트 저장 단일 트랜잭션
--
--   왜 RPC인가 (이 파일의 핵심)
--     §8.6이 이 엔드포인트를 「주제 확정 + 리포트 생성을 **한 트랜잭션**으로(외부는
--     2회 왕복이고 앞이 실패해도 뒤가 진행됨)」로 규정한다. 외부 앱은
--       ① `POST /api/save-topic-selection`  (주제 확정)
--       ② `POST /api/find-resources`        (리포트 생성)
--     2회 왕복이었고, 프론트가 ①의 실패를 무시하고 ②를 불렀다. 그래서
--     "주제는 확정 안 됐는데 리포트만 있는" 세션과 그 반대가 둘 다 생겼다.
--
--     supabase-js에는 다중 문장 트랜잭션이 없다. 핸들러에서 update 3번을 순서대로
--     쏘면 그 사이 어디서 죽어도 반쪽 상태가 남는다. 그래서 커밋 구간 전체를
--     **plpgsql 함수 하나**로 내린다 — 함수 본문은 단일 트랜잭션이므로 아래 4개
--     write가 전부 성립하거나 전부 없던 일이 된다.
--       ㄱ) performance_topics.selected 재설정(선택 1건)
--       ㄴ) performance_sessions.selected_topic_id / 진행 단계 / 생성 카운터
--       ㄷ) performance_reports upsert(세션당 design 1행)
--     핸들러가 이 함수 **밖에서** 하는 write는 design_attempt_count +1 하나뿐이고,
--     그건 사용자에게 보이는 상태가 아니라 남용 카운터라 반쪽으로 남아도 의미가 있다
--     (모델을 부른 것은 사실이다).
--
--   security definer
--     `consume_performance_credit`과 같은 이유다 — RLS를 우회하므로 소유권을
--     **함수 안에서 직접** 확인한다. 존재하지 않는 세션과 남의 세션을 같은 결과로
--     묶어 id 존재 여부가 새지 않게 하는 것도 같다.
--
--   raise가 아니라 status jsonb를 돌려준다
--     54번 (7)이 정한 관례다. PostgREST가 예외를 500으로 바꿔 버려 호출부가 원인별로
--     갈라 처리할 수 없기 때문이다.
--       'committed'            → 200
--       'session_not_found'    → 403 NOT_SESSION_OWNER
--       'topic_not_in_session' → 404 TOPIC_NOT_IN_SESSION
--
--   ⚠ 이 함수는 **회차를 건드리지 않는다.** 설계 리포트는 무차감이고(§9.3 「설계
--     리포트 생성·재생성 | 없음」) 차감 지점은 `recommend-topics` 최초 성공 1곳뿐이다.
--     `performance_credit_ledger`도 `program_access.meta`도 여기서 읽지도 쓰지도
--     않는다 — 이중 차감이 불가능한 첫 번째 이유가 "차감 코드가 아예 없다"이다.
-- ---------------------------------------------------------------------

-- 시그니처가 바뀔 수 있으므로 같은 이름의 모든 오버로드를 oid로 훑어 drop한다
-- (54번 (3-a)와 같은 방어 — 오버로드가 공존하면 PostgREST가 42725 function is not
--  unique로 깨진다).
do $$
declare
  fn record;
begin
  for fn in
    select p.oid::regprocedure as sig
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public'
       and p.proname = 'commit_performance_design_report'
  loop
    raise notice '57_performance_design_report: dropping %', fn.sig::text;
    execute format('drop function if exists %s', fn.sig);
  end loop;
end;
$$;

create or replace function public.commit_performance_design_report(
    p_session_id uuid,
    p_profile_id uuid,
    p_topic_id uuid,
    p_sections jsonb,
    p_model text default null,
    p_prompt_version text default null
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_owns       boolean;
  v_topic_ok   boolean;
  v_report_id  uuid;
  v_generation integer;
begin
  -- ── 1) 세션 존재 + 소유권. SECURITY DEFINER라 RLS가 적용되지 않으므로 여기서
  --       직접 확인한다. 없는 세션과 남의 세션을 같은 결과로 묶는다.
  select exists (
    select 1
      from public.performance_sessions s
     where s.id = p_session_id
       and s.profile_id = p_profile_id
  ) into v_owns;

  if not v_owns then
    return jsonb_build_object(
      'status', 'session_not_found',
      'report_id', null,
      'topic_id', null,
      'generation_count', 0
    );
  end if;

  -- ── 2) 주제가 **이 세션의 것**인가(§8.6 `404 TOPIC_NOT_IN_SESSION`).
  --       핸들러도 같은 검사를 하지만 여기서 한 번 더 한다 — 이 함수는 RLS 밖에서
  --       도는 write 진입점이라 호출부의 선행 검사를 신뢰 근거로 삼지 않는다.
  select exists (
    select 1
      from public.performance_topics t
     where t.id = p_topic_id
       and t.session_id = p_session_id
  ) into v_topic_ok;

  if not v_topic_ok then
    return jsonb_build_object(
      'status', 'topic_not_in_session',
      'report_id', null,
      'topic_id', null,
      'generation_count', 0
    );
  end if;

  -- ── 3) 주제 확정. **세션 전체를 한 문장으로 다시 칠한다** —
  --       `set selected = (id = p_topic_id)`라 선택된 1건이 true, 나머지는 전부
  --       false가 된다. "이전 선택을 false로 지우는 update"를 따로 두면 두 문장
  --       사이에서 죽었을 때 선택이 2건인 세션이 생긴다.
  update public.performance_topics t
     set selected = (t.id = p_topic_id)
   where t.session_id = p_session_id;

  -- ── 4) 세션 진행 상태 + 생성 카운터.
  --
  --       completed_steps에 **3을 넣는다**: STEP3(주제 추천)이 끝나는 시점은 추천을
  --       받은 순간이 아니라 사용자가 주제를 확정하는 순간이다(§5.11, §3.3 활성 스텝
  --       표). `recommend-topics.js:stepPatch` 주석이 "그 확정은 design-report(P10)가
  --       기록한다"고 예고해 둔 바로 그 지점이다.
  --
  --       **4은 넣지 않는다.** STEP4(설계 리포트)는 리포트가 만들어진 순간이 아니라
  --       사용자가 리포트를 닫고 작성 단계로 넘어가는 순간에 끝난다(§5.13 푸터
  --       `창 닫고 작성하기`). current_step만 4로 올려 진행 표시를 옮긴다.
  --
  --       진행은 되돌리지 않는다(greatest) — 재생성이 이미 STEP5까지 간 세션을
  --       4로 끌어내리면 안 된다.
  update public.performance_sessions s
     set selected_topic_id = p_topic_id,
         status = case when s.status = 'draft' then 'in_progress' else s.status end,
         current_step = greatest(coalesce(s.current_step, 1), 4),
         completed_steps = (
           select coalesce(array_agg(distinct e order by e), '{}'::smallint[])
             from unnest(coalesce(s.completed_steps, '{}'::smallint[]) || array[3]::smallint[]) as e
         ),
         design_generation_count = coalesce(s.design_generation_count, 0) + 1,
         updated_at = now()
   where s.id = p_session_id
  returning s.design_generation_count into v_generation;

  -- ── 5) 리포트 upsert. 충돌 대상은 (2)의 부분 UNIQUE 인덱스다 —
  --       재생성은 **같은 행을 덮어쓴다**(새 행을 쌓지 않는다). 그래서
  --         · 응답의 `reportId`가 재생성 전후로 같고,
  --         · 세션당 design 행이 1개라는 조회 계약(§8.6 v_performance_saved_reports)이
  --           스키마로 보장되며,
  --         · 동시 요청 2건이 두 행을 만들 수 없다.
  --       created_at은 갱신하지 않는다(최초 생성 시각을 잃지 않는다).
  insert into public.performance_reports
      (session_id, topic_id, report_type, sections, model, prompt_version)
  values
      (p_session_id, p_topic_id, 'design', p_sections, p_model, p_prompt_version)
  on conflict (session_id) where (report_type = 'design')
  do update
     set topic_id       = excluded.topic_id,
         sections       = excluded.sections,
         model          = excluded.model,
         prompt_version = excluded.prompt_version,
         updated_at     = now()
  returning id into v_report_id;

  return jsonb_build_object(
    'status', 'committed',
    'report_id', v_report_id,
    'topic_id', p_topic_id,
    'generation_count', v_generation
  );
end;
$function$;

comment on function public.commit_performance_design_report(uuid, uuid, uuid, jsonb, text, text) is
    '설계 리포트 커밋 단일 트랜잭션 — 주제 확정(topics.selected + sessions.selected_topic_id) + 진행 단계 + 생성 카운터 + 리포트 upsert를 전부 성립시키거나 전부 없던 일로 만든다. 회차는 건드리지 않는다(설계 리포트는 무차감, §9.3).';

-- EXECUTE는 회수하고 service_role에만 부여한다. 이 함수는 RLS를 우회하는 write
-- 진입점이라 authenticated가 직접 부를 수 있으면 소유권 검사만 통과하는 임의 세션에
-- 임의 sections를 밀어 넣을 수 있다(리포트 위조). 호출은 서버리스 핸들러 경유만이다.
-- (53번의 "revoke 금지"는 **테이블** 권한 이야기이고 함수 EXECUTE는 별개다 —
--  54번 `consume_performance_credit`과 같은 처리.)
revoke all on function public.commit_performance_design_report(uuid, uuid, uuid, jsonb, text, text) from public;
revoke all on function public.commit_performance_design_report(uuid, uuid, uuid, jsonb, text, text) from anon;
revoke all on function public.commit_performance_design_report(uuid, uuid, uuid, jsonb, text, text) from authenticated;
grant execute on function public.commit_performance_design_report(uuid, uuid, uuid, jsonb, text, text) to service_role;
