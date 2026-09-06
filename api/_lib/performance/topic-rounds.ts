/**
 * 주제 추천 라운드 상한 — `recommend-topics.js`/`session.js` 양쪽이 각자 `MAX_ROUNDS`
 * 상수를 들고 있다가 값이 갈라진 사고(QA 재개 시 "남은 추가 추천"이 서버 정본(2)이
 * 아닌 3으로 표시됨)가 있었다. 두 핸들러 모두 이 한 곳만 읽도록 통일한다 — 값을
 * 바꿀 일이 생기면 여기 한 곳만 고치면 된다.
 *
 * **세는 단위는 "라운드"다** — 최초 추천이 round 1이고 재추천 1회로 round 2까지 간다
 * (QA 행278 — 고객 요청으로 상한을 3라운드에서 하향 조정한 기록은 `recommend-topics.js`
 * 참고).
 */
export const TOPIC_MAX_ROUNDS = 2;
