const GRADE_MIN = 1;
const GRADE_MAX = 9;
const GRADE_INPUT_PATTERN = /^\d{0,2}(\.\d{0,2})?$/;

function isOutOfRange(raw) {
  if (raw === '' || raw == null) return false;
  const num = Number(raw);
  if (Number.isNaN(num)) return true;
  return num < GRADE_MIN || num > GRADE_MAX;
}

export default function GradeInputGrid({ groups, value, onChange }) {
  const values = value || {};

  function handleFieldChange(fieldKey, raw) {
    if (raw !== '' && !GRADE_INPUT_PATTERN.test(raw)) return;
    onChange?.({ ...values, [fieldKey]: raw });
  }

  if (!groups || groups.length === 0) return null;

  return (
    <div className="flex w-full flex-col gap-5">
      {groups.map((group) => (
        <div key={group.key} className="flex w-full flex-col gap-2">
          {group.label && (
            <p className="text-base font-medium leading-5 text-[#525252]">{group.label}</p>
          )}

          <div className="flex flex-wrap gap-3 sm:gap-4">
            {group.fields.map((field) => {
              const raw = values[field.key] ?? '';
              const outOfRange = isOutOfRange(raw);
              const inputId = `grade-input-${field.key}`;

              return (
                <div
                  key={field.key}
                  className="flex basis-[calc(33.333%-0.5rem)] min-w-0 flex-col gap-1 sm:basis-[6.25rem] sm:flex-none"
                >
                  <label
                    htmlFor={inputId}
                    className="block truncate text-base font-medium leading-5 text-[#808080]"
                  >
                    {field.label}
                  </label>

                  <input
                    id={inputId}
                    type="text"
                    inputMode="decimal"
                    autoComplete="off"
                    placeholder={field.placeholder}
                    value={raw}
                    onChange={(event) => handleFieldChange(field.key, event.target.value)}
                    aria-invalid={outOfRange || undefined}
                    className={`h-[4.25rem] w-full min-w-0 rounded-lg border bg-white text-center text-xl font-normal text-[#525252] transition placeholder:text-[#d7d7d7] focus:outline-none focus:ring-2 focus:ring-[#013262]/25 ${
                      outOfRange ? 'border-red-400' : 'border-[#d7d7d7] focus:border-[#013262]'
                    }`}
                  />
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
