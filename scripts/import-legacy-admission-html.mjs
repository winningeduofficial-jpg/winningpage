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
// 이번 착수 범위: previous_year_changes(change, 3컬럼) / selection_method
// (selection, 5컬럼) **2개만**. 나머지 4종(minimum/exam/school_record/
// recruitment)은 이 둘의 성공률을 보고 재판단한다(recruitment은 특히
// recruitExact 2단 헤더 복원이 미검증 상태라 더 위험하다).
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
//   node scripts/import-legacy-admission-html.mjs                         # dry-run, 2개 카테고리 전체
//   node scripts/import-legacy-admission-html.mjs --category selection_method
//   node scripts/import-legacy-admission-html.mjs --university 단국대학교(죽전)
//   node scripts/import-legacy-admission-html.mjs --limit 20
// =====================================================================

import { createClient } from '@supabase/supabase-js';
import { readFile, writeFile, mkdir, access } from 'node:fs/promises';
import { parseArgs } from 'node:util';
import process from 'node:process';

import {
  importChangeDocFromHtml,
  importSelectionDocFromHtml,
  renderDocToHtml,
  HWP_SECTION_HTML_KEYS,
  clean
} from '../src/lib/admissionParsing.js';
import { HWP_SECTION_JSON_KEYS, stableStringifyDoc } from '../src/lib/admissionDoc.js';

const DEV_PROJECT_REF = 'gjowqdiopinhixfivnkx';
const DEFAULT_BACKUP_DIR = '/Users/hyunsoo/uwellnow/.admission-doc-backups';
const TABLE = 'admission_university_resources';

// 이번 착수 범위 2종만. 나머지는 IMPORTERS에 없어 --category로 지정하면
// 명확한 에러로 거부한다(조용히 스킵하지 않는다).
const IMPORTERS = {
  previous_year_changes: importChangeDocFromHtml,
  selection_method: importSelectionDocFromHtml
};
const SUPPORTED_CATEGORY_KEYS = Object.keys(IMPORTERS);

const { values: args } = parseArgs({
  options: {
    apply: { type: 'boolean', default: false },
    'keys-file': { type: 'string' },
    category: { type: 'string' },
    university: { type: 'string' },
    limit: { type: 'string' },
    'backup-file': { type: 'string' }
  }
});

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
// 셀 하나 임포트 시도. 반환: { classification: 'imported'|'needsReview'|'skip', doc?, reason? }
// -----------------------------------------------------------------------
export function importCell(sectionKey, dbHtml, universityName) {
  const html = clean(dbHtml);
  if (!html) return { classification: 'skip' };

  const importer = IMPORTERS[sectionKey];
  if (!importer) return { classification: 'skip' };

  let doc;
  try {
    doc = importer(html);
  } catch (err) {
    return { classification: 'needsReview', reason: `파싱 예외: ${err.message}`, kind: 'parse-exception' };
  }
  if (!doc) {
    return {
      classification: 'needsReview',
      reason: '표 구조 파싱 실패(컬럼 수 불일치 또는 바디 병합 감지)',
      kind: 'parse-failure'
    };
  }

  // 멱등 assert: 같은 입력으로 2회 생성해 stableStringifyDoc(generatedAt
  // 제외)이 같아야 한다.
  const once = stableStringifyDoc(doc);
  const twice = stableStringifyDoc(importer(html));
  if (once !== twice) {
    throw new Error(`멱등성 위반: ${universityName} / ${sectionKey} — importer를 2회 호출한 결과가 다릅니다.`);
  }

  let rendered;
  try {
    rendered = renderDocToHtml(doc, sectionKey);
  } catch (err) {
    return { classification: 'needsReview', reason: `재렌더 예외: ${err.message}`, kind: 'render-exception' };
  }

  const comparison = compareDomEquivalence(rendered, html);
  if (!comparison.ok) {
    return { classification: 'needsReview', reason: comparison.reason, kind: 'dom-mismatch', doc };
  }
  return { classification: 'imported', doc };
}

