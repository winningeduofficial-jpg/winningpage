// 섹션 문서 React 렌더 컴포넌트 검증 — scripts/verify-admission-block-render.mjs 이식.
//
// renderDocToHtml(HTML 미러 렌더러)가 아직 없어(phase0 진행 중) 아직은
// Gate B(React 출력 vs renderDocToHtml 출력 DOM 비교)를 돌릴 수 없다. 그
// 전까지는 설계 문서 §5.3 DOM 동형성 계약 표를 정답으로 놓고, 각
// variant/블록이 그 표의 클래스 문자열을 정확히 내는지만 자체 검증한다.
// renderDocToHtml이 커밋되면 이 파일은 Gate B의 한쪽 입력(React 출력)
// 생성기로 재사용될 수 있다.
//
// 이식 전(node:test 시절) 이 스크립트는 esbuild build() 번들링(react/react-dom
// external)으로 AdmissionSectionView.jsx를 노드에서 로드했다. task
// 10.1(PR #107)의 Vitest + jsdom 도입으로 그 트릭이 필요 없어졌다 — Vite/
// Vitest가 TSX 변환·모듈 해석을 그대로 해 준다. rawHtml 블록이 내부적으로
// 쓰는 SafeHtml도 jsdom 전역 DOMParser로 자연히 동작한다(globalThis.DOMParser
// 셔임 불필요 — src/components/admission/SafeHtml.test.tsx와 동일 이유).
//
// 실행: npx vitest run src/components/admission/AdmissionSectionView.test.tsx

import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test } from "vitest";
import type { AdmissionDoc, Block } from "@/lib/admissionDoc";
import AdmissionSectionView from "./AdmissionSectionView";

function render(
  doc: AdmissionDoc | null,
  sectionKey = "selection_method",
  surface = "public",
) {
  return renderToStaticMarkup(
    <AdmissionSectionView
      doc={doc}
      sectionKey={sectionKey}
      surface={surface}
    />,
  );
}

function baseDoc(
  blocks: Block[],
  extra: Partial<AdmissionDoc> = {},
): AdmissionDoc {
  return {
    v: 1,
    section: "selection_method",
    source: "parser",
    generator: "test",
    generatedAt: "2026-01-01T00:00:00.000Z",
    blocks,
    ...extra,
  } as AdmissionDoc;
}

function classesOf(out: string): string[] {
  const re = /class="([^"]*)"/g;
  const found: string[] = [];
  let m = re.exec(out);
  while (m) {
    found.push(m[1] as string);
    m = re.exec(out);
  }
  return found;
}

function hasClass(out: string, cls: string): boolean {
  return classesOf(out).some((c) => c.split(/\s+/).includes(cls));
}

function classSetsEqual(actual: string, expected: string): boolean {
  const a = new Set(actual.split(/\s+/).filter(Boolean));
  const b = new Set(expected.split(/\s+/).filter(Boolean));
  if (a.size !== b.size) return false;
  for (const cls of a) if (!b.has(cls)) return false;
  return true;
}

// 설계 §7-2 ② — thead 마크업 완전 문자열 골든용. 첫 <thead>…</thead>를
// 있는 그대로(속성 순서·케이싱 포함) 잘라낸다. 정규화하지 않는 것이 핵심이다:
// 정규화하는 순간 rowSpan/colSpan 케이싱이나 class 위치 변화를 놓친다.
function theadOf(out: string): string {
  const start = out.indexOf("<thead>");
  const end = out.indexOf("</thead>");
  if (start === -1 || end === -1) return "";
  return out.slice(start, end + "</thead>".length);
}

function findTagWithExactClass(
  out: string,
  tag: string,
  expectedClass: string,
): boolean {
  const re = new RegExp(`<${tag}\\b[^>]*class="([^"]*)"`, "g");
  let m = re.exec(out);
  while (m) {
    if (classSetsEqual(m[1] as string, expectedClass)) return true;
    m = re.exec(out);
  }
  return false;
}

