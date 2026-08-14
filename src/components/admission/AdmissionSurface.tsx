// 공개 모달(AdmissionGuidelines.jsx)과 어드민 편집기(Admin.jsx)가 공유하는
// "표 표면"(surface) 컴포넌트. 2026-08-06 전수조사 결과 — 표시용 React
// 컴포넌트(blocks/tables/*)가 두 화면에서 같은 className을 써도 실제 룩이
// 달랐다. 원인은 CSS가 `.admission-modal-body` 스코프 셀렉터로 갈라져
// 있었기 때문("표시용 컴포넌트가 같은 클래스를 쓰는 건 필요조건이지
// 충분조건이 아니다") — 모달 스코프 규칙이 admin DOM엔 전혀 안 걸려서
// admin은 각자 따로 관리하던 오래된 자체 CSS 사본(예: 구 Admin.jsx:4189
// 부근)을 썼고, 그 사본이 공개 쪽의 수십 차례 Figma 재실측(WARN/BLOCK
// 주석 참고, 아래 CSS에 원문 그대로 보존)을 반영하지 못한 채 드리프트됐다.
//
// 사용자 결정: "컴포넌트화해서 사용하자." CSS 스코프를 맞추는 우회 대신
// 표 표면 자체를 컴포넌트로 뽑아 스타일을 이 컴포넌트가 소유하게 한다 —
// 두 화면이 같은 컴포넌트를 쓰면 스코프 문제가 원천적으로 사라진다.
//
// 이 컴포넌트로 옮긴 것: AdmissionGuidelines.jsx의 인라인 <style> 중
// "표/블록 표면" 규칙(베이스 admission-data-table 등 + 구 `.admission-modal-body`
// 스코프 규칙, 이번에 `.admission-surface`로 선택자만 교체 — specificity
// (0,2,0)/(0,2,1) 그대로라 순서·우선순위에 영향 없음). 옮기지 않고 남긴
// 것: 진짜 모달 전용 크롬(overscroll-behavior, 스크롤바 숨김, 모달 시트
// 그림자/보더 등, AdmissionGuidelines.jsx `.admission-modal-body`/
// `.admission-modal-sheet*` 참고) — 이건 admin에 필요 없는 "모달"이라는
// UI 자체의 속성이라 여기 두지 않는다.
//
// 통합 규칙(둘 다 표시용 blocks/tables/* 컴포넌트를 그대로 감싸는 wrapper):
//   <div className="admission-surface ...기존 클래스" data-section={sectionKey}>
//     {children}
//   </div>
//   <AdmissionSurface sectionKey={sectionKey} showSectionTitle showChangeNoColumn />
// 처럼 기존 요소에 admission-surface 클래스 + data-section만 추가하고,
// 이 컴포넌트는 <style> 태그만 렌더한다(래핑 div를 새로 만들지 않는다 —
// 공개 모달의 기존 div가 ref/스크롤/레이아웃 클래스를 이미 갖고 있어
// 감싸는 대신 같은 요소에 병합하는 쪽이 구조 변경 위험이 없다).
//
// props:
//   showSectionTitle: 절 제목(admission-hwp-section-title) 노출 여부.
//     공개는 모달 헤더와 중복이라 기본 숨김(1882:4416/4934/5487 시안엔
//     없음). 어드민은 편집 중 어느 섹션인지 알아야 하니 true로 켠다.
//   showChangeNoColumn: change(전년도와 차이점) 표의 번호 컬럼 노출 여부.
//     공개는 시안 기준 번호 없는 2컬럼(항목36%/내용64%)이라 기본 숨김.
//     어드민은 데이터 편집에 번호가 필요해 true로 켠다(36/64 재배분은
//     2컬럼 전제라 3컬럼엔 안 맞으므로, 켜면 대신 베이스 규칙
//     58px/260px/auto로 폴백한다 — 아래 CSS admission-change-table-v87
//     기본 규칙 참고).
//
// 죽은 CSS 정리(3단계, 2026-08-06, 사용자 지시 "죽은 css 정리"): 1단계에서
// AdmissionGuidelines.jsx 428줄을 통째로 옮길 때 실제로는 아무 데서도 안
// 쓰이는 클래스 16개가 죽은 채로 같이 따라왔다 — React 컴포넌트(blocks/*)·
// admissionParsing.js HTML 생성기·.golden-cache/admission-html-golden.full.json
// (실 DB 데이터 스냅샷) 전부에서 0건 확인 후 제거했다: admission-clean-block/
// -line/-note, admission-mini-table, admission-result-table, admission-normal-line,
// admission-numbered-line, admission-long-line, admission-token-row/-label/-list,
// admission-wide-sheet/-line, admission-header-summary, admission-info-list,
// admission-subhead-card. (admission-result-note/admission-readable-body/
// admission-raw-pre/admission-safe-text-block/admission-recruit-legend/
// admission-bullet-list처럼 이름이 비슷해 헷갈리기 쉬운 것들은 전부 실사용
// 확인 후 남겼다.)
type AdmissionSurfaceProps = {
  showSectionTitle?: boolean;
  showChangeNoColumn?: boolean;
};

