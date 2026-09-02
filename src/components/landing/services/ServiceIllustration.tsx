// 핵심 서비스 카드 우측 일러스트 프레임 — Figma 4885:18473 재추출 반영(px÷16=rem).
// lg: 135×178px(8.4375rem×11.125rem), 카드 우측 정렬(부모 flex justify-between +
// shrink-0가 담당). lg 미만: 6rem×8rem(프레임 크기 2단계만 — 개별 breakpoint 클래스
// 난립 금지). 그림자·PREMIUM 배지는 에셋 PNG에 이미 합성돼 있으므로 여기서는 이미지
// 1장을 프레임 안에 object-contain + 중앙 정렬로 배치하기만 한다.
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
