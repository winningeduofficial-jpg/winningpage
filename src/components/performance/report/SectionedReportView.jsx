import { useId } from 'react';
import { renderBlock } from '../../admission/blocks/renderBlock';

// 리포트류 화면(§5.11 주제 상세 모달 / §5.13 설계 리포트 / §5.16 평가 리포트)이 공유하는
// "섹션 라벨 + 본문" 렌더러 — docs/수행평가-상세-명세.md §10.2 P9가 `SectionedReportView`
// 신설을 명시한 그 컴포넌트다. §8.5 단정 「섹션 라벨 렌더는 신규 `SectionedReportView`가
// 담당한다」 — 이 컴포넌트가 **섹션 껍데기(라벨 + 위계 + 접근성)를 단독으로 소유**한다.
//
// ── 본문 형태 2종 (P10에서 두 번째가 추가됐다)
//   ① `text` — 평문 단락 1개(1rem w500 `ink-sub`). §5.11 「본문 구조 (단정)」이 전제하는
//      2요소 구조다. 하위 키-값도 목록도 없다.
//   ② `blocks` — §8.5 블록 배열(`keyValue`/`plainList`/`group`/…). §5.13 설계 리포트처럼
//      섹션 내부가 `키: 값` + 중첩 목록인 구조다(§5.13 「본문 내부 하위 구조」).
//   한 섹션은 둘 중 **하나**만 갖는다. 둘 다 있으면 `blocks`가 이긴다(더 구체적인 계약).
//
// **역할 경계 — 이 컴포넌트 ↔ 블록 뷰(`renderBlock` + `blocks/*`)**
//   · 섹션 **바깥**(라벨 `<h3>`, `aria-labelledby`, 섹션 간 gap 2.5rem, 라벨↔본문 gap
//     0.5rem, 빈 섹션 제거)은 전부 이 컴포넌트 책임이다.
//   · 섹션 **안**의 마크업(키-값 행, 목록, group 중첩)은 전부 블록 뷰 책임이고 이 컴포넌트는
//     `renderBlock`에 그대로 넘긴다 — §5.13 하위 구조를 여기서 다시 해석하지 않는다.
//   · 블록의 **모양(색·굵기·보더·간격)** 은 둘 다의 책임이 아니다. 블록 뷰는 admission-*
//     클래스 이름만 내고, 수행평가 룩은 `PerformanceReportSurface`가 그 클래스에 CSS를
//     입힌다(§6.2 「`AdmissionSurface`는 재사용 불가 — 스타일 신설 필요」). 즉 `blocks`를
//     쓰는 호출부는 **반드시 `PerformanceReportSurface`로 감싸야 한다** — 감싸지 않으면
//     대입 모집요강 룩(흰 카드 + `#d7d7d7` 보더 + 13.5px w800)이 새거나, 그쪽 CSS가
//     로드되지 않은 라우트에서는 무스타일 평문이 된다.
//
// **빈 섹션 처리**: `text`가 없는 섹션은 통째로 렌더하지 않는다(`PerformanceSidebar`가 빈
// 프로필 값의 줄을 통째로 빼는 관례와 동일 — 없는 자리에 플레이스홀더 문구를 지어내지 않는다).
// 섹션이 전부 비면 이 컴포넌트는 `null`을 반환한다 — 호출부가 별도 빈 상태 문구를 원하면
// 그건 호출부(모달) 몫이다(스텁을 여기서 만들지 않는다). 호출부가 렌더 전에 "빈 상태인가"를
// 미리 알아야 하는 경우(예: 확정 버튼 비활성화) `getVisibleSections`를 그대로 재사용한다 —
// 필터 로직을 두 곳에서 따로 구현하면 갈라질 위험이 있다.
//
// **필터 조건**: `label`이 `typeof === 'string'`이고 trim 후 비어있지 않아야 하며, 본문이
// `text`(비어있지 않은 문자열) **또는** `blocks`(비어있지 않은 배열) 중 하나로 실재해야 한다.
// 현재는 서버 계약(`buildDetail`·`buildSections`가 항상 문자열·라벨을 채움)상 문자열이 아닌
// 값이나 빈 라벨이 오지 않지만, 이 컴포넌트는 P11에서도 재사용될 전제라 계약을 코드로
// 못박는다 — `String(x || '')`는 객체를 `'[object Object]'`로 통과시키는 함정이 있고, `label`이
// 없으면 `<h3>`이 빈 채로 렌더되어 `aria-labelledby`가 가리키는 접근 이름이 공백이 된다.
//
// **접근성**: 라벨을 `<h3>`으로, 본문을 그 라벨을 가리키는 `<p>`로 두고 `<section
// aria-labelledby>`로 묶는다 — 라벨을 `<p>`로만 두면 스크린리더가 라벨과 본문을 구분하지
// 못한다. 호출부(다이얼로그)의 제목이 `<h2>`이므로 `<h3>`는 그 아래 위계와 자연스럽게
// 이어진다. `id`는 `useId()` 기반이라 같은 페이지에 여러 인스턴스가 떠도 충돌하지 않는다.
/** 본문이 실재하는가 — `blocks`(우선) 또는 `text`. */
function hasBody(section) {
  if (Array.isArray(section?.blocks)) return section.blocks.length > 0;
  return typeof section?.text === 'string' && section.text.trim() !== '';
}

