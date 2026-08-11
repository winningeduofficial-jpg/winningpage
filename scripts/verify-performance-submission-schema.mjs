// =====================================================================
// 수행평가 제출 스키마 8종 회귀 검증 (원본 함수 직접 실행 대조)
//
//   node scripts/verify-performance-submission-schema.mjs
//
// 무엇을 막는가
// -------------
// `api/_lib/performance/submission-schema.js`는 외부 앱
// (`/Users/hyunsoo/uwellnow/suhaengpyeong`) `index.html:2059-2244`의 인라인 script
// 를 옮긴 것이다(docs/수행평가-상세-명세.md §12.2 3행, §10.2 P11). 정규식 하나, 어휘
// 하나, if 순서 하나가 바뀌어도 **코드는 그대로 돌고 제출폼 필드만 조용히 달라진다.**
// 그래서 사람 눈 대신 이 스크립트가 원본 함수를 실제로 실행해 대조한다.
//
//   ① 8종 대조    — 유형별 대표 입력에서 `{type,label,notice,fields[]}` 완전 일치
//   ② 우선순위    — 유형 트리거 조합 전수(2^8=256가지)에서 원본과 같은 유형
//   ③ 문항형 경계 — 0개 / 1개 / 20개 / 21개 / 25개 / 비연속 번호 / 역순·중복
//   ④ 분량형 조합 — 4개 후보 필드 트리거 부분집합 전수(2^4=16가지)
//   ⑤ 정규화      — `normalizeSubmissionSchema` 깨진 입력 대조
//   ⑥ rows 유일차 — 원본 필드에서 `rows`만 빼면 이식본과 **완전히** 같은가(§12.2)
//   ⑦ 리터럴 대조 — 원본 구간의 정규식·도메인 문자열이 우리 모듈에 원문 그대로 존재
//   ⑧ 어휘 토큰   — 원본 정규식의 alternation 토큰을 전부 뽑아 단건 판정 일치
//   ⑨ 중복 판정   — `isRubricLikeQuestion` 2벌(index.html / find-resources.js)이
//                    실제로 같은지 + 우리는 사본을 만들지 않았는지
//   ⑩ 글자 수     — Q35 결정(순수 본문 합)이 외부 결합 문자열 방식과 실제로 갈리는가
//
// 원본이 없으면 SKIP
// ------------------
// 외부 앱은 이 저장소에 없는 로컬 경로다. CI에서는 조용히 SKIP(exit 0)하고, 원본이 있는
// 로컬에서만 실제 대조가 돈다. 경로는 `SUHAENGPYEONG_DIR`로 덮어쓸 수 있다.
// (단 ⑩ 글자 수는 우리 쪽 결정이라 원본 없이도 도는 자체 검사가 아니라, 대조 항목과 함께
//  SKIP된다 — 외부 계산식과의 '차이'를 증명하는 것이 이 검사의 목적이기 때문이다.)
// =====================================================================

import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SOURCE_DIR = process.env.SUHAENGPYEONG_DIR || '/Users/hyunsoo/uwellnow/suhaengpyeong';
const SOURCE_HTML = path.join(SOURCE_DIR, 'index.html');
const SOURCE_FIND = path.join(SOURCE_DIR, 'api/find-resources.js');
const PORT_FILE = path.join(REPO_ROOT, 'api/_lib/performance/submission-schema.js');

if (!fs.existsSync(SOURCE_HTML)) {
  console.log(`SKIP verify-performance-submission-schema — 이식 원본 없음 (${SOURCE_DIR})`);
  process.exit(0);
}

const failures = [];

function check(name, condition, detail = '') {
  if (condition) {
    console.log(`  ok  ${name}`);
    return;
  }
  failures.push(detail ? `${name}\n      ${detail}` : name);
  console.log(`  FAIL ${name}`);
}

// ── ① 원본 함수 되살리기 ────────────────────────────────────────────
// 원본은 브라우저 인라인 script라 import가 불가능하다. 그래서 **함수 선언 6개만 텍스트로
// 잘라내 `new Function`으로 되살린다.** 잘라낸 구간에 예상 밖의 코드가 섞이면 즉시 실패
// 한다(앵커 검증). `inferSubmissionSchema`는 전역 `assessmentInfo`를 읽으므로 스코프
// 안에 그 변수를 만들어 두고 인자로 주입하는 래퍼를 함께 돌려준다.
const htmlText = fs.readFileSync(SOURCE_HTML, 'utf8');
const sliceStart = htmlText.indexOf('function makeSubmissionField');
const sliceEnd = htmlText.indexOf('function buildSubmissionText');

