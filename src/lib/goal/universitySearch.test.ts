import { describe, expect, it } from "vitest";
import { groupByUniversity } from "./universitySearch.ts";

describe("groupByUniversity", () => {
  it("같은 대학의 여러 학과 행을 하나의 옵션으로 묶는다", () => {
    const rows = [
      { university_name: "서울대학교", department_name: "경영학과" },
      { university_name: "서울대학교", department_name: "컴퓨터공학부" },
    ];
    expect(groupByUniversity(rows)).toEqual([
      { name: "서울대학교", departments: ["경영학과", "컴퓨터공학부"] },
    ]);
  });

  it("대학 등장 순서를 입력 행 순서 그대로 보존한다", () => {
    const rows = [
      { university_name: "남서울대학교", department_name: "간호학과" },
      { university_name: "서울대학교", department_name: "의예과" },
    ];
    expect(groupByUniversity(rows).map((u) => u.name)).toEqual([
      "남서울대학교",
      "서울대학교",
    ]);
  });

  it("같은 대학·학과 중복 행은 하나로 합친다(normal/special 등 중복 대비)", () => {
    const rows = [
      { university_name: "서울대학교", department_name: "의예과" },
      { university_name: "서울대학교", department_name: "의예과" },
    ];
    expect(groupByUniversity(rows)).toEqual([
      { name: "서울대학교", departments: ["의예과"] },
    ]);
  });

  it("department_name이 빈 문자열/null이면 학과 목록에서 뺀다(대학 자체는 유지)", () => {
    const rows = [
      { university_name: "서울대학교", department_name: "" },
      { university_name: "서울대학교", department_name: null },
      { university_name: "서울대학교", department_name: "경영학과" },
    ];
    expect(groupByUniversity(rows)).toEqual([
      { name: "서울대학교", departments: ["경영학과"] },
    ]);
  });

  it("university_name이 빈 문자열/null인 행은 통째로 뺀다", () => {
    const rows = [
      { university_name: "", department_name: "경영학과" },
      { university_name: null, department_name: "경영학과" },
    ];
    expect(groupByUniversity(rows)).toEqual([]);
  });

  it("빈 입력은 빈 배열을 반환한다", () => {
    expect(groupByUniversity([])).toEqual([]);
  });
});
