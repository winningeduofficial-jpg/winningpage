// =====================================================================
// admission_university_resources HWP 콘텐츠 적재 스크립트
//
// src/data/admissionHwpSections.json(218개교)을 university_name 기준으로
// dev DB admission_university_resources에 매칭해 raw 6종 + *_html 6종 +
// *_json 6종을 채운다. HTML은 페이지 모달(InfoButton, src/pages/
// AdmissionGuidelines.jsx)이 실제 쓰는 것과 동일한 빌드 경로(buildRawSectionHtml)로
// 생성하며, JSON에 이미 들어 있는 *_html 값은 그대로 보존(재생성하지 않음)한다.
//
// *_json 정책 — "html이 있으면 html에서, 없을 때만 raw에서"(2026-08-06
// 사고 이후 확정):
//   1) 기존 html(보존 대상)이 있으면 → import-legacy-admission-html.mjs의
//      파서 체인(importCell, Phase 5 백필과 동일 경로)으로 그 html에서
//      json을 재구성한다.
//   2) html이 없어서 이번에 raw로 새로 만든 경우에만 → buildHwpCategoryDoc으로
//      raw에서 직접 doc을 생성한다.
//   3) 어느 쪽도 안 되면(원자료 없음/파싱 실패) 그 컬럼은 payload에서
//      아예 뺀다(기존 DB 값 보존 — Admin.jsx formToPayload와 동일한
//      "delete=무해" 패턴).
//
// 이 정책은 어드민 Admin.jsx의 buildPreviewPatch(raw 우선 — "관리자가
// 방금 원문을 고쳤으니 raw가 정본")와 **의도적으로 다르다.** 이 스크립트는
// "기존 데이터 유지·보강"이 목적이고, 저장 html이 raw보다 정확하다는 게
// 이 프로젝트에서 반복 확인된 사실이다(Phase 0 실측: raw 재생성만으로는
// 저장 html과 1253건 중 0건도 바이트 일치하지 않았다). 2026-08-06
// 사고에서 raw 우선으로 json을 만들었다가 curated/legacy html에만 있던
// 정보(예: minimum_requirements의 세분 과목 표기, recruitment_quota의
// 정규화된 표 구조)를 잃어 1253건 중 356건이 어긋난 걸 실측으로 확인—
// import-legacy-admission-html.mjs --apply 재실행으로 복구했다.
//
// **기본값은 dry-run이다.** 실제로 쓰려면 --apply를 명시해야 한다(저장소
// 관례 — normalize-admission-html.mjs/backfill-admission-doc.mjs/
// import-legacy-admission-html.mjs 전부 동일). 위 사고의 직접 원인이
// "인자 없이 실행 = 즉시 적용"이던 예전 기본값이었다. 구버전 호출 습관
// 보호를 위해 --dry-run 플래그는 남겨두되 이제 아무 효과가 없다(항상
// dry-run이 기본이므로) — 대신 경고를 띄운다.
//
// 실행 순서:
//   1) scripts/verify-admission-doc-equivalence.mjs로 회귀 검증(불일치 시 중단)
//   2) university_name 매칭(정확 일치 → normalizeName 폴백)
//   3) 카테고리별 payload 계산(html은 기존 보존 우선, json은 html-first)
//   4) --apply일 때만 upsert onConflict: 'admission_year,university_key'
//   5) 적재 후 행수 · html/json 채움률 확인 SQL 결과 출력
//
// 사용법:
//   node scripts/load-admission-content.mjs                    # dry-run(기본, 아무것도 안 씀)
//   node scripts/load-admission-content.mjs --apply             # 실제 적용
//   node scripts/load-admission-content.mjs --apply --admission-year 2027
//
// 키 조회 순서(하드코딩 금지) — scripts/seed-admission-universities.mjs와 동일:
//   1) SEED_SUPABASE_URL / SEED_SERVICE_ROLE_KEY 환경변수
//   2) --keys-file <path>
//   3) 기본값: scratchpad의 dev-keys.json (SEED_KEYS_FILE 로 재지정 가능)
// =====================================================================

import { createClient } from '@supabase/supabase-js';
import { readFile } from 'node:fs/promises';
import { parseArgs } from 'node:util';
import process from 'node:process';

import admissionHwpSections from '../src/data/admissionHwpSections.json' with { type: 'json' };
import { buildRawSectionHtml, buildHwpCategoryDoc, clean, normalizeName } from '../src/lib/admissionParsing.js';
import { validateAdmissionDoc } from '../src/lib/admissionDoc.js';
import { importCell } from './import-legacy-admission-html.mjs';
import { runDocEquivalenceVerification } from './verify-admission-doc-equivalence.mjs';