// -----------------------------------------------------------------------
// 메인
// -----------------------------------------------------------------------
async function main() {
  const targetCategories = args.category ? [args.category] : SUPPORTED_CATEGORY_KEYS;
  targetCategories.forEach((key) => {
    if (!SUPPORTED_CATEGORY_KEYS.includes(key)) {
      throw new Error(
        `이번 착수 범위 밖 카테고리입니다: ${key} (지원: ${SUPPORTED_CATEGORY_KEYS.join(', ')}). ` +
          '나머지 4종(minimum/exam/school_record/recruitment)은 이 2종 결과를 보고 재판단합니다.'
      );
    }
  });
  const limit = args.limit ? Number(args.limit) : null;

  const { url, serviceKey } = await resolveCredentials();
  if (!url.includes(DEV_PROJECT_REF)) {
    throw new Error('dev 프로젝트(gjowqdiopinhixfivnkx)가 아닌 URL입니다. 중단합니다.');
  }
  const supabase = createClient(url, serviceKey);

  console.log(`=== 1) 자격 확인 (${args.apply ? 'apply' : 'dry-run'} 모드) ===`);
  console.log(`대상 카테고리: ${targetCategories.join(', ')}${args.university ? ` / 대학: ${args.university}` : ''}${limit ? ` / limit: ${limit}` : ''}`);

  console.log('\n=== 2) 조회 + 백업 ===');
  const backupFile = args['backup-file'] || (await buildTimestampedBackupPath());
  await assertBackupFileDoesNotExist(backupFile);

  const htmlColumns = targetCategories.map((key) => HWP_SECTION_HTML_KEYS[key]);
  const jsonColumns = targetCategories.map((key) => HWP_SECTION_JSON_KEYS[key]);
  const selectColumns = ['id', 'university_name', 'updated_at', ...htmlColumns].join(', ');

  let query = supabase.from(TABLE).select(selectColumns).order('id');
  if (args.university) query = query.eq('university_name', args.university);
  const { data: allRows, error: fetchError } = await query;
  if (fetchError) throw new Error(`행 조회 실패: ${fetchError.message}`);

  const rows = limit ? allRows.slice(0, limit) : allRows;
  await writeFile(backupFile, JSON.stringify(allRows, null, 2), 'utf-8');
  console.log(`백업 완료: ${allRows.length}행 → ${backupFile}`);
  console.log(`처리 대상: ${rows.length}행`);

  console.log('\n=== 3) 계산/분류(임포트 시도 + DOM 동형성 검증) ===');
  const stats = Object.fromEntries(targetCategories.map((key) => [key, { imported: 0, needsReview: 0, skip: 0 }]));
  const needsReviewSamples = Object.fromEntries(targetCategories.map((key) => [key, []]));
  const rowPatches = [];

  rows.forEach((row) => {
    const patch = {};
    let hasChange = false;

    targetCategories.forEach((key) => {
      const dbHtml = row[HWP_SECTION_HTML_KEYS[key]];
      const result = importCell(key, dbHtml, row.university_name);
      stats[key][result.classification] += 1;
      if (result.classification === 'needsReview' && needsReviewSamples[key].length < 10) {
        needsReviewSamples[key].push({ university: row.university_name, kind: result.kind, reason: result.reason });
      }
      if (result.classification === 'imported') {
        patch[HWP_SECTION_JSON_KEYS[key]] = result.doc;
        hasChange = true;
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
    .select(['id', 'university_name', ...htmlColumns, ...jsonColumns].join(', '))
    .order('id');
  if (verifyError) throw new Error(`재감사 조회 실패: ${verifyError.message}`);

  let residual = 0;
  verifyRows.forEach((row) => {
    if (args.university && row.university_name !== args.university) return;
    targetCategories.forEach((key) => {
      const dbHtml = row[HWP_SECTION_HTML_KEYS[key]];
      const expected = importCell(key, dbHtml, row.university_name);
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

const isMainModule = process.argv[1] && process.argv[1].endsWith('import-legacy-admission-html.mjs');
if (isMainModule) {
  main().catch((err) => {
    console.error(err);
    process.exitCode = 1;
  });
}
