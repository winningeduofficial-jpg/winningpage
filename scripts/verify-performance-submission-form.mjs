// =====================================================================
// STEP5 제출폼(§5.14) 동적 렌더·게이트·접근성 회귀 검증
//
// 무엇을 막는가
// -------------
// ① **4필드 고정 폼으로 되돌아가는 것.** §6.1은 `schema`가 「4필드 고정이 아니라 8종
//    동적 스키마(문항형 최대 20필드)」라고 못박는데, 시안(§5.14)은 기본 보고서형 3필드
//    변형만 그린다. 시안만 보고 만들면 문항형 20문항 학생에게 서론·본론·결론 3칸이
//    뜬다 — 눈으로는 정상으로 보이고, 서버는 `400 UNKNOWN_FIELD`로만 반응한다.
// ② **글자 수 규칙이 두 벌로 갈라지는 것.** §8.3은 「시안 카운터와 동일 계산식 공유」를
//    요구한다. 클라이언트가 사본을 만들면 "카운터는 통과인데 서버가 400"이 되고, 그
//    증상은 100자 언저리에서만 나타나 테스트를 잘 빠져나간다. 여기서는 **서버 모듈이
//    계산한 기대값과 렌더된 카운터 문자열을 직접 대조**한다.
// ③ **접근성 회귀 4종** — 라벨 미연결(placeholder 대용), 헬퍼 소실(placeholder는 값이
//    차면 사라진다), 카운터 live region화(타이핑마다 낭독), 비활성 버튼의 사유 미전달
//    (`disabled` 속성은 포커스를 못 받아 `aria-describedby`가 영원히 안 읽힌다).
//
// 어떻게 도는가
// -------------
// 실제 컴포넌트 파일을 esbuild로 번들해 `renderToStaticMarkup` 한다. 사본이 아니라
// 배포되는 소스를 직접 검사한다(scripts/verify-performance-sidebar-nav.mjs 와 동일 관례).
// 스키마는 **서버 판별 모듈이 만든 것을 그대로** 넘긴다 — 화면이 받는 값의 출처와 같다.
//
//   node scripts/verify-performance-submission-form.mjs
// =====================================================================

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import * as esbuild from "esbuild";

const REPO_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);

const CHARS_FILE = path.join(
  REPO_ROOT,
  "api/_lib/performance/submission-chars.js",
);
const SCHEMA_FILE = path.join(
  REPO_ROOT,
  "api/_lib/performance/submission-schema.js",
);
const CLIENT_LIB = path.join(REPO_ROOT, "src/lib/performance/submission.js");
const FORM_FILE = path.join(
  REPO_ROOT,
  "src/components/performance/step5/SubmissionForm.jsx",
);
const COUNTER_FILE = path.join(
  REPO_ROOT,
  "src/components/performance/step5/CharCounter.jsx",
);

const schemaModule = await import(`file://${SCHEMA_FILE}`);
const charsModule = await import(`file://${CHARS_FILE}`);

const failures = [];
function check(label, condition, detail = "") {
  if (condition) {
    console.log(`  ok  ${label}`);
  } else {
    failures.push(label);
    console.log(`  FAIL ${label}${detail ? `\n      ${detail}` : ""}`);
  }
}

// ── 하네스 ───────────────────────────────────────────────────────────
const HARNESS = `
import React from 'react';
import SubmissionForm from './src/components/performance/step5/SubmissionForm.jsx';

export default function Harness(props) {
  return <SubmissionForm {...props} onChange={() => {}} />;
}
`;

