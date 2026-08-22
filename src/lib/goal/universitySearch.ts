// 온보딩 "목표 대학 검색"(UniversitySelect.tsx) 실배선 — goal_university_cuts
// (RLS: is_active=true 전원 읽기 허용, sql/55_goal_management.sql (6-4) "전원 읽기 전용")를
// 클라이언트에서 직접 조회한다. 공개 읽기 정책이라 서버 경유가 필요 없다.
//
// cut_type='normal'만 조회한다 — dev DB 실측 결과 normal·special의 (대학,학과) 집합이
// 완전히 같고(각 6641행, avg_cut만 다름) jungsi는 현재 0행(정시 컷 백필 전, 미결 Q11)이다.
// 검색은 (대학,학과) 존재 여부만 필요하므로 cut_type을 하나로 고정해 중복 행을 절반으로
// 줄인다 — jungsi가 나중에 채워져도 normal/special과 동일한 (대학,학과) 집합을 쓸 것이므로
// 이 전제는 깨지지 않는다(판단 지점).
//
// 전량 프리로드 금지(13,282행) — 검색어 기반 ilike 조회 + limit만 쓴다. dev DB 실측상
// 단일 대학의 학과 수 최대 관측치는 85(서울대학교, cut_type=normal 기준)라 SEARCH_LIMIT은
// 이보다 넉넉하다. 다만 "대학교"처럼 거의 모든 행에 매칭되는 극단적으로 넓은 검색어는
// limit에 걸려 뒤쪽 알파벳 순 대학이 누락될 수 있다 — 실사용은 대학명 일부(2글자 이상)를
// 입력하는 게 보통이라 실무상 안전하다고 판단했다(남은 리스크로 보고).

import { supabase } from "@/lib/supabase";

const TABLE = "goal_university_cuts";
const SEARCH_LIMIT = 500;
// 단일 대학의 학과 수 상한 — dev DB 최대 관측치(서울대학교 85)에 여유를 둔 값.
const EXACT_LIMIT = 300;

export type UniversityOption = {
  name: string;
  departments: string[];
};

type CutRow = {
  university_name: string | null;
  department_name: string | null;
};

/** ilike 패턴 특수문자(%, _, \) 이스케이프 — 사용자 입력을 그대로 패턴에 꽂아도 안전하게. */
function escapeIlikePattern(input: string): string {
  return input.replace(/[\\%_]/g, (ch) => `\\${ch}`);
}

/** 빈 문자열·중복을 제거하면서 등장 순서를 보존한다. */
function dedupeNonEmpty(values: (string | null)[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of values) {
    const value = (raw || "").trim();
    if (!value || seen.has(value)) continue;
    seen.add(value);
    out.push(value);
  }
  return out;
}

/**
 * university_name/department_name 행 배열 → UniversitySelect가 쓰던
 * UNIVERSITY_OPTIONS({name, departments[]}) shape으로 그룹핑. 대학 등장 순서는
 * 입력 행 순서(호출부가 이미 university_name 오름차순으로 정렬해 넘긴다)를 보존한다.
 * export하는 이유: 네트워크 없이 이 순수 로직만 단위 테스트하기 위함(universitySearch.test.ts).
 */
export function groupByUniversity(rows: CutRow[]): UniversityOption[] {
  const order: string[] = [];
  const byUniversity = new Map<string, Set<string>>();

  for (const row of rows) {
    const name = (row.university_name || "").trim();
    if (!name) continue;
    if (!byUniversity.has(name)) {
      byUniversity.set(name, new Set());
      order.push(name);
    }
    const department = (row.department_name || "").trim();
    if (department) byUniversity.get(name)!.add(department);
  }

  return order.map((name) => ({
    name,
    // biome-ignore lint/style/noNonNullAssertion: order는 byUniversity에 막 넣은 키만 담는다.
    departments: Array.from(byUniversity.get(name)!),
  }));
}

/**
 * 대학명 부분 일치 검색. term이 빈 문자열이면 조회 자체를 하지 않고 빈 배열을
 * 즉시 돌려준다 — 전체 목록을 훑는 요청을 만들지 않는다(전량 프리로드 금지).
 */
export async function searchUniversities(
  term: string,
): Promise<UniversityOption[]> {
  const trimmed = term.trim();
  if (!trimmed) return [];

  const { data, error } = await supabase
    .from(TABLE)
    .select("university_name, department_name")
    .eq("is_active", true)
    .eq("cut_type", "normal")
    .ilike("university_name", `%${escapeIlikePattern(trimmed)}%`)
    .order("university_name", { ascending: true })
    .order("department_name", { ascending: true })
    .limit(SEARCH_LIMIT);

  if (error) {
    console.error("[universitySearch] 대학 검색 실패:", error);
    return [];
  }

  return groupByUniversity((data as CutRow[]) || []);
}

/**
 * 대학명 정확 일치 → 학과 목록만. 이미 선택된 대학(온보딩 재진입 등, 검색 결과 캐시에
 * 없을 수 있음)의 학과 셀렉트를 채울 때 UniversitySelect가 별도로 호출한다.
 */
export async function fetchDepartmentsForUniversity(
  universityName: string,
): Promise<string[]> {
  const trimmed = universityName.trim();
  if (!trimmed) return [];

  const { data, error } = await supabase
    .from(TABLE)
    .select("department_name")
    .eq("is_active", true)
    .eq("cut_type", "normal")
    .eq("university_name", trimmed)
    .order("department_name", { ascending: true })
    .limit(EXACT_LIMIT);

  if (error) {
    console.error("[universitySearch] 학과 목록 조회 실패:", error);
    return [];
  }

  return dedupeNonEmpty(((data as { department_name: string | null }[]) || []).map(
    (row) => row.department_name,
  ));
}
