// 핵심 서비스 카드 우측 일러스트 프레임 — Figma 1920 실측(px÷16=rem) 재확인 반영.
// lg 135×178px(8.4375rem×11.125rem) 고정(shrink-0) — 이미지 크기는 절대 줄어들지 않는다.
// 텍스트가 길어져 공간이 부족해지면 이 프레임이 아니라 프레임 뒤 여백 스페이서
// (ServiceCard.tsx, 21px→0)가 대신 줄어든다. lg 미만 6rem×8rem도 동일하게 고정.
// 그림자·PREMIUM 배지는 에셋 PNG에 이미 합성돼 있으므로 이미지 1장을 프레임 안에
// object-contain으로 중앙 배치하기만 한다.
export default function ServiceIllustration({
  src,
}: {
  src?: string | undefined;
}) {
  return (
    <span
      aria-hidden="true"
      className="flex h-32 w-24 shrink-0 items-center justify-center lg:h-44.5 lg:w-33.75"
    >
      {src && (
        <img
          src={src}
          alt=""
          loading="lazy"
          className="max-h-full max-w-full object-contain"
        />
      )}
    </span>
  );
}
