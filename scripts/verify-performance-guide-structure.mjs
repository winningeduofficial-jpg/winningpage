// =====================================================================
// 수행평가 안내문 판정 회귀 검증 (원본 함수 직접 실행 대조)
//
//   node scripts/verify-performance-guide-structure.mjs
//
// 무엇을 막는가
// -------------
// `api/_lib/performance/guide-structure.js`는 외부 앱
// (`/Users/hyunsoo/uwellnow/suhaengpyeong`) `api/find-resources.js:211-299`의
// 도메인 규칙을 옮긴 것이다(docs/수행평가-상세-명세.md §12.2 2·3행). 정규식 하나,
// 어휘 하나, if 순서 하나가 바뀌어도 **코드는 그대로 돌고 판정만 조용히 뒤집힌다.**
// 그래서 사람 눈 대신 이 스크립트가 원본 함수를 실제로 실행해 대조한다.
//
// 어떻게 대조하는가
// -----------------
// 원본의 세 함수는 export가 없고, 파일을 그냥 import하면 Supabase/Gemini 모듈이 딸려
// 올라와 env 없이는 터진다. 그래서 **함수 선언 3개만 텍스트로 잘라내 `new Function`으로
// 되살린다.** 잘라낸 구간에 예상 밖의 코드가 섞이면 즉시 실패한다(앵커 검증).
//
//   ① 유형 대조   — 7유형 대표 입력 + 경계 케이스에서 `{type,reason,writingFrame}` 완전 일치
//   ② 우선순위    — 키워드 조합 전수(2^6=64가지)에서 원본과 같은 유형이 나오는지
//   ③ 루브릭 대조 — `isRubricLikeQuestion` 코퍼스 전건 일치(`''` → true 성질 포함)
//   ④ 리터럴 대조 — 원본 구간의 정규식 리터럴·도메인 문자열이 우리 모듈에 원문 그대로 존재
//
// 원본이 없으면 SKIP
// ------------------
// 외부 앱은 이 저장소에 없는 로컬 경로다. CI에서는 조용히 SKIP(exit 0)하고, 원본이 있는
// 로컬에서만 실제 대조가 돈다. 경로는 `SUHAENGPYEONG_DIR`로 덮어쓸 수 있다.
// (④ 리터럴 대조는 원본이 있어야 기준값을 얻으므로 함께 SKIP된다.)
// =====================================================================

import assert from "node:assert";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const REPO_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const SOURCE_DIR =
  process.env.SUHAENGPYEONG_DIR || "/Users/hyunsoo/uwellnow/suhaengpyeong";
const SOURCE_FILE = path.join(SOURCE_DIR, "api/find-resources.js");
const PORT_FILE = path.join(
  REPO_ROOT,
  "api/_lib/performance/guide-structure.js",
);

if (!fs.existsSync(SOURCE_FILE)) {
  console.log(
    `SKIP verify-performance-guide-structure — 이식 원본 없음 (${SOURCE_DIR})`,
  );
  process.exit(0);
}

const failures = [];

function check(name, condition, detail = "") {
  if (condition) {
    console.log(`  ok  ${name}`);
    return;
  }
  failures.push(detail ? `${name}\n      ${detail}` : name);
  console.log(`  FAIL ${name}`);
}

// ── ① 원본 함수 되살리기 ────────────────────────────────────────────
const sourceText = fs.readFileSync(SOURCE_FILE, "utf8");
const sliceStart = sourceText.indexOf("function isRubricLikeQuestion");
const sliceEnd = sourceText.indexOf("export default");

if (sliceStart < 0 || sliceEnd < 0 || sliceEnd <= sliceStart) {
  console.error(
    "FAIL: 원본에서 도메인 규칙 구간을 찾지 못했습니다 (find-resources.js 구조 변경?).",
  );
  process.exit(1);
}

const originalSlice = sourceText.slice(sliceStart, sliceEnd).trim();
const declaredFns = [...originalSlice.matchAll(/^function\s+(\w+)/gm)].map(
  (m) => m[1],
);

