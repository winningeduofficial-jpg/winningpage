// diagnosisScoring 엔진 — 결측·배타·NaN 미발생(§8 CASE-08 전반부).
// 원본: scripts/verify-diagnosis-scoring.mjs S10 전반부(학생 유형 분류 이전).

import { expect, test } from "vitest";
import { COPY_FALLBACK, TEMPLATE_COPY } from "@/data/diagnosisCopy.ts";
import {
  AREA_CODES,
  LIKERT1_KEYS,
  MOCK_FILL_POINTS,
  TARGET_SCORE,
} from "@/data/diagnosisScoringTable.ts";
import {
  overallScore,
  roundHalfUp,
  targetGap,
} from "@/lib/diagnosisScoring.ts";
import {
  makeAreaScores,
  makeInput,
  scoreAreasOf,
} from "./diagnosisScoringTestFixtures.ts";

/* ================================================================== *
 * S10. §8 CASE-08 — 결측·배타·NaN 미발생
 * ================================================================== */

// 배타 선택지는 "체크하지 않은 것과 같은 결과"여야 한다. 감점 0 을 개별 영역마다 세는 대신
// 결과 전체를 미체크 결과와 대조한다 — 영역 하나라도 새면 바로 드러난다.
const baseAreas = scoreAreasOf(makeInput());
test("OBS_13 단독 체크 = 미체크와 동일", () => {
  expect(scoreAreasOf(makeInput({ obstacles: ["OBS_13"] }))).toEqual(baseAreas);
});
test("DIF_14 단독 체크 = 미체크와 동일", () => {
  expect(scoreAreasOf(makeInput({ difficulties: ["DIF_14"] }))).toEqual(
    baseAreas,
  );
});

// 모의고사 칸수 → 교과 관리 aux. SUBJECT base 20 이라 areaScore = 20 + aux 다(척도 결측).
const subjectWithMock = (filledCount: number) =>
  scoreAreasOf(
    makeInput({
      scores: {
        naesinOverall: null,
        recentExamAvg: null,
        mock: {},
        mockFilledCount: filledCount,
      },
    }),
  ).SUBJECT as number;

// Q-09 확정(2026-08-11) — 6키 룩업 7칸 전량을 단언 1블록으로 덮는다. roundHalfUp 은
// scoreAreas 의 정수화(§4.2.2)를 재현한다(20 이 정수라 반올림이 aux 쪽으로만 걸린다).
[0, 1, 2, 3, 4, 5, 6].forEach((count) => {
  test(`모의고사 ${count}칸 → aux ${MOCK_FILL_POINTS[count]}`, () => {
    expect(subjectWithMock(count) - 20).toEqual(
      roundHalfUp(MOCK_FILL_POINTS[count]),
    );
  });
  test(`모의고사 ${count}칸에서 NaN 미발생`, () => {
    expect(Number.isFinite(subjectWithMock(count))).toBe(true);
  });
});
// 3칸(aux 7.5→28)과 4칸(aux 8→28)은 정수 반올림 후 SUBJECT 화면 점수가 같다 — 앵커 간격이
// 2칸→4칸 사이 +1점뿐인 구조적 결과이지 버그가 아니다(diagnosisScoringTable.js MOCK_FILL_POINTS 주석).
test("모의고사 3칸과 4칸은 SUBJECT 화면 점수가 같다(정수 반올림 동점, 기대 동작)", () => {
  expect(subjectWithMock(3)).toEqual(subjectWithMock(4));
});

