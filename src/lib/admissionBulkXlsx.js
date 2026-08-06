// =====================================================================
// 대입모집요강 일괄 엑셀 왕복(admission_university_resources 전체 행 ↔
// 사용자가 준 `모집요강.xlsx`와 동일한 26컬럼 포맷).
//
// 이 파일은 순수 함수만 담는다. DB 접근·React/DOM 의존 없음 — 어드민
// 목록 페이지(safehtml 담당)가 이 함수들을 호출하고, DB 조회/쓰기는
// 호출부가 한다(이 lib은 "무엇을 쓸지"만 계산한다).
//
// 컬럼 순서(26개, 사용자가 준 원본 파일 그대로 — 새로 추가/재배열하지
// 않는다): id / admission_year / source_name / source_version / region /
// university_name / university_key / campus / previous_year_changes /
// selection_method / minimum_requirements / exam_schedule /
// school_record_method / recruitment_quota / jungsi_guideline_url /
// official_source_url / memo / detail_status / matched_hwp_name /
// is_active / created_at / updated_at / recruitment_result_html /
// matched_text_name / minimum_requirements_html / school_record_method_html
//
// 원본 포맷의 특징(그대로 따른다):
//   - html 컬럼은 6종이 아니라 **3종만**(recruitment_result_html /
//     minimum_requirements_html / school_record_method_html) 있다.
//     previous_year_changes/selection_method/exam_schedule은 xlsx에
//     html 칸 자체가 없다.
//   - *_json 6종은 아예 없다. 업로드 시 doc은 항상 재생성한다(아래 정책).
//
// 매칭 키: (admission_year, university_key)다. id는 참고용으로만 읽고
// 매칭·payload 어디에도 쓰지 않는다(연도별 관리 도입, 2026-08-06 —
// 스키마에 이미 unique(admission_year, university_key) 제약이 있다).
//
// doc/html 재생성 정책(임포터 정책과 동일, 어드민 buildPreviewPatch의
// raw-우선과는 의도적으로 다르다 — 이건 새 소스를 업로드하는 흐름이라
// html-우선이 맞다):
//   1) 업로드된 html이 있고 비어있지 않으면 → 그 html에서 doc 임포트
//      (importCell, src/lib/admissionHtmlImport.js). 성공하면 html은
//      업로드된 값을 그대로 쓴다.
//   2) 1)이 없거나 실패하면, raw가 있으면 → buildHwpCategoryDoc으로 doc
//      생성 + renderDocToHtml로 html 미러를 새로 만든다(업로드된 html을
//      그대로 살리지 않는다 — 실패한 html과 새 doc이 어긋나면 드리프트가
//      난다).
//   3) 어느 쪽도 안 되면 그 카테고리는 payload에서 통째로 뺀다(json/html
//      둘 다) — 기존 DB 값 보존("delete=무해" 패턴).
// 카테고리별로 후보 doc이 나오면 shouldSkipForRegression(admissionDoc.js)
// 으로 기존 doc(있다면)보다 정보량이 줄었는지 본다. 줄었으면 그 카테고리도
// 통째로 미기록하고 warnings에 담는다.
//
// 잘림 마커 처리(2026-08-06 재설계): 처음엔 잘림 마커가 있는 셀이 하나만
// 있어도 행 전체를 거부했다. 그런데 실측 결과 잘림은 항상
// recruitment_result_html 한 컬럼에서만 난다(218행 중 23행, 다른 25개
// 컬럼은 0건) — 행 전체를 거부하면 그 23개교는 university_name 오타 같은
// 사소한 것도 엑셀로 못 고친다. 그래서 **6개 콘텐츠 카테고리(raw+html)는
// 컬럼(카테고리) 단위로만 스킵**한다 — 그 카테고리의 doc/html/raw를
// 전부 payload에서 빼고(기존 DB 값 보존) 나머지 카테고리·메타데이터는
// 정상 처리한다. 메타데이터 컬럼(university_name/region/memo 등)이
// 잘린 경우는(실측 0건, 짧은 식별자·URL이라 사실상 안 남) 행 전체를
// 거부한다 — 발생한 적 없는 경로라 굳이 컬럼 단위로 세분화하지 않았다.
// =====================================================================

