// =====================================================================
// 대입모집요강 일괄 엑셀 왕복(admission_university_resources 전체 행 ↔
// 23컬럼 포맷 — html 3종 제외, 2026-08-07 재설계).
//
// 이 파일은 순수 함수만 담는다. DB 접근·React/DOM 의존 없음 — 어드민
// 목록 페이지(safehtml 담당)가 이 함수들을 호출하고, DB 조회/쓰기는
// 호출부가 한다(이 lib은 "무엇을 쓸지"만 계산한다).
//
// 컬럼 순서(23개, 사용자가 준 원본 26컬럼 파일에서 html 3종만 뺐다 —
// 나머지 23개는 순서 그대로): id / admission_year / source_name /
// source_version / region / university_name / university_key / campus /
// previous_year_changes / selection_method / minimum_requirements /
// exam_schedule / school_record_method / recruitment_quota /
// jungsi_guideline_url / official_source_url / memo / detail_status /
// matched_hwp_name / is_active / created_at / updated_at / matched_text_name
//
// 2026-08-07 재설계 배경(사용자 지시): 원래 26컬럼 포맷엔 html 3종
// (recruitment_result_html/minimum_requirements_html/
// school_record_method_html)이 있었는데, 잘림(32,767자 초과)이 실측상
// 전부 이 3종에서만 났다(218행 중 23행, 다른 컬럼은 0건 — 17566df).
// html은 애초에 파생물(정본은 *_json, html은 미러이고 Stage 1~4로
// 폐기 예정)이라 엑셀 포맷에서 아예 뺐다 — 잘림 문제 자체가 없어진다
// (html 뺀 나머지 최대 셀 길이는 6,279자, 32,767 근처도 안 간다).
//
// 원본 포맷과 달라진 점: *_json 6종은 원본에도 없었다(업로드 시 doc은
// 항상 재생성 또는 보존, 아래 정책). 빈 컬럼(source_name/source_version/
// campus/jungsi_guideline_url/official_source_url/memo)은 지금 DB가
// 비어 있을 뿐 그대로 남긴다 — 관리자가 엑셀로 채울 수 있어야 한다.
//
// 매칭 키: (admission_year, university_key)다. id는 참고용으로만 읽고
// 매칭·payload 어디에도 쓰지 않는다(연도별 관리 도입, 2026-08-06 —
// 스키마에 이미 unique(admission_year, university_key) 제약이 있다).
//
// doc/html 재생성 정책(2026-08-07 재설계 — html-우선을 버리고 raw
// 비교를 1차 판정 기준으로 올렸다. html이 포맷에서 빠졌으니 "html 파싱
// 실패했을 때만 raw를 본다"는 예전 2차 방어로는 218행 전부가 매번
// raw 재생성을 타게 된다 — 그러면 안 된다):
//   1) 기존 doc이 있고, 업로드 raw == 기존 DB raw(관리자가 안 건드림)
//      → **아무것도 하지 않는다.** doc·html 둘 다 기존 값 그대로,
//      재생성 자체를 시도하지 않는다. 경고 불필요 — 안 고쳤으니 안
//      바뀌는 게 정상 동작이다.
//   2) 기존 doc이 있고, 업로드 raw != 기존 DB raw(의도적 수정) →
//      raw에서 buildHwpCategoryDoc으로 doc 재생성 + renderDocToHtml로
//      html 미러 재생성. shouldSkipForRegression(admissionDoc.js)으로
//      기존보다 정보량이 줄었는지 본다(회귀 가드는 그대로 적용) —
//      줄었으면 통째로 미기록 + warnings. 안 줄었으면 실제로 반영하고
//      **반드시 warnings를 남긴다**("원문 수정으로 문서를 다시
//      생성했습니다 — 표 구조가 단순해질 수 있습니다", raw 재생성은
//      표 구조 손실 위험이 있는 알려진 한계다 — `load-admission-
//      content.mjs` 사고와 같은 실패 모드를 warnings로 막는다).
//   3) 기존 doc이 없으면(신규 대학/연도, 또는 기존 행은 있으나 그
//      카테고리가 비어 있던 경우) → 비교 대상이 없으니 raw에서 그냥
//      생성한다. 경고 불필요.
//   4) raw도 없고 기존 doc도 없으면 그 카테고리는 payload에서 통째로
//      뺀다(json/html 둘 다, "delete=무해" 패턴).
// **"안 고친 카테고리는 절대 안 바뀐다"가 이 정책의 불변식이다.**
//
// 잘림 마커 방어(17566df, 2026-08-06)는 남겨뒀다 — 지금은 실측상 0건
// (html이 빠져서 잘릴 셀이 없다)이지만, 다른 컬럼이 나중에 32,767자를
// 넘을 가능성 자체를 막는 방어 로직이라 코드는 유지한다(검증 스크립트가
// 0건임을 계속 확인한다). 잘림 마커가 있는 카테고리(raw)는 그 카테고리
// 만 스킵하고(기존 DB 값 보존), 메타데이터 컬럼이 잘리면 행 전체를
// 거부한다(둘 다 기존과 동일한 동작, html 컬럼 대상만 빠졌다).
//
// 하위호환(2026-08-07): 옛 26컬럼 파일(html 포함)을 업로드해도 거부하지
// 않는다 — 헤더 행을 실제로 읽어 **컬럼 이름으로** 값을 찾는다(위치
// 고정 인덱스가 아니다). BULK_XLSX_COLUMNS에 없는 컬럼(옛 html 3종
// 포함)은 그냥 무시된다 — html을 읽어서 쓰지 않는다(위 정책에 html
// 자체가 없다). 이 방식은 컬럼이 없어도(구버전 필드 부재) 안전하고
// (undefined로 처리), 컬럼 순서가 달라도 안전하다.
//
// 빈 셀 → NOT NULL 컬럼 결함 수정(2026-08-10, team-lead 실측): 적용
// 단계(호출부의 upsert)가 "not-null constraint" 위반으로 죽는 결함이
// 있었다 — 우리가 내보낸 파일을 그대로 다시 올려도 실패했다(왕복이
// 안 닫혀 있었다). 원인은 이 파일이 빈 셀을 전부 `clean(x) || null`
// (즉 null)로 매핑했는데, admission_university_resources의
// source_name/source_version/region 3개는 NOT NULL이기 때문이다(id/
// admission_year/university_name/university_key/is_active/created_at/
// updated_at도 NOT NULL이지만 이 라이브러리가 아예 null로 쓰지 않거나
// —is_active는 parseBooleanCell이 fallback true— DB가 관리하거나(id/
// created_at/updated_at) 이미 별도로 필수값 검사를 하고 있어(university_
// name/university_key) 이 결함과 무관하다). sql/00_base_schema.sql
// 실측 기준 admission_university_resources의 NOT NULL 컬럼은 이
// 9개(id/admission_year/source_name/source_version/region/university_
// name/university_key/is_active/created_at/updated_at)가 전부다 —
// campus/jungsi_guideline_url/official_source_url/memo/detail_status/
// matched_hwp_name/matched_text_name과 6개 raw 카테고리 컬럼은 전부
// nullable이라 이 결함과 무관하다(빈 셀 → null이 그대로 맞다).
//
// 두 컬럼(source_name/source_version)과 region은 성격이 달라 처리를
// 나눴다(이 기능의 불변식 "안 고친 행은 절대 안 바뀐다"이 판단 기준):
//   - source_name/source_version: DB에 기본값이 있다(각각 '2027쎈
//     (SEN)진학 Preview'/'V.7월2일')지만, 실측상 dev DB의 218/218 행이
//     이미 빈 문자열('')이지 그 기본값이 아니다(초기 적재 시 기본값이
//     실제로 쓰인 적이 없다). 그래서 빈 셀 → ''(clean()의 반환값을
//     그대로 씀, `|| null` 제거)로 매핑한다 — 안 고친 행은 ''→''로
//     그대로 남고(왕복 폐쇄), clean()은 항상 문자열을 반환하므로 절대
//     null이 되지 않아 NOT NULL을 항상 만족한다.
//   - region: NOT NULL인데 DB 기본값이 없고(대학 리소스 행에서 지역은
//     의미 있는 기본값을 정할 수 없는 필드다), 실측상 dev DB의 218/218
//     행 전부 실제 지역명으로 채워져 있다(빈 값이 있었던 적이 없다).
//     그래서 university_name/university_key와 동급으로 취급한다 —
//     비어 있으면 신규든 기존이든 무조건 행을 거부한다(아래 필수값
//     검사). "빈 셀이면 기존 DB 값을 유지"하는 대체안도 검토했으나,
//     이 라이브러리는 순수 함수라 존재하지 않는 신규 행에는 유지할
//     기존 값 자체가 없고, 실측상 이 필드가 비어 있던 적이 한 번도
//     없어 거부해도 정상 업로드를 막지 않는다 — 가장 단순하고 안전한
//     선택이다.
//
// 같은 패턴이 하나 더 있었다: 6개 raw 카테고리 컬럼(previous_year_
// changes 등, CATEGORY_KEYS)도 `rawText || null`을 썼다 — nullable이라
// upsert가 죽지는 않지만, 실측(모집요강_수정본.xlsx 검증 중 발견)상
// dev DB에 raw가 이미 ''인 행이 11개 있어 안 고친 채 재업로드하면
// ''→null로 조용히 바뀌었다(불변식 위반, 아래 CATEGORY_KEYS.forEach
// 안에서 같이 고쳤다 — `|| null` 제거, `''` 유지).
// =====================================================================

