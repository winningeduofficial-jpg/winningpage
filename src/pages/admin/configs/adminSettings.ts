import type { FieldOption } from "@/pages/admin/shared/csvExport";

// ---------------------------------------------------------------------------
// 관리자 설정(adminMembers / adminRoles) — 기획 문서 「관리자 권한 체계 안내」.
//
// 둘 다 custom: true 다. 권한 화면은 "메뉴 × 접근 수준" 매트릭스라 columns/fields
// 로 표현할 수 있는 모양이 아니고, 직원 화면은 admin_members·profiles·admin_roles
// 를 함께 읽는 데다 초대(서버 라우트 호출)가 붙는다.
//
// 목록만 AdminTable 을 재사용하므로 columns 는 남긴다(members·mentorApplications 와
// 같은 방식). table 은 제네릭 조회에 쓰이지 않는다 — custom 컴포넌트가 직접
// 조회한다 — 지만, config 형태를 맞추기 위해 실제 소스와 같은 이름을 적어둔다.
// ---------------------------------------------------------------------------

export const ADMIN_MEMBER_STATUS_OPTIONS: FieldOption[] = [
  { value: "invited", label: "초대됨" },
  { value: "active", label: "활성" },
  { value: "suspended", label: "정지" },
];

// 접근 수준 3종 — admin_role_permissions.level / admin_member_permissions.level
// CHECK 값과 1:1 이다. 라벨은 기획 문서의 어휘를 그대로 쓴다.
export const ADMIN_PERMISSION_LEVEL_OPTIONS: FieldOption[] = [
  { value: "edit", label: "수정 가능" },
  { value: "view", label: "읽기 전용" },
  { value: "none", label: "접근 불가" },
];

interface AdminSettingsColumn {
  key: string;
  label: string;
  type?: "date" | "maskedPhone";
  options?: FieldOption[];
}

interface AdminSettingsConfig {
  title: string;
  table: string;
  searchPlaceholder: string;
  order: string;
  readOnly: true;
  custom: true;
  customComponentKey: string;
  columns: AdminSettingsColumn[];
}

export const adminSettingsConfigs: Record<string, AdminSettingsConfig> = {
  // 와이어프레임 목록: 번호 | 직원명 | 부서 | 이메일 | 전화번호 | 가입일 | 더보기
  adminMembers: {
    title: "관리자 관리",
    table: "admin_member_directory",
    searchPlaceholder: "직원명, 부서, 이메일 검색",
    order: "invited_at",
    readOnly: true,
    custom: true,
    customComponentKey: "adminMembers",
    columns: [
      { key: "member_name", label: "직원명" },
      { key: "department", label: "부서" },
      { key: "member_email", label: "이메일" },
      { key: "member_phone", label: "전화번호", type: "maskedPhone" },
      { key: "role_name", label: "권한 묶음" },
      {
        key: "status",
        label: "상태",
        options: ADMIN_MEMBER_STATUS_OPTIONS,
      },
      { key: "joined_at", label: "가입일", type: "date" },
    ],
  },

  // 와이어프레임 목록: 번호 | 권한 묶음 이름 | 포함 메뉴 | 관리
  // '포함 메뉴'는 파생값이라 컴포넌트가 직접 그린다(컬럼 정의에는 없다).
  adminRoles: {
    title: "관리자 권한 관리",
    table: "admin_roles",
    searchPlaceholder: "권한 묶음 이름 검색",
    order: "created_at",
    readOnly: true,
    custom: true,
    customComponentKey: "adminRoles",
    columns: [
      { key: "name", label: "권한 묶음 이름" },
      { key: "description", label: "설명" },
    ],
  },
};
