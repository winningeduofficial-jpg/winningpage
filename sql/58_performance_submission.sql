-- =====================================================================
-- 58. 수행평가 제출·평가·확정 (로드맵 P11 STEP5) — 제출물 커밋 층
--
--   실행 순서: 54_performance_app.sql 이후, 57_performance_design_report.sql 이후
--   (57이 만든 `performance_reports.updated_at`을 이 파일의 RPC 2개가 갱신한다).
--   이 파일 단독으로도 idempotent다(`add column if not exists` /
--   `create unique index if not exists` / `create or replace function`).
--
--   대상 5건
--     (1) performance_reports.submission_id 추가
--     (2) 세션당 evaluation / final_submission 리포트 1행을 강제하는 부분 UNIQUE 2개
--     (3) performance_sessions.evaluation_count / evaluation_attempt_count 추가
--     (4) RPC commit_performance_evaluation_report — 제출 확정 + 평가 리포트 저장 단일 트랜잭션
--     (5) RPC finalize_performance_submission   — 최종본 고정 + 최종 리포트 저장 단일 트랜잭션
--
--   ⚠ 배포 선행 실행 필수
--     `api/performance/evaluate.js` / `api/performance/finalize.js`가 (3)의 두 컬럼을
--     select 목록에 넣고 (4)·(5)의 RPC를 호출한다. 이 파일 없이 새 코드가 뜨면
--       · 컬럼 부재  → PostgREST 42703으로 두 라우트 전체가 죽고,
--       · 함수 부재  → 모델을 다 부른 뒤 마지막 커밋에서 42883으로 터진다
--         (사용자는 로딩만 오래 보고 500을 받는다).
--     55번 `guide_analysis_count` / 56번 `topic_attempt_count` / 57번
--     `design_generation_count`와 같은 선행 조건이다.
--
--   ⚠ 이 파일은 **회차를 건드리지 않는다.** §9.3 표에서 「제출 → 평가 리포트 생성 |
--     없음」, 「`추가 평가 받기` | 없음(상한 2회)」이고 차감 지점은 `recommend-topics`
--     최초 성공 1곳뿐이다. 외부 앱의 `api/evaluate-text.js:51` 선차감은 §12.4 폐기
--     대상이다. `performance_credit_ledger`도 `program_access.meta`도 여기서 읽지도
--     쓰지도 않는다.
-- =====================================================================


-- ---------------------------------------------------------------------
-- (1) performance_reports.submission_id — 평가·최종 리포트가 어느 제출본의 것인가
--
--   57번이 설계 리포트에 `topic_id`를 붙인 것과 같은 이유다. 평가 리포트의 정체성은
--   "어느 제출본을 채점한 결과인가"이고, 그것을 세션 상태(`performance_submissions`
--   최신 행)로 유도하면 **재제출 직후 화면이 이전 평가 리포트를 새 제출본의 결과로
--   보여준다.** 리포트 행에 못을 박아 두면
--     · 멱등 재생(replay) 판정이 정확해진다 — `submission_id`가 같으면 저장분을
--       그대로 돌려주고 모델을 부르지 않는다(`api/performance/evaluate.js`),
--     · `finalize`가 "이 제출본은 평가를 받았는가"를 조인 없이 답할 수 있다
--       (§8.6 `400 NO_EVALUATION_YET`).
--
--   `design` 리포트는 이 값이 null이다(제출본 단위가 아니다). 그래서 NOT NULL을
--   걸지 않는다. 제출 행이 지워지면(세션 cascade가 아닌 개별 삭제) 리포트는 스냅샷
--   이므로 남기고 포인터만 끊는다 — 57번 `topic_id`와 같은 `on delete set null`.
-- ---------------------------------------------------------------------
alter table public."performance_reports"
    add column if not exists submission_id uuid;

alter table public."performance_reports" drop constraint if exists performance_reports_submission_id_fkey;
alter table public."performance_reports"
    add constraint performance_reports_submission_id_fkey
    foreign key (submission_id) references public.performance_submissions(id) on delete set null;

comment on column public."performance_reports".submission_id is
    '평가/최종 리포트가 대상으로 삼은 제출본(performance_submissions). design은 null. 제출 행이 지워져도 리포트는 스냅샷으로 남기므로 on delete set null이다.';


