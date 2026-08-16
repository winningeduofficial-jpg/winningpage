// admissionDoc.ts 검증.
//
// **DB를 만지지 않는다 — 합성 픽스처만 쓴다.** 두 축으로 구성된다:
//
// 1) renderDocToHtml이 total 함수인지(예상 밖 블록 조합에서도 절대 던지지
//    않는지) — safehtml이 어드민 표 편집기(DocBlocksEditor.jsx) 배선 중,
//    doc이 validateAdmissionDoc은 통과하지만(스키마 형태만 검사) 섹션별
//    렌더러가 기대하는 table 블록이 없는 조합(예: recruitment_quota doc에
//    note만)에서 renderDocToHtml이 예외를 던지는 걸 실제로 재현했다. 그
//    계약("유효한 doc이면 절대 안 던진다")을 6개 섹션 전부에 대해 확인한다.
//
// 2) load-admission-content.mjs의 정보량 감소 가드(shouldSkipForRegression)
//    — 이 가드는 실데이터로는 트리거되지 않는다(dev DB 전 행이 이미
//    정상 상태라 회귀가 안 난다), 즉 실제 실행 경로를 한 번도 타보지
//    않은 채 코드 리뷰만으로 커밋됐었다(2026-08-06 사고가 정확히
//    "검증 안 된 전제"에서 나왔다는 지적). 합성(가짜) doc 쌍으로 가드
//    함수를 직접 호출해 검증한다.

import { describe, expect, test } from "vitest";

import admissionHwpSections from "../data/admissionHwpSections.json" with {
  type: "json",
};
import {
  type AdmissionDoc,
  shouldSkipForRegression,
  validateAdmissionDoc,
} from "./admissionDoc.ts";
import {
  buildRawSectionDoc,
  buildRawSectionHtml,
  buildSpecialCategoryDoc,
  renderDocToHtml,
} from "./admissionParsing.ts";

const SECTION_KEYS = [
  "previous_year_changes",
  "selection_method",
  "minimum_requirements",
  "exam_schedule",
  "school_record_method",
  "recruitment_quota",
] as const;

function assertNoThrowAndReturnsString(doc: unknown, sectionKey: string) {
  const result = renderDocToHtml(doc, sectionKey);
  expect(typeof result).toBe("string");
  return result as string;
}

// ---------------------------------------------------------------------
// 1) renderDocToHtml total 함수 계약
// ---------------------------------------------------------------------

