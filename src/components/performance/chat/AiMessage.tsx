import type { ReactNode } from "react";
import AiAvatar from "./AiAvatar";

type AiMessageProps = {
  /** 발신자 라벨. 전 노드 공통 `위닝 수행평가 서포터`. */
  label?: string;
  /** 말풍선 본문. 생략하면 말풍선 자체를 렌더하지 않는다. */
  body?: string;
  /** 말풍선 뒤에 이어 붙는 인라인 카드. */
  children?: ReactNode;
  /** 말풍선 max-width 클래스. 기본 `max-w-perf-bubble`(596px). */
  bubbleMaxWidthClassName?: string;
  /** 루트(아바타+컬럼 행)에 추가할 클래스. */
  className?: string;
};

// AI 말풍선 프리미티브 — docs/수행평가-상세-명세.md §3.1(셸 관례) / §5.3(예외) / §5.5·§5.6·§5.8
// (말풍선 뒤에 폼·업로드 카드가 붙는 실제 배치) / §7.1(색) / §7.2(타이포).
//
// 좌표 실측(공통, `3754:3261`/`3754:3370` 등 596폭 노드 기준):
//   아바타 @384,y 52×52 → 우변 436. 라벨·말풍선 @456,y → 아바타와 컬럼 사이 gap 20px(1.25rem).
//   라벨 @456,270 h18 → 말풍선 @456,304 : gap 16px(1rem). 말풍선(`3754:3206`) → 폼 카드
//   (`3754:3206` @456,447): gap 16px(1rem)로 동일 — 그래서 컬럼 전체에 `gap-4`(1rem) 하나만
//   주면 라벨↔말풍선, 말풍선↔후속 카드 두 간격이 동시에 맞는다.
//
// **말풍선 폭 예외 (§5.3 단정)** `3754:3035`(접속 직후 로딩) 한 노드만 말풍선 폭이 442px
// (27.625rem)이고, 나머지 전 노드는 596px(37.25rem = `perf-bubble` 토큰)이다. 명세는 596을
// 정본으로 제안하면서도 예외를 규정으로 남겼으므로, 기본값은 `perf-bubble`로 두고
// `bubbleMaxWidthClassName`으로 완전히 교체할 수 있게 열어 둔다 — 두 max-width 클래스를
// 동시에 문자열에 넣지 않는다(Tailwind가 두 `max-w-*` 클래스의 최종 적용 순서를 클래스
// 목록 순서가 아니라 유틸리티 정의 순서로 결정하기 때문에, 이어붙이면 어느 쪽이 이기는지
// 예측할 수 없다). 그래서 이 prop은 항상 기본값을 **대체**하지, 덧붙이지 않는다.
//
// 조립은 이 컴포넌트가 하지 않는다 — `body`는 이 말풍선 텍스트만 렌더하고, 후속 인라인
// 카드(폼·업로드 슬롯·리포트 요약)는 `children`으로 받아 같은 컬럼 안, 말풍선 바로 아래에
// 놓는다. 카드 자체의 마크업·상태는 `ChatTimeline`과 그 하위 `InlineCard`가 책임진다.
/**
 * @param {string} [label] 발신자 라벨. 전 노드 공통 `위닝 수행평가 서포터`
 *   (`3754:3035` 한 노드만 `위닝 채팅`류 예외가 있으나 그건 사이드바 메뉴 라벨이지 이
 *   라벨이 아니다 — §3.4 참고. 발신자 라벨 자체는 모든 노드에서 동일).
 * @param {string} [body] 말풍선 본문. 시안 문구가 빈 줄 포함 여러 줄이라 `\n`을 그대로
 *   보존해 렌더한다(`whitespace-pre-line`). 생략하면 말풍선 자체를 렌더하지 않는다 —
 *   로딩 표현 전용으로 쓰고 싶으면 `AiLoadingBubble`을 대신 쓸 것.
 * @param {import('react').ReactNode} [children] 말풍선 뒤에 이어 붙는 인라인 카드.
 * @param {string} [bubbleMaxWidthClassName] 말풍선 max-width 클래스. 기본
 *   `max-w-perf-bubble`(596px). `3754:3035` 노드에서만 `"max-w-[27.625rem]"`(442px)로
 *   완전히 교체해 쓴다.
 * @param {string} [className] 루트(아바타+컬럼 행)에 추가할 클래스.
 */
export default function AiMessage({
  label = "위닝 수행평가 서포터",
  body,
  children,
  bubbleMaxWidthClassName = "max-w-perf-bubble",
  className = "",
}: AiMessageProps) {
  return (
    <div className={["flex items-start gap-5", className].join(" ")}>
      <AiAvatar />
      <div className="flex min-w-0 flex-1 flex-col items-start gap-4">
        {/* 실측: 14px/18 w600 #525252(=`ink`). */}
        <span className="text-[0.875rem] font-semibold leading-[1.125rem] text-ink">
          {label}
        </span>
        {body != null && (
          <div
            className={[
              "w-full rounded-2xl bg-performance-bubble p-5",
              bubbleMaxWidthClassName,
            ].join(" ")}
          >
            {/* 실측: 16px/21 w500 #525252(=`ink`). */}
            <p className="whitespace-pre-line text-[1rem] font-medium leading-[1.3125rem] text-ink">
              {body}
            </p>
          </div>
        )}
        {children}
      </div>
    </div>
  );
}
