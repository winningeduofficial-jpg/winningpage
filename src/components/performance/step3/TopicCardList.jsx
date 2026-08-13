import TopicCard from "./TopicCard";

// STEP3 추천 주제 3카드 묶음 + `다른 주제 다시 추천` — docs/수행평가-상세-명세.md §5.10
// (`3754:3629`/`3754:3746` 실측).
//
// ── 실측 (세로 리듬)
//   카드 상단 y: 1007 / 1221 / 1435 → 피치 13.375rem(214) = 카드 높이 194 + 간격 20.
//   마지막 카드 하단 1629 → 재추천 버튼 상단 1649 → 같은 1.25rem(20).
//   즉 카드 3장과 버튼이 **하나의 세로 스택에 gap 1.25rem**으로 놓인 모양이라 `gap-5`
//   하나로 두 간격이 동시에 맞는다.
//   재추천 버튼 8.125rem×2.5rem(130×40) r0.625rem(10) stroke `#d9d9d9`(=`performance-line`),
//   라벨 0.875rem/1.125rem w500 `#525252`(=`ink`), 좌측 정렬(x=456, 카드 좌변과 같은 축).
//
//   버튼은 공용 `OutlineButton`을 쓰지 않는다 — 그쪽 치수 프리셋(h 3.25rem/3.75rem,
//   `rounded-xl`, 기본 fullWidth)이 여기 실측(2.5rem/`0.625rem`/고정 8.125rem)과 하나도
//   맞지 않아 전부 `className`으로 덮어야 하고, 이 저장소는 tailwind-merge가 없어 같은
//   속성의 유틸을 겹쳐 쓰면 어느 쪽이 이기는지 예측할 수 없다(OutlineButton 상단 주석).
//
// ── 재추천은 "교체"다 (§5.10 「미정」에 대한 결정)
//   §5.10은 재추천이 교체인지 추가인지 미정으로 남겼다. **교체로 구현한다** — 서버는
//   라운드마다 새 3건을 만들고 응답에 그 라운드만 실어 준다(`recommend-topics.js`의
//   `topics: insertedRows`). 이전 라운드 카드를 화면에 남겨 두면 사용자가 그것을 눌러
//   상세 모달 → 확정까지 갈 수 있는데, 그 순간 "다시 추천받은 뒤 옛 주제를 고른" 상태가
//   되어 어느 쪽이 현재 제안인지 화면이 스스로 모순된다. 옛 라운드는 DB에 남아 있으므로
//   기록이 사라지는 것도 아니다.
//
// ── 상한 안내 (§9.3)
//   주제 추천은 **라운드 3회**가 상한이고 초과 시 서버가 `409 ROUND_LIMIT`을 준다.
//   버튼을 눌러 보고 나서야 막히는 것보다 도달 시점에 미리 잠그는 편이 낫다 —
//   `round >= maxRounds`면 버튼을 비활성화하고 이유를 한 줄로 적는다. 서버가 그래도
//   `ROUND_LIMIT`을 돌려주면(다른 탭에서 이미 3회를 쓴 경우) 호출부가 `roundLimited`를
//   켜서 같은 안내로 수렴시킨다.
//   **재추천은 회차를 깎지 않는다**(§9.3 — RPC가 `already_charged`를 돌려주는 것이 정상
//   경로다). 그래서 이 버튼 근처에 회차 소모 경고를 붙이지 않는다.
/**
 * @param {Array<{id: string, title: string, subtitle: string, tags: string[]}>} topics
 *   현재 라운드의 주제 3건.
 * @param {number} [round] 현재 라운드(1-based).
 * @param {number} [maxRounds] 라운드 상한. 기본 3(§9.3).
 * @param {(topic: object) => void} [onDetail] 카드 클릭 → 상세 모달(P9). `onSelect`는 없다(§11.1 Q48).
 * @param {() => void} [onRegenerate] `다른 주제 다시 추천`.
 * @param {boolean} [regenerating] 재추천 요청 진행 중. 호출부(`PerformanceChatPage`)가
 *   `topicPhase`를 `'loading'`으로 바꾸는 대신 이 플래그를 켠다 — 그래야 카드 3장과 이
 *   버튼이 타임라인에 그대로 남아 **포커스가 유지되고**, 로딩 버블은 그 아래에 덧붙는다.
 * @param {boolean} [roundLimited] 서버가 `409 ROUND_LIMIT`을 돌려준 뒤 켜진다.
 * @param {string|null} [error] 재추천 실패 안내(모델 원문이 아니라 사람이 읽을 문구).
 */