// q3 '아직 구체적인 목표가 없어요' → 이유 문항 미노출 → goal.reason 상시 null.
// GOAL_REASON_POINTS[null] 폴백이 없으면 aux = 0 + undefined = NaN 이 되어 리포트 전체가 무너진다.
const goalNone = scoreAreasOf(
  makeInput({
    goal: {
      level: "NONE",
      reason: null,
      targetUniversity: null,
      targetMajor: null,
    },
  }),
);
test("goal.level=NONE · reason=null → GOAL aux = 0", () => {
  expect(goalNone.GOAL).toEqual(0);
});
test("goal.reason=null 에서 NaN 미발생", () => {
  expect(Number.isFinite(goalNone.GOAL)).toBe(true);
});
test("goal 실질 만점 = 90 (척도 70 + level 20)", () => {
  expect(
    scoreAreasOf(
      makeInput({
        goal: {
          level: "BOTH",
          reason: null,
          targetUniversity: null,
          targetMajor: null,
        },
        likert1: Object.fromEntries(LIKERT1_KEYS.map((key) => [key, 100])),
      }),
    ).GOAL,
  ).toEqual(90);
});

// Q-10 확정(2026-08-11) — 분모 = 응답한 문장 수(산식 0줄 변경, 문구집 SKIP_NOTE 원문 그대로).
// 완주 게이트는 UI 진행 판정(isQuestionAnswered)에만 걸리고 엔진 산식은 분모 1을 그대로 허용한다.
// 리커트 2문장 모두 결측 → scalePart 0. EXEC base 20 + TREND(미응답 0) = 20.
test("q9 문장5·6 둘 다 미응답 → EXEC scalePart = 0", () => {
  expect(scoreAreasOf(makeInput()).EXEC).toEqual(20);
});
// 1문장만 응답하면 분모 1 이다(§4.2 결측 · Q-10 확정 — UI 게이트는 별도).
test("리커트 1문장만 응답 → 분모 1", () => {
  expect(scoreAreasOf(makeInput({ likert1: { LK1_05: 100 } })).EXEC).toEqual(
    90,
  );
});

// Q-29 확정(2026-08-11) — gap <= 0 이면 card_urgent 대신 card_goal_met 전용 키(제목+부제 동시
// 교체)로 렌더된다. '목표까지 0점 부족'이 렌더되면 안 되는 경로다. 엔진은 reached 로 신호만 준다.
const reachedGap = targetGap(makeAreaScores(80));
test("PAGE1 최저 >= 75 → reached = true", () => {
  expect(reachedGap.reached === true).toBe(true);
});
test("gap 은 clamp 하지 않는다(부호를 호출부에 그대로 넘긴다)", () => {
  expect(reachedGap.gap).toEqual(TARGET_SCORE - 80);
});
test("신규 키 card_goal_met.title", () => {
  expect(TEMPLATE_COPY["card_goal_met.title"]).toEqual("가장 낮은 영역");
});
test("신규 키 card_goal_met.sub", () => {
  expect(TEMPLATE_COPY["card_goal_met.sub"]).toEqual(
    "모든 영역이 목표 점수에 도달했습니다",
  );
});
test("COPY_FALLBACK 은 VALUE_MISSING 하나만 남는다(URGENT_GOAL_REACHED 삭제)", () => {
  expect(Object.keys(COPY_FALLBACK)).toEqual(["VALUE_MISSING"]);
});

// 미응답 투성이 입력에서도 12영역이 전부 유한 정수여야 한다 — NaN 은 종합·뱃지·gap 까지 전파된다.
const emptyAreas = scoreAreasOf(makeInput());
test("빈 입력에서 12영역 전부 유한 정수", () => {
  expect(AREA_CODES.every((area) => Number.isInteger(emptyAreas[area]))).toBe(
    true,
  );
});
test("빈 입력에서 종합 점수도 유한수", () => {
  expect(
    Number.isFinite(overallScore(emptyAreas, 1)) &&
      Number.isFinite(overallScore(emptyAreas, 2)),
  ).toBe(true);
});
test("입력이 아예 없어도(undefined) 죽지 않는다", () => {
  expect(Number.isFinite(scoreAreasOf(undefined).GOAL)).toEqual(true);
});
test("미지 라벨 코드는 조용히 버린다", () => {
  expect(scoreAreasOf(makeInput({ obstacles: ["OBS_99"] }))).toEqual(baseAreas);
});
