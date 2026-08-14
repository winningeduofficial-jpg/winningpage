// 대입모집요강 구조화 문서(AdmissionDoc) React 렌더러의 클래스/레이아웃 정본.
// variant → (스크롤 래퍼 className / table className / 컬럼별 셀 클래스 / 빈값 표기)
// 매핑을 여기 한 곳에 모은다 — 설계 문서 §5.3 DOM 동형성 계약 표를 그대로
// 데이터로 옮긴 것이며, 실측 근거는 src/lib/admissionParsing.js의 각 빌더다.
//
// 순수 데이터/함수만 둔다(JSX 없음) — 이 프로젝트의 vite/esbuild 설정은
// .jsx/.tsx만 JSX로 트랜스파일하고 .js는 트랜스파일하지 않는다.

// ── 표 variant → 스크롤 래퍼/테이블 className ──────────────────────────
// 실측: htmlTable()(exam/minimum/recordInfo/score/special 공용)이
// options.compact를 받아도 options.className이 함께 오면 className이 통째로
// 이긴다(admissionParsing.js:296 `const cls = options.className || ...`).
// 실제 호출부(score/recordInfo)는 항상 둘 다 넘기므로 compact는 현재
// 코드베이스에서 어떤 variant에도 실질 적용되지 않는다 — 이 렌더러도
// admission-table-compact를 붙이지 않는다(런타임 실측 우선, 설계 문서
// §5.3의 "[ admission-table-compact]" 표기는 이론상 가능성이지 실측이
// 아니다).
interface TableVariantLayout {
  scrollWrapClassName: string;
  tableClassName: string;
}

// generic 레이아웃은 폴백으로도 재사용하므로 별도 상수로 뽑아 둔다
// (Record 인덱스 접근이라 `TABLE_VARIANT_LAYOUT.generic`은 undefined 가능 타입이 된다).
const GENERIC_TABLE_VARIANT_LAYOUT: TableVariantLayout = {
  scrollWrapClassName: "admission-scroll-table",
  tableClassName: "admission-data-table",
};

export const TABLE_VARIANT_LAYOUT: Record<string, TableVariantLayout> = {
  selection: {
    scrollWrapClassName: "admission-scroll-table",
    tableClassName: "admission-data-table admission-selection-table",
  },
  change: {
    scrollWrapClassName: "admission-scroll-table admission-change-scroll-table",
    tableClassName:
      "admission-data-table admission-change-table admission-change-table-v87",
  },
  recruit: {
    scrollWrapClassName: "admission-scroll-table",
    tableClassName: "admission-data-table admission-recruit-table",
  },
  recruitExact: {
    scrollWrapClassName: "admission-scroll-table",
    tableClassName: "admission-data-table admission-normalized-recruit-table",
  },
  exam: {
    scrollWrapClassName: "admission-scroll-table",
    tableClassName: "admission-data-table admission-exam-table",
  },
  minimum: {
    scrollWrapClassName: "admission-scroll-table",
    tableClassName: "admission-data-table admission-minimum-table",
  },
  recordInfo: {
    scrollWrapClassName: "admission-scroll-table",
    tableClassName: "admission-data-table admission-record-info-table",
  },
  score: {
    scrollWrapClassName: "admission-scroll-table",
    tableClassName: "admission-data-table admission-score-table",
  },
  special: {
    scrollWrapClassName: "admission-scroll-table",
    tableClassName: "admission-data-table admission-special-table",
  },
  // 스키마 상 존재하나 현재 파서 어느 빌더도 만들지 않는 탈출구. 실측 근거 없음.
  generic: GENERIC_TABLE_VARIANT_LAYOUT,
};

export function getTableVariantLayout(variant?: string): TableVariantLayout {
  return (
    (variant && TABLE_VARIANT_LAYOUT[variant]) || GENERIC_TABLE_VARIANT_LAYOUT
  );
}

// ── selection 셀 클래스(admissionParsing.js:1194 buildSelectionMethodTable) ──
export const SELECTION_CELL_CLASS_BY_ROLE: Record<string, string> = {
  type: "selection-type-cell",
  name: "left selection-name-cell",
  seats: "selection-seat-cell",
  minimum: "selection-minimum-cell",
  method: "left selection-method-cell",
};

// selection 비-minimum 컬럼의 빈값은 muted span이 아니라 리터럴 '-'다.
export function selectionEmptyFallback(_role?: string): string {
  return "-";
}

// ── change 셀 클래스(admissionParsing.js:941 buildChangeTableHtml) ─────
export const CHANGE_CELL_CLASS_BY_ROLE: Record<string, string> = {
  no: "change-no-cell",
  title: "change-title-cell",
  content: "change-content-cell",
};

export const CHANGE_EMPTY_FALLBACK_BY_ROLE: Record<string, string> = {
  no: "-",
  title: "주요 변경",
  // content는 값이 없으면 muted span — TableBlockView/ChangeTable에서 별도 처리.
};

// ── recruit 고정 셀 클래스(admissionParsing.js:2261 buildRecruitmentHtml) ──
export const RECRUIT_FIXED_CELL_CLASS_BY_ROLE: Record<string, string> = {
  group: "left group-cell",
  unit: "left unit-cell",
};

// group/unit 빈값은 리터럴 '-'(escapeHtml(row.group || '-')).
export function recruitFixedEmptyFallback(): string {
  return "-";
}

// ── recruitExact 고정 컬럼 클래스(admissionParsing.js:553 normalizeRecruitmentExactHtml) ──
// 위치 기반이다(role이 아니라 fixedColumnCount로 판정) — legacy가
// `idx === 0 ? 'series-cell' : ''`로 오직 첫 컬럼만 구분하기 때문.
export function recruitExactFixedCellClassName(idx: number): string {
  return idx === 0 ? "left series-cell" : "left";
}

