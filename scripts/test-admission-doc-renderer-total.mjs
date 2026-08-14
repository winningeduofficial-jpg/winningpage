// =====================================================================
// renderDocToHtml이 total 함수인지(예상 밖 블록 조합에서도 절대 던지지
// 않는지) 검증하는 합성 테스트. DB 미사용, 순수 함수 호출뿐이다.
//
// 배경: safehtml이 어드민 표 편집기(DocBlocksEditor.jsx) 배선 중, doc이
// validateAdmissionDoc은 통과하지만(스키마 형태만 검사) 섹션별 렌더러가
// 기대하는 table 블록이 없는 조합(예: recruitment_quota doc에 note만)에서
// renderDocToHtml이 예외를 던지는 걸 실제로 재현했다. 이 테스트는 그
// 계약("유효한 doc이면 절대 안 던진다")을 6개 섹션 전부에 대해 확인한다.
//
// 사용법: node scripts/test-admission-doc-renderer-total.mjs
// 종료 코드: 전부 통과하면 0, 하나라도 실패하면 1.
// =====================================================================

import admissionHwpSections from "../src/data/admissionHwpSections.json" with {
  type: "json",
};
import { validateAdmissionDoc } from "../src/lib/admissionDoc.ts";
import {
  buildRawSectionDoc,
  buildRawSectionHtml,
  buildSpecialCategoryDoc,
  renderDocToHtml,
} from "../src/lib/admissionParsing.js";

const SECTION_KEYS = [
  "previous_year_changes",
  "selection_method",
  "minimum_requirements",
  "exam_schedule",
  "school_record_method",
  "recruitment_quota",
];

let failCount = 0;
let passCount = 0;

function check(name, fn) {
  try {
    fn();
    passCount += 1;
    console.log(`PASS - ${name}`);
  } catch (err) {
    failCount += 1;
    console.log(`FAIL - ${name}: ${err.message}`);
  }
}

function assertNoThrowAndReturnsString(doc, sectionKey, label) {
  let result;
  let threw = false;
  let thrownMessage = "";
  try {
    result = renderDocToHtml(doc, sectionKey);
  } catch (err) {
    threw = true;
    thrownMessage = err.message;
  }
  if (threw) {
    throw new Error(
      `renderDocToHtml이 예외를 던졌다(${label}): ${thrownMessage}`,
    );
  }
  if (typeof result !== "string") {
    throw new Error(
      `renderDocToHtml이 문자열을 반환하지 않았다(${label}): ${typeof result}`,
    );
  }
}

// === 1) 6개 섹션 × note-only / emptyBox-only / 빈 blocks — 예외 없이 문자열 반환 ===
SECTION_KEYS.forEach((sectionKey) => {
  const noteOnlyDoc = {
    v: 1,
    section: sectionKey,
    generator: "test",
    generatedAt: new Date().toISOString(),
    blocks: [{ kind: "note", text: `${sectionKey} 테스트 노트` }],
  };
  const emptyBoxOnlyDoc = {
    v: 1,
    section: sectionKey,
    generator: "test",
    generatedAt: new Date().toISOString(),
    blocks: [{ kind: "emptyBox", message: "등록된 정보가 없습니다." }],
  };
  const emptyBlocksDoc = {
    v: 1,
    section: sectionKey,
    generator: "test",
    generatedAt: new Date().toISOString(),
    blocks: [],
  };

  [
    ["note-only", noteOnlyDoc],
    ["emptyBox-only", emptyBoxOnlyDoc],
    ["빈 blocks", emptyBlocksDoc],
  ].forEach(([label, doc]) => {
    check(`${sectionKey} / ${label}`, () => {
      // 먼저 validateAdmissionDoc이 이 doc을 유효하다고 판정하는지 확인한다
      // (그래야 "validate는 통과하는데 렌더가 던진다"는 사고 재현 조건과
      // 정확히 일치한다).
      const { ok, errors } = validateAdmissionDoc(doc);
      if (!ok)
        throw new Error(
          `합성 doc이 validateAdmissionDoc을 통과하지 못함(테스트 전제 붕괴): ${errors.join("; ")}`,
        );
      assertNoThrowAndReturnsString(doc, sectionKey, label);
    });
  });

  // 여러 블록이 섞여 있고 기대하는 table이 없는 조합도 확인한다(정보 손실
  // 없이 note+footnote가 렌더되는지까지는 아니고, 최소한 안 던지는지만).
  const mixedNoTableDoc = {
    v: 1,
    section: sectionKey,
    generator: "test",
    generatedAt: new Date().toISOString(),
    blocks: [
      { kind: "note", text: "섞인 조합 노트" },
      { kind: "footnote", items: ["각주 1", "각주 2"] },
      { kind: "heading", text: "소제목" },
    ],
  };
  check(`${sectionKey} / note+footnote+heading(table 없음)`, () => {
    const { ok, errors } = validateAdmissionDoc(mixedNoTableDoc);
    if (!ok)
      throw new Error(
        `합성 doc이 validateAdmissionDoc을 통과하지 못함: ${errors.join("; ")}`,
      );
    const html = renderDocToHtml(mixedNoTableDoc, sectionKey);
    if (!html.includes("섞인 조합 노트")) {
      throw new Error("note 텍스트가 렌더 결과에 포함되지 않았다(정보 손실).");
    }
  });
});

