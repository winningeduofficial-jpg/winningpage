// 학습진단 리포트 영속화 클라이언트 — 저장(service_role API 경유) 계약.
// QA 시트 행 210. 읽기(RLS select)는 src/lib/diagnosisReportQueries.ts 가 맡는다.
//
// 저장 시점: SurveyStepShell.submitDiagnosis 가 consume 성공 직후 buildReport 로 리포트를
// 조립해 이 함수로 올린다. 실패해도 리포트 열람(sessionStorage 경로)은 막지 않는다 —
// 리포트 페이지가 meta.attemptId 를 보고 ensureDiagnosisReportSaved 로 한 번 더 시도한다.
// upsert 멱등(attempt_id PK)이라 중복 호출은 안전하다.

import type { Json } from "@/types/database.types";
import { apiFetch, getAuthHeader } from "./apiFetch";

export type DiagnosisReportSaveInput = {
  attemptId: string;
  /** 제출 시점 DiagnosisInput 전문(meta·admissionCuts·admissionMeta 포함) */
  snapshot: Json;
  /** buildReport 출력 — 열람은 이 값으로 그대로 렌더한다 */
  payload: Json;
  /** snapshot.meta.schemaVersion 과 동일(SURVEY_SCHEMA_VERSION 문자열 라벨) */
  schemaVersion: string;
  /** snapshot.meta.diagnosedAt(ISO) */
  diagnosedAt: string;
};

export type DiagnosisReportSaveResult =
  | { ok: true }
  | { ok: false; reason: "no-session" | "rejected" | "network" };

// "저장 완료" 플래그 — SurveyStepShell(제출 직후 저장 성공 시)과 이 파일의
// saveDiagnosisReport(리포트 페이지의 ensureDiagnosisReportSaved 재시도 성공 시)
// 양쪽이 같은 키를 써야 중복 POST를 피한다. attemptId별로 갈라 저장 완료 여부를
// 리포트 세션(설문 재시작 전까지) 동안 기억한다 — 업서트가 멱등이라 중복 호출 자체는
// 안전하지만, 매 렌더마다 불필요한 네트워크 호출을 반복하지 않기 위한 캐시다.
const REPORT_SAVED_FLAG_PREFIX = "winning.freeDiagnosis.reportSaved:";

function reportSavedFlagKey(attemptId: string): string {
  return `${REPORT_SAVED_FLAG_PREFIX}${attemptId}`;
}

/**
 * 저장 완료 플래그 기록. saveDiagnosisReport가 성공 시 내부에서 호출하고,
 * SurveyStepShell도 제출 직후 저장 성공 시 같은 함수를 호출해 키를 공유한다 —
 * export하는 이유가 그 공유다.
 */
export function markDiagnosisReportSaved(attemptId: string): void {
  try {
    window.sessionStorage.setItem(reportSavedFlagKey(attemptId), "1");
  } catch {
    // 프라이빗 모드·용량 초과 — 플래그를 못 남겨도 저장 자체는 이미 끝났다. 최악의
    // 결과는 리포트 페이지가 ensureDiagnosisReportSaved를 한 번 더 태우는 정도다
    // (attempt_id upsert 멱등이라 안전하다).
  }
}

function isDiagnosisReportSaved(attemptId: string): boolean {
  try {
    return window.sessionStorage.getItem(reportSavedFlagKey(attemptId)) === "1";
  } catch {
    return false;
  }
}

/**
 * POST /api/diagnosis/report. 저장 실패해도 던지지 않는다 — 리포트 열람(sessionStorage
 * 경로)은 저장 성공 여부와 무관하게 이미 가능하므로, 호출부(SurveyStepShell)는 이 결과를
 * console.warn만 하고 네비게이션을 계속 진행한다.
 */
export async function saveDiagnosisReport(
  input: DiagnosisReportSaveInput,
): Promise<DiagnosisReportSaveResult> {
  try {
    const authHeader = await getAuthHeader();
    if (!authHeader) {
      return { ok: false, reason: "no-session" };
    }

    const response = await apiFetch("/api/diagnosis/report", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...authHeader,
      },
      body: JSON.stringify({
        attemptId: input.attemptId,
        snapshot: input.snapshot,
        payload: input.payload,
        schemaVersion: input.schemaVersion,
        diagnosedAt: input.diagnosedAt,
      }),
    });

    if (!response.ok) {
      return { ok: false, reason: "rejected" };
    }

    let result: { ok?: boolean } = {};
    try {
      result = await response.json();
    } catch {
      result = {};
    }
    if (result.ok !== true) {
      return { ok: false, reason: "rejected" };
    }

    markDiagnosisReportSaved(input.attemptId);
    return { ok: true };
  } catch {
    // 타임아웃(ApiFetchTimeoutError)·네트워크 단절 등 fetch 자체가 실패한 경우.
    return { ok: false, reason: "network" };
  }
}

/**
 * 리포트 페이지 재시도용. 저장돼 있으면(플래그 존재) 네트워크를 타지 않고 즉시
 * `{ ok: true }`를 돌려주고, 없으면 saveDiagnosisReport를 호출한다.
 */
export async function ensureDiagnosisReportSaved(
  input: DiagnosisReportSaveInput,
): Promise<DiagnosisReportSaveResult> {
  if (isDiagnosisReportSaved(input.attemptId)) {
    return { ok: true };
  }
  return saveDiagnosisReport(input);
}
