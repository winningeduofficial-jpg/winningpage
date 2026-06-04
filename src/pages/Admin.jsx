import { useEffect, useMemo, useState } from 'react';
import {
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  Download,
  Edit3,
  Eye,
  LogOut,
  Plus,
  RefreshCw,
  Search,
  Trash2,
  Upload
} from 'lucide-react';
import { supabase } from '../lib/supabase';

const PAGE_SIZE = 10;

const ADMIN_GROUPS = [
  {
    label: '전시 관리',
    items: [
      { key: 'popups', label: '팝업 전시관리' },
      { key: 'banners', label: '배너 전시관리' }
    ]
  },
  {
    label: '게시판 관리',
    items: [
      { key: 'notices', label: '공지사항' },
      { key: 'galleries', label: '포토갤러리' },
      { key: 'faqs', label: 'FAQ' }
    ]
  },
  {
    label: '회원 관리',
    items: [
      { key: 'members', label: '회원 관리' },
      { key: 'memberEnrollments', label: '회원 신청 내역' }
    ]
  },
  {
    label: '수강 관리',
    items: [
      { key: 'enrollments', label: '수강 신청 관리' },
      { key: 'programUsage', label: '프로그램 이용 현황' }
    ]
  },
  {
    label: '프로그램 생성 관리',
    items: [
      { key: 'programCategories', label: '프로그램 종목 관리' },
      { key: 'programs', label: '프로그램 관리' },
      { key: 'terms', label: '학기 관리' },
      { key: 'classes', label: '클래스 관리' }
    ]
  },
  {
    label: '수입매출관리',
    items: [
      { key: 'payments', label: '결제 내역' },
      { key: 'unpaid', label: '미납 현황' },
      { key: 'refunds', label: '취소 요청 내역' },
      { key: 'settlements', label: '수입 정산' },
      { key: 'salesStats', label: '매출 통계' }
    ]
  },
  {
    label: '기초 코드 관리',
    items: [
      { key: 'discountReasons', label: '감면 사유 관리' },
      { key: 'cancelReasons', label: '취소 사유 관리' }
    ]
  },
  {
    label: '권한 관리',
    items: [
      { key: 'admins', label: '관리자 관리' }
    ]
  }
];