export default function TopicCardList({
  topics = [],
  round = 1,
  maxRounds = 3,
  onDetail,
  onRegenerate,
  regenerating = false,
  roundLimited = false,
  error = null,
}) {
  const limitReached = roundLimited || round >= maxRounds;

  // 버튼을 잠그는 두 사유. **`disabled` 속성 대신 `aria-disabled`를 쓴다** — 포커스를 가진
  // 버튼이 `disabled`가 되면 브라우저가 포커스를 `<body>`로 떨어뜨려서, 방금 이 버튼을
  // 누른 키보드 사용자가 위치를 잃고 Tab을 처음부터 다시 밟아야 한다. `aria-disabled`는
  // 포커스를 유지한 채 보조기술에 "비활성"을 알리므로, 대신 클릭 핸들러에서 막는다.
  const locked = limitReached || regenerating;

  function handleRegenerateClick() {
    if (locked) return;
    onRegenerate?.();
  }

  return (
    <div className="flex w-full max-w-perf-bubble flex-col gap-5">
      {/* 카드 3장은 **목록**이다. 형제 `div`로 늘어놓으면 스크린리더에 서로 무관한 버튼
          3개로 읽혀 "항목 3개 / 지금 몇 번째"라는 문맥이 통째로 사라진다. 재추천 버튼과
          상한 안내가 같은 컨테이너에 있어 바깥을 리스트로 승격할 수는 없으므로 카드만
          감싼다. 바깥 `gap-5`가 그대로 마지막 카드↔버튼 1.25rem을 유지하므로 세로 리듬은
          변하지 않는다. Tailwind preflight가 `list-style: none`을 걸면 Safari/VoiceOver가
          리스트 롤을 떼어 버리므로 `role="list"`를 명시한다. */}
      <ul role="list" className="flex flex-col gap-5">
        {topics.map((topic, index) => (
          <li key={topic.id ?? index} className="w-full">
            <TopicCard index={index + 1} topic={topic} onDetail={onDetail} />
          </li>
        ))}
      </ul>

      <div className="flex flex-col gap-2">
        <button
          type="button"
          onClick={handleRegenerateClick}
          aria-disabled={locked}
          aria-busy={regenerating}
          className={[
            "flex h-10 w-[8.125rem] items-center justify-center rounded-[0.625rem] border border-performance-line bg-white text-[0.875rem] font-medium leading-[1.125rem] text-ink transition-colors",
            locked ? "cursor-not-allowed opacity-50" : "hover:border-ink-sub",
          ].join(" ")}
        >
          다른 주제 다시 추천
        </button>

        {/* 상한 안내·실패 안내 모두 시안에 없는 표면이다(§11.3 Q39 — 시안에 토스트가 없다).
            다른 STEP과 같은 관례로 카드 아래 한 줄 텍스트로만 만든다. */}
        {limitReached && (
          <p className="text-[0.875rem] font-normal leading-[1.125rem] text-ink-sub">
            주제 추천은 최대 {maxRounds}회까지 받을 수 있어요. 위 주제 중 하나를
            눌러 자세한 내용을 확인해 주세요.
          </p>
        )}

        {error && (
          <p
            role="alert"
            className="text-[0.875rem] leading-[1.125rem] text-[#d01c1c]"
          >
            {error}
          </p>
        )}
      </div>
    </div>
  );
}