if (sliceStart < 0 || sliceEnd < 0 || sliceEnd <= sliceStart) {
  console.error('FAIL: 원본에서 제출 스키마 구간을 찾지 못했습니다 (index.html 구조 변경?).');
  process.exit(1);
}

const originalSlice = htmlText.slice(sliceStart, sliceEnd).trim();
const declaredFns = [...originalSlice.matchAll(/^function\s+(\w+)/gm)].map((m) => m[1]);

assert.deepStrictEqual(
  declaredFns,
  [
    'makeSubmissionField',
    'defaultSubmissionSchema',
    'isRubricLikeQuestion',
    'extractAssessmentQuestions',
    'inferLengthBasedSchema',
    'inferSubmissionSchema',
    'normalizeSubmissionSchema'
  ],
  `원본 구간 함수 목록이 예상과 다릅니다: ${declaredFns.join(', ')}`
);

// eslint-disable-next-line no-new-func
const original = new Function(`
  let assessmentInfo = '';
  ${originalSlice}
  return {
    makeSubmissionField,
    defaultSubmissionSchema,
    isRubricLikeQuestion,
    extractAssessmentQuestions,
    inferLengthBasedSchema,
    normalizeSubmissionSchema,
    inferSubmissionSchema: (text) => { assessmentInfo = String(text ?? ''); return inferSubmissionSchema(); },
    buildSubmissionText: (topic, schema, fields) => {
      // index.html:2246-2252 원문. ⑩에서 "외부가 실제로 잰 문자열"을 재현하는 데만 쓴다.
      const lines = ['주제: ' + topic, '', '[제출 형식] ' + schema.label];
      schema.fields.forEach((field) => { lines.push('', '[' + field.label + ']', fields[field.key] || ''); });
      return lines.join('\\n').trim();
    }
  };
`)();

const ported = await import(PORT_FILE);

// ── 비교 헬퍼 ────────────────────────────────────────────────────────
// §12.2 3행에 따라 `rows`는 폐기했다. 그것이 **유일한** 차이임을 증명하기 위해, 원본
// 산출물에서 `rows` 키만 제거한 뒤 완전 일치를 요구한다. 다른 키가 사라지거나 값이
// 달라지면 여기서 잡힌다.
function stripRows(schema) {
  return {
    ...schema,
    fields: schema.fields.map(({ rows, ...rest }) => rest)
  };
}

function sameSchema(text) {
  const expected = stripRows(original.inferSubmissionSchema(text));
  const actual = ported.inferSubmissionSchema(text);
  return {
    same: JSON.stringify(expected) === JSON.stringify(actual),
    expected,
    actual
  };
}

function shape(schema) {
  return `${schema.type}(${schema.fields.length}) ${schema.fields.map((f) => f.key).join(',')}`;
}

