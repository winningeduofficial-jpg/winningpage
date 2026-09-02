import { describe, expect, it } from "vitest";
import {
  buildGapRows,
  buildZoneGapRows,
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
      description: "현재 3.24등급 → 목표 2.71등급",
      remaining: "0.53등급 부족",
    });
    expect(rows[1]).toEqual({
      label: "모의고사",
      description: "현재 78.4 백분위 → 목표 92.0 백분위",
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
        description: "현재 1.50등급 → 목표 2.71등급",
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

describe("buildZoneGapRows", () => {
  it("최소 컷보다 나쁘면 below-min 구간과 '최소 목표까지 N 부족' 문구를 만든다", () => {
    const rows = buildZoneGapRows({
      naesin: { current: 5.0, min: 4.0, ideal: 2.5 },
      mogo: { current: null, min: null, ideal: null },
    });
    expect(rows).toEqual([
      {
        label: "내신 등급",
        description: "현재 5.00등급 → 최소 4.00등급 / 이상 2.50등급",
        remaining: "최소 목표까지 1등급 부족",
        zone: "below-min",
        advice: "기초 실력을 다지며 최소 목표 달성부터 노려보세요.",
      },
    ]);
  });

  it("최소는 넘었지만 이상엔 못 미치면 min-to-ideal 구간과 '이상 목표까지 N 부족' 문구를 만든다", () => {
    const rows = buildZoneGapRows({
      naesin: { current: 3.5, min: 4.0, ideal: 2.5 },
      mogo: { current: null, min: null, ideal: null },
    });
    expect(rows).toEqual([
      {
        label: "내신 등급",
        description: "현재 3.50등급 → 최소 4.00등급 / 이상 2.50등급",
        remaining: "이상 목표까지 1등급 부족",
        zone: "min-to-ideal",
        advice: "최소 목표는 달성했어요. 이상 목표에 도전해 보세요.",
      },
    ]);
  });

  it("이상 컷보다 좋으면 above-ideal 구간과 '이상 목표보다 N 여유' 문구를 만든다", () => {
    const rows = buildZoneGapRows({
      naesin: { current: 2.0, min: 4.0, ideal: 2.5 },
      mogo: { current: null, min: null, ideal: null },
    });
    expect(rows).toEqual([
      {
        label: "내신 등급",
        description: "현재 2.00등급 → 최소 4.00등급 / 이상 2.50등급",
        remaining: "이상 목표보다 0.5등급 여유",
        zone: "above-ideal",
        advice:
          "이상 목표를 넘어섰어요. 지금 페이스를 유지하거나 목표 상향을 검토해 보세요.",
      },
    ]);
  });

  it("정확히 이상 컷과 같으면 '이상 목표 도달' 문구를 쓴다", () => {
    const rows = buildZoneGapRows({
      naesin: { current: 2.5, min: 4.0, ideal: 2.5 },
      mogo: { current: null, min: null, ideal: null },
    });
    expect(rows[0]?.remaining).toBe("이상 목표 도달");
    expect(rows[0]?.zone).toBe("above-ideal");
  });

  it("모의고사(백분위)도 같은 3구간을 만든다 — below-min", () => {
    const rows = buildZoneGapRows({
      naesin: { current: null, min: null, ideal: null },
      mogo: { current: 60, min: 70, ideal: 85 },
    });
    expect(rows).toEqual([
      {
        label: "모의고사",
        description: "현재 60.0 백분위 → 최소 70.0 / 이상 85.0 백분위",
        remaining: "최소 목표까지 10 부족",
        zone: "below-min",
        advice: "기초 실력을 다지며 최소 목표 달성부터 노려보세요.",
      },
    ]);
  });

  it("모의고사 — min-to-ideal", () => {
    const rows = buildZoneGapRows({
      naesin: { current: null, min: null, ideal: null },
      mogo: { current: 75, min: 70, ideal: 85 },
    });
    expect(rows[0]).toMatchObject({
      remaining: "이상 목표까지 10 부족",
      zone: "min-to-ideal",
    });
  });

  it("모의고사 — above-ideal", () => {
    const rows = buildZoneGapRows({
      naesin: { current: null, min: null, ideal: null },
      mogo: { current: 90, min: 70, ideal: 85 },
    });
    expect(rows[0]).toMatchObject({
      remaining: "이상 목표보다 5 여유",
      zone: "above-ideal",
    });
  });

  it("두 축 모두 값이 있으면 내신·모의고사 순서로 만든다", () => {
    const rows = buildZoneGapRows({
      naesin: { current: 3.5, min: 4.0, ideal: 2.5 },
      mogo: { current: 75, min: 70, ideal: 85 },
    });
    expect(rows.map((r) => r.label)).toEqual(["내신 등급", "모의고사"]);
  });

  it("최소·이상 컷 중 하나라도 없으면 그 축 행을 제외한다(억지 산출 금지)", () => {
    const rows = buildZoneGapRows({
      naesin: { current: 3.5, min: 4.0, ideal: null }, // 이상 목표 대학에 내신 컷 없음
      mogo: { current: 75, min: null, ideal: 85 }, // 최소 목표 대학에 jungsi 컷 없음
    });
    expect(rows).toEqual([]);
  });

  it("두 축 모두 컷이 전혀 없으면 빈 배열을 반환한다(카드 자체 숨김)", () => {
    const rows = buildZoneGapRows({
      naesin: { current: null, min: null, ideal: null },
      mogo: { current: null, min: null, ideal: null },
    });
    expect(rows).toEqual([]);
  });
});