-- ---------------------------------------------------------------------
-- (2) 세션당 evaluation / final_submission 리포트도 1행 — 부분 UNIQUE 2개
--
--   57번 (2)가 `design`에 건 것과 **완전히 같은 근거**다. §8.6이 저장 리포트 조회용
--   으로 규정한 집계 뷰
--     v_performance_saved_reports(..., design_report_id, evaluation_report_id,
--                                      final_report_id)
--   가 세션당 리포트 id를 **종류별로 하나씩** 들고 있다. 즉 "세션 1건 = 종류별 리포트
--   1건"이 이미 조회 계약이고, 재평가를 새 행 추가로 구현하면 그 뷰가 어느 행을 골라야
--   하는지 정의되지 않는다(외부 앱이 정확히 그 상태였다 — `assessment_reports`에
--   같은 세션의 평가 리포트가 재평가 횟수만큼 쌓이고 프론트가 "첫 등장 선점"으로
--   골랐다, §12.2 「`byType[type]` 첫 등장 선점은 버그」).
--
--   그래서 **재평가는 같은 행을 덮어쓴다.** 이 인덱스가 아래 (4)·(5) upsert의 충돌
--   대상이며, 동시 요청 2건이 같은 세션에 두 행을 만드는 것도 함께 막는다.
--
--   ⚠ 덮어쓰기의 대가: 이전 평가 리포트 본문은 남지 않는다. §8.6 저장 리포트 계약이
--     세션당 1건이므로 의도된 것이며, 이력이 필요해지면 뷰 계약부터 바꿔야 한다
--     (제출본 자체는 `performance_submissions`에 revision별로 전부 남는다 —
--      학생이 무엇을 썼는지는 유실되지 않는다).
--
--   ⚠ 이미 세션당 같은 종류 행이 2개 이상인 DB에서는 인덱스 생성이 실패한다.
--     `api/performance/evaluate.js`·`finalize.js`가 이 파일과 함께 처음 들어오는
--     신규 기능이라 그런 행은 존재할 수 없지만, 실패하면 중복을 먼저 정리해야 한다.
-- ---------------------------------------------------------------------
create unique index if not exists performance_reports_one_evaluation_per_session_idx
    on public."performance_reports" using btree (session_id)
    where (report_type = 'evaluation');

create unique index if not exists performance_reports_one_final_per_session_idx
    on public."performance_reports" using btree (session_id)
    where (report_type = 'final_submission');


-- ---------------------------------------------------------------------
-- (3) performance_sessions — 평가 리포트 생성 횟수 2축
--
--   56번(주제 추천)·57번(설계 리포트)이 확립한 **같은 2축 분리**다. 한 축으로 합치면
--   둘 중 하나가 반드시 깨진다:
--
--     · evaluation_count = **성공한** 평가 생성 수. 사용자에게 보이는 상한이며
--       §9.2 상한 표 「재평가 | 2회 | `409 REEVALUATION_LIMIT`」가 이 값을 센다.
--       최초 1회 + 재평가 2회 = 3.
--
--     · evaluation_attempt_count = **실제 모델 호출 시도** 수(성공·실패 모두).
--       평가 실패(§8.6 `502 MODEL_FAILED`)는 리포트 행을 남기지 않으므로 위 생성
--       카운터가 오르지 않는다. 즉 실패만 반복하는 경로에 상한이 없고, 1회당 최대
--       6회(과부하 재시도 3 × 구조 재시도 2)의 Gemini 생성 호출이 나간다.
--       55·56·57번과 완전히 같은 구멍이다.
--
--   **이 단계는 애초에 무차감이라 회차가 억제 수단이 될 수 없다**(§9.3 「제출 →
--   평가 리포트 생성 | 없음」). 그래서 차감을 늘려 막지 않는다(§9.2 「과금과 남용
--   방지를 분리한다」).
--
--   갱신 주체·시점
--     서버(service_role)만 갱신한다 — performance_* 8테이블 전부 클라이언트 write
--     정책이 없다(54번 (2)).
--       · attempt    : **모델을 실제로 부르기 직전**에 +1(실패도 세야 상한이 의미를 갖는다).
--       · evaluation : (4)의 RPC 안에서, 리포트 저장과 **같은 트랜잭션**으로 +1.
--     저장분을 그대로 돌려주는 멱등 재생(replay)은 모델을 부르지 않으므로 둘 다 올리지 않는다.
-- ---------------------------------------------------------------------
alter table public."performance_sessions"
    add column if not exists evaluation_count integer default 0 not null;