// ── ② 8종 대표 입력 ─────────────────────────────────────────────────
// `label`은 사람이 읽는 이름일 뿐이고, 정답은 항상 **원본 실행 결과**다.
const CASES = [
  {
    label: '1. 문항별 답변형',
    text: [
      '[수행평가 기본 정보]',
      '- 교과/과목: 과학 / 생명과학',
      '',
      '[답변 문항 목록 - 절대 누락 금지]',
      '질문 1: 선택한 주제를 고른 이유는 무엇인가요?',
      '질문 2: 탐구 과정에서 확인한 사실을 서술하시오.'
    ].join('\n')
  },
  {
    label: '2. 안내문 맞춤 작성형 (4필드 전부)',
    text: [
      '[세부 요구사항]',
      '- 필수 포함 내용: 주제 선정 이유, 탐구 내용, 배우고 느낀 점, 참고 문헌',
      '- 분량: 1000자 이상',
      '질문 목록 없음'
    ].join('\n')
  },
  {
    label: '3. 카드뉴스·홍보물형',
    text: '[세부 요구사항]\n- 필수 포함 내용: 감염병 예방 카드뉴스 4장 제작\n질문 목록 없음'
  },
  {
    label: '4. 발표·PPT형',
    text: '[수행평가 기본 정보]\n- 수행평가 유형: 조별 발표\n- 제출 형식: PPT 10장 + 발표 대본\n질문 목록 없음'
  },
  {
    label: '5. 칼럼·논술형',
    text: '[세부 요구사항]\n- 사회 문제에 대한 자신의 주장을 담은 칼럼을 작성한다.\n질문 목록 없음'
  },
  {
    label: '6. 독서·서평형',
    text: '[세부 요구사항]\n- 지정 도서를 읽고 서평을 작성한다.\n질문 목록 없음'
  },
  {
    label: '7. 탐구보고서형',
    text: '[수행평가 기본 정보]\n- 수행평가 유형: 실험 결과를 정리한 탐구보고서 제출\n질문 목록 없음'
  },
  {
    label: '8. 기본 보고서형',
    text: '[수행평가 기본 정보]\n- 교과/과목: 국어 / 화법과 언어\n- 제출 기한: 정보 없음\n질문 목록 없음'
  },

  // ── 경계 케이스 (우선순위가 실제로 갈리는 지점)
  {
    // 문항형 ∧ 보고서 — 1번이 7번을 이겨야 한다.
    label: 'B1. 문항형 + 탐구보고서 동시 충족',
    text: '[제출 형식] 실험 탐구보고서\n[답변 문항 목록]\n질문 1: 실험 설계에서 통제한 변인은 무엇인가요?'
  },
  {
    // 질문 형식이지만 전부 루브릭 — 문항형이 발동하면 안 된다.
    label: 'B2. 질문 형식이지만 전부 루브릭 (문항형 미발동)',
    text: [
      '[평가 기준 및 배점]',
      '질문 1: 도서명, 탐구 주제, 관련 단원을 구체적으로 제시하였는가?',
      '질문 2: 교과 개념과 진로를 논리적으로 연결했는가?',
      '[세부 요구사항]',
      '- 조사 보고서 형태로 제출'
    ].join('\n')
  },
  {
    // 분량형 ∧ 카드뉴스 — **여기가 설계 리포트 판정과 갈리는 지점이다.**
    // 제출 스키마는 분량형(2번)이 카드뉴스(3번)를 이기고, `inferAssessmentStructure`는
    // 카드뉴스가 분량형을 이긴다. 그 사실 자체를 고정한다.
    label: 'B3. 분량조건 + 카드뉴스 동시 충족 (설계 판정과 갈리는 지점)',
    text: '카드뉴스 4장을 제작하고 탐구 내용을 800자 이상 정리한다.'
  },
  {
    label: 'B4. 카드뉴스 + 발표 + 칼럼 + 독서 + 보고서 동시 충족',
    text: '카드뉴스와 PPT 발표, 칼럼, 독서 감상문을 함께 제출하는 탐구보고서.\n질문 목록 없음'
  },
  {
    label: 'B5. 발표 + 칼럼 동시 충족',
    text: '주장하는 글(논설문)을 쓰고 이를 프레젠테이션으로 발표한다.'
  },
  {
    label: 'B6. 칼럼 + 독서 동시 충족',
    text: '읽은 책에 대한 비평문을 작성한다.'
  },
  {
    label: 'B7. 독서 + 보고서 동시 충족',
    text: '도서를 읽고 조사 보고서를 제출한다.'
  },
  {
    // 분량 조건만 있고 탐구/느낀점이 없으면 분량형 게이트가 열리지 않는다.
    label: 'B8. 분량 조건만 (게이트 미충족 → 보고서형으로)',
    text: '보고서를 1200자 이상 작성한다.'
  },
  {
    // 탐구 내용은 있는데 분량 조건이 없으면 게이트가 열리지 않는다.
    label: 'B9. 탐구 내용만 (분량 조건 없음 → 기본형으로)',
    text: '탐구 내용을 정리하여 제출한다.'
  },
  { label: 'B10. 빈 문자열', text: '' },
  { label: 'B11. 공백만', text: '   \n\n\t  ' },
  { label: 'B12. null 전달', text: null },
  { label: 'B13. undefined 전달', text: undefined },
  {
    // "질문 목록 없음" 리터럴이 문항으로 잡히면 안 된다.
    label: 'B14. 질문 목록 없음 리터럴',
    text: '[답변 문항 목록 - 절대 누락 금지]\n질문 1: 질문 목록 없음\n[세부 요구사항]\n- 에세이 작성'
  },
  {
    // 개행을 뭉개면 행 앵커가 죽어 문항형이 발동하지 않는다는 사실을 고정한다.
    label: 'B15. 개행 없이 한 줄로 뭉갠 안내문 (행 앵커 실패)',
    text: '[답변 문항 목록] 질문 1: 주제 선정 이유는 무엇인가요? 질문 2: 탐구 결과는 무엇인가요?'
  },
  { label: 'B16. 대문자 PPT / 소문자 ppt', text: 'PPT 자료를 제작한다.' },
  { label: 'B17. 「탐구 내용」 띄어쓰기 변형 + 분량', text: '탐구  내용을 500 자 이상 정리하시오.' },
  { label: 'B18. 전각 콜론 문항', text: '질문 1：전각 콜론으로 적힌 문항은 무엇을 묻나요?' },
  { label: 'B19. 불릿 접두 문항', text: '- 질문 1: 주제를 고른 이유는 무엇인가요?\n• 질문 2: 무엇을 배웠나요?' }
];

