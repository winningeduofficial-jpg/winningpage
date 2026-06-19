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
    { key: 'faqs', label: '자주하는질문' }
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
      { key: 'winningDbInputs', label: '위닝DB입력' }
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

  let query = supabase.from(config.table).select('*');

  if (config.fixedCategory) {
    query = query.eq('category', config.fixedCategory);
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
          {mode === 'list' ? (
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
                      <p className="mt-1 text-sm font-bold text-red-500">
                        이 메뉴에서 저장한 내용은 실제 홈페이지에 반영됩니다.
                      </p>
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
