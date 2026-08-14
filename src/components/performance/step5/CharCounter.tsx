// 글자 수 카운터 — docs/수행평가-상세-명세.md §5.14(`3754:4119` 실측) / §6.1 컴포넌트 표
// (props `count`) / §7.2(타이포 「글자 수 카운터」 행).
//
// ── 실측 (§5.14 「글자 수 카운터」)
//   0.875rem/1.125rem w400 `#808080`, 폭 46.375rem 좌측 정렬, 텍스트영역 하단에서
//   0.75rem(12) 아래. 형식 `{n}자`(시안 값 `356자`/`840자`/`421자`).
//   **최소·최대 기준선 표기 없음** — `/100자` 같은 표기를 여기 새로 만들지 않는다.
//   제출 게이트(100자)는 폼 전체에 걸리는 규칙이라 버튼 옆 상태 문구가 담당한다
//   (`SubmissionForm`의 게이트 문구). 필드 카운터에 기준선을 얹으면 "이 필드가 100자를
//   넘어야 한다"는 잘못된 뜻이 된다.
//
// ── 색: 시안 `#808080` → 토큰 `text-ink-sub`(`#6b6b6b`)
//   저장소 토큰이 이미 시안 `#808080`을 AA 미달(흰 배경 3.95:1)로 보고 `#6b6b6b`로
//   상향해 둔 값이다(tailwind.config.js `ink.sub` 주석). 여기서 리터럴 `#808080`을 쓰면
//   그 결정을 되돌리는 셈이라 토큰을 쓴다 — 흰 카드 배경에서 5.33:1.
//
// ── 낭독 정책: **live region이 아니다**
//   숫자가 타이핑마다 바뀌므로 `aria-live`를 걸면 매 글자마다 낭독된다. 대신 이 요소의
//   `id`를 텍스트영역의 `aria-describedby`에 넣어(`SubmissionForm`이 배선한다) 필드에
//   포커스가 닿을 때 한 번 읽히게 한다. 최대 길이 제한이 없는 필드라 "몇 자 남았는지"를
//   실시간으로 알려야 할 이유도 없다.
//   ⚠️ 여기서 `aria-live`를 **쓰지 않는 것만으로는 부족하다** — 조상에 live region이 있으면
//   그 서브트리의 텍스트 변경이 전부 announce된다. 이 컴포넌트가 실제로 놓이는 자리는
//   `ChatTimeline`(루트 `aria-live="polite"`) 안이라, `SubmissionForm` 루트가
//   `aria-live="off"`로 그것을 무효화해 주어야 위 문장이 성립한다(검토 P11 —
//   `SubmissionForm` 파일 상단 4의 ⚠️ 항이 그 배선이다).
/**
 * @param {number} count 글자 수. 계산은 서버와 공유하는 `countFieldChars`가 하고
 *   (`api/_lib/performance/submission-chars.js`) 이 컴포넌트는 렌더만 한다.
 * @param {string} [id] `aria-describedby` 연결용.
 * @param {string} [className] 루트에 추가할 클래스.
 */
export default function CharCounter({ count = 0, id, className = "" }) {
  return (
    <p
      id={id}
      className={[
        "text-[0.875rem] font-normal leading-[1.125rem] text-ink-sub",
        className,
      ].join(" ")}
    >
      {count}자
    </p>
  );
}