async function loadHarness() {
  const stamp = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const harnessPath = path.join(
    REPO_ROOT,
    `.tmp-perf-submission-harness-${stamp}.jsx`,
  );
  const bundlePath = path.join(
    REPO_ROOT,
    `.tmp-perf-submission-bundle-${stamp}.mjs`,
  );
  fs.writeFileSync(harnessPath, HARNESS);
  try {
    const result = await esbuild.build({
      entryPoints: [harnessPath],
      bundle: true,
      format: "esm",
      jsx: "automatic",
      jsxImportSource: "react",
      platform: "node",
      mainFields: ["module", "main"],
      external: ["react", "react-dom", "react/jsx-runtime", "react-dom/server"],
      write: false,
    });
    fs.writeFileSync(bundlePath, result.outputFiles[0].text);
    return (await import(`file://${bundlePath}`)).default;
  } finally {
    fs.rmSync(harnessPath, { force: true });
    fs.rmSync(bundlePath, { force: true });
  }
}

const Harness = await loadHarness();
const render = (props) =>
  renderToStaticMarkup(React.createElement(Harness, props));

// ── DOM 헬퍼(정규식) — 이 폼의 마크업은 평평해서 파서를 끌어올 필요가 없다 ────────
const attrsOf = (tag) => {
  const map = {};
  for (const m of tag.matchAll(/([a-zA-Z-]+)="([^"]*)"/g)) map[m[1]] = m[2];
  return map;
};
const collect = (html, tagName) =>
  [...html.matchAll(new RegExp(`<${tagName}\\b([^>]*)>`, "g"))].map((m) =>
    attrsOf(m[0]),
  );
const labelsOf = (html) =>
  [...html.matchAll(/<label\b([^>]*)>([\s\S]*?)<\/label>/g)].map((m) => ({
    ...attrsOf(m[0].slice(0, m[0].indexOf(">") + 1)),
    text: m[2].replace(/<[^>]*>/g, "").trim(),
  }));
const idsInHtml = (html) =>
  new Set([...html.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]));

// ── 8종 스키마를 **서버 판별로** 만든다(화면이 받는 값의 출처와 동일) ──────────────
// 각 유형을 실제로 발동시키는 최소 안내문. `inferSubmissionSchema`가 8종 전부를 돌려주는지
// 자체가 1차 검사다 — 한 유형이라도 빠지면 아래 렌더 검사도 그 유형을 놓친다.
const GUIDES = [
  // `extractAnswerQuestions`가 인식하는 형태는 `질문 N: …` 줄이다(guide-structure.js:140).
  [
    "question_based",
    "질문 1: 주제를 고른 이유는 무엇인가요?\n질문 2: 탐구 과정을 소개해 주세요\n질문 3: 배운 점은 무엇인가요?",
  ],
  [
    "length_based_report",
    "분량은 1000자 내외로 작성하고 탐구 내용을 포함하세요.",
  ],
  ["cardnews", "카드뉴스 형태로 제작해 제출하세요."],
  ["presentation", "발표 자료와 대본을 준비해 제출하세요."],
  ["column", "칼럼 형식의 논술문으로 작성하세요."],
  ["book_review", "도서를 읽고 서평을 작성하세요."],
  ["research_report", "탐구보고서 형식으로 서론 본론 결론을 갖춰 작성하세요."],
  ["basic_report", ""],
];

console.log("[8종 동적 렌더 — §6.1 「4필드 고정이 아니다」]");

const schemas = new Map();
for (const [expectedType, guide] of GUIDES) {
  const schema = schemaModule.normalizeSubmissionSchema(
    schemaModule.inferSubmissionSchema(guide),
  );
  schemas.set(expectedType, schema);
  check(
    `${expectedType} 판별`,
    schema.type === expectedType,
    `안내문 "${guide}" → ${schema.type}`,
  );
}

