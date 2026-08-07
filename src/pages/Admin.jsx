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
  Eye,
  Plus,
  RefreshCw,
  Search,
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
  clean as cleanAdmissionText
} from '../lib/admissionParsing';
import BlockEditor from '../components/editor/BlockEditor';
import ColumnPreviewModal from '../components/editor/ColumnPreviewModal';
import { blocksToPlainText } from '../lib/blockToPlainText';
import { plainTextToBlocks } from '../lib/plainTextToBlocks';
import { FAQ_CATEGORIES } from '../data/faqCategories';
// BookViewer는 표현 전용 컴포넌트라 가볍다(bookPairing.js + book-viewer.css) — 정적 import 대상은
// pdfjs-dist뿐이다(PremiumBookAdmin 참고). BookViewer까지 동적 import하면 얻는 것 없이 미리보기 전환에
// 스피너만 하나 더 생긴다.
import BookViewer from '../components/premiumBook/BookViewer';

const PAGE_SIZE = 10;
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
      { key: 'premiumBookPages', label: '프리미엄 책자 관리' }
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
      { key: 'freeDiagnosis', label: '무료진단 관리' }
    ]
  },
  {
    title: '회원 관리',
    items: [
      { key: 'members', label: '회원 목록' },
      { key: 'enrollments', label: '수강 신청 내역' }
    ]
  },
  {
    title: '프로그램 관리',
    items: [
      { key: 'dailyEntries', label: '일일 입장' },
      { key: 'usageStatus', label: '이용 현황' }
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
      { key: 'refunds', label: '환불 요청 내역' }
    ]
  }
];

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
  // custom: true 는 저장소에 1건뿐이던 하드코딩 삼항(freeDiagnosis → FreeDiagnosisAdmin)을
  // config.CustomComponent로 일반화한 것이다 — 아래 Admin() 렌더 분기, PremiumBookAdmin 참고.
  premiumBookPages: {
    title: '프리미엄 책자 관리',
    table: 'premium_book_pages',
    searchPlaceholder: '',
    // 정정(spec B-1): CONFIGS가 실제로 읽는 키는 order다 — orderColumn은 loadRows 지역변수 이름일
    // 뿐이다(Admin.jsx:loadRows, `const orderColumn = config.order || 'created_at'`).
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
    excel: true,
    guideText: `대학별 수시 모집요강 상세정보 관리입니다. HTML 표 형식으로 입력하면 홈페이지에서 표 형태로 표시됩니다.`,

    columns: [
      { key: 'admission_year', label: '연도' },
      { key: 'region', label: '지역' },
      { key: 'university_name', label: '대학명' },
      { key: 'matched_hwp_name', label: '원문 대학명' },
      { key: 'detail_status', label: '상태' },
      { key: 'is_active', label: '노출', type: 'boolean' }
    ],

    fields: [
      { key: 'is_active', label: '노출 여부', type: 'radioBoolean', required: true },

      { key: 'admission_year', label: '입학연도', type: 'number', required: true },
      { key: 'region', label: '지역', type: 'text', required: true },
      { key: 'university_name', label: '대학명', type: 'text', required: true },
      { key: 'university_key', label: '대학 키값', type: 'text', required: true },
      { key: 'matched_hwp_name', label: '원문 대학명', type: 'text' },

      {
        key: 'previous_year_changes',
        label: '전년도와 차이점(수시) 원문(raw)',
        help: '공개 페이지에는 이 원문이 아니라 아래 HTML 필드가 렌더됩니다. 원문만 고치면 화면이 바뀌지 않으니, 고친 뒤 우측 "HWP 원문 파싱 · 미리보기"에서 파싱을 다시 실행해 HTML도 함께 갱신하세요.',
        type: 'textarea',
        rows: 8
      },
      {
        key: 'previous_year_changes_html',
        label: '전년도와 차이점(수시) HTML(공개 페이지 렌더값)',
        type: 'textarea',
        rows: 8
      },
      {
        key: 'selection_method',
        label: '전형방법 원문(raw)',
        help: '공개 페이지에는 이 원문이 아니라 아래 HTML 필드가 렌더됩니다.',
        type: 'textarea',
        rows: 12
      },
      {
        key: 'selection_method_html',
        label: '전형방법 HTML(공개 페이지 렌더값)',
        type: 'textarea',
        rows: 12
      },
      {
        key: 'minimum_requirements',
        label: '최저학력기준 원문(raw)',
        help: '공개 페이지에는 이 원문이 아니라 아래 HTML 필드가 렌더됩니다.',
        type: 'textarea',
        rows: 12
      },
      {
        key: 'minimum_requirements_html',
        label: '최저학력기준 HTML(공개 페이지 렌더값)',
        type: 'textarea',
        rows: 12
      },
      {
        key: 'exam_schedule',
        label: '대학별고사일 원문(raw)',
        help: '공개 페이지에는 이 원문이 아니라 아래 HTML 필드가 렌더됩니다.',
        type: 'textarea',
        rows: 10
      },
      {
        key: 'exam_schedule_html',
        label: '대학별고사일 HTML(공개 페이지 렌더값)',
        type: 'textarea',
        rows: 10
      },
      {
        key: 'school_record_method',
        label: '학생부반영방법 원문(raw)',
        help: '공개 페이지에는 이 원문이 아니라 아래 HTML 필드가 렌더됩니다.',
        type: 'textarea',
        rows: 14
      },
      {
        key: 'school_record_method_html',
        label: '학생부반영방법 HTML(공개 페이지 렌더값)',
        type: 'textarea',
        rows: 14
      },
      {
        key: 'recruitment_quota',
        label: '모집인원 및 입결 원문(raw)',
        help: '공개 페이지에는 이 원문이 아니라 아래 HTML 필드가 렌더됩니다.',
        type: 'textarea',
        rows: 12
      },
      {
        key: 'recruitment_result_html',
        label: '모집인원 및 입결 HTML(공개 페이지 렌더값)',
        type: 'textarea',
        rows: 18
      },
      {
        key: 'jungsi_guideline_url',
        label: '정시모집요강 URL',
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
      selection_method: '',
      selection_method_html: '',
      minimum_requirements: '',
      minimum_requirements_html: '',
      exam_schedule: '',
      exam_schedule_html: '',
      school_record_method: '',
      school_record_method_html: '',
      recruitment_quota: '',
      recruitment_result_html: '',
      jungsi_guideline_url: '',
      memo: '',
      detail_status: '상세입력완료'
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
    homepage: true,
    excel: true,
    guideText: `입결은 데이터가 많으므로 대량 등록은 Supabase CSV Import를 권장합니다. 이 화면은 개별 추가·수정·삭제용으로 사용하세요. 대량 등록 시 (학년도, 모집시기, 대학, 모집단위, 전형명, 반영교과) 조합이 중복되면 저장이 거부되니, Import 전에 중복 행이 없는지 먼저 확인하세요.`,
    columns: [
      { key: 'result_year', label: '연도' },
      { key: 'recruitment_period', label: '모집시기' },
      { key: 'university_name', label: '대학명' },
      { key: 'department_name', label: '모집단위' },
      { key: 'screening_category', label: '전형유형' },
      { key: 'admission_track', label: '전형명' },
      { key: 'grade_70', label: '70%컷' },
      { key: 'is_active', label: '노출', type: 'boolean' }
    ],
    fields: [
      { key: 'is_active', label: '노출 여부', type: 'radioBoolean', required: true },
      { key: 'result_year', label: '학년도', type: 'number', required: true },
      { key: 'recruitment_period', label: '모집시기', type: 'select', options: ['수시', '정시'], required: true },
      { key: 'university_key', label: '대학 키값', type: 'text', required: true },
      { key: 'university_name', label: '대학명', type: 'text', required: true },
      { key: 'department_key', label: '모집단위 키값', type: 'text', required: true },
      { key: 'department_name', label: '모집단위', type: 'text', required: true },
      {
        key: 'main_track',
        label: '중심전형',
        type: 'select',
        options: ['학생부교과', '학생부종합', '논술', '실기', '기타']
      },
      {
        key: 'screening_category',
        label: '전형유형',
        type: 'select',
        options: ['일반', '추천형', '농어촌', '기회균형', '논술', '기타']
      },
      { key: 'admission_track', label: '전형명', type: 'text', required: true, help: '전형명 원문 그대로 입력합니다.' },
      { key: 'grade_50', label: '50%컷', type: 'number' },
      { key: 'grade_70', label: '70%컷', type: 'number' },
      { key: 'grade_85', label: '85%컷', type: 'number' },
      { key: 'grade_90', label: '90%컷', type: 'number' },
      { key: 'converted_score', label: '환산점수', type: 'number' },
      { key: 'percentile', label: '백분위', type: 'number' },
      { key: 'quota', label: '모집인원', type: 'number' },
      { key: 'competition_rate', label: '경쟁률', type: 'number' },
      { key: 'waitlist_rank', label: '충원순위', type: 'text' },
      { key: 'subject_reflection', label: '반영교과/영역', type: 'text' },
      { key: 'source_sheet', label: '출처 시트', type: 'text' },
      { key: 'source_row', label: '출처 행번호', type: 'number' },
      { key: 'note', label: '메모', type: 'textarea' }
    ],
    defaults: {
      is_active: true,
      result_year: 2025,
      recruitment_period: '수시',
      university_key: '',
      university_name: '',
      department_key: '',
      department_name: '',
      main_track: '학생부교과',
      screening_category: '일반',
      admission_track: '',
      grade_50: null,
      grade_70: null,
      grade_85: null,
      grade_90: null,
      converted_score: null,
      percentile: null,
      quota: 0,
      competition_rate: 0,
      waitlist_rank: '',
      subject_reflection: '',
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

  admissionSusi: {
    title: '수시정보',
    table: 'admission_posts',
    fixedCategory: 'susi',
    searchPlaceholder: '수시정보 제목을 검색하세요',
    order: 'sort_order',
    homepage: true,
    columns: [
      { key: 'title', label: '제목' },
      { key: 'is_pinned', label: '최상단 고정', type: 'boolean' },
      { key: 'image_urls', label: '본문 이미지', type: 'imageList' },
      { key: 'attachments', label: '첨부파일', type: 'fileList' },
      { key: 'is_active', label: '노출', type: 'boolean' },
      { key: 'created_at', label: '작성일', type: 'date' }
    ],
    fields: [
      { key: 'is_active', label: '노출 여부', type: 'radioBoolean', required: true },
      { key: 'title', label: '제목', type: 'text', required: true },
      { key: 'is_pinned', label: '최상단 고정', type: 'checkbox' },
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
      category: 'susi',
      is_active: true,
      is_pinned: false,
      title: '',
      content: '',
      image_url: '',
      file_url: '',
      file_name: '',
      image_urls: [],
      attachments: [],
      sort_order: 1
    }
  },

  admissionJungsi: {
    title: '정시정보',
    table: 'admission_posts',
    fixedCategory: 'jungsi',
    searchPlaceholder: '정시정보 제목을 검색하세요',
    order: 'sort_order',
    homepage: true,
    columns: [
      { key: 'title', label: '제목' },
      { key: 'is_pinned', label: '최상단 고정', type: 'boolean' },
      { key: 'image_urls', label: '본문 이미지', type: 'imageList' },
      { key: 'attachments', label: '첨부파일', type: 'fileList' },
      { key: 'is_active', label: '노출', type: 'boolean' },
      { key: 'created_at', label: '작성일', type: 'date' }
    ],
    fields: [
      { key: 'is_active', label: '노출 여부', type: 'radioBoolean', required: true },
      { key: 'title', label: '제목', type: 'text', required: true },
      { key: 'is_pinned', label: '최상단 고정', type: 'checkbox' },
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
      category: 'jungsi',
      is_active: true,
      is_pinned: false,
      title: '',
      content: '',
      image_url: '',
      file_url: '',
      file_name: '',
      image_urls: [],
      attachments: [],
      sort_order: 1
    }
  },

  admissionEssay: {
    title: '논술정보',
    table: 'admission_posts',
    fixedCategory: 'essay',
    searchPlaceholder: '논술정보 제목을 검색하세요',
    order: 'sort_order',
    homepage: true,
    columns: [
      { key: 'title', label: '제목' },
      { key: 'is_pinned', label: '최상단 고정', type: 'boolean' },
      { key: 'image_urls', label: '본문 이미지', type: 'imageList' },
      { key: 'attachments', label: '첨부파일', type: 'fileList' },
      { key: 'is_active', label: '노출', type: 'boolean' },
      { key: 'created_at', label: '작성일', type: 'date' }
    ],
    fields: [
      { key: 'is_active', label: '노출 여부', type: 'radioBoolean', required: true },
      { key: 'title', label: '제목', type: 'text', required: true },
      { key: 'is_pinned', label: '최상단 고정', type: 'checkbox' },
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
      category: 'essay',
      is_active: true,
      is_pinned: false,
      title: '',
      content: '',
      image_url: '',
      file_url: '',
      file_name: '',
      image_urls: [],
      attachments: [],
      sort_order: 1
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

  freeDiagnosis: {
    title: '무료진단 관리',
    custom: true,
    searchPlaceholder: ''
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
      { key: 'status', label: '상태' },
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
      { key: 'status', label: '상태', type: 'select', options: ['납부', '취소요청', '환불완료'] },
      { key: 'memo', label: '비고', type: 'textarea' }
    ],
    defaults: { payer_name: '', sale_amount: 0, discount_amount: 0, paid_amount: 0, status: '납부' }
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

  refunds: {
    title: '환불 요청 내역',
    table: 'refunds',
    searchPlaceholder: '환불 요청 검색',
    order: 'requested_at',
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
const WINNING_EMBED_API_BASE = String(import.meta.env?.VITE_RAG_API_BASE_URL || '').replace(
  /\/$/,
  ''
);

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

  const endpoint = WINNING_EMBED_API_BASE
    ? `${WINNING_EMBED_API_BASE}/api/admin-embeddings`
    : '/api/admin-embeddings';

  try {
    const accessToken = await getFreshSupabaseAccessToken();

    const response = await fetch(endpoint, {
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
      return { ok: false, error: text || `HTTP ${response.status}` };
    });

    if (!response.ok || result?.ok === false) {
      if (response.status === 401) {
        await supabase.auth.signOut().catch(() => {});
        throw new Error(`${result?.error || '관리자 인증 실패'}: 로그아웃 후 다시 로그인하세요.`);
      }

      throw new Error(result?.error || `HTTP ${response.status}`);
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

function FreeDiagnosisAdmin() {
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
        .from('free_diagnosis_questions')
        .select('*')
        .order('sort_order', { ascending: true })
        .order('created_at', { ascending: true }),
      supabase
        .from('free_diagnosis_options')
        .select('*')
        .order('sort_order', { ascending: true })
        .order('created_at', { ascending: true }),
      supabase
        .from('free_diagnosis_programs')
        .select('*')
        .order('sort_order', { ascending: true })
        .order('created_at', { ascending: true })
    ]);

    setLoading(false);

    const error = questionRes.error || optionRes.error || programRes.error;
    if (error) {
      alert(`무료진단 데이터 조회 실패: ${error.message}`);
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

    const { error } = await supabase.from('free_diagnosis_questions').insert({
      title,
      description: newQuestion.description || '',
      input_type: newQuestion.input_type || 'single',
      is_required: boolValue(newQuestion.is_required),
      is_active: boolValue(newQuestion.is_active),
      sort_order: sortOrder
    });

    setSaving(false);

    if (error) {
      alert(`질문 등록 실패: ${error.message}`);
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
      .from('free_diagnosis_questions')
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
      alert(`질문 저장 실패: ${error.message}`);
      return;
    }

    alert('질문 저장 완료');
    await loadAll();
  }

  async function deleteQuestion(question) {
    if (!window.confirm('질문을 삭제하면 질문 안의 답변도 함께 삭제됩니다. 삭제하시겠습니까?'))
      return;

    const { error } = await supabase
      .from('free_diagnosis_questions')
      .delete()
      .eq('id', question.id);
    if (error) {
      alert(`질문 삭제 실패: ${error.message}`);
      return;
    }

    await loadAll();
  }

  async function createOption(questionId) {
    const questionOptions = optionsByQuestion[questionId] || [];
    const { error } = await supabase.from('free_diagnosis_options').insert({
      question_id: questionId,
      label: '',
      program_ids: [],
      is_active: true,
      sort_order: questionOptions.length + 1
    });

    if (error) {
      alert(`답변 추가 실패: ${error.message}`);
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
      .from('free_diagnosis_options')
      .update({
        label: option.label,
        program_ids: normalizeProgramIds(option.program_ids),
        is_active: boolValue(option.is_active),
        sort_order: Number(option.sort_order || 1)
      })
      .eq('id', option.id);
    setSaving(false);

    if (error) {
      alert(`답변 저장 실패: ${error.message}`);
      return;
    }

    alert('답변 저장 완료');
    await loadAll();
  }

  async function deleteOption(option) {
    if (!window.confirm('이 답변을 삭제하시겠습니까?')) return;

    const { error } = await supabase.from('free_diagnosis_options').delete().eq('id', option.id);
    if (error) {
      alert(`답변 삭제 실패: ${error.message}`);
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
    const { error } = await supabase.from('free_diagnosis_programs').insert({
      ...newProgram,
      title,
      sort_order: Number(newProgram.sort_order || 1),
      is_active: boolValue(newProgram.is_active)
    });
    setSaving(false);

    if (error) {
      alert(`추천 프로그램 등록 실패: ${error.message}`);
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
      .from('free_diagnosis_programs')
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
      alert(`추천 프로그램 저장 실패: ${error.message}`);
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

    const { error } = await supabase.from('free_diagnosis_programs').delete().eq('id', program.id);
    if (error) {
      alert(`추천 프로그램 삭제 실패: ${error.message}`);
      return;
    }

    await loadAll();
  }

  return (
    <div className="space-y-6">
      <div className="bg-white px-6 py-5 shadow">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-xl font-black">무료진단 관리</h1>
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
          무료진단 데이터를 불러오는 중입니다.
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
                    placeholder="예: 위닝 AI 수행평가 서비스"
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

  if (type === 'money') return `${Number(value || 0).toLocaleString()}원`;

  if (type === 'date') {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return String(value);
    return date.toISOString().slice(0, 10);
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

function downloadCsv(filename, rows, columns) {
  const header = columns.map((column) => csvEscape(column.label)).join(',');
  // CSV는 표시용이 아니라 데이터 교환용이다 — column.options를 넘기지 마라.
  // 라벨(수시/정시)로 내보내면 Supabase 재업로드 시 category CHECK 제약을 위반한다.
  const body = rows
    .map((row) =>
      columns.map((column) => csvEscape(formatValue(row[column.key], column.type))).join(',')
    )
    .join('\n');

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

  if (field.type === 'textarea') {
    return (
      <textarea
        value={value || ''}
        onChange={(e) => onChange(field.key, e.target.value)}
        disabled={disabled}
        rows={field.rows || 5}
        className="w-full resize-y border border-[#9ca3af] bg-white px-3 py-2 font-mono text-xs leading-5 outline-none disabled:bg-gray-100"
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
        const next = field.type === 'number' ? Number(e.target.value || 0) : e.target.value;
        onChange(field.key, next);
      }}
      disabled={disabled}
      className={base}
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
// 공개 페이지가 실제로 렌더하는 *_html 필드 중 하나라도 원래 값과 달라지면, 어떤 카테고리가
// 바뀌는지 목록으로 보여주고 확인을 받는다. 취소하면 저장을 막는다.
function admissionGuidelinesValidate(form, row) {
  if (!row) return null;

  const changedLabels = HWP_SECTION_ORDER.filter((key) => {
    const htmlKey = HWP_SECTION_HTML_KEYS[key];
    return cleanAdmissionText(form[htmlKey]) !== cleanAdmissionText(row[htmlKey] ?? '');
  }).map((key) => HWP_SECTION_LABELS[key]);

  if (changedLabels.length === 0) return null;

  const proceed = window.confirm(
    `다음 항목의 공개 페이지 HTML이 변경됩니다:\n- ${changedLabels.join('\n- ')}\n\n계속 저장하시겠습니까?`
  );

  return proceed ? null : '저장이 취소되었습니다.';
}

// admissionGuidelines 편집 폼 전용: HWP 원문 텍스트를 붙여넣으면 공유 파싱 모듈(admissionParsing.js)로
// 6개 카테고리(raw + *_html)를 자동으로 채우고, 실제 공개 페이지 모달과 동일한 표 스타일로 미리보기를
// 렌더한다. 번호("1.~6.") 마커가 없어 자동 분할이 안 되는 원문이면, 좌측 필드 목록에 이미 있는
// 카테고리별 raw textarea에 직접 나눠 붙여넣는 fallback을 안내하고 "미리보기 새로고침"으로 그 값을
// 기준으로 HTML을 재생성한다.
function AdmissionParsingPreview({ form, onPatch }) {
  const [hwpSource, setHwpSource] = useState('');
  const [splitStatus, setSplitStatus] = useState(null); // null | 'auto' | 'fallback' | 'manual'
  // 카테고리별 "파싱 결과로 기존 HTML 덮어쓰기" 동의 체크박스 상태. 기본은 비동의(false) —
  // 이미 값이 있는 카테고리는 사용자가 명시적으로 동의해야만 덮어쓴다.
  const [overwriteConsent, setOverwriteConsent] = useState({});

  function toggleConsent(key) {
    setOverwriteConsent((prev) => ({ ...prev, [key]: !prev[key] }));
  }

  // 카테고리 원문 → HTML 파싱 결과를 patch로 만든다. 저장된 큐레이션 HTML을 파괴하지
  // 않기 위해 두 가지를 지킨다:
  // (a) 파싱 결과가 빈 문자열이면 patch에서 제외한다 — 원문이 비어 있다고 기존 HTML을
  //     지우지 않는다(빈 문자열로 덮어써서 공개 페이지에서 항목이 사라지는 것을 방지).
  // (b) 이미 HTML 값이 채워져 있는 카테고리는 "덮어쓰기 동의" 체크박스를 켠 경우에만
  //     patch에 포함한다. 동의하지 않은 카테고리는 skipped로 반환해 호출부가 안내한다.
  function buildPreviewPatch(sourceForm) {
    const patch = {};
    const skipped = [];

    HWP_SECTION_ORDER.forEach((key) => {
      const htmlKey = HWP_SECTION_HTML_KEYS[key];
      const generated = buildHwpCategoryHtml(
        key,
        sourceForm[key],
        sourceForm,
        sourceForm.university_name
      );
      if (!generated) return;

      const hasExisting = Boolean(cleanAdmissionText(sourceForm[htmlKey]));
      if (hasExisting && !overwriteConsent[key]) {
        skipped.push(HWP_SECTION_LABELS[key]);
        return;
      }

      patch[htmlKey] = generated;
    });

    return { patch, skipped };
  }

  function warnSkipped(skipped) {
    if (!skipped.length) return;
    alert(
      `다음 카테고리는 이미 HTML이 있어 자동 반영하지 않았습니다(기존 값 보존):\n- ${skipped.join('\n- ')}\n\n덮어쓰려면 해당 카테고리의 "파싱 결과로 덮어쓰기 동의" 체크박스를 켠 뒤 다시 실행하세요.`
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
    const { patch, skipped } = buildPreviewPatch(mergedRaw);
    onPatch({ ...rawPatch, ...patch });
    warnSkipped(skipped);
  }

  function refreshPreview() {
    setSplitStatus((prev) => prev || 'manual');
    const { patch, skipped } = buildPreviewPatch(form);
    onPatch(patch);
    warnSkipped(skipped);
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
          className="rounded border border-gray-400 bg-white px-3 py-1.5 text-xs font-black transition hover:border-[#2348ff] hover:bg-[#eef2ff] hover:text-[#2348ff]"
        >
          파싱 실행(자동 분할)
        </button>
        <button
          type="button"
          onClick={refreshPreview}
          className="rounded border border-gray-400 bg-white px-3 py-1.5 text-xs font-black transition hover:border-[#2348ff] hover:bg-[#eef2ff] hover:text-[#2348ff]"
        >
          미리보기 새로고침(좌측 원문 기준)
        </button>
      </div>

      {splitStatus === 'fallback' && (
        <p className="mt-3 rounded border border-amber-300 bg-amber-50 px-3 py-2 text-xs font-black leading-5 text-amber-700">
          자동 분할 실패 — 좌측 각 카테고리 원문(raw) 입력란에 카테고리별로 직접 붙여넣은 뒤
          &quot;미리보기 새로고침&quot;을 눌러주세요.
        </p>
      )}

      <div className="admission-modal-body mt-4 space-y-4 border-t border-[#edf0f4] pt-4">
        {HWP_SECTION_ORDER.map((key) => {
          const html = form[HWP_SECTION_HTML_KEYS[key]];
          const hasExisting = Boolean(cleanAdmissionText(html));
          return (
            <div key={key}>
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
              {html ? (
                <div className="admission-existing-html" dangerouslySetInnerHTML={{ __html: html }} />
              ) : (
                <p className="text-xs font-bold text-gray-400">
                  미리보기 없음 — 원문을 입력하고 파싱을 실행하세요.
                </p>
              )}
            </div>
          );
        })}
      </div>

      {/* 아래 클래스들은 AdmissionGuidelines.jsx 모달 스타일과 동일하게 유지한다(공개 페이지와 동일한 표 시각). */}
      <style>{`
        .admission-parsing-preview .admission-scroll-table,
        .admission-parsing-preview .admission-table-wrap,
        .admission-parsing-preview .admission-existing-html { scrollbar-width: none; }
        .admission-parsing-preview .admission-scroll-table::-webkit-scrollbar,
        .admission-parsing-preview .admission-table-wrap::-webkit-scrollbar,
        .admission-parsing-preview .admission-existing-html::-webkit-scrollbar { width: 0; height: 0; }
        .admission-table-wrap,
        .admission-existing-html,
        .admission-raw-section-wrap { width: 100%; max-width: 100%; }
        .admission-table-wrap { overflow-x: auto; }
        .admission-existing-html { overflow-x: auto; }
        .admission-existing-html table,
        .admission-table-wrap table { width: max-content; min-width: 100%; border-collapse: collapse; font-size: 13px; line-height: 1.45; background: #fff; }
        .admission-existing-html th,
        .admission-table-wrap th { position: sticky; top: 0; z-index: 1; background: #f9fafb; color: #013262; font-weight: 900; border: 1px solid #d7d7d7; padding: 10px 10px; text-align: center; white-space: nowrap; }
        .admission-existing-html td,
        .admission-table-wrap td { border: 1px solid #d7d7d7; padding: 9px 10px; color: #525252; vertical-align: middle; text-align: center; white-space: nowrap; }
        .admission-existing-html td.left,
        .admission-table-wrap td.left { text-align: left; white-space: normal; word-break: keep-all; min-width: 160px; }
        .admission-clean-block { width: 100%; }
        .admission-clean-line { margin: 0 0 10px; color: #525252; font-size: 14px; line-height: 1.75; font-weight: 700; word-break: keep-all; }
        .admission-clean-note { margin-top: 12px; color: #667085; font-size: 12px; line-height: 1.65; font-weight: 800; word-break: keep-all; }
        .admission-subhead { margin: 18px 0 8px; color: #013262; font-size: 14px; font-weight: 900; }
        .admission-mini-table, .admission-result-table { width: max-content; min-width: 100%; border-collapse: collapse; font-size: 13px; line-height: 1.45; background: #fff; }
        .admission-mini-table th, .admission-result-table th { position: sticky; top: 0; z-index: 1; background: #f9fafb; color: #013262; font-weight: 900; border: 1px solid #d7d7d7; padding: 10px 10px; text-align: center; white-space: nowrap; }
        .admission-mini-table td, .admission-result-table td { border: 1px solid #d7d7d7; padding: 9px 10px; color: #525252; vertical-align: middle; text-align: center; white-space: nowrap; }
        .admission-mini-table td.left, .admission-result-table td.left { text-align: left; white-space: normal; word-break: keep-all; min-width: 160px; }
        .admission-result-note { margin-bottom: 14px; border: 1px solid #d7d7d7; background: #f9fafb; border-radius: 16px; padding: 12px 14px; color: #667085; font-size: 12.5px; line-height: 1.7; font-weight: 800; word-break: keep-all; }
        .admission-readable-body { display: grid; gap: 8px; }
        .admission-subhead-card { margin-top: 8px; border-left: 4px solid #0b84fd; background: #e9f4ff; border-radius: 12px; padding: 10px 12px; color: #013262; font-size: 14px; line-height: 1.55; font-weight: 950; word-break: keep-all; }
        .admission-normal-line,
        .admission-long-line { border: 1px solid #d7d7d7; background: #fff; border-radius: 13px; padding: 10px 12px; color: #525252; font-size: 13.5px; line-height: 1.65; font-weight: 750; word-break: keep-all; }
        .admission-numbered-line { background: #f9fafb; }
        .admission-long-line { white-space: normal; }
        .admission-token-row { display: grid; grid-template-columns: 140px 1fr; gap: 10px; align-items: start; border: 1px solid #d7d7d7; background: #fff; border-radius: 14px; padding: 10px 12px; }
        .admission-token-label { color: #013262; font-size: 13px; line-height: 1.5; font-weight: 950; white-space: nowrap; }
        .admission-token-list { display: flex; flex-wrap: wrap; gap: 6px; }
        .admission-token-list span { min-width: 34px; border: 1px solid #d7d7d7; background: #f9fafb; border-radius: 10px; padding: 5px 8px; color: #525252; font-size: 13px; line-height: 1.35; font-weight: 900; text-align: center; white-space: nowrap; }
        .admission-wide-sheet { min-width: 760px; width: max-content; display: grid; gap: 4px; border: 1px solid #d7d7d7; background: #f9fafb; border-radius: 16px; padding: 10px; }
        .admission-wide-line { border: 1px solid #d7d7d7; background: #fff; border-radius: 10px; padding: 9px 10px; color: #525252; font-size: 13px; line-height: 1.55; font-weight: 800; white-space: nowrap; }
        .admission-raw-pre { min-width: 760px; margin: 0; border: 1px solid #d7d7d7; border-radius: 16px; background: #ffffff; padding: 16px; color: #525252; font-size: 13px; line-height: 1.7; font-weight: 700; white-space: pre-wrap; word-break: keep-all; font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
        .admission-safe-text-block { border-radius: 0; border-top: 1px solid #d7d7d7; border-bottom: 1px solid #d7d7d7; border-left: 0; border-right: 0; }

        .admission-scroll-table { width: 100%; max-width: 100%; overflow-x: auto; border-radius: 16px; border: 1px solid #d7d7d7; background: #fff; }
        .admission-data-table { width: max-content; min-width: 100%; border-collapse: collapse; font-size: 13px; line-height: 1.45; background: #fff; }
        .admission-data-table th { position: sticky; top: 0; z-index: 2; background: #f9fafb; color: #013262; font-weight: 950; border: 1px solid #d7d7d7; padding: 10px 12px; text-align: center; white-space: nowrap; }
        .admission-data-table td { border: 1px solid #d7d7d7; padding: 9px 12px; color: #525252; vertical-align: middle; text-align: center; white-space: nowrap; font-weight: 750; }
        .admission-data-table td.left { text-align: left; white-space: normal; word-break: keep-all; min-width: 150px; }
        .admission-table-compact td:first-child { background: #f9fafb; color: #013262; font-weight: 950; }
        .admission-info-list { display: grid; gap: 8px; margin-bottom: 14px; }
        .admission-info-list > div { border: 1px solid #d7d7d7; background: #fff; border-radius: 12px; padding: 10px 12px; color: #525252; font-size: 13.5px; line-height: 1.65; font-weight: 800; word-break: keep-all; }
        .admission-empty-box { border: 1px solid #d7d7d7; background: #fff; border-radius: 14px; padding: 18px; color: #525252; font-size: 15px; font-weight: 900; text-align: center; }
        .admission-bullet-list { margin: 0; padding: 0 0 0 20px; display: grid; gap: 8px; }
        .admission-bullet-list li { border: 1px solid #d7d7d7; background: #fff; border-radius: 12px; padding: 10px 12px; color: #525252; font-size: 13.5px; line-height: 1.65; font-weight: 800; word-break: keep-all; }
        .admission-subtitle-line { margin-bottom: 10px; border-left: 4px solid #0b84fd; background: #e9f4ff; border-radius: 12px; padding: 10px 12px; color: #013262; font-weight: 950; }
        .admission-text-line { border: 1px solid #d7d7d7; background: #fff; border-radius: 12px; padding: 10px 12px; color: #525252; font-size: 13.5px; line-height: 1.65; font-weight: 800; word-break: keep-all; }
        .admission-recruit-legend { margin-bottom: 10px; border: 1px solid #bcdcff; background: #e9f4ff; color: #013262; border-radius: 14px; padding: 10px 12px; font-size: 12.5px; line-height: 1.65; font-weight: 850; word-break: keep-all; }
        .admission-header-summary { margin-bottom: 10px; border: 1px solid #d7d7d7; background: #f9fafb; color: #667085; border-radius: 14px; padding: 10px 12px; font-size: 12.5px; line-height: 1.65; font-weight: 850; word-break: keep-all; }

        .admission-recruit-table { min-width: 760px; }
        .admission-recruit-table .group-cell { min-width: 120px; max-width: 190px; }
        .admission-recruit-table .unit-cell { min-width: 160px; max-width: 260px; }
        .admission-recruit-table .recruit-values-cell { min-width: 140px; text-align: left; white-space: normal; vertical-align: top; }
        .admission-recruit-cell-values { display: grid; grid-template-columns: 1fr; gap: 5px; }
        .admission-recruit-cell-values span { display: flex; align-items: center; justify-content: space-between; gap: 8px; border: 1px solid #d7d7d7; background: #f9fafb; border-radius: 9px; padding: 5px 7px; color: #525252; font-size: 12.5px; line-height: 1.35; font-weight: 900; white-space: nowrap; }
        .admission-recruit-cell-values b { color: #667085; font-size: 11px; font-weight: 950; }

        .admission-selection-table { min-width: 720px; }
        .admission-selection-table th:nth-child(4),
        .admission-selection-table td:nth-child(4) { min-width: 280px; text-align: left; white-space: normal; word-break: keep-all; line-height: 1.62; }
        .admission-selection-table .selection-type-cell { background: #f9fafb; color: #013262; font-weight: 950; }
        .admission-selection-table .selection-name-cell { font-weight: 900; }
        .admission-selection-table .selection-seat-cell { color: #013262; font-weight: 950; }
        .admission-minimum-badge { display: inline-flex; align-items: center; justify-content: center; min-width: 38px; max-width: 140px; border: 1px solid #d7d7d7; border-radius: 999px; padding: 3px 7px; background: #f9fafb; color: #667085; font-size: 11px; line-height: 1.2; font-weight: 900; white-space: nowrap; }
        .admission-minimum-badge.has { border-color: #bcdcff; background: #e9f4ff; color: #0b84fd; }
        .admission-minimum-badge.none { color: #667085; }

        .admission-change-scroll-table { overflow-x: auto; }
        .admission-change-table .change-no-cell { font-weight: 950; color: #0b84fd; }
        .admission-change-table .change-title-cell { text-align: left; white-space: normal; line-height: 1.65; font-weight: 950; color: #013262; word-break: keep-all; }
        .admission-change-table .change-content-cell { text-align: left; white-space: normal; line-height: 1.62; word-break: normal; overflow-wrap: anywhere; }
        .admission-change-lines { display: flex; flex-direction: column; gap: 6px; }
        .admission-change-line { border: 1px solid #d7d7d7; background: #f9fafb; border-radius: 10px; padding: 8px 10px; color: #525252; font-weight: 850; line-height: 1.45; word-break: keep-all; overflow-wrap: anywhere; }
        .admission-change-pair-list { display: flex; flex-direction: column; gap: 8px; }
        .admission-change-arrow-row { display: grid; grid-template-columns: minmax(0, 1fr) 34px minmax(0, 1fr); gap: 10px; align-items: stretch; }
        .admission-change-arrow-before, .admission-change-arrow-after { min-width: 0; border: 1px solid #d7d7d7; border-radius: 12px; padding: 10px; background: #f9fafb; }
        .admission-change-arrow-after { background: #e9f4ff; border-color: #bcdcff; }
        .admission-change-arrow-icon { display: flex; align-items: center; justify-content: center; color: #0b84fd; font-weight: 950; font-size: 18px; }
        .admission-change-simple { color: #525252; font-weight: 850; line-height: 1.65; white-space: normal; word-break: keep-all; }

        .admission-record-info-table td:first-child { min-width: 120px; color: #013262; background: #f9fafb; font-weight: 950; }
        .admission-footnote { margin-top: 10px; color: #667085; font-size: 12.5px; line-height: 1.65; font-weight: 850; word-break: keep-all; }

        .admission-special-wrap { display: grid; gap: 16px; }
        .admission-special-block { display: grid; gap: 8px; }
        .admission-special-title { border-left: 4px solid #0b84fd; background: #e9f4ff; border-radius: 12px; padding: 10px 12px; color: #013262; font-size: 14px; line-height: 1.55; font-weight: 950; word-break: keep-all; }
        .admission-special-table td { white-space: normal; word-break: keep-all; line-height: 1.55; }
        .admission-special-table td:first-child { min-width: 120px; background: #f9fafb; color: #013262; font-weight: 950; }

        .admission-modal-body .admission-hwp-section-title { margin: 0 0 8px 0; color: #013262; font-size: 14px; line-height: 1.3; font-weight: 950; letter-spacing: -0.03em; }
        .admission-modal-body .admission-result-note,
        .admission-modal-body .admission-header-summary,
        .admission-modal-body .admission-recruit-legend { display: none !important; }
        .muted { color: #667085; }
      `}</style>
    </section>
  );
}

function AdminForm({ config, mode, row, onCancel, onSave, onUpload }) {
  const [form, setForm] = useState(() => {
    if (row) return config.rowToForm ? config.rowToForm(row) : { ...row };
    return { ...(config.defaults || {}) };
  });
  const [dirty, setDirty] = useState(false);
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

  return (
    <form onSubmit={submit}>
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

      <div className="flex flex-col gap-6 xl:flex-row xl:items-start">
        <div className="min-w-0 flex-1 bg-white shadow">
          {(config.fields || config.columns)
            .filter((field) => !field.showIf || field.showIf(form))
            .map((field) => (
              <div key={field.key} className="grid grid-cols-[220px_1fr] border-b border-[#edf0f4]">
                <div className="bg-[#fafafa] px-5 py-3 text-sm font-black">
                  {field.label}
                  {field.required && <span className="ml-1 text-red-500">*</span>}
                  {field.help && (
                    <p className="mt-1 text-xs font-normal leading-5 text-gray-500">{field.help}</p>
                  )}
                </div>

                <div className="px-5 py-3">
                  {readonly ? (
                    field.type === 'image' && form[field.key] ? (
                      <img src={form[field.key]} alt="" className="h-24 w-40 object-cover" />
                    ) : (
                      <div className="py-2 text-sm">{formatValue(form[field.key], field.type, field.options)}</div>
                    )
                  ) : (
                    <>
                      {!['file', 'multiImage', 'multiFile', 'blockEditor'].includes(field.type) &&
                        !(field.type === 'image' && field.hideUrlInput) && (
                          <AdminInput
                            field={field}
                            value={form[field.key]}
                            onChange={change}
                            disabled={readonly}
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
            ))}
        </div>

        {config.FormPreview && (
          <div className="w-full xl:sticky xl:top-[4.5rem] xl:w-[23.75rem] xl:shrink-0">
            <config.FormPreview form={form} onPatch={patch} />
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
  );
}

function AdminTable({ config, rows, page, setPage, onEdit, onDelete }) {
  const totalPages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  const start = (page - 1) * PAGE_SIZE;
  const pageRows = rows.slice(start, start + PAGE_SIZE);

  return (
    <div className="bg-white p-6 shadow">
      <div className="mb-4 text-sm font-bold text-gray-500">
        전체 <span className="text-blue-600">{rows.length}</span>건
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
                  <td className="px-3 py-3">{rows.length - (start + index)}</td>

                  {config.columns.map((column) => (
                    <td key={column.key} className="px-3 py-3">
                      {column.type === 'image' ? (
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
                      <button
                        type="button"
                        onClick={() => onEdit(row)}
                        className="text-gray-500 hover:text-black"
                      >
                        {config.readOnly ? <Eye size={17} /> : <Edit3 size={17} />}
                      </button>

                      {!config.readOnly && (
                        <button
                          type="button"
                          onClick={() => onDelete(row)}
                          className="text-gray-500 hover:text-red-600"
                        >
                          <Trash2 size={17} />
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

      <div className="mt-5 flex justify-center">
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

          {Array.from({ length: Math.min(totalPages, 10) }, (_, i) => i + 1).map((num) => (
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
      </div>
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
      alert(`업로드 실패: ${error.message}`);
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
  const [rows, setRows] = useState([]);
  const [keyword, setKeyword] = useState('');
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);

  const config = CONFIGS[activeKey];

  const filteredRows = useMemo(() => {
    const q = keyword.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((row) => searchable(row).includes(q));
  }, [rows, keyword]);

  async function loadRows() {
    setLoading(true);

    if (config.custom || config.comingSoon) {
      setRows([]);
      setLoading(false);
      return;
    }

    let query = supabase.from(config.table).select('*');

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

    const { data, error } = await query;

    setLoading(false);

    if (error) {
      console.error(error);
      alert(`${config.title} 조회 실패: ${error.message}`);
      setRows([]);
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
  }

  useEffect(() => {
    setMode('list');
    setEditingRow(null);
    setKeyword('');
    setPage(1);
    loadRows();
  }, [activeKey]);

  async function logout() {
    await supabase.auth.signOut();
    window.location.replace('/');
  }

  // uploadImage는 컴포넌트 상태에 의존하지 않는 순수 함수라 모듈 스코프로 뺐다 — PremiumBookAdmin의
  // 제네릭 개별 페이지 편집(AdminForm onUpload)에서도 그대로 재사용한다. 정의는 파일 하단, Admin() 선언
  // 직전 참고.

  function createRow() {
    setEditingRow(null);
    setMode('create');
  }

  function editRow(row) {
    setEditingRow(row);
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
        alert(`등록 실패: ${error.message}`);
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
        alert(`수정 실패: ${error.message}`);
        return;
      }

      savedRow = data;
    }

    if (shouldRequestWinningEmbedding(config, savedRow)) {
      requestWinningEmbedding(savedRow);
    }

    alert(
      shouldRequestWinningEmbedding(config, savedRow)
        ? '저장 완료. 임베딩은 자동 생성 중입니다.'
        : '저장 완료'
    );
    setMode('list');
    setEditingRow(null);
    await loadRows();
  }

  async function deleteRow(row) {
    if (!window.confirm('정말 삭제하시겠습니까?')) return;

    const { error } = await supabase.from(config.table).delete().eq('id', row.id);

    if (error) {
      alert(`삭제 실패: ${error.message}`);
      return;
    }

    await loadRows();
  }

  function downloadExcel() {
    downloadCsv(
      `${config.title}_${new Date().toISOString().slice(0, 10)}.csv`,
      filteredRows,
      config.columns
    );
  }

  return (
    <div className="min-h-screen bg-[#f4f4f4] text-[#111827]">
      <AdminSidebar activeKey={activeKey} setActiveKey={setActiveKey} />
      <AdminTopbar onLogout={logout} />

      <main className="ml-[224px] pt-[56px]">
        <div className="min-h-[calc(100vh-56px)] px-7 py-8">
          {config.custom ? (
            // custom 삼항의 일반화 지점. 선례(freeDiagnosis)는 CustomComponent를 지정하지 않으므로
            // 기존 하드코딩 동작이 그대로 보존된다 — 회귀 위험 0. 신규 섹션(premiumBookPages)은
            // config.CustomComponent로 자기 컴포넌트를 지정한다.
            config.CustomComponent ? (
              <config.CustomComponent />
            ) : (
              <FreeDiagnosisAdmin />
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
                        onClick={() => setActiveKey(tab.key)}
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
                          className="inline-flex h-9 items-center gap-2 border border-gray-500 bg-white px-4 text-sm font-bold"
                        >
                          <Download size={14} />
                          엑셀 다운로드
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
                </div>

                <MoneySummary activeKey={activeKey} rows={filteredRows} />
                {config.ListSummary && <config.ListSummary rows={rows} />}

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
                    onEdit={editRow}
                    onDelete={deleteRow}
                  />
                )}
              </>
            )
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
      console.error(error);
      alert(`${config.title} 조회 실패: ${error.message}`);
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
      alert(`삭제 실패: ${error.message}`);
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
        alert(`등록 실패: ${error.message}`);
        return;
      }
    } else {
      const { error } = await supabase
        .from('premium_book_pages')
        .update(payload)
        .eq('id', editingRow.id);
      if (error) {
        alert(`수정 실패: ${error.message}`);
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