import * as XLSX from "xlsx";
import type { AdmissionDoc } from "./admissionDoc.js";
import {
  HWP_SECTION_JSON_KEYS,
  shouldSkipForRegression,
  validateAdmissionDoc,
} from "./admissionDoc.js";
import {
  buildHwpCategoryDoc,
  clean,
  HWP_SECTION_HTML_KEYS,
  renderDocToHtml,
} from "./admissionParsing.js";

export const BULK_XLSX_COLUMNS = [
  "id",
  "admission_year",
  "source_name",
  "source_version",
  "region",
  "university_name",
  "university_key",
  "campus",
  "previous_year_changes",
  "selection_method",
  "minimum_requirements",
  "exam_schedule",
  "school_record_method",
  "recruitment_quota",
  "jungsi_guideline_url",
  "official_source_url",
  "memo",
  "detail_status",
  "matched_hwp_name",
  "is_active",
  "created_at",
  "updated_at",
  "matched_text_name",
];

// 6개 카테고리 → raw 컬럼명(1:1, BULK_XLSX_COLUMNS의 컬럼명과 동일하다).
const CATEGORY_KEYS = Object.keys(HWP_SECTION_JSON_KEYS);

// 메타데이터 컬럼(콘텐츠 카테고리 6종 제외) 중 잘림 마커를 검사할 대상.
// admission_year/university_key/id/is_active/created_at/updated_at은
// 짧은 식별자·불리언·타임스탬프라 잘릴 일이 사실상 없어 제외했다 —
// 애초에 매칭 키(연도/university_key)가 잘리면 행 자체가 무의미해져
// 아래 필수값 검사에서 걸러진다.
const METADATA_COLUMNS_FOR_TRUNCATION_CHECK = [
  "source_name",
  "source_version",
  "region",
  "university_name",
  "campus",
  "jungsi_guideline_url",
  "official_source_url",
  "memo",
  "detail_status",
  "matched_hwp_name",
  "matched_text_name",
];

