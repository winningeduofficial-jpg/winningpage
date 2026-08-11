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
// 그건 호출부(모달) 몫이다(스텁을 여기서 만들지 않는다).
//
// **접근성**: 라벨을 `<h3>`으로, 본문을 그 라벨을 가리키는 `<p>`로 두고 `<section
// aria-labelledby>`로 묶는다 — 라벨을 `<p>`로만 두면 스크린리더가 라벨과 본문을 구분하지
// 못한다. 호출부(다이얼로그)의 제목이 `<h2>`이므로 `<h3>`는 그 아래 위계와 자연스럽게
// 이어진다. `id`는 `useId()` 기반이라 같은 페이지에 여러 인스턴스가 떠도 충돌하지 않는다.
/**
 * @param {Array<{id?: string, label: string, text: string}>} [sections]
 * @param {string} [className] 섹션 목록 루트에 추가할 클래스.
 */
export default function SectionedReportView({ sections = [], className = '' }) {
  const baseId = useId();
  const visibleSections = (Array.isArray(sections) ? sections : []).filter((section) =>
    String(section?.text || '').trim()
  );

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
            <p className="whitespace-pre-wrap text-[1rem] font-medium leading-[1.3125rem] text-ink-sub">
              {section.text}
            </p>
          </section>
        );
      })}
    </div>
  );
}