console.log('\n[8종 판정 대조 — 대표 입력 + 경계 케이스]');

for (const testCase of CASES) {
  const { same, expected, actual } = sameSchema(testCase.text);
  check(
    `${testCase.label} → ${shape(expected)}`,
    same,
    same ? '' : `원본 ${JSON.stringify(expected)}\n      이식 ${JSON.stringify(actual)}`
  );
}

// ── ③ 우선순위 전수 대조 ────────────────────────────────────────────
// 8유형 트리거 조각의 부분집합 256가지. if 순서가 하나라도 바뀌면 다수가 즉시 어긋난다.
const TRIGGERS = [
  '질문 1: 이 주제를 고른 이유는 무엇인가요?', // 1. 문항형
  '탐구 내용을 정리',                           // 2-a. 분량형 게이트(항목)
  '분량은 500자 이상',                          // 2-b. 분량형 게이트(분량)
  '카드뉴스 형태로 제작',                       // 3. 카드뉴스
  '발표 대본을 준비',                           // 4. 발표
  '칼럼 형식으로 작성',                         // 5. 칼럼
  '독서 감상문 제출',                           // 6. 독서
  '탐구보고서로 제출'                           // 7. 보고서
];

let comboMismatch = 0;
let comboFirst = '';
const comboTypes = new Set();

for (let mask = 0; mask < (1 << TRIGGERS.length); mask += 1) {
  const text = TRIGGERS.filter((_, i) => mask & (1 << i)).join('\n');
  const { same, expected, actual } = sameSchema(text);
  comboTypes.add(expected.type);

  if (!same) {
    comboMismatch += 1;
    if (!comboFirst) comboFirst = `입력 ${JSON.stringify(text)}\n      원본 ${shape(expected)} / 이식 ${shape(actual)}`;
  }
}

console.log('\n[우선순위 전수 대조]');
check(`트리거 조합 ${1 << TRIGGERS.length}가지 전건 일치`, comboMismatch === 0, comboFirst);
check(
  `조합 전수에서 8종이 모두 등장 (관측 ${comboTypes.size}종)`,
  comboTypes.size === 8,
  `누락: ${ported.SUBMISSION_SCHEMA_TYPES.filter((t) => !comboTypes.has(t)).join(', ')}`
);

// ── ④ 문항형 경계 (상한 20) ─────────────────────────────────────────
// §12.2 3행이 「문항형 20개 상한(`:2152`) 유지」로 명시 지정한 지점이다.
console.log('\n[문항형 경계 — 최대 20필드]');

function questionGuide(count, { start = 1, step = 1 } = {}) {
  return Array.from(
    { length: count },
    (_, i) => `질문 ${start + i * step}: ${start + i * step}번 문항은 무엇을 묻나요?`
  ).join('\n');
}

const QUESTION_CASES = [
  { label: '문항 0개 (질문 줄 자체가 없음 → 보고서형)', text: '실험 결과를 정리해 보고서로 제출한다.', expectType: 'research_report' },
  { label: '문항 0개 (트리거 어휘도 없음 → 기본형)', text: '자유롭게 정리해 제출한다.', expectType: 'basic_report' },
  { label: '문항 1개 (임계값 하한 — 1건으로 발동)', text: questionGuide(1), expectFields: 1 },
  { label: '문항 19개', text: questionGuide(19), expectFields: 19 },
  { label: '문항 20개 (상한 정확히)', text: questionGuide(20), expectFields: 20 },
  { label: '문항 21개 (상한 초과)', text: questionGuide(21), expectFields: 20 },
  { label: '문항 25개 (상한 초과)', text: questionGuide(25), expectFields: 20 },
  { label: '문항 50개 (상한 초과)', text: questionGuide(50), expectFields: 20 },
  { label: '문항 번호 비연속 (11,13,15,…)', text: questionGuide(25, { start: 11, step: 2 }), expectFields: 20 },
  {
    label: '문항 번호 역순 + 중복 (정렬·중복제거 후 3개)',
    text: [
      '질문 3: 후속 탐구 계획을 어떻게 세울 것인가요?',
      '질문 1: 주제를 고른 이유는 무엇인가요?',
      '질문 1: 주제를 고른 이유는 무엇인가요?',
      '질문 2: 탐구 결과는 무엇인가요?'
    ].join('\n'),
    expectFields: 3
  },
  {
    label: '문항 30개 중 절반이 루브릭 (루브릭 제외 후 15개)',
    text: Array.from({ length: 30 }, (_, i) => (i % 2 === 0
      ? `질문 ${i + 1}: ${i + 1}번 문항은 무엇을 묻나요?`
      : `질문 ${i + 1}: 교과 개념을 구체적으로 제시하였는가?`)).join('\n'),
    expectFields: 15
  }
];