// 잘라낸 구간이 기대한 3함수 정확히 그것인지. 원본에 함수가 추가/삭제되면 여기서 멈춘다.
assert.deepStrictEqual(
  declaredFns,
  [
    "isRubricLikeQuestion",
    "extractAnswerQuestions",
    "inferAssessmentStructure",
  ],
  `원본 구간 함수 목록이 예상과 다릅니다: ${declaredFns.join(", ")}`,
);

// eslint-disable-next-line no-new-func
const original = new Function(
  `${originalSlice}\nreturn { isRubricLikeQuestion, extractAnswerQuestions, inferAssessmentStructure };`,
)();

const ported = await import(
  path.join(REPO_ROOT, "api/_lib/performance/guide-structure.js")
);

// ── ② 7유형 대표 입력 + 경계 케이스 ─────────────────────────────────
// `label`은 사람이 읽는 이름일 뿐이고, 정답은 항상 **원본 실행 결과**다.
const CASES = [
  // ── 7유형 대표 입력
  {
    label: "1. 문항별 답변형",
    text: [
      "[수행평가 기본 정보]",
      "- 교과/과목: 과학 / 생명과학",
      "",
      "[답변 문항 목록 - 절대 누락 금지]",
      "질문 1: 선택한 주제를 고른 이유는 무엇인가요?",
      "질문 2: 탐구 과정에서 확인한 사실을 서술하시오.",
    ].join("\n"),
  },
  {
    label: "2. 카드뉴스·홍보물형",
    text: "[세부 요구사항]\n- 필수 포함 내용: 감염병 예방 카드뉴스 4장 제작\n질문 목록 없음",
  },
  {
    label: "3. 발표·PPT형",
    text: "[수행평가 기본 정보]\n- 수행평가 유형: 조별 발표\n- 제출 형식: PPT 10장 + 발표 대본\n질문 목록 없음",
  },
  {
    label: "4. 칼럼·논술형",
    text: "[세부 요구사항]\n- 사회 문제에 대한 자신의 주장을 담은 칼럼을 작성한다.\n질문 목록 없음",
  },
  {
    label: "5. 안내문 맞춤 작성형",
    text: "[세부 요구사항]\n- 필수 포함 내용: 주제 선정 이유, 탐구 내용, 배우고 느낀 점\n- 분량: 1000자 이상\n질문 목록 없음",
  },
  {
    label: "6. 탐구보고서형",
    text: "[수행평가 기본 정보]\n- 수행평가 유형: 실험 결과를 정리한 탐구보고서 제출\n질문 목록 없음",
  },
  {
    label: "7. 기본 보고서형",
    text: "[수행평가 기본 정보]\n- 교과/과목: 국어 / 화법과 언어\n- 제출 기한: 정보 없음\n질문 목록 없음",
  },

  // ── 경계 케이스 (우선순위가 실제로 갈리는 지점)
  {
    // B1. 문항형 ∧ 보고서 — 1번이 6번을 이겨야 한다.
    label: "B1. 문항형 + 탐구보고서 동시 충족",
    text: [
      "[수행평가 기본 정보]",
      "- 제출 형식: 실험 탐구보고서",
      "[답변 문항 목록]",
      "질문 1: 실험 설계에서 통제한 변인은 무엇인가요?",
    ].join("\n"),
  },
  {
    // B2. 루브릭만 있는 안내문 — "질문 n:"으로 적혔지만 전부 평가기준이라
    //     문항형이 발동하면 안 된다. 남는 키워드(보고서)로 떨어져야 한다.
    label: "B2. 질문 형식이지만 전부 루브릭 (문항형 미발동)",
    text: [
      "[평가 기준 및 배점]",
      "질문 1: 도서명, 탐구 주제, 관련 단원을 구체적으로 제시하였는가?",
      "질문 2: 교과 개념과 진로를 논리적으로 연결했는가?",
      "[세부 요구사항]",
      "- 조사 보고서 형태로 제출",
    ].join("\n"),
  },
  {
    // B3. 카드뉴스 ∧ 발표 ∧ 칼럼 ∧ 분량 ∧ 보고서 — 2번이 전부 이겨야 한다.
    label: "B3. 카드뉴스 + 발표 + 칼럼 + 분량 + 보고서 동시 충족",
    text: "카드뉴스와 PPT 발표, 그리고 칼럼을 함께 제출하는 탐구보고서. 분량은 800자 이상.\n질문 목록 없음",
  },
  {
    // B4. 발표 ∧ 칼럼 — 3번이 4번을 이겨야 한다.
    label: "B4. 발표 + 칼럼 동시 충족",
    text: "주장하는 글(논설문)을 쓰고 이를 프레젠테이션으로 발표한다.",
  },
  {
    // B5. 칼럼 ∧ 분량 — 4번이 5번을 이겨야 한다.
    label: "B5. 칼럼 + 분량조건 동시 충족",
    text: "비평문을 1200자 이상 작성하여 제출한다.",
  },
  {
    // B6. 분량 ∧ 보고서 — 5번이 6번을 이겨야 한다.
    label: "B6. 분량조건 + 보고서 동시 충족",
    text: "탐구 내용을 정리한 조사 보고서를 제출한다.",
  },
  {
    // B7. 문항 번호가 뒤섞이고 중복된 경우 — 정렬·중복제거 동작.
    label: "B7. 문항 번호 역순 + 중복",
    text: [
      "- 질문 3: 후속 탐구 계획을 어떻게 세울 것인가요?",
      "• 질문 1: 주제를 고른 이유는 무엇인가요?",
      "질문 1: 주제를 고른 이유는 무엇인가요?",
      "질문 2：전각 콜론으로 적힌 문항은 무엇을 묻나요?",
    ].join("\n"),
  },
  {
    // B8. 문항 13개 — writingFrame이 12개에서 잘리는가.
    label: "B8. 문항 13개 (상위 12개 절단)",
    text: Array.from(
      { length: 13 },
      (_, i) => `질문 ${i + 1}: ${i + 1}번 문항은 무엇을 묻나요?`,
    ).join("\n"),
  },
  {
    label: "B9. 빈 문자열",
    text: "",
  },
  {
    label: "B10. 공백만",
    text: "   \n\n\t  ",
  },
  {
    // B11. "질문 목록 없음" 리터럴이 문항으로 잡히면 안 된다.
    label: "B11. 질문 목록 없음 리터럴",
    text: "[답변 문항 목록 - 절대 누락 금지]\n질문 1: 질문 목록 없음\n[세부 요구사항]\n- 에세이 작성",
  },
  {
    // B12. 문항이 한 줄 안에 이어 붙은 경우(행 앵커 실패) — 문항형이 아니어야 한다.
    //      직렬화 시 줄바꿈을 뭉개면 이 결과가 나온다는 것을 고정한다.
    label: "B12. 개행 없이 한 줄로 뭉갠 안내문 (행 앵커 실패)",
    text: "[답변 문항 목록] 질문 1: 주제 선정 이유는 무엇인가요? 질문 2: 탐구 결과는 무엇인가요?",
  },
  {
    label: "B13. 대문자 PPT / 소문자 ppt",
    text: "PPT 자료를 제작한다.",
  },
  {
    label: "B14. 「탐구 내용」 띄어쓰기 변형",
    text: "탐구  내용을 정리하시오.",
  },
];

