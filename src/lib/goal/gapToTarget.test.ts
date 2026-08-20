import { describe, expect, it } from "vitest";
import {
  buildGapRows,
  mogoGap,
  naesinGap,
  studyGap,
} from "./gapToTarget.ts";

describe("naesinGap", () => {
  it("현재 등급이 목표보다 나쁘면(수치가 크면) 양수(부족)를 반환한다", () => {
    expect(naesinGap(3.24, 2.71)).toBeCloseTo(0.53, 2);
  });

  it("현재 등급이 목표보다 좋으면(수치가 작으면) 음수(우위)를 반환한다", () => {
    expect(naesinGap(2.0, 2.71)).toBeCloseTo(-0.71, 2);
  });

  it("정확히 목표와 같으면 0을 반환한다", () => {
    expect(naesinGap(2.71, 2.71)).toBe(0);
  });

  it("현재값이 null이면 null을 반환한다", () => {
    expect(naesinGap(null, 2.71)).toBeNull();
  });

  it("목표값이 null이면 null을 반환한다", () => {
    expect(naesinGap(3.24, null)).toBeNull();
  });
});

describe("mogoGap", () => {
  it("현재 백분위가 목표보다 낮으면 양수(부족)를 반환한다", () => {
    expect(mogoGap(78.4, 92.0)).toBeCloseTo(13.6, 1);
  });

  it("현재 백분위가 목표보다 높으면 음수(우위)를 반환한다", () => {
    expect(mogoGap(95.0, 92.0)).toBeCloseTo(-3.0, 1);
  });

  it("정확히 목표와 같으면 0을 반환한다", () => {
    expect(mogoGap(92.0, 92.0)).toBe(0);
  });

  it("현재값이 null이면 null을 반환한다", () => {
    expect(mogoGap(null, 92.0)).toBeNull();
  });

  it("목표값이 null이면 null을 반환한다(정시 컷 미확보)", () => {
    expect(mogoGap(78.4, null)).toBeNull();
  });
});

describe("studyGap", () => {
  it("최근 평균이 목표보다 적으면 양수(부족)를 반환한다", () => {
    expect(studyGap(3.2, 6.5)).toBeCloseTo(3.3, 1);
  });

  it("최근 평균이 목표보다 많으면 음수(우위)를 반환한다", () => {
    expect(studyGap(7.0, 6.5)).toBeCloseTo(-0.5, 1);
  });

  it("정확히 목표와 같으면 0을 반환한다", () => {
    expect(studyGap(6.5, 6.5)).toBe(0);
  });

  it("최근 실측이 없으면(기록 0건) null을 반환한다", () => {
    expect(studyGap(null, 6.5)).toBeNull();
  });

  it("목표 시간이 null이면 null을 반환한다", () => {
    expect(studyGap(3.2, null)).toBeNull();
  });
});

describe("buildGapRows", () => {
  it("3축 전부 값이 있으면 3행을 순서대로(내신·모의고사·학습 시간) 만든다", () => {
    const rows = buildGapRows({
      naesin: { current: 3.24, target: 2.71 },
      mogo: { current: 78.4, target: 92.0 },
      study: { current: 3.2, target: 6.5 },
    });

    expect(rows).toHaveLength(3);
    expect(rows.map((r) => r.label)).toEqual([
      "내신 등급",
      "모의고사",
      "학습 시간",
    ]);
    expect(rows[0]).toEqual({
      label: "내신 등급",
      description: "현재 3.24등급 → 목표 2.71등급 (이상 목표 기준)",
      remaining: "0.53등급 부족",
    });
    expect(rows[1]).toEqual({
      label: "모의고사",
      description: "현재 78.4 백분위 → 목표 92.0 백분위 (이상 목표 기준)",
      remaining: "13.6 부족",
    });
    expect(rows[2]).toEqual({
      label: "학습 시간",
      description: "현재 3.2시간/일 → 목표 6.5시간/일",
      remaining: "3.3시간 부족",
    });
  });

  it("우위인 축은 '우위' 문구를 쓴다", () => {
    const rows = buildGapRows({
      naesin: { current: 1.5, target: 2.71 },
      mogo: { current: null, target: null },
      study: { current: null, target: null },
    });
    expect(rows).toEqual([
      {
        label: "내신 등급",
        description: "현재 1.50등급 → 목표 2.71등급 (이상 목표 기준)",
        remaining: "1.21등급 우위",
      },
    ]);
  });

  it("일부 축만 값이 없으면 그 행만 제외한다(억지 산출 금지)", () => {
    const rows = buildGapRows({
      naesin: { current: 3.24, target: 2.71 },
      mogo: { current: 78.4, target: null }, // 정시 컷 미확보
      study: { current: null, target: 6.5 }, // 기록 0건
    });
    expect(rows.map((r) => r.label)).toEqual(["내신 등급"]);
  });

  it("3축 전부 값이 없으면 빈 배열을 반환한다(카드 자체 숨김)", () => {
    const rows = buildGapRows({
      naesin: { current: null, target: null },
      mogo: { current: null, target: null },
      study: { current: null, target: null },
    });
    expect(rows).toEqual([]);
  });
});