// 엑셀 셀 문자 수 한도(SheetJS가 쓰기 시점에 이 값으로 throw한다 —
// src/components/admission/editor/xlsx/tableBlockXlsx.js에서 이미 실측
// 확인된 값과 동일하다. 그 파일을 import하지 않고 상수만 다시 적는다 —
// src/lib/이 src/components/에 의존하면 계층이 거꾸로 된다).
const MAX_XLSX_CELL_LENGTH = 32767;
export const TRUNCATION_MARKER =
  "…[셀 한도 초과로 잘림 — 이 셀을 그대로 업로드하면 데이터가 손상됩니다]";

function serializeExportCell(rawValue: unknown): string | number | boolean {
  if (rawValue === null || rawValue === undefined) return "";
  if (typeof rawValue === "boolean" || typeof rawValue === "number")
    return rawValue;
  return String(rawValue);
}

type TruncationLocation = { id: unknown; rowIndex: number; column: string };
type TruncatedCell = TruncationLocation & { originalLength: number };

function truncateIfNeeded(
  value: string | number | boolean,
  location: TruncationLocation,
  truncatedCells: TruncatedCell[],
): string | number | boolean {
  if (typeof value !== "string" || value.length <= MAX_XLSX_CELL_LENGTH)
    return value;
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
function forceStringCellTypes(worksheet: XLSX.WorkSheet): XLSX.WorkSheet {
  Object.keys(worksheet).forEach((address) => {
    if (address.startsWith("!")) return;
    const cell = worksheet[address];
    if (cell && typeof cell.v === "string") {
      cell.t = "s";
      delete cell.f; // 혹시라도 수식으로 잡혔으면(현재는 안 그렇다) 제거
    }
  });
  return worksheet;
}

/**
 * DB 행 배열(23컬럼 필드를 가진 객체) → xlsx workbook. 32,767자를 넘는
 * 셀은 조용히 자르지 않고, 잘린 자리에 TRUNCATION_MARKER를 남긴 뒤
 * truncatedCells에 기록한다(호출부가 경고를 띄울 수 있게). 모든 문자열
 * 셀은 명시적으로 's'(문자열) 타입으로 강제한다(formula injection 방어
 * — 위 주석 참고, 값 자체는 조금도 바뀌지 않아 왕복 무손실이다).
 */
export function exportAdmissionRowsToXlsx(rows: Record<string, unknown>[]): {
  workbook: XLSX.WorkBook;
  truncatedCells: TruncatedCell[];
} {
  const truncatedCells: TruncatedCell[] = [];
  const dataRows = rows.map((row, rowIndex) =>
    BULK_XLSX_COLUMNS.map((column) => {
      const serialized = serializeExportCell(row?.[column]);
      return truncateIfNeeded(
        serialized,
        { id: row?.id, rowIndex, column },
        truncatedCells,
      );
    }),
  );

  const worksheet = forceStringCellTypes(
    XLSX.utils.aoa_to_sheet([BULK_XLSX_COLUMNS, ...dataRows]),
  );
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, "모집요강");

  return { workbook, truncatedCells };
}

