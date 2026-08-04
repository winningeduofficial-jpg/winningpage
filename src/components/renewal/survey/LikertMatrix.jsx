/**
 * LikertMatrix
 * Figma: hsokTD6OilcNEXyCR24sn4 / 1889:9533 (Q9), 1889:9866 프레임 (Q11) — 12문장 × 5척도
 *
 * 폭 정규화 (SPEC-fd-ver3-v2 §9-A6):
 *   시안이 992 / 990 / 1000 / 1058 로 혼재하고 척도 라벨 중심과 라디오 중심이 8~9px 어긋나 있다.
 *   원값을 그대로 승계하면 시각적으로 더 나빠지므로 **카드 콘텐츠 폭 992(62rem) 기준 grid**로 통일한다.
 *   라벨 행과 라디오 행이 같은 트랙을 공유하므로 중심이 정확히 일치한다.
 *
 * 컬럼 폭 배분 (992 기준):
 *   척도 컬럼의 폭을 결정하는 것은 라디오 원(24)이 아니라 **척도 라벨**이다. 시안 실측 라벨 폭이
 *   92(1889:9545~9549)이므로 척도 컬럼 = 92 로 잡는다. 그보다 좁히면 `대체로 그렇다`/`별로 그렇지 않다`가
 *   3줄로 접히고, 넓히면 문장 컬럼이 굶는다. 92 는 최소 터치 타깃 44 도 충족한다.
 *     척도 5컬럼 = 92 × 5 = 460  → 문장 컬럼 = 992 − 460 = 532 (기존 320 → +212, +66%)
 *   fr 비로 고정해 폭이 줄어도 비율이 유지되게 한다: 532 : 92 = 133 : 23 (합 248 유닛, 992/248 = 4px/유닛).
 *   척도 컬럼에는 minmax 하한 2.75rem(44) 을 걸어 극단적으로 좁은 폭에서도 터치 타깃을 보장한다.
 *
 * 세로 리듬 (시안 실측):
 *   척도 라벨 행 ↔ 문장 리스트 gap 20 (1.25rem)
 *   문장 행 높이 40 (2.5rem) / 행 피치 64 (4rem) = 행 40 + 12 + 구분선 + 11
 *   구분선은 에셋이 아니라 CSS border 1px #D7D7D7 (1px 이 피치에 더해지지 않도록 24px 박스 안에 넣는다)
 *   문장 14px Regular #525252 / 척도 라벨 14px Medium #525252 center / 라디오 24 (1.5rem)
 *
 * 한국어 줄바꿈: 척도 라벨·문장 모두 `break-keep`(word-break: keep-all). 없으면 좁은 폭에서 척도 라벨이
 *   `매우 그렇/다` 처럼, 1440 에서 문장이 `구체적/으로` 처럼 어절 중간에서 잘린다.
 *
 * 반응형 게이트 (§9-A5):
 *   ≥1024  데스크톱 매트릭스 (fr 배분이 성립하는 최소 폭 — 척도 컬럼 80.7px)
 *   <1024  문장 단위 카드 분해 (가로 스크롤 금지 — 척도 헤더가 시야에서 사라진다)
 */
const DEFAULT_SCALE = [
  '매우 그렇다',
  '대체로 그렇다',
  '보통이다',
  '별로 그렇지 않다',
  '전혀 그렇지 않다'
];

// 문장 133fr : 척도 23fr × 5 — 992 기준 532 / 92×5. 척도 컬럼 하한 44(2.75rem) = 최소 터치 타깃.
const GRID_TEMPLATE = 'minmax(0, 133fr) repeat(5, minmax(2.75rem, 23fr))';

function normalizeStatement(statement, index) {
  if (typeof statement === 'string') {
    return { key: String(index), text: statement };
  }
  return {
    key: statement?.key ?? statement?.id ?? String(index),
    text: statement?.text ?? statement?.label ?? ''
  };
}

function RadioDot({ checked }) {
  return (
    <span
      aria-hidden="true"
      className={`flex size-6 shrink-0 items-center justify-center rounded-full border-2 transition-colors duration-150 ${
        checked ? 'border-[#013262]' : 'border-[#D7D7D7] bg-white'
      }`}
    >
      {checked && <span className="size-3 rounded-full bg-[#013262]" />}
    </span>
  );
}