for (const qCase of QUESTION_CASES) {
  const { same, expected, actual } = sameSchema(qCase.text);
  check(
    `${qCase.label} → ${expected.type} / ${expected.fields.length}필드`,
    same,
    same ? '' : `원본 ${shape(expected)}\n      이식 ${shape(actual)}`
  );

  if (qCase.expectFields !== undefined) {
    check(
      `  ↳ 필드 수 ${qCase.expectFields} (상한 ${ported.MAX_QUESTION_FIELDS})`,
      actual.type === 'question_based' && actual.fields.length === qCase.expectFields,
      `실제 ${actual.type} / ${actual.fields.length}필드`
    );
  }
  if (qCase.expectType) {
    check(`  ↳ 유형 ${qCase.expectType}`, actual.type === qCase.expectType, `실제 ${actual.type}`);
  }
}

// 상한 초과 시 **번호가 작은 20개**가 남고 키가 문항 번호를 따라가는지.
const over = ported.inferSubmissionSchema(questionGuide(25, { start: 11, step: 2 }));
check(
  '상한 초과 시 번호 오름차순 상위 20개 유지 (question_11 … question_49)',
  over.fields[0].key === 'question_11'
    && over.fields[0].label === '문항 11'
    && over.fields[19].key === 'question_49'
    && over.fields.length === 20
);
check(
  '문항 필드 helper == 안내문 원문 문항 텍스트',
  over.fields[0].helper === '11번 문항은 무엇을 묻나요?'
);

// ── ⑤ 분량형 후보 필드 조합 전수 ────────────────────────────────────
// 4개 후보 필드(motive/exploration/reflection/references)가 조건부라 조합이 16가지다.
console.log('\n[분량형 후보 필드 조합 전수]');

const LENGTH_PARTS = [
  '주제 선정 이유를 적는다',   // motive
  '탐구 내용을 정리한다',      // exploration
  '배우고 느낀 점을 쓴다',     // reflection
  '참고 문헌을 밝힌다'         // references
];

let lengthMismatch = 0;
let lengthFirst = '';
const lengthShapes = new Set();

for (let mask = 0; mask < (1 << LENGTH_PARTS.length); mask += 1) {
  const text = `${LENGTH_PARTS.filter((_, i) => mask & (1 << i)).join('\n')}\n분량은 800자 이상`;
  const { same, expected, actual } = sameSchema(text);
  lengthShapes.add(shape(expected));

  if (!same) {
    lengthMismatch += 1;
    if (!lengthFirst) lengthFirst = `입력 ${JSON.stringify(text)}\n      원본 ${shape(expected)} / 이식 ${shape(actual)}`;
  }
}

check(`후보 필드 조합 ${1 << LENGTH_PARTS.length}가지 전건 일치 (관측 형태 ${lengthShapes.size}종)`, lengthMismatch === 0, lengthFirst);

// `inferLengthBasedSchema` 단독 대조(게이트 미충족 시 null).
const LENGTH_DIRECT = [
  '',
  '분량은 500자 이상',
  '탐구 내용을 정리한다',
  '탐구 내용을 500자 이상 정리한다',
  '느낀점을 800자로 쓴다',
  '소감을 띄어쓰기 포함 1000자로 쓴다',
  '활동 내용을 분량에 맞춰 작성',
  '조사 내용과 출처를 1200자 이상'
];

let lengthDirectMismatch = 0;
for (const text of LENGTH_DIRECT) {
  const expectedRaw = original.inferLengthBasedSchema(text);
  const expected = expectedRaw ? stripRows(expectedRaw) : null;
  const actual = ported.inferLengthBasedSchema(text);
  if (JSON.stringify(expected) !== JSON.stringify(actual)) {
    lengthDirectMismatch += 1;
    console.log(`  FAIL ${JSON.stringify(text)} — 원본 ${JSON.stringify(expected)} / 이식 ${JSON.stringify(actual)}`);
  }
}
check(`inferLengthBasedSchema 단독 ${LENGTH_DIRECT.length}건 일치 (null 폴백 포함)`, lengthDirectMismatch === 0);

// ── ⑥ normalizeSubmissionSchema 대조 ────────────────────────────────
console.log('\n[normalizeSubmissionSchema 대조]');

const NORMALIZE_CASES = [
  null,
  undefined,
  {},
  { fields: [] },
  { fields: 'not-an-array' },
  { type: 'question_based', label: 'X', notice: 'Y', fields: [{ key: 'a', label: 'A', helper: 'h' }] },
  { fields: [{}, {}] },
  { fields: [{ key: 'k1', required: false }, { label: '라벨만' }] },
  { type: '', label: '', notice: '', fields: [{ key: '', label: '', helper: '' }] }
];

