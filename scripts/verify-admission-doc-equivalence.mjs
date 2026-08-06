// =====================================================================
// 대입모집요강 구조화 전환 — 골든 대조 검증 스크립트 (Gate A)
//
// scripts/verify-admission-html-snapshot.mjs 후계자. 폐기 사유(실행 확인):
//   - 이미 RED — 1253셀 중 853셀 일치(68.08%), 400 mismatch, exit 1.
//   - 기준점이 REFACTOR_COMMIT='8fc8fc3' + git show + `export default
//     function` 위치 정규식(:31-33, 71-115)이라 rebase/squash에 취약하다.
//   - 신규 export를 `missing`으로 warn만 하고 조용히 제외(:98-106) —
//     실행 시 실제로 replaceKnownPuaChars, splitHwpTextIntoSections,
//     buildHwpCategoryHtml 3개가 제외되고 있었다.
//
// 이 스크립트는 git 히스토리에 의존하지 않는다. 커밋된
// tests/fixtures/admission-html-golden.json(셀별 sha256 해시 골든)만
// 읽는다. 전문 diff는 선택적으로 .golden-cache/admission-html-golden.full.json
// (로컬 전용, gitignore)을 참조하지만, 없어도 게이트 판정(해시 비교)
// 자체는 동일하게 동작한다 — 캐시는 디버깅 편의 경로일 뿐이다.
//
// Gate A (해시, 허용 diff 0): 현재 코드(buildRawSectionHtml/
// buildHwpCategoryHtml/buildRecruitmentResultHtml)가 만드는 HTML의
// sha256이 골든과 바이트 단위로 일치하는지.
//
// Gate A2 (해시, 허용 diff 0): doc 파이프라인 도입 후 추가. renderDocToHtml
// (buildRawSectionDoc(raw, key, row, name))와 renderDocToHtml
// (buildHwpCategoryDoc(key, raw, row, name))이 골든의 rawSectionHtml/
// hwpCategoryHtml 셀과 바이트 단위로 일치하는지. recruitmentResultHtml
// (buildRecruitmentResultHtml의 wrap 없는 원시 출력)은 renderDocToHtml의
// 계약 밖이라(항상 heading wrap을 포함) Gate A2 비교 대상이 아니다 —
// 그 경로는 Gate A가 이미 커버한다.
//
// Gate B (구조, 허용 diff 2 — TODO Phase 3): renderToStaticMarkup(doc)
// vs renderDocToHtml(doc) 정규화 DOM 비교. React 렌더 컴포넌트
// (src/components/admission/)가 별도 병렬 작업으로 아직 진행 중이라
// 이번 커밋에서는 자리만 잡는다.
//   TODO(Phase 3): React 렌더 컴포넌트 도입 후, 허용 diff 2종(빈
//   admission-result-note / admission-recruit-legend 제거)만 열어두고
//   그 외 전부 실패시키는 runGateB() 추가.
//
// 전문 캐시가 없을 때(mismatch 디버깅용, 게이트 판정에는 불필요) 재구성:
//   git worktree add ../wp-golden-base <골든이 그린이던 커밋 SHA>
//   cd ../wp-golden-base && node scripts/build-admission-html-golden.mjs
// (또는 현재 워크트리에서 파서를 그 커밋으로 임시 되돌려 스크립트를
// 실행한 뒤 결과만 챙기고 원복해도 된다.)
//
// 사용법:
//   node scripts/verify-admission-doc-equivalence.mjs
//
// 종료 코드: mismatch가 하나라도 있으면 1, 전부 일치하면 0.
// =====================================================================

import { readFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath, pathToFileURL } from 'node:url';

import golden from '../tests/fixtures/admission-html-golden.json' with { type: 'json' };
import { buildGolden, buildHashGolden, buildCellKey, hashString } from './build-admission-html-golden.mjs';
import admissionHwpSections from '../src/data/admissionHwpSections.json' with { type: 'json' };
import {
  buildRawSectionDoc,
  buildHwpCategoryDoc,
  renderDocToHtml,
  HWP_SECTION_HTML_KEYS,
  clean
} from '../src/lib/admissionParsing.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..');
const FULL_CACHE_PATH = path.join(REPO_ROOT, '.golden-cache/admission-html-golden.full.json');
const MAX_DIFF_SAMPLES = 5;
const DIFF_CONTEXT = 200;