alter table public."performance_sessions"
    add column if not exists evaluation_attempt_count integer default 0 not null;

comment on column public."performance_sessions".evaluation_count is
    '평가 리포트를 실제로 생성한 누적 횟수(성공만). 상한 3(최초 1 + 재평가 2, §9.2) 초과 시 409 REEVALUATION_LIMIT. commit_performance_evaluation_report가 리포트 저장과 같은 트랜잭션에서 올린다.';
comment on column public."performance_sessions".evaluation_attempt_count is
    '평가(api/performance/evaluate.js)가 실제로 모델을 호출한 누적 시도 횟수(성공·실패 모두 포함). 모델 실패는 리포트 무기록이라 생성 상한이 오르지 않으므로 남용 상한을 이 값으로 따로 건다(§9.2 — 회차를 더 깎아 막지 않는다). 멱등 재생은 올리지 않는다.';


-- ---------------------------------------------------------------------
-- (4) RPC commit_performance_evaluation_report
--     — 제출 확정 + 평가 리포트 저장 + rag_use 승격을 단일 트랜잭션으로
--
--   왜 RPC인가
--     57번 (4)와 같은 이유다. supabase-js에는 다중 문장 트랜잭션이 없고, 이 커밋
--     구간에는 서로 어긋나면 안 되는 write가 4종 있다:
--       ㄱ) performance_submissions — is_draft=false / submitted_at
--       ㄴ) performance_reports     — evaluation upsert(세션당 1행)
--       ㄷ) performance_sessions    — evaluation_count / current_step / completed_steps
--       ㄹ) performance_session_vectors.rag_use = true
--     핸들러에서 순서대로 쏘면 중간에서 죽었을 때
--       "평가 리포트는 있는데 제출본은 아직 draft"(= 다음 저장이 덮어씀),
--       "리포트는 있는데 진행 단계는 STEP4"(= 화면이 뒤로 감)
--     같은 반쪽 상태가 남는다.
--
--   ㄹ) rag_use 승격 — §8.3 `performance_session_vectors.rag_use`:
--       「**평가 리포트 생성 또는 최종 제출 확정 시에만 true 승격.** 외부는 draft도
--        rag_use=true라 미완성 초안이 과거 실적으로 프롬프트에 들어갔다
--        (`api/_lib/reports.js:279`)」. 이 함수가 그 두 지점 중 첫 번째다.
--       ⚠ 벡터 **행 자체를 만들지 않는다.** 행 생성·임베딩 큐는 P14(학생 과거 수행
--         RAG) 몫이고(§10.2 P14 「`performance_session_vectors` 배선, 비동기 임베딩
--         큐, `rag_use` 승격 규칙」), 이 파일 시점에는 행이 없으므로 update가 0행에
--         적중한다. 그래도 지금 넣어 두는 이유는 P14가 행을 만들기 시작하는 순간
--         **승격 지점이 자동으로 규정대로 동작해야** 하기 때문이다 — 나중에 끼워
--         넣으면 그 사이에 만들어진 세션은 영원히 옵트인되지 않는다.
--
--   security definer
--     `consume_performance_credit`·`commit_performance_design_report`와 같은 이유다 —
--     RLS를 우회하므로 소유권을 **함수 안에서 직접** 확인한다. 존재하지 않는 세션과
--     남의 세션을 같은 결과로 묶어 id 존재 여부가 새지 않게 하는 것도 같다.
--
--   raise가 아니라 status jsonb를 돌려준다 (54번 (7) 관례)
--     'committed'                 → 200
--     'session_not_found'         → 403 NOT_SESSION_OWNER
--     'submission_not_in_session' → 404 SUBMISSION_NOT_IN_SESSION
--
--   completed_steps / current_step
--     `4`를 넣는다 — STEP4(설계 리포트)는 사용자가 리포트를 닫고 작성으로 넘어간
--     순간 끝나는데(57번 (4) 주석), 제출물이 평가까지 왔다는 것은 그 전이가 이미
--     일어났다는 뜻이다. STEP5는 **평가를 받은 순간이 아니라** 사용자가 분기 3버튼
--     에서 확정하는 순간 끝나므로(§5.17) 여기서는 넣지 않고 (5)가 넣는다.
--     진행은 되돌리지 않는다(greatest).
-- ---------------------------------------------------------------------

