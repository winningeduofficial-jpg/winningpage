import MetaTag from "./MetaTag";

// STEP3 추천 주제 카드 1장 — docs/수행평가-상세-명세.md §5.10(`3754:3629`/`3754:3746` 실측).
//
// ── 실측 (두 노드 좌표까지 동일)
//   카드      37.25rem×12.125rem(596×194) r1rem(=`rounded-2xl`) stroke `#d9d9d9`
//             (=`performance-line`), **fill 없음**(투명 — 말풍선 `#f8f7f5`와 다르다),
//             pad 1.25rem(20) 사방, 내부 VERTICAL gap 1rem(16).
//             내부 스택 4행(배지줄 30 + 제목 21 + 부제 21 + 태그줄 30)에 gap 16×3을 더하면
//             150이고 여기에 상하 인셋 20/24를 얹어 194가 나온다. 하단 인셋만 24로 실측되나
//             `InlineCard` 주석과 같은 이유(마지막 요소 자체 여백이 섞인 값)로 표 정본인
//             1.25rem(`p-5`)을 사방에 쓰고, **높이는 고정하지 않고 `min-h`로만 둔다** —
//             시안 3장은 전부 같은 더미 1줄 제목이지만(§5.10 단정) 실제 주제명은 2줄로
//             넘어가며, 고정 높이를 주면 그 순간 제목이 잘린다.
//   순번 배지 h1.875rem(30) r0.625rem(10) `fill #f8f7f5`(=`performance-bubble`) pad 0.375rem(6),
//             텍스트 0.875rem/1.125rem w500 ls -0.28px(=-0.0175rem) `#808080`(=`ink-sub`).
//   상세 링크 `자세히 보기 →` 0.875rem/1.125rem w500, 우측 정렬.
//   제목      1rem/1.3125rem(16/21) w500 `#525252`(=`ink`).
//   부제      1rem/1.3125rem w400 `#808080`(=`ink-sub`).
//   메타 태그 `MetaTag` ×4, gap 0.75rem(12).
//
// ── 결정 (§11.1 Q48) — **`onSelect`는 만들지 않는다**
//   카드에서 설계 리포트를 바로 확정하는 경로는 존재하지 않는다. 확정은 반드시 상세
//   모달(§5.11 `3754:4872`)을 경유하며, 이 컴포넌트가 노출하는 콜백은 `onDetail` **하나뿐**이다.
//   근거: ① 시안에서 확인되는 진입점은 `자세히 보기 →` 하나뿐 ② 설계 리포트 생성은
//   되돌릴 수 없는 생성 액션이라 근거를 읽고 확정하는 단계가 필요하다.
//   그래서 카드 안에 확정 버튼도 두지 않는다.
//
// ── 클릭 영역·접근성
//   히트 영역을 넓히기 위해 **카드 전체**가 클릭 대상이다(§5.10 확정). 명세와 작업 지시가
//   `role="button"` + `tabIndex=0` + Enter/Space 처리를 명시하므로 그대로 구현한다
//   (네이티브 `<button>`도 검토했으나 지시가 명시적이고, 버튼 기본 스타일 리셋이 추가로
//   필요해진다). Space는 `keydown`에서 기본 스크롤을 막아야 페이지가 튀지 않는다.
//   `자세히 보기 →`는 시각적 어포던스일 뿐 별도 포커스 대상이 아니다 — 카드 안에 또 다른
//   탭 정지점을 만들면 같은 동작에 도달하는 경로가 둘이 되어 스크린리더 사용자에게
//   중복으로 읽힌다. 그래서 `<span>`으로 두고 카드 하나만 포커스를 받는다.
//   `aria-label`은 주지 않는다 — 카드 내용(순번·제목·부제·태그)이 그대로 접근성 이름이
//   되는 편이 요약 라벨보다 정보량이 많다.
//
// ── 대비 (§5.10 「제안, 대비 이슈」)
//   `자세히 보기 →`의 **시안 원본 색은 `#d9d9d9`**이며 흰 배경 대비 약 1.6:1로 WCAG AA
//   (일반 텍스트 4.5:1) 미달이다. 명세 제안대로 `#808080`(=`ink-sub`)으로 상향했고, 이후
//   토큰 자체가 `#6b6b6b`로 상향되며 흰 배경 대비 5.33:1로 AA를 충족한다. 이 텍스트는
//   카드 전체가 이미 클릭 가능하다는 사실을 보조 표기할 뿐 유일한 정보 전달 수단이
//   아니지만, `ink-sub`는 §7.1이 정한 보조 텍스트 토큰이라 여기서 새 색을 창작하지
//   않았다.
//
// ── hover (시안 없음 — 제안)
//   §5.10이 "stroke `#d9d9d9` → 진한 값으로 전환 + `cursor: pointer`"만 정하고 구체 색은
//   제안으로 남겼다. 이미 있는 보조 텍스트 토큰 `ink-sub`(#6b6b6b)를 보더 색으로 재사용한다
//   — 새 값을 만들지 않으면서 한 단계 진해진다.
/**
 * @param {number} index 1-based 순번. 배지 문구 `추천 주제 {index}`에 그대로 들어간다.
 * @param {{id: string, title: string, subtitle: string, tags: string[]}} topic
 *   `recommend-topics` 응답의 주제 1건. **`subtitle`·`tags`는 모델 산출물이 아니라 서버
 *   조립값이다**(§8.3) — `subtitle`은 고정 문자열 `통합 수행평가 설계 리포트`,
 *   `tags`는 `[학년, 교과군/과목, 진로, '설계 리포트']` 세션 파생값이다. 클라이언트는
 *   조립하지 않고 받은 값을 그대로 렌더한다.
 * @param {(topic: object) => void} [onDetail] 카드 클릭/Enter/Space 시 호출. 상세 모달을
 *   여는 **유일한** 진입점이다(모달 자체는 P9).
 * @param {string} [className]
 */
