import { useEffect, useMemo, useState } from 'react';
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

const PAGE_SIZE = 10;
const IMAGE_BUCKET = 'banners';

const MENU_GROUPS = [
  {
    title: '메인 관리',
    items: [
      { key: 'popups', label: '팝업 관리' },
      { key: 'banners', label: '배너 관리' },
      { key: 'pageContents', label: '세부 페이지 관리' }
    ]
  },
{
  title: '게시판 관리',
  items: [
    { key: 'notices', label: '공지사항' },
    { key: 'admissionSusi', label: '수시정보' },
    { key: 'admissionJungsi', label: '정시정보' },
    { key: 'admissionEssay', label: '논술정보' },
    { key: 'galleries', label: '포토갤러리' },
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
    { key: 'programCategories', label: '기초 데이터' },
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
  guideText: `메인 배너 이미지: 2172px × 724px / 비율: 3:1 / 형식: JPG 또는 PNG / 권장 용량: 1~2MB 이하 / 중요한 글자나 얼굴은 중앙보다 살짝 오른쪽에 배치`,
    columns: [
      { key: 'image_url', label: '이미지', type: 'image' },
      { key: 'title', label: '제목' },
      { key: 'highlight', label: '강조문구' },
      { key: 'subtitle', label: '설명' },
      { key: 'button_text', label: '버튼명' },
      { key: 'sort_order', label: '순서' },
      { key: 'is_active', label: '노출', type: 'boolean' }
    ],
    fields: [
      { key: 'is_active', label: '노출 여부', type: 'radioBoolean', required: true },
      { key: 'title', label: '제목', type: 'text', required: true },
      { key: 'highlight', label: '강조문구', type: 'text' },
      { key: 'subtitle', label: '설명', type: 'textarea' },
      { key: 'button_text', label: '버튼명', type: 'text' },
      { key: 'button_link', label: '버튼 링크', type: 'text' },
      { key: 'image_url', label: '배너 이미지', type: 'image' },
      { key: 'sort_order', label: '순서', type: 'number' }
    ],
    defaults: {
      is_active: true,
      title: '',
      highlight: '',
      subtitle: '',
      button_text: '지금 시작하기',
      button_link: '/signup',
      image_url: '',
      sort_order: 1
    }
  },

  pageContents: {
  title: '세부 페이지 관리',
  table: 'page_contents',
  searchPlaceholder: '메뉴명, 페이지명, 주소를 검색하세요',
  order: 'sort_order',
  homepage: true,
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

  notices: {
    title: '공지사항',
    table: 'notices',
    searchPlaceholder: '공지사항 제목을 검색하세요',
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
  title: '포토갤러리',
  table: 'galleries',
  searchPlaceholder: '포토갤러리 제목을 검색하세요',
  order: 'created_at',
  homepage: true,
  guideText: `포토갤러리 이미지: 1200px × 900px / 비율: 4:3 / 형식: JPG 또는 PNG / 권장 용량: 1~2MB 이하 / 목록 썸네일은 4:3 기준으로 중앙 크롭됩니다.`,
    columns: [
      { key: 'title', label: '제목' },
      { key: 'image_urls', label: '이미지', type: 'imageList' },
      { key: 'is_active', label: '노출', type: 'boolean' },
      { key: 'created_at', label: '작성일', type: 'date' }
    ],
    fields: [
      { key: 'is_active', label: '노출 여부', type: 'radioBoolean', required: true },
      { key: 'title', label: '제목', type: 'text', required: true },
      { key: 'image_urls', label: '이미지', type: 'multiImage', required: true }
    ],
    defaults: {
      is_active: true,
      title: '',
      image_url: '',
      image_urls: []
    }
  },

  faqs: {
    title: '자주하는질문',
    table: 'faqs',
    searchPlaceholder: '질문을 검색하세요',
    order: 'sort_order',
    columns: [
      { key: 'question', label: '질문' },
      { key: 'answer', label: '답변' },
      { key: 'is_active', label: '노출', type: 'boolean' }
    ],
    fields: [
      { key: 'is_active', label: '노출 여부', type: 'radioBoolean', required: true },
      { key: 'question', label: '질문', type: 'text', required: true },
      { key: 'answer', label: '답변', type: 'textarea' },
      { key: 'sort_order', label: '순서', type: 'number' }
    ],
    defaults: { is_active: true, question: '', answer: '', sort_order: 1 }
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
      { key: 'member_type', label: '회원유형', type: 'select', options: ['학생', '학부모', '일반'] },
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
  title: '기초 데이터',
  table: 'program_categories',
  searchPlaceholder: '기초 데이터명을 검색하세요',
  order: 'sort_order',
  homepage: true,
  columns: [
    { key: 'name', label: '명칭' },
    { key: 'description', label: '설명' },
    { key: 'link', label: '연결 페이지' },
    { key: 'icon', label: '아이콘' },
    { key: 'sort_order', label: '순서' },
    { key: 'is_active', label: '사용', type: 'boolean' }
  ],
  fields: [
    { key: 'is_active', label: '사용 여부', type: 'radioBoolean', required: true },
    { key: 'name', label: '명칭', type: 'text', required: true },
    { key: 'description', label: '설명', type: 'textarea' },
    { key: 'link', label: '연결 페이지', type: 'text' },
    {
  key: 'icon',
  label: '아이콘',
  type: 'select',
  options: ['target', 'brain', 'file', 'graduation', 'chart', 'users', 'clipboard', 'edit', 'star', 'default']
},
    { key: 'sort_order', label: '순서', type: 'number' }
  ],
  defaults: {
    is_active: true,
    name: '',
    description: '',
    link: '/services',
    icon: 'default',
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
    setQuestions((prev) => prev.map((question) => (question.id === id ? { ...question, ...patch } : question)));
  }

  function updateOptionLocal(id, patch) {
    setOptions((prev) => prev.map((option) => (option.id === id ? { ...option, ...patch } : option)));
  }

  function updateProgramLocal(id, patch) {
    setPrograms((prev) => prev.map((program) => (program.id === id ? { ...program, ...patch } : program)));
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
    if (!window.confirm('질문을 삭제하면 질문 안의 답변도 함께 삭제됩니다. 삭제하시겠습니까?')) return;

    const { error } = await supabase.from('free_diagnosis_questions').delete().eq('id', question.id);
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
    if (!window.confirm('추천 프로그램을 삭제하면 기존 답변과의 연결도 결과에서 제외됩니다. 삭제하시겠습니까?')) return;

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
                  <TextInput value={newProgram.title} onChange={(value) => setNewProgram((prev) => ({ ...prev, title: value }))} placeholder="예: 위닝 AI 수행평가 서비스" />
                </Field>
                <Field label="상단 배지">
                  <TextInput value={newProgram.badge} onChange={(value) => setNewProgram((prev) => ({ ...prev, badge: value }))} placeholder="예: 추천 서비스 01" />
                </Field>
                <Field label="추천 문구">
                  <Textarea value={newProgram.description} onChange={(value) => setNewProgram((prev) => ({ ...prev, description: value }))} rows={4} />
                </Field>
                <div className="grid gap-3">
                  <Field label="서비스 버튼명">
                    <TextInput value={newProgram.primary_button_text} onChange={(value) => setNewProgram((prev) => ({ ...prev, primary_button_text: value }))} />
                  </Field>
                  <Field label="서비스 링크">
                    <TextInput value={newProgram.primary_button_link} onChange={(value) => setNewProgram((prev) => ({ ...prev, primary_button_link: value }))} placeholder="/page/services-ai-performance" />
                  </Field>
                  <Field label="순서">
                    <TextInput value={newProgram.sort_order} onChange={(value) => setNewProgram((prev) => ({ ...prev, sort_order: value }))} />
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
                      <TextInput value={program.title} onChange={(value) => updateProgramLocal(program.id, { title: value })} />
                    </Field>
                    <Field label="상단 배지">
                      <TextInput value={program.badge} onChange={(value) => updateProgramLocal(program.id, { badge: value })} />
                    </Field>
                    <Field label="추천 문구">
                      <Textarea value={program.description} onChange={(value) => updateProgramLocal(program.id, { description: value })} rows={5} />
                    </Field>
                    <div className="grid gap-3">
                      <Field label="서비스 버튼명">
                        <TextInput value={program.primary_button_text} onChange={(value) => updateProgramLocal(program.id, { primary_button_text: value })} />
                      </Field>
                      <Field label="서비스 링크">
                        <TextInput value={program.primary_button_link} onChange={(value) => updateProgramLocal(program.id, { primary_button_link: value })} />
                      </Field>
                      <Field label="보조 버튼명">
                        <TextInput value={program.secondary_button_text} onChange={(value) => updateProgramLocal(program.id, { secondary_button_text: value })} />
                      </Field>
                      <Field label="보조 링크">
                        <TextInput value={program.secondary_button_link} onChange={(value) => updateProgramLocal(program.id, { secondary_button_link: value })} />
                      </Field>
                    </div>
                    <Field label="아이콘">
                      <Select value={program.icon} onChange={(value) => updateProgramLocal(program.id, { icon: value })}>
                        <option value="target">목표관리</option>
                        <option value="book">수행평가</option>
                        <option value="chart">분석</option>
                        <option value="route">방향설정</option>
                      </Select>
                    </Field>
                    <Field label="순서">
                      <TextInput value={program.sort_order} onChange={(value) => updateProgramLocal(program.id, { sort_order: value })} />
                    </Field>
                  </div>
                  <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
                    <Toggle checked={program.is_active} onChange={(value) => updateProgramLocal(program.id, { is_active: value })} label="사용" />
                    <div className="flex gap-2">
                      <ActionButton onClick={() => saveProgram(program)} disabled={saving}>저장</ActionButton>
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
                  <TextInput value={newQuestion.title} onChange={(value) => setNewQuestion((prev) => ({ ...prev, title: value }))} placeholder="예: 현재 가장 큰 학습 고민은 무엇인가요?" />
                </Field>
                <Field label="선택 방식">
                  <Select value={newQuestion.input_type} onChange={(value) => setNewQuestion((prev) => ({ ...prev, input_type: value }))}>
                    <option value="single">단일 선택</option>
                    <option value="multiple">중복 선택</option>
                  </Select>
                </Field>
                <Field label="순서">
                  <TextInput value={newQuestion.sort_order} onChange={(value) => setNewQuestion((prev) => ({ ...prev, sort_order: value }))} />
                </Field>
              </div>
              <div className="mt-3">
                <Field label="질문 설명">
                  <Textarea value={newQuestion.description} onChange={(value) => setNewQuestion((prev) => ({ ...prev, description: value }))} rows={2} />
                </Field>
              </div>
              <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
                <div className="flex gap-4">
                  <Toggle checked={newQuestion.is_required} onChange={(value) => setNewQuestion((prev) => ({ ...prev, is_required: value }))} label="필수 질문" />
                  <Toggle checked={newQuestion.is_active} onChange={(value) => setNewQuestion((prev) => ({ ...prev, is_active: value }))} label="사용" />
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
                        <h3 className="mt-1 text-base font-black text-gray-900">{question.title || '질문 내용 없음'}</h3>
                        <p className="mt-1 text-xs font-bold text-gray-500">
                          {question.input_type === 'multiple' ? '중복 선택' : '단일 선택'} · {question.is_required ? '필수' : '선택'} · 답변 {questionOptions.length}개
                        </p>
                      </div>
                      <ChevronDown size={18} className={`transition ${isOpen ? 'rotate-180' : ''}`} />
                    </button>

                    {isOpen && (
                      <div className="p-5">
                        <div className="grid gap-3 lg:grid-cols-[1.3fr_0.7fr_0.5fr]">
                          <Field label="질문 내용">
                            <TextInput value={question.title} onChange={(value) => updateQuestionLocal(question.id, { title: value })} />
                          </Field>
                          <Field label="선택 방식">
                            <Select value={question.input_type} onChange={(value) => updateQuestionLocal(question.id, { input_type: value })}>
                              <option value="single">단일 선택</option>
                              <option value="multiple">중복 선택</option>
                            </Select>
                          </Field>
                          <Field label="순서">
                            <TextInput value={question.sort_order} onChange={(value) => updateQuestionLocal(question.id, { sort_order: value })} />
                          </Field>
                        </div>
                        <div className="mt-3">
                          <Field label="질문 설명">
                            <Textarea value={question.description} onChange={(value) => updateQuestionLocal(question.id, { description: value })} rows={2} />
                          </Field>
                        </div>
                        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-b border-gray-200 pb-5">
                          <div className="flex gap-4">
                            <Toggle checked={question.is_required} onChange={(value) => updateQuestionLocal(question.id, { is_required: value })} label="필수 질문" />
                            <Toggle checked={question.is_active} onChange={(value) => updateQuestionLocal(question.id, { is_active: value })} label="사용" />
                          </div>
                          <div className="flex gap-2">
                            <ActionButton onClick={() => saveQuestion(question)} disabled={saving}>질문 저장</ActionButton>
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
                                    <TextInput value={option.label} onChange={(value) => updateOptionLocal(option.id, { label: value })} placeholder="답변 내용을 입력하세요" />
                                  </Field>
                                  <Field label="순서">
                                    <TextInput value={option.sort_order} onChange={(value) => updateOptionLocal(option.id, { sort_order: value })} />
                                  </Field>
                                </div>

                                <div className="mt-3">
                                  <Field label="이 답변 선택 시 노출할 추천 프로그램">
                                    <ProgramSelector
                                      programs={programs}
                                      value={option.program_ids}
                                      onChange={(value) => updateOptionLocal(option.id, { program_ids: value })}
                                    />
                                  </Field>
                                </div>

                                <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
                                  <Toggle checked={option.is_active} onChange={(value) => updateOptionLocal(option.id, { is_active: value })} label="사용" />
                                  <div className="flex gap-2">
                                    <ActionButton onClick={() => saveOption(option)} disabled={saving}>답변 저장</ActionButton>
                                    <ActionButton onClick={() => deleteOption(option)} variant="danger">
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

function formatValue(value, type) {
  if (value === null || value === undefined || value === '') return '-';

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
  return `"${String(value ?? '').replace(/"/g, '""')}"`;
}

function downloadCsv(filename, rows, columns) {
  const header = columns.map((column) => csvEscape(column.label)).join(',');
  const body = rows
    .map((row) => columns.map((column) => csvEscape(formatValue(row[column.key], column.type))).join(','))
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

function AdminSidebar({ activeKey, setActiveKey }) {
  const [open, setOpen] = useState(() => new Set(MENU_GROUPS.map((group) => group.title)));

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
      <div className="border-b border-white/10 px-5 py-5 text-2xl font-black">
        관리자
      </div>

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
                        activeKey === item.key
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
  const base = 'h-9 w-full border border-[#9ca3af] bg-white px-3 text-sm outline-none disabled:bg-gray-100';

  if (field.type === 'textarea') {
    return (
      <textarea
        value={value || ''}
        onChange={(e) => onChange(field.key, e.target.value)}
        disabled={disabled}
        rows={5}
        className="w-full border border-[#9ca3af] bg-white px-3 py-2 text-sm outline-none disabled:bg-gray-100"
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
        {(field.options || []).map((option) => (
          <option key={option} value={option}>{option}</option>
        ))}
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

function AdminForm({ config, mode, row, onCancel, onSave, onUpload }) {
  const [form, setForm] = useState(() => {
    if (row) return { ...row };
    return { ...(config.defaults || {}) };
  });

  const readonly = config.readOnly;

  function change(key, value) {
    setForm((prev) => ({ ...prev, [key]: value }));
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
    change(key, current.filter((_, i) => i !== index));
  }

  function submit(e) {
    e.preventDefault();

    if (readonly) {
      onCancel();
      return;
    }

    for (const field of config.fields || []) {
      if (field.required && String(form[field.key] ?? '').trim() === '') {
        alert(`${field.label} 항목을 입력해주세요.`);
        return;
      }
    }

    onSave(form);
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

      <div className="bg-white shadow">
        {(config.fields || config.columns).map((field) => (
          <div key={field.key} className="grid grid-cols-[220px_1fr] border-b border-[#edf0f4]">
            <div className="bg-[#fafafa] px-5 py-3 text-sm font-black">
              {field.label}
              {field.required && <span className="ml-1 text-red-500">*</span>}
            </div>

            <div className="px-5 py-3">
              {readonly ? (
                field.type === 'image' && form[field.key] ? (
                  <img src={form[field.key]} alt="" className="h-24 w-40 object-cover" />
                ) : (
                  <div className="py-2 text-sm">{formatValue(form[field.key], field.type)}</div>
                )
              ) : (
                <>
                   {!['file', 'multiImage', 'multiFile'].includes(field.type) && (
                    <AdminInput
                      field={field}
                      value={form[field.key]}
                      onChange={change}
                      disabled={readonly}
                    />
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

      <div className="mt-5 flex justify-end gap-2">
        <button
          type="button"
          onClick={onCancel}
          className="h-10 bg-[#4b5563] px-5 text-sm font-black text-white"
        >
          취소
        </button>

        {!readonly && (
          <button
            type="submit"
            className="h-10 bg-[#2348ff] px-5 text-sm font-black text-white"
          >
            저장
          </button>
        )}
      </div>
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
                          <img
                            src={row[column.key]}
                            alt=""
                            className="h-12 w-20 rounded object-cover"
                          />
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
                      ) : (
                        formatValue(row[column.key], column.type)
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
          <button type="button" onClick={() => setPage((p) => Math.max(1, p - 1))} className="h-9 w-10 border-r">
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

          <button type="button" onClick={() => setPage((p) => Math.min(totalPages, p + 1))} className="h-9 w-10 border-r">
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

function MoneySummary({ activeKey, rows }) {
  if (!['payments', 'settlements', 'dailySettlements', 'refunds'].includes(activeKey)) return null;

  const sale = rows.reduce((sum, row) => sum + Number(row.sale_amount || row.total_sale_amount || 0), 0);
  const discount = rows.reduce((sum, row) => sum + Number(row.discount_amount || row.total_discount_amount || 0), 0);
  const paid = rows.reduce((sum, row) => sum + Number(row.paid_amount || row.total_paid_amount || 0), 0);
  const refund = rows.reduce((sum, row) => sum + Number(row.refund_amount || row.total_refund_amount || 0), 0);

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
  }

  if (config.fixedValues) {
    for (const [key, value] of Object.entries(config.fixedValues)) {
      query = query.eq(key, value);
    }
  }

  const orderColumn = config.order || 'created_at';

  if (config.fixedCategory) {
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

  async function uploadImage(files, field = {}) {
    const fileList = Array.isArray(files) ? files : [files].filter(Boolean);
    if (fileList.length === 0) return [];

    const uploaded = [];

    for (const file of fileList) {
      const ext = file.name.split('.').pop()?.toLowerCase() || 'file';

      const safeName =
        file.name
          .replace(/\.[^/.]+$/, '')
          .normalize('NFKD')
          .replace(/[^a-zA-Z0-9_-]/g, '_')
          .replace(/_+/g, '_')
          .replace(/^_+|_+$/g, '')
          .slice(0, 50) || 'upload';

      const folder = field.type === 'file' || field.type === 'multiFile' ? 'notice-files' : 'admin';

      const path = `${folder}/${Date.now()}-${Math.random()
        .toString(36)
        .slice(2)}-${safeName}.${ext}`;

      const { error } = await supabase.storage
        .from(IMAGE_BUCKET)
        .upload(path, file, {
          cacheControl: '3600',
          upsert: false
        });

      if (error) {
        alert(`업로드 실패: ${error.message}`);
        continue;
      }

      const { data } = supabase.storage
        .from(IMAGE_BUCKET)
        .getPublicUrl(path);

      uploaded.push({
        name: file.name,
        url: data.publicUrl,
        size: file.size,
        type: file.type
      });
    }

    return uploaded;
  }

  function createRow() {
    setEditingRow(null);
    setMode('create');
  }

  function editRow(row) {
    setEditingRow(row);
    setMode('edit');
  }

  async function saveRow(form) {
    const payload = { ...form };

if (config.fixedCategory) {
  payload.category = config.fixedCategory;
}

if (config.fixedValues) {
  Object.assign(payload, config.fixedValues);
}

delete payload.created_at;
delete payload.updated_at;

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
        payload.parsed_data = payload.raw_data
          ? JSON.parse(payload.raw_data)
          : null;
      } catch {
        payload.parsed_data = null;
      }
    }

    if (mode === 'create') {
      const { error } = await supabase.from(config.table).insert(payload);

      if (error) {
        alert(`등록 실패: ${error.message}`);
        return;
      }
    } else {
      const { error } = await supabase
        .from(config.table)
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

  async function deleteRow(row) {
    if (!window.confirm('정말 삭제하시겠습니까?')) return;

    const { error } = await supabase
      .from(config.table)
      .delete()
      .eq('id', row.id);

    if (error) {
      alert(`삭제 실패: ${error.message}`);
      return;
    }

    await loadRows();
  }

  function downloadExcel() {
    downloadCsv(`${config.title}_${new Date().toISOString().slice(0, 10)}.csv`, filteredRows, config.columns);
  }

  return (
    <div className="min-h-screen bg-[#f4f4f4] text-[#111827]">
      <AdminSidebar activeKey={activeKey} setActiveKey={setActiveKey} />
      <AdminTopbar onLogout={logout} />

      <main className="ml-[224px] pt-[56px]">
        <div className="min-h-[calc(100vh-56px)] px-7 py-8">
          {config.custom ? (
            <FreeDiagnosisAdmin />
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

                    {(config.excel || ['members', 'payments', 'settlements', 'dailySettlements', 'refunds'].includes(activeKey)) && (
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

                <div className="mt-4 flex items-center justify-between">
                  <div>
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
                      className="inline-flex h-9 items-center gap-1 bg-[#2348ff] px-4 text-sm font-black text-white"
                    >
                      <Plus size={14} />
                      등록
                    </button>
                  )}
                </div>
              </div>

              <MoneySummary activeKey={activeKey} rows={filteredRows} />

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