-- 시그니처가 바뀔 수 있으므로 같은 이름의 모든 오버로드를 oid로 훑어 drop한다
-- (54번 (3-a)·57번과 같은 방어 — 오버로드가 공존하면 PostgREST가 42725
--  function is not unique로 깨진다).
do $$
declare
  fn record;
begin
  for fn in
    select p.oid::regprocedure as sig
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public'
       and p.proname in (
             'commit_performance_evaluation_report',
             'finalize_performance_submission'
           )
  loop
    raise notice '58_performance_submission: dropping %', fn.sig::text;
    execute format('drop function if exists %s', fn.sig);
  end loop;
end;
$$;

create or replace function public.commit_performance_evaluation_report(
    p_session_id uuid,
    p_profile_id uuid,
    p_submission_id uuid,
    p_sections jsonb,
    p_score smallint default null,
    p_summary text default null,
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
  v_revision   smallint;
  v_report_id  uuid;
  v_count      integer;
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
    return jsonb_build_object('status', 'session_not_found');
  end if;

  -- ── 2) 제출본이 **이 세션의 것**인가. 핸들러도 같은 검사를 하지만 여기서 한 번 더
  --       한다 — 이 함수는 RLS 밖에서 도는 write 진입점이라 호출부의 선행 검사를
  --       신뢰 근거로 삼지 않는다(57번 (4) 단계 2와 같은 판단).
  select sub.revision
    into v_revision
    from public.performance_submissions sub
   where sub.id = p_submission_id
     and sub.session_id = p_session_id;

  if v_revision is null then
    return jsonb_build_object('status', 'submission_not_in_session');
  end if;

  -- ── 3) 제출 확정. **`is_final`은 건드리지 않는다** — 최종본 고정은 (5)의 몫이고,
  --       여기서 손대면 세션당 1건 부분 UNIQUE와 다투게 된다.
  --       `submitted_at`은 최초 1회만 찍는다(재평가로 시각이 밀리면 "언제 낸 글인가"가
  --       사라진다). 이미 제출된 행을 다시 평가하는 경우 이 update는 사실상 no-op이다.
  update public.performance_submissions sub
     set is_draft = false,
         submitted_at = coalesce(sub.submitted_at, now()),
         updated_at = now()
   where sub.id = p_submission_id;

  -- ── 4) 세션 진행 상태 + 생성 카운터.
  update public.performance_sessions s
     set status = case when s.status = 'draft' then 'in_progress' else s.status end,
         current_step = greatest(coalesce(s.current_step, 1), 5),
         completed_steps = (
           select coalesce(array_agg(distinct e order by e), '{}'::smallint[])
             from unnest(coalesce(s.completed_steps, '{}'::smallint[]) || array[4]::smallint[]) as e
         ),
         evaluation_count = coalesce(s.evaluation_count, 0) + 1,
         updated_at = now()
   where s.id = p_session_id
  returning s.evaluation_count into v_count;

  -- ── 5) 리포트 upsert. 충돌 대상은 (2)의 부분 UNIQUE 인덱스다 — 재평가는
  --       **같은 행을 덮어쓴다**(새 행을 쌓지 않는다). created_at은 갱신하지 않는다.
  insert into public.performance_reports
      (session_id, submission_id, report_type, sections, score, summary, model, prompt_version)
  values
      (p_session_id, p_submission_id, 'evaluation', p_sections, p_score, p_summary, p_model, p_prompt_version)
  on conflict (session_id) where (report_type = 'evaluation')
  do update
     set submission_id  = excluded.submission_id,
         sections       = excluded.sections,
         score          = excluded.score,
         summary        = excluded.summary,
         model          = excluded.model,
         prompt_version = excluded.prompt_version,
         updated_at     = now()
  returning id into v_report_id;

  -- ── 6) rag_use 승격(위 ㄹ). 벡터 행이 아직 없으면 0행에 적중한다 — P14가 행을
  --       만들기 시작하면 이 지점이 그대로 규정대로 동작한다.
  update public.performance_session_vectors v
     set rag_use = true
   where v.session_id = p_session_id
     and v.rag_use is distinct from true;

  return jsonb_build_object(
    'status', 'committed',
    'report_id', v_report_id,
    'submission_id', p_submission_id,
    'revision', v_revision,
    'evaluation_count', v_count
  );
