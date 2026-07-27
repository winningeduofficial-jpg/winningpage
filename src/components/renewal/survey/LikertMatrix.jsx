const DEFAULT_SCALE = ['매우 그렇다', '대체로 그렇다', '보통이다', '별로 그렇지 않다', '전혀 그렇지 않다'];

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
      className={`flex size-6 shrink-0 items-center justify-center rounded-full border-2 transition-colors ${
        checked ? 'border-[#013262]' : 'border-[#D7D7D7] bg-white'
      }`}
    >
      {checked && <span className="size-3 rounded-full bg-[#013262]" />}
    </span>
  );
}

export default function LikertMatrix({ statements = [], scale = DEFAULT_SCALE, value = {}, onChange }) {
  const rows = statements.map(normalizeStatement);
  const gridTemplate = `minmax(0,1fr) repeat(${scale.length}, 6.5rem)`;

  function handleSelect(rowKey, columnIndex) {
    if (!onChange) return;
    onChange({ ...value, [rowKey]: columnIndex });
  }

  return (
    <div className="w-full">
      {/* Desktop / tablet: fixed column grid, one radiogroup per statement row */}
      <div className="hidden md:block">
        <div className="grid items-center gap-x-4 pb-3" style={{ gridTemplateColumns: gridTemplate }}>
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
                className="grid items-center gap-x-4 py-3"
                style={{ gridTemplateColumns: gridTemplate }}
              >
                <p className="pr-8 text-sm leading-5 text-[#525252]">{row.text}</p>
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
                      className="flex items-center justify-center rounded-full py-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#013262] focus-visible:ring-offset-2"
                    >
                      <RadioDot checked={checked} />
                    </button>
                  );
                })}
              </div>
              {rowIndex < rows.length - 1 && <div className="h-px w-full bg-[#D7D7D7]" />}
            </div>
          ))}
        </div>
      </div>

      {/* Mobile: each statement becomes a stacked card with a horizontal 5-point row */}
      <div className="flex flex-col gap-3 md:hidden">
        {rows.map((row) => (
          <div key={row.key} className="rounded-2xl border border-[#EDEDED] bg-white p-4">
            <p className="mb-3 text-base leading-6 text-[#525252]">{row.text}</p>
            <div role="radiogroup" aria-label={row.text} className="flex items-start justify-between gap-1">
              {scale.map((label, columnIndex) => {
                const checked = value[row.key] === columnIndex;
                return (
                  <button
                    key={label}
                    type="button"
                    role="radio"
                    aria-checked={checked}
                    onClick={() => handleSelect(row.key, columnIndex)}
                    className="flex min-h-[44px] flex-1 flex-col items-center gap-1.5 rounded-xl px-1 py-2 text-center focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#013262]"
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
