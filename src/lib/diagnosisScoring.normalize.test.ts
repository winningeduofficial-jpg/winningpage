// diagnosisScoring 엔진 — §3 정규화 관통 검증(원시 answers → DiagnosisInput → 영역 점수).
// 원본: scripts/verify-diagnosis-scoring.mjs S1b.

import { expect, test } from "vitest";
import {
  LIKERT1_KEYS,
  OPTION_CODES,
  OPTION_SOURCE_QUESTION,
} from "@/data/diagnosisScoringTable.ts";
import { buildReport } from "@/lib/diagnosisReport.ts";
import {
  isAnswered,
  isQuestionAnswered,
  isStepComplete,
} from "@/lib/renewalSurvey.ts";
import {
  labelOf,
  normalizeAnswersOf,
  questionById,
  scoreAreasOf,
} from "./diagnosisScoringTestFixtures.ts";

/* ================================================================== *
 * S1b. §3 정규화 관통 — 원시 answers → DiagnosisInput → 영역 점수
 *
 * 나머지 케이스는 DiagnosisInput 을 손으로 조립해 §3 계층을 통째로 건너뛴다. 그러면
 * 리커트 방향 반전(0='매우 그렇다' → 100)이 뒤집혀도 12영역 점수가 전부 반전된 채 통과한다.
 * 여기서 한 번은 UI 가 실제로 저장하는 모양(라벨 문자열 · 컬럼 인덱스 · 문자열 숫자)에서 출발한다.
 * ================================================================== */

// 라벨 → 코드 왕복. 전 그룹을 돌아 서수 계약이 UI·채점 양쪽에서 같은 코드를 내는지 못박는다.
Object.entries(OPTION_SOURCE_QUESTION).forEach(([group, questionId]) => {
  const codes = OPTION_CODES[group];
  test(`${questionId} 라벨→코드 왕복 (${codes.length}지)`, () => {
    expect(codes.every((code) => labelOf(questionId, code) != null)).toBe(true);
  });
});

// 리커트 방향(§3.3). LikertMatrix 는 컬럼 인덱스를 저장하고 배점표는 100='매우 그렇다' 다.
const likertRaw = normalizeAnswersOf({
  q9: { LK1_01: 0, LK1_02: 1, LK1_03: 2, LK1_04: 3, LK1_05: 4 },
});
test("컬럼 0(매우 그렇다) → 100", () => {
  expect(likertRaw.likert1.LK1_01).toEqual(100);
});
test("컬럼 1 → 75", () => {
  expect(likertRaw.likert1.LK1_02).toEqual(75);
});
test("컬럼 2(보통이다) → 50", () => {
  expect(likertRaw.likert1.LK1_03).toEqual(50);
});
test("컬럼 3 → 25", () => {
  expect(likertRaw.likert1.LK1_04).toEqual(25);
});
test("컬럼 4(전혀 그렇지 않다) → 0", () => {
  expect(likertRaw.likert1.LK1_05).toEqual(0);
});
test("미응답 문장은 null(0 이 아니다)", () => {
  expect(likertRaw.likert1.LK1_06).toEqual(null);
});
test("정의역 밖 컬럼(5)은 null", () => {
  expect(normalizeAnswersOf({ q9: { LK1_01: 5 } }).likert1.LK1_01).toEqual(
    null,
  );
});

// CASE-01 을 원시 응답에서 다시 재현한다 — 정규화가 한 칸이라도 어긋나면 41 이 나오지 않는다.
const case01RawAnswers = {
  q9: { LK1_03: 2, LK1_04: 3 }, // '보통이다' / '별로 그렇지 않다'
  q10: [labelOf("q10", "OBS_02")],
};
const case01FromRaw = normalizeAnswersOf(case01RawAnswers, {
  diagnosedAt: "2026-08-11T00:00:00.000Z",
});
test("라벨 → 코드 (q10 두 번째 선택지 = OBS_02)", () => {
  expect(case01FromRaw.obstacles).toEqual(["OBS_02"]);
});
test("정규화 관통 CASE-01: 계획 설계 = 41", () => {
  expect(scoreAreasOf(case01FromRaw).PLAN).toEqual(41);
});
test("meta.diagnosedAt 은 호출부가 넣는다", () => {
  expect(case01FromRaw.meta.diagnosedAt).toEqual("2026-08-11T00:00:00.000Z");
});

// 리포트 영속화(diagnosis_reports) — SurveyStepShell이 제출 플로우당 1회 만든
// attemptId를 meta에 실어 sessionStorage로 함께 저장한다(리포트 페이지 재시도 근거).
test("meta.attemptId 가 있으면 그대로 담긴다", () => {
  expect(
    normalizeAnswersOf(
      {},
      { attemptId: "98af95da-47bf-4cee-8a2e-7d70d07fb1c9" },
    ).meta.attemptId,
  ).toEqual("98af95da-47bf-4cee-8a2e-7d70d07fb1c9");
});
test("meta.attemptId 가 없으면 null(구 버전 payload와 하위 호환)", () => {
  expect(normalizeAnswersOf({}).meta.attemptId).toEqual(null);
});