// warnings/errors 배열을 type별 건수로 접는다. UI가 목록을 접어도
// 종류별 건수는 항상 보여야 한다는 요구사항 때문에 summary에 넣는다
// — 개별 카운터 변수를 늘려가며 수동으로 세면 새 type을 추가할 때마다
// 카운터를 빼먹기 쉽다(이미 한 번 그런 패턴으로 필드를 여러 개 손으로
// 늘려간 적이 있다). 배열 자체가 진실의 원천이므로 여기서 한 번만 접는다.
function buildTypeCounts(items: { type?: string }[]): Record<string, number> {
  return items.reduce(
    (acc: Record<string, number>, item) => {
      const key = item.type || "unknown";
      acc[key] = (acc[key] || 0) + 1;
      return acc;
    },
    {} as Record<string, number>,
  );
}

function parseBooleanCell(value: unknown, fallback = true): boolean {
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value !== 0;
  const s = clean(value).toUpperCase();
  if (s === "TRUE" || s === "1") return true;
  if (s === "FALSE" || s === "0") return false;
  return fallback;
}

type JsonSource =
  | "rawUnchangedPreserved"
  | "failed"
  | "empty"
  | "regressionSkipped"
  | "rawChangedRegenerated"
  | "generated-from-raw";

type CategoryResult = {
  // buildCategoryFromXlsxRow의 각 반환 분기가 "이 카테고리는 없음/보존"을
  // 명시하려고 doc/html/jsonDetail에 undefined를 그대로 대입한다 —
  // exactOptionalPropertyTypes 하에서 undefined 명시 대입을 허용해야 한다.
  doc?: AdmissionDoc | undefined;
  html?: string | undefined;
  jsonSource: JsonSource;
  jsonDetail?: string | undefined;
};