/**
 * `sections`에서 실제로 렌더될 섹션만 걸러낸다(라벨이 비어있지 않고 본문이 실재하는 것).
 * 호출부가 렌더 전에 "빈 상태인가"를 미리 알아야 할 때 이 컴포넌트와 같은 판정을 쓰기
 * 위해 export한다(`TopicDetailModal`의 확정 버튼 비활성, `DesignReportModal`의 인쇄 버튼
 * 비활성).
 * @param {Array<{id?: string, label: string, text?: string, blocks?: object[]}>} [sections]
 * @returns {Array<{id?: string, label: string, text?: string, blocks?: object[]}>}
 */
export function getVisibleSections(sections) {
  return (Array.isArray(sections) ? sections : []).filter(
    (section) =>
      typeof section?.label === 'string' && section.label.trim() !== '' && hasBody(section)
  );
}

/**
 * @param {Array<{id?: string, label: string, text?: string, blocks?: object[]}>} [sections]
 * @param {string} [className] 섹션 목록 루트에 추가할 클래스.
 */
export default function SectionedReportView({ sections = [], className = '' }) {
  const baseId = useId();
  const visibleSections = getVisibleSections(sections);

  if (!visibleSections.length) return null;

  return (
    <div className={['flex flex-col gap-10', className].join(' ')}>
      {visibleSections.map((section, index) => {
        const headingId = `${baseId}-${section.id ?? index}`;
        return (
          <section key={section.id ?? index} aria-labelledby={headingId} className="flex flex-col gap-2">
            <h3
              id={headingId}
              className="text-[1rem] font-semibold leading-[1.3125rem] text-performance-reportHeading"
            >
              {section.label}
            </h3>
            {Array.isArray(section.blocks) ? (
              // §8.5 블록 배열. 마크업은 블록 뷰가, 룩은 `PerformanceReportSurface`가 갖는다
              // (상단 「역할 경계」 주석). 여기서 타이포 클래스를 얹으면 두 곳이 같은 속성을
              // 다투게 되므로 얹지 않는다.
              //
              // **최상위 블록 사이 간격은 이 래퍼가 소유한다**(§5.13 「섹션 내부 gap 0.5rem(8)」
              // = `gap-2`, 섹션 껍데기가 라벨↔본문에 쓰는 값과 같다). 상단 「역할 경계」의
              // "섹션 바깥 여백은 이 컴포넌트 책임"이 여기까지 이어진다 — 블록 뷰는 자기
              // **안쪽** 간격만 갖는다(`admission-readable-body`의 grid gap 등). 그래서
              // `PerformanceReportSurface`는 형제 블록 보정 규칙을 두지 않는다. 이 gap이
              // 없으면 한 섹션에 최상위 블록이 2개 이상일 때(예: `수행평가 전체 방향` =
              // keyValue + group + keyValue) 이음매가 0px이 되어 세 덩어리가 한 문단처럼 붙는다.
              <div className="flex flex-col gap-2">
                {section.blocks.map((block, blockIndex) => renderBlock(block, blockIndex))}
              </div>
            ) : (
              /* `break-words`(overflow-wrap: break-word) — 없으면 긴 무공백 문자열(URL 등)이
                 왔을 때 `overflow-y-auto` 컨테이너가 `overflow-x: auto`로도 계산돼 본문 안에
                 가로 스크롤바가 생긴다(검토 D-4). */
              <p className="whitespace-pre-wrap break-words text-[1rem] font-medium leading-[1.3125rem] text-ink-sub">
                {section.text}
              </p>
            )}
          </section>
        );
      })}
    </div>
  );
}