function countTag(html: string, tag: string): number {
  const re = new RegExp(`<${tag}(?=[\\s/>])`, "gi");
  return (html.match(re) || []).length;
}

// ── 표 6종 ──────────────────────────────────────────────────────────

test("table:selection — 클래스 5종 + badge has/none + 빈값 리터럴 -", () => {
  const doc = baseDoc([
    {
      kind: "table",
      variant: "selection",
      columns: [
        { role: "type", label: "전형" },
        { role: "name", label: "전형명" },
        { role: "seats", label: "인원" },
        { role: "minimum", label: "최저" },
        { role: "method", label: "전형방법" },
      ],
      rows: [
        [
          "학생부교과",
          "일반전형",
          "10",
          { text: "3등급", badge: "minimumHas" },
          "내신 100%",
        ],
        ["", "", "", "", ""],
      ],
    } as unknown as Block,
  ]);
  const out = render(doc);
  expect(findTagWithExactClass(out, "div", "admission-scroll-table"), out).toBe(
    true,
  );
  expect(
    findTagWithExactClass(
      out,
      "table",
      "admission-data-table admission-selection-table",
    ),
    out,
  ).toBe(true);
  expect(findTagWithExactClass(out, "td", "selection-type-cell"), out).toBe(
    true,
  );
  expect(
    findTagWithExactClass(out, "td", "left selection-name-cell"),
    out,
  ).toBe(true);
  expect(findTagWithExactClass(out, "td", "selection-seat-cell"), out).toBe(
    true,
  );
  expect(findTagWithExactClass(out, "td", "selection-minimum-cell"), out).toBe(
    true,
  );
  expect(
    findTagWithExactClass(out, "td", "left selection-method-cell"),
    out,
  ).toBe(true);
  expect(
    findTagWithExactClass(out, "span", "admission-minimum-badge has"),
    out,
  ).toBe(true);
  expect(
    findTagWithExactClass(out, "span", "admission-minimum-badge none"),
    out,
  ).toBe(true);
  expect(out, out).toContain(">-<"); // 빈 type/name/seats/method 셀의 리터럴 '-'
  expect(out, out).not.toContain("muted"); // selection은 muted span을 쓰지 않는다
});

test("table:change — 클래스 + 빈값 폴백(no/title 리터럴, content muted)", () => {
  const doc = baseDoc([
    {
      kind: "table",
      variant: "change",
      columns: [
        { role: "no", label: "번호" },
        { role: "title", label: "변경 항목" },
        { role: "content", label: "변경 내용" },
      ],
      rows: [
        ["1", "모집인원", "10명 → 12명"],
        ["", "", ""],
      ],
    } as unknown as Block,
  ]);
  const out = render(doc);
  expect(
    findTagWithExactClass(
      out,
      "div",
      "admission-scroll-table admission-change-scroll-table",
    ),
    out,
  ).toBe(true);
  expect(
    findTagWithExactClass(
      out,
      "table",
      "admission-data-table admission-change-table admission-change-table-v87",
    ),
    out,
  ).toBe(true);
  expect(findTagWithExactClass(out, "td", "change-no-cell"), out).toBe(true);
  expect(findTagWithExactClass(out, "td", "change-title-cell"), out).toBe(true);
  expect(findTagWithExactClass(out, "td", "change-content-cell"), out).toBe(
    true,
  );
  expect(
    findTagWithExactClass(out, "div", "admission-change-plain-cell"),
    out,
  ).toBe(true);
  expect(out, out).toContain("주요 변경"); // title 빈값 폴백
  expect(hasClass(out, "muted"), out).toBe(true); // content 빈값은 muted span
});

