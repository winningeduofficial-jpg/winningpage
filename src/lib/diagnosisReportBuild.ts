// 학습진단 리포트 조립 헬퍼 — buildReport(input, ctx) 호출 시 ctx(admissionCuts 계열
// sibling 필드 → BuildReportCtx)를 조립하는 규칙의 정본이다.
//
// 이 로직은 원래 FreeDiagnosisReport.tsx의 data useMemo 블록에만 있었다. 리포트
// 영속화(diagnosis_reports)가 생기면서 SurveyStepShell.submitDiagnosis도 저장용
// payload를 만들려면 같은 조립을 해야 하는데, 두 곳이 각자 인라인으로 들고 있으면
// 한쪽만 고쳤을 때 "저장된 리포트"와 "그 자리에서 보여준 리포트"가 조용히 갈라진다.
//
// FreeDiagnosisReport.tsx는 아직 이 헬퍼로 교체되지 않았다(diagnosis-view 유닛 소관,
// 이 배치 범위 밖) — 그 페이지의 인라인 로직과 이 파일은 당분간 중복된 채로 남는다.
// 이후 교체 시 이 파일의 buildReportFromInput(input)을 그대로 쓰면 된다.
//
// ComponentProps<typeof ReportPageOne|Two>를 import하지 않는다 — 리포트 컴포넌트
// 모듈이 인쇄 CSS(report-print.css 등)를 끌고 오므로, 저장 경로(SurveyStepShell)가
// 그 컴포넌트 타입만 빌리려다 번들에 딸려 들어오는 것을 피한다. buildReport의 반환
// 타입은 그대로 추론(ReturnType) 되므로 별도 타입 선언이 필요 없다.

import { buildReport } from "./diagnosisReport";

type DiagnosisInputLike = {
  admissionCuts?: {
    cut50: number | null;
    cut70: number | null;
    finalAvg: number | null;
  } | null;
  admissionCutsError?: boolean;
  admissionMeta?: { year: string | number | null } | null;
};

/**
 * DiagnosisInput(+ B-1 sibling 필드: admissionCuts/admissionCutsError/admissionMeta) →
 * 리포트 본문. FreeDiagnosisReport.tsx의 data useMemo 블록과 동일한 ctx 조립 규칙이다
 * (exactOptionalPropertyTypes 대응 — 값이 undefined면 ctx 키 자체를 생략한다).
 *
 * @param input normalizeAnswers() 결과 또는 diagnosisInputStorage 저장 payload(둘 다
 *   admissionCuts 등 sibling 필드가 있을 수도, 없을 수도 있다).
 */
export function buildReportFromInput(input: unknown) {
  const typedInput: DiagnosisInputLike =
    input && typeof input === "object" ? (input as DiagnosisInputLike) : {};

  return buildReport(input, {
    ...(typedInput.admissionCuts !== undefined
      ? { cuts: typedInput.admissionCuts }
      : {}),
    ...(typedInput.admissionCutsError !== undefined
      ? { cutsError: typedInput.admissionCutsError }
      : {}),
    ...(typedInput.admissionMeta !== undefined
      ? { admissionMeta: typedInput.admissionMeta }
      : {}),
  });
}
