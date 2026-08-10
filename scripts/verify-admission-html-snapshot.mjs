// =====================================================================
// 대입모집요강 HTML 생성 파이프라인 회귀 검증 스크립트
//
// 배경: commit 8fc8fc3(refactor(admission): HWP 파싱 파이프라인을 공유 모듈로
// 분리)에서 src/pages/AdmissionGuidelines.jsx에 있던 순수 파싱 로직 전부를
// src/lib/admissionParsing.js로 "이동"만 했다고 주장한다. 이 스크립트는 그
// 주장을 실측으로 검증한다: 8fc8fc3의 부모 커밋(리팩터 전, "기존 페이지
// 경로") 스냅샷을 git에서 즉석 추출해 독립 모듈로 재구성하고, 현재
// src/lib/admissionParsing.js("모듈 경로")와 같은 입력(src/data/
// admissionHwpSections.json 218개교 × 6카테고리)에 대해 buildRawSectionHtml
// 출력을 1:1로 비교한다. 리팩터가 순수 이동이었다면 100% 일치해야 한다.
//
// 사용법:
//   node scripts/verify-admission-html-snapshot.mjs
//
// 종료 코드: 불일치가 하나라도 있으면 1, 전부 일치하면 0.
// =====================================================================

import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..');
const PAGE_RELATIVE_PATH = 'src/pages/AdmissionGuidelines.jsx';
const MODULE_RELATIVE_PATH = 'src/lib/admissionParsing.js';
const HWP_JSON_RELATIVE_PATH = 'src/data/admissionHwpSections.json';

// 파싱 로직이 공유 모듈로 분리된 리팩터 커밋. 이 커밋의 부모가 "기존 페이지
// 경로"(리팩터 전 페이지 내장 로직)다.
const REFACTOR_COMMIT = '8fc8fc3';

const CATEGORY_KEYS = [
  'previous_year_changes',
  'selection_method',
  'minimum_requirements',
  'exam_schedule',
  'school_record_method',
  'recruitment_quota'
];

function git(args) {
  return execFileSync('git', args, {
    cwd: REPO_ROOT,
    encoding: 'utf8',
    maxBuffer: 20 * 1024 * 1024
  });
}

// -----------------------------------------------------------------------
// 1) 현재 공유 모듈이 export하는 순수 함수/상수 이름 목록을 확보한다(화이트
//    리스트). 리팩터 전 페이지 파일에서 정확히 이 이름들에 해당하는 최상위
//    선언만 뽑아내면, React 컴포넌트(JSX)는 자동으로 제외되고 순수 파싱
//    로직만 남는다.
// -----------------------------------------------------------------------
function getCurrentModuleExportNames() {
  const currentModuleSrc = git(['show', `HEAD:${MODULE_RELATIVE_PATH}`]);
  const names = new Set();
  const re = /^export (?:function|const) ([A-Za-z0-9_]+)/gm;
  let m;
  while ((m = re.exec(currentModuleSrc)) !== null) names.add(m[1]);
  return names;
}

