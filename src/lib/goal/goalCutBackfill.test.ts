// jungsi(정시) 백필 집계 회귀 테스트(행296·332, QA3 §9-5 결정3).
// computeGoalJungsiCutBackfill 은 순수 함수라 DB/네트워크 없이 테스트한다
// (파일 헤더 "React/JSX 의존 없는 순수 모듈" 그대로).
import { describe, expect, test } from "vitest";
import {
  computeGoalJungsiCutBackfill,
  type GoalJungsiBackfillSourceRow,
} from "./goalCutBackfill.js";

function row(
  overrides: Partial<GoalJungsiBackfillSourceRow>,
): GoalJungsiBackfillSourceRow {
  return {
    university_name: "가나대학교",
    department_name: "컴퓨터공학과",
    percentile: 80,
    result_year: 2026,
    ...overrides,
  };
}

describe("computeGoalJungsiCutBackfill", () => {
  test("같은 (대학, 학과) 최신 연도만 남기고 평균한다", () => {
    const { payloads } = computeGoalJungsiCutBackfill([
      row({ percentile: 70, result_year: 2025 }),
      row({ percentile: 80, result_year: 2026 }),
      row({ percentile: 84, result_year: 2026 }),
    ]);
    expect(payloads).toHaveLength(1);
    expect(payloads[0]).toMatchObject({
      cut_type: "jungsi",
      university_name: "가나대학교",
      department_name: "컴퓨터공학과",
      avg_cut: 82, // (80+84)/2, 2025 행은 폴백 없이 버려짐(최신 연도 우선)
      source: "admission_results",
      source_year: 2026,
    });
  });

  test("연도가 하나뿐이면 그 연도를 그대로 쓴다(2026 없어도 2025 로 산출)", () => {
    const { payloads } = computeGoalJungsiCutBackfill([
      row({ percentile: 65, result_year: 2025 }),
    ]);
    expect(payloads).toHaveLength(1);
    expect(payloads[0]?.source_year).toBe(2025);
    expect(payloads[0]?.avg_cut).toBe(65);
  });

  test("percentile 이 null/미확정 범위 밖이면 버린다(0~100 CHECK 방어와 별개로 정제)", () => {
    const { payloads } = computeGoalJungsiCutBackfill([
      row({ percentile: null }),
      row({ percentile: Number.NaN }),
    ]);
    expect(payloads).toHaveLength(0);
  });

  test("학과명이 비어 있으면 제외한다(excludedEmptyPairs 는 행이 아니라 쌍 단위)", () => {
    // 두 행 모두 trim 후 빈 학과명이라 같은 (대학, '') 쌍으로 묶인다 — 그래서
    // excludedEmptyPairs 는 2가 아니라 1이다(이름 그대로 "쌍" 단위 집계).
    const { payloads, stats } = computeGoalJungsiCutBackfill([
      row({ department_name: "" }),
      row({ department_name: "   " }),
    ]);
    expect(payloads).toHaveLength(0);
    expect(stats.excludedEmptyPairs).toBe(1);
  });

  test("학과명에 (*) 표기가 있으면 제외한다(excludedStarPairs)", () => {
    const { payloads, stats } = computeGoalJungsiCutBackfill([
      row({ department_name: "컴퓨터공학과(*)" }),
    ]);
    expect(payloads).toHaveLength(0);
    expect(stats.excludedStarPairs).toBe(1);
  });

  test("다른 대학·학과 조합은 별개 payload 로 나온다(멱등 upsert 대비 dedupe 없음)", () => {
    const { payloads, stats } = computeGoalJungsiCutBackfill([
      row({ university_name: "가나대학교", department_name: "컴퓨터공학과" }),
      row({ university_name: "다라대학교", department_name: "전자공학과" }),
    ]);
    expect(payloads).toHaveLength(2);
    expect(stats.universityCount).toBe(2);
    expect(stats.pairCount).toBe(2);
    expect(stats.mergedCount).toBe(0);
  });

  test("빈 입력은 빈 결과를 낸다", () => {
    const { payloads, stats } = computeGoalJungsiCutBackfill([]);
    expect(payloads).toHaveLength(0);
    expect(stats.totalRows).toBe(0);
    expect(stats.distribution.min).toBeNull();
  });

  test("null/undefined 입력도 방어한다", () => {
    expect(computeGoalJungsiCutBackfill(null).payloads).toHaveLength(0);
    expect(computeGoalJungsiCutBackfill(undefined).payloads).toHaveLength(0);
  });
});