import * as XLSX from 'xlsx';

import { buildHwpCategoryDoc, renderDocToHtml, HWP_SECTION_HTML_KEYS, clean } from './admissionParsing.js';
import { HWP_SECTION_JSON_KEYS, validateAdmissionDoc, shouldSkipForRegression } from './admissionDoc.js';
import { importCell } from './admissionHtmlImport.js';

export const BULK_XLSX_COLUMNS = [
  'id',
  'admission_year',
  'source_name',
  'source_version',
  'region',
  'university_name',
  'university_key',
  'campus',
  'previous_year_changes',
  'selection_method',
  'minimum_requirements',
  'exam_schedule',
  'school_record_method',
  'recruitment_quota',
  'jungsi_guideline_url',
  'official_source_url',
  'memo',
  'detail_status',
  'matched_hwp_name',
  'is_active',
  'created_at',
  'updated_at',
  'recruitment_result_html',
  'matched_text_name',
  'minimum_requirements_html',
  'school_record_method_html'
];

// 6개 카테고리 → raw 컬럼명(1:1, BULK_XLSX_COLUMNS의 컬럼명과 동일하다).
const CATEGORY_KEYS = Object.keys(HWP_SECTION_JSON_KEYS);

// 6개 카테고리 → xlsx의 html 컬럼명. 원본 포맷에 html 칸이 있는 3종만
// 채운다 — 나머지 3종(previous_year_changes/selection_method/exam_schedule)
// 은 xlsx에 칸이 없으므로 매핑도 없다(항상 raw 경로만 탄다).
const CATEGORY_XLSX_HTML_COLUMN = {
  minimum_requirements: 'minimum_requirements_html',
  school_record_method: 'school_record_method_html',
  recruitment_quota: 'recruitment_result_html'
};

// 메타데이터 컬럼(콘텐츠 카테고리 6종 제외) 중 잘림 마커를 검사할 대상.
// admission_year/university_key/id/is_active/created_at/updated_at은
// 짧은 식별자·불리언·타임스탬프라 잘릴 일이 사실상 없어 제외했다 —
// 애초에 매칭 키(연도/university_key)가 잘리면 행 자체가 무의미해져
// 아래 필수값 검사에서 걸러진다.
const METADATA_COLUMNS_FOR_TRUNCATION_CHECK = [
  'source_name',
  'source_version',
  'region',
  'university_name',
  'campus',
  'jungsi_guideline_url',
  'official_source_url',
  'memo',
  'detail_status',
  'matched_hwp_name',
  'matched_text_name'
];

// 엑셀 셀 문자 수 한도(SheetJS가 쓰기 시점에 이 값으로 throw한다 —
// src/components/admission/editor/xlsx/tableBlockXlsx.js에서 이미 실측
// 확인된 값과 동일하다. 그 파일을 import하지 않고 상수만 다시 적는다 —
// src/lib/이 src/components/에 의존하면 계층이 거꾸로 된다).
export const MAX_XLSX_CELL_LENGTH = 32767;
export const TRUNCATION_MARKER =
  '…[셀 한도 초과로 잘림 — 이 셀을 그대로 업로드하면 데이터가 손상됩니다]';

function serializeExportCell(rawValue) {
  if (rawValue === null || rawValue === undefined) return '';
  if (typeof rawValue === 'boolean' || typeof rawValue === 'number') return rawValue;
  return String(rawValue);
}

function truncateIfNeeded(value, location, truncatedCells) {
  if (typeof value !== 'string' || value.length <= MAX_XLSX_CELL_LENGTH) return value;
  const keep = MAX_XLSX_CELL_LENGTH - TRUNCATION_MARKER.length;
  truncatedCells.push({ ...location, originalLength: value.length });
  return value.slice(0, keep) + TRUNCATION_MARKER;
}