let normalizeMismatch = 0;
for (const input of NORMALIZE_CASES) {
  const expected = stripRows(original.normalizeSubmissionSchema(input));
  const actual = ported.normalizeSubmissionSchema(input);
  if (JSON.stringify(expected) !== JSON.stringify(actual)) {
    normalizeMismatch += 1;
    console.log(`  FAIL ${JSON.stringify(input)}\n       원본 ${JSON.stringify(expected)}\n       이식 ${JSON.stringify(actual)}`);
  }
}
check(`정규화 ${NORMALIZE_CASES.length}건 일치 (rows 제외)`, normalizeMismatch === 0);

// ── ⑦ `rows`가 유일한 차이인가 ──────────────────────────────────────
// 위 대조는 전부 `stripRows`를 거친다. 그 전제 자체 — 원본 필드가 정확히 5키이고
// 우리 필드가 정확히 그 4키라는 것 — 을 여기서 못박는다.
console.log('\n[rows 폐기가 유일한 차이인가 — §12.2 3행]');

const sampleOriginal = original.inferSubmissionSchema(CASES[1].text);
const samplePorted = ported.inferSubmissionSchema(CASES[1].text);

check(
  '원본 필드 키 = [key,label,helper,rows,required]',
  sampleOriginal.fields.every((f) => JSON.stringify(Object.keys(f)) === JSON.stringify(['key', 'label', 'helper', 'rows', 'required']))
);
check(
  '이식 필드 키 = [key,label,helper,required] (rows만 빠짐)',
  samplePorted.fields.every((f) => JSON.stringify(Object.keys(f)) === JSON.stringify(['key', 'label', 'helper', 'required']))
);
check(
  '이식본 어디에도 rows가 남아 있지 않다',
  !fs.readFileSync(PORT_FILE, 'utf8').match(/^\s*rows\s*[:,]/m)
);

// ── ⑧ 리터럴 원문 대조 ──────────────────────────────────────────────
// 행동이 같아도 리터럴을 "정리"해두면 다음 사람이 판정을 바꾸기 쉬워진다.
console.log('\n[리터럴 원문 대조]');

const portText = fs.readFileSync(PORT_FILE, 'utf8');

// 이식 대상 구간에서 `isRubricLikeQuestion`/`extractAssessmentQuestions` 본문은 뺀다 —
// 그 둘은 `guide-structure.js`에 이미 있고 여기서 사본을 만들지 않는 것이 규정이다(③).
const rubricStart = originalSlice.indexOf('function isRubricLikeQuestion');
const rubricEnd = originalSlice.indexOf('function inferLengthBasedSchema');
const portScopeSlice = originalSlice.slice(0, rubricStart) + originalSlice.slice(rubricEnd);

const sourceRegexLiterals = [...portScopeSlice.matchAll(/\/(?:\\.|\[(?:\\.|[^\]\\])*\]|[^/\\\n])+\/[gimsuy]*/g)]
  .map((m) => m[0])
  .filter((literal) => literal.length > 3);

const sourceStringLiterals = [...portScopeSlice.matchAll(/'((?:[^'\\]|\\.)*)'/g)]
  .map((m) => m[0])
  .filter((literal) => literal.length > 4);

const missingRegex = sourceRegexLiterals.filter((literal) => !portText.includes(literal));
check(
  `정규식 리터럴 ${sourceRegexLiterals.length}개 원문 보존`,
  sourceRegexLiterals.length >= 10 && missingRegex.length === 0,
  missingRegex.join('\n      ')
);

const missingString = sourceStringLiterals.filter((literal) => !portText.includes(literal));
check(
  `문자열 리터럴 ${sourceStringLiterals.length}개 원문 보존 (라벨·헬퍼·notice 전량)`,
  sourceStringLiterals.length >= 40 && missingString.length === 0,
  missingString.join('\n      ')
);

// 리터럴이 보존돼도 **행동**까지 같은지는 별개다. 대표 입력은 사람이 고른 것이라 어휘
// 하나가 빠져도(예: `뉴스레터`) 코퍼스에 없으면 통과해 버린다. 그래서 원본 정규식의
// alternation 토큰을 전부 뽑아 그 자체를 입력으로 먹인다.
const vocabulary = [...new Set(
  sourceRegexLiterals
    .flatMap((literal) => literal.replace(/^\/|\/[gimsuy]*$/g, '').split('|'))
    .map((token) => token
      .replace(/^\(|\)$/g, '')
      .replace(/\\s\*/g, '')
      .replace(/\\d\+/g, '3')
      .replace(/\\\?/g, '?'))
    .filter((token) => token && !/[\\[\](){}^$*+?]/.test(token))
)];

