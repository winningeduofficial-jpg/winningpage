// STEP1 요약 말풍선 조립 회귀 — QA "학교 유형: high" 원시 값 노출 버그.
//
// `session.schoolType`은 `profiles.school_type` 스냅샷이다. 실서비스 저장 경로
// (`ProfileTab`/`Under14Form`)는 코드값을 쓰지 않고 한글 원문("고등학교" 등)을 그대로
// 저장하므로 `buildBasicInfoSummary`는 값을 라벨로 "변환"하지 않는다. `SCHOOL_TYPES`
// 화이트리스트는 오염값 방어용이다 — 로컬 시드 스크립트가 한때 `school_type = 'high'`를
// 넣었던 것처럼 정상 저장 경로를 거치지 않은 값이 원시 문자열로 새는 것만 막는다.
import { describe, expect, test } from "vitest";
import { buildBasicInfoSummary } from "./PerformanceChatPage";

describe("buildBasicInfoSummary", () => {
  test("화이트리스트에 있는 school_type('고등학교')은 그대로 표시한다", () => {
    const summary = buildBasicInfoSummary({
      gradeLabel: "고1",
      semester: "1학기",
      schoolType: "고등학교",
      subjectGroup: "국어",
      subject: "공통국어 1",
      careerGoal: "의학",
    });

    expect(summary).toBe(
      "학년: 고1 1학기 / 학교 유형: 고등학교 / 과목: 국어 / 공통국어 1 / 진로: 의학",
    );
  });

  test("화이트리스트에 없는 오염값('high')은 절 자체를 생략한다", () => {
    const summary = buildBasicInfoSummary({
      gradeLabel: "고1",
      semester: "1학기",
      schoolType: "high",
      subjectGroup: "국어",
      subject: "공통국어 1",
      careerGoal: "의학",
    });

    expect(summary).toBe(
      "학년: 고1 1학기 / 과목: 국어 / 공통국어 1 / 진로: 의학",
    );
    expect(summary).not.toContain("학교 유형");
    expect(summary).not.toContain("high");
  });
});
