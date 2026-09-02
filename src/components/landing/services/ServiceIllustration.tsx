// 핵심 서비스 카드 우측 일러스트 프레임 — 사용자 확정 최종 사이징 규칙: 카드 폭
// 기준 컨테이너 쿼리(기준점은 ServicesSection의 그리드 li)로만 크기가 정해진다. 뷰포트
// breakpoint·카드별 예외 분기는 없다(2단계 lg/모바일 분기 폐기). 비율 3:4
// 고정(aspect-3/4), 폭은 min(8.4375rem, 38cqw) — 카드가 넓으면 원래 크기(135px)
// 그대로, 좁아지면 카드 폭의 38%로 비례 축소(353px 카드→≈134px, 306px→≈116px).
// shrink-0라 텍스트 그룹(ServiceCardText)이 자기 폭을 요구해도 이 프레임이 flex
// gap 계산에서 밀려나지 않는다 — 대신 카드 자체가 좁아지면 cqw가 함께 줄어 반응한다.
// 그림자·PREMIUM 배지는 에셋 PNG에 이미 합성돼 있으므로 이미지 1장을 프레임 안에
// object-contain으로 채우기만 한다.
export default function ServiceIllustration({
  src,
}: {
  src?: string | undefined;
}) {
  return (
    <span
      aria-hidden="true"
      className="flex aspect-3/4 w-[min(8.4375rem,38cqw)] shrink-0 items-center justify-center"
    >
      {src && (
        <img
          src={src}
          alt=""
          loading="lazy"
          className="h-full w-full object-contain"
        />
      )}
    </span>
  );
}