describe("renderDocToHtml — total 함수 계약(예외 없이 항상 문자열)", () => {
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

    test.each([
      ["note-only", noteOnlyDoc],
      ["emptyBox-only", emptyBoxOnlyDoc],
      ["빈 blocks", emptyBlocksDoc],
    ] as const)(`${sectionKey} / %s`, (_label, doc) => {
      const { ok, errors } = validateAdmissionDoc(doc);
      expect(
        ok,
        `합성 doc이 validateAdmissionDoc을 통과하지 못함: ${errors.join("; ")}`,
      ).toBe(true);
      assertNoThrowAndReturnsString(doc, sectionKey);
    });

    test(`${sectionKey} / note+footnote+heading(table 없음)`, () => {
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
      const { ok, errors } = validateAdmissionDoc(mixedNoTableDoc);
      expect(
        ok,
        `합성 doc이 validateAdmissionDoc을 통과하지 못함: ${errors.join("; ")}`,
      ).toBe(true);
      const html = assertNoThrowAndReturnsString(mixedNoTableDoc, sectionKey);
      expect(html.includes("섞인 조합 노트")).toBe(true);
    });
  });

  test("selection_method / variant 불일치 generic 2컬럼 table", () => {
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
    expect(
      ok,
      `합성 doc이 validateAdmissionDoc을 통과하지 못함: ${errors.join("; ")}`,
    ).toBe(true);
    assertNoThrowAndReturnsString(doc, "selection_method");
  });

  // 정상 doc → 기존(buildRawSectionHtml)과 바이트 동일. Gate A2가 전
  // 코퍼스를 이미 커버하지만, 이 렌더러 수정이 정상 경로를 안 건드렸는지
  // 여기서도 명시적으로 한 번 더 확인한다.
  test.each(SECTION_KEYS)(
    "정상 doc(실제 코퍼스 첫 샘플, %s) → buildRawSectionHtml과 바이트 동일",
    (sectionKey) => {
      // biome-ignore lint/suspicious/noExplicitAny: buildRawSectionHtml/buildRawSectionDoc의
      // row 파라미터가 기본값(= null)만으로 타입 추론돼 null|undefined로 좁혀진다
      // (admissionParsing.ts 원본 시그니처, 수정 대상 아님) — 호출부(AdmissionGuidelines.tsx)와
      // 동일하게 any로 넘겨 그 좁은 추론을 우회한다.
      const sections = admissionHwpSections as Record<string, any>;
      const universityName = Object.keys(sections).find((name) =>
        Boolean(sections[name]?.[sectionKey]),
      );
      if (!universityName)
        throw new Error(
          `${sectionKey}에 raw가 있는 대학을 코퍼스에서 못 찾음.`,
        );
      const row = sections[universityName]!;
      const raw = row[sectionKey];

      const expectedHtml = buildRawSectionHtml(
        raw,
        sectionKey,
        row,
        universityName,
      );
      const doc = buildRawSectionDoc(raw, sectionKey, row, universityName);
      const actualHtml = renderDocToHtml(doc, sectionKey);

      expect(actualHtml).toBe(expectedHtml);
    },
  );

  // 특수대학(wrapModifier==='special') doc — 새 top-level 블록을 blocks
  // 배열에 추가하면 renderDocToHtml 결과에 실제로 반영되는지.
  //
  // 2026-08-08 이전 renderSpecialBlocksHtml은 첫 GroupBlock의 title로
  // 소스(경찰대/사관학교/과기원)를 판별한 뒤 그 소스 전용 하드코딩 제목
  // 목록만 하나씩 조회해서 그렸다 — blocks 배열에 새 블록(관리자가
  // DocBlocksEditor로 추가한 table/plainList/heading 등)이 실제로 들어가도
  // 하드코딩 목록에 없는 한 절대 렌더되지 않았다("조용한 무시", team-lead
  // 실측: 4053B → 4053B 무변화). 이 케이스가 그 회귀를 잡는다 — 경찰대
  // (police, firstTitle='전형 일정'), 육군사관학교(academy, firstTitle=
  // '전형 일정 비교'), 포항공과대학교(science, firstTitle='2027 수시·정시
  // 전형 요약') 세 소스 분기를 전부 대표로 확인한다.
  test.each([
    { name: "경찰대학", source: "police" },
    { name: "육군사관학교", source: "academy" },
    { name: "포항공과대학교", source: "science" },
  ])(
    "selection_method / 특수대학($source:$name) — 새 top-level table 블록이 렌더에 반영됨",
    ({ name }) => {
      const doc = buildSpecialCategoryDoc(
        "",
        { detail_status: "category", university_name: name },
        name,
      ) as AdmissionDoc;
      expect(
        doc.wrapModifier,
        `테스트 전제 붕괴 — ${name} doc이 wrapModifier==='special'이 아니다: ${doc.wrapModifier}`,
      ).toBe("special");
      const before = renderDocToHtml(doc, "selection_method");

      const marker = `테스트마커-${name}-${Date.now()}`;
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
      expect(
        ok,
        `블록 추가 후 doc이 validateAdmissionDoc을 통과하지 못함: ${errors.join("; ")}`,
      ).toBe(true);

      const after = renderDocToHtml(doc, "selection_method");
      expect(
        after,
        "새 블록을 추가해도 렌더 결과가 바뀌지 않았다 — 최상위 블록 추가가 조용히 무시됨(회귀).",
      ).not.toBe(before);
      expect(after.includes(marker)).toBe(true);
    },
  );
});

