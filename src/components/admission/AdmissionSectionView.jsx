import { isEmptyDoc } from "../../lib/admissionDoc";
import {
  getSectionTitleText,
  stripHtmlToText,
} from "../../lib/admissionParsing";
import { renderBlock } from "./blocks/renderBlock";

// 구조화 문서(AdmissionDoc) 진입점. 설계 문서 §5.2/§5.3 정본.
//
// - doc.v !== 1 이거나 blocks가 비었으면 아무것도 렌더하지 않는다(호출부가
//   html/text 폴백으로 넘어가야 한다 — 조용한 성공 금지, §2 결정 요약 2번).
// - 섹션 제목은 doc에 담기지 않는다. getSectionTitleText(admissionParsing.js:160,
//   HWP_SECTION_TITLES/HWP_SECTION_LABELS 조회)로 항상 렌더하고, 숨김 여부는
//   기존 CSS(공개 모달 display:none / 어드민 노출)에 위임한다
//   (withHwpSectionHeading:248 재현 — 제목 div는 admission-raw-section-wrap의
//   형제로, 그 안이 아니다).
// - 제목 중복 방지(2026-08-06 dev DB 실측 확정 — previous_year_changes_html
//   207/207, selection_method_html 218/218, minimum_requirements_html
//   81/207, exam_schedule_html 28/207이 이미 선두에 admission-hwp-section-title
//   을 품고 있다. 총 534셀. 공개 모달은 display:none이라 안 보이지만 어드민은
//   노출돼 있어 그대로 두면 doc.blocks[0]이 그 curated-html을 RawHtmlBlock으로
//   승계할 때 제목이 두 번 찍힌다): withHwpSectionHeading이 하는 것과 동일하게
//   doc.blocks[0]이 rawHtml이고 stripHtmlToText(그 html)이 이미 heading으로
//   시작하면 제목을 생략한다. legacy와 동일하게 문자열 비교이지 doc 내용을
//   구조적으로 파싱하지 않는다.
// - 루트는 admission-raw-section-wrap, wrapModifier==='special'이면
//   ' admission-special-wrap'을 덧붙인다.
// - 허용 diff 2종(빈 admission-result-note / 빈 admission-recruit-legend)은
//   의도적으로 렌더하지 않는다 — HTML 미러 렌더러(renderDocToHtml)는 바이트
//   재현을 위해 출력하지만, 이 컴포넌트는 SECTION_NOTES가 6키 전부 ''인
//   현재 데이터에서 항상 빈 채로 나오는 두 div를 생략한다(Gate B 허용 diff).
function firstBlockAlreadyHasHeading(doc, heading) {
  if (!heading) return false;
  const firstBlock = doc.blocks[0];
  if (!firstBlock || firstBlock.kind !== "rawHtml" || !firstBlock.html)
    return false;
  return stripHtmlToText(firstBlock.html).startsWith(heading);
}

export default function AdmissionSectionView({
  doc,
  sectionKey,
  surface = "public",
}) {
  if (doc?.v !== 1 || isEmptyDoc(doc)) return null;

  const heading =
    getSectionTitleText(sectionKey) || getSectionTitleText(doc.section);
  const title = firstBlockAlreadyHasHeading(doc, heading) ? "" : heading;
  const wrapClassName =
    doc.wrapModifier === "special"
      ? "admission-raw-section-wrap admission-special-wrap"
      : "admission-raw-section-wrap";

  // surface는 현재 마크업에 영향을 주지 않는다(설계 문서 §5.2 — 로깅/경고
  // 배지 용도로 예약, 공개/어드민 DOM은 동일해야 한다). 미사용 경고 방지용
  // 참조만 남겨둔다.
  void surface;

  return (
    <>
      {title ? (
        <div className="admission-hwp-section-title">{title}</div>
      ) : null}
      <div className={wrapClassName}>
        {doc.blocks.map((block, idx) => renderBlock(block, idx))}
      </div>
    </>
  );
}
