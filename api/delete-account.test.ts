// 회원탈퇴(api/delete-account.ts)의 순수 로직만 검증한다.
//
// 핸들러 전체(supabase RPC·auth admin 호출)는 외부 I/O에 묶여 있어 여기서
// 돌리기 어렵다 — complete-refund.test.ts와 같은 방침으로, 분리 가능한 순수
// 함수(익명화 대체 이메일 구성)만 로컬에서 검증한다. 익명화 분기의 실동작
// (auth email 교체·metadata 파기·ban·재가입 재개)은 로컬 스택 QA로 확인한다.

import { describe, expect, test } from "vitest";
import { buildAnonymizedEmail } from "./delete-account.js";

describe("buildAnonymizedEmail", () => {
  test("userId를 로컬 파트에 넣어 계정끼리 충돌하지 않는다", () => {
    expect(
      buildAnonymizedEmail("98af95da-47bf-4cee-8a2e-7d70d07fb1c9"),
    ).toBe("deleted-98af95da-47bf-4cee-8a2e-7d70d07fb1c9@removed.invalid");
  });

  test("도메인은 예약 TLD(.invalid)라 실제 수신자와 충돌하지 않는다", () => {
    expect(buildAnonymizedEmail("abc").endsWith("@removed.invalid")).toBe(true);
  });

  test("서로 다른 userId는 서로 다른 주소가 된다", () => {
    expect(buildAnonymizedEmail("a")).not.toBe(buildAnonymizedEmail("b"));
  });
});