export default function TopicCard({ index, topic, onDetail, className = "" }) {
  if (!topic) return null;

  const tags = Array.isArray(topic.tags) ? topic.tags.filter(Boolean) : [];

  function open() {
    onDetail?.(topic);
  }

  return (
    <button
      type="button"
      onClick={open}
      className={[
        "w-full max-w-perf-bubble cursor-pointer rounded-2xl border border-performance-line bg-transparent p-5 text-left",
        "min-h-[12.125rem] transition-colors hover:border-ink-sub",
        "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary",
        className,
      ].join(" ")}
    >
      <div className="flex flex-col gap-4">
        <div className="flex items-center justify-between gap-3">
          {/* 순번 배지 — 실측 h30 r10 `#f8f7f5`, pad 6. */}
          <span className="inline-flex h-[1.875rem] shrink-0 items-center rounded-[0.625rem] bg-performance-bubble px-1.5 text-[0.875rem] font-medium leading-[1.125rem] tracking-[-0.0175rem] text-ink-sub">
            추천 주제 {index}
          </span>
          {/* 시안 원본 색 `#d9d9d9` → 대비 미달로 `ink-sub`(#6b6b6b, 흰 배경 5.33:1) 상향(§5.10 제안). */}
          <span className="shrink-0 text-[0.875rem] font-medium leading-[1.125rem] text-ink-sub">
            자세히 보기 →
          </span>
        </div>

        <p className="text-[1rem] font-medium leading-[1.3125rem] text-ink">
          {topic.title}
        </p>

        <p className="text-[1rem] font-normal leading-[1.3125rem] text-ink-sub">
          {topic.subtitle}
        </p>

        {/* 태그는 4개 고정이지만 세션 값이 비면 서버가 그 칸을 빼고 내려보낸다(buildTags의
            `.filter(Boolean)`) — 개수를 가정하지 않고 받은 만큼 렌더한다. 좁은 폭에서
            줄바꿈되도록 `flex-wrap`을 두고 줄 간격도 같은 0.75rem으로 맞춘다. */}
        {tags.length > 0 && (
          <div className="flex flex-wrap items-center gap-3">
            {tags.map((tag, tagIndex) => (
              // biome-ignore lint/suspicious/noArrayIndexKey: 태그 문자열이 중복될 수 있어 tagIndex로 구분한다 — 태그에는 별도 id가 없다.
              <MetaTag key={`${tag}-${tagIndex}`}>{tag}</MetaTag>
            ))}
          </div>
        )}
      </div>
    </button>
  );
}
