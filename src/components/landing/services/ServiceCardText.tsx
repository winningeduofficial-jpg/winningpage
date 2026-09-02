// 핵심 서비스 카드 좌측 텍스트 묶음 — Figma 1920 실측(px÷16=rem) 재확인 반영.
// flex-col gap 16px(1rem, 9장 통일 — 시안 국제·해외만 12px이나 사용자 확정으로 무시).
// 제목 SemiBold 19.8px(1.2375rem) #525252(text-ink) tracking -0.4px(-0.025rem) leading 1.4,
// 설명 Medium 13.2px(0.825rem) #808080(text-ink-natural) leading 1.4 — 둘 다 자동 줄바꿈이
// 절대 없다(시안 확정). 제목은 whitespace-nowrap, 설명은 whitespace-pre로 DB description의
// \n만 줄바꿈 지점으로 쓰고 그 외에는 폭을 넘겨도 줄바꿈하지 않는다(좁아지는 쪽은 옆
// ServiceIllustration 프레임 — 텍스트 그룹은 shrink-0로 항상 자기 콘텐츠 폭을 그대로 지킨다).
export default function ServiceCardText({
  name,
  description,
}: {
  name: string;
  description?: string | undefined;
}) {
  return (
    <span className="flex shrink-0 flex-col gap-4">
      <span className="block whitespace-nowrap text-[1.2375rem] font-semibold leading-[1.4] tracking-[-0.025rem] text-ink">
        {name}
      </span>
      {description && (
        <span className="block whitespace-pre text-[0.825rem] font-medium leading-[1.4] text-ink-natural">
          {description}
        </span>
      )}
    </span>
  );
}