const vocabMismatch = vocabulary.filter((token) => !sameSchema(token).same);
check(
  `어휘 토큰 ${vocabulary.length}개 단건 판정 일치`,
  vocabulary.length >= 25 && vocabMismatch.length === 0,
  vocabMismatch.length ? vocabMismatch.join(', ') : `토큰 추출 실패(${vocabulary.length}개)`
);

// ── ⑨ 루브릭 판별이 두 벌이 아닌가 ──────────────────────────────────
// 외부에는 같은 판정이 클라이언트/서버 두 곳에 복제돼 있다. 우리는 P10이 옮긴
// `guide-structure.js` 것 하나만 쓴다. 그 전제(두 원본이 실제로 같다)를 매번 확인한다.
console.log('\n[루브릭 판별 단일화 — 사본 금지]');

if (fs.existsSync(SOURCE_FIND)) {
  const findText = fs.readFileSync(SOURCE_FIND, 'utf8');
  const grab = (src, from, to) => {
    const a = src.indexOf(from);
    return src.slice(a, src.indexOf(to, a)).trim();
  };
  const rubricHtml = grab(htmlText, 'function isRubricLikeQuestion', 'function extractAssessmentQuestions');
  const rubricApi = grab(findText, 'function isRubricLikeQuestion', 'function extractAnswerQuestions');
  const strip = (s) => s.replace(/\s+/g, '');

  check(
    'index.html:2076-2089 == find-resources.js:211-224 (공백 제외 동일)',
    strip(rubricHtml) === strip(rubricApi),
    `두 원본이 갈렸습니다. 임의 통합 금지 — 차이를 명세에 올릴 것.\n      html: ${rubricHtml}\n      api : ${rubricApi}`
  );

  // 행동 대조까지. 문자열이 같아도 확인 비용이 0이다.
  // eslint-disable-next-line no-new-func
  const apiRubric = new Function(`${rubricApi}\nreturn isRubricLikeQuestion;`)();
  const RUBRIC_CORPUS = [
    '', '   ',
    '도서명, 탐구 주제, 관련 단원을 구체적으로 제시하였는가?',
    '교과 개념과 진로를 논리적으로 연결했는가',
    '평가 기준: 자료 활용의 적절성', '배점 20점', '채점 기준표 참고', '체크리스트 3', '체크 3',
    '주제를 고른 이유는 무엇인가요?', '탐구 과정을 구체적으로 서술하시오.',
    '자료를 적절히 활용하여 근거를 제시', '자료를 적절히 활용하여 근거를 제시하시오',
    '느낀 점을 구체적으로 작성', '탐구 내용을 체계적으로 정리',
    '왜 그런 결과가 나왔는지 명확하게 설명', '실험 결과를 정확하게 반영',
    '하 였 는 가', '내용을 충실히 포함'
  ];
  const rubricMismatch = RUBRIC_CORPUS.filter((t) => {
    const a = original.isRubricLikeQuestion(t);
    const b = apiRubric(t);
    const c = ported.isRubricLikeQuestion(t);
    return !(a === b && b === c);
  });
  check(
    `루브릭 코퍼스 ${RUBRIC_CORPUS.length}건 3자(html/api/이식) 전건 일치`,
    rubricMismatch.length === 0,
    rubricMismatch.map((t) => JSON.stringify(t)).join(', ')
  );
} else {
  console.log('  --  find-resources.js 없음 — 두 원본 대조 생략');
}

check(
  '이식본에 isRubricLikeQuestion 사본이 없다 (guide-structure.js 재수출만)',
  !/function\s+isRubricLikeQuestion/.test(portText) && /from '\.\/guide-structure\.js'/.test(portText)
);

// ── ⑩ 글자 수 — Q35 결정 (§12.2 마지막 행) ──────────────────────────
// 「임계값 100 유지, 측정 대상만 변경」. 그 변경이 **실제로 결과를 바꾸는지** 본다.
console.log('\n[글자 수 — Q35: 결합 문자열 → 필드 값 순수 본문 합]');

const basic = ported.inferSubmissionSchema('');

// §12.2 마지막 행이 지목한 바로 그 오용: 「주제명만 붙여넣고 회차를 태운다」.
// 서론에 주제명(32자)만 넣고 본론·결론은 비운다.
const abuseTopic = '의료 정보의 비판적 수용: 건강기능식품 광고의 설득 전략 분석';
const abuseFields = { intro: abuseTopic, body: '', conclusion: '' };