console.log("\n[유형 판정 대조 — 7유형 + 경계 케이스]");

for (const testCase of CASES) {
  const expected = original.inferAssessmentStructure(testCase.text);
  const actual = ported.inferAssessmentStructure(testCase.text);
  const same = JSON.stringify(expected) === JSON.stringify(actual);

  check(
    `${testCase.label} → ${expected.type}`,
    same,
    same
      ? ""
      : `원본 ${JSON.stringify(expected)}\n      이식 ${JSON.stringify(actual)}`,
  );
}

// ── ③ 우선순위 전수 대조 ────────────────────────────────────────────
// 6개 유형 트리거 조각의 부분집합 64가지를 만들어 붙인다. if 순서가 하나라도 바뀌면
// 이 중 다수가 즉시 어긋난다.
const TRIGGERS = [
  "질문 1: 이 주제를 고른 이유는 무엇인가요?", // 1. 문항형
  "카드뉴스 형태로 제작", // 2. 카드뉴스
  "발표 대본을 준비", // 3. 발표
  "칼럼 형식으로 작성", // 4. 칼럼
  "분량은 500자 이상", // 5. 맞춤 작성형
  "탐구보고서로 제출", // 6. 보고서
];

let comboMismatch = 0;
let comboFirst = "";

for (let mask = 0; mask < 1 << TRIGGERS.length; mask += 1) {
  const parts = TRIGGERS.filter((_, i) => mask & (1 << i));
  const text = parts.join("\n");
  const expected = original.inferAssessmentStructure(text);
  const actual = ported.inferAssessmentStructure(text);

  if (JSON.stringify(expected) !== JSON.stringify(actual)) {
    comboMismatch += 1;
    if (!comboFirst)
      comboFirst = `입력 ${JSON.stringify(text)}\n      원본 ${expected.type} / 이식 ${actual.type}`;
  }
}