const CONFIGS = {
  popups: {
    title: '팝업 전시관리',
    table: 'admin_popups',
    searchPlaceholder: '팝업을(를) 검색하세요',
    columns: [
      { key: 'title', label: '제목' },
      { key: 'url', label: 'URL' },
      { key: 'is_active', label: '사용여부', type: 'boolean' },
      { key: 'sort_order', label: '순서' },
      { key: 'start_date', label: '시작일' },
      { key: 'end_date', label: '종료일' }
    ],
    fields: [
      { key: 'is_active', label: '사용', type: 'radioBoolean', required: true },
      { key: 'title', label: '제목', type: 'text', required: true },
      { key: 'url', label: 'URL', type: 'text' },
      { key: 'open_new_window', label: '새창으로열기', type: 'checkbox' },
      { key: 'pc_image_url', label: 'PC 이미지', type: 'imageUrl' },
      { key: 'mobile_image_url', label: '모바일 이미지', type: 'imageUrl' },
      { key: 'start_date', label: '시작일', type: 'date' },
      { key: 'end_date', label: '종료일', type: 'date' },
      { key: 'sort_order', label: '순서', type: 'number' }
    ],
    defaults: { is_active: true, open_new_window: false, sort_order: 1 }
  },
  banners: {
    title: '배너 전시관리',
    table: 'admin_banners',
    searchPlaceholder: '배너를(를) 검색하세요',
    columns: [
      { key: 'pc_image_url', label: 'PC 이미지', type: 'image' },
      { key: 'mobile_image_url', label: '모바일 이미지', type: 'image' },
      { key: 'title', label: '제목' },
      { key: 'url', label: 'URL' },
      { key: 'is_active', label: '사용여부', type: 'boolean' },
      { key: 'sort_order', label: '순서' }
    ],
    fields: [
      { key: 'is_active', label: '사용', type: 'radioBoolean', required: true },
      { key: 'title', label: '제목', type: 'text', required: true },
      { key: 'content', label: '내용', type: 'textarea' },
      { key: 'url', label: 'URL', type: 'text' },
      { key: 'open_new_window', label: '새창으로열기', type: 'checkbox' },
      { key: 'pc_image_url', label: 'PC 이미지 URL', type: 'imageUrl' },
      { key: 'mobile_image_url', label: '모바일 이미지 URL', type: 'imageUrl' },
      { key: 'start_date', label: '시작일', type: 'date' },
      { key: 'end_date', label: '종료일', type: 'date' },
      { key: 'sort_order', label: '순서', type: 'number' }
    ],
    defaults: { is_active: true, open_new_window: false, sort_order: 1 }
  },
  notices: {
    title: '공지사항',
    table: 'admin_notices',
    searchPlaceholder: '공지사항을(를) 검색하세요',
    columns: [
      { key: 'notice_type', label: '번호' },
      { key: 'title', label: '제목' },
      { key: 'is_pinned', label: '상단고정', type: 'boolean' },
      { key: 'created_at', label: '작성일', type: 'dateTime' }
    ],
    fields: [
      { key: 'title', label: '제목', type: 'text', required: true },
      { key: 'is_pinned', label: '최상단 고정', type: 'checkbox' },
      { key: 'content', label: '내용', type: 'textarea', required: true },
      { key: 'file_url', label: '첨부파일 URL', type: 'text' }
    ],
    defaults: { is_pinned: false, notice_type: '공지' }
  },
  galleries: {
    title: '포토갤러리',
    table: 'admin_galleries',
    searchPlaceholder: '포토갤러리를(를) 검색하세요',
    columns: [
      { key: 'image_url', label: '이미지', type: 'image' },
      { key: 'title', label: '제목' },
      { key: 'created_at', label: '작성일', type: 'dateTime' }
    ],
    fields: [
      { key: 'title', label: '제목', type: 'text', required: true },
      { key: 'image_url', label: '이미지 URL', type: 'imageUrl', required: true },
      { key: 'content', label: '내용', type: 'textarea' }
    ],
    defaults: {}
  },
  faqs: {
    title: 'FAQ',
    table: 'admin_faqs',
    searchPlaceholder: 'FAQ를(를) 검색하세요',
    columns: [
      { key: 'question', label: '제목' },
      { key: 'created_at', label: '작성일', type: 'dateTime' }
    ],
    fields: [
      { key: 'question', label: '질문', type: 'text', required: true },
      { key: 'answer', label: '답변', type: 'textarea', required: true }
    ],
    defaults: {}
  },
  members: {
    title: '회원 관리',
    table: 'profiles',
    searchPlaceholder: '아이디, 이름, 휴대폰 번호, 이메일 검색',
    isProfiles: true,
    columns: [
      { key: 'name', label: '이름' },
      { key: 'username', label: '아이디' },
      { key: 'birth_date', label: '생년월일' },
      { key: 'phone', label: '연락처' },
      { key: 'created_at', label: '가입일', type: 'dateTime' },
      { key: 'region', label: '거주구분' },
      { key: 'member_type', label: '회원유형' },
      { key: 'role', label: '권한' }
    ],
    fields: [
      { key: 'name', label: '이름', type: 'text', required: true },
      { key: 'birth_date', label: '생년월일', type: 'date' },
      { key: 'gender', label: '성별', type: 'select', options: ['남성', '여성'] },
      { key: 'phone', label: '휴대전화번호', type: 'text', required: true },
      { key: 'landline', label: '일반전화번호', type: 'text' },
      { key: 'email', label: '이메일', type: 'text' },
      { key: 'username', label: '아이디', type: 'text', required: true },
      { key: 'address', label: '주소', type: 'text' },
      { key: 'address_detail', label: '상세주소', type: 'text' },
      { key: 'sms_agreed', label: 'SMS수신동의', type: 'checkbox' },
      { key: 'region', label: '거주구분', type: 'select', options: ['관내', '관외'] },
      { key: 'member_type', label: '회원유형', type: 'select', options: ['학생', '학부모', '일반', '관리자'] },
      { key: 'school_type', label: '학교구분', type: 'text' },
      { key: 'school_name', label: '학교', type: 'text' },
      { key: 'role', label: '권한', type: 'select', options: ['user', 'admin'] },
      { key: 'memo', label: '비고', type: 'textarea' }
    ],
    defaults: { role: 'user', sms_agreed: false }
  },
  memberEnrollments: {
    title: '회원 신청 내역',
    table: 'admin_enrollments',
    searchPlaceholder: '아이디 또는 이름을 입력하세요',
    columns: [
      { key: 'term_name', label: '학기' },
      { key: 'category_name', label: '종목명' },
      { key: 'program_name', label: '프로그램명' },
      { key: 'class_name', label: '클래스명' },
      { key: 'application_status', label: '신청 상태' },
      { key: 'payment_status', label: '납부 상태' },
      { key: 'created_at', label: '신청일시', type: 'dateTime' }
    ],
    readOnly: true
  },
  enrollments: {
    title: '수강 신청 관리',
    table: 'admin_enrollments',
    searchPlaceholder: '수강 신청을(를) 검색하세요',
    columns: [
      { key: 'term_name', label: '학기' },
      { key: 'category_name', label: '종목' },
      { key: 'program_name', label: '프로그램' },
      { key: 'class_name', label: '클래스' },
      { key: 'capacity', label: '정원' },
      { key: 'applicant_name', label: '신청자' },
      { key: 'application_status', label: '상태' },
      { key: 'payment_status', label: '납부상태' },
      { key: 'created_at', label: '등록일', type: 'dateTime' }
    ],
    fields: [
      { key: 'term_name', label: '학기', type: 'text', required: true },
      { key: 'category_name', label: '종목', type: 'text', required: true },
      { key: 'program_name', label: '프로그램', type: 'text', required: true },
      { key: 'class_name', label: '클래스', type: 'text', required: true },
      { key: 'guardian_name', label: '보호자', type: 'text' },
      { key: 'applicant_name', label: '수강생', type: 'text', required: true },
      { key: 'phone', label: '연락처', type: 'text' },
      { key: 'grade', label: '학년', type: 'text' },
      { key: 'school_name', label: '학교', type: 'text' },
      { key: 'discount_rate', label: '감면대상', type: 'number' },
      { key: 'application_status', label: '신청 상태', type: 'select', options: ['추첨대기', '추첨실패', '신청취소', '수강확정', '개강전취소', '개강후취소'] },
      { key: 'payment_status', label: '납부 상태', type: 'select', options: ['납부대기', '납부완료', '미납', '취소요청', '환불완료'] },
      { key: 'price', label: '수강료', type: 'number' },
      { key: 'discount_amount', label: '감면 금액', type: 'number' },
      { key: 'paid_amount', label: '납부 완료 금액', type: 'number' },
      { key: 'memo', label: '비고', type: 'textarea' }
    ],
    defaults: { application_status: '추첨대기', payment_status: '납부대기', price: 0, discount_amount: 0, paid_amount: 0 }
  },
  programUsage: {
    title: '프로그램 이용 현황',
    table: 'admin_classes',
    searchPlaceholder: '수강 신청을(를) 검색하세요',
    columns: [
      { key: 'term_name', label: '학기' },
      { key: 'category_name', label: '종목' },
      { key: 'program_name', label: '프로그램' },
      { key: 'class_name', label: '클래스' },
      { key: 'capacity', label: '정원' },
      { key: 'registered_count', label: '신청자' },
      { key: 'status', label: '상태' }
    ],
    readOnly: true
  },
  programCategories: {
    title: '프로그램 종목 관리',
    table: 'admin_program_categories',
    searchPlaceholder: '프로그램 종목을(를) 검색하세요',
    columns: [
      { key: 'name', label: '종목명' },
      { key: 'sort_order', label: '순서' },
      { key: 'created_at', label: '등록일', type: 'dateTime' }
    ],
    fields: [
      { key: 'name', label: '종목명', type: 'text', required: true },
      { key: 'sort_order', label: '순서', type: 'number' }
    ],
    defaults: { sort_order: 1 }
  },
  programs: {
    title: '프로그램 관리',
    table: 'admin_programs',
    searchPlaceholder: '프로그램을(를) 검색하세요',
    columns: [
      { key: 'category_name', label: '종목명' },
      { key: 'name', label: '프로그램명' },
      { key: 'created_at', label: '등록일', type: 'dateTime' }
    ],
    fields: [
      { key: 'category_name', label: '종목명', type: 'text', required: true },
      { key: 'name', label: '프로그램명', type: 'text', required: true }
    ],
    defaults: {}
  },
  terms: {
    title: '학기 관리',
    table: 'admin_terms',
    searchPlaceholder: '학기를(를) 검색하세요',
    columns: [
      { key: 'year', label: '연도' },
      { key: 'name', label: '학기명' },
      { key: 'created_at', label: '등록일', type: 'dateTime' }
    ],
    fields: [
      { key: 'year', label: '연도', type: 'number', required: true },
      { key: 'name', label: '학기명', type: 'text', required: true }
    ],
    defaults: { year: new Date().getFullYear() }
  },
  classes: {
    title: '클래스 관리',
    table: 'admin_classes',
    searchPlaceholder: '클래스를(를) 검색하세요',
    columns: [
      { key: 'term_name', label: '학기' },
      { key: 'category_name', label: '종목명' },
      { key: 'program_name', label: '프로그램명' },
      { key: 'class_name', label: '클래스 명' },
      { key: 'price', label: '수강료', type: 'money' },
      { key: 'weekday', label: '요일' },
      { key: 'target', label: '대상' },
      { key: 'capacity', label: '정원' },
      { key: 'is_active', label: '사용여부', type: 'boolean' }
    ],
    fields: [
      { key: 'is_active', label: '사용여부', type: 'radioBoolean', required: true },
      { key: 'category_name', label: '종목명', type: 'text', required: true },
      { key: 'program_name', label: '프로그램명', type: 'text', required: true },
      { key: 'class_name', label: '클래스명', type: 'text', required: true },
      { key: 'weekday', label: '요일', type: 'select', options: ['월', '화', '수', '목', '금', '토', '일'] },
      { key: 'start_time', label: '시작시간', type: 'text' },
      { key: 'end_time', label: '종료시간', type: 'text' },
      { key: 'price', label: '수강료', type: 'number' },
      { key: 'capacity', label: '정원', type: 'number' },
      { key: 'target', label: '대상연령', type: 'text' },
      { key: 'description', label: '클래스 소개', type: 'textarea' },
      { key: 'material', label: '준비물', type: 'text' },
      { key: 'textbook', label: '교재', type: 'text' },
      { key: 'classroom', label: '강의실', type: 'text' },
      { key: 'teacher', label: '강사', type: 'text' },
      { key: 'thumbnail_url', label: '썸네일 URL', type: 'imageUrl' },
      { key: 'term_name', label: '수강신청 학기', type: 'text', required: true },
      { key: 'start_date', label: '수강기간 시작', type: 'date' },
      { key: 'end_date', label: '수강기간 종료', type: 'date' },
      { key: 'apply_start_at', label: '접수 시작', type: 'text' },
      { key: 'apply_end_at', label: '접수 종료', type: 'text' },
      { key: 'payment_start_at', label: '결제 시작', type: 'text' },
      { key: 'payment_end_at', label: '결제 종료', type: 'text' },
      { key: 'status', label: '상태', type: 'select', options: ['모집 전', '모집 중', '납부 중', '납부 마감', '운영중', '종료'] }
    ],
    defaults: { is_active: true, price: 0, capacity: 1, status: '모집 전' }
  },
  payments: {
    title: '결제 내역',
    table: 'admin_payments',
    searchPlaceholder: '수강자 이름 또는 아이디 검색',
    columns: [
      { key: 'payer_name', label: '수강자명' },
      { key: 'category_name', label: '종목' },
      { key: 'program_name', label: '프로그램' },
      { key: 'class_name', label: '클래스' },
      { key: 'payment_method', label: '납부 유형' },
      { key: 'sale_amount', label: '판매 금액', type: 'money' },
      { key: 'discount_amount', label: '감면액', type: 'money' },
      { key: 'paid_amount', label: '납부 금액', type: 'money' },
      { key: 'status', label: '상태' },
      { key: 'paid_at', label: '납부 일시', type: 'dateTime' }
    ],
    readOnly: true,
    excel: true
  },
  unpaid: {
    title: '미납 현황',
    table: 'admin_enrollments',
    searchPlaceholder: '미납 회원 검색',
    columns: [
      { key: 'applicant_name', label: '수강자명(ID)' },
      { key: 'category_name', label: '종목' },
      { key: 'program_name', label: '프로그램' },
      { key: 'class_name', label: '클래스' },
      { key: 'price', label: '판매 금액', type: 'money' },
      { key: 'discount_amount', label: '감면액', type: 'money' },
      { key: 'unpaid_amount', label: '미납 금액', type: 'money' }
    ],
    readOnly: true,
    excel: true
  },
  refunds: {
    title: '취소 요청 내역',
    table: 'admin_refunds',
    searchPlaceholder: '취소 요청을 검색하세요',
    columns: [
      { key: 'transaction_no', label: '거래번호' },
      { key: 'payer_name', label: '수강자명' },
      { key: 'category_name', label: '종목' },
      { key: 'program_name', label: '프로그램' },
      { key: 'class_name', label: '클래스' },
      { key: 'paid_amount', label: '납부 금액', type: 'money' },
      { key: 'status', label: '상태' },
      { key: 'requested_at', label: '취소 요청 일시', type: 'dateTime' }
    ],
    readOnly: true,
    excel: true
  },
  settlements: {
    title: '수입 정산',
    table: 'admin_payments',
    searchPlaceholder: '정산 내역 검색',
    columns: [
      { key: 'payer_name', label: '수강자명' },
      { key: 'category_name', label: '종목' },
      { key: 'program_name', label: '프로그램' },
      { key: 'class_name', label: '클래스' },
      { key: 'sale_amount', label: '판매 금액', type: 'money' },
      { key: 'discount_amount', label: '감면액', type: 'money' },
      { key: 'paid_amount', label: '실 납부 금액', type: 'money' }
    ],
    readOnly: true,
    excel: true
  },
  salesStats: {
    title: '매출 통계',
    table: 'admin_payments',
    searchPlaceholder: '매출 검색',
    columns: [
      { key: 'category_name', label: '종목' },
      { key: 'program_name', label: '프로그램' },
      { key: 'class_name', label: '클래스' },
      { key: 'sale_amount', label: '판매 금액', type: 'money' },
      { key: 'discount_amount', label: '감면액', type: 'money' },
      { key: 'paid_amount', label: '실 납부 금액', type: 'money' },
      { key: 'paid_at', label: '결제일', type: 'dateTime' }
    ],
    readOnly: true,
    excel: true
  },
  discountReasons: {
    title: '감면 사유 관리',
    table: 'admin_discount_reasons',
    searchPlaceholder: '감면 사유를 검색하세요',
    columns: [
      { key: 'reason', label: '사유' },
      { key: 'target', label: '적용 대상' },
      { key: 'service_id', label: '행정망 서비스ID' },
      { key: 'discount_rate', label: '감면율' }
    ],
    fields: [
      { key: 'reason', label: '사유', type: 'text', required: true },
      { key: 'target', label: '적용 대상', type: 'select', options: ['본인에게만 적용', '자녀에게도 적용'] },
      { key: 'service_id', label: '행정망 서비스ID', type: 'text' },
      { key: 'discount_rate', label: '감면율', type: 'number' }
    ],
    defaults: { target: '본인에게만 적용', discount_rate: 0 }
  },
  cancelReasons: {
    title: '취소 사유 관리',
    table: 'admin_cancel_reasons',
    searchPlaceholder: '취소 사유를 검색하세요',
    columns: [
      { key: 'reason', label: '사유' },
      { key: 'created_at', label: '등록일', type: 'dateTime' }
    ],
    fields: [
      { key: 'reason', label: '사유', type: 'text', required: true }
    ],
    defaults: {}
  },
  admins: {
    title: '관리자 관리',
    table: 'profiles',
    searchPlaceholder: '관리자명 또는 아이디를 검색',
    isProfiles: true,
    filterAdmin: true,
    columns: [
      { key: 'name', label: '관리자명' },
      { key: 'username', label: '아이디' },
      { key: 'is_active', label: '사용여부' },
      { key: 'payment_terminal_id', label: '결제단말기 ID' },
      { key: 'created_at', label: '등록일', type: 'dateTime' }
    ],
    fields: [
      { key: 'name', label: '관리자명', type: 'text', required: true },
      { key: 'username', label: '아이디', type: 'text', required: true },
      { key: 'password_note', label: '비밀번호', type: 'password' },
      { key: 'is_active', label: '사용여부', type: 'radioUse', required: true },
      { key: 'payment_terminal_id', label: '결제단말기 ID', type: 'text' }
    ],
    defaults: { role: 'admin', is_active: true }
  }
};