// 카테고리 하나(doc+html)를 계산한다. 반환: { doc, html, jsonSource,
// jsonDetail } — doc/html이 undefined면 그 카테고리는 payload에서
// 아예 뺀다(기존 값 보존).
//
// raw 비교가 1차 판정 기준이다(2026-08-07 재설계, html 포맷 제외에 따른
// 후속 — html-우선 임포트를 버렸다):
//   - 기존 doc이 있고 업로드 raw == 기존 DB raw → 재생성 자체를 시도
//     하지 않고 기존 doc·html을 그대로 보존한다(jsonSource:
//     'rawUnchangedPreserved'). 정상 동작이라 경고를 만들지 않는다 —
//     안 고쳤으니 안 바뀌는 게 맞다(호출부도 이 jsonSource에는 warnings를
//     안 쌓는다).
//   - 기존 doc이 있고 업로드 raw != 기존 DB raw(의도적 수정) → raw에서
//     재생성하고(회귀 가드 통과 필요), 통과해 실제로 반영되면
//     'rawChangedRegenerated'로 표시해 호출부가 반드시 경고를 남기게
//     한다(raw 재생성은 표 구조가 단순해질 수 있는 알려진 한계다).
//   - 기존 doc이 없으면(신규 대학/연도, 또는 그 카테고리가 비어 있던
//     기존 행) 비교 대상이 없다 — raw에서 그냥 생성한다("generated-
//     from-raw", 경고 불필요).
function buildCategoryFromXlsxRow(
  sectionKey: string,
  rawText: string,
  existingDoc: AdmissionDoc | undefined,
  existingRawText: unknown,
  referenceRow: { university_name: string; detail_status: unknown },
): CategoryResult {
  if (existingDoc) {
    const rawUnchanged =
      clean(rawText) === clean((existingRawText as string) || "");
    if (rawUnchanged) {
      return {
        doc: undefined,
        html: undefined,
        jsonSource: "rawUnchangedPreserved",
      };
    }
  }

  let candidate: AdmissionDoc | undefined;
  let html: string | undefined;
  let detail: string | undefined;

  if (rawText) {
    try {
      const generated = buildHwpCategoryDoc(
        sectionKey,
        rawText,
        // admissionParsing.ts row 매개변수 오추론(별도 배치 소관, 손대지
        // 않음) — admissionGuidelinesForm.tsx와 같은 이유로 호출부 캐스팅.
        referenceRow as unknown as null,
        referenceRow.university_name,
      );
      const { ok, errors } = validateAdmissionDoc(generated);
      if (ok) {
        candidate = generated;
        html = renderDocToHtml(generated, sectionKey);
      } else {
        detail = `raw→doc 생성 실패: ${errors.join("; ")}`;
      }
    } catch (err) {
      detail = `raw→doc 예외: ${(err as Error).message}`;
    }
  }

  if (candidate === undefined) {
    return {
      doc: undefined,
      html: undefined,
      jsonSource: rawText ? "failed" : "empty",
      jsonDetail: detail,
    };
  }

  const guard = shouldSkipForRegression(existingDoc, candidate);
  if (guard.skip) {
    return {
      doc: undefined,
      html: undefined,
      jsonSource: "regressionSkipped",
      jsonDetail: guard.detail,
    };
  }

  return {
    doc: candidate,
    html,
    jsonSource: existingDoc ? "rawChangedRegenerated" : "generated-from-raw",
  };
}

type ErrorType =
  | "sheetNotFound"
  | "truncatedMetadata"
  | "missingRequiredFields"
  | "missingUniversityName";

type WarningType =
  | "newUniversity"
  | "truncated"
  | "importFailed"
  | "regressionSkipped"
  | "rawChangedRegenerated";

type ErrorEntry = {
  row: number;
  admissionYear: unknown;
  universityKey: unknown;
  reason: string;
  type: ErrorType;
};

type WarningEntry = {
  row: number;
  admissionYear: unknown;
  universityKey: unknown;
  column?: string;
  // buildCategoryFromXlsxRow의 jsonDetail(string | undefined)을 그대로
  // 옮기는 호출부가 있다 — exactOptionalPropertyTypes 하에서 undefined
  // 명시 대입을 허용해야 한다.
  reason?: string | undefined;
  type: WarningType;
};

// `${admission_year}::${university_key}` 키. 값은 최소 id, 6개
// *_json(HWP_SECTION_JSON_KEYS 값, 회귀 가드 비교용), 그리고 6개
// raw 카테고리 컬럼(CATEGORY_KEYS와 같은 이름)을 담아야 한다 — 컬럼
// 이름이 런타임 상수(HWP_SECTION_JSON_KEYS/CATEGORY_KEYS)에서 나와
// 타입 레벨로 개별 선언할 수 없어 단일 인덱스 시그니처로 표현한다.
type ExistingRow = { id: unknown; [key: string]: unknown };

