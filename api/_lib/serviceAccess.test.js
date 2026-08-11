// 이용권 상태 판정 회귀 테스트.
//
// 핵심 버그: isPaidStatus/isActiveStatus가 부분 일치(String.includes)를 써서
// 'unpaid'.includes('paid') === true, 'inactive'.includes('active') === true
// 가 되어 결제 게이트를 우회할 수 있었다. program_access 컬럼의 DEFAULT
// 값이 정확히 이 두 문자열이라 잠재적으로 모든 신규 행이 무료로 통과했다.
//
// Node 내장 러너만 쓴다. 반드시 glob으로 파일을 지정해 실행할 것
// (디렉터리 인자를 주면 Node 24가 index.js로 오인해 0건 통과하는 가짜
// green이 난다):
//   node --test "api/_lib/*.test.js"

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isPaidStatus, isActiveStatus } from './serviceAccess.js';

test('isPaidStatus - 버그 재현: unpaid는 결제완료가 아니다', () => {
  assert.equal(isPaidStatus('unpaid'), false);
});

test('isActiveStatus - 버그 재현: inactive는 활성이 아니다', () => {
  assert.equal(isActiveStatus('inactive'), false);
});

test('isPaidStatus - program_access.payment_status CHECK enum 전체', () => {
  assert.equal(isPaidStatus('unpaid'), false);
  assert.equal(isPaidStatus('pending'), false);
  assert.equal(isPaidStatus('paid'), true);
  assert.equal(isPaidStatus('refunded'), false);
  assert.equal(isPaidStatus('cancelled'), false);
});

test('isActiveStatus - program_access.access_status CHECK enum 전체', () => {
  assert.equal(isActiveStatus('inactive'), false);
  assert.equal(isActiveStatus('active'), true);
  assert.equal(isActiveStatus('expired'), false);
  assert.equal(isActiveStatus('suspended'), false);
});

test('isPaidStatus - 한글 긍정 표기는 여전히 통과한다', () => {
  assert.equal(isPaidStatus('완납'), true);
  assert.equal(isPaidStatus('납부완료'), true);
  assert.equal(isPaidStatus('결제완료'), true);
  assert.equal(isPaidStatus('결제완료됨'), true);
  assert.equal(isPaidStatus('결제완료/이용중'), true);
  assert.equal(isPaidStatus('이용중'), true);
});

test('isActiveStatus - 한글 긍정 표기는 여전히 통과한다', () => {
  assert.equal(isActiveStatus('활성'), true);
  assert.equal(isActiveStatus('사용중'), true);
  assert.equal(isActiveStatus('이용중'), true);
  assert.equal(isActiveStatus('정상'), true);
});

test('isPaidStatus - 한글 부정 함정: 긍정 키워드를 포함해도 차단된다', () => {
  assert.equal(isPaidStatus('완납예정'), false);
  assert.equal(isPaidStatus('결제완료취소'), false);
  assert.equal(isPaidStatus('납부대기'), false);
  assert.equal(isPaidStatus('이용중지'), false);
  assert.equal(isPaidStatus('결제완료 환불'), false);
});

test('isActiveStatus - 한글 부정 함정: 긍정 키워드를 포함해도 차단된다', () => {
  assert.equal(isActiveStatus('이용중지'), false);
  assert.equal(isActiveStatus('비활성'), false);
  assert.equal(isActiveStatus('비정상'), false);
  assert.equal(isActiveStatus('정지'), false);
});

test('isPaidStatus - admin_enrollments 기본값(납부대기)은 결제완료가 아니다', () => {
  assert.equal(isPaidStatus('납부대기'), false);
});

test('isPaidStatus - 공백/대소문자 무시', () => {
  assert.equal(isPaidStatus('  PAID  '), true);
  assert.equal(isPaidStatus('Paid'), true);
  assert.equal(isPaidStatus(' 결 제 완 료 '), true);
});

test('isActiveStatus - 공백/대소문자 무시', () => {
  assert.equal(isActiveStatus('  ACTIVE  '), true);
  assert.equal(isActiveStatus('Active'), true);
});

test('isPaidStatus - null/undefined/빈 문자열은 false', () => {
  assert.equal(isPaidStatus(null), false);
  assert.equal(isPaidStatus(undefined), false);
  assert.equal(isPaidStatus(''), false);
  assert.equal(isPaidStatus('   '), false);
});

test('isActiveStatus - null/undefined/빈 문자열은 true (동작 보존)', () => {
  assert.equal(isActiveStatus(null), true);
  assert.equal(isActiveStatus(undefined), true);
  assert.equal(isActiveStatus(''), true);
  assert.equal(isActiveStatus('   '), true);
});

test('isPaidStatus - 관련 없는 임의 문자열은 false', () => {
  assert.equal(isPaidStatus('foo'), false);
  assert.equal(isPaidStatus('결제'), false);
});

test('isActiveStatus - 관련 없는 임의 문자열은 false', () => {
  assert.equal(isActiveStatus('foo'), false);
});
