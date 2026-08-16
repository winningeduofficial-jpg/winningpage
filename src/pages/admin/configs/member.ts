import type { FieldOption } from "@/pages/admin/shared/csvExport";
import { MENTOR_APPLICATION_STATUS_OPTIONS } from "@/pages/admin/shared/formFields";

interface MemberColumn {
  key: string;
  label: string;
  type?: "date" | "money" | "maskedPhone";
  options?: FieldOption[];
}

interface MemberField {
  key: string;
  label: string;
  type:
    | "text"
    | "date"
    | "number"
    | "select"
    | "radioBoolean"
    | "checkbox"
    | "textarea";
  required?: boolean;
  options?: FieldOption[];
}

interface MemberCrudConfig {
  title: string;
  table: string;
  searchPlaceholder: string;
  order: string;
  excel?: boolean;
  noCreate?: boolean;
  columns: MemberColumn[];
  fields: MemberField[];
  defaults: Record<string, unknown>;
}

// mentorApplications: custom:true 컴포넌트(MentorApplicationsAdmin)가 목록만 AdminTable로
// 재사용하고 상세/폼은 자체 렌더한다 — fields/defaults가 없는 게 정상 형태다.
interface MemberCustomConfig {
  title: string;
  table: string;
  searchPlaceholder: string;
  order: string;
  readOnly: true;
  custom: true;
  customComponentKey: string;
  columns: MemberColumn[];
}

type MemberConfig = MemberCrudConfig | MemberCustomConfig;

export const memberConfigs: Record<string, MemberConfig> = {
  members: {
    title: "회원 목록",
    table: "profiles",
    searchPlaceholder: "회원명, 아이디, 이메일, 연락처 검색",
    order: "created_at",
    noCreate: true,
    columns: [
      { key: "name", label: "이름" },
      { key: "username", label: "아이디" },
      { key: "email", label: "이메일" },
      { key: "phone", label: "연락처" },
      { key: "member_type", label: "회원유형" },
      { key: "role", label: "권한" },
      { key: "created_at", label: "가입일", type: "date" },
    ],
    fields: [
      { key: "name", label: "이름", type: "text", required: true },
      { key: "username", label: "아이디", type: "text" },
      { key: "email", label: "이메일", type: "text" },
      { key: "phone", label: "연락처", type: "text" },
      { key: "birth_date", label: "생년월일", type: "date" },
      {
        key: "gender",
        label: "성별",
        type: "select",
        options: ["남성", "여성"],
      },
      {
        key: "region",
        label: "거주구분",
        type: "select",
        options: ["관내", "관외"],
      },
      { key: "school_type", label: "학교구분", type: "text" },
      { key: "school_name", label: "학교명", type: "text" },
      // sql/40_auth_signup.sql profiles_member_type_check와 일치 (구 'teacher' → 'mentor')
      {
        key: "member_type",
        label: "회원유형",
        type: "select",
        options: ["student", "parent", "mentor"],
      },
      {
        key: "role",
        label: "권한",
        type: "select",
        options: ["user", "admin"],
      },
      { key: "is_active", label: "사용 여부", type: "radioBoolean" },
      { key: "sms_agreed", label: "SMS수신동의", type: "checkbox" },
      { key: "payment_terminal_id", label: "결제단말기 ID", type: "text" },
      { key: "memo", label: "비고", type: "textarea" },
    ],
    defaults: {},
  },

  enrollments: {
    title: "수강 신청 내역",
    table: "enrollments",
    searchPlaceholder: "수강생, 보호자, 프로그램 검색",
    order: "created_at",
    excel: true,
    columns: [
      { key: "term_name", label: "학기" },
      { key: "category_name", label: "종목" },
      { key: "program_name", label: "프로그램" },
      { key: "class_name", label: "클래스" },
      { key: "guardian_name", label: "보호자" },
      { key: "student_name", label: "수강생" },
      { key: "payment_status", label: "납부상태" },
      { key: "price", label: "수강료", type: "money" },
      { key: "discount_amount", label: "감면액", type: "money" },
      { key: "paid_amount", label: "납부액", type: "money" },
      { key: "created_at", label: "신청일", type: "date" },
    ],
    fields: [
      { key: "term_name", label: "학기", type: "text" },
      { key: "category_name", label: "종목", type: "text" },
      { key: "program_name", label: "프로그램", type: "text" },
      { key: "class_name", label: "클래스", type: "text" },
      { key: "guardian_name", label: "보호자", type: "text" },
      { key: "student_name", label: "수강생", type: "text", required: true },
      { key: "phone", label: "연락처", type: "text" },
      { key: "grade", label: "학년", type: "text" },
      { key: "school_name", label: "학교명", type: "text" },
      {
        key: "payment_status",
        label: "납부상태",
        type: "select",
        options: ["납부대기", "납부완료", "미납", "취소요청", "환불완료"],
      },
      { key: "price", label: "수강료", type: "number" },
      { key: "discount_amount", label: "감면액", type: "number" },
      { key: "paid_amount", label: "납부액", type: "number" },
      { key: "memo", label: "비고", type: "textarea" },
    ],
    defaults: {
      payment_status: "납부대기",
      price: 0,
      discount_amount: 0,
      paid_amount: 0,
    },
  },

  // 멘토(콜멘토) 지원서 조회 — 30여 개 필드 + 동의 5종 + 비공개 버킷 증빙 파일이라
  // columns/fields 기반 제네릭 AdminTable/AdminForm에 그대로 얹기 어렵다(특히 파일 열람은
  // createSignedUrl이 필요해 제네릭 image/file 필드의 getPublicUrl 관용구를 쓸 수 없다).
  // custom: true + customComponentKey로 premiumBookPages와 동일한 패턴을 따르되, 목록만은
  // AdminTable을 재사용한다(파일 하단 MentorApplicationsAdmin 참고). columns는 그 목록에서만
  // 쓰인다 — 상세/상태변경은 컴포넌트 내부 bespoke 렌더링.
  mentorApplications: {
    title: "멘토 신청 내역",
    table: "mentor_applications",
    searchPlaceholder: "이름, 대학교, 휴대폰 검색",
    order: "created_at",
    readOnly: true,
    custom: true,
    customComponentKey: "mentorApplications",
    columns: [
      { key: "created_at", label: "제출일", type: "date" },
      { key: "name", label: "이름" },
      { key: "university", label: "대학교" },
      { key: "major", label: "학과·학부" },
      { key: "phone", label: "휴대폰", type: "maskedPhone" },
      {
        key: "status",
        label: "상태",
        options: MENTOR_APPLICATION_STATUS_OPTIONS,
      },
    ],
  },
};
