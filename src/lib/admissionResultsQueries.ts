// 입결정보(/admission/results) 페이지의 Supabase 조회 레이어.
//
// 순수 집계 로직은 src/lib/admissionResults.js에 따로 둔다(UI·Supabase 무의존).
// 이 파일은 "무엇을 어떤 컬럼으로 가져올지"만 책임진다.
//
// 페칭 규율은 AdmissionGuidelines.jsx:1007-1039를 그대로 따른다:
//   - 호출부(useEffect)가 `let alive = true` 가드로 언마운트 후 setState를 막는다
//   - 리소스별 xxx / xxxLoading / xxxError 3-state 트리플
//   - 실패 시 한국어 '…조회 실패:' 로그 + 빈 배열 리셋 + 재시도 버튼
//   - react-query 등 페칭 라이브러리는 이 저장소에 없다
// 그래서 이 함수들은 예외를 던지지 않고 항상 { data, error } 를 돌려주며,
// data는 실패 시에도 절대 null이 아니라 빈 배열이다(호출부 분기 단순화).
//
// ★ select('*') 금지 ★
// 대입모집요강에서 admission_university_resources를 select('*')로 읽어 218행 합계
// 5MB+ 응답 → Postgres statement timeout(57014)이 났던 전례가 있다
// (sql/39_admission_resource_index_view.sql 배경 주석 참고).
// 목록 쿼리는 집계 뷰만 읽고, 상세 쿼리도 31컬럼 중 필요한 13개만 받는다.
// 본선 데이터가 434행 → 43,170행으로 100배가 됐으므로 이 규율은 더 엄격해졌다.

import {
  type AdmissionResultRow,
  collectFallbackAdmissionTracks,
  RESULT_YEARS,
} from "./admissionResults";
import { supabase } from "./supabase";

type QueryResult<T> = { data: T[]; error: unknown };

type UniversityIndexRow = {
  university_key: string;
  university_name: string;
  dept_count: number;
};

type DepartmentIndexRow = {
  department_key: string;
  department_name: string;
  tracks: string[] | null;
};

type TrendingDepartmentRow = {
  university_name: string;
  department_name: string;
  university_key: string;
  department_key: string;
  logo_url: string | null;
};

// 통합 테이블(admission_results)은 sql/53에서 recruitment_period 축이 제거돼
// **수시 전용**이 됐다(원본 자료 3종 어디에도 모집시기 개념이 없음 — 명세 §6.1 Q1 확정).
// 따라서 Q1~Q3 어디에도 모집시기 필터를 걸지 않는다. 정시가 들어올 때는
// 컬럼 부활이 아니라 별도 테이블로 가는 것이 이 전환의 전제다.

// ---------------------------------------------------------------------------
// select 목록 (한 곳에서만 관리 — 여기 외에는 컬럼 문자열을 두지 않는다)
// ---------------------------------------------------------------------------

// Q1: 대학 인덱스 뷰(admission_result_university_index). 대학 1행당 ≈60B.
// is_active=true 필터는 뷰 정의(sql/53_admission_results_2yr.sql (5a)) 안에 이미 있어
// 여기서 다시 걸지 않는다 — 뷰가 그 컬럼을 노출하지 않는다.
// sql/53에서 선두 컬럼이던 recruitment_period가 사라져 3컬럼 뷰가 됐다.
const UNIVERSITY_INDEX_COLUMNS = "university_key,university_name,dept_count";

// Q2: 모집단위 인덱스 뷰(admission_result_department_index). tracks는 main_track distinct text[].
// 이쪽도 sql/53에서 recruitment_period가 빠져 (university_key, department_key,
// department_name, tracks) 4컬럼이 됐다. university_key는 필터 축으로만 쓰고 받지 않는다.
const DEPARTMENT_INDEX_COLUMNS = "department_key,department_name,tracks";

// Q3: 상세 원본 행. admission_results 통합 테이블 31컬럼 중 화면이 실제로 읽는 13개만.
//
// 포함 근거:
//   - grade_50 / grade_70 / grade_85 / grade_90 — pickGrade가 4단으로 훑는 컷 축
//     (admissionResults.js:109-116, `row[\`grade_${cut}\`]`). 85/90을 빼면 4단 확장이
//     그대로 무효가 되고 59행이 '-'로 남는다(명세 §8.4 Tier 1).
//     ※ sql/53 (1) 주석은 신규 7컬럼을 "Q3 select 제외"로 묶어 뒀는데, 그중
//        grade_85 / grade_90만은 예외다(sql/43부터 있던 기존 컬럼이자 화면 노출 대상).
//   - university_name / department_name — 딥링크 진입 시 히어로 h1을 그리는 데 필요
//     (모집단위당 수십 행 × 짧은 text라 응답 크기 영향은 무시할 수준).
//   - screening_category — 전형유형 탭 11종 분류와 요약 카드 basis 규칙의 정본 컬럼.
//   - main_track — 표 그룹키 (main_track, admission_track)의 한 축(명세 §8.2).
//   - quota / competition_rate — 2026 모집 합계·경쟁률 평균 열.
//
// 제외 대상: 신규 5지표(grade_avg / grade_min / grade_avg10 / grade_min10 /
// grade_first_avg)는 적재만 하고 v1 화면에 노출하지 않는다(명세 §10.1 Q5 확정).
// variant_seq는 유일성 인덱스 축일 뿐 표시·집계에 안 쓰이고, converted_score /
// percentile / waitlist_rank / source_sheet / source_row / note / id /
// created_at / updated_at도 마찬가지다.
const ADMISSION_RESULT_COLUMNS = [
  "result_year",
  "university_name",
  "department_name",
  "main_track",
  "screening_category",
  "admission_track",
  "quota",
  "competition_rate",
  "grade_50",
  "grade_70",
  "grade_85",
  "grade_90",
  "subject_reflection",
].join(",");

