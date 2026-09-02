// 학습진단 리포트 영속화 클라이언트 — 저장(service_role API 경유) 계약.
// QA 시트 행 210. 읽기(RLS select)는 src/lib/diagnosisReportQueries.ts 가 맡는다.
//
// 저장 시점: SurveyStepShell.submitDiagnosis 가 consume 성공 직후 buildReport 로 리포트를
// 조립해 이 함수로 올린다. 실패해도 리포트 열람(sessionStorage 경로)은 막지 않는다 —
// 리포트 페이지가 meta.attemptId 를 보고 ensureDiagnosisReportSaved 로 한 번 더 시도한다.
// upsert 멱등(attempt_id PK)이라 중복 호출은 안전하다.

import type { Json } from "@/types/database.types";

export type DiagnosisReportSaveInput = {
  attemptId: string;
  /** 제출 시점 DiagnosisInput 전문(meta·admissionCuts·admissionMeta 포함) */
  snapshot: Json;
  /** buildReport 출력 — 열람은 이 값으로 그대로 렌더한다 */
  payload: Json;
  /** snapshot.meta.schemaVersion 과 동일 */
  schemaVersion: number;
  /** snapshot.meta.diagnosedAt(ISO) */
  diagnosedAt: string;
};

export type DiagnosisReportSaveResult =
  | { ok: true }
  | { ok: false; reason: "no-session" | "rejected" | "network" };

/** POST /api/diagnosis/report — 구현은 diagnosis-persist 유닛. */
export async function saveDiagnosisReport(
  _input: DiagnosisReportSaveInput,
): Promise<DiagnosisReportSaveResult> {
  throw new Error("saveDiagnosisReport: 미구현(diagnosis-persist 유닛)");
}

/**
 * 리포트 페이지 재시도용. 저장돼 있으면 아무것도 하지 않고, 없으면 저장한다.
 * 같은 세션에서 한 번만 시도한다(sessionStorage 플래그) — 구현은 diagnosis-persist 유닛.
 */
export async function ensureDiagnosisReportSaved(
  _input: DiagnosisReportSaveInput,
): Promise<DiagnosisReportSaveResult> {
  throw new Error("ensureDiagnosisReportSaved: 미구현(diagnosis-persist 유닛)");
}
