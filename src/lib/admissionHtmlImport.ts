// =====================================================================
// legacy 저장 HTML(*_html, curated-html) → 구조화 문서(AdmissionDoc) 임포터
// 오케스트레이션 + DOM 동형성 비교기.
//
// 2026-08-06: scripts/import-legacy-admission-html.mjs에서 이 파일로
// 이동했다(위치만 이동, 동작은 100% 동일). 이유: 어드민 일괄 엑셀
// 업로드(admissionBulkXlsx.js)가 브라우저에서 이 오케스트레이션을 그대로
// 재사용해야 하는데, 원래 위치는 node:fs/promises·@supabase/supabase-js
// client 생성이 파일 최상단에 있어 브라우저 번들에 끼워 넣을 수 없었다.
// 이 파일은 순수 함수만 담는다 — DB 접근·파일 I/O·CLI 인자는 절대
// 들어오면 안 된다(scripts/import-legacy-admission-html.mjs가 여전히
// 담당). React/DOM 의존도 없다(admissionParsing.js와 동일 원칙).
//
// 배경(원래 주석 유지): Phase 3 백필 dry-run 실측 결과 raw+html이 둘 다
// 있는 셀은 예외 없이 전량 legacy-html(RawHtmlBlock 무손실 보존)로
// 떨어졌다(parser 분류 0건). 저장 HTML을 파싱해 TableBlock을 복원한다.
//
// 유리한 조건(실측): 대상 HTML이 전부 기계 생성이라 방언이 균일하고,
// 바디 셀 병합이 0건이다(DB 717셀 전수 확인 — <td rowspan|colspan> 0건,
// 헤더 <th> 병합만 976건). parseHtmlTableGrid(admissionParsing.js)가
// 이 전제로 헤더 span은 보존하고 바디는 직사각형으로 추출한다.
//
// 대상 카테고리 6종 전부: previous_year_changes(change, 3컬럼) /
// selection_method(selection, 5컬럼 + 특수대학 11개교는 생성) /
// minimum_requirements·exam_schedule(표+emptyBox+plainList 3단 폴백) /
// school_record_method(recordInfo+score 혼합) / recruitment_quota
// (recruitExact 2단 헤더 + 구버전 recruit chips + plainList).
//
// detail_status='category' 11개교(경찰대학/사관학교4/과기원6)는 원본이
// 하드코딩 상수(SCIENCE_SPECIAL_DATA 등)라 역파싱하지 않는다 —
// buildSpecialCategoryDoc으로 생성한 뒤 동일하게 DOM 동형 검증만 한다.
//
// 검증: 바이트가 아니라 DOM 동형성이다. renderDocToHtml(importedDoc)와
// 원본 dbHtml을 정규화 DOM으로 비교한다(scripts/verify-admission-doc-
// equivalence.mjs의 Gate B 비교기와 동일 로직). 실패하면 절대 강행하지
// 않는다 — doc은 null로 두고 rawHtml(curated-html)을 그대로 유지,
// needsReview로 반환한다.
// =====================================================================

import type { AdmissionDoc } from "./admissionDoc.js";
import { stableStringifyDoc } from "./admissionDoc.js";
import {
  buildSpecialCategoryDoc,
  clean,
  importChangeDocFromHtml,
  importEmptyBoxDocFromHtml,
  importExamDocFromHtml,
  importMinimumDocFromHtml,
  importPlainListDocFromHtml,
  importRecordDocFromHtml,
  importRecruitExactDocFromHtml,
  importRecruitLegacyDocFromHtml,
  importSelectionDocFromHtml,
  renderDocToHtml,
} from "./admissionParsing.js";