for (const [type, schema] of schemas) {
  const html = render({ schema, value: {}, topicTitle: "테스트 주제" });
  const textareas = collect(html, "textarea");
  const labels = labelsOf(html);

  check(
    `${type}: 스키마 필드 ${schema.fields.length}개가 그대로 textarea ${schema.fields.length}개`,
    textareas.length === schema.fields.length,
    `textarea ${textareas.length}개`,
  );

  // 필드 순서·키·라벨이 스키마 그대로인가(화면이 재정렬·재명명하지 않는가).
  const renderedNames = textareas.map((t) => t.name);
  check(
    `${type}: 필드 키·순서가 스키마와 동일`,
    JSON.stringify(renderedNames) ===
      JSON.stringify(schema.fields.map((f) => f.key)),
    `렌더 ${JSON.stringify(renderedNames)}`,
  );

  // 라벨 연결 — placeholder 대용 금지. 주제 칸(+1)까지 세어 전 컨트롤이 라벨을 갖는다.
  const ids = idsInHtml(html);
  const orphanLabels = labels.filter((l) => !l.for || !ids.has(l.for));
  check(
    `${type}: 라벨 ${labels.length}개가 전부 실재 컨트롤에 연결(htmlFor)`,
    labels.length === schema.fields.length + 1 && orphanLabels.length === 0,
    `라벨 ${labels.length}개 / 미연결 ${orphanLabels.length}개`,
  );

  // 헬퍼는 placeholder로만 존재하면 값이 차는 순간 사라진다 → describedby 연결 필수.
  const helperMissing = schema.fields.filter((field) => {
    if (!field.helper) return false;
    const textarea = textareas.find((t) => t.name === field.key);
    const described = (textarea?.["aria-describedby"] || "").split(" ");
    return (
      !described.some((id) => id.endsWith("-helper")) ||
      !html.includes(field.helper)
    );
  });
  check(
    `${type}: 헬퍼 문구가 aria-describedby로도 연결(placeholder 소실 대비)`,
    helperMissing.length === 0,
    helperMissing.map((f) => f.key).join(", "),
  );

  // 카운터도 describedby에 들어가야 포커스 시 1회 읽힌다.
  const counterMissing = textareas.filter(
    (t) =>
      !(t["aria-describedby"] || "")
        .split(" ")
        .some((id) => id.endsWith("-counter")),
  );
  check(
    `${type}: 카운터가 aria-describedby로 연결`,
    counterMissing.length === 0,
    counterMissing.map((t) => t.name).join(", "),
  );
}

// ── 문항형 20필드(상한) ──────────────────────────────────────────────
console.log("\n[문항형 20필드 — §6.1 「문항형 최대 20필드」]");

const manyQuestions = Array.from(
  { length: 25 },
  (_, i) => `질문 ${i + 1}: ${i + 1}번 문항은 무엇인가요?`,
).join("\n");
const bigSchema = schemaModule.normalizeSubmissionSchema(
  schemaModule.inferSubmissionSchema(manyQuestions),
);
check(
  "25문항 안내문 → 20필드로 절단(서버)",
  bigSchema.fields.length === 20,
  `${bigSchema.fields.length}개`,
);

