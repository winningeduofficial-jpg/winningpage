// 핵심 서비스 카드 좌측 텍스트 묶음 — Figma 4885:18473 재추출 반영(px÷16=rem).
// flex-col gap 16px(1rem, 9장 통일 — 시안 국제·해외만 12px이나 사용자 확정으로 무시).
// 제목 SemiBold 19.8px(1.2375rem) #525252(text-ink) tracking -0.4px(-0.025rem) leading 1.4,
// 전 카드 1줄(국제·해외 프리미엄 포함) — whitespace-nowrap, 폭 고정 없음(텍스트 그룹은 hug).
// 설명 Medium 13.2px(0.825rem) #808080(text-ink-natural) leading 1.4, 줄바꿈은 DB description의
// \n을 whitespace-pre-line으로 그대로 반영(강제 nowrap 금지 — 폭 넘치면 자연 줄바꿈/잘림 허용).
export default function ServiceCardText({
  name,
  description,
}: {
  name: string;
  description?: string | undefined;
}) {
  return (
    <span className="flex flex-col gap-4">
      <span className="block whitespace-nowrap text-[1.2375rem] font-semibold leading-[1.4] tracking-[-0.025rem] text-ink">
        {name}
      </span>
      {description && (
        <span className="block whitespace-pre-line break-keep text-[0.825rem] font-medium leading-[1.4] text-ink-natural">
          {description}
        </span>
      )}
    </span>
  );
}
