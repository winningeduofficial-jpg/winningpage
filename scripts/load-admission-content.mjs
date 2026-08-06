// =====================================================================
// admission_university_resources HWP 콘텐츠 적재 스크립트
//
// src/data/admissionHwpSections.json(218개교)을 university_name 기준으로
// dev DB admission_university_resources에 매칭해 raw 6종 + *_html 6종을
// 채운다. HTML은 페이지 모달(InfoButton, src/pages/AdmissionGuidelines.jsx)이
// 실제 쓰는 것과 동일한 빌드 경로(src/lib/admissionParsing.js의
// buildRawSectionHtml)로 생성하며, JSON에 이미 들어 있는 *_html 값은 그대로
// 보존(재생성하지 않음)한다.
//
// 실행 순서:
//   1) scripts/verify-admission-doc-equivalence.mjs로 회귀 검증(불일치 시 중단)
//   2) university_name 매칭(정확 일치 → normalizeName 폴백)
//   3) 카테고리별 payload 계산(기존 html 보존 우선, 없으면 buildRawSectionHtml)
//   4) upsert onConflict: 'admission_year,university_key'
//   5) 적재 후 행수 · html 채움률 확인 SQL 결과 출력
//
// 사용법:
//   node scripts/load-admission-content.mjs [--dry-run] [--admission-year 2027]
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
import { buildRawSectionHtml, clean, normalizeName } from '../src/lib/admissionParsing.js';
import { runDocEquivalenceVerification } from './verify-admission-doc-equivalence.mjs';

const DEV_PROJECT_REF = 'gjowqdiopinhixfivnkx';
const DEFAULT_KEYS_FILE =
  '/private/tmp/claude-501/-Users-hyunsoo-uwellnow-winningpage/7d913b11-451e-4002-a293-f999f0a2dad9/scratchpad/dev-keys.json';
const TABLE = 'admission_university_resources';

const { values: args } = parseArgs({
  options: {
    'dry-run': { type: 'boolean', default: false },
    'keys-file': { type: 'string' },
    'admission-year': { type: 'string', default: '2027' },
    'skip-equivalence-check': { type: 'boolean', default: false }
  }
});

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

// 카테고리 하나에 대해: JSON에 이미 있는 *_html은 그대로 보존, 없으면 DB에 현재
// 저장돼 있는 값을 보존(재실행이 어드민 수기 편집을 되돌리지 않도록), 그것도 없으면
// 페이지 모달과 동일한 buildRawSectionHtml 경로로 생성한다.
function buildCategoryHtml(sectionKey, hwpRow, dbRow, universityName) {
  const htmlKey = CATEGORY_HTML_KEY[sectionKey];
  const existingHtml = clean(hwpRow?.[htmlKey]) || clean(dbRow?.[htmlKey]);
  if (existingHtml) return { html: existingHtml, source: 'preserved' };

  const rawText = clean(hwpRow?.[sectionKey]) || clean(dbRow?.[sectionKey]);
  if (!rawText) return { html: '', source: 'empty' };

  const generated = buildRawSectionHtml(rawText, sectionKey, hwpRow, universityName);
  return { html: generated, source: 'generated' };
}

async function main() {
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

  // is_active/detail_status/raw 6종/html 6종도 함께 가져온다 — 재실행 시 이미
  // DB에 있는(어드민이 손으로 편집했을 수 있는) 값을 보존하기 위한 COALESCE 기준값이다.
  const existingColumns = [
    'id',
    'university_name',
    'university_key',
    'admission_year',
    'region',
    'is_active',
    'detail_status',
    ...CATEGORY_KEYS,
    ...CATEGORY_KEYS.map((key) => CATEGORY_HTML_KEY[key])
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
      payload[key] = clean(hwpRow[key]) || clean(dbRow[key]);
      const { html, source } = buildCategoryHtml(key, hwpRow, dbRow, universityName);
      payload[CATEGORY_HTML_KEY[key]] = html;
      categoryStats[key][source] += 1;
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

  if (args['dry-run']) {
    console.log('\n--dry-run: DB에 쓰지 않고 종료합니다.');
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
      `\nfrom ${TABLE} where admission_year = ${admissionYear};`
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