// formula injection(CSV/수식 주입) 방어 — src/pages/Admin.jsx의 csvEscape
// (커밋 1a57fc8, dev)가 CSV 내보내기에 쓴 것과 같은 위협 모델이지만 xlsx는
// 해법이 다르다. dev의 csvEscape는 값 앞에 작은따옴표(')를 붙이는
// 텍스트 접두사 방식이다 — CSV는 셀 타입 메타데이터가 없어서 Excel이
// 파일을 열 때(가져오기 시점) 원문 텍스트 자체를 보고 "=/+/-/@로
// 시작하면 수식"이라고 휴리스틱으로 판단하기 때문에, 그 판단을 무력화
// 하려면 텍스트 자체를 바꿔야 한다. 하지만 그 접두사를 다시 걷어내지
// 않으면(또는 원본에 이미 있던 작은따옴표와 구분 못 하면) 왕복이 깨진다
// — 이 파일의 최우선 요구사항과 정면으로 충돌한다.
//
// xlsx(OOXML)는 셀마다 명시적 타입을 파일에 직접 저장한다. SheetJS의
// aoa_to_sheet가 JS 문자열을 셀로 만들면 기본값이 이미 문자열 타입
// (쓰기 시점 XML에서 `t="str"`, `<f>`(수식) 태그는 전혀 안 붙는다 —
// 직접 XLSX.write로 만든 파일의 원시 XML을 unzip해 확인함, "=1+1"을
// 넣어도 `<c t="str"><v>=1+1</v></c>`만 나오고 `<f>` 태그는 없다)이라,
// Excel/Sheets가 이 셀의 <v> 내용을 다시 수식으로 파싱하지 않는다(그
// 파싱은 CSV를 "가져올 때"만 하는 별도 경로다 — 이미 타입이 박힌
// xlsx를 열 때는 타입을 신뢰하고 문자열로만 표시한다). 즉 값을 조금도
// 바꾸지 않고 이미 안전하다.
//
// 그 암묵적 동작에만 기대지 않고, 셀 타입을 명시적으로 강제해 이 계약을
// 코드로 못박는다(SheetJS 버전이 바뀌어도 안전 — 아래 verify 스크립트가
// 매 셀의 t/f를 직접 검사해 회귀를 잡는다).
function forceStringCellTypes(worksheet) {
  Object.keys(worksheet).forEach((address) => {
    if (address.startsWith('!')) return;
    const cell = worksheet[address];
    if (cell && typeof cell.v === 'string') {
      cell.t = 's';
      delete cell.f; // 혹시라도 수식으로 잡혔으면(현재는 안 그렇다) 제거
    }
  });
  return worksheet;
}

/**
 * DB 행 배열(26컬럼 필드를 가진 객체) → xlsx workbook. 32,767자를 넘는
 * 셀은 조용히 자르지 않고, 잘린 자리에 TRUNCATION_MARKER를 남긴 뒤
 * truncatedCells에 기록한다(호출부가 경고를 띄울 수 있게). 모든 문자열
 * 셀은 명시적으로 's'(문자열) 타입으로 강제한다(formula injection 방어
 * — 위 주석 참고, 값 자체는 조금도 바뀌지 않아 왕복 무손실이다).
 * @param {Array<Record<string, unknown>>} rows
 * @returns {{ workbook: import('xlsx').WorkBook, truncatedCells: Array<{ id: unknown, rowIndex: number, column: string, originalLength: number }> }}
 */
export function exportAdmissionRowsToXlsx(rows) {
  const truncatedCells = [];
  const dataRows = rows.map((row, rowIndex) =>
    BULK_XLSX_COLUMNS.map((column) => {
      const serialized = serializeExportCell(row?.[column]);
      return truncateIfNeeded(serialized, { id: row?.id, rowIndex, column }, truncatedCells);
    })
  );

  const worksheet = forceStringCellTypes(XLSX.utils.aoa_to_sheet([BULK_XLSX_COLUMNS, ...dataRows]));
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, '모집요강');

  return { workbook, truncatedCells };
}

