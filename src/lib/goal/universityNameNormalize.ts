// admission_results 의 대학명은 단축형("서울대")이고, 목표관리 온보딩이
// 보내는 대학명은 전체형("서울대학교")이다. goal_university_cuts 백필이
// 단축형을 그대로 저장하면 조회 시 전체형과 유일키가 어긋나 intake 가
// 422 를 낸다(§4-2-H-2). 저장 직전 이 함수로 정규화한다.
//
// 캠퍼스 suffix(괄호)는 절대 collapse 하지 않는다 — 캠퍼스별 컷이 다르고
// 유일키가 (cut_type, university_key, department_key) 라 손실 위험이다.

// 규칙만으로는 못 맞히는 단축형 → 전체형 예외. 완전일치(trim 후) 우선.
export const NORMALIZE_EXCEPTIONS: Record<string, string> = {
  한국외대: "한국외국어대학교",
  "한국외대(글로벌)": "한국외국어대학교",
};

function applyBaseRule(base: string) {
  if (NORMALIZE_EXCEPTIONS[base]) return NORMALIZE_EXCEPTIONS[base];
  if (base.endsWith("여대")) return `${base.slice(0, -2)}여자대학교`;
  if (base.endsWith("대")) return `${base.slice(0, -1)}대학교`;
  return base;
}

export function normalizeUniversityName(short?: string | null) {
  const input = String(short ?? "").trim();
  if (!input) return input;

  // 완전일치 예외가 최우선이다(캠퍼스 suffix 포함 형태도 예외에 있을 수 있다).
  if (NORMALIZE_EXCEPTIONS[input]) return NORMALIZE_EXCEPTIONS[input];

  // 끝의 괄호 그룹 하나를 캠퍼스 suffix 로 분리한다. 예: "고려대(세종)" →
  // base "고려대", suffix "(세종)".
  const suffixMatch = input.match(/^(.*)(\([^()]*\))$/);
  const base = suffixMatch ? suffixMatch[1].trim() : input;
  const suffix = suffixMatch ? suffixMatch[2] : "";

  const normalizedBase = applyBaseRule(base);
  return suffix ? `${normalizedBase}${suffix}` : normalizedBase;
}
