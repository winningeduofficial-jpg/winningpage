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
  placeholder?: string;
}

interface MemberCrudConfig {
  title: string;
  table: string;
  searchPlaceholder: string;
  order: string;
  excel?: boolean;
  // 목록만 조인 뷰에서 읽는다(AdminConfig.listTable 과 같은 뜻) — QA 272.
  listTable?: string;
  listOnlyColumns?: string[];
  // 목록 상단 드롭다운 필터(AdminConfig.listFilter 와 같은 뜻) — QA 227.
  listFilter?: { key: string; allLabel: string };
  // 목록 툴바 「초기화」 버튼 숨김(AdminConfig.hideReset 과 같은 뜻) — QA 272.
  hideReset?: boolean;
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
  // 회원 목록 + 고객 상세 — QA 182 의 「고객조회상담」 메인메뉴를 별도로 만들지
  // 않고 이 화면에 통합한다(사용자 확정 2026-08-22). 상세는 탭 6개(고객상세정보/
  // 이용서비스/결제내역/상담/알림톡·문자/서비스이용내역)이고, profiles 한 테이블이
  // 아니라 parent_child_links·program_access·orders 를 함께 읽으며 개인정보 마스킹
  // 토글이 필요해 제네릭 AdminForm 으로는 표현할 수 없다. mentorApplications 와 같은
  // 방식으로 목록만 AdminTable 을 재사용한다(src/components/admin/MembersAdmin.tsx).
  //
  // ⚠️ 이 전환으로 **제네릭 편집 폼이 사라진다.** 이전에는 이 탭에서 회원 정보를
  //    자유 편집할 수 있었는데, 와이어프레임의 고객 상세는 조회 화면이라 편집
  //    수단을 두지 않았다. 회원 정보 수정이 실제로 필요하면 어떤 필드를 누가 고칠
  //    수 있는지부터 정하고 다시 붙인다(권한 체계와 함께 가는 게 맞다).
  //
  // columns 는 목록에서만 쓰인다 — 와이어프레임 목록의
  // "번호 | 회원명 | 가입 유형 | 이메일 | 전화번호 | 가입일 | 더보기" 순서를 따른다.
  // 전화번호에 maskedPhone 을 쓰는 이유는 목록이 한 화면에 수십 명을 늘어놓기
  // 때문이다 — 상세에서만 마스킹 해제 버튼으로 원본을 본다.
  members: {
    title: "회원 목록",
    table: "profiles",
    searchPlaceholder: "회원명, 아이디, 이메일, 연락처 검색",
    order: "created_at",
    readOnly: true,
    custom: true,
    customComponentKey: "members",
    columns: [
      { key: "name", label: "회원명" },
      { key: "member_type", label: "가입 유형" },
      { key: "email", label: "이메일" },
      { key: "phone", label: "전화번호", type: "maskedPhone" },
      // 회원구분 — dev 에서 QA 186 으로 추가된 관리자 전용 컬럼(20260822000011).
      // 회원은 못 보고 관리자만 본다. 값은 고정 목록이 아니라 자유 텍스트다
      // (일반회원 / OO학교 / OO기관 / OO캠퍼스 / OO기업 / 기타).
      //
      // ⚠️ 이 config 가 custom 으로 바뀌면서 제네릭 편집 폼이 사라졌다. 그래서
      //    회원구분 **편집**은 MembersAdmin 상세의 「고객 상세 정보」 탭이 맡는다
      //    (src/components/admin/MembersAdmin.tsx) — 목록에서 값만 보이고 고칠
      //    데가 없으면 QA 186 요구가 반쪽이 된다.
      { key: "member_category", label: "회원구분" },
      // QA G4 — 생년월일/소속코드/학교명/지역/이용서비스 5열 추가(2026-08-27).
      // service_labels 는 profiles 테이블 컬럼이 아니라 MembersAdmin.loadRows()가
      // program_access 를 별도로 묶어 각 행에 얹어주는 파생 필드다(active 상태만,
      // 콤마 조인). 값이 없으면 formatValue가 "-"로 채운다.
      { key: "birth_date", label: "생년월일", type: "date" },
      { key: "org_code", label: "소속코드" },
      { key: "school_name", label: "학교명" },
      { key: "region", label: "지역" },
      { key: "service_labels", label: "이용서비스" },
      { key: "created_at", label: "가입일", type: "date" },
    ],
  },

  enrollments: {
    title: "수강 신청 내역",
    table: "enrollments",
    // 목록은 결제방식·승인번호가 붙은 조인 뷰에서 읽는다(20260831053500). 등록·수정은
    // 그대로 enrollments 로 간다 — 조인 뷰는 쓰기가 안 된다.
    listTable: "admin_enrollment_entries",
    // 뷰가 덧붙인 파생 컬럼. 저장 때 걷어내지 않으면 enrollments 에 없는 컬럼이라
    // 42703 이 난다.
    listOnlyColumns: ["payment_method", "approval_no", "order_paid_at"],
    // QA 227 — 상단 서비스 선택 필터. 종목(category_name)이 곧 서비스 구분이고,
    // 선택지는 실제 등록된 값에서 뽑으므로 종목이 늘어도 여기를 고칠 필요가 없다.
    listFilter: { key: "category_name", allLabel: "전체 서비스" },
    searchPlaceholder: "수강생, 보호자, 프로그램 검색",
    order: "created_at",
    excel: true,
    // QA 272 — 좌측 상단 「초기화」 버튼 삭제 요청. 재조회 버튼인데 "입력한 검색
    // 조건을 지우는 버튼"으로 읽혀 오조작을 부른다는 지적이었다.
    hideReset: true,
    columns: [
      { key: "term_name", label: "학기" },
      { key: "category_name", label: "종목" },
      { key: "program_name", label: "프로그램" },
      { key: "class_name", label: "클래스" },
      { key: "guardian_name", label: "보호자" },
      { key: "student_name", label: "수강생" },
      // QA 272 — 목록에서 바로 연락이 되게 전화번호를 노출한다. 값은 이미 있고
      // 편집 폼(fields)에도 있었는데 목록 컬럼에만 빠져 있었다.
      { key: "phone", label: "연락처", type: "maskedPhone" },
      { key: "payment_status", label: "납부상태" },
      // QA 272 — 연결된 주문(order_id)이 있을 때만 값이 실린다. 오프라인 현금
      // 수납처럼 대응 주문이 없는 건은 빈 칸이 정상이다.
      { key: "payment_method", label: "결제방식" },
      { key: "approval_no", label: "승인번호" },
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
      // QA 272 — 이 수강 건에 대응하는 온라인 주문번호. 넣으면 목록의 결제방식·
      // 승인번호가 그 주문에서 자동으로 따라온다. 대응 주문이 없으면 비워 둔다.
      {
        key: "order_id",
        label: "연결 주문번호",
        type: "text",
        placeholder: "토스 주문번호 (없으면 비워 두세요)",
      },
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