// 전 문항을 라벨로 채운 응답 1건. 코드 매핑·grade-grid 문자열 파싱·admissionQuery 4단 게이트를 함께 태운다.
const fullRawAnswers = {
  q1: labelOf("q1", "H2"),
  q2: labelOf("q2", "GENERAL"),
  q3: labelOf("q3", "BOTH"),
  "q3-target-reason": labelOf("q3-target-reason", "APTITUDE"),
  "q3-target-university": "  위닝대학교  ",
  "q3-target-major": "경영학과",
  q4: labelOf("q4", "FIVE"),
  q6: {
    overall_avg: "2.00",
    recent_exam_avg: "",
    mock_korean: "1",
    mock_math: "2",
    mock_english: "",
  },
  q8: labelOf("q8", "FLAT"),
  "q8-followup": labelOf("q8-followup", "MATH"),
  q10: [labelOf("q10", "OBS_01"), labelOf("q10", "OBS_05")],
  q12: [labelOf("q12", "DIF_10")],
  q13: labelOf("q13", "EXAM_2W"),
  q14: [labelOf("q14", "WISH_07")],
  q15: {
    university: "위닝대학교",
    department: "경영학과",
    admissionType: "학생부교과",
    detailType: "일반전형",
  },
  q16: labelOf("q16", "HIGH"),
  q17: labelOf("q17", "CONNECTED"),
  q18: labelOf("q18", "CONFIDENT"),
  q19: "요즘 성적 때문에 불안해요",
};
const fullInput = normalizeAnswersOf(fullRawAnswers);
test("q1 → gradeLevel", () => {
  expect(fullInput.profile.gradeLevel).toEqual("H2");
});
test("q4 → gradeSystem", () => {
  expect(fullInput.gradeSystem).toEqual("FIVE");
});
// F-13(2026-08-12 확정, Q-31 종결) — q4 는 4지(9등급제·5등급제·중학생 평균·잘 모르겠어요)로
// 확정이다. 시안(1889:9104/9109/9114)도 처음부터 3지(잘 모르겠어요 제외)만 표기해 성취평가제
// (A~E) 전용 선택지가 시안에 존재한 적이 없다 — 5지로 늘어나면(성취평가제 부활) 여기서 잡힌다.
test("F-13 — q4 선택지는 4지 고정(성취평가제 전용 선택지 없음)", () => {
  expect(
    questionById.get("q4")?.optionCodes?.length === 4 &&
      ["NINE", "FIVE", "MIDDLE_AVG", "UNKNOWN"].every((code) =>
        questionById.get("q4")?.optionCodes?.includes(code),
      ),
  ).toBe(true);
});
test("q8-followup 은 라벨이 아니라 코드로 담긴다(§3.5)", () => {
  expect(fullInput.trendSubject).toEqual("MATH");
});
test("grade-grid 문자열 → 숫자", () => {
  expect(fullInput.scores.naesinOverall).toEqual(2);
});
test("빈 문자열 칸은 null (NaN 차단)", () => {
  expect(fullInput.scores.recentExamAvg).toEqual(null);
});
test("mockFilledCount = 채워진 칸 수", () => {
  expect(fullInput.scores.mockFilledCount).toEqual(2);
});
test("자유 텍스트는 trim 후 저장", () => {
  expect(fullInput.goal.targetUniversity).toEqual("위닝대학교");
});
test("복수선택은 코드 배열", () => {
  expect(fullInput.difficulties).toEqual(["DIF_10"]);
});
test("4단이 전부 채워지면 admissionQuery 객체", () => {
  expect(fullInput.admissionQuery != null).toBe(true);
});
test("q15 가 3단까지만 채워지면 admissionQuery = null", () => {
  expect(
    normalizeAnswersOf({
      q15: {
        university: "위닝대학교",
        department: "경영학과",
        admissionType: "학생부교과",
      },
    }).admissionQuery,
  ).toEqual(null);
});
test("미지 라벨은 null", () => {
  expect(
    normalizeAnswersOf({ q1: "존재하지 않는 선택지" }).profile.gradeLevel,
  ).toEqual(null);
});
test("입력이 없어도 죽지 않는다", () => {
  expect(normalizeAnswersOf(undefined).gradeSystem).toEqual(null);
});