function parseBooleanCell(value, fallback = true) {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value !== 0;
  const s = clean(value).toUpperCase();
  if (s === 'TRUE' || s === '1') return true;
  if (s === 'FALSE' || s === '0') return false;
  return fallback;
}

// 카테고리 하나(doc+html)를 계산한다. 반환: { doc, html, jsonSource,
// jsonDetail } — doc/html이 undefined면 그 카테고리는 payload에서
// 아예 뺀다(기존 값 보존).
function buildCategoryFromXlsxRow(sectionKey, rawText, uploadedHtml, existingDoc, referenceRow) {
  let candidate;
  let html;
  let detail;

  if (uploadedHtml) {
    const result = importCell(sectionKey, uploadedHtml, referenceRow);
    if (result.classification === 'imported') {
      candidate = result.doc;
      html = uploadedHtml;
    } else {
      detail = `html→doc 임포트 실패(${result.classification}): ${result.reason || ''}`;
    }
  }

  if (candidate === undefined && rawText) {
    try {
      const generated = buildHwpCategoryDoc(sectionKey, rawText, referenceRow, referenceRow.university_name);
      const { ok, errors } = validateAdmissionDoc(generated);
      if (ok) {
        candidate = generated;
        html = renderDocToHtml(generated, sectionKey);
      } else {
        detail = `raw→doc 생성 실패: ${errors.join('; ')}`;
      }
    } catch (err) {
      detail = `raw→doc 예외: ${err.message}`;
    }
  }

  if (candidate === undefined) {
    return { doc: undefined, html: undefined, jsonSource: rawText || uploadedHtml ? 'failed' : 'empty', jsonDetail: detail };
  }

  const guard = shouldSkipForRegression(existingDoc, candidate);
  if (guard.skip) {
    return { doc: undefined, html: undefined, jsonSource: 'regressionSkipped', jsonDetail: guard.detail };
  }

  return { doc: candidate, html, jsonSource: uploadedHtml && html === uploadedHtml ? 'imported-from-html' : 'generated-from-raw' };
}

/**
 * xlsx workbook → payload 행 배열(그대로 upsert에 쓸 수 있는 형태) +
 * errors/warnings + 적용 전 미리보기용 summary.
 *
 * @param {import('xlsx').WorkBook} workbook
 * @param {Map<string, { id: unknown, [jsonKey: string]: unknown }>} existingRows
 *   `${admission_year}::${university_key}` 키. 값은 최소 id와 6개
 *   *_json(HWP_SECTION_JSON_KEYS 값)을 담아야 한다(회귀 가드 비교용).
 *   호출부가 DB에서 미리 조회해 넘긴다 — 이 lib은 DB를 안 만진다.
 * @returns {{
 *   rows: Array<Record<string, unknown>>,
 *   errors: Array<{ row: number, admissionYear: unknown, universityKey: unknown, reason: string }>,
 *   warnings: Array<{ row: number, admissionYear: unknown, universityKey: unknown, column?: string, reason: string }>,
 *   summary: { willInsert: number, willUpdate: number, willSkip: number, newYears: number[], newUniversityCount: number, truncatedCellSkipCount: number }
 * }}
 */