test("table:recruit — chips 구조 + 빈 값 muted", () => {
  const doc = baseDoc([
    {
      kind: "table",
      variant: "recruit",
      columns: [
        { role: "group", label: "계열/대학" },
        { role: "unit", label: "모집단위" },
        { role: "data", label: "일반전형" },
      ],
      rows: [
        ["인문", "국어교육과", { chips: [{ label: "27 인원", value: "18" }] }],
        ["", "", {}],
      ],
    } as unknown as Block,
  ]);
  const out = render(doc);
  expect(
    findTagWithExactClass(
      out,
      "table",
      "admission-data-table admission-recruit-table",
    ),
    out,
  ).toBe(true);
  expect(findTagWithExactClass(out, "td", "left group-cell"), out).toBe(true);
  expect(findTagWithExactClass(out, "td", "left unit-cell"), out).toBe(true);
  expect(findTagWithExactClass(out, "td", "recruit-values-cell"), out).toBe(
    true,
  );
  expect(
    findTagWithExactClass(out, "div", "admission-recruit-cell-values"),
    out,
  ).toBe(true);
  expect(out, out).toContain("<b>27 인원</b>18");
  expect(hasClass(out, "muted"), out).toBe(true);
});

test("table:recruitExact — 2단 헤더(rowSpan/colSpan) + series-cell + muted", () => {
  const doc = baseDoc([
    {
      kind: "table",
      variant: "recruitExact",
      columns: [
        { role: "series", label: "계열" },
        { role: "unit", label: "모집단위" },
        { role: "data", label: "27 인원" },
        { role: "data", label: "26 인원" },
      ],
      fixedColumnCount: 2,
      groups: [{ name: "일반전형", count: 2 }],
      rows: [
        ["인문", "국어교육과", "18", ""],
        ["", "", "", ""],
      ],
    } as unknown as Block,
  ]);
  const out = render(doc);
  expect(
    findTagWithExactClass(
      out,
      "table",
      "admission-data-table admission-normalized-recruit-table",
    ),
    out,
  ).toBe(true);
  expect(findTagWithExactClass(out, "th", "fixed-head"), out).toBe(true);
  expect(findTagWithExactClass(out, "th", "recruit-group-head"), out).toBe(
    true,
  );
  // 정규식이 대소문자 무관이라 react-dom 버전에 따른 rowSpan/colSpan 케이싱
  // 차이(react-dom 18.3.1은 rowspan=, 19.2.8은 rowSpan=)와 무관하게 통과한다
  // — 정확한 바이트 케이싱은 아래 thead 완전 문자열 골든 테스트가 고정한다.
  expect(out, out).toMatch(/rowspan="2"/i);
  expect(out, out).toMatch(/colspan="2"/i);
  expect(findTagWithExactClass(out, "td", "left series-cell"), out).toBe(true);
  expect(findTagWithExactClass(out, "td", "left"), out).toBe(true);
  expect(hasClass(out, "muted"), out).toBe(true);
});

