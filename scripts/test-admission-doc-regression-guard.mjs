// =====================================================================
// load-admission-content.mjs의 정보량 감소 가드(shouldSkipForRegression)
// 합성 테스트.
//
// 배경: 이 가드는 실데이터로는 트리거되지 않는다 — dev DB의 모든 행이
// 이미 정상 상태(1253/1253 html임포트 성공)라, --force-regenerate로
// 돌려도 같은 html에서 재구성하니 회귀가 안 난다. 즉 가드 로직이 실제
// 실행 경로를 한 번도 타보지 않은 채 코드 리뷰만으로 커밋됐었다
// (2026-08-06 사고가 정확히 "검증 안 된 전제"에서 나왔다는 지적).
//
// 그래서 합성(가짜) doc 쌍으로 가드 함수를 직접 호출해 검증한다 — DB도
// 스크립트 실행도 필요 없다. 순수 함수(docRichness/shouldSkipForRegression)
// export 덕에 가능하다.
//
// 사용법: node scripts/test-admission-doc-regression-guard.mjs
// 종료 코드: 전부 통과하면 0, 하나라도 실패하면 1.
// =====================================================================

// 2026-08-06 src/lib/admissionDoc.js로 이동했다(위치만 이동, 동작 동일) —
// 원래 load-admission-content.mjs에 있었다.
import { shouldSkipForRegression } from '../src/lib/admissionDoc.js';

function makeDoc(blockTexts) {
  return {
    v: 1,
    section: 'previous_year_changes',
    blocks: blockTexts.map((text, idx) => ({ kind: 'note', text: `${text}-${idx}` }))
  };
}

// 텍스트 길이를 정확히 통제하려면 블록 텍스트 길이를 직접 지정한다.
function makeDocWithTextLength(blockCount, totalTextLength) {
  const perBlock = Math.floor(totalTextLength / blockCount);
  const remainder = totalTextLength - perBlock * blockCount;
  return {
    v: 1,
    section: 'previous_year_changes',
    blocks: Array.from({ length: blockCount }, (_, idx) => ({
      kind: 'note',
      text: 'x'.repeat(idx === 0 ? perBlock + remainder : perBlock)
    }))
  };
}

const cases = [];

// 1) 기존(blocks 5, 텍스트 1000) vs 후보(blocks 3, 텍스트 400) → 막혀야 한다.
cases.push({
  name: '블록 수·텍스트 둘 다 감소 → 가드가 막는다',
  existing: makeDocWithTextLength(5, 1000),
  candidate: makeDocWithTextLength(3, 400),
  expectSkip: true
});

// 2) 후보가 더 풍부(blocks 7) → 통과해야 한다.
cases.push({
  name: '후보가 더 풍부(블록 수 증가) → 통과',
  existing: makeDocWithTextLength(5, 1000),
  candidate: makeDocWithTextLength(7, 1500),
  expectSkip: false
});

// 3) 블록 수는 같은데 텍스트만 감소 → 막혀야 한다.
cases.push({
  name: '블록 수는 동일, 텍스트만 감소 → 가드가 막는다',
  existing: makeDocWithTextLength(5, 1000),
  candidate: makeDocWithTextLength(5, 400),
  expectSkip: true
});

// 4) 블록 수는 증가, 텍스트는 감소(엇갈림) → "둘 중 하나라도 줄면 회귀"
//    정책이므로 막혀야 한다.
cases.push({
  name: '블록 수 증가 + 텍스트 감소(엇갈림) → 가드가 막는다(보수적 정책)',
  existing: makeDocWithTextLength(5, 1000),
  candidate: makeDocWithTextLength(8, 400),
  expectSkip: true
});

// 5) 완전히 동일 → 통과해야 한다(막히면 안 된다 — 경계 케이스).
cases.push({
  name: '완전히 동일 → 통과(경계)',
  existing: makeDocWithTextLength(5, 1000),
  candidate: makeDocWithTextLength(5, 1000),
  expectSkip: false
});

// 6) 기존 doc이 없음(null) → 비교 대상이 없으니 항상 통과.
cases.push({
  name: '기존 doc 없음(null) → 비교 대상 없어 항상 통과',
  existing: null,
  candidate: makeDoc(['a']),
  expectSkip: false
});

// "--ignore-regression 상당 옵션을 주면 통과" 시나리오는 shouldSkipForRegression
// 자체엔 플래그가 없다(순수 함수 — 호출부인 buildCategoryContent가
// ignoreRegression이면 이 함수를 아예 안 부른다). 그 분기를 여기서도
// 문서화 검증한다: 호출을 건너뛰면(=ignoreRegression=true 시뮬레이션)
// 결과가 항상 "쓴다"와 동등하다는 것만 확인한다.
cases.push({
  name: 'ignoreRegression 시뮬레이션(가드 호출 자체를 생략) → 회귀여도 통과 취급',
  existing: makeDocWithTextLength(5, 1000),
  candidate: makeDocWithTextLength(3, 400),
  expectSkip: false,
  skipGuardCall: true // 가드를 안 부르고 바로 "통과"로 취급(ignoreRegression 재현)
});

let failCount = 0;
cases.forEach(({ name, existing, candidate, expectSkip, skipGuardCall }) => {
  const result = skipGuardCall ? { skip: false } : shouldSkipForRegression(existing, candidate);
  const ok = result.skip === expectSkip;
  if (!ok) failCount += 1;
  console.log(
    `${ok ? 'PASS' : 'FAIL'} - ${name} (skip=${result.skip}, 기대=${expectSkip}${result.detail ? `, detail="${result.detail}"` : ''})`
  );
});

console.log(`\n총 ${cases.length}건 중 ${cases.length - failCount}건 통과, ${failCount}건 실패.`);
process.exitCode = failCount ? 1 : 0;