export default function LikertMatrix({
  statements = [],
  scale = DEFAULT_SCALE,
  value = {},
  onChange
}) {
  const rows = statements.map(normalizeStatement);

  function handleSelect(rowKey, columnIndex) {
    if (!onChange) return;
    onChange({ ...value, [rowKey]: columnIndex });
  }

  return (
    <div className="w-full max-w-[62rem]">
      {/* Desktop: 992 균등 grid, 문장 행마다 radiogroup 1개.
          게이트가 md(768) 였을 때 척도 컬럼이 56.9px 까지 눌려 `별로 그렇지 않다`가 3줄로 접혔다
          (상단 주석의 하한 92 는 물론 fr 배분의 전제 자체가 무너지는 폭이다).
          lg(1024) 부터 켜면 QuestionCard padding 40(§D6) 기준 척도 컬럼 80.7px 로 2줄이 유지되고,
          768~1023 은 아래 문장 카드 분해 레이아웃이 받는다 (SPEC §9-A5). */}
      <div className="hidden lg:block">
        <div className="grid items-center pb-5" style={{ gridTemplateColumns: GRID_TEMPLATE }}>
          <span aria-hidden="true" />
          {scale.map((label) => (
            <span
              key={label}
              className="break-keep px-1 text-center text-sm font-medium leading-5 text-[#525252]"
            >
              {label}
            </span>
          ))}
        </div>

        <div>
          {rows.map((row, rowIndex) => (
            <div key={row.key}>
              <div
                role="radiogroup"
                aria-label={row.text}
                className="grid h-10 items-center"
                style={{ gridTemplateColumns: GRID_TEMPLATE }}
              >
                <p className="break-keep pr-8 text-sm font-normal leading-5 text-[#525252]">
                  {row.text}
                </p>
                {scale.map((label, columnIndex) => {
                  const checked = value[row.key] === columnIndex;
                  return (
                    <button
                      key={label}
                      type="button"
                      role="radio"
                      aria-checked={checked}
                      aria-label={`${row.text} - ${label}`}
                      onClick={() => handleSelect(row.key, columnIndex)}
                      /* 히트 영역 확장 (WCAG 2.5.5, 44px 하한): 시안 확정 행 피치 64(행40+구분선24)를
                         지키기 위해 시각 크기(40, RadioDot 24)는 그대로 두고, ::after 로 상하 각 2px씩만
                         투명 확장한다 (40 + 2 + 2 = 44). 인접 행과의 실제 간격은 24px이므로 20px 여유가
                         남아 겹치지 않는다. 가로는 grid 컬럼 stretch 로 버튼이 이미 컬럼 폭 전체
                         (1024 기준 80.7px)를 차지해 44px를 넉넉히 초과하므로 별도 확장이 불필요하다.
                         포커스 링은 버튼 자신의 실제 박스(40px)에 그려지므로 44px 히트 영역과 무관하게
                         시각 라디오에 그대로 붙는다. */
                      className="relative flex items-center justify-center rounded-full py-2 after:absolute after:inset-x-0 after:-top-0.5 after:-bottom-0.5 after:content-[''] focus:outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                    >
                      <RadioDot checked={checked} />
                    </button>
                  );
                })}
              </div>
              {/* 행 피치 64 = 행 40 + 구분선 박스 24.
                  mt-3(12) + h-3(12) 이고 box-border 라 border 1px 이 박스 높이 안에서 소화된다.
                  (my-3 + border 였을 때는 12+1+12 = 25 라 피치가 65 로 밀렸다.) */}
              {rowIndex < rows.length - 1 && (
                <div aria-hidden="true" className="mt-3 h-3 w-full border-t border-[#D7D7D7]" />
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Mobile / tablet(<1024): 문장 단위 카드 분해 + 5점 가로 배치 (§9-A5).
          가로 스크롤은 척도 헤더가 시야에서 사라지므로 쓰지 않는다 — 카드마다 척도 라벨을 재노출한다. */}
      <div className="flex flex-col gap-3 lg:hidden">
        {rows.map((row) => (
          <div key={row.key} className="rounded-2xl border border-[#EDEDED] bg-white p-4">
            <p className="mb-3 break-keep text-base leading-6 text-[#525252]">{row.text}</p>
            {/* items-stretch: 라벨 줄 수(375 기준 1~3줄)가 달라도 5칸 버튼 높이가 최장 라벨로 통일된다.
                items-start 였을 때 73.5 / 73.5 / 59.75 / 87.25 / 87.25 로 27.5px 편차가 났다.
                버튼 자신이 flex-col + items-center 라 라디오 원은 여전히 상단 정렬을 유지한다. */}
            <div
              role="radiogroup"
              aria-label={row.text}
              className="flex items-stretch justify-between gap-1"
            >
              {scale.map((label, columnIndex) => {
                const checked = value[row.key] === columnIndex;
                return (
                  <button
                    key={label}
                    type="button"
                    role="radio"
                    aria-checked={checked}
                    onClick={() => handleSelect(row.key, columnIndex)}
                    className="flex min-h-[2.75rem] flex-1 flex-col items-center gap-1.5 rounded-xl px-1 py-2 text-center focus:outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
                  >
                    <RadioDot checked={checked} />
                    <span
                      className={`break-keep text-[0.625rem] leading-tight sm:text-[0.6875rem] md:text-sm ${
                        checked ? 'font-semibold text-[#013262]' : 'text-[#808080]'
                      }`}
                    >
                      {label}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