// 카테고리별 시도 순서(표 → emptyBox → plainList). 앞선 임포터가 null을
// 반환하거나 DOM 동형 검증에 실패하면 다음으로 넘어간다 — 전부 실패하면
// needsReview(강행 금지).
export const IMPORTER_CHAINS = {
  previous_year_changes: [
    { name: "table", run: (html) => importChangeDocFromHtml(html) },
    {
      name: "plainList",
      run: (html) => importPlainListDocFromHtml("previous_year_changes", html),
    },
  ],
  selection_method: [
    { name: "table", run: (html) => importSelectionDocFromHtml(html) },
    {
      name: "plainList",
      run: (html) => importPlainListDocFromHtml("selection_method", html),
    },
  ],
  minimum_requirements: [
    { name: "table", run: (html) => importMinimumDocFromHtml(html) },
    {
      name: "emptyBox",
      run: (html) => importEmptyBoxDocFromHtml("minimum_requirements", html),
    },
    {
      name: "plainList",
      run: (html) => importPlainListDocFromHtml("minimum_requirements", html),
    },
  ],
  exam_schedule: [
    { name: "table", run: (html) => importExamDocFromHtml(html) },
    {
      name: "emptyBox",
      run: (html) => importEmptyBoxDocFromHtml("exam_schedule", html),
    },
    {
      name: "plainList",
      run: (html) => importPlainListDocFromHtml("exam_schedule", html),
    },
  ],
  school_record_method: [
    { name: "record", run: (html) => importRecordDocFromHtml(html) },
    {
      name: "emptyBox",
      run: (html) => importEmptyBoxDocFromHtml("school_record_method", html),
    },
    {
      name: "plainList",
      run: (html) => importPlainListDocFromHtml("school_record_method", html),
    },
  ],
  recruitment_quota: [
    {
      name: "recruitExact",
      run: (html) => importRecruitExactDocFromHtml(html),
    },
    {
      name: "recruitLegacy",
      run: (html) => importRecruitLegacyDocFromHtml(html),
    },
    {
      name: "plainList",
      run: (html) => importPlainListDocFromHtml("recruitment_quota", html),
    },
  ],
};
export const SUPPORTED_CATEGORY_KEYS = Object.keys(IMPORTER_CHAINS);

// -----------------------------------------------------------------------
// DOM 동형성 비교기 — scripts/verify-admission-doc-equivalence.mjs의
// Gate B 비교기와 동일 로직(공백 정규화, class 토큰 집합, 태그·속성명
// 대소문자 무관). 그 파일을 import하지 않고 복제했다 — React를 로드하지
// 않는 독립 경량 구현이 낫다(브라우저에서도 이 이유가 그대로 유효하다).
// -----------------------------------------------------------------------
const VOID_ELEMENTS = new Set([
  "area",
  "base",
  "br",
  "col",
  "embed",
  "hr",
  "img",
  "input",
  "link",
  "meta",
  "param",
  "source",
  "track",
  "wbr",
]);

function decodeEntities(str) {
  return String(str)
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&");
}

function parseAttributeString(attrString) {
  const attrs = [];
  const re =
    /([a-zA-Z_:][-a-zA-Z0-9_:.]*)\s*(?:=\s*("([^"]*)"|'([^']*)'|[^\s"'=<>`]+))?/g;
  let m = re.exec(attrString);
  while (m) {
    const name = m[1];
    let value = "";
    if (m[2] !== undefined)
      value = m[3] !== undefined ? m[3] : m[4] !== undefined ? m[4] : m[2];
    attrs.push({ name, value: decodeEntities(value) });
    m = re.exec(attrString);
  }
  return attrs;
}

function makeElementNode(tagName, attrs) {
  const node = {
    nodeType: 1,
    tagName: tagName.toUpperCase(),
    attributes: attrs,
    childNodes: [],
  };
  Object.defineProperty(node, "textContent", {
    get() {
      return node.childNodes.map((c) => c.textContent || "").join("");
    },
  });
  return node;
}

function makeTextNode(text) {
  return { nodeType: 3, textContent: decodeEntities(text) };
}

function makeCommentNode() {
  return { nodeType: 8, textContent: "" };
}

