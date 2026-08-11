import { useId } from 'react';

// 리포트류 화면(§5.11 주제 상세 모달 / §5.13 설계 리포트 / §5.16 평가 리포트)이 공유하는
// "섹션 라벨 + 본문" 렌더러 — docs/수행평가-상세-명세.md §10.2 P9가 `SectionedReportView`
// 신설을 명시한 그 컴포넌트다.
//
// **지금(P9) 다루는 형태는 딱 하나다**: 섹션마다 `라벨(1rem w600 `#1b5da0`=`performance-reportHeading`)
// + 평문 단락 1개(1rem w500 `ink-sub`)`뿐인 2요소 구조(§5.11 「본문 구조 (단정)」 — 하위
// 키-값이나 목록이 없다). §5.13/§5.16은 섹션 내부가 `키: 값` + 중첩 목록인 다른 구조이고
// (§5.13 「본문 내부 하위 구조」), 그 확장(`href`·`<ol>`·키-값 블록)은 P10 범위다 — 여기서
// 미리 만들지 않는다. 필요해지면 그때 `variant`/`items` 같은 prop을 얹을 것.
//
// **빈 섹션 처리**: `text`가 없는 섹션은 통째로 렌더하지 않는다(`PerformanceSidebar`가 빈
// 프로필 값의 줄을 통째로 빼는 관례와 동일 — 없는 자리에 플레이스홀더 문구를 지어내지 않는다).
// 섹션이 전부 비면 이 컴포넌트는 `null`을 반환한다 — 호출부가 별도 빈 상태 문구를 원하면
// 그건 호출부(모달) 몫이다(스텁을 여기서 만들지 않는다). 호출부가 렌더 전에 "빈 상태인가"를
// 미리 알아야 하는 경우(예: 확정 버튼 비활성화) `getVisibleSections`를 그대로 재사용한다 —
// 필터 로직을 두 곳에서 따로 구현하면 갈라질 위험이 있다.
//
// **필터 조건**: `text`/`label` 둘 다 `typeof === 'string'`이고 trim 후 비어있지 않아야 한다.
// 현재는 서버 계약(`buildDetail`이 항상 문자열·라벨을 채움)상 문자열이 아닌 값이나 빈 라벨이
// 오지 않지만, 이 컴포넌트는 P10/P11에서도 재사용될 전제로 만들어졌으므로 계약을 코드로
// 못박는다 — `String(x || '')`는 객체를 `'[object Object]'`로 통과시키는 함정이 있고, `label`이
// 없으면 `<h3>`이 빈 채로 렌더되어 `aria-labelledby`가 가리키는 접근 이름이 공백이 된다.
//
// **접근성**: 라벨을 `<h3>`으로, 본문을 그 라벨을 가리키는 `<p>`로 두고 `<section
// aria-labelledby>`로 묶는다 — 라벨을 `<p>`로만 두면 스크린리더가 라벨과 본문을 구분하지
// 못한다. 호출부(다이얼로그)의 제목이 `<h2>`이므로 `<h3>`는 그 아래 위계와 자연스럽게
// 이어진다. `id`는 `useId()` 기반이라 같은 페이지에 여러 인스턴스가 떠도 충돌하지 않는다.
/**
 * `sections`에서 실제로 렌더될 섹션만 걸러낸다(`text`·`label` 둘 다 문자열이고 비어있지 않은
 * 것). 호출부가 렌더 전에 "빈 상태인가"를 미리 알아야 할 때 이 컴포넌트와 같은 판정을 쓰기
 * 위해 export한다.
 * @param {Array<{id?: string, label: string, text: string}>} [sections]
 * @returns {Array<{id?: string, label: string, text: string}>}
 */
export function getVisibleSections(sections) {
  return (Array.isArray(sections) ? sections : []).filter(
    (section) =>
      typeof section?.text === 'string' &&
      section.text.trim() !== '' &&
      typeof section?.label === 'string' &&
      section.label.trim() !== ''
  );
}

/**
 * @param {Array<{id?: string, label: string, text: string}>} [sections]
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
            {/* `break-words`(overflow-wrap: break-word) — 없으면 긴 무공백 문자열(URL 등)이
                왔을 때 `overflow-y-auto` 컨테이너가 `overflow-x: auto`로도 계산돼 본문 안에
                가로 스크롤바가 생긴다(검토 D-4). */}
            <p className="whitespace-pre-wrap break-words text-[1rem] font-medium leading-[1.3125rem] text-ink-sub">
              {section.text}
            </p>
          </section>
        );
      })}
    </div>
  );
}