/**
 * xlsx workbook → payload 행 배열(그대로 upsert에 쓸 수 있는 형태) +
 * errors/warnings + 적용 전 미리보기용 summary.
 *
 * @param existingRows `${admission_year}::${university_key}` 키. 값은
 *   최소 id, 6개 *_json(HWP_SECTION_JSON_KEYS 값, 회귀 가드 비교용),
 *   그리고 6개 raw 카테고리 컬럼(CATEGORY_KEYS와 같은 이름 —
 *   previous_year_changes/selection_method/minimum_requirements/
 *   exam_schedule/school_record_method/recruitment_quota, "업로드 raw가
 *   기존 DB raw와 같은가" 1차 판정 비교용)을 담아야 한다. 호출부가 DB에서
 *   미리 조회해 넘긴다 — 이 lib은 DB를 안 만진다.
 *
 * warnings/errors는 둘 다 `type`으로 종류를 구분한다(열거형 — UI는
 * `reason` 문자열을 파싱하지 말고 `type`으로 분기·집계해야 한다.
 * `reason`은 사람이 읽는 설명 전용이다). `summary.warningCounts`/
 * `errorCounts`는 각 배열을 `type`별로 센 것 — 목록을 접어도 건수는
 * 항상 보여야 하는 UI 요구사항 때문에 추가했다.
 *
 * 컬럼은 **이름으로** 찾는다(위치 고정 인덱스가 아니다) — 옛 26컬럼
 * 파일(html 3종 포함)을 업로드해도 거부하지 않고, BULK_XLSX_COLUMNS에
 * 있는 23개만 이름으로 찾아 읽는다. 나머지(옛 html 컬럼 등)는 그냥
 * 무시된다.
 */
