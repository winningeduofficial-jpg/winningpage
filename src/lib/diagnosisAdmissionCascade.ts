/**
 * 학습진단 스텝5(q15 목표 대학 입결 조회) 캐스케이드 3~5단
 * (전형 유형 · 세부 전형명 · 반영교과/영역) 옵션을 admission_results Q3 원본 행
 * (admissionResultsQueries.fetchSusiResultRows)에서 파생시킨다.
 *
 * 축 목록을 하드코딩하지 않는다 — main_track/admission_track 값이 몇 종이든(현재 dev 더미는
 * 6종, 정본 43k 데이터는 11종) 이 파일은 무변경이다. Supabase 무의존 순수 함수만 둔다
 * (src/lib/admissionResults.js 관례와 동일 — 브라우저·node 양쪽에서 import 가능해야 한다).
 */

/** subject_reflection 이 없는(=null·공백) 행을 화면에 표시할 때 쓰는 문구(선택 UI 에 null 을 그릴 수 없다). */
export const NO_SUBJECT_REFLECTION_LABEL = "전체";

type SusiResultRow = {
  main_track?: string | null;
  admission_track?: string | null;
  subject_reflection?: string | null;
};

function trimmed(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function distinctInOrder(values: string[]) {
  const seen = new Set<string>();
  const order: string[] = [];
  values.forEach((value) => {
    if (!seen.has(value)) {
      seen.add(value);
      order.push(value);
    }
  });
  return order;
}

/** 전형 유형(main_track) 후보. 학과 선택 시 받은 원본 행 전체에서 파생한다. */
export function deriveMainTracks(rows: SusiResultRow[] | null | undefined) {
  return distinctInOrder(
    (rows ?? []).map((row) => trimmed(row.main_track)).filter(Boolean),
  );
}

/** 세부 전형명(admission_track) 후보 — 선택된 전형 유형으로 좁힌다. */
export function deriveAdmissionTracks(
  rows: SusiResultRow[] | null | undefined,
  mainTrack?: string | null,
) {
  if (!mainTrack) return [];
  return distinctInOrder(
    (rows ?? [])
      .filter((row) => trimmed(row.main_track) === mainTrack)
      .map((row) => trimmed(row.admission_track))
      .filter(Boolean),
  );
}

/**
 * 반영교과/영역(subject_reflection) 후보 — 전형 유형+세부 전형명으로 좁힌다.
 * 값이 없는 행은 NO_SUBJECT_REFLECTION_LABEL 버킷 하나로 묶는다.
 * 호출부(useAdmissionCascade)는 이 배열 길이가 2 미만이면 5단 선택 UI 자체를 노출하지 않고
 * 유일한 후보(또는 후보 없음=null)를 그대로 쓴다(B-1 확정 — "후보 2개 이상일 때만 노출").
 */
export function deriveSubjectReflections(
  rows: SusiResultRow[] | null | undefined,
  mainTrack?: string | null,
  admissionTrack?: string | null,
) {
  if (!mainTrack || !admissionTrack) return [];
  const matched = (rows ?? []).filter(
    (row) =>
      trimmed(row.main_track) === mainTrack &&
      trimmed(row.admission_track) === admissionTrack,
  );
  return distinctInOrder(
    matched.map(
      (row) => trimmed(row.subject_reflection) || NO_SUBJECT_REFLECTION_LABEL,
    ),
  );
}