// === 2) 잘못된 variant의 table(예: 편집기가 만드는 generic 2컬럼 표)이
//    섞여 있어도 안 던지는지 — 컬럼 수 불일치로 크래시하던 두 번째 경로 ===
check("selection_method / variant 불일치 generic 2컬럼 table", () => {
  const doc = {
    v: 1,
    section: "selection_method",
    generator: "test",
    generatedAt: new Date().toISOString(),
    blocks: [
      {
        kind: "table",
        variant: "generic",
        columns: [
          { role: "a", label: "항목" },
          { role: "b", label: "내용" },
        ],
        rows: [["x", "y"]],
      },
    ],
  };
  const { ok, errors } = validateAdmissionDoc(doc);
  if (!ok)
    throw new Error(
      `합성 doc이 validateAdmissionDoc을 통과하지 못함: ${errors.join("; ")}`,
    );
  assertNoThrowAndReturnsString(
    doc,
    "selection_method",
    "generic table variant 불일치",
  );
});

// === 3) 정상 doc → 기존(buildRawSectionHtml)과 바이트 동일 ===
// Gate A2가 전 코퍼스를 이미 커버하지만, 이 렌더러 수정이 정상 경로를
// 안 건드렸는지 이 스크립트 안에서도 명시적으로 한 번 더 확인한다.
SECTION_KEYS.forEach((sectionKey) => {
  check(
    `정상 doc(실제 코퍼스 첫 샘플, ${sectionKey}) → buildRawSectionHtml과 바이트 동일`,
    () => {
      const universityName = Object.keys(admissionHwpSections).find((name) =>
        Boolean(admissionHwpSections[name][sectionKey]),
      );
      if (!universityName)
        throw new Error(
          `${sectionKey}에 raw가 있는 대학을 코퍼스에서 못 찾음.`,
        );
      const row = admissionHwpSections[universityName];
      const raw = row[sectionKey];

      const expectedHtml = buildRawSectionHtml(
        raw,
        sectionKey,
        row,
        universityName,
      );
      const doc = buildRawSectionDoc(raw, sectionKey, row, universityName);
      const actualHtml = renderDocToHtml(doc, sectionKey);

      if (actualHtml !== expectedHtml) {
        throw new Error(
          `바이트 불일치(${universityName}/${sectionKey}) — 이 렌더러 수정이 정상 경로를 건드렸다는 뜻이다. ` +
            `expected.length=${expectedHtml.length}, actual.length=${actualHtml.length}`,
        );
      }
    },
  );
});

// === 4) 특수대학(wrapModifier==='special') doc — 새 top-level 블록을
//    blocks 배열에 추가하면 renderDocToHtml 결과에 실제로 반영되는지.
//
// 2026-08-08 이전 renderSpecialBlocksHtml은 첫 GroupBlock의 title로 소스
// (경찰대/사관학교/과기원)를 판별한 뒤 그 소스 전용 하드코딩 제목
// 목록만 하나씩 조회해서 그렸다 — blocks 배열에 새 블록(관리자가
// DocBlocksEditor로 추가한 table/plainList/heading 등)이 실제로 들어가도
// 하드코딩 목록에 없는 한 절대 렌더되지 않았다("조용한 무시", team-lead
// 실측: 4053B → 4053B 무변화). 이 케이스가 그 회귀를 잡는다 — 경찰대
// (police, firstTitle='전형 일정'), 육군사관학교(academy, firstTitle=
// '전형 일정 비교'), 포항공과대학교(science, firstTitle='2027 수시·정시
// 전형 요약') 세 소스 분기를 전부 대표로 확인한다.
[
  { name: "경찰대학", source: "police" },
  { name: "육군사관학교", source: "academy" },
  { name: "포항공과대학교", source: "science" },
].forEach(({ name, source }) => {
  check(
    `selection_method / 특수대학(${source}:${name}) — 새 top-level table 블록이 렌더에 반영됨`,
    () => {
      const doc = buildSpecialCategoryDoc(
        "",
        { detail_status: "category", university_name: name },
        name,
      );
      if (doc.wrapModifier !== "special") {
        throw new Error(
          `테스트 전제 붕괴 — ${name} doc이 wrapModifier==='special'이 아니다: ${doc.wrapModifier}`,
        );
      }
      const before = renderDocToHtml(doc, "selection_method");

      const marker = `테스트마커-${source}-${Date.now()}`;
      doc.blocks.push({
        kind: "table",
        variant: "generic",
        columns: [
          { role: "type", label: "구분" },
          { role: "content", label: "내용" },
        ],
        rows: [["새 항목", marker]],
      });

      const { ok, errors } = validateAdmissionDoc(doc);
      if (!ok)
        throw new Error(
          `블록 추가 후 doc이 validateAdmissionDoc을 통과하지 못함: ${errors.join("; ")}`,
        );

      const after = renderDocToHtml(doc, "selection_method");
      if (after === before) {
        throw new Error(
          "새 블록을 추가해도 렌더 결과가 바뀌지 않았다 — 최상위 블록 추가가 조용히 무시됨(회귀).",
        );
      }
      if (!after.includes(marker)) {
        throw new Error(
          `새로 추가한 블록의 내용(${marker})이 렌더 결과에 포함되지 않았다.`,
        );
      }
    },
  );
});

console.log(
  `\n총 ${passCount + failCount}건 중 ${passCount}건 통과, ${failCount}건 실패.`,
);
process.exitCode = failCount ? 1 : 0;