console.log("\n[우선순위 전수 대조]");
check(
  `키워드 조합 ${1 << TRIGGERS.length}가지 전건 일치`,
  comboMismatch === 0,
  comboFirst,
);

// ── ④ 루브릭 판별 대조 ──────────────────────────────────────────────
const RUBRIC_CORPUS = [
  "",
  "   ",
  "도서명, 탐구 주제, 관련 단원을 구체적으로 제시하였는가?",
  "교과 개념과 진로를 논리적으로 연결했는가",
  "평가 기준: 자료 활용의 적절성",
  "배점 20점",
  "채점 기준표 참고",
  "체크리스트 3",
  "체크 3",
  "주제를 고른 이유는 무엇인가요?",
  "탐구 과정을 구체적으로 서술하시오.",
  "자료를 적절히 활용하여 근거를 제시", // ② 3항 복합 → true
  "자료를 적절히 활용하여 근거를 제시하시오", // 의문 표지(제시하시오) → false
  "느낀 점을 구체적으로 작성", // '느낀' → false
  "탐구 내용을 체계적으로 정리", // 수행 동사 없음 → false
  "왜 그런 결과가 나왔는지 명확하게 설명",
  "실험 결과를 정확하게 반영",
  "하 였 는 가", // 공백 접기 후 매칭
  "내용을 충실히 포함",
];

console.log("\n[루브릭 판별 대조]");
let rubricMismatch = 0;

for (const text of RUBRIC_CORPUS) {
  const expected = original.isRubricLikeQuestion(text);
  const actual = ported.isRubricLikeQuestion(text);
  if (expected !== actual) {
    rubricMismatch += 1;
    console.log(
      `  FAIL ${JSON.stringify(text)} — 원본 ${expected} / 이식 ${actual}`,
    );
  }
}

check(
  `isRubricLikeQuestion 코퍼스 ${RUBRIC_CORPUS.length}건 전건 일치`,
  rubricMismatch === 0,
);

// 명세 §12.2 2행이 "호출부와 함께 옮겨야 의도 보존"이라고 못박은 성질. 값 자체를 고정한다.
check(
  "isRubricLikeQuestion('') === true (§12.2 2행, 빈 문항은 답변 문항에서 제외)",
  ported.isRubricLikeQuestion("") === true &&
    original.isRubricLikeQuestion("") === true,
);

// ── ⑤ 리터럴 원문 대조 ──────────────────────────────────────────────
// 행동이 같아도 리터럴을 "정리"해두면 다음 사람이 판정을 바꾸기 쉬워진다. 원본 구간의
// 정규식 리터럴과 도메인 문자열이 우리 모듈 안에 **문자 그대로** 있는지 본다.
const portText = fs.readFileSync(PORT_FILE, "utf8");

const sourceRegexLiterals = [
  ...originalSlice.matchAll(
    /\/(?:\\.|\[(?:\\.|[^\]\\])*\]|[^/\\\n])+\/[gimsuy]*/g,
  ),
]
  .map((m) => m[0])
  .filter((literal) => literal.length > 3);

const sourceStringLiterals = [...originalSlice.matchAll(/'((?:[^'\\]|\\.)*)'/g)]
  .map((m) => m[0])
  .filter((literal) => literal.length > 4);