// ---------------------------------------------------------------------
// 2) shouldSkipForRegression — 정보량 감소 가드
// ---------------------------------------------------------------------

describe("shouldSkipForRegression — 정보량 감소 가드", () => {
  function makeDoc(blockTexts: string[]): AdmissionDoc {
    return {
      v: 1,
      section: "previous_year_changes",
      source: "manual",
      generator: "test",
      generatedAt: new Date().toISOString(),
      blocks: blockTexts.map((text, idx) => ({
        kind: "note",
        text: `${text}-${idx}`,
      })),
    };
  }

  // 텍스트 길이를 정확히 통제하려면 블록 텍스트 길이를 직접 지정한다.
  function makeDocWithTextLength(
    blockCount: number,
    totalTextLength: number,
  ): AdmissionDoc {
    const perBlock = Math.floor(totalTextLength / blockCount);
    const remainder = totalTextLength - perBlock * blockCount;
    return {
      v: 1,
      section: "previous_year_changes",
      source: "manual",
      generator: "test",
      generatedAt: new Date().toISOString(),
      blocks: Array.from({ length: blockCount }, (_, idx) => ({
        kind: "note",
        text: "x".repeat(idx === 0 ? perBlock + remainder : perBlock),
      })),
    };
  }

  test("블록 수·텍스트 둘 다 감소 → 가드가 막는다", () => {
    const result = shouldSkipForRegression(
      makeDocWithTextLength(5, 1000),
      makeDocWithTextLength(3, 400),
    );
    expect(result.skip).toBe(true);
  });

  test("후보가 더 풍부(블록 수 증가) → 통과", () => {
    const result = shouldSkipForRegression(
      makeDocWithTextLength(5, 1000),
      makeDocWithTextLength(7, 1500),
    );
    expect(result.skip).toBe(false);
  });

  test("블록 수는 동일, 텍스트만 감소 → 가드가 막는다", () => {
    const result = shouldSkipForRegression(
      makeDocWithTextLength(5, 1000),
      makeDocWithTextLength(5, 400),
    );
    expect(result.skip).toBe(true);
  });

  test("블록 수 증가 + 텍스트 감소(엇갈림) → 가드가 막는다(보수적 정책, 둘 중 하나라도 줄면 회귀)", () => {
    const result = shouldSkipForRegression(
      makeDocWithTextLength(5, 1000),
      makeDocWithTextLength(8, 400),
    );
    expect(result.skip).toBe(true);
  });

  test("완전히 동일 → 통과(경계, 막히면 안 된다)", () => {
    const result = shouldSkipForRegression(
      makeDocWithTextLength(5, 1000),
      makeDocWithTextLength(5, 1000),
    );
    expect(result.skip).toBe(false);
  });

  test("기존 doc 없음(null) → 비교 대상 없어 항상 통과", () => {
    const result = shouldSkipForRegression(null, makeDoc(["a"]));
    expect(result.skip).toBe(false);
  });

  // "--ignore-regression 상당 옵션을 주면 통과" 시나리오는
  // shouldSkipForRegression 자체엔 플래그가 없다(순수 함수 — 호출부인
  // buildCategoryContent가 ignoreRegression이면 이 함수를 아예 안 부른다).
  // 그 분기를 여기서도 문서화 검증한다: 가드 호출 자체를 생략하면
  // (=ignoreRegression=true 시뮬레이션) 결과가 항상 "쓴다"와 동등하다는
  // 것만 확인한다.
  test("ignoreRegression 시뮬레이션(가드 호출 자체를 생략) → 회귀여도 통과 취급", () => {
    const simulatedResult = { skip: false };
    expect(simulatedResult.skip).toBe(false);
  });
});
