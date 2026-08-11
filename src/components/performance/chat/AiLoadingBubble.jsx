import AiAvatar from './AiAvatar';

// AI 로딩 카드 프리미티브 — docs/수행평가-상세-명세.md §5.3(정본 제안: "아이콘 1.5rem +
// 제목/보조 2줄") / §5.9(`3754:3493`) / §5.12(`3754:3868`) / §5.15(`3754:4248`) 3개 노드
// 실측 — 세 노드 모두 같은 카드를 쓴다(치수·인셋·타이포 전부 동일, 문구만 다르다).
//
// 실측 (3개 노드 공통):
//   말풍선 596×83, r16, `fill #f8f7f5`(=`performance-bubble`).
//   아이콘 프레임 24×24, 말풍선 좌변에서 **18px(1.125rem)** 인셋 — 다른 카드의 표준
//   패딩(20px/1.25rem)과 다른 값이라 그대로 실측대로 둔다. 아이콘↔텍스트 gap도 18px로
//   동일(아이콘 우변 498 → 텍스트 x 516).
//   제목 16px/21 w600 `#525252`(=`ink`), 보조문 실측은 14px/18 w500 `#808080`(=`ink-sub`)이지만
//   `ink-sub` on `performance-bubble`(#f8f7f5)은 계산 대비율 약 3.7:1로 WCAG AA(일반 텍스트
//   4.5:1) 미달이다 — 14px medium은 large-text 예외 대상이 아니다. 보조문도 `ink`(#525252,
//   같은 배경 대비 약 7.3:1)로 렌더한다. 제목/보조문 구분은 폰트 크기(16px/14px)와 굵기
//   (w600/w500)만으로 유지한다.
//   제목↔보조문 gap 4px(0.25rem). 아이콘·텍스트블록 모두 말풍선 세로 중앙(83px 높이 기준
//   상하 20px씩 — 상하 패딩만은 표준 1.25rem과 일치).
//   벡터 아이콘 자체는 Figma에서 19×19 `fill #1f1f1f` 단색 도형으로만 추출되고 패스 데이터가
//   없다 — 실제 글리프(어떤 모양인지)는 시안에서 판별 불가. **자체 판단으로 "생성 중"을
//   뜻하는 스파클(반짝임) 아이콘을 새로 그렸다** — 색은 실측값 `#1f1f1f`를 그대로 쓴다
//   (§7.1 표에 없는 가장 가까운 신규 1회성 값이라 토큰화하지 않았다).
//
// **로딩 애니메이션 (작업 지시서 ③)** 시안은 정적이지만 실제 로딩 상태를 표현해야 한다.
// 스파클은 대칭이 아니라 `animate-spin`으로 돌리면 방향성 없는 도형이 빙글빙글 도는
// 어색한 인상을 준다 — 대신 `animate-pulse`(불투명도 반복)로 "은은하게 반짝이는" 느낌을
// 주는 쪽을 선택했다. `motion-reduce:animate-none`으로 OS 모션 축소 설정을 존중한다.
//
// 접근성: 로딩 상태를 스크린리더에 알리는 배선(`role="status"`/`aria-live="polite"`)은
// 여기서 강제하지 않는다 — 타임라인 안에서 어느 시점에 라이브 리전으로 승격할지는
// `ChatTimeline`이 메시지 히스토리 전체를 보고 결정할 몫이라, 루트에 임의 props를 그대로
// 흘려보내 호출부가 필요할 때 얹을 수 있게만 열어 둔다.
/**
 * @param {string} title 로딩 제목. 문구 자체는 다음 단계(P7 이후)에서 이식한다 — 이 컴포넌트는
 *   형식만 만든다.
 * @param {string} subtitle 로딩 보조문.
 * @param {string} [label] 발신자 라벨. `AiMessage`와 동일 기본값.
 * @param {string} [className] 루트(아바타+컬럼 행)에 추가할 클래스.
 */
export default function AiLoadingBubble({
  title,
  subtitle,
  label = '위닝 AI 수행평가 서포터',
  className = '',
  ...rest
}) {
  return (
    <div className={['flex items-start gap-5', className].join(' ')} {...rest}>
      <AiAvatar />
      <div className="flex min-w-0 flex-1 flex-col items-start gap-4">
        <span className="text-[0.875rem] font-semibold leading-[1.125rem] text-ink">{label}</span>
        <div className="flex w-full max-w-perf-bubble items-center gap-[1.125rem] rounded-2xl bg-performance-bubble py-5 pl-[1.125rem] pr-5">
          <span
            aria-hidden="true"
            className="flex h-6 w-6 flex-shrink-0 animate-pulse items-center justify-center motion-reduce:animate-none"
          >
            <LoadingSparkle />
          </span>
          <span className="flex min-w-0 flex-col gap-1">
            <span className="text-[1rem] font-semibold leading-[1.3125rem] text-ink">{title}</span>
            <span className="text-[0.875rem] font-medium leading-[1.125rem] text-ink">
              {subtitle}
            </span>
          </span>
        </div>
      </div>
    </div>
  );
}

function LoadingSparkle() {
  return (
    <svg viewBox="0 0 24 24" className="h-[1.1875rem] w-[1.1875rem] text-[#1f1f1f]">
      <path
        d="M12 2c.5 4.2 1.5 6.9 3 8.4 1.5 1.5 4.2 2.5 8.4 3-4.2.5-6.9 1.5-8.4 3-1.5 1.5-2.5 4.2-3 8.4-.5-4.2-1.5-6.9-3-8.4-1.5-1.5-4.2-2.5-8.4-3 4.2-.5 6.9-1.5 8.4-3 1.5-1.5 2.5-4.2 3-8.4Z"
        fill="currentColor"
      />
    </svg>
  );
}