export function parseAdmissionRowsFromXlsx(workbook, existingRows) {
  const sheetName = workbook.SheetNames[0];
  const worksheet = sheetName ? workbook.Sheets[sheetName] : null;
  const errors = [];
  const warnings = [];
  const rows = [];
  let willInsert = 0;
  let willUpdate = 0;
  let willSkip = 0;
  let newUniversityCount = 0;
  // 잘림 마커 때문에 카테고리 하나만 스킵된 셀 수(행 자체는 정상 처리됨).
  // willSkip과 원인이 다르므로 섞지 않는다 — willSkip은 행 전체가 통째로
  // 안 쓰인 경우(errors와 1:1), 이건 행은 쓰였는데 그 안의 셀 하나만
  // 기존 값으로 보존된 경우다.
  let truncatedCellSkipCount = 0;
  const newYearsSet = new Set();

  if (!worksheet) {
    errors.push({ row: -1, admissionYear: null, universityKey: null, reason: '시트를 찾을 수 없습니다.' });
    return {
      rows,
      errors,
      warnings,
      summary: { willInsert, willUpdate, willSkip, newYears: [], newUniversityCount, truncatedCellSkipCount }
    };
  }

  // 연도별 관리: DB에 이미 존재하는 연도 집합(existingRows 키에서 추출) —
  // 이 집합에 없는 연도는 "신규 연도"로 간주해 그 연도 전체를 insert
  // 허용한다(경고 없이). 이미 아는 연도인데 university_key만 새로우면
  // "같은 연도의 신규 대학"으로 보고 경고를 남긴다(오타 방어).
  const knownYears = new Set();
  existingRows.forEach((_value, key) => {
    const year = key.split('::')[0];
    knownYears.add(year);
  });

  const grid = XLSX.utils.sheet_to_json(worksheet, { header: 1 });
  const bodyRows = grid.slice(1); // 헤더 1행 제외(순서 검증은 하지 않는다 — 컬럼 개수/순서는 항상 BULK_XLSX_COLUMNS로 취급)

  bodyRows.forEach((rawRow, rowIndex) => {
    // 완전히 빈 행(엑셀 트레일링 공백 등)은 조용히 건너뛴다 — 집계에도
    // 안 잡는다(관리자가 의도적으로 남긴 빈 행이 아니라 파일 잡음이다).
    if (!rawRow.some((cell) => cell !== undefined && cell !== null && String(cell).trim() !== '')) return;

    const rowObj = {};
    BULK_XLSX_COLUMNS.forEach((col, i) => {
      rowObj[col] = rawRow[i];
    });

    const admissionYear = Number(rowObj.admission_year);
    const universityKey = clean(rowObj.university_key);
    const universityName = clean(rowObj.university_name);

    // 잘림 마커 검사(메타데이터 컬럼만, 행 전체 거부) — 콘텐츠 카테고리
    // 6종의 잘림은 아래 CATEGORY_KEYS.forEach 안에서 컬럼 단위로 따로
    // 처리한다(행을 거부하지 않는다).
    const truncatedMetadataColumns = METADATA_COLUMNS_FOR_TRUNCATION_CHECK.filter(
      (col) => typeof rowObj[col] === 'string' && rowObj[col].includes(TRUNCATION_MARKER)
    );
    if (truncatedMetadataColumns.length) {
      errors.push({
        row: rowIndex,
        admissionYear: rowObj.admission_year,
        universityKey,
        reason: `잘림 마커가 있는 메타데이터 컬럼(${truncatedMetadataColumns.join(', ')})이 있어 행을 거부합니다(잘린 채로 반영하면 데이터가 손상됩니다).`
      });
      willSkip += 1;
      return;
    }

    if (!admissionYear || !universityKey) {
      errors.push({
        row: rowIndex,
        admissionYear: rowObj.admission_year,
        universityKey,
        reason: 'admission_year 또는 university_key가 비어 있습니다.'
      });
      willSkip += 1;
      return;
    }
    if (!universityName) {
      errors.push({ row: rowIndex, admissionYear, universityKey, reason: 'university_name이 비어 있습니다.' });
      willSkip += 1;
      return;
    }

    const matchKey = `${admissionYear}::${universityKey}`;
    const existing = existingRows.get(matchKey);
    const isInsert = !existing;

    if (isInsert) {
      willInsert += 1;
      if (!knownYears.has(String(admissionYear))) {
        newYearsSet.add(admissionYear);
      } else {
        newUniversityCount += 1;
        warnings.push({
          row: rowIndex,
          admissionYear,
          universityKey,
          reason: `신규 대학 추가(이미 있는 연도 ${admissionYear}에 새 university_key) — 오타가 아닌지 확인하세요.`
        });
      }
    } else {
      willUpdate += 1;
    }

    const payload = {
      admission_year: admissionYear,
      university_key: universityKey,
      university_name: universityName,
      region: clean(rowObj.region) || null,
      campus: clean(rowObj.campus) || null,
      source_name: clean(rowObj.source_name) || null,
      source_version: clean(rowObj.source_version) || null,
      jungsi_guideline_url: clean(rowObj.jungsi_guideline_url) || null,
      official_source_url: clean(rowObj.official_source_url) || null,
      memo: clean(rowObj.memo) || null,
      detail_status: clean(rowObj.detail_status) || null,
      matched_hwp_name: clean(rowObj.matched_hwp_name) || null,
      matched_text_name: clean(rowObj.matched_text_name) || null,
      is_active: parseBooleanCell(rowObj.is_active, true)
      // id: insert면 생략(uuid 자동생성), update면 아래서 채운다.
      // created_at/updated_at: 읽지도 쓰지도 않는다(DB가 관리).
    };
    if (!isInsert) payload.id = existing.id;

    const referenceRow = { university_name: universityName, detail_status: payload.detail_status };

    CATEGORY_KEYS.forEach((sectionKey) => {
      const xlsxHtmlColumn = CATEGORY_XLSX_HTML_COLUMN[sectionKey];
      const rawCellValue = rowObj[sectionKey];
      const htmlCellValue = xlsxHtmlColumn ? rowObj[xlsxHtmlColumn] : undefined;
      const rawTruncated = typeof rawCellValue === 'string' && rawCellValue.includes(TRUNCATION_MARKER);
      const htmlTruncated = typeof htmlCellValue === 'string' && htmlCellValue.includes(TRUNCATION_MARKER);

      // 잘림 마커가 있으면 이 카테고리는 raw/html/json 전부 payload에서
      // 뺀다(기존 DB 값 보존) — 잘린 원문으로 doc을 새로 만들려는 시도
      // 자체를 안 한다(회귀 가드와 겹쳐 적용될 일이 없다: 후보를 아예
      // 안 만드니 shouldSkipForRegression까지 갈 필요가 없다).
      if (rawTruncated || htmlTruncated) {
        truncatedCellSkipCount += 1;
        const truncatedCols = [rawTruncated ? sectionKey : null, htmlTruncated ? xlsxHtmlColumn : null].filter(Boolean);
        warnings.push({
          row: rowIndex,
          admissionYear,
          universityKey,
          column: sectionKey,
          reason: `잘림 마커가 있어 기존 값 보존(컬럼: ${truncatedCols.join(', ')})`
        });
        return;
      }

      const rawText = clean(rawCellValue);
      payload[sectionKey] = rawText || null;

      const uploadedHtml = xlsxHtmlColumn ? clean(htmlCellValue) : '';
      const dbHtmlColumn = HWP_SECTION_HTML_KEYS[sectionKey];
      const jsonColumn = HWP_SECTION_JSON_KEYS[sectionKey];
      const existingDoc = existing?.[jsonColumn];

      const { doc, html, jsonSource, jsonDetail } = buildCategoryFromXlsxRow(
        sectionKey,
        rawText,
        uploadedHtml,
        existingDoc,
        referenceRow
      );

      if (jsonSource === 'failed') {
        warnings.push({ row: rowIndex, admissionYear, universityKey, column: sectionKey, reason: jsonDetail });
      } else if (jsonSource === 'regressionSkipped') {
        warnings.push({
          row: rowIndex,
          admissionYear,
          universityKey,
          column: sectionKey,
          reason: `정보량 감소로 기존 값 보존: ${jsonDetail}`
        });
      }

      if (doc !== undefined) {
        payload[jsonColumn] = doc;
        payload[dbHtmlColumn] = html;
      }
    });

    rows.push(payload);
  });

  return {
    rows,
    errors,
    warnings,
    summary: {
      willInsert,
      willUpdate,
      willSkip,
      newYears: [...newYearsSet].sort((a, b) => a - b),
      newUniversityCount,
      truncatedCellSkipCount
    }
  };
}