const DEV_PROJECT_REF = 'gjowqdiopinhixfivnkx';
const DEFAULT_KEYS_FILE =
  '/private/tmp/claude-501/-Users-hyunsoo-uwellnow-winningpage/7d913b11-451e-4002-a293-f999f0a2dad9/scratchpad/dev-keys.json';
const TABLE = 'admission_university_resources';

let args = {};

// 카테고리 key -> DB html 컬럼 매핑. 페이지의 INFO_SECTIONS(AdmissionGuidelines.jsx)
// 정의와 동일하다.
const CATEGORY_HTML_KEY = {
  previous_year_changes: 'previous_year_changes_html',
  selection_method: 'selection_method_html',
  minimum_requirements: 'minimum_requirements_html',
  exam_schedule: 'exam_schedule_html',
  school_record_method: 'school_record_method_html',
  recruitment_quota: 'recruitment_result_html'
};
const CATEGORY_KEYS = Object.keys(CATEGORY_HTML_KEY);

// *_json 컬럼 매핑 — recruitment_quota만 html 쪽이 recruitment_result_html로
// 어긋나 있을 뿐, json은 6개 전부 `<rawKey>_json` 접미어로 통일이다(sql/43 정본).
const CATEGORY_JSON_KEY = {
  previous_year_changes: 'previous_year_changes_json',
  selection_method: 'selection_method_json',
  minimum_requirements: 'minimum_requirements_json',
  exam_schedule: 'exam_schedule_json',
  school_record_method: 'school_record_method_json',
  recruitment_quota: 'recruitment_quota_json'
};

async function resolveCredentials() {
  const envUrl = process.env.SEED_SUPABASE_URL;
  const envKey = process.env.SEED_SERVICE_ROLE_KEY;
  if (envUrl && envKey) return { url: envUrl, serviceKey: envKey };

  const keysFile = args['keys-file'] || process.env.SEED_KEYS_FILE || DEFAULT_KEYS_FILE;
  const raw = JSON.parse(await readFile(keysFile, 'utf-8'));
  const serviceEntry = raw.find((entry) => entry.name === 'service_role');
  if (!serviceEntry) throw new Error(`${keysFile}에서 service_role 키를 찾을 수 없습니다.`);
  return {
    url: `https://${DEV_PROJECT_REF}.supabase.co`,
    serviceKey: serviceEntry.api_key
  };
}

// 카테고리 하나(html+json)를 함께 계산한다.
//
// html: 기존 값(JSON 소스 또는 DB) 우선 보존, 없으면 페이지 모달과 동일한
// buildRawSectionHtml 경로로 생성한다.
//
// json: html과 반대 정책이다 — "보존 우선"이 아니라 "html-first 재구성".
// 이미 있는(보존된) html이 있으면 importCell(import-legacy-admission-
// html.mjs, Phase 5 백필과 동일 파서 체인)로 그 html에서 doc을 다시
// 뽑는다. html이 없어서 이번에 raw로 새로 만든 경우에만 raw 자체에서
// buildHwpCategoryDoc(어드민 buildPreviewPatch와 동일 빌더)으로 doc을
// 만든다. 어느 쪽도 doc을 못 만들면(파싱 실패/원자료 없음) 그 컬럼은
// payload에서 아예 뺀다 — 기존 DB 값을 보존한다는 뜻이지 지운다는 뜻이
// 아니다(Admin.jsx formToPayload와 동일 패턴).
function buildCategoryContent(sectionKey, hwpRow, dbRow, universityName) {
  const htmlKey = CATEGORY_HTML_KEY[sectionKey];
  const existingHtml = clean(hwpRow?.[htmlKey]) || clean(dbRow?.[htmlKey]);
  const rawText = clean(hwpRow?.[sectionKey]) || clean(dbRow?.[sectionKey]);

  let html;
  let htmlSource;
  if (existingHtml) {
    html = existingHtml;
    htmlSource = 'preserved';
  } else if (rawText) {
    html = buildRawSectionHtml(rawText, sectionKey, hwpRow, universityName);
    htmlSource = 'generated';
  } else {
    html = '';
    htmlSource = 'empty';
  }

  let doc;
  let jsonSource;
  let jsonDetail;
  if (existingHtml) {
    // importCell은 row.university_name/row.detail_status를 참조한다(특수대학
    // 판정). dbRow가 매칭된 행 전체라 그대로 넘긴다.
    let result;
    try {
      result = importCell(sectionKey, existingHtml, dbRow);
    } catch (err) {
      jsonSource = 'exception';
      jsonDetail = err.message;
      result = null;
    }
    if (result) {
      if (result.classification === 'imported') {
        doc = result.doc;
        jsonSource = 'imported-from-html';
      } else {
        jsonSource = result.classification === 'skip' ? 'skip' : 'needsReview';
        jsonDetail = result.reason;
      }
    }
  } else if (rawText) {
    let generated;
    try {
      generated = buildHwpCategoryDoc(sectionKey, rawText, dbRow, universityName);
    } catch (err) {
      jsonSource = 'exception';
      jsonDetail = err.message;
    }
    if (generated) {
      const { ok, errors } = validateAdmissionDoc(generated);
      if (ok) {
        doc = generated;
        jsonSource = 'generated-from-raw';
      } else {
        jsonSource = 'invalid';
        jsonDetail = errors.join('; ');
      }
    }
  } else {
    jsonSource = 'empty';
  }

  return { html, htmlSource, doc, jsonSource, jsonDetail };
}

