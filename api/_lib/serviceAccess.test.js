// 이용권 상태 판정 회귀 테스트.
//
// 핵심 버그(2026-08 이전): isPaidStatus/isActiveStatus가 부분 일치
// (String.includes)를 써서 'unpaid'.includes('paid') === true,
// 'inactive'.includes('active') === true 가 되어 결제 게이트를 우회할 수
// 있었다. program_access 컬럼의 DEFAULT 값이 정확히 이 두 문자열이라
// 잠재적으로 모든 신규 행이 무료로 통과했다.
//
// 2026-08-12 부터 진입 게이트(checkProgramAccessTable)는 payment_status/
// access_status 문자열 판정을 하지 않는다 — public.fn_program_access_state
// (sql/64 10)절)가 DB에서 한 번에 판정하고 기간 만료까지 집행한다.
//
// 2026-08-13 정정: 이 파일이 한때 "isActiveStatus는 더 이상 존재하지
// 않는다"고 적었던 건 틀렸다 — findProgramAccessRow()(표시용 program_access
// 행 선정)가 여전히 isPaidStatus/isActiveStatus로 statusRank를 매기는데,
// isActiveStatus가 실제로 삭제돼 있어 program_access 행이 2건 이상인
// 사용자에서 ReferenceError로 죽는 크래시가 있었다. isActiveStatus를
// 복원했다(2026-08-13, 감사 발견) — program_access.access_status는 여전히
// JS가 직접 읽는다.
//
// Node 내장 러너만 쓴다. 반드시 glob으로 파일을 지정해 실행할 것
// (디렉터리 인자를 주면 Node 24가 index.js로 오인해 0건 통과하는 가짜
// green이 난다):
//   node --test "api/_lib/*.test.js"

import assert from "node:assert/strict";
import { test } from "node:test";
import { isActiveStatus, isPaidStatus } from "./serviceAccess.js";

test("isPaidStatus - 버그 재현: unpaid는 결제완료가 아니다", () => {
  assert.equal(isPaidStatus("unpaid"), false);
});

test("isPaidStatus - 영문 상태값", () => {
  assert.equal(isPaidStatus("unpaid"), false);
  assert.equal(isPaidStatus("pending"), false);
  assert.equal(isPaidStatus("paid"), true);
  assert.equal(isPaidStatus("refunded"), false);
  assert.equal(isPaidStatus("cancelled"), false);
});

test("isPaidStatus - 한글 긍정 표기는 여전히 통과한다", () => {
  assert.equal(isPaidStatus("완납"), true);
  assert.equal(isPaidStatus("납부완료"), true);
  assert.equal(isPaidStatus("결제완료"), true);
  assert.equal(isPaidStatus("결제완료됨"), true);
  assert.equal(isPaidStatus("결제완료/이용중"), true);
  assert.equal(isPaidStatus("이용중"), true);
});

test("isPaidStatus - 한글 부정 함정: DENIED_PAYMENT_STATUSES에 걸리면 차단된다", () => {
  assert.equal(isPaidStatus("결제완료취소"), false); // '취소' 부분일치로 차단
  assert.equal(isPaidStatus("결제완료 환불"), false); // '환불' 부분일치로 차단
  assert.equal(isPaidStatus("납부대기"), false); // '대기' 부분일치로 차단
});

// 긍정 키워드를 포함하면서 실제로는 부정인 상태값이 잘못 통과하지 않는지
// 검증한다. 2026-08-12 이전엔 DENIED_PAYMENT_STATUSES가 9단어로 좁아져
// 있어(#59 병합 충돌 해소 때 실수로 축소) 아래 두 케이스가 true로 오판됐다
// (실사용 노출은 없었다 — dev enrollments 0행). 원 설계 의도(NEGATIVE_STATUS_SIGNALS
// 16단어)로 목록을 복원해 다시 차단되는 것을 고정한다.
test("isPaidStatus - 한글 부정 함정: 긍정 키워드를 포함해도 차단된다", () => {
  assert.equal(isPaidStatus("완납예정"), false); // '예정' 부분일치로 차단
  assert.equal(isPaidStatus("이용중지"), false); // '중지' 부분일치로 차단
});

test("isPaidStatus - 공백/대소문자 무시", () => {
  assert.equal(isPaidStatus("  PAID  "), true);
  assert.equal(isPaidStatus("Paid"), true);
  assert.equal(isPaidStatus(" 결 제 완 료 "), true);
});

test("isPaidStatus - null/undefined/빈 문자열은 false", () => {
  assert.equal(isPaidStatus(null), false);
  assert.equal(isPaidStatus(undefined), false);
  assert.equal(isPaidStatus(""), false);
  assert.equal(isPaidStatus("   "), false);
});

test("isPaidStatus - 관련 없는 임의 문자열은 false", () => {
  assert.equal(isPaidStatus("foo"), false);
  assert.equal(isPaidStatus("결제"), false);
});

test("isActiveStatus - program_access.access_status 4값(CHECK 제약)", () => {
  assert.equal(isActiveStatus("active"), true);
  assert.equal(isActiveStatus("inactive"), false); // 'inactive'.includes('active') 부분일치 함정 차단
  assert.equal(isActiveStatus("expired"), false);
  assert.equal(isActiveStatus("suspended"), false);
});

test("isActiveStatus - 한글 긍정/부정", () => {
  assert.equal(isActiveStatus("활성"), true);
  assert.equal(isActiveStatus("이용중"), true);
  assert.equal(isActiveStatus("비활성"), false); // '비활성'이 '활성'을 포함하는 함정 차단
  assert.equal(isActiveStatus("정지"), false);
});

test("isActiveStatus - null/undefined/빈 문자열은 false", () => {
  assert.equal(isActiveStatus(null), false);
  assert.equal(isActiveStatus(undefined), false);
  assert.equal(isActiveStatus(""), false);
});
