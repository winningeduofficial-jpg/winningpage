// =====================================================================
// legacy 저장 HTML(*_html, curated-html) → 구조화 문서(AdmissionDoc) 임포터
//
// 배경: Phase 3 백필 dry-run 실측 결과 raw+html이 둘 다 있는 셀은 예외
// 없이 전량 legacy-html(RawHtmlBlock 무손실 보존)로 떨어졌다(parser
// 분류 0건). 이 스크립트는 그 RawHtmlBlock을 진짜 구조화 doc으로
// "승격"한다 — 저장 HTML을 파싱해 TableBlock을 복원한다.
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
// equivalence.mjs의 Gate B 비교기와 동일 로직 — 그 파일 자체는 수정하지
// 않고 이 스크립트에 복제했다). 실패하면 절대 강행하지 않는다 — doc은
// null로 두고 rawHtml(curated-html)을 그대로 유지, needsReview로 적재한다.
//
// 관례 정본: scripts/backfill-admission-doc.mjs(dry-run 기본 / 타임스탬프
// 백업 / 멱등 assert / DEV_PROJECT_REF 가드). **DB 쓰기 금지 — 이번
// 실행은 전부 dry-run이다. --apply는 구현만 하고 실행하지 않는다.**
//
// 사용법:
//   node scripts/import-legacy-admission-html.mjs                         # dry-run, 6개 카테고리 전체
//   node scripts/import-legacy-admission-html.mjs --category recruitment_quota
//   node scripts/import-legacy-admission-html.mjs --university 단국대학교(죽전)
//   node scripts/import-legacy-admission-html.mjs --limit 20
//   node scripts/import-legacy-admission-html.mjs --restore <backup.json> --apply
// =====================================================================

import { createClient } from '@supabase/supabase-js';
import { readFile, writeFile, mkdir, access } from 'node:fs/promises';
import { parseArgs } from 'node:util';
import { pathToFileURL } from 'node:url';
import process from 'node:process';

import {
  importChangeDocFromHtml,
  importSelectionDocFromHtml,
  importExamDocFromHtml,
  importMinimumDocFromHtml,
  importEmptyBoxDocFromHtml,
  importPlainListDocFromHtml,
  importRecordDocFromHtml,
  importRecruitExactDocFromHtml,
  importRecruitLegacyDocFromHtml,
  buildSpecialCategoryDoc,
  renderDocToHtml,
  HWP_SECTION_HTML_KEYS,
  clean
} from '../src/lib/admissionParsing.js';
import { HWP_SECTION_JSON_KEYS, stableStringifyDoc } from '../src/lib/admissionDoc.js';

const DEV_PROJECT_REF = 'gjowqdiopinhixfivnkx';
const DEFAULT_BACKUP_DIR = '/Users/hyunsoo/uwellnow/.admission-doc-backups';
const TABLE = 'admission_university_resources';

// 카테고리별 시도 순서(표 → emptyBox → plainList). 앞선 임포터가 null을
// 반환하거나 DOM 동형 검증에 실패하면 다음으로 넘어간다 — 전부 실패하면
// needsReview(강행 금지).
const IMPORTER_CHAINS = {
  previous_year_changes: [
    { name: 'table', run: (html) => importChangeDocFromHtml(html) },
    { name: 'plainList', run: (html) => importPlainListDocFromHtml('previous_year_changes', html) }
  ],
  selection_method: [
    { name: 'table', run: (html) => importSelectionDocFromHtml(html) },
    { name: 'plainList', run: (html) => importPlainListDocFromHtml('selection_method', html) }
  ],
  minimum_requirements: [
    { name: 'table', run: (html) => importMinimumDocFromHtml(html) },
    { name: 'emptyBox', run: (html) => importEmptyBoxDocFromHtml('minimum_requirements', html) },
    { name: 'plainList', run: (html) => importPlainListDocFromHtml('minimum_requirements', html) }
  ],
  exam_schedule: [
    { name: 'table', run: (html) => importExamDocFromHtml(html) },
    { name: 'emptyBox', run: (html) => importEmptyBoxDocFromHtml('exam_schedule', html) },
    { name: 'plainList', run: (html) => importPlainListDocFromHtml('exam_schedule', html) }
  ],
  school_record_method: [
    { name: 'record', run: (html) => importRecordDocFromHtml(html) },
    { name: 'emptyBox', run: (html) => importEmptyBoxDocFromHtml('school_record_method', html) },
    { name: 'plainList', run: (html) => importPlainListDocFromHtml('school_record_method', html) }
  ],
  recruitment_quota: [
    { name: 'recruitExact', run: (html) => importRecruitExactDocFromHtml(html) },
    { name: 'recruitLegacy', run: (html) => importRecruitLegacyDocFromHtml(html) },
    { name: 'plainList', run: (html) => importPlainListDocFromHtml('recruitment_quota', html) }
  ]
};
const SUPPORTED_CATEGORY_KEYS = Object.keys(IMPORTER_CHAINS);

