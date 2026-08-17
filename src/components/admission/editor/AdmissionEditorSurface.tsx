// 어드민 "카테고리 편집" 모달 **전용** 표면 CSS.
// AdmissionSurface.jsx / AdmissionModalStyles.jsx 와 같은 형태 — DOM 노드는
// 0개고 <style> 하나만 렌더한다.
//
// 왜 별도 컴포넌트인가 (AdmissionSurface 를 고치면 안 되는 이유)
// --------------------------------------------------------------
// 공개 모달(modal/AdmissionModalShell.jsx)과 이 편집 모달
// (editor/AdmissionSectionEditModal.jsx)은 **둘 다 `admission-surface`
// 클래스를 달고 같은 AdmissionSurface <style> 을 로드**한다. 1440px 실측에서
// 두 모달의 전형방법 표 컬럼 폭이 `104·216·112·120·462` 로 완전히 일치한다.
// 즉 AdmissionSurface 의 폭 규칙을 건드리면 공개 화면이 함께 바뀐다.
//
// 그리고 그 변경은 손해다(2026-08-07 dev DB 557행 실측):
//   - 공개에서 최저 셀이 wrap 되는 건 조선대학교 **1행뿐**이다(162.9px).
//     나머지 556행은 120px 안에 여유 있게 들어간다.
//   - 반대로 최저를 넓히면 전형방법 컬럼이 462 → 406px(-12%)로 좁아진다.
//     AdmissionSurface.jsx 의 2026-08-04 재실측 주석(29개 대학·103행)이
//     col5 wrap률을 48.5% → 17.5%로 낮추려고 잡은 배분을 정면으로 되돌리는
//     일이다. 이득 1행 / 손실 557행.
//   - 게다가 AdmissionSurface 의 <style> 본문은
//     src/pages/AdmissionGuidelines.modalShell.test.tsx 가 sha256 으로 접어
//     골든과 대조한다 — 한 글자만 바꿔도 scripts/capture-admission-modal-shell-golden.mjs
//     `--capture` 재생성이 강제되고, 그건 그 스크립트가 경고하는 자기증명
//     순환에 손대는 일이다.
//
// 그럼 편집은 왜 좁은가 — td 가 아니라 input 이 눌린다
// ----------------------------------------------------
// 최저 td 는 공개·편집 모두 120px(콘텐츠박스 88px)로 동일하다. 다만 뷰는
// 그 88px 을 <span class="admission-minimum-badge"> 하나가 다 쓰는 반면,
// 편집은 BadgeCellEditor 가 input + gap + <select>있음/없음</select> 을
// 나란히 놓는다:
//   input 33.5 + gap 4 + select 50.5 = 88
//   input 의 텍스트 영역 = 33.5 - 패딩16 - 보더2 = **15.5px** (한글 한 글자 반)
// 편집이 추가로 요구하는 고정 크롬이 73px(select 51 + gap 4 + input 패딩·
// 보더 18)이라, 557개 최저값 중 **176개(31.6%)** 가 잘려 보인다.
//
// 그래서 폭 확대를 **편집 DOM 에만** 스코프한다. `.admission-table-editor`
// 는 소스 전체에서 editor/TableBlockEditor.jsx 단 한 곳에서만 붙는 클래스라
// 공개 렌더 경로(AdmissionSectionView → TableBlockView → AdmissionTable)에는
// 절대 등장하지 않는다. → 공개 CSS 오염 0.
//   라이브 DOM 체인: table.admission-selection-table
//     ← div.admission-scroll-table ← div.admission-table-editor
//     ← div.admission-doc-blocks-editor
//     ← div.admission-editor-modal-body.admission-surface
//
// 왜 11rem 인가 (dev DB 557행 실측)
// ---------------------------------
// 필요 폭 = 텍스트 자연폭 + 편집 크롬 73px + td 좌우 패딩 32px.
// 이상치(조선대 "있음: 미술대학, 체육대학 제외" 162.9px)를 뺀 실측 최댓값은
// "전 모집단위" 63.9px → 63.9 + 73 + 32 = 168.9px.
//   7.5rem(현행) 텍스트 몫 15.5px → 잘림 176/557 (31.6%)
//   10rem                 55.5px → 잘림  16/557
//   11rem                 71.5px → 잘림   1/557 (0.2%)  ← 상한이자 최적
//   12rem                 87.5px → 잘림   1/557 (추가 커버 0 = 순손실)
//
// specificity: 이 규칙은 클래스 3개 + :nth-child + td = (0,4,1) 이고
// AdmissionSurface 의 대응 규칙은 (0,3,1) 이라 소스 순서와 무관하게 이긴다
// (@media 는 specificity 에 영향을 주지 않는다).
//
// ⛔ 여기에 `.admission-table-editor` 없는 셀렉터를 추가하지 마라 —
//    그 순간 공개 표가 함께 바뀐다. scripts/verify-admission-editor-surface.mjs
//    의 surf:2 가 정규식 스캔으로 막는다. 길이 단위는 rem/% 만 쓴다(surf:3).
export default function AdmissionEditorSurface() {
  return (
    <style>{`
        /* 데스크톱 확정 구간 — AdmissionSurface 의 rem 고정 배분
           (6.5/13.5/7/7.5rem + 전형방법 auto)과 같은 65rem 경계를 쓴다.
           최저만 7.5 → 11rem 으로 넓히고 나머지 4컬럼은 건드리지 않는다
           (전형방법은 width:auto 라 자동으로 3.5rem 을 내준다). */
        @media (min-width: 65rem) {
          .admission-surface .admission-table-editor .admission-selection-table th:nth-child(4),
          .admission-surface .admission-table-editor .admission-selection-table td:nth-child(4) { width: 11rem; min-width: 0; max-width: none; }
        }

        /* 모바일·태블릿 구간 — AdmissionSurface 가 %기반(9/19/9/9/auto)으로
           이어받는 구간이다. 같은 비율 감각을 유지한 채 최저만 9% → 16%로
           한 차례 넓혔었는데, 2026-08-08 재지적(1000px 창 실측: input
           21px, 21칸 중 12칸 잘림)으로 16%도 부족함이 드러나 32%로 재보정.
           편집 크롬(select+gap+input 보더/패딩 ≈73px)은 폭에 비례하지 않는
           고정값이라 컨테이너가 좁을수록 텍스트 영역을 더 크게 깎아먹는다
           — 그래서 %도 desktop(9%→16%, 1.8배)보다 더 크게 올려야 같은
           여유가 난다.
           ⚠ 방법론 고지: 이 저장소는 브라우저 실측을 정본으로 삼는 관행이지만
           (위 :45-52 데스크톱 값이 그 예), 이번 보정은 브라우저 도구 없이
           CSS 캐스케이드를 역산하고 team-lead 가 제공한 1000px 실측 1건을
           앵커로 교차검증한 결과다 — 아래 산출 과정을 남긴다.
             1) 1000px 앵커 역산: 16%일 때 input 21px(실측) → content-box
                21+54.5(gap4+select50.5)=75.5px → td 75.5+32(패딩,
                AdmissionSurface :210-215 1.25rem 1rem)=107.5px →
                0.78*1000-96(md:px-12)-10(scrollbar-gutter) 공식(:264-266
                BLOCK4 실측 문서)과 대조하면 tableWidth≈673px, 107.5/673=
                15.97%(≈16%, 공식이 실측과 일치 — 아래 역산의 근거).
             2) 목표 content-box는 desktop 11rem 도출값과 동일(63.9px 텍스트
                자연폭 + 73px 크롬 = 136.9px) — 텍스트·크롬 모두 폰트 크기가
                같으면 뷰포트와 무관한 값이기 때문이다.
             3) 1000px(패딩32): 필요 td=136.9+32=168.9px → 168.9/673=25.1%.
             4) 768px(0.78*768-106=493px, 이 폭에서는 AdmissionSurface
                :218-227 의 @media(max-width:48rem) 로 셀 패딩이 1.25rem 1rem
                →0.625rem 0.5rem 로 줄어 좌우 합 16px): 필요 td=136.9+16=
                152.9px → 152.9/493=31.0%.
             5) 두 값 중 더 좁은 768px 기준(31.0%)이 상한을 정한다 — 32%로
                올림. 1000px 에서는 32%*673=215.4px(content-box 183.4,
                text_area 110.9px)로 11rem(text_area 71.5px, 잘림 0.2%=
                557행 중 1행, 조선대 162.9px 이상치뿐)보다 넉넉해 잘림은
                이상치 1건 수준으로 수렴한다. 768px 에서도 text_area≈69.3px
                로 11rem 상당(71.5px)에 근접 — 이상치 제외 사실상 0에
                수렴한다(48rem 이하에서 표 font-size 가 0.8125rem 로도
                줄어 select/input 도 함께 작아진다면 실제 여유는 이 계산보다
                더 크다 — 위 산출은 크롬이 안 줄어든다고 가정한 보수값). */
        @media (max-width: 65rem) {
          .admission-surface .admission-table-editor .admission-selection-table th:nth-child(4),
          .admission-surface .admission-table-editor .admission-selection-table td:nth-child(4) { width: 32%; min-width: 0; max-width: none; }
        }
    `}</style>
  );
}
