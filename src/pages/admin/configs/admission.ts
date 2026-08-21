import {
  HWP_SECTION_JSON_KEYS,
  type SectionKey,
  validateAdmissionDoc,
} from "@/lib/admissionDoc";
import { HWP_SECTION_LABELS, HWP_SECTION_ORDER } from "@/lib/admissionParsing";
import { blocksToPlainText } from "@/lib/blockToPlainText";
import type {
  AdminColumn,
  AdminConfig,
} from "@/pages/admin/shared/AdminEngine";
import {
  AdmissionParsingPreview,
  admissionGuidelinesValidate,
} from "./admissionGuidelinesForm";

// AdmissionGuidelines.jsx의 REGION_ORDER와 동일하게 유지한다.
// 여기 없는 지역 문자열을 입력하면 공개 페이지의 지역별 목록/지도에 노출되지 않는다.
const ADMISSION_REGION_OPTIONS = [
  "강원",
  "경기",
  "경남",
  "경북",
  "광주",
  "대구",
  "대전",
  "부산",
  "서울",
  "세종",
  "울산",
  "인천",
  "전남",
  "전북",
  "제주",
  "충남",
  "충북",
];

// 수시정시합격 페이지는 사이드바에 admissionSusiJungsi 하나만 노출하고, 그 안에서
// 서브탭으로 admission_posts/admission_acceptance_rates/admission_case_logos를 전환한다.
//
// "연도별 합격률" 탭은 숨김 처리한다(QA 리뷰, 2026-08-21) — 사이트 상단 합격률 숫자
// 노출을 껐고(AdmissionCases.tsx가 AcceptanceRateHero에 headlineOverride를 넘겨 숫자
// 대신 정적 문구를 쓴다) 정본 수치가 아직 확정되지 않았다. acceptanceRates config·
// admission_acceptance_rates 테이블·라우팅은 그대로 남긴다 — 정본 수치가 확정되면
// 아래 주석을 풀어 탭만 복원하면 된다.
const ADMISSION_CASES_TABS = [
  { key: "admissionSusiJungsi", label: "합격 사례" },
  // { key: "acceptanceRates", label: "연도별 합격률" },
  { key: "admissionCaseLogos", label: "대학 로고" },
];

// DB 저장값은 susi/jungsi 그대로 유지하고 화면 표기만 한글로 바꾼다.
const ADMISSION_CASE_CATEGORY_OPTIONS = [
  { value: "susi", label: "수시" },
  { value: "jungsi", label: "정시" },
];

// 특목고합격 — 사이드바에 specialHighschool 하나만 노출하고 그 안에서 서브탭으로 전환한다.
// 히어로 대학 로고는 수시정시합격과 같은 테이블(admission_case_logos)을 공유하므로
// 여기에 로고 탭을 만들지 않는다 — 같은 데이터의 편집 입구가 둘이 되면 드리프트가 난다.
//
// "연도별 합격률" 탭은 숨김 처리한다(QA 리뷰, 2026-08-21) — SpecialHighschoolCases.tsx가
// AcceptanceRateHero를 showRates=false·showLogos=false로 호출해 상단 숫자·로고 스트립
// 자체를 렌더하지 않는다. specialHighschoolRates config·테이블·라우팅은 그대로 남긴다 —
// 정본 수치가 확정되면 아래 주석을 풀어 탭만 복원하면 된다.
const SPECIAL_HIGHSCHOOL_TABS = [
  { key: "specialHighschool", label: "합격 사례" },
  // { key: "specialHighschoolRates", label: "연도별 합격률" },
];

// 공개 페이지 탭(전체/자사고/외고/국제고/영재고/과학고) 및 DB CHECK 제약과 동일하게 유지할 것.
const SPECIAL_HIGHSCHOOL_TYPE_OPTIONS = [
  { value: "자사고", label: "자사고" },
  { value: "외고", label: "외고" },
  { value: "국제고", label: "국제고" },
  { value: "영재고", label: "영재고" },
  { value: "과학고", label: "과학고" },
];

const SPECIAL_HIGHSCHOOL_LABEL_OPTIONS = [
  { value: "합격자", label: "합격자" },
  { value: "합격생", label: "합격생" },
];

