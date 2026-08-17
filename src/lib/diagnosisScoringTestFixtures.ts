// diagnosisScoring/diagnosisReport 테스트 전용 공유 픽스처.
//
// scripts/verify-diagnosis-scoring.mjs(10.7 이식 대상)가 하나의 파일 안에서 쓰던 공통
// 헬퍼를 그대로 옮겼다 — 여러 섹션이 동일한 makeInput/makeAreaScores/sourceOf 를 공유했으므로
// 분할된 각 테스트 파일에서 중복 정의하지 않는다.

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { AREA_CODES, EXAMPLE_CASES } from "@/data/diagnosisScoringTable.ts";
import { renewalSurveyQuestions } from "@/data/renewalSurveyQuestions.ts";
import { normalizeAnswers, scoreAreas } from "@/lib/diagnosisScoring.ts";

// import.meta.url 기반 경로는 Vitest 의 의존성 스캔 단계(esbuild 프리번들링)에서 모듈 최상위
// 코드가 file: 이 아닌 URL 로 한 번 더 평가돼 "The URL must be of scheme file" 로 죽는다(테스트
// 콜백 안에서는 재현되지 않는다 — 스캔이 끝난 뒤라서다). vitest/npm test 는 항상 저장소 루트에서
// 실행되므로 process.cwd() 기준 경로로 우회한다.
const SRC_ROOT = join(process.cwd(), "src") + "/";

/** 주석을 걷어낸다 — 근거·경위를 적은 주석에 값이 인용되는 것은 정상이고, 그것까지 위반으로 세면 주석을 못 쓴다. */
export function stripComments(text: string) {
  return text
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/[^\n]*/g, "$1");
}

export function sourceOf(relativePath: string) {
  return stripComments(readFileSync(SRC_ROOT + relativePath, "utf8"));
}

export function existsInSrc(relativePath: string) {
  return existsSync(SRC_ROOT + relativePath);
}

export const questionById = new Map(
  renewalSurveyQuestions.map((question) => [question.id, question]),
);
export const optionsOf = (id: string) => questionById.get(id)?.options ?? [];
export const statementsOf = (id: string) =>
  questionById.get(id)?.extra?.statements ?? [];

/** 코드 → 화면 라벨. 원시 answers 를 손으로 적지 않고 문항 데이터에서 만들기 위한 역변환이다. */
export function labelOf(questionId: string, code: string) {
  const question = questionById.get(questionId);
  const index = question?.optionCodes?.indexOf(code) ?? -1;
  return index === -1 ? null : (question?.options?.[index] ?? null);
}

/** DiagnosisInput 최소 골격. 엔진이 옵셔널 체이닝으로 견디지만 픽스처는 실제 shape 를 쓴다. */
export function makeInput(overrides: Record<string, unknown> = {}) {
  return {
    meta: { schemaVersion: "test", diagnosedAt: null },
    profile: { name: null, gradeLevel: null, schoolType: null },
    goal: {
      level: null,
      reason: null,
      targetUniversity: null,
      targetMajor: null,
    },
    gradeSystem: null,
    scores: {
      naesinOverall: null,
      recentExamAvg: null,
      mock: {},
      mockFilledCount: 0,
    },
    gradeTrend: null,
    trendSubject: null,
    likert1: {},
    likert2: {},
    obstacles: [],
    difficulties: [],
    schedule: null,
    wishes: [],
    admissionQuery: null,
    csatMin: null,
    jonghapReady: null,
    interviewReady: null,
    freeText: "",
    ...overrides,
  };
}

/** 12영역을 한 값으로 채운 뒤 일부만 덮어쓴다. 긴급도·서비스 케이스가 12영역 전부를 요구한다. */
export function makeAreaScores(
  base: number,
  overrides: Record<string, number> = {},
) {
  const scores: Record<string, number> = {};
  for (const area of AREA_CODES) {
    scores[area] = base;
  }
  return { ...scores, ...overrides };
}

const caseById = new Map(EXAMPLE_CASES.map((item) => [item.id, item]));

/** scoreAreas 는 소스에서 반환 타입 주석 없이 `{}` 리터럴로 시작해 TS 가 빈 객체 타입으로
 * 추론한다(생산 코드는 결과를 이름으로 읽지 않고 그대로 전달만 해 지금까지 드러나지 않았다).
 * 테스트는 영역 코드로 직접 읽으므로 여기서 한 번만 캐스팅해 호출부마다 반복하지 않는다. */
export function scoreAreasOf(input: unknown): Record<string, number> {
  return scoreAreas(input) as Record<string, number>;
}

/** normalizeAnswers 도 scoreAreasOf 와 같은 이유로 반환 타입이 `{}` 로 좁혀진다. DiagnosisInput
 * 셰이프(likert1/profile/scores/goal 등)를 그대로 신뢰해도 되는 테스트 전용 캐스팅이다. */
export function normalizeAnswersOf(
  answers: unknown,
  meta?: { diagnosedAt?: string | null; name?: string | null },
  // biome-ignore lint/suspicious/noExplicitAny: normalizeAnswers 반환 셰이프가 소스에 타입 주석이 없다.
): any {
  return normalizeAnswers((answers ?? {}) as Record<string, unknown>, meta);
}

/** caseById.get 은 Map#get 이라 `T | undefined` 다 — 픽스처 존재를 전제하는 호출부에서 매번 옵셔널
 * 체이닝을 반복하지 않도록 없으면 즉시 던진다(있어야 할 EXAMPLE_CASES 항목이 조용히 사라지는 것을 막는다).
 * 반환 타입은 의도적으로 any 다 — CASE-01~05 는 expected 셰이프가 케이스마다 전혀 달라(scalePart ·
 * page1Overall · band · fit 등) 유니온을 만들면 존재하는 필드도 다른 케이스의 셰이프에 끌려
 * `possibly undefined` 로 오염된다. */
// biome-ignore lint/suspicious/noExplicitAny: EXAMPLE_CASES 는 케이스마다 expected 셰이프가 달라 any가 맞다.
export function getCase(id: string): any {
  const item = caseById.get(id);
  if (!item) throw new Error(`EXAMPLE_CASES 에 id='${id}' 픽스처가 없다`);
  return item;
}

/** ReportData 전체에서 미치환 토큰('{gap}' · '{영역}')을 찾는다. 화면에 리터럴이 나가는 사고를 막는다. */
export function unfilledTokens(value: unknown, out: string[] = []): string[] {
  if (typeof value === "string") {
    const hits = value.match(/\{(\w+|영역)\}/g);
    if (hits) out.push(...hits);
    return out;
  }
  if (value && typeof value === "object")
    Object.values(value).forEach((item) => {
      unfilledTokens(item, out);
    });
  return out;
}