// Q4: 뜨고 있는 학과 큐레이션.
const TRENDING_COLUMNS =
  "university_name,department_name,university_key,department_key,logo_url";

const TRENDING_LIMIT = 12;

// ---------------------------------------------------------------------------
// 공통 결과 정규화
// ---------------------------------------------------------------------------

function fail<T>(label: string, error: unknown): QueryResult<T> {
  console.error(`${label} 조회 실패:`, error);
  return { data: [], error };
}

function ok<T>(data: T[] | null | undefined): QueryResult<T> {
  return { data: data ?? [], error: null };
}

// 한글 가나다 정렬. 명세 §8.1이 요구하는 정렬 기준은 `localeCompare(q, 'ko')`인데
// PostgREST의 .order()는 DB collation(Supabase 기본 en_US.UTF-8)을 타므로 둘이
// 항상 같지 않다 — 한글·영문·숫자가 섞인 모집단위명("AI융합학부" / "10번대학" 등)에서
// 순서가 갈린다. 서버 정렬은 응답을 결정적으로 만드는 용도로 그대로 두고,
// 화면에 나가는 최종 순서는 여기서 한 번 더 잡는다.
// 대상 규모가 대학 202행 / 모집단위는 대학당 수십 행이라 클라이언트 재정렬 비용은 무시할 수준.
function sortByKoreanName<T extends Record<string, unknown>>(
  rows: T[] | null | undefined,
  field: string,
): T[] {
  return [...(rows ?? [])].sort((a, b) =>
    String(a?.[field] ?? "").localeCompare(String(b?.[field] ?? ""), "ko"),
  );
}

// ---------------------------------------------------------------------------
// Q1 — 대학 목록 (검색 뷰 mount 시 1회)
// ---------------------------------------------------------------------------

// → [{ university_key, university_name, dept_count }]
//
// ⚠ 이 뷰는 필터가 없어 43,170행 전량을 집계한다(seq scan + HashAggregate).
// 대신 결과는 202행뿐이라 전송량은 ≈12KB고, 검색 뷰 mount 시 1회만 호출한다.
// 체감 지연이 생기면 뷰를 materialized view로 바꾸는 것이 다음 수단이다
// (컬럼을 더 받거나 여기서 필터를 거는 것으로는 스캔이 줄지 않는다).
export async function fetchSusiUniversities(): Promise<
  QueryResult<UniversityIndexRow>
> {
  const { data, error } = await supabase
    .from("admission_result_university_index")
    .select(UNIVERSITY_INDEX_COLUMNS)
    .order("university_name", { ascending: true });

  if (error) return fail<UniversityIndexRow>("대학 목록", error);
  return ok<UniversityIndexRow>(sortByKoreanName(data, "university_name"));
}

// ---------------------------------------------------------------------------
// Q2 — 모집단위 목록 (대학 선택 시)
// ---------------------------------------------------------------------------

// → [{ department_key, department_name, tracks: string[] }]
// tracks가 null로 내려오는 행(main_track이 전부 null)은 빈 배열로 정규화해
// 호출부가 tracks.join(...)을 그냥 쓸 수 있게 한다.
//
// university_key 필터는 group by 축이라 뷰 안쪽으로 밀려 들어가고,
// admission_results_detail_idx (university_key, department_key, result_year)의
// 선두 컬럼이 받아 준다 — 전량 스캔이 아니다. 대학 1곳당 평균 18모집단위.
export async function fetchSusiDepartments(
  universityKey?: string | null,
): Promise<QueryResult<DepartmentIndexRow>> {
  if (!universityKey) return ok<DepartmentIndexRow>([]);

  const { data, error } = await supabase
    .from("admission_result_department_index")
    .select(DEPARTMENT_INDEX_COLUMNS)
    .eq("university_key", universityKey)
    .order("department_name", { ascending: true });

  if (error) return fail<DepartmentIndexRow>("모집단위 목록", error);

  const rows = sortByKoreanName<DepartmentIndexRow>(data, "department_name");
  return ok<DepartmentIndexRow>(
    rows.map((row) => ({ ...row, tracks: row.tracks ?? [] })),
  );
}