console.log("\n[리터럴 원문 대조]");

const missingRegex = sourceRegexLiterals.filter(
  (literal) => !portText.includes(literal),
);
check(
  `정규식 리터럴 ${sourceRegexLiterals.length}개 원문 보존`,
  missingRegex.length === 0,
  missingRegex.join("\n      "),
);

const missingString = sourceStringLiterals.filter(
  (literal) => !portText.includes(literal),
);
check(
  `문자열 리터럴 ${sourceStringLiterals.length}개 원문 보존`,
  missingString.length === 0,
  missingString.join("\n      "),
);

// 리터럴이 보존돼도 **행동**까지 같은지는 별개다. 위 CASES는 사람이 고른 대표 입력이라
// 어휘 하나가 빠져도(예: `뉴스레터`) 코퍼스에 그 단어가 없으면 통과해 버린다.
// 그래서 원본 정규식의 alternation 토큰을 **전부 뽑아** 그 자체를 입력으로 먹인다.
// 어휘 목록에서 한 항목이 사라지면 그 토큰 입력에서 즉시 유형이 갈린다.
const vocabulary = [
  ...new Set(
    sourceRegexLiterals
      .flatMap((literal) => literal.replace(/^\/|\/[gimsuy]*$/g, "").split("|"))
      .map((token) =>
        token
          .replace(/^\(|\)$/g, "")
          .replace(/\\s\*/g, "") // `평가\s*기준` → `평가기준`
          .replace(/\\d\+/g, "3") // `\d+자 이상` → `3자이상`
          .replace(/\\\?/g, "?"),
      )
      .filter((token) => token && !/[\\[\](){}^$*+?]/.test(token)),
  ),
];

const vocabMismatch = [];

for (const token of vocabulary) {
  const structureSame =
    JSON.stringify(original.inferAssessmentStructure(token)) ===
    JSON.stringify(ported.inferAssessmentStructure(token));
  const rubricSame =
    original.isRubricLikeQuestion(token) === ported.isRubricLikeQuestion(token);
  if (!structureSame || !rubricSame) vocabMismatch.push(token);
}

check(
  `어휘 토큰 ${vocabulary.length}개 단건 판정 일치`,
  vocabulary.length >= 50 && vocabMismatch.length === 0,
  vocabMismatch.length
    ? vocabMismatch.join(", ")
    : `토큰 추출 실패(${vocabulary.length}개)`,
);

// ── ⑥ 판정 입력 직렬화 ──────────────────────────────────────────────
// `guideTextFromSession`은 우리 저장소에만 있는 어댑터라 원본 대조 대상이 아니다.
// 대신 "어느 컬럼을 읽는가"만 고정한다(§8.3, api/performance/analyze-guide.js).
console.log("\n[판정 입력 직렬화]");

const uploadSession = {
  guide_input_mode: "upload",
  guide_json: {
    mode: "upload",
    text: "질문 1: 주제를 고른 이유는 무엇인가요?",
  },
  guide_freetext: null,
};
const manualSession = {
  guide_input_mode: "manual",
  guide_json: null,
  guide_freetext: "카드뉴스 4장을 제작한다.",
};

check(
  "upload 모드 → guide_json.text (줄바꿈 보존)",
  ported.inferGuideStructure(uploadSession).type === "문항별 답변형",
);
check(
  "manual 모드 → guide_freetext",
  ported.inferGuideStructure(manualSession).type === "카드뉴스·홍보물형",
);
check(
  "입력 없음 → 기본 보고서형 (throw 없음)",
  ported.inferGuideStructure({}).type === "기본 보고서형" &&
    ported.inferGuideStructure().type === "기본 보고서형",
);

// ── 결과 ────────────────────────────────────────────────────────────
console.log("");

if (failures.length) {
  console.error(
    `FAIL verify-performance-guide-structure — ${failures.length}건\n`,
  );
  failures.forEach((failure) => {
    console.error(`  - ${failure}`);
  });
  process.exit(1);
}

console.log(
  "PASS verify-performance-guide-structure — 안내문 판정이 원본과 동일합니다.",
);
