// sql/52_mentor_applications.sql의 status 컬럼 주석에 적힌 값 그대로(CHECK 제약은 없지만
// 이 6개가 실제 사용 값이다). CONFIGS.mentorApplications 목록 컬럼과 MentorApplicationsAdmin의
// 상세 상태변경 Select가 이 배열 하나를 공유한다 — 값이 어긋나면 목록에 라벨이 안 붙는다.
export const MENTOR_APPLICATION_STATUS_OPTIONS = [
  { value: "submitted", label: "제출됨" },
  { value: "screening", label: "서류심사" },
  { value: "interview", label: "면접" },
  { value: "training", label: "교육" },
  { value: "active", label: "활동중" },
  { value: "rejected", label: "불합격" },
];

export function normalizeProgramIds(value) {
  if (Array.isArray(value)) return value.map(String).filter(Boolean);
  if (!value) return [];

  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      if (Array.isArray(parsed)) return parsed.map(String).filter(Boolean);
    } catch {
      return value
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean);
    }
  }

  return [];
}

export function boolValue(value) {
  if (value === true || value === "true") return true;
  if (value === false || value === "false") return false;
  return Boolean(value);
}

export function getNextSortOrder(items) {
  const list = Array.isArray(items) ? items : [];

  if (list.length === 0) return 1;

  return Math.max(...list.map((item) => Number(item.sort_order || 0))) + 1;
}

export function TextInput({ value, onChange, placeholder, className = "" }) {
  return (
    <input
      value={value || ""}
      onChange={(event) => onChange(event.target.value)}
      placeholder={placeholder}
      className={`h-10 w-full border border-gray-300 px-3 text-sm font-bold outline-none focus:border-[#B88737] ${className}`}
    />
  );
}

export function Textarea({ value, onChange, placeholder, rows = 3 }) {
  return (
    <textarea
      value={value || ""}
      onChange={(event) => onChange(event.target.value)}
      placeholder={placeholder}
      rows={rows}
      className="w-full resize-y border border-gray-300 px-3 py-2 text-sm font-bold leading-6 outline-none focus:border-[#B88737]"
    />
  );
}

export function Select({ value, onChange, children }) {
  return (
    <select
      value={value || ""}
      onChange={(event) => onChange(event.target.value)}
      className="h-10 w-full border border-gray-300 px-3 text-sm font-bold outline-none focus:border-[#B88737]"
    >
      {children}
    </select>
  );
}

export function Toggle({ checked, onChange, label }) {
  return (
    <label className="inline-flex items-center gap-2 text-sm font-black text-gray-700">
      <input
        type="checkbox"
        checked={!!checked}
        onChange={(event) => onChange(event.target.checked)}
        className="h-4 w-4 accent-[#0D1B2A]"
      />
      {label}
    </label>
  );
}

export function Field({ label, children }) {
  return (
    // biome-ignore lint/a11y/noLabelWithoutControl: children이 폼 컨트롤을 감싸는(중첩) 연결 방식이다 — 정적 분석이 children 내부를 못 봐서 오탐이다.
    <label className="block">
      <span className="mb-1 block text-xs font-black text-gray-500">
        {label}
      </span>
      {children}
    </label>
  );
}

export function ActionButton({
  children,
  onClick,
  variant = "dark",
  type = "button",
  disabled = false,
}) {
  const variantClass =
    variant === "danger"
      ? "border border-red-500 bg-white text-red-600 hover:bg-red-50"
      : variant === "light"
        ? "border border-gray-400 bg-white text-gray-800 hover:bg-gray-50"
        : "bg-[#0D1B2A] text-white hover:bg-[#162A40]";

  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={`inline-flex h-9 items-center justify-center gap-1 px-4 text-xs font-black transition disabled:cursor-not-allowed disabled:opacity-50 ${variantClass}`}
    >
      {children}
    </button>
  );
}

export function ProgramSelector({ programs, value, onChange }) {
  const selected = new Set(normalizeProgramIds(value));

  function toggle(programId) {
    const next = new Set(selected);
    if (next.has(programId)) next.delete(programId);
    else next.add(programId);
    onChange(Array.from(next));
  }

  if (programs.length === 0) {
    return (
      <div className="rounded border border-dashed border-gray-300 px-3 py-2 text-xs font-bold text-gray-500">
        먼저 추천 프로그램을 등록하세요.
      </div>
    );
  }

  return (
    <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
      {programs.map((program) => (
        <label
          key={program.id}
          className={`flex cursor-pointer items-center gap-2 border px-3 py-2 text-xs font-black transition ${
            selected.has(program.id)
              ? "border-[#0D1B2A] bg-[#0D1B2A] text-white"
              : "border-gray-300 bg-white text-gray-700 hover:border-[#B88737]"
          }`}
        >
          <input
            type="checkbox"
            checked={selected.has(program.id)}
            onChange={() => toggle(program.id)}
            className="h-4 w-4 accent-[#B88737]"
          />
          {program.title || "제목 없음"}
        </label>
      ))}
    </div>
  );
}