const bigHtml = render({ schema: bigSchema, value: {}, topicTitle: "주제" });
check("20필드가 전부 렌더된다", collect(bigHtml, "textarea").length === 20);
check(
  "20필드의 id가 전부 유일하다",
  idsInHtml(bigHtml).size === [...bigHtml.matchAll(/\sid="/g)].length,
);
// 고정 높이 + 내부 스크롤(§5.14 제안). 자동 확장으로 바뀌면 20필드에서 채팅 스크롤이 튄다.
check(
  "텍스트영역은 고정 높이 h-40(10rem) + resize 잠금",
  collect(bigHtml, "textarea").every(
    (t) => /\bh-40\b/.test(t.class) && /\bresize-none\b/.test(t.class),
  ),
);

// ── 카운터 값이 서버 계산식과 같은가 (§8.3 「동일 계산식 공유」) ──────────────────
console.log("\n[카운터 = 서버 계산식 — §8.3 / §12.2 Q35]");

const basic = schemas.get("basic_report");
const COUNT_CASES = [
  { intro: "가나다", body: "", conclusion: "" },
  { intro: "가  나   다", body: "\n\n\n", conclusion: "   " }, // 공백 접기
  { intro: "🙂🙂", body: "a b", conclusion: "" }, // 코드 포인트
  { intro: "한".repeat(120), body: "", conclusion: "" },
];

for (const [index, values] of COUNT_CASES.entries()) {
  const html = render({ schema: basic, value: values, topicTitle: "주제" });
  const counters = [
    ...html.matchAll(/<p id="[^"]*-counter"[^>]*>(\d+)자<\/p>/g),
  ].map((m) => Number(m[1]));
  const expected = basic.fields.map((f) =>
    charsModule.countFieldChars(values[f.key]),
  );
  check(
    `케이스 ${index + 1}: 카운터 ${JSON.stringify(counters)} == 서버 ${JSON.stringify(expected)}`,
    JSON.stringify(counters) === JSON.stringify(expected),
  );
}

// ── 제출 게이트 (§12.2 Q35 — 100자, 필드 값 순수 본문 합) ────────────────────────
console.log("\n[제출 게이트 100자 — 서버 왕복 전 차단]");

function submitButton(html) {
  const m = html.match(/<button[^>]*type="submit"[^>]*>/);
  return m ? attrsOf(m[0]) : null;
}
function saveButton(html) {
  const m = html.match(/<button[^>]*type="button"[^>]*>/);
  return m ? attrsOf(m[0]) : null;
}

const GATE_CASES = [
  { label: "빈 폼", values: {}, submitLocked: true, saveLocked: true },
  {
    label: "99자(임계값 미달)",
    values: { intro: "한".repeat(99), body: "", conclusion: "" },
    submitLocked: true,
    saveLocked: false,
  },
  {
    label: "100자지만 필수 필드 2개 공백",
    values: { intro: "한".repeat(100), body: "", conclusion: "" },
    submitLocked: true,
    saveLocked: false,
  },
  {
    label: "100자 + 필수 전부 작성",
    values: { intro: "한".repeat(98), body: "가", conclusion: "나" },
    submitLocked: false,
    saveLocked: false,
  },
];

for (const testCase of GATE_CASES) {
  const html = render({
    schema: basic,
    value: testCase.values,
    topicTitle: "주제",
  });
  const submit = submitButton(html);
  const save = saveButton(html);
  const gate = charsModule.checkFieldsMinLength(basic.fields, testCase.values);

  check(
    `${testCase.label}: 제출 ${testCase.submitLocked ? "잠김" : "열림"}`,
    submit?.["aria-disabled"] === String(testCase.submitLocked),
    `aria-disabled=${submit?.["aria-disabled"]} / 서버 판정 ok=${gate.ok}`,
  );
  check(
    `${testCase.label}: 중간 저장 ${testCase.saveLocked ? "잠김" : "열림"}`,
    save?.["aria-disabled"] === String(testCase.saveLocked),
  );
  // 화면 판정과 서버 판정이 같은 결론이어야 한다(둘이 갈리면 "카운터는 통과인데 400").
  check(
    `${testCase.label}: 화면 잠금 == 서버 게이트`,
    (submit?.["aria-disabled"] === "true") === !gate.ok,
  );
}

// ── 비활성 사유의 프로그램적 전달 ────────────────────────────────────
console.log("\n[비활성 사유 전달 — disabled 속성 금지]");

const lockedHtml = render({ schema: basic, value: {}, topicTitle: "주제" });
const lockedIds = idsInHtml(lockedHtml);

check(
  "버튼에 disabled 속성을 쓰지 않는다(포커스 유지 → describedby 낭독 가능)",
  !/<button[^>]*\sdisabled/.test(lockedHtml),
);
for (const button of [submitButton(lockedHtml), saveButton(lockedHtml)]) {
  const described = (button?.["aria-describedby"] || "")
    .split(" ")
    .filter(Boolean);
  check(
    `잠긴 버튼의 aria-describedby가 실재 요소를 가리킨다 (${button?.type})`,
    described.length > 0 && described.every((id) => lockedIds.has(id)),
    `describedby="${button?.["aria-describedby"]}"`,
  );
}

// ── 낭독 스팸 방지 ───────────────────────────────────────────────────
console.log("\n[aria-live 남용 금지]");

const typingHtml = render({
  schema: basic,
  value: { intro: "한".repeat(30), body: "", conclusion: "" },
  topicTitle: "주제",
});
check(
  "카운터는 live region이 아니다(타이핑마다 낭독 금지)",
  !/<p id="[^"]*-counter"[^>]*aria-live/.test(typingHtml),
);
const liveRegions = [
  ...typingHtml.matchAll(/<[^>]*aria-live="polite"[^>]*>([\s\S]*?)</g),
];
check(
  "polite live region은 임계값 통과 안내 1개뿐이고 미달 상태에서는 비어 있다",
  liveRegions.length === 1 && liveRegions[0][1].trim() === "",
  `${liveRegions.length}개 / 내용 "${liveRegions[0]?.[1]}"`,
);
// 위 두 검사는 **이 폼만 따로 렌더했을 때**의 성질이다. 실제 배치는 `ChatTimeline`
// 루트(`aria-live="polite"`) 안이고, ARIA 규정상 조상 live region이 서브트리의 텍스트
// 변경을 전부 announce하므로 루트에 `off`가 없으면 위 보장이 화면에서 무너진다(검토 P11).
check(
  '폼 루트가 aria-live="off"다 (조상 polite 무효화 — ChatTimeline 안에서도 성립)',
  /^<div[^>]*aria-live="off"/.test(typingHtml.trim()),
  typingHtml.trim().slice(0, 120),
);

// ── 규칙 사본 금지 (§8.3 「동일 계산식 공유」의 구조적 보장) ──────────────────────
console.log("\n[글자 수 규칙 단일화 — 사본 금지]");

const charsText = fs.readFileSync(CHARS_FILE, "utf8");
const clientText = fs.readFileSync(CLIENT_LIB, "utf8");
const formText = fs.readFileSync(FORM_FILE, "utf8");
const counterText = fs.readFileSync(COUNTER_FILE, "utf8");
const schemaText = fs.readFileSync(SCHEMA_FILE, "utf8");

check(
  "잎 모듈에 import가 하나도 없다(브라우저 번들이 서버 코드를 끌고 오지 않는다)",
  !/^\s*import\s/m.test(charsText),
);
check(
  "클라이언트는 잎 모듈을 재수출한다(사본이 아니라 같은 함수)",
  /from '\.\.\/\.\.\/\.\.\/api\/_lib\/performance\/submission-chars\.js'/.test(
    clientText,
  ),
);
check(
  "서버 스키마 모듈도 같은 잎 모듈을 쓴다",
  /from '\.\/submission-chars\.js'/.test(schemaText),
);
// 정규화 정규식이 잎 모듈 밖에 다시 나타나면 그게 곧 사본이다.
for (const [name, text] of [
  ["SubmissionForm.jsx", formText],
  ["CharCounter.jsx", counterText],
  ["src/lib/performance/submission.js", clientText],
]) {
  check(
    `${name}에 글자 수 계산 사본이 없다`,
    !/replace\(\/\\s\+\/g/.test(text) &&
      !/\[\.\.\.[A-Za-z]+\]\.length/.test(text),
  );
}
// 임계값도 잎 모듈이 정본이다 — 화면이 자기 상수로 다시 선언하면 서버가 100을 바꿀 때
// 조용히 갈라진다. (주석 안의 `100`은 근거 서술이라 검사 대상이 아니다 — 선언만 본다.)
check(
  "화면이 임계값을 따로 선언하지 않는다(SUBMISSION_MIN_CHARS를 쓴다)",
  /SUBMISSION_MIN_CHARS/.test(formText) &&
    !/(?:const|let|var)\s+\w+\s*=\s*100\b/.test(formText),
);

// ── 결과 ─────────────────────────────────────────────────────────────
if (failures.length) {
  console.error(
    `\nFAIL verify-performance-submission-form — ${failures.length}건\n`,
  );
  for (const failure of failures) console.error(`  · ${failure}`);
  process.exit(1);
}

console.log(
  "\nPASS verify-performance-submission-form — 제출폼이 8종 동적 스키마·게이트·접근성 계약을 지킵니다.",
);
