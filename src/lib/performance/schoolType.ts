import { SCHOOL_TYPES } from "@/components/mypage/ProfileTab";

/**
 * `school_type`은 실서비스 저장 경로(`ProfileTab`/`Under14Form`) 어디에도 코드값이 없고
 * 한글 원문("고등학교" 등)을 그대로 저장하는 게 정본이다 — 그래서 여기서 값을 다른
 * 라벨로 "변환"하지 않는다. `SCHOOL_TYPES` 화이트리스트는 오염값 방어용이다: 로컬 시드
 * 스크립트 오탈자(`supabase/seed.sql`이 한때 `school_type = 'high'`를 넣었다)처럼 정상
 * 저장 경로를 거치지 않은 값이 화면에 원시 문자열로 새는 것만 막는다. 목록에 없으면
 * null — 빈 문자열이 아니라 "학교 유형" 값 자체가 없는 것으로 취급한다.
 *
 * `PerformanceChatPage.buildBasicInfoSummary`와 `PerformanceAppLayout`(사이드바 프로필
 * 슬롯) 둘 다 같은 판정을 쓴다 — 화이트리스트 검사를 두 곳에 중복하지 않는다.
 */
export function pickKnownSchoolType(
  value: string | null | undefined,
): string | null {
  if (!value) return null;
  return (SCHOOL_TYPES as readonly string[]).includes(value) ? value : null;
}