export const admissionConfigs: Record<string, AdminConfig> = {
  specialHighschool: {
    title: "특목고 합격 사례",
    table: "special_highschool_cases",
    tabs: SPECIAL_HIGHSCHOOL_TABS,
    searchPlaceholder: "학교명 또는 학생명을 검색하세요",
    order: "sort_order",
    homepage: true,
    guideText: `특목고 합격 페이지의 합격 사례 카드입니다. 구분(자사고/외고/국제고/영재고/과학고)이 공개 페이지의 탭 필터와 그대로 연결되며, 여기 없는 구분은 선택할 수 없습니다. 학생명은 반드시 마스킹해 입력하세요(허용 문자: O, ○, *, 예: 홍O동) — 실명 노출은 개인정보 위반입니다. 출신 중학교는 있는 경우에만 입력하며, 비워 두면 카드에 표시되지 않습니다. 순서 숫자가 작을수록 앞에 나옵니다. 페이지 상단 합격률 숫자·대학 로고 줄은 현재 노출되지 않습니다(정본 수치 확정 전까지 꺼둔 상태).`,
    columns: [
      { key: "school_type", label: "구분" },
      { key: "school_name", label: "학교명" },
      { key: "year", label: "연도" },
      { key: "student_name", label: "학생명" },
      { key: "result_label", label: "표기" },
      { key: "middle_school", label: "출신 중학교" },
      { key: "sort_order", label: "순서" },
      { key: "is_active", label: "노출", type: "boolean" },
    ],
    fields: [
      {
        key: "is_active",
        label: "노출 여부",
        type: "radioBoolean",
        required: true,
      },
      {
        key: "school_type",
        label: "구분",
        type: "select",
        options: SPECIAL_HIGHSCHOOL_TYPE_OPTIONS,
        required: true,
        help: "공개 페이지 탭 필터와 연결됩니다",
      },
      {
        key: "school_name",
        label: "학교명",
        type: "text",
        required: true,
        help: "카드에 크게 표시되는 값입니다 (예: 광양제철고)",
      },
      {
        key: "year",
        label: "연도",
        type: "number",
        required: true,
        help: "고입 합격 연도 (예: 2022)",
      },
      {
        key: "student_name",
        label: "학생명",
        type: "text",
        required: true,
        help: "반드시 마스킹해 입력 (O, ○, * 중 하나 사용, 예: 홍O동)",
      },
      {
        key: "result_label",
        label: "표기",
        type: "select",
        options: SPECIAL_HIGHSCHOOL_LABEL_OPTIONS,
        required: true,
        help: `카드 문구가 'N년 고입 합격자/합격생'으로 바뀝니다`,
      },
      {
        key: "middle_school",
        label: "출신 중학교",
        type: "text",
        help: "있는 경우만 입력. 비우면 카드에 표시되지 않습니다",
      },
      { key: "sort_order", label: "순서", type: "number" },
    ],
    formToPayload: (form) => ({
      ...form,
      year: Number(form.year || 0),
      middle_school: String(form.middle_school || ""),
    }),
    validate: (form) => {
      const year = Number(form.year);
      if (!Number.isInteger(year) || year < 2000 || year > 2100) {
        return "연도는 2000~2100 사이 정수로 입력해 주세요.";
      }
      if (!/[O○*]/.test(String(form.student_name || ""))) {
        return "학생명은 개인정보 보호를 위해 마스킹해 입력해 주세요 (O, ○, * 중 하나 사용, 예: 홍O동).";
      }
      return "";
    },
    defaults: {
      is_active: true,
      school_type: "자사고",
      school_name: "",
      year: new Date().getFullYear(),
      student_name: "",
      result_label: "합격자",
      middle_school: "",
      sort_order: 1,
    },
  },

  specialHighschoolRates: {
    title: "연도별 합격률",
    table: "special_highschool_acceptance_rates",
    tabs: SPECIAL_HIGHSCHOOL_TABS,
    searchPlaceholder: "연도를 검색하세요",
    order: "sort_order",
    homepage: true,
    guideText: `특목고 합격 페이지 상단 '목표 특목고 합격률' 영역입니다. 노출 중인 연도의 개수가 'N개년 평균' 문구가 되고, 합격률 평균이 큰 숫자로 표시됩니다. 수시정시합격 페이지의 합격률과는 완전히 별개 데이터이며 서로 영향을 주지 않습니다. 합격률은 0~100 사이 숫자로 입력하며 소수점 한 자리까지 쓸 수 있습니다(예: 95.4). 연도는 중복 등록할 수 없습니다. 순서는 목록 정렬용이며 홈페이지 표시값에는 영향을 주지 않습니다.`,
    listSummaryKey: "acceptanceRateSummary",
    columns: [
      { key: "year", label: "연도" },
      { key: "rate", label: "합격률(%)" },
      { key: "sort_order", label: "순서" },
      { key: "is_active", label: "노출", type: "boolean" },
    ],
    fields: [
      {
        key: "is_active",
        label: "노출 여부",
        type: "radioBoolean",
        required: true,
      },
      {
        key: "year",
        label: "연도",
        type: "number",
        required: true,
        help: "예: 2025 (중복 등록 불가)",
      },
      {
        key: "rate",
        label: "합격률(%)",
        type: "text",
        required: true,
        help: "0~100 사이 숫자. 소수점 한 자리까지 입력 가능(예: 95.4)",
      },
      { key: "sort_order", label: "순서", type: "number" },
    ],
    rowToForm: (row) => ({
      ...row,
      rate: row.rate === null || row.rate === undefined ? "" : String(row.rate),
    }),
    formToPayload: (form) => ({
      ...form,
      year: Number(form.year || 0),
      rate: Number.parseFloat(form.rate),
    }),
    validate: (form) => {
      const year = Number(form.year);
      if (!Number.isInteger(year) || year < 2000 || year > 2100) {
        return "연도는 2000~2100 사이 정수로 입력해 주세요.";
      }
      const rate = Number.parseFloat(form.rate);
      if (!Number.isFinite(rate) || rate < 0 || rate > 100) {
        return "합격률은 0~100 사이 숫자로 입력해 주세요.";
      }
      return "";
    },
    defaults: {
      is_active: true,
      year: new Date().getFullYear(),
      rate: "",
      sort_order: 1,
    },
  },

  acceptanceRates: {
    title: "연도별 합격률",
    table: "admission_acceptance_rates",
    tabs: ADMISSION_CASES_TABS,
    searchPlaceholder: "연도를 검색하세요",
    order: "sort_order",
    homepage: true,
    guideText: `수시정시 합격사례 페이지 상단 '목표 대학 합격률' 영역입니다. 노출 중인 연도의 개수가 'N개년 평균' 문구가 되고, 합격률 평균이 큰 숫자로 표시됩니다. 합격률은 0~100 사이 숫자로 입력하며 소수점 한 자리까지 쓸 수 있습니다(예: 95.4). 연도는 중복 등록할 수 없습니다. 순서는 목록 정렬용이며 홈페이지 표시값에는 영향을 주지 않습니다.`,
    listSummaryKey: "acceptanceRateSummary",
    columns: [
      { key: "year", label: "연도" },
      { key: "rate", label: "합격률(%)" },
      { key: "sort_order", label: "순서" },
      { key: "is_active", label: "노출", type: "boolean" },
    ],
    fields: [
      {
        key: "is_active",
        label: "노출 여부",
        type: "radioBoolean",
        required: true,
      },
      {
        key: "year",
        label: "연도",
        type: "number",
        required: true,
        help: "예: 2025 (중복 등록 불가)",
      },
      {
        key: "rate",
        label: "합격률(%)",
        type: "text",
        required: true,
        help: "0~100 사이 숫자. 소수점 한 자리까지 입력 가능(예: 95.4)",
      },
      { key: "sort_order", label: "순서", type: "number" },
    ],
    rowToForm: (row) => ({
      ...row,
      rate: row.rate === null || row.rate === undefined ? "" : String(row.rate),
    }),
    formToPayload: (form) => ({
      ...form,
      year: Number(form.year || 0),
      rate: Number.parseFloat(form.rate),
    }),
    validate: (form) => {
      const year = Number(form.year);
      if (!Number.isInteger(year) || year < 2000 || year > 2100) {
        return "연도는 2000~2100 사이 정수로 입력해 주세요.";
      }
      const rate = Number.parseFloat(form.rate);
      if (!Number.isFinite(rate) || rate < 0 || rate > 100) {
        return "합격률은 0~100 사이 숫자로 입력해 주세요.";
      }
      return "";
    },
    defaults: {
      is_active: true,
      year: new Date().getFullYear(),
      rate: "",
      sort_order: 1,
    },
  },

  admissionCaseLogos: {
    title: "대학 로고",
    table: "admission_case_logos",
    tabs: ADMISSION_CASES_TABS,
    searchPlaceholder: "대학명을 검색하세요",
    order: "sort_order",
    homepage: true,
    guideText: `수시정시 합격사례 페이지 상단 합격률 아래 대학 로고 줄입니다. 표시 줄에서 지정한 대로 1행/2행에 배치되며, 시안은 1행 7개·2행 5개 구성입니다. 로고는 여백 없이 딱 맞게 크롭한 PNG(투명 배경) / 1MB 이하로 올려 주세요 — 이미지에 여백이 포함되면 다른 로고보다 작아 보입니다. 표시 높이는 로고마다 달라야 자연스럽습니다(시안 기준 1.1~2.4). 너비는 원본 비율에 맞춰 자동 계산됩니다. 투명도는 1이 기본이며 시안에서는 KAIST·UNIST 0.7, 한국외대 0.8을 씁니다. 기본 제공(폴백) 로고는 없습니다 — 여기서 한 건도 등록하지 않으면 로고 줄 자체가 표시되지 않으므로, 노출하려면 12종을 모두 등록해 주세요.`,
    columns: [
      { key: "logo_url", label: "로고", type: "image" },
      { key: "name", label: "대학명" },
      { key: "display_height_rem", label: "표시 높이(rem)" },
      { key: "opacity", label: "투명도" },
      { key: "row_no", label: "표시 줄" },
      { key: "sort_order", label: "순서" },
      { key: "is_active", label: "노출", type: "boolean" },
    ],
    fields: [
      {
        key: "is_active",
        label: "노출 여부",
        type: "radioBoolean",
        required: true,
      },
      {
        key: "name",
        label: "대학명",
        type: "text",
        required: true,
        help: "대체 텍스트로도 쓰입니다",
      },
      {
        key: "logo_url",
        label: "로고 이미지",
        type: "image",
        required: true,
        hideUrlInput: true,
        compress: true,
        help: "여백 없이 크롭한 PNG(투명 배경) / 1MB 이하",
        imageSpec: { maxMB: 1 },
        folder: "admission/university-logos",
        cacheControl: "31536000, immutable",
      },
      {
        key: "display_height_rem",
        label: "표시 높이(rem)",
        type: "text",
        required: true,
        help: "시안 기준 1.1~2.4. 소수점 세 자리까지 입력 가능(예: 1.858)",
      },
      {
        key: "opacity",
        label: "투명도",
        type: "text",
        required: true,
        help: "0 초과 1 이하. 기본 1, 감광 로고는 0.7 또는 0.8",
      },
      {
        key: "row_no",
        label: "표시 줄",
        type: "select",
        required: true,
        options: [
          { value: "1", label: "1행" },
          { value: "2", label: "2행" },
        ],
        help: "시안은 1행 7개 · 2행 5개 구성입니다",
      },
      { key: "sort_order", label: "순서", type: "number" },
    ],
    rowToForm: (row) => ({
      ...row,
      display_height_rem:
        row.display_height_rem === null || row.display_height_rem === undefined
          ? ""
          : String(row.display_height_rem),
      opacity:
        row.opacity === null || row.opacity === undefined
          ? ""
          : String(row.opacity),
      row_no:
        row.row_no === null || row.row_no === undefined
          ? "1"
          : String(row.row_no),
    }),
    formToPayload: (form) => ({
      ...form,
      display_height_rem: Number.parseFloat(form.display_height_rem),
      opacity: Number.parseFloat(form.opacity),
      row_no: Number.parseInt(form.row_no, 10),
    }),
    validate: (form) => {
      const height = Number.parseFloat(form.display_height_rem);
      if (!Number.isFinite(height) || height <= 0 || height > 10) {
        return "표시 높이는 0 초과 10 이하 숫자(rem)로 입력해 주세요.";
      }
      const opacity = Number.parseFloat(form.opacity);
      if (!Number.isFinite(opacity) || opacity <= 0 || opacity > 1) {
        return "투명도는 0 초과 1 이하 숫자로 입력해 주세요.";
      }
      const rowNo = Number.parseInt(form.row_no, 10);
      if (rowNo !== 1 && rowNo !== 2) {
        return "표시 줄은 1행 또는 2행 중에서 선택해 주세요.";
      }
      return "";
    },
    defaults: {
      is_active: true,
      name: "",
      logo_url: "",
      display_height_rem: "2",
      opacity: "1",
      row_no: "1",
      sort_order: 1,
    },
  },

  admissionGuidelines: {
    title: "대학별 모집요강",
    table: "admission_university_resources",
    searchPlaceholder: "대학명, 지역, 전형 내용을 검색하세요",
    order: "university_name",
    homepage: true,
    // config.excel(공용 CSV 다운로드 스위치) 없음(의도) — 6컬럼(admission_year/
    // region/university_name/matched_hwp_name/detail_status/is_active,
    // 전부 ADMISSION_GUIDELINE_BULK_XLSX_COLUMNS에 포함돼 있어 기능 후퇴 없음) 대신
    // AdmissionBulkXlsxPanel의 23컬럼 xlsx로 통일한다(2026-08-07 사용자
    // 지시 — "엑셀 다운로드 버튼이 여러 개다, 우리가 개발한 걸로
    // 통일해라"). 이 플래그는 14개 메뉴가 공유하는 공용 렌더 코드
    // (:5900 부근)를 켜는 스위치라 여기서만 뺐다 — 다른 config·공용
    // 코드는 손대지 않았다.
    guideText: `대학별 수시 모집요강 상세정보 관리입니다. HTML 표 형식으로 입력하면 홈페이지에서 표 형태로 표시됩니다.`,
    listSummaryKey: "admissionListSummary",

    // 목록 '관리' 열의 행 수정(✏️) 버튼을 이 메뉴에서만 숨긴다.
    // 사용자 지시(2026-08-07): "이제 '디테일한 수정'은 필요없어. 여기서
    // 수정버튼을 삭제해줘." — 카테고리 6칸이 각각 [수정] 1클릭으로 편집
    // 다이얼로그를 여는 구조가 되면서 행 전체 폼은 중복 진입점이 됐다.
    //
    // ⚠ 이 플래그를 다른 config 로 복사하지 마라. AdminTable 의 ✏️ 한 줄을
    // 35개 메뉴가 공유하고, settlements 는 같은 버튼을 👁 상세보기로 쓴다.
    // (AdminEngine.admissionEntry.test.tsx(옛 scripts/verify-admission-admin-entry.mjs)
    //  의 entry:5 가 configs/ 전체에서 hideRowEdit 이 정확히 1회만
    //  등장하는지 락을 건다.)
    //
    // 🔴 이 플래그로 잃는 것(사용자 고지 완료): 기존 행의 메타 9필드
    // (노출 여부·입학연도·지역·대학명·대학 키값·원문 대학명·정시 URL·메모·
    // 상태)와 HWP 원문 붙여넣기 파싱 패널이 폼에만 있어, 이미 등록된 행에
    // 대해서는 AdmissionBulkXlsxPanel 엑셀 왕복이 유일한 수정 경로가 된다.
    // [등록] 신규 폼은 별도 진입점(:6157 부근)이라 그대로 살아 있다.
    hideRowEdit: true,

    // ✏️(행 전체 폼)를 대신할 메타 전용 경량 진입점(⚙️). 사용자 지시
    // (2026-08-08): "아직도 '수정'이 너무 복잡해보여서. 메타만 수정하는거로
    // 하자. HWP 원문 붙여넣기 파싱은 필요없어." AdminTable의 관리 열
    // 렌더 조건 1개를 이 config에만 추가한다 — hideRowEdit과 같은
    // "공용 렌더 + config 스위치" 패턴, 다른 35개 메뉴는 이 플래그를 안 쓴다.
    showMetaEdit: true,

    // 목록 표를 공개 서비스 표와 같은 모양으로 만든다(2026-08-07 사용자 지시
    // "서비스 모달 구조를 그대로 따라가라", 직전 피드백 "아직도 2뎁스잖아").
    // 공개는 목록 셀 [보기] 1클릭이면 표가 든 다이얼로그가 열린다. 어드민도
    // 셀 [수정] 1클릭으로 같은 껍데기의 편집 다이얼로그가 열리게 한다.
    // 라벨은 공개 INFO_SECTIONS(AdmissionGuidelines.jsx)와 문자 그대로 동일.
    //
    // type:'admissionSection'은 AdminTable 셀 스위치에 **가산된 분기 1개**다.
    // AdminTable은 36개 config가 공유하므로, 기존 분기를 고치지 않고 새 type을
    // 더하는 방식만 안전하다(다른 35개 config는 이 type을 쓰지 않는다).
    columns: [
      { key: "admission_year", label: "연도" },
      { key: "region", label: "지역" },
      // type:'universityNameMeta' — 대학명 셀을 메타 수정 다이얼로그 진입점으로
      // 만든다. admissionSection과 같은 방식의 **가산된 분기 1개**이고, 이
      // type을 선언하는 config는 여기 하나뿐이라 나머지 35개 메뉴는 기존
      // 폴백(formatValue) 그대로다.
      { key: "university_name", label: "대학명", type: "universityNameMeta" },
      { key: "matched_hwp_name", label: "원문 대학명" },
      { key: "detail_status", label: "상태" },
      { key: "is_active", label: "노출", type: "boolean" },
      // HWP_SECTION_ORDER는 admissionParsing.ts(다른 배치 소유, 미변환 스타일)가
      // 내보내는 string[]이라 리터럴 유니온으로 좁혀져 있지 않다 — 실제 값은
      // admissionDoc.ts의 SectionKey 6종 그대로라는 게 두 파일의 계약이라 캐스팅한다.
      ...(HWP_SECTION_ORDER as SectionKey[]).map(
        (key): AdminColumn => ({
          key: `__section_${key}`,
          label: HWP_SECTION_LABELS[key],
          type: "admissionSection",
          sectionKey: key,
        }),
      ),
    ],

    fields: [
      {
        key: "is_active",
        label: "노출 여부",
        type: "radioBoolean",
        required: true,
      },

      {
        key: "admission_year",
        label: "입학연도",
        type: "number",
        required: true,
      },
      { key: "region", label: "지역", type: "text", required: true },
      { key: "university_name", label: "대학명", type: "text", required: true },
      {
        key: "university_key",
        label: "대학 키값",
        type: "text",
        required: true,
      },
      { key: "matched_hwp_name", label: "원문 대학명", type: "text" },

      {
        key: "previous_year_changes_json",
        label:
          "전년도와 차이점(수시) 문서(정본 — 공개 페이지가 이 문서를 읽습니다)",
        type: "admissionDoc",
        sectionKey: "previous_year_changes",
        group: "previous_year_changes",
      },
      {
        key: "previous_year_changes",
        label: "전년도와 차이점(수시) 원문(raw)",
        help: '공개 페이지는 위 "문서"(정본)를 읽습니다. 원문만 고치면 화면이 바뀌지 않으니, 고친 뒤 우측 "HWP 원문 파싱 · 미리보기"에서 파싱을 다시 실행해 문서와 HTML 미러를 함께 갱신하세요.',
        type: "textarea",
        rows: 8,
        group: "previous_year_changes",
      },
      {
        key: "previous_year_changes_html",
        label: "전년도와 차이점(수시) HTML(미러, 편집 불가)",
        help: "문서(위)를 편집하면 자동으로 다시 생성됩니다. 이 필드를 직접 고칠 수 없습니다.",
        type: "textarea",
        rows: 8,
        readOnly: true,
        group: "previous_year_changes",
      },
      {
        key: "selection_method_json",
        label: "전형방법 문서(정본 — 공개 페이지가 이 문서를 읽습니다)",
        type: "admissionDoc",
        sectionKey: "selection_method",
        group: "selection_method",
      },
      {
        key: "selection_method",
        label: "전형방법 원문(raw)",
        help: '공개 페이지는 위 "문서"(정본)를 읽습니다.',
        type: "textarea",
        rows: 12,
        group: "selection_method",
      },
      {
        key: "selection_method_html",
        label: "전형방법 HTML(미러, 편집 불가)",
        help: "문서(위)를 편집하면 자동으로 다시 생성됩니다. 이 필드를 직접 고칠 수 없습니다.",
        type: "textarea",
        rows: 12,
        readOnly: true,
        group: "selection_method",
      },
      {
        key: "minimum_requirements_json",
        label: "최저학력기준 문서(정본 — 공개 페이지가 이 문서를 읽습니다)",
        type: "admissionDoc",
        sectionKey: "minimum_requirements",
        group: "minimum_requirements",
      },
      {
        key: "minimum_requirements",
        label: "최저학력기준 원문(raw)",
        help: '공개 페이지는 위 "문서"(정본)를 읽습니다.',
        type: "textarea",
        rows: 12,
        group: "minimum_requirements",
      },
      {
        key: "minimum_requirements_html",
        label: "최저학력기준 HTML(미러, 편집 불가)",
        help: "문서(위)를 편집하면 자동으로 다시 생성됩니다. 이 필드를 직접 고칠 수 없습니다.",
        type: "textarea",
        rows: 12,
        readOnly: true,
        group: "minimum_requirements",
      },
      {
        key: "exam_schedule_json",
        label: "대학별고사일 문서(정본 — 공개 페이지가 이 문서를 읽습니다)",
        type: "admissionDoc",
        sectionKey: "exam_schedule",
        group: "exam_schedule",
      },
      {
        key: "exam_schedule",
        label: "대학별고사일 원문(raw)",
        help: '공개 페이지는 위 "문서"(정본)를 읽습니다.',
        type: "textarea",
        rows: 10,
        group: "exam_schedule",
      },
      {
        key: "exam_schedule_html",
        label: "대학별고사일 HTML(미러, 편집 불가)",
        help: "문서(위)를 편집하면 자동으로 다시 생성됩니다. 이 필드를 직접 고칠 수 없습니다.",
        type: "textarea",
        rows: 10,
        readOnly: true,
        group: "exam_schedule",
      },
      {
        key: "school_record_method_json",
        label: "학생부반영방법 문서(정본 — 공개 페이지가 이 문서를 읽습니다)",
        type: "admissionDoc",
        sectionKey: "school_record_method",
        group: "school_record_method",
      },
      {
        key: "school_record_method",
        label: "학생부반영방법 원문(raw)",
        help: '공개 페이지는 위 "문서"(정본)를 읽습니다.',
        type: "textarea",
        rows: 14,
        group: "school_record_method",
      },
      {
        key: "school_record_method_html",
        label: "학생부반영방법 HTML(미러, 편집 불가)",
        help: "문서(위)를 편집하면 자동으로 다시 생성됩니다. 이 필드를 직접 고칠 수 없습니다.",
        type: "textarea",
        rows: 14,
        readOnly: true,
        group: "school_record_method",
      },
      {
        key: "recruitment_quota_json",
        label: "모집인원 및 입결 문서(정본 — 공개 페이지가 이 문서를 읽습니다)",
        type: "admissionDoc",
        sectionKey: "recruitment_quota",
        group: "recruitment_quota",
      },
      {
        key: "recruitment_quota",
        label: "모집인원 및 입결 원문(raw)",
        help: '공개 페이지는 위 "문서"(정본)를 읽습니다.',
        type: "textarea",
        rows: 12,
        group: "recruitment_quota",
      },
      {
        key: "recruitment_result_html",
        label: "모집인원 및 입결 HTML(미러, 편집 불가)",
        help: "문서(위)를 편집하면 자동으로 다시 생성됩니다. 이 필드를 직접 고칠 수 없습니다.",
        type: "textarea",
        rows: 18,
        readOnly: true,
        group: "recruitment_quota",
      },
      {
        key: "jungsi_guideline_url",
        label: "정시모집요강 URL",
        type: "text",
      },
      {
        // 공개 목록에서 대학명을 눌렀을 때 가는 곳. 위 정시모집요강 URL과는
        // 다른 컬럼이다. hideRowEdit라 이 폼은 신규 등록에서만 열리지만,
        // 여기 없으면 새로 만든 행이 링크 없이 태어난다.
        key: "official_source_url",
        label: "대학명 링크 URL",
        type: "text",
      },
      {
        key: "memo",
        label: "메모",
        type: "textarea",
        rows: 5,
      },
      {
        key: "detail_status",
        label: "상태",
        type: "select",
        options: ["상세입력완료", "재가공필요", "HWP상세페이지미확인"],
      },
    ],

    defaults: {
      is_active: true,
      admission_year: 2027,
      region: "",
      university_name: "",
      university_key: "",
      matched_hwp_name: "",
      previous_year_changes: "",
      previous_year_changes_html: "",
      // *_json 6종은 jsonb 컬럼이다 — 빈 문자열('')은 타입 에러를 낸다.
      // sql/43 적용 전에는 컬럼 자체가 없어 select에 안 잡히지만, 적용 후
      // 신규 행을 만들 때(AdminForm이 row 없이 defaults만 스프레드하는
      // 경로) 여기 없으면 undefined가 payload에 실려 upsert가 컬럼을
      // 아예 건드리지 않게 되므로, 명시적으로 null을 채워둔다.
      previous_year_changes_json: null,
      selection_method: "",
      selection_method_html: "",
      selection_method_json: null,
      minimum_requirements: "",
      minimum_requirements_html: "",
      minimum_requirements_json: null,
      exam_schedule: "",
      exam_schedule_html: "",
      exam_schedule_json: null,
      school_record_method: "",
      school_record_method_html: "",
      school_record_method_json: null,
      recruitment_quota: "",
      recruitment_result_html: "",
      recruitment_quota_json: null,
      jungsi_guideline_url: "",
      official_source_url: "",
      memo: "",
      detail_status: "상세입력완료",
    },

    // jsonb(*_json) 컬럼 방어. AdminForm 초기값이 {...row}, 저장 payload가
    // {...form}인 일반 경로를 그대로 쓰면, jsonb 컬럼 값(객체)이 form에
    // 그대로 실렸다가 textarea 등 문자열 전제 필드로 렌더될 경우
    // [object Object]로 깨진 채 저장돼 원본 jsonb를 파괴할 수 있다.
    // *_json 필드는 이제 type:'admissionDoc'(AdmissionDocFieldEditor)
    // 전용 렌더러를 쓰므로 그 사고 경로 자체는 없지만, rowToForm/
    // formToPayload는 여전히 객체 형태 유지·저장 시 재검증의 유일한
    // 관문이라 그대로 둔다.
    rowToForm: (row) => {
      const form = { ...row };
      Object.values(HWP_SECTION_JSON_KEYS).forEach((jsonKey) => {
        // jsonb는 객체 그대로 보관한다(문자열화 금지). 컬럼이 아직 없으면
        // (sql/43 적용 전) row[jsonKey]가 undefined이므로 null로 채운다.
        form[jsonKey] = row?.[jsonKey] ?? null;
      });
      return form;
    },
    formToPayload: (form) => {
      const payload = { ...form };
      Object.values(HWP_SECTION_JSON_KEYS).forEach((jsonKey) => {
        const doc = form[jsonKey];
        // doc이 없거나(null/undefined — sql/43 적용 전에는 rowToForm/defaults가
        // 항상 null을 채우므로 이 분기가 사실상 전부다) validate 실패 시
        // payload에서 아예 제외한다. 이 컬럼을 건드리지 않겠다는 뜻이지,
        // null로 명시 저장하겠다는 뜻이 아니다 — 컬럼이 없는 동안(sql/43
        // 적용 전) 여기서 항상 delete로 빠지므로 payload가 기존과 완전히
        // 동일해진다(무해함의 근거). 존재하는 DB 값을 지우지도 않는다.
        if (
          doc === null ||
          doc === undefined ||
          !validateAdmissionDoc(doc).ok
        ) {
          delete payload[jsonKey];
          return;
        }
        payload[jsonKey] = doc;
      });
      return payload;
    },

    validate: admissionGuidelinesValidate,

    FormPreview: AdmissionParsingPreview,
  },

  admissionUniversities: {
    title: "대학 목록 관리",
    table: "admission_universities",
    searchPlaceholder: "대학명 또는 지역을 검색하세요",
    order: "sort_order",
    homepage: true,
    guideText: `대학별 모집요강 화면(지역별 대학 목록/지도)에 노출되는 대학 마스터입니다. 일반 대학은 특별군을 비워두고, 경찰대·과학기술원·사관학교만 해당 특별군을 지정하세요.`,

    columns: [
      { key: "region", label: "지역" },
      { key: "name", label: "대학명" },
      { key: "special_group", label: "특별군" },
      { key: "sort_order", label: "순서" },
      { key: "is_active", label: "노출", type: "boolean" },
    ],

    fields: [
      {
        key: "is_active",
        label: "노출 여부",
        type: "radioBoolean",
        required: true,
      },
      {
        key: "region",
        label: "지역",
        type: "select",
        options: ADMISSION_REGION_OPTIONS,
        required: true,
      },
      { key: "name", label: "대학명", type: "text", required: true },
      {
        key: "special_group",
        label: "특별군",
        type: "select",
        help: "일반 대학은 비워두세요(선택 안 함). 특별전형 대학군만 지정합니다.",
        options: [
          { value: "police", label: "경찰대" },
          { value: "science", label: "과학기술원" },
          { value: "academy", label: "사관학교" },
        ],
      },
      { key: "sort_order", label: "순서", type: "number" },
    ],

    defaults: {
      is_active: true,
      region: "",
      name: "",
      special_group: "",
      sort_order: 0,
    },
  },

  admissionResults: {
    title: "입결정보",
    table: "admission_results",
    searchPlaceholder: "대학명, 모집단위, 전형명을 검색하세요",
    order: "result_year",
    // 서버 정렬 축을 sql/53의 admission_results_admin_order_idx(result_year desc, id desc)와
    // 맞춘다. id 동점 처리축이 없으면 .range()로 끊어 읽을 때 페이지 경계에서 행이
    // 중복·누락된다(같은 result_year 43k행 안에서 정렬 순서가 매 요청 달라질 수 있다).
    orderBy: [
      ["result_year", false],
      ["id", false],
    ],
    // 43,170행 테이블 — 전량 클라이언트 로드가 불가능해 서버 페이지네이션으로 돌린다.
    // rowCapWarning(1,000행 상한 경고)은 일부러 켜지 않는다: .range()로 PAGE_SIZE행만
    // 받으므로 PostgREST 기본 상한에 닿을 일이 없고, 총 건수는 count로 따로 받는다.
    serverPaginate: true,
    // 서버 ilike 검색 대상. sql/53의 admission_results_search_trgm_idx가 덮는
    // 3컬럼과 같아야 인덱스를 탄다.
    searchColumns: ["university_name", "department_name", "admission_track"],
    homepage: true,
    // config.excel(공용 CSV 다운로드 스위치) 없음(의도) — admissionGuidelines
    // (:1051 부근)와 같은 사유. 기존 downloadExcel은 표시 포맷 CSV라 재적재가
    // 안 되고(다운로드 → 수정 → 재업로드 왕복이 안 닫힌다), 버튼이 2개
    // 공존하면 "엑셀 다운로드 버튼이 여러 개다, 우리가 개발한 걸로
    // 통일해라"는 2026-08-07 사용자 지시를 다시 어기게 된다. 대신 아래
    // ListSummary(AdmissionResultsBulkXlsxPanel)의 xlsx 왕복으로 통일한다.
    // guideText(Supabase CSV Import 권장 안내)도 같은 이유로 지웠다 —
    // 그 안내가 가리키던 수동 CSV Import 경로 자체가 이제 이 화면
    // 엑셀 왕복으로 대체됐다.
    listSummaryKey: "admissionResultsListSummary",
    columns: [
      { key: "result_year", label: "연도" },
      { key: "university_name", label: "대학명" },
      { key: "department_name", label: "모집단위" },
      // 중심전형은 유일키 축이라 목록에서 안 보이면 같은 전형명의 교과/종합 2행을
      // 구분할 수 없다. 비운 모집시기 자리를 그대로 이어받는다.
      { key: "main_track", label: "중심전형" },
      { key: "screening_category", label: "전형유형" },
      { key: "admission_track", label: "전형명" },
      { key: "grade_70", label: "70%컷" },
      { key: "is_active", label: "노출", type: "boolean" },
    ],
    fields: [
      {
        key: "is_active",
        label: "노출 여부",
        type: "radioBoolean",
        required: true,
      },
      { key: "result_year", label: "학년도", type: "number", required: true },
      {
        key: "university_key",
        label: "대학 키값",
        type: "text",
        required: true,
      },
      { key: "university_name", label: "대학명", type: "text", required: true },
      {
        key: "department_key",
        label: "모집단위 키값",
        type: "text",
        required: true,
      },
      {
        key: "department_name",
        label: "모집단위",
        type: "text",
        required: true,
      },
      {
        // 원문 표기 그대로 저장한다 — sql/53의 CHECK가 교과|종합|논술|실기|기타만
        // 허용하므로 '학생부교과' 같은 확장 표기를 넣으면 저장이 즉시 거부된다.
        key: "main_track",
        label: "중심전형",
        type: "select",
        options: ["교과", "종합", "논술", "실기", "기타"],
      },
      {
        // 실데이터 11종 + 기타. sql/53 CHECK와 같은 도메인이라 여기 없는 값은 저장되지 않는다.
        key: "screening_category",
        label: "전형유형",
        type: "select",
        options: [
          "일반",
          "추천형",
          "지역인재",
          "농어촌",
          "기회균형",
          "특성화고",
          "특수교육",
          "논술",
          "실기",
          "성인학습자",
          "재외국민",
          "기타",
        ],
      },
      {
        key: "admission_track",
        label: "전형명",
        type: "text",
        required: true,
        help: "전형명 원문 그대로 입력합니다.",
      },
      // 지표 숫자 필드는 전부 nullable — 입력을 비우면 0이 아니라 null로 저장한다
      // ("등급 0"·"경쟁률 0" 같은 값은 존재하지 않고, 전부 미공개를 뜻한다).
      { key: "grade_50", label: "50%컷", type: "number", nullable: true },
      { key: "grade_70", label: "70%컷", type: "number", nullable: true },
      { key: "grade_85", label: "85%컷", type: "number", nullable: true },
      { key: "grade_90", label: "90%컷", type: "number", nullable: true },
      // 아래 5종은 sql/53에서 추가된 지표다. 공개 화면(v1)에는 노출하지 않지만
      // 어드민에 필드가 없으면 적재된 값을 조회·수정할 방법이 사라진다.
      {
        key: "grade_avg",
        label: "합격자 평균등급",
        type: "number",
        nullable: true,
      },
      {
        key: "grade_min",
        label: "합격자 최저등급",
        type: "number",
        nullable: true,
      },
      {
        key: "grade_avg10",
        label: "10과목 평균등급",
        type: "number",
        nullable: true,
      },
      {
        key: "grade_min10",
        label: "10과목 최저등급",
        type: "number",
        nullable: true,
      },
      {
        key: "grade_first_avg",
        label: "최초합 평균등급",
        type: "number",
        nullable: true,
      },
      {
        key: "converted_score",
        label: "환산점수",
        type: "number",
        nullable: true,
      },
      { key: "percentile", label: "백분위", type: "number", nullable: true },
      { key: "quota", label: "모집인원", type: "number", nullable: true },
      {
        // 값 0은 "경쟁률 0"이 아니라 미공개다(적재 시 결측 승격). 어드민에서도 0을
        // 넣지 말고 비워 두어야 공개 화면이 `0.00 : 1`을 정상값처럼 렌더하지 않는다.
        key: "competition_rate",
        label: "경쟁률",
        type: "number",
        nullable: true,
        help: "미공개면 비워 두세요. 0을 넣으면 공개 화면에 경쟁률 0.00 : 1로 표시됩니다.",
      },
      { key: "waitlist_rank", label: "충원순위", type: "text" },
      { key: "subject_reflection", label: "반영교과/영역", type: "text" },
      {
        // 유일키의 마지막 축. 같은 8축 조합이 실제로 2행 이상인 분할모집에서만
        // 1, 2, … 로 올린다. 기본은 0.
        key: "variant_seq",
        label: "분할모집 순번",
        type: "number",
        help: "동일 전형이 분할모집으로 여러 행일 때만 0, 1, 2 … 로 구분합니다.",
      },
      { key: "source_sheet", label: "출처 시트", type: "text" },
      {
        key: "source_row",
        label: "출처 행번호",
        type: "number",
        nullable: true,
      },
      { key: "note", label: "메모", type: "textarea" },
    ],
    defaults: {
      is_active: true,
      result_year: 2026,
      university_key: "",
      university_name: "",
      department_key: "",
      department_name: "",
      main_track: "교과",
      screening_category: "일반",
      admission_track: "",
      grade_50: null,
      grade_70: null,
      grade_85: null,
      grade_90: null,
      grade_avg: null,
      grade_min: null,
      grade_avg10: null,
      grade_min10: null,
      grade_first_avg: null,
      converted_score: null,
      percentile: null,
      // 모집인원·경쟁률 기본값은 0이 아니라 null이다. 0으로 두면 신규 행이 전부
      // "모집인원 0명 / 경쟁률 0.00 : 1"로 공개면에 나가, 적재 파이프라인이
      // 경쟁률 0을 결측으로 승격시킨 취지가 어드민 경로로 되살아난다.
      quota: null,
      competition_rate: null,
      waitlist_rank: "",
      subject_reflection: "",
      variant_seq: 0,
      source_sheet: "",
      source_row: null,
      note: "",
    },
  },

  trendingDepartments: {
    title: "지금 뜨고 있는 학과",
    table: "trending_departments",
    searchPlaceholder: "대학명 또는 학과명을 검색하세요",
    order: "sort_order",
    homepage: true,
    guideText: `랜딩 입결정보 영역에 노출되는 학과 칩 목록입니다. 대학 키값·모집단위 키값을 입력하면 칩 클릭 시 해당 상세로 딥링크되고, 비워두면 칩이 비활성 상태로 표시됩니다.`,
    columns: [
      { key: "logo_url", label: "로고", type: "image" },
      { key: "university_name", label: "대학명" },
      { key: "department_name", label: "학과명" },
      { key: "sort_order", label: "순서" },
      { key: "is_active", label: "노출", type: "boolean" },
    ],
    fields: [
      {
        key: "is_active",
        label: "노출 여부",
        type: "radioBoolean",
        required: true,
      },
      { key: "university_name", label: "대학명", type: "text", required: true },
      { key: "department_name", label: "학과명", type: "text", required: true },
      {
        key: "university_key",
        label: "대학 키값",
        type: "text",
        help: "입결정보 상세 딥링크(?u=)용. 비워두면 칩이 비활성으로 표시됩니다.",
      },
      {
        key: "department_key",
        label: "모집단위 키값",
        type: "text",
        help: "입결정보 상세 딥링크(?d=)용.",
      },
      {
        key: "logo_url",
        label: "대학 로고 이미지",
        type: "image",
        compress: true,
        help: "정방형 권장. 저작권 확인 전까지는 비워둘 수 있습니다.",
        imageSpec: { width: 1, height: 1, aspectOnly: true, maxMB: 1 },
        folder: "admission/trending-departments",
        cacheControl: "31536000, immutable",
      },
      { key: "sort_order", label: "순서", type: "number" },
    ],
    defaults: {
      is_active: true,
      university_name: "",
      department_name: "",
      university_key: "",
      department_key: "",
      logo_url: "",
      sort_order: 0,
    },
  },

  admissionSusiJungsi: {
    title: "합격 사례",
    table: "admission_posts",
    fixedCategories: ["susi", "jungsi"],
    tabs: ADMISSION_CASES_TABS,
    searchPlaceholder: "합격 사례 게시글 제목을 검색하세요",
    order: "sort_order",
    homepage: true,
    guideText: `합격 사례 게시글의 첫 번째 본문 이미지를 메인 화면 합격생 카드로 사용할 수 있습니다. '메인 합격생 영역에 노출'을 체크한 게시글만 표시되며, 카드를 누르면 해당 게시글 상세로 이동합니다. 본문은 블록 에디터로 작성합니다.`,
    columns: [
      {
        key: "category",
        label: "구분",
        options: ADMISSION_CASE_CATEGORY_OPTIONS,
      },
      { key: "title", label: "제목" },
      { key: "content", label: "본문", type: "truncate" },
      { key: "is_pinned", label: "최상단 고정", type: "boolean" },
      { key: "show_on_home", label: "메인 합격생 노출", type: "boolean" },
      { key: "image_urls", label: "본문 이미지", type: "imageList" },
      { key: "attachments", label: "첨부파일", type: "fileList" },
      { key: "is_active", label: "노출", type: "boolean" },
      { key: "created_at", label: "작성일", type: "date" },
    ],
    fields: [
      {
        key: "is_active",
        label: "노출 여부",
        type: "radioBoolean",
        required: true,
      },
      {
        key: "category",
        label: "구분",
        type: "select",
        options: ADMISSION_CASE_CATEGORY_OPTIONS,
        required: true,
      },
      { key: "title", label: "제목", type: "text", required: true },
      { key: "is_pinned", label: "최상단 고정", type: "checkbox" },
      {
        key: "show_on_home",
        label: "메인 합격생 영역에 노출",
        type: "checkbox",
      },
      {
        key: "content",
        label: "내용",
        type: "blockEditor",
        folder: "admission-body",
        compress: true,
        imageSpec: { maxMB: 3 },
      },
      { key: "image_urls", label: "본문 이미지", type: "multiImage" },
      {
        key: "attachments",
        label: "첨부파일",
        type: "multiFile",
        accept:
          ".pdf,.hwp,.hwpx,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.zip,.png,.jpg,.jpeg",
      },
      { key: "sort_order", label: "순서", type: "number" },
    ],
    defaults: {
      category: "susi",
      is_active: true,
      is_pinned: false,
      show_on_home: false,
      title: "",
      content: "",
      image_url: "",
      file_url: "",
      file_name: "",
      image_urls: [],
      attachments: [],
      sort_order: 1,
    },
    // ref pull(blockEditor)은 form.__blocks_<key>에 임시로 실린다 — 정본(content_json)과
    // 평문 미러(content)로 분리해 저장하고 임시 키는 페이로드에서 제거한다.
    formToPayload: (form) => {
      const { __blocks_content, ...rest } = form;
      const blocks = __blocks_content || [];
      return {
        ...rest,
        content_json: { v: 1, editor: "blocknote@0.52.1", blocks },
        content: blocksToPlainText(blocks),
      };
    },
  },
};