// CLI 인자는 main() 안에서만 파싱한다(모듈 스코프에는 빈 객체로 시작) —
// 예전엔 파일 최상위에서 parseArgs를 즉시 호출했는데, process.argv가
// 프로세스 전역이라 이 모듈을 import만 하는 호출자(예: load-admission-
// content.mjs가 importCell을 재사용)가 여기 없는 플래그(예: --admission-year)
// 를 쓰면 import 시점에 그대로 throw했다(2026-08-06 build-admission-html-
// golden.mjs와 동일한 사고 유형 — 그쪽을 고치며 발견해 여기도 함께 고친다).
// resolveCredentials/main/runRestore는 이 변수를 클로저로 참조하고,
// main()이 실행 시작 시 실제 값을 채워 넣는다.
let args = {};

// -----------------------------------------------------------------------
// 자격증명
// -----------------------------------------------------------------------
async function resolveCredentials() {
  const envUrl = process.env.SEED_SUPABASE_URL;
  const envKey = process.env.SEED_SERVICE_ROLE_KEY;
  if (envUrl && envKey) return { url: envUrl, serviceKey: envKey };

  const keysFile = args['keys-file'] || process.env.SEED_KEYS_FILE;
  if (!keysFile) {
    throw new Error(
      'DB 자격증명을 찾을 수 없습니다. SEED_SUPABASE_URL/SEED_SERVICE_ROLE_KEY 환경변수를 ' +
        '설정하거나 --keys-file <path>를 지정하세요.'
    );
  }
  const raw = JSON.parse(await readFile(keysFile, 'utf-8'));
  const serviceEntry = raw.find((entry) => entry.name === 'service_role');
  if (!serviceEntry) throw new Error(`${keysFile}에서 service_role 키를 찾을 수 없습니다.`);
  return {
    url: `https://${DEV_PROJECT_REF}.supabase.co`,
    serviceKey: serviceEntry.api_key
  };
}

