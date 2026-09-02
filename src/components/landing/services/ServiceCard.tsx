import { Link } from "react-router";
import { SERVICE_NAME_ROUTES } from "@/data/navigation";
import { resolvePromotedSlugLink } from "@/hooks/useNavGroups";
import ServiceCardText from "./ServiceCardText";
import ServiceIllustration from "./ServiceIllustration";

// program_categories 활성 row(sort_order asc).
export type Service = {
  id: string;
  name: string;
  description?: string;
  link?: string;
  icon_image_url?: string;
  sort_order?: number;
  is_premium?: boolean;
};

// 레거시 '/services' 스텁 페이지(헤더/푸터 없는 플레이스홀더, 실 목적지 아님) — DB
// link 컬럼에 남아 있는 죽은 값. 이 값은 링크 없음과 동일하게 취급한다.
const DEAD_SERVICE_LINK = "/services";

// service.link 해석 순서: 1) 서비스명이 SERVICE_NAME_ROUTES에 있으면 그 정본 내부 라우트를
// 최우선 사용(상단 메뉴/메가패널과 동일한 라우트·동일한 전환 방식을 강제 — DB link 컬럼에
// 실수로 외부 절대 URL이 들어가 있어도 새 탭으로 튀지 않는다) 2) 없으면 /page/services-*
// 구슬러그를 신규 라우트로 승격(useNavGroups와 동일 매핑 재사용, 일반 경로는 그대로 통과)
// 3) 그래도 죽은 값('/services')·빈 값이면 null — 카드는 뜨되 클릭할 수 없다.
//
// 종전에는 3)에서 학습진단으로 폴백했다(QA 2026-08-25 제거). 어드민이 새 서비스를
// 등록하면서 link 를 아직 안 채웠을 때 엉뚱한 페이지로 보내는 것보다, 카드가 비활성인 게
// 눈에 띄어 어드민이 link 를 채우게 만드는 편이 맞다 — 데이터가 없으면 동작도 없다.
function resolveServiceLink(service: Service): string | null {
  const knownRoute =
    SERVICE_NAME_ROUTES[
      String(service?.name || "").trim() as keyof typeof SERVICE_NAME_ROUTES
    ];
  if (knownRoute) return knownRoute;

  const raw = String(service?.link || "").trim();
  if (!raw) return null;

  const promoted = resolvePromotedSlugLink(raw);
  if (!promoted || promoted === DEAD_SERVICE_LINK) return null;

  return promoted;
}

// 카드 셸 — 사용자 확정 최종 사이징 규칙(카드 폭 기준 컨테이너 쿼리, 뷰포트·카드별
// 예외·스페이서·shrink 계산 전부 없음). 패딩 좌 32px(2rem)/우 26px(1.625rem) 통일
// 고정(9장 동일, 더 이상 줄어들지 않는다 — 대신 ServiceIllustration 프레임이 카드
// 폭에 비례해 줄어든다). flex row, items-center, justify-between(시안엔 gap 없음 —
// 텍스트·일러스트 사이 간격은 justify-between 결과일 뿐, 별도 gap 유틸 없음. gap이
// 있으면 그만큼 텍스트 공간을 잠식해 긴 제목이 넘쳤다 — 2026-09-03 실측), radius
// 24.8px(1.55rem), border 1px #d7d7d7, shadow 0 3.3px 3.3px rgba(128,128,128,.3)
// (0.2063rem/0.2063rem). lg 기본 352×180(그리드 3열이 열 폭을 결정하므로 폭은
// w-full), 높이는 h(고정)가 아니라 min-h-45 — 좁은 카드(예: 1024 뷰포트 307px)에서
// 제목이 2줄로 꺾이면 설명까지 밀려 고정 높이를 넘쳐 잘렸다(2026-09-03 실측). 같은
// 그리드 행의 다른 카드는 CSS grid 기본 stretch로 높이가 맞춰진다. 컨테이너 쿼리
// 기준점(@container)은 이 카드가 아니라 패딩 없는 그리드 li(ServicesSection.tsx)
// — 카드 자체에 패딩이 있으면 cqw가 콘텐츠 박스 기준으로 잡혀 일러스트가 의도보다
// 작아진다(2026-09-03 실측). hover/focus는 시안에 없는 구현측 인터랙션 — 동작은 유지.
const CARD_CLASS =
  "group flex w-full flex-row items-center justify-between " +
  "rounded-[1.55rem] border border-[#d7d7d7] bg-white py-6 pl-8 pr-[1.625rem] " +
  "shadow-[0_0.2063rem_0.2063rem_rgba(128,128,128,0.3)] transition-[background-color,box-shadow] duration-200 " +
  "[@media(hover:hover)]:hover:bg-[#f6fbff] [@media(hover:hover)]:hover:shadow-[0_0.375rem_1rem_0.25rem_rgba(128,128,128,0.4)] " +
  "focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 " +
  "lg:min-h-45";

export default function ServiceCard({ service }: { service: Service }) {
  const link = resolveServiceLink(service);
  const isExternal = link !== null && /^https?:\/\//i.test(link);

  const content = (
    <>
      <ServiceCardText name={service.name} description={service.description} />
      <ServiceIllustration src={service.icon_image_url} />
    </>
  );

  // 링크가 없는 카드(어드민이 link 를 아직 안 채운 신규 서비스) — 클릭 영역 없이 카드만
  // 보여준다. hover/focus 스타일은 링크형 카드와 같은 CARD_CLASS 를 쓰되 커서만 기본값.
  if (link === null) {
    return <div className={`${CARD_CLASS} cursor-default`}>{content}</div>;
  }

  if (isExternal) {
    return (
      <a
        href={link}
        target="_blank"
        rel="noopener noreferrer"
        aria-label={`${service.name} 바로가기`}
        className={CARD_CLASS}
      >
        {content}
      </a>
    );
  }

  return (
    <Link
      to={link}
      aria-label={`${service.name} 바로가기`}
      className={CARD_CLASS}
    >
      {content}
    </Link>
  );
}