const externalLen = original.buildSubmissionText(
  abuseTopic,
  original.inferSubmissionSchema(''),
  abuseFields
).trim().length;
const ourGate = ported.checkSubmissionMinLength(basic, abuseFields);

check(
  `외부 계산식(결합 문자열)은 주제명 붙여넣기를 통과시킨다 — ${externalLen}자 >= 100`,
  externalLen >= ported.SUBMISSION_MIN_CHARS,
  `외부 길이 ${externalLen}`
);
check(
  `우리 계산식은 같은 입력을 막는다 (본문 ${ourGate.total}자 < 100)`,
  ourGate.total === [...abuseTopic].length && ourGate.ok === false
);
check(
  '본문 0자면 필수 필드 누락이 라벨로 나온다',
  JSON.stringify(
    ported.checkSubmissionMinLength(basic, { intro: '', body: '', conclusion: '' }).missingRequired
  ) === JSON.stringify(['서론', '본론', '결론'])
);

check(
  '공백·개행 패딩은 0자로 접힌다 (오용 차단)',
  ported.countFieldChars('\n'.repeat(200)) === 0
    && ported.countFieldChars('   \t \n  ') === 0
    && ported.checkSubmissionMinLength(basic, { intro: ' '.repeat(500), body: '', conclusion: '' }).total === 0
);
check(
  '연속 공백은 1칸으로 접고 단일 공백은 센다',
  ported.countFieldChars('가  나   다') === 5 && ported.countFieldChars('가 나 다') === 5
);
check(
  '코드 포인트 단위 (이모지 1자)',
  ported.countFieldChars('🙂') === 1 && '🙂'.length === 2
);
check(
  '스키마 밖 키는 세지 않는다 (게이트 우회 차단)',
  ported.countSubmissionChars(basic, { intro: '가', junk: '나'.repeat(500) }).total === 1
);
check(
  'char_counts는 스키마 전 필드 키를 갖는다 (빈 값도 0으로)',
  JSON.stringify(Object.keys(ported.countSubmissionChars(basic, { intro: '가' }).perField))
    === JSON.stringify(['intro', 'body', 'conclusion'])
);

const pass = ported.checkSubmissionMinLength(basic, {
  intro: '가'.repeat(40),
  body: '나'.repeat(40),
  conclusion: '다'.repeat(20)
});
check('임계값 정확히 100자 → 통과', pass.total === 100 && pass.ok === true && pass.threshold === 100);

const fail99 = ported.checkSubmissionMinLength(basic, {
  intro: '가'.repeat(40),
  body: '나'.repeat(40),
  conclusion: '다'.repeat(19)
});
check('99자 → 차단', fail99.total === 99 && fail99.ok === false && fail99.missingRequired.length === 0);

// ── ⑪ 세션 어댑터 ───────────────────────────────────────────────────
console.log('\n[세션 어댑터]');

check(
  'upload 모드 → guide_json.text로 판정 + inferred:true',
  (() => {
    const r = ported.resolveSessionSubmissionSchema({
      guide_input_mode: 'upload',
      guide_json: { mode: 'upload', text: '질문 1: 주제를 고른 이유는 무엇인가요?' }
    });
    return r.inferred === true && r.schema.type === 'question_based';
  })()
);
check(
  'manual 모드 → guide_freetext로 판정',
  ported.resolveSessionSubmissionSchema({
    guide_input_mode: 'manual',
    guide_freetext: '카드뉴스 4장을 제작한다.'
  }).schema.type === 'cardnews'
);
check(
  '영속화된 submission_schema가 있으면 재판정하지 않는다 (inferred:false)',
  (() => {
    const r = ported.resolveSessionSubmissionSchema({
      guide_input_mode: 'manual',
      guide_freetext: '카드뉴스 4장을 제작한다.',
      submission_schema: { type: 'basic_report', label: '기본 보고서형', notice: 'n', fields: [{ key: 'intro', label: '서론', helper: '' }] }
    });
    return r.inferred === false && r.schema.type === 'basic_report' && r.schema.fields.length === 1;
  })()
);
check(
  '입력 없음 → 기본 보고서형 (throw 없음)',
  ported.resolveSessionSubmissionSchema({}).schema.type === 'basic_report'
    && ported.resolveSessionSubmissionSchema().schema.type === 'basic_report'
);

// ── 결과 ────────────────────────────────────────────────────────────
console.log('');

if (failures.length) {
  console.error(`FAIL verify-performance-submission-schema — ${failures.length}건\n`);
  failures.forEach((failure) => console.error(`  - ${failure}`));
  process.exit(1);
}

console.log('PASS verify-performance-submission-schema — 제출 스키마 8종이 원본과 동일합니다.');
