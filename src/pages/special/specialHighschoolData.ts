import { supabase } from "../../lib/supabase";

// 시안(2239:1559) 기반 탭 + 국제고(2026-08 웹서치 검증으로 부산국제고는 외고가
// 아니라 국제고로 확인되어 신설). 'all' 외의 key는 DB special_highschool_cases.
// school_type 값과 정확히 일치해야 한다(DB CHECK 제약 및 어드민 select 옵션과 동일 값).
export const SPECIAL_HS_TABS = [
  { key: "all", label: "전체" },
  { key: "자사고", label: "자사고" },
  { key: "외고", label: "외고" },
  { key: "국제고", label: "국제고" },
  { key: "영재고", label: "영재고" },
  { key: "과학고", label: "과학고" },
];

export const SPECIAL_HS_DESCRIPTION =
  "강원석미래교육연구소 위닝에듀는 해운대 센텀 연구소와 화명센터가 운영되고 있으며 학생 개인에 맞춘 학습코칭으로 정확한 로드맵을 제시합니다. 1:1 학습코칭으로 내신 상승 프로그램을 제시, 성적향상을 이끌며 각 교과별 수행평가에서 진로.진학을 고려해 학생의 학업역량이 드러나는 탐구활동을 제시, 가이드하여 수시학생부종합의 합격 조건인 학교생활기록부의 차별성을 인정받고 있습니다";

// select('*') 고정 — 마이그레이션 미적용 환경에서도 죽지 않게 하는 규약
// (admissionCaseData.js 와 동일 원칙). 조회 실패 시 빈 배열.
export async function fetchSpecialHighschoolCases() {
  const { data, error } = await supabase
    .from("special_highschool_cases")
    .select("*")
    .eq("is_active", true)
    .order("sort_order", { ascending: true })
    .order("year", { ascending: false })
    .order("created_at", { ascending: true });

  if (error) {
    console.error("특목고 합격사례 조회 실패:", error);
    return [];
  }
  return data || [];
}

// 탭 필터는 서버 왕복 없이 클라이언트에서 한다(전체 38건, 탭 전환 시 깜빡임 없음).
export function filterByType(rows, tabKey) {
  return tabKey === "all"
    ? rows
    : (rows || []).filter((row) => row.school_type === tabKey);
}
