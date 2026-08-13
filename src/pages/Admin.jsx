import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  Download,
  Edit3,
  ExternalLink,
  Eye,
  Plus,
  RefreshCw,
  Search,
  Settings,
  Trash2,
  UploadCloud
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import MentorCard from '../components/landing/MentorCard';
import {
  HWP_SECTION_ORDER,
  HWP_SECTION_LABELS,
  HWP_SECTION_HTML_KEYS,
  splitHwpTextIntoSections,
  buildHwpCategoryHtml,
  buildHwpCategoryDoc,
  renderDocToHtml,
  clean as cleanAdmissionText
} from '../lib/admissionParsing';
import { HWP_SECTION_JSON_KEYS, validateAdmissionDoc, isEmptyDoc, stableStringifyDoc } from '../lib/admissionDoc';
import { isDocRenderEnabled } from '../lib/admissionFlags';
import { getAdmissionActiveYear, setAdmissionActiveYear } from '../lib/admissionSettings';
import {
  GOAL_BACKFILL_YEAR_MODES,
  fetchBackfillSourceRows,
  goalCutConflictKey,
  computeGoalCutBackfill
} from '../lib/goal/goalCutBackfill';
import {
  exportAdmissionRowsToXlsx,
  parseAdmissionRowsFromXlsx,
  BULK_XLSX_COLUMNS
} from '../lib/admissionBulkXlsx';
import {
  exportAdmissionResultRowsToXlsx,
  parseAdmissionResultRowsFromXlsx,
  BULK_XLSX_COLUMNS as ADMISSION_RESULTS_BULK_XLSX_COLUMNS
} from '../lib/admissionResultsBulkXlsx';
import {
  exportGoalUniversityCutRowsToXlsx,
  parseGoalUniversityCutRowsFromXlsx,
  GOAL_CUT_RANGE
} from '../lib/goalUniversityCutsBulkXlsx';
import * as XLSX from 'xlsx';
import AdmissionSectionView from '../components/admission/AdmissionSectionView';
import SafeHtml from '../components/admission/SafeHtml';
import AdmissionSurface from '../components/admission/AdmissionSurface';
import DocBlocksEditor from '../components/admission/editor/DocBlocksEditor';
import AdmissionSectionEditModal from '../components/admission/editor/AdmissionSectionEditModal';
import AdmissionMetaEditModal from '../components/admission/editor/AdmissionMetaEditModal';
import BlockEditor from '../components/editor/BlockEditor';
import ColumnPreviewModal from '../components/editor/ColumnPreviewModal';
import { blocksToPlainText } from '../lib/blockToPlainText';
import { plainTextToBlocks } from '../lib/plainTextToBlocks';
import { FAQ_CATEGORIES } from '../data/faqCategories';
// BookViewer는 표현 전용 컴포넌트라 가볍다(bookPairing.js + book-viewer.css) — 정적 import 대상은
// pdfjs-dist뿐이다(PremiumBookAdmin 참고). BookViewer까지 동적 import하면 얻는 것 없이 미리보기 전환에
// 스피너만 하나 더 생긴다.
import BookViewer from '../components/premiumBook/BookViewer';
// 쿠폰관리는 제네릭 CRUD 로 표현되지 않는다(파생 사용 건수 · NULL=무제한 3상태
// 입력 · slug 사전중복검사 · 사용이력 드릴다운 + void RPC). config.custom +
// CustomComponent 로 붙인다 — premiumBookPages 선례와 같은 방식이다.
// Admin.jsx 가 5,700줄이라 컴포넌트 본체는 별도 파일에 둔다(이 파일이 그 파일을
// import 하므로 역방향 import 는 만들지 않는다 — 순환 참조 방지).
import CouponAdmin from '../components/admin/CouponAdmin';
// 목표관리 학생 현황(§4-3)이 쓰는 계산 엔진 상수·함수. **읽기 전용 import 다** —
// src/lib/goal/calc/** 는 209개 테스트로 동결돼 있어 이 화면이 한 글자도 고치지 않는다.
//  - getSchoolCutType: 학생 school_type → 컷 종류(normal|special). 컷 스냅샷 diff의
//    현재 컷 조회 술어가 goalRepo.fetchUniversityCut과 같아야 하므로 같은 함수를 쓴다.
//  - ACHIEVEMENT/FOCUS_MULTIPLIER: 일별 기록의 성취도·집중도 키를 배수와 함께
//    표시한다. 한글 라벨을 새로 지어내면 학생 화면과 어긋나므로 원본 키를 그대로 쓴다.
//  - kstYMD / addDaysYMD: riskFlags('오늘 미제출' / '최근 7일 기록 없음')의 기준일.
//    toISOString().slice(0,10)은 UTC라 KST 00~09시에 하루 전날로 잘린다 — 학생이
//    자정 직후 제출한 기록이 '오늘 미제출'로 잘못 뜨는 사고를 막으려면 KST 고정이 필수다.
//  - VIRTUAL_DAY_NAMES: study_schedule jsonb의 요일 7키(monday…sunday) 순서 정본.
import {
  getSchoolCutType,
  ACHIEVEMENT_MULTIPLIER,
  FOCUS_MULTIPLIER,
  VIRTUAL_DAY_NAMES,
  kstYMD,
  addDaysYMD
} from '../lib/goal/calc/index.js';

// resolveInfoContent(AdmissionGuidelines.jsx)와 동일한 dedup 검사 —
// buildHwpCategoryHtml이 만든 html은 admission-raw-section-wrap을 자체
// 포함하지만, 과거 다른 경로로 저장된 값은 admission-existing-html을 이미
// 포함할 수도 있다. 이미 자기 래퍼가 있으면 SafeHtml에 className을 더
// 주지 않는다 — 안 그러면 admission-existing-html이 이중으로 붙어
// overflow-x:auto 스크롤 컨테이너가 중첩된다(공개 모달에서 실제로 발생했던
// 버그와 동일 패턴).
const ADMISSION_EXISTING_WRAP_RE = /admission-existing-html|admission-raw-section-wrap/;

const PAGE_SIZE = 10;
// CSV 청크 내보내기 1회 요청 크기. PostgREST 기본 응답 상한이 1,000행이라 이보다
// 크게 잡아도 잘려 나온다 — 43k행이면 44회 왕복이다.
const EXPORT_CHUNK = 1000;
const IMAGE_BUCKET = 'banners';

const MENU_GROUPS = [
  {
    title: '메인 관리',
    items: [
      { key: 'popups', label: '팝업 관리' },
      { key: 'banners', label: '메인 배너 관리' },
      { key: 'sideBanners', label: '우측 소형 배너' },
      { key: 'universityAcceptances', label: '합격생 대학 관리' },
      { key: 'programCategories', label: '핵심 서비스' },
      { key: 'mentorStrategies', label: '멘토 성공전략' },
      { key: 'pageContents', label: '세부 페이지 관리' },
      { key: 'premiumBookPages', label: '프리미엄 책자 관리' },
      { key: 'premiumConsults', label: '프리미엄 상담 신청' }
    ]
  },
  {
    title: '게시판 관리',
    items: [
      { key: 'notices', label: '공지사항' },
      { key: 'companyNews', label: '회사소식' },
      { key: 'admissionSusiJungsi', label: '수시정시합격' },
      { key: 'specialHighschool', label: '특목고합격' },
      { key: 'admissionGuidelines', label: '대학별 모집요강' },
      { key: 'admissionUniversities', label: '대학 목록 관리' },
      { key: 'admissionResults', label: '입결정보' },
      { key: 'trendingDepartments', label: '지금 뜨고 있는 학과' },
      { key: 'galleries', label: '교육칼럼' },
      { key: 'faqs', label: '자주하는질문' },
      { key: 'mentorApplyFaqs', label: '멘토신청 FAQ' },
      { key: 'mentorApplyCopy', label: '멘토신청 문구' },
      { key: 'learningDiagnosis', label: '학습진단 관리' },
      { key: 'learningDiagnosisV2SurveyCopy', label: '학습진단(ver2) 문항 문구' }
    ]
  },
  {
    title: '회원 관리',
    items: [
      { key: 'members', label: '회원 목록' },
      { key: 'enrollments', label: '수강 신청 내역' },
      { key: 'mentorApplications', label: '멘토 신청 내역' }
    ]
  },
  {
    title: '프로그램 관리',
    items: [
      { key: 'dailyEntries', label: '일일 입장' },
      { key: 'usageStatus', label: '이용 현황' }
    ]
  },
  // 목표관리(goal_*) — 학생 앱의 확률 산출에 쓰이는 컷 기준표와 학생 현황.
  // 등록 지점은 이 배열과 CONFIGS 둘뿐이다(다른 배선 없음).
  {
    title: '목표관리',
    items: [
      { key: 'goalUniversityCuts', label: '대학 컷 관리' },
      { key: 'goalStudents', label: '학생 현황' }
    ]
  },
  {
    title: '위닝관리',
    items: [
      { key: 'winningBaseData', label: '기초데이터추출' },
      { key: 'winningDbInputs', label: '위닝DB입력' },
      { key: 'winningSuhaengTopicDb', label: '위닝 수행 주제 DB' },
      { key: 'winningSuhaengResourceDb', label: '위닝 수행 자료 DB' },
      { key: 'winningSetukDb', label: '위닝 세특 DB' },
      { key: 'winningDeepReportDb', label: '위닝 심화보고서 DB' },
      { key: 'winningStudentRecordDb', label: '위닝 생기부 DB' }
    ]
  },
  {
    title: '수입·매출 관리',
    items: [
      { key: 'payments', label: '매출 조정' },
      { key: 'settlements', label: '매출 정산' },
      { key: 'dailySettlements', label: '일일정산' },
      // CONFIGS.refunds 라벨과 동일하게 유지할 것 — '환불 신청 내역'(아래)과
      // 혼동돼 있던 라벨을 2026-08-12 정정했다.
      { key: 'refunds', label: '환불 수기 대장' },
      // fn_request_refund(고객 신청) 원장 — 위 refunds(관리자 수기 대장)와는
      // 다른 테이블이다. CONFIGS.refundRequests 참고.
      { key: 'refundRequests', label: '환불 신청 내역' },
      // 쿠폰은 결제 금액을 직접 깎는 손잡이라 수입·매출 그룹에 둔다
      // (products/orders 와 같은 도메인 — sql/10_pricing_orders.sql).
      { key: 'coupons', label: '쿠폰관리' }
    ]
  }
];

// error.message 원문 alert 위생(팀 리드 지시, 2026-08-12) — Baseline 실측 WC 코드·
// SQLSTATE 를 짧은 한국어 안내로 치환한다. 매핑에 없는 오류는 일반 실패 문구를
// 보여주고 원문은 console.error 로만 남긴다(alert 로 DB 에러 원문을 그대로
// 노출하지 않기 위함). 19개소(제네릭 저장 경로 두 벌 + 조회 2곳 포함) 전부
// 아래 reportAdminError 경유로 통일한다.
const ADMIN_ERROR_MESSAGE_MAP = [
  { pattern: /refund_not_approved_for_completion|WC035/, message: '아직 승인되지 않은 환불 신청입니다.' },
  {
    pattern: /refund_completion_not_processable|WC036/,
    message: '지금 상태에서는 환불 완료 처리를 할 수 없습니다.'
  },
  {
    pattern: /order_already_consumed|WC032/,
    message: '이미 사용된 주문이라 환불 완료 처리를 할 수 없습니다.'
  },
  { pattern: /refund_amount_exceeds_paid|WC037/, message: '환불 금액이 결제 금액을 초과합니다.' },
  { pattern: /order_not_pending|WC040/, message: '이미 처리된 주문입니다.' },
  { pattern: /order_not_paid_for_refund|WC041/, message: '결제 완료된 주문만 환불할 수 있습니다.' },
  { pattern: /refunded_order_immutable|WC039/, message: '환불 완료된 주문은 더 이상 수정할 수 없습니다.' },
  { pattern: /23514/, message: '입력값이 저장 조건을 벗어났습니다. 값을 다시 확인해 주세요.' },
  { pattern: /23502/, message: '필수 값이 비어 있습니다. 항목을 모두 입력해 주세요.' },
  { pattern: /23505/, message: '이미 등록된 값입니다(중복).' }
];

function mapAdminErrorMessage(error) {
  const raw = `${error?.message || ''} ${error?.code || ''}`;
  const hit = ADMIN_ERROR_MESSAGE_MAP.find(({ pattern }) => pattern.test(raw));
  return hit ? hit.message : '요청을 처리하지 못했습니다. 잠시 후 다시 시도해 주세요.';
}

function reportAdminError(label, error) {
  console.error(label, error);
  alert(`${label}: ${mapAdminErrorMessage(error)}`);
}

// AdmissionGuidelines.jsx의 REGION_ORDER와 동일하게 유지한다.
// 여기 없는 지역 문자열을 입력하면 공개 페이지의 지역별 목록/지도에 노출되지 않는다.
const ADMISSION_REGION_OPTIONS = [
  '강원',
  '경기',
  '경남',
  '경북',
  '광주',
  '대구',
  '대전',
  '부산',
  '서울',
  '세종',
  '울산',
  '인천',
  '전남',
  '전북',
  '제주',
  '충남',
  '충북'
];

// 수시정시합격 페이지는 사이드바에 admissionSusiJungsi 하나만 노출하고, 그 안에서
// 서브탭으로 admission_posts/admission_acceptance_rates/admission_case_logos를 전환한다.
const ADMISSION_CASES_TABS = [
  { key: 'admissionSusiJungsi', label: '합격 사례' },
  { key: 'acceptanceRates', label: '연도별 합격률' },
  { key: 'admissionCaseLogos', label: '대학 로고' }
];

// DB 저장값은 susi/jungsi 그대로 유지하고 화면 표기만 한글로 바꾼다.
const ADMISSION_CASE_CATEGORY_OPTIONS = [
  { value: 'susi', label: '수시' },
  { value: 'jungsi', label: '정시' }
];

// 특목고합격 — 사이드바에 specialHighschool 하나만 노출하고 그 안에서 서브탭으로 전환한다.
// 히어로 대학 로고는 수시정시합격과 같은 테이블(admission_case_logos)을 공유하므로
// 여기에 로고 탭을 만들지 않는다 — 같은 데이터의 편집 입구가 둘이 되면 드리프트가 난다.
const SPECIAL_HIGHSCHOOL_TABS = [
  { key: 'specialHighschool', label: '합격 사례' },
  { key: 'specialHighschoolRates', label: '연도별 합격률' }
];

// 공개 페이지 탭(전체/자사고/외고/국제고/영재고/과학고) 및 DB CHECK 제약과 동일하게 유지할 것.
const SPECIAL_HIGHSCHOOL_TYPE_OPTIONS = [
  { value: '자사고', label: '자사고' },
  { value: '외고', label: '외고' },
  { value: '국제고', label: '국제고' },
  { value: '영재고', label: '영재고' },
  { value: '과학고', label: '과학고' }
];

const SPECIAL_HIGHSCHOOL_LABEL_OPTIONS = [
  { value: '합격자', label: '합격자' },
  { value: '합격생', label: '합격생' }
];

// refund_requests.status DB CHECK 값(requested|processing|completed|rejected)과
// 화면 라벨을 분리한다 — 저장은 영문, 표시는 한글(MyPage.jsx REFUND_STATUS
// 재사용). CONFIGS.refundRequests 참고.
const REFUND_REQUEST_STATUS_OPTIONS = [
  { value: 'requested', label: '접수' },
  { value: 'processing', label: '처리중' },
  { value: 'completed', label: '환불완료' },
  { value: 'rejected', label: '반려' }
];

// 완료 처리는 fn_complete_refund RPC 전용이다(WC038 트리거가 제네릭 PATCH 로의
// completed 전환을 막는다) — 편집 폼 select 에는 completed 를 노출하지 않는다.
// 목록 표시(컬럼)는 이미 완료된 행의 라벨도 보여줘야 하므로 위
// REFUND_REQUEST_STATUS_OPTIONS(완료 포함)를 그대로 쓴다.
const REFUND_REQUEST_STATUS_EDIT_OPTIONS = REFUND_REQUEST_STATUS_OPTIONS.filter(
  (option) => option.value !== 'completed'
);

// refund_requests.approval_status DB CHECK 값(requested|approved|rejected) — 학부모가
// 아닌 신청자가 낸 환불 신청의 승인 여부 축이다(payments.status·refund_requests.status
// 와는 다른 별개 축, Baseline §8 CHECK 목록 참고). fn_complete_refund 가 approved
// 아니면 WC035 로 막으므로 목록에서 바로 판별할 수 있어야 한다.
const REFUND_APPROVAL_STATUS_OPTIONS = [
  { value: 'requested', label: '승인대기' },
  { value: 'approved', label: '승인완료' },
  { value: 'rejected', label: '승인반려' }
];

// payments.status DB CHECK 값(pending|paid|failed|refunded|cancelled)과 화면
// 라벨을 분리한다 — 저장은 영문, 표시는 한글. 한국어를 값으로 넣어 CHECK
// 위반으로 등록이 늘 실패하던 결함(CONFIGS.payments 참고)을 여기서 고친다.
// 라벨은 새로 짓지 않고 이 저장소에 이미 있는 어휘에서 가져온다:
//   pending → '납부대기', paid → '납부완료'  (1679행 admin_enrollments
//     payment_status 옵션과 동일 어휘)
//   refunded → '환불완료'  (MyPage.jsx REFUND_STATUS.completed, 184행
//     REFUND_REQUEST_STATUS_OPTIONS 와 동일 어휘)
// failed·cancelled 는 이 저장소에 대응하는 기존 라벨이 없어 새로 채운다
// (2026-08-12, 사용자 지시로 채움). '취소요청'을 cancelled 에 쓰지 않는다 —
// 그건 "취소 신청됨"(진행 중)이라는 별개 상태라 여기 cancelled(완료 상태)와
// 맞지 않는다. 대신 이미 쓰이는 '-완료' 접미(납부완료/환불완료)와 같은
// 형태로 맞춰 취소완료로 쓴다. failed 도 같은 이유로 '납부' 접두를 살려
// 납부실패로 쓴다 — refunds 탭(2188행)의 '취소요청'/'환불완료'/'반려' 축과는
// 다른 테이블·다른 상태 축이라 혼동하지 않는다.
const PAYMENT_STATUS_OPTIONS = [
  { value: 'pending', label: '납부대기' },
  { value: 'paid', label: '납부완료' },
  { value: 'failed', label: '납부실패' },
  { value: 'refunded', label: '환불완료' },
  { value: 'cancelled', label: '취소완료' }
];

// DB 저장값은 영문 키 그대로 유지하고 화면 표기만 한글로 바꾼다(다른 select 옵션과 동일 관례).
const PREMIUM_CONSULT_STATUS_OPTIONS = [
  { value: 'new', label: '신규' },
  { value: 'contacted', label: '연락함' },
  { value: 'done', label: '완료' },
  { value: 'cancelled', label: '취소' }
];

// sql/52_mentor_applications.sql의 status 컬럼 주석에 적힌 값 그대로(CHECK 제약은 없지만
// 이 6개가 실제 사용 값이다). CONFIGS.mentorApplications 목록 컬럼과 MentorApplicationsAdmin의
// 상세 상태변경 Select가 이 배열 하나를 공유한다 — 값이 어긋나면 목록에 라벨이 안 붙는다.
const MENTOR_APPLICATION_STATUS_OPTIONS = [
  { value: 'submitted', label: '제출됨' },
  { value: 'screening', label: '서류심사' },
  { value: 'interview', label: '면접' },
  { value: 'training', label: '교육' },
  { value: 'active', label: '활동중' },
  { value: 'rejected', label: '불합격' }
];

// ---------------------------------------------------------------------
// 목표관리 도메인 상수 (docs/figma-goal/goal-admin-spec.md §4-1-2)
// DB 저장값은 영문 키 그대로 두고 화면 표기만 한글로 바꾼다(다른 select 옵션과 동일 관례).
// ---------------------------------------------------------------------

// sql/55_goal_management.sql 의 goal_university_cuts_cut_type_check 와 동일 집합.
// 여기 없는 값을 넣으면 저장 시 23514로 죽는다.
const GOAL_CUT_TYPE_OPTIONS = [
  { value: 'normal', label: '수시 일반고 (내신 등급)' },
  { value: 'special', label: '수시 특목·자사고 (내신 등급)' },
  { value: 'jungsi', label: '정시 (백분위)' }
];

// GOAL_CUT_RANGE(sql/55 의 goal_university_cuts_avg_cut_check 미러)는 여기서
// 선언하지 않고 src/lib/goalUniversityCutsBulkXlsx.js 에서 import 한다 —
// 폼(config.validate)과 엑셀 파서가 **같은 상수**를 봐야 두 입력 경로의
// 스케일 판정이 갈라지지 않기 때문이다. CHECK 는 "1~9 범위 안의 정시
// 백분위"(예: 3.5) 같은 혼입을 잡지 못하므로 그 상수가 실질 방어선이다
// (명세 §3-D4). 수시는 작을수록 우세(등급), 정시는 클수록 우세(백분위)다.

// source: 백필(admission_results 유도)로 만들어진 행인지, 사람이 손으로 넣은
// 행인지를 구분한다. 백필 재실행이 'manual' 행을 덮어쓰지 않는 근거 컬럼이다.
const GOAL_CUT_SOURCE_OPTIONS = [
  { value: 'admission_results', label: '입결정보 유도' },
  { value: 'manual', label: '수기 입력' }
];

// goal_students.status. sql/55 의 CHECK 제약과 동일 집합.
// awaiting_cuts = 온보딩은 제출했으나 컷이 없어 확률이 산출되지 않은 상태.
const GOAL_STUDENT_STATUS_OPTIONS = [
  { value: 'active', label: '진행중' },
  { value: 'awaiting_cuts', label: '컷 대기' },
  { value: 'paused', label: '정지' }
];

const CONFIGS = {
  popups: {
    title: '팝업 관리',
    table: 'popups',
    searchPlaceholder: '팝업 제목을 검색하세요',
    order: 'sort_order',
    homepage: true,
    guideText: `PC 팝업 이미지: 900px × 1200px/ 비율: 3:4/ 형식: JPG 또는 PNG/ 권장 용량: 1~2MB 이하`,
    columns: [
      { key: 'title', label: '제목' },
      { key: 'image_url', label: 'PC 이미지', type: 'image' },
      { key: 'mobile_image_url', label: '모바일 이미지', type: 'image' },
      { key: 'url', label: 'URL' },
      { key: 'start_date', label: '시작일', type: 'date' },
      { key: 'end_date', label: '종료일', type: 'date' },
      { key: 'sort_order', label: '순서' },
      { key: 'is_active', label: '노출', type: 'boolean' }
    ],
    fields: [
      { key: 'is_active', label: '사용', type: 'radioBoolean', required: true },
      { key: 'title', label: '제목', type: 'text', required: true },
      { key: 'url', label: 'URL', type: 'text' },
      { key: 'open_new_window', label: '새창으로열기', type: 'checkbox' },
      { key: 'image_url', label: 'PC 이미지', type: 'image' },
      { key: 'mobile_image_url', label: '모바일 이미지', type: 'image' },
      { key: 'start_date', label: '시작일', type: 'date' },
      { key: 'end_date', label: '종료일', type: 'date' },
      { key: 'sort_order', label: '순서', type: 'number' }
    ],
    defaults: {
      is_active: true,
      title: '',
      url: '',
      image_url: '',
      mobile_image_url: '',
      open_new_window: false,
      sort_order: 1
    }
  },

  banners: {
    title: '배너 관리',
    table: 'banners',
    searchPlaceholder: '배너 제목을 검색하세요',
    order: 'sort_order',
    homepage: true,
    guideText: `랜딩에는 활성 배너 중 sort_order 최상위 1건만 노출됩니다. 969×429px 통이미지(헤드라인·버튼 텍스트 포함)를 업로드하세요. 이동 URL을 입력하면 배너 전체가 클릭됩니다. 형식: JPG 또는 PNG / 2MB 이하`,
    columns: [
      { key: 'image_url', label: '이미지', type: 'image' },
      { key: 'title', label: '제목' },
      { key: 'button_link', label: '배너 클릭 시 이동 URL' },
      { key: 'sort_order', label: '순서' },
      { key: 'is_active', label: '노출', type: 'boolean' }
    ],
    fields: [
      { key: 'is_active', label: '노출 여부', type: 'radioBoolean', required: true },
      { key: 'title', label: '제목', type: 'text', required: true },
      // 통이미지 전환으로 highlight/button_text 오버레이 입력은 제거.
      // button_link는 배너 전체 클릭 URL로 용도 변경 (HeroSection.jsx 참조)
      { key: 'button_link', label: '배너 클릭 시 이동 URL', type: 'text' },
      {
        key: 'image_url',
        label: '배너 이미지',
        type: 'image',
        compress: true,
        imageSpec: { width: 969, height: 429, maxMB: 2 },
        folder: 'landing/hero',
        cacheControl: '31536000, immutable'
      },
      { key: 'sort_order', label: '순서', type: 'number' }
    ],
    defaults: {
      is_active: true,
      title: '',
      // highlight/button_text: 렌더되지 않는 레거시 컬럼 — NOT NULL 대비 빈 값만 유지
      highlight: '',
      button_text: '',
      button_link: '',
      image_url: '',
      sort_order: 1
    }
  },

  sideBanners: {
    title: '우측 소형 배너',
    table: 'home_side_banners',
    searchPlaceholder: '배너 제목을 검색하세요',
    order: 'sort_order',
    homepage: true,
    guideText: `PC 권장: 321px × 429px / 형식: PNG / 2MB 이하 / 여러 장 등록 시 6초 간격 자동 전환되며 이미지 하단 인디케이터로 이동할 수 있습니다`,
    columns: [
      { key: 'image_url', label: 'PC 이미지', type: 'image' },
      { key: 'title', label: '제목' },
      { key: 'subtitle', label: '설명' },
      { key: 'link_url', label: '연결 주소' },
      { key: 'sort_order', label: '순서' },
      { key: 'is_active', label: '노출', type: 'boolean' }
    ],
    fields: [
      { key: 'is_active', label: '노출 여부', type: 'radioBoolean', required: true },
      { key: 'title', label: '제목', type: 'text', required: true },
      { key: 'subtitle', label: '설명', type: 'textarea' },
      { key: 'link_url', label: '연결 주소', type: 'text' },
      { key: 'open_new_window', label: '새창으로 열기', type: 'checkbox' },
      {
        key: 'image_url',
        label: 'PC 이미지',
        type: 'image',
        compress: true,
        imageSpec: { width: 321, height: 429, maxMB: 2 },
        folder: 'landing/hero',
        cacheControl: '31536000, immutable'
      },
      {
        key: 'mobile_image_url',
        label: '모바일 이미지',
        type: 'image',
        help: '모바일(≤768px) 전용 — 없으면 PC 이미지 사용',
        imageSpec: { maxMB: 2 },
        folder: 'landing/hero',
        cacheControl: '31536000, immutable'
      },
      { key: 'start_date', label: '노출 시작일', type: 'date' },
      { key: 'end_date', label: '노출 종료일', type: 'date' },
      { key: 'sort_order', label: '순서', type: 'number' }
    ],
    defaults: {
      is_active: true,
      title: '',
      subtitle: '',
      link_url: '',
      open_new_window: false,
      image_url: '',
      mobile_image_url: '',
      start_date: null,
      end_date: null,
      sort_order: 1
    }
  },

  mentorStrategies: {
    title: '멘토 성공전략 카드',
    table: 'home_mentor_strategies',
    searchPlaceholder: '멘토 이름·배지를 검색하세요',
    order: 'sort_order',
    homepage: true,
    guideText: `메인 '멘토' 영역 카드입니다. 배지(기수)·소개 문구 텍스트 + 투명 배경 인물사진(PNG, 1MB 이하)을 조합해 카드를 만들며, 라이브 프리뷰가 실제 노출과 동일합니다. 프리셋 버튼으로 사진 배치를 잡은 뒤 좌표(px)로 미세 조정하세요. 배지·소개 문구·인물 사진·사진 배치를 모두 입력해야 랜딩에 카드가 노출됩니다. 신규 등록은 노출 '미사용'으로 저장 → 프리뷰 확인 → '사용' 전환을 권장합니다.`,
    rowToForm: mentorRowToForm,
    formToPayload: mentorFormToPayload,
    validate: mentorFormValidate,
    FormPreview: MentorCardFormPreview,
    columns: [
      { key: 'photo_url', label: '인물 사진', type: 'image', showFileName: true },
      { key: 'mentor_name', label: '멘토 이름' },
      { key: 'badge', label: '배지(기수)' },
      { key: 'card_width', label: '카드 너비(px)' },
      { key: 'sort_order', label: '순서' },
      { key: 'is_active', label: '노출', type: 'boolean' }
    ],
    fields: [
      { key: 'is_active', label: '노출 여부', type: 'radioBoolean', required: true },
      {
        key: 'mentor_name',
        label: '멘토 이름',
        type: 'text',
        required: true,
        help: '사진 대체 텍스트("○○○ 멘토")로 사용됩니다'
      },
      {
        key: 'badge',
        label: '배지(기수)',
        type: 'text',
        help: '카드 상단 진한 글씨 (예: 위닝 8기)'
      },
      {
        key: 'title_lines',
        label: '소개 문구(줄 단위)',
        type: 'textarea',
        rows: 3,
        help: '한 줄에 하나씩 입력 — 1줄: "김무경 멘토", 2줄: "연세대 응용통계학과"'
      },
      {
        key: 'photo_url',
        label: '인물 사진',
        type: 'image',
        hideUrlInput: true,
        compress: true,
        help: '투명 배경 PNG 권장 / 1MB 이하',
        imageSpec: { aspectOnly: true, maxMB: 1 },
        folder: 'landing/mentors/photos',
        cacheControl: '31536000, immutable'
      },
      {
        key: 'card_width',
        label: '카드 너비(px)',
        type: 'number',
        help: '기본 210 / 와이드 카드만 230'
      },
      {
        key: 'photo_top',
        label: '사진 top(px)',
        type: 'number',
        help: '카드 좌상단 기준 세로 오프셋'
      },
      {
        key: 'photo_left',
        label: '사진 left(px)',
        type: 'number',
        help: '카드 좌상단 기준 가로 오프셋'
      },
      { key: 'photo_width', label: '사진 너비(px)', type: 'number' },
      { key: 'photo_height', label: '사진 높이(px)', type: 'number' },
      {
        key: 'photo_crop_enabled',
        label: '사진 내부 크롭 사용',
        type: 'checkbox',
        help: '사진 높이가 카드(360px)를 넘어 상단을 잘라야 할 때만 사용'
      },
      {
        key: 'photo_crop_top',
        label: '크롭 top',
        type: 'text',
        help: 'CSS 값 그대로 입력 (예: -16.26%)',
        showIf: (form) => !!form.photo_crop_enabled
      },
      {
        key: 'photo_crop_height',
        label: '크롭 height',
        type: 'text',
        help: 'CSS 값 그대로 입력 (예: 116.12%)',
        showIf: (form) => !!form.photo_crop_enabled
      },
      { key: 'sort_order', label: '순서', type: 'number' }
    ],
    defaults: {
      is_active: true,
      mentor_name: '',
      badge: '',
      title_lines: '',
      photo_url: '',
      card_width: 210,
      photo_top: 106,
      photo_left: 0,
      photo_width: 210,
      photo_height: 270,
      photo_crop_enabled: false,
      photo_crop_top: '',
      photo_crop_height: '',
      sort_order: 1
    }
  },

  universityAcceptances: {
    title: '합격생 대학 관리',
    table: 'university_acceptances',
    searchPlaceholder: '대학명을 검색하세요',
    order: 'sort_order',
    homepage: true,
    guideText: `메인 화면 '합격생' 영역 카드입니다. 엠블럼: 정방형 200px 이상 권장, PNG(투명 배경) / 1MB 이하. 표시 문구는 학과·과정명을 입력하세요(예: 컴퓨터공학과, 의예과, 84기). 합격 인원 입력은 더 이상 사용하지 않습니다.`,
    columns: [
      { key: 'emblem_url', label: '엠블럼', type: 'image' },
      { key: 'name', label: '대학명' },
      { key: 'subtitle', label: '표시 문구' },
      { key: 'track', label: '계열' },
      { key: 'sort_order', label: '순서' },
      { key: 'is_active', label: '노출', type: 'boolean' }
    ],
    fields: [
      { key: 'is_active', label: '노출 여부', type: 'radioBoolean', required: true },
      { key: 'name', label: '대학명', type: 'text', required: true },
      {
        key: 'emblem_url',
        label: '엠블럼 이미지',
        type: 'image',
        required: true,
        hideUrlInput: true,
        compress: true,
        help: '정방형 200px 이상 권장',
        imageSpec: { width: 1, height: 1, aspectOnly: true, maxMB: 1 },
        folder: 'landing/acceptance',
        cacheControl: '31536000, immutable'
      },
      { key: 'subtitle', label: '표시 문구(예: 컴퓨터공학과, 의예과, 84기)', type: 'text' },
      {
        key: 'track',
        label: '계열',
        type: 'select',
        options: [
          { value: 'general', label: '일반계열' },
          { value: 'medical_special', label: '의약학 · 특수계열' }
        ]
      },
      { key: 'sort_order', label: '순서', type: 'number' }
    ],
    defaults: {
      is_active: true,
      name: '',
      emblem_url: '',
      subtitle: '',
      count: null,
      track: 'general',
      sort_order: 1
    }
  },

  specialHighschool: {
    title: '특목고 합격 사례',
    table: 'special_highschool_cases',
    tabs: SPECIAL_HIGHSCHOOL_TABS,
    searchPlaceholder: '학교명 또는 학생명을 검색하세요',
    order: 'sort_order',
    homepage: true,
    guideText: `특목고 합격 페이지의 합격 사례 카드입니다. 구분(자사고/외고/국제고/영재고/과학고)이 공개 페이지의 탭 필터와 그대로 연결되며, 여기 없는 구분은 선택할 수 없습니다. 학생명은 반드시 마스킹해 입력하세요(허용 문자: O, ○, *, 예: 홍O동) — 실명 노출은 개인정보 위반입니다. 출신 중학교는 있는 경우에만 입력하며, 비워 두면 카드에 표시되지 않습니다. 순서 숫자가 작을수록 앞에 나옵니다. 상단 합격률 숫자는 '연도별 합격률' 탭에서 관리하고, 그 아래 대학 로고 줄은 '수시정시합격 > 대학 로고'에서 관리합니다(두 페이지가 같은 로고를 공유합니다).`,
    columns: [
      { key: 'school_type', label: '구분' },
      { key: 'school_name', label: '학교명' },
      { key: 'year', label: '연도' },
      { key: 'student_name', label: '학생명' },
      { key: 'result_label', label: '표기' },
      { key: 'middle_school', label: '출신 중학교' },
      { key: 'sort_order', label: '순서' },
      { key: 'is_active', label: '노출', type: 'boolean' }
    ],
    fields: [
      { key: 'is_active', label: '노출 여부', type: 'radioBoolean', required: true },
      { key: 'school_type', label: '구분', type: 'select', options: SPECIAL_HIGHSCHOOL_TYPE_OPTIONS, required: true, help: '공개 페이지 탭 필터와 연결됩니다' },
      { key: 'school_name', label: '학교명', type: 'text', required: true, help: '카드에 크게 표시되는 값입니다 (예: 광양제철고)' },
      { key: 'year', label: '연도', type: 'number', required: true, help: '고입 합격 연도 (예: 2022)' },
      { key: 'student_name', label: '학생명', type: 'text', required: true, help: '반드시 마스킹해 입력 (O, ○, * 중 하나 사용, 예: 홍O동)' },
      { key: 'result_label', label: '표기', type: 'select', options: SPECIAL_HIGHSCHOOL_LABEL_OPTIONS, required: true, help: `카드 문구가 'N년 고입 합격자/합격생'으로 바뀝니다` },
      { key: 'middle_school', label: '출신 중학교', type: 'text', help: '있는 경우만 입력. 비우면 카드에 표시되지 않습니다' },
      { key: 'sort_order', label: '순서', type: 'number' }
    ],
    formToPayload: (form) => ({
      ...form,
      year: Number(form.year || 0),
      middle_school: String(form.middle_school || '')
    }),
    validate: (form) => {
      const year = Number(form.year);
      if (!Number.isInteger(year) || year < 2000 || year > 2100) {
        return '연도는 2000~2100 사이 정수로 입력해 주세요.';
      }
      if (!/[O○*]/.test(String(form.student_name || ''))) {
        return '학생명은 개인정보 보호를 위해 마스킹해 입력해 주세요 (O, ○, * 중 하나 사용, 예: 홍O동).';
      }
      return '';
    },
    defaults: {
      is_active: true,
      school_type: '자사고',
      school_name: '',
      year: new Date().getFullYear(),
      student_name: '',
      result_label: '합격자',
      middle_school: '',
      sort_order: 1
    }
  },

  specialHighschoolRates: {
    title: '연도별 합격률',
    table: 'special_highschool_acceptance_rates',
    tabs: SPECIAL_HIGHSCHOOL_TABS,
    searchPlaceholder: '연도를 검색하세요',
    order: 'sort_order',
    homepage: true,
    guideText: `특목고 합격 페이지 상단 '목표 특목고 합격률' 영역입니다. 노출 중인 연도의 개수가 'N개년 평균' 문구가 되고, 합격률 평균이 큰 숫자로 표시됩니다. 수시정시합격 페이지의 합격률과는 완전히 별개 데이터이며 서로 영향을 주지 않습니다. 합격률은 0~100 사이 숫자로 입력하며 소수점 한 자리까지 쓸 수 있습니다(예: 95.4). 연도는 중복 등록할 수 없습니다. 순서는 목록 정렬용이며 홈페이지 표시값에는 영향을 주지 않습니다.`,
    ListSummary: AcceptanceRateSummary,
    columns: [
      { key: 'year', label: '연도' },
      { key: 'rate', label: '합격률(%)' },
      { key: 'sort_order', label: '순서' },
      { key: 'is_active', label: '노출', type: 'boolean' }
    ],
    fields: [
      { key: 'is_active', label: '노출 여부', type: 'radioBoolean', required: true },
      { key: 'year', label: '연도', type: 'number', required: true, help: '예: 2025 (중복 등록 불가)' },
      {
        key: 'rate',
        label: '합격률(%)',
        type: 'text',
        required: true,
        help: '0~100 사이 숫자. 소수점 한 자리까지 입력 가능(예: 95.4)'
      },
      { key: 'sort_order', label: '순서', type: 'number' }
    ],
    rowToForm: (row) => ({
      ...row,
      rate: row.rate === null || row.rate === undefined ? '' : String(row.rate)
    }),
    formToPayload: (form) => ({
      ...form,
      year: Number(form.year || 0),
      rate: Number.parseFloat(form.rate)
    }),
    validate: (form) => {
      const year = Number(form.year);
      if (!Number.isInteger(year) || year < 2000 || year > 2100) {
        return '연도는 2000~2100 사이 정수로 입력해 주세요.';
      }
      const rate = Number.parseFloat(form.rate);
      if (!Number.isFinite(rate) || rate < 0 || rate > 100) {
        return '합격률은 0~100 사이 숫자로 입력해 주세요.';
      }
      return '';
    },
    defaults: {
      is_active: true,
      year: new Date().getFullYear(),
      rate: '',
      sort_order: 1
    }
  },

  acceptanceRates: {
    title: '연도별 합격률',
    table: 'admission_acceptance_rates',
    tabs: ADMISSION_CASES_TABS,
    searchPlaceholder: '연도를 검색하세요',
    order: 'sort_order',
    homepage: true,
    guideText: `수시정시 합격사례 페이지 상단 '목표 대학 합격률' 영역입니다. 노출 중인 연도의 개수가 'N개년 평균' 문구가 되고, 합격률 평균이 큰 숫자로 표시됩니다. 합격률은 0~100 사이 숫자로 입력하며 소수점 한 자리까지 쓸 수 있습니다(예: 95.4). 연도는 중복 등록할 수 없습니다. 순서는 목록 정렬용이며 홈페이지 표시값에는 영향을 주지 않습니다.`,
    ListSummary: AcceptanceRateSummary,
    columns: [
      { key: 'year', label: '연도' },
      { key: 'rate', label: '합격률(%)' },
      { key: 'sort_order', label: '순서' },
      { key: 'is_active', label: '노출', type: 'boolean' }
    ],
    fields: [
      { key: 'is_active', label: '노출 여부', type: 'radioBoolean', required: true },
      { key: 'year', label: '연도', type: 'number', required: true, help: '예: 2025 (중복 등록 불가)' },
      {
        key: 'rate',
        label: '합격률(%)',
        type: 'text',
        required: true,
        help: '0~100 사이 숫자. 소수점 한 자리까지 입력 가능(예: 95.4)'
      },
      { key: 'sort_order', label: '순서', type: 'number' }
    ],
    rowToForm: (row) => ({
      ...row,
      rate: row.rate === null || row.rate === undefined ? '' : String(row.rate)
    }),
    formToPayload: (form) => ({
      ...form,
      year: Number(form.year || 0),
      rate: Number.parseFloat(form.rate)
    }),
    validate: (form) => {
      const year = Number(form.year);
      if (!Number.isInteger(year) || year < 2000 || year > 2100) {
        return '연도는 2000~2100 사이 정수로 입력해 주세요.';
      }
      const rate = Number.parseFloat(form.rate);
      if (!Number.isFinite(rate) || rate < 0 || rate > 100) {
        return '합격률은 0~100 사이 숫자로 입력해 주세요.';
      }
      return '';
    },
    defaults: {
      is_active: true,
      year: new Date().getFullYear(),
      rate: '',
      sort_order: 1
    }
  },

  admissionCaseLogos: {
    title: '대학 로고',
    table: 'admission_case_logos',
    tabs: ADMISSION_CASES_TABS,
    searchPlaceholder: '대학명을 검색하세요',
    order: 'sort_order',
    homepage: true,
    guideText: `수시정시 합격사례 페이지 상단 합격률 아래 대학 로고 줄입니다. 표시 줄에서 지정한 대로 1행/2행에 배치되며, 시안은 1행 7개·2행 5개 구성입니다. 로고는 여백 없이 딱 맞게 크롭한 PNG(투명 배경) / 1MB 이하로 올려 주세요 — 이미지에 여백이 포함되면 다른 로고보다 작아 보입니다. 표시 높이는 로고마다 달라야 자연스럽습니다(시안 기준 1.1~2.4). 너비는 원본 비율에 맞춰 자동 계산됩니다. 투명도는 1이 기본이며 시안에서는 KAIST·UNIST 0.7, 한국외대 0.8을 씁니다. 로고를 한 건이라도 등록하면 기본 제공 로고 12종이 전부 사라지고 등록한 로고만 표시되므로, 등록할 때는 12종을 모두 넣어 주세요.`,
    columns: [
      { key: 'logo_url', label: '로고', type: 'image' },
      { key: 'name', label: '대학명' },
      { key: 'display_height_rem', label: '표시 높이(rem)' },
      { key: 'opacity', label: '투명도' },
      { key: 'row_no', label: '표시 줄' },
      { key: 'sort_order', label: '순서' },
      { key: 'is_active', label: '노출', type: 'boolean' }
    ],
    fields: [
      { key: 'is_active', label: '노출 여부', type: 'radioBoolean', required: true },
      { key: 'name', label: '대학명', type: 'text', required: true, help: '대체 텍스트로도 쓰입니다' },
      {
        key: 'logo_url',
        label: '로고 이미지',
        type: 'image',
        required: true,
        hideUrlInput: true,
        compress: true,
        help: '여백 없이 크롭한 PNG(투명 배경) / 1MB 이하',
        imageSpec: { maxMB: 1 },
        folder: 'admission/university-logos',
        cacheControl: '31536000, immutable'
      },
      {
        key: 'display_height_rem',
        label: '표시 높이(rem)',
        type: 'text',
        required: true,
        help: '시안 기준 1.1~2.4. 소수점 세 자리까지 입력 가능(예: 1.858)'
      },
      {
        key: 'opacity',
        label: '투명도',
        type: 'text',
        required: true,
        help: '0 초과 1 이하. 기본 1, 감광 로고는 0.7 또는 0.8'
      },
      {
        key: 'row_no',
        label: '표시 줄',
        type: 'select',
        required: true,
        options: [
          { value: '1', label: '1행' },
          { value: '2', label: '2행' }
        ],
        help: '시안은 1행 7개 · 2행 5개 구성입니다'
      },
      { key: 'sort_order', label: '순서', type: 'number' }
    ],
    rowToForm: (row) => ({
      ...row,
      display_height_rem:
        row.display_height_rem === null || row.display_height_rem === undefined
          ? ''
          : String(row.display_height_rem),
      opacity: row.opacity === null || row.opacity === undefined ? '' : String(row.opacity),
      row_no: row.row_no === null || row.row_no === undefined ? '1' : String(row.row_no)
    }),
    formToPayload: (form) => ({
      ...form,
      display_height_rem: Number.parseFloat(form.display_height_rem),
      opacity: Number.parseFloat(form.opacity),
      row_no: Number.parseInt(form.row_no, 10)
    }),
    validate: (form) => {
      const height = Number.parseFloat(form.display_height_rem);
      if (!Number.isFinite(height) || height <= 0 || height > 10) {
        return '표시 높이는 0 초과 10 이하 숫자(rem)로 입력해 주세요.';
      }
      const opacity = Number.parseFloat(form.opacity);
      if (!Number.isFinite(opacity) || opacity <= 0 || opacity > 1) {
        return '투명도는 0 초과 1 이하 숫자로 입력해 주세요.';
      }
      const rowNo = Number.parseInt(form.row_no, 10);
      if (rowNo !== 1 && rowNo !== 2) {
        return '표시 줄은 1행 또는 2행 중에서 선택해 주세요.';
      }
      return '';
    },
    defaults: {
      is_active: true,
      name: '',
      logo_url: '',
      display_height_rem: '2',
      opacity: '1',
      row_no: '1',
      sort_order: 1
    }
  },

  pageContents: {
    title: '세부 페이지 관리',
    table: 'page_contents',
    searchPlaceholder: '메뉴명, 페이지명, 주소를 검색하세요',
    order: 'sort_order',
    homepage: true,
    guideText: `페이지 주소가 일반 문자이면 /page/주소로 연결됩니다. 예: services-record-analysis → /page/services-record-analysis / 페이지 주소가 /로 시작하면 실제 기능 페이지로 바로 연결됩니다. 예: /admission/results`,
    columns: [
      { key: 'menu_group_order', label: '상위 순서' },
      { key: 'menu_group', label: '상위 메뉴' },
      { key: 'sort_order', label: '하위 순서' },
      { key: 'menu_label', label: '하위 메뉴' },
      { key: 'slug', label: '페이지 주소' },
      { key: 'title', label: '제목' },
      { key: 'is_active', label: '노출', type: 'boolean' },
      { key: 'image_urls', label: '하단 이미지', type: 'imageList' }
    ],
    fields: [
      { key: 'menu_group_order', label: '상위 메뉴 순서', type: 'number' },
      {
        key: 'menu_group',
        label: '상위 메뉴명',
        type: 'text',
        required: true
      },
      { key: 'sort_order', label: '하위 메뉴 순서', type: 'number' },
      { key: 'menu_label', label: '하위 메뉴명', type: 'text', required: true },
      { key: 'slug', label: '페이지 주소', type: 'text', required: true },
      { key: 'is_active', label: '노출 여부', type: 'radioBoolean', required: true },

      { key: 'title', label: '제목', type: 'text', required: true },
      { key: 'subtitle', label: '부제목', type: 'textarea' },

      { key: 'image_url', label: '상단 이미지', type: 'image' },

      { key: 'body', label: '본문 내용', type: 'textarea' },

      { key: 'image_urls', label: '하단 이미지', type: 'multiImage' },

      { key: 'button_text', label: '버튼명', type: 'text' },
      { key: 'button_link', label: '버튼 링크', type: 'text' }
    ],
    defaults: {
      menu_group_order: 1,
      menu_group: '서비스',
      sort_order: 1,
      menu_label: '',
      slug: '',
      is_active: true,
      title: '',
      subtitle: '',
      body: '',
      image_url: '',
      image_urls: [],
      button_text: '',
      button_link: ''
    }
  },

  // 프리미엄 이용(BOOK) 책자 페이지. 입수 경로 2개(명세 §6 A):
  //   ① PDF 1개 업로드 → 브라우저에서 16장 WebP로 변환 → 미리보기 → [적용] 일괄 upsert (bespoke 패널)
  //   ② 개별 페이지 1장만 고칠 때는 아래 fields/columns 기반 제네릭 편집(PremiumBookAdmin 내부에서
  //      AdminTable/AdminForm을 그대로 재사용)
  // custom: true 는 저장소에 1건뿐이던 하드코딩 삼항(learningDiagnosis → LearningDiagnosisAdmin)을
  // config.CustomComponent로 일반화한 것이다 — 아래 Admin() 렌더 분기, PremiumBookAdmin 참고.
  premiumBookPages: {
    title: '프리미엄 책자 관리',
    table: 'premium_book_pages',
    searchPlaceholder: '',
    // 정정(spec B-1): CONFIGS가 실제로 읽는 키는 order다 — orderColumn은 쿼리 조립부의
    // 지역변수 이름일 뿐이다(Admin.jsx:buildListQuery, `const orderColumn = config.order || 'created_at'`).
    order: 'sort_order',
    homepage: true,
    custom: true,
    CustomComponent: PremiumBookAdmin,
    guideText: `PDF 1개를 올리면 자동으로 각 페이지가 이미지로 변환되어 미리보기 후 [적용]으로 일괄 반영됩니다. 개별 페이지 1장만 교체할 때는 아래 목록에서 해당 행을 수정하세요. 행 단위 교체라 전량 교체 시 신판/구판 혼재 구간이 생길 수 있습니다 — 트래픽이 적은 시간대 작업을 권장합니다. 이미 페이지를 열어둔 사용자는 새로고침 전까지 구 이미지를 봅니다. 페이지 번호(sort_order)는 UNIQUE가 아니라 자유롭게 재배치할 수 있으나, 중복 시 목록 상단에 경고가 표시됩니다.`,
    columns: [
      { key: 'sort_order', label: '페이지 번호' },
      { key: 'image_url', label: '이미지', type: 'image' }
    ],
    fields: [
      { key: 'sort_order', label: '페이지 번호', type: 'number', required: true },
      {
        key: 'image_url',
        label: '이미지',
        type: 'image',
        imageSpec: { maxMB: 2 },
        folder: 'premium-book'
      }
    ],
    // create 모드는 config.defaults만으로 폼을 초기화한다(Admin.jsx AdminForm,
    // `return { ...(config.defaults || {}) }`) — 없으면 sort_order NOT NULL이 23502 raw alert를 띄운다.
    defaults: { sort_order: 1, image_url: '' }
  },

  // 프리미엄 상담 신청 내역 — sql/48_premium_consult.sql(premium_consult_requests)이 정본.
  // 신청자 원본(이름/연락처/이메일/서비스/문의내용)은 운영자가 고칠 이유가 없어 읽기 전용으로 두고
  // status·admin_note만 편집 가능하게 한다. 신규 상담 생성 경로는 공개 신청폼(PremiumApply.jsx)
  // 하나뿐이라 noCreate로 어드민의 수기 생성 자체를 막는다.
  premiumConsults: {
    title: '프리미엄 상담 신청 내역',
    table: 'premium_consult_requests',
    searchPlaceholder: '이름, 연락처, 이메일 검색',
    // loadRows: orderColumn이 'sort_order'가 아니면 내림차순 정렬이라(Admin.jsx:loadRows 참고)
    // created_at을 그대로 지정하면 최신 신청이 목록 맨 위로 온다.
    order: 'created_at',
    noCreate: true,
    // 개인정보(이름·연락처·이메일)가 파일로 통째로 빠져나가므로 이 섹션은 CSV 내보내기를
    // 기본 비활성으로 둔다 — 다운로드 버튼은 config.excel이거나 activeKey 화이트리스트에 있을 때만
    // 뜨는데(Admin.jsx 렌더부), 둘 다 지정하지 않으면 자동으로 숨겨진다.
    rowCapWarning: true, // PostgREST 기본 1000행 상한 — 닿으면 목록 상단에 경고 노출
    retentionNotice:
      '상담 신청 정보(이름·연락처·이메일 등)는 상담 종료 후 2년간 보관합니다. 보관기간이 지난 건은 확인 후 삭제해 주세요.',
    columns: [
      { key: 'created_at', label: '신청일시', type: 'datetime' },
      { key: 'name', label: '이름' },
      { key: 'phone', label: '연락처' },
      { key: 'email', label: '이메일' },
      { key: 'service', label: '상담 서비스' },
      { key: 'message', label: '문의 내용', type: 'truncate' },
      { key: 'status', label: '상태', options: PREMIUM_CONSULT_STATUS_OPTIONS }
    ],
    fields: [
      { key: 'created_at', label: '신청일시', type: 'datetime', readOnly: true },
      { key: 'name', label: '이름', type: 'text', readOnly: true },
      { key: 'phone', label: '연락처', type: 'text', readOnly: true },
      { key: 'email', label: '이메일', type: 'text', readOnly: true },
      { key: 'service', label: '상담 서비스', type: 'text', readOnly: true },
      { key: 'message', label: '문의 내용', type: 'textarea', readOnly: true },
      {
        key: 'status',
        label: '상태',
        type: 'select',
        options: PREMIUM_CONSULT_STATUS_OPTIONS,
        required: true
      },
      { key: 'admin_note', label: '운영 메모', type: 'textarea' }
    ],
    defaults: { status: 'new', admin_note: '' }
  },

  notices: {
    title: '공지사항',
    table: 'notices',
    searchPlaceholder: '공지사항 제목을 검색하세요',
    order: 'sort_order',
    // 공개면(게시판)과 동일한 정렬을 어드민 목록에도 적용해 "보이는 순서 = 노출 순서"를 맞춘다
    orderBy: [
      ['is_pinned', false],
      ['sort_order', true],
      ['created_at', false]
    ],
    homepage: true,
    columns: [
      { key: 'title', label: '제목' },
      { key: 'category', label: '메인 배지' },
      { key: 'is_pinned', label: '중요(상단 고정)', type: 'boolean' },
      { key: 'image_urls', label: '본문 이미지', type: 'imageList' },
      { key: 'attachments', label: '첨부파일', type: 'fileList' },
      { key: 'is_active', label: '노출', type: 'boolean' },
      { key: 'created_at', label: '작성일', type: 'date' },
      { key: 'view_count', label: '조회수' }
    ],
    fields: [
      { key: 'is_active', label: '노출 여부', type: 'radioBoolean', required: true },
      { key: 'title', label: '제목', type: 'text', required: true },
      {
        key: 'category',
        label: '메인페이지 소식 배지',
        type: 'select',
        options: ['보도자료', '파트너십', '공지']
      },
      { key: 'is_pinned', label: '중요(상단 고정)', type: 'checkbox' },
      { key: 'content', label: '내용', type: 'textarea' },
      { key: 'image_urls', label: '본문 이미지', type: 'multiImage' },
      {
        key: 'attachments',
        label: '첨부파일',
        type: 'multiFile',
        accept: '.pdf,.hwp,.hwpx,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.zip,.png,.jpg,.jpeg'
      },
      { key: 'sort_order', label: '순서', type: 'number' }
    ],
    defaults: {
      is_active: true,
      is_pinned: false,
      title: '',
      category: '',
      content: '',
      image_url: '',
      file_url: '',
      file_name: '',
      image_urls: [],
      attachments: [],
      sort_order: 1
    }
  },

  companyNews: {
    title: '회사소식',
    table: 'company_news',
    searchPlaceholder: '회사소식 제목을 검색하세요',
    order: 'sort_order',
    // 공개면(게시판)과 동일한 정렬을 어드민 목록에도 적용해 "보이는 순서 = 노출 순서"를 맞춘다
    orderBy: [
      ['is_pinned', false],
      ['sort_order', true],
      ['created_at', false]
    ],
    homepage: true,
    guideText: `회사소식 페이지 하단 게시판과 메인 페이지 우측 미리보기에 함께 노출됩니다. 회사소개 상단 내용은 '세부 페이지 관리'의 company-intro 항목을 사용합니다.`,
    columns: [
      { key: 'title', label: '제목' },
      { key: 'category', label: '메인 배지' },
      { key: 'is_pinned', label: '중요(상단 고정)', type: 'boolean' },
      { key: 'image_urls', label: '본문 이미지', type: 'imageList' },
      { key: 'attachments', label: '첨부파일', type: 'fileList' },
      { key: 'is_active', label: '노출', type: 'boolean' },
      { key: 'created_at', label: '작성일', type: 'date' },
      { key: 'view_count', label: '조회수' }
    ],
    fields: [
      { key: 'is_active', label: '노출 여부', type: 'radioBoolean', required: true },
      { key: 'title', label: '제목', type: 'text', required: true },
      {
        key: 'category',
        label: '메인페이지 소식 배지',
        type: 'select',
        options: ['보도자료', '파트너십', '공지']
      },
      { key: 'is_pinned', label: '중요(상단 고정)', type: 'checkbox' },
      { key: 'content', label: '내용', type: 'textarea' },
      { key: 'image_urls', label: '본문 이미지', type: 'multiImage' },
      {
        key: 'attachments',
        label: '첨부파일',
        type: 'multiFile',
        accept: '.pdf,.hwp,.hwpx,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.zip,.png,.jpg,.jpeg'
      },
      { key: 'sort_order', label: '순서', type: 'number' }
    ],
    defaults: {
      is_active: true,
      is_pinned: false,
      title: '',
      category: '',
      content: '',
      image_url: '',
      file_url: '',
      file_name: '',
      image_urls: [],
      attachments: [],
      sort_order: 1
    }
  },

  admissionGuidelines: {
    title: '대학별 모집요강',
    table: 'admission_university_resources',
    searchPlaceholder: '대학명, 지역, 전형 내용을 검색하세요',
    order: 'university_name',
    homepage: true,
    // config.excel(공용 CSV 다운로드 스위치) 없음(의도) — 6컬럼(admission_year/
    // region/university_name/matched_hwp_name/detail_status/is_active,
    // 전부 BULK_XLSX_COLUMNS에 포함돼 있어 기능 후퇴 없음) 대신
    // AdmissionBulkXlsxPanel의 23컬럼 xlsx로 통일한다(2026-08-07 사용자
    // 지시 — "엑셀 다운로드 버튼이 여러 개다, 우리가 개발한 걸로
    // 통일해라"). 이 플래그는 14개 메뉴가 공유하는 공용 렌더 코드
    // (:5900 부근)를 켜는 스위치라 여기서만 뺐다 — 다른 config·공용
    // 코드는 손대지 않았다.
    guideText: `대학별 수시 모집요강 상세정보 관리입니다. HTML 표 형식으로 입력하면 홈페이지에서 표 형태로 표시됩니다.`,
    ListSummary: AdmissionListSummary,

    // 목록 '관리' 열의 행 수정(✏️) 버튼을 이 메뉴에서만 숨긴다.
    // 사용자 지시(2026-08-07): "이제 '디테일한 수정'은 필요없어. 여기서
    // 수정버튼을 삭제해줘." — 카테고리 6칸이 각각 [수정] 1클릭으로 편집
    // 다이얼로그를 여는 구조가 되면서 행 전체 폼은 중복 진입점이 됐다.
    //
    // ⚠ 이 플래그를 다른 config 로 복사하지 마라. AdminTable 의 ✏️ 한 줄을
    // 35개 메뉴가 공유하고, settlements 는 같은 버튼을 👁 상세보기로 쓴다.
    // (scripts/verify-admission-admin-entry.mjs 의 entry:2 가 소스 전체에서
    //  hideRowEdit 이 정확히 1회만 등장하는지 락을 건다.)
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
      { key: 'admission_year', label: '연도' },
      { key: 'region', label: '지역' },
      // type:'universityNameMeta' — 대학명 셀을 메타 수정 다이얼로그 진입점으로
      // 만든다. admissionSection과 같은 방식의 **가산된 분기 1개**이고, 이
      // type을 선언하는 config는 여기 하나뿐이라 나머지 35개 메뉴는 기존
      // 폴백(formatValue) 그대로다.
      { key: 'university_name', label: '대학명', type: 'universityNameMeta' },
      { key: 'matched_hwp_name', label: '원문 대학명' },
      { key: 'detail_status', label: '상태' },
      { key: 'is_active', label: '노출', type: 'boolean' },
      ...HWP_SECTION_ORDER.map((key) => ({
        key: `__section_${key}`,
        label: HWP_SECTION_LABELS[key],
        type: 'admissionSection',
        sectionKey: key
      }))
    ],

    fields: [
      { key: 'is_active', label: '노출 여부', type: 'radioBoolean', required: true },

      { key: 'admission_year', label: '입학연도', type: 'number', required: true },
      { key: 'region', label: '지역', type: 'text', required: true },
      { key: 'university_name', label: '대학명', type: 'text', required: true },
      { key: 'university_key', label: '대학 키값', type: 'text', required: true },
      { key: 'matched_hwp_name', label: '원문 대학명', type: 'text' },

      {
        key: 'previous_year_changes_json',
        label: '전년도와 차이점(수시) 문서(정본 — 공개 페이지가 이 문서를 읽습니다)',
        type: 'admissionDoc',
        sectionKey: 'previous_year_changes',
        group: 'previous_year_changes'
      },
      {
        key: 'previous_year_changes',
        label: '전년도와 차이점(수시) 원문(raw)',
        help: '공개 페이지는 위 "문서"(정본)를 읽습니다. 원문만 고치면 화면이 바뀌지 않으니, 고친 뒤 우측 "HWP 원문 파싱 · 미리보기"에서 파싱을 다시 실행해 문서와 HTML 미러를 함께 갱신하세요.',
        type: 'textarea',
        rows: 8,
        group: 'previous_year_changes'
      },
      {
        key: 'previous_year_changes_html',
        label: '전년도와 차이점(수시) HTML(미러, 편집 불가)',
        help: '문서(위)를 편집하면 자동으로 다시 생성됩니다. 이 필드를 직접 고칠 수 없습니다.',
        type: 'textarea',
        rows: 8,
        readOnly: true,
        group: 'previous_year_changes'
      },
      {
        key: 'selection_method_json',
        label: '전형방법 문서(정본 — 공개 페이지가 이 문서를 읽습니다)',
        type: 'admissionDoc',
        sectionKey: 'selection_method',
        group: 'selection_method'
      },
      {
        key: 'selection_method',
        label: '전형방법 원문(raw)',
        help: '공개 페이지는 위 "문서"(정본)를 읽습니다.',
        type: 'textarea',
        rows: 12,
        group: 'selection_method'
      },
      {
        key: 'selection_method_html',
        label: '전형방법 HTML(미러, 편집 불가)',
        help: '문서(위)를 편집하면 자동으로 다시 생성됩니다. 이 필드를 직접 고칠 수 없습니다.',
        type: 'textarea',
        rows: 12,
        readOnly: true,
        group: 'selection_method'
      },
      {
        key: 'minimum_requirements_json',
        label: '최저학력기준 문서(정본 — 공개 페이지가 이 문서를 읽습니다)',
        type: 'admissionDoc',
        sectionKey: 'minimum_requirements',
        group: 'minimum_requirements'
      },
      {
        key: 'minimum_requirements',
        label: '최저학력기준 원문(raw)',
        help: '공개 페이지는 위 "문서"(정본)를 읽습니다.',
        type: 'textarea',
        rows: 12,
        group: 'minimum_requirements'
      },
      {
        key: 'minimum_requirements_html',
        label: '최저학력기준 HTML(미러, 편집 불가)',
        help: '문서(위)를 편집하면 자동으로 다시 생성됩니다. 이 필드를 직접 고칠 수 없습니다.',
        type: 'textarea',
        rows: 12,
        readOnly: true,
        group: 'minimum_requirements'
      },
      {
        key: 'exam_schedule_json',
        label: '대학별고사일 문서(정본 — 공개 페이지가 이 문서를 읽습니다)',
        type: 'admissionDoc',
        sectionKey: 'exam_schedule',
        group: 'exam_schedule'
      },
      {
        key: 'exam_schedule',
        label: '대학별고사일 원문(raw)',
        help: '공개 페이지는 위 "문서"(정본)를 읽습니다.',
        type: 'textarea',
        rows: 10,
        group: 'exam_schedule'
      },
      {
        key: 'exam_schedule_html',
        label: '대학별고사일 HTML(미러, 편집 불가)',
        help: '문서(위)를 편집하면 자동으로 다시 생성됩니다. 이 필드를 직접 고칠 수 없습니다.',
        type: 'textarea',
        rows: 10,
        readOnly: true,
        group: 'exam_schedule'
      },
      {
        key: 'school_record_method_json',
        label: '학생부반영방법 문서(정본 — 공개 페이지가 이 문서를 읽습니다)',
        type: 'admissionDoc',
        sectionKey: 'school_record_method',
        group: 'school_record_method'
      },
      {
        key: 'school_record_method',
        label: '학생부반영방법 원문(raw)',
        help: '공개 페이지는 위 "문서"(정본)를 읽습니다.',
        type: 'textarea',
        rows: 14,
        group: 'school_record_method'
      },
      {
        key: 'school_record_method_html',
        label: '학생부반영방법 HTML(미러, 편집 불가)',
        help: '문서(위)를 편집하면 자동으로 다시 생성됩니다. 이 필드를 직접 고칠 수 없습니다.',
        type: 'textarea',
        rows: 14,
        readOnly: true,
        group: 'school_record_method'
      },
      {
        key: 'recruitment_quota_json',
        label: '모집인원 및 입결 문서(정본 — 공개 페이지가 이 문서를 읽습니다)',
        type: 'admissionDoc',
        sectionKey: 'recruitment_quota',
        group: 'recruitment_quota'
      },
      {
        key: 'recruitment_quota',
        label: '모집인원 및 입결 원문(raw)',
        help: '공개 페이지는 위 "문서"(정본)를 읽습니다.',
        type: 'textarea',
        rows: 12,
        group: 'recruitment_quota'
      },
      {
        key: 'recruitment_result_html',
        label: '모집인원 및 입결 HTML(미러, 편집 불가)',
        help: '문서(위)를 편집하면 자동으로 다시 생성됩니다. 이 필드를 직접 고칠 수 없습니다.',
        type: 'textarea',
        rows: 18,
        readOnly: true,
        group: 'recruitment_quota'
      },
      {
        key: 'jungsi_guideline_url',
        label: '정시모집요강 URL',
        type: 'text'
      },
      {
        // 공개 목록에서 대학명을 눌렀을 때 가는 곳. 위 정시모집요강 URL과는
        // 다른 컬럼이다. hideRowEdit라 이 폼은 신규 등록에서만 열리지만,
        // 여기 없으면 새로 만든 행이 링크 없이 태어난다.
        key: 'official_source_url',
        label: '대학명 링크 URL',
        type: 'text'
      },
      {
        key: 'memo',
        label: '메모',
        type: 'textarea',
        rows: 5
      },
      {
        key: 'detail_status',
        label: '상태',
        type: 'select',
        options: ['상세입력완료', '재가공필요', 'HWP상세페이지미확인']
      }
    ],

    defaults: {
      is_active: true,
      admission_year: 2027,
      region: '',
      university_name: '',
      university_key: '',
      matched_hwp_name: '',
      previous_year_changes: '',
      previous_year_changes_html: '',
      // *_json 6종은 jsonb 컬럼이다 — 빈 문자열('')은 타입 에러를 낸다.
      // sql/43 적용 전에는 컬럼 자체가 없어 select에 안 잡히지만, 적용 후
      // 신규 행을 만들 때(AdminForm이 row 없이 defaults만 스프레드하는
      // 경로) 여기 없으면 undefined가 payload에 실려 upsert가 컬럼을
      // 아예 건드리지 않게 되므로, 명시적으로 null을 채워둔다.
      previous_year_changes_json: null,
      selection_method: '',
      selection_method_html: '',
      selection_method_json: null,
      minimum_requirements: '',
      minimum_requirements_html: '',
      minimum_requirements_json: null,
      exam_schedule: '',
      exam_schedule_html: '',
      exam_schedule_json: null,
      school_record_method: '',
      school_record_method_html: '',
      school_record_method_json: null,
      recruitment_quota: '',
      recruitment_result_html: '',
      recruitment_quota_json: null,
      jungsi_guideline_url: '',
      official_source_url: '',
      memo: '',
      detail_status: '상세입력완료'
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
        if (doc === null || doc === undefined || !validateAdmissionDoc(doc).ok) {
          delete payload[jsonKey];
          return;
        }
        payload[jsonKey] = doc;
      });
      return payload;
    },

    validate: admissionGuidelinesValidate,

    FormPreview: AdmissionParsingPreview
  },

  admissionUniversities: {
    title: '대학 목록 관리',
    table: 'admission_universities',
    searchPlaceholder: '대학명 또는 지역을 검색하세요',
    order: 'sort_order',
    homepage: true,
    guideText: `대학별 모집요강 화면(지역별 대학 목록/지도)에 노출되는 대학 마스터입니다. 일반 대학은 특별군을 비워두고, 경찰대·과학기술원·사관학교만 해당 특별군을 지정하세요.`,

    columns: [
      { key: 'region', label: '지역' },
      { key: 'name', label: '대학명' },
      { key: 'special_group', label: '특별군' },
      { key: 'sort_order', label: '순서' },
      { key: 'is_active', label: '노출', type: 'boolean' }
    ],

    fields: [
      { key: 'is_active', label: '노출 여부', type: 'radioBoolean', required: true },
      { key: 'region', label: '지역', type: 'select', options: ADMISSION_REGION_OPTIONS, required: true },
      { key: 'name', label: '대학명', type: 'text', required: true },
      {
        key: 'special_group',
        label: '특별군',
        type: 'select',
        help: '일반 대학은 비워두세요(선택 안 함). 특별전형 대학군만 지정합니다.',
        options: [
          { value: 'police', label: '경찰대' },
          { value: 'science', label: '과학기술원' },
          { value: 'academy', label: '사관학교' }
        ]
      },
      { key: 'sort_order', label: '순서', type: 'number' }
    ],

    defaults: {
      is_active: true,
      region: '',
      name: '',
      special_group: '',
      sort_order: 0
    }
  },

  admissionResults: {
    title: '입결정보',
    table: 'admission_results',
    searchPlaceholder: '대학명, 모집단위, 전형명을 검색하세요',
    order: 'result_year',
    // 서버 정렬 축을 sql/53의 admission_results_admin_order_idx(result_year desc, id desc)와
    // 맞춘다. id 동점 처리축이 없으면 .range()로 끊어 읽을 때 페이지 경계에서 행이
    // 중복·누락된다(같은 result_year 43k행 안에서 정렬 순서가 매 요청 달라질 수 있다).
    orderBy: [
      ['result_year', false],
      ['id', false]
    ],
    // 43,170행 테이블 — 전량 클라이언트 로드가 불가능해 서버 페이지네이션으로 돌린다.
    // rowCapWarning(1,000행 상한 경고)은 일부러 켜지 않는다: .range()로 PAGE_SIZE행만
    // 받으므로 PostgREST 기본 상한에 닿을 일이 없고, 총 건수는 count로 따로 받는다.
    serverPaginate: true,
    // 서버 ilike 검색 대상. sql/53의 admission_results_search_trgm_idx가 덮는
    // 3컬럼과 같아야 인덱스를 탄다.
    searchColumns: ['university_name', 'department_name', 'admission_track'],
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
    ListSummary: AdmissionResultsListSummary,
    columns: [
      { key: 'result_year', label: '연도' },
      { key: 'university_name', label: '대학명' },
      { key: 'department_name', label: '모집단위' },
      // 중심전형은 유일키 축이라 목록에서 안 보이면 같은 전형명의 교과/종합 2행을
      // 구분할 수 없다. 비운 모집시기 자리를 그대로 이어받는다.
      { key: 'main_track', label: '중심전형' },
      { key: 'screening_category', label: '전형유형' },
      { key: 'admission_track', label: '전형명' },
      { key: 'grade_70', label: '70%컷' },
      { key: 'is_active', label: '노출', type: 'boolean' }
    ],
    fields: [
      { key: 'is_active', label: '노출 여부', type: 'radioBoolean', required: true },
      { key: 'result_year', label: '학년도', type: 'number', required: true },
      { key: 'university_key', label: '대학 키값', type: 'text', required: true },
      { key: 'university_name', label: '대학명', type: 'text', required: true },
      { key: 'department_key', label: '모집단위 키값', type: 'text', required: true },
      { key: 'department_name', label: '모집단위', type: 'text', required: true },
      {
        // 원문 표기 그대로 저장한다 — sql/53의 CHECK가 교과|종합|논술|실기|기타만
        // 허용하므로 '학생부교과' 같은 확장 표기를 넣으면 저장이 즉시 거부된다.
        key: 'main_track',
        label: '중심전형',
        type: 'select',
        options: ['교과', '종합', '논술', '실기', '기타']
      },
      {
        // 실데이터 11종 + 기타. sql/53 CHECK와 같은 도메인이라 여기 없는 값은 저장되지 않는다.
        key: 'screening_category',
        label: '전형유형',
        type: 'select',
        options: [
          '일반',
          '추천형',
          '지역인재',
          '농어촌',
          '기회균형',
          '특성화고',
          '특수교육',
          '논술',
          '실기',
          '성인학습자',
          '재외국민',
          '기타'
        ]
      },
      { key: 'admission_track', label: '전형명', type: 'text', required: true, help: '전형명 원문 그대로 입력합니다.' },
      // 지표 숫자 필드는 전부 nullable — 입력을 비우면 0이 아니라 null로 저장한다
      // ("등급 0"·"경쟁률 0" 같은 값은 존재하지 않고, 전부 미공개를 뜻한다).
      { key: 'grade_50', label: '50%컷', type: 'number', nullable: true },
      { key: 'grade_70', label: '70%컷', type: 'number', nullable: true },
      { key: 'grade_85', label: '85%컷', type: 'number', nullable: true },
      { key: 'grade_90', label: '90%컷', type: 'number', nullable: true },
      // 아래 5종은 sql/53에서 추가된 지표다. 공개 화면(v1)에는 노출하지 않지만
      // 어드민에 필드가 없으면 적재된 값을 조회·수정할 방법이 사라진다.
      { key: 'grade_avg', label: '합격자 평균등급', type: 'number', nullable: true },
      { key: 'grade_min', label: '합격자 최저등급', type: 'number', nullable: true },
      { key: 'grade_avg10', label: '10과목 평균등급', type: 'number', nullable: true },
      { key: 'grade_min10', label: '10과목 최저등급', type: 'number', nullable: true },
      { key: 'grade_first_avg', label: '최초합 평균등급', type: 'number', nullable: true },
      { key: 'converted_score', label: '환산점수', type: 'number', nullable: true },
      { key: 'percentile', label: '백분위', type: 'number', nullable: true },
      { key: 'quota', label: '모집인원', type: 'number', nullable: true },
      {
        // 값 0은 "경쟁률 0"이 아니라 미공개다(적재 시 결측 승격). 어드민에서도 0을
        // 넣지 말고 비워 두어야 공개 화면이 `0.00 : 1`을 정상값처럼 렌더하지 않는다.
        key: 'competition_rate',
        label: '경쟁률',
        type: 'number',
        nullable: true,
        help: '미공개면 비워 두세요. 0을 넣으면 공개 화면에 경쟁률 0.00 : 1로 표시됩니다.'
      },
      { key: 'waitlist_rank', label: '충원순위', type: 'text' },
      { key: 'subject_reflection', label: '반영교과/영역', type: 'text' },
      {
        // 유일키의 마지막 축. 같은 8축 조합이 실제로 2행 이상인 분할모집에서만
        // 1, 2, … 로 올린다. 기본은 0.
        key: 'variant_seq',
        label: '분할모집 순번',
        type: 'number',
        help: '동일 전형이 분할모집으로 여러 행일 때만 0, 1, 2 … 로 구분합니다.'
      },
      { key: 'source_sheet', label: '출처 시트', type: 'text' },
      { key: 'source_row', label: '출처 행번호', type: 'number', nullable: true },
      { key: 'note', label: '메모', type: 'textarea' }
    ],
    defaults: {
      is_active: true,
      result_year: 2026,
      university_key: '',
      university_name: '',
      department_key: '',
      department_name: '',
      main_track: '교과',
      screening_category: '일반',
      admission_track: '',
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
      waitlist_rank: '',
      subject_reflection: '',
      variant_seq: 0,
      source_sheet: '',
      source_row: null,
      note: ''
    }
  },

  trendingDepartments: {
    title: '지금 뜨고 있는 학과',
    table: 'trending_departments',
    searchPlaceholder: '대학명 또는 학과명을 검색하세요',
    order: 'sort_order',
    homepage: true,
    guideText: `랜딩 입결정보 영역에 노출되는 학과 칩 목록입니다. 대학 키값·모집단위 키값을 입력하면 칩 클릭 시 해당 상세로 딥링크되고, 비워두면 칩이 비활성 상태로 표시됩니다.`,
    columns: [
      { key: 'logo_url', label: '로고', type: 'image' },
      { key: 'university_name', label: '대학명' },
      { key: 'department_name', label: '학과명' },
      { key: 'sort_order', label: '순서' },
      { key: 'is_active', label: '노출', type: 'boolean' }
    ],
    fields: [
      { key: 'is_active', label: '노출 여부', type: 'radioBoolean', required: true },
      { key: 'university_name', label: '대학명', type: 'text', required: true },
      { key: 'department_name', label: '학과명', type: 'text', required: true },
      { key: 'university_key', label: '대학 키값', type: 'text', help: '입결정보 상세 딥링크(?u=)용. 비워두면 칩이 비활성으로 표시됩니다.' },
      { key: 'department_key', label: '모집단위 키값', type: 'text', help: '입결정보 상세 딥링크(?d=)용.' },
      {
        key: 'logo_url',
        label: '대학 로고 이미지',
        type: 'image',
        compress: true,
        help: '정방형 권장. 저작권 확인 전까지는 비워둘 수 있습니다.',
        imageSpec: { width: 1, height: 1, aspectOnly: true, maxMB: 1 },
        folder: 'admission/trending-departments',
        cacheControl: '31536000, immutable'
      },
      { key: 'sort_order', label: '순서', type: 'number' }
    ],
    defaults: {
      is_active: true,
      university_name: '',
      department_name: '',
      university_key: '',
      department_key: '',
      logo_url: '',
      sort_order: 0
    }
  },

  admissionSusiJungsi: {
    title: '합격 사례',
    table: 'admission_posts',
    fixedCategories: ['susi', 'jungsi'],
    tabs: ADMISSION_CASES_TABS,
    searchPlaceholder: '합격 사례 게시글 제목을 검색하세요',
    order: 'sort_order',
    homepage: true,
    guideText: `합격 사례 게시글의 첫 번째 본문 이미지를 메인 화면 합격생 카드로 사용할 수 있습니다. '메인 합격생 영역에 노출'을 체크한 게시글만 표시되며, 카드를 누르면 해당 게시글 상세로 이동합니다. 본문은 블록 에디터로 작성합니다.`,
    columns: [
      { key: 'category', label: '구분', options: ADMISSION_CASE_CATEGORY_OPTIONS },
      { key: 'title', label: '제목' },
      { key: 'content', label: '본문', type: 'truncate' },
      { key: 'is_pinned', label: '최상단 고정', type: 'boolean' },
      { key: 'show_on_home', label: '메인 합격생 노출', type: 'boolean' },
      { key: 'image_urls', label: '본문 이미지', type: 'imageList' },
      { key: 'attachments', label: '첨부파일', type: 'fileList' },
      { key: 'is_active', label: '노출', type: 'boolean' },
      { key: 'created_at', label: '작성일', type: 'date' }
    ],
    fields: [
      { key: 'is_active', label: '노출 여부', type: 'radioBoolean', required: true },
      {
        key: 'category',
        label: '구분',
        type: 'select',
        options: ADMISSION_CASE_CATEGORY_OPTIONS,
        required: true
      },
      { key: 'title', label: '제목', type: 'text', required: true },
      { key: 'is_pinned', label: '최상단 고정', type: 'checkbox' },
      { key: 'show_on_home', label: '메인 합격생 영역에 노출', type: 'checkbox' },
      {
        key: 'content',
        label: '내용',
        type: 'blockEditor',
        folder: 'admission-body',
        compress: true,
        imageSpec: { maxMB: 3 }
      },
      { key: 'image_urls', label: '본문 이미지', type: 'multiImage' },
      {
        key: 'attachments',
        label: '첨부파일',
        type: 'multiFile',
        accept: '.pdf,.hwp,.hwpx,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.zip,.png,.jpg,.jpeg'
      },
      { key: 'sort_order', label: '순서', type: 'number' }
    ],
    defaults: {
      category: 'susi',
      is_active: true,
      is_pinned: false,
      show_on_home: false,
      title: '',
      content: '',
      image_url: '',
      file_url: '',
      file_name: '',
      image_urls: [],
      attachments: [],
      sort_order: 1
    },
    // ref pull(blockEditor)은 form.__blocks_<key>에 임시로 실린다 — 정본(content_json)과
    // 평문 미러(content)로 분리해 저장하고 임시 키는 페이로드에서 제거한다.
    formToPayload: (form) => {
      const { __blocks_content, ...rest } = form;
      const blocks = __blocks_content || [];
      return {
        ...rest,
        content_json: { v: 1, editor: 'blocknote@0.52.1', blocks },
        content: blocksToPlainText(blocks)
      };
    }
  },

  galleries: {
    title: '교육칼럼',
    table: 'galleries',
    searchPlaceholder: '교육칼럼 제목을 검색하세요',
    order: 'created_at',
    homepage: true,
    guideText: `교육칼럼 썸네일 이미지: 1200px × 900px / 비율: 4:3 / 형식: JPG 또는 PNG / 권장 용량: 1~2MB 이하 / 목록 썸네일은 4:3 기준으로 중앙 크롭됩니다.`,
    columns: [
      { key: 'title', label: '제목' },
      { key: 'image_urls', label: '이미지', type: 'imageList' },
      { key: 'content', label: '본문', type: 'truncate' },
      { key: 'category', label: '카테고리' },
      { key: 'is_featured', label: '인기', type: 'boolean' },
      { key: 'is_active', label: '노출', type: 'boolean' },
      { key: 'created_at', label: '작성일', type: 'date' }
    ],
    fields: [
      { key: 'is_active', label: '노출 여부', type: 'radioBoolean', required: true },
      { key: 'title', label: '제목', type: 'text', required: true },
      {
        key: 'content',
        label: '본문',
        type: 'blockEditor',
        required: true,
        folder: 'column-body',
        compress: true,
        imageSpec: { maxMB: 3 }
      },
      { key: 'image_urls', label: '이미지', type: 'multiImage' },
      {
        key: 'category',
        label: '카테고리',
        type: 'select',
        // = columnData.js COLUMN_CATEGORIES
        options: [
          '학습관리 방법',
          '수시 및 정시 전략',
          '특목고 입학',
          '해외 및 대학원',
          '입시제도 변화',
          '대학 입시 제로',
          '학생부•수행평가•세특'
        ]
      },
      { key: 'is_featured', label: '이번주 인기 노출', type: 'radioBoolean' }
    ],
    defaults: {
      is_active: true,
      title: '',
      content: '',
      image_url: '',
      image_urls: [],
      category: '학습관리 방법',
      is_featured: false
    },
    // ref pull(blockEditor)은 form.__blocks_<key>에 임시로 실린다 — 정본(content_json)과
    // 평문 미러(content)로 분리해 저장하고 임시 키는 페이로드에서 제거한다.
    formToPayload: (form) => {
      const { __blocks_content, ...rest } = form;
      const blocks = __blocks_content || [];
      return {
        ...rest,
        content_json: { v: 1, editor: 'blocknote@0.52.1', blocks },
        content: blocksToPlainText(blocks)
      };
    }
  },

  faqs: {
    title: '자주하는질문',
    table: 'faqs',
    searchPlaceholder: '질문을 검색하세요',
    order: 'sort_order',
    previewTitleKey: 'question',
    previewLabel: 'FAQ',
    columns: [
      { key: 'category', label: '카테고리' },
      { key: 'question', label: '질문' },
      { key: 'answer', label: '답변', type: 'truncate' },
      { key: 'is_active', label: '노출', type: 'boolean' }
    ],
    fields: [
      { key: 'is_active', label: '노출 여부', type: 'radioBoolean', required: true },
      { key: 'category', label: '카테고리', type: 'select', options: FAQ_CATEGORIES },
      { key: 'question', label: '질문', type: 'text', required: true },
      {
        key: 'answer',
        label: '답변',
        type: 'blockEditor',
        required: true,
        folder: 'faq-body',
        compress: true,
        imageSpec: { maxMB: 3 }
      },
      { key: 'sort_order', label: '순서', type: 'number' }
    ],
    defaults: { is_active: true, category: '', question: '', answer: '', sort_order: 1 },
    // blockEditor(field.key='answer')는 initialContent를 form[`${field.key}_json`]에서 읽는다(관례).
    // 그런데 FAQ의 정본 컬럼명은 answer_json이 아니라 content_json(계약 §2)이라 이름이 어긋난다 —
    // 편집 진입 시 row.content_json을 answer_json으로 옮겨 관례 코드가 그대로 맞물리게 한다.
    rowToForm: (row) => ({ ...row, answer_json: row.content_json }),
    // ref pull(blockEditor)은 form.__blocks_<key>에 임시로 실린다 — 정본(content_json)과
    // 평문 미러(answer)로 분리해 저장하고 임시 키는 페이로드에서 제거한다.
    // 주의: 교육칼럼/합격사례 선례는 평문 미러 컬럼이 content지만 FAQ는 answer다.
    formToPayload: (form) => {
      const { __blocks_answer, answer_json, ...rest } = form;
      const blocks = __blocks_answer || [];
      return {
        ...rest,
        content_json: { v: 1, editor: 'blocknote@0.52.1', blocks },
        answer: blocksToPlainText(blocks)
      };
    }
  },

  // 정본: sql/53_mentor_apply_faq_admin.sql. 공개 소비처는
  // src/components/mentorApply/MentorFaq.jsx이며, DB가 비어 있으면
  // src/data/mentorApply.js 상수로 폴백한다. 위 faqs(자주하는질문)와는
  // 완전히 별개 테이블 — /mentor-apply 페이지 전용 FAQ다.
  mentorApplyFaqs: {
    title: '멘토신청 FAQ',
    table: 'mentor_apply_faqs',
    searchPlaceholder: '질문을 검색하세요',
    order: 'sort_order',
    homepage: true,
    guideText: `답변은 서식 없는 평문이며 줄바꿈만 그대로 반영됩니다. 초기 답변 5개에 붙은 '[예시]'는 확정되지 않은 임시 문구라는 표식입니다 — 실제 문구로 교체하면서 '[예시]' 접두어도 함께 지워 주세요. 문항을 전부 지우면 공개 페이지는 코드에 내장된 기본 문구로 되돌아갑니다(빈 화면이 되지 않습니다).`,
    columns: [
      { key: 'sort_order', label: '노출 순서' },
      { key: 'question', label: '질문' },
      { key: 'answer', label: '답변', type: 'truncate' },
      { key: 'is_active', label: '노출', type: 'boolean' }
    ],
    fields: [
      { key: 'is_active', label: '노출 여부', type: 'radioBoolean', required: true },
      { key: 'sort_order', label: '노출 순서', type: 'number', required: true },
      { key: 'question', label: '질문', type: 'text', required: true },
      { key: 'answer', label: '답변', type: 'textarea' }
    ],
    defaults: { is_active: true, sort_order: 1, question: '', answer: '' }
  },

  // 정본: sql/53_mentor_apply_faq_admin.sql. 공개 소비처는
  // src/components/mentorApply/MentorFaq.jsx의 FAQ 섹션 헤더이며, DB가
  // 비어 있으면 src/data/mentorApply.js 상수로 폴백한다. 키(copy_key)가
  // 정해져 있는 화면이라 행 추가는 막는다(noCreate) — 위 mentorApplyFaqs와
  // 짝을 이루지만 대상 테이블이 다르다.
  mentorApplyCopy: {
    title: '멘토신청 문구',
    table: 'mentor_apply_copy',
    order: 'sort_order',
    noCreate: true,
    homepage: true,
    guideText: `여기 값은 멘토신청 페이지 FAQ 섹션의 제목 영역에 그대로 나갑니다. 'FAQ 제목(앞부분)' 값 끝의 공백 1칸은 의도된 것입니다 — 지우면 공개 화면에서 뒷 단어와 붙어 '지원 전궁금한 점'으로 보입니다. 행을 삭제하면 해당 항목은 코드 내장 기본값으로 되돌아갑니다.`,
    columns: [
      { key: 'label', label: '항목' },
      { key: 'copy_value', label: '값' },
      { key: 'copy_key', label: '키' }
    ],
    fields: [
      { key: 'label', label: '항목', type: 'text', readOnly: true },
      { key: 'copy_key', label: '키', type: 'text', readOnly: true },
      { key: 'copy_value', label: '값', type: 'text', required: true }
    ],
    defaults: {}
  },

  members: {
    title: '회원 목록',
    table: 'profiles',
    searchPlaceholder: '회원명, 아이디, 이메일, 연락처 검색',
    order: 'created_at',
    noCreate: true,
    columns: [
      { key: 'name', label: '이름' },
      { key: 'username', label: '아이디' },
      { key: 'email', label: '이메일' },
      { key: 'phone', label: '연락처' },
      { key: 'member_type', label: '회원유형' },
      { key: 'role', label: '권한' },
      { key: 'created_at', label: '가입일', type: 'date' }
    ],
    fields: [
      { key: 'name', label: '이름', type: 'text', required: true },
      { key: 'username', label: '아이디', type: 'text' },
      { key: 'email', label: '이메일', type: 'text' },
      { key: 'phone', label: '연락처', type: 'text' },
      { key: 'birth_date', label: '생년월일', type: 'date' },
      { key: 'gender', label: '성별', type: 'select', options: ['남성', '여성'] },
      { key: 'region', label: '거주구분', type: 'select', options: ['관내', '관외'] },
      { key: 'school_type', label: '학교구분', type: 'text' },
      { key: 'school_name', label: '학교명', type: 'text' },
      // sql/40_auth_signup.sql profiles_member_type_check와 일치 (구 'teacher' → 'mentor')
      { key: 'member_type', label: '회원유형', type: 'select', options: ['student', 'parent', 'mentor'] },
      { key: 'role', label: '권한', type: 'select', options: ['user', 'admin'] },
      { key: 'is_active', label: '사용 여부', type: 'radioBoolean' },
      { key: 'sms_agreed', label: 'SMS수신동의', type: 'checkbox' },
      { key: 'payment_terminal_id', label: '결제단말기 ID', type: 'text' },
      { key: 'memo', label: '비고', type: 'textarea' }
    ],
    defaults: {}
  },

  enrollments: {
    title: '수강 신청 내역',
    table: 'enrollments',
    searchPlaceholder: '수강생, 보호자, 프로그램 검색',
    order: 'created_at',
    excel: true,
    columns: [
      { key: 'term_name', label: '학기' },
      { key: 'category_name', label: '종목' },
      { key: 'program_name', label: '프로그램' },
      { key: 'class_name', label: '클래스' },
      { key: 'guardian_name', label: '보호자' },
      { key: 'student_name', label: '수강생' },
      { key: 'payment_status', label: '납부상태' },
      { key: 'price', label: '수강료', type: 'money' },
      { key: 'discount_amount', label: '감면액', type: 'money' },
      { key: 'paid_amount', label: '납부액', type: 'money' },
      { key: 'created_at', label: '신청일', type: 'date' }
    ],
    fields: [
      { key: 'term_name', label: '학기', type: 'text' },
      { key: 'category_name', label: '종목', type: 'text' },
      { key: 'program_name', label: '프로그램', type: 'text' },
      { key: 'class_name', label: '클래스', type: 'text' },
      { key: 'guardian_name', label: '보호자', type: 'text' },
      { key: 'student_name', label: '수강생', type: 'text', required: true },
      { key: 'phone', label: '연락처', type: 'text' },
      { key: 'grade', label: '학년', type: 'text' },
      { key: 'school_name', label: '학교명', type: 'text' },
      {
        key: 'payment_status',
        label: '납부상태',
        type: 'select',
        options: ['납부대기', '납부완료', '미납', '취소요청', '환불완료']
      },
      { key: 'price', label: '수강료', type: 'number' },
      { key: 'discount_amount', label: '감면액', type: 'number' },
      { key: 'paid_amount', label: '납부액', type: 'number' },
      { key: 'memo', label: '비고', type: 'textarea' }
    ],
    defaults: {
      payment_status: '납부대기',
      price: 0,
      discount_amount: 0,
      paid_amount: 0
    }
  },

  // 멘토(콜멘토) 지원서 조회 — 30여 개 필드 + 동의 5종 + 비공개 버킷 증빙 파일이라
  // columns/fields 기반 제네릭 AdminTable/AdminForm에 그대로 얹기 어렵다(특히 파일 열람은
  // createSignedUrl이 필요해 제네릭 image/file 필드의 getPublicUrl 관용구를 쓸 수 없다).
  // custom: true + CustomComponent로 premiumBookPages와 동일한 패턴을 따르되, 목록만은
  // AdminTable을 재사용한다(파일 하단 MentorApplicationsAdmin 참고). columns는 그 목록에서만
  // 쓰인다 — 상세/상태변경은 컴포넌트 내부 bespoke 렌더링.
  mentorApplications: {
    title: '멘토 신청 내역',
    table: 'mentor_applications',
    searchPlaceholder: '이름, 대학교, 휴대폰 검색',
    order: 'created_at',
    readOnly: true,
    custom: true,
    CustomComponent: MentorApplicationsAdmin,
    columns: [
      { key: 'created_at', label: '제출일', type: 'date' },
      { key: 'name', label: '이름' },
      { key: 'university', label: '대학교' },
      { key: 'major', label: '학과·학부' },
      { key: 'phone', label: '휴대폰', type: 'maskedPhone' },
      { key: 'status', label: '상태', options: MENTOR_APPLICATION_STATUS_OPTIONS }
    ]
  },

  programCategories: {
    title: '핵심 서비스',
    table: 'program_categories',
    searchPlaceholder: '핵심 서비스명을 검색하세요',
    order: 'sort_order',
    homepage: true,
    guideText: `랜딩 '핵심 서비스'에는 사용 중 항목이 최대 6개까지 노출됩니다. 설명 입력 시 줄바꿈(Enter)한 위치가 랜딩 카드에 그대로 반영됩니다. 카드 1개당 2줄 배치를 권장합니다.`,
    columns: [
      { key: 'name', label: '명칭' },
      { key: 'description', label: '설명' },
      { key: 'link', label: '연결 페이지' },
      { key: 'icon_image_url', label: '카드 일러스트', type: 'image' },
      { key: 'icon', label: '아이콘' },
      { key: 'sort_order', label: '순서' },
      { key: 'is_active', label: '사용', type: 'boolean' }
    ],
    fields: [
      { key: 'is_active', label: '사용 여부', type: 'radioBoolean', required: true },
      { key: 'name', label: '명칭', type: 'text', required: true },
      {
        key: 'description',
        label: '설명',
        type: 'textarea',
        help: '줄바꿈이 랜딩 카드에 그대로 반영'
      },
      { key: 'link', label: '연결 페이지', type: 'text' },
      {
        key: 'icon_image_url',
        label: '카드 일러스트 이미지',
        type: 'image',
        compress: true,
        imageSpec: { maxMB: 1 },
        folder: 'landing/services',
        cacheControl: '31536000, immutable'
      },
      {
        key: 'icon',
        label: '아이콘',
        type: 'select',
        options: [
          'target',
          'brain',
          'file',
          'graduation',
          'chart',
          'users',
          'clipboard',
          'edit',
          'star',
          'default'
        ]
      },
      { key: 'sort_order', label: '순서', type: 'number' }
    ],
    defaults: {
      is_active: true,
      name: '',
      description: '',
      link: '/services',
      icon: 'default',
      icon_image_url: '',
      sort_order: 1
    }
  },

  dailyEntries: {
    title: '일일 입장',
    table: 'daily_entries',
    searchPlaceholder: '이름, 프로그램, 클래스 검색',
    order: 'entry_date',
    excel: true,
    columns: [
      { key: 'entry_date', label: '입장일', type: 'date' },
      { key: 'name', label: '이름' },
      { key: 'phone', label: '연락처' },
      { key: 'program_name', label: '프로그램' },
      { key: 'class_name', label: '클래스' },
      { key: 'memo', label: '비고' }
    ],
    fields: [
      { key: 'entry_date', label: '입장일', type: 'date' },
      { key: 'name', label: '이름', type: 'text', required: true },
      { key: 'phone', label: '연락처', type: 'text' },
      { key: 'program_name', label: '프로그램', type: 'text' },
      { key: 'class_name', label: '클래스', type: 'text' },
      { key: 'memo', label: '비고', type: 'textarea' }
    ],
    defaults: { entry_date: new Date().toISOString().slice(0, 10), name: '' }
  },

  usageStatus: {
    title: '이용 현황',
    table: 'usage_status',
    searchPlaceholder: '프로그램, 클래스 검색',
    order: 'created_at',
    excel: true,
    columns: [
      { key: 'term_name', label: '학기' },
      { key: 'category_name', label: '종목' },
      { key: 'program_name', label: '프로그램' },
      { key: 'class_name', label: '클래스' },
      { key: 'capacity', label: '정원' },
      { key: 'applicant_count', label: '신청자' },
      { key: 'confirmed_count', label: '확정자' },
      { key: 'remaining_count', label: '잔여석' },
      { key: 'status', label: '상태' }
    ],
    fields: [
      { key: 'term_name', label: '학기', type: 'text' },
      { key: 'category_name', label: '종목', type: 'text' },
      { key: 'program_name', label: '프로그램', type: 'text' },
      { key: 'class_name', label: '클래스', type: 'text', required: true },
      { key: 'capacity', label: '정원', type: 'number' },
      { key: 'applicant_count', label: '신청자', type: 'number' },
      { key: 'confirmed_count', label: '확정자', type: 'number' },
      { key: 'remaining_count', label: '잔여석', type: 'number' },
      { key: 'status', label: '상태', type: 'text' }
    ],
    defaults: { capacity: 0, applicant_count: 0, confirmed_count: 0, remaining_count: 0 }
  },

  learningDiagnosis: {
    title: '학습진단 관리',
    custom: true,
    searchPlaceholder: ''
  },

  // sql/72_learning_diagnosis_v2_survey_copy.sql — ver2 설문(renewalSurveyQuestions.js) 문항의
  // 표시 문구만 어드민화한 것. scoringId/optionCodes 등 채점 구조는 이 화면에 없다 — 있으면 안 된다
  // (라벨 문자열 1자 수정이 채점을 조용히 깨는 걸 막으려고 코드/문구를 애초에 분리했다).
  learningDiagnosisV2SurveyCopy: {
    title: '학습진단(ver2) 문항 문구',
    table: 'learning_diagnosis_v2_survey_copy',
    order: 'sort_order',
    noCreate: true,
    homepage: true,
    guideText: `여기 값은 서비스 > 학습진단 설문(문항 제목·안내문구·선택지·리커트 문장)에 그대로 나갑니다. 행을 삭제하면 해당 항목은 코드 내장 기본값으로 되돌아갑니다. 채점 방식(어떤 답이 몇 점인지, 어떤 서비스로 이어지는지)은 이 화면에서 바꿀 수 없습니다 — 문구만 바뀌고 채점은 그대로입니다.`,
    columns: [
      { key: 'label', label: '항목' },
      { key: 'copy_value', label: '값' },
      { key: 'copy_key', label: '키' }
    ],
    fields: [
      { key: 'label', label: '항목', type: 'text', readOnly: true },
      { key: 'copy_key', label: '키', type: 'text', readOnly: true },
      { key: 'copy_value', label: '값', type: 'text', required: true }
    ],
    defaults: {}
  },

  winningSuhaengTopicDb: {
    title: '위닝 수행 주제 DB',
    table: 'winning_assessment_knowledge_items',
    searchPlaceholder: '학년, 교과군, 진로, 주제 패턴명, 관련 자료를 검색하세요',
    order: 'created_at',
    excel: true,
    fixedValues: { knowledge_type: 'topic_pattern' },
    columns: [
      { key: 'grade', label: '학년' },
      { key: 'subject', label: '교과군' },
      { key: 'career_field', label: '진로분야' },
      { key: 'title', label: '주제 패턴명 / 관련 자료' },
      { key: 'source', label: '출처' },
      { key: 'is_active', label: '사용', type: 'boolean' },
      { key: 'created_at', label: '등록일', type: 'date' }
    ],
    fields: [
      { key: 'is_active', label: '사용 여부', type: 'radioBoolean', required: true },
      {
        key: 'grade',
        label: '학년',
        type: 'select',
        options: ['고1', '고2', '고3', '공통', '전체', '확인 필요'],
        required: true
      },
      {
        key: 'subject',
        label: '교과군',
        type: 'select',
        options: ['국어', '수학', '영어', '사회역사', '과학', '정보', '공통', '전체', '확인 필요'],
        required: true
      },
      { key: 'career_field', label: '진로분야', type: 'text' },
      {
        key: 'title',
        label: '주제 패턴명 / 관련 자료',
        type: 'text',
        required: true
      },
      {
        key: 'content',
        label: '주제 추천 패턴 내용',
        type: 'textarea',
        required: true
      },
      { key: 'source', label: '출처', type: 'text' },
      { key: 'source_link', label: '출처 링크', type: 'text' },
      {
        key: 'memo',
        label: '메모',
        type: 'textarea'
      }
    ],
    defaults: {
      is_active: true,
      grade: '확인 필요',
      subject: '확인 필요',
      knowledge_type: 'topic_pattern',
      career_field: '',
      title: '',
      content: '',
      source: '선배 생기부 PDF / 내부 우수사례',
      source_link: '',
      memo: ''
    }
  },

  winningSuhaengResourceDb: {
    title: '위닝 수행 자료 DB',
    table: 'winning_assessment_knowledge_items',
    searchPlaceholder: '학년, 교과군, 진로, 실제 자료명, 검색 키워드, 출처를 검색하세요',
    order: 'created_at',
    excel: true,
    fixedValues: { knowledge_type: 'verified_resource' },
    columns: [
      { key: 'grade', label: '학년' },
      { key: 'subject', label: '교과군' },
      { key: 'career_field', label: '진로분야' },
      { key: 'title', label: '실제 자료명 / 검색 키워드' },
      { key: 'source', label: '저자·기관·링크·출처' },
      { key: 'is_active', label: '사용', type: 'boolean' },
      { key: 'created_at', label: '등록일', type: 'date' }
    ],
    fields: [
      { key: 'is_active', label: '사용 여부', type: 'radioBoolean', required: true },
      {
        key: 'grade',
        label: '학년',
        type: 'select',
        options: ['고1', '고2', '고3', '공통', '전체', '확인 필요'],
        required: true
      },
      {
        key: 'subject',
        label: '교과군',
        type: 'select',
        options: ['국어', '수학', '영어', '사회역사', '과학', '정보', '공통', '전체', '확인 필요'],
        required: true
      },
      { key: 'career_field', label: '진로분야', type: 'text' },
      {
        key: 'title',
        label: '실제 자료명 / 검색 키워드',
        type: 'text',
        required: true
      },
      {
        key: 'content',
        label: '자료 핵심 내용 / 활용 방식 / 주의점',
        type: 'textarea',
        required: true
      },
      {
        key: 'source',
        label: '저자·기관·링크·출처 정보',
        type: 'text'
      },
      { key: 'source_link', label: '출처 링크', type: 'text' },
      { key: 'memo', label: '메모', type: 'textarea' }
    ],
    defaults: {
      is_active: true,
      grade: '확인 필요',
      subject: '확인 필요',
      knowledge_type: 'verified_resource',
      career_field: '',
      title: '',
      content: '',
      source: '',
      source_link: '',
      memo: ''
    }
  },

  winningSetukDb: {
    title: '위닝 세특 DB',
    comingSoon: true,
    description: '추후 별도 Supabase와 연동 예정입니다. 현재는 메뉴명만 선반영했습니다.'
  },

  winningDeepReportDb: {
    title: '위닝 심화보고서 DB',
    comingSoon: true,
    description: '추후 별도 Supabase와 연동 예정입니다. 현재는 메뉴명만 선반영했습니다.'
  },

  winningStudentRecordDb: {
    title: '위닝 생기부 DB',
    table: 'winning_assessment_knowledge_items',
    searchPlaceholder: '학년, 교과군, 진로, 생기부 패턴, 자료명을 검색하세요',
    order: 'created_at',
    excel: true,
    fixedValues: { knowledge_type: 'student_record_pattern' },
    columns: [
      { key: 'grade', label: '학년' },
      { key: 'subject', label: '교과군' },
      { key: 'career_field', label: '진로분야' },
      { key: 'title', label: '사례명' },
      { key: 'source', label: '출처/원본' },
      { key: 'is_active', label: '사용', type: 'boolean' },
      { key: 'created_at', label: '등록일', type: 'date' }
    ],
    fields: [
      { key: 'is_active', label: '사용 여부', type: 'radioBoolean', required: true },
      {
        key: 'grade',
        label: '학년',
        type: 'select',
        options: ['고1', '고2', '고3', '공통', '전체', '확인 필요'],
        required: true
      },
      {
        key: 'subject',
        label: '교과군',
        type: 'select',
        options: ['국어', '수학', '영어', '사회역사', '과학', '공통', '전체', '확인 필요'],
        required: true
      },
      { key: 'career_field', label: '진로분야', type: 'text' },
      { key: 'title', label: '사례명', type: 'text', required: true },
      {
        key: 'content',
        label: '생기부 패턴 텍스트',
        type: 'textarea',
        required: true
      },
      { key: 'source', label: '출처/원본 파일명', type: 'text' },
      { key: 'source_link', label: '출처 링크', type: 'text' },
      { key: 'memo', label: '메모', type: 'textarea' }
    ],
    defaults: {
      is_active: true,
      grade: '확인 필요',
      subject: '확인 필요',
      knowledge_type: 'student_record_pattern',
      career_field: '',
      title: '',
      content: '',
      source: '선배 생기부 PDF / 내부 우수사례',
      source_link: '',
      memo: ''
    }
  },

  winningBaseData: {
    title: '기초데이터추출',
    table: 'winning_base_data',
    searchPlaceholder: '자료명을 검색하세요',
    order: 'sort_order',
    excel: true,
    columns: [
      { key: 'data_type', label: '자료구분' },
      { key: 'title', label: '자료명' },
      { key: 'source', label: '출처' },
      { key: 'is_active', label: '사용', type: 'boolean' }
    ],
    fields: [
      { key: 'is_active', label: '사용 여부', type: 'radioBoolean', required: true },
      { key: 'data_type', label: '자료구분', type: 'text' },
      { key: 'title', label: '자료명', type: 'text', required: true },
      { key: 'source', label: '출처', type: 'text' },
      { key: 'content', label: '내용', type: 'textarea' },
      { key: 'memo', label: '메모', type: 'textarea' },
      { key: 'sort_order', label: '순서', type: 'number' }
    ],
    defaults: { is_active: true, data_type: '', title: '', content: '', source: '', sort_order: 1 }
  },

  winningDbInputs: {
    title: '위닝DB입력',
    table: 'winning_db_inputs',
    searchPlaceholder: '입력 자료명을 검색하세요',
    order: 'created_at',
    excel: true,
    columns: [
      { key: 'input_type', label: '입력구분' },
      { key: 'title', label: '자료명' },
      { key: 'memo', label: '메모' },
      { key: 'created_at', label: '등록일', type: 'date' }
    ],
    fields: [
      { key: 'input_type', label: '입력구분', type: 'text' },
      { key: 'title', label: '자료명', type: 'text', required: true },
      { key: 'raw_data', label: '원본 데이터', type: 'textarea' },
      { key: 'memo', label: '메모', type: 'textarea' }
    ],
    defaults: { input_type: '', title: '', raw_data: '', memo: '' }
  },

  payments: {
    title: '매출 조정',
    table: 'payments',
    searchPlaceholder: '결제자, 프로그램 검색',
    order: 'paid_at',
    excel: true,
    columns: [
      { key: 'payer_name', label: '수강자명' },
      { key: 'program_name', label: '프로그램' },
      { key: 'class_name', label: '클래스' },
      { key: 'payment_method', label: '납부유형' },
      { key: 'sale_amount', label: '판매금액', type: 'money' },
      { key: 'discount_amount', label: '감면액', type: 'money' },
      { key: 'paid_amount', label: '납부금액', type: 'money' },
      { key: 'status', label: '상태', type: 'select', options: PAYMENT_STATUS_OPTIONS },
      { key: 'paid_at', label: '납부일시', type: 'date' }
    ],
    fields: [
      { key: 'payer_name', label: '수강자명', type: 'text', required: true },
      { key: 'program_name', label: '프로그램', type: 'text' },
      { key: 'class_name', label: '클래스', type: 'text' },
      { key: 'payment_method', label: '납부유형', type: 'text' },
      { key: 'sale_amount', label: '판매금액', type: 'number' },
      { key: 'discount_amount', label: '감면액', type: 'number' },
      { key: 'paid_amount', label: '납부금액', type: 'number' },
      { key: 'status', label: '상태', type: 'select', options: PAYMENT_STATUS_OPTIONS },
      { key: 'memo', label: '비고', type: 'textarea' }
    ],
    defaults: { payer_name: '', sale_amount: 0, discount_amount: 0, paid_amount: 0, status: 'paid' }
  },

  settlements: {
    title: '매출 정산',
    table: 'payments',
    searchPlaceholder: '정산 내역 검색',
    order: 'paid_at',
    readOnly: true,
    excel: true,
    columns: [
      { key: 'payer_name', label: '수강자명' },
      { key: 'program_name', label: '프로그램' },
      { key: 'class_name', label: '클래스' },
      { key: 'sale_amount', label: '판매금액', type: 'money' },
      { key: 'discount_amount', label: '감면액', type: 'money' },
      { key: 'paid_amount', label: '실납부금액', type: 'money' },
      { key: 'paid_at', label: '결제일', type: 'date' }
    ]
  },

  dailySettlements: {
    title: '일일정산',
    table: 'daily_settlements',
    searchPlaceholder: '정산일 검색',
    order: 'settlement_date',
    excel: true,
    columns: [
      { key: 'settlement_date', label: '정산일', type: 'date' },
      { key: 'total_sale_amount', label: '판매금액', type: 'money' },
      { key: 'total_discount_amount', label: '감면액', type: 'money' },
      { key: 'total_paid_amount', label: '실납부금액', type: 'money' },
      { key: 'total_refund_amount', label: '환불금액', type: 'money' },
      { key: 'memo', label: '비고' }
    ],
    fields: [
      { key: 'settlement_date', label: '정산일', type: 'date' },
      { key: 'total_sale_amount', label: '판매금액', type: 'number' },
      { key: 'total_discount_amount', label: '감면액', type: 'number' },
      { key: 'total_paid_amount', label: '실납부금액', type: 'number' },
      { key: 'total_refund_amount', label: '환불금액', type: 'number' },
      { key: 'memo', label: '비고', type: 'textarea' }
    ],
    defaults: {
      settlement_date: new Date().toISOString().slice(0, 10),
      total_sale_amount: 0,
      total_discount_amount: 0,
      total_paid_amount: 0,
      total_refund_amount: 0
    }
  },

  // 관리자 수기 대장(admin_refunds/refunds, sql/00_base_schema.sql:882) — 고객이
  // fn_request_refund 로 신청한 게 아니라 운영자가 직접 기록하는 별도 원장이다.
  // dev 실측 0행이지만 운영 DB엔 있을 수 있어 없애지 않는다(팀 리드 지시,
  // 2026-08-11). 아래 refundRequests(고객 신청 원장, refund_requests 테이블)와
  // 라벨이 '환불 요청 내역' vs '환불 신청 내역'으로 거의 같아 혼동을 일으켰다
  // (2026-08-12 재정정) — 이 탭 라벨을 '환불 수기 대장'으로 바꿔 관리자 직접
  // 기록용임을 드러낸다. 같은 이유로 이 탭의 상태 변경은 읽기 전용으로
  // 막는다(readOnly) — fn_complete_refund 를 거치지 않는 제네릭 PATCH 로
  // '환불완료'를 찍을 수 있던 경로를 여기서도 차단한다(①과 동일 원칙).
  refunds: {
    title: '환불 수기 대장',
    table: 'refunds',
    searchPlaceholder: '환불 요청 검색',
    order: 'requested_at',
    readOnly: true,
    excel: true,
    columns: [
      { key: 'payer_name', label: '수강자명' },
      { key: 'program_name', label: '프로그램' },
      { key: 'class_name', label: '클래스' },
      { key: 'paid_amount', label: '납부금액', type: 'money' },
      { key: 'refund_amount', label: '환불금액', type: 'money' },
      { key: 'reason', label: '사유' },
      { key: 'status', label: '상태' }
    ],
    fields: [
      { key: 'payer_name', label: '수강자명', type: 'text' },
      { key: 'program_name', label: '프로그램', type: 'text' },
      { key: 'class_name', label: '클래스', type: 'text' },
      { key: 'paid_amount', label: '납부금액', type: 'number' },
      { key: 'refund_amount', label: '환불금액', type: 'number' },
      { key: 'reason', label: '사유', type: 'text' },
      { key: 'status', label: '상태', type: 'select', options: ['취소요청', '환불완료', '반려'] },
      { key: 'memo', label: '비고', type: 'textarea' }
    ],
    defaults: { status: '취소요청', paid_amount: 0, refund_amount: 0 }
  },

  // fn_request_refund(sql/59_refund_request_hardening.sql)로 고객이 신청한 환불
  // 원장. 이전에는 이 화면의 '환불 요청 내역' 탭이 위 refunds(관리자 수기
  // 대장)를 읽어 아무도 고객 신청을 보지 못했다 — 이 config 가 그 간극을
  // 메운다(팀 리드 지시, 2026-08-11). RLS 는 어드민 select/update 만 열려
  // 있다(refund_requests_admin_select_all / _admin_update_all, sql/59) — insert
  // 정책이 없어(RPC 전용) noCreate: true 로 등록 버튼을 감춘다. delete 정책도
  // 없다(처리 상태는 status UPDATE 로 남기고 원장 행을 지우지 않는다는 원칙,
  // sql/55 coupon_redemptions 와 같은 설계) — 다만 AdminTable 은 config 로
  // 삭제 버튼만 따로 끄는 수단이 없어(readOnly 는 편집 자체를 막아버려 status
  // 처리가 안 된다) 버튼 자체는 남는다. 눌러도 RLS 가 막아 실패 alert 만 뜬다.
  //
  // status 는 DB CHECK(requested|processing|completed|rejected)라 한국어
  // 리터럴을 쓰면 안 된다(이 저장소가 이미 겪은 반복 결함 — 어드민 폼이 한글
  // '납부'를 영문 CHECK 컬럼에 써 payments 등록이 늘 실패하는 것과 같은 유형).
  // select 옵션을 {value, label} 로 나눠 저장은 영문, 표시는 한글로 분리한다.
  // 라벨 4종은 MyPage.jsx REFUND_STATUS 를 그대로 재사용한다(팀 리드 승인
  // 재사용 범위, 2026-08-11).
  //
  // 그 외 컬럼(order_id/order_name/amount/reason/user_id/refund_bank/
  // refund_account/refund_holder/admin_memo/created_at) 라벨은 팀 리드가
  // 승인한 코퍼스 규범 문자열이다(2026-08-11).
  refundRequests: {
    title: '환불 신청 내역', // MyPage.jsx:642 재사용(같은 데이터의 고객 쪽 헤딩)
    table: 'refund_requests',
    searchPlaceholder: '환불 신청 검색',
    excel: true,
    noCreate: true,
    columns: [
      { key: 'order_id', label: '주문번호' },
      { key: 'amount', label: '환불 신청 금액', type: 'money' },
      { key: 'reason', label: '신청 사유' },
      {
        key: 'approval_status',
        label: '승인 여부',
        type: 'select',
        options: REFUND_APPROVAL_STATUS_OPTIONS
      },
      { key: 'status', label: '상태', type: 'select', options: REFUND_REQUEST_STATUS_OPTIONS },
      { key: 'created_at', label: '신청 일시', type: 'date' }
    ],
    fields: [
      { key: 'user_id', label: '신청자', type: 'text' },
      { key: 'order_id', label: '주문번호', type: 'text' },
      { key: 'order_name', label: '주문명', type: 'text' },
      { key: 'amount', label: '환불 신청 금액', type: 'number' },
      { key: 'reason', label: '신청 사유', type: 'textarea' },
      { key: 'refund_bank', label: '은행', type: 'text' },
      { key: 'refund_account', label: '계좌번호', type: 'text' },
      { key: 'refund_holder', label: '예금주', type: 'text' },
      // completed 는 select 에서 뺐다 — fn_complete_refund RPC 전용(위
      // REFUND_REQUEST_STATUS_EDIT_OPTIONS 주석 참고, WC038 트리거).
      { key: 'status', label: '상태', type: 'select', options: REFUND_REQUEST_STATUS_EDIT_OPTIONS },
      { key: 'admin_memo', label: '관리자 메모', type: 'textarea' }
    ]
  },

  // custom: true 는 Admin() 최상단 렌더 분기가 제네릭 list/create/edit 경로를
  // 통째로 건너뛰게 한다(loadRows 도 early return). CustomComponent 지정은
  // premiumBookPages 와 같은 일반화 지점이다.
  coupons: {
    title: '쿠폰관리',
    custom: true,
    CustomComponent: CouponAdmin,
    searchPlaceholder: ''
  },

  // -------------------------------------------------------------------
  // 목표관리 (docs/figma-goal/goal-admin-spec.md §4-2 / §4-3)
  // 탭 2개다 — 대학 컷 관리(§4-2, 표준 CRUD + ListSummary 3블록)와
  // 학생 현황(§4-3, custom 컴포넌트). 두 config 는 서로 아무것도 공유하지
  // 않으므로 각각 독립적으로 읽고 고칠 수 있다.
  // -------------------------------------------------------------------

  goalUniversityCuts: {
    title: '목표관리 대학 컷',
    table: 'goal_university_cuts',
    searchPlaceholder: '대학명 또는 학과명을 검색하세요',
    // 동점 처리축 id 필수. 없으면 .range() 페이지 경계에서 행이 중복·누락된다
    // (같은 논리를 admissionResults가 이미 쓴다 — 이 파일의 orderBy 주석 참고).
    orderBy: [
      ['university_name', true],
      ['department_name', true],
      ['cut_type', true],
      ['id', true]
    ],
    // 백필 후 13,000행 이상. PostgREST 기본 1,000행 상한을 크게 넘는다.
    serverPaginate: true,
    searchColumns: ['university_name', 'department_name'],
    homepage: true,
    // excel / rowCapWarning은 선언하지 않는다 — 엑셀 버튼 2개 공존 금지(2026-08-07
    // 사용자 지시), serverPaginate를 켰으므로 행수 경고도 불필요.
    guideText: `학생 온보딩의 목표 대학 확률 산출에 쓰이는 컷 기준표입니다. 이 표에 있는 조합만 학생이 고를 수 있습니다 — 여기서 지우거나 노출을 끄면 온보딩 대학 목록에서도 사라집니다.
⚠ 컷 값의 단위가 종류에 따라 다릅니다. 수시(일반고/특목·자사고)는 내신 등급 1~9(작을수록 우세), 정시는 백분위 0~100(클수록 우세)입니다. 섞여 들어가면 합격 확률의 우열이 통째로 뒤집힙니다.
🔴 학과명은 반드시 채워 주세요. 학과명이 빈 행은 어떤 학생에게도 매칭되지 않습니다 — 온보딩이 학과를 필수로 요구하고, 확률 조회가 학과명 완전일치로 이뤄지기 때문입니다.
🔴 정시 컷은 같은 (대학, 학과)의 수시 컷과 글자 하나까지 같아야 정시 확률이 산출됩니다. 수시 컷 행의 대학명·학과명을 그대로 복사해 넣어 주세요.
컷을 고쳐도 이미 온보딩을 마친 학생의 확률은 바뀌지 않습니다 — 학생의 확률은 온보딩 시점의 컷으로 확정됩니다.`,
    ListSummary: GoalCutsListSummary,
    columns: [
      { key: 'cut_type', label: '컷 종류', options: GOAL_CUT_TYPE_OPTIONS },
      { key: 'university_name', label: '대학' },
      // department_name은 공용 formatValue 그대로 둔다 — 빈 값은 '-'로 나오고,
      // 빈 학과명 행은 정상 운영에서 생기지 않는다(폼·엑셀·백필 모두 필수).
      { key: 'department_name', label: '학과' },
      {
        key: 'avg_cut',
        label: '컷 값',
        // 🔴 목록에서 2.35(등급)와 87.5(백분위)가 단위 없이 섞여 보이면 스케일
        // 혼입을 눈으로 잡을 수 없다. formatValue는 (value, type, options)만 받아
        // 같은 행의 cut_type을 볼 수 없으므로 공용 훅 column.render(row)를 쓴다.
        render: (row) => {
          const value = row?.avg_cut;
          if (value === null || value === undefined || value === '') return '-';
          const unit = GOAL_CUT_RANGE[row?.cut_type]?.unit || '';
          return `${value}${unit}`;
        }
      },
      { key: 'source', label: '출처', options: GOAL_CUT_SOURCE_OPTIONS },
      { key: 'source_year', label: '기준 연도' },
      { key: 'is_active', label: '노출', type: 'boolean' },
      { key: 'updated_at', label: '수정일', type: 'datetime' }
    ],
    fields: [
      { key: 'is_active', label: '노출 여부', type: 'radioBoolean', required: true },
      {
        key: 'cut_type',
        label: '컷 종류',
        type: 'select',
        required: true,
        options: GOAL_CUT_TYPE_OPTIONS,
        // 편집 모드(row 있음)에서는 읽기 전용 텍스트로 렌더한다 —
        // AdminForm이 readOnly 필드에는 AdminInput을 아예 호출하지 않고
        // formatValue로 정적 텍스트를 그린다(options 라벨 매핑 포함).
        // ⚠ 이건 사용성 개선일 뿐 방어가 아니다. 실질 차단은 validate 규칙 0이다.
        resolve: (form, row) =>
          row
            ? {
                readOnly: true,
                help: '기존 행의 컷 종류는 바꿀 수 없습니다. 종류를 바꾸려면 이 행을 삭제한 뒤 새로 등록해 주세요 — 등급 3.2짜리 행을 정시로 바꾸면 "백분위 3.2"로 읽혀 합격 확률의 우열이 통째로 뒤집힙니다.'
              }
            : {}
      },
      {
        key: 'university_name',
        label: '대학명',
        type: 'text',
        required: true,
        help: '학생 온보딩에 그대로 노출되고, 확률 조회 키로도 쓰입니다(goalRepo.js fetchUniversityCut). 오타 1건이 그 조합의 온보딩을 전부 막습니다.'
      },
      {
        key: 'department_name',
        label: '학과명',
        type: 'text',
        required: true,
        help: '온보딩이 학과를 필수로 요구하고 확률 조회가 학과명 완전일치라, 비워 두면 어떤 학생에게도 매칭되지 않습니다.'
      },
      // nullable: true 필수 — 비우면 0이 아니라 null로 저장돼야 한다. null은
      // "컷 미확보"이고 API가 422로 응답한다. 0은 jungsi 스케일에서 합법 값이라
      // 의미가 완전히 다르다.
      {
        key: 'avg_cut',
        label: '컷 값',
        type: 'number',
        nullable: true,
        // cut_type에 따라 라벨·단위·범위·placeholder가 통째로 달라진다(§3-D4 ①).
        // cut_type 미선택 상태에서는 readOnly로 두어 입력 자체를 막는다 —
        // AdminInput에 disabled 속성을 새로 뚫는 것보다(공용 경로 추가 변경)
        // 이미 승인된 훅만으로 같은 효과를 낸다.
        resolve: (form) => {
          const range = GOAL_CUT_RANGE[form?.cut_type];
          if (!range) {
            return {
              readOnly: true,
              help: '컷 종류를 먼저 선택해 주세요 — 종류에 따라 값의 단위(등급/백분위)가 달라집니다.'
            };
          }
          return {
            label: `컷 값 (${range.unit})`,
            min: range.min,
            max: range.max,
            // 🔴 step:'any' 없이 min만 주면 소수 컷이 통째로 저장 불가가 된다.
            //   내신 컷은 2.35, 정시 백분위는 87.5 처럼 소수가 정상값이고
            //   백필 13,282행 중 96%가 소수다. 근거는 AdminInput의 step 주석.
            step: 'any',
            placeholder: `${range.min} ~ ${range.max}`,
            help: `${range.label}. 비워 두면 "컷 미확보"(null)로 저장되고 그 조합은 온보딩에서 422로 막힙니다 — 0은 정시 백분위에서 합법 값이라 의미가 완전히 다릅니다.`
          };
        }
      },
      { key: 'source', label: '출처', type: 'select', options: GOAL_CUT_SOURCE_OPTIONS },
      { key: 'source_year', label: '기준 연도', type: 'number', nullable: true },
      { key: 'note', label: '운영 메모', type: 'textarea' }
    ],
    // university_key / department_key는 폼에 노출하지 않는다 — 어드민은 항상
    // 표시명과 동일하게 강제한다(명세 §3-D5). 강제는 formToPayload가 한다.
    //
    // rowToForm이 원본 avg_cut을 __origAvgCut에 실어 두는 이유: formToPayload는
    // row를 받지 못해서, "관리자가 컷 값을 손으로 고쳤는가"를 알 방법이 이것뿐이다.
    // 그 판정이 없으면 백필 보존 술어(source='manual')의 첫 항이 영원히 비어
    // 있게 되어, 관리자의 수정이 백필 재실행마다 덮어써진다(명세 §4-2-H-2 7단계).
    rowToForm: (row) => ({ ...row, __origAvgCut: row.avg_cut }),
    formToPayload: (form) => {
      const universityName = String(form.university_name ?? '').trim();
      // department_name은 NOT NULL DEFAULT ''라 null을 보내면 저장이 거부된다.
      // 폼에서는 필수라 빈 문자열이 오지 않지만, ?? ''는 엑셀·백필 경로와
      // payload 형태를 맞추기 위한 방어다.
      const departmentName = String(form.department_name ?? '').trim();
      const payload = {
        ...form,
        university_key: universityName,
        university_name: universityName,
        department_key: departmentName,
        department_name: departmentName,
        // 유도 행을 관리자가 손으로 고치면 '수기 입력'으로 승격시킨다.
        source:
          form.__origAvgCut !== undefined && form.avg_cut !== form.__origAvgCut
            ? 'manual'
            : form.source
      };
      // saveRow는 created_at/updated_at/view_count만 자동으로 지운다 —
      // __ 접두 키는 여기서 직접 지워야 42703으로 죽지 않는다.
      delete payload.__origAvgCut;
      delete payload.created_at;
      delete payload.updated_at;
      return payload;
    },
    // 🔴 스케일 이원성의 정본 방어선(§3-D4 층 ②). DB CHECK는 jungsi에 2.5(등급)를
    // 넣어도 통과시킨다 — 1~9 구간은 두 스케일 모두 합법이라 DB가 구분할 수 없다.
    validate: (form, row) => {
      // 규칙 0 — 기존 행의 컷 종류 변경 차단. 이 탭이 막아야 할 1순위 사고다.
      if (row && row.cut_type && form.cut_type !== row.cut_type) {
        return '컷 종류는 변경할 수 없습니다. 이 행을 삭제한 뒤 새로 등록해 주세요.';
      }
      const range = GOAL_CUT_RANGE[form.cut_type];
      if (!range) return '컷 종류를 선택해 주세요.';
      if (!String(form.university_name ?? '').trim()) return '대학명을 입력해 주세요.';
      if (!String(form.department_name ?? '').trim()) {
        return '학과명을 입력해 주세요. 학과명이 빈 행은 어떤 학생에게도 매칭되지 않습니다.';
      }
      // 컷 미확보(null/빈 값)는 통과시킨다.
      if (form.avg_cut === null || form.avg_cut === undefined || form.avg_cut === '') return null;
      const avgCut = Number(form.avg_cut);
      if (!Number.isFinite(avgCut)) return '컷 값은 숫자로 입력해 주세요.';
      if (avgCut < range.min || avgCut > range.max) {
        return `선택한 컷 종류(${range.label})의 범위를 벗어났습니다 — ${range.min} ~ ${range.max} 사이로 입력해 주세요.`;
      }
      // 거부가 아니라 확인 — 백분위 9 이하가 불가능하진 않지만 실무상
      // 스케일 혼입일 확률이 압도적이다. validate는 동기 함수이고 호출부가
      // 반환값을 무조건 alert하므로, 취소를 누르면 경고창이 한 번 더 뜬다.
      // 그래서 반환 문구를 alert로 읽어도 자연스러운 문장으로 확정했다.
      if (form.cut_type === 'jungsi' && avgCut <= 9) {
        const ok = window.confirm(
          '정시 컷에 9 이하 값을 넣으셨습니다. 내신 등급을 잘못 입력하신 것은 아닌가요? 백분위 값이 맞다면 [확인]을 눌러 주세요.'
        );
        if (!ok) return '저장하지 않았습니다. 정시 컷 값을 다시 확인해 주세요.';
      }
      return null;
    },
    // ⚠ 명세 §4-2-F 는 cut_type 기본값을 'normal' 로 적었으나 ''(미선택)로 둔다.
    //    'normal' 로 두면 §4-2-C 가 요구하는 "cut_type 미선택 시 avg_cut 입력
    //    disabled" 상태에 신규 등록이 절대 도달하지 못해 그 방어가 죽는다.
    //    관리자가 종류를 고르지 않고 컷 값부터 치는 것이 스케일 혼입의 시작이다.
    //    AdminInput 의 select 는 <option value="">선택</option> 을 항상 먼저
    //    렌더하므로 ''는 "선택" 으로 정상 표시되고, 저장은 required 검사와
    //    validate 규칙 1이 함께 막는다.
    defaults: {
      is_active: true,
      cut_type: '',
      university_name: '',
      department_name: '',
      avg_cut: null,
      source: 'manual',
      source_year: null,
      note: ''
    }
  },

  goalStudents: {
    title: '목표관리 학생 현황',
    // 명세 §4-3. 목록 컬럼이 4소스(goal_student_state 뷰 + goal_students +
    // profiles + 파생 riskFlags) 합성이고 상세가 6소스 합성이라 CONFIGS로
    // 표현할 수 없다. custom: true로 공용 목록·폼·검색·페이지네이션을 통째로
    // 끄고(Admin.jsx의 loadRows custom 분기 / 렌더 custom 삼항) 컴포넌트가
    // 전부 그린다. table을 선언하지 않는 이유도 같다 — loadRows가 custom이면
    // 즉시 rows=[]로 빠져나가 이 값을 읽지 않는다(learningDiagnosis 선례).
    //
    // ⚠ CustomComponent는 반드시 function 선언문이어야 한다. CONFIGS 리터럴이
    //   모듈 초기화 시점에 이 참조를 평가하는데 GoalStudentsAdmin은 파일 끝에
    //   있으므로, const 화살표 함수로 쓰면 TDZ ReferenceError로 어드민 전체가
    //   죽는다.
    custom: true,
    CustomComponent: GoalStudentsAdmin,
    searchPlaceholder: '이름 또는 연락처로 검색하세요',
    // 학생 데이터는 어드민이 한 글자도 고칠 수 없다(명세 §3-D6 / §3-D7).
    // custom: true라 공용 CRUD 경로 자체가 닿지 않으므로 이 두 플래그는 실행에
    // 영향을 주지 않는다 — 선언 의도를 config에 남겨두는 문서 역할이다
    // (mentorApplications가 같은 조합을 쓴다). RLS도 sql/57이 for select로
    // 좁혀 브라우저 콘솔 직접 UPDATE까지 막는다.
    readOnly: true,
    noCreate: true
  }
};

const QUESTION_EMPTY = {
  title: '',
  description: '',
  input_type: 'single',
  is_required: true,
  is_active: true,
  sort_order: 1
};

const OPTION_EMPTY = {
  label: '',
  program_ids: [],
  is_active: true,
  sort_order: 1
};

const PROGRAM_EMPTY = {
  title: '',
  badge: '추천 서비스',
  description: '',
  primary_button_text: '서비스 확인하기',
  primary_button_link: '',
  secondary_button_text: '',
  secondary_button_link: '',
  icon: 'target',
  is_active: true,
  sort_order: 1
};

function normalizeProgramIds(value) {
  if (Array.isArray(value)) return value.map(String).filter(Boolean);
  if (!value) return [];

  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      if (Array.isArray(parsed)) return parsed.map(String).filter(Boolean);
    } catch {
      return value
        .split(',')
        .map((item) => item.trim())
        .filter(Boolean);
    }
  }

  return [];
}

function boolValue(value) {
  if (value === true || value === 'true') return true;
  if (value === false || value === 'false') return false;
  return Boolean(value);
}

const WINNING_RAG_KNOWLEDGE_TYPES = new Set(['topic_pattern', 'verified_resource']);

// 임베딩 진입점은 자기 저장소의 상대 경로 하나뿐이다. 예전에는
// VITE_RAG_API_BASE_URL이 있으면 브라우저가 외부 도메인의 /api/admin-embeddings를
// 직접 쳤는데, 그 경로는 CORS·이중 인증(x-admin-secret)을 끌고 다니는 데다
// 외부 앱 자체가 폐기 대상이라 없앴다.
const WINNING_EMBED_ENDPOINT = '/api/performance/admin-embed';

function shouldRequestWinningEmbedding(config, row) {
  if (!config || config.table !== 'winning_assessment_knowledge_items') return false;
  return WINNING_RAG_KNOWLEDGE_TYPES.has(String(row?.knowledge_type || ''));
}

function decodeJwtPayload(token) {
  try {
    const parts = String(token || '').split('.');
    if (parts.length !== 3) return null;

    const base64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const json = decodeURIComponent(
      atob(base64)
        .split('')
        .map((char) => `%${`00${char.charCodeAt(0).toString(16)}`.slice(-2)}`)
        .join('')
    );

    return JSON.parse(json);
  } catch {
    return null;
  }
}

async function getFreshSupabaseAccessToken() {
  const { data: sessionData, error: sessionError } = await supabase.auth.getSession();

  if (sessionError) {
    throw new Error(`관리자 로그인 세션 확인 실패: ${sessionError.message}`);
  }

  let session = sessionData?.session || null;

  if (!session?.access_token) {
    throw new Error('관리자 로그인 세션이 없습니다. 로그아웃 후 다시 로그인하세요.');
  }

  const payload = decodeJwtPayload(session.access_token);
  const now = Math.floor(Date.now() / 1000);
  const expiresAt = Number(session.expires_at || payload?.exp || 0);
  const shouldRefresh = !expiresAt || expiresAt - now < 300;

  if (shouldRefresh) {
    const { data: refreshData, error: refreshError } = await supabase.auth.refreshSession();

    if (refreshError || !refreshData?.session?.access_token) {
      await supabase.auth.signOut().catch(() => {});
      throw new Error('관리자 로그인 토큰이 만료되었습니다. 다시 로그인한 뒤 저장하세요.');
    }

    session = refreshData.session;
  }

  const freshPayload = decodeJwtPayload(session.access_token);

  if (!freshPayload?.sub || !freshPayload?.exp) {
    throw new Error('관리자 로그인 토큰 형식이 올바르지 않습니다. 다시 로그인한 뒤 저장하세요.');
  }

  if (Number(freshPayload.exp) <= Math.floor(Date.now() / 1000)) {
    await supabase.auth.signOut().catch(() => {});
    throw new Error('관리자 로그인 토큰이 만료되었습니다. 다시 로그인한 뒤 저장하세요.');
  }

  return session.access_token;
}

async function requestWinningEmbedding(row) {
  if (!row?.id) return null;

  try {
    const accessToken = await getFreshSupabaseAccessToken();

    const response = await fetch(WINNING_EMBED_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`
      },
      body: JSON.stringify({
        action: 'embed-one',
        id: row.id
      })
    });

    const result = await response.json().catch(async () => {
      const text = await response.text().catch(() => '');
      return { detail: text || `HTTP ${response.status}` };
    });

    // admin-embed는 실패 사유를 항상 `detail`로 돌려준다(200 응답에는 detail이 없다).
    if (!response.ok) {
      const detail = result?.detail;

      if (response.status === 401) {
        await supabase.auth.signOut().catch(() => {});
        throw new Error(`${detail || '관리자 인증 실패'}: 로그아웃 후 다시 로그인하세요.`);
      }

      throw new Error(detail || `HTTP ${response.status}`);
    }

    console.log('위닝 수행 DB 자동 임베딩 요청 완료:', result);
    return result;
  } catch (error) {
    console.error('위닝 수행 DB 자동 임베딩 요청 실패:', error);
    return null;
  }
}
function getNextSortOrder(items) {
  const list = Array.isArray(items) ? items : [];

  if (list.length === 0) return 1;

  return Math.max(...list.map((item) => Number(item.sort_order || 0))) + 1;
}

function TextInput({ value, onChange, placeholder, className = '' }) {
  return (
    <input
      value={value || ''}
      onChange={(event) => onChange(event.target.value)}
      placeholder={placeholder}
      className={`h-10 w-full border border-gray-300 px-3 text-sm font-bold outline-none focus:border-[#B88737] ${className}`}
    />
  );
}

function Textarea({ value, onChange, placeholder, rows = 3 }) {
  return (
    <textarea
      value={value || ''}
      onChange={(event) => onChange(event.target.value)}
      placeholder={placeholder}
      rows={rows}
      className="w-full resize-y border border-gray-300 px-3 py-2 text-sm font-bold leading-6 outline-none focus:border-[#B88737]"
    />
  );
}

function Select({ value, onChange, children }) {
  return (
    <select
      value={value || ''}
      onChange={(event) => onChange(event.target.value)}
      className="h-10 w-full border border-gray-300 px-3 text-sm font-bold outline-none focus:border-[#B88737]"
    >
      {children}
    </select>
  );
}

function Toggle({ checked, onChange, label }) {
  return (
    <label className="inline-flex items-center gap-2 text-sm font-black text-gray-700">
      <input
        type="checkbox"
        checked={!!checked}
        onChange={(event) => onChange(event.target.checked)}
        className="h-4 w-4 accent-[#0D1B2A]"
      />
      {label}
    </label>
  );
}

function Field({ label, children }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-black text-gray-500">{label}</span>
      {children}
    </label>
  );
}

function ActionButton({ children, onClick, variant = 'dark', type = 'button', disabled = false }) {
  const variantClass =
    variant === 'danger'
      ? 'border border-red-500 bg-white text-red-600 hover:bg-red-50'
      : variant === 'light'
        ? 'border border-gray-400 bg-white text-gray-800 hover:bg-gray-50'
        : 'bg-[#0D1B2A] text-white hover:bg-[#162A40]';

  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={`inline-flex h-9 items-center justify-center gap-1 px-4 text-xs font-black transition disabled:cursor-not-allowed disabled:opacity-50 ${variantClass}`}
    >
      {children}
    </button>
  );
}

function ProgramSelector({ programs, value, onChange }) {
  const selected = new Set(normalizeProgramIds(value));

  function toggle(programId) {
    const next = new Set(selected);
    if (next.has(programId)) next.delete(programId);
    else next.add(programId);
    onChange(Array.from(next));
  }

  if (programs.length === 0) {
    return (
      <div className="rounded border border-dashed border-gray-300 px-3 py-2 text-xs font-bold text-gray-500">
        먼저 추천 프로그램을 등록하세요.
      </div>
    );
  }

  return (
    <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
      {programs.map((program) => (
        <label
          key={program.id}
          className={`flex cursor-pointer items-center gap-2 border px-3 py-2 text-xs font-black transition ${
            selected.has(program.id)
              ? 'border-[#0D1B2A] bg-[#0D1B2A] text-white'
              : 'border-gray-300 bg-white text-gray-700 hover:border-[#B88737]'
          }`}
        >
          <input
            type="checkbox"
            checked={selected.has(program.id)}
            onChange={() => toggle(program.id)}
            className="h-4 w-4 accent-[#B88737]"
          />
          {program.title || '제목 없음'}
        </label>
      ))}
    </div>
  );
}

function LearningDiagnosisAdmin() {
  const [questions, setQuestions] = useState([]);
  const [options, setOptions] = useState([]);
  const [programs, setPrograms] = useState([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [openQuestions, setOpenQuestions] = useState(() => new Set());
  const [newQuestion, setNewQuestion] = useState(QUESTION_EMPTY);
  const [newProgram, setNewProgram] = useState(PROGRAM_EMPTY);

  const optionsByQuestion = useMemo(() => {
    const grouped = {};
    options.forEach((option) => {
      const key = option.question_id;
      if (!grouped[key]) grouped[key] = [];
      grouped[key].push(option);
    });
    Object.values(grouped).forEach((list) => {
      list.sort((a, b) => Number(a.sort_order || 0) - Number(b.sort_order || 0));
    });
    return grouped;
  }, [options]);

  async function loadAll() {
    setLoading(true);

    const [questionRes, optionRes, programRes] = await Promise.all([
      supabase
        .from('learning_diagnosis_questions')
        .select('*')
        .order('sort_order', { ascending: true })
        .order('created_at', { ascending: true }),
      supabase
        .from('learning_diagnosis_options')
        .select('*')
        .order('sort_order', { ascending: true })
        .order('created_at', { ascending: true }),
      supabase
        .from('learning_diagnosis_programs')
        .select('*')
        .order('sort_order', { ascending: true })
        .order('created_at', { ascending: true })
    ]);

    setLoading(false);

    const error = questionRes.error || optionRes.error || programRes.error;
    if (error) {
      reportAdminError('학습진단 데이터 조회 실패', error);
      return;
    }

    const nextQuestions = questionRes.data || [];
    const nextOptions = (optionRes.data || []).map((option) => ({
      ...option,
      program_ids: normalizeProgramIds(option.program_ids)
    }));
    const nextPrograms = programRes.data || [];

    setQuestions(nextQuestions);
    setOptions(nextOptions);
    setPrograms(nextPrograms);
    setOpenQuestions(new Set(nextQuestions.map((question) => question.id)));

    setNewQuestion((prev) => {
      if (String(prev.title || '').trim()) return prev;

      return {
        ...prev,
        sort_order: getNextSortOrder(nextQuestions)
      };
    });

    setNewProgram((prev) => {
      if (String(prev.title || '').trim()) return prev;

      return {
        ...prev,
        sort_order: getNextSortOrder(nextPrograms)
      };
    });
  }

  useEffect(() => {
    loadAll();
  }, []);

  function updateQuestionLocal(id, patch) {
    setQuestions((prev) =>
      prev.map((question) => (question.id === id ? { ...question, ...patch } : question))
    );
  }

  function updateOptionLocal(id, patch) {
    setOptions((prev) =>
      prev.map((option) => (option.id === id ? { ...option, ...patch } : option))
    );
  }

  function updateProgramLocal(id, patch) {
    setPrograms((prev) =>
      prev.map((program) => (program.id === id ? { ...program, ...patch } : program))
    );
  }

  function toggleQuestion(id) {
    setOpenQuestions((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function createQuestion() {
    const title = newQuestion.title.trim();

    if (!title) {
      alert('질문 내용을 입력하세요.');
      return;
    }

    const nextSortOrder = getNextSortOrder(questions);
    const sortOrder = Number(newQuestion.sort_order || 0) || nextSortOrder;

    setSaving(true);

    const { error } = await supabase.from('learning_diagnosis_questions').insert({
      title,
      description: newQuestion.description || '',
      input_type: newQuestion.input_type || 'single',
      is_required: boolValue(newQuestion.is_required),
      is_active: boolValue(newQuestion.is_active),
      sort_order: sortOrder
    });

    setSaving(false);

    if (error) {
      reportAdminError('질문 등록 실패', error);
      return;
    }

    setNewQuestion({
      ...QUESTION_EMPTY,
      sort_order: getNextSortOrder([...questions, { sort_order: sortOrder }])
    });

    await loadAll();
  }

  async function saveQuestion(question) {
    if (!String(question.title || '').trim()) {
      alert('질문 내용을 입력하세요.');
      return;
    }

    setSaving(true);
    const { error } = await supabase
      .from('learning_diagnosis_questions')
      .update({
        title: question.title,
        description: question.description || '',
        input_type: question.input_type || 'single',
        is_required: boolValue(question.is_required),
        is_active: boolValue(question.is_active),
        sort_order: Number(question.sort_order || 1)
      })
      .eq('id', question.id);
    setSaving(false);

    if (error) {
      reportAdminError('질문 저장 실패', error);
      return;
    }

    alert('질문 저장 완료');
    await loadAll();
  }

  async function deleteQuestion(question) {
    if (!window.confirm('질문을 삭제하면 질문 안의 답변도 함께 삭제됩니다. 삭제하시겠습니까?'))
      return;

    const { error } = await supabase
      .from('learning_diagnosis_questions')
      .delete()
      .eq('id', question.id);
    if (error) {
      reportAdminError('질문 삭제 실패', error);
      return;
    }

    await loadAll();
  }

  async function createOption(questionId) {
    const questionOptions = optionsByQuestion[questionId] || [];
    const { error } = await supabase.from('learning_diagnosis_options').insert({
      question_id: questionId,
      label: '',
      program_ids: [],
      is_active: true,
      sort_order: questionOptions.length + 1
    });

    if (error) {
      reportAdminError('답변 추가 실패', error);
      return;
    }

    await loadAll();
  }

  async function saveOption(option) {
    if (!String(option.label || '').trim()) {
      alert('답변 내용을 입력하세요.');
      return;
    }

    setSaving(true);
    const { error } = await supabase
      .from('learning_diagnosis_options')
      .update({
        label: option.label,
        program_ids: normalizeProgramIds(option.program_ids),
        is_active: boolValue(option.is_active),
        sort_order: Number(option.sort_order || 1)
      })
      .eq('id', option.id);
    setSaving(false);

    if (error) {
      reportAdminError('답변 저장 실패', error);
      return;
    }

    alert('답변 저장 완료');
    await loadAll();
  }

  async function deleteOption(option) {
    if (!window.confirm('이 답변을 삭제하시겠습니까?')) return;

    const { error } = await supabase.from('learning_diagnosis_options').delete().eq('id', option.id);
    if (error) {
      reportAdminError('답변 삭제 실패', error);
      return;
    }

    await loadAll();
  }

  async function createProgram() {
    const title = newProgram.title.trim();
    if (!title) {
      alert('프로그램명을 입력하세요.');
      return;
    }

    setSaving(true);
    const { error } = await supabase.from('learning_diagnosis_programs').insert({
      ...newProgram,
      title,
      sort_order: Number(newProgram.sort_order || 1),
      is_active: boolValue(newProgram.is_active)
    });
    setSaving(false);

    if (error) {
      reportAdminError('추천 프로그램 등록 실패', error);
      return;
    }

    setNewProgram({ ...PROGRAM_EMPTY, sort_order: programs.length + 2 });
    await loadAll();
  }

  async function saveProgram(program) {
    if (!String(program.title || '').trim()) {
      alert('프로그램명을 입력하세요.');
      return;
    }

    setSaving(true);
    const { error } = await supabase
      .from('learning_diagnosis_programs')
      .update({
        title: program.title,
        badge: program.badge || '',
        description: program.description || '',
        primary_button_text: program.primary_button_text || '',
        primary_button_link: program.primary_button_link || '',
        secondary_button_text: program.secondary_button_text || '',
        secondary_button_link: program.secondary_button_link || '',
        icon: program.icon || 'target',
        is_active: boolValue(program.is_active),
        sort_order: Number(program.sort_order || 1)
      })
      .eq('id', program.id);
    setSaving(false);

    if (error) {
      reportAdminError('추천 프로그램 저장 실패', error);
      return;
    }

    alert('추천 프로그램 저장 완료');
    await loadAll();
  }

  async function deleteProgram(program) {
    if (
      !window.confirm(
        '추천 프로그램을 삭제하면 기존 답변과의 연결도 결과에서 제외됩니다. 삭제하시겠습니까?'
      )
    )
      return;

    const { error } = await supabase.from('learning_diagnosis_programs').delete().eq('id', program.id);
    if (error) {
      reportAdminError('추천 프로그램 삭제 실패', error);
      return;
    }

    await loadAll();
  }

  return (
    <div className="space-y-6">
      <div className="bg-white px-6 py-5 shadow">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-xl font-black">학습진단 관리</h1>
            <p className="mt-1 text-sm font-bold text-red-500">
              질문 내용, 답변 내용, 중복 선택 여부, 답변별 추천 프로그램을 이 화면에서 수정합니다.
            </p>
          </div>

          <ActionButton onClick={loadAll} variant="light">
            <RefreshCw size={14} />
            새로고침
          </ActionButton>
        </div>
      </div>

      {loading ? (
        <div className="bg-white p-12 text-center text-sm font-bold text-gray-500 shadow">
          학습진단 데이터를 불러오는 중입니다.
        </div>
      ) : (
        <>
          <section className="bg-white p-6 shadow">
            <div className="mb-5 flex items-center justify-between">
              <div>
                <h2 className="text-lg font-black">추천 프로그램 관리</h2>
                <p className="mt-1 text-xs font-bold text-gray-500">
                  답변을 선택했을 때 결과 화면에 노출될 프로그램 카드입니다.
                </p>
              </div>
            </div>

            <div className="mb-6 rounded border border-[#B88737]/30 bg-[#FFF8E8] p-4">
              <h3 className="mb-3 text-sm font-black text-[#7A4A12]">새 추천 프로그램 추가</h3>
              <div className="grid gap-3 lg:grid-cols-2">
                <Field label="프로그램명">
                  <TextInput
                    value={newProgram.title}
                    onChange={(value) => setNewProgram((prev) => ({ ...prev, title: value }))}
                    placeholder="예: 위닝 수행평가 서비스"
                  />
                </Field>
                <Field label="상단 배지">
                  <TextInput
                    value={newProgram.badge}
                    onChange={(value) => setNewProgram((prev) => ({ ...prev, badge: value }))}
                    placeholder="예: 추천 서비스 01"
                  />
                </Field>
                <Field label="추천 문구">
                  <Textarea
                    value={newProgram.description}
                    onChange={(value) => setNewProgram((prev) => ({ ...prev, description: value }))}
                    rows={4}
                  />
                </Field>
                <div className="grid gap-3">
                  <Field label="서비스 버튼명">
                    <TextInput
                      value={newProgram.primary_button_text}
                      onChange={(value) =>
                        setNewProgram((prev) => ({ ...prev, primary_button_text: value }))
                      }
                    />
                  </Field>
                  <Field label="서비스 링크">
                    <TextInput
                      value={newProgram.primary_button_link}
                      onChange={(value) =>
                        setNewProgram((prev) => ({ ...prev, primary_button_link: value }))
                      }
                      placeholder="/page/services-ai-performance"
                    />
                  </Field>
                  <Field label="순서">
                    <TextInput
                      value={newProgram.sort_order}
                      onChange={(value) =>
                        setNewProgram((prev) => ({ ...prev, sort_order: value }))
                      }
                    />
                  </Field>
                </div>
              </div>
              <div className="mt-4 flex justify-end">
                <ActionButton onClick={createProgram} disabled={saving}>
                  <Plus size={14} />
                  추천 프로그램 추가
                </ActionButton>
              </div>
            </div>

            <div className="grid gap-4 xl:grid-cols-2">
              {programs.map((program) => (
                <div key={program.id} className="border border-gray-200 p-4">
                  <div className="grid gap-3 md:grid-cols-2">
                    <Field label="프로그램명">
                      <TextInput
                        value={program.title}
                        onChange={(value) => updateProgramLocal(program.id, { title: value })}
                      />
                    </Field>
                    <Field label="상단 배지">
                      <TextInput
                        value={program.badge}
                        onChange={(value) => updateProgramLocal(program.id, { badge: value })}
                      />
                    </Field>
                    <Field label="추천 문구">
                      <Textarea
                        value={program.description}
                        onChange={(value) => updateProgramLocal(program.id, { description: value })}
                        rows={5}
                      />
                    </Field>
                    <div className="grid gap-3">
                      <Field label="서비스 버튼명">
                        <TextInput
                          value={program.primary_button_text}
                          onChange={(value) =>
                            updateProgramLocal(program.id, { primary_button_text: value })
                          }
                        />
                      </Field>
                      <Field label="서비스 링크">
                        <TextInput
                          value={program.primary_button_link}
                          onChange={(value) =>
                            updateProgramLocal(program.id, { primary_button_link: value })
                          }
                        />
                      </Field>
                      <Field label="보조 버튼명">
                        <TextInput
                          value={program.secondary_button_text}
                          onChange={(value) =>
                            updateProgramLocal(program.id, { secondary_button_text: value })
                          }
                        />
                      </Field>
                      <Field label="보조 링크">
                        <TextInput
                          value={program.secondary_button_link}
                          onChange={(value) =>
                            updateProgramLocal(program.id, { secondary_button_link: value })
                          }
                        />
                      </Field>
                    </div>
                    <Field label="아이콘">
                      <Select
                        value={program.icon}
                        onChange={(value) => updateProgramLocal(program.id, { icon: value })}
                      >
                        <option value="target">목표관리</option>
                        <option value="book">수행평가</option>
                        <option value="chart">분석</option>
                        <option value="route">방향설정</option>
                      </Select>
                    </Field>
                    <Field label="순서">
                      <TextInput
                        value={program.sort_order}
                        onChange={(value) => updateProgramLocal(program.id, { sort_order: value })}
                      />
                    </Field>
                  </div>
                  <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
                    <Toggle
                      checked={program.is_active}
                      onChange={(value) => updateProgramLocal(program.id, { is_active: value })}
                      label="사용"
                    />
                    <div className="flex gap-2">
                      <ActionButton onClick={() => saveProgram(program)} disabled={saving}>
                        저장
                      </ActionButton>
                      <ActionButton onClick={() => deleteProgram(program)} variant="danger">
                        <Trash2 size={14} />
                        삭제
                      </ActionButton>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </section>

          <section className="bg-white p-6 shadow">
            <div className="mb-5">
              <h2 className="text-lg font-black">질문·답변 관리</h2>
              <p className="mt-1 text-xs font-bold text-gray-500">
                질문 내용은 자유롭게 바꿀 수 있고, 각 질문 안에서 답변을 바로 추가·수정합니다.
              </p>
            </div>

            <div className="mb-6 rounded border border-[#B88737]/30 bg-[#FFF8E8] p-4">
              <h3 className="mb-3 text-sm font-black text-[#7A4A12]">새 질문 추가</h3>
              <div className="grid gap-3 lg:grid-cols-[1.3fr_0.7fr_0.5fr]">
                <Field label="질문 내용">
                  <TextInput
                    value={newQuestion.title}
                    onChange={(value) => setNewQuestion((prev) => ({ ...prev, title: value }))}
                    placeholder="예: 현재 가장 큰 학습 고민은 무엇인가요?"
                  />
                </Field>
                <Field label="선택 방식">
                  <Select
                    value={newQuestion.input_type}
                    onChange={(value) => setNewQuestion((prev) => ({ ...prev, input_type: value }))}
                  >
                    <option value="single">단일 선택</option>
                    <option value="multiple">중복 선택</option>
                  </Select>
                </Field>
                <Field label="순서">
                  <TextInput
                    value={newQuestion.sort_order}
                    onChange={(value) => setNewQuestion((prev) => ({ ...prev, sort_order: value }))}
                  />
                </Field>
              </div>
              <div className="mt-3">
                <Field label="질문 설명">
                  <Textarea
                    value={newQuestion.description}
                    onChange={(value) =>
                      setNewQuestion((prev) => ({ ...prev, description: value }))
                    }
                    rows={2}
                  />
                </Field>
              </div>
              <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
                <div className="flex gap-4">
                  <Toggle
                    checked={newQuestion.is_required}
                    onChange={(value) =>
                      setNewQuestion((prev) => ({ ...prev, is_required: value }))
                    }
                    label="필수 질문"
                  />
                  <Toggle
                    checked={newQuestion.is_active}
                    onChange={(value) => setNewQuestion((prev) => ({ ...prev, is_active: value }))}
                    label="사용"
                  />
                </div>
                <ActionButton onClick={createQuestion} disabled={saving}>
                  <Plus size={14} />
                  질문 추가
                </ActionButton>
              </div>
            </div>

            <div className="space-y-5">
              {questions.map((question, questionIndex) => {
                const questionOptions = optionsByQuestion[question.id] || [];
                const isOpen = openQuestions.has(question.id);

                return (
                  <article key={question.id} className="border border-gray-200">
                    <button
                      type="button"
                      onClick={() => toggleQuestion(question.id)}
                      className="flex w-full items-center justify-between bg-gray-50 px-5 py-4 text-left"
                    >
                      <div>
                        <p className="text-xs font-black text-[#B88737]">
                          QUESTION {String(questionIndex + 1).padStart(2, '0')}
                          <span className="ml-2 text-gray-400">
                            정렬순서 {Number(question.sort_order || 0)}
                          </span>
                        </p>
                        <h3 className="mt-1 text-base font-black text-gray-900">
                          {question.title || '질문 내용 없음'}
                        </h3>
                        <p className="mt-1 text-xs font-bold text-gray-500">
                          {question.input_type === 'multiple' ? '중복 선택' : '단일 선택'} ·{' '}
                          {question.is_required ? '필수' : '선택'} · 답변 {questionOptions.length}개
                        </p>
                      </div>
                      <ChevronDown
                        size={18}
                        className={`transition ${isOpen ? 'rotate-180' : ''}`}
                      />
                    </button>

                    {isOpen && (
                      <div className="p-5">
                        <div className="grid gap-3 lg:grid-cols-[1.3fr_0.7fr_0.5fr]">
                          <Field label="질문 내용">
                            <TextInput
                              value={question.title}
                              onChange={(value) =>
                                updateQuestionLocal(question.id, { title: value })
                              }
                            />
                          </Field>
                          <Field label="선택 방식">
                            <Select
                              value={question.input_type}
                              onChange={(value) =>
                                updateQuestionLocal(question.id, { input_type: value })
                              }
                            >
                              <option value="single">단일 선택</option>
                              <option value="multiple">중복 선택</option>
                            </Select>
                          </Field>
                          <Field label="순서">
                            <TextInput
                              value={question.sort_order}
                              onChange={(value) =>
                                updateQuestionLocal(question.id, { sort_order: value })
                              }
                            />
                          </Field>
                        </div>
                        <div className="mt-3">
                          <Field label="질문 설명">
                            <Textarea
                              value={question.description}
                              onChange={(value) =>
                                updateQuestionLocal(question.id, { description: value })
                              }
                              rows={2}
                            />
                          </Field>
                        </div>
                        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-b border-gray-200 pb-5">
                          <div className="flex gap-4">
                            <Toggle
                              checked={question.is_required}
                              onChange={(value) =>
                                updateQuestionLocal(question.id, { is_required: value })
                              }
                              label="필수 질문"
                            />
                            <Toggle
                              checked={question.is_active}
                              onChange={(value) =>
                                updateQuestionLocal(question.id, { is_active: value })
                              }
                              label="사용"
                            />
                          </div>
                          <div className="flex gap-2">
                            <ActionButton onClick={() => saveQuestion(question)} disabled={saving}>
                              질문 저장
                            </ActionButton>
                            <ActionButton onClick={() => deleteQuestion(question)} variant="danger">
                              <Trash2 size={14} />
                              질문 삭제
                            </ActionButton>
                          </div>
                        </div>

                        <div className="mt-5">
                          <div className="mb-3 flex items-center justify-between">
                            <h4 className="text-sm font-black">답변 목록</h4>
                            <ActionButton onClick={() => createOption(question.id)} variant="light">
                              <Plus size={14} />
                              답변 추가
                            </ActionButton>
                          </div>

                          <div className="space-y-3">
                            {questionOptions.map((option) => (
                              <div key={option.id} className="rounded border border-gray-200 p-4">
                                <div className="grid gap-3 lg:grid-cols-[1fr_120px]">
                                  <Field label="답변 내용">
                                    <TextInput
                                      value={option.label}
                                      onChange={(value) =>
                                        updateOptionLocal(option.id, { label: value })
                                      }
                                      placeholder="답변 내용을 입력하세요"
                                    />
                                  </Field>
                                  <Field label="순서">
                                    <TextInput
                                      value={option.sort_order}
                                      onChange={(value) =>
                                        updateOptionLocal(option.id, { sort_order: value })
                                      }
                                    />
                                  </Field>
                                </div>

                                <div className="mt-3">
                                  <Field label="이 답변 선택 시 노출할 추천 프로그램">
                                    <ProgramSelector
                                      programs={programs}
                                      value={option.program_ids}
                                      onChange={(value) =>
                                        updateOptionLocal(option.id, { program_ids: value })
                                      }
                                    />
                                  </Field>
                                </div>

                                <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
                                  <Toggle
                                    checked={option.is_active}
                                    onChange={(value) =>
                                      updateOptionLocal(option.id, { is_active: value })
                                    }
                                    label="사용"
                                  />
                                  <div className="flex gap-2">
                                    <ActionButton
                                      onClick={() => saveOption(option)}
                                      disabled={saving}
                                    >
                                      답변 저장
                                    </ActionButton>
                                    <ActionButton
                                      onClick={() => deleteOption(option)}
                                      variant="danger"
                                    >
                                      <Trash2 size={14} />
                                      삭제
                                    </ActionButton>
                                  </div>
                                </div>
                              </div>
                            ))}

                            {questionOptions.length === 0 && (
                              <div className="rounded border border-dashed border-gray-300 p-6 text-center text-sm font-bold text-gray-500">
                                아직 등록된 답변이 없습니다. 답변 추가를 눌러 선택지를 만드세요.
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    )}
                  </article>
                );
              })}
            </div>
          </section>
        </>
      )}
    </div>
  );
}

function formatValue(value, type, options) {
  if (value === null || value === undefined || value === '') return '-';

  if (Array.isArray(options)) {
    const matched = options.find(
      (option) => option && typeof option === 'object' && option.value === value
    );
    if (matched) return matched.label;
  }

  if (type === 'boolean') return value ? '사용' : '미사용';

  // 멘토 신청 내역 목록 전용 — 개인정보 최소 노출(팀장 지시). 상세 화면에서는 마스킹 없이
  // 원본 휴대폰번호를 그대로 보여준다.
  if (type === 'maskedPhone') {
    const digits = String(value).replace(/\D/g, '');
    if (digits.length < 8) return String(value);
    return `${digits.slice(0, 3)}-****-${digits.slice(-4)}`;
  }

  if (type === 'money') return `${Number(value || 0).toLocaleString()}원`;

  if (type === 'date') {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return String(value);
    return date.toISOString().slice(0, 10);
  }

  if (type === 'datetime') {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return String(value);
    // toISOString()은 UTC라 KST 00~09시 신청 건이 하루 전날로 잘린다 — Asia/Seoul 고정 표시.
    return date.toLocaleString('ko-KR', {
      timeZone: 'Asia/Seoul',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false
    });
  }

  return String(value);
}

function searchable(row) {
  return Object.values(row || {})
    .map((value) => String(value ?? ''))
    .join(' ')
    .toLowerCase();
}

function csvEscape(value) {
  const raw = String(value ?? '');
  // CSV formula injection 방어 — Excel/Sheets는 따옴표로 감싼 필드여도
  // 선두 = + - @ 및 탭/CR을 수식으로 해석한다. 선행 작은따옴표로 무력화한다.
  const safe = /^[=+\-@\t\r]/.test(raw) ? `'${raw}` : raw;
  return `"${safe.replace(/"/g, '""')}"`;
}

function csvHeader(columns) {
  return columns.map((column) => csvEscape(column.label)).join(',');
}

// 행 배열 → CSV 본문 줄들. 전량 로드 경로(downloadCsv)와 청크 내보내기(입결 43k행)가
// 같은 이스케이프 규칙을 쓰도록 뽑아둔 것 — 청크 쪽은 받은 행 객체를 계속 붙들지 않고
// 줄 문자열로 접어 모은다(43k행 × 30컬럼을 통째로 메모리에 쌓지 않기 위해).
function csvBody(rows, columns) {
  // CSV는 표시용이 아니라 데이터 교환용이다 — column.options를 넘기지 마라.
  // 라벨(수시/정시)로 내보내면 Supabase 재업로드 시 category CHECK 제약을 위반한다.
  return rows
    .map((row) =>
      columns.map((column) => csvEscape(formatValue(row[column.key], column.type))).join(',')
    )
    .join('\n');
}

// 헤더/본문 문자열을 그대로 받아 파일로 떨군다. 청크 내보내기는 본문을 여러 번에
// 나눠 만든 뒤 이어 붙여 넘기므로 rows 배열을 요구하지 않는 이 형태가 필요하다.
function downloadCsvText(filename, header, body) {
  const blob = new Blob([`\ufeff${header}\n${body}`], {
    type: 'text/csv;charset=utf-8;'
  });

  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');

  a.href = url;
  a.download = filename;
  a.click();

  URL.revokeObjectURL(url);
}

function downloadCsv(filename, rows, columns) {
  downloadCsvText(filename, csvHeader(columns), csvBody(rows, columns));
}

function normalizeArray(value) {
  if (Array.isArray(value)) return value;
  if (!value) return [];

  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return value ? [value] : [];
    }
  }

  return [];
}

function getFileNameFromUrl(value) {
  if (!value) return '첨부파일';

  try {
    const raw = typeof value === 'string' ? value : value.url;
    const pathname = new URL(raw).pathname;
    return decodeURIComponent(pathname.split('/').pop() || '첨부파일');
  } catch {
    return '첨부파일';
  }
}

function formatListValue(value, type) {
  const list = normalizeArray(value);
  if (list.length === 0) return '-';
  if (type === 'imageList') return `이미지 ${list.length}개`;
  if (type === 'fileList') return `첨부파일 ${list.length}개`;
  return `${list.length}개`;
}

function truncateText(value, maxLength = 10) {
  if (value === null || value === undefined || value === '') return '-';
  const flat = String(value).replace(/\r?\n/g, ' ');
  const chars = Array.from(flat);
  if (chars.length <= maxLength) return flat;
  return `${chars.slice(0, maxLength).join('')}…`;
}

function AdminSidebar({ activeKey, setActiveKey }) {
  const [open, setOpen] = useState(() => new Set(MENU_GROUPS.map((group) => group.title)));
  // 자식 탭(acceptanceRates/admissionCaseLogos)에 있을 때도 사이드바에서는
  // 탭 목록의 첫 번째 key(admissionSusiJungsi)를 기준으로 활성 항목을 매칭한다.
  const sidebarActiveKey = CONFIGS[activeKey]?.tabs ? CONFIGS[activeKey].tabs[0].key : activeKey;

  function toggle(title) {
    setOpen((prev) => {
      const next = new Set(prev);
      if (next.has(title)) next.delete(title);
      else next.add(title);
      return next;
    });
  }

  return (
    <aside className="fixed left-0 top-0 z-40 h-screen w-[224px] overflow-y-auto bg-[#101214] text-white">
      <div className="border-b border-white/10 px-5 py-5 text-2xl font-black">관리자</div>

      <nav className="px-4 py-5">
        {MENU_GROUPS.map((group) => {
          const isOpen = open.has(group.title);

          return (
            <div key={group.title} className="mb-4">
              <button
                type="button"
                onClick={() => toggle(group.title)}
                className="flex w-full items-center justify-between py-2 text-left text-[15px] font-black"
              >
                {group.title}
                <ChevronDown
                  size={16}
                  className={`transition ${isOpen ? 'rotate-0' : '-rotate-90'}`}
                />
              </button>

              {isOpen && (
                <div className="mt-1 space-y-1">
                  {group.items.map((item) => (
                    <button
                      key={item.key}
                      type="button"
                      onClick={() => setActiveKey(item.key)}
                      className={`block w-full rounded px-4 py-2 text-left text-[13px] font-bold ${
                        sidebarActiveKey === item.key
                          ? 'bg-white/10 text-white before:mr-2 before:text-red-500 before:content-["•"]'
                          : 'text-white/55 before:mr-2 before:text-white/35 before:content-["•"] hover:bg-white/5 hover:text-white'
                      }`}
                    >
                      {item.label}
                    </button>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </nav>
    </aside>
  );
}

function AdminTopbar({ onLogout }) {
  return (
    <header className="fixed left-[224px] right-0 top-0 z-30 flex h-[56px] items-center justify-between border-b border-black/10 bg-white px-7 shadow">
      <p className="text-[15px] font-bold text-[#3a3f45]">
        안녕하세요, <strong>관리자님.</strong>
      </p>

      <div className="flex items-center gap-3">
        <Link
          to="/"
          className="inline-flex h-[32px] items-center justify-center rounded border border-[#c9ced6] bg-white px-4 text-xs font-bold text-[#3a3f45] transition hover:border-[#B88737] hover:bg-[#FFF8E8] hover:text-[#B88737]"
        >
          메인으로 이동
        </Link>

        <button
          type="button"
          onClick={onLogout}
          className="inline-flex h-[32px] items-center justify-center rounded border border-[#c9ced6] bg-white px-4 text-xs font-bold text-[#8b9098] transition hover:border-black hover:text-black"
        >
          로그아웃
        </button>
      </div>
    </header>
  );
}

function AdminInput({ field, value, onChange, disabled }) {
  const base =
    'h-9 w-full border border-[#9ca3af] bg-white px-3 text-sm outline-none disabled:bg-gray-100';
  // field.readOnly: 폼 전체 disabled와 별개로 "이 필드 하나만" 편집 불가로
  // 만든다(예: *_html 미러 — doc이 정본이고 이 필드는 자동 생성값이라
  // 직접 고치면 안 됨). HTML readOnly 속성은 disabled와 달리 값 선택·복사는
  // 허용한다 — 미러 값을 참고용으로 보되 못 고치게 하는 목적에 더 맞는다.
  const readOnly = Boolean(field.readOnly);

  if (field.type === 'textarea') {
    return (
      <textarea
        value={value || ''}
        onChange={(e) => onChange(field.key, e.target.value)}
        disabled={disabled}
        readOnly={readOnly}
        rows={field.rows || 5}
        className={`w-full resize-y border border-[#9ca3af] px-3 py-2 font-mono text-xs leading-5 outline-none disabled:bg-gray-100 ${readOnly ? 'bg-gray-50 text-gray-500' : 'bg-white'}`}
      />
    );
  }

  if (field.type === 'select') {
    return (
      <select
        value={value || ''}
        onChange={(e) => onChange(field.key, e.target.value)}
        disabled={disabled}
        className={base}
      >
        <option value="">선택</option>
        {(field.options || []).map((option) => {
          const optionValue = typeof option === 'object' && option !== null ? option.value : option;
          const optionLabel = typeof option === 'object' && option !== null ? option.label : option;
          return (
            <option key={optionValue} value={optionValue}>
              {optionLabel}
            </option>
          );
        })}
      </select>
    );
  }

  if (field.type === 'checkbox') {
    return (
      <label className="inline-flex items-center gap-2 text-sm font-bold">
        <input
          type="checkbox"
          checked={!!value}
          onChange={(e) => onChange(field.key, e.target.checked)}
          disabled={disabled}
        />
        사용
      </label>
    );
  }

  if (field.type === 'radioBoolean') {
    return (
      <div className="flex items-center gap-6">
        <label className="inline-flex items-center gap-2 text-sm font-bold">
          <input
            type="radio"
            checked={value === true}
            onChange={() => onChange(field.key, true)}
            disabled={disabled}
          />
          사용
        </label>

        <label className="inline-flex items-center gap-2 text-sm font-bold">
          <input
            type="radio"
            checked={value === false}
            onChange={() => onChange(field.key, false)}
            disabled={disabled}
          />
          미사용
        </label>
      </div>
    );
  }

  return (
    <input
      type={field.type === 'number' ? 'number' : field.type === 'date' ? 'date' : 'text'}
      value={value ?? ''}
      onChange={(e) => {
        // field.nullable: 숫자 입력을 비우면 0이 아니라 null을 보낸다. 기본값을
        // 0으로 두면 "미공개"와 "값이 0"이 구분되지 않아 공개면이 경쟁률
        // 0.00 : 1, 모집인원 0명을 정상값처럼 렌더한다. 선언한 필드에만 적용되므로
        // sort_order 같은 NOT NULL 숫자 컬럼은 기존 동작(빈 값 → 0) 그대로다.
        const next =
          field.type === 'number'
            ? e.target.value === '' && field.nullable
              ? null
              : Number(e.target.value || 0)
            : e.target.value;
        onChange(field.key, next);
      }}
      disabled={disabled}
      readOnly={readOnly}
      // placeholder/min/max/step: 선언한 필드에만 붙는다. 값이 undefined면
      // React가 속성 자체를 DOM에 렌더하지 않으므로, 이 네 키를 선언하지 않은
      // 기존 필드는 마크업이 바이트 단위로 동일하다.
      //
      // 🔴 min/max는 "브라우저 힌트"가 아니라 실제로 submit을 막는다
      //   (rangeUnderflow/rangeOverflow → form.checkValidity() false → onSubmit
      //    자체가 발화하지 않아 config.validate가 호출조차 되지 않는다).
      //   그래서 min을 선언하는 필드는 step도 함께 선언해야 한다 — HTML 사양상
      //   number 입력의 step base는 min 속성이 있으면 min, 없으면 value
      //   콘텐트 속성이다. 기본 step은 1이므로 min만 붙이는 순간 소수값이
      //   전부 stepMismatch로 막힌다(실측: <input type=number min=1 value="2.35">
      //   → stepMismatch true, "가장 근접한 유효 값 2개는 2 및 3입니다").
      //   min/max/step을 선언하지 않은 기존 필드는 step base가 value라
      //   소수 입력이 지금까지 통과해 왔다 — 그래서 이 결함은 min을 처음
      //   선언한 필드(목표관리 대학 컷 avg_cut)에서만 터졌다.
      //   step='any'를 함께 주면 stepMismatch는 사라지고 min/max 범위 방어는
      //   그대로 남는다(실측: step=any + max=9 에 12 → rangeOverflow true).
      placeholder={field.placeholder}
      min={field.min}
      max={field.max}
      step={field.step}
      className={`${base} ${readOnly ? 'bg-gray-50 text-gray-500' : ''}`}
    />
  );
}

// admissionGuidelines 전용 필드 렌더러(type:'admissionDoc'). field.key는
// jsonKey(예: selection_method_json), field.sectionKey는 SectionKey(예:
// 'selection_method')다. DocBlocksEditor(문서 블록 배열 편집기)를 감싸고,
// 편집 즉시 병행 저장 계약(doc·html 동시 갱신)을 지킨다 — doc이 바뀔 때마다
// renderDocToHtml로 htmlKey 미러도 같은 자리에서 다시 만든다. 이렇게
// 해야 doc만 고치고 html이 낡는 사고(2026-08-06에 실제로 있었던 결함,
// 27b397e에서 "파싱 실행" 경로는 고쳤지만 편집기 경로는 이번에 처음
// 배선된다)가 편집기에서도 재발하지 않는다.
function AdmissionDocFieldEditor({ field, form, onPatch, onDirty }) {
  const sectionKey = field.sectionKey;
  const htmlKey = HWP_SECTION_HTML_KEYS[sectionKey];
  const existing = form[field.key];
  const doc =
    existing && typeof existing === 'object' && Array.isArray(existing.blocks)
      ? existing
      : {
          v: 1,
          section: sectionKey,
          source: 'manual',
          generator: 'admin-editor',
          generatedAt: new Date().toISOString(),
          blocks: []
        };

  function handleBlocksChange(nextBlocks) {
    const nextDoc = { ...doc, blocks: nextBlocks, source: 'manual', generatedAt: new Date().toISOString() };
    const nextPatch = { [field.key]: nextDoc };
    // doc(정본)은 형태와 무관하게 항상 patch에 실린다 — 편집 중 일시적으로
    // 불변식을 어기는 상태(예: 열 개수 변경 중간 단계)도 그대로 저장 시도
    // 대상이 된다(저장 게이트는 formToPayload가 validateAdmissionDoc으로
    // 별도로 막는다). html 미러는 doc이 유효할 때만, 그리고 renderDocToHtml
    // 예외에 대비해 try/catch로 감싸 만든다 — 이 렌더러가 일부 variant에서
    // 방어적이지 않고(예: renderSelectionTable이 row 길이를 검증 없이
    // row[3]로 접근) 예상 밖 형태에 예외를 던지는 걸 직접 재현 확인했다.
    // 실패해도 doc은 정상 저장되고 html 미러 갱신만 건너뛴다(직전 값 유지) —
    // 페이지 전체가 죽는 것보다 훨씬 안전하다.
    // ⚠ renderDocToHtml이 total 함수(어떤 유효 doc에도 안 던지도록,
    // phase0 담당)가 된 뒤에도 이 try/catch는 지우지 마라 — 심층 방어다.
    // DocBlocksEditor의 섹션별 블록 추가 제한(같은 커밋)이 "흔치 않은
    // 조합"을 1차로 막아주지만, 그 제한을 우회하는 경로(예: xlsx
    // 가져오기로 다른 섹션 doc을 억지로 붙여넣는 경우)까지 커버하는 건
    // 이 try/catch뿐이다.
    if (htmlKey) {
      if (validateAdmissionDoc(nextDoc).ok) {
        try {
          nextPatch[htmlKey] = renderDocToHtml(nextDoc, sectionKey);
        } catch (err) {
          console.error('renderDocToHtml 실패 — html 미러 갱신을 건너뜁니다(doc은 정상 저장됩니다):', err);
        }
      }
    }
    onDirty();
    onPatch(nextPatch);
  }

  return (
    <DocBlocksEditor
      section={sectionKey}
      blocks={doc.blocks}
      onChange={handleBlocksChange}
      universityName={form.university_name}
      sectionLabel={HWP_SECTION_LABELS[sectionKey]}
    />
  );
}

const COMPRESS_THRESHOLD_BYTES = 500 * 1024;

// URL 마지막 세그먼트를 파일명으로 추출 (쿼리스트링 제거 + decodeURIComponent로 한글 파일명 대비)
function fileNameFromUrl(url) {
  if (!url) return '';
  try {
    const withoutQuery = String(url).split('?')[0].split('#')[0];
    const segments = withoutQuery.split('/').filter(Boolean);
    const last = segments[segments.length - 1] || '';
    return decodeURIComponent(last);
  } catch {
    return String(url);
  }
}

function formatFileSize(bytes) {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
  return `${Math.round(bytes / 1024)}KB`;
}

// maxMB 초과 시 alert 후 false 반환. 압축 대상 필드는 압축 이후(uploadImage)에 별도 호출.
function validateMaxMB(file, maxMB) {
  if (!maxMB) return true;
  if (file.size > maxMB * 1024 * 1024) {
    alert(
      `파일 용량이 너무 큽니다. 최대 ${maxMB}MB까지 업로드할 수 있습니다. (현재 ${formatFileSize(file.size)})`
    );
    return false;
  }
  return true;
}

// 압축 적용 대상 필드인지 판정: field.compress === true이고 file/multiFile 타입이 아님
function isCompressibleField(field = {}) {
  return field.compress === true && field.type !== 'file' && field.type !== 'multiFile';
}

// 이미지 규격 검증: imageSpec = { width, height, tolerance(기본 0.02), maxMB, aspectOnly }
// 반환값 false = 업로드 중단, true = 계속 진행
// options.skipMaxMB: true면 maxMB 검증은 건너뜀 (압축 대상 필드는 압축 이후 별도 검증)
async function validateImageSpec(file, imageSpec, options = {}) {
  if (!imageSpec) return true;

  const { width, height, tolerance = 0.02, maxMB, aspectOnly } = imageSpec;

  if (!options.skipMaxMB && !validateMaxMB(file, maxMB)) return false;

  if (!width || !height) return true;

  let bitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    // 치수 측정 불가 형식(svg 등)은 규격 검증 없이 통과
    return true;
  }

  const actualWidth = bitmap.width;
  const actualHeight = bitmap.height;
  bitmap.close?.();

  let matches;
  let expectedText;

  if (aspectOnly) {
    const expectedRatio = width / height;
    const actualRatio = actualWidth / actualHeight;
    matches = Math.abs(actualRatio - expectedRatio) / expectedRatio <= tolerance;
    expectedText = `${width}:${height} 비율`;
  } else {
    matches =
      Math.abs(actualWidth - width) / width <= tolerance &&
      Math.abs(actualHeight - height) / height <= tolerance;
    expectedText = `${width}×${height}`;
  }

  if (matches) return true;

  return window.confirm(
    `이미지 규격이 다릅니다.\n${expectedText} 필요, 현재 ${actualWidth}×${actualHeight} — 계속 업로드할까요?`
  );
}

// 500KB 초과 이미지 canvas 재인코딩 (치수 유지, png→png / jpeg 품질 0.85)
// 재인코딩 결과가 원본보다 작을 때만 교체. field.compress === true인 필드만 대상 (옵트인).
async function maybeCompressImage(file, field = {}) {
  if (!isCompressibleField(field)) return file;
  if (file.type !== 'image/png' && file.type !== 'image/jpeg') return file;
  if (file.size <= COMPRESS_THRESHOLD_BYTES) return file;

  let bitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    return file;
  }

  try {
    const canvas = document.createElement('canvas');
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;

    const ctx = canvas.getContext('2d');
    if (!ctx) return file;
    ctx.drawImage(bitmap, 0, 0);

    const isPng = file.type === 'image/png';
    const blob = await new Promise((resolve) =>
      canvas.toBlob(resolve, file.type, isPng ? undefined : 0.85)
    );

    if (!blob || blob.size >= file.size) return file;

    alert(`${formatFileSize(file.size)} → ${formatFileSize(blob.size)}로 압축됨`);
    return new File([blob], file.name, { type: file.type });
  } catch {
    return file;
  } finally {
    bitmap.close?.();
  }
}

// ── 멘토 성공전략 카드: photo_layout jsonb ↔ 평탄화 폼 필드 변환 + 라이브 프리뷰 ──

const MENTOR_PHOTO_FORM_KEYS = [
  'photo_top',
  'photo_left',
  'photo_width',
  'photo_height',
  'photo_crop_enabled',
  'photo_crop_top',
  'photo_crop_height'
];

// 프리셋 좌표 근거: sql/30 백필 22건 (표준 = 최빈 배치, 와이드 = 김무경, 크롭형 = 김성훈)
const MENTOR_CARD_PRESETS = [
  {
    label: '표준',
    help: '기존 22건 최빈 배치 — 210 카드',
    patch: {
      card_width: 210,
      photo_top: 106,
      photo_left: 0,
      photo_width: 210,
      photo_height: 270,
      photo_crop_enabled: false,
      photo_crop_top: '',
      photo_crop_height: ''
    }
  },
  {
    label: '와이드 230',
    help: '김무경형 — 넓은 카드',
    patch: {
      card_width: 230,
      photo_top: 95,
      photo_left: 0,
      photo_width: 230,
      photo_height: 296,
      photo_crop_enabled: false,
      photo_crop_top: '',
      photo_crop_height: ''
    }
  },
  {
    label: '크롭형',
    help: '김성훈형 — 큰 사진 상단 크롭',
    patch: {
      card_width: 210,
      photo_top: 92,
      photo_left: 0,
      photo_width: 210,
      photo_height: 392,
      photo_crop_enabled: true,
      photo_crop_top: '-16.26%',
      photo_crop_height: '116.12%'
    }
  }
];

function parseMentorTitleLines(value) {
  if (Array.isArray(value)) {
    return value.map((line) => String(line).trim()).filter(Boolean);
  }
  return String(value || '')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
}

// 폼의 photo_* 평탄화 값 → photo_layout jsonb ({top,left,width,height,crop?}) / 미완성이면 null
function buildMentorPhotoLayout(form) {
  const raw = [form.photo_top, form.photo_left, form.photo_width, form.photo_height];
  if (raw.some((v) => v === '' || v === null || v === undefined)) return null;

  const [top, left, width, height] = raw.map(Number);
  if (![top, left, width, height].every(Number.isFinite)) return null;
  if (width <= 0 || height <= 0) return null;

  const layout = { top, left, width, height };

  if (form.photo_crop_enabled) {
    const cropTop = String(form.photo_crop_top || '').trim();
    const cropHeight = String(form.photo_crop_height || '').trim();
    if (cropTop && cropHeight) layout.crop = { top: cropTop, height: cropHeight };
  }

  return layout;
}

function mentorRowToForm(row) {
  let titleLines = row.title_lines;
  if (typeof titleLines === 'string') {
    try {
      titleLines = JSON.parse(titleLines);
    } catch {
      titleLines = null;
    }
  }

  const layout = row.photo_layout && typeof row.photo_layout === 'object' ? row.photo_layout : null;

  const form = {
    ...row,
    title_lines: Array.isArray(titleLines) ? titleLines.join('\n') : '',
    card_width: row.card_width ?? 210,
    photo_top: layout?.top ?? '',
    photo_left: layout?.left ?? '',
    photo_width: layout?.width ?? '',
    photo_height: layout?.height ?? '',
    photo_crop_enabled: Boolean(layout?.crop),
    photo_crop_top: layout?.crop?.top ?? '',
    photo_crop_height: layout?.crop?.height ?? ''
  };

  delete form.photo_layout;
  return form;
}

// 크롭 사용 체크했는데 top/height 중 하나라도 비면 저장 중단 (조용한 소실 방지)
// 반환값: 에러 메시지(문자열) 또는 null(검증 통과)
function mentorFormValidate(form) {
  if (form.photo_crop_enabled) {
    const cropTop = String(form.photo_crop_top || '').trim();
    const cropHeight = String(form.photo_crop_height || '').trim();
    if (!cropTop || !cropHeight) {
      return '크롭 값(top/height)을 모두 입력해야 크롭이 적용됩니다';
    }
  }
  return null;
}

function mentorFormToPayload(form) {
  const payload = { ...form };
  const titleLines = parseMentorTitleLines(form.title_lines);

  payload.mentor_name = String(form.mentor_name || '').trim();
  payload.badge = String(form.badge || '').trim() || null;
  payload.title_lines = titleLines.length > 0 ? titleLines : null;
  payload.photo_url = form.photo_url || null;
  payload.photo_layout = buildMentorPhotoLayout(form);
  payload.card_width = Number(form.card_width) || 210;

  for (const key of MENTOR_PHOTO_FORM_KEYS) delete payload[key];
  return payload;
}

function MentorCardFormPreview({ form, onPatch }) {
  const titleLines = parseMentorTitleLines(form.title_lines);
  const photoLayout = buildMentorPhotoLayout(form);

  // MentorCard(공개 랜딩과 동일 컴포넌트)가 기대하는 mentor prop shape로 매핑
  const previewMentor = {
    id: 'preview',
    mentor_name: String(form.mentor_name || '').trim() || '멘토',
    badge: String(form.badge || '').trim(),
    title_lines: titleLines.length > 0 ? titleLines : null,
    photo_url: form.photo_url || '',
    photo: photoLayout,
    card_width: Number(form.card_width) || 210
  };

  const isMissingRequiredFields = !(
    previewMentor.badge &&
    titleLines.length > 0 &&
    previewMentor.photo_url &&
    photoLayout
  );

  return (
    <section className="bg-white p-5 shadow">
      <h2 className="text-sm font-black">라이브 프리뷰</h2>
      <p className="mt-1 text-xs font-bold leading-5 text-gray-500">
        메인 &apos;멘토&apos; 영역과 동일한 컴포넌트로 렌더됩니다.
      </p>

      <div className="mt-3 flex flex-wrap gap-2">
        {MENTOR_CARD_PRESETS.map((preset) => (
          <button
            key={preset.label}
            type="button"
            title={preset.help}
            onClick={() => onPatch(preset.patch)}
            className="rounded border border-gray-400 bg-white px-3 py-1.5 text-xs font-black transition hover:border-[#B88737] hover:bg-[#FFF8E8] hover:text-[#B88737]"
          >
            {preset.label}
          </button>
        ))}
      </div>

      {isMissingRequiredFields && (
        <p className="mt-3 rounded border border-amber-300 bg-amber-50 px-3 py-2 text-xs font-black leading-5 text-amber-700">
          필수 항목(배지·소개 문구·인물 사진·사진 배치)이 비어 있어 랜딩에 카드가 노출되지 않습니다.
        </p>
      )}

      <div className="mt-3 overflow-x-auto rounded bg-[#0D1B2A] p-5">
        {isMissingRequiredFields ? (
          <p className="p-5 text-center text-xs font-bold leading-5 text-white/60">
            필수 항목을 모두 입력하면 카드 미리보기가 표시됩니다.
          </p>
        ) : (
          <ul className="m-0 flex list-none justify-center p-0">
            <MentorCard mentor={previewMentor} />
          </ul>
        )}
      </div>
    </section>
  );
}

// admissionGuidelines 저장 직전 가드: 이미 존재하던 행을 수정하면서(신규 등록은 대상 아님)
// 공개 페이지가 실제로 렌더하는 *_html/*_json 필드 중 하나라도 원래 값과 달라지면, 어떤
// 카테고리가 바뀌는지 목록으로 보여주고 확인을 받는다. 취소하면 저장을 막는다.
//
// doc(jsonb) 변경은 문자열 비교로 못 잡는다 — form[jsonKey]/row[jsonKey]는 객체라 단순
// 비교식으로 두면 서로 다른 객체끼리도 항상 '[object Object]' === '[object Object]'로
// "같음" 판정된다(실질적으로 이 가드가 무력화된다). stableStringifyDoc로 deep 비교해야
// 실제 doc 변경을 잡는다(generatedAt은 stableStringifyDoc이 비교에서 알아서 뺀다).
function admissionGuidelinesValidate(form, row) {
  if (!row) return null;

  const changedLabels = HWP_SECTION_ORDER.filter((key) => {
    const htmlKey = HWP_SECTION_HTML_KEYS[key];
    const jsonKey = HWP_SECTION_JSON_KEYS[key];
    const htmlChanged = cleanAdmissionText(form[htmlKey]) !== cleanAdmissionText(row[htmlKey] ?? '');
    const docChanged = stableStringifyDoc(form[jsonKey] ?? null) !== stableStringifyDoc(row[jsonKey] ?? null);
    return htmlChanged || docChanged;
  }).map((key) => HWP_SECTION_LABELS[key]);

  if (changedLabels.length === 0) return null;

  const proceed = window.confirm(
    `다음 항목의 공개 페이지 내용이 변경됩니다:\n- ${changedLabels.join('\n- ')}\n\n계속 저장하시겠습니까?`
  );

  return proceed ? null : '저장이 취소되었습니다.';
}

// admissionGuidelines 편집 폼 전용: HWP 원문 텍스트를 붙여넣으면 공유 파싱 모듈(admissionParsing.js)로
// 6개 카테고리(raw + *_html)를 자동으로 채우고, 실제 공개 페이지 모달과 동일한 표 스타일로 미리보기를
// 렌더한다. 번호("1.~6.") 마커가 없어 자동 분할이 안 되는 원문이면, 좌측 필드 목록에 이미 있는
// 카테고리별 raw textarea에 직접 나눠 붙여넣는 fallback을 안내하고 "미리보기 새로고침"으로 그 값을
// 기준으로 HTML을 재생성한다.
// locked: 카테고리 편집 다이얼로그가 열려 있는 동안 true. 파싱 실행은
// buildPreviewPatch로 **6섹션을 한 번에** patch하므로, 모달에서 편집 중인
// 섹션 doc이 발밑에서 통째로 갈릴 수 있다. 오버레이가 이미 클릭을 막지만
// 상태를 정합시키기 위해 버튼 자체를 disabled로 둔다(모달을 닫으면 풀린다).
function AdmissionParsingPreview({ form, onPatch, locked = false }) {
  const [hwpSource, setHwpSource] = useState('');
  const [splitStatus, setSplitStatus] = useState(null); // null | 'auto' | 'fallback' | 'manual'
  // 카테고리별 "파싱 결과로 기존 HTML 덮어쓰기" 동의 체크박스 상태. 기본은 비동의(false) —
  // 이미 값이 있는 카테고리는 사용자가 명시적으로 동의해야만 덮어쓴다.
  const [overwriteConsent, setOverwriteConsent] = useState({});

  function toggleConsent(key) {
    setOverwriteConsent((prev) => ({ ...prev, [key]: !prev[key] }));
  }

  // 카테고리 원문 → HTML+문서(doc) 파싱 결과를 patch로 만든다. 저장된 큐레이션 값을
  // 파괴하지 않기 위해 세 가지를 지킨다:
  // (a) 파싱 결과(html)가 빈 문자열이면 patch에서 제외한다 — 원문이 비어 있다고 기존
  //     값을 지우지 않는다(빈 문자열/빈 doc으로 덮어써서 공개 페이지에서 항목이
  //     사라지는 것을 방지).
  // (b) 이미 html 또는 doc 값이 채워져 있는 카테고리는 "덮어쓰기 동의" 체크박스를 켠
  //     경우에만 patch에 포함한다. 동의하지 않은 카테고리는 skipped로 반환해
  //     호출부가 안내한다.
  // (c) html과 doc은 반드시 같은 원문(sourceForm[key])에서 buildHwpCategoryHtml/
  //     buildHwpCategoryDoc로 동시에 만든다 — 서로 다른 시점/다른 소스에서 만들면
  //     공개 페이지(doc 기준)와 어드민 미리보기(예전엔 html만 봄)가 어긋난다. 이게
  //     바로 이번에 고치는 결함이다: 이전에는 patch[htmlKey]만 채우고 patch[jsonKey]가
  //     아예 없어서, 스위치(ADMISSION_JSON_ENABLED)가 켜진 뒤로는 관리자가 원문을
  //     고쳐 파싱을 실행해도 공개 페이지(doc을 읽음)에 반영되지 않았다.
  //     doc이 validateAdmissionDoc을 통과하지 못하면 jsonKey는 쓰지 않는다(기존 값
  //     보존) — 대신 docFailures로 반환해 호출부가 관리자에게 실패 사유를 보여준다.
  //     html은 그 경우에도 계속 갱신한다(원래도 무손실 폴백 경로라, doc이 실패해도
  //     html까지 막을 이유는 없다 — 적어도 html은 최신으로 유지된다).
  function buildPreviewPatch(sourceForm) {
    const patch = {};
    const skipped = [];
    const docFailures = [];

    HWP_SECTION_ORDER.forEach((key) => {
      const htmlKey = HWP_SECTION_HTML_KEYS[key];
      const jsonKey = HWP_SECTION_JSON_KEYS[key];
      const rawText = sourceForm[key];

      const generatedHtml = buildHwpCategoryHtml(key, rawText, sourceForm, sourceForm.university_name);
      if (!generatedHtml) return;

      const existingDoc = sourceForm[jsonKey];
      const hasExisting = (existingDoc && !isEmptyDoc(existingDoc)) || Boolean(cleanAdmissionText(sourceForm[htmlKey]));
      if (hasExisting && !overwriteConsent[key]) {
        skipped.push(HWP_SECTION_LABELS[key]);
        return;
      }

      patch[htmlKey] = generatedHtml;

      const generatedDoc = buildHwpCategoryDoc(key, rawText, sourceForm, sourceForm.university_name);
      const docValidation = validateAdmissionDoc(generatedDoc);
      if (!docValidation.ok) {
        docFailures.push({ label: HWP_SECTION_LABELS[key], errors: docValidation.errors });
        return;
      }

      patch[jsonKey] = generatedDoc;
    });

    return { patch, skipped, docFailures };
  }

  function warnSkipped(skipped) {
    if (!skipped.length) return;
    alert(
      `다음 카테고리는 이미 내용이 있어 자동 반영하지 않았습니다(기존 값 보존):\n- ${skipped.join('\n- ')}\n\n덮어쓰려면 해당 카테고리의 "파싱 결과로 덮어쓰기 동의" 체크박스를 켠 뒤 다시 실행하세요.`
    );
  }

  function warnDocFailures(docFailures) {
    if (!docFailures.length) return;
    const detail = docFailures.map((f) => `- ${f.label}: ${f.errors.join(' / ')}`).join('\n');
    alert(
      `다음 카테고리는 구조화 문서 생성에 실패해 기존 값을 보존했습니다(HTML만 갱신됨):\n${detail}\n\n공개 페이지에 반영하려면 원문을 다시 확인하거나 개발팀에 문의하세요.`
    );
  }

  function runAutoParse() {
    if (!cleanAdmissionText(hwpSource)) {
      alert('HWP 원문 텍스트를 먼저 붙여넣어 주세요.');
      return;
    }

    const sections = splitHwpTextIntoSections(hwpSource);
    const found = HWP_SECTION_ORDER.some((key) => cleanAdmissionText(sections[key]));

    if (!found) {
      setSplitStatus('fallback');
      alert(
        '번호(1.~6.) 마커를 찾지 못해 카테고리 자동 분할에 실패했습니다.\n좌측 각 카테고리의 원문 입력란에 항목별로 직접 붙여넣은 뒤 "미리보기 새로고침"을 눌러주세요.'
      );
      return;
    }

    const rawPatch = {};
    HWP_SECTION_ORDER.forEach((key) => {
      if (cleanAdmissionText(sections[key])) rawPatch[key] = sections[key];
    });
    const mergedRaw = { ...form, ...rawPatch };

    setSplitStatus('auto');
    const { patch, skipped, docFailures } = buildPreviewPatch(mergedRaw);
    onPatch({ ...rawPatch, ...patch });
    warnSkipped(skipped);
    warnDocFailures(docFailures);
  }

  function refreshPreview() {
    setSplitStatus((prev) => prev || 'manual');
    const { patch, skipped, docFailures } = buildPreviewPatch(form);
    onPatch(patch);
    warnSkipped(skipped);
    warnDocFailures(docFailures);
  }

  return (
    <section className="admission-parsing-preview bg-white p-5 shadow">
      <h2 className="text-sm font-black">HWP 원문 파싱 · 미리보기</h2>
      <p className="mt-1 text-xs font-bold leading-5 text-gray-500">
        모집요강 원문 전체(번호 &quot;1.~6.&quot; 포함)를 붙여넣고 파싱을 실행하면 좌측 6개 카테고리
        원문/HTML 필드가 자동으로 채워집니다. 자동 분할이 안 되면 좌측 각 카테고리 원문 입력란에
        직접 나눠 붙여넣은 뒤 &quot;미리보기 새로고침&quot;을 눌러주세요.
      </p>

      <textarea
        value={hwpSource}
        onChange={(e) => setHwpSource(e.target.value)}
        rows={12}
        placeholder="HWP에서 복사한 모집요강 원문 전체를 붙여넣으세요"
        className="mt-3 w-full resize-y border border-[#9ca3af] bg-white px-3 py-2 font-mono text-xs leading-5 outline-none"
      />

      <div className="mt-2 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={runAutoParse}
          disabled={locked}
          className="rounded border border-gray-400 bg-white px-3 py-1.5 text-xs font-black transition hover:border-[#2348ff] hover:bg-[#eef2ff] hover:text-[#2348ff] disabled:cursor-not-allowed disabled:border-gray-200 disabled:bg-gray-50 disabled:text-gray-300 disabled:hover:border-gray-200 disabled:hover:bg-gray-50 disabled:hover:text-gray-300"
        >
          파싱 실행(자동 분할)
        </button>
        <button
          type="button"
          onClick={refreshPreview}
          disabled={locked}
          className="rounded border border-gray-400 bg-white px-3 py-1.5 text-xs font-black transition hover:border-[#2348ff] hover:bg-[#eef2ff] hover:text-[#2348ff] disabled:cursor-not-allowed disabled:border-gray-200 disabled:bg-gray-50 disabled:text-gray-300 disabled:hover:border-gray-200 disabled:hover:bg-gray-50 disabled:hover:text-gray-300"
        >
          미리보기 새로고침(좌측 원문 기준)
        </button>
      </div>

      {locked && (
        <p className="mt-2 rounded border border-[#c7d2fe] bg-[#eef2ff] px-3 py-2 text-xs font-black leading-5 text-[#2348ff]">
          카테고리 편집 창이 열려 있는 동안에는 파싱을 실행할 수 없습니다. 파싱은 6개 카테고리를 한
          번에 덮어쓰므로 편집 중인 내용이 사라질 수 있습니다.
        </p>
      )}

      {splitStatus === 'fallback' && (
        <p className="mt-3 rounded border border-amber-300 bg-amber-50 px-3 py-2 text-xs font-black leading-5 text-amber-700">
          자동 분할 실패 — 좌측 각 카테고리 원문(raw) 입력란에 카테고리별로 직접 붙여넣은 뒤
          &quot;미리보기 새로고침&quot;을 눌러주세요.
        </p>
      )}

      {/* admission-modal-body는 여기 쓰지 않는다 — AdmissionGuidelines.jsx의 모달 스코프
          규칙에 기대는 죽은 참조였다(이 페이지엔 그 CSS가 로드되지 않는다, 2026-08-06
          전수조사로 확인). data-section은 카테고리별로 다르므로 아래 map 안 개별 항목에
          붙인다(minimum_requirements/exam_schedule 폭 규칙이 카테고리 단위이기 때문). */}
      <div className="mt-4 space-y-4 border-t border-[#edf0f4] pt-4">
        {HWP_SECTION_ORDER.map((key) => {
          const html = form[HWP_SECTION_HTML_KEYS[key]];
          const doc = isDocRenderEnabled() ? form[HWP_SECTION_JSON_KEYS[key]] : null;
          const docOk = Boolean(doc && validateAdmissionDoc(doc).ok && !isEmptyDoc(doc));
          // buildPreviewPatch는 아직 htmlKey만 채운다(jsonKey 동시 생성은 별도
          // 커밋 범위) — 그래도 doc이 이미 저장돼 있을 수 있으니(백필 등) 동의
          // 체크박스 노출 조건은 html뿐 아니라 doc 존재 여부도 함께 본다.
          const hasExisting = docOk || Boolean(cleanAdmissionText(html));
          return (
            <div key={key} className="admission-surface" data-section={key}>
              <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
                <h3 className="text-xs font-black text-[#013262]">{HWP_SECTION_LABELS[key]}</h3>
                {hasExisting && (
                  <label className="flex items-center gap-1 text-[11px] font-bold text-amber-700">
                    <input
                      type="checkbox"
                      checked={Boolean(overwriteConsent[key])}
                      onChange={() => toggleConsent(key)}
                    />
                    파싱 결과로 덮어쓰기 동의
                  </label>
                )}
              </div>
              {docOk ? (
                <AdmissionSectionView doc={doc} sectionKey={key} surface="admin" />
              ) : html ? (
                // html은 buildHwpCategoryHtml → buildRawSectionHtml 경로로 만들어지며
                // 보통 admission-raw-section-wrap을 자체 포함한다. 다만 이 필드는
                // 과거에 다른 경로로 저장된 값(admission-existing-html 자체 포함
                // 여부가 다를 수 있음)도 들어올 수 있어, 공개 모달과 동일하게
                // "이미 자기 래퍼를 가졌는지" 검사해 이중 래핑을 피한다.
                <SafeHtml html={html} className={ADMISSION_EXISTING_WRAP_RE.test(html) ? undefined : 'admission-existing-html'} />
              ) : (
                <p className="text-xs font-bold text-gray-400">
                  미리보기 없음 — 원문을 입력하고 파싱을 실행하세요.
                </p>
              )}
            </div>
          );
        })}
      </div>

      {/* 표/블록 표면 스타일은 이제 AdmissionSurface.jsx가 소유한다(2단계, 2026-08-06
          사용자 지시 "컴포넌트화") — 여기 있던 자체 사본(그리드 테두리·13px·#013262 헤더 등,
          공개 모달의 수십 차례 Figma 재조정을 못 따라가 드리프트됐었다)은 삭제했다.
          이 페이지에 남기는 건 이 표 시스템과 무관한 범용 유틸리티 .muted뿐이다.
          ⚠ 2026-08-06 결함 수정: .admission-parsing-preview 스코프의 가로 스크롤바
          숨김 규칙(scrollbar-width:none 등)을 여기서 지웠다 — 이 패널의 6개 카테고리에
          admission-surface를 붙이면서(위 map 안) 이 패널의 .admission-scroll-table도
          그 숨김 규칙 대상이 됐는데, 공개 모달과 달리 이 페이지엔 대체 스크롤 수단
          (.admission-modal-x-scroll 프록시)이 없다 — 관리자가 870px 컨테이너 안에서
          1567px 표(모집인원및입결 등)를 스크롤할 방법 자체를 잃었다(실측: scrollLeft
          강제 설정하면 스크롤은 되는데 스크롤바가 안 보여 존재를 알 방법이 없었다).
          이 규칙을 처음 넣은 688ee97에는 스크롤 관련 근거 주석이 없다 — "모달과 동일하게
          유지"라는 범용 문구뿐이라, 프록시 스크롤바 전제(공개 모달 전용 장치, BLOCK3
          쉘 padding 계산에 의존)를 검증 없이 그대로 복사해온 것으로 보인다. 프록시를
          어드민에 옮기지 않고(공개 전용 장치를 옮기면 그 계산을 다시 맞춰야 함) 대신
          네이티브 스크롤바가 보이도록 숨김 규칙 자체를 없앴다. */}
      <style>{`
        .muted { color: #667085; }
      `}</style>
    </section>
  );
}

// 2026-08-06 사용자 지적("어드민이 너무 무겁다", 폼 높이 9,873px = 화면
// 11.4개, input 502개) — 근본 원인은 위계가 아니라 구조였다: 6개 카테고리
// (raw+문서+html 미러 3필드씩 18필드)를 한 폼에 전부 펼쳐 동시 렌더했다.
// 카테고리를 묶어 한 번에 하나만 마운트한다 — CSS로 숨기는 게 아니라
// (display:none) 열지 않은 카테고리의 field row 자체를 렌더 트리에서 뺀다 —
// React가 그 서브트리를 만들지 않으므로 DOM 노드·리렌더 비용이 실제로 준다.
// field.group이 없는 필드(admissionGuidelines 외 모든 config)는 항상 그대로
// 렌더돼 다른 화면은 영향 없다.
// 2026-08-07 이후 "여는 장치"는 아코디언이 아니라 편집 다이얼로그다:
// buildFieldRenderItems는 group 필드를 아예 items에 안 넣고(헤더만 남긴다),
// 실제 field는 modalSection === field.group일 때 모달 본문이 마운트한다.
// 동시 마운트 최대 1개라는 불변식은 그대로다.

// 카테고리 헤더에 보여줄 한 줄 요약. doc이 있으면 표/블록 개수, 없으면
// 원문 유무만 판정한다 — 관리자가 어느 카테고리를 열지 판단하는 용도라
// 정확한 렌더 결과 예측까지는 필요 없다(그건 펼쳐서 문서 편집기로 본다).
function summarizeHwpSection(sectionKey, form) {
  const jsonKey = HWP_SECTION_JSON_KEYS[sectionKey];
  const doc = jsonKey ? form[jsonKey] : null;
  const blocks = doc && Array.isArray(doc.blocks) ? doc.blocks : [];
  if (!blocks.length) {
    return cleanAdmissionText(form[sectionKey]) ? '원문 있음(문서 미생성)' : '내용 없음';
  }
  const tableBlocks = blocks.filter((block) => block.kind === 'table');
  const parts = [];
  if (tableBlocks.length) {
    const first = tableBlocks[0];
    const cols = Array.isArray(first.columns) ? first.columns.length : 0;
    const rowCount = Array.isArray(first.rows) ? first.rows.length : 0;
    parts.push(`표 ${tableBlocks.length}개 · ${cols}열 ${rowCount}행`);
  }
  const otherCount = blocks.length - tableBlocks.length;
  if (otherCount > 0) parts.push(`블록 ${otherCount}개`);
  return parts.join(' · ') || `블록 ${blocks.length}개`;
}

// fields를 순서 그대로 훑으며 field.group이 있는 항목은 그룹당 헤더 1개로
// 묶는다. group이 없는 필드는 항상 그대로 통과.
//
// 2026-08-07: 카테고리 필드를 폼 안에서 인라인으로 펼치지 않는다. 펼침 대상이
// 아코디언에서 편집 다이얼로그로 바뀌었기 때문이다(사용자 지시 "서비스 모달
// 구조를 그대로"). 위 주석의 원래 목적 — 접힌 카테고리의 서브트리를 아예
// 만들지 않아 폼 높이 9,873px / input 502개를 3,744px / 14개로 줄인 것 — 은
// 그대로 유지된다: 카테고리 필드는 이제 폼이 아니라 모달이 마운트하고,
// 모달은 한 번에 최대 1개만 열린다(modalSection이 단일 값).
function buildFieldRenderItems(fields, form) {
  const items = [];
  const seenGroups = new Set();
  fields.forEach((field) => {
    if (!field.group) {
      items.push({ type: 'field', field });
      return;
    }
    if (!seenGroups.has(field.group)) {
      seenGroups.add(field.group);
      items.push({
        type: 'header',
        groupKey: field.group,
        label: HWP_SECTION_LABELS[field.group] || field.group,
        summary: summarizeHwpSection(field.group, form)
      });
    }
  });
  return items;
}

// 구 CategoryAccordionHeader. 같은 자리·같은 모양이지만 여는 대상이 인라인
// 펼침이 아니라 편집 다이얼로그다 — ▸ 회전 표시 대신 "수정" 어포던스를 둔다
// (목록 셀의 [수정]과 같은 동작, 같은 모달).
function CategorySectionButton({ item, onOpen }) {
  return (
    <button
      type="button"
      onClick={onOpen}
      className="flex w-full items-center justify-between gap-3 border-b border-[#edf0f4] bg-[#fafafa] px-5 py-3 text-left transition hover:bg-[#f3f4f6]"
    >
      <span className="text-sm font-black">{item.label}</span>
      <span className="flex items-center gap-3">
        <span className="text-xs font-bold text-gray-500">{item.summary}</span>
        <span className="rounded border border-[#c7d2fe] bg-[#eef2ff] px-2.5 py-1 text-xs font-black text-[#2348ff]">
          수정
        </span>
      </span>
    </button>
  );
}

// 카테고리(field.group) 필드 1개의 편집 UI. 아코디언이 폼 안에서 렌더하던
// 것을 **재타이핑 없이** 그대로 떼어 온 것 — 편집 다이얼로그 본문이 이걸
// 쓴다. 문서 편집기(admissionDoc)만 그린다: 원문(raw)·HTML 미러(둘 다
// field.type === 'textarea', group만 admissionDoc과 공유)는 사용자 지시
// (2026-08-10) "원문(raw) 보기/편집, HTML 미러 보기 이 두가지도 dialog에서
// 없애줘. 불필요해" 에 따라 렌더를 뺐다.
//
// ⚠ 필드 자체(config.fields의 raw/html 항목)는 지우지 않았다 — rowToForm이
// row 전체를 스프레드해 form 상태에 그대로 실리고, formToPayload도 form을
// 스프레드해 그대로 되돌려 보낸다(AdminForm.rowToForm/formToPayload,
// :1198/:1207 부근). 여기서 렌더만 껐을 뿐 form[field.key]는 사용자가
// 다이얼로그에서 손대지 않은 값 그대로 저장 왕복한다 — raw는 엑셀 대량
// 업로드의 "업로드 raw == DB raw면 무변경" 판정 기준이고, html은 롤백
// 수단·레거시 임포터 입력원이라 컬럼 자체를 없애면 안 된다.
// 220px 라벨 열을 쓰지 않는 것도 원본 그대로다: 카테고리명은 이미 모달
// 제목에 있어 필드 라벨을 반복할 이유가 없다.
function AdmissionGroupField({ field, form, readonly, onChange, onPatch, onDirty }) {
  if (field.type !== 'admissionDoc') return null;
  return (
    <div
      // admission-surface: 표 표면 스타일을 공개 모달과 공유(AdmissionSurface.jsx
      // 참고) — minimum_requirements/exam_schedule 폭 규칙이 걸리게 한다.
      // 좌우 px-5는 모달 본문이 이미 px-6/md:px-12를 갖고 있어 뺐다.
      className="admission-surface border-b border-[#edf0f4] py-4"
      data-section={field.group}
    >
      <AdmissionDocFieldEditor field={field} form={form} onPatch={onPatch} onDirty={onDirty} />
    </div>
  );
}

function AdminForm({
  config,
  mode,
  row,
  onCancel,
  onSave,
  onUpload,
  origin = 'form',
  initialSection = null,
  // createDefaults: 다른 탭에서 "이 값으로 새 행을 만들어라"며 넘겨 온 1회성
  // 프리필. Admin()의 pendingCreateDefaults가 유일한 공급자다. 넘기지 않으면
  // undefined라 아래 spread가 {}가 되어 기존 동작과 완전히 동일하다.
  createDefaults = null
}) {
  const [form, setForm] = useState(() => {
    if (row) return config.rowToForm ? config.rowToForm(row) : { ...row };
    return { ...(config.defaults || {}), ...(createDefaults || {}) };
  });
  const [dirty, setDirty] = useState(false);
  // 열려 있는 카테고리 편집 다이얼로그의 섹션 키(field.group 있는 config,
  // 현재는 admissionGuidelines 뿐). null이면 닫힘 — 한 번에 최대 1개.
  //
  // 모드 A(origin === 'list'): 목록 셀 [수정]으로 들어오면 initialSection이
  //   실려 와 마운트 즉시 모달이 열린다. 폼은 오버레이 뒤에서 저장 엔진으로만
  //   산다 — 사용자에게는 "목록 → 다이얼로그" 1뎁스로 보인다(공개와 동일).
  // 모드 B(origin === 'form'): 기존 ✏️ 경로. 폼 화면의 카테고리 버튼으로 연다.
  const [modalSection, setModalSection] = useState(initialSection);
  // 모달 푸터 [저장]이 실제 <form>의 submit을 발화시키기 위한 ref.
  // requestSubmit()은 click() 우회와 달리 onSubmit 핸들러와 HTML 검증을
  // 정상적으로 태운다 — 저장 경로가 폼 하단 [저장]과 완전히 동일해진다.
  const formRef = useRef(null);
  // blockEditor는 uncontrolled라 값 변화를 form에 반영하지 않는다 — ref는 key당 1개만 유지.
  const editorRefs = useRef(new Map());
  // 미리보기는 "미리보기" 버튼을 눌렀을 때 getBlocks()를 1회 호출한 스냅샷이다.
  // null이면 닫힘 — 라이브 갱신 없음, 에디터로 되돌아가는 데이터 경로 없음.
  const [previewPost, setPreviewPost] = useState(null);
  const blockEditorField = (config.fields || []).find((field) => field.type === 'blockEditor');

  function getEditorRef(key) {
    if (!editorRefs.current.has(key)) editorRefs.current.set(key, { current: null });
    return editorRefs.current.get(key);
  }

  function openPreview() {
    if (!blockEditorField) return;
    const editorRef = editorRefs.current.get(blockEditorField.key);
    const blocks = editorRef?.current ? editorRef.current.getBlocks() : [];

    setPreviewPost({
      title: form[config.previewTitleKey ?? 'title'],
      category: form.category,
      image_urls: form.image_urls,
      image_url: form.image_url,
      content_json: { blocks },
      content: blocksToPlainText(blocks)
    });
  }

  const readonly = config.readOnly;

  // 편집 중 이탈 시 작업 유실을 막기 위한 최소 가드. 정확도보다 "경고가 뜨는 것" 자체가 핵심이라
  // 편집 여부 판정은 단순하게(필드 변경 또는 에디터 영역 입력 감지) 둔다.
  useEffect(() => {
    if (!dirty) return undefined;
    function handleBeforeUnload(e) {
      e.preventDefault();
      e.returnValue = '';
    }
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [dirty]);

  function handleCancel() {
    if (dirty && !window.confirm('저장하지 않은 변경사항이 있습니다. 나가시겠습니까?')) return;
    onCancel();
  }

  // 모달 닫기(푸터 버튼 / X / ESC / 오버레이 공통). 두 모드의 유일한 차이가
  // 여기다.
  //   모드 A: 모달 닫기 = 폼 이탈이므로 기존 handleCancel을 그대로 호출한다
  //          (dirty면 기존 confirm이 뜨고, 확인하면 목록으로 복귀).
  //          새 confirm을 만들지 않는다 — 경고는 한 벌이어야 한다.
  //   모드 B: 폼 화면으로 복귀할 뿐이라 아무것도 유실되지 않는다. 편집 상태는
  //          모달이 아니라 이 AdminForm의 form state가 들고 있고 모달은 그
  //          창일 뿐이다. 여기에 "변경 유실 경고"를 붙이면 거짓말이므로 붙이지
  //          않는다(대신 모달 헤드의 '● 저장 안 됨' 뱃지와 푸터 안내문).
  function closeSectionModal() {
    if (origin === 'list') {
      handleCancel();
      return;
    }
    setModalSection(null);
  }

  function change(key, value) {
    setDirty(true);
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function patch(values) {
    setDirty(true);
    setForm((prev) => ({ ...prev, ...values }));
  }

  async function uploadMultiple(fileList, field) {
    const files = Array.from(fileList || []);
    if (files.length === 0) return;

    const uploaded = await onUpload(files, field);
    if (!uploaded || uploaded.length === 0) return;

    if (field.type === 'multiImage') {
      const current = normalizeArray(form[field.key]);
      change(field.key, [...current, ...uploaded.map((item) => item.url)]);
      return;
    }

    if (field.type === 'multiFile') {
      const current = normalizeArray(form[field.key]);
      change(field.key, [
        ...current,
        ...uploaded.map((item) => ({
          name: item.name,
          url: item.url,
          size: item.size,
          type: item.type
        }))
      ]);
    }
  }

  function removeListItem(key, index) {
    const current = normalizeArray(form[key]);
    change(
      key,
      current.filter((_, i) => i !== index)
    );
  }

  function submit(e) {
    e.preventDefault();

    if (readonly) {
      onCancel();
      return;
    }

    for (const field of config.fields || []) {
      if (!field.required) continue;

      // uncontrolled 에디터는 form[key]가 애초에 채워지지 않으므로 ref로 별도 판정한다.
      if (field.type === 'blockEditor') {
        const editorRef = editorRefs.current.get(field.key);
        if (!editorRef?.current || editorRef.current.isEmpty()) {
          alert(`${field.label} 항목을 입력해주세요.`);
          return;
        }
        continue;
      }

      if (String(form[field.key] ?? '').trim() === '') {
        alert(`${field.label} 항목을 입력해주세요.`);
        return;
      }
    }

    if (config.validate) {
      const error = config.validate(form, row);
      if (error) {
        alert(error);
        return;
      }
    }

    let merged = form;
    const blockEditorFields = (config.fields || []).filter((field) => field.type === 'blockEditor');
    if (blockEditorFields.length > 0) {
      merged = { ...form };
      for (const field of blockEditorFields) {
        const editorRef = editorRefs.current.get(field.key);
        merged[`__blocks_${field.key}`] = editorRef?.current ? editorRef.current.getBlocks() : [];
      }
    }

    setDirty(false);
    onSave(merged);
  }

  // 모달 본문에 넣을 카테고리 필드 3개(문서 json / 원문 raw / html 미러).
  const groupFields = (config.fields || []).filter((field) => field.group === modalSection);

  return (
    // 모달을 <form>의 **형제**로 둔다. 편집 input이 <form> 안에 있으면 셀에서
    // Enter를 치는 순간 폼이 암묵 제출되는데(기존 결함), 모달에서는 그게
    // "의도치 않은 저장 → setMode('list') → 모달 소멸"로 악화된다. 모달 입력은
    // 전부 controlled React state라 <form> 밖에 있어도 form/patch에 아무 영향이
    // 없다 — 부작용으로 기존 Enter-제출 결함이 모달 경로에서 사라진다.
    //
    // 아래 <form> 본문은 들여쓰기를 그대로 뒀다. 한 단계 더 들여쓰면 380줄이
    // 통째로 diff에 잡혀 실제 변경(래핑 + 모달 추가)이 묻힌다.
    <>
    <form ref={formRef} onSubmit={submit}>
      <h1 className="mb-5 text-2xl font-black text-[#111827]">
        {config.title} {mode === 'create' ? '등록' : readonly ? '상세' : '수정'}
      </h1>

      {config.homepage && (
        <p className="mb-4 rounded border border-red-100 bg-red-50 px-4 py-3 text-sm font-bold text-red-600">
          이 메뉴에서 저장한 내용은 실제 홈페이지에 반영됩니다.
        </p>
      )}

      {config.guideText && (
        <p className="mb-4 rounded border border-red-200 bg-red-50 px-4 py-3 text-sm font-black leading-6 text-red-600">
          {config.guideText}
        </p>
      )}

      {/* 2단계(2026-08-06): 표 표면 스타일을 공개 모달과 공유 — field.group이
          있는 config(현재 admissionGuidelines뿐)에서만 렌더한다. showSectionTitle/
          showChangeNoColumn 둘 다 어드민 전용 값 — 절 제목 노출, 전년도와 차이점
          번호 컬럼 노출(구 죽은 Admin.jsx 스타일을 AdmissionSurface.jsx가 되살림).
          공개 모달은 자기 자신의 <AdmissionSurface />(기본값 false/false)를 따로
          렌더하므로(별개 라우트, 동시 마운트 안 됨) 여기서 true로 켜도 공개로 새지
          않는다. */}
      {(config.fields || []).some((field) => field.group) && <AdmissionSurface showSectionTitle showChangeNoColumn />}

      <div className="flex flex-col gap-6 xl:flex-row xl:items-start">
        <div className="min-w-0 flex-1 bg-white shadow">
          {buildFieldRenderItems(
            (config.fields || config.columns).filter((field) => !field.showIf || field.showIf(form)),
            form
          ).map((item) => {
            if (item.type === 'header') {
              return (
                <CategorySectionButton
                  key={`group-header-${item.groupKey}`}
                  item={item}
                  onOpen={() => setModalSection(item.groupKey)}
                />
              );
            }
            // field.resolve(form, row): 같은 폼의 다른 필드 값에 따라 이 필드의
            // 표시 속성(label/help/placeholder/min/max/readOnly)만 부분 덮어쓴다.
            // 목표관리 대학 컷의 avg_cut이 cut_type에 따라 단위·범위가 통째로
            // 달라지는 요구 때문에 들어왔다(명세 §3-D4 ①). key/type은 덮지 않는
            // 것이 계약이다 — 덮으면 form 상태의 키가 어긋난다.
            // resolve를 선언하지 않은 config는 item.field를 그대로 쓰므로 기존
            // 탭들의 렌더 경로가 바뀌지 않는다(저장소 전체 field.resolve 선언 0건).
            //
            // ⚠ 적용 범위 계약: **이 폼 본문 루프뿐이다.** 카테고리 편집 모달의
            //   groupFields(config.fields.filter(f => f.group === modalSection))는
            //   resolve를 거치지 않고 원본 field를 그대로 렌더한다. 지금은
            //   resolve를 쓰는 config(goalUniversityCuts)에 group 필드가 없어
            //   실효가 없지만, group과 resolve를 함께 쓰려면 그쪽에도 같은
            //   변환을 태워야 한다.
            const field = item.field.resolve
              ? { ...item.field, ...item.field.resolve(form, row) }
              : item.field;

            return (
              <div key={field.key} className="grid grid-cols-[220px_1fr] border-b border-[#edf0f4]">
                <div className="bg-[#fafafa] px-5 py-3 text-sm font-black">
                  {field.label}
                  {field.required && <span className="ml-1 text-red-500">*</span>}
                  {field.help && (
                    <p className="mt-1 text-xs font-normal leading-5 text-gray-500">{field.help}</p>
                  )}
                </div>

                <div className="min-w-0 px-5 py-3">
                  {readonly || field.readOnly ? (
                    field.type === 'image' && form[field.key] ? (
                      <img src={form[field.key]} alt="" className="h-24 w-40 object-cover" />
                    ) : (
                      <div className="py-2 text-sm">{formatValue(form[field.key], field.type, field.options)}</div>
                    )
                  ) : (
                    <>
                      {!['file', 'multiImage', 'multiFile', 'blockEditor', 'admissionDoc'].includes(field.type) &&
                        !(field.type === 'image' && field.hideUrlInput) &&
                        // readOnly textarea(예: *_html 미러)는 3차 정보 — 데이터 셀보다
                        // 큰 자리를 차지하지 않도록 기본 접힘(details/summary)으로 감싼다.
                        // 기능(값 확인·복사)은 그대로, 펼쳐야 보이게만 바꾼 것.
                        (field.type === 'textarea' && field.readOnly ? (
                          <details className="group">
                            <summary className="cursor-pointer text-xs font-bold text-gray-400 hover:text-gray-600">
                              HTML 미러 보기(자동 생성, 편집 불가)
                            </summary>
                            <div className="mt-2">
                              <AdminInput field={field} value={form[field.key]} onChange={change} disabled={readonly} />
                            </div>
                          </details>
                        ) : (
                          <AdminInput
                            field={field}
                            value={form[field.key]}
                            onChange={change}
                            disabled={readonly}
                          />
                        ))}

                      {field.type === 'admissionDoc' && (
                        <AdmissionDocFieldEditor
                          field={field}
                          form={form}
                          onPatch={patch}
                          onDirty={() => setDirty(true)}
                        />
                      )}

                      {field.type === 'blockEditor' && (
                        // onInput/onKeyDown은 BlockNote가 내부에 렌더하는 contenteditable DOM에서
                        // 버블링돼 올라온다 — BlockEditor 자체를 건드리지 않고 dirty만 감지한다.
                        <div
                          onInput={() => setDirty(true)}
                          onKeyDown={() => setDirty(true)}
                        >
                          <BlockEditor
                            ref={getEditorRef(field.key)}
                            key={row?.id ?? 'new'}
                            initialContent={
                              form[`${field.key}_json`]?.blocks ??
                              (form[field.key] ? plainTextToBlocks(form[field.key]) : undefined)
                            }
                            uploadFile={async (file) => {
                              const uploaded = await onUpload(file, field);
                              if (!uploaded?.[0]?.url) throw new Error('이미지 업로드에 실패했습니다.');
                              return uploaded[0].url;
                            }}
                          />
                        </div>
                      )}

                      {field.type === 'image' && (
                        <div className="mt-3 flex items-center gap-3">
                          {form[field.key] ? (
                            <img
                              src={form[field.key]}
                              alt=""
                              className="h-20 w-32 rounded border object-cover"
                            />
                          ) : (
                            <div className="flex h-20 w-32 items-center justify-center rounded border bg-gray-50 text-xs font-bold text-gray-400">
                              이미지 없음
                            </div>
                          )}

                          <label className="inline-flex cursor-pointer items-center gap-2 rounded border border-gray-400 bg-white px-4 py-2 text-sm font-black hover:bg-gray-50">
                            <UploadCloud size={16} />
                            이미지 업로드
                            <input
                              type="file"
                              accept="image/*"
                              className="hidden"
                              onChange={async (e) => {
                                const uploaded = await onUpload(e.target.files?.[0], field);
                                if (uploaded?.[0]?.url) {
                                  change(field.key, uploaded[0].url);
                                }
                              }}
                            />
                          </label>
                        </div>
                      )}
                      {field.type === 'file' && (
                        <div className="mt-3 flex items-center gap-3">
                          {form[field.key] ? (
                            <a
                              href={form[field.key]}
                              target="_blank"
                              rel="noreferrer"
                              className="inline-flex h-10 items-center rounded border border-blue-200 bg-blue-50 px-4 text-sm font-bold text-blue-700 hover:bg-blue-100"
                            >
                              {form[field.nameKey] || '첨부파일 보기'}
                            </a>
                          ) : (
                            <div className="flex h-10 items-center rounded border bg-gray-50 px-4 text-xs font-bold text-gray-400">
                              첨부파일 없음
                            </div>
                          )}

                          <label className="inline-flex cursor-pointer items-center gap-2 rounded border border-gray-400 bg-white px-4 py-2 text-sm font-black hover:bg-gray-50">
                            <UploadCloud size={16} />
                            파일 등록
                            <input
                              type="file"
                              accept={field.accept || '*'}
                              className="hidden"
                              onChange={async (e) => {
                                const uploaded = await onUpload(e.target.files?.[0], field);
                                if (uploaded?.[0]?.url) {
                                  change(field.key, uploaded[0].url);
                                  if (field.nameKey) change(field.nameKey, uploaded[0].name);
                                }
                              }}
                            />
                          </label>

                          {form[field.key] && (
                            <button
                              type="button"
                              onClick={() => {
                                change(field.key, '');
                                if (field.nameKey) change(field.nameKey, '');
                              }}
                              className="h-10 rounded border border-red-200 bg-red-50 px-4 text-sm font-black text-red-600 hover:bg-red-100"
                            >
                              삭제
                            </button>
                          )}
                        </div>
                      )}

                      {field.type === 'multiImage' && (
                        <div className="space-y-3">
                          <div className="flex flex-wrap gap-3">
                            {normalizeArray(form[field.key]).length > 0 ? (
                              normalizeArray(form[field.key]).map((url, index) => (
                                <div key={`${url}-${index}`} className="relative">
                                  <img
                                    src={url}
                                    alt=""
                                    className="h-28 w-40 rounded border object-cover"
                                  />
                                  <button
                                    type="button"
                                    onClick={() => removeListItem(field.key, index)}
                                    className="absolute right-1 top-1 rounded bg-black/70 px-2 py-1 text-xs font-black text-white"
                                  >
                                    삭제
                                  </button>
                                </div>
                              ))
                            ) : (
                              <div className="flex h-20 w-32 items-center justify-center rounded border bg-gray-50 text-xs font-bold text-gray-400">
                                이미지 없음
                              </div>
                            )}
                          </div>

                          <label className="inline-flex cursor-pointer items-center gap-2 rounded border border-gray-400 bg-white px-4 py-2 text-sm font-black hover:bg-gray-50">
                            <UploadCloud size={16} />
                            이미지 여러 개 업로드
                            <input
                              type="file"
                              accept="image/*"
                              multiple
                              className="hidden"
                              onChange={(e) => uploadMultiple(e.target.files, field)}
                            />
                          </label>
                        </div>
                      )}

                      {field.type === 'multiFile' && (
                        <div className="space-y-3">
                          <div className="space-y-2">
                            {normalizeArray(form[field.key]).length > 0 ? (
                              normalizeArray(form[field.key]).map((item, index) => {
                                const fileUrl = typeof item === 'string' ? item : item?.url;
                                const fileName = item?.name || getFileNameFromUrl(fileUrl);

                                return (
                                  <div
                                    key={`${fileUrl}-${index}`}
                                    className="flex items-center justify-between rounded border bg-gray-50 px-4 py-2"
                                  >
                                    <a
                                      href={fileUrl}
                                      target="_blank"
                                      rel="noreferrer"
                                      className="text-sm font-bold text-blue-700 hover:underline"
                                    >
                                      {fileName}
                                    </a>

                                    <button
                                      type="button"
                                      onClick={() => removeListItem(field.key, index)}
                                      className="rounded border border-red-200 bg-red-50 px-3 py-1 text-xs font-black text-red-600 hover:bg-red-100"
                                    >
                                      삭제
                                    </button>
                                  </div>
                                );
                              })
                            ) : (
                              <div className="flex h-10 items-center rounded border bg-gray-50 px-4 text-xs font-bold text-gray-400">
                                첨부파일 없음
                              </div>
                            )}
                          </div>

                          <label className="inline-flex cursor-pointer items-center gap-2 rounded border border-gray-400 bg-white px-4 py-2 text-sm font-black hover:bg-gray-50">
                            <UploadCloud size={16} />
                            파일 여러 개 등록
                            <input
                              type="file"
                              accept={field.accept || '*'}
                              multiple
                              className="hidden"
                              onChange={(e) => uploadMultiple(e.target.files, field)}
                            />
                          </label>
                        </div>
                      )}
                    </>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {config.FormPreview && (
          <div className="w-full xl:sticky xl:top-[4.5rem] xl:w-[23.75rem] xl:shrink-0">
            <config.FormPreview form={form} onPatch={patch} locked={Boolean(modalSection)} />
          </div>
        )}
      </div>

      <div className="mt-5 flex justify-end gap-2">
        {!readonly && blockEditorField && (
          <button
            type="button"
            onClick={openPreview}
            className="h-10 border border-[#2348ff] bg-white px-5 text-sm font-black text-[#2348ff]"
          >
            미리보기
          </button>
        )}

        <button
          type="button"
          onClick={handleCancel}
          className="h-10 bg-[#4b5563] px-5 text-sm font-black text-white"
        >
          취소
        </button>

        {!readonly && (
          <button type="submit" className="h-10 bg-[#2348ff] px-5 text-sm font-black text-white">
            저장
          </button>
        )}
      </div>

      <ColumnPreviewModal
        open={Boolean(previewPost)}
        onClose={() => setPreviewPost(null)}
        post={previewPost}
        label={config.previewLabel}
      />
    </form>

      {/* 공개 모달과 **같은 껍데기**(AdmissionModalShell)를 쓰는 편집
          다이얼로그. 본문만 뷰어 대신 편집 필드를 넣는다. */}
      <AdmissionSectionEditModal
        open={Boolean(modalSection)}
        sectionKey={modalSection}
        sectionLabel={HWP_SECTION_LABELS[modalSection] || modalSection}
        universityName={form.university_name}
        dirty={dirty}
        origin={origin}
        onClose={closeSectionModal}
        // 저장은 폼 하단 [저장]과 **완전히 같은 단일 경로**다: requestSubmit →
        // submit(required 검사 → config.validate confirm) → onSave(merged) →
        // saveRow → formToPayload → update().eq('id') → setMode('list').
        // AdminForm이 언마운트되면서 모달도 함께 사라지고 목록으로 돌아간다 —
        // 공개 모달(닫으면 목록)과 같은 루프다. 부분 저장 경로는 만들지 않는다.
        onSave={() => formRef.current?.requestSubmit()}
      >
        {groupFields.map((field) => (
          <AdmissionGroupField
            key={field.key}
            field={field}
            form={form}
            readonly={readonly}
            onChange={change}
            onPatch={patch}
            onDirty={() => setDirty(true)}
          />
        ))}
      </AdmissionSectionEditModal>
    </>
  );
}

// fn_complete_refund 가 그대로 거부할 상태를 버튼 단계에서 먼저 막는다(Baseline
// §2 fn_complete_refund 본문 WC035/WC036 조건과 동일) — refundRequests 탭
// 전용 판정이라 activeKey==='refundRequests' 일 때만 쓰인다.
function isRefundCompletionBlocked(row) {
  if (!row) return true;
  if (row.approval_status !== 'approved') return true;
  if (!['requested', 'processing'].includes(row.status)) return true;
  return false;
}

function AdminTable({
  config,
  rows,
  page,
  setPage,
  totalCount,
  onEdit,
  onDelete,
  activeKey,
  onCompleteRefund,
  onOpenSection,
  onOpenMetaEdit
}) {
  // 두 가지 조달 방식이 한 표를 공유한다.
  //  - 기본(35개 config): loadRows가 전량을 가져오고 여기서 PAGE_SIZE로 잘라 쓴다.
  //  - config.serverPaginate(입결 43k행): rows가 이미 "현재 페이지 PAGE_SIZE행"이라
  //    자르면 안 되고, 전체 건수는 서버 count(totalCount)로 따로 받는다.
  const serverPaginated = Boolean(config.serverPaginate);
  const total = serverPaginated ? totalCount : rows.length;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const start = (page - 1) * PAGE_SIZE;
  const pageRows = useMemo(
    () => (serverPaginated ? rows : rows.slice(start, start + PAGE_SIZE)),
    [rows, start, serverPaginated]
  );

  // 페이지 번호 창. 기존에는 1~10을 고정 렌더했는데, 4,300페이지짜리 입결 목록에서는
  // 그 방식으로 11페이지 이후에 도달할 방법이 없다(≫ 버튼으로 끝으로 점프한 뒤에도
  // 번호줄은 1~10을 가리킨다). 현재 페이지를 가운데 두고 창을 굴린다 —
  // totalPages ≤ 10이면 예전과 완전히 같은 1..N이 나온다.
  const windowSize = Math.min(totalPages, 10);
  const windowStart = Math.min(
    Math.max(1, page - Math.floor(windowSize / 2)),
    Math.max(1, totalPages - windowSize + 1)
  );
  const pageNumbers = Array.from({ length: windowSize }, (_, index) => windowStart + index);

  // 섹션 요약(summarizeHwpSection)은 페이지당 최대 60회(10행 × 6컬럼) 호출되고
  // jsonb doc의 blocks 배열을 훑는다. 셀에서 직접 부르면 keyword 검색 타이핑
  // 한 글자마다 전부 재계산된다 — 페이지 행이 실제로 바뀔 때만 1회 계산한다.
  // admissionSection 컬럼이 없는 35개 config에서는 null이라 비용이 0이다.
  const sectionColumns = config.columns.filter((column) => column.type === 'admissionSection');
  const sectionSummaries = useMemo(() => {
    if (sectionColumns.length === 0) return null;
    return pageRows.map((row) => {
      const summaries = {};
      sectionColumns.forEach((column) => {
        summaries[column.sectionKey] = summarizeHwpSection(column.sectionKey, row);
      });
      return summaries;
    });
    // config.columns는 모듈 레벨 CONFIGS 리터럴이라 참조가 안정적이다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pageRows, config.columns]);

  return (
    <div className="bg-white p-6 shadow">
      <div className="mb-4 text-sm font-bold text-gray-500">
        전체 <span className="text-blue-600">{total.toLocaleString()}</span>건
      </div>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[1000px] border-collapse text-sm">
          <thead>
            <tr className="border-y border-gray-300">
              <th className="w-14 px-3 py-3 text-left">번호</th>
              {config.columns.map((column) => (
                <th key={column.key} className="px-3 py-3 text-left">
                  {column.label}
                </th>
              ))}
              <th className="w-24 px-3 py-3 text-center">관리</th>
            </tr>
          </thead>

          <tbody>
            {pageRows.length === 0 ? (
              <tr>
                <td colSpan={config.columns.length + 2} className="py-12 text-center text-gray-400">
                  등록된 데이터가 없습니다.
                </td>
              </tr>
            ) : (
              pageRows.map((row, index) => (
                <tr key={row.id} className="border-b border-gray-100">
                  <td className="px-3 py-3">{total - (start + index)}</td>

                  {config.columns.map((column) => (
                    <td key={column.key} className="px-3 py-3">
                      {/* 대학명 = 메타 수정 다이얼로그 진입점.
                          공개 목록에서 대학명을 누르면 그 대학 입시 홈페이지로
                          가듯, 어드민에서 누르면 그 URL을 고칠 수 있는 창이
                          열린다(사용자 지시 2026-08-10).

                          관리 열 ⚙️ 는 그대로 둔다 — 같은 모달을 여는 진입점이
                          2개가 되는 것뿐이고, ⚙️ 를 지우면 대학명 컬럼이 없는
                          다른 config에서 메타 수정 경로가 사라진다.

                          ⚠ 이 분기는 반드시 admissionSection 분기보다 **앞**에
                          있어야 한다. scripts/verify-admission-admin-entry.mjs 는
                          admissionSection 분기의 시작과 fileList 분기의 시작을
                          앵커로 그 사이를 잘라내 하네스에
                          sectionSummaries/index/column/row/onOpenSection 만
                          주입한다. 이 분기가 그 사이에 끼면 onOpenMetaEdit
                          미주입으로 스크립트가 ReferenceError 로 죽는다.
                          (앵커 문자열을 이 주석에 그대로 복제하지도 말 것 —
                          "정확히 1개" 조건이 깨져 슬라이스가 실패한다.) */}
                      {/* column.render(row): 같은 행의 다른 컬럼을 봐야 하는 셀
                          전용 훅. formatValue 시그니처가 (value, type, options)라
                          값 하나만 받아 이웃 컬럼을 볼 수 없다 — 목표관리 대학 컷의
                          avg_cut을 cut_type에 따라 "2.35등급" / "87.5백분위"로
                          렌더하는 요구가 이 훅을 강제한다(명세 §4-1-3 (c)).

                          ⚠ 이 분기는 반드시 admissionSection 분기보다 **앞**에
                          있어야 한다 — 아래 universityNameMeta 분기의 주석과 같은
                          이유다(scripts/verify-admission-admin-entry.mjs 슬라이스).

                          render를 선언하지 않은 컬럼은 아래 기존 분기를 그대로
                          탄다(저장소 전체 column.render 선언 0건).

                          ⚠ 적용 범위 계약: **표 셀뿐이다.** CSV 내보내기(csvBody)는
                          render를 보지 않고 formatValue만 쓴다 — 목록에 "2.35등급"
                          으로 보이는 값이 CSV에는 "2.35"로 나간다. render를 쓰는
                          config(goalUniversityCuts)는 excel/CSV 경로를 아예
                          선언하지 않아 지금은 실효가 없지만, 그 탭에 내보내기를
                          켜려면 csvBody에도 같은 훅을 태워야 한다. */}
                      {column.render ? (
                        column.render(row)
                      ) : column.type === 'universityNameMeta' && onOpenMetaEdit ? (
                        <button
                          type="button"
                          onClick={() => onOpenMetaEdit(row)}
                          title="대학 정보 수정 창 열기"
                          className="text-left font-bold text-[#013262] underline underline-offset-2 transition hover:text-[#0b84fd]"
                        >
                          {formatValue(row[column.key], column.type, column.options)}
                        </button>
                      ) : column.type === 'image' ? (
                        row[column.key] ? (
                          column.showFileName ? (
                            <div className="flex items-center gap-2">
                              <img
                                src={row[column.key]}
                                alt=""
                                className="h-12 w-20 rounded object-cover"
                              />
                              <span
                                className="max-w-[10rem] truncate text-xs font-bold text-gray-500"
                                title={fileNameFromUrl(row[column.key])}
                              >
                                {fileNameFromUrl(row[column.key])}
                              </span>
                            </div>
                          ) : (
                            <img
                              src={row[column.key]}
                              alt=""
                              className="h-12 w-20 rounded object-cover"
                            />
                          )
                        ) : (
                          '-'
                        )
                      ) : column.type === 'imageList' ? (
                        normalizeArray(row[column.key]).length > 0 ? (
                          <div className="flex items-center gap-2">
                            <img
                              src={normalizeArray(row[column.key])[0]}
                              alt=""
                              className="h-12 w-20 rounded object-cover"
                            />
                            <span className="text-xs font-bold text-gray-500">
                              {normalizeArray(row[column.key]).length > 1
                                ? `+${normalizeArray(row[column.key]).length - 1}`
                                : ''}
                            </span>
                          </div>
                        ) : (
                          '-'
                        )
                      ) : column.type === 'admissionSection' ? (
                        // 공개 목록 표의 [보기] 셀과 같은 자리·같은 어포던스.
                        // 셀 1클릭으로 같은 껍데기의 편집 다이얼로그가 열린다.
                        // title에 요약("표 2개 · 5열 12행")을 실어 어느 칸이
                        // 무거운지 열기 전에 알 수 있게 한다.
                        // 요약은 위 useMemo가 페이지 단위로 미리 계산한 값이다
                        // (summarizeHwpSection은 row[jsonKey]/row[sectionKey]만
                        // 읽는 순수 함수라 목록 row를 그대로 넘길 수 있고,
                        // loadRows가 select('*')이므로 추가 fetch도 0이다).
                        //
                        // ⚠ 빈 칸도 반드시 열려야 한다 (2026-08-07)
                        // ----------------------------------------
                        // 사용자 요청: "모든 다이얼로그에서 '비었을 때 추가'
                        // 기능이 있어야 해." 조사 결과 다이얼로그 **안**은 이미
                        // 완비였다 — 6섹션 × (블록0 / emptyBox 1개 / group만)
                        // 18케이스를 SSR 해보면 전부 블록 추가 셀렉트가 나온다
                        // (DocBlocksEditor의 추가 UI는 blocks.map 바깥에 있고
                        // blocks.length 조건이 없다). 진짜 구멍은 "다이얼로그를
                        // 못 연다"였다: 여기 있던 `'내용 없음' → <span>-</span>`
                        // 게이트가 dev DB 55칸(특수대학 11개교 × 5카테고리)을
                        // 통째로 죽여놨다. 그 11개교는 전형방법 1칸만 내용이
                        // 있고 나머지 5칸이 전부 비어 있어, 목록에서는 영영
                        // 내용을 채워 넣을 수 없었다.
                        // 지금은 폼(✏️)의 CategorySectionButton이 요약과 무관하게
                        // 6개를 항상 렌더해 우회로가 되고 있지만, 그 ✏️는 다음
                        // 커밋에서 사라진다 — 게이트를 먼저 연다.
                        // 모달 쪽 배선은 이미 되어 있다: AdmissionDocFieldEditor가
                        // 값이 없으면 blocks:[] 인 source:'manual' doc을 합성한다.
                        //
                        // 어포던스만 구분한다 — 빈 칸은 회색 점선 [추가],
                        // 내용 있는 칸은 기존 파랑 [수정]. 라벨을 통일하지 않는
                        // 이유는 목록을 훑을 때 "어디가 비었나"가 한눈에 보여야
                        // 하기 때문이다(기존 `-`가 주던 정보를 잃지 않는다).
                        (() => {
                          const summary = sectionSummaries?.[index]?.[column.sectionKey];
                          const empty = summary === '내용 없음';
                          return (
                            <button
                              type="button"
                              title={summary}
                              onClick={() => onOpenSection?.(row, column.sectionKey)}
                              className={
                                empty
                                  ? 'rounded border border-dashed border-gray-300 bg-white px-2.5 py-1 text-xs font-black text-gray-400 transition hover:border-[#2348ff] hover:text-[#2348ff]'
                                  : 'rounded border border-[#c7d2fe] bg-[#eef2ff] px-2.5 py-1 text-xs font-black text-[#2348ff] transition hover:border-[#2348ff] hover:bg-[#2348ff] hover:text-white'
                              }
                            >
                              {empty ? '추가' : '수정'}
                            </button>
                          );
                        })()
                      ) : column.type === 'fileList' ? (
                        formatListValue(row[column.key], column.type)
                      ) : column.type === 'truncate' ? (
                        truncateText(row[column.key])
                      ) : (
                        formatValue(row[column.key], column.type, column.options)
                      )}
                    </td>
                  ))}

                  <td className="px-3 py-3">
                    <div className="flex justify-center gap-3">
                      {/* config.hideRowEdit: 행 전체 폼(✏️/👁)으로 들어가는
                          진입점을 끈다. AdminTable 은 36개 config 가 공유하는
                          단일 컴포넌트라 이 한 줄이 전 메뉴의 수정 진입점이고,
                          settlements 의 👁 상세보기까지 같은 버튼이다 —
                          무조건 지우면 35개 메뉴가 함께 죽는다. 그래서
                          config.excel / config.noCreate / config.readOnly 와
                          같은 "공용 렌더 + config 스위치" 패턴으로 켠다. */}
                      {!config.hideRowEdit && (
                        <button
                          type="button"
                          onClick={() => onEdit(row)}
                          className="text-gray-500 hover:text-black"
                        >
                          {config.readOnly ? <Eye size={17} /> : <Edit3 size={17} />}
                        </button>
                      )}

                      {/* config.showMetaEdit: ✏️(행 전체 폼) 대신 메타 9필드만
                          고치는 경량 모달(AdmissionMetaEditModal) 진입점.
                          admissionGuidelines 1개 메뉴에만 켠다 — hideRowEdit과
                          같은 "공용 렌더 + config 스위치" 패턴. */}
                      {config.showMetaEdit && (
                        <button
                          type="button"
                          onClick={() => onOpenMetaEdit?.(row)}
                          aria-label="메타 정보 수정"
                          className="text-gray-500 hover:text-black"
                        >
                          <Settings size={17} />
                        </button>
                      )}

                      {/* 🗑 은 손대지 않는다 — 사용자 미언급이고, 지우면 행
                          삭제 경로가 완전히 사라진다(엑셀 일괄은 insert/update
                          만 한다). 기존 !config.readOnly 게이팅 그대로. */}
                      {!config.readOnly && (
                        <button
                          type="button"
                          onClick={() => onDelete(row)}
                          className="text-gray-500 hover:text-red-600"
                        >
                          <Trash2 size={17} />
                        </button>
                      )}

                      {activeKey === 'refundRequests' && (
                        <button
                          type="button"
                          onClick={() => onCompleteRefund(row)}
                          disabled={isRefundCompletionBlocked(row)}
                          title={
                            isRefundCompletionBlocked(row)
                              ? '승인완료 + 접수·처리중 상태의 신청만 환불 완료 처리할 수 있어요.'
                              : '환불완료 처리'
                          }
                          className="whitespace-nowrap text-xs font-bold text-gray-500 hover:text-blue-600 disabled:cursor-not-allowed disabled:text-gray-300"
                        >
                          환불완료
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <div className="mt-5 flex flex-col items-center gap-2">
        <div className="inline-flex border border-gray-300">
          <button type="button" onClick={() => setPage(1)} className="h-9 w-10 border-r">
            <ChevronsLeft size={15} className="mx-auto" />
          </button>
          <button
            type="button"
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            className="h-9 w-10 border-r"
          >
            <ChevronLeft size={15} className="mx-auto" />
          </button>

          {pageNumbers.map((num) => (
            <button
              key={num}
              type="button"
              onClick={() => setPage(num)}
              className={`h-9 w-10 border-r text-sm font-bold ${
                page === num ? 'bg-gray-600 text-white' : 'bg-white text-gray-600'
              }`}
            >
              {num}
            </button>
          ))}

          <button
            type="button"
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            className="h-9 w-10 border-r"
          >
            <ChevronRight size={15} className="mx-auto" />
          </button>
          <button type="button" onClick={() => setPage(totalPages)} className="h-9 w-10">
            <ChevronsRight size={15} className="mx-auto" />
          </button>
        </div>

        {/* 번호줄이 창(최대 10칸)만 보여주므로 지금 몇 번째인지 따로 알려준다.
            페이지가 1장뿐인 대부분의 메뉴에서는 노이즈라 2장 이상일 때만 렌더한다. */}
        {totalPages > 1 && (
          <p className="text-xs font-bold text-gray-500">
            {page.toLocaleString()} / {totalPages.toLocaleString()} 페이지
          </p>
        )}
      </div>
    </div>
  );
}

// 대입모집요강 공개 노출 연도 표시·변경(admissionGuidelines의 ListSummary —
// AcceptanceRateSummary와 같은 확장점, 목록 페이지 헤더에서만 렌더된다.
// 상세 편집 폼(아코디언)과 완전히 다른 렌더 트리라 폼 무게(input 14개,
// 3,744px)에 영향이 없다 — 2026-08-06 사용자의 "어드민이 너무 무겁다"
// 지적 이후 이 제약을 지키기 위해 일부러 폼 밖에 둔 것.
//
// 드롭다운을 안 쓰고 숫자 입력 + 버튼을 쓴다 — 지금 admission_year가
// 2027 하나뿐이라(dev DB 실측) 선택지 1개짜리 select는 phase0가 공개
// 쪽에서 거부한 것과 같은 문제("없는 기능을 있는 것처럼 보이게 함")를
// admin에도 만든다. 숫자 입력은 연도 개수와 무관하게 항상 동작한다.
//
// ⚠ 자유 입력의 대가 — 데이터 없는 연도를 공개로 지정하면 공개
// 페이지가 통째로 빈 화면이 된다(team-lead 지적, 2026-08-06). 저장
// 직전에 그 연도의 행 수를 이 컴포넌트가 이미 들고 있는 rows(목록
// 조회가 이미 전체 행을 가져온다 — PAGE_SIZE는 화면 표시에만 쓰이는
// 클라이언트 슬라이스, loadRows의 select('*')엔 .range()가 없다.
// config.serverPaginate를 켠 탭만 예외로 서버에서 페이지 단위로 끊어
// 받는데, admissionGuidelines는 그 탭이 아니라 전제가 그대로 유효하다)에서
// 세어 0이면 확인을 받는다. 검증을 admissionSettings.js에 넣지
// 않은 이유는 그 함수가 설정 저장만 하는 게 책임이고, 리소스 테이블
// 행 수를 아는 건 호출부(이 파일)의 책임이라고 team-lead가 판단했기
// 때문이다.
//
// admissionGuidelines.ListSummary의 실제 진입점. 연도 표시·변경(기존
// AdmissionActiveYearSummary, 안 건드림)과 엑셀 일괄 왕복 패널(신규
// AdmissionBulkXlsxPanel)을 세로로 쌓아 렌더한다 — 한 줄에 몰아넣으면
// "연도 표시+입력+버튼+다운로드+업로드"가 뒤섞여 복잡해진다는 판단
// (설계 문서 §2). onReload는 AdminForm의 loadRows를 그대로 받아
// 엑셀 적용 후 목록을 재조회하는 데 쓴다.
function AdmissionListSummary({ rows, onReload }) {
  return (
    <>
      <AdmissionActiveYearSummary rows={rows} />
      <AdmissionBulkXlsxPanel rows={rows} onReload={onReload} />
    </>
  );
}

function AdmissionActiveYearSummary({ rows }) {
  const [activeYear, setActiveYear] = useState(null);
  const [loadingActiveYear, setLoadingActiveYear] = useState(true);
  const [draftYear, setDraftYear] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    getAdmissionActiveYear(supabase).then((year) => {
      if (cancelled) return;
      setActiveYear(year);
      setDraftYear(String(year));
      setLoadingActiveYear(false);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const activeYearCount = activeYear
    ? (rows || []).filter((row) => Number(row.admission_year) === activeYear).length
    : 0;

  async function handleChangeYear() {
    const year = Number(draftYear);
    // 4자리 상식선 제한 — 999999 같은 값이 통과하면 안 된다(team-lead 지적).
    if (!Number.isInteger(year) || year < 2000 || year > 2100) {
      alert('연도는 2000~2100 사이 정수로 입력해 주세요.');
      return;
    }

    const matchCount = (rows || []).filter((row) => Number(row.admission_year) === year).length;
    if (matchCount === 0) {
      const proceed = window.confirm(
        `${year}학년도 데이터가 0개교입니다. 이대로 공개 연도를 지정하면 공개 페이지의 대학별 모집요강이 통째로 빈 화면이 됩니다.\n\n그래도 지정하시겠습니까?`
      );
      if (!proceed) return;
    }

    setSaving(true);
    const result = await setAdmissionActiveYear(supabase, year);
    if (!result.ok) {
      setSaving(false);
      alert(`공개 연도 저장 실패: ${result.error}`);
      return;
    }

    // 낙관적 표시 대신 실제 값을 재조회한다 — 이 값이 고객 노출을 좌우하므로
    // 저장이 실제로 반영됐는지(RLS 등으로 조용히 무시되지 않았는지) 확인한다.
    const confirmedYear = await getAdmissionActiveYear(supabase);
    setActiveYear(confirmedYear);
    setDraftYear(String(confirmedYear));
    setSaving(false);
    alert(`공개 연도를 ${confirmedYear}학년도로 변경했습니다.`);
  }

  return (
    <div className="mb-6 flex flex-wrap items-center justify-between gap-3 bg-white p-4 text-sm shadow">
      <div className="font-black">
        {loadingActiveYear ? (
          '공개 연도 확인 중…'
        ) : (
          <>
            현재 공개 연도: <span className="text-blue-600">{activeYear}학년도</span>
            {' · '}
            {activeYearCount}개교
          </>
        )}
      </div>
      <div className="flex items-center gap-2">
        <input
          type="number"
          value={draftYear}
          onChange={(e) => setDraftYear(e.target.value)}
          min={2000}
          max={2100}
          disabled={loadingActiveYear || saving}
          className="h-9 w-24 border border-[#9ca3af] px-2 text-sm outline-none disabled:bg-gray-100"
          aria-label="새 공개 연도"
        />
        <button
          type="button"
          onClick={handleChangeYear}
          disabled={loadingActiveYear || saving}
          className="h-9 bg-[#2348ff] px-4 text-sm font-black text-white disabled:opacity-50"
        >
          {saving ? '저장 중…' : '변경'}
        </button>
      </div>
    </div>
  );
}

// 대입모집요강 218행 전체를 26컬럼 xlsx(src/lib/admissionBulkXlsx.js,
// 사용자가 준 모집요강.xlsx와 동일 포맷)로 일괄 왕복한다. 설계 문서
// (docs/admission-bulk-xlsx-ui-design.md, 커밋 대상 아님) §3의 흐름을
// 그대로 구현했다:
//   다운로드(항상 전체, 필터 무시) → 업로드(파일 선택만으로는 반영 안
//   됨) → 미리보기(신규/수정/거부/잘림보존/raw변경재생성 건수 +
//   errors 항상 펼침 + warnings 4그룹, 건수는 항상 보이고 목록만 접힘)
//   → "영향받는 N행을 확인했습니다" 체크박스로 게이트된 적용 → 재조회.
//
// warnings.type 계약(team-lead가 phase0와 확정, 최종 b0d05c0)을 그대로
// 쓴다 — reason 문자열은 파싱하지 않고 표시 전용으로만 쓴다. 4그룹
// 분류가 이 UI에서 제일 중요한 판단이다: rawChangedRegenerated는
// 이름이 다른 "보존형"과 비슷해 보이지만 실제로는 값이 바뀐다(표
// 구조가 단순해질 수 있음) — 나머지 보존형(truncated/regressionSkipped,
// "반영 안 됨")과 같은 그룹에 넣으면 관리자가 오해하므로 별도 그룹
// ("반영됐지만 품질 주의")으로 시각적으로 분리한다.
//
// 엑셀 포맷에서 html 3종이 빠지면서(26→23컬럼) "html 파싱 실패"라는
// 상태 자체가 없어졌다 — 이제 트리거는 raw 비교뿐이다: 업로드 raw가
// DB raw와 같으면 경고 자체가 안 생기고(raw가 안 바뀐 카테고리의
// "보존" type이 열거형에서 아예 빠졌다 — emit된 적 없는 죽은 값이라
// 정리됐다), 다르면 raw에서 재생성하고 rawChangedRegenerated 경고가
// 남는다.
const BULK_XLSX_WARNING_GROUPS = [
  {
    key: 'notApplied',
    label: '반영 안 됨 — 기존 값 유지',
    tone: 'neutral',
    types: ['truncated', 'regressionSkipped']
  },
  {
    key: 'regeneratedCaution',
    label: '반영됨 — 품질 주의(표 구조가 단순해질 수 있음)',
    tone: 'warning',
    types: ['rawChangedRegenerated']
  },
  {
    key: 'emptied',
    label: '이 카테고리가 비워짐(저장 안 됨)',
    tone: 'neutral',
    types: ['importFailed']
  },
  {
    key: 'newUniversity',
    label: '신규 대학 추가(오타 확인 필요)',
    tone: 'info',
    types: ['newUniversity']
  }
];

const BULK_XLSX_TONE_CLASS = {
  neutral: 'border-gray-300 bg-gray-50 text-gray-700',
  warning: 'border-amber-400 bg-amber-50 text-amber-700',
  info: 'border-blue-300 bg-blue-50 text-blue-700'
};

// existingRows 맵 값에 담을 6개 raw 카테고리 컬럼 — CATEGORY_KEYS와
// 이름이 같다(admissionBulkXlsx.js는 이 파일에 export 안 돼 있어 여기서
// HWP_SECTION_JSON_KEYS의 키로 다시 뽑는다). html 파싱 실패 시 "raw가
// 안 바뀌었나" 비교에 쓰인다 — 빠뜨리면 항상 "다름"으로 판정돼
// 불필요한 재생성이 일어난다(team-lead가 명시적으로 강조한 지점).
const BULK_XLSX_RAW_CATEGORY_KEYS = Object.keys(HWP_SECTION_JSON_KEYS);

function pad2(n) {
  return String(n).padStart(2, '0');
}

// 표 단위 xlsx(tableBlockXlsx.js)와 같은 이유로 XLSX.writeFile 대신
// XLSX.write(버퍼만 생성) + 수동 다운로드를 쓴다 — writeFile의 Node
// ESM/CJS 환경 감지 불안정 이슈를 겪은 적이 있어(그건 노드 검증
// 스크립트 얘기지만) 프로덕션 경로도 동일 패턴으로 통일해둔다.
function triggerXlsxDownload(workbook, fileName) {
  const wbout = XLSX.write(workbook, { bookType: 'xlsx', type: 'array' });
  const blob = new Blob([wbout], { type: 'application/octet-stream' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = fileName;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(url);
}

function AdmissionBulkXlsxPanel({ rows, onReload }) {
  const [exportTruncatedCells, setExportTruncatedCells] = useState([]);
  const [parseErrors, setParseErrors] = useState([]);
  const [parseResult, setParseResult] = useState(null); // { rows, errors, warnings, summary }
  const [confirmChecked, setConfirmChecked] = useState(false);
  const [applying, setApplying] = useState(false);
  const [expandedGroups, setExpandedGroups] = useState({});
  const fileInputRef = useRef(null);

  const totalRows = (rows || []).length;

  function handleDownload() {
    const { workbook, truncatedCells } = exportAdmissionRowsToXlsx(rows || []);
    setExportTruncatedCells(truncatedCells);
    const today = new Date();
    const fileName = `모집요강_전체_${today.getFullYear()}${pad2(today.getMonth() + 1)}${pad2(today.getDate())}.xlsx`;
    if (typeof document !== 'undefined') {
      triggerXlsxDownload(workbook, fileName);
    }
  }

  function buildExistingRowsMap() {
    const map = new Map();
    (rows || []).forEach((row) => {
      const key = `${row.admission_year}::${row.university_key}`;
      const value = { id: row.id };
      Object.values(HWP_SECTION_JSON_KEYS).forEach((jsonColumn) => {
        value[jsonColumn] = row[jsonColumn];
      });
      BULK_XLSX_RAW_CATEGORY_KEYS.forEach((rawKey) => {
        value[rawKey] = row[rawKey];
      });
      map.set(key, value);
    });
    return map;
  }

  function handleFileChange(event) {
    const file = event.target.files?.[0];
    event.target.value = ''; // 같은 파일을 다시 선택해도 change가 발생하게 리셋
    if (!file) return;

    setParseErrors([]);
    setParseResult(null);
    setConfirmChecked(false);
    setExpandedGroups({});

    const reader = new FileReader();
    reader.onload = () => {
      try {
        const workbook = XLSX.read(reader.result, { type: 'array' });
        const existingRows = buildExistingRowsMap();
        const result = parseAdmissionRowsFromXlsx(workbook, existingRows);
        setParseResult(result);
      } catch (err) {
        setParseErrors([`파일을 읽는 중 오류가 발생했습니다: ${err?.message || err}`]);
      }
    };
    reader.onerror = () => {
      setParseErrors(['파일을 읽지 못했습니다.']);
    };
    reader.readAsArrayBuffer(file);
  }

  function toggleGroup(key) {
    setExpandedGroups((prev) => ({ ...prev, [key]: !prev[key] }));
  }

  function cancelPreview() {
    setParseResult(null);
    setConfirmChecked(false);
    setExpandedGroups({});
  }

  async function handleApply() {
    if (!parseResult || !confirmChecked || applying) return;
    setApplying(true);
    const { error } = await supabase
      .from('admission_university_resources')
      .upsert(parseResult.rows, { onConflict: 'admission_year,university_key' });
    if (error) {
      setApplying(false);
      alert(`엑셀 적용 실패: ${error.message}`);
      return;
    }
    const { summary } = parseResult;
    setApplying(false);
    setParseResult(null);
    setConfirmChecked(false);
    setExpandedGroups({});
    onReload?.();
    alert(
      `엑셀 적용 완료 — 신규 ${summary.willInsert}건 · 수정 ${summary.willUpdate}건 · 거부 ${summary.willSkip}건.`
    );
  }

  const affectedCount = parseResult ? parseResult.summary.willInsert + parseResult.summary.willUpdate : 0;

  return (
    <div className="mb-6 bg-white p-4 text-sm shadow">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="font-black">엑셀 일괄 관리</div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleDownload}
            className="h-9 border border-gray-500 bg-white px-4 text-sm font-bold"
          >
            {`엑셀 다운로드 (전체 ${totalRows}행)`}
          </button>
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="h-9 border border-gray-500 bg-white px-4 text-sm font-bold"
          >
            엑셀 업로드
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".xlsx"
            onChange={handleFileChange}
            className="hidden"
            aria-label="모집요강 xlsx 파일 선택"
          />
        </div>
      </div>

      {exportTruncatedCells.length > 0 && (
        <div className="mt-3 rounded border border-amber-400 bg-amber-50 px-3 py-2 text-xs font-bold text-amber-700">
          <p>
            {exportTruncatedCells.length}개 셀이 문자 수 한도(32,767자)를 넘어 잘린 채로 다운로드됐습니다.
            이 파일을 그대로 재업로드하면 해당 컬럼은 자동으로 보존됩니다(데이터 손상 아님, 스킵 처리).
          </p>
        </div>
      )}

      {parseErrors.length > 0 && (
        <div className="mt-3 rounded border border-red-300 bg-red-50 px-3 py-2 text-xs font-bold text-red-600">
          {parseErrors.map((msg, idx) => (
            <p key={idx}>{msg}</p>
          ))}
        </div>
      )}

      {parseResult && (
        <div className="mt-3 rounded border border-[#2348ff] bg-[#eef2ff] p-4 text-xs">
          {/* truncatedCellSkipCount 같은 개별 집계 필드는 여기서 안 쓰고
              warningCounts만 쓴다(team-lead 지시) — type별 건수를 lib이
              그대로 주므로 문자열 매칭·직접 재계산을 안 한다. 경고
              총건수도 warningCounts 값을 그대로 더한 것이다. 엑셀
              포맷에서 html 3종이 빠지면서(26→23컬럼) "html 파싱" 개념
              자체가 없어져 그쪽 집계 필드도 lib에서 정리됐다 — 애초에
              이 컴포넌트가 그 필드를 쓴 적이 없어 갱신할 코드는 없었다. */}
          <p className="font-black text-[#2348ff]">
            신규 {parseResult.summary.willInsert}건 · 수정 {parseResult.summary.willUpdate}건 · 거부{' '}
            {parseResult.summary.willSkip}건 · 경고{' '}
            {Object.values(parseResult.summary.warningCounts || {}).reduce((sum, n) => sum + n, 0)}건
          </p>

          {parseResult.summary.newYears.length > 0 && (
            <p className="mt-2 rounded border border-blue-300 bg-blue-50 px-2 py-1.5 font-bold text-blue-700">
              신규 연도: {parseResult.summary.newYears.join(', ')}학년도 — 이 파일에 새 연도 데이터가
              포함돼 있습니다.
            </p>
          )}

          {parseResult.errors.length > 0 && (
            <div className="mt-3 rounded border border-red-300 bg-red-50 p-2">
              <p className="font-black text-red-600">
                거부된 행 {parseResult.errors.length}건(적용 대상에서 완전히 제외됩니다)
              </p>
              <ul className="mt-1 space-y-1">
                {parseResult.errors.map((err, idx) => (
                  <li key={idx} className="text-red-700">
                    행 {err.row + 1} · {err.admissionYear ?? '-'}학년도 · {err.universityKey || '(키 없음)'} —{' '}
                    {err.reason}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {BULK_XLSX_WARNING_GROUPS.map((group) => {
            // 건수는 lib이 준 warningCounts에서 합산한다(직접 세지 말라는
            // team-lead 지시) — 상세 목록은 어차피 개별 항목이 필요해
            // warnings 배열을 그대로 필터링한다(같은 type 기준이라 두
            // 값은 항상 같다).
            const groupCount = group.types.reduce(
              (sum, t) => sum + (parseResult.summary.warningCounts?.[t] || 0),
              0
            );
            if (groupCount === 0) return null;
            const items = parseResult.warnings.filter((w) => group.types.includes(w.type));
            const isOpen = Boolean(expandedGroups[group.key]);
            return (
              <div key={group.key} className={`mt-3 rounded border p-2 ${BULK_XLSX_TONE_CLASS[group.tone]}`}>
                <button
                  type="button"
                  onClick={() => toggleGroup(group.key)}
                  className="flex w-full items-center justify-between text-left font-black"
                >
                  <span>
                    {group.label} — {groupCount}건
                  </span>
                  <span>{isOpen ? '접기' : '자세히 보기'}</span>
                </button>
                {isOpen && (
                  <ul className="mt-2 space-y-1 font-normal">
                    {items.map((w, idx) => (
                      <li key={idx}>
                        행 {w.row + 1} · {w.admissionYear ?? '-'}학년도 · {w.universityKey || '(키 없음)'}
                        {w.column ? ` · ${w.column}` : ''} — {w.reason}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            );
          })}

          <p className="mt-3 rounded border border-red-300 bg-red-50 px-2 py-1.5 font-bold text-red-600">
            되돌릴 수 없는 작업입니다 — 최대 {affectedCount}행이 일괄 반영됩니다.
          </p>

          <label className="mt-2 flex items-center gap-2 font-bold">
            <input
              type="checkbox"
              checked={confirmChecked}
              onChange={(e) => setConfirmChecked(e.target.checked)}
            />
            영향받는 {affectedCount}행을 확인했습니다
          </label>

          <div className="mt-2 flex items-center gap-2">
            <button
              type="button"
              onClick={handleApply}
              disabled={!confirmChecked || applying}
              className="h-9 bg-[#2348ff] px-4 font-black text-white disabled:opacity-50"
            >
              {applying ? '적용 중…' : '적용'}
            </button>
            <button
              type="button"
              onClick={cancelPreview}
              disabled={applying}
              className="h-9 border border-gray-400 bg-white px-4 font-bold disabled:opacity-50"
            >
              취소
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// admissionResults.ListSummary의 진입점. AdmissionListSummary(모집요강)를
// 재사용하지 않는다 — 그쪽은 AdmissionActiveYearSummary(공개 연도 지정)를
// 함께 쌓는데, 입결은 공개 연도 개념이 없다(연도 자체가 result_year 행
// 값이고 그 축이 이미 데이터로 존재한다). 두 도메인을 한 컴포넌트에
// 억지로 묶으면 나중에 한쪽만 바뀌어도 다른 쪽 회귀를 걱정해야 한다.
function AdmissionResultsListSummary({ onReload }) {
  return <AdmissionResultsBulkXlsxPanel onReload={onReload} />;
}

// 입결정보(admission_results) 43,170행 전체를 29컬럼 xlsx
// (src/lib/admissionResultsBulkXlsx.js)로 일괄 왕복한다. UX 흐름은
// AdmissionBulkXlsxPanel(모집요강)과 동일하게 맞췄다 — 다운로드 →
// 업로드 → 미리보기(신규/수정/거부/경고 건수 + 거부 행 목록 + 경고
// 그룹 접기/펼치기) → 확인 체크박스로 게이트된 적용 → 재조회.
//
// 모집요강 패널과 다른 점은 전부 43,170행 규모 + coalesce() 표현식
// 유일성 인덱스에서 온다(design brief (A)(B)):
//   (A) props로 rows를 받지 않는다 — AdminTable이 config.serverPaginate
//       탓에 현재 페이지 PAGE_SIZE행만 들고 있어(Admin.jsx:6305 부근),
//       그걸 그대로 내보내면 10행짜리 파일이 나온다. 다운로드·업로드
//       (existingIdSet 준비) 둘 다 이 컴포넌트가 자체적으로 PostgREST
//       기본 상한(1,000행)에 맞춰 .range()로 청크 반복해 전량을 읽는다.
//   (B) onConflict 기반 upsert를 쓰지 않는다 — sql/53의 유일성 인덱스가
//       coalesce() 표현식이라 PostgREST onConflict가 컬럼 목록으로 못
//       받는다. 대신 admissionResultsBulkXlsx.js가 이미 행마다 id 유무로
//       insert/update를 갈라 payload를 만들어 주므로(id 없으면 insert,
//       있으면 update — 있는데 DB에 없으면 파싱 단계에서 거부), 이
//       컴포넌트는 그 분류를 그대로 받아 insert 배치는 .insert()로,
//       update 배치는 .upsert(chunk, { onConflict: 'id' })로 나눠 보낸다.
//       id는 이 테이블의 실제 기본키(평범한 컬럼 유일성)라 onConflict:'id'
//       자체는 admission_university_resources 때와 달리 문제가 없다 —
//       여기서 피한 건 "자연키 축(연도·대학·모집단위…)으로 onConflict를
//       거는 것"이지 id 자체가 아니다.
const RESULTS_TABLE = 'admission_results';
// PostgREST 기본 응답 상한과 맞춘 읽기 청크 — 다운로드(전체 조회)와
// existingIdSet 준비(id만 조회) 둘 다 이 크기로 .range() 반복한다.
const RESULTS_READ_CHUNK = 1000;
// insert/upsert 배치 크기. 43k행 전량이 한 번에 바뀌는 시나리오(연도
// 전체 재적재 등)에서도 요청 하나가 과도하게 커지지 않게 나눈다.
const RESULTS_APPLY_CHUNK = 500;

const RESULTS_WARNING_GROUPS = [
  {
    key: 'allGradesEmpty',
    label: '등급 9종이 전부 비어 있음',
    tone: 'neutral',
    types: ['allGradesEmpty']
  },
  {
    key: 'competitionRateZero',
    label: '경쟁률 0 — §Q2 정책상 미공개는 빈 값이어야 함',
    tone: 'warning',
    types: ['competitionRateZero']
  },
  {
    key: 'gradeCutInversion',
    label: '50%컷 > 70%컷 역전(원문 확인 필요)',
    tone: 'warning',
    types: ['gradeCutInversion']
  }
];

// count는 head:true로 행 본문 없이 받는다 — 다운로드 버튼 라벨·진행률
// 분모로만 쓰이므로 매번 새로 물어 최신 값을 반영한다(캐시하면 다른
// 화면에서 추가/삭제된 행수가 안 맞을 수 있다).
async function fetchResultsCount() {
  const { count, error } = await supabase
    .from(RESULTS_TABLE)
    .select('id', { count: 'exact', head: true });
  if (error) throw new Error(error.message);
  return count ?? 0;
}

// 29컬럼 전량을 id 오름차순으로 청크 반복해 읽는다. order 없이 .range()만
// 반복하면 PostgREST가 매 요청마다 정렬을 보장하지 않아(암묵적 순서)
// 페이지 경계에서 행이 중복·누락될 수 있다 — id는 위닝 identity라 항상
// 유일하고 단조증가라 경계 문제가 없다.
async function fetchAllResultRows(onProgress) {
  const total = await fetchResultsCount();
  const all = [];
  for (let from = 0; from < total; from += RESULTS_READ_CHUNK) {
    const { data, error } = await supabase
      .from(RESULTS_TABLE)
      .select(ADMISSION_RESULTS_BULK_XLSX_COLUMNS.join(', '))
      .order('id', { ascending: true })
      .range(from, from + RESULTS_READ_CHUNK - 1);
    if (error) throw new Error(error.message);
    if (!data || data.length === 0) break;
    all.push(...data);
    onProgress?.({ done: all.length, total });
  }
  return all;
}

// id 컬럼만 전량 읽어 Set으로 돌려준다 — parseAdmissionResultRowsFromXlsx의
// existingIdSet 계약(파일의 id가 실제로 DB에 있는지 판정)에 쓴다. 29컬럼을
// 전부 읽는 fetchAllResultRows보다 훨씬 가볍다(업로드 시 매번 새로 조회해도
// 부담이 적다 — 그 사이 다른 관리자가 지운 id를 놓치지 않기 위해 캐시하지
// 않는다).
async function fetchAllResultIds(onProgress) {
  const total = await fetchResultsCount();
  const idSet = new Set();
  for (let from = 0; from < total; from += RESULTS_READ_CHUNK) {
    const { data, error } = await supabase
      .from(RESULTS_TABLE)
      .select('id')
      .order('id', { ascending: true })
      .range(from, from + RESULTS_READ_CHUNK - 1);
    if (error) throw new Error(error.message);
    if (!data || data.length === 0) break;
    data.forEach((r) => idSet.add(r.id));
    onProgress?.({ done: idSet.size, total });
  }
  return idSet;
}

function AdmissionResultsBulkXlsxPanel({ onReload }) {
  const [totalRowCount, setTotalRowCount] = useState(null);
  const [fetchProgress, setFetchProgress] = useState(null); // 다운로드 전량 읽기 진행률
  const [idSetProgress, setIdSetProgress] = useState(null); // 업로드 검증용 id 전량 읽기 진행률
  const [applyProgress, setApplyProgress] = useState(null); // 적용(insert/update) 진행률
  const [exportTruncatedCells, setExportTruncatedCells] = useState([]);
  const [parseErrors, setParseErrors] = useState([]);
  const [parseResult, setParseResult] = useState(null); // { rows, errors, warnings, summary }
  const [confirmChecked, setConfirmChecked] = useState(false);
  const [applying, setApplying] = useState(false);
  const [expandedGroups, setExpandedGroups] = useState({});
  const fileInputRef = useRef(null);

  useEffect(() => {
    let cancelled = false;
    fetchResultsCount()
      .then((count) => {
        if (!cancelled) setTotalRowCount(count);
      })
      .catch(() => {
        // 버튼 라벨용 참고 수치일 뿐이라 실패해도 화면을 막지 않는다 —
        // 라벨은 그냥 "전체 -행"으로 남는다.
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const busy = Boolean(fetchProgress || idSetProgress || applying);

  async function handleDownload() {
    if (busy) return;
    try {
      setFetchProgress({ done: 0, total: totalRowCount ?? 0 });
      const allRows = await fetchAllResultRows((p) => setFetchProgress(p));
      const { workbook, truncatedCells } = exportAdmissionResultRowsToXlsx(allRows);
      setExportTruncatedCells(truncatedCells);
      const today = new Date();
      const fileName = `입결정보_전체_${today.getFullYear()}${pad2(today.getMonth() + 1)}${pad2(today.getDate())}.xlsx`;
      if (typeof document !== 'undefined') {
        triggerXlsxDownload(workbook, fileName);
      }
    } catch (err) {
      alert(`엑셀 다운로드 실패: ${err.message}`);
    } finally {
      setFetchProgress(null);
    }
  }

  async function handleFileChange(event) {
    const file = event.target.files?.[0];
    event.target.value = ''; // 같은 파일을 다시 선택해도 change가 발생하게 리셋
    if (!file) return;

    setParseErrors([]);
    setParseResult(null);
    setConfirmChecked(false);
    setExpandedGroups({});

    try {
      const buffer = await file.arrayBuffer();
      setIdSetProgress({ done: 0, total: totalRowCount ?? 0 });
      const existingIdSet = await fetchAllResultIds((p) => setIdSetProgress(p));
      setIdSetProgress(null);

      const workbook = XLSX.read(buffer, { type: 'array' });
      const result = parseAdmissionResultRowsFromXlsx(workbook, existingIdSet);
      setParseResult(result);
    } catch (err) {
      setIdSetProgress(null);
      setParseErrors([`파일을 읽는 중 오류가 발생했습니다: ${err?.message || err}`]);
    }
  }

  function toggleGroup(key) {
    setExpandedGroups((prev) => ({ ...prev, [key]: !prev[key] }));
  }

  function cancelPreview() {
    setParseResult(null);
    setConfirmChecked(false);
    setExpandedGroups({});
  }

  async function handleApply() {
    if (!parseResult || !confirmChecked || applying) return;
    setApplying(true);

    // id 유무로 이미 갈라진 payload를 그대로 배치에 나눠 보낸다 — insert
    // 배치는 .insert()(id 없음, identity 자동 채번), update 배치는
    // .upsert(chunk, { onConflict: 'id' })(실제 기본키라 안전, 설계 브리핑
    // (B) 참고). 두 배치는 컬럼 구성이 달라(update만 id를 가짐) 같은
    // 요청에 섞지 않는다 — PostgREST가 배열 안 각 객체의 키 집합이
    // 다르면 누락된 키를 일괄 default/null로 해석해 의도와 다르게 동작할
    // 수 있다.
    const insertRows = parseResult.rows.filter((row) => !('id' in row));
    const updateRows = parseResult.rows.filter((row) => 'id' in row);
    const total = insertRows.length + updateRows.length;
    let done = 0;
    setApplyProgress({ done, total });

    try {
      for (let i = 0; i < insertRows.length; i += RESULTS_APPLY_CHUNK) {
        const chunk = insertRows.slice(i, i + RESULTS_APPLY_CHUNK);
        const { error } = await supabase.from(RESULTS_TABLE).insert(chunk);
        if (error) {
          throw new Error(`신규 등록 실패(청크 ${i + 1}~${i + chunk.length}행): ${error.message}`);
        }
        done += chunk.length;
        setApplyProgress({ done, total });
      }
      for (let i = 0; i < updateRows.length; i += RESULTS_APPLY_CHUNK) {
        const chunk = updateRows.slice(i, i + RESULTS_APPLY_CHUNK);
        const { error } = await supabase.from(RESULTS_TABLE).upsert(chunk, { onConflict: 'id' });
        if (error) {
          throw new Error(`수정 실패(청크 ${i + 1}~${i + chunk.length}행): ${error.message}`);
        }
        done += chunk.length;
        setApplyProgress({ done, total });
      }
    } catch (err) {
      setApplying(false);
      setApplyProgress(null);
      alert(`엑셀 적용 실패 — 이미 반영된 청크는 되돌려지지 않습니다(청크 단위 배치라 단일 트랜잭션이 아님). ${err.message}`);
      onReload?.();
      return;
    }

    const { summary } = parseResult;
    setApplying(false);
    setApplyProgress(null);
    setParseResult(null);
    setConfirmChecked(false);
    setExpandedGroups({});
    fetchResultsCount()
      .then((count) => setTotalRowCount(count))
      .catch(() => {});
    onReload?.();
    alert(
      `엑셀 적용 완료 — 신규 ${summary.willInsert}건 · 수정 ${summary.willUpdate}건 · 거부 ${summary.willSkip}건.`
    );
  }

  const affectedCount = parseResult ? parseResult.summary.willInsert + parseResult.summary.willUpdate : 0;

  return (
    <div className="mb-6 bg-white p-4 text-sm shadow">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="font-black">엑셀 일괄 관리</div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleDownload}
            disabled={busy}
            className="h-9 border border-gray-500 bg-white px-4 text-sm font-bold disabled:cursor-not-allowed disabled:opacity-50"
          >
            {fetchProgress
              ? `읽는 중… ${fetchProgress.done.toLocaleString()} / ${fetchProgress.total.toLocaleString()}행`
              : `엑셀 다운로드 (전체 ${totalRowCount === null ? '-' : totalRowCount.toLocaleString()}행)`}
          </button>
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={busy}
            className="h-9 border border-gray-500 bg-white px-4 text-sm font-bold disabled:cursor-not-allowed disabled:opacity-50"
          >
            {idSetProgress
              ? `업로드 검증 준비 중… ${idSetProgress.done.toLocaleString()} / ${idSetProgress.total.toLocaleString()}행`
              : '엑셀 업로드'}
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".xlsx"
            onChange={handleFileChange}
            className="hidden"
            aria-label="입결정보 xlsx 파일 선택"
          />
        </div>
      </div>

      {exportTruncatedCells.length > 0 && (
        <div className="mt-3 rounded border border-amber-400 bg-amber-50 px-3 py-2 text-xs font-bold text-amber-700">
          <p>
            {exportTruncatedCells.length}개 셀이 문자 수 한도(32,767자)를 넘어 잘린 채로 다운로드됐습니다.
            이 파일을 그대로 재업로드하면 해당 행은 자동으로 거부됩니다(데이터 손상 아님).
          </p>
        </div>
      )}

      {parseErrors.length > 0 && (
        <div className="mt-3 rounded border border-red-300 bg-red-50 px-3 py-2 text-xs font-bold text-red-600">
          {parseErrors.map((msg, idx) => (
            <p key={idx}>{msg}</p>
          ))}
        </div>
      )}

      {parseResult && (
        <div className="mt-3 rounded border border-[#2348ff] bg-[#eef2ff] p-4 text-xs">
          <p className="font-black text-[#2348ff]">
            신규 {parseResult.summary.willInsert}건 · 수정 {parseResult.summary.willUpdate}건 · 거부{' '}
            {parseResult.summary.willSkip}건 · 경고{' '}
            {Object.values(parseResult.summary.warningCounts || {}).reduce((sum, n) => sum + n, 0)}건
          </p>

          {parseResult.errors.length > 0 && (
            <div className="mt-3 rounded border border-red-300 bg-red-50 p-2">
              <p className="font-black text-red-600">
                거부된 행 {parseResult.errors.length}건(적용 대상에서 완전히 제외됩니다)
              </p>
              <ul className="mt-1 space-y-1">
                {parseResult.errors.map((err, idx) => (
                  <li key={idx} className="text-red-700">
                    행 {err.row + 1} · {err.resultYear ?? '-'}학년도 · {err.universityKey || '(대학 키 없음)'}/
                    {err.departmentKey || '(모집단위 키 없음)'} · {err.admissionTrack || '(전형명 없음)'} —{' '}
                    {err.reason}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {RESULTS_WARNING_GROUPS.map((group) => {
            const groupCount = group.types.reduce(
              (sum, t) => sum + (parseResult.summary.warningCounts?.[t] || 0),
              0
            );
            if (groupCount === 0) return null;
            const items = parseResult.warnings.filter((w) => group.types.includes(w.type));
            const isOpen = Boolean(expandedGroups[group.key]);
            return (
              <div key={group.key} className={`mt-3 rounded border p-2 ${BULK_XLSX_TONE_CLASS[group.tone]}`}>
                <button
                  type="button"
                  onClick={() => toggleGroup(group.key)}
                  className="flex w-full items-center justify-between text-left font-black"
                >
                  <span>
                    {group.label} — {groupCount}건
                  </span>
                  <span>{isOpen ? '접기' : '자세히 보기'}</span>
                </button>
                {isOpen && (
                  <ul className="mt-2 space-y-1 font-normal">
                    {items.map((w, idx) => (
                      <li key={idx}>
                        행 {w.row + 1} · {w.resultYear ?? '-'}학년도 · {w.universityKey || '(대학 키 없음)'}/
                        {w.departmentKey || '(모집단위 키 없음)'} · {w.admissionTrack || '(전형명 없음)'} — {w.reason}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            );
          })}

          <p className="mt-3 rounded border border-red-300 bg-red-50 px-2 py-1.5 font-bold text-red-600">
            되돌릴 수 없는 작업입니다 — 최대 {affectedCount.toLocaleString()}행이 일괄 반영됩니다.
          </p>

          <label className="mt-2 flex items-center gap-2 font-bold">
            <input
              type="checkbox"
              checked={confirmChecked}
              onChange={(e) => setConfirmChecked(e.target.checked)}
            />
            영향받는 {affectedCount.toLocaleString()}행을 확인했습니다
          </label>

          <div className="mt-2 flex items-center gap-2">
            <button
              type="button"
              onClick={handleApply}
              disabled={!confirmChecked || applying}
              className="h-9 bg-[#2348ff] px-4 font-black text-white disabled:opacity-50"
            >
              {applying
                ? applyProgress
                  ? `적용 중… ${applyProgress.done.toLocaleString()} / ${applyProgress.total.toLocaleString()}행`
                  : '적용 중…'
                : '적용'}
            </button>
            <button
              type="button"
              onClick={cancelPreview}
              disabled={applying}
              className="h-9 border border-gray-400 bg-white px-4 font-bold disabled:opacity-50"
            >
              취소
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// =====================================================================
// 목표관리 대학 컷(goal_university_cuts) — CONFIGS.goalUniversityCuts 의
// ListSummary 진입점과 그 3블록.
//
//   H-1 현황 요약        GoalCutsOverviewBlock
//   H-2 입결 유도 백필    GoalCutsBackfillPanel
//   H-3 엑셀 일괄 왕복    GoalCutsBulkXlsxPanel
//
// serverPaginate 탭이므로 세 블록 모두 props 의 rows 를 쓰지 않는다 —
// AdminTable 이 들고 있는 건 현재 페이지 10행뿐이라 그걸로 집계하면
// 전부 틀린 수치가 나온다(AdmissionResultsBulkXlsxPanel 과 같은 이유).
// 필요한 데이터는 각 블록이 직접 PostgREST 상한(1,000행)에 맞춰
// .range() 청크 반복으로 읽는다.
// =====================================================================

const GOAL_CUTS_TABLE = 'goal_university_cuts';
// sql/83_goal_admin_options_rls.sql 이 만든 (대학, 학과) 단위 집계 뷰.
// has_normal/has_special/has_jungsi 플래그를 준다.
const GOAL_CUTS_OPTIONS_VIEW = 'goal_university_options';
// PostgREST 기본 응답 상한과 맞춘 읽기 청크.
const GOAL_CUTS_READ_CHUNK = 1000;
// upsert/update 배치 크기. 백필 최대 산출이 13,000행대라 27회 요청이 된다.
const GOAL_CUTS_APPLY_CHUNK = 500;

const GOAL_CUTS_WARNING_GROUPS = [
  {
    key: 'jungsiLooksLikeGrade',
    label: '🔴 정시 컷에 9 이하 값 — 내신 등급 혼입 의심',
    tone: 'danger',
    types: ['jungsiLooksLikeGrade']
  },
  {
    key: 'naesinCutTooHigh',
    label: '수시 컷이 8등급 이상',
    tone: 'warning',
    types: ['naesinCutTooHigh']
  },
  { key: 'cutMissing', label: '컷 값이 비어 있음(온보딩 422)', tone: 'warning', types: ['cutMissing'] },
  {
    key: 'unknownSource',
    label: "출처를 알 수 없어 '수기 입력'으로 강등 — 이후 백필에서 갱신 안 됨",
    tone: 'warning',
    types: ['unknownSource']
  },
  { key: 'inactiveRow', label: '노출 꺼짐(온보딩 목록에서 사라짐)', tone: 'neutral', types: ['inactiveRow'] }
];

const GOAL_CUTS_TONE_CLASS = {
  danger: 'border-red-300 bg-red-50 text-red-700',
  warning: 'border-amber-400 bg-amber-50 text-amber-700',
  neutral: 'border-gray-300 bg-gray-50 text-gray-600'
};

async function goalCutsCount(applyFilters) {
  let query = supabase.from(GOAL_CUTS_TABLE).select('id', { count: 'exact', head: true });
  if (applyFilters) query = applyFilters(query);
  const { count, error } = await query;
  if (error) throw new Error(error.message);
  return count ?? 0;
}

// id 오름차순으로 청크 반복해 전량을 읽는다. order 없이 .range() 만 반복하면
// PostgREST 가 매 요청마다 정렬을 보장하지 않아 페이지 경계에서 행이 중복·
// 누락된다(admissionResults 쪽과 같은 논리).
async function fetchAllGoalCutRows(columns, onProgress) {
  const total = await goalCutsCount();
  const all = [];
  for (let from = 0; from < total; from += GOAL_CUTS_READ_CHUNK) {
    const { data, error } = await supabase
      .from(GOAL_CUTS_TABLE)
      .select(columns)
      .order('id', { ascending: true })
      .range(from, from + GOAL_CUTS_READ_CHUNK - 1);
    if (error) throw new Error(error.message);
    if (!data || data.length === 0) break;
    all.push(...data);
    onProgress?.({ done: all.length, total });
  }
  return all;
}

// 엑셀 업로드 검증용. id → 그 행의 현재 cut_type 을 통째로 읽어 Map 으로
// 돌려준다 — idNotFound 와 cutTypeChanged 를 **같은 조회 결과**로 판정한다.
// 캐시하지 않는다: 그 사이 다른 관리자가 지운 id 를 놓치지 않기 위해서다.
async function fetchGoalCutIdCutTypeMap(onProgress) {
  const rows = await fetchAllGoalCutRows('id, cut_type', onProgress);
  return new Map(rows.map((r) => [r.id, r.cut_type]));
}

// goal_university_options 뷰 전량. (대학, 학과) 단위로 이미 접혀 있어
// 조합 약 6,600건이면 한 번의 청크 반복으로 충분하다. 뷰에는 id 가 없어
// 정렬 축을 university_key + department_key 로 잡는다(이 둘이 뷰의
// group by 축이라 조합이 유일하다).
async function fetchGoalUniversityOptionRows() {
  const { count, error: countError } = await supabase
    .from(GOAL_CUTS_OPTIONS_VIEW)
    .select('university_key', { count: 'exact', head: true });
  if (countError) throw new Error(countError.message);
  const total = count ?? 0;
  const all = [];
  for (let from = 0; from < total; from += GOAL_CUTS_READ_CHUNK) {
    const { data, error } = await supabase
      .from(GOAL_CUTS_OPTIONS_VIEW)
      .select('university_key, university_name, department_key, department_name, has_normal, has_special, has_jungsi')
      .order('university_key', { ascending: true })
      .order('department_key', { ascending: true })
      .range(from, from + GOAL_CUTS_READ_CHUNK - 1);
    if (error) throw new Error(error.message);
    if (!data || data.length === 0) break;
    all.push(...data);
  }
  return all;
}

// H-2 백필 — 소스 조회 + 순수 집계는 src/lib/goal/goalCutBackfill.js 로
// 옮겼다(scripts/run-goal-cuts-backfill.mjs 와 로직을 공유한다). 이 파일은
// 위 import 로 그 함수들을 그대로 쓴다.

// 산출 payload 를 기존 행과 대조한다. 순수 함수다.
// (블록 주석 금지 — 위 computeGoalCutBackfill 머리말의 회귀 가드 설명 참고.)
//
// 반환:
//   overlapCount   기존 행과 자연키가 겹치는 산출 행 수
//   manualCount / inactiveCount / notedCount  보존 술어별 건수(중복 가능)
//   preservedKeys  보존 대상 conflictKey 집합(= 산출에서 제외할 대상)
//   orphanIds      이번 산출에 없는 기존 유도 행(source=admission_results,
//                  is_active=true)의 id. source='manual' 은 절대 대상이 아니다.
//   nameAxisKeys   🔴 goal_university_cuts_name_key(partial UNIQUE, where
//                  is_active)와 충돌해 청크 전체를 23505 로 죽일 산출 행.
//                  key 축에서는 안 걸리는데 name 축에서만 걸리는 경우다 —
//                  기존 행의 key 와 name 이 다를 때 생긴다(dev 실측으로
//                  409/23505 재현 확인). 어드민은 key := name 을 강제하므로
//                  정상 운영에서는 0이지만, 나면 청크 500행이 통째로
//                  날아가므로 미리보기에서 걸러 낸다.
function analyzeGoalCutBackfillAgainstExisting(payloads, existingRows) {
  const existingByConflictKey = new Map();
  const activeConflictKeyByNameKey = new Map();
  (existingRows || []).forEach((row) => {
    const conflictKey = goalCutConflictKey(row.cut_type, row.university_key, row.department_key);
    existingByConflictKey.set(conflictKey, row);
    if (row.is_active) {
      const nameKey = goalCutConflictKey(row.cut_type, row.university_name, row.department_name);
      if (!activeConflictKeyByNameKey.has(nameKey)) {
        activeConflictKeyByNameKey.set(nameKey, conflictKey);
      }
    }
  });

  let overlapCount = 0;
  let manualCount = 0;
  let inactiveCount = 0;
  let notedCount = 0;
  const preservedKeys = new Set();
  const nameAxisKeys = new Set();
  const producedKeys = new Set();

  payloads.forEach((p) => {
    const conflictKey = goalCutConflictKey(p.cut_type, p.university_key, p.department_key);
    producedKeys.add(conflictKey);

    const existing = existingByConflictKey.get(conflictKey);
    if (existing) {
      overlapCount += 1;
      let preserved = false;
      if (existing.source === 'manual') {
        manualCount += 1;
        preserved = true;
      }
      if (existing.is_active === false) {
        inactiveCount += 1;
        preserved = true;
      }
      if (String(existing.note ?? '').trim() !== '') {
        notedCount += 1;
        preserved = true;
      }
      if (preserved) preservedKeys.add(conflictKey);
    }

    // key := name 이므로 payload 의 nameKey 는 conflictKey 와 같은 문자열이다.
    // 기존 활성 행이 같은 name 축을 다른 key 축으로 점유하고 있으면 23505 다.
    const holder = activeConflictKeyByNameKey.get(conflictKey);
    if (holder && holder !== conflictKey) nameAxisKeys.add(conflictKey);
  });

  const orphanIds = (existingRows || [])
    .filter(
      (row) =>
        row.source === 'admission_results' &&
        row.is_active === true &&
        !producedKeys.has(goalCutConflictKey(row.cut_type, row.university_key, row.department_key))
    )
    .map((row) => row.id);

  return {
    overlapCount,
    manualCount,
    inactiveCount,
    notedCount,
    preservedKeys,
    nameAxisKeys,
    orphanIds
  };
}

// ---------------------------------------------------------------------
// H-1 현황 요약
// ---------------------------------------------------------------------

function GoalCutsOverviewBlock({ refreshToken, mutationSeq }) {
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    (async () => {
      // head:true 카운트(본문 0바이트) 6회 + 뷰 전량 1회.
      const [total, active, normal, special, jungsi, missing] = await Promise.all([
        goalCutsCount(),
        goalCutsCount((q) => q.eq('is_active', true)),
        goalCutsCount((q) => q.eq('cut_type', 'normal')),
        goalCutsCount((q) => q.eq('cut_type', 'special')),
        goalCutsCount((q) => q.eq('cut_type', 'jungsi')),
        goalCutsCount((q) => q.is('avg_cut', null))
      ]);
      const options = await fetchGoalUniversityOptionRows();
      const comboTotal = options.length;
      const comboNoJungsi = options.filter((o) => !o.has_jungsi).length;
      if (!cancelled) {
        setSummary({ total, active, normal, special, jungsi, missing, comboTotal, comboNoJungsi });
      }
    })()
      // 실패해도 화면을 막지 않는다 — 참고 지표일 뿐이다.
      .catch(() => {
        if (!cancelled) setSummary(null);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [refreshToken, mutationSeq]);

  if (loading && !summary) {
    return (
      <div className="bg-white p-4 text-sm shadow">
        <div className="font-black">현황 요약</div>
        <p className="mt-2 text-xs text-gray-500">불러오는 중…</p>
      </div>
    );
  }
  if (!summary) {
    return (
      <div className="bg-white p-4 text-sm shadow">
        <div className="font-black">현황 요약</div>
        <p className="mt-2 text-xs text-gray-500">현황을 불러오지 못했습니다(목록 사용에는 영향 없습니다).</p>
      </div>
    );
  }

  const n = (v) => v.toLocaleString();
  return (
    <div className="bg-white p-4 text-sm shadow">
      <div className="font-black">현황 요약</div>
      <p className="mt-2 text-xs font-bold text-gray-700">
        전체 {n(summary.total)}건 · 노출 {n(summary.active)}건 · 수시 일반 {n(summary.normal)}건 · 수시 특목{' '}
        {n(summary.special)}건 · 정시 {n(summary.jungsi)}건 · 컷 미확보 {n(summary.missing)}건
      </p>
      {/* 🟠(품질 지표)이지 🔴(블로커)가 아니다 — 정시 컷이 없어도 그 조합은
          온보딩 목록에 뜨고 학생은 고를 수 있다. 다만 그 학생의 정시 확률
          2종이 계속 미산출로 남고, 나중에 컷을 채워도 재계산되지 않는다
          (base_* 는 온보딩 이후 불변). */}
      <p className="mt-2 rounded border border-amber-400 bg-amber-50 px-2 py-1.5 text-xs font-bold text-amber-700">
        🟠 정시 컷 없는 (대학, 학과) 조합: {n(summary.comboNoJungsi)}건 / 전체 {n(summary.comboTotal)}조합 — 이
        조합을 고른 학생은 정시 확률 2종이 계속 미산출입니다.
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------
// H-2 입결 유도 백필
// ---------------------------------------------------------------------

function GoalCutsBackfillPanel({ onReload }) {
  const [yearMode, setYearMode] = useState('prefer2026');
  const [preserveMode, setPreserveMode] = useState('preserve'); // preserve | overwrite
  const [orphanMode, setOrphanMode] = useState('keep'); // keep | deactivate
  const [sourceProgress, setSourceProgress] = useState(null);
  const [computing, setComputing] = useState(false);
  const [preview, setPreview] = useState(null);
  const [confirmChecked, setConfirmChecked] = useState(false);
  const [applying, setApplying] = useState(false);
  const [applyProgress, setApplyProgress] = useState(null);

  const busy = Boolean(sourceProgress || computing || applying);

  // 옵션이 바뀌면 미리보기를 버린다 — 산출값(N)이 확인 게이트 문구와
  // 적용 대상 양쪽의 근거라, 옵션과 어긋난 미리보기를 남겨 두면
  // "확인한 N행"과 "실제 반영되는 N행"이 달라진다.
  function resetPreview() {
    setPreview(null);
    setConfirmChecked(false);
  }

  async function handleCompute() {
    if (busy) return;
    setComputing(true);
    setPreview(null);
    setConfirmChecked(false);
    try {
      setSourceProgress({ done: 0, total: 0 });
      const sourceRows = await fetchBackfillSourceRows(supabase, yearMode, (p) => setSourceProgress(p));
      setSourceProgress(null);
      const { payloads, stats } = computeGoalCutBackfill(sourceRows, yearMode);
      const existingRows = await fetchAllGoalCutRows(
        'id, cut_type, university_key, university_name, department_key, department_name, source, is_active, note'
      );
      const analysis = analyzeGoalCutBackfillAgainstExisting(payloads, existingRows);
      const applyPayloads = payloads.filter((p) => {
        const key = goalCutConflictKey(p.cut_type, p.university_key, p.department_key);
        if (analysis.nameAxisKeys.has(key)) return false;
        if (preserveMode === 'preserve' && analysis.preservedKeys.has(key)) return false;
        return true;
      });
      setPreview({ stats, analysis, applyPayloads, sourceRowCount: sourceRows.length });
    } catch (err) {
      setPreview(null);
      alert(`미리보기 계산 실패: ${err.message}`);
    } finally {
      setSourceProgress(null);
      setComputing(false);
    }
  }

  async function handleApply() {
    if (!preview || !confirmChecked || applying) return;
    const rowsToApply = preview.applyPayloads;
    const orphanIds = orphanMode === 'deactivate' ? preview.analysis.orphanIds : [];
    const total = rowsToApply.length + orphanIds.length;
    if (total === 0) {
      alert('반영할 행이 없습니다.');
      return;
    }
    setApplying(true);
    let done = 0;
    setApplyProgress({ done, total });

    try {
      for (let i = 0; i < rowsToApply.length; i += GOAL_CUTS_APPLY_CHUNK) {
        const chunk = rowsToApply.slice(i, i + GOAL_CUTS_APPLY_CHUNK);
        // onConflict 는 goal_university_cuts_key(평범한 3컬럼 UNIQUE btree)를
        // 가리킨다 — dev 실측으로 신규 201 / 재실행 200 · id 보존 · is_active
        // 와 note 보존까지 확인했다.
        const { error } = await supabase
          .from(GOAL_CUTS_TABLE)
          .upsert(chunk, { onConflict: 'cut_type,university_key,department_key' });
        if (error) {
          throw new Error(`컷 반영 실패(청크 ${i + 1}~${i + chunk.length}행): ${error.message}`);
        }
        done += chunk.length;
        setApplyProgress({ done, total });
      }
      for (let i = 0; i < orphanIds.length; i += GOAL_CUTS_APPLY_CHUNK) {
        const chunk = orphanIds.slice(i, i + GOAL_CUTS_APPLY_CHUNK);
        // 삭제하지 않는다 — 되돌릴 수 있어야 한다.
        const { error } = await supabase
          .from(GOAL_CUTS_TABLE)
          .update({ is_active: false })
          .in('id', chunk);
        if (error) {
          throw new Error(`고아 유도 행 노출 끄기 실패(청크 ${i + 1}~${i + chunk.length}행): ${error.message}`);
        }
        done += chunk.length;
        setApplyProgress({ done, total });
      }
    } catch (err) {
      setApplying(false);
      setApplyProgress(null);
      alert(
        `백필 적용 실패 — 이미 반영된 청크는 되돌려지지 않습니다(청크 단위 배치라 단일 트랜잭션이 아님). ${err.message}`
      );
      onReload?.();
      return;
    }

    setApplying(false);
    setApplyProgress(null);
    setPreview(null);
    setConfirmChecked(false);
    onReload?.();
    alert(
      `입결 유도 컷 ${rowsToApply.length.toLocaleString()}행을 반영했습니다.` +
        (orphanIds.length ? ` 고아 유도 행 ${orphanIds.length.toLocaleString()}건의 노출을 껐습니다.` : '')
    );
  }

  const stats = preview?.stats;
  const analysis = preview?.analysis;
  const affectedCount =
    (preview?.applyPayloads.length ?? 0) +
    (orphanMode === 'deactivate' ? (analysis?.orphanIds.length ?? 0) : 0);

  return (
    <div className="bg-white p-4 text-sm shadow">
      <div className="font-black">입결정보에서 수시 컷 일괄 생성</div>
      <p className="mt-2 text-xs leading-5 text-gray-600">
        입결정보(admission_results)의 70% 컷 등급에서 수시 컷을 유도해 이 표에 채웁니다. 정시 컷은 원본
        데이터가 없어 생성되지 않습니다 — 수기 또는 엑셀로 입력해 주세요.
      </p>

      <div className="mt-3 space-y-2 rounded border border-gray-200 bg-[#fafafa] p-3 text-xs">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
          <span className="w-32 shrink-0 font-black">기준 연도</span>
          {GOAL_BACKFILL_YEAR_MODES.map((mode) => (
            <label key={mode.value} className="flex items-center gap-1 font-bold">
              <input
                type="radio"
                name="goalCutsBackfillYear"
                checked={yearMode === mode.value}
                disabled={busy}
                onChange={() => {
                  setYearMode(mode.value);
                  resetPreview();
                }}
              />
              {mode.label}
            </label>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
          <span className="w-32 shrink-0 font-black">기존 행 처리</span>
          {[
            { value: 'preserve', label: '관리자가 손댄 행은 보존' },
            { value: 'overwrite', label: '전부 덮어쓰기' }
          ].map((mode) => (
            <label key={mode.value} className="flex items-center gap-1 font-bold">
              <input
                type="radio"
                name="goalCutsBackfillPreserve"
                checked={preserveMode === mode.value}
                disabled={busy}
                onChange={() => {
                  setPreserveMode(mode.value);
                  resetPreview();
                }}
              />
              {mode.label}
            </label>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
          <span className="w-32 shrink-0 font-black">이번 산출에 없는 기존 유도 행</span>
          {[
            { value: 'keep', label: '그대로 둔다' },
            { value: 'deactivate', label: '노출을 끈다(is_active=false)' }
          ].map((mode) => (
            <label key={mode.value} className="flex items-center gap-1 font-bold">
              <input
                type="radio"
                name="goalCutsBackfillOrphan"
                checked={orphanMode === mode.value}
                disabled={busy}
                onChange={() => {
                  setOrphanMode(mode.value);
                  resetPreview();
                }}
              />
              {mode.label}
            </label>
          ))}
        </div>
      </div>

      <div className="mt-3">
        <button
          type="button"
          onClick={handleCompute}
          disabled={busy}
          className="h-9 border border-gray-500 bg-white px-4 text-sm font-bold disabled:cursor-not-allowed disabled:opacity-50"
        >
          {sourceProgress
            ? `입결 읽는 중… ${sourceProgress.done.toLocaleString()} / ${sourceProgress.total.toLocaleString()}행`
            : computing
              ? '계산 중…'
              : '미리보기 계산'}
        </button>
      </div>

      {preview && (
        <div className="mt-3 rounded border border-[#2348ff] bg-[#eef2ff] p-4 text-xs">
          <p className="font-black text-[#2348ff]">
            생성 대상: 대학 {stats.universityCount.toLocaleString()}개 · 학과 조합{' '}
            {stats.pairCount.toLocaleString()}개 · 총 {stats.totalRows.toLocaleString()}행 (수시 일반{' '}
            {stats.normalCount.toLocaleString()} / 수시 특목 {stats.specialCount.toLocaleString()})
          </p>
          <p className="mt-1 text-gray-700">
            소스 {preview.sourceRowCount.toLocaleString()}행 · 기준 연도 내역: 2026 기준{' '}
            {stats.year2026Pairs.toLocaleString()}조합 · 2025 폴백 {stats.year2025Pairs.toLocaleString()}조합
          </p>
          <p className="mt-1 text-gray-700">
            제외: (*) 접미 {stats.excludedStarPairs.toLocaleString()}조합 · 빈 학과명{' '}
            {stats.excludedEmptyPairs.toLocaleString()}조합 · 교과·종합 없음{' '}
            {stats.excludedNoTrackPairs.toLocaleString()}조합 (현재 데이터 기준 전부 0이 정상입니다)
          </p>
          <p className="mt-1 text-gray-700">중복 병합: {stats.mergedCount.toLocaleString()}건</p>

          <p className="mt-2 font-bold text-gray-700">
            컷 값 분포 — min {stats.distribution.min ?? '-'} · p25 {stats.distribution.p25 ?? '-'} · median{' '}
            {stats.distribution.median ?? '-'} · p75 {stats.distribution.p75 ?? '-'} · max{' '}
            {stats.distribution.max ?? '-'} (전부 내신 등급 1~9 스케일이어야 합니다)
          </p>

          <div className="mt-2 rounded border border-gray-300 bg-white p-2">
            <p className="font-black">기존 행과 겹침: {analysis.overlapCount.toLocaleString()}행</p>
            <ul className="mt-1 space-y-0.5 text-gray-700">
              <li>├ 수기 입력(source=manual) {analysis.manualCount.toLocaleString()}행</li>
              <li>├ 노출이 꺼져 있음(is_active=false) {analysis.inactiveCount.toLocaleString()}행</li>
              <li>└ 운영 메모가 있음(note&lt;&gt;&apos;&apos;) {analysis.notedCount.toLocaleString()}행</li>
            </ul>
            <p className="mt-1 text-gray-700">
              {preserveMode === 'preserve'
                ? `→ 보존 대상 ${analysis.preservedKeys.size.toLocaleString()}행을 이번 반영에서 제외합니다.`
                : '→ 전부 덮어쓰기 — 보존 술어를 적용하지 않습니다.'}
            </p>
            <p className="mt-1 text-gray-700">
              이번 산출에 없는 기존 유도 행(source=admission_results):{' '}
              {analysis.orphanIds.length.toLocaleString()}행
              {orphanMode === 'deactivate' ? ' → 노출을 끕니다' : ' → 그대로 둡니다'}
            </p>
          </div>

          {analysis.nameAxisKeys.size > 0 && (
            <p className="mt-2 rounded border border-red-300 bg-red-50 px-2 py-1.5 font-bold text-red-600">
              🔴 {analysis.nameAxisKeys.size.toLocaleString()}행이 기존 활성 행과 (컷 종류, 대학명, 학과명)은
              같은데 key 컬럼이 달라 유일성 인덱스 goal_university_cuts_name_key 와 충돌합니다. 그대로 보내면
              청크 500행이 통째로 실패하므로 이번 반영에서 제외했습니다 — 해당 기존 행을 목록에서 찾아 정리해
              주세요.
            </p>
          )}

          {preserveMode === 'overwrite' && (
            <p className="mt-2 rounded border border-red-300 bg-red-50 px-2 py-1.5 font-bold text-red-600">
              노출이 꺼진 {analysis.inactiveCount.toLocaleString()}행이 다시 켜지지는 않지만, 컷 값·출처·기준
              연도는 전부 덮어써집니다.
            </p>
          )}

          {stats.samples.length > 0 && (
            <div className="mt-3 overflow-x-auto">
              <p className="font-black">상위 {stats.samples.length}행 샘플</p>
              <table className="mt-1 w-full min-w-[37.5rem] border-collapse text-left">
                <thead>
                  <tr className="border-b border-gray-300 font-black">
                    <th className="py-1 pr-2">대학</th>
                    <th className="py-1 pr-2">학과</th>
                    <th className="py-1 pr-2">종류</th>
                    <th className="py-1 pr-2">컷</th>
                    <th className="py-1 pr-2">연도</th>
                  </tr>
                </thead>
                <tbody>
                  {stats.samples.map((s) => (
                    <tr
                      key={`${s.cut_type}-${s.university_key}-${s.department_key}`}
                      className="border-b border-gray-200"
                    >
                      <td className="py-1 pr-2">{s.university_name}</td>
                      <td className="py-1 pr-2">{s.department_name}</td>
                      <td className="py-1 pr-2">{s.cut_type === 'normal' ? '수시 일반' : '수시 특목'}</td>
                      <td className="py-1 pr-2">{s.avg_cut}등급</td>
                      <td className="py-1 pr-2">{s.source_year}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <p className="mt-3 rounded border border-red-300 bg-red-50 px-2 py-1.5 font-bold text-red-600">
            ⚠ 되돌릴 수 없는 작업입니다 — {affectedCount.toLocaleString()}행이 생성·갱신됩니다.
          </p>

          <label className="mt-2 flex items-center gap-2 font-bold">
            <input
              type="checkbox"
              checked={confirmChecked}
              onChange={(e) => setConfirmChecked(e.target.checked)}
            />
            영향받는 {affectedCount.toLocaleString()}행을 확인했습니다
          </label>

          <div className="mt-2 flex items-center gap-2">
            <button
              type="button"
              onClick={handleApply}
              disabled={!confirmChecked || applying}
              className="h-9 bg-[#2348ff] px-4 font-black text-white disabled:opacity-50"
            >
              {applying
                ? applyProgress
                  ? `적용 중… ${applyProgress.done.toLocaleString()} / ${applyProgress.total.toLocaleString()}행`
                  : '적용 중…'
                : '적용'}
            </button>
            <button
              type="button"
              onClick={resetPreview}
              disabled={applying}
              className="h-9 border border-gray-400 bg-white px-4 font-bold disabled:opacity-50"
            >
              취소
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------
// H-3 엑셀 일괄 왕복
// ---------------------------------------------------------------------

function GoalCutsBulkXlsxPanel({ onReload }) {
  // 다운로드 버튼은 하나뿐이다(2026-08-07 사용자 지시: "엑셀 다운로드
  // 버튼이 여러 개다, 우리가 개발한 걸로 통일해라"). 범위는 라디오로 고른다.
  const [downloadScope, setDownloadScope] = useState('all'); // all | jungsiTemplate
  const [totalRowCount, setTotalRowCount] = useState(null);
  const [fetchProgress, setFetchProgress] = useState(null);
  const [idMapProgress, setIdMapProgress] = useState(null);
  const [applyProgress, setApplyProgress] = useState(null);
  const [exportTruncatedCells, setExportTruncatedCells] = useState([]);
  const [parseErrors, setParseErrors] = useState([]);
  const [parseResult, setParseResult] = useState(null);
  const [confirmChecked, setConfirmChecked] = useState(false);
  const [applying, setApplying] = useState(false);
  const [expandedGroups, setExpandedGroups] = useState({});
  const fileInputRef = useRef(null);

  useEffect(() => {
    let cancelled = false;
    goalCutsCount()
      .then((count) => {
        if (!cancelled) setTotalRowCount(count);
      })
      .catch(() => {
        // 버튼 라벨용 참고 수치라 실패해도 화면을 막지 않는다.
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const busy = Boolean(fetchProgress || idMapProgress || applying);

  async function handleDownload() {
    if (busy) return;
    try {
      setFetchProgress({ done: 0, total: totalRowCount ?? 0 });
      let rows;
      let fileNamePrefix;
      if (downloadScope === 'jungsiTemplate') {
        // 정시 컷 없는 (대학, 학과)를 id 빈 정시 템플릿 행으로 내려준다.
        // 🔴 대학명·학과명은 수시 컷 행의 문자열을 **그대로 복사**한다 —
        // 관리자가 손으로 타이핑하면 goalRepo.fetchUniversityCut 의 완전일치
        // 조회가 깨져 그 학생의 정시 확률이 영원히 미산출로 남는다.
        const options = await fetchGoalUniversityOptionRows();
        rows = options
          .filter((o) => !o.has_jungsi)
          .map((o) => ({
            id: '',
            cut_type: 'jungsi',
            university_name: o.university_name,
            department_name: o.department_name,
            avg_cut: '',
            source: 'manual',
            source_year: '',
            is_active: true,
            note: ''
          }));
        fileNamePrefix = '목표관리_정시컷_템플릿';
      } else {
        rows = await fetchAllGoalCutRows(
          'id, cut_type, university_name, department_name, avg_cut, source, source_year, is_active, note',
          (p) => setFetchProgress(p)
        );
        fileNamePrefix = '목표관리_대학컷_전체';
      }
      const { workbook, truncatedCells } = exportGoalUniversityCutRowsToXlsx(rows);
      setExportTruncatedCells(truncatedCells);
      const today = new Date();
      const fileName = `${fileNamePrefix}_${today.getFullYear()}${pad2(today.getMonth() + 1)}${pad2(today.getDate())}.xlsx`;
      if (typeof document !== 'undefined') {
        triggerXlsxDownload(workbook, fileName);
      }
    } catch (err) {
      alert(`엑셀 다운로드 실패: ${err.message}`);
    } finally {
      setFetchProgress(null);
    }
  }

  async function handleFileChange(event) {
    const file = event.target.files?.[0];
    event.target.value = ''; // 같은 파일을 다시 선택해도 change 가 발생하게 리셋
    if (!file) return;

    setParseErrors([]);
    setParseResult(null);
    setConfirmChecked(false);
    setExpandedGroups({});

    try {
      const buffer = await file.arrayBuffer();
      setIdMapProgress({ done: 0, total: totalRowCount ?? 0 });
      // idNotFound 와 cutTypeChanged 를 같은 조회 결과로 판정한다.
      const idMap = await fetchGoalCutIdCutTypeMap((p) => setIdMapProgress(p));
      setIdMapProgress(null);

      const workbook = XLSX.read(buffer, { type: 'array' });
      setParseResult(parseGoalUniversityCutRowsFromXlsx(workbook, idMap));
    } catch (err) {
      setIdMapProgress(null);
      setParseErrors([`파일을 읽는 중 오류가 발생했습니다: ${err?.message || err}`]);
    }
  }

  function toggleGroup(key) {
    setExpandedGroups((prev) => ({ ...prev, [key]: !prev[key] }));
  }

  function cancelPreview() {
    setParseResult(null);
    setConfirmChecked(false);
    setExpandedGroups({});
  }

  async function handleApply() {
    if (!parseResult || !confirmChecked || applying) return;
    setApplying(true);

    // id 유무로 이미 갈라진 payload 를 그대로 배치에 나눠 보낸다. 두 배치는
    // 컬럼 구성이 달라(update 만 id 를 가짐) 같은 요청에 섞지 않는다 —
    // PostgREST 가 배열 안 객체들의 키 집합이 다르면 누락 키를 일괄
    // default/null 로 해석한다.
    const insertRows = parseResult.rows.filter((row) => !('id' in row));
    const updateRows = parseResult.rows.filter((row) => 'id' in row);
    const total = insertRows.length + updateRows.length;
    let done = 0;
    setApplyProgress({ done, total });

    try {
      for (let i = 0; i < insertRows.length; i += GOAL_CUTS_APPLY_CHUNK) {
        const chunk = insertRows.slice(i, i + GOAL_CUTS_APPLY_CHUNK);
        const { error } = await supabase.from(GOAL_CUTS_TABLE).insert(chunk);
        if (error) {
          throw new Error(`신규 등록 실패(청크 ${i + 1}~${i + chunk.length}행): ${error.message}`);
        }
        done += chunk.length;
        setApplyProgress({ done, total });
      }
      for (let i = 0; i < updateRows.length; i += GOAL_CUTS_APPLY_CHUNK) {
        const chunk = updateRows.slice(i, i + GOAL_CUTS_APPLY_CHUNK);
        const { error } = await supabase.from(GOAL_CUTS_TABLE).upsert(chunk, { onConflict: 'id' });
        if (error) {
          throw new Error(`수정 실패(청크 ${i + 1}~${i + chunk.length}행): ${error.message}`);
        }
        done += chunk.length;
        setApplyProgress({ done, total });
      }
    } catch (err) {
      setApplying(false);
      setApplyProgress(null);
      alert(
        `엑셀 적용 실패 — 이미 반영된 청크는 되돌려지지 않습니다(청크 단위 배치라 단일 트랜잭션이 아님). ${err.message}`
      );
      onReload?.();
      return;
    }

    const { summary } = parseResult;
    setApplying(false);
    setApplyProgress(null);
    setParseResult(null);
    setConfirmChecked(false);
    setExpandedGroups({});
    goalCutsCount()
      .then((count) => setTotalRowCount(count))
      .catch(() => {});
    onReload?.();
    alert(
      `엑셀 적용 완료 — 신규 ${summary.willInsert}건 · 수정 ${summary.willUpdate}건 · 거부 ${summary.willSkip}건.`
    );
  }

  const affectedCount = parseResult
    ? parseResult.summary.willInsert + parseResult.summary.willUpdate
    : 0;

  return (
    <div className="bg-white p-4 text-sm shadow">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="font-black">엑셀 일괄 관리</div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleDownload}
            disabled={busy}
            className="h-9 border border-gray-500 bg-white px-4 text-sm font-bold disabled:cursor-not-allowed disabled:opacity-50"
          >
            {fetchProgress
              ? `읽는 중… ${fetchProgress.done.toLocaleString()} / ${fetchProgress.total.toLocaleString()}행`
              : downloadScope === 'jungsiTemplate'
                ? '엑셀 다운로드 (정시 컷 템플릿)'
                : `엑셀 다운로드 (전체 ${totalRowCount === null ? '-' : totalRowCount.toLocaleString()}행)`}
          </button>
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={busy}
            className="h-9 border border-gray-500 bg-white px-4 text-sm font-bold disabled:cursor-not-allowed disabled:opacity-50"
          >
            {idMapProgress
              ? `업로드 검증 준비 중… ${idMapProgress.done.toLocaleString()} / ${idMapProgress.total.toLocaleString()}행`
              : '엑셀 업로드'}
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".xlsx"
            onChange={handleFileChange}
            className="hidden"
            aria-label="목표관리 대학 컷 xlsx 파일 선택"
          />
        </div>
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
        <span className="font-black">다운로드 범위</span>
        {[
          { value: 'all', label: '전체' },
          { value: 'jungsiTemplate', label: '정시 컷 없는 조합(정시 템플릿)' }
        ].map((scope) => (
          <label key={scope.value} className="flex items-center gap-1 font-bold">
            <input
              type="radio"
              name="goalCutsDownloadScope"
              checked={downloadScope === scope.value}
              disabled={busy}
              onChange={() => setDownloadScope(scope.value)}
            />
            {scope.label}
          </label>
        ))}
      </div>

      {exportTruncatedCells.length > 0 && (
        <div className="mt-3 rounded border border-amber-400 bg-amber-50 px-3 py-2 text-xs font-bold text-amber-700">
          <p>
            {exportTruncatedCells.length}개 셀이 문자 수 한도(32,767자)를 넘어 잘린 채로 다운로드됐습니다. 이
            파일을 그대로 재업로드하면 해당 행은 자동으로 거부됩니다(데이터 손상 아님).
          </p>
        </div>
      )}

      {parseErrors.length > 0 && (
        <div className="mt-3 rounded border border-red-300 bg-red-50 px-3 py-2 text-xs font-bold text-red-600">
          {parseErrors.map((message, idx) => (
            <p key={idx}>{message}</p>
          ))}
        </div>
      )}

      {parseResult && (
        <div className="mt-3 rounded border border-[#2348ff] bg-[#eef2ff] p-4 text-xs">
          <p className="font-black text-[#2348ff]">
            신규 {parseResult.summary.willInsert}건 · 수정 {parseResult.summary.willUpdate}건 · 거부{' '}
            {parseResult.summary.willSkip}건 · 경고{' '}
            {Object.values(parseResult.summary.warningCounts || {}).reduce((sum, n) => sum + n, 0)}건
          </p>

          {parseResult.errors.length > 0 && (
            <div className="mt-3 rounded border border-red-300 bg-red-50 p-2">
              <p className="font-black text-red-600">
                거부된 행 {parseResult.errors.length}건(적용 대상에서 완전히 제외됩니다)
              </p>
              <ul className="mt-1 space-y-1">
                {parseResult.errors.map((err, idx) => (
                  <li key={idx} className="text-red-700">
                    행 {err.row + 1} · {err.universityName || '(대학명 없음)'} ·{' '}
                    {err.departmentName || '(학과명 없음)'} — {err.reason}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* 건수는 lib 이 준 warningCounts 에서 합산한다 — UI 는 reason
              문자열을 파싱하지 않고 type 으로만 분기·집계한다. */}
          {GOAL_CUTS_WARNING_GROUPS.map((group) => {
            const groupCount = group.types.reduce(
              (sum, t) => sum + (parseResult.summary.warningCounts?.[t] || 0),
              0
            );
            if (groupCount === 0) return null;
            const items = parseResult.warnings.filter((w) => group.types.includes(w.type));
            const isOpen = Boolean(expandedGroups[group.key]);
            return (
              <div key={group.key} className={`mt-3 rounded border p-2 ${GOAL_CUTS_TONE_CLASS[group.tone]}`}>
                <button
                  type="button"
                  onClick={() => toggleGroup(group.key)}
                  className="flex w-full items-center justify-between text-left font-black"
                >
                  <span>
                    {group.label} — {groupCount}건
                  </span>
                  <span>{isOpen ? '접기' : '자세히 보기'}</span>
                </button>
                {isOpen && (
                  <ul className="mt-2 space-y-1 font-normal">
                    {items.map((w, idx) => (
                      <li key={idx}>
                        행 {w.row + 1} · {w.universityName || '(대학명 없음)'} ·{' '}
                        {w.departmentName || '(학과명 없음)'}
                        {w.column ? ` · ${w.column}` : ''} — {w.reason}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            );
          })}

          <p className="mt-3 rounded border border-red-300 bg-red-50 px-2 py-1.5 font-bold text-red-600">
            되돌릴 수 없는 작업입니다 — 최대 {affectedCount}행이 일괄 반영됩니다.
          </p>

          <label className="mt-2 flex items-center gap-2 font-bold">
            <input
              type="checkbox"
              checked={confirmChecked}
              onChange={(e) => setConfirmChecked(e.target.checked)}
            />
            영향받는 {affectedCount}행을 확인했습니다
          </label>

          <div className="mt-2 flex items-center gap-2">
            <button
              type="button"
              onClick={handleApply}
              disabled={!confirmChecked || applying}
              className="h-9 bg-[#2348ff] px-4 font-black text-white disabled:opacity-50"
            >
              {applying
                ? applyProgress
                  ? `적용 중… ${applyProgress.done.toLocaleString()} / ${applyProgress.total.toLocaleString()}행`
                  : '적용 중…'
                : '적용'}
            </button>
            <button
              type="button"
              onClick={cancelPreview}
              disabled={applying}
              className="h-9 border border-gray-400 bg-white px-4 font-bold disabled:opacity-50"
            >
              취소
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// CONFIGS.goalUniversityCuts.ListSummary 의 진입점. CONFIGS 리터럴이 모듈
// 초기화 시점에 이 참조를 평가하므로 **반드시 function 선언문이어야 한다**
// (const 화살표 함수로 쓰면 TDZ ReferenceError 로 어드민 전체가 죽는다).
//
// props 는 { rows, onReload, mutationSeq } 지만 rows 는 쓰지 않는다 —
// serverPaginate 탭이라 현재 페이지 10행뿐이다.
function GoalCutsListSummary({ onReload, mutationSeq }) {
  // 백필·엑셀 적용 후 H-1 현황 요약도 같이 갱신되게 하는 토큰.
  const [refreshToken, setRefreshToken] = useState(0);
  function handleReload() {
    setRefreshToken((t) => t + 1);
    onReload?.();
  }
  return (
    <div className="mb-6 space-y-4">
      {/* 갱신 신호가 둘이다 — 이 컴포넌트 안의 백필·엑셀 적용(refreshToken)과
          목록의 등록·수정·삭제(mutationSeq, Admin()이 내려 준다). 둘 중 무엇이
          바뀌어도 집계를 다시 읽어야 화면 숫자가 DB와 어긋나지 않는다. */}
      <GoalCutsOverviewBlock refreshToken={refreshToken} mutationSeq={mutationSeq} />
      <GoalCutsBackfillPanel onReload={handleReload} />
      <GoalCutsBulkXlsxPanel onReload={handleReload} />
    </div>
  );
}

function AcceptanceRateSummary({ rows }) {
  const active = (rows || []).filter((row) => row.is_active);
  if (active.length === 0) return null;

  const average = active.reduce((sum, row) => sum + Number(row.rate || 0), 0) / active.length;

  return (
    <div className="mb-6 grid grid-cols-2 bg-white text-center text-sm shadow">
      <div className="border p-4">
        <div className="font-black">노출 연도 수</div>
        <div className="mt-2 font-bold">{active.length}개년</div>
      </div>
      <div className="border p-4">
        <div className="font-black">홈페이지 표시값</div>
        <div className="mt-2 font-bold text-blue-600">
          {active.length}개년 평균 {average.toFixed(1)}%
        </div>
      </div>
    </div>
  );
}

function MoneySummary({ activeKey, rows }) {
  if (!['payments', 'settlements', 'dailySettlements', 'refunds'].includes(activeKey)) return null;

  const sale = rows.reduce(
    (sum, row) => sum + Number(row.sale_amount || row.total_sale_amount || 0),
    0
  );
  const discount = rows.reduce(
    (sum, row) => sum + Number(row.discount_amount || row.total_discount_amount || 0),
    0
  );
  const paid = rows.reduce(
    (sum, row) => sum + Number(row.paid_amount || row.total_paid_amount || 0),
    0
  );
  const refund = rows.reduce(
    (sum, row) => sum + Number(row.refund_amount || row.total_refund_amount || 0),
    0
  );

  return (
    <div className="mb-6 grid grid-cols-4 bg-white text-center text-sm shadow">
      <div className="border p-4">
        <div className="font-black">판매금액 합계</div>
        <div className="mt-2 font-bold">{sale.toLocaleString()}원</div>
      </div>
      <div className="border p-4">
        <div className="font-black">감면액 합계</div>
        <div className="mt-2 font-bold">{discount.toLocaleString()}원</div>
      </div>
      <div className="border p-4">
        <div className="font-black">실 납부금액 합계</div>
        <div className="mt-2 font-bold text-blue-600">{paid.toLocaleString()}원</div>
      </div>
      <div className="border p-4">
        <div className="font-black">환불금액 합계</div>
        <div className="mt-2 font-bold text-red-500">{refund.toLocaleString()}원</div>
      </div>
    </div>
  );
}

// Admin()이 AdminForm에 onUpload로 넘기던 함수. 컴포넌트 상태를 전혀 참조하지 않는 순수 함수라
// PremiumBookAdmin(제네릭 개별 페이지 편집)도 그대로 재사용할 수 있도록 모듈 스코프로 뺐다.
async function uploadImage(files, field = {}) {
  const fileList = Array.isArray(files) ? files : [files].filter(Boolean);
  if (fileList.length === 0) return [];

  const uploaded = [];

  for (const rawFile of fileList) {
    const willCompress = isCompressibleField(field);

    if (field.imageSpec) {
      const proceed = await validateImageSpec(rawFile, field.imageSpec, {
        skipMaxMB: willCompress
      });
      if (!proceed) continue;
    }

    const file = await maybeCompressImage(rawFile, field);

    if (willCompress && field.imageSpec?.maxMB && !validateMaxMB(file, field.imageSpec.maxMB)) {
      continue;
    }

    const ext = file.name.split('.').pop()?.toLowerCase() || 'file';

    const safeName =
      file.name
        .replace(/\.[^/.]+$/, '')
        .normalize('NFKD')
        .replace(/[^a-zA-Z0-9_-]/g, '_')
        .replace(/_+/g, '_')
        .replace(/^_+|_+$/g, '')
        .slice(0, 50) || 'upload';

    const folder =
      field.folder ||
      (field.type === 'file' || field.type === 'multiFile' ? 'notice-files' : 'admin');

    const path = `${folder}/${Date.now()}-${Math.random()
      .toString(36)
      .slice(2)}-${safeName}.${ext}`;

    const { error } = await supabase.storage.from(IMAGE_BUCKET).upload(path, file, {
      cacheControl: field.cacheControl || '3600',
      upsert: false
    });

    if (error) {
      reportAdminError('업로드 실패', error);
      continue;
    }

    const { data } = supabase.storage.from(IMAGE_BUCKET).getPublicUrl(path);

    uploaded.push({
      name: file.name,
      url: data.publicUrl,
      size: file.size,
      type: file.type
    });
  }

  return uploaded;
}

export default function Admin() {
  const [activeKey, setActiveKey] = useState('popups');
  const [mode, setMode] = useState('list');
  const [editingRow, setEditingRow] = useState(null);
  // 목록 셀 [수정]으로 진입할 때 폼이 마운트되자마자 열 섹션 키. null이면
  // 기존 ✏️ 경로(폼 화면부터). AdminForm의 initialSection/origin으로만 쓰인다.
  const [pendingSection, setPendingSection] = useState(null);
  // 다른 탭에서 넘겨 온 신규 등록 프리필. pendingSection과 같은 성격이지만
  // 결정적으로 다른 점이 하나 있다 — changeTab이 이 값을 지우지 않는다.
  // 공급자(학생 상세의 "이 조합의 컷 만들기")가 changeTab으로 탭을 옮긴 뒤
  // 폼을 여는 구조라, 여기서 리셋하면 프리필이 통째로 사라진다.
  // 대신 소비 직후(취소·저장) 와 수동 [등록] 클릭 시 비운다 — 1회성 값이다.
  // 기본값 null이라 이 state를 쓰지 않는 기존 44개 탭은 동작이 바뀌지 않는다.
  const [pendingCreateDefaults, setPendingCreateDefaults] = useState(null);
  // 목록 CRUD(등록·수정·삭제) 성공 횟수. ListSummary가 "자기 집계를 다시 읽어야
  // 하는 시점"을 아는 유일한 신호다 — loadRows()는 목록 rows만 새로 받고
  // ListSummary가 스스로 던지는 집계 쿼리(예: GoalCutsOverviewBlock의 head
  // 카운트 6종)는 건드리지 않아서, 행을 지워도 상단 요약이 옛 숫자를 그대로
  // 보여 준다. page/keyword 변경으로는 올라가지 않으므로 페이지 이동마다
  // 집계를 다시 던지는 낭비도 없다.
  const [mutationSeq, setMutationSeq] = useState(0);
  // 관리 열 ⚙️(메타 전용 모달)이 열려 있는 행. null이면 닫힘 — mode는
  // 'list'로 그대로 두고 오버레이만 뜬다(목록 셀 [수정]과 같은 1뎁스 UX).
  const [metaEditRow, setMetaEditRow] = useState(null);
  const [rows, setRows] = useState([]);
  const [keyword, setKeyword] = useState('');
  // 서버 페이지네이션 탭에서 실제로 서버로 나가는 검색어. keyword는 타이핑마다
  // 바뀌므로 그대로 쓰면 글자당 한 번씩 조회가 나간다 — 디바운스한 값만 넘긴다.
  const [searchTerm, setSearchTerm] = useState('');
  const [page, setPage] = useState(1);
  // 서버 페이지네이션 탭의 전체 건수(select count). 전량 로드 탭은 rows.length가
  // 곧 전체라 이 값을 쓰지 않는다.
  const [totalCount, setTotalCount] = useState(0);
  const [loading, setLoading] = useState(false);
  // CSV 청크 내보내기 진행 상태. null이면 진행 중 아님.
  const [exporting, setExporting] = useState(null);

  const config = CONFIGS[activeKey];

  const filteredRows = useMemo(() => {
    // 서버 페이지네이션 탭의 rows는 이미 "검색어가 적용된 현재 페이지 10행"이다.
    // 여기서 클라이언트 필터를 또 걸면 그 10행 안에서 한 번 더 걸러진다.
    if (config.serverPaginate) return rows;
    const q = keyword.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((row) => searchable(row).includes(q));
  }, [rows, keyword, config.serverPaginate]);

  // 목록 조회 쿼리(필터 + 검색 + 정렬)를 한 곳에서 만든다 — loadRows와 CSV 청크
  // 내보내기가 같은 조건을 봐야 "화면에서 본 것"과 "받은 파일"이 어긋나지 않는다.
  // 범위(.range)와 count는 호출부가 붙인다.
  function buildListQuery({ count } = {}) {
    let query = supabase.from(config.table).select('*', count ? { count } : undefined);

    if (config.fixedCategory) {
      query = query.eq('category', config.fixedCategory);
    } else if (config.fixedCategories) {
      query = query.in('category', config.fixedCategories);
    }

    if (config.fixedValues) {
      for (const [key, value] of Object.entries(config.fixedValues)) {
        query = query.eq(key, value);
      }
    }

    // 서버 검색은 서버 페이지네이션 탭에만 있다. 그 외 탭은 전량을 들고 있으므로
    // 예전처럼 filteredRows가 클라이언트에서 거른다.
    if (config.serverPaginate && searchTerm && config.searchColumns?.length) {
      // PostgREST or()는 콤마로 조건을, 괄호로 그룹을 끊는다. 검색어에 그 문자가
      // 들어오면 구문 자체가 깨지고, %·_ 는 ilike 와일드카드로 새는 값이다.
      const safe = searchTerm.replace(/[,()%_\\*]/g, ' ').trim();
      if (safe) {
        query = query.or(config.searchColumns.map((column) => `${column}.ilike.%${safe}%`).join(','));
      }
    }

    const orderColumn = config.order || 'created_at';

    if (Array.isArray(config.orderBy)) {
      // 테이블별 정렬 오버라이드 — 선언한 설정에만 적용되고 다른 탭은 아래 기본 분기를 그대로 탄다
      for (const [column, ascending] of config.orderBy) {
        query = query.order(column, { ascending });
      }
    } else if (config.fixedCategory || config.fixedCategories) {
      query = query
        .order('is_pinned', { ascending: false })
        .order('sort_order', { ascending: true })
        .order('created_at', { ascending: false });
    } else {
      query = query.order(orderColumn, { ascending: orderColumn === 'sort_order' });
    }

    return query;
  }

  async function loadRows() {
    setLoading(true);

    if (config.custom || config.comingSoon) {
      setRows([]);
      setTotalCount(0);
      setLoading(false);
      return;
    }

    // 서버 페이지네이션 탭(입결 43,170행)은 현재 페이지 PAGE_SIZE행만 받는다.
    // 예전에는 모든 탭이 select('*')로 전량을 끌어와 PostgREST 기본 1,000행
    // 상한에 걸렸고(그래서 43k행 중 1,000행만 보였다), PAGE_SIZE는 그렇게 받아온
    // 배열을 화면에서 자르는 클라이언트 슬라이스일 뿐이었다.
    const paginate = Boolean(config.serverPaginate);
    let query = buildListQuery({ count: paginate ? 'exact' : undefined });

    if (paginate) {
      const from = (page - 1) * PAGE_SIZE;
      query = query.range(from, from + PAGE_SIZE - 1);
    }

    const { data, error, count } = await query;

    setLoading(false);

    if (error) {
      reportAdminError(`${config.title} 조회 실패`, error);
      setRows([]);
      setTotalCount(0);
      return;
    }

    const hiddenPageSlugs = [
      'admission-susi',
      'admission-jungsi',
      'admission-essay',
      'winning-faq'
    ];

    const nextRows =
      activeKey === 'pageContents'
        ? (data || []).filter((row) => !hiddenPageSlugs.includes(row.slug))
        : data || [];

    setRows(nextRows);
    setTotalCount(paginate ? count ?? 0 : nextRows.length);
  }

  // 탭 전환. 목록 상태 초기화를 useEffect([activeKey])가 아니라 클릭 시점에 한
  // 번에 묶는다 — 효과로 늦게 되돌리면 서버 페이지네이션 탭에서 "activeKey 변경 →
  // (옛 page로) 조회 → page/keyword 리셋 → 재조회"로 요청이 두 번 나간다.
  function changeTab(key) {
    setActiveKey(key);
    setMode('list');
    setEditingRow(null);
    setPendingSection(null);
    setMetaEditRow(null);
    setKeyword('');
    setSearchTerm('');
    setPage(1);
    // 1회성 프리필은 탭을 옮기면 무조건 버린다. 남겨 두면 "학생 상세 →
    // 컷 만들기 → (취소하지 않고) 다른 탭으로 이동" 뒤 그 탭의 등록 폼에
    // 엉뚱한 컬럼(university_name 등)이 섞여 들어간다.
    // 프리필 경로는 깨지지 않는다 — 공급자(GoalStudentDetail.createCutFromSlot)가
    // onNavigate → onPrefillCreate 순서로 부르므로 같은 배치 안에서 null이
    // 먼저, 값이 나중에 적용된다.
    setPendingCreateDefaults(null);
  }

  // 검색어 디바운스. 확정되는 순간 1페이지로 되돌린다 — 5페이지를 보다 검색하면
  // 결과가 5페이지에 못 미쳐 빈 목록이 뜬다. 두 setState를 같은 타이머 안에서
  // 부르므로 렌더는 1회, 따라서 조회도 1회다.
  useEffect(() => {
    const timer = setTimeout(() => {
      setSearchTerm(keyword.trim());
      setPage(1);
    }, 300);
    return () => clearTimeout(timer);
  }, [keyword]);

  // 조회 트리거. 서버 페이지네이션 탭만 page/searchTerm 변화에 반응한다 —
  // 그 외 탭은 아래 두 값이 상수라 예전처럼 탭 전환 시 1회만 조회한다.
  const serverPage = config.serverPaginate ? page : 0;
  const serverTerm = config.serverPaginate ? searchTerm : '';

  useEffect(() => {
    loadRows();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeKey, serverPage, serverTerm]);

  // 삭제 등으로 총 건수가 줄어 현재 페이지가 범위를 벗어나면 마지막 페이지로 당긴다.
  useEffect(() => {
    if (!config.serverPaginate || totalCount === 0) return;
    const lastPage = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));
    if (page > lastPage) setPage(lastPage);
  }, [config.serverPaginate, totalCount, page]);

  async function logout() {
    await supabase.auth.signOut();
    window.location.replace('/');
  }

  // uploadImage는 컴포넌트 상태에 의존하지 않는 순수 함수라 모듈 스코프로 뺐다 — PremiumBookAdmin의
  // 제네릭 개별 페이지 편집(AdminForm onUpload)에서도 그대로 재사용한다. 정의는 파일 하단, Admin() 선언
  // 직전 참고.

  function createRow() {
    setEditingRow(null);
    setPendingSection(null);
    // 목록의 [등록] 버튼으로 들어온 신규 등록은 항상 백지에서 시작한다 —
    // 남아 있던 프리필이 묻어 들어가면 안 된다.
    setPendingCreateDefaults(null);
    setMode('create');
  }

  function editRow(row) {
    setEditingRow(row);
    setPendingSection(null);
    setMode('edit');
  }

  // 목록 셀 [수정] → 폼을 마운트하되 곧바로 그 섹션의 편집 다이얼로그를 연다.
  // 진입 경로는 editRow와 같고(같은 AdminForm, 같은 저장 경로), 다른 것은
  // "어느 섹션 모달을 들고 시작하느냐"와 "닫으면 목록으로 돌아가느냐"뿐이다.
  function openRowSection(row, sectionKey) {
    setEditingRow(row);
    setPendingSection(sectionKey);
    setMode('edit');
  }

  async function saveRow(form) {
    const payload = config.formToPayload ? config.formToPayload(form) : { ...form };

    if (config.fixedCategory) {
      payload.category = config.fixedCategory;
    }

    if (config.fixedCategories && !config.fixedCategories.includes(payload.category)) {
      alert('수시 또는 정시 구분을 선택해 주세요.');
      return;
    }

    if (config.fixedValues) {
      Object.assign(payload, config.fixedValues);
    }

    if (activeKey === 'banners') {
      delete payload.category;
      payload.subtitle = null;
    }

    delete payload.created_at;
    delete payload.updated_at;
    // 조회수는 공개면에서만 증가한다. payload는 수정 화면을 열 때의 row 스냅샷이라,
    // 그대로 저장하면 화면을 열어둔 사이 늘어난 조회수가 옛 값으로 덮여 롤백된다.
    delete payload.view_count;

    if (Array.isArray(payload.image_urls) && payload.image_urls.length > 0 && !payload.image_url) {
      payload.image_url = payload.image_urls[0];
    }

    if (Array.isArray(payload.attachments) && payload.attachments.length > 0) {
      const firstFile = payload.attachments[0];
      if (!payload.file_url) payload.file_url = firstFile.url;
      if (!payload.file_name) payload.file_name = firstFile.name;
    }

    if (activeKey === 'winningDbInputs') {
      try {
        payload.parsed_data = payload.raw_data ? JSON.parse(payload.raw_data) : null;
      } catch {
        payload.parsed_data = null;
      }
    }

    let savedRow = null;

    if (mode === 'create') {
      const { data, error } = await supabase
        .from(config.table)
        .insert(payload)
        .select('*')
        .single();

      if (error) {
        reportAdminError('등록 실패', error);
        return;
      }

      savedRow = data;
    } else {
      const { data, error } = await supabase
        .from(config.table)
        .update(payload)
        .eq('id', editingRow.id)
        .select('*')
        .single();

      if (error) {
        reportAdminError('수정 실패', error);
        return;
      }

      savedRow = data;
    }

    if (shouldRequestWinningEmbedding(config, savedRow)) {
      requestWinningEmbedding(savedRow);
    }

    alert(
      !shouldRequestWinningEmbedding(config, savedRow)
        ? '저장 완료'
        : '저장 완료. 임베딩은 자동 생성 중입니다.'
    );
    setMode('list');
    setEditingRow(null);
    setPendingSection(null);
    setPendingCreateDefaults(null);
    setMutationSeq((seq) => seq + 1);
    await loadRows();
  }

  async function deleteRow(row) {
    if (!window.confirm('정말 삭제하시겠습니까?')) return;

    const { error } = await supabase.from(config.table).delete().eq('id', row.id);

    if (error) {
      reportAdminError('삭제 실패', error);
      return;
    }

    setMutationSeq((seq) => seq + 1);
    await loadRows();
  }

  // refundRequests 탭 전용 — fn_complete_refund RPC 로만 '환불완료'를 찍는다
  // (제네릭 PATCH 로는 completed 로 못 가게 status select 에서 이미 뺐다, ①).
  // RPC 인자명은 Baseline §2 fn_complete_refund 시그니처 그대로.
  async function completeRefund(row) {
    if (!window.confirm('환불을 완료 처리하시겠습니까?')) return;

    const { error } = await supabase.rpc('fn_complete_refund', {
      p_refund_request_id: row.id,
      p_admin_memo: null
    });

    if (error) {
      reportAdminError('환불 완료 처리 실패', error);
      return;
    }

    alert('환불 완료 처리되었습니다.');
    await loadRows();
  }

  // AdmissionMetaEditModal 저장 경로. saveRow와 같은 변환(config.rowToForm/
  // formToPayload)·같은 table·같은 supabase update를 그대로 타되, saveRow가
  // 의존하는 editingRow/mode 상태는 건드리지 않는다(목록은 계속 'list'
  // 모드다) — 그래서 saveRow를 직접 호출하지 않고 같은 변환만 재사용한다.
  //
  // *_json/*_html을 건드리지 않는 이유: rowToForm(row)이 이미 그 컬럼들을
  // row 원본 값 그대로 채우고, metaForm(9필드)은 그 키들을 포함하지 않으므로
  // merged[jsonKey] === row[jsonKey]다. formToPayload는 그 값이 그대로면
  // 동일한 값을 다시 실어 보내거나(변경 없음), null/무효면 payload에서
  // 아예 delete한다(컬럼을 건드리지 않음) — 어느 경우에도 카테고리 콘텐츠는
  // 달라지지 않는다.
  async function saveAdmissionMeta(row, metaForm) {
    const merged = { ...(config.rowToForm ? config.rowToForm(row) : row), ...metaForm };
    const payload = config.formToPayload ? config.formToPayload(merged) : merged;
    delete payload.created_at;
    delete payload.updated_at;

    const { error } = await supabase.from(config.table).update(payload).eq('id', row.id).select('*').single();

    if (error) {
      reportAdminError('수정 실패', error);
      return false;
    }

    alert('저장 완료');
    setMetaEditRow(null);
    await loadRows();
    return true;
  }

  async function downloadExcel() {
    const filename = `${config.title}_${new Date().toISOString().slice(0, 10)}.csv`;

    // 전량 로드 탭은 화면 rows가 곧 전체다 — 기존 경로 그대로.
    if (!config.serverPaginate) {
      downloadCsv(filename, filteredRows, config.columns);
      return;
    }

    // 서버 페이지네이션 탭은 rows가 현재 페이지 10행뿐이라 그대로 쓰면 10행짜리
    // 파일이 나온다. 목록과 같은 조건(buildListQuery)으로 서버에서 EXPORT_CHUNK행씩
    // 끊어 받아, 청크마다 CSV 줄로 접어 모은다 — 43k행 행 객체를 한꺼번에 메모리에
    // 쌓지 않고, await 사이마다 진행률이 화면에 갱신된다.
    if (exporting) return;

    if (totalCount === 0) {
      alert('내보낼 데이터가 없습니다.');
      return;
    }

    const proceed = window.confirm(
      `${totalCount.toLocaleString()}건을 CSV로 내려받습니다.\n` +
        `${EXPORT_CHUNK.toLocaleString()}건씩 나눠 받으므로 건수가 많으면 수십 초가 걸리고, ` +
        `그동안 이 화면을 닫거나 다른 메뉴로 이동하면 안 됩니다.\n\n계속할까요?`
    );

    if (!proceed) return;

    setExporting({ done: 0, total: totalCount });

    const parts = [];
    let done = 0;

    for (let from = 0; from < totalCount; from += EXPORT_CHUNK) {
      const { data, error } = await buildListQuery().range(from, from + EXPORT_CHUNK - 1);

      if (error) {
        setExporting(null);
        reportAdminError('CSV 내보내기 실패', error);
        return;
      }

      // 빈 청크는 그 사이에 행이 지워졌다는 뜻 — 더 받아봐야 소용없다.
      if (!data || data.length === 0) break;

      parts.push(csvBody(data, config.columns));
      done += data.length;
      setExporting({ done, total: totalCount });
    }

    setExporting(null);
    downloadCsvText(filename, csvHeader(config.columns), parts.join('\n'));
  }

  return (
    <div className="min-h-screen bg-[#f4f4f4] text-[#111827]">
      <AdminSidebar activeKey={activeKey} setActiveKey={changeTab} />
      <AdminTopbar onLogout={logout} />

      <main className="ml-[224px] pt-[56px]">
        <div className="min-h-[calc(100vh-56px)] px-7 py-8">
          {config.custom ? (
            // custom 삼항의 일반화 지점. 선례(learningDiagnosis)는 CustomComponent를 지정하지 않으므로
            // 기존 하드코딩 동작이 그대로 보존된다 — 회귀 위험 0. 신규 섹션(premiumBookPages)은
            // config.CustomComponent로 자기 컴포넌트를 지정한다.
            config.CustomComponent ? (
              // 🔴 공용 변경 (e) — 명세 §4-1-3 의 (a)~(d) 에 없던 5번째 항목이다.
              //   왜 필요한가: 토대 단계가 pendingCreateDefaults state 를 만들었지만
              //   **공급자가 생길 통로가 없었다.** 그 유일한 공급자는 학생 상세의
              //   "이 조합의 컷 만들기"(명세 §4-3-C-4)인데, 그 화면은 CustomComponent 로
              //   렌더되고 이 줄이 props 를 하나도 넘기지 않았다. 그래서 버튼을 눌러도
              //   탭을 옮기거나 폼을 열 수단이 없다.
              //   기존 소비처 무영향 근거: CustomComponent 를 선언한 config 는 2개뿐이고
              //   (premiumBookPages / mentorApplications) 두 컴포넌트 모두 인자를 받지
              //   않는다(이 파일의 `function PremiumBookAdmin()` / `function
              //   MentorApplicationsAdmin()` 선언 — 파라미터 목록이 비어 있다).
              //   CustomComponent 미지정 경로(learningDiagnosis)는 이 분기에 오지 않는다.
              <config.CustomComponent
                onNavigate={changeTab}
                onPrefillCreate={(values) => {
                  setPendingCreateDefaults(values);
                  setMode('create');
                }}
              />
            ) : (
              <LearningDiagnosisAdmin />
            )
          ) : mode === 'list' ? (
            config.comingSoon ? (
              <div className="bg-white p-10 shadow">
                <h1 className="text-2xl font-black text-[#111827]">{config.title}</h1>
                <p className="mt-3 text-sm font-bold text-gray-500">{config.description}</p>
                <div className="mt-6 rounded border border-[#B88737]/30 bg-[#FFF8E8] px-5 py-4 text-sm font-bold text-[#7A4A12]">
                  이 메뉴는 추후 별도 Supabase 연결 후 활성화됩니다.
                </div>
              </div>
            ) : (
              <>
                {config.tabs && (
                  <div className="mb-4 flex gap-2">
                    {config.tabs.map((tab) => (
                      <button
                        key={tab.key}
                        type="button"
                        onClick={() => changeTab(tab.key)}
                        className={`h-9 border px-5 text-sm font-black transition ${
                          activeKey === tab.key
                            ? 'border-[#2348ff] bg-[#2348ff] text-white'
                            : 'border-gray-300 bg-white text-gray-600 hover:bg-gray-50'
                        }`}
                      >
                        {tab.label}
                      </button>
                    ))}
                  </div>
                )}

                <div className="mb-6 bg-white px-6 py-5 shadow">
                  <div className="flex items-center justify-between gap-4">
                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        onClick={loadRows}
                        className="inline-flex h-9 items-center gap-2 border border-gray-500 bg-white px-4 text-sm font-bold"
                      >
                        <RefreshCw size={14} />
                        초기화
                      </button>

                      {(config.excel ||
                        [
                          'members',
                          'payments',
                          'settlements',
                          'dailySettlements',
                          'refunds'
                        ].includes(activeKey)) && (
                        <button
                          type="button"
                          onClick={downloadExcel}
                          disabled={Boolean(exporting)}
                          className="inline-flex h-9 items-center gap-2 border border-gray-500 bg-white px-4 text-sm font-bold disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          <Download size={14} />
                          {exporting
                            ? `내보내는 중 ${Math.floor((exporting.done / Math.max(1, exporting.total)) * 100)}%`
                            : '엑셀 다운로드'}
                        </button>
                      )}
                    </div>

                    <div className="flex items-center">
                      <input
                        value={keyword}
                        onChange={(e) => setKeyword(e.target.value)}
                        placeholder={config.searchPlaceholder}
                        className="h-9 w-[320px] border border-gray-400 px-3 text-sm outline-none"
                      />
                      <button
                        type="button"
                        className="inline-flex h-9 items-center gap-1 border border-l-0 border-gray-500 bg-white px-4 text-sm font-bold"
                      >
                        <Search size={14} />
                        검색
                      </button>
                    </div>
                  </div>

                  <div className="mt-4 flex items-center justify-between gap-4">
                    <div className="min-w-0">
                      <h1 className="text-xl font-black">{config.title}</h1>
                      {config.homepage && (
                        <div className="mt-1 space-y-1">
                          <p className="text-sm font-bold text-red-500">
                            이 메뉴에서 저장한 내용은 실제 홈페이지에 반영됩니다.
                          </p>

                          {config.guideText && (
                            <p className="whitespace-pre-line text-sm font-black leading-6 text-red-600">
                              {config.guideText}
                            </p>
                          )}
                        </div>
                      )}
                      {config.retentionNotice && (
                        <p className="mt-1 text-xs font-bold text-gray-500">
                          {config.retentionNotice}
                        </p>
                      )}
                    </div>

                    {!config.noCreate && !config.readOnly && (
                      <button
                        type="button"
                        onClick={createRow}
                        className="inline-flex h-9 items-center gap-1 bg-[#2348ff] px-4 text-sm font-black text-white shrink-0 whitespace-nowrap"
                      >
                        <Plus size={14} />
                        등록
                      </button>
                    )}
                  </div>

                  {/* rowCapWarning은 "전량 로드가 1,000행 상한에 잘렸다"는 경고라
                      config.serverPaginate 탭에는 선언하지 않는다 — 그쪽은 .range()로
                      PAGE_SIZE행만 받고 전체 건수를 count로 따로 받으므로 상한 자체에
                      닿지 않는다. */}
                  {config.rowCapWarning && rows.length >= 1000 && (
                    <p className="mt-4 rounded border border-red-200 bg-red-50 px-4 py-3 text-sm font-black leading-6 text-red-600">
                      조회된 건수가 1,000건에 도달했습니다 — Supabase 기본 조회 상한으로 오래된 신청
                      건이 목록에서 빠졌을 수 있습니다. 전체 건수가 아닙니다.
                    </p>
                  )}

                  {exporting && (
                    <p className="mt-4 rounded border border-[#c7d2fe] bg-[#eef2ff] px-4 py-3 text-sm font-black leading-6 text-[#2348ff]">
                      CSV 내보내는 중 — {exporting.done.toLocaleString()} /{' '}
                      {exporting.total.toLocaleString()}건. 완료될 때까지 이 화면을 닫지 마세요.
                    </p>
                  )}
                </div>

                <MoneySummary activeKey={activeKey} rows={filteredRows} />
                {/* mutationSeq: 목록 CRUD 성공 시에만 올라가는 카운터. 자기 집계를
                    따로 던지는 ListSummary(현재 GoalCutsListSummary 하나)가 이 값을
                    보고 다시 읽는다. 이 prop을 받지 않는 기존 3개
                    (AcceptanceRateSummary / AdmissionListSummary /
                    AdmissionResultsListSummary)는 전부 props를 구조분해로 받으므로
                    추가 prop을 그냥 무시한다 — 회귀 없음. */}
                {config.ListSummary && (
                  <config.ListSummary rows={rows} onReload={loadRows} mutationSeq={mutationSeq} />
                )}

                {loading ? (
                  <div className="bg-white p-12 text-center text-sm font-bold text-gray-500 shadow">
                    데이터를 불러오는 중입니다.
                  </div>
                ) : (
                  <AdminTable
                    config={config}
                    rows={filteredRows}
                    page={page}
                    setPage={setPage}
                    totalCount={totalCount}
                    onEdit={editRow}
                    onDelete={deleteRow}
                    activeKey={activeKey}
                    onCompleteRefund={completeRefund}
                    onOpenSection={openRowSection}
                    onOpenMetaEdit={setMetaEditRow}
                  />
                )}

                {metaEditRow && (
                  <AdmissionMetaEditModal
                    row={metaEditRow}
                    onClose={() => setMetaEditRow(null)}
                    onSave={(form) => saveAdmissionMeta(metaEditRow, form)}
                  />
                )}
              </>
            )
          ) : (
            <AdminForm
              config={config}
              mode={mode}
              row={editingRow}
              origin={pendingSection ? 'list' : 'form'}
              initialSection={pendingSection}
              createDefaults={pendingCreateDefaults}
              onCancel={() => {
                setMode('list');
                setEditingRow(null);
                setPendingSection(null);
                setPendingCreateDefaults(null);
              }}
              onSave={saveRow}
              onUpload={uploadImage}
            />
          )}
        </div>
      </main>
    </div>
  );
}

// 프리미엄 이용(BOOK) 책자 — bespoke 패널(PDF 업로드→변환→미리보기→적용) + 개별 페이지 제네릭 CRUD를
// 한 컴포넌트 안에 함께 렌더한다. config.custom이 all-or-nothing이라(Admin() 최상단 렌더 분기) 이
// 섹션이 선택되면 Admin()의 제네릭 list/create/edit 경로 자체가 통째로 스킵되기 때문이다 — 그래서
// "개별 페이지 1장 교체" 요구(명세 §6 A ①)를 살리려면 AdminTable/AdminForm을 이 컴포넌트가 직접
// 다시 호출해야 한다. 두 컴포넌트는 Admin() 상태를 참조하지 않는 순수 프레젠테이션 함수라 재사용에
// 문제가 없다(props만 받는다).
//
// PDF→WebP 변환은 명세 §D2 확정안을 그대로 따른다:
//   - pdfjs-dist는 반드시 핸들러(handleConvert) 안에서 동적 import한다. Admin은 App.jsx:39에서
//     lazy() 청크라 정적 import하면 pdfjs worker(약 372KB gzip)가 이미 무거운 Admin 청크에 얹힌다.
//   - worker는 new URL('pdfjs-dist/build/pdf.worker.min.mjs', import.meta.url)로 배선한다
//     (spike/index.html에서 Vite 6 + pdfjs-dist v6 조합으로 실측 확인된 방식).
//   - 각 페이지를 가로 1024px 목표로 렌더하고 canvas.toBlob('image/webp', 0.8)로 인코딩한다.
//   - toBlob 포맷 가드 필수 — MDN 명세상 브라우저가 WebP 인코딩을 지원하지 않으면 조용히 PNG를
//     반환한다(에러 없음). blob.type이 'image/webp'가 아니면 그 자리에서 변환을 중단한다.
//   - 순차 렌더 + 페이지마다 canvas.width = 0; canvas.height = 0으로 해제해 16장을 동시에 들고
//     있지 않는다.
//
// [적용]은 2단계 시퀀싱이다(명세 §D2) — 원본 PDF + WebP 16장 업로드가 전량 성공한 뒤에만
// premium_book_pages를 건드린다. 업로드 도중 실패하면 DB는 아예 호출하지 않는다(부분 반영 방지).
// upsert는 sort_order UNIQUE가 없어(sql/47_premium_book.sql) id 하이드레이션이 필수다 — 변환 직전이
// 아니라 "적용" 시점에 기존 행을 조회해 sort_order→id 맵을 만들고, 그 id를 실어 PK 기준 upsert한다.
// 중복 sort_order가 있으면 어느 id에 실어야 할지 판정 불가능하므로 그 자리에서 중단한다.
function PremiumBookAdmin() {
  const config = CONFIGS.premiumBookPages;

  // ---- 개별 페이지 제네릭 목록(요구 C — 명세 §6 A ②) ----
  const [rows, setRows] = useState([]);
  const [rowsLoading, setRowsLoading] = useState(false);
  const [mode, setMode] = useState('list');
  const [editingRow, setEditingRow] = useState(null);
  const [page, setPage] = useState(1);

  // ---- PDF 업로드 → 변환 ----
  const [pdfFile, setPdfFile] = useState(null);
  const [converting, setConverting] = useState(false);
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [convertError, setConvertError] = useState('');

  // ---- 변환 결과(저장 전) — 미리보기는 BookViewer가 그대로 소비한다 ----
  const [previewPages, setPreviewPages] = useState([]); // [{ sort_order, image_url: blobUrl }]
  const [webpBlobs, setWebpBlobs] = useState([]); // Blob[] — 적용 시 이 원본을 그대로 업로드한다

  // ---- 적용(저장) ----
  const [applying, setApplying] = useState(false);
  const [applyStatus, setApplyStatus] = useState('');
  const [applyError, setApplyError] = useState('');

  const blobUrlsRef = useRef([]);
  const convertTokenRef = useRef(0);

  function revokePreviewUrls() {
    for (const url of blobUrlsRef.current) URL.revokeObjectURL(url);
    blobUrlsRef.current = [];
  }

  async function loadRows() {
    setRowsLoading(true);
    const { data, error } = await supabase
      .from('premium_book_pages')
      .select('*')
      .order('sort_order', { ascending: true });
    setRowsLoading(false);

    if (error) {
      reportAdminError(`${config.title} 조회 실패`, error);
      setRows([]);
      return;
    }

    setRows(data || []);
  }

  useEffect(() => {
    loadRows();
    // 언마운트·재변환 시 blob URL 누수 방지(명세 §D2).
    return () => revokePreviewUrls();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const duplicateSortOrders = useMemo(() => {
    const seen = new Set();
    const dupes = new Set();
    for (const row of rows) {
      const key = row.sort_order;
      if (seen.has(key)) dupes.add(key);
      seen.add(key);
    }
    return [...dupes].sort((a, b) => a - b);
  }, [rows]);

  function createRow() {
    setEditingRow(null);
    setMode('create');
  }

  function editRow(row) {
    setEditingRow(row);
    setMode('edit');
  }

  async function deleteRow(row) {
    if (!window.confirm('정말 삭제하시겠습니까?')) return;

    const { error } = await supabase.from('premium_book_pages').delete().eq('id', row.id);

    if (error) {
      reportAdminError('삭제 실패', error);
      return;
    }

    await loadRows();
  }

  async function saveRow(form) {
    const payload = {
      sort_order: Number(form.sort_order) || 1,
      image_url: form.image_url || ''
    };

    if (mode === 'create') {
      const { error } = await supabase.from('premium_book_pages').insert(payload);
      if (error) {
        reportAdminError('등록 실패', error);
        return;
      }
    } else {
      const { error } = await supabase
        .from('premium_book_pages')
        .update(payload)
        .eq('id', editingRow.id);
      if (error) {
        reportAdminError('수정 실패', error);
        return;
      }
    }

    alert('저장 완료');
    setMode('list');
    setEditingRow(null);
    await loadRows();
  }

  function handlePickPdf(e) {
    const file = e.target.files?.[0] || null;
    revokePreviewUrls();
    setPdfFile(file);
    setPreviewPages([]);
    setWebpBlobs([]);
    setConvertError('');
    setApplyStatus('');
    setApplyError('');
  }

  async function handleConvert() {
    if (!pdfFile) {
      alert('PDF 파일을 먼저 선택하세요.');
      return;
    }
    if (converting || applying) return;

    const token = ++convertTokenRef.current;
    revokePreviewUrls();
    setConvertError('');
    setApplyStatus('');
    setApplyError('');
    setPreviewPages([]);
    setWebpBlobs([]);
    setConverting(true);
    setProgress({ done: 0, total: 0 });

    try {
      // 정적 import 금지 — 핸들러 안에서만 로드해 별도 청크로 분리한다(명세 §D2).
      const pdfjs = await import('pdfjs-dist');
      pdfjs.GlobalWorkerOptions.workerSrc = new URL(
        'pdfjs-dist/build/pdf.worker.min.mjs',
        import.meta.url
      ).toString();

      const arrayBuffer = await pdfFile.arrayBuffer();
      const pdfDoc = await pdfjs.getDocument({ data: arrayBuffer }).promise;
      const pageCount = pdfDoc.numPages;

      if (convertTokenRef.current !== token) return;
      setProgress({ done: 0, total: pageCount });

      const targetWidth = 1024;
      const blobs = [];
      const urls = [];

      for (let n = 1; n <= pageCount; n++) {
        if (convertTokenRef.current !== token) {
          // 변환 도중 새 PDF가 선택됐다 — 이번 결과는 버린다.
          urls.forEach((url) => URL.revokeObjectURL(url));
          return;
        }

        const pdfPage = await pdfDoc.getPage(n);
        const baseViewport = pdfPage.getViewport({ scale: 1 });
        const scale = targetWidth / baseViewport.width;
        const viewport = pdfPage.getViewport({ scale });

        const canvas = document.createElement('canvas');
        canvas.width = Math.round(viewport.width);
        canvas.height = Math.round(viewport.height);
        const ctx = canvas.getContext('2d');

        await pdfPage.render({ canvasContext: ctx, viewport }).promise;

        const blob = await new Promise((resolve, reject) => {
          canvas.toBlob(
            (b) => (b ? resolve(b) : reject(new Error('canvas.toBlob returned null'))),
            'image/webp',
            0.8
          );
        });

        // toBlob 포맷 가드(명세 §D2) — 미지원 브라우저는 조용히 PNG를 반환한다. 가드 없이
        // 넘어가면 16장이 통째로 PNG로 저장돼도 아무도 알아채지 못한다.
        if (blob.type !== 'image/webp') {
          canvas.width = 0;
          canvas.height = 0;
          throw new Error(
            `이 브라우저는 WebP 인코딩을 지원하지 않습니다(반환된 포맷: ${blob.type || '알 수 없음'}). ` +
              `Chrome 등 WebP 인코딩을 지원하는 브라우저에서 다시 시도하세요.`
          );
        }

        blobs.push(blob);
        urls.push(URL.createObjectURL(blob));

        // 16장을 동시에 캔버스에 들고 있지 않도록 매 페이지 처리 후 즉시 해제한다.
        canvas.width = 0;
        canvas.height = 0;

        setProgress({ done: n, total: pageCount });
      }

      if (convertTokenRef.current !== token) {
        urls.forEach((url) => URL.revokeObjectURL(url));
        return;
      }

      blobUrlsRef.current = urls;
      setWebpBlobs(blobs);
      setPreviewPages(urls.map((url, i) => ({ sort_order: i + 1, image_url: url })));
    } catch (err) {
      console.error(err);
      setConvertError(err?.message || 'PDF 변환에 실패했습니다.');
    } finally {
      if (convertTokenRef.current === token) setConverting(false);
    }
  }

  async function handleApply() {
    if (!pdfFile || webpBlobs.length === 0) {
      alert('먼저 PDF를 변환하세요.');
      return;
    }
    if (applying) return;

    setApplying(true);
    setApplyError('');
    setApplyStatus('원본 PDF 업로드 중...');

    try {
      // a. 원본 PDF — 고정 경로 upsert(명세 §D3b). 다운로드 버튼은 만들지 않지만 원본은 보관한다.
      const { error: pdfError } = await supabase.storage
        .from('banners')
        .upload('premium-book/booklet.pdf', pdfFile, {
          upsert: true,
          cacheControl: '3600'
        });

      if (pdfError) {
        throw new Error(`원본 PDF 업로드 실패 — 적용 중단: ${pdfError.message}`);
      }

      // b. WebP 16장 — 전량 성공해야 다음 단계(DB)로 넘어간다(2단계 시퀀싱, 명세 §D2).
      const urls = [];
      for (let i = 0; i < webpBlobs.length; i++) {
        setApplyStatus(`페이지 이미지 업로드 중 (${i + 1}/${webpBlobs.length})...`);
        const path = `premium-book/p${String(i + 1).padStart(2, '0')}.webp`;

        const { error: uploadError } = await supabase.storage
          .from('banners')
          .upload(path, webpBlobs[i], { upsert: true, cacheControl: '3600' });

        if (uploadError) {
          throw new Error(
            `${i + 1}번째 페이지 이미지 업로드 실패 — 적용 중단(DB는 변경되지 않았습니다): ${uploadError.message}`
          );
        }

        const { data } = supabase.storage.from('banners').getPublicUrl(path);
        urls.push(data.publicUrl);
      }

      // c. id 하이드레이션 upsert(명세 §D2 확정 문단) — sort_order UNIQUE가 없어 conflict target을
      // 지정할 수 없다. 기존 행을 조회해 sort_order→id 맵을 만들고 그 id를 실어 PK 기준 upsert한다.
      setApplyStatus('데이터베이스 반영 중...');

      const { data: existing, error: existingError } = await supabase
        .from('premium_book_pages')
        .select('id, sort_order');

      if (existingError) {
        throw new Error(
          `기존 페이지 조회 실패 — 적용 중단(이미지는 업로드됐지만 DB는 변경되지 않았습니다): ${existingError.message}`
        );
      }

      const idBySort = new Map();
      for (const row of existing || []) {
        if (idBySort.has(row.sort_order)) {
          throw new Error(
            `sort_order ${row.sort_order} 중복 — 어느 행에 실어야 할지 판정할 수 없어 적용을 중단합니다. ` +
              `이미지는 업로드됐지만 DB는 변경되지 않았습니다. 아래 목록에서 중복 행을 먼저 정리하세요.`
          );
        }
        idBySort.set(row.sort_order, row.id);
      }

      const upsertRows = urls.map((url, i) => ({
        ...(idBySort.has(i + 1) ? { id: idBySort.get(i + 1) } : {}),
        sort_order: i + 1,
        image_url: url
      }));

      const { error: upsertError } = await supabase.from('premium_book_pages').upsert(upsertRows);

      if (upsertError) {
        throw new Error(
          `페이지 upsert 실패(이미지는 업로드됐습니다): ${upsertError.message}`
        );
      }

      // d. 새 책자가 더 짧으면 잉여 행 삭제.
      const stale = (existing || [])
        .filter((row) => row.sort_order > urls.length)
        .map((row) => row.id);

      if (stale.length > 0) {
        const { error: deleteError } = await supabase
          .from('premium_book_pages')
          .delete()
          .in('id', stale);

        if (deleteError) {
          throw new Error(
            `잉여 페이지 삭제 실패(페이지 upsert 자체는 성공했습니다): ${deleteError.message}`
          );
        }
      }

      setApplyStatus(`적용 완료 — ${urls.length}장 반영됨`);
      await loadRows();
    } catch (err) {
      console.error(err);
      setApplyError(err?.message || '적용 중 알 수 없는 오류가 발생했습니다.');
      setApplyStatus('');
    } finally {
      setApplying(false);
    }
  }

  return (
    <div>
      <h1 className="mb-1 text-2xl font-black text-[#111827]">{config.title}</h1>

      {config.homepage && (
        <div className="mb-4 space-y-1">
          <p className="text-sm font-bold text-red-500">
            이 메뉴에서 저장한 내용은 실제 홈페이지에 반영됩니다.
          </p>
          {config.guideText && (
            <p className="whitespace-pre-line text-sm font-black leading-6 text-red-600">
              {config.guideText}
            </p>
          )}
        </div>
      )}

      {/* bespoke 패널 — PDF 1개 업로드 → 변환 → 미리보기 → 적용 */}
      <div className="mb-6 bg-white p-6 shadow">
        <h2 className="mb-1 text-lg font-black">PDF 일괄 변환·적용</h2>
        <p className="mb-4 text-sm font-bold text-gray-500">
          운영자는 PDF 파일 하나만 올리면 됩니다. 변환·미리보기까지는 저장되지 않고, [적용]을 눌러야
          실제로 반영됩니다.
        </p>

        <div className="flex flex-wrap items-center gap-3">
          <label className="inline-flex cursor-pointer items-center gap-2 rounded border border-gray-400 bg-white px-4 py-2 text-sm font-black hover:bg-gray-50">
            <UploadCloud size={16} />
            PDF 선택
            <input type="file" accept="application/pdf" className="hidden" onChange={handlePickPdf} />
          </label>

          <span className="text-sm font-bold text-gray-600">
            {pdfFile ? pdfFile.name : '선택된 파일 없음'}
          </span>

          <button
            type="button"
            onClick={handleConvert}
            disabled={!pdfFile || converting || applying}
            className="inline-flex h-9 items-center gap-2 bg-[#2348ff] px-4 text-sm font-black text-white disabled:opacity-40"
          >
            {converting ? `변환 중 (${progress.done}/${progress.total || '?'})` : 'PDF 변환'}
          </button>

          {previewPages.length > 0 && (
            <button
              type="button"
              onClick={handleApply}
              disabled={applying || converting}
              className="inline-flex h-9 items-center gap-2 border border-red-500 bg-red-50 px-4 text-sm font-black text-red-600 disabled:opacity-40"
            >
              {applying ? '적용 중...' : `적용 (${previewPages.length}장 반영)`}
            </button>
          )}
        </div>

        {convertError && <p className="mt-3 text-sm font-bold text-red-600">{convertError}</p>}
        {applyStatus && <p className="mt-3 text-sm font-bold text-blue-600">{applyStatus}</p>}
        {applyError && <p className="mt-3 text-sm font-bold text-red-600">{applyError}</p>}

        {previewPages.length > 0 && (
          <div className="mt-6">
            <p className="mb-2 text-sm font-black text-gray-700">
              미리보기 — 아직 저장 전 상태입니다. [적용]을 눌러야 반영됩니다.
            </p>
            <BookViewer pages={previewPages} />
          </div>
        )}
      </div>

      {/* 개별 페이지 제네릭 목록 — 요구 C. AdminTable/AdminForm을 그대로 재사용한다. */}
      {mode === 'list' ? (
        <>
          {duplicateSortOrders.length > 0 && (
            <div className="mb-4 rounded border border-red-200 bg-red-50 px-4 py-3 text-sm font-bold text-red-600">
              페이지 번호(sort_order) 중복: {duplicateSortOrders.join(', ')} — 정렬·표시 순서가
              어긋날 수 있습니다. 아래 목록에서 먼저 정리하세요.
            </div>
          )}

          <div className="mb-4 flex items-center justify-between gap-4">
            <button
              type="button"
              onClick={loadRows}
              className="inline-flex h-9 items-center gap-2 border border-gray-500 bg-white px-4 text-sm font-bold"
            >
              <RefreshCw size={14} />
              초기화
            </button>

            <button
              type="button"
              onClick={createRow}
              className="inline-flex h-9 items-center gap-1 bg-[#2348ff] px-4 text-sm font-black text-white shrink-0 whitespace-nowrap"
            >
              <Plus size={14} />
              등록
            </button>
          </div>

          {rowsLoading ? (
            <div className="bg-white p-12 text-center text-sm font-bold text-gray-500 shadow">
              데이터를 불러오는 중입니다.
            </div>
          ) : (
            <AdminTable
              config={config}
              rows={rows}
              page={page}
              setPage={setPage}
              onEdit={editRow}
              onDelete={deleteRow}
            />
          )}
        </>
      ) : (
        <AdminForm
          config={config}
          mode={mode}
          row={editingRow}
          onCancel={() => {
            setMode('list');
            setEditingRow(null);
          }}
          onSave={saveRow}
          onUpload={uploadImage}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// 멘토 신청 내역(mentorApplications) — CONFIGS.mentorApplications 참고.
// 목록만 AdminTable을 재사용하고, 상세/상태변경/증빙파일 열람은 이 파일 안에서 전부
// bespoke로 그린다(제네릭 AdminForm은 필드를 전부 자유 편집 가능하게 만들어 이 화면의
// "상태만 변경 가능, 나머지는 읽기전용" 요구와 맞지 않는다).
// ---------------------------------------------------------------------------

// 섹션 구분은 sql/52_mentor_applications.sql 컬럼 주석의 1~5절 순서를 그대로 따른다.
//   array: true       → text[] 컬럼(normalizeArray로 콤마 나열)
//   boolean: true     → boolean 컬럼('동의'/'미동의')
//   type: 'datetime'  → timestamptz 컬럼(formatDateTime)
//   proof: true        → proof_file_name(사용자 입력 원본 파일명) 전용 — 아래 렌더에서 이스케이프됨
const MENTOR_APPLICATION_DETAIL_SECTIONS = [
  {
    title: '1. 지원자 정보',
    fields: [
      { key: 'name', label: '이름' },
      { key: 'birth_date', label: '생년월일' },
      { key: 'phone', label: '휴대폰' },
      { key: 'email', label: '이메일' },
      { key: 'residence_region', label: '거주지역' }
    ]
  },
  {
    title: '2. 대학 및 합격 전형',
    fields: [
      { key: 'university', label: '대학교' },
      { key: 'major', label: '학과·학부' },
      { key: 'admission_year', label: '입학년도' },
      { key: 'enrollment_status', label: '재학상태' },
      { key: 'admission_history', label: '입시이력' },
      { key: 'final_admission_track', label: '최종전형' },
      { key: 'exam_results', label: '입시 성적' }
    ]
  },
  {
    title: '3. 출신 고등학교',
    fields: [
      { key: 'highschool_region', label: '고교 지역' },
      { key: 'highschool_name', label: '고교명' },
      { key: 'highschool_type', label: '고교 유형' },
      { key: 'gpa_average', label: '내신 평균' },
      { key: 'csat_summary', label: '수능 요약' }
    ]
  },
  {
    title: '4. 멘토 역량',
    fields: [
      { key: 'consult_fields', label: '상담 가능 분야', array: true },
      { key: 'strongest_field_reason', label: '가장 자신있는 분야 이유' },
      { key: 'consult_grades', label: '상담 가능 학년', array: true },
      { key: 'weekly_capacity', label: '주당 가능 횟수' },
      { key: 'available_timeslot', label: '가능 시간대' },
      { key: 'motivation', label: '지원 동기' },
      { key: 'strengths', label: '강점' },
      { key: 'ineffective_method', label: '비효율적 지도 경험' },
      { key: 'situation_answer', label: '상황 대응' },
      { key: 'tutoring_experience', label: '과외 경험' }
    ]
  },
  {
    title: '5. 증빙 및 동의',
    fields: [
      { key: 'proof_file_name', label: '증빙 파일명', proof: true },
      { key: 'phone_verified_at', label: '휴대폰 인증 시각', type: 'datetime' },
      { key: 'request_ip', label: '제출 IP' },
      { key: 'agree_terms', label: '이용약관 동의', boolean: true },
      { key: 'agree_privacy', label: '개인정보 수집 동의', boolean: true },
      { key: 'agree_identity', label: '본인인증 동의', boolean: true },
      { key: 'agree_marketing', label: '마케팅 수신 동의', boolean: true },
      { key: 'agree_ad', label: '광고성 정보 수신 동의', boolean: true }
    ]
  }
];

function formatDateTime(value) {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleString('ko-KR');
}

function renderMentorApplicationDetailValue(app, field) {
  const value = app[field.key];

  if (field.array) {
    const list = normalizeArray(value);
    return list.length > 0 ? list.join(', ') : '-';
  }

  if (field.boolean) return value ? '동의' : '미동의';

  if (field.type === 'datetime') return formatDateTime(value);

  if (field.proof) {
    // proof_file_name은 지원자가 올린 원본 파일명 — 사용자 입력이다. React의 기본 텍스트
    // 렌더링(자동 이스케이프)만 쓴다. dangerouslySetInnerHTML은 절대 쓰지 않는다.
    return value || (app.proof_file_path ? '(파일명 없음)' : '-');
  }

  if (value === null || value === undefined || value === '') return '-';
  return String(value);
}

function MentorApplicationsAdmin() {
  const config = CONFIGS.mentorApplications;

  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [keyword, setKeyword] = useState('');
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState(null); // 상세로 연 행. null이면 목록.
  const [statusDraft, setStatusDraft] = useState('');
  const [savingStatus, setSavingStatus] = useState(false);

  async function loadRows() {
    setLoading(true);

    const { data, error } = await supabase
      .from('mentor_applications')
      .select('*')
      .order('created_at', { ascending: false });

    setLoading(false);

    if (error) {
      console.error(error);
      alert(`${config.title} 조회 실패: ${error.message}`);
      setRows([]);
      return;
    }

    setRows(data || []);
  }

  useEffect(() => {
    loadRows();
  }, []);

  const filteredRows = useMemo(() => {
    const q = keyword.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((row) => searchable(row).includes(q));
  }, [rows, keyword]);

  function openDetail(row) {
    setSelected(row);
    setStatusDraft(row.status || 'submitted');
  }

  function closeDetail() {
    setSelected(null);
    setStatusDraft('');
  }

  async function saveStatus() {
    if (!selected || savingStatus) return;

    if (statusDraft === selected.status) {
      alert('변경된 상태가 없습니다.');
      return;
    }

    setSavingStatus(true);

    const { error } = await supabase
      .from('mentor_applications')
      .update({ status: statusDraft })
      .eq('id', selected.id);

    setSavingStatus(false);

    if (error) {
      alert(`상태 변경 실패: ${error.message}`);
      return;
    }

    const nextSelected = { ...selected, status: statusDraft };
    setSelected(nextSelected);
    setRows((prev) => prev.map((row) => (row.id === selected.id ? nextSelected : row)));
    alert('상태를 변경했습니다.');
  }

  // 비공개 버킷(mentor-applications)이라 getPublicUrl은 쓸 수 없다 — Admin.jsx의 기존
  // getPublicUrl 관용구(IMAGE_BUCKET/banners 버킷 대상, 이 파일의 다른 곳)와는 다른 경로다.
  // createSignedUrl로 단기 서명 URL을 받아 새 탭으로 연다. TTL 60초 — 어드민이 클릭 즉시
  // 여는 일회성 열람이고, 증빙 파일에 개인정보(성적표 등)가 담겨 있어 길게 잡을 이유가 없다.
  async function openProofFile() {
    if (!selected?.proof_file_path) {
      alert('첨부된 증빙 파일이 없습니다.');
      return;
    }

    const { data, error } = await supabase.storage
      .from('mentor-applications')
      .createSignedUrl(selected.proof_file_path, 60);

    if (error || !data?.signedUrl) {
      alert(`증빙 파일 열람 실패: ${error?.message || '서명 URL을 가져오지 못했습니다.'}`);
      return;
    }

    window.open(data.signedUrl, '_blank', 'noopener,noreferrer');
  }

  if (selected) {
    return (
      <div>
        <div className="mb-4 flex items-center justify-between">
          <h1 className="text-2xl font-black text-[#111827]">{config.title} 상세</h1>
          <ActionButton variant="light" onClick={closeDetail}>
            목록으로
          </ActionButton>
        </div>

        <div className="mb-6 flex flex-wrap items-end gap-3 bg-white p-6 shadow">
          <Field label="상태">
            <Select value={statusDraft} onChange={setStatusDraft}>
              {MENTOR_APPLICATION_STATUS_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </Select>
          </Field>

          <ActionButton onClick={saveStatus} disabled={savingStatus}>
            {savingStatus ? '저장 중...' : '상태 저장'}
          </ActionButton>

          <ActionButton variant="light" onClick={openProofFile}>
            <ExternalLink size={14} />
            증빙 파일 열람
          </ActionButton>
        </div>

        {MENTOR_APPLICATION_DETAIL_SECTIONS.map((section) => (
          <div key={section.title} className="mb-6 bg-white shadow">
            <div className="border-b border-[#edf0f4] bg-[#fafafa] px-5 py-3 text-sm font-black">
              {section.title}
            </div>

            {section.fields.map((field) => (
              <div
                key={field.key}
                className="grid grid-cols-[220px_1fr] border-b border-[#edf0f4] last:border-b-0"
              >
                <div className="bg-[#fafafa] px-5 py-3 text-sm font-black">{field.label}</div>
                <div className="whitespace-pre-line px-5 py-3 text-sm">
                  {renderMentorApplicationDetailValue(selected, field)}
                </div>
              </div>
            ))}
          </div>
        ))}

        <div className="mb-6 bg-white shadow">
          <div className="border-b border-[#edf0f4] bg-[#fafafa] px-5 py-3 text-sm font-black">
            제출 메타
          </div>

          <div className="grid grid-cols-[220px_1fr] border-b border-[#edf0f4]">
            <div className="bg-[#fafafa] px-5 py-3 text-sm font-black">제출일</div>
            <div className="px-5 py-3 text-sm">{formatDateTime(selected.created_at)}</div>
          </div>

          <div className="grid grid-cols-[220px_1fr] border-b border-[#edf0f4]">
            <div className="bg-[#fafafa] px-5 py-3 text-sm font-black">수정일</div>
            <div className="px-5 py-3 text-sm">{formatDateTime(selected.updated_at)}</div>
          </div>

          <div className="grid grid-cols-[220px_1fr]">
            <div className="bg-[#fafafa] px-5 py-3 text-sm font-black">신청 ID</div>
            <div className="px-5 py-3 font-mono text-xs">{selected.id}</div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="mb-6 bg-white px-6 py-5 shadow">
        <div className="flex items-center justify-between gap-4">
          <button
            type="button"
            onClick={loadRows}
            className="inline-flex h-9 items-center gap-2 border border-gray-500 bg-white px-4 text-sm font-bold"
          >
            <RefreshCw size={14} />
            초기화
          </button>

          <div className="flex items-center">
            <input
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
              placeholder={config.searchPlaceholder}
              className="h-9 w-[320px] border border-gray-400 px-3 text-sm outline-none"
            />
            <button
              type="button"
              className="inline-flex h-9 items-center gap-1 border border-l-0 border-gray-500 bg-white px-4 text-sm font-bold"
            >
              <Search size={14} />
              검색
            </button>
          </div>
        </div>

        <h1 className="mt-4 text-xl font-black">{config.title}</h1>
      </div>

      {loading ? (
        <div className="bg-white p-12 text-center text-sm font-bold text-gray-500 shadow">
          데이터를 불러오는 중입니다.
        </div>
      ) : (
        <AdminTable
          config={config}
          rows={filteredRows}
          page={page}
          setPage={setPage}
          onEdit={openDetail}
          onDelete={() => {}}
        />
      )}
    </div>
  );
}

// ===========================================================================
// 목표관리 학생 현황 (docs/figma-goal/goal-admin-spec.md §4-3)
//
// custom: true + CustomComponent 라 공용 목록·폼·검색·페이지네이션이 전부
// 비활성화된다(loadRows 조기 반환 + custom 삼항). 검색·필터·페이지네이션·상세를
// 이 블록 안에서 전부 그린다.
//
// 🔴 쓰기 UI 0개(§3-D6 / §3-D7). 이 블록 안에 supabase 의 insert/update/delete/
//    upsert 호출이 단 하나도 없어야 한다. DB 쪽도 goal_students /
//    goal_daily_records / goal_probability_logs 의 어드민 정책이 for select 로
//    좁혀져 있어(sql/83_goal_admin_options_rls.sql) 시도해도 통과하지 않는다.
// 🔴 CSV/엑셀 내보내기 경로를 만들지 않는다(§3-D6). downloadCsv 계열을 호출하지 말 것.
// 🔴 계산 엔진(src/lib/goal/calc/**)은 import 만 한다 — 한 글자도 고치지 않는다.
// ===========================================================================

// 목록 필터 버튼. key 가 'all' 이 아니면 전부 **서버 술어**로 나간다 —
// 클라이언트 필터와 서버 페이지네이션을 섞으면 페이지 경계가 무너진다(§4-3-B).
// 검색 선행 조회(profiles)의 상한. goal_student_state 에는 이름·연락처가 없어
// id 집합을 먼저 얻어야 하는데, 그 조회가 잘리면 초과분 학생이 결과에서 조용히
// 사라진다. 상한에 닿으면 화면에 절단 사실을 띄운다(searchTruncated).
const PROFILE_SEARCH_LIMIT = 500;

const GOAL_STUDENT_FILTERS = [
  { key: 'all', label: '전체' },
  { key: 'awaiting_cuts', label: '컷 대기' },
  { key: 'noSubmitToday', label: '오늘 미제출' },
  { key: 'noRecord', label: '기록 없음' },
  { key: 'paused', label: '정지' }
];

// 상세 상단 안내에 쓰는 컷 4종의 표시 순서/라벨. goalRepo.js:37 CUT_KEYS 와 같은 순서다.
const GOAL_CUT_SLOTS = [
  { key: 'idealNaesin', label: '상한 내신', snapshotKey: 'ideal_naesin_cut', side: 'ideal', axis: 'naesin' },
  { key: 'idealJungsi', label: '상한 정시', snapshotKey: 'ideal_jungsi_cut', side: 'ideal', axis: 'jungsi' },
  { key: 'minNaesin', label: '하한 내신', snapshotKey: 'min_naesin_cut', side: 'min', axis: 'naesin' },
  { key: 'minJungsi', label: '하한 정시', snapshotKey: 'min_jungsi_cut', side: 'min', axis: 'jungsi' }
];

// 게이지 분해(§4-3-C-2) 4행. 뷰가 base / cum / 최종값을 한 행에 나란히 갖고 있다.
const GOAL_GAUGE_ROWS = [
  { label: '상한 수시', base: 'base_ideal_susi', cum: 'cum_ideal_susi', now: 'ideal_susi', rate: 'rate_ideal_susi' },
  { label: '상한 정시', base: 'base_ideal_jungsi', cum: 'cum_ideal_jungsi', now: 'ideal_jungsi', rate: 'rate_ideal_jungsi' },
  { label: '하한 수시', base: 'base_min_susi', cum: 'cum_min_susi', now: 'min_susi', rate: 'rate_min_susi' },
  { label: '하한 정시', base: 'base_min_jungsi', cum: 'cum_min_jungsi', now: 'min_jungsi', rate: 'rate_min_jungsi' }
];

const GOAL_WEEKDAY_LABELS = ['월', '화', '수', '목', '금', '토', '일'];

function goalOptionLabel(options, value) {
  const matched = options.find((option) => option.value === value);
  return matched ? matched.label : value || '-';
}

function goalTrim(value) {
  return String(value ?? '').trim();
}

function goalNum(value) {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

// 🔴 null 과 0 은 다른 상태다. base_* 가 null 이면 뷰의 최종값도 null 이고
//    (sql/55 의 case when ... is null then null 가드) 그건 "컷 미확보로 미산출"이다.
//    0 은 "확률 0%"다. 같은 회색 텍스트로 뭉개면 관리자가 컷 누락을 결함으로 신고한다.
function GoalProb({ value, digits = 2, suffix = '%' }) {
  const parsed = goalNum(value);
  if (parsed === null) return <span className="font-bold text-gray-400">미산출</span>;
  return (
    <span>
      {parsed.toFixed(digits)}
      {suffix}
    </span>
  );
}

function GoalStatusBadge({ status }) {
  const tone =
    status === 'awaiting_cuts'
      ? 'border-[#B88737]/40 bg-[#FFF8E8] text-[#7A4A12]'
      : status === 'paused'
        ? 'border-gray-300 bg-gray-100 text-gray-500'
        : 'border-[#2348ff]/30 bg-[#eef2ff] text-[#2348ff]';

  return (
    <span
      className={`inline-flex items-center whitespace-nowrap border px-2 py-0.5 text-xs font-black ${tone}`}
    >
      {goalOptionLabel(GOAL_STUDENT_STATUS_OPTIONS, status)}
    </span>
  );
}

function GoalRiskBadge({ tone, children }) {
  const cls =
    tone === 'red'
      ? 'border-red-300 bg-red-50 text-red-600'
      : tone === 'orange'
        ? 'border-[#B88737]/40 bg-[#FFF8E8] text-[#7A4A12]'
        : 'border-gray-300 bg-gray-50 text-gray-500';

  return (
    <span className={`inline-flex items-center border px-1.5 py-0.5 text-[0.6875rem] font-black ${cls}`}>
      {children}
    </span>
  );
}

// 안내 문구 카드. 진단 힌트(§4-3-C-1 / §4-3-C-5)와 상태 안내(§4-3-C-3)가 공유한다.
function GoalNotice({ tone = 'info', children }) {
  const cls =
    tone === 'danger'
      ? 'border-red-300 bg-red-50 text-red-700'
      : tone === 'warn'
        ? 'border-[#B88737]/40 bg-[#FFF8E8] text-[#7A4A12]'
        : 'border-gray-300 bg-[#fafafa] text-gray-600';

  return (
    <div className={`border px-4 py-3 text-sm font-bold leading-6 ${cls}`}>{children}</div>
  );
}

// riskFlags 4종(§4-3-B). 전부 goal_student_state 한 행에서 나온다 — 목록용 추가 쿼리 0회.
// 원본 target/api/student.mjs:571-575 의 '공부시간 감소'(최근 7일 vs 이전 7일)는
// goal_daily_records 가 0행이고 daily-record API 도 미배포라 지금 산출할 수 없다.
// 정의만 남기고 켜지 않는다(§4-3-B 각주).
function buildGoalRiskFlags(row, todayYMD) {
  const flags = [];
  const last = row.last_record_date || null;
  const weekAgo = addDaysYMD(todayYMD, -7);

  if (row.status === 'awaiting_cuts') flags.push({ key: 'awaiting', tone: 'orange', label: '컷 대기' });
  if (Number(row.record_count || 0) === 0) flags.push({ key: 'noRecord', tone: 'red', label: '기록 없음' });
  // last 가 null 이면 두 비교 모두 false 다 — 그 상태는 '기록 없음' 이 이미 표현한다.
  if (last && last < todayYMD) flags.push({ key: 'today', tone: 'gray', label: '오늘 미제출' });
  if (last && last < weekAgo) flags.push({ key: 'week', tone: 'red', label: '최근 7일 기록 없음' });

  return flags;
}

// 온보딩 시점 컷 스냅샷 4칸 중 null 인 것 = 빠진 컷.
// api/_lib/goalRepo.js:270-278 listMissingCuts 와 같은 규칙이지만 그 모듈은
// service_role 클라이언트를 끌고 오므로(supabaseAdmin.js) 브라우저 번들로 import 하지 않는다.
function listGoalMissingCutSlots(student) {
  if (!student) return [];
  return GOAL_CUT_SLOTS.filter((slot) => goalNum(student[slot.snapshotKey]) === null);
}

// 빠진 컷 1칸을 "컷 관리 탭에서 만들어야 할 행" 으로 번역한다.
// 내신 컷의 cut_type 은 학교 유형에서 유도한다 — DB에 저장하지 않고 매번 파생하는 것이
// 계산 엔진의 규약이다(primitives.js:43-47 getSchoolCutType, import 만 한다).
function describeGoalCutSlot(slot, student) {
  const naesinType = getSchoolCutType(student?.school_type);
  return {
    ...slot,
    cutType: slot.axis === 'naesin' ? naesinType : 'jungsi',
    university: goalTrim(slot.side === 'ideal' ? student?.ideal_university : student?.min_university),
    department: goalTrim(slot.side === 'ideal' ? student?.ideal_department : student?.min_department)
  };
}

function goalDiffDays(fromYMD, toYMD) {
  if (!fromYMD || !toYMD) return 0;
  const a = Date.parse(`${String(fromYMD).slice(0, 10)}T00:00:00Z`);
  const b = Date.parse(`${String(toYMD).slice(0, 10)}T00:00:00Z`);
  if (Number.isNaN(a) || Number.isNaN(b)) return 0;
  return Math.round((b - a) / 86400000);
}

function goalSigned(value, digits = 4) {
  const parsed = goalNum(value);
  if (parsed === null) return '-';
  return `${parsed >= 0 ? '+' : ''}${parsed.toFixed(digits)}`;
}

function GoalDetailRow({ label, children }) {
  return (
    <div className="grid grid-cols-[8.75rem_1fr] border-b border-[#edf0f4] last:border-b-0">
      <div className="bg-[#fafafa] px-4 py-2.5 text-xs font-black text-gray-600">{label}</div>
      <div className="whitespace-pre-line px-4 py-2.5 text-sm font-bold">{children}</div>
    </div>
  );
}

function GoalCard({ title, right, children }) {
  return (
    <div className="mb-5 bg-white shadow">
      <div className="flex items-center justify-between gap-3 border-b border-[#edf0f4] bg-[#fafafa] px-5 py-3">
        <span className="text-sm font-black">{title}</span>
        {right}
      </div>
      <div>{children}</div>
    </div>
  );
}

function GoalStudentsAdmin({ onNavigate, onPrefillCreate }) {
  const config = CONFIGS.goalStudents;

  // 목록 state. 상세로 갔다 와도 유지되어야 하므로(§4-3-A) 상세는 하위 컴포넌트로 빼고
  // 이 컴포넌트는 언마운트되지 않는다.
  const [rows, setRows] = useState([]);
  const [totalCount, setTotalCount] = useState(0);
  const [page, setPage] = useState(1);
  const [keyword, setKeyword] = useState('');
  const [term, setTerm] = useState('');
  const [filter, setFilter] = useState('all');
  const [loading, setLoading] = useState(false);
  // profiles 조회가 비어 돌아온 경우. profiles 의 어드민 정책은 is_winning_admin() 이
  // 아니라 is_admin()(role='admin' 엄격)이라, admin_basic 계열 계정에서는 학생 행은
  // 읽히는데 이름·연락처만 통째로 비는 부분 실패가 난다. 조용히 '-' 로 두면 데이터
  // 결손으로 오인하므로 화면에 사유를 띄운다.
  const [profileGap, setProfileGap] = useState(false);
  // 검색 선행 조회(profiles)가 상한에 닿았는가. 이름·연락처 부분일치가
  // PROFILE_SEARCH_LIMIT 을 넘으면 초과분 학생이 결과에서 조용히 사라지므로
  // 절단 사실을 화면에 알린다.
  const [searchTruncated, setSearchTruncated] = useState(false);
  const [detailId, setDetailId] = useState(null);

  const todayYMD = useMemo(() => kstYMD(), []);

  // 검색 디바운스. 확정 시 1페이지로 되돌린다(공용 목록의 관행과 동일).
  useEffect(() => {
    const timer = setTimeout(() => {
      setTerm(keyword.trim());
      setPage(1);
    }, 300);
    return () => clearTimeout(timer);
  }, [keyword]);

  useEffect(() => {
    let cancelled = false;

    async function loadList() {
      setLoading(true);
      setProfileGap(false);
      setSearchTruncated(false);

      // ── 1) 검색: profiles 를 먼저 친다 ────────────────────────────────
      // goal_student_state 에는 이름·연락처가 없다. PostgREST 임베딩도 불가능하다
      // (goal_students.profile_id FK 가 auth.users 를 가리켜 profiles 관계가 없다 —
      //  실제 요청에서 PGRST200 확인). 그래서 id 목록을 먼저 얻어 .in() 으로 좁힌다.
      let idFilter = null;

      if (term) {
        const safe = term.replace(/[,()%_\\*]/g, ' ').trim();
        if (!safe) {
          if (!cancelled) {
            setRows([]);
            setTotalCount(0);
            setLoading(false);
          }
          return;
        }

        const { data, error } = await supabase
          .from('profiles')
          .select('id')
          .or(`name.ilike.%${safe}%,phone.ilike.%${safe}%`)
          .limit(PROFILE_SEARCH_LIMIT);

        if (cancelled) return;

        if (error) {
          console.error(error);
          alert(`학생 검색 실패: ${error.message}`);
          setRows([]);
          setTotalCount(0);
          setLoading(false);
          return;
        }

        idFilter = (data || []).map((row) => row.id);
        // 상한에 정확히 닿았으면 더 있는데 잘렸을 수 있다고 본다. 이 경우
        // 초과분 학생은 아래 .in() 에 아예 들어가지 않아 "그런 학생이 없다"로
        // 보인다 — 조용히 두면 안 되는 종류의 누락이다.
        if (idFilter.length >= PROFILE_SEARCH_LIMIT) setSearchTruncated(true);

        if (idFilter.length === 0) {
          setRows([]);
          setTotalCount(0);
          setLoading(false);
          return;
        }
      }

      // ── 2) goal_student_state (뷰) — 페이지 단위 ──────────────────────
      let query = supabase.from('goal_student_state').select('*', { count: 'exact' });

      if (idFilter) query = query.in('profile_id', idFilter);

      // 필터는 전부 서버 술어다. 뷰 컬럼이라 그대로 나간다.
      if (filter === 'awaiting_cuts') query = query.eq('status', 'awaiting_cuts');
      else if (filter === 'paused') query = query.eq('status', 'paused');
      else if (filter === 'noRecord') query = query.eq('record_count', 0);
      // last_record_date 가 null 인 행은 이 비교에 걸리지 않는다(SQL null 의미론) —
      // 기록이 0행인 학생은 '기록 없음' 필터가 담당한다.
      else if (filter === 'noSubmitToday') query = query.lt('last_record_date', todayYMD);

      // 🔴 2축 정렬 필수(§4-3-B). 이 뷰에는 id 가 없고 awaiting_cuts 학생은
      //    onboarded_at 이 전부 null 이라 동점이 대량 발생한다. 동점 처리축이 없으면
      //    .range() 페이지 경계에서 행이 중복·누락된다(입결 탭이 이미 겪은 사고).
      query = query
        .order('onboarded_at', { ascending: false, nullsFirst: true })
        .order('profile_id', { ascending: true })
        .range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1);

      const { data: stateRows, error: stateError, count } = await query;

      if (cancelled) return;

      if (stateError) {
        console.error(stateError);
        alert(`${config.title} 조회 실패: ${stateError.message}`);
        setRows([]);
        setTotalCount(0);
        setLoading(false);
        return;
      }

      const ids = (stateRows || []).map((row) => row.profile_id);

      if (ids.length === 0) {
        setRows([]);
        setTotalCount(count ?? 0);
        setLoading(false);
        return;
      }

      // ── 3) goal_students / profiles 를 같은 id 집합으로 채워 병합 ──────
      const [studentRes, profileRes] = await Promise.all([
        supabase
          .from('goal_students')
          .select(
            'profile_id, grade, school_type, ideal_university, ideal_department, min_university, min_department'
          )
          .in('profile_id', ids),
        supabase.from('profiles').select('id, name, phone').in('id', ids)
      ]);

      if (cancelled) return;

      if (studentRes.error) {
        console.error(studentRes.error);
        alert(`학생 정보 조회 실패: ${studentRes.error.message}`);
      }

      if (profileRes.error) console.error(profileRes.error);

      const studentMap = new Map((studentRes.data || []).map((row) => [row.profile_id, row]));
      const profileMap = new Map((profileRes.data || []).map((row) => [row.id, row]));

      setProfileGap(Boolean(profileRes.error) || profileMap.size === 0);

      setRows(
        (stateRows || []).map((row) => ({
          ...row,
          student: studentMap.get(row.profile_id) || null,
          profile: profileMap.get(row.profile_id) || null
        }))
      );
      setTotalCount(count ?? 0);
      setLoading(false);
    }

    loadList();

    return () => {
      cancelled = true;
    };
    // config.title 은 모듈 상수라 참조가 안정적이다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, term, filter, todayYMD]);

  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));
  const windowSize = Math.min(totalPages, 10);
  const windowStart = Math.min(
    Math.max(1, page - Math.floor(windowSize / 2)),
    Math.max(1, totalPages - windowSize + 1)
  );
  const pageNumbers = Array.from({ length: windowSize }, (_, index) => windowStart + index);

  if (detailId) {
    return (
      <GoalStudentDetail
        profileId={detailId}
        onBack={() => setDetailId(null)}
        onNavigate={onNavigate}
        onPrefillCreate={onPrefillCreate}
      />
    );
  }

  return (
    <div>
      <div className="mb-5 bg-white px-6 py-5 shadow">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex flex-wrap items-center gap-2">
            {GOAL_STUDENT_FILTERS.map((item) => (
              <button
                key={item.key}
                type="button"
                onClick={() => {
                  setFilter(item.key);
                  setPage(1);
                }}
                className={`inline-flex h-9 items-center border px-3 text-xs font-black ${
                  filter === item.key
                    ? 'border-[#2348ff] bg-[#2348ff] text-white'
                    : 'border-gray-400 bg-white text-gray-700'
                }`}
              >
                {item.label}
              </button>
            ))}
          </div>

          <div className="flex items-center">
            <input
              value={keyword}
              onChange={(event) => setKeyword(event.target.value)}
              placeholder={config.searchPlaceholder}
              className="h-9 w-[20rem] border border-gray-400 px-3 text-sm outline-none"
            />
            <span className="inline-flex h-9 items-center gap-1 border border-l-0 border-gray-500 bg-white px-4 text-sm font-bold text-gray-500">
              <Search size={14} />
              이름·연락처
            </span>
          </div>
        </div>

        <h1 className="mt-4 text-xl font-black">{config.title}</h1>
        <p className="mt-1 text-xs font-bold text-gray-500">
          읽기 전용 화면입니다. 학생 데이터는 어드민에서 수정할 수 없습니다 — 확률은 온보딩 시점에
          확정되고, 컷을 고쳐도 이미 온보딩한 학생의 값은 바뀌지 않습니다.
        </p>
      </div>

      {profileGap && (
        <div className="mb-5">
          <GoalNotice tone="warn">
            학생 이름·연락처를 가져오지 못했습니다. <code>profiles</code> 의 어드민 조회 정책은{' '}
            <code>is_admin()</code>(<code>role=&#39;admin&#39;</code> 엄격)이라, 다른 관리자 역할로
            로그인하면 학생 행은 보이지만 이름 칸만 비게 됩니다. 나머지 지표는 정상입니다.
          </GoalNotice>
        </div>
      )}

      {searchTruncated && (
        <div className="mb-5">
          <GoalNotice tone="warn">
            검색어에 걸리는 회원이 {PROFILE_SEARCH_LIMIT}명을 넘습니다. 목록에는 앞의{' '}
            {PROFILE_SEARCH_LIMIT}명 안에서만 학생을 찾아 보여 주므로 일부가 빠져 있을 수 있습니다 —
            이름을 더 길게 입력하거나 연락처 뒷자리로 좁혀 주세요.
          </GoalNotice>
        </div>
      )}

      {loading ? (
        <div className="bg-white p-12 text-center text-sm font-bold text-gray-500 shadow">
          데이터를 불러오는 중입니다.
        </div>
      ) : (
        <div className="bg-white p-6 shadow">
          <div className="mb-4 text-sm font-bold text-gray-500">
            전체 <span className="text-[#2348ff]">{totalCount.toLocaleString()}</span>명
          </div>

          <div className="overflow-x-auto">
            <table className="w-full min-w-[81.25rem] border-collapse text-sm">
              <thead>
                {/* 표 폭이 컨테이너보다 넓으면 가로 스크롤로 처리한다(§4-1 관행).
                    머리글이 줄바꿈되면 "상한 수 / 시" 처럼 끊겨 읽히므로 nowrap 을 건다. */}
                <tr className="border-y border-gray-300 text-left [&>th]:whitespace-nowrap">
                  <th className="px-3 py-3">이름</th>
                  <th className="px-3 py-3">연락처</th>
                  <th className="px-3 py-3">학년</th>
                  <th className="px-3 py-3">학교 유형</th>
                  <th className="px-3 py-3">상한 목표</th>
                  <th className="px-3 py-3">하한 목표</th>
                  <th className="px-3 py-3">상태</th>
                  <th className="px-3 py-3">상한 수시</th>
                  <th className="px-3 py-3">상한 정시</th>
                  <th className="px-3 py-3">하한 수시</th>
                  <th className="px-3 py-3">하한 정시</th>
                  <th className="px-3 py-3">기록 수</th>
                  <th className="px-3 py-3">최근 기록일</th>
                  <th className="px-3 py-3">위험</th>
                  <th className="w-20 px-3 py-3 text-center">관리</th>
                </tr>
              </thead>

              <tbody>
                {rows.length === 0 ? (
                  <tr>
                    <td colSpan={15} className="py-12 text-center text-gray-400">
                      {term || filter !== 'all'
                        ? '조건에 맞는 학생이 없습니다.'
                        : '온보딩을 마친 학생이 아직 없습니다.'}
                    </td>
                  </tr>
                ) : (
                  rows.map((row) => {
                    const flags = buildGoalRiskFlags(row, todayYMD);
                    return (
                      <tr key={row.profile_id} className="border-b border-gray-100">
                        <td className="whitespace-nowrap px-3 py-3 font-bold">
                          {row.profile?.name || '-'}
                        </td>
                        {/* 목록은 마스킹, 상세는 원본 — maskedPhone 선례와 같은 규칙(§3-D6) */}
                        <td className="whitespace-nowrap px-3 py-3">
                          {formatValue(row.profile?.phone, 'maskedPhone')}
                        </td>
                        <td className="px-3 py-3">{row.student?.grade || '-'}</td>
                        <td className="px-3 py-3">{row.student?.school_type || '-'}</td>
                        <td className="px-3 py-3">
                          {row.student?.ideal_university || '-'}
                          <span className="block text-xs text-gray-500">
                            {row.student?.ideal_department || '-'}
                          </span>
                        </td>
                        <td className="px-3 py-3">
                          {row.student?.min_university || '-'}
                          <span className="block text-xs text-gray-500">
                            {row.student?.min_department || '-'}
                          </span>
                        </td>
                        <td className="px-3 py-3">
                          <GoalStatusBadge status={row.status} />
                        </td>
                        <td className="px-3 py-3">
                          <GoalProb value={row.ideal_susi} />
                        </td>
                        <td className="px-3 py-3">
                          <GoalProb value={row.ideal_jungsi} />
                        </td>
                        <td className="px-3 py-3">
                          <GoalProb value={row.min_susi} />
                        </td>
                        <td className="px-3 py-3">
                          <GoalProb value={row.min_jungsi} />
                        </td>
                        <td className="px-3 py-3">{Number(row.record_count || 0).toLocaleString()}</td>
                        <td className="whitespace-nowrap px-3 py-3">{row.last_record_date || '-'}</td>
                        <td className="px-3 py-3">
                          <span className="flex flex-wrap gap-1">
                            {flags.length === 0 ? (
                              <span className="text-gray-300">-</span>
                            ) : (
                              flags.map((flag) => (
                                <GoalRiskBadge key={flag.key} tone={flag.tone}>
                                  {flag.label}
                                </GoalRiskBadge>
                              ))
                            )}
                          </span>
                        </td>
                        <td className="px-3 py-3 text-center">
                          <button
                            type="button"
                            onClick={() => setDetailId(row.profile_id)}
                            title="상세 보기"
                            className="inline-flex h-7 w-7 items-center justify-center border border-gray-300 text-gray-600"
                          >
                            <Eye size={14} />
                          </button>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          <div className="mt-6 flex items-center justify-center gap-1">
            <button
              type="button"
              onClick={() => setPage(1)}
              disabled={page <= 1}
              className="inline-flex h-8 w-8 items-center justify-center border border-gray-300 disabled:opacity-30"
            >
              <ChevronsLeft size={14} />
            </button>
            <button
              type="button"
              onClick={() => setPage((prev) => Math.max(1, prev - 1))}
              disabled={page <= 1}
              className="inline-flex h-8 w-8 items-center justify-center border border-gray-300 disabled:opacity-30"
            >
              <ChevronLeft size={14} />
            </button>

            {pageNumbers.map((number) => (
              <button
                key={number}
                type="button"
                onClick={() => setPage(number)}
                className={`inline-flex h-8 min-w-8 items-center justify-center border px-2 text-xs font-black ${
                  number === page ? 'border-[#2348ff] bg-[#2348ff] text-white' : 'border-gray-300'
                }`}
              >
                {number}
              </button>
            ))}

            <button
              type="button"
              onClick={() => setPage((prev) => Math.min(totalPages, prev + 1))}
              disabled={page >= totalPages}
              className="inline-flex h-8 w-8 items-center justify-center border border-gray-300 disabled:opacity-30"
            >
              <ChevronRight size={14} />
            </button>
            <button
              type="button"
              onClick={() => setPage(totalPages)}
              disabled={page >= totalPages}
              className="inline-flex h-8 w-8 items-center justify-center border border-gray-300 disabled:opacity-30"
            >
              <ChevronsRight size={14} />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// 확률 로그 시계열. 차트 라이브러리 선례가 이 파일에 0건이라 SVG polyline 으로 직접 그린다.
// 정시 2선은 컷이 없으면 null 이라(sql/56_goal_jungsi_optional.sql) **끊어진 선**이 되어야 한다 —
// null 을 0 으로 접으면 "정시 확률이 0%로 떨어졌다"는 거짓 그림이 된다.
function GoalProbabilityChart({ logs }) {
  const series = [
    { key: 'ideal_susi', label: '상한 수시', color: '#2348ff' },
    { key: 'ideal_jungsi', label: '상한 정시', color: '#7c3aed' },
    { key: 'min_susi', label: '하한 수시', color: '#0f9d58' },
    { key: 'min_jungsi', label: '하한 정시', color: '#B88737' }
  ];

  const width = 640;
  const height = 220;
  const padLeft = 34;
  const padRight = 10;
  const padTop = 10;
  const padBottom = 22;

  if (logs.length === 0) {
    return <div className="px-5 py-8 text-center text-sm font-bold text-gray-400">확률 로그가 없습니다.</div>;
  }

  const stepX =
    logs.length <= 1 ? 0 : (width - padLeft - padRight) / (logs.length - 1);
  const toX = (index) => padLeft + stepX * index;
  const toY = (value) => padTop + (height - padTop - padBottom) * (1 - Number(value) / 100);

  return (
    <div className="px-5 py-4">
      <svg viewBox={`0 0 ${width} ${height}`} className="h-auto w-full" role="img">
        {[0, 25, 50, 75, 100].map((tick) => (
          <g key={tick}>
            <line
              x1={padLeft}
              x2={width - padRight}
              y1={toY(tick)}
              y2={toY(tick)}
              stroke="#e5e7eb"
              strokeWidth="1"
            />
            <text x={4} y={toY(tick) + 4} fontSize="10" fill="#9ca3af">
              {tick}
            </text>
          </g>
        ))}

        {series.map((item) => {
          // null 구간에서 선을 끊는다 — 연속된 non-null 묶음마다 polyline 을 하나씩 만든다.
          const segments = [];
          let current = [];

          logs.forEach((log, index) => {
            const value = goalNum(log[item.key]);
            if (value === null) {
              if (current.length > 0) segments.push(current);
              current = [];
              return;
            }
            current.push(`${toX(index)},${toY(value)}`);
          });

          if (current.length > 0) segments.push(current);

          return (
            <g key={item.key}>
              {segments.map((points, index) => (
                <polyline
                  key={index}
                  points={points.join(' ')}
                  fill="none"
                  stroke={item.color}
                  strokeWidth="2"
                  strokeLinejoin="round"
                />
              ))}
            </g>
          );
        })}
      </svg>

      <div className="mt-2 flex flex-wrap gap-4">
        {series.map((item) => (
          <span key={item.key} className="inline-flex items-center gap-1.5 text-xs font-bold text-gray-600">
            <span className="inline-block h-0.5 w-4" style={{ backgroundColor: item.color }} />
            {item.label}
          </span>
        ))}
      </div>
    </div>
  );
}

const GOAL_RECORD_PAGE = 30;

function GoalStudentDetail({ profileId, onBack, onNavigate, onPrefillCreate }) {
  const [loading, setLoading] = useState(true);
  const [student, setStudent] = useState(null);
  const [state, setState] = useState(null);
  const [profile, setProfile] = useState(null);
  const [cutRows, setCutRows] = useState({});
  const [logs, setLogs] = useState([]);
  const [records, setRecords] = useState([]);
  const [recordTotal, setRecordTotal] = useState(0);
  const [recordLimit, setRecordLimit] = useState(GOAL_RECORD_PAGE);
  const [showRaw, setShowRaw] = useState(false);
  const [openMemo, setOpenMemo] = useState({});

  const todayYMD = useMemo(() => kstYMD(), []);

  // 학생 1명분 정적 데이터. 기록 목록만 '더보기'로 따로 늘린다.
  useEffect(() => {
    let cancelled = false;

    async function loadDetail() {
      setLoading(true);

      const [studentRes, stateRes, profileRes, logRes] = await Promise.all([
        supabase.from('goal_students').select('*').eq('profile_id', profileId).maybeSingle(),
        supabase.from('goal_student_state').select('*').eq('profile_id', profileId).maybeSingle(),
        supabase.from('profiles').select('id, name, phone, email').eq('id', profileId).maybeSingle(),
        supabase
          .from('goal_probability_logs')
          .select('*')
          .eq('profile_id', profileId)
          .order('created_at', { ascending: true })
      ]);

      if (cancelled) return;

      if (studentRes.error) {
        console.error(studentRes.error);
        alert(`학생 상세 조회 실패: ${studentRes.error.message}`);
        setLoading(false);
        return;
      }

      const studentRow = studentRes.data || null;

      setStudent(studentRow);
      setState(stateRes.data || null);
      setProfile(profileRes.data || null);
      setLogs(logRes.data || []);

      // ── 현재 컷 조회 (§4-3-C-3) ──────────────────────────────────────
      // 술어는 goalRepo.fetchUniversityCut(api/_lib/goalRepo.js:156-171)과
      // 글자 단위로 같아야 한다 — cut_type + university_name + department_name +
      // is_active=true + order('id') + limit(1). 하나라도 어긋나면 화면의 "현재 컷"과
      // 온보딩이 실제로 집어 갈 컷이 달라져 diff 표 자체가 거짓말이 된다.
      const slots = studentRow
        ? GOAL_CUT_SLOTS.map((slot) => describeGoalCutSlot(slot, studentRow))
        : [];

      const cutResults = await Promise.all(
        slots.map(async (slot) => {
          if (!slot.university || !slot.department) return [slot.key, null];

          const { data, error } = await supabase
            .from('goal_university_cuts')
            .select('avg_cut, source, source_year, updated_at')
            .eq('cut_type', slot.cutType)
            .eq('university_name', slot.university)
            .eq('department_name', slot.department)
            .eq('is_active', true)
            .order('id', { ascending: true })
            .limit(1)
            .maybeSingle();

          if (error) {
            console.error(error);
            return [slot.key, null];
          }

          return [slot.key, data || null];
        })
      );

      if (cancelled) return;

      setCutRows(Object.fromEntries(cutResults));
      setLoading(false);
    }

    loadDetail();

    return () => {
      cancelled = true;
    };
  }, [profileId]);

  // 일별 기록. record_index 내림차순 최근 N행 + 더보기.
  useEffect(() => {
    let cancelled = false;

    async function loadRecords() {
      const { data, error, count } = await supabase
        .from('goal_daily_records')
        .select('*', { count: 'exact' })
        .eq('profile_id', profileId)
        .order('record_index', { ascending: false })
        .range(0, recordLimit - 1);

      if (cancelled) return;

      if (error) {
        console.error(error);
        return;
      }

      setRecords(data || []);
      setRecordTotal(count ?? 0);
    }

    loadRecords();

    return () => {
      cancelled = true;
    };
  }, [profileId, recordLimit]);

  // 원클릭 컷 만들기(§4-3-C-4). 공급자는 이 컴포넌트, 소비자는 Admin() 최상단의
  // config.CustomComponent 렌더 분기(onNavigate/onPrefillCreate 계약, 그 지점 참고) —
  // 반드시 onNavigate로 탭을 먼저 옮긴 뒤 onPrefillCreate로 프리필을 실어야 한다.
  // changeTab이 mode를 'list'로 되돌리므로, 순서가 뒤바뀌면(프리필 먼저) 직후의
  // changeTab이 mode를 다시 'list'로 덮어써 등록 폼이 열리지 않는다.
  // 두 핸들러 모두 함수일 때만 동작한다 — 클립보드 백업 경로는 두지 않는다(진입점
  // 하나만 정본으로 둔다). 미제공 시 버튼 자체를 렌더하지 않는다(canCreateCut).
  const canCreateCut = typeof onNavigate === 'function' && typeof onPrefillCreate === 'function';

  function createCutFromSlot(slot) {
    if (!canCreateCut) return;
    onNavigate('goalUniversityCuts');
    onPrefillCreate({
      cut_type: slot.cutType,
      university_name: slot.university,
      department_name: slot.department
    });
  }

  if (loading) {
    return (
      <div>
        <div className="mb-4 flex items-center justify-between">
          <h1 className="text-2xl font-black text-[#111827]">학생 상세</h1>
          <ActionButton variant="light" onClick={onBack}>
            목록으로
          </ActionButton>
        </div>
        <div className="bg-white p-12 text-center text-sm font-bold text-gray-500 shadow">
          데이터를 불러오는 중입니다.
        </div>
      </div>
    );
  }

  if (!student) {
    return (
      <div>
        <div className="mb-4 flex items-center justify-between">
          <h1 className="text-2xl font-black text-[#111827]">학생 상세</h1>
          <ActionButton variant="light" onClick={onBack}>
            목록으로
          </ActionButton>
        </div>
        <div className="bg-white p-12 text-center text-sm font-bold text-gray-500 shadow">
          학생 행을 찾을 수 없습니다.
        </div>
      </div>
    );
  }

  const missingSlots = listGoalMissingCutSlots(student).map((slot) =>
    describeGoalCutSlot(slot, student)
  );
  const missingJungsiOnly = missingSlots.filter((slot) => slot.axis === 'jungsi');
  const naesinCutType = getSchoolCutType(student.school_type);
  const currentMogo = goalNum(student.current_mogo);
  const remainNaesin = Number(student.remain_naesin || 0);
  const remainMogo = Number(student.remain_mogo || 0);
  // 고1 무내신 특례. 이번 브랜치에서 grade 는 학생이 실제로 고른 학년을 그대로 저장하고
  // (intake.js:703 `grade: inputGrade`), 특례 식별자는 naesin_scores.priorNaesinGrade 다.
  // 이 학생은 remain_naesin=10 / remain_mogo=14 가 정상값이라 데이터 결손이 아니다.
  const priorNaesinGrade =
    student.naesin_scores && typeof student.naesin_scores === 'object'
      ? student.naesin_scores.priorNaesinGrade
      : null;

  const cumAllZero =
    state &&
    ['cum_ideal_susi', 'cum_ideal_jungsi', 'cum_min_susi', 'cum_min_jungsi'].every(
      (key) => Number(state[key] || 0) === 0
    );

  const schedule = student.study_schedule && typeof student.study_schedule === 'object'
    ? student.study_schedule
    : {};

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-black text-[#111827]">
            {profile?.name || '이름 없음'} <GoalStatusBadge status={state?.status || student.status} />
          </h1>
          <p className="mt-1 font-mono text-xs text-gray-400">{student.profile_id}</p>
        </div>
        <ActionButton variant="light" onClick={onBack}>
          목록으로
        </ActionButton>
      </div>

      {/* ── 진단 힌트 (§4-3-C-1) ───────────────────────────────────────── */}
      <div className="mb-5 space-y-2">
        {state?.status === 'awaiting_cuts' && (
          <GoalNotice tone="danger">
            🔴 컷 미확보로 확률이 산출되지 않았습니다. 빠진 컷:{' '}
            <b>{missingSlots.map((slot) => slot.label).join(', ') || '없음'}</b>
            {canCreateCut && (
              <div className="mt-2 flex flex-wrap gap-2">
                {missingSlots.map((slot) => (
                  <button
                    key={slot.key}
                    type="button"
                    onClick={() => createCutFromSlot(slot)}
                    className="inline-flex h-8 items-center border border-red-300 bg-white px-3 text-xs font-black text-red-600"
                  >
                    {slot.label} 컷 만들기
                  </button>
                ))}
              </div>
            )}
            <div className="mt-2 text-xs font-bold">
              ⓘ 빠진 컷을 만들어 준 뒤 <b>학생이 온보딩을 다시 제출하면</b> 그대로 진행중으로
              전환됩니다 — 관리자가 할 추가 작업은 없고, 자동으로 되지도 않습니다. 학생에게 온보딩
              재제출을 안내해 주세요.
            </div>
          </GoalNotice>
        )}

        {state?.status !== 'awaiting_cuts' && missingJungsiOnly.length > 0 && (
          <GoalNotice tone="warn">
            🟠 정시 컷이 없어 <b>정시 확률 2종이 미산출</b>입니다(수시는 정상 산출). 빠진 컷:{' '}
            <b>{missingJungsiOnly.map((slot) => slot.label).join(', ')}</b>
            {canCreateCut && (
              <div className="mt-2 flex flex-wrap gap-2">
                {missingJungsiOnly.map((slot) => (
                  <button
                    key={slot.key}
                    type="button"
                    onClick={() => createCutFromSlot(slot)}
                    className="inline-flex h-8 items-center border border-[#B88737]/50 bg-white px-3 text-xs font-black text-[#7A4A12]"
                  >
                    {slot.label} 컷 만들기
                  </button>
                ))}
              </div>
            )}
            <div className="mt-2 text-xs font-bold">
              ⓘ 지금 정시 컷을 채워도 <b>이 학생의 정시 확률은 영원히 미산출로 남습니다</b> — 확률
              기준값(base)은 온보딩 시점에 1회 산출되고 재계산 경로가 없습니다.
            </div>
          </GoalNotice>
        )}

        {currentMogo !== null && currentMogo <= 0 && (
          <GoalNotice tone="danger">
            🔴 모의고사 환산점수가 {currentMogo} 입니다(0 이하) — 정시 확률 2종이 구조적으로 0이
            됩니다. 영어 감점이 최대 −16 이라 종합 백분위가 음수가 될 수 있습니다.
          </GoalNotice>
        )}

        {(remainNaesin >= 8 || remainMogo >= 11) && (
          <GoalNotice>
            ⓘ 남은 시험 회차가 많습니다(내신 {remainNaesin}/10, 모의 {remainMogo}/14). 시간계수 때문에
            우세 갈래에서도 확률이 깎입니다 — 남은 회차가 전부 남았을 때 계수는 최저 0.55 입니다.
          </GoalNotice>
        )}

        {priorNaesinGrade ? (
          <GoalNotice>
            ⓘ 내신 회차가 전부 &lsquo;없음&rsquo;인 특례 학생입니다. 현재 성적은 이전 단계 평균 등급(
            <b>{priorNaesinGrade}</b>)으로 대체됐고, 잔여 회차가 전부 남은 값(내신 {remainNaesin},
            모의 {remainMogo})인 것이 정상입니다. <code>grade</code> 는 학생이 실제로 고른 학년입니다.
          </GoalNotice>
        ) : null}
      </div>

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
        {/* ── C-1 좌측: 입력과 파생 ─────────────────────────────────── */}
        <div>
          <GoalCard title="기본">
            <GoalDetailRow label="이름">{profile?.name || '-'}</GoalDetailRow>
            {/* 상세는 원본 연락처를 그대로 보여준다(목록만 마스킹, §3-D6) */}
            <GoalDetailRow label="연락처">{profile?.phone || '-'}</GoalDetailRow>
            <GoalDetailRow label="이메일">{profile?.email || '-'}</GoalDetailRow>
            <GoalDetailRow label="학년">{student.grade || '-'}</GoalDetailRow>
            <GoalDetailRow label="학교 유형">
              {student.school_type || '-'}
              <span className="ml-2 text-xs font-bold text-gray-400">
                내신 컷 종류: {naesinCutType}
              </span>
            </GoalDetailRow>
            <GoalDetailRow label="온보딩일">
              {formatValue(student.onboarded_at, 'datetime')}
            </GoalDetailRow>
            <GoalDetailRow label="상태">
              <GoalStatusBadge status={state?.status || student.status} />
            </GoalDetailRow>
            <GoalDetailRow label="가상 날짜 원점">{student.actual_start_date || '-'}</GoalDetailRow>
          </GoalCard>

          <GoalCard title="목표">
            <GoalDetailRow label="상한 대학">{student.ideal_university || '-'}</GoalDetailRow>
            <GoalDetailRow label="상한 학과">{student.ideal_department || '-'}</GoalDetailRow>
            <GoalDetailRow label="하한 대학">{student.min_university || '-'}</GoalDetailRow>
            <GoalDetailRow label="하한 학과">{student.min_department || '-'}</GoalDetailRow>
          </GoalCard>

          <GoalCard title="성적 파생값">
            <GoalDetailRow label="현재 성적">{student.current_score ?? '-'}</GoalDetailRow>
            <GoalDetailRow label="변환 등급">{student.converted_grade ?? '-'}</GoalDetailRow>
            <GoalDetailRow label="모의 환산점수">{student.current_mogo ?? '-'}</GoalDetailRow>
          </GoalCard>

          <GoalCard title="시험 회차">
            <GoalDetailRow label="최근 내신">{student.last_naesin_exam || '-'}</GoalDetailRow>
            <GoalDetailRow label="잔여 내신">{remainNaesin} / 10</GoalDetailRow>
            <GoalDetailRow label="최근 모의">{student.last_mogo_exam || '-'}</GoalDetailRow>
            <GoalDetailRow label="잔여 모의">{remainMogo} / 14</GoalDetailRow>
          </GoalCard>

          <GoalCard title="학습 목표">
            <GoalDetailRow label="주간 이상">{student.week_ideal ?? '-'} 시간</GoalDetailRow>
            <GoalDetailRow label="주간 최소">{student.week_min ?? '-'} 시간</GoalDetailRow>
            <div className="overflow-x-auto px-4 py-3">
              <table className="w-full min-w-[25rem] border-collapse text-xs">
                <thead>
                  <tr className="border-y border-gray-200 text-left">
                    <th className="px-2 py-2">요일</th>
                    {GOAL_WEEKDAY_LABELS.map((label) => (
                      <th key={label} className="px-2 py-2">
                        {label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  <tr className="border-b border-gray-100">
                    <td className="px-2 py-2 font-black">이상</td>
                    {VIRTUAL_DAY_NAMES.map((day) => (
                      <td key={day} className="px-2 py-2">
                        {schedule?.[day]?.ideal ?? '-'}
                      </td>
                    ))}
                  </tr>
                  <tr>
                    <td className="px-2 py-2 font-black">최소</td>
                    {VIRTUAL_DAY_NAMES.map((day) => (
                      <td key={day} className="px-2 py-2">
                        {schedule?.[day]?.min ?? '-'}
                      </td>
                    ))}
                  </tr>
                </tbody>
              </table>
              <p className="mt-2 text-xs font-bold text-gray-400">
                주간 합계는 월~토만 더합니다(일요일 제외).
              </p>
            </div>
          </GoalCard>

          {/* 성적 원자료 — 목록 미노출, 상세 접힘 기본(§3-D6) */}
          <GoalCard
            title="성적 원자료"
            right={
              <ActionButton variant="light" onClick={() => setShowRaw((prev) => !prev)}>
                {showRaw ? '접기' : '성적 원자료 펼치기'}
              </ActionButton>
            }
          >
            {showRaw ? (
              <div className="space-y-3 px-5 py-4">
                <div>
                  <div className="mb-1 text-xs font-black text-gray-500">naesin_scores</div>
                  <pre className="overflow-x-auto border border-gray-200 bg-[#fafafa] p-3 text-xs">
                    {JSON.stringify(student.naesin_scores ?? null, null, 2)}
                  </pre>
                </div>
                <div>
                  <div className="mb-1 text-xs font-black text-gray-500">mock_exam_scores</div>
                  <pre className="overflow-x-auto border border-gray-200 bg-[#fafafa] p-3 text-xs">
                    {JSON.stringify(student.mock_exam_scores ?? null, null, 2)}
                  </pre>
                </div>
              </div>
            ) : (
              <div className="px-5 py-4 text-xs font-bold text-gray-400">
                개인 성적 원자료입니다. 필요할 때만 펼쳐 주세요.
              </div>
            )}
          </GoalCard>
        </div>

        {/* ── C-2 우측: 게이지 분해 + C-3 컷 diff ────────────────────── */}
        <div>
          <GoalCard title="확률 분해 (base + Σdelta = 현재)">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[30rem] border-collapse text-sm">
                <thead>
                  <tr className="border-b border-gray-200 text-left">
                    <th className="px-4 py-2.5 text-xs font-black text-gray-500">항목</th>
                    <th className="px-4 py-2.5 text-xs font-black text-gray-500">base</th>
                    <th className="px-4 py-2.5 text-xs font-black text-gray-500">Σdelta</th>
                    <th className="px-4 py-2.5 text-xs font-black text-gray-500">현재</th>
                    <th className="px-4 py-2.5 text-xs font-black text-gray-500">rate(%/일)</th>
                  </tr>
                </thead>
                <tbody>
                  {GOAL_GAUGE_ROWS.map((row) => (
                    <tr key={row.label} className="border-b border-gray-100 last:border-b-0">
                      <td className="px-4 py-2.5 font-black">{row.label}</td>
                      <td className="px-4 py-2.5">
                        <GoalProb value={state?.[row.base]} digits={1} suffix="" />
                      </td>
                      <td className="px-4 py-2.5">{goalSigned(state?.[row.cum])}</td>
                      <td className="px-4 py-2.5 font-black">
                        <GoalProb value={state?.[row.now]} digits={4} />
                      </td>
                      <td className="px-4 py-2.5 text-gray-500">
                        {goalNum(student[row.rate]) === null
                          ? '-'
                          : Number(student[row.rate]).toFixed(4)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="border-t border-[#edf0f4] px-5 py-3 text-xs font-bold leading-6 text-gray-500">
              rate = (100 − base) ÷ (기준일까지 남은 일수 + 학년 오프셋)입니다. base 가 95라면 rate 는
              0.02%/일 수준이라 &ldquo;매일 제출하는데 확률이 안 오른다&rdquo;는 문의의 1순위 답이 됩니다.
              {cumAllZero && (
                <div className="mt-1">
                  ※ 증분(Σdelta)이 전부 0입니다 — 일별 기록 API(<code>api/goal/daily-record</code>)
                  미배포 상태에서는 정상입니다.
                </div>
              )}
            </div>
          </GoalCard>

          {/* ── C-3 컷 스냅샷 vs 현재 컷 diff ────────────────────────── */}
          <GoalCard title="컷 스냅샷 vs 현재 컷">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[34rem] border-collapse text-sm">
                <thead>
                  <tr className="border-b border-gray-200 text-left">
                    <th className="px-4 py-2.5 text-xs font-black text-gray-500">항목</th>
                    <th className="px-4 py-2.5 text-xs font-black text-gray-500">온보딩 스냅샷</th>
                    <th className="px-4 py-2.5 text-xs font-black text-gray-500">현재 컷</th>
                    <th className="px-4 py-2.5 text-xs font-black text-gray-500">출처 / 연도 / 수정일</th>
                    <th className="px-4 py-2.5 text-xs font-black text-gray-500">차이</th>
                  </tr>
                </thead>
                <tbody>
                  {GOAL_CUT_SLOTS.map((slot) => {
                    const described = describeGoalCutSlot(slot, student);
                    const snapshot = goalNum(student[slot.snapshotKey]);
                    const currentRow = cutRows[slot.key] || null;
                    const current = goalNum(currentRow?.avg_cut);
                    const changed =
                      snapshot !== null && current !== null && Math.abs(snapshot - current) > 1e-9;

                    return (
                      <tr key={slot.key} className="border-b border-gray-100 last:border-b-0">
                        <td className="px-4 py-2.5">
                          <span className="font-black">{slot.label}</span>
                          <span className="block text-xs font-bold text-gray-400">
                            {described.cutType} / {described.university || '-'} /{' '}
                            {described.department || '-'}
                          </span>
                        </td>
                        <td className="px-4 py-2.5">
                          {snapshot === null ? (
                            <span className="font-bold text-gray-400">미확보</span>
                          ) : (
                            snapshot.toFixed(2)
                          )}
                        </td>
                        <td className="px-4 py-2.5">
                          {current === null ? (
                            <span className="font-bold text-gray-400">없음</span>
                          ) : (
                            current.toFixed(2)
                          )}
                        </td>
                        <td className="px-4 py-2.5 text-xs text-gray-500">
                          {currentRow
                            ? `${goalOptionLabel(GOAL_CUT_SOURCE_OPTIONS, currentRow.source)} / ${
                                currentRow.source_year ?? '-'
                              } / ${formatValue(currentRow.updated_at, 'datetime')}`
                            : '-'}
                        </td>
                        <td className="px-4 py-2.5">
                          {changed ? (
                            <GoalRiskBadge tone="orange">
                              {goalSigned(current - snapshot, 2)}
                            </GoalRiskBadge>
                          ) : (
                            <span className="text-gray-300">-</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div className="border-t border-[#edf0f4] px-5 py-3">
              {state?.status === 'awaiting_cuts' ? (
                <GoalNotice>
                  ⓘ 이 학생은 아직 확률이 산출되지 않았습니다. <b>빠진 컷을 만들어 준 뒤 학생이
                  온보딩을 다시 제출하면</b> 그대로 진행중으로 전환됩니다 — 관리자가 할 추가 작업은
                  없고, 자동으로 되지도 않습니다.
                </GoalNotice>
              ) : (
                <GoalNotice>
                  ⓘ 컷이 바뀌어도 <b>이 학생의 확률은 온보딩 시점 컷으로 확정</b>돼 있어 바뀌지
                  않습니다. 이는 정상 동작입니다. 새 컷을 반영할 방법은 현재 없습니다 — 재온보딩은
                  409(<code>already_onboarded</code>)로 막혀 있고 학생 초기화 기능은 아직 없습니다.
                </GoalNotice>
              )}
            </div>
          </GoalCard>

          <GoalCard title={`확률 로그 (${logs.length.toLocaleString()}건)`}>
            {/* 0건일 때 차트를 그리지 않는다 — 아래 표가 이미 같은 빈 상태 문구를 낸다. */}
            {logs.length > 0 && <GoalProbabilityChart logs={logs} />}

            <div className="overflow-x-auto border-t border-[#edf0f4]">
              <table className="w-full min-w-[34rem] border-collapse text-xs">
                <thead>
                  <tr className="border-b border-gray-200 text-left">
                    <th className="px-4 py-2">기록 시각</th>
                    <th className="px-4 py-2">사유</th>
                    <th className="px-4 py-2">상한 수시</th>
                    <th className="px-4 py-2">상한 정시</th>
                    <th className="px-4 py-2">하한 수시</th>
                    <th className="px-4 py-2">하한 정시</th>
                    <th className="px-4 py-2">기록 id</th>
                  </tr>
                </thead>
                <tbody>
                  {logs.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="py-8 text-center text-gray-400">
                        확률 로그가 없습니다.
                      </td>
                    </tr>
                  ) : (
                    logs.map((log) => (
                      <tr key={log.id} className="border-b border-gray-100">
                        <td className="px-4 py-2">{formatValue(log.created_at, 'datetime')}</td>
                        <td className="px-4 py-2">{log.reason}</td>
                        <td className="px-4 py-2">
                          <GoalProb value={log.ideal_susi} digits={4} />
                        </td>
                        <td className="px-4 py-2">
                          <GoalProb value={log.ideal_jungsi} digits={4} />
                        </td>
                        <td className="px-4 py-2">
                          <GoalProb value={log.min_susi} digits={4} />
                        </td>
                        <td className="px-4 py-2">
                          <GoalProb value={log.min_jungsi} digits={4} />
                        </td>
                        <td className="px-4 py-2 text-gray-400">{log.source_record_id ?? '-'}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </GoalCard>
        </div>
      </div>

      {/* ── C-5 하단: 일별 기록 타임라인 ──────────────────────────────── */}
      <GoalCard
        title={`일별 기록 (${recordTotal.toLocaleString()}건)`}
        right={
          recordTotal > records.length ? (
            <ActionButton
              variant="light"
              onClick={() => setRecordLimit((prev) => prev + GOAL_RECORD_PAGE)}
            >
              더보기
            </ActionButton>
          ) : null
        }
      >
        <div className="overflow-x-auto">
          <table className="w-full min-w-[62.5rem] border-collapse text-xs">
            <thead>
              <tr className="border-b border-gray-200 text-left">
                <th className="px-3 py-2">#</th>
                <th className="px-3 py-2">가상 날짜</th>
                <th className="px-3 py-2">제출일</th>
                <th className="px-3 py-2">공부시간</th>
                <th className="px-3 py-2">목표(이상/최소)</th>
                <th className="px-3 py-2">성취도</th>
                <th className="px-3 py-2">집중도</th>
                <th className="px-3 py-2">과목 태그</th>
                <th className="px-3 py-2">Δ상한수시</th>
                <th className="px-3 py-2">Δ상한정시</th>
                <th className="px-3 py-2">Δ하한수시</th>
                <th className="px-3 py-2">Δ하한정시</th>
                <th className="px-3 py-2">진단</th>
              </tr>
            </thead>
            <tbody>
              {records.length === 0 ? (
                <tr>
                  <td colSpan={13} className="py-10 text-center text-gray-400">
                    제출된 일별 기록이 없습니다.
                  </td>
                </tr>
              ) : (
                records.map((record) => {
                  const gap = goalDiffDays(record.record_date, record.submitted_on);
                  const hints = [];

                  if (!record.achievement || !record.focus) {
                    hints.push({
                      key: 'multiplier',
                      tone: 'red',
                      text: '배수 키가 비어 있어 이 날의 증분이 0으로 계산됩니다.'
                    });
                  }
                  if (
                    Number(record.target_ideal_hours || 0) === 0 ||
                    Number(record.target_min_hours || 0) === 0
                  ) {
                    hints.push({
                      key: 'target0',
                      tone: 'orange',
                      text: '목표 시간이 0이라 "이미 다 채움"으로 취급돼 rate 가 만액 지급됩니다(일요일 구멍).'
                    });
                  }
                  if (Number(record.study_hours || 0) === 0) {
                    hints.push({
                      key: 'study0',
                      tone: 'orange',
                      text: '0시간 제출은 rate 전액이 음수로 반영됩니다.'
                    });
                  }
                  if (Math.abs(gap) >= 2) {
                    hints.push({
                      key: 'gap',
                      tone: 'gray',
                      text: `가상 날짜와 실제 제출일이 ${Math.abs(gap)}일 차이납니다.`
                    });
                  }

                  const memo = goalTrim(record.memo);

                  return (
                    <tr key={record.id} className="border-b border-gray-100 align-top">
                      <td className="px-3 py-2">{record.record_index}</td>
                      <td className="px-3 py-2">
                        {record.record_date}
                        <span className="block text-gray-400">
                          {GOAL_WEEKDAY_LABELS[record.virtual_day_index] || ''}
                        </span>
                      </td>
                      <td className="px-3 py-2">{record.submitted_on}</td>
                      <td className="px-3 py-2">{record.study_hours}</td>
                      <td className="px-3 py-2">
                        {record.target_ideal_hours} / {record.target_min_hours}
                      </td>
                      <td className="px-3 py-2">
                        {record.achievement ? (
                          <>
                            {record.achievement}
                            <span className="block text-gray-400">
                              ×{ACHIEVEMENT_MULTIPLIER[record.achievement] ?? '?'}
                            </span>
                          </>
                        ) : (
                          <span className="font-black text-red-500">(빈값)</span>
                        )}
                      </td>
                      <td className="px-3 py-2">
                        {record.focus ? (
                          <>
                            {record.focus}
                            <span className="block text-gray-400">
                              ×{FOCUS_MULTIPLIER[record.focus] ?? '?'}
                            </span>
                          </>
                        ) : (
                          <span className="font-black text-red-500">(빈값)</span>
                        )}
                      </td>
                      <td className="px-3 py-2">
                        {(record.tasks || []).length === 0 ? '-' : (record.tasks || []).join(', ')}
                      </td>
                      <td className="px-3 py-2">{goalSigned(record.delta_ideal_susi)}</td>
                      <td className="px-3 py-2">{goalSigned(record.delta_ideal_jungsi)}</td>
                      <td className="px-3 py-2">{goalSigned(record.delta_min_susi)}</td>
                      <td className="px-3 py-2">{goalSigned(record.delta_min_jungsi)}</td>
                      <td className="px-3 py-2">
                        <span className="flex flex-col gap-1">
                          {hints.length === 0 ? (
                            <span className="text-gray-300">-</span>
                          ) : (
                            hints.map((hint) => (
                              <GoalRiskBadge key={hint.key} tone={hint.tone}>
                                {hint.text}
                              </GoalRiskBadge>
                            ))
                          )}
                          {/* memo 는 학생 자유 서술이라 목록 미노출·상세 접힘 기본(§3-D6) */}
                          {memo && (
                            <button
                              type="button"
                              onClick={() =>
                                setOpenMemo((prev) => ({ ...prev, [record.id]: !prev[record.id] }))
                              }
                              className="self-start border border-gray-300 px-1.5 py-0.5 text-[0.6875rem] font-black text-gray-600"
                            >
                              {openMemo[record.id] ? '메모 접기' : '메모 보기'}
                            </button>
                          )}
                          {memo && openMemo[record.id] && (
                            <span className="whitespace-pre-line border border-gray-200 bg-[#fafafa] p-2 text-[0.6875rem] font-bold text-gray-600">
                              {memo}
                            </span>
                          )}
                        </span>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </GoalCard>
    </div>
  );
}
