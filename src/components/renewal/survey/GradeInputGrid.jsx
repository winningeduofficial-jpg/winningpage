/**
 * GradeInputGrid
 * Figma: hsokTD6OilcNEXyCR24sn4 / 1889:9045 (Q6 2세트 / Q7 1세트)
 *
 * 시안 실측:
 *   입력 박스 100×68 (6.25rem × 4.25rem) / radius 8 (0.5rem)
 *   필드 ↔ 필드 gap 16 (1rem) / 라벨 ↔ 박스 gap 4 (0.25rem)
 *   그룹 라벨 ↔ 필드행 gap 8 (0.5rem) / 세트 ↔ 세트 gap 20 (1.25rem)
 *   필드 라벨 16px Medium #808080 / 값·플레이스홀더 20px Regular
 *
 * 폭은 리커트와 함께 카드 콘텐츠 폭 992(62rem) 기준으로 통일한다 (SPEC §9-A6).
 * wide(1184) 이상은 100px 고정 트랙 auto-fill grid라 세트가 달라도 컬럼이 정렬된다.
 * 그 미만은 명시 열 수(3/4/6/7) + 1fr 트랙 — 아래 그리드 주석 참고.
 *
 * 상태 (§9-A2): hover border #B0B0B0 / focus border #013262 + outline 2px #0B84FD 30%
 *              filled 텍스트 #181D24 / error border #D92D20
 *
 * 고아 행(orphan row) 보정 (impeccable polish ①):
 *   문항마다 필드 수가 다르고(q6 7/6필드, q7 5필드 등) 브레이크포인트마다 열 수도 다르므로
 *   (열 수) % (필드 수) 가 0이 아닌 조합에서는 마지막 줄이 다 차지 않는다. 열 수·필드 배치는
 *   그대로 두고, 부족분만큼 회색 disabled 플레이스홀더(순수 장식 <div>, aria-hidden)를 채워
 *   격자를 시각적으로 완성한다. 필드 수는 렌더 시점에만 정해지므로 Tailwind 클래스를
 *   문자열로 조립할 수 없어(JIT 인식 불가) 전용 CSS(grade-input-grid-filler.css)의
 *   data-v-{bp} 속성 스위치로 뷰포트별 표시 여부를 토글한다.
 */
import '../../../styles/grade-input-grid-filler.css';

const GRADE_MIN = 1;
const GRADE_MAX = 9;
const GRADE_INPUT_PATTERN = /^\d{0,2}(\.\d{0,2})?$/;

// grade-input-grid-filler.css 의 data-v-{bp} 속성명과 반드시 같은 순서로 대응한다.
// wide(74rem/1184px) 이상은 auto-fill(6.25rem) 트랙이지만, 그리드 자체가 max-w-[62rem](992px)로
// 캡핑되어 있고 이 폭은 wide 진입 시점에 이미 확보되는 상한이라(카드 padding·컨테이너 max-width가
// wide 임계값보다 먼저 고정된다) 실측상 열 수가 8로 고정된다(Playwright 실측 확인 완료).
const GRID_BREAKPOINTS = ['base', 'sm', 'md', 'lg', 'wide'];
const BREAKPOINT_COLS = [3, 4, 6, 7, 8];

function neededFillerCount(fieldCount, cols) {
  const remainder = fieldCount % cols;
  return remainder === 0 ? 0 : cols - remainder;
}

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
    <div className="flex w-full max-w-[62rem] flex-col gap-5">
      {groups.map((group) => {
        const fieldCount = group.fields.length;
        // 브레이크포인트별로 부족한 칸 수. 그 중 최댓값만큼만 플레이스홀더 DOM을 만들고,
        // 각 뷰포트에서는 앞에서부터 필요한 개수만 data-v-{bp}="1"로 표시한다(나머지는 CSS로 숨김).
        const neededByBp = BREAKPOINT_COLS.map((cols) => neededFillerCount(fieldCount, cols));
        const fillerCount = Math.max(0, ...neededByBp);
        const fillers = Array.from({ length: fillerCount }, (_, i) => i);

        return (
          <div key={group.key} className="flex w-full flex-col gap-2">
            {group.label && (
              <p className="text-base font-medium leading-5 text-[#525252]">{group.label}</p>
            )}

            {/* 열 수는 명시 고정한다. sm 이상을 auto-fill(100px) 로 두면
                (a) 열 수가 3→4→5→7 로 폭에 따라 튀면서 폭마다 다른 그룹이 고아 행을 만들고
                (b) 남는 폭이 트랙으로 흡수되지 않아 그리드 우측에 34~38px 사공간이 생겼다.
                1fr 트랙 + 명시 열 수면 트랙 폭이 640→109.5 / 768→89 / 1024→110.6 으로 89~111px 대역에 머물고
                라벨 최장값 `1학년 1학기`(16px 실측 73.56px)도 truncate 없이 들어간다.
                wide(1184) 이상은 시안 규격(100px 고정 트랙)으로 복귀한다. */}
            <div className="grid w-full grid-cols-3 gap-4 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-7 wide:grid-cols-[repeat(auto-fill,6.25rem)]">
              {group.fields.map((field) => {
                const raw = values[field.key] ?? '';
                const outOfRange = isOutOfRange(raw);
                const inputId = `grade-input-${field.key}`;

                return (
                  <div key={field.key} className="flex min-w-0 flex-col gap-1">
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
                      className={`h-[4.25rem] w-full min-w-0 rounded-lg border bg-white text-center text-xl font-normal leading-5 text-[#181D24] transition-[border-color,box-shadow] duration-150 placeholder:text-[#D7D7D7] focus:outline focus:outline-2 focus:outline-accent/30 ${
                        outOfRange
                          ? 'border-[#D92D20]'
                          : 'border-[#D7D7D7] hover:border-[#B0B0B0] focus:border-[#013262]'
                      }`}
                    />
                  </div>
                );
              })}

              {fillers.map((i) => {
                const visibility = {};
                GRID_BREAKPOINTS.forEach((bp, bpIndex) => {
                  visibility[`data-v-${bp}`] = i < neededByBp[bpIndex] ? '1' : '0';
                });

                return (
                  <div
                    key={`filler-${i}`}
                    aria-hidden="true"
                    className="fd-grade-filler pointer-events-none min-w-0 flex-col gap-1"
                    {...visibility}
                  >
                    <div className="h-5" />
                    <div className="h-[4.25rem] w-full min-w-0 rounded-lg border border-[#EDEDED] bg-[#F5F5F5]" />
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}
