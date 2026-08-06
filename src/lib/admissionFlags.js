// 대입모집요강 구조화 문서(AdmissionDoc) 렌더 전역 스위치 — 단일 정본.
//
// AdmissionGuidelines.jsx(공개 모달)와 Admin.jsx(파싱 미리보기) 양쪽이
// 이 모듈만 import한다. 예전엔 두 파일에 같은 값을 각각 복제하고 "같이
// 뒤집어라" 주석으로만 동기화를 강제했는데, 이러면 한쪽만 뒤집히는 사고가
// 조용히 발생할 수 있다 — 공개 페이지는 doc을 보고 어드민은 html을 보는
// 식으로 어긋나도 에러가 나지 않는다. 이 파일은 의존성 없는 상수/순수
// 함수 모듈(leaf)이라 React.lazy 경계를 넘는 정적 import여도 번들 분리에
// 영향이 없다.
//
// sql/43(*_json 6종 jsonb 컬럼)이 dev DB에 적용되고 백필까지 끝난 뒤
// 별도 커밋에서 true로 뒤집는다. false인 동안은 select에서 json 컬럼을
// 아예 빼고 doc 분기도 타지 않는다 — 컬럼이 없는 상태에서 select에
// 넣으면 PostgREST가 에러를 낸다.
export const ADMISSION_JSON_ENABLED = false;

// ?jsonrender=0 킬스위치 — 배포 없이 즉시 doc 렌더를 끄고 legacy html/text
// 경로로 되돌리기 위함. ADMISSION_JSON_ENABLED와 함께 이 함수 하나로만
// 판정해야 "select는 껐는데 렌더는 켜짐" 같은 불일치가 나지 않는다.
export function isDocRenderEnabled() {
  if (!ADMISSION_JSON_ENABLED) return false;
  if (typeof window === 'undefined') return true;
  return new URLSearchParams(window.location.search).get('jsonrender') !== '0';
}