async function main() {
  args = parseArgs({
    options: {
      apply: { type: 'boolean', default: false },
      'dry-run': { type: 'boolean', default: false },
      'keys-file': { type: 'string' },
      'admission-year': { type: 'string', default: '2027' },
      'skip-equivalence-check': { type: 'boolean', default: false }
    }
  }).values;

  if (args['dry-run']) {
    console.warn(
      '--dry-run 플래그는 더 이상 의미가 없습니다(기본이 이미 dry-run입니다). ' +
        '실제로 적용하려면 --apply를 쓰세요.'
    );
  }

  console.log('=== 1) 골든 대조 회귀 검증(Gate A) ===');
  if (args['skip-equivalence-check']) {
    console.warn('--skip-equivalence-check: 검증을 건너뜁니다(권장하지 않음).');
  } else {
    const { total, matched, matchRate, mismatches } = await runDocEquivalenceVerification();
    if (mismatches.length) {
      console.error(
        `골든 대조 검증 실패: ${total}건 중 ${matched}건만 일치(${matchRate.toFixed(2)}%). 적재를 중단합니다.`
      );
      process.exit(1);
    }
  }

  console.log('\n=== 2) university_name 매칭 + payload 계산 ===');
  const admissionYear = Number(args['admission-year']);
  const universityNames = Object.keys(admissionHwpSections);

  const { url, serviceKey } = await resolveCredentials();
  if (!url.includes(DEV_PROJECT_REF)) {
    throw new Error('dev 프로젝트(gjowqdiopinhixfivnkx)가 아닌 URL입니다. 중단합니다.');
  }
  const supabase = createClient(url, serviceKey);

  // is_active/detail_status/raw 6종/html 6종/json 6종도 함께 가져온다 — 재실행 시
  // 이미 DB에 있는(어드민이 손으로 편집했을 수 있는) 값을 보존하기 위한 COALESCE
  // 기준값이다. json은 buildCategoryContent가 importCell(detail_status로
  // 특수대학 판정)에 dbRow를 그대로 넘기므로 필요하다.
  const existingColumns = [
    'id',
    'university_name',
    'university_key',
    'admission_year',
    'region',
    'is_active',
    'detail_status',
    ...CATEGORY_KEYS,
    ...CATEGORY_KEYS.map((key) => CATEGORY_HTML_KEY[key]),
    ...CATEGORY_KEYS.map((key) => CATEGORY_JSON_KEY[key])
  ].join(', ');

  const { data: existingRows, error: fetchError } = await supabase
    .from(TABLE)
    .select(existingColumns)
    .eq('admission_year', admissionYear);
  if (fetchError) throw new Error(`기존 행 조회 실패: ${fetchError.message}`);

  const exactMap = new Map();
  const normalizedMap = new Map();
  (existingRows || []).forEach((row) => {
    exactMap.set(row.university_name, row);
    const key = normalizeName(row.university_name);
    if (!normalizedMap.has(key)) normalizedMap.set(key, row);
  });

  const matchFailures = [];
  const categoryStats = Object.fromEntries(
    CATEGORY_KEYS.map((key) => [key, { preserved: 0, generated: 0, empty: 0 }])
  );
  const jsonStats = Object.fromEntries(
    CATEGORY_KEYS.map((key) => [
      key,
      { 'imported-from-html': 0, 'generated-from-raw': 0, empty: 0, skip: 0, needsReview: 0, invalid: 0, exception: 0 }
    ])
  );
  const jsonFailures = [];
  const payloads = [];

  universityNames.forEach((universityName) => {
    const hwpRow = admissionHwpSections[universityName];
    const dbRow = exactMap.get(universityName) || normalizedMap.get(normalizeName(universityName));
    if (!dbRow) {
      matchFailures.push(universityName);
      return;
    }

    const payload = {
      admission_year: admissionYear,
      university_name: dbRow.university_name,
      university_key: dbRow.university_key,
      region: dbRow.region,
      // 신규 행에만 기본값을 채우고 기존 행은 어드민이 지정한 값을 보존한다:
      // JSON에 값이 있으면 그것을 우선하되, 없으면 DB 현재 값 → 최종 기본값 순으로 폴백.
      detail_status: clean(hwpRow.detail_status) || clean(dbRow.detail_status) || 'normal',
      matched_hwp_name: clean(hwpRow.hwp_source_name) || universityName,
      is_active: typeof dbRow.is_active === 'boolean' ? dbRow.is_active : true
    };

    CATEGORY_KEYS.forEach((key) => {
      const { html, htmlSource, doc, jsonSource, jsonDetail } = buildCategoryContent(
        key,
        hwpRow,
        dbRow,
        universityName
      );

      payload[key] = clean(hwpRow[key]) || clean(dbRow[key]);
      payload[CATEGORY_HTML_KEY[key]] = html;
      categoryStats[key][htmlSource] += 1;

      const jsonKey = CATEGORY_JSON_KEY[key];
      jsonStats[key][jsonSource] += 1;
      if (jsonSource === 'needsReview' || jsonSource === 'invalid' || jsonSource === 'exception') {
        jsonFailures.push({ universityName, key, source: jsonSource, detail: jsonDetail });
      }
      // doc이 undefined면 payload에서 이 컬럼을 아예 뺀다 — upsert가 기존
      // DB 값을 건드리지 않는다는 뜻이다(Admin.jsx formToPayload와 동일 패턴).
      if (doc !== undefined) payload[jsonKey] = doc;
    });

    payloads.push(payload);
  });

  console.log(`매칭 성공: ${payloads.length}/${universityNames.length}개교`);
  if (matchFailures.length) {
    console.error(`매칭 실패 ${matchFailures.length}개교:`, matchFailures.join(', '));
  } else {
    console.log('매칭 실패 없음(218개교 전원 매칭).');
  }

  console.log('\n카테고리별 HTML 소스(보존/생성/원자료없음):');
  CATEGORY_KEYS.forEach((key) => {
    const s = categoryStats[key];
    console.log(
      `  - ${key} (${CATEGORY_HTML_KEY[key]}): 보존 ${s.preserved} / 생성 ${s.generated} / 원자료없음 ${s.empty}`
    );
  });

  console.log('\n카테고리별 JSON 생성 결과(html에서 임포트/raw에서 생성/원자료없음/실패류-기존보존):');
  CATEGORY_KEYS.forEach((key) => {
    const s = jsonStats[key];
    console.log(
      `  - ${key} (${CATEGORY_JSON_KEY[key]}): html임포트 ${s['imported-from-html']} / raw생성 ${s['generated-from-raw']} / ` +
        `원자료없음 ${s.empty} / skip ${s.skip} / needsReview(기존보존) ${s.needsReview} / 검증실패(기존보존) ${s.invalid} / 예외(기존보존) ${s.exception}`
    );
  });
  if (jsonFailures.length) {
    console.log(`\nJSON 생성 실패 상세(${jsonFailures.length}건 중 최대 20건):`);
    jsonFailures.slice(0, 20).forEach((f) => {
      console.log(`  - [${f.universityName}] ${f.key} (${f.source}): ${f.detail}`);
    });
  } else {
    console.log('\nJSON 생성 실패 없음.');
  }

  if (!args.apply) {
    console.log('\ndry-run(기본값): DB에 쓰지 않고 종료합니다. 실제로 적용하려면 --apply를 쓰세요.');
    return;
  }

  console.log('\n=== 3) upsert 적재 ===');
  const { error: upsertError, count } = await supabase
    .from(TABLE)
    .upsert(payloads, { onConflict: 'admission_year,university_key', count: 'exact' });
  if (upsertError) throw new Error(`upsert 실패: ${upsertError.message}`);
  console.log(`upsert 완료: ${count ?? payloads.length}행 처리`);

  console.log('\n=== 4) 적재 결과 확인 SQL ===');
  console.log(
    `select count(*) as total,\n` +
      CATEGORY_KEYS.map(
        (key) =>
          `  count(*) filter (where ${CATEGORY_HTML_KEY[key]} is not null and ${CATEGORY_HTML_KEY[key]} <> '') as ${CATEGORY_HTML_KEY[key]}_filled`
      ).join(',\n') +
      ',\n' +
      CATEGORY_KEYS.map(
        (key) => `  count(*) filter (where ${CATEGORY_JSON_KEY[key]} is not null) as ${CATEGORY_JSON_KEY[key]}_filled`
      ).join(',\n') +
      `\nfrom ${TABLE} where admission_year = ${admissionYear};`
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
