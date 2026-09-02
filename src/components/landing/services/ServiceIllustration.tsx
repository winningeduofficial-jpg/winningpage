// 핵심 서비스 카드 우측 일러스트 프레임 — Figma 1920 실측(px÷16=rem) 재확인 반영.
// lg 기본 135×178px(8.4375rem×11.125rem), 여유가 있으면 그 크기 그대로. 하지만 옆
// ServiceCardText가 shrink-0로 자기 콘텐츠 폭(nowrap 제목·pre 설명)을 절대 양보하지
// 않으므로, 좁은 카드에서는 이 프레임이 대신 줄어든다(min-w-0 + shrink, 카드 우측
// 패딩도 pr-[1.625rem]로 줄여 여유를 더 확보 — ServiceCard.CARD_CLASS). lg 미만은
// 6rem×8rem 고정(프레임 크기 2단계만 — 개별 breakpoint 클래스 난립 금지). 그림자·
// PREMIUM 배지는 에셋 PNG에 이미 합성돼 있으므로 이미지 1장을 프레임이 줄어도 비율
// 유지로 작아지게(object-contain) 우측 정렬(object-right)로 배치하기만 한다.
export default function ServiceIllustration({
  src,
}: {
  src?: string | undefined;
}) {
  return (
    <span
      aria-hidden="true"
      className="flex h-32 w-24 min-w-0 shrink items-center justify-center lg:h-44.5 lg:w-33.75"
    >
      {src && (
        <img
          src={src}
          alt=""
          loading="lazy"
          className="h-full max-w-full object-contain object-right"
        />
      )}
    </span>
  );
}