// ── generic(exam/minimum/recordInfo/score/special) 셀 클래스(htmlTable:294) ──
// idx 0·1에만 'left'.
export function isGenericLeftColumn(idx: number): boolean {
  return idx === 0 || idx === 1;
}

// ── 셀 종류 판정(표시·편집 공용 정본) ────────────────────────────────
// 어떤 (variant, role) 조합이 Cell의 3형태(문자열/{text,badge}/{chips}) 중
// 무엇을 쓰는지 판정한다. 표시와 편집이 이 조건을 각자 인라인으로 갖고 있던
// 시절이 있었으나(구 blocks/tables/SelectionTable.jsx의 `role === 'minimum'`,
// RecruitTable.jsx의 `role === 'group' || role === 'unit'`) 그 파일들은
// 삭제됐고, 지금은 table/tableModel.js:describeCell이 이 함수를 한 번 불러
// 표시(<td> className·셀 리프)와 편집(CellEditor 디스패치) 양쪽에 같은 값을
// 흘려보낸다. 즉 조건이 이 파일 한 곳에만 있으므로 "표시 쪽이 바뀌면 여기도
// 같이 고쳐라"는 수동 동기화 의무는 더 이상 없다.
// ⚠ 이 함수를 고치면 편집 UI뿐 아니라 공개 화면 마크업(Gate B, 실데이터
// 2506건)이 함께 움직인다. 그것이 단일 정본의 대가이자 안전장치다.
export type CellKind = "text" | "badge" | "chips";

export function getCellKind(variant?: string, role?: string): CellKind {
  if (variant === "selection" && role === "minimum") return "badge";
  if (variant === "recruit" && role !== "group" && role !== "unit")
    return "chips";
  return "text";
}

// ── variant별 알려진 role 목록(표 편집기 role 드롭다운 전용) ────────────
// DB 조회 권한이 없어(dev DB 직접 집계는 team-lead 소관) 실데이터 집계
// 대신 admissionParsing.js의 doc 생성기 코드를 읽어 실제로 만들어지는
// role 문자열을 그대로 옮겼다(추측이 아니라 생성기 소스 그대로) —
// 각 항목 옆에 생성기 함수/좌표를 남긴다. selection/change는 이미 있는
// SELECTION_CELL_CLASS_BY_ROLE/CHANGE_CELL_CLASS_BY_ROLE 키를 그대로
// 재사용해 값이 두 곳에서 어긋날 여지를 없앴다.
export const KNOWN_ROLES_BY_VARIANT: Record<string, string[]> = {
  selection: Object.keys(SELECTION_CELL_CLASS_BY_ROLE), // type,name,seats,minimum,method
  change: Object.keys(CHANGE_CELL_CLASS_BY_ROLE), // no,title,content
  // exam_schedule doc 생성기(admissionParsing.js:2493/3465): 전형/대상/일정.
  exam: ["type", "target", "schedule"],
  // minimum_requirements doc 생성기(:2520/3495): 전형/대상/반영 영역/최저/비고.
  minimum: ["type", "target", "areas", "minimum", "note"],
  // school_record_method(recordInfo) doc 생성기(:2548/3608): 구분/내용.
  recordInfo: ["type", "content"],
  // recruitment_quota(score 환산표) doc 생성기(:2564): 구분(type) + 등급별
  // 컬럼 전부 data. 헤더 라벨(과목명 등)은 매 대학·학년마다 달라지지만
  // role 자체는 이 2종으로 고정.
  score: ["type", "data"],
  // recruitment_quota(recruit, admission-recruit-table chips 계열) doc
  // 생성기(:2604-2608/3728-3732): group/unit + 값 컬럼은 전부 series.
  recruit: [...Object.keys(RECRUIT_FIXED_CELL_CLASS_BY_ROLE), "series"],
  // recruitment_quota(recruitExact, 2단 헤더) legacy 임포터(:3666-3668):
  // 고정 컬럼 idx0=series/그 외=unit, 데이터 컬럼은 전부 data.
  recruitExact: ["series", "unit", "data"],
  // 특수대학(경찰대/사관학교/과기원) SPECIAL_COLUMN_ROLE_MAP(:2655-2674) 값
  // 전체 + inferSpecialColumnRole 기본 폴백(data).
  special: [
    "type",
    "name",
    "seats",
    "method",
    "minimum",
    "note",
    "series",
    "content",
    "data",
  ],
  // 어느 생성기도 만들지 않는 탈출구 variant(admissionLayout.js 상단 주석
  // "실측 근거 없음") — 알려진 role이 없다.
  generic: [],
};

export function getKnownRolesForVariant(variant?: string): string[] {
  return (variant && KNOWN_ROLES_BY_VARIANT[variant]) || [];
}

// 새 컬럼의 기본 role. 목록 마지막 항목을 쓴다 — 위 목록은 구조/고정
// 역할을 앞에, "추가로 늘어나는" 역할(series/data 등)을 뒤에 두도록
// 의도적으로 정렬했다(예: recruit=[group,unit,series], score=[type,data]).
// 새로 추가하는 컬럼은 대개 그 "늘어나는" 종류이므로 마지막 항목이 합리적
// 기본값이다. 목록이 비어 있으면(generic) 빈 문자열 — 편집기가 곧바로
// "직접 입력" 경고 상태로 보여준다.
export function defaultNewColumnRole(variant?: string): string {
  const roles = getKnownRolesForVariant(variant);
  return roles.at(-1) ?? "";
}
