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
// 목록 쿼리는 집계 뷰만 읽고, 상세 쿼리도 21컬럼 중 필요한 것만 받는다.

import { supabase } from './supabase';
import { collectFallbackAdmissionTracks, RESULT_YEARS } from './admissionResults';

// 통합 테이블(admission_results)은 수시·정시를 recruitment_period 축으로 함께 담는다.
// v1은 수시만 다룬다(명세 §1.2) — Q1~Q3 전부 이 필터를 건다.
const RECRUITMENT_PERIOD = '수시';

// ---------------------------------------------------------------------------
// select 목록 (한 곳에서만 관리 — 여기 외에는 컬럼 문자열을 두지 않는다)
// ---------------------------------------------------------------------------

// Q1: 대학 인덱스 뷰(admission_result_university_index). 대학 1행당 ≈60B.
// is_active=true 필터는 뷰 정의(sql/41_admission_results_unified.sql) 안에 이미 있어
// 여기서 다시 걸지 않는다 — 뷰가 그 컬럼을 노출하지 않는다.
const UNIVERSITY_INDEX_COLUMNS = 'university_key,university_name,dept_count';

// Q2: 모집단위 인덱스 뷰(admission_result_department_index). tracks는 main_track distinct text[].
const DEPARTMENT_INDEX_COLUMNS = 'department_key,department_name,tracks';

// Q3: 상세 원본 행. admission_results 통합 테이블 컬럼 중 필요한 것만.
// 제외 대상: converted_score / percentile(v1 미사용), grade_85 / grade_90(시안에 대응
// 표기 없음), waitlist_rank, source_sheet, source_row, note, id, created_at, updated_at.
// university_name / department_name은 딥링크 진입 시 히어로 h1을 그리는 데 필요해
// 포함한다(모집단위당 수십 행 × 짧은 text라 응답 크기 영향은 무시할 수준).
// screening_category는 전형 카테고리 탭 분류의 정본 컬럼이라 반드시 포함한다.
const ADMISSION_RESULT_COLUMNS = [
  'result_year',
  'university_name',
  'department_name',
  'main_track',
  'screening_category',
  'admission_track',
  'quota',
  'competition_rate',
  'grade_50',
  'grade_70',
  'subject_reflection'
].join(',');

// Q4: 뜨고 있는 학과 큐레이션.
const TRENDING_COLUMNS = 'university_name,department_name,university_key,department_key,logo_url';

export const TRENDING_LIMIT = 12;

// ---------------------------------------------------------------------------
// 공통 결과 정규화
// ---------------------------------------------------------------------------

function fail(label, error) {
  console.error(`${label} 조회 실패:`, error);
  return { data: [], error };
}

function ok(data) {
  return { data: data ?? [], error: null };
}

// ---------------------------------------------------------------------------
// Q1 — 대학 목록 (검색 뷰 mount 시 1회)
// ---------------------------------------------------------------------------

// → [{ university_key, university_name, dept_count }]
export async function fetchSusiUniversities() {
  const { data, error } = await supabase
    .from('admission_result_university_index')
    .select(UNIVERSITY_INDEX_COLUMNS)
    .eq('recruitment_period', RECRUITMENT_PERIOD)
    .order('university_name', { ascending: true });

  if (error) return fail('대학 목록', error);
  return ok(data);
}

// ---------------------------------------------------------------------------
// Q2 — 모집단위 목록 (대학 선택 시)
// ---------------------------------------------------------------------------

// → [{ department_key, department_name, tracks: string[] }]
// tracks가 null로 내려오는 행(main_track이 전부 null)은 빈 배열로 정규화해
// 호출부가 tracks.join(...)을 그냥 쓸 수 있게 한다.
export async function fetchSusiDepartments(universityKey) {
  if (!universityKey) return ok([]);

  const { data, error } = await supabase
    .from('admission_result_department_index')
    .select(DEPARTMENT_INDEX_COLUMNS)
    .eq('recruitment_period', RECRUITMENT_PERIOD)
    .eq('university_key', universityKey)
    .order('department_name', { ascending: true });

  if (error) return fail('모집단위 목록', error);

  return ok((data ?? []).map((row) => ({ ...row, tracks: row.tracks ?? [] })));
}

// ---------------------------------------------------------------------------
// Q3 — 상세 원본 행 (조회 실행 시 1회)
// ---------------------------------------------------------------------------

// 탭 전환마다 재요청하지 않는다. 이 결과를 useMemo로 잡아 두고
// buildDetailModel(rows)로 카테고리 분류·집계해 클라이언트에서 필터한다.
//
// .in('result_year', RESULT_YEARS) — 표 연도 축(RESULT_YEARS) 밖의 행이 섞여 들어오면
// 표 셀에는 안 그려지는데 평균·요약 카드 집계에는 들어가 검산이 안 맞는 사고가 난다
// (QA 결함 a). 조회 단계에서 1차 방어하고, buildDetailModel/buildTableRows/
// buildTrackSummaries(src/lib/admissionResults.js)에서 이중으로 다시 거른다.
export async function fetchSusiResultRows(universityKey, departmentKey) {
  if (!universityKey || !departmentKey) return ok([]);

  const { data, error } = await supabase
    .from('admission_results')
    .select(ADMISSION_RESULT_COLUMNS)
    .eq('recruitment_period', RECRUITMENT_PERIOD)
    .eq('is_active', true)
    .eq('university_key', universityKey)
    .eq('department_key', departmentKey)
    .in('result_year', RESULT_YEARS)
    .order('admission_track', { ascending: true })
    .order('result_year', { ascending: true });

  if (error) return fail('입결 상세', error);

  const rows = data ?? [];
  warnUnclassifiedAdmissionTypes(rows);
  return ok(rows);
}

// screening_category 컬럼이 없거나(null) 매핑 밖 값이라 전형명 정규식 추론으로
// 대신 분류된 행을 감시한다. "미분류"가 아니다 — 정상적으로 분류된 행(예: 일반)까지
// 이 경고에 잡히면 신호가 노이즈가 되므로, screening_category 컬럼값을 그대로 신뢰한
// 행은 제외하고 fallback을 실제로 탄 행만 모은다(src/lib/admissionResults.js
// collectFallbackAdmissionTracks 참고).
export function warnUnclassifiedAdmissionTypes(rows) {
  if (!import.meta.env?.DEV) return;
  const fallback = collectFallbackAdmissionTracks(rows);
  if (fallback.length === 0) return;
  console.warn('[admission-results] screening_category 누락 — 전형명 추론으로 분류함:', fallback);
}

// ---------------------------------------------------------------------------
// Q4 — 지금 뜨고 있는 학과
// ---------------------------------------------------------------------------

// 결과가 빈 배열이면 호출부는 섹션 전체를 렌더하지 않는다(빈 pill 그리드는 고장으로 보인다).
export async function fetchTrendingDepartments({ limit = TRENDING_LIMIT } = {}) {
  const { data, error } = await supabase
    .from('trending_departments')
    .select(TRENDING_COLUMNS)
    .eq('is_active', true)
    .order('sort_order', { ascending: true })
    .limit(limit);

  if (error) return fail('뜨고 있는 학과', error);
  return ok(data);
}