// ---------------------------------------------------------------------------
// Q3 — 상세 원본 행 (조회 실행 시 1회)
// ---------------------------------------------------------------------------

// 탭 전환마다 재요청하지 않는다. 이 결과를 useMemo로 잡아 두고
// buildDetailModel(rows)로 카테고리 분류·집계해 클라이언트에서 필터한다.
//
// .in('result_year', RESULT_YEARS) — 표 연도 축(RESULT_YEARS) 밖의 행이 섞여 들어오면
// 표 셀에는 안 그려지는데 Δ·요약 카드 집계에는 들어가 검산이 안 맞는 사고가 난다
// (QA 결함 a). 조회 단계에서 1차 방어하고, buildDetailModel/buildTableRows/
// buildTrackSummaries(src/lib/admissionResults.js)에서 이중으로 다시 거른다.
//
// 정렬은 main_track → admission_track → result_year 순이다. buildTableRows가
// (main_track, admission_track) 그룹키의 **최초 등장 순서**를 그대로 표 행 순서로
// 쓰기 때문에(admissionResults.js:680-682), 선두를 main_track으로 두어야 교과 행끼리
// 먼저 묶이고 그 뒤에 종합 행이 온다. 예전처럼 admission_track이 선두면 같은 전형명의
// 교과/종합이 붙는 대신 중심전형이 표 전체에 흩어진다.
//
// 43,170행 규모에서도 (university_key, department_key) 등치 필터가
// admission_results_detail_idx의 선두 2컬럼을 그대로 타므로 전량 스캔이 아니다.
// 모집단위 1개당 평균 12행, 최대치도 수십 행 수준이라 페이지네이션은 불필요하다.
export async function fetchSusiResultRows(
  universityKey?: string | null,
  departmentKey?: string | null,
): Promise<QueryResult<AdmissionResultRow>> {
  if (!universityKey || !departmentKey) return ok<AdmissionResultRow>([]);

  const { data, error } = await supabase
    .from("admission_results")
    .select(ADMISSION_RESULT_COLUMNS)
    .eq("is_active", true)
    .eq("university_key", universityKey)
    .eq("department_key", departmentKey)
    .in("result_year", RESULT_YEARS)
    .order("main_track", { ascending: true })
    .order("admission_track", { ascending: true })
    .order("result_year", { ascending: true });

  if (error) return fail<AdmissionResultRow>("입결 상세", error);

  // postgrest-js는 .select() 인자를 타입 레벨에서 파싱한다 — ADMISSION_RESULT_COLUMNS가
  // .join(",")로 만든 일반 string(리터럴 아님)이라 파서가 GenericStringError로 폴백한다.
  // 런타임 select 절은 그대로 유효하므로 여기서만 실제 row 타입으로 되돌린다.
  const rows = (data ?? []) as unknown as AdmissionResultRow[];
  warnUnclassifiedAdmissionTypes(rows);
  return ok<AdmissionResultRow>(rows);
}

// screening_category 컬럼이 없거나(null) 매핑 밖 값이라 전형명 정규식 추론으로
// 대신 분류된 행을 감시한다. "미분류"가 아니다 — 정상적으로 분류된 행(예: 일반)까지
// 이 경고에 잡히면 신호가 노이즈가 되므로, screening_category 컬럼값을 그대로 신뢰한
// 행은 제외하고 fallback을 실제로 탄 행만 모은다(src/lib/admissionResults.js
// collectFallbackAdmissionTracks 참고).
function warnUnclassifiedAdmissionTypes(
  rows: AdmissionResultRow[] | null | undefined,
) {
  if (!import.meta.env?.DEV) return;
  const fallback = collectFallbackAdmissionTracks(rows);
  if (fallback.length === 0) return;
  console.warn(
    "[admission-results] screening_category 누락 — 전형명 추론으로 분류함:",
    fallback,
  );
}

// ---------------------------------------------------------------------------
// Q4 — 지금 뜨고 있는 학과
// ---------------------------------------------------------------------------

// 결과가 빈 배열이면 호출부는 섹션 전체를 렌더하지 않는다(빈 pill 그리드는 고장으로 보인다).
export async function fetchTrendingDepartments({
  limit = TRENDING_LIMIT,
}: {
  limit?: number;
} = {}): Promise<QueryResult<TrendingDepartmentRow>> {
  const { data, error } = await supabase
    .from("trending_departments")
    .select(TRENDING_COLUMNS)
    .eq("is_active", true)
    .order("sort_order", { ascending: true })
    .limit(limit);

  if (error) return fail<TrendingDepartmentRow>("뜨고 있는 학과", error);
  return ok<TrendingDepartmentRow>(data);
}
