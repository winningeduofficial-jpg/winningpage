/**
 * LikertMatrix
 * Figma: hsokTD6OilcNEXyCR24sn4 / 1889:9533 (Q9), 1889:9866 프레임 (Q11) — 12문장 × 5척도
 *
 * 폭 정규화 (SPEC-fd-ver3-v2 §9-A6):
 *   시안이 992 / 990 / 1000 / 1058 로 혼재하고 척도 라벨 중심과 라디오 중심이 8~9px 어긋나 있다.
 *   원값을 그대로 승계하면 시각적으로 더 나빠지므로 **카드 콘텐츠 폭 992(62rem) 기준 균등 grid**로 통일한다.
 *   컬럼: 문장 320(20rem) 고정 + 척도 5컬럼 균등(minmax(0,1fr)) → 라벨 행과 라디오 행이 같은 트랙을 공유해
 *   중심이 정확히 일치한다.
 *
 * 세로 리듬 (시안 실측):
 *   척도 라벨 행 ↔ 문장 리스트 gap 20 (1.25rem)
 *   문장 행 높이 40 (2.5rem) / 행 피치 64 (4rem) = 행 40 + 12 + 구분선 + 12
 *   구분선은 에셋이 아니라 CSS border 1px #D7D7D7
 *   문장 14px Regular #525252 / 척도 라벨 14px Medium #525252 center / 라디오 24 (1.5rem)
 */
const DEFAULT_SCALE = [
  '매우 그렇다',
  '대체로 그렇다',
  '보통이다',
  '별로 그렇지 않다',
  '전혀 그렇지 않다'
];

// 문장 320px(20rem) 고정 + 척도 5컬럼 균등 — 992 기준 정규화.
const GRID_TEMPLATE = 'minmax(0, 20rem) repeat(5, minmax(0, 1fr))';

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
      {/* Desktop / tablet: 992 균등 grid, 문장 행마다 radiogroup 1개 */}
      <div className="hidden md:block">
        <div className="grid items-center pb-5" style={{ gridTemplateColumns: GRID_TEMPLATE }}>
          <span aria-hidden="true" />
          {scale.map((label) => (
            <span key={label} className="text-center text-sm font-medium leading-5 text-[#525252]">
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
                <p className="pr-8 text-sm font-normal leading-5 text-[#525252]">{row.text}</p>
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
                      className="flex items-center justify-center rounded-full py-2 focus:outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                    >
                      <RadioDot checked={checked} />
                    </button>
                  );
                })}
              </div>
              {/* 행 피치 64 = 행 40 + gap 12 + 구분선 + gap 12 */}
              {rowIndex < rows.length - 1 && (
                <div className="my-3 w-full border-t border-[#D7D7D7]" />
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Mobile: 문장 단위 카드 분해 + 5점 가로 배치 (§9-A5) */}
      <div className="flex flex-col gap-3 md:hidden">
        {rows.map((row) => (
          <div key={row.key} className="rounded-2xl border border-[#EDEDED] bg-white p-4">
            <p className="mb-3 text-base leading-6 text-[#525252]">{row.text}</p>
            <div
              role="radiogroup"
              aria-label={row.text}
              className="flex items-start justify-between gap-1"
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
                      className={`text-[0.6875rem] leading-tight ${
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