export function parseAdmissionRowsFromXlsx(
  workbook: XLSX.WorkBook,
  existingRows: Map<string, ExistingRow>,
): {
  rows: Record<string, unknown>[];
  errors: ErrorEntry[];
  warnings: WarningEntry[];
  summary: {
    willInsert: number;
    willUpdate: number;
    willSkip: number;
    newYears: number[];
    newUniversityCount: number;
    truncatedCellSkipCount: number;
    warningCounts: Record<string, number>;
    errorCounts: Record<string, number>;
  };
} {
  const sheetName = workbook.SheetNames[0];
  const worksheet = sheetName ? workbook.Sheets[sheetName] : null;
  const errors: ErrorEntry[] = [];
  const warnings: WarningEntry[] = [];
  const rows: Record<string, unknown>[] = [];
  let willInsert = 0;
  let willUpdate = 0;
  let willSkip = 0;
  let newUniversityCount = 0;
  // 잘림 마커 때문에 카테고리 하나만 스킵된 셀 수(행 자체는 정상 처리됨).
  // willSkip과 원인이 다르므로 섞지 않는다 — willSkip은 행 전체가 통째로
  // 안 쓰인 경우(errors와 1:1), 이건 행은 쓰였는데 그 안의 셀 하나만
  // 기존 값으로 보존된 경우다. html이 포맷에서 빠져 지금은 실측상 0건
  // 이지만(가장 긴 콘텐츠 컬럼도 6,279자, 32,767 근처도 안 감), 다른
  // 컬럼이 나중에 한도를 넘을 수 있어 방어 로직 자체는 남겨뒀다.
  let truncatedCellSkipCount = 0;
  const newYearsSet = new Set<number>();

  if (!worksheet) {
    errors.push({
      row: -1,
      admissionYear: null,
      universityKey: null,
      type: "sheetNotFound",
      reason: "시트를 찾을 수 없습니다.",
    });
    return {
      rows,
      errors,
      warnings,
      summary: {
        willInsert,
        willUpdate,
        willSkip,
        newYears: [],
        newUniversityCount,
        truncatedCellSkipCount,
        warningCounts: buildTypeCounts(warnings),
        errorCounts: buildTypeCounts(errors),
      },
    };
  }

  // 연도별 관리: DB에 이미 존재하는 연도 집합(existingRows 키에서 추출) —
  // 이 집합에 없는 연도는 "신규 연도"로 간주해 그 연도 전체를 insert
  // 허용한다(경고 없이). 이미 아는 연도인데 university_key만 새로우면
  // "같은 연도의 신규 대학"으로 보고 경고를 남긴다(오타 방어).
  const knownYears = new Set<string>();
  existingRows.forEach((_value, key) => {
    // String.split은 구분자가 없어도 최소 1개 원소를 반환하므로 [0]은 항상 존재.
    const year = key.split("::")[0]!;
    knownYears.add(year);
  });

  const grid = XLSX.utils.sheet_to_json<unknown[]>(worksheet, { header: 1 });
  // 헤더 행을 실제로 읽어 컬럼 이름 → 인덱스 맵을 만든다(위치 고정
  // 인덱스가 아니다) — 옛 26컬럼 파일(html 3종 포함)이나 컬럼 순서가
  // 다른 파일이 와도 안전하다. BULK_XLSX_COLUMNS에 없는 컬럼(옛 html
  // 등)은 맵에는 들어가지만 아래에서 아예 조회하지 않아 자연히 무시된다.
  const headerRow = Array.isArray(grid[0]) ? grid[0] : [];
  const columnIndexByName = new Map<unknown, number>();
  headerRow.forEach((name, idx) => {
    const key = typeof name === "string" ? name.trim() : name;
    if (
      key !== undefined &&
      key !== null &&
      key !== "" &&
      !columnIndexByName.has(key)
    ) {
      columnIndexByName.set(key, idx);
    }
  });
  const bodyRows = grid.slice(1);

  bodyRows.forEach((rawRow, rowIndex) => {
    // 완전히 빈 행(엑셀 트레일링 공백 등)은 조용히 건너뛴다 — 집계에도
    // 안 잡는다(관리자가 의도적으로 남긴 빈 행이 아니라 파일 잡음이다).
    if (
      !rawRow.some(
        (cell) =>
          cell !== undefined && cell !== null && String(cell).trim() !== "",
      )
    )
      return;

    const rowObj: Record<string, unknown> = {};
    BULK_XLSX_COLUMNS.forEach((col) => {
      const idx = columnIndexByName.get(col);
      rowObj[col] = idx === undefined ? undefined : rawRow[idx];
    });

    const admissionYear = Number(rowObj.admission_year);
    const universityKey = clean(rowObj.university_key);
    const universityName = clean(rowObj.university_name);
    const region = clean(rowObj.region);

    // 잘림 마커 검사(메타데이터 컬럼만, 행 전체 거부) — 콘텐츠 카테고리
    // 6종의 잘림은 아래 CATEGORY_KEYS.forEach 안에서 컬럼 단위로 따로
    // 처리한다(행을 거부하지 않는다).
    const truncatedMetadataColumns =
      METADATA_COLUMNS_FOR_TRUNCATION_CHECK.filter(
        (col) =>
          typeof rowObj[col] === "string" &&
          (rowObj[col] as string).includes(TRUNCATION_MARKER),
      );
    if (truncatedMetadataColumns.length) {
      errors.push({
        row: rowIndex,
        admissionYear: rowObj.admission_year,
        universityKey,
        type: "truncatedMetadata",
        reason: `잘림 마커가 있는 메타데이터 컬럼(${truncatedMetadataColumns.join(", ")})이 있어 행을 거부합니다(잘린 채로 반영하면 데이터가 손상됩니다).`,
      });
      willSkip += 1;
      return;
    }

    // region은 위 파일 헤더 주석(2026-08-10)의 이유로 university_name/
    // university_key와 동급 필수값이다 — NOT NULL인데 DB 기본값이 없고,
    // 실측상 비어 있던 적이 없어 거부해도 정상 업로드를 막지 않는다.
    if (!admissionYear || !universityKey || !region) {
      const missing: string[] = [];
      if (!admissionYear) missing.push("admission_year");
      if (!universityKey) missing.push("university_key");
      if (!region) missing.push("region");
      errors.push({
        row: rowIndex,
        admissionYear: rowObj.admission_year,
        universityKey,
        type: "missingRequiredFields",
        reason: `${missing.join(", ")}가 비어 있습니다.`,
      });
      willSkip += 1;
      return;
    }
    if (!universityName) {
      errors.push({
        row: rowIndex,
        admissionYear,
        universityKey,
        type: "missingUniversityName",
        reason: "university_name이 비어 있습니다.",
      });
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
          type: "newUniversity",
          reason: `신규 대학 추가(이미 있는 연도 ${admissionYear}에 새 university_key) — 오타가 아닌지 확인하세요.`,
        });
      }
    } else {
      willUpdate += 1;
    }

    const payload: Record<string, unknown> = {
      admission_year: admissionYear,
      university_key: universityKey,
      university_name: universityName,
      // region은 위에서 이미 필수값 검사를 통과했으니(비어 있으면 행
      // 자체가 거부돼 여기 도달하지 않는다) clean()된 값을 그대로 쓴다.
      region,
      campus: clean(rowObj.campus) || null,
      // source_name/source_version: NOT NULL이지만 `|| null`을 쓰지
      // 않는다(위 파일 헤더 주석 2026-08-10 참고) — clean()은 항상
      // 문자열('' 포함)을 반환하므로 이 값을 그대로 쓰면 절대 null이
      // 되지 않아 제약을 항상 만족하고, 안 고친 행은 ''→''로 그대로
      // 남는다(실측상 dev DB 218/218 행이 이미 '').
      source_name: clean(rowObj.source_name),
      source_version: clean(rowObj.source_version),
      jungsi_guideline_url: clean(rowObj.jungsi_guideline_url) || null,
      official_source_url: clean(rowObj.official_source_url) || null,
      memo: clean(rowObj.memo) || null,
      detail_status: clean(rowObj.detail_status) || null,
      matched_hwp_name: clean(rowObj.matched_hwp_name) || null,
      matched_text_name: clean(rowObj.matched_text_name) || null,
      is_active: parseBooleanCell(rowObj.is_active, true),
      // id: insert면 생략(uuid 자동생성), update면 아래서 채운다.
      // created_at/updated_at: 읽지도 쓰지도 않는다(DB가 관리).
    };
    if (!isInsert) payload.id = existing.id;

    const referenceRow = {
      university_name: universityName,
      detail_status: payload.detail_status,
    };

    CATEGORY_KEYS.forEach((sectionKey) => {
      const rawCellValue = rowObj[sectionKey];
      const rawTruncated =
        typeof rawCellValue === "string" &&
        rawCellValue.includes(TRUNCATION_MARKER);

      // 잘림 마커가 있으면 이 카테고리는 raw/json/html 전부 payload에서
      // 뺀다(기존 DB 값 보존) — html이 포맷에서 빠져 지금은 실측상 0건
      // 이지만, 방어 로직 자체는 남겨뒀다(위 파일 헤더 주석 참고).
      if (rawTruncated) {
        truncatedCellSkipCount += 1;
        warnings.push({
          row: rowIndex,
          admissionYear,
          universityKey,
          column: sectionKey,
          type: "truncated",
          reason: `잘림 마커가 있어 기존 값 보존(컬럼: ${sectionKey})`,
        });
        return;
      }

      const rawText = clean(rawCellValue);
      // 이 6개 raw 카테고리 컬럼은 nullable이라 `''`든 `null`이든 upsert가
      // 죽지는 않지만, source_name/source_version과 같은 클래스의 문제가
      // 여기도 있었다(2026-08-10 실측: 모집요강_수정본.xlsx 검증 중
      // 발견 — dev DB에 raw가 이미 ''인 행 11개가 있는데, 안 고친 채로
      // 재업로드하면 `|| null`이 ''를 null로 바꿔 "안 고친 행은 안
      // 바뀐다" 불변식을 조용히 깼다. 코드베이스 전체에 이 컬럼을
      // `=== null`로 구분해 쓰는 곳이 없어(grep 확인) '' 유지가 안전
      // 하다 — 그대로 둔다).
      payload[sectionKey] = rawText;

      const dbHtmlColumn = HWP_SECTION_HTML_KEYS[sectionKey];
      const jsonColumn = HWP_SECTION_JSON_KEYS[sectionKey];
      const existingDoc = existing?.[jsonColumn] as AdmissionDoc | undefined;
      const existingRawText = existing?.[sectionKey];

      const { doc, html, jsonSource, jsonDetail } = buildCategoryFromXlsxRow(
        sectionKey,
        rawText,
        existingDoc,
        existingRawText,
        referenceRow,
      );

      if (jsonSource === "failed") {
        warnings.push({
          row: rowIndex,
          admissionYear,
          universityKey,
          column: sectionKey,
          type: "importFailed",
          reason: jsonDetail,
        });
      } else if (jsonSource === "regressionSkipped") {
        warnings.push({
          row: rowIndex,
          admissionYear,
          universityKey,
          column: sectionKey,
          type: "regressionSkipped",
          reason: `정보량 감소로 기존 값 보존: ${jsonDetail}`,
        });
      } else if (jsonSource === "rawChangedRegenerated") {
        warnings.push({
          row: rowIndex,
          admissionYear,
          universityKey,
          column: sectionKey,
          type: "rawChangedRegenerated",
          reason:
            "원문(raw)이 기존과 달라 문서를 다시 생성했습니다 — 표 구조가 단순해질 수 있습니다.",
        });
      }
      // 'rawUnchangedPreserved'는 경고를 만들지 않는다 — 안 고쳤으니
      // 안 바뀌는 정상 동작이다(위 buildCategoryFromXlsxRow 주석 참고).
      // 이 jsonSource는 warnings에 절대 등장하지 않으므로 type 열거형
      // 에도 넣지 않는다(죽은 값을 만들지 않는다 — team-lead 지적).

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
      truncatedCellSkipCount,
      warningCounts: buildTypeCounts(warnings),
      errorCounts: buildTypeCounts(errors),
    },
  };
}
