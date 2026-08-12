// 목표관리 앱 인사이트 팁 박스 — docs/figma-goal/00-INDEX.md §5-4 `InsightBox`, part-11 §251~342.
// 리포트·분석 카드 하단에 붙는 이모지 아이콘 + 본문 안내 박스. 시안 실측 4종(폭은 386 공통):
//   info(💡) 386×69 · warn(🚨) 386×81 · success(✅) 386×100 · time(⌚️) 386×80
// 높이는 시안 px를 그대로 고정하지 않는다 — 본문 길이에 따라 자라야 하므로 min-h만 참고용
// 주석으로 남기고 실제 레이아웃은 padding + 자동 높이로 구현한다.
//
// ⚠︎ 시안은 이모지(💡🚨✅⌚️)를 아이콘이 아니라 텍스트 노드로 그대로 쓰고 있다(part-11 §365).
// OS/브라우저별 이모지 폰트 렌더링 차이가 있어(특히 Windows vs macOS vs 안드로이드) 추후
// SVG 아이콘 컴포넌트로 교체 검토가 필요하다. 지금은 시안 그대로 이모지 텍스트를 쓴다.
const VARIANT = {
  info: { icon: '💡', bgClass: 'bg-goal-insight-info' }, // 시안 386×69
  warn: { icon: '🚨', bgClass: 'bg-goal-insight-warn' }, // 시안 386×81
  success: { icon: '✅', bgClass: 'bg-goal-insight-success' }, // 시안 386×100
  time: { icon: '⌚️', bgClass: 'bg-goal-insight-time' } // 시안 386×80
};

export default function InsightBox({ variant = 'info', children, className = '' }) {
  const { icon, bgClass } = VARIANT[variant] ?? VARIANT.info;

  return (
    <div
      className={`flex w-full items-start gap-2 rounded-xl px-4 py-3 ${bgClass} ${className}`} // radius 12px(추정)
    >
      <span aria-hidden="true" className="shrink-0 text-[1rem] leading-[1.4]">
        {icon}
      </span>
      <p className="min-w-0 flex-1 text-[0.8125rem] leading-[1.5] text-ink-strong">{children}</p>
    </div>
  );
}
