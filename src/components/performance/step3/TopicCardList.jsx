import TopicCard from './TopicCard';

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
 * @param {boolean} [regenerating] 재추천 요청 진행 중.
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
  error = null
}) {
  const limitReached = roundLimited || round >= maxRounds;

  return (
    <div className="flex w-full max-w-perf-bubble flex-col gap-5">
      {topics.map((topic, index) => (
        <TopicCard key={topic.id ?? index} index={index + 1} topic={topic} onDetail={onDetail} />
      ))}

      <div className="flex flex-col gap-2">
        <button
          type="button"
          onClick={onRegenerate}
          disabled={limitReached || regenerating}
          className="flex h-10 w-[8.125rem] items-center justify-center rounded-[0.625rem] border border-performance-line bg-white text-[0.875rem] font-medium leading-[1.125rem] text-ink transition-colors hover:border-ink-sub disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:border-performance-line"
        >
          다른 주제 다시 추천
        </button>

        {/* 상한 안내·실패 안내 모두 시안에 없는 표면이다(§11.3 Q39 — 시안에 토스트가 없다).
            다른 STEP과 같은 관례로 카드 아래 한 줄 텍스트로만 만든다. */}
        {limitReached && (
          <p className="text-[0.875rem] font-normal leading-[1.125rem] text-ink-sub">
            주제 추천은 최대 {maxRounds}회까지 받을 수 있어요. 위 주제 중 하나를 눌러 자세한 내용을
            확인해 주세요.
          </p>
        )}

        {error && (
          <p role="alert" className="text-[0.875rem] leading-[1.125rem] text-error">
            {error}
          </p>
        )}
      </div>
    </div>
  );
}
