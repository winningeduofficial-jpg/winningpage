-- =====================================================================
-- 56. 수행평가 주제 추천 하드닝 — P8 검토 지적 반영
--
--   실행 순서: 54_performance_app.sql 이후(55번과는 독립이나 번호 순으로 실행).
--   이 파일 단독으로도 idempotent다(`add column if not exists`).
--
--   대상 1건
--     (1) performance_sessions.topic_attempt_count 추가
-- =====================================================================


-- ---------------------------------------------------------------------
-- (1) performance_sessions — 주제 추천 모델 호출 시도 횟수
--
--   왜 필요한가 (검토 지적 — 실패 경로에 상한이 없다)
--     `POST /api/performance/recommend-topics`의 구조 실패
--       · 422 MODEL_CONTRACT_VIOLATION
--       · 503 MODEL_UNAVAILABLE
--     은 §8.4에 따라 **무차감**이고, 실패했으므로 `performance_topics`에도
--     아무 행을 남기지 않는다. 그런데 라운드 상한(MAX_ROUNDS=3)은 저장된
--     행의 `round` 최댓값으로만 계산되므로 **실패 경로에서는 영원히 오르지
--     않는다.** 결과적으로 스키마 준수를 방해하도록 조작한 입력(예:
--     `guide_freetext`)으로 같은 세션에서 무한 반복 호출이 가능하고,
--     1회당 임베딩 2회 + 최대 6회(과부하 재시도 3 × 구조 재시도 2)의
--     Gemini 생성 호출이 나간다.
--
--     같은 결함을 무차감 vision 엔드포인트에서 이미 한 번 막았다
--     (`guide_analysis_count`, 55번 (3)). 여기도 같은 방식으로 막는다 —
--     **차감을 늘려 막지 않는다. 그건 §9.2 「과금과 남용 방지를 분리한다」
--     위반이다.**
--
--   두 축은 서로 다르다
--     · MAX_ROUNDS(3)          = **성공한** 라운드 수. 사용자에게 보이는 상한이며
--                                `409 ROUND_LIMIT` + 재추천 버튼 비활성으로 안내된다.
--     · topic_attempt_count(10) = **실제 모델 호출 시도** 수. 성공·실패를 모두
--                                 세며 넘으면 `429 TOPIC_ATTEMPT_LIMIT`이다.
--     성공 3회 + 정상 재시도를 넉넉히 덮도록 시도 상한이 더 크다.
--
--   갱신 주체·시점
--     서버(service_role)만 갱신한다 — performance_* 8테이블 전부 클라이언트
--     write 정책이 없다(54번 (2)). 카운터는 **모델을 실제로 부르기 직전**에
--     오르며, 저장된 라운드를 그대로 돌려주는 멱등 재생(replay, 요청 `round`가
--     기존 라운드일 때)은 모델을 부르지 않으므로 올리지 않는다.
--     회차 차감과는 무관한 값이라 `consume_performance_credit`은 건드리지 않는다.
--
--   ⚠ 배포 순서
--     `api/performance/recommend-topics.js`가 이 컬럼을 select 목록에 넣는다.
--     컬럼 없이 새 코드가 뜨면 PostgREST 42703으로 라우트 전체가 죽는다
--     (55번 `guide_analysis_count`와 같은 선행 조건이다).
-- ---------------------------------------------------------------------
alter table public."performance_sessions"
    add column if not exists topic_attempt_count integer default 0 not null;

comment on column public."performance_sessions".topic_attempt_count is
    '주제 추천(api/performance/recommend-topics.js)이 실제로 모델을 호출한 누적 시도 횟수(성공·실패 모두 포함). 구조 실패는 무차감 + performance_topics 무기록이라 라운드 상한이 오르지 않으므로, 남용 상한을 이 값으로 따로 건다(§9.2 — 회차를 더 깎아 막지 않는다). 저장분 멱등 재생은 올리지 않는다.';