export default function AdmissionSurface({
  showSectionTitle = false,
  showChangeNoColumn = false,
}: AdmissionSurfaceProps) {
  return (
    <style>{`
        .admission-table-wrap,
        .admission-existing-html,
        .admission-raw-section-wrap { width: 100%; max-width: 100%; }
        .admission-table-wrap { overflow-x: auto; overflow-y: hidden; }
        .admission-existing-html { overflow-x: auto; overflow-y: hidden; }
        .admission-existing-html table,
        .admission-table-wrap table { width: max-content; min-width: 100%; border-collapse: collapse; font-size: 13px; line-height: 1.45; background: #fff; }
        .admission-existing-html th,
        .admission-table-wrap th { position: sticky; top: 0; z-index: 1; background: #f9fafb; color: #013262; font-weight: 900; border: 1px solid #d7d7d7; padding: 10px 10px; text-align: center; white-space: nowrap; }
        .admission-existing-html td,
        .admission-table-wrap td { border: 1px solid #d7d7d7; padding: 9px 10px; color: #525252; vertical-align: middle; text-align: center; white-space: nowrap; }
        .admission-existing-html td.left,
        .admission-table-wrap td.left { text-align: left; white-space: normal; word-break: keep-all; min-width: 160px; }
        .admission-subhead { margin: 18px 0 8px; color: #013262; font-size: 14px; font-weight: 900; }
        .admission-result-note { margin-bottom: 14px; border: 1px solid #d7d7d7; background: #f9fafb; border-radius: 16px; padding: 12px 14px; color: #667085; font-size: 12.5px; line-height: 1.7; font-weight: 800; word-break: keep-all; }
        .admission-readable-body { display: grid; gap: 8px; }
        .admission-raw-pre { min-width: 980px; margin: 0; border: 1px solid #d7d7d7; border-radius: 16px; background: #ffffff; padding: 16px; color: #525252; font-size: 13px; line-height: 1.7; font-weight: 700; white-space: pre-wrap; word-break: keep-all; font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
        .admission-safe-text-block { border-radius: 0; border-top: 1px solid #d7d7d7; border-bottom: 1px solid #d7d7d7; border-left: 0; border-right: 0; }

        .admission-scroll-table { width: 100%; max-width: 100%; overflow-x: auto; border-radius: 16px; border: 1px solid #d7d7d7; background: #fff; }
        .admission-data-table { width: max-content; min-width: 100%; border-collapse: collapse; font-size: 13px; line-height: 1.45; background: #fff; }
        .admission-data-table th { position: sticky; top: 0; z-index: 2; background: #f9fafb; color: #013262; font-weight: 950; border: 1px solid #d7d7d7; padding: 10px 12px; text-align: center; white-space: nowrap; }
        .admission-data-table td { border: 1px solid #d7d7d7; padding: 9px 12px; color: #525252; vertical-align: middle; text-align: center; white-space: nowrap; font-weight: 750; }
        .admission-data-table td.left { text-align: left; white-space: normal; word-break: keep-all; min-width: 150px; }
        /* 2026-08-06 제거: .admission-table-compact td:first-child — htmlTable()이
           className을 함께 받으면(score/recordInfo 실호출부가 항상 그렇다) compact
           옵션을 통째로 덮어써 이 클래스가 실제로는 어디에도 안 붙는다(admissionLayout.js
           도 동일 실측으로 이 클래스를 붙이지 않음). 죽은 규칙. */
        .admission-empty-box { border: 1px solid #d7d7d7; background: #fff; border-radius: 14px; padding: 18px; color: #525252; font-size: 15px; font-weight: 900; text-align: center; }
        .admission-bullet-list { margin: 0; padding: 0 0 0 20px; display: grid; gap: 8px; }
        .admission-bullet-list li { border: 1px solid #d7d7d7; background: #fff; border-radius: 12px; padding: 10px 12px; color: #525252; font-size: 13.5px; line-height: 1.65; font-weight: 800; word-break: keep-all; }
        .admission-subtitle-line { margin-bottom: 10px; border-left: 4px solid #0b84fd; background: #e9f4ff; border-radius: 12px; padding: 10px 12px; color: #013262; font-weight: 950; }
        .admission-text-line { border: 1px solid #d7d7d7; background: #fff; border-radius: 12px; padding: 10px 12px; color: #525252; font-size: 13.5px; line-height: 1.65; font-weight: 800; word-break: keep-all; }
        .admission-recruit-legend { margin-bottom: 10px; border: 1px solid #bcdcff; background: #e9f4ff; color: #013262; border-radius: 14px; padding: 10px 12px; font-size: 12.5px; line-height: 1.65; font-weight: 850; word-break: keep-all; }

        .admission-recruit-table { min-width: 1100px; }
        .admission-normalized-recruit-table { min-width: 1280px; }
        .admission-normalized-recruit-table th.fixed-head { left: 0; z-index: 4; }
        .admission-normalized-recruit-table th.recruit-group-head { background: #f9fafb; color: #013262; font-size: 13px; }
        .admission-normalized-recruit-table td:first-child,
        .admission-normalized-recruit-table th:first-child { background: #f9fafb; color: #013262; font-weight: 950; }
        .admission-normalized-recruit-table td.left { min-width: 140px; max-width: 260px; }
        .admission-normalized-recruit-table td.series-cell { min-width: 110px; }
        .admission-recruit-table .group-cell { min-width: 120px; max-width: 190px; }
        .admission-recruit-table .unit-cell { min-width: 220px; max-width: 360px; }
        .admission-recruit-table .recruit-values-cell { min-width: 180px; text-align: left; white-space: normal; vertical-align: top; }
        .admission-recruit-cell-values { display: grid; grid-template-columns: 1fr; gap: 5px; }
        .admission-recruit-cell-values span { display: flex; align-items: center; justify-content: space-between; gap: 8px; border: 1px solid #d7d7d7; background: #f9fafb; border-radius: 9px; padding: 5px 7px; color: #525252; font-size: 12.5px; line-height: 1.35; font-weight: 900; white-space: nowrap; }
        .admission-recruit-cell-values b { color: #667085; font-size: 11px; font-weight: 950; }

        .admission-selection-table { min-width: 980px; }
        .admission-selection-table th:nth-child(1),
        .admission-selection-table td:nth-child(1) { min-width: 82px; text-align: center; }
        .admission-selection-table th:nth-child(2),
        .admission-selection-table td:nth-child(2) { min-width: 210px; }
        .admission-selection-table th:nth-child(3),
        .admission-selection-table td:nth-child(3) { min-width: 72px; text-align: center; }
        .admission-selection-table th:nth-child(4),
        .admission-selection-table td:nth-child(4) { min-width: 420px; max-width: 760px; text-align: left; white-space: normal; word-break: keep-all; line-height: 1.62; }
        .admission-selection-table th:nth-child(5),
        .admission-selection-table td:nth-child(5) { width: 82px; min-width: 82px; max-width: 110px; text-align: center; padding-left: 6px; padding-right: 6px; }
        .admission-selection-table .selection-type-cell { background: #f9fafb; color: #013262; font-weight: 950; }
        .admission-selection-table .selection-name-cell { font-weight: 900; }
        .admission-selection-table .selection-seat-cell { color: #013262; font-weight: 950; }
        .admission-minimum-badge { display: inline-flex; align-items: center; justify-content: center; min-width: 38px; max-width: 140px; border: 1px solid #d7d7d7; border-radius: 999px; padding: 3px 7px; background: #f9fafb; color: #667085; font-size: 11px; line-height: 1.2; font-weight: 900; white-space: nowrap; }
        .admission-minimum-badge.has { border-color: #bcdcff; background: #e9f4ff; color: #0b84fd; }
        .admission-minimum-badge.none { color: #667085; }

        .admission-change-scroll-table { overflow-x: visible; }
        .admission-change-table { width: 100%; min-width: 0; table-layout: fixed; }
        .admission-change-table th:nth-child(1), .admission-change-table td:nth-child(1) { width: 58px; text-align: center; }
        .admission-change-table th:nth-child(2), .admission-change-table td:nth-child(2) { width: 240px; }
        .admission-change-table th:nth-child(4), .admission-change-table td:nth-child(4) { width: 130px; }
        .admission-change-table .change-no-cell { font-weight: 950; color: #0b84fd; }
        .admission-change-table .change-title-cell { text-align: left; white-space: normal; line-height: 1.65; font-weight: 950; color: #013262; word-break: keep-all; }
        .admission-change-table .change-content-cell { text-align: left; white-space: normal; line-height: 1.62; word-break: normal; overflow-wrap: anywhere; }
        .admission-change-table .change-note-cell { text-align: left; white-space: normal; line-height: 1.65; color: #667085; font-weight: 850; word-break: keep-all; }
        .admission-change-arrow { display: flex; align-items: center; justify-content: center; color: #0b84fd; font-weight: 950; }
        .admission-change-simple { color: #525252; font-weight: 850; line-height: 1.65; white-space: normal; word-break: keep-all; }
        .admission-change-table-v87 th:nth-child(1), .admission-change-table-v87 td:nth-child(1) { width: 58px; text-align: center; }
        .admission-change-table-v87 th:nth-child(2), .admission-change-table-v87 td:nth-child(2) { width: 260px; }
        .admission-change-table-v87 th:nth-child(3), .admission-change-table-v87 td:nth-child(3) { width: auto; }
        .admission-change-lines { display: flex; flex-direction: column; gap: 6px; }
        .admission-change-line { border: 1px solid #d7d7d7; background: #f9fafb; border-radius: 10px; padding: 8px 10px; color: #525252; font-weight: 850; line-height: 1.45; word-break: keep-all; overflow-wrap: anywhere; }
        .admission-change-pair-list { display: flex; flex-direction: column; gap: 8px; }
        .admission-change-arrow-row { display: grid; grid-template-columns: minmax(0, 1fr) 34px minmax(0, 1fr); gap: 10px; align-items: stretch; }
        .admission-change-arrow-before, .admission-change-arrow-after { min-width: 0; border: 1px solid #d7d7d7; border-radius: 12px; padding: 10px; background: #f9fafb; }
        .admission-change-arrow-after { background: #e9f4ff; border-color: #bcdcff; }
        .admission-change-arrow-icon { display: flex; align-items: center; justify-content: center; color: #0b84fd; font-weight: 950; font-size: 18px; }
        .admission-change-arrow-before .admission-change-simple, .admission-change-arrow-after .admission-change-simple { color: #013262; font-weight: 900; }
        .admission-change-arrow-before .admission-change-line, .admission-change-arrow-after .admission-change-line { padding: 6px 8px; border-radius: 8px; }
        @media (max-width: 48rem) {
          .admission-change-arrow-row { grid-template-columns: 1fr; }
          .admission-change-arrow-icon { transform: rotate(90deg); }
          .admission-change-table-v87 th:nth-child(2), .admission-change-table-v87 td:nth-child(2) { width: 180px; }
        }
        .admission-score-table th, .admission-score-table td { padding: 8px 9px; }
        /* BLOCK2(2026-08-04): 석차등급 환산표(.admission-score-table)는 .admission-data-table의
           베이스 규칙(td.left { min-width:150px })을 그대로 상속해 col0/col1(둘 다 class="left")이
           150px씩 고정되고, 값은 40개 표 중 39개가 "100"(5자 이하)이라 대부분 유휴 공간이었다.
           그 결과 표 실폭이 래퍼(1014px)를 넘어 '비고' 열이 잘렸다. 모달 스코프에서만 min-width를
           풀고, 헤더(center)/데이터(기존 left) 중심선이 어긋나던 것도 center로 통일한다. */
        .admission-surface .admission-score-table td.left { min-width: 0; text-align: center; }
        .admission-record-info-table td:first-child { min-width: 160px; color: #013262; background: #f9fafb; font-weight: 950; }
        .admission-footnote { margin-top: 10px; color: #667085; font-size: 12.5px; line-height: 1.65; font-weight: 850; word-break: keep-all; }

        .admission-special-wrap { display: grid; gap: 16px; }
        .admission-special-block { display: grid; gap: 8px; }
        .admission-special-title { border-left: 4px solid #0b84fd; background: #e9f4ff; border-radius: 12px; padding: 10px 12px; color: #013262; font-size: 14px; line-height: 1.55; font-weight: 950; word-break: keep-all; }
        .admission-special-table { min-width: 860px; }
        .admission-special-table td { white-space: normal; word-break: keep-all; line-height: 1.55; }
        .admission-special-table td:first-child { min-width: 150px; background: #f9fafb; color: #013262; font-weight: 950; }
        /* WARN8(2026-08-04): 통합 자료 보기(별도분류 대학, 경찰대/과학기술원/사관학교) 모달은
           8종의 서로 다른 표 스키마(2~6열)가 섞여 있어 최저학력기준류처럼 컬럼별 %고정 배분을
           적용할 수 없다(컬럼 의미가 표마다 다름 — 실측 근거 참고).
           1차 시도(width:max-content !important로 모바일과 동일한 콘텐츠기반 자동폭+가로스크롤을
           데스크톱에도 적용)는 실측 결과 무효였다 — htmlTable()이 idx 0·1 두 컬럼 모두에
           class="left"를 부여하는데(admissionParsing.js:308), 베이스(비모달) 규칙
           .admission-table-wrap td.left { min-width:160px }가 두 컬럼 모두를 인위적으로
           최소 160px까지 부풀려(예: "학년도"/"모집인원" 두 컬럼이 나란히 408px) table-layout:auto의
           max-content 계산 자체가 왜곡됐다. width 트릭 대신 BLOCK2(석차등급 환산표)와 동일하게
           원인(min-width:160px 상속)을 모달 스코프에서 제거해 콘텐츠 실수요대로 자동 배분되게
           한다. 헤더(center)/본문(기존 left) 정렬 불일치도 나머지 6종 모달과 동일하게 center로
           통일한다. */
        .admission-surface .admission-special-table td.left { min-width: 0; text-align: center; }
        .admission-surface .admission-raw-section-wrap,
        .admission-surface .admission-existing-html { background: #fff; border: 0; border-radius: 0; padding: 0; }
        .admission-surface .admission-table-wrap { background: #fff; }
        ${
          showSectionTitle
            ? ".admission-surface .admission-hwp-section-title { margin: 0 0 8px 0; color: #013262; font-size: 14px; line-height: 1.3; font-weight: 950; letter-spacing: -0.03em; }"
            : ".admission-surface .admission-hwp-section-title { display: none; }"
        }
        .admission-surface .admission-result-note,
        .admission-surface .admission-recruit-legend { display: none !important; }
        .admission-surface .admission-special-title,
        .admission-surface .admission-subtitle-line { margin-top: 8px; border: 0; border-left: 0; border-radius: 0; background: transparent; color: #000; padding: 0; font-size: 13px; line-height: 1.45; font-weight: 950; }
        .admission-surface .admission-scroll-table { border: 0; border-radius: 0; background: #fff; }
        /* WARN20: 3종 실측(첫 컬럼·헤더 강조 없음, #525252 Medium 통일)과 동일한 원칙을
           나머지 카테고리의 소제목에도 일관 적용 — 네이비/900 강조를 평문으로 되돌린다. */
        .admission-surface .admission-subhead { color: #525252; font-weight: 500; }
        /* Figma 1882:4416(전년도와 차이점)/1882:4934(전형방법)/1882:5487(최저학력기준) 실측 재구현.
           세로 그리드 없이 가로선만: 헤더 상단 #000 1px, 바디 행 구분선 #dfdfdf 1px, 테이블 하단 #000 1px.
           셀 16px(1rem) Pretendard Medium(500) #525252, 행 높이 63px 상당(1.25rem 1rem 패딩으로 재현).
           주의(2026-08-04 발견): 아래 선택자(...admission-table-wrap table)는 class 2개+type 1개로
           specificity (0,2,1)이라 개별 표(.admission-selection-table 등, class 2개=(0,2,0))의
           table-layout:fixed보다 항상 우선해 auto로 되돌려버린다 — 6종 모달 전부의 %/rem 컬럼폭
           배분이 "고정폭"이 아니라 콘텐츠에 흔들리는 힌트로만 동작하던 잠재 결함. 각 표 규칙에
           !important로 fixed를 강제해 원래 의도(모든 컬럼 폭 주석의 rem/px 산술)를 되살렸다. */
        .admission-surface .admission-data-table,
        .admission-surface .admission-existing-html table,
        .admission-surface .admission-table-wrap table { width: 100%; border-collapse: collapse; border-top: none; border-bottom: 1px solid #000; font-size: 1rem; line-height: 1.4; table-layout: auto; }
        .admission-surface .admission-data-table th,
        .admission-surface .admission-existing-html th,
        .admission-surface .admission-table-wrap th { background: #f9fafb !important; color: #525252 !important; border: 0; border-top: 1px solid #000; padding: 1.25rem 1rem; font-weight: 500; letter-spacing: -0.02em; text-align: center; white-space: nowrap; }
        .admission-surface .admission-data-table td,
        .admission-surface .admission-existing-html td,
        .admission-surface .admission-table-wrap td { border: 0; border-top: 1px solid #dfdfdf; padding: 1.25rem 1rem; color: #525252; font-weight: 500; letter-spacing: -0.02em; vertical-align: middle; }
        /* 모바일은 시안(데스크톱 1260px 폭) 그대로 적용 시 고정폭 컬럼이 과도하게 좁아져
           1~2글자 단위 줄바꿈이 발생 → 폰트/패딩만 축소해 가독성 회귀 방지. */
        @media (max-width: 48rem) {
          .admission-surface .admission-data-table,
          .admission-surface .admission-existing-html table,
          .admission-surface .admission-table-wrap table { font-size: 0.8125rem; line-height: 1.4; }
          .admission-surface .admission-data-table th,
          .admission-surface .admission-existing-html th,
          .admission-surface .admission-table-wrap th,
          .admission-surface .admission-data-table td,
          .admission-surface .admission-existing-html td,
          .admission-surface .admission-table-wrap td { padding: 0.625rem 0.5rem; }
          /* 375px 스모크에서 발견: word-break:keep-all은 공백 없는 한국어 토큰(예: "지역균형",
             "학교장추천")을 줄바꿈하지 못해, 컬럼 폭이 극도로 좁아지는 모바일에서 텍스트가
             셀 경계를 넘어 옆 컬럼과 겹쳐 보인다. overflow-wrap:anywhere를 함께 줘서 다른
             줄바꿈 지점이 없을 때만 강제로 줄바꿈하도록 안전장치를 추가한다(넓은 화면/충분한
             폭에서는 자연 줄바꿈이 우선되므로 시안 재현에 영향 없음). */
          .admission-surface table td,
          .admission-surface table th { overflow-wrap: anywhere; }
        }
        /* 1882:4934/5487 실측: 첫 컬럼(전형 등) 색상·굵기 강조 없음 — 나머지 셀과 완전히 동일한
           배경/색/굵기(#525252, Medium 500). 과거 네이비·볼드 강조는 시안 근거가 없어 평문으로 되돌린다. */
        .admission-surface .admission-data-table td:first-child,
        .admission-surface .admission-selection-table .selection-type-cell,
        .admission-surface .admission-record-info-table td:first-child,
        .admission-surface .admission-special-table td:first-child,
        .admission-surface .admission-normalized-recruit-table td:first-child { background: #fff; color: #525252; font-weight: 500; }
        .admission-surface .admission-change-line,
        .admission-surface .admission-bullet-list li,
        .admission-surface .admission-text-line { border: 1px solid #d7d7d7; border-radius: 0; background: #fff; color: #525252; }
        /* WARN13(1882:4416): 시안은 변경 전/후를 알약·색상 박스 없이 "A → B" 순수 텍스트
           한 줄로 표기한다. 현재 DB 207/207행은 이미 admission-change-plain-cell 경로만
           쓰지만(이 박스 경로는 비활성 legacy), 재발 방지를 위해 박스 자체도 완전히
           무장식으로 리셋해둔다. */
        .admission-surface .admission-change-arrow-before,
        .admission-surface .admission-change-arrow-after { border: 0; border-radius: 0; background: transparent; padding: 0; color: #525252; }
        .admission-surface .admission-change-arrow-icon { color: #525252; }

        /* 1882:4934 실측: 최저 컬럼 알약(pill) 배지 크롬 제거, 값만 평문으로. */
        .admission-surface .admission-minimum-badge { display: inline; min-width: 0; max-width: none; border: 0; border-radius: 0; background: transparent; padding: 0; color: #525252; font-size: 1rem; font-weight: 500; line-height: 1.4; white-space: normal; }
        .admission-surface .admission-minimum-badge.has,
        .admission-surface .admission-minimum-badge.none { color: #525252; }

        /* 1882:4934 컬럼 폭 실측(전형180/전형명240/인원180/최저180 고정 + 전형방법 flex 잔여) 재현.
           기존엔 4/5번째 컬럼 폭이 뒤바뀌어 전형방법(내용이 가장 긴 컬럼)이 오히려 가장 좁았다 —
           고정 4컬럼만 폭을 주고 전형방법은 width 미지정으로 남겨 table-layout: fixed 아래에서
           잔여 폭을 전부 가져가게 한다. 5개 컬럼 전부 center 정렬(시안 실측), 전형명/전형방법의
           좌측정렬(.left)도 제거한다.
           2026-08-04 재실측(29개 대학·103행): 데스크톱 모달 표 총폭은 78vw가 70rem 캡에
           걸리는 vw>=1436px 구간에서만 1014px로 고정되며(1280px에서 약892px, 1366px에서
           약960px — WARN12 정정), 그 폭 기준으로 시안 고정값(180/240/180/180=780px) 대비
           핵심 콘텐츠 컬럼인
           전형방법(auto)의 실제 렌더 폭은 234px뿐이라 wrap률이 48.5%까지 치솟았다. 전형(자연폭
           median/p80/max 전부 59px)·인원(median58/max71px, 숫자 전용)·최저(p95 73px)는 실수요
           대비 과잉 배정이었으므로 4컬럼을 6.5/13.5/7/7.5rem(합 34.5rem=552px)로 축소하고,
           남는 462px을 전형방법(auto)에 되돌려 wrap률을 48.5%→17.5%로 낮춘다.
           BLOCK4(2026-08-04): 위 rem 고정합(34.5rem=552px)은 모달 시트 실폭이
           0.78*vw-96(md:px-12)-10(scrollbar-gutter) 인 769~844px 뷰포트(iPad Air 820px,
           iPad Pro 11" 834px 등)에서 552px를 밑돌아 auto 열(전형방법)이 0px로 붕괴한다.
           rem 고정 배분을 데스크톱 확정 구간에서만 적용하고, 그 아래는 아래 %기반 모바일
           규칙이 이어받도록 한다. 최초에는 경계를 552px가 딱 넘는 지점(53rem)으로 잡았으나,
           실측(table-layout:fixed !important 적용 후 재검증) 결과 552~702px 사이(예: 900px
           뷰포트, 표 실폭 596px)에서는 col5가 0은 아니어도 44px로 압축돼 word-break:keep-all과
           충돌해 실제로 표가 컨테이너를 넘치는(overflow) 사례를 발견했다. col5가 최소
           ~150px(중앙값 199px 콘텐츠가 1~2줄에 들어갈 여유)를 확보하는 지점까지 경계를
           65rem(1040px)으로 올린다: 0.78*1040-106=705px, col5=705-552=153px. */
        .admission-surface .admission-selection-table { table-layout: fixed !important; width: 100%; min-width: 0; }
        @media (min-width: 65rem) {
          .admission-surface .admission-selection-table th:nth-child(1),
          .admission-surface .admission-selection-table td:nth-child(1) { width: 6.5rem; min-width: 0; text-align: center; }
          .admission-surface .admission-selection-table th:nth-child(2),
          .admission-surface .admission-selection-table td:nth-child(2) { width: 13.5rem; min-width: 0; text-align: center; white-space: normal; word-break: keep-all; }
          .admission-surface .admission-selection-table th:nth-child(3),
          .admission-surface .admission-selection-table td:nth-child(3) { width: 7rem; min-width: 0; text-align: center; }
          .admission-surface .admission-selection-table th:nth-child(4),
          .admission-surface .admission-selection-table td:nth-child(4) { width: 7.5rem; min-width: 0; max-width: none; text-align: center; white-space: normal; word-break: keep-all; }
          .admission-surface .admission-selection-table th:nth-child(5),
          .admission-surface .admission-selection-table td:nth-child(5) { width: auto; min-width: 0; max-width: none; text-align: center; white-space: normal; word-break: keep-all; padding-left: 1rem; padding-right: 1rem; }
        }

        /* 최저학력기준 모달 컬럼 폭 실측 재배분(2026-08-04, 18개 대학·89행 DB 실측):
           각 컬럼 자연폭(줄바꿈 없이 필요한 폭) 분포 — 전형 중앙값86/p95 127/최대174px(예:
           "일반, 가톨릭지도자추천"), 대상 중앙값100/p80 222px, 반영 영역 중앙값=p80 309px(예:
           "국어 반영 / 수학 반영 / 영어 반영 / 탐구 2과목"), 최저 중앙값65/최대72px, 비고
           중앙값39(대부분 빈값)/p80 242px(예: "탐구 영역 2개 과목 평균 (소수점 이하 버림)").
           기존 10%/flex(~28%)/40%/8%/14%는 반영 영역·최저·대상이 실수요보다 과다, 전형·비고가
           과소해 짧은 전형/비고가 잦은 줄바꿈이 났다. 실측 분포에 맞춰 18%/21%/31%/8%/22%로
           재배분(전형·비고 확대, 대상·반영 영역 축소, 최저 유지) — 표 전체 1014px 기준 각 컬럼
           내용 상자가 p80~p95 구간을 커버하도록(전형은 최댓값 174px 케이스까지 1줄로 커버하려
           31%(반영 영역)에서 1%p를 옮겨 18%로 소폭 확대).
           WARN6(2026-08-04) 후속: 29개 표 재실측 결과 16/29가 전형 전 행 5자 이하("일반" 등)라
           18%도 여전히 과잉이었고, 반대로 대상(21%)은 4건에서 5~7줄 wrap이 남았다. 전형을
           12%로 축소하고 남는 폭을 대상(27%)으로 이전한다(반영영역/최저/비고는 유지). */
        /* 2026-08-06 제거: .admission-surface .admission-minimum-table 클래스 기반
           폭 규칙(구) — dev DB 실측 결과 minimum_requirements_html 207/207건 전부
           이 클래스를 갖지 않아(순수 admission-data-table만 저장) 지금 단 한 셀에도
           적용되지 않는다(BLOCK5, 아래 :nth-child([data-section="minimum_requirements"])
           규칙이 실제 적용 경로다). 구조화 렌더(ADMISSION_JSON_ENABLED)가 켜지면
           React 렌더러가 이 클래스를 실제로 붙이므로, 규칙을 되살려두면 그 시점에
           화면이 갑자기 바뀐다 — 사용자 결정(현행 모습 유지)에 따라 규칙 자체를
           지운다. 클래스는 계속 붙지만(Gate A2용 renderDocToHtml 골든 유지) 대응
           규칙이 없어 화면은 그대로다. */

        /* 나머지 3종(대학별고사일/학생부반영방법/모집인원 및 입결)도 동일 디자인 언어로 정렬 —
           장식 없음, 헤더 배경·룰은 위 공통 규칙을 그대로 상속, 컬럼 수에 맞춘 합리적 폭 배분,
           균일 행 높이(공통 padding 1.25rem 1rem 상속). */
        /* 대학별고사일 모달 컬럼 폭 재배분(2026-08-04, 14개 대학·48행 실측): 3번째(일정) 컬럼은
           기존 35% 배정에 실제 콘텐츠 최댓값이 173px(약 18%)에 불과해 대부분 과잉 여백이었고,
           2번째(대상) 컬럼은 45% 배정에도 p95 730px 케이스가 잦아 줄바꿈이 남았다. 일정을
           20%로 줄이고 대상을 63%로 늘려 재배분(전형은 17%로 소폭 축소, 실측 p95 164px 커버).
           BLOCK1 재수정(2026-08-04, 가천대학교(성남) 실측): 위 재배분은 23개교 표본에선
           타당했으나, 모집단위를 '전형' 셀에 나열해 183자까지 들어가는 극단 케이스(가천대(성남))가
           17%(172px)에서 1512px 19줄/375px 75줄로 붕괴했다. 1·2열을 40%/40%로 재배분해 '전형'
           열에도 안전 여유를 준다(대상 63%→40%도 p80 303px 기준 여전히 넉넉히 커버). */
        /* 2026-08-06 제거: .admission-surface .admission-exam-table 클래스 기반
           폭 규칙(구) — dev DB 실측 결과 exam_schedule_html 207/207건 전부 이
           클래스를 갖지 않아 지금 적용되지 않는다(BLOCK5, 아래
           [data-section="exam_schedule"] 규칙이 실제 적용 경로다). 사유는 바로
           위 admission-minimum-table 제거 사유와 동일(구조화 렌더 켜져도 화면
           불변 유지). */

        /* 학생부반영방법 모달 컬럼 폭 재배분(2026-08-04, 30개 대학·39행 실측): 구분(라벨) 컬럼은
           기존 25%(≈254px)가 최대 필요치보다 과잉이었다. 20%(≈203px)로 축소하고 남는 여백을
           내용(서술형 반영 규정 텍스트, p80 1238px/최대 2375px)으로 넘겨 80%로 확대한다.
           WARN12 정정: 위 "중앙값160/p80 160/최대179.5px"는 39행(608행 중 6.4%) 표본 실측치이자,
           표본 자체가 line 1733의 전역 min-width:160px에 클램프된 렌더 폭을 잰 것이라 자연폭이
           아니다(진짜 자연폭 median/p80/p95는 약71px, 최대 427px). 표본 부족으로 최댓값을
           놓쳤을 가능성이 있어 20%도 보수적으로 유지했었음.
           WARN7(2026-08-04) 후속: 43개 표 재실측 결과 35/43이 전 행 5자 이하 라벨("반영교과"
           등)이라 20%도 여전히 과잉 — 14%로 추가 축소하고 남는 폭을 내용(86%)으로 이전한다. */
        .admission-surface .admission-record-info-table { table-layout: fixed !important; width: 100%; min-width: 0; }
        .admission-surface .admission-record-info-table th:nth-child(1),
        .admission-surface .admission-record-info-table td:nth-child(1) { width: 14%; min-width: 0; text-align: center; white-space: normal; word-break: keep-all; }
        .admission-surface .admission-record-info-table th:nth-child(2),
        .admission-surface .admission-record-info-table td:nth-child(2) { width: 86%; text-align: center; white-space: normal; word-break: keep-all; }
        /* 375px 실측: line 1733의 전역 td:first-child(min-width: 160px)가 모바일에서
           20/80 비율을 무력화해 구분 컬럼을 강제로 약 52%(160px)까지 부풀리고 내용 컬럼을
           150px로 짓눌렀다. 모바일 폭에서만 min-width를 콘텐츠 실수요(약 70~90px)에 맞춰
           4.5rem(72px)로 낮춰 내용 컬럼에 여백을 돌려준다. */
        @media (max-width: 48rem) {
          .admission-surface .admission-record-info-table td:first-child { min-width: 4.5rem; }
        }

        ${
          showChangeNoColumn
            ? "" /* 번호 컬럼을 되살릴 땐 위 베이스 admission-change-table-v87 규칙(58px/260px/auto)이
                  그대로 적용된다 — 36%/64% 재분배는 2컬럼 전제라 3컬럼(번호 포함)엔 안 맞으므로
                  아예 규칙을 안 낸다(=Admin.jsx가 지시받은 "되살려라"). */
            : `/* 2026-08-06 컴포넌트화(사용자 지시) — surface별로 갈리는 두 항목 중 나머지 하나.
           공개(1882:4416 실측): 시안엔 번호 컬럼이 없는 2컬럼(변경 항목 36% / 변경 내용
           64%) 표다. 기존 구현은 번호 컬럼(3컬럼)을 포함하므로 기본(showChangeNoColumn=false)
           은 숨기고 남은 2컬럼 폭을 재분배한다 — 데이터 자체(3컬럼 구조)는 바꾸지 않는다. */
        .admission-surface .admission-change-table-v87 th:nth-child(1),
        .admission-surface .admission-change-table-v87 td:nth-child(1) { display: none; }
        .admission-surface .admission-change-table-v87 th:nth-child(2),
        .admission-surface .admission-change-table-v87 td:nth-child(2) { width: 36%; text-align: center; }
        .admission-surface .admission-change-table-v87 th:nth-child(3),
        .admission-surface .admission-change-table-v87 td:nth-child(3) { width: 64%; text-align: center; }`
        }

        /* BLOCK5: 최저학력기준(minimum_requirements)·대학별고사일(exam_schedule)은 실제 DB
           html 126/180행이 admission-minimum-table/admission-exam-table 클래스를 갖지 않고
           순수 admission-data-table만 저장돼 있어(파서 fallback만 쓰이는 신규 클래스는 미도달)
           위 클래스 기반 폭 규칙이 무효화된다. 클래스 유무와 무관하게 열린 section.key
           (data-section, 이 요소에 사용처가 직접 세팅)를 기준으로 위치(:nth-child) 규칙을
           강제해 DB 실측 데이터에도 동일하게 적용되도록 한다. */
        .admission-surface[data-section="minimum_requirements"] table { table-layout: fixed !important; width: 100%; min-width: 0; }
        .admission-surface[data-section="minimum_requirements"] table th:nth-child(1),
        .admission-surface[data-section="minimum_requirements"] table td:nth-child(1) { width: 12%; min-width: 0; text-align: center; white-space: normal; word-break: keep-all; }
        .admission-surface[data-section="minimum_requirements"] table th:nth-child(2),
        .admission-surface[data-section="minimum_requirements"] table td:nth-child(2) { width: 27%; min-width: 0; text-align: center; white-space: normal; word-break: keep-all; }
        .admission-surface[data-section="minimum_requirements"] table th:nth-child(3),
        .admission-surface[data-section="minimum_requirements"] table td:nth-child(3) { width: 31%; min-width: 0; text-align: center; white-space: normal; word-break: keep-all; }
        .admission-surface[data-section="minimum_requirements"] table th:nth-child(4),
        .admission-surface[data-section="minimum_requirements"] table td:nth-child(4) { width: 8%; min-width: 0; text-align: center; white-space: normal; word-break: keep-all; }
        .admission-surface[data-section="minimum_requirements"] table th:nth-child(5),
        .admission-surface[data-section="minimum_requirements"] table td:nth-child(5) { width: 22%; min-width: 0; text-align: center; white-space: normal; word-break: keep-all; }

        .admission-surface[data-section="exam_schedule"] table { table-layout: fixed !important; width: 100%; min-width: 0; }
        .admission-surface[data-section="exam_schedule"] table th:nth-child(1),
        .admission-surface[data-section="exam_schedule"] table td:nth-child(1) { width: 40%; min-width: 0; text-align: center; white-space: normal; word-break: keep-all; }
        .admission-surface[data-section="exam_schedule"] table th:nth-child(2),
        .admission-surface[data-section="exam_schedule"] table td:nth-child(2) { width: 40%; min-width: 0; text-align: center; white-space: normal; word-break: keep-all; }
        .admission-surface[data-section="exam_schedule"] table th:nth-child(3),
        .admission-surface[data-section="exam_schedule"] table td:nth-child(3) { width: 20%; min-width: 0; text-align: center; white-space: normal; word-break: keep-all; }

        /* WARN10(2026-08-04): 375px에서 일정 셀("10.31.(토)~11.01.(일)")이 공백 없는 날짜
           토큰 중간에서 쪼개짐 — 모바일 전용 overflow-wrap:anywhere(아래 48rem 블록)가
           word-break:keep-all보다 우선 적용돼 발생. 일정 컬럼만 예외로 되돌린다. */
        @media (max-width: 48rem) {
          .admission-surface[data-section="exam_schedule"] table td:nth-child(3) { overflow-wrap: normal; word-break: keep-all; }
        }

        /* WARN19: 전형방법 모달 컬럼폭이 rem 고정값(합 48.75rem)이라 48rem 미만(모바일)에서
           고정폭 합이 컨테이너 폭을 넘어 5번째(전형방법) 컬럼이 0에 가깝게 수축한다.
           모바일 폭에서만 %로 전환해 비율을 유지한 채 함께 줄어들도록 한다.
           BLOCK4: 데스크톱 rem 규칙이 min-width:65rem로 스코프됐으므로 이 %규칙의 상한도
           동일하게 65rem으로 올려, rem 고정 배분이 col5를 지나치게 좁게 만드는 552~702px
           구간(간극)까지 %기반으로 이어받는다.
           WARN11(2026-08-04): 기존 14/19/14/14(잔여39)는 데스크톱 재실측(전형 max31px,
           인원 max40px 상당)과 같은 근거로 과잉 배정이었다 — 375px 표 실폭(약295px) 기준
           전형방법 콘텐츠가 99px로 눌려 전 행이 wrap됐다. 전형/인원/최저를 축소하고 남는
           폭을 전형방법(잔여, 54% 이상)에 되돌린다. */
        @media (max-width: 65rem) {
          /* BLOCK4 검증 중 발견: 베이스(비모달) .admission-selection-table th/td:nth-child(N)의
             min-width(82/210/72/420/82)·max-width(760/110)가 동일 specificity라 소스 순서상
             여전히 살아있어, width:%가 min-width에 눌려 무력화되고 있었다(예: 820px에서 col1이
             9%(약48px)가 아니라 min-width 82px로 렌더). % 규칙에도 desktop 블록과 동일하게
             min-width:0/max-width:none을 명시해 실제로 반영되게 한다. */
          .admission-surface .admission-selection-table th:nth-child(1),
          .admission-surface .admission-selection-table td:nth-child(1) { width: 9%; min-width: 0; max-width: none; }
          .admission-surface .admission-selection-table th:nth-child(2),
          .admission-surface .admission-selection-table td:nth-child(2) { width: 19%; min-width: 0; max-width: none; }
          .admission-surface .admission-selection-table th:nth-child(3),
          .admission-surface .admission-selection-table td:nth-child(3) { width: 9%; min-width: 0; max-width: none; }
          .admission-surface .admission-selection-table th:nth-child(4),
          .admission-surface .admission-selection-table td:nth-child(4) { width: 9%; min-width: 0; max-width: none; }
          .admission-surface .admission-selection-table th:nth-child(5),
          .admission-surface .admission-selection-table td:nth-child(5) { width: auto; min-width: 0; max-width: none; padding-left: 0.5rem; padding-right: 0.5rem; }
        }

        /* 최저학력기준 모달 375px 실측: 데스크톱 비율(최저 8%) 그대로면 모바일 표 폭(약
           285px)에서 최저 컬럼이 23px까지 줄어 "최저" 헤더 두 글자가 세로로 쪼개진다.
           가로 스크롤은 없지만 가독성이 떨어져 모바일 폭에서만 최저를 15%로 넓히고 반영
           영역·비고에서 나눠 빌려온다(전형18/대상21/반영영역27/최저15/비고19). */
        @media (max-width: 48rem) {
          .admission-surface[data-section="minimum_requirements"] table th:nth-child(3),
          .admission-surface[data-section="minimum_requirements"] table td:nth-child(3) { width: 27%; }
          .admission-surface[data-section="minimum_requirements"] table th:nth-child(4),
          .admission-surface[data-section="minimum_requirements"] table td:nth-child(4) { width: 15%; }
          .admission-surface[data-section="minimum_requirements"] table th:nth-child(5),
          .admission-surface[data-section="minimum_requirements"] table td:nth-child(5) { width: 19%; }
        }

    `}</style>
  );
}