function formatValue(value, type) {
  if (value === null || value === undefined || value === '') return '-';

  if (type === 'boolean') return value ? '사용' : '미사용';

  if (type === 'money') {
    const number = Number(value || 0);
    return `${number.toLocaleString()}원`;
  }

  if (type === 'dateTime') {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return String(value);
    return date.toLocaleString('ko-KR', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit'
    });
  }

  if (type === 'date') {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return String(value);
    return date.toISOString().slice(0, 10);
  }

  return String(value);
}

function getSearchableText(row) {
  return Object.values(row || {})
    .map((value) => String(value ?? ''))
    .join(' ')
    .toLowerCase();
}

function csvEscape(value) {
  const text = String(value ?? '');
  return `"${text.replace(/"/g, '""')}"`;
}

function downloadCsv(filename, rows, columns) {
  const header = columns.map((column) => csvEscape(column.label)).join(',');
  const body = rows
    .map((row) => columns.map((column) => csvEscape(formatValue(row[column.key], column.type))).join(','))
    .join('\n');

  const csv = `\ufeff${header}\n${body}`;
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');

  link.href = url;
  link.download = filename;
  link.click();

  URL.revokeObjectURL(url);
}

function buildEmptyForm(config) {
  return { ...(config.defaults || {}) };
}

