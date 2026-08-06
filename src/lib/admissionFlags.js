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
// sql/47(구 43 — origin/dev와 번호 충돌해 2026-08-06 재번호) 적용 +
// 백필 완료(2026-08-06, dev) 후 활성화. 백필 실측:
// *_json not-null 1253/1253, blocks 길이 0인 행 0건, rawHtml 블록 보유
// 셀 0건(전 카테고리 실제 구조화), has_*_json 뷰 플래그가 not-null
// 카운트와 정확히 일치, UPDATE 실패 0건. `?jsonrender=0`으로 런타임 중
// legacy html/text 경로로 즉시 복귀 가능(배포 없이).
export const ADMISSION_JSON_ENABLED = true;

// ?jsonrender=0 킬스위치 — 배포 없이 즉시 doc 렌더를 끄고 legacy html/text
// 경로로 되돌리기 위함. ADMISSION_JSON_ENABLED와 함께 이 함수 하나로만
// 판정해야 "select는 껐는데 렌더는 켜짐" 같은 불일치가 나지 않는다.
export function isDocRenderEnabled() {
  if (!ADMISSION_JSON_ENABLED) return false;
  if (typeof window === 'undefined') return true;
  return new URLSearchParams(window.location.search).get('jsonrender') !== '0';
}
