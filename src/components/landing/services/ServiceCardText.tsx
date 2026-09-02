// 핵심 서비스 카드 좌측 텍스트 묶음 — 사용자 확정 최종 사이징 규칙: 카드 폭 기준
// 컨테이너 쿼리(기준점은 ServicesSection의 그리드 li — 패딩 없는 카드 전체 폭 기준)로
// 줄바꿈 여부가 정해진다. flex-col gap
// 16px(1rem, 9장 통일 — 시안 국제·해외만 12px이나 사용자 확정으로 무시). 제목 SemiBold
// 19.8px(1.2375rem) #525252(text-ink) tracking -0.4px(-0.025rem) leading 1.4, 설명 Medium
// 13.2px(0.825rem) #808080(text-ink-natural) leading 1.4. 카드 폭 ≥21rem(336px)에서는
// 제목 whitespace-nowrap·설명 whitespace-pre(DB description의 \n만 줄바꿈 지점, 자동
// 줄바꿈 없음). 그 미만(좁은 카드)에서는 제목 break-keep(자연 줄바꿈)·설명
// whitespace-pre-line(공백·\n 모두 줄바꿈)으로 넘치지 않게 완화한다. min-w-0 —
// 플렉스 아이템 기본 min-width:auto를 풀어야 좁은 컨테이너 쿼리 구간에서 실제로
// 줄바꿈이 걸린다(shrink-0는 쓰지 않는다 — 대신 옆 ServiceIllustration이 shrink-0).
// py-6 — 카드(ServiceCard) 자체는 상하 패딩이 없다(시안: 일러스트가 카드 전체 높이를
// 거의 다 씀). 텍스트가 2줄로 꺾여 카드가 min-h를 넘어 늘어나는 좁은 카드에서 텍스트
// 상하 여유는 카드가 아니라 이 텍스트 묶음이 직접 갖는다(2026-09-03 사용자 확정).
export default function ServiceCardText({
  name,
  description,
}: {
  name: string;
  description?: string | undefined;
}) {
  return (
    <span className="flex min-w-0 flex-col gap-4 py-6">
      <span className="block break-keep text-[1.2375rem] font-semibold leading-[1.4] tracking-[-0.025rem] text-ink @[21rem]:whitespace-nowrap">
        {name}
      </span>
      {description && (
        <span className="block whitespace-pre-line break-keep text-[0.825rem] font-medium leading-[1.4] text-ink-natural @[21rem]:whitespace-pre">
          {description}
        </span>
      )}
    </span>
  );
}