end;
$function$;

comment on function public.commit_performance_evaluation_report(uuid, uuid, uuid, jsonb, smallint, text, text, text) is
    '평가 리포트 커밋 단일 트랜잭션 — 제출본 확정(is_draft/submitted_at) + 평가 리포트 upsert(세션당 1행) + 진행 단계 + evaluation_count + performance_session_vectors.rag_use 승격을 전부 성립시키거나 전부 없던 일로 만든다. 회차는 건드리지 않는다(평가는 무차감, §9.3).';


-- ---------------------------------------------------------------------
-- (5) RPC finalize_performance_submission
--     — 최종본 고정 + 최종 제출 리포트 저장 + rag_use 승격을 단일 트랜잭션으로
--
--   의미론 정본(§12.2 「평가 후 3분기 확정 의미론」)
--     「'확정짓기'와 '추가 수행평가 진행하기' 둘 다 마지막 제출본을 최종본으로 확정
--      저장한다. '추가 평가 받기'만 확정 없이 폼을 복원한다」.
--     그래서 이 함수를 부르는 action은 `confirm` / `new_assessment` 둘뿐이고 값은
--     그대로 `performance_submissions.finalize_reason`에 들어간다(외부
--     `api/finalize-submission.js:59-71` 승계).
--
--   멱등 — 외부는 조건 없는 insert라 재시도·다중 탭에 중복 행이 쌓였다
--   (§8.3 「최종 확정 멱등 가드」, 외부 `api/finalize-submission.js:46-72`).
--   여기서는 세 겹이다:
--     ① `performance_submissions_one_final_per_session_idx`(54번 1-6) 부분 UNIQUE —
--        세션당 is_final 행은 물리적으로 1개를 넘을 수 없다.
--     ② 같은 제출본을 다시 확정하면 아무것도 바꾸지 않고 `already_final`을 돌려준다
--        (§8.6 「이미 확정된 세션이면 동일 200(멱등)」). `finalized_at`·
--        `finalize_reason`을 덮어쓰지 않는 것이 핵심이다 — 최초 확정 사실이 정본이다.
--     ③ **다른** 제출본이 이미 확정돼 있으면 `already_finalized_other`
--        (§8.6 `409 ALREADY_FINALIZED_OTHER`). Q67 결정(「확정 후에도 재평가를
--        허용하되 최종본은 1건만 고정한다」)의 뒷부분이 이것이다 — 세션은 잠그지
--        않으므로 재평가는 계속 되지만, 최종본 포인터는 움직이지 않는다.
--
--   평가 선행 조건(§8.6 `400 NO_EVALUATION_YET`)
--     이 세션의 evaluation 리포트가 **이 제출본을 대상으로** 만들어졌는지 본다.
--     (1)이 `submission_id`를 붙인 덕분에 조인 없이 판정된다. 핸들러도 같은 검사를
--     하지만 여기서 한 번 더 한다(RLS 밖 write 진입점 원칙).
--
--   최종 제출 리포트(`report_type='final_submission'`)
--     §8.3 report_type 3종과 시안 `3754:3121` 칩 3종(설계/평가/최종)이 이미 이 행을
--     전제한다. §8.6 저장 리포트 상세 계약이 「`performance_reports.sections` 단일
--     필드」이므로, 최종 제출본을 그 계약으로 열려면 리포트 행이 있어야 한다.
--     본문은 **모델 산출물이 아니라 학생이 쓴 필드**를 서버가 섹션으로 편 것이고
--     (`api/performance/finalize.js buildFinalSections`), 그래서 `score`/`summary`는
--     null이다. 외부도 finalize에서 `report_type='final_submission'` 행을 저장했다
--     (`api/finalize-submission.js:46-72`) — 다른 점은 4종 sparse 컬럼
--     (`report_content`/`submission_text`/`evaluation_result`)이 아니라 `sections`
--     하나로 정규화됐다는 것뿐이다(§12.4).
--
--   세션 상태
--     `status = 'completed'`로 올린다. 「1회 = 수행평가 세션 1건(주제 추천 → 설계
--     리포트 → 평가 리포트 전 과정)」(§9.2)의 종료 지점이 확정이기 때문이다.
--     ⚠ **이것이 세션을 잠그지는 않는다** — Q67 결정대로 확정 후에도 `추가 평가
--     받기`로 같은 세션에 새 revision을 쓰고 다시 평가받을 수 있다. `evaluate.js`·
--     `submission.js` 어느 쪽도 `status`를 게이트로 쓰지 않는다. 이 값이 실제로
--     바꾸는 것은 재방문 재개 후보에서 빠지는 것뿐이다(`bootstrap.js`
--     RESUMABLE_STATUSES).
-- ---------------------------------------------------------------------
create or replace function public.finalize_performance_submission(
    p_session_id uuid,
    p_profile_id uuid,
    p_submission_id uuid,
    p_reason text,
    p_sections jsonb
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_owns         boolean;
  v_revision     smallint;
  v_is_final     boolean;
  v_finalized_at timestamptz;
  v_reason       text;
  v_other_id     uuid;
  v_eval_ok      boolean;
  v_report_id    uuid;
begin
  if p_reason is null or p_reason not in ('confirm', 'new_assessment') then
    return jsonb_build_object('status', 'invalid_reason');
  end if;

  -- ── 1) 세션 존재 + 소유권.
  select exists (
    select 1
      from public.performance_sessions s
     where s.id = p_session_id
       and s.profile_id = p_profile_id
  ) into v_owns;

  if not v_owns then
    return jsonb_build_object('status', 'session_not_found');
  end if;

  -- ── 2) 제출본이 이 세션의 것인가. **행을 잠근다** — 아래 "이미 확정됐는가" 판정과
  --       update 사이에 다른 탭이 끼어들면 두 요청이 모두 "미확정"으로 읽고 둘 다
  --       update를 시도한다. 부분 UNIQUE가 뒤늦은 쪽을 23505로 막아 주기는 하지만,
  --       그 경우 호출부는 500을 보게 된다. 잠그면 뒤늦은 쪽이 `already_final`
  --       (같은 제출본) 또는 `already_finalized_other`로 **정상 분기**한다.
  select sub.revision, sub.is_final, sub.finalized_at, sub.finalize_reason
    into v_revision, v_is_final, v_finalized_at, v_reason
    from public.performance_submissions sub
   where sub.id = p_submission_id
     and sub.session_id = p_session_id
     for update;

  if v_revision is null then
    return jsonb_build_object('status', 'submission_not_in_session');
  end if;

  -- ── 3) 이미 이 제출본이 최종본이면 **아무것도 바꾸지 않고** 성공을 돌려준다(멱등 ②).
  --       finalize_reason을 덮어쓰지 않는다 — 최초 확정이 정본이다.
  if v_is_final then
    select id into v_report_id
      from public.performance_reports
     where session_id = p_session_id
       and report_type = 'final_submission';

    return jsonb_build_object(
      'status', 'already_final',
      'submission_id', p_submission_id,
      'revision', v_revision,
      'finalized_at', v_finalized_at,
      'finalize_reason', v_reason,
      'report_id', v_report_id
    );
  end if;

  -- ── 4) 다른 제출본이 이미 확정돼 있는가(멱등 ③ → §8.6 409 ALREADY_FINALIZED_OTHER).
  select sub.id
    into v_other_id
    from public.performance_submissions sub
   where sub.session_id = p_session_id
     and sub.is_final = true
   limit 1;

  if v_other_id is not null then
    return jsonb_build_object(
      'status', 'already_finalized_other',
      'submission_id', v_other_id
    );
  end if;

  -- ── 5) 평가 선행 조건(§8.6 400 NO_EVALUATION_YET).
  select exists (
    select 1
      from public.performance_reports r
     where r.session_id = p_session_id
       and r.report_type = 'evaluation'
       and r.submission_id = p_submission_id
  ) into v_eval_ok;

  if not v_eval_ok then
    return jsonb_build_object('status', 'no_evaluation');
  end if;

  -- ── 6) 최종본 고정.
  update public.performance_submissions sub
     set is_final = true,
         is_draft = false,
         finalized_at = now(),
         finalize_reason = p_reason,
         submitted_at = coalesce(sub.submitted_at, now()),
         updated_at = now()
   where sub.id = p_submission_id
  returning sub.finalized_at into v_finalized_at;

  -- ── 7) 최종 제출 리포트 upsert(세션당 1행, (2)의 부분 UNIQUE가 충돌 대상).
  --       score/summary는 null이다 — 모델 산출물이 아니라 학생 원고다.
  insert into public.performance_reports
      (session_id, submission_id, report_type, sections)
  values
      (p_session_id, p_submission_id, 'final_submission', p_sections)
  on conflict (session_id) where (report_type = 'final_submission')
  do update
     set submission_id = excluded.submission_id,
         sections      = excluded.sections,
         updated_at    = now()
  returning id into v_report_id;

  -- ── 8) 세션 종료 표시(위 「세션 상태」 주석 — 잠그는 것이 아니다).
  update public.performance_sessions s
     set status = 'completed',
         current_step = greatest(coalesce(s.current_step, 1), 5),
         completed_steps = (
           select coalesce(array_agg(distinct e order by e), '{}'::smallint[])
             from unnest(coalesce(s.completed_steps, '{}'::smallint[]) || array[4, 5]::smallint[]) as e
         ),
         updated_at = now()
   where s.id = p_session_id;

  -- ── 9) rag_use 승격 2번째 지점(§8.3 「평가 리포트 생성 또는 최종 제출 확정 시에만」).
  update public.performance_session_vectors v
     set rag_use = true
   where v.session_id = p_session_id
     and v.rag_use is distinct from true;

  return jsonb_build_object(
    'status', 'finalized',
    'submission_id', p_submission_id,
    'revision', v_revision,
    'finalized_at', v_finalized_at,
    'finalize_reason', p_reason,
    'report_id', v_report_id
  );