// ── 설계 §7-2 ② — recruitExact 비대칭 픽스처 + thead 완전 문자열 골든 ──
//
// 위 픽스처는 fixedColumnCount:2 / groups count 2라 rowspan과 colspan이 둘
// 다 2다. 즉 두 속성을 서로 뒤바꿔도, 헤더 두 행의 순서를 뒤집어도
// `/rowspan="2"/i && /colspan="2"/i` 단언이 그대로 통과한다. 아래 픽스처는
// fixedColumnCount:1 / groups count 3·2로 세 숫자를 전부 다르게 만들어 그
// 자리바꿈을 실제로 잡는다.
//
// 골든 문자열은 통합 이전 렌더러(blocks/tables/RecruitExactTable.jsx)와
// 바이트 동일함이 확인된 현행 출력이다. 여기서 한 글자라도 달라지면 공개 표
// DOM이 바뀐 것이므로 골든을 고치기 전에 왜 바뀌었는지부터 답해야 한다.
// rowSpan/colSpan 둘 다 카멜케이스 — react-dom 19.2.8 SSR 실측(task 4a React 19
// 승격 이후). 18.3.1 시절엔 rowSpan만 rowspan=으로 나오는 케이싱 비대칭이
// 있었으나 19에서 해소됐다(SafeHtml.test.tsx 1번 테스트 주석 참고).
describe("table:recruitExact 비대칭(fixed=1, groups 3+2)", () => {
  const doc = baseDoc([
    {
      kind: "table",
      variant: "recruitExact",
      columns: [
        { role: "series", label: "계열" },
        { role: "unit", label: "가군" },
        { role: "data", label: "나군" },
        { role: "data", label: "다군" },
        { role: "data", label: "라군" },
        { role: "data", label: "마군" },
      ],
      fixedColumnCount: 1,
      groups: [
        { name: "수시", count: 3 },
        { name: "정시", count: 2 },
      ],
      rows: [["인문", "1", "2", "3", "4", "5"]],
    } as unknown as Block,
  ]);
  const out = render(doc);

  test("thead 완전 문자열 골든", () => {
    // react-dom 19.2.8 실측: rowSpan/colSpan 둘 다 카멜케이스로 나온다 —
    // react-dom 18.3.1의 rowSpan→rowspan= 케이싱 비대칭 버그는 React 19에서
    // 해소됐다(task 4a React 19 승격 이후 실측 확인, 이 파일 작성 시점 재확인).
    const GOLDEN_THEAD =
      "<thead><tr>" +
      '<th rowSpan="2" class="fixed-head">계열</th>' +
      '<th colSpan="3" class="recruit-group-head">수시</th>' +
      '<th colSpan="2" class="recruit-group-head">정시</th>' +
      "</tr><tr>" +
      "<th>가군</th><th>나군</th><th>다군</th><th>라군</th><th>마군</th>" +
      "</tr></thead>";
    expect(theadOf(out), `actual=${theadOf(out)}`).toBe(GOLDEN_THEAD);
  });

  test("tbody 고정열 경계(td 클래스) 골든", () => {
    // fixedColumnCount:1이므로 series-cell은 0열 하나뿐이고 1열은 left도
    // 아니다(대칭 픽스처에서는 1열이 left라 이 차이가 드러나지 않는다).
    const GOLDEN_TBODY =
      "<tbody><tr>" +
      '<td class="left series-cell">인문</td>' +
      "<td>1</td><td>2</td><td>3</td><td>4</td><td>5</td>" +
      "</tr></tbody>";
    const tbody = out.slice(
      out.indexOf("<tbody>"),
      out.indexOf("</tbody>") + 8,
    );
    expect(tbody, `actual=${tbody}`).toBe(GOLDEN_TBODY);
  });
});

describe.each(["exam", "minimum", "recordInfo", "score", "special"] as const)(
  "table:%s",
  (variant) => {
    const expectedTableClass = {
      exam: "admission-data-table admission-exam-table",
      minimum: "admission-data-table admission-minimum-table",
      recordInfo: "admission-data-table admission-record-info-table",
      score: "admission-data-table admission-score-table",
      special: "admission-data-table admission-special-table",
    }[variant];
    const doc = baseDoc([
      {
        kind: "table",
        variant,
        columns: [
          { role: "col0", label: "A" },
          { role: "col1", label: "B" },
          { role: "col2", label: "C" },
        ],
        rows: [
          ["x", "y", "z"],
          ["", "", ""],
        ],
      } as unknown as Block,
    ]);
    const out = render(doc);

    test("GenericTable idx0·1 left + muted, compact 미적용", () => {
      expect(findTagWithExactClass(out, "table", expectedTableClass), out).toBe(
        true,
      );
      expect(out.match(/class="left"/g)?.length, out).toBe(4); // idx0·1 두 셀 * 2행
      expect(hasClass(out, "muted"), out).toBe(true);
      expect(out, out).not.toContain("admission-table-compact"); // 실측: compact는 현재 어느 variant에도 적용되지 않는다
    });

    // 설계 §7-2 ② — generic 계열 thead 완전 문자열 골든. 그룹 헤더가 없는
    // 단일 행이고 <th>에 클래스도 span도 붙지 않는다는 것이 계약이다.
    test("thead 완전 문자열 골든(1행, class/span 없음)", () => {
      expect(theadOf(out), `actual=${theadOf(out)}`).toBe(
        "<thead><tr><th>A</th><th>B</th><th>C</th></tr></thead>",
      );
    });
  },
);