function AdminSidebar({ activeKey, onChange }) {
  const [openGroups, setOpenGroups] = useState(() => new Set(ADMIN_GROUPS.map((group) => group.label)));

  function toggleGroup(label) {
    setOpenGroups((prev) => {
      const next = new Set(prev);
      if (next.has(label)) next.delete(label);
      else next.add(label);
      return next;
    });
  }

  return (
    <aside className="fixed left-0 top-0 z-40 h-screen w-[224px] overflow-y-auto bg-[#101214] text-white shadow-[8px_0_28px_rgba(0,0,0,0.16)]">
      <div className="border-b border-white/10 px-5 py-5 text-2xl font-black tracking-tight">
        관리자
      </div>

      <nav className="px-4 py-5">
        {ADMIN_GROUPS.map((group) => {
          const isOpen = openGroups.has(group.label);

          return (
            <div key={group.label} className="mb-4">
              <button
                type="button"
                onClick={() => toggleGroup(group.label)}
                className="flex w-full items-center justify-between py-2 text-left text-[15px] font-black text-white"
              >
                <span>{group.label}</span>
                <ChevronDown
                  size={16}
                  className={`transition ${isOpen ? 'rotate-0' : '-rotate-90'}`}
                />
              </button>

              {isOpen && (
                <div className="mt-2 space-y-1">
                  {group.items.map((item) => (
                    <button
                      key={item.key}
                      type="button"
                      onClick={() => onChange(item.key)}
                      className={`block w-full rounded-md px-4 py-2 text-left text-[13px] font-bold transition ${
                        activeKey === item.key
                          ? 'bg-white/10 text-white before:mr-2 before:text-[#ff2e4d] before:content-["•"]'
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
    <header className="fixed left-[224px] right-0 top-0 z-30 flex h-[56px] items-center justify-between border-b border-black/10 bg-white px-7 shadow-[0_4px_16px_rgba(0,0,0,0.08)]">
      <p className="text-[15px] font-bold text-[#3a3f45]">
        안녕하세요, <strong>관리자님.</strong>
      </p>

      <button
        type="button"
        onClick={onLogout}
        className="text-xs font-bold text-[#8b9098] transition hover:text-[#111827]"
      >
        로그아웃
      </button>
    </header>
  );
}

function Toolbar({ config, keyword, setKeyword, onRefresh, onCreate, onDownload }) {
  return (
    <div className="mb-6 rounded-sm bg-white px-6 py-5 shadow-[0_8px_24px_rgba(15,23,42,0.04)]">
      <div className="flex items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={onRefresh}
            className="inline-flex h-9 items-center gap-2 border border-[#6b7280] bg-white px-4 text-sm font-bold text-[#111827]"
          >
            <RefreshCw size={14} />
            초기화
          </button>

          {config.excel && (
            <button
              type="button"
              onClick={onDownload}
              className="inline-flex h-9 items-center gap-2 border border-[#6b7280] bg-white px-4 text-sm font-bold text-[#111827]"
            >
              <Download size={14} />
              엑셀 다운로드
            </button>
          )}
        </div>

        <div className="flex items-center">
          <input
            value={keyword}
            onChange={(event) => setKeyword(event.target.value)}
            placeholder={config.searchPlaceholder || '검색어를 입력하세요'}
            className="h-9 w-[280px] border border-[#9ca3af] px-3 text-sm outline-none"
          />
          <button
            type="button"
            className="inline-flex h-9 items-center gap-1 border border-l-0 border-[#6b7280] bg-white px-4 text-sm font-bold text-[#111827]"
          >
            <Search size={14} />
            검색
          </button>
        </div>
      </div>

      {!config.readOnly && (
        <div className="mt-4 flex justify-end">
          <button
            type="button"
            onClick={onCreate}
            className="inline-flex h-9 items-center gap-1 bg-[#2348ff] px-4 text-sm font-black text-white shadow-[0_8px_16px_rgba(35,72,255,0.24)]"
          >
            <Plus size={14} />
            등록
          </button>
        </div>
      )}
    </div>
  );
}

function DataTable({ config, rows, total, page, setPage, onEdit, onDelete }) {
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="rounded-sm bg-white p-6 shadow-[0_10px_30px_rgba(15,23,42,0.05)]">
      <div className="mb-4 text-sm font-bold text-[#6b7280]">
        전체 <span className="text-[#2348ff]">{total}</span>건
      </div>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[980px] border-collapse text-sm">
          <thead>
            <tr className="border-y border-[#d7dce3] text-[#111827]">
              <th className="w-10 px-2 py-3 text-center">
                <input type="checkbox" className="h-4 w-4" />
              </th>
              <th className="w-16 px-3 py-3 text-left font-black">번호</th>
              {config.columns.map((column) => (
                <th key={column.key} className="px-3 py-3 text-left font-black">
                  {column.label}
                </th>
              ))}
              <th className="w-24 px-3 py-3 text-center font-black">관리</th>
            </tr>
          </thead>

          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={config.columns.length + 3} className="py-12 text-center text-[#9ca3af]">
                  등록된 데이터가 없습니다.
                </td>
              </tr>
            ) : (
              rows.map((row, index) => (
                <tr key={row.id || index} className="border-b border-[#edf0f4] text-[#4b5563]">
                  <td className="px-2 py-3 text-center">
                    <input type="checkbox" className="h-4 w-4" />
                  </td>
                  <td className="px-3 py-3">{total - ((page - 1) * PAGE_SIZE + index)}</td>

                  {config.columns.map((column) => (
                    <td key={column.key} className="px-3 py-3">
                      {column.type === 'image' ? (
                        row[column.key] ? (
                          <img
                            src={row[column.key]}
                            alt=""
                            className="h-12 w-12 rounded object-cover"
                          />
                        ) : (
                          '-'
                        )
                      ) : (
                        formatValue(row[column.key], column.type)
                      )}
                    </td>
                  ))}

                  <td className="px-3 py-3">
                    <div className="flex items-center justify-center gap-3">
                      {config.readOnly ? (
                        <button
                          type="button"
                          onClick={() => onEdit(row)}
                          className="text-[#5f6b7a] hover:text-[#111827]"
                          title="상세"
                        >
                          <Eye size={17} />
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={() => onEdit(row)}
                          className="text-[#5f6b7a] hover:text-[#111827]"
                          title="수정"
                        >
                          <Edit3 size={17} />
                        </button>
                      )}

                      {!config.readOnly && (
                        <button
                          type="button"
                          onClick={() => onDelete(row)}
                          className="text-[#5f6b7a] hover:text-red-600"
                          title="삭제"
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

      <div className="mt-5 flex items-center justify-center">
        <div className="inline-flex overflow-hidden border border-[#d7dce3]">
          <button
            type="button"
            onClick={() => setPage(1)}
            className="h-9 w-10 border-r border-[#d7dce3] text-[#6b7280]"
          >
            <ChevronsLeft size={15} className="mx-auto" />
          </button>
          <button
            type="button"
            onClick={() => setPage((prev) => Math.max(1, prev - 1))}
            className="h-9 w-10 border-r border-[#d7dce3] text-[#6b7280]"
          >
            <ChevronLeft size={15} className="mx-auto" />
          </button>

          {Array.from({ length: Math.min(10, totalPages) }, (_, idx) => idx + 1).map((number) => (
            <button
              key={number}
              type="button"
              onClick={() => setPage(number)}
              className={`h-9 w-10 border-r border-[#d7dce3] text-sm font-bold ${
                page === number ? 'bg-[#59616b] text-white' : 'bg-white text-[#4b5563]'
              }`}
            >
              {number}
            </button>
          ))}

          <button
            type="button"
            onClick={() => setPage((prev) => Math.min(totalPages, prev + 1))}
            className="h-9 w-10 border-r border-[#d7dce3] text-[#6b7280]"
          >
            <ChevronRight size={15} className="mx-auto" />
          </button>
          <button
            type="button"
            onClick={() => setPage(totalPages)}
            className="h-9 w-10 text-[#6b7280]"
          >
            <ChevronsRight size={15} className="mx-auto" />
          </button>
        </div>
      </div>
    </div>
  );
}

function FormField({ field, value, onChange, disabled }) {
  const commonClass = 'h-9 w-full border border-[#9ca3af] bg-white px-3 text-sm outline-none disabled:bg-[#f3f4f6]';

  if (field.type === 'textarea') {
    return (
      <textarea
        value={value || ''}
        onChange={(event) => onChange(field.key, event.target.value)}
        disabled={disabled}
        rows={5}
        placeholder={`${field.label}을(를) 입력해주세요.`}
        className="w-full border border-[#9ca3af] bg-white px-3 py-2 text-sm outline-none disabled:bg-[#f3f4f6]"
      />
    );
  }

  if (field.type === 'select') {
    return (
      <select
        value={value || ''}
        onChange={(event) => onChange(field.key, event.target.value)}
        disabled={disabled}
        className={commonClass}
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
      <label className="inline-flex items-center gap-2 text-sm font-bold text-[#374151]">
        <input
          type="checkbox"
          checked={!!value}
          onChange={(event) => onChange(field.key, event.target.checked)}
          disabled={disabled}
          className="h-4 w-4"
        />
        {field.label}
      </label>
    );
  }

  if (field.type === 'radioBoolean') {
    return (
      <div className="flex items-center gap-5">
        <label className="inline-flex items-center gap-2 text-sm font-bold text-[#374151]">
          <input
            type="radio"
            checked={value === true || value === 'true'}
            onChange={() => onChange(field.key, true)}
            disabled={disabled}
          />
          사용
        </label>
        <label className="inline-flex items-center gap-2 text-sm font-bold text-[#374151]">
          <input
            type="radio"
            checked={value === false || value === 'false'}
            onChange={() => onChange(field.key, false)}
            disabled={disabled}
          />
          미사용
        </label>
      </div>
    );
  }

  if (field.type === 'radioUse') {
    return (
      <div className="flex items-center gap-5">
        <label className="inline-flex items-center gap-2 text-sm font-bold text-[#374151]">
          <input
            type="radio"
            checked={value === true || value === 'true'}
            onChange={() => onChange(field.key, true)}
            disabled={disabled}
          />
          사용
        </label>
        <label className="inline-flex items-center gap-2 text-sm font-bold text-[#374151]">
          <input
            type="radio"
            checked={value === false || value === 'false'}
            onChange={() => onChange(field.key, false)}
            disabled={disabled}
          />
          미사용
        </label>
      </div>
    );
  }

  if (field.type === 'imageUrl') {
    return (
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <input
            value={value || ''}
            onChange={(event) => onChange(field.key, event.target.value)}
            disabled={disabled}
            placeholder="이미지 URL을 입력하거나, Supabase Storage 업로드 후 URL을 넣어주세요."
            className={commonClass}
          />
          <span className="inline-flex h-9 items-center gap-1 border border-[#9ca3af] px-3 text-xs font-bold text-[#6b7280]">
            <Upload size={13} />
            URL
          </span>
        </div>
        {value && (
          <img src={value} alt="" className="h-20 w-20 rounded border border-[#e5e7eb] object-cover" />
        )}
      </div>
    );
  }

  return (
    <input
      type={field.type === 'password' ? 'password' : field.type === 'number' ? 'number' : field.type === 'date' ? 'date' : 'text'}
      value={value ?? ''}
      onChange={(event) => {
        const nextValue = field.type === 'number'
          ? Number(event.target.value || 0)
          : event.target.value;

        onChange(field.key, nextValue);
      }}
      disabled={disabled}
      placeholder={`${field.label}을(를) 입력해주세요.`}
      className={commonClass}
    />
  );
}

function EditorForm({ config, mode, row, onCancel, onSubmit }) {
  const [form, setForm] = useState(() => {
    if (row) return { ...row };
    return buildEmptyForm(config);
  });
  const disabled = config.readOnly;

  function handleChange(key, value) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function handleSubmit(event) {
    event.preventDefault();

    if (disabled) {
      onCancel();
      return;
    }

    for (const field of config.fields || []) {
      if (field.required && !String(form[field.key] ?? '').trim()) {
        alert(`${field.label} 항목을 입력해주세요.`);
        return;
      }
    }

    onSubmit(form);
  }

  return (
    <form onSubmit={handleSubmit}>
      <h1 className="mb-5 text-2xl font-black text-[#111827]">
        {config.title} {mode === 'create' ? '등록' : config.readOnly ? '상세' : '수정'}
      </h1>

      <div className="rounded-sm bg-white shadow-[0_10px_30px_rgba(15,23,42,0.05)]">
        {(config.fields || config.columns).map((field) => (
          <div key={field.key} className="grid grid-cols-[220px_1fr] border-b border-[#edf0f4]">
            <div className="bg-[#fafafa] px-5 py-3 text-sm font-black text-[#111827]">
              {field.label}
              {field.required && <span className="ml-1 text-red-500">*</span>}
            </div>

            <div className="px-5 py-3">
              {config.readOnly ? (
                field.type === 'image' && form[field.key] ? (
                  <img src={form[field.key]} alt="" className="h-20 w-20 rounded object-cover" />
                ) : (
                  <div className="min-h-9 py-2 text-sm text-[#4b5563]">
                    {formatValue(form[field.key], field.type)}
                  </div>
                )
              ) : (
                <FormField
                  field={field}
                  value={form[field.key]}
                  onChange={handleChange}
                  disabled={disabled}
                />
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
        {!disabled && (
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

function SummaryPanel({ activeKey, rows }) {
  const isPayment = ['payments', 'unpaid', 'refunds', 'settlements', 'salesStats'].includes(activeKey);
  const isEnrollment = ['enrollments', 'programUsage'].includes(activeKey);

  if (!isPayment && !isEnrollment) return null;

  const count = rows.length;
  const saleTotal = rows.reduce((sum, row) => sum + Number(row.sale_amount || row.price || 0), 0);
  const discountTotal = rows.reduce((sum, row) => sum + Number(row.discount_amount || 0), 0);
  const paidTotal = rows.reduce((sum, row) => sum + Number(row.paid_amount || 0), 0);
  const unpaidTotal = rows.reduce((sum, row) => {
    const calculated = Number(row.unpaid_amount ?? (Number(row.price || row.sale_amount || 0) - Number(row.discount_amount || 0) - Number(row.paid_amount || 0)));
    return sum + Math.max(0, calculated);
  }, 0);

  if (isEnrollment) {
    const capacity = rows.reduce((sum, row) => sum + Number(row.capacity || 0), 0);
    const confirmed = rows.filter((row) => row.application_status === '수강확정').length;
    const cancelled = rows.filter((row) => String(row.application_status || '').includes('취소')).length;
    const unpaidCount = rows.filter((row) => row.payment_status !== '납부완료').length;

    return (
      <div className="mb-6 grid grid-cols-6 rounded-sm bg-white text-center text-sm shadow-[0_8px_24px_rgba(15,23,42,0.04)]">
        {[
          ['정원', capacity],
          ['총 신청자', count],
          ['수강확정자', confirmed],
          ['취소', cancelled],
          ['미납', unpaidCount],
          ['미납금액', `${unpaidTotal.toLocaleString()}원`]
        ].map(([label, value]) => (
          <div key={label} className="border border-[#edf0f4] px-4 py-4">
            <div className="font-black text-[#111827]">{label}</div>
            <div className="mt-2 font-bold text-[#4b5563]">{value}</div>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="mb-6 grid grid-cols-5 rounded-sm bg-white text-center text-sm shadow-[0_8px_24px_rgba(15,23,42,0.04)]">
      {[
        ['납부 건수', count],
        ['판매 금액 합계', `${saleTotal.toLocaleString()}원`],
        ['감면액 합계', `${discountTotal.toLocaleString()}원`],
        ['실 납부 금액 합계', `${paidTotal.toLocaleString()}원`],
        ['미납 금액 합계', `${unpaidTotal.toLocaleString()}원`]
      ].map(([label, value], index) => (
        <div key={label} className="border border-[#edf0f4] px-4 py-4">
          <div className="font-black text-[#111827]">{label}</div>
          <div className={`mt-2 font-bold ${index >= 3 ? 'text-red-500' : 'text-[#4b5563]'}`}>
            {value}
          </div>
        </div>
      ))}
    </div>
  );
}

export default function Admin() {
  const [activeKey, setActiveKey] = useState('members');
  const [mode, setMode] = useState('list');
  const [editingRow, setEditingRow] = useState(null);
  const [keyword, setKeyword] = useState('');
  const [rawRows, setRawRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(1);

  const config = CONFIGS[activeKey];

  const filteredRows = useMemo(() => {
    let rows = rawRows;

    if (config.filterAdmin) {
      rows = rows.filter((row) => row.role === 'admin');
    }

    if (activeKey === 'unpaid') {
      rows = rows
        .map((row) => ({
          ...row,
          unpaid_amount: Number(row.unpaid_amount ?? (Number(row.price || 0) - Number(row.discount_amount || 0) - Number(row.paid_amount || 0)))
        }))
        .filter((row) => Number(row.unpaid_amount || 0) > 0 || row.payment_status !== '납부완료');
    }

    const normalizedKeyword = keyword.trim().toLowerCase();

    if (!normalizedKeyword) return rows;

    return rows.filter((row) => getSearchableText(row).includes(normalizedKeyword));
  }, [rawRows, keyword, config.filterAdmin, activeKey]);

  const pagedRows = useMemo(() => {
    const start = (page - 1) * PAGE_SIZE;
    return filteredRows.slice(start, start + PAGE_SIZE);
  }, [filteredRows, page]);

  async function loadRows() {
    setLoading(true);

    try {
      let query = supabase.from(config.table).select('*');

      if (config.filterAdmin) {
        query = query.eq('role', 'admin');
      }

      query = query.order('created_at', { ascending: false });

      const { data, error } = await query;

      if (error) {
        console.error(`${config.table} 조회 오류:`, error);
        setRawRows([]);
        return;
      }

      setRawRows(data || []);
    } catch (error) {
      console.error('관리자 데이터 조회 오류:', error);
      setRawRows([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    setKeyword('');
    setPage(1);
    setMode('list');
    setEditingRow(null);
  }, [activeKey]);

  useEffect(() => {
    loadRows();
  }, [activeKey]);

  async function handleLogout() {
    await supabase.auth.signOut();
    window.location.replace('/');
  }

  function handleRefresh() {
    setKeyword('');
    setPage(1);
    loadRows();
  }

  function handleCreate() {
    setEditingRow(null);
    setMode('create');
  }

  function handleEdit(row) {
    setEditingRow(row);
    setMode('edit');
  }

  async function handleDelete(row) {
    if (!row?.id) return;

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

  async function handleSubmit(form) {
    const payload = { ...form };
    delete payload.created_at;

    if (config.filterAdmin) {
      payload.role = 'admin';
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
        .update({ ...payload, updated_at: new Date().toISOString() })
        .eq('id', editingRow.id);

      if (error) {
        alert(`수정 실패: ${error.message}`);
        return;
      }
    }

    setMode('list');
    setEditingRow(null);
    await loadRows();
  }

  function handleDownload() {
    downloadCsv(`${config.title}_${new Date().toISOString().slice(0, 10)}.csv`, filteredRows, config.columns);
  }

  return (
    <div className="min-h-screen bg-[#f4f4f4] text-[#111827]">
      <AdminSidebar activeKey={activeKey} onChange={setActiveKey} />
      <AdminTopbar onLogout={handleLogout} />

      <main className="ml-[224px] pt-[56px]">
        <div className="min-h-[calc(100vh-56px)] px-7 py-8">
          {mode === 'list' ? (
            <>
              <Toolbar
                config={config}
                keyword={keyword}
                setKeyword={setKeyword}
                onRefresh={handleRefresh}
                onCreate={handleCreate}
                onDownload={handleDownload}
              />

              <SummaryPanel activeKey={activeKey} rows={filteredRows} />

              {loading ? (
                <div className="rounded-sm bg-white p-12 text-center text-sm font-bold text-[#6b7280]">
                  데이터를 불러오는 중입니다.
                </div>
              ) : (
                <DataTable
                  config={config}
                  rows={pagedRows}
                  total={filteredRows.length}
                  page={page}
                  setPage={setPage}
                  onEdit={handleEdit}
                  onDelete={handleDelete}
                />
              )}
            </>
          ) : (
            <EditorForm
              config={config}
              mode={mode}
              row={editingRow}
              onCancel={() => {
                setMode('list');
                setEditingRow(null);
              }}
              onSubmit={handleSubmit}
            />
          )}
        </div>
      </main>
    </div>
  );
}