function parseMiniHtml(html) {
  const root = makeElementNode("body", []);
  const stack = [root];
  let i = 0;
  const n = html.length;
  const top = () => stack[stack.length - 1];

  while (i < n) {
    if (html[i] === "<") {
      if (html.startsWith("<!--", i)) {
        const end = html.indexOf("-->", i + 4);
        top().childNodes.push(makeCommentNode());
        i = end === -1 ? n : end + 3;
        continue;
      }
      if (html.startsWith("<!", i)) {
        const end = html.indexOf(">", i);
        i = end === -1 ? n : end + 1;
        continue;
      }
      const closeMatch = /^<\/([a-zA-Z][a-zA-Z0-9-]*)\s*>/.exec(html.slice(i));
      if (closeMatch) {
        const tagName = closeMatch[1].toLowerCase();
        for (let s = stack.length - 1; s > 0; s -= 1) {
          if (stack[s].tagName.toLowerCase() === tagName) {
            stack.length = s;
            break;
          }
        }
        i += closeMatch[0].length;
        continue;
      }
      const openMatch =
        /^<([a-zA-Z][a-zA-Z0-9-]*)((?:[^>"']|"[^"]*"|'[^']*')*)(\/?)>/.exec(
          html.slice(i),
        );
      if (openMatch) {
        const tagName = openMatch[1];
        const attrs = parseAttributeString(openMatch[2]);
        const selfClose = Boolean(openMatch[3]);
        const el = makeElementNode(tagName, attrs);
        top().childNodes.push(el);
        const isVoid = VOID_ELEMENTS.has(tagName.toLowerCase());
        if (!selfClose && !isVoid) stack.push(el);
        i += openMatch[0].length;
        continue;
      }
      top().childNodes.push(makeTextNode("<"));
      i += 1;
      continue;
    }
    const next = html.indexOf("<", i);
    const end = next === -1 ? n : next;
    const text = html.slice(i, end);
    if (text) top().childNodes.push(makeTextNode(text));
    i = end;
  }

  return { body: root };
}

function normalizeWhitespaceText(text) {
  return String(text || "")
    .replace(/\s+/g, " ")
    .trim();
}

// 빈 admission-result-note/admission-recruit-legend는 renderDocToHtml만
// 낸다(SECTION_NOTES가 항상 ''). Gate B와 동일한 허용 diff.
function isAllowedEmptyDiffNode(node) {
  if (node.nodeType !== 1) return false;
  if (node.tagName.toLowerCase() !== "div") return false;
  const classAttr = node.attributes.find(
    (a) => a.name.toLowerCase() === "class",
  );
  const classes = (classAttr?.value || "").split(/\s+/).filter(Boolean);
  const isNoteDiv = classes.includes("admission-result-note");
  const isLegendDiv = classes.includes("admission-recruit-legend");
  if (!isNoteDiv && !isLegendDiv) return false;
  const hasElementChild = node.childNodes.some((c) => c.nodeType === 1);
  if (hasElementChild) return false;
  return normalizeWhitespaceText(node.textContent) === "";
}

function collectSignificantChildren(node) {
  const result = [];
  node.childNodes.forEach((child) => {
    if (child.nodeType === 8) return;
    if (child.nodeType === 3) {
      const text = normalizeWhitespaceText(child.textContent);
      if (text) result.push({ kind: "text", text });
      return;
    }
    if (child.nodeType === 1) {
      if (isAllowedEmptyDiffNode(child)) return;
      result.push({ kind: "element", node: child });
    }
  });
  return result;
}

function normalizeAttrs(node): Record<string, string> {
  const attrs: Record<string, string> = {};
  node.attributes.forEach((a) => {
    const name = a.name.toLowerCase();
    if (name === "class") {
      attrs.class = a.value.split(/\s+/).filter(Boolean).sort().join(" ");
    } else {
      attrs[name] = a.value;
    }
  });
  return attrs;
}

function truncateForReport(text, context = 100) {
  const s = String(text ?? "");
  if (s.length <= context * 2) return s;
  return `${s.slice(0, context)}…(${s.length - context * 2}자 생략)…${s.slice(-context)}`;
}

// 실측(DB 전수): <table> class에 variant 접미어(admission-minimum-table
// 등)가 붙어 있는 셀 수 —
//   minimum_requirements_html 207건 중 0건 / exam_schedule_html 207건
//   중 0건 (더 오래된 생성 경로) / school_record_method_html 207건 중
//   207건 / recruitment_result_html 207건 중 200건 / selection_method_html
//   218건 중 198건 / previous_year_changes_html 207건 중 207건(change는
//   variant 전용 class를 별도로 쓰지 않아 항상 일치).
// **접미어 클래스는 복원되지만 해당 CSS 규칙을 제거했으므로 화면 변화
// 없음(사용자 결정, 2026-08-06)** — 임포터·렌더러는 그대로 두고 접미어를
// 계속 붙인다(안 붙이면 renderDocToHtml이 골든과 어긋나 Gate A2가 깨진다).
//
// 이 허용은 <table> class 한정이다 — 다른 태그·다른 속성에는 적용하지
// 않는다(진짜 불일치를 가리는 일반 규칙으로 확대하지 않는다).
function tableClassCompatible(classA, classB) {
  const setA = new Set(classA.split(" ").filter(Boolean));
  const setB = new Set(classB.split(" ").filter(Boolean));
  if (!setA.has("admission-data-table") || !setB.has("admission-data-table"))
    return false;
  const [smaller, larger] =
    setA.size <= setB.size ? [setA, setB] : [setB, setA];
  for (const cls of smaller) if (!larger.has(cls)) return false;
  return true;
}

function compareElementNodes(a, b, pathLabel) {
  const tagA = a.tagName.toLowerCase();
  const tagB = b.tagName.toLowerCase();
  if (tagA !== tagB) {
    return {
      ok: false,
      reason: `태그 불일치: <${tagA}> vs <${tagB}>`,
      path: pathLabel,
    };
  }
  const nextPath = `${pathLabel}/${tagA}`;

  const attrsA = normalizeAttrs(a);
  const attrsB = normalizeAttrs(b);
  const attrKeys = new Set([...Object.keys(attrsA), ...Object.keys(attrsB)]);
  for (const key of attrKeys) {
    if ((attrsA[key] ?? "") !== (attrsB[key] ?? "")) {
      if (
        tagA === "table" &&
        key === "class" &&
        tableClassCompatible(attrsA.class ?? "", attrsB.class ?? "")
      ) {
        continue;
      }
      return {
        ok: false,
        reason: `${nextPath} 속성 ${key} 불일치: "${truncateForReport(attrsA[key] ?? "")}" vs "${truncateForReport(attrsB[key] ?? "")}"`,
        path: nextPath,
      };
    }
  }

  const childrenA = collectSignificantChildren(a);
  const childrenB = collectSignificantChildren(b);
  if (childrenA.length !== childrenB.length) {
    return {
      ok: false,
      reason: `${nextPath} 자식 수 불일치: ${childrenA.length} vs ${childrenB.length}`,
      path: nextPath,
    };
  }
  for (let i = 0; i < childrenA.length; i += 1) {
    const ca = childrenA[i];
    const cb = childrenB[i];
    if (ca.kind !== cb.kind) {
      return {
        ok: false,
        reason: `${nextPath} idx=${i} 자식 종류 불일치`,
        path: nextPath,
      };
    }
    if (ca.kind === "text") {
      if (ca.text !== cb.text) {
        return {
          ok: false,
          reason: `${nextPath} idx=${i} 텍스트 불일치: "${truncateForReport(ca.text)}" vs "${truncateForReport(cb.text)}"`,
          path: nextPath,
        };
      }
      continue;
    }
    const childResult = compareElementNodes(ca.node, cb.node, nextPath);
    if (!childResult.ok) return childResult;
  }

  return { ok: true };
}

// 임포트한 doc을 renderDocToHtml로 재렌더한 결과와 원본 dbHtml을 형제
// 목록으로 비교한다(둘 다 admission-hwp-section-title + admission-raw-
// section-wrap 형제 구조).
export function compareDomEquivalence(htmlA, htmlB) {
  const treeA = parseMiniHtml(htmlA);
  const treeB = parseMiniHtml(htmlB);
  const childrenA = collectSignificantChildren(treeA.body);
  const childrenB = collectSignificantChildren(treeB.body);

  if (childrenA.length !== childrenB.length) {
    return {
      ok: false,
      reason: `최상위 자식 수 불일치: ${childrenA.length} vs ${childrenB.length}`,
      path: "/",
    };
  }
  for (let i = 0; i < childrenA.length; i += 1) {
    const ca = childrenA[i];
    const cb = childrenB[i];
    if (ca.kind !== cb.kind)
      return {
        ok: false,
        reason: `최상위 idx=${i} 자식 종류 불일치`,
        path: "/",
      };
    if (ca.kind === "text") {
      if (ca.text !== cb.text) {
        return {
          ok: false,
          reason: `최상위 idx=${i} 텍스트 불일치: "${truncateForReport(ca.text)}" vs "${truncateForReport(cb.text)}"`,
          path: "/",
        };
      }
      continue;
    }
    const result = compareElementNodes(ca.node, cb.node, "");
    if (!result.ok) return result;
  }
  return { ok: true };
}

// -----------------------------------------------------------------------
// 저장 HTML 717셀(minimum/exam/school_record/recruitment)이 자체
// admission-table-wrap을 갖고 헤딩 타이틀은 없는 반면(설계 §9.2 "이중
// 중첩" — 모달이 바깥에 하나 더 씌운다), renderDocToHtml은 항상 헤딩 +
// admission-raw-section-wrap 단일 레이어를 낸다. 이 표면 구조 차이는
// 데이터 재구성 성공 여부와 무관한 이미 알려진 레거시 포맷 차이라(change/
// selection_method는 애초에 이 래핑이 없다 — 실측), 비교 전 양쪽에서
// 제거한다. Gate B의 빈 note/legend div 제거와 같은 성격의 "허용 diff"다.
//
// (table class 접미어 허용과 달리) 이 정규화는 **공개 화면에 시각 영향이
// 없다** — 공개 모달 CSS가 admission-hwp-section-title을 display:none으로
// 숨긴다. 헤딩 유무 차이가 사용자에게 보이는 건 어드민 미리보기뿐이고,
// 거기서는 오히려 헤딩이 "복원"돼 어떤 섹션인지 더 명확해진다.
// admission-table-wrap 자체는 모달이 바깥에서 한 겹 더 씌우므로 이중
// 중첩이 이미 현재 상태이고, 임포트 후에도 동일하게 유지된다(구조가
// 바뀌지 않음).
// -----------------------------------------------------------------------
function stripLeadingTableWrap(html) {
  const m =
    /^\s*<div class="admission-table-wrap">\s*([\s\S]*)<\/div>\s*$/.exec(html);
  return m ? m[1] : html;
}
function stripLeadingHeading(html) {
  return html.replace(
    /^\s*<div class="admission-hwp-section-title">[\s\S]*?<\/div>\s*/,
    "",
  );
}
// scripts/verify-admission-doc-html-drift.mjs와 admissionBulkXlsx.js(일괄
// 엑셀 업로드 파서)가 재사용한다 — 현재/신규 json을 renderDocToHtml로
// 재렌더한 결과와 html을 같은 허용 diff 기준으로 비교하기 위함(기준이
// 다르면 "드리프트"·"임포트 실패" 판정이 지점마다 어긋난다).
export function compareStoredHtmlEquivalence(rendered, stored) {
  const storedHasHeading = /^\s*<div class="admission-hwp-section-title">/.test(
    stored,
  );
  const renderedHasHeading =
    /^\s*<div class="admission-hwp-section-title">/.test(rendered);
  const storedHasTableWrap = /^\s*<div class="admission-table-wrap">/.test(
    stored,
  );

  // 저장 HTML은 heading을 갖거나(change/selection_method — 이 경우는 그대로
  // 엄격 비교) 갖지 않는다(minimum/exam/school_record/recruitment 대부분,
  // 그리고 school_record_method의 극소수 예외 2건도 table-wrap 유무와
  // 무관하게 heading이 없다). 저장 쪽에 heading이 없는데 렌더 쪽에만 있으면
  // (renderDocToHtml은 항상 붙인다) 그 차이만 제거하고 비교한다.
  let normalizedRendered = rendered;
  if (renderedHasHeading && !storedHasHeading) {
    normalizedRendered = stripLeadingHeading(rendered);
  }
  const normalizedStored = storedHasTableWrap
    ? stripLeadingTableWrap(stored)
    : stored;

  return compareDomEquivalence(normalizedRendered, normalizedStored);
}

// -----------------------------------------------------------------------
// 후보 doc 하나(임포터 또는 생성기 결과)를 검증한다: 멱등 assert →
// renderDocToHtml 재렌더 → DOM 동형 비교. 성공해야만 'imported'.
// -----------------------------------------------------------------------
function tryCandidate(
  buildDoc: () => AdmissionDoc | null,
  sectionKey,
  html,
  universityName,
  candidateName,
) {
  let doc: AdmissionDoc | null;
  try {
    doc = buildDoc();
  } catch (err) {
    return {
      classification: "needsReview",
      reason: `${candidateName}: 예외 ${err.message}`,
      kind: "exception",
    };
  }
  if (!doc) {
    return {
      classification: "needsReview",
      reason: `${candidateName}: 구조 파싱 실패`,
      kind: "parse-failure",
    };
  }

  const once = stableStringifyDoc(doc);
  const twice = stableStringifyDoc(buildDoc());
  if (once !== twice) {
    throw new Error(
      `멱등성 위반: ${universityName} / ${sectionKey} (${candidateName}) — 2회 호출 결과(generatedAt 제외)가 다릅니다.`,
    );
  }

  let rendered: string;
  try {
    rendered = renderDocToHtml(doc, sectionKey);
  } catch (err) {
    return {
      classification: "needsReview",
      reason: `${candidateName}: 재렌더 예외 ${err.message}`,
      kind: "render-exception",
    };
  }

  const comparison = compareStoredHtmlEquivalence(rendered, html);
  if (!comparison.ok) {
    return {
      classification: "needsReview",
      reason: `${candidateName}: ${comparison.reason}`,
      kind: "dom-mismatch",
      doc,
    };
  }
  return { classification: "imported", doc, candidateName };
}

// -----------------------------------------------------------------------
// 셀 하나 임포트 시도. 반환: { classification: 'imported'|'needsReview'|'skip', doc?, reason?, kind? }
// row: university_name/detail_status가 필요한 최소 정보(DB 행 전체를
// 넘겨도 되고, 이 두 필드만 있는 객체를 넘겨도 된다 — 엑셀 업로드처럼
// DB 행이 아직 없는 신규 삽입 경로에서도 그대로 쓸 수 있게 하기 위함).
// -----------------------------------------------------------------------
export function importCell(sectionKey, dbHtml, row) {
  const html = clean(dbHtml);
  const universityName = row.university_name;

  // 특수대학 11개교: 원본이 하드코딩 상수(SCIENCE_SPECIAL_DATA 등)라
  // 역파싱하지 않는다 — buildSpecialCategoryDoc으로 생성 후 동일하게
  // DOM 동형 검증만 한다(통과해야 imported).
  if (sectionKey === "selection_method" && row.detail_status === "category") {
    if (!html) return { classification: "skip" };
    return tryCandidate(
      () => buildSpecialCategoryDoc(null, row, universityName),
      sectionKey,
      html,
      universityName,
      "generate:special",
    );
  }

  if (!html) return { classification: "skip" };

  const chain = IMPORTER_CHAINS[sectionKey] || [];
  if (!chain.length) return { classification: "skip" };

  const attempts = [];
  for (const { name, run } of chain) {
    const result = tryCandidate(
      () => run(html),
      sectionKey,
      html,
      universityName,
      name,
    );
    if (result.classification === "imported") return result;
    attempts.push(result.reason);
  }
  return {
    classification: "needsReview",
    reason: attempts.join(" / "),
    kind: "all-attempts-failed",
  };
}
