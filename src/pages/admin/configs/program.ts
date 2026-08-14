// programConfigs: 프로그램 운영(일일 입장/이용 현황) 2개 탭. 필드 타입이
// date/text/number/textarea 4종뿐이라 좁은 로컬 유니온으로 충분하다 — 다른
// configs/*.ts 파일과 하나의 인터페이스를 억지로 공유하지 않는다.

interface ProgramColumn {
  key: string;
  label: string;
  type?: "date";
}

interface ProgramField {
  key: string;
  label: string;
  type: "date" | "text" | "number" | "textarea";
  required?: boolean;
}

interface ProgramConfig {
  title: string;
  table: string;
  searchPlaceholder: string;
  order: string;
  excel?: boolean;
  columns: ProgramColumn[];
  fields: ProgramField[];
  defaults: Record<string, unknown>;
}

export const programConfigs: Record<string, ProgramConfig> = {
  dailyEntries: {
    title: "일일 입장",
    table: "daily_entries",
    searchPlaceholder: "이름, 프로그램, 클래스 검색",
    order: "entry_date",
    excel: true,
    columns: [
      { key: "entry_date", label: "입장일", type: "date" },
      { key: "name", label: "이름" },
      { key: "phone", label: "연락처" },
      { key: "program_name", label: "프로그램" },
      { key: "class_name", label: "클래스" },
      { key: "memo", label: "비고" },
    ],
    fields: [
      { key: "entry_date", label: "입장일", type: "date" },
      { key: "name", label: "이름", type: "text", required: true },
      { key: "phone", label: "연락처", type: "text" },
      { key: "program_name", label: "프로그램", type: "text" },
      { key: "class_name", label: "클래스", type: "text" },
      { key: "memo", label: "비고", type: "textarea" },
    ],
    defaults: { entry_date: new Date().toISOString().slice(0, 10), name: "" },
  },

  usageStatus: {
    title: "이용 현황",
    table: "usage_status",
    searchPlaceholder: "프로그램, 클래스 검색",
    order: "created_at",
    excel: true,
    columns: [
      { key: "term_name", label: "학기" },
      { key: "category_name", label: "종목" },
      { key: "program_name", label: "프로그램" },
      { key: "class_name", label: "클래스" },
      { key: "capacity", label: "정원" },
      { key: "applicant_count", label: "신청자" },
      { key: "confirmed_count", label: "확정자" },
      { key: "remaining_count", label: "잔여석" },
      { key: "status", label: "상태" },
    ],
    fields: [
      { key: "term_name", label: "학기", type: "text" },
      { key: "category_name", label: "종목", type: "text" },
      { key: "program_name", label: "프로그램", type: "text" },
      { key: "class_name", label: "클래스", type: "text", required: true },
      { key: "capacity", label: "정원", type: "number" },
      { key: "applicant_count", label: "신청자", type: "number" },
      { key: "confirmed_count", label: "확정자", type: "number" },
      { key: "remaining_count", label: "잔여석", type: "number" },
      { key: "status", label: "상태", type: "text" },
    ],
    defaults: {
      capacity: 0,
      applicant_count: 0,
      confirmed_count: 0,
      remaining_count: 0,
    },
  },
};