// ── 비표 블록 9종 ──────────────────────────────────────────────────

describe("block:keyValue", () => {
  test("렌더 성공(legacy 대응 마크업 없음, 최소 구현)", () => {
    const doc = baseDoc([
      {
        kind: "keyValue",
        rows: [{ label: "지원자격", content: "고등학교 졸업(예정)자" }],
      } as unknown as Block,
    ]);
    const out = render(doc);
    expect(out, out).toContain("지원자격");
    expect(out, out).toContain("고등학교 졸업");
  });

  // 하위 호환 잠금 — `href` 확장(수행평가 설계 리포트 §8.5)이 들어온 뒤에도
  // href 없는 행은 앵커를 만들지 않는다. 대입 모집요강 생성 경로는 href를
  // 만들지 않으므로 이 경로가 정상이다.
  test("href 없으면 <a> 없음(기존 경로 불변)", () => {
    const doc = baseDoc([
      {
        kind: "keyValue",
        rows: [{ label: "지원자격", content: "고등학교 졸업(예정)자" }],
      } as unknown as Block,
    ]);
    const out = render(doc);
    expect(out, out).not.toContain("<a ");
  });

  // `href` 확장 — 외부 자료 링크라 새 창 + noopener noreferrer가 필수다.
  test("href 확장이 새 창 앵커 + 안전 속성을 낸다", () => {
    const doc = baseDoc([
      {
        kind: "keyValue",
        rows: [
          {
            label: "출처 링크",
            content: "https://example.org/a",
            href: "https://example.org/a",
          },
        ],
      } as unknown as Block,
    ]);
    const out = render(doc);
    expect(out, out).toContain('<a class="admission-inline-link"');
    expect(out, out).toContain('href="https://example.org/a"');
    expect(out, out).toContain('target="_blank"');
    expect(out, out).toContain('rel="noopener noreferrer"');
    expect(out, out).toContain('aria-label="https://example.org/a (새 창)"');
  });
});

test("block:plainList — ordered:true면 <ol>(번호 목록)", () => {
  // `ordered` 확장 — `<ol>` + admission-ordered-list. 기존 `<ul>` 경로는 아래 픽스처가 잠근다.
  const doc = baseDoc([
    {
      kind: "plainList",
      ordered: true,
      items: [
        { type: "bullet", text: "첫째" },
        { type: "bullet", text: "둘째" },
      ],
    } as unknown as Block,
  ]);
  const out = render(doc);
  expect(out, out).toContain(
    '<ol class="admission-bullet-list admission-ordered-list">',
  );
  expect(out, out).not.toContain("<ul");
  expect((out.match(/<li>/g) || []).length, out).toBe(2);
});

test("block:plainList — 연속 bullet을 ul 하나로 그룹화", () => {
  const doc = baseDoc([
    {
      kind: "plainList",
      items: [
        { type: "bullet", text: "항목1" },
        { type: "bullet", text: "항목2" },
        { type: "subtitle", text: "※ 주요변경사항" },
        { type: "text", text: "본문 텍스트" },
      ],
    } as unknown as Block,
  ]);
  const out = render(doc);
  const ulMatches = out.match(/<ul class="admission-bullet-list">/g) || [];
  const liMatches = out.match(/<li>/g) || [];
  expect(
    findTagWithExactClass(out, "div", "admission-readable-body"),
    out,
  ).toBe(true);
  expect(ulMatches.length, out).toBe(1); // 연속 bullet 2개가 ul 하나로 묶임
  expect(liMatches.length, out).toBe(2);
  expect(
    findTagWithExactClass(out, "div", "admission-subtitle-line"),
    out,
  ).toBe(true);
  expect(findTagWithExactClass(out, "div", "admission-text-line"), out).toBe(
    true,
  );
});