end;
$function$;

comment on function public.finalize_performance_submission(uuid, uuid, uuid, text, jsonb) is
    '최종 확정 단일 트랜잭션 — is_final 고정(세션당 1건 부분 UNIQUE) + final_submission 리포트 upsert + 세션 completed + rag_use 승격. 같은 제출본 재확정은 already_final(멱등 200), 다른 제출본이 이미 확정이면 already_finalized_other(409)다. 회차는 건드리지 않는다.';


-- EXECUTE는 회수하고 service_role에만 부여한다. 두 함수 모두 RLS를 우회하는 write
-- 진입점이라 authenticated가 직접 부를 수 있으면 소유권 검사만 통과하는 자기 세션에
-- 임의 sections·score를 밀어 넣을 수 있다(리포트 위조 + 상한 우회).
-- (53번의 "revoke 금지"는 **테이블** 권한 이야기이고 함수 EXECUTE는 별개다 —
--  54번 `consume_performance_credit`·57번과 같은 처리.)
revoke all on function public.commit_performance_evaluation_report(uuid, uuid, uuid, jsonb, smallint, text, text, text) from public;
revoke all on function public.commit_performance_evaluation_report(uuid, uuid, uuid, jsonb, smallint, text, text, text) from anon;
revoke all on function public.commit_performance_evaluation_report(uuid, uuid, uuid, jsonb, smallint, text, text, text) from authenticated;
grant execute on function public.commit_performance_evaluation_report(uuid, uuid, uuid, jsonb, smallint, text, text, text) to service_role;

revoke all on function public.finalize_performance_submission(uuid, uuid, uuid, text, jsonb) from public;
revoke all on function public.finalize_performance_submission(uuid, uuid, uuid, text, jsonb) from anon;
revoke all on function public.finalize_performance_submission(uuid, uuid, uuid, text, jsonb) from authenticated;
grant execute on function public.finalize_performance_submission(uuid, uuid, uuid, text, jsonb) to service_role;
