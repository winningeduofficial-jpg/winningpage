/**
 * 학습진단 스텝5(q15) 캐스케이드 — 대학·학과·전형 축 조회.
 *
 * `src/lib/admissionResultsQueries.js`(입결정보 `/admission/results` 페이지 전용, 다른 세션이
 * 소유·수정 중)를 재사용하지 않는다 — 그 파일의 Q1/Q2/Q3 는 전부 `.eq('recruitment_period', ...)`
 * 필터를 건다. dev `admission_results` 가 2026-08-11 정본 43,170행(`입결_마스터_2개년.xlsx`)으로
 * 교체되면서 그 컬럼 자체가 사라졌다(실측: `42703 column admission_results.recruitment_period
 * does not exist`). 그 파일은 다른 세션이 새 스키마에 맞춰 고칠 예정이라 우리가 손대지 않는다 —
 * 이 파일이 학습진단 전용으로 같은 인덱스 뷰·테이블을 recruitment_period 없이 직접 조회한다.
 *
 * select('*') 금지 — 대입모집요강 5MB+/57014 timeout 전례(admissionResultsQueries.js 헤더 주석과
 * 동일 규율). 필요한 컬럼만 명시한다.
 */
import { supabase } from "./supabase";

type QueryResult<T> = { data: T[]; error: unknown };

type UniversityRow = { university_key: string; university_name: string };
type DepartmentRow = { department_key: string; department_name: string };
type TrackRow = {
  result_year: number;
  main_track: string | null;
  admission_track: string | null;
  subject_reflection: string | null;
  grade_50: number | null;
  grade_70: number | null;
};

function fail<T>(label: string, error: unknown): QueryResult<T> {
  console.error(`${label} 조회 실패:`, error);
  return { data: [], error };
}

function ok<T>(data: T[] | null | undefined): QueryResult<T> {
  return { data: data ?? [], error: null };
}

/**
 * supabase-js 는 **쿼리** 오류를 { error } 로 돌려주지만 **네트워크** 실패(오프라인·중단·CORS)는
 * 예외로 던진다. 던지면 async 함수가 reject 되고, 호출부(useAdmissionCascade)의 `.then` 이
 * 실행되지 않아 loading 이 영구히 true 로 고착된다(에러 화면·재시도 진입 자체가 막힘). 두 실패
 * 경로를 여기서 하나로 정규화해 어떤 실패든 항상 { data:[], error } 로 돌려준다.
 */
async function run<T>(
  label: string,
  build: () => Promise<{ data: T[] | null; error: unknown }>,
): Promise<QueryResult<T>> {
  try {
    const { data, error } = await build();
    if (error) return fail<T>(label, error);
    return ok<T>(data);
  } catch (error) {
    return fail<T>(label, error);
  }
}

/** 대학 목록 — 문항 진입 시 1회(admission_result_university_index). */
export async function fetchAdmissionUniversities() {
  return run<UniversityRow>("대학 목록", () =>
    supabase
      .from("admission_result_university_index")
      .select("university_key,university_name")
      .order("university_name", { ascending: true }),
  );
}

/** 학과 목록 — 대학 선택 시(admission_result_department_index). */
export async function fetchAdmissionDepartments(
  universityKey?: string | null,
) {
  if (!universityKey) return ok<DepartmentRow>([]);

  return run<DepartmentRow>("학과 목록", () =>
    supabase
      .from("admission_result_department_index")
      .select("department_key,department_name")
      .eq("university_key", universityKey)
      .order("department_name", { ascending: true }),
  );
}

/**
 * 전형 유형(main_track)·세부 전형명(admission_track)·반영교과(subject_reflection) 파생용
 * 원본 행. 학과 선택 시 1회 — 이후 3단계 옵션을 전부 이 결과에서 클라이언트 파생시켜
 * (diagnosisAdmissionCascade.js) 추가 라운드트립을 늘리지 않는다.
 */
export async function fetchAdmissionTrackRows(
  universityKey?: string | null,
  departmentKey?: string | null,
) {
  if (!universityKey || !departmentKey) return ok<TrackRow>([]);

  return run<TrackRow>("입결 상세", () =>
    supabase
      .from("admission_results")
      .select(
        "result_year,main_track,admission_track,subject_reflection,grade_50,grade_70",
      )
      .eq("is_active", true)
      .eq("university_key", universityKey)
      .eq("department_key", departmentKey)
      .order("admission_track", { ascending: true })
      .order("result_year", { ascending: true }),
  );
}