test("block:preText — admission-raw-pre admission-safe-text-block", () => {
  const doc = baseDoc([
    { kind: "preText", text: "1줄\n2줄" } as unknown as Block,
  ]);
  const out = render(doc);
  expect(
    findTagWithExactClass(
      out,
      "pre",
      "admission-raw-pre admission-safe-text-block",
    ),
    out,
  ).toBe(true);
});

test("block:emptyBox — admission-empty-box", () => {
  const doc = baseDoc([
    { kind: "emptyBox", message: "대학별고사일 없음" } as unknown as Block,
  ]);
  const out = render(doc);
  expect(findTagWithExactClass(out, "div", "admission-empty-box"), out).toBe(
    true,
  );
  expect(out, out).toContain("대학별고사일 없음");
});

test("block:note — admission-result-note(내용 있을 때만)", () => {
  const doc = baseDoc([
    { kind: "note", text: "실제 안내 문구" } as unknown as Block,
  ]);
  const out = render(doc);
  expect(findTagWithExactClass(out, "div", "admission-result-note"), out).toBe(
    true,
  );
  expect(out, out).toContain("실제 안내 문구");
});

test("block:note — 빈 텍스트면 렌더 생략", () => {
  // note 텍스트가 없으면 아예 렌더 안 함(6키 전부 빈 SECTION_NOTES와 동일 처리)
  const doc = baseDoc([{ kind: "note", text: "" } as unknown as Block]);
  const out = render(doc);
  expect(out, out).not.toContain("admission-result-note");
});

test("block:footnote — items를 공백 join해 div 하나로", () => {
  const doc = baseDoc([
    {
      kind: "footnote",
      items: ["교직과정", "자율전공 과정"],
    } as unknown as Block,
  ]);
  const out = render(doc);
  expect(findTagWithExactClass(out, "div", "admission-footnote"), out).toBe(
    true,
  );
  expect(out, out).toContain("교직과정 자율전공 과정");
});

test("block:heading — admission-subhead", () => {
  const doc = baseDoc([
    { kind: "heading", text: "국어 환산표" } as unknown as Block,
  ]);
  const out = render(doc);
  expect(findTagWithExactClass(out, "div", "admission-subhead"), out).toBe(
    true,
  );
  expect(out, out).toContain("국어 환산표");
});

test("block:group — section.admission-special-block + wrapModifier=special", () => {
  const doc = baseDoc(
    [
      {
        kind: "group",
        title: "전형 일정",
        children: [{ kind: "note", text: "내용" }],
      } as unknown as Block,
    ],
    { wrapModifier: "special" },
  );
  const out = render(doc);
  expect(
    findTagWithExactClass(out, "section", "admission-special-block"),
    out,
  ).toBe(true);
  expect(
    findTagWithExactClass(out, "div", "admission-special-title"),
    out,
  ).toBe(true);
  expect(
    findTagWithExactClass(
      out,
      "div",
      "admission-raw-section-wrap admission-special-wrap",
    ),
    out,
  ).toBe(true);
  expect(out, out).toContain("전형 일정");
  expect(out, out).toContain("내용");
});

test("block:rawHtml — SafeHtml + admission-existing-html 래퍼", () => {
  const doc = baseDoc([
    {
      kind: "rawHtml",
      html: '<table class="foo"><tr><td colspan="2">x</td></tr></table>',
      reason: "curated-html",
    } as unknown as Block,
  ]);
  const out = render(doc);
  expect(
    findTagWithExactClass(out, "div", "admission-existing-html"),
    out,
  ).toBe(true);
  expect(out, out).toContain('class="foo"');
  expect(out, out).toMatch(/colspan="2"/i);
  expect(countTag(out, "table"), out).toBe(1);
});

