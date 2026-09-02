import {
  BarChart3,
  Brain,
  ClipboardList,
  Edit3,
  FileText,
  GraduationCap,
  Star,
  Target,
  Users,
} from "lucide-react";
import { useMemo } from "react";
import { Link } from "react-router";
import { SERVICE_NAME_ROUTES } from "@/data/navigation";
import { resolvePromotedSlugLink } from "@/hooks/useNavGroups";

// program_categories 활성 row(sort_order asc).
type Service = {
  id: string;
  name: string;
  description?: string;
  link?: string;
  icon?: string;
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

const ICON_SHADOW_SRC = "/images/landing/services/icon-shadow.png";

// 기존 Home.jsx serviceIconMap과 동일 — icon_image_url 부재 시 lucide 폴백
const serviceIconMap: Record<string, typeof Target> = {
  target: Target,
  brain: Brain,
  file: FileText,
  graduation: GraduationCap,
  chart: BarChart3,
  users: Users,
  clipboard: ClipboardList,
  edit: Edit3,
  star: Star,
  default: ClipboardList,
};

/* 카드 셸 — 0729 시안(2207:12970, 1100 캔버스) 실측(px÷16=rem, 환산 계수 폐기).
   높이 179px(11.1875rem, lg), radius 25px(1.5625rem, lg, 기존 유지), 보더 없음,
   그림자 알파 0.125(현행 유지 — 시안 셸 opacity 40%의 유효값 근사, 의도적 불일치).
   hover는 시안에 없는 구현측 인터랙션 — 동작은 유지하되 그림자 색만 기본과 동계열로 통일. */
const CARD_CLASS =
  "group relative block h-46.25 w-full overflow-hidden rounded-[1.875rem] bg-white " +
  "shadow-[0_0.2063rem_0.4188rem_0.2063rem_rgba(128,128,128,0.125)] transition-[background-color,box-shadow] duration-200 " +
  "[@media(hover:hover)]:hover:bg-[#f6fbff] [@media(hover:hover)]:hover:shadow-[0_0.375rem_1rem_0.25rem_rgba(128,128,128,0.4)] " +
  "focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 " +
  "lg:h-44.75 lg:rounded-[1.5625rem]";

// 카드 일러스트 hover/focus 리프트 — 터치 기기에는 hover 없이 :active만 적용
const ILLUSTRATION_LIFT_CLASS =
  "service-illustration [@media(hover:hover)]:group-hover:-translate-y-0.75 " +
  "group-focus-visible:-translate-y-0.75 active:translate-y-0.25";

type IllustrationLayout = {
  boxW: string;
  w: string;
  h: string;
  right: string;
  top: string;
  rotate: string;
  shadowW: string;
  shadowH: string;
  shadowBottom: string;
  /** 시안(4885:18474)이 원본을 잘라 쓰는 카드(프리미엄 3종)만 "cover" — 기본은 contain. */
  fit?: "cover";
  /** object-position(%). cover 크롭 중심 또는 contain 정렬(예: 성장설계 "50% 100%"=하단)에 쓴다. */
  position?: string;
  /** 4885:18466/18468/18470 전용 절대 배치 모드 — 정의되면 박스(boxW×boxH, lg 고정 크기) 안에서
   *  이미지·그림자·배지를 좌상단 기준 절대좌표로 배치한다(top 필드를 imgTop으로 겸용).
   *  미정의(기존 6장)는 종전 중앙정렬 + margin-top + 하단중앙 그림자 방식을 그대로 쓴다. */
  boxH?: string;
  imgLeft?: string;
  shadowLeft?: string;
  shadowTop?: string;
  /** PREMIUM 배지의 박스 기준 절대좌표(rem). 정의되면 lg에서 bottom-0/right-0 대신 이 좌표를 쓴다. */
  badgeLeft?: string;
  badgeTop?: string;
};

/* 카드별 일러스트 배치 (lg 전용) — 0729 시안(2207:12970, 1100 캔버스, 카드 상대좌표) 실측(px÷16=rem).
   학습진단·목표관리·콜멘토는 시안 직접 실측치. 수행평가·자기평가·심화탐구는 시안 미제공 —
   구 시안(카드 356.4×181.1) 배치 비율을 신 카드(352×179, sx≈0.9877 / sy≈0.9883)로 재산정.
   시안은 세로 중앙이 아닌 카드 상단 기준 배치이며 카드마다 본체 크기·우측 여백이 다르고
   수행평가만 18.66° 회전. 받침 그림자는 동일 자산을 카드 하단 기준 shadowBottom만큼 띄워
   본체 하단과 겹치게 깐다(그림자 위치는 시안 미제공 — 구 값을 동일 비율로 재산정).
   boxW: 래퍼 폭(회전 카드는 회전 후 bbox 폭), w/h: 본체 이미지, top: 본체 상단 오프셋.
   인덱스 = sort_order 순 = 시안 카드 순서. */
const ILLUSTRATION_LAYOUTS: IllustrationLayout[] = [
  // 학습진단 — 시안 실측 본체 118.9×100.2 / top 39.1 / right 53
  {
    boxW: "7.43rem",
    w: "7.43rem",
    h: "6.26rem",
    right: "3.31rem",
    top: "2.44rem",
    rotate: "0deg",
    shadowW: "6.41rem",
    shadowH: "1.36rem",
    shadowBottom: "2.27rem",
  },
  // 목표관리 — 시안 실측 본체 113.8×125.0 / top 17.4 / right 42
  {
    boxW: "7.11rem",
    w: "7.11rem",
    h: "7.81rem",
    right: "2.63rem",
    top: "1.09rem",
    rotate: "0deg",
    shadowW: "7rem",
    shadowH: "1.49rem",
    shadowBottom: "1.34rem",
  },
  // 콜멘토 — 시안 실측 본체 134.2×110.3 / top 29.9 / right 37
  {
    boxW: "8.39rem",
    w: "8.39rem",
    h: "6.89rem",
    right: "2.31rem",
    top: "1.87rem",
    rotate: "0deg",
    shadowW: "7rem",
    shadowH: "1.49rem",
    shadowBottom: "1.09rem",
  },
  // 수행평가 — 구 배치 재산정(회전 18.66° 유지)
  {
    boxW: "9.41rem",
    w: "7.78rem",
    h: "6.39rem",
    right: "0.1rem",
    top: "2.39rem",
    rotate: "18.66deg",
    shadowW: "7rem",
    shadowH: "1.49rem",
    shadowBottom: "1.19rem",
  },
  // 자기평가 — 구 배치 재산정
  {
    boxW: "7.53rem",
    w: "7.53rem",
    h: "7.42rem",
    right: "2.68rem",
    top: "1.81rem",
    rotate: "0deg",
    shadowW: "7rem",
    shadowH: "1.49rem",
    shadowBottom: "0.93rem",
  },
  // 심화탐구 — 구 배치 재산정
  {
    boxW: "8.72rem",
    w: "8.72rem",
    h: "6.86rem",
    right: "2.3rem",
    top: "2.32rem",
    rotate: "0deg",
    shadowW: "7rem",
    shadowH: "1.49rem",
    shadowBottom: "1.19rem",
  },
  // 프리미엄 3종 — 4885:18466/18468/18470 실측(docs/services-cards-figma-2026-09.md, px÷16=rem).
  // 공통 "일러스트 박스" 144×180(9rem×11.25rem, lg 고정) 좌상단 기준 절대 배치로 전환
  // (이전 중앙정렬 방식은 배지가 카드 모서리에 걸리고, cover 크롭이 세 일러스트 본체를
  // 잘라내 시안(전체가 온전히 보임)과 어긋났다 — 2026-09-03 QA). 3장 모두 fit 미지정(기본
  // object-contain)이라 본체가 잘리지 않는다. right는 박스 자체의 카드 우변 기준 오프셋
  // (이미지가 아님), top/imgLeft는 박스 안 이미지 좌상단 오프셋, shadowLeft/Top은 박스 안
  // 그림자 좌상단, badgeLeft/Top은 박스 안 배지 좌상단.
  // 성장설계 — 시안 프레임 107×120은 원본(1024×374, 가로로 넓은 이미지)을 세로로 늘린
  // 상태라 그대로 못 쓴다(contain 시 107×39px로 다른 카드 대비 1/3 크기가 됨 — 2026-09-03
  // 팀리드 브라우저 실측). 비율 유지로 폭 8.75rem(140px)까지 키우고 높이는 원본 비율
  // (374/1024)로 자동 계산(3.1958rem≈51px), 그림자 바로 위(shadow top 8.5rem + 0.25rem
  // 겹침 = 이미지 하단 8.75rem)에 하단 정렬, 박스(9rem) 안 수평 중앙. 그림자 폭도 이미지에
  // 맞춰 7.5rem, 박스 안 수평 중앙.
  {
    boxW: "9rem",
    boxH: "11.25rem",
    w: "8.75rem",
    h: "3.1958rem",
    right: "1.65rem",
    top: "5.5542rem",
    imgLeft: "0.125rem",
    rotate: "0deg",
    position: "50% 50%",
    shadowW: "7.5rem",
    shadowH: "1.375rem",
    shadowLeft: "0.75rem",
    shadowTop: "8.5rem",
    shadowBottom: "1.1rem",
  },
  // 컨설팅 프리미엄 — 이미지 프레임 130.274×115.663 ml13 mt28. 시안 % 크롭(215%×130%)은
  // 원본 1704×923 캔버스의 투명 여백을 잘라내는 값이지 인물·테이블을 잘라내는 값이 아니다
  // (시안 스크린샷 4885:18474엔 두 인물+테이블+말풍선 보드가 전부 온전히 보인다, 2026-09-03
  // 팀리드 재검토) — object-cover 대신 contain으로 본체 잘림 없이 프레임에 맞춘다.
  // 그림자 ml30 mt144. 배지 박스 기준 (39, 122) — 일러스트 하단에 겹치는 위치(카드 모서리 아님).
  {
    boxW: "9rem",
    boxH: "11.25rem",
    w: "8.1421rem",
    h: "7.2289rem",
    right: "1.67rem",
    top: "1.75rem",
    imgLeft: "0.8125rem",
    rotate: "0deg",
    position: "50% 50%",
    shadowW: "6.3125rem",
    shadowH: "1.375rem",
    shadowLeft: "1.875rem",
    shadowTop: "9rem",
    shadowBottom: "1.1rem",
    badgeLeft: "2.4375rem",
    badgeTop: "7.625rem",
  },
  // 국제·해외 프리미엄 — 이미지 프레임 124×120.737 ml20 mt28. 원본 정방형(1254×1254) —
  // 컨설팅과 동일 이유로 cover 크롭 대신 contain(지구본+비행기+핀 전체가 시안에 온전히 보임).
  // 그림자 ml32 mt144. 배지 박스 기준 (42, 122).
  {
    boxW: "9rem",
    boxH: "11.25rem",
    w: "7.75rem",
    h: "7.5461rem",
    right: "1.63rem",
    top: "1.75rem",
    imgLeft: "1.25rem",
    rotate: "0deg",
    position: "50% 50%",
    shadowW: "6.3125rem",
    shadowH: "1.375rem",
    shadowLeft: "2rem",
    shadowTop: "9rem",
    shadowBottom: "1.1rem",
    badgeLeft: "2.625rem",
    badgeTop: "7.625rem",
  },
];

// PREMIUM 배지 — 4885:18468/18470 실측(px÷16=rem): 78.8×25, radius 9999, 그라데이션
// #8947f3→#4f298d, 테두리 2px #ddc7ff, 텍스트 12px Bold 흰색. 기본(모바일/lg 미지정)은
// 일러스트 영역 하단 우측 고정, layout.badgeLeft/Top이 있으면 lg에서 박스 기준 절대좌표로 대체
// (일러스트 하단에 겹치는 위치 — 카드 모서리에 걸렸던 이전 버그 수정).
const PREMIUM_BADGE_CLASS =
  "pointer-events-none absolute bottom-0 right-0 z-20 flex h-[1.5625rem] w-[4.925rem] " +
  "items-center justify-center rounded-full border-2 border-[#ddc7ff] " +
  "bg-gradient-to-b from-[#8947f3] to-[#4f298d] text-[0.75rem] font-bold text-white";

function ServiceCard({
  service,
  // ILLUSTRATION_LAYOUTS는 비어있지 않은 상수 배열이라 [0]은 항상 존재.
  layout = ILLUSTRATION_LAYOUTS[0]!,
}: {
  service: Service;
  layout?: IllustrationLayout;
}) {
  const link = resolveServiceLink(service);
  const isExternal = link !== null && /^https?:\/\//i.test(link);
  // serviceIconMap.default 키는 항상 정의돼 있는 최종 폴백.
  const FallbackIcon =
    serviceIconMap[service.icon ?? "default"] || serviceIconMap.default!;

  const content = (
    <>
      {/* 좌측 텍스트
          — pr-[12.5rem](200px)이 전 breakpoint에 고정돼 320px 카드(폭 280px)에서
          텍스트 실질 폭이 ~48px까지 압착됨. sm(640px)부터는 li의 max-w-[28.0938rem]로
          카드가 이미 449.5px에 도달해 원래 값이 안전하므로 그대로 두고,
          그 미만(모바일 단독 구간)만 pr-[6rem]으로 축소한다. 단, pr만 줄이면 절대 위치인
          우측 일러스트(아래 두 분기)와 겹치므로 모바일에서 일러스트도 함께 축소한다.
          lg 3열(열폭 352px)은 0729 시안 실측(px÷16=rem): pl 40.7px(2.54rem),
          pt 48.8px(3.05rem), 이름→설명 gap 16.3px(1.02rem).
          pr(10.44rem)은 시안 미제공 — 기존 값 유지. */}
      <span className="flex h-full flex-col gap-5 pl-8 pr-24 pt-11 sm:pl-11 sm:pr-50 lg:gap-[1.02rem] lg:pl-[2.54rem] lg:pr-[10.44rem] lg:pt-[3.05rem]">
        {/* 이름 24→20px(1.25rem, lg, 시안 원값 유지) — 자간은 시안 -0.48/24 = -0.02em, em 단위라 축소 시 비율 유지 */}
        <span className="block break-keep text-[1.5rem] font-semibold leading-[1.4] tracking-[-0.02em] text-ink lg:text-[1.25rem]">
          {service.name}
        </span>
        {/* 설명 lg 13.1px(0.82rem) — 시안 문자값 충실(사용자 확정, 가독성 클램프 폐기) */}
        {service.description && (
          <span className="block whitespace-pre-line break-keep text-[1rem] font-medium leading-[1.4] text-ink lg:text-[0.82rem]">
            {service.description}
          </span>
        )}
      </span>

      {/* 우측 3D 일러스트 — 모바일/태블릿(lg 미만): 세로 중앙 정렬 + 흐름상 받침 그림자(기존 유지).
          lg: 시안대로 카드 상단 기준 배치, 카드별 크기·우측 여백·회전 차등(ILLUSTRATION_LAYOUTS),
          받침 그림자는 카드 하단 기준 절대 배치로 본체와 ~5-10px 겹침. */}
      {service.icon_image_url ? (
        <span
          aria-hidden="true"
          style={
            {
              "--illo-box-w": layout.boxW,
              "--illo-box-h": layout.boxH ?? layout.boxW,
              "--illo-w": layout.w,
              "--illo-h": layout.h,
              "--illo-right": layout.right,
              "--illo-top": layout.top,
              "--illo-img-left": layout.imgLeft ?? "0rem",
              "--illo-rotate": layout.rotate,
              "--illo-shadow-w": layout.shadowW,
              "--illo-shadow-h": layout.shadowH,
              "--illo-shadow-bottom": layout.shadowBottom,
              "--illo-shadow-left": layout.shadowLeft ?? "0rem",
              "--illo-shadow-top": layout.shadowTop ?? "0rem",
              "--illo-badge-left": layout.badgeLeft ?? "0rem",
              "--illo-badge-top": layout.badgeTop ?? "0rem",
            } as React.CSSProperties
          }
          className={`pointer-events-none absolute inset-y-0 right-4 flex w-36 origin-right scale-[0.45] flex-col items-center justify-center sm:right-10 sm:scale-100 lg:right-(--illo-right) lg:w-(--illo-box-w) lg:justify-start ${layout.boxH ? "lg:h-(--illo-box-h)" : ""} ${ILLUSTRATION_LIFT_CLASS}`}
        >
          <img
            src={service.icon_image_url}
            alt=""
            loading="lazy"
            style={
              layout.position ? { objectPosition: layout.position } : undefined
            }
            className={`relative z-10 h-38 w-28 lg:h-(--illo-h) lg:w-(--illo-w) lg:rotate-(--illo-rotate) ${
              layout.imgLeft
                ? "lg:absolute lg:left-(--illo-img-left) lg:top-(--illo-top)"
                : "lg:mt-(--illo-top)"
            } ${layout.fit === "cover" ? "object-cover" : "object-contain"}`}
          />
          <img
            src={ICON_SHADOW_SRC}
            alt=""
            loading="lazy"
            className={`-mt-6 h-7.25 w-34 object-contain opacity-90 lg:h-(--illo-shadow-h) lg:w-(--illo-shadow-w) ${
              layout.shadowLeft
                ? "lg:absolute lg:left-(--illo-shadow-left) lg:top-(--illo-shadow-top) lg:mt-0"
                : "lg:absolute lg:bottom-(--illo-shadow-bottom) lg:left-1/2 lg:mt-0 lg:-translate-x-1/2"
            }`}
          />
          {/* 프리미엄 배지 — is_premium 행만. 기본은 일러스트 하단 우측 고정(회전 미적용),
              badgeLeft/Top이 있으면 lg에서 박스 기준 절대좌표로 대체(일러스트 안쪽 겹침 위치). */}
          {service.is_premium && (
            <span
              aria-hidden="true"
              className={`${PREMIUM_BADGE_CLASS} ${
                layout.badgeLeft
                  ? "lg:left-(--illo-badge-left) lg:top-(--illo-badge-top) lg:right-auto lg:bottom-auto"
                  : ""
              }`}
            >
              PREMIUM
            </span>
          )}
        </span>
      ) : (
        <span
          aria-hidden="true"
          className="pointer-events-none absolute inset-y-0 right-4 flex w-24 scale-[0.45] items-center sm:right-12.5 sm:scale-100"
        >
          {/* 별도 span에서만 translate 적용 — 부모의 세로 중앙 정렬과 transform 충돌 방지 */}
          <span
            className={`flex h-24 w-24 items-center justify-center rounded-full bg-[#F8F7F3] ${ILLUSTRATION_LIFT_CLASS}`}
          >
            <FallbackIcon className="h-10 w-10 text-primary" />
          </span>
        </span>
      )}
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

type ServicesSectionProps = {
  services?: Service[];
};

/**
 * 핵심 서비스 섹션 (명세 3.3)
 * - 아이브로우(accent) + 2줄 2톤 대제목(1행 #525252, 2행 #013262) + 3열×3행 카드 그리드
 *   (기본 셸: 0729 시안 2207:12970, 1100 캔버스, 카드 352×179px÷16=rem. 9카드 확장은
 *   QA 시트 행29·60 — 성장설계·컨설팅 프리미엄·국제·해외 프리미엄 3행 추가, 4885:18474)
 * - 카드: 좌측 텍스트(제목/설명) + 우측 3D 일러스트(icon_image_url, 없으면 lucide 폴백)
 * - 일러스트: lg 미만은 세로 중앙, lg는 시안 카드별 상단 기준 배치(크기·여백·회전 차등)
 * - is_premium 행은 일러스트 하단 우측에 PREMIUM 배지 고정 표시
 * - 카드 전체가 link 필드로 이동하는 클릭 영역 (resolveServiceLink — 서비스명 매칭도
 *   안 되고 link 도 죽은 값/공백이면 링크 없는 카드로 렌더, 폴백 목적지 없음)
 */
export default function ServicesSection({
  services = [],
}: ServicesSectionProps) {
  // 노출 개수는 DB(program_categories 활성 행)가 정한다 — 종전의 6개 상한(0729 시안의
  // 3×2 그리드 기준)은 QA 2026-08-25 로 제거했다. 7개 이상이면 3열 그리드가 자연히
  // 다음 행으로 흘러간다.
  const visibleServices = useMemo(
    () =>
      [...services].sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0)),
    [services],
  );

  if (visibleServices.length === 0) return null;

  return (
    <section aria-label="핵심 서비스" className="bg-white">
      {/* 섹션 상하 여백 — pt: 합격선배→서비스 갭 100px(6.25rem, lg), pb: 0(lg, 다음 섹션이 여백 담당) */}
      <div className="mx-auto w-full max-w-content px-5 pb-10 pt-10 sm:px-8 lg:pb-0 lg:pt-25">
        {/* 헤더 — 0729 시안 실측(px÷16=rem): 아이브로우 20px(1.25rem, accent, Regular),
            대제목 32px(2rem, lg). 대제목 자간 -0.04rem은 lg 폰트 2rem 기준 -0.02em과 동일 비율 */}
        <p className="text-[1.25rem] font-normal leading-[1.3] text-accent">
          핵심 서비스
        </p>
        {/* 대제목 2톤 — 시안: 1행 #525252, 2행 #013262. 모바일/sm은 lg 축소 비율(32/36.64≈0.8734)로 비례 축소 */}
        <h2 className="mt-1.5 text-[1.53rem] font-semibold leading-[1.4] tracking-[-0.04rem] sm:text-[1.97rem] lg:text-[2rem]">
          <span className="block text-ink">진학의 순간들을</span>
          <span className="block text-primary">
            막막하지 않도록. 필요한 만큼만.
          </span>
        </h2>

        {/* 3열×3행 카드 그리드(9카드 기본, 모바일+태블릿 1열 → lg 3열, 시안과 동일)
            — md(768px)에서 2열로 전환하면 카드 폭이 좁아져 2줄 고정 설명이 3~4줄로 깨짐(태블릿 실측).
            768~1023 구간은 1열로 유지해 모바일과 같은 넉넉한 카드 폭(텍스트 공간)을 확보한다.
            lg 3열: 콘텐츠 1100px 기준 열폭 (1100 − 2×20)/3 = 352px(grid 1fr로 자동).
            열 gap 20px(1.25rem) / 행 gap 29px(1.8125rem), 대제목→그리드 39px(2.4375rem). */}
        <ul className="mt-10 grid grid-cols-1 justify-items-center gap-8 lg:mt-9.75 lg:grid-cols-3 lg:gap-x-5 lg:gap-y-7.25">
          {visibleServices.map((service, index) => (
            <li key={service.id} className="w-full max-w-[28.0938rem]">
              <ServiceCard
                service={service}
                // 시안 일러스트 배치는 9장 기준(성장설계·컨설팅 프리미엄·국제·해외 프리미엄 포함)
                // — 10장째부터는 같은 배치를 순환한다.
                layout={
                  ILLUSTRATION_LAYOUTS[index % ILLUSTRATION_LAYOUTS.length]!
                }
              />
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