// -----------------------------------------------------------------------
// 2) 리팩터 전 페이지 파일에서 화이트리스트에 해당하는 최상위 function/const
//    선언 블록만 순서대로 추출해 독립 실행 가능한 ESM 모듈로 재구성한다.
// -----------------------------------------------------------------------
function reconstructOldModule(wantedNames) {
  const oldPageSrc = git(['show', `${REFACTOR_COMMIT}^:${PAGE_RELATIVE_PATH}`]);
  const lines = oldPageSrc.split('\n');

  // 순수 파싱 로직은 default-export되는 페이지 컴포넌트보다 앞에 있다.
  const defaultExportIdx = lines.findIndex((line) =>
    line.startsWith('export default function')
  );
  if (defaultExportIdx < 0) {
    throw new Error(`${REFACTOR_COMMIT}^:${PAGE_RELATIVE_PATH}에서 페이지 컴포넌트를 찾지 못했습니다.`);
  }
  const region = lines.slice(0, defaultExportIdx);

  const topLevelRe = /^(function\s+([A-Za-z0-9_]+)\s*\(|const\s+([A-Za-z0-9_]+)\s*=)/;
  const chunks = [];
  let current = null;
  region.forEach((line) => {
    const m = topLevelRe.exec(line);
    if (m) {
      if (current) chunks.push(current);
      current = { name: m[2] || m[3], lines: [line] };
    } else if (current) {
      current.lines.push(line);
    }
  });
  if (current) chunks.push(current);

  const foundNames = new Set();
  const kept = [];
  chunks.forEach((chunk) => {
    if (wantedNames.has(chunk.name) && !foundNames.has(chunk.name)) {
      foundNames.add(chunk.name);
      kept.push(chunk);
    }
  });
  const missing = [...wantedNames].filter((n) => !foundNames.has(n));

  const hwpJsonUrl = pathToFileURL(path.join(REPO_ROOT, HWP_JSON_RELATIVE_PATH)).href;
  const header =
    `// AUTO-GENERATED at verification runtime from ${REFACTOR_COMMIT}^:${PAGE_RELATIVE_PATH}. Do not edit.\n` +
    `import admissionHwpSections from '${hwpJsonUrl}' with { type: 'json' };\n\n`;
  const body = kept.map((c) => `export ${c.lines.join('\n')}`).join('\n\n');

  return { source: header + body + '\n', missing };
}

// -----------------------------------------------------------------------
// 3) 218개교 × 6카테고리에 대해 두 경로의 buildRawSectionHtml 출력을 비교.
// -----------------------------------------------------------------------
export async function runSnapshotVerification({ verbose = true } = {}) {
  const wantedNames = getCurrentModuleExportNames();
  const { source: oldModuleSource, missing } = reconstructOldModule(wantedNames);

  if (missing.length && verbose) {
    console.warn(
      `[snapshot] 참고: 리팩터 전 페이지에 없던(리팩터 이후 신규 추가된) 이름 ${missing.length}개는 비교 대상에서 제외합니다:`,
      missing.join(', ')
    );
  }

  const tmpDir = mkdtempSync(path.join(tmpdir(), 'admission-snapshot-'));
  const oldModulePath = path.join(tmpDir, 'old-admission-parsing.mjs');
  writeFileSync(oldModulePath, oldModuleSource);

  let oldModule;
  let newModule;
  let admissionHwpSections;
  try {
    oldModule = await import(pathToFileURL(oldModulePath).href);
    newModule = await import(pathToFileURL(path.join(REPO_ROOT, MODULE_RELATIVE_PATH)).href);
    ({ default: admissionHwpSections } = await import(
      pathToFileURL(path.join(REPO_ROOT, HWP_JSON_RELATIVE_PATH)).href,
      { with: { type: 'json' } }
    ));
  } finally {
    rmSync(tmpDir, { recursive: true, force: true });
  }

  if (typeof oldModule.buildRawSectionHtml !== 'function') {
    throw new Error('리팩터 전 스냅샷에서 buildRawSectionHtml을 복원하지 못했습니다.');
  }

  const universityNames = Object.keys(admissionHwpSections);
  let total = 0;
  let matched = 0;
  const mismatches = [];

  universityNames.forEach((universityName) => {
    const row = admissionHwpSections[universityName];
    CATEGORY_KEYS.forEach((key) => {
      const rawText = String(row?.[key] || '').trim();
      if (!rawText) return; // 원자료가 없는 카테고리는 비교 대상 없음(양쪽 다 빈 값).
      total += 1;

      let oldHtml;
      let newHtml;
      let error = null;
      try {
        oldHtml = oldModule.buildRawSectionHtml(rawText, key, row, universityName);
        newHtml = newModule.buildRawSectionHtml(rawText, key, row, universityName);
      } catch (err) {
        error = err;
      }

      if (error) {
        mismatches.push({ universityName, key, reason: `렌더링 오류: ${error.message}` });
        return;
      }
      if (oldHtml === newHtml) {
        matched += 1;
      } else {
        mismatches.push({ universityName, key, reason: 'HTML 불일치', oldHtml, newHtml });
      }
    });
  });

  const matchRate = total ? (matched / total) * 100 : 100;

  if (verbose) {
    console.log(
      `[snapshot] 대상 ${universityNames.length}개교, 비교 셀 ${total}개(원자료 있는 카테고리만) 중 ${matched}개 일치 (${matchRate.toFixed(2)}%)`
    );
    if (mismatches.length) {
      console.error(`[snapshot] 불일치 ${mismatches.length}건:`);
      mismatches.slice(0, 30).forEach((m) => {
        console.error(`  - ${m.universityName} / ${m.key}: ${m.reason}`);
      });
      if (mismatches.length > 30) {
        console.error(`  ... 외 ${mismatches.length - 30}건 생략`);
      }
    } else {
      console.log('[snapshot] 전 항목 100% 일치. 1단계 리팩터는 순수 이동이 맞습니다.');
    }
  }

  return { total, matched, matchRate, mismatches };
}

const isMainModule = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMainModule) {
  runSnapshotVerification()
    .then(({ mismatches }) => {
      process.exit(mismatches.length ? 1 : 0);
    })
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}