// 공허한 통과 차단: 이번 실행에서 실측된 골든 총 셀 수(2757, commit
// 16fa3c0 기준 tests/fixtures/admission-html-golden.json의 meta.cellCount)의
// 90%로 하드코딩한다. 2757 * 0.9 = 2481.3 → 2481. 골든 코퍼스나 경로 구성이
// 바뀌어 total이 이 아래로 떨어지면(예: import 실패로 대부분의 셀이
// 조용히 스킵되는 회귀) 그 자체를 실패로 간주한다.
const MIN_COMPARED_CELLS = 2481;

async function loadFullCacheIfPresent() {
  try {
    const raw = await readFile(FULL_CACHE_PATH, 'utf-8');
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

// 삽입/삭제(길이 변화)가 섞이면 "뒤쪽 공통 접미사"를 찾으려는 순진한
// 접근이 오프셋 한 칸 밀림으로 끝까지 전부 다르다고 보고하므로, 앞쪽
// 공통 접두사가 갈리는 지점 기준 고정 폭 윈도우만 보여준다(정확한 diff가
// 아니라 "어디가 왜 깨졌는지 눈으로 확인"하는 용도로 충분하다).
function diffSnippet(before, after, context = DIFF_CONTEXT) {
  const a = String(before || '');
  const b = String(after || '');
  let start = 0;
  const minLen = Math.min(a.length, b.length);
  while (start < minLen && a[start] === b[start]) start += 1;

  const windowStart = Math.max(start - context, 0);
  return {
    before: a.slice(windowStart, start + context),
    after: b.slice(windowStart, start + context)
  };
}

export async function runDocEquivalenceVerification({ verbose = true } = {}) {
  const currentFullGolden = buildGolden();
  const currentHashGolden = buildHashGolden(currentFullGolden);

  const goldenKeys = Object.keys(golden.cells);
  const total = goldenKeys.length;
  const mismatches = [];

  goldenKeys.forEach((key) => {
    const expected = golden.cells[key];
    const actual = currentHashGolden.cells[key];

    if (!actual) {
      mismatches.push({
        key,
        reason: '현재 코드가 이 셀을 더 이상 생성하지 않음(빈 문자열로 바뀌었거나 경로가 사라짐)',
        expectedBytes: expected.bytes,
        actualBytes: null
      });
      return;
    }

    if (actual.sha256 !== expected.sha256) {
      mismatches.push({
        key,
        reason: '해시 불일치',
        expectedBytes: expected.bytes,
        actualBytes: actual.bytes
      });
    }
  });

  const newKeys = Object.keys(currentHashGolden.cells).filter((key) => !(key in golden.cells));

  const matched = total - mismatches.length;
  const matchRate = total ? (matched / total) * 100 : 100;

  if (total < MIN_COMPARED_CELLS) {
    throw new Error(
      `공허한 통과 방지: 비교 대상 셀 수(${total})가 하한(${MIN_COMPARED_CELLS})보다 적습니다. ` +
        'tests/fixtures/admission-html-golden.json 로딩이 실패했거나 골든 코퍼스가 축소된 것은 아닌지 확인하세요.'
    );
  }

  if (verbose) {
    console.log(
      `[doc-equivalence] Gate A: 골든 셀 ${total}개 중 ${matched}개 해시 일치 (${matchRate.toFixed(2)}%)`
    );
    if (newKeys.length) {
      console.log(
        `[doc-equivalence] 참고: 골든에 없는 신규 셀 ${newKeys.length}개(코드가 새 출력을 만들기 시작함 — 골든 갱신 필요할 수 있음)`
      );
    }

    if (mismatches.length) {
      console.error(`[doc-equivalence] 불일치 ${mismatches.length}건:`);
      const fullCache = await loadFullCacheIfPresent();
      let shown = 0;

      for (const m of mismatches) {
        if (shown >= MAX_DIFF_SAMPLES) break;
        const [universityName, category, pathName] = m.key.split('|');
        console.error(`  - ${m.key}: ${m.reason} (기존 ${m.expectedBytes}자 → 현재 ${m.actualBytes ?? 0}자)`);

        if (fullCache) {
          const before = fullCache?.[universityName]?.[category]?.[pathName] || '';
          const after = currentFullGolden?.[universityName]?.[category]?.[pathName] || '';
          const { before: beforeSnippet, after: afterSnippet } = diffSnippet(before, after);
          console.error(`      전: ...${beforeSnippet}...`);
          console.error(`      후: ...${afterSnippet}...`);
        } else {
          console.error(
            '      (전문 캐시 없음 — .golden-cache/admission-html-golden.full.json이 없어 길이 차이만 표시합니다. ' +
              '실제 diff가 필요하면 스크립트 상단 주석의 재구성 방법을 참고하세요.)'
          );
        }
        shown += 1;
      }
      if (mismatches.length > MAX_DIFF_SAMPLES) {
        console.error(`  ... 외 ${mismatches.length - MAX_DIFF_SAMPLES}건 생략`);
      }
    } else {
      console.log('[doc-equivalence] 전 항목 100% 일치.');
    }
  }

  return { total, matched, matchRate, mismatches };
}

const CATEGORY_KEYS = Object.keys(HWP_SECTION_HTML_KEYS);
const GATE_A2_PATHS = ['rawSectionHtml', 'hwpCategoryHtml'];

function docBuilderForPath(pathName) {
  if (pathName === 'rawSectionHtml') return buildRawSectionDoc;
  if (pathName === 'hwpCategoryHtml') {
    // buildHwpCategoryDoc(sectionKey, rawText, ...) — 인자 순서가 나머지와
    // 다르다(buildRawSectionDoc은 (value, sectionKey, ...)).
    return (value, sectionKey, row, universityName) =>
      buildHwpCategoryDoc(sectionKey, value, row, universityName);
  }
  throw new Error(`알 수 없는 Gate A2 경로: ${pathName}`);
}

export async function runGateA2Verification({ verbose = true } = {}) {
  const universityNames = Object.keys(admissionHwpSections);
  const mismatches = [];
  let total = 0;
  let matched = 0;

  universityNames.forEach((universityName) => {
    const row = admissionHwpSections[universityName];
    CATEGORY_KEYS.forEach((key) => {
      const raw = clean(row[key]);
      if (!raw) return;

      GATE_A2_PATHS.forEach((pathName) => {
        const cellKey = buildCellKey(universityName, key, pathName);
        const expected = golden.cells[cellKey];
        if (!expected) return; // 골든에 없는 셀(빈 출력 등)은 비교 대상 아님 — Gate A가 이미 다룬다.
        total += 1;

        let rendered = null;
        let error = null;
        try {
          const doc = docBuilderForPath(pathName)(raw, key, row, universityName);
          rendered = renderDocToHtml(doc, key);
        } catch (err) {
          error = err;
        }

        if (error) {
          mismatches.push({
            key: cellKey,
            reason: `렌더링 오류: ${error.message}`,
            expectedBytes: expected.bytes,
            actualBytes: null
          });
          return;
        }

        const actualHash = hashString(rendered);
        if (actualHash === expected.sha256) {
          matched += 1;
        } else {
          mismatches.push({
            key: cellKey,
            reason: '해시 불일치',
            expectedBytes: expected.bytes,
            actualBytes: Buffer.byteLength(rendered, 'utf-8'),
            rendered
          });
        }
      });
    });
  });

  const matchRate = total ? (matched / total) * 100 : 100;

  if (verbose) {
    console.log(
      `[doc-equivalence] Gate A2: 골든 셀 ${total}개 중 ${matched}개 해시 일치 (${matchRate.toFixed(2)}%)`
    );
    if (mismatches.length) {
      console.error(`[doc-equivalence] Gate A2 불일치 ${mismatches.length}건:`);
      const fullCache = await loadFullCacheIfPresent();
      mismatches.slice(0, MAX_DIFF_SAMPLES).forEach((m) => {
        const [universityName, category, pathName] = m.key.split('|');
        console.error(`  - ${m.key}: ${m.reason} (기존 ${m.expectedBytes}자 → 현재 ${m.actualBytes ?? 0}자)`);
        if (fullCache && m.rendered !== undefined) {
          const before = fullCache?.[universityName]?.[category]?.[pathName] || '';
          const { before: beforeSnippet, after: afterSnippet } = diffSnippet(before, m.rendered);
          console.error(`      전: ...${beforeSnippet}...`);
          console.error(`      후: ...${afterSnippet}...`);
        }
      });
      if (mismatches.length > MAX_DIFF_SAMPLES) {
        console.error(`  ... 외 ${mismatches.length - MAX_DIFF_SAMPLES}건 생략`);
      }
    } else {
      console.log('[doc-equivalence] Gate A2 전 항목 100% 일치.');
    }
  }

  return { total, matched, matchRate, mismatches };
}

const isMainModule = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMainModule) {
  Promise.all([runDocEquivalenceVerification(), runGateA2Verification()])
    .then(([gateA, gateA2]) => {
      process.exit(gateA.mismatches.length || gateA2.mismatches.length ? 1 : 0);
    })
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}