// ── 섹션 제목 + 루트 wrap ────────────────────────────────────────────

test("root — 섹션 제목(HWP_SECTION_TITLES) + admission-raw-section-wrap 형제 배치", () => {
  const doc = baseDoc([{ kind: "note", text: "내용" } as unknown as Block]);
  const out = render(doc, "selection_method");
  expect(
    out.startsWith(
      '<div class="admission-hwp-section-title">2. 전형방법</div>',
    ),
    out,
  ).toBe(true);
  expect(
    findTagWithExactClass(out, "div", "admission-raw-section-wrap"),
    out,
  ).toBe(true);
  expect(
    out.indexOf("admission-hwp-section-title") <
      out.indexOf("admission-raw-section-wrap"),
    out,
  ).toBe(true);
});

// 2026-08-06 dev DB 실측 확정: curated-html이 이미 admission-hwp-section-title을
// 품고 있으면(534셀) withHwpSectionHeading과 동일 규칙으로 제목 렌더를
// 생략해야 한다 — 안 그러면 어드민 화면에서 제목이 두 번 찍힌다.
test("root — 선두 rawHtml에 이미 heading 있으면 제목 중복 렌더 안 함", () => {
  const doc = baseDoc([
    {
      kind: "rawHtml",
      html: '<div class="admission-hwp-section-title">2. 전형방법</div><div class="admission-scroll-table">x</div>',
      reason: "curated-html",
    } as unknown as Block,
  ]);
  const out = render(doc, "selection_method");
  const titleCount = (out.match(/admission-hwp-section-title/g) || []).length;
  // rawHtml 안의 것 하나만 — AdmissionSectionView가 또 추가하지 않음
  expect(titleCount, `titleCount=${titleCount} ${out}`).toBe(1);
});

test("root — 선두 rawHtml에 heading 없으면 제목 정상 렌더", () => {
  const doc = baseDoc([
    {
      kind: "rawHtml",
      html: '<div class="admission-scroll-table">heading 없는 본문</div>',
      reason: "curated-html",
    } as unknown as Block,
  ]);
  const out = render(doc, "selection_method");
  const titleCount = (out.match(/admission-hwp-section-title/g) || []).length;
  expect(titleCount, `titleCount=${titleCount} ${out}`).toBe(1);
  expect(out, out).toContain("2. 전형방법"); // 이 경우엔 정상적으로 렌더돼야 함
});

test("root — doc null이면 렌더 없음", () => {
  const out = render(null);
  expect(out).toBe("");
});

test("root — blocks 빈 배열이면 렌더 없음(isEmptyDoc)", () => {
  const doc = baseDoc([]);
  const out = render(doc);
  expect(out).toBe("");
});

test("root — v!==1이면 렌더 없음(조용한 성공 금지)", () => {
  const doc = {
    v: 2,
    section: "selection_method",
    blocks: [{ kind: "note", text: "x" }],
  } as unknown as AdmissionDoc;
  const out = render(doc);
  expect(out).toBe("");
});

// 상시 경고: Gate B(verify-admission-doc-equivalence.mjs, 실데이터 2506건)
// 코퍼스에는 recruitExact/generic variant, rawHtml/keyValue kind가 0건이다
// (2026-08-07 실측 — variant 집계 change 414 / selection 396 / recordInfo
// 414 / exam 360 / score 370 / minimum 252 / recruit 207 / special 84, kind
// 집계에 rawHtml·keyValue 없음). 즉 이 경로들의 회귀는 Gate B가 GREEN이어도
// 전혀 잡히지 않는다 — 위 합성 픽스처가 유일한 탐지기다.
