import { describe, expect, test } from "vitest";
import { pickKnownSchoolType } from "./schoolType";

describe("pickKnownSchoolType", () => {
  test("SCHOOL_TYPES 화이트리스트에 있는 값은 그대로 돌려준다", () => {
    expect(pickKnownSchoolType("고등학교")).toBe("고등학교");
  });

  test("화이트리스트에 없는 오염값은 null로 떨어진다(시드 오탈자 방어)", () => {
    expect(pickKnownSchoolType("high")).toBeNull();
  });

  test("null/undefined/빈 문자열은 전부 null이다", () => {
    expect(pickKnownSchoolType(null)).toBeNull();
    expect(pickKnownSchoolType(undefined)).toBeNull();
    expect(pickKnownSchoolType("")).toBeNull();
  });
});