async function buildTimestampedBackupPath() {
  await mkdir(DEFAULT_BACKUP_DIR, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  return `${DEFAULT_BACKUP_DIR}/admission-doc-import-backup-${stamp}.json`;
}

async function assertBackupFileDoesNotExist(path) {
  try {
    await access(path);
  } catch {
    return;
  }
  throw new Error(
    `백업 파일이 이미 존재합니다: ${path}\n` +
      '기존 백업(롤백 수단)을 덮어쓰지 않기 위해 중단합니다. --backup-file로 다른 경로를 지정하세요.'
  );
}

// -----------------------------------------------------------------------
// DOM 동형성 비교기 — scripts/verify-admission-doc-equivalence.mjs의
// Gate B 비교기와 동일 로직(공백 정규화, class 토큰 집합, 태그·속성명
// 대소문자 무관). 그 파일을 import하지 않고 복제했다 — 이 스크립트는
// React를 로드하지 않으므로 독립적으로 가벼운 편이 낫다.
// -----------------------------------------------------------------------
const VOID_ELEMENTS = new Set([
  'area', 'base', 'br', 'col', 'embed', 'hr', 'img',
  'input', 'link', 'meta', 'param', 'source', 'track', 'wbr'
]);

function decodeEntities(str) {
  return String(str)
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&');
}

function parseAttributeString(attrString) {
  const attrs = [];
  const re = /([a-zA-Z_:][-a-zA-Z0-9_:.]*)\s*(?:=\s*("([^"]*)"|'([^']*)'|[^\s"'=<>`]+))?/g;
  let m = re.exec(attrString);
  while (m) {
    const name = m[1];
    let value = '';
    if (m[2] !== undefined) value = m[3] !== undefined ? m[3] : m[4] !== undefined ? m[4] : m[2];
    attrs.push({ name, value: decodeEntities(value) });
    m = re.exec(attrString);
  }
  return attrs;
}

function makeElementNode(tagName, attrs) {
  const node = { nodeType: 1, tagName: tagName.toUpperCase(), attributes: attrs, childNodes: [] };
  Object.defineProperty(node, 'textContent', {
    get() {
      return node.childNodes.map((c) => c.textContent || '').join('');
    }
  });
  return node;
}

function makeTextNode(text) {
  return { nodeType: 3, textContent: decodeEntities(text) };
}

function makeCommentNode() {
  return { nodeType: 8, textContent: '' };
}

function parseMiniHtml(html) {
  const root = makeElementNode('body', []);
  const stack = [root];
  let i = 0;
  const n = html.length;
  const top = () => stack[stack.length - 1];

  while (i < n) {
    if (html[i] === '<') {
      if (html.startsWith('<!--', i)) {
        const end = html.indexOf('-->', i + 4);
        top().childNodes.push(makeCommentNode());
        i = end === -1 ? n : end + 3;
        continue;
      }
      if (html.startsWith('<!', i)) {
        const end = html.indexOf('>', i);
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
      const openMatch = /^<([a-zA-Z][a-zA-Z0-9-]*)((?:[^>"']|"[^"]*"|'[^']*')*)(\/?)>/.exec(html.slice(i));
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
      top().childNodes.push(makeTextNode('<'));
      i += 1;
      continue;
    }
    const next = html.indexOf('<', i);
    const end = next === -1 ? n : next;
    const text = html.slice(i, end);
    if (text) top().childNodes.push(makeTextNode(text));
    i = end;
  }

  return { body: root };
}

function normalizeWhitespaceText(text) {
  return String(text || '').replace(/\s+/g, ' ').trim();
}

// 빈 admission-result-note/admission-recruit-legend는 renderDocToHtml만
// 낸다(SECTION_NOTES가 항상 ''). 이번 2개 카테고리 저장 HTML에는 애초에
// 나타나지 않지만(실측: 두 카테고리 다 note div 자체가 없음), 이후
// 나머지 4종을 다룰 때를 대비해 Gate B와 동일하게 허용 diff로 둔다.
function isAllowedEmptyDiffNode(node) {
  if (node.nodeType !== 1) return false;
  if (node.tagName.toLowerCase() !== 'div') return false;
  const classAttr = node.attributes.find((a) => a.name.toLowerCase() === 'class');
  const classes = (classAttr?.value || '').split(/\s+/).filter(Boolean);
  const isNoteDiv = classes.includes('admission-result-note');
  const isLegendDiv = classes.includes('admission-recruit-legend');
  if (!isNoteDiv && !isLegendDiv) return false;
  const hasElementChild = node.childNodes.some((c) => c.nodeType === 1);
  if (hasElementChild) return false;
  return normalizeWhitespaceText(node.textContent) === '';
}

function collectSignificantChildren(node) {
  const result = [];
  node.childNodes.forEach((child) => {
    if (child.nodeType === 8) return;
    if (child.nodeType === 3) {
      const text = normalizeWhitespaceText(child.textContent);
      if (text) result.push({ kind: 'text', text });
      return;
    }
    if (child.nodeType === 1) {
      if (isAllowedEmptyDiffNode(child)) return;
      result.push({ kind: 'element', node: child });
    }
  });
  return result;
}

function normalizeAttrs(node) {
  const attrs = {};
  node.attributes.forEach((a) => {
    const name = a.name.toLowerCase();
    if (name === 'class') {
      attrs.class = a.value.split(/\s+/).filter(Boolean).sort().join(' ');
    } else {
      attrs[name] = a.value;
    }
  });
  return attrs;
}

function truncateForReport(text, context = 100) {
  const s = String(text ?? '');
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
// `.admission-modal-body .admission-minimum-table`(그리고 -exam-table)에
// table-layout:fixed !important + th/td:nth-child(n){width:n%} CSS가
// 걸려 있었다 — 접미어가 없어 이 규칙이 죽어 있던 상태였다(임포트된 doc을
// 렌더하면 접미어가 붙어 규칙이 되살아날 뻔했다). **접미어 클래스는
// 복원되지만 해당 CSS 규칙을 제거했으므로 화면 변화 없음(사용자 결정,
// 2026-08-06)** — 이 죽은 CSS 규칙을 지우는 쪽으로 처리한다
// (AdmissionGuidelines.jsx, safehtml 담당). 임포터·렌더러는 그대로 두고
// 접미어를 계속 붙인다 — 안 붙이게 바꾸면 renderDocToHtml이 골든과
// 어긋나 Gate A2가 깨진다.
//
// 이 허용은 <table> class 한정이다 — 다른 태그·다른 속성에는 적용하지
// 않는다(진짜 불일치를 가리는 일반 규칙으로 확대하지 않는다).
function tableClassCompatible(classA, classB) {
  const setA = new Set(classA.split(' ').filter(Boolean));
  const setB = new Set(classB.split(' ').filter(Boolean));
  if (!setA.has('admission-data-table') || !setB.has('admission-data-table')) return false;
  const [smaller, larger] = setA.size <= setB.size ? [setA, setB] : [setB, setA];
  for (const cls of smaller) if (!larger.has(cls)) return false;
  return true;
}

function compareElementNodes(a, b, pathLabel) {
  const tagA = a.tagName.toLowerCase();
  const tagB = b.tagName.toLowerCase();
  if (tagA !== tagB) {
    return { ok: false, reason: `태그 불일치: <${tagA}> vs <${tagB}>`, path: pathLabel };
  }
  const nextPath = `${pathLabel}/${tagA}`;

  const attrsA = normalizeAttrs(a);
  const attrsB = normalizeAttrs(b);
  const attrKeys = new Set([...Object.keys(attrsA), ...Object.keys(attrsB)]);
  for (const key of attrKeys) {
    if ((attrsA[key] ?? '') !== (attrsB[key] ?? '')) {
      if (tagA === 'table' && key === 'class' && tableClassCompatible(attrsA.class ?? '', attrsB.class ?? '')) {
        continue;
      }
      return {
        ok: false,
        reason: `${nextPath} 속성 ${key} 불일치: "${truncateForReport(attrsA[key] ?? '')}" vs "${truncateForReport(attrsB[key] ?? '')}"`,
        path: nextPath
      };
    }
  }

  const childrenA = collectSignificantChildren(a);
  const childrenB = collectSignificantChildren(b);
  if (childrenA.length !== childrenB.length) {
    return {
      ok: false,
      reason: `${nextPath} 자식 수 불일치: ${childrenA.length} vs ${childrenB.length}`,
      path: nextPath
    };
  }
  for (let i = 0; i < childrenA.length; i += 1) {
    const ca = childrenA[i];
    const cb = childrenB[i];
    if (ca.kind !== cb.kind) {
      return { ok: false, reason: `${nextPath} idx=${i} 자식 종류 불일치`, path: nextPath };
    }
    if (ca.kind === 'text') {
      if (ca.text !== cb.text) {
        return {
          ok: false,
          reason: `${nextPath} idx=${i} 텍스트 불일치: "${truncateForReport(ca.text)}" vs "${truncateForReport(cb.text)}"`,
          path: nextPath
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
    return { ok: false, reason: `최상위 자식 수 불일치: ${childrenA.length} vs ${childrenB.length}`, path: '/' };
  }
  for (let i = 0; i < childrenA.length; i += 1) {
    const ca = childrenA[i];
    const cb = childrenB[i];
    if (ca.kind !== cb.kind) return { ok: false, reason: `최상위 idx=${i} 자식 종류 불일치`, path: '/' };
    if (ca.kind === 'text') {
      if (ca.text !== cb.text) {
        return {
          ok: false,
          reason: `최상위 idx=${i} 텍스트 불일치: "${truncateForReport(ca.text)}" vs "${truncateForReport(cb.text)}"`,
          path: '/'
        };
      }
      continue;
    }
    const result = compareElementNodes(ca.node, cb.node, '');
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
// 숨긴다(AdmissionGuidelines.jsx:1848). 헤딩 유무 차이가 사용자에게
// 보이는 건 어드민 미리보기뿐이고, 거기서는 오히려 헤딩이 "복원"돼
// 어떤 섹션인지 더 명확해진다(현행 어드민이 이 타이틀을 보이게
// 스타일링한다 — Admin.jsx:3865 부근). admission-table-wrap 자체는
// 모달이 바깥에서 한 겹 더 씌우므로 이중 중첩이 이미 현재 상태이고,
// 임포트 후에도 동일하게 유지된다(구조가 바뀌지 않음).
// -----------------------------------------------------------------------
function stripLeadingTableWrap(html) {
  const m = /^\s*<div class="admission-table-wrap">\s*([\s\S]*)<\/div>\s*$/.exec(html);
  return m ? m[1] : html;
}
function stripLeadingHeading(html) {
  return html.replace(/^\s*<div class="admission-hwp-section-title">[\s\S]*?<\/div>\s*/, '');
}
// export: scripts/verify-admission-doc-html-drift.mjs가 재사용한다(현재 저장된
// json을 renderDocToHtml로 재렌더한 결과와 현재 저장된 html을 같은 허용 diff
// 기준으로 비교하기 위함 — 임포트 시점의 검증 기준과 동일해야 "드리프트"의
// 의미가 일관된다).
export function compareStoredHtmlEquivalence(rendered, stored) {
  const storedHasHeading = /^\s*<div class="admission-hwp-section-title">/.test(stored);
  const renderedHasHeading = /^\s*<div class="admission-hwp-section-title">/.test(rendered);
  const storedHasTableWrap = /^\s*<div class="admission-table-wrap">/.test(stored);

  // 저장 HTML은 heading을 갖거나(change/selection_method — 이 경우는 그대로
  // 엄격 비교) 갖지 않는다(minimum/exam/school_record/recruitment 대부분,
  // 그리고 school_record_method의 극소수 예외 2건도 table-wrap 유무와
  // 무관하게 heading이 없다). 저장 쪽에 heading이 없는데 렌더 쪽에만 있으면
  // (renderDocToHtml은 항상 붙인다) 그 차이만 제거하고 비교한다.
  let normalizedRendered = rendered;
  if (renderedHasHeading && !storedHasHeading) {
    normalizedRendered = stripLeadingHeading(rendered);
  }
  const normalizedStored = storedHasTableWrap ? stripLeadingTableWrap(stored) : stored;

  return compareDomEquivalence(normalizedRendered, normalizedStored);
}

// -----------------------------------------------------------------------
// 후보 doc 하나(임포터 또는 생성기 결과)를 검증한다: 멱등 assert →
// renderDocToHtml 재렌더 → DOM 동형 비교. 성공해야만 'imported'.
// -----------------------------------------------------------------------
function tryCandidate(buildDoc, sectionKey, html, universityName, candidateName) {
  let doc;
  try {
    doc = buildDoc();
  } catch (err) {
    return { classification: 'needsReview', reason: `${candidateName}: 예외 ${err.message}`, kind: 'exception' };
  }
  if (!doc) {
    return { classification: 'needsReview', reason: `${candidateName}: 구조 파싱 실패`, kind: 'parse-failure' };
  }

  const once = stableStringifyDoc(doc);
  const twice = stableStringifyDoc(buildDoc());
  if (once !== twice) {
    throw new Error(
      `멱등성 위반: ${universityName} / ${sectionKey} (${candidateName}) — 2회 호출 결과(generatedAt 제외)가 다릅니다.`
    );
  }

  let rendered;
  try {
    rendered = renderDocToHtml(doc, sectionKey);
  } catch (err) {
    return { classification: 'needsReview', reason: `${candidateName}: 재렌더 예외 ${err.message}`, kind: 'render-exception' };
  }

  const comparison = compareStoredHtmlEquivalence(rendered, html);
  if (!comparison.ok) {
    return { classification: 'needsReview', reason: `${candidateName}: ${comparison.reason}`, kind: 'dom-mismatch', doc };
  }
  return { classification: 'imported', doc, candidateName };
}

// -----------------------------------------------------------------------
// 셀 하나 임포트 시도. 반환: { classification: 'imported'|'needsReview'|'skip', doc?, reason?, kind? }
// row: DB 행 전체(detail_status 판정에 필요).
// -----------------------------------------------------------------------
export function importCell(sectionKey, dbHtml, row) {
  const html = clean(dbHtml);
  const universityName = row.university_name;

  // 특수대학 11개교: 원본이 하드코딩 상수(SCIENCE_SPECIAL_DATA 등)라
  // 역파싱하지 않는다 — buildSpecialCategoryDoc으로 생성 후 동일하게
  // DOM 동형 검증만 한다(통과해야 imported).
  if (sectionKey === 'selection_method' && row.detail_status === 'category') {
    if (!html) return { classification: 'skip' };
    return tryCandidate(
      () => buildSpecialCategoryDoc(null, row, universityName),
      sectionKey,
      html,
      universityName,
      'generate:special'
    );
  }

  if (!html) return { classification: 'skip' };

  const chain = IMPORTER_CHAINS[sectionKey] || [];
  if (!chain.length) return { classification: 'skip' };

  const attempts = [];
  for (const { name, run } of chain) {
    const result = tryCandidate(() => run(html), sectionKey, html, universityName, name);
    if (result.classification === 'imported') return result;
    attempts.push(result.reason);
  }
  return { classification: 'needsReview', reason: attempts.join(' / '), kind: 'all-attempts-failed' };
}

// -----------------------------------------------------------------------
// 메인
// -----------------------------------------------------------------------
async function main() {
  args = parseArgs({
    options: {
      apply: { type: 'boolean', default: false },
      'keys-file': { type: 'string' },
      category: { type: 'string' },
      university: { type: 'string' },
      limit: { type: 'string' },
      'backup-file': { type: 'string' },
      restore: { type: 'string' }
    }
  }).values;

  const targetCategories = args.category ? [args.category] : SUPPORTED_CATEGORY_KEYS;
  targetCategories.forEach((key) => {
    if (!SUPPORTED_CATEGORY_KEYS.includes(key)) {
      throw new Error(`알 수 없는 --category: ${key} (지원: ${SUPPORTED_CATEGORY_KEYS.join(', ')})`);
    }
  });
  const limit = args.limit ? Number(args.limit) : null;

  const { url, serviceKey } = await resolveCredentials();
  if (!url.includes(DEV_PROJECT_REF)) {
    throw new Error('dev 프로젝트(gjowqdiopinhixfivnkx)가 아닌 URL입니다. 중단합니다.');
  }
  const supabase = createClient(url, serviceKey);

  if (args.restore) {
    await runRestore(supabase, args.restore);
    return;
  }

  console.log(`=== 1) 자격 확인 (${args.apply ? 'apply' : 'dry-run'} 모드) ===`);
  console.log(`대상 카테고리: ${targetCategories.join(', ')}${args.university ? ` / 대학: ${args.university}` : ''}${limit ? ` / limit: ${limit}` : ''}`);

  console.log('\n=== 2) 조회 + 백업 ===');
  const backupFile = args['backup-file'] || (await buildTimestampedBackupPath());
  await assertBackupFileDoesNotExist(backupFile);

  const htmlColumns = targetCategories.map((key) => HWP_SECTION_HTML_KEYS[key]);
  const jsonColumns = targetCategories.map((key) => HWP_SECTION_JSON_KEYS[key]);
  const selectColumns = ['id', 'university_name', 'detail_status', 'updated_at', ...htmlColumns].join(', ');

  let query = supabase.from(TABLE).select(selectColumns).order('id');
  if (args.university) query = query.eq('university_name', args.university);
  const { data: allRows, error: fetchError } = await query;
  if (fetchError) throw new Error(`행 조회 실패: ${fetchError.message}`);

  const rows = limit ? allRows.slice(0, limit) : allRows;
  await writeFile(backupFile, JSON.stringify(allRows, null, 2), 'utf-8');
  console.log(`백업 완료: ${allRows.length}행 → ${backupFile}`);
  console.log(`처리 대상: ${rows.length}행`);

  console.log('\n=== 3) 계산/분류(임포트 시도 + DOM 동형성 검증) ===');
  const stats = Object.fromEntries(
    targetCategories.map((key) => [key, { imported: 0, needsReview: 0, skip: 0, byCandidate: {} }])
  );
  const needsReviewSamples = Object.fromEntries(targetCategories.map((key) => [key, []]));
  const rowPatches = [];

  rows.forEach((row) => {
    const patch = {};
    let hasChange = false;

    targetCategories.forEach((key) => {
      const dbHtml = row[HWP_SECTION_HTML_KEYS[key]];
      const result = importCell(key, dbHtml, row);
      stats[key][result.classification] += 1;
      if (result.classification === 'needsReview' && needsReviewSamples[key].length < 10) {
        needsReviewSamples[key].push({ university: row.university_name, kind: result.kind, reason: result.reason });
      }
      if (result.classification === 'imported') {
        patch[HWP_SECTION_JSON_KEYS[key]] = result.doc;
        hasChange = true;
        const s = stats[key];
        s.byCandidate[result.candidateName] = (s.byCandidate[result.candidateName] || 0) + 1;
      }
    });

    if (hasChange) rowPatches.push({ id: row.id, universityName: row.university_name, updatedAt: row.updated_at, patch });
  });

  console.log('\n=== 4) 집계 — 카테고리별 DOM 동형 성공률 ===');
  targetCategories.forEach((key) => {
    const s = stats[key];
    const denom = s.imported + s.needsReview;
    const rate = denom ? ((s.imported / denom) * 100).toFixed(2) : '100.00';
    console.log(`  - ${key}: imported ${s.imported} / needsReview ${s.needsReview} / skip(원본 없음) ${s.skip}  → 성공률 ${rate}%`);
  });

  // table 클래스 접미어 부분집합 허용(admissionParsing.js의 tableClassCompatible
  // 근거 주석 참고)이 실제로 적용된 규모 — minimum_requirements/exam_schedule의
  // 저장 HTML은 <table class="admission-data-table">뿐이라(접미어 없음)
  // .admission-modal-body .admission-minimum-table 등의 nth-child 폭 CSS가
  // 지금 적용되지 않고 있다. 임포트된 doc을 렌더하면 접미어가 붙어 그 CSS가
  // 새로 적용된다 — "표면 포맷 차이"가 아니라 실제 표 레이아웃 변화다.
  const TABLE_CLASS_SUFFIX_IMPACT_CATEGORIES = ['minimum_requirements', 'exam_schedule'];
  const suffixImpact = TABLE_CLASS_SUFFIX_IMPACT_CATEGORIES.filter((key) => targetCategories.includes(key)).map(
    (key) => ({ key, count: stats[key].byCandidate.table || 0 })
  );
  if (suffixImpact.length) {
    console.log('\n=== 4-1) table class 접미어 복원 참고(화면 변화 없음, 사용자 결정 2026-08-06) ===');
    suffixImpact.forEach(({ key, count }) => {
      console.log(
        `  - ${key}: ${count}건 — admission-data-table만 있던 <table>에 admission-${key === 'minimum_requirements' ? 'minimum' : 'exam'}-table이 붙는다. 이 접미어에 걸려 있던 nth-child 폭 CSS는 제거됐으므로(safehtml 처리) 화면 변화는 없다.`
      );
    });
  }

  console.log('\n=== 5) needsReview 샘플(카테고리별 최대 10건, 유형 포함) ===');
  targetCategories.forEach((key) => {
    const samples = needsReviewSamples[key];
    if (!samples.length) return;
    console.log(`  [${key}]`);
    samples.forEach((s) => console.log(`    - ${s.university} (${s.kind}): ${s.reason}`));
  });

  if (!args.apply) {
    console.log('\ndry-run 모드입니다. 실제 DB에는 아무것도 쓰지 않았습니다.');
    console.log(`(--apply로 재실행하면 imported 판정 ${rowPatches.length}행에 한해 *_json 컬럼을 갱신합니다. 이번 세션에서는 실행하지 않습니다.)`);
    return;
  }

  console.log('\n=== 6) 적용 ===');
  let updated = 0;
  const failedUpdates = [];
  const skippedByConcurrentEdit = [];

  for (const { id, universityName, updatedAt, patch } of rowPatches) {
    const { data: freshRow, error: freshError } = await supabase.from(TABLE).select('updated_at').eq('id', id).single();
    if (freshError) {
      failedUpdates.push({ id, universityName, message: `재조회 실패: ${freshError.message}` });
      continue;
    }
    if (freshRow.updated_at !== updatedAt) {
      skippedByConcurrentEdit.push({ id, universityName });
      continue;
    }
    let lastError = null;
    let succeeded = false;
    for (let attempt = 1; attempt <= 3 && !succeeded; attempt += 1) {
      const { error: updateError } = await supabase.from(TABLE).update(patch).eq('id', id);
      if (!updateError) {
        succeeded = true;
        updated += 1;
      } else {
        lastError = updateError;
      }
    }
    if (!succeeded) failedUpdates.push({ id, universityName, message: lastError?.message });
  }
  console.log(`적용 완료: ${updated}행, 실패 ${failedUpdates.length}건, 동시편집 스킵 ${skippedByConcurrentEdit.length}건.`);

  console.log('\n=== 7) 재감사 ===');
  const { data: verifyRows, error: verifyError } = await supabase
    .from(TABLE)
    .select(['id', 'university_name', 'detail_status', ...htmlColumns, ...jsonColumns].join(', '))
    .order('id');
  if (verifyError) throw new Error(`재감사 조회 실패: ${verifyError.message}`);

  let residual = 0;
  verifyRows.forEach((row) => {
    if (args.university && row.university_name !== args.university) return;
    targetCategories.forEach((key) => {
      const dbHtml = row[HWP_SECTION_HTML_KEYS[key]];
      const expected = importCell(key, dbHtml, row);
      if (expected.classification !== 'imported') return;
      const actualDoc = row[HWP_SECTION_JSON_KEYS[key]];
      if (!actualDoc || stableStringifyDoc(actualDoc) !== stableStringifyDoc(expected.doc)) residual += 1;
    });
  });
  console.log(`재감사 결과: 기대값과 다른 잔여 건수 = ${residual}`);
  if (residual !== 0 || failedUpdates.length) {
    console.error('경고: 잔여 건수 또는 실패 건수가 0이 아닙니다.');
    process.exitCode = 1;
  }
}

// -----------------------------------------------------------------------
// --restore: 백업 파일(조회 시점 전체 스냅샷)에 기록된 *_json 값으로
// 되돌린다. 백업은 항상 조회 즉시(적용 이전) 찍히므로, 이 파일로 복원하면
// 이번 --apply가 쓰기 전 상태로 정확히 돌아간다.
// -----------------------------------------------------------------------
async function runRestore(supabase, backupPath) {
  console.log(`=== 백업 복원: ${backupPath} ===`);
  const backupRows = JSON.parse(await readFile(backupPath, 'utf-8'));
  console.log(`백업 행 수: ${backupRows.length}`);

  if (!args.apply) {
    console.log('dry-run 모드입니다. --apply를 추가하면 실제로 복원합니다.');
    console.log(`복원 대상 컬럼: ${Object.values(HWP_SECTION_JSON_KEYS).join(', ')}`);
    return;
  }

  let restored = 0;
  const failed = [];
  for (const row of backupRows) {
    const patch = {};
    Object.values(HWP_SECTION_JSON_KEYS).forEach((jsonCol) => {
      patch[jsonCol] = row[jsonCol] ?? null;
    });
    const { error } = await supabase.from(TABLE).update(patch).eq('id', row.id);
    if (error) failed.push({ id: row.id, universityName: row.university_name, message: error.message });
    else restored += 1;
  }
  console.log(`복원 완료: ${restored}행, 실패 ${failed.length}건.`);
  if (failed.length) {
    failed.forEach((f) => console.error(`  - ${f.universityName} (id=${f.id}): ${f.message}`));
    process.exitCode = 1;
  }
}

const isMainModule = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMainModule) {
  main().catch((err) => {
    console.error(err);
    process.exitCode = 1;
  });
}