// Q-01 확정(2026-08-11) — 이름은 폼 문항이 아니라 SurveyStepShell 제출 시점에 meta.name 으로
// 주입된다(로그인 세션의 profiles.name). 비로그인·조회 실패는 meta.name 이 없어 익명 폴백을 탄다.
test("meta.name 이 있으면 profile.name 에 그대로 담긴다", () => {
  expect(normalizeAnswersOf({}, { name: "김주원" }).profile.name).toEqual(
    "김주원",
  );
});
test("meta.name 이 없으면 profile.name = null(익명 폴백)", () => {
  expect(normalizeAnswersOf({}).profile.name).toEqual(null);
});
test('name 있으면 traitsHeading = "{name} 학생의 주요 학습 특성"', () => {
  expect(
    buildReport(normalizeAnswersOf({}, { name: "김주원" })).traitsHeading,
  ).toEqual("김주원 학생의 주요 학습 특성");
});
test("name 없으면 traitsHeading 이 축약형(TRAITS_HEADING_ANON, 토큰 노출 없음)", () => {
  expect(buildReport(normalizeAnswersOf({})).traitsHeading).toEqual(
    "주요 학습 특성",
  );
});
test('name 없어도 헤드라인은 완결 문장이다([head] 단독 — "{name}" 토큰이 그대로 남지 않는다)', () => {
  expect(
    buildReport(normalizeAnswersOf({})).headlineLines.every(
      (line) => !line.includes("{") && !line.includes("undefined"),
    ),
  ).toBe(true);
});

// §3.4 — 중학생 평균은 '등급' 개념이 없어 모의고사·최근시험 그룹이 화면에서 숨겨진다.
// GradeInputGrid 는 되돌릴 때를 위해 숨긴 칸의 값을 보존하므로, 채점이 그 값을 읽으면
// 체계를 바꾼 것만으로 교과 관리 aux 가 5 → 10 으로 오르는 조용한 오채점이 된다.
const middleAvgInput = normalizeAnswersOf({
  ...fullRawAnswers,
  q4: labelOf("q4", "MIDDLE_AVG"),
  q6: {
    overall_avg: "88.5",
    recent_exam_avg: "3.00",
    mock_korean: "1",
    mock_math: "2",
  },
});
test("MIDDLE_AVG 는 모의고사 칸을 읽지 않는다", () => {
  expect(middleAvgInput.scores.mockFilledCount).toEqual(0);
});
test("MIDDLE_AVG 는 최근시험 칸을 읽지 않는다", () => {
  expect(middleAvgInput.scores.recentExamAvg).toEqual(null);
});
test("MIDDLE_AVG 라도 전체 평균은 읽는다", () => {
  expect(middleAvgInput.scores.naesinOverall).toEqual(88.5);
});

// §3.4 B-08 — 그룹 단위 isAnswered 는 모의고사 1칸만 채워도 통과시킨다. 그 경로로 진행하면
// naesinOverall 이 null 인 채 리포트에 도달해 gpa '미입력' + 입결 표 0행이 된다.
// 진행 판정은 반드시 requiredFields 를 보는 isQuestionAnswered 를 써야 한다.
const q6 = questionById.get("q6");
test("q6 는 전체 평균을 칸 단위 필수로 선언한다", () => {
  expect(q6?.requiredFields).toEqual(["overall_avg"]);
});
test("모의고사 1칸만 채우면 미응답으로 친다(B-08)", () => {
  expect(!isQuestionAnswered(q6, { mock_korean: "1" })).toBe(true);
});
test("전체 평균이 채워지면 응답으로 친다", () => {
  expect(isQuestionAnswered(q6, { overall_avg: "3.24" })).toBe(true);
});
test("스텝 2 는 전체 평균 없이 완료되지 않는다", () => {
  expect(
    !isStepComplete(2, { q6: { mock_korean: "1" }, q8: labelOf("q8", "FLAT") }),
  ).toBe(true);
});
// 하위 술어(isAnswered)는 문항 메타를 못 본다 — 이 차이가 곧 B-08 구멍이므로 명시적으로 못박는다.
test("isAnswered 단독으로는 이 구멍이 막히지 않는다", () => {
  expect(isAnswered("grade-grid", { mock_korean: "1" })).toBe(true);
});

// Q-10 확정(2026-08-11) — 리커트 12문장 완주 게이트. 산식(scalePartOf)은 분모 1을 허용하지만
// 진행 판정(isQuestionAnswered)은 12문장 전부를 요구한다 — 1클릭 만점 리포트를 UI 단에서 막는다.
const q9 = questionById.get("q9");
test("리커트는 isAnswered 하나만으로는 통과하지 않게 requiredFields 대신 문장 수를 본다", () => {
  expect(q9?.type === "likert").toBe(true);
});
test("리커트 11/12문장만 응답 → 미완료(1문장만 응답으로 만점 리포트가 나가는 경로 차단)", () => {
  expect(
    !isQuestionAnswered(
      q9,
      Object.fromEntries(LIKERT1_KEYS.slice(0, 11).map((key) => [key, 0])),
    ),
  ).toBe(true);
});
test("리커트 12/12문장 전부 응답 → 완료", () => {
  expect(
    isQuestionAnswered(
      q9,
      Object.fromEntries(LIKERT1_KEYS.map((key) => [key, 0])),
    ),
  ).toBe(true);
});
test("리커트 1문장만 응답 → 미완료(분모 1 산식과 UI 게이트는 별개)", () => {
  expect(!isQuestionAnswered(q9, { LK1_05: 0 })).toBe(true);
});
