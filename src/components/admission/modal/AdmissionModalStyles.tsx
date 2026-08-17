// 대학모집요강 모달 껍데기(.admission-modal-*)의 CSS 소유자.
// AdmissionSurface.jsx 와 같은 형태 — DOM 은 0개고 <style> 하나만 렌더한다.
//
// 왜 컴포넌트로 뺐나
// -------------------
// 사용자 기획: "서비스페이지와 어드민페이지 둘 다 같은 표가 나와야 한다.
// **다이얼로그도 마찬가지.**" 마크업(AdmissionModalShell)은 이미 한 벌인데
// 스타일이 src/pages/AdmissionGuidelines.jsx 의 <style> 안에만 있으면
// 어드민 라우트에서는 그 CSS 가 아예 로드되지 않는다 — 같은 컴포넌트를
// 써도 시트 라운드/그림자/헤드 보더가 통째로 빠진 다른 화면이 된다.
// 규칙 문자열과 순서는 원본(AdmissionGuidelines.jsx)에서 **한 글자도
// 바꾸지 않고** 옮겼다. 셀렉터·specificity 가 그대로이므로 공개 화면
// 픽셀은 불변이다.
//
// ⚠ 숨김 규칙의 스코프는 `.admission-modal-body` 하나뿐이다 (커밋 9a9f3f0)
// ------------------------------------------------------------------------
// 아래 `scrollbar-width: none` 계열은 **공개 모달 전용** 장치다. 공개 모달은
// 그 대신 하단에 프록시 가로 스크롤바(.admission-modal-x-scroll-*)를 따로
// 그리기 때문에 네이티브 바를 숨겨도 스크롤 수단이 남는다. 프록시가 없는
// 화면(어드민)이 이 규칙을 상속하면 1280px 표를 스크롤할 방법 자체를
// 잃는다 — 9a9f3f0 이 고친 실제 사고가 정확히 그것이었다.
// 그래서 어드민 편집 모달의 본문 클래스는 `admission-editor-modal-body` 로
// **이름 자체가 다르다**. 숨김 규칙이 도달할 셀렉터 경로가 문법적으로
// 존재하지 않는다. 어드민 바디에 `admission-modal-body` 를 붙이지 마라
// (src/pages/AdmissionGuidelines.modalShell.test.tsx 의 소스 스캔 락이 막는다).
export default function AdmissionModalStyles() {
  return (
    <style>{`
        .admission-modal-body { overscroll-behavior: contain; scrollbar-gutter: stable; }
        .admission-modal-body .admission-scroll-table,
        .admission-modal-body .admission-table-wrap,
        .admission-modal-body .admission-existing-html { scrollbar-width: none; }
        .admission-modal-body .admission-scroll-table::-webkit-scrollbar,
        .admission-modal-body .admission-table-wrap::-webkit-scrollbar,
        .admission-modal-body .admission-existing-html::-webkit-scrollbar { width: 0; height: 0; }
        /* BLOCK3(2026-08-04): 쉘의 좌우 padding(24px 고정)이 모달 본문(.admission-modal-body,
           px-6/md:px-12 = 24px/48px)보다 데스크톱에서 24px씩 더 좁아, 프록시 스크롤바의
           트랙 폭(쉘 clientWidth)이 실제 표 래퍼 clientWidth보다 넓어진다. 그 결과 inner에
           표.scrollWidth를 그대로 넣어도 트랙 안에 다 들어가 스크롤이 0이 되는 5건이 있었다.
           쉘 padding을 모달 본문과 동일한 반응형 값으로 맞춰 두 컨테이너의 실폭 비율을 일치시킨다. */
        .admission-modal-x-scroll-shell { flex: 0 0 auto; border-top: 1px solid #d7d7d7; background: #fff; padding: 0.3125rem 1.5rem 0.25rem; }
        @media (min-width: 48rem) {
          .admission-modal-x-scroll-shell { padding-left: 3rem; padding-right: 3rem; }
        }
        .admission-modal-x-scroll { width: 100%; overflow-x: auto; overflow-y: hidden; scrollbar-width: thin; scrollbar-color: #bcdcff #f9fafb; }
        .admission-modal-x-scroll-inner { height: 1px; }
        .admission-modal-x-scroll::-webkit-scrollbar { height: 7px; }
        .admission-modal-x-scroll::-webkit-scrollbar-track { background: #f9fafb; border-radius: 999px; }
        .admission-modal-x-scroll::-webkit-scrollbar-thumb { background: #bcdcff; border-radius: 999px; }
        .admission-modal-x-scroll::-webkit-scrollbar-thumb:hover { background: #0b84fd; }

        .admission-modal-sheet { background: #fff; border: none; border-radius: 1.5rem; box-shadow: 0 1.875rem 5rem -1.25rem rgba(1, 50, 98, 0.35); }
        .admission-modal-sheet-head { border-bottom: 1px solid #e5e7eb; background: #ffffff; }
        .admission-modal-sheet-title { text-align: center; color: #525252; font-weight: 600; text-decoration: none; letter-spacing: -0.02em; }

        /* 어드민 편집 모달 본문. 공개(.admission-modal-body)의 두 줄만 그대로
           가져오고 숨김 규칙은 **의도적으로 가져오지 않는다** — 편집 표
           (실측 1280px)의 네이티브 가로 스크롤바가 보여야 한다. 공개 타이포
           (text-sm/font-semibold/leading-7/#525252)도 상속하지 않는다:
           편집기는 입력 요소 위주라 본문 타이포를 물려받을 이유가 없다. */
        .admission-editor-modal-body { overscroll-behavior: contain; scrollbar-gutter: stable; }
      `}</style>
  );
}
