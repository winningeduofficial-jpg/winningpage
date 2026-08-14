// 입결정보(/admission/results) 페이지 전용 상수.
//
// 집계 상수(RESULT_YEARS / ACTIVE_RESULT_YEAR / EMPTY_CELL)는 src/lib/admissionResults.js가
// 정본이므로 여기서 재선언하지 않는다 — 필요한 곳에서 lib을 직접 import 한다.

// 콘텐츠 컨테이너 — 저장소 정본 토큰 max-w-content(72.75rem, tailwind.config.js:6-11).
// 좌우 여백은 신규 계열 관례(px-5 sm:px-8, services/Callmentor.jsx:29).
export const CONTAINER = "mx-auto w-full max-w-content px-5 sm:px-8";

// 구 AdmissionResults.jsx 스텁(1~27행)이 남긴 유일한 컬럼 라벨 기록.
// admission_susi_results / admission_jungsi_results 실컬럼과 1:1 대응하는 한글 라벨이라
// 어드민 필드·표 헤더 라벨의 출발점으로 보존한다.
export const SUSI_FIELD_LABELS = [
  "대학명",
  "중심전형",
  "전형명",
  "모집단위",
  "모집인원",
  "경쟁률",
  "충원순위",
  "최종등록자 교과등급",
  "최종등록자 환산점수",
  "반영교과",
];

// 정시는 v1 범위 밖(연도 축이 컬럼에 박힌 wide 스키마라 2025·2026 축이 존재하지 않음).
// 화면에 쓰지 않고 기록으로만 보존한다.
export const JUNGSI_FIELD_LABELS = [
  "대학교",
  "전공",
  "모집군",
  "정원",
  "적정점수",
  "예상점수",
  "소신점수",
  "적정누백",
  "예상누백",
  "소신누백",
  "과거입시결과 합격권",
  "과거입시결과 상위70%",
];

// 히어로 카피 (Figma 2029:661)
// 데이터 축이 2025·2026 2개년뿐이라 trend는 성립하지 않는다 — 2점은 change다.
// 카피 어휘도 전부 "나란히/변화" 계열로 통일한다.
export const HERO_EYEBROW = "입결정보";
export const HERO_TITLE = "2개년을 나란히 놓아야 변화가 보여요";
export const HERO_DESCRIPTION =
  "대학과 모집단위를 고르면 2025·2026학년도 최종등록자 교과등급을 한 화면에 놓고 보여드립니다. 대학이 공개하지 않은 값은 채우지 않고 그대로 비워 둡니다.";

// 셀렉터 카피 (Figma 2029:844~853 / 1882:2591)
// 두 필드는 <button>이 아니라 <input role="combobox">라 값을 직접 쳐서 거를 수 있다(명세 §8.1).
// placeholder가 "선택"이라고 말하면 입력 가능하다는 신호를 못 주므로 "검색" 어휘로 맞춘다.
export const UNIVERSITY_LABEL = "대학교";
export const UNIVERSITY_PLACEHOLDER = "대학 이름 검색";
export const DEPARTMENT_LABEL = "모집단위";
export const DEPARTMENT_PLACEHOLDER = "모집단위 검색";
export const DEPARTMENT_LOCKED_MESSAGE = "대학을 먼저 선택하세요";
export const SUBMIT_LABEL = "조회";

export const TRENDING_HEADING = "지금 뜨고 있는 학과";

// 2개년 델타(Δ) 배지 카피는 여기 두지 않는다.
// 등급은 낮을수록 상위라 화살표만으로는 "올랐다"가 등급 상승인지 성적 상승인지 뒤집혀 읽히고,
// 그래서 방향 기호·한국어 라벨·표 셀 표기를 계산과 떼어 놓으면 안 된다 —
// src/lib/admissionResults.js의 computeDelta가 상태와 함께 arrow / label / display / note를
// 한 객체로 만들어 내려주고(§8.3 5상태), 화면(DetailView·GradeDelta)은 그 값을 그대로 그린다.
// 같은 문자열('상승'·'▼'·'신규'·'컷 기준 상이' 등)을 이 파일에도 두면 정본이 둘이 된다.

// 모집단위 행 우측 전형 태그. main_track 저장값은 원문 4종(교과·종합·논술·실기, Q8 확정)이라
// `/^학생부/` strip은 사실상 no-op이지만, 구 DDL 주석이 전제하던 `학생부교과` 표기가
// 섞여 들어와도 시안 표기("교과·종합·논술")로 수렴하도록 방어용으로 남긴다.
// 예상 밖의 값이 오면 원문을 그대로 노출한다(지어내지 않는다).
export function formatTrackTags(tracks: unknown) {
  const list = Array.isArray(tracks) ? tracks : [];
  const seen = [];
  for (const raw of list) {
    const text = String(raw ?? "")
      .trim()
      .replace(/^학생부\s*/, "");
    if (text && !seen.includes(text)) seen.push(text);
  }
  return seen.join("·");
}

// 대학 행 우측 보조 텍스트.
export function formatDeptCount(count: unknown) {
  const num = Number(count);
  if (!Number.isFinite(num) || num <= 0) return "";
  return `${num}개 모집단위`;
}
