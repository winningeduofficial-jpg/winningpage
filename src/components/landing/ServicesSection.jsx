import { useMemo } from "react";
import { Link } from "react-router-dom";
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
import { resolvePromotedSlugLink } from "../../hooks/useNavGroups";
import { SERVICE_NAME_ROUTES } from "../../data/navigation";

// DB(program_categories) link 컬럼이 죽은 값(레거시 '/services' 스텁 페이지 — 헤더/푸터 없는
// 플레이스홀더, 실 목적지 아님)이거나 비어있을 때의 최종 폴백. 이름 매칭도 실패하면 여기로.
const DEAD_SERVICE_LINK_FALLBACK = "/services/learning-diagnosis";

// service.link 해석 순서: 1) /page/services-* 구슬러그면 신규 라우트로 승격(useNavGroups와
// 동일 매핑 재사용) 2) 그래도 죽은 값('/services')·빈 값이면 서비스명으로 정본 라우트 매칭
// 3) 그것도 없으면 학습진단으로 폴백.
function resolveServiceLink(service) {
  const raw = String(service?.link || "").trim();
  const promoted = resolvePromotedSlugLink(raw);

  if (promoted && promoted !== "/services") return promoted;

  return (
    SERVICE_NAME_ROUTES[String(service?.name || "").trim()] ||
    DEAD_SERVICE_LINK_FALLBACK
  );
}

const ICON_SHADOW_SRC = "/images/landing/services/icon-shadow.png";

// 기존 Home.jsx serviceIconMap과 동일 — icon_image_url 부재 시 lucide 폴백
const serviceIconMap = {
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
  "group relative block h-[11.5625rem] w-full overflow-hidden rounded-[1.875rem] bg-white " +
  "shadow-[0_0.2063rem_0.4188rem_0.2063rem_rgba(128,128,128,0.125)] transition-[background-color,box-shadow] duration-200 " +
  "[@media(hover:hover)]:hover:bg-[#f6fbff] [@media(hover:hover)]:hover:shadow-[0_0.375rem_1rem_0.25rem_rgba(128,128,128,0.4)] " +
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#013262] focus-visible:ring-offset-2 " +
  "lg:h-[11.1875rem] lg:rounded-[1.5625rem]";

// 카드 일러스트 hover/focus 리프트 — 터치 기기에는 hover 없이 :active만 적용
const ILLUSTRATION_LIFT_CLASS =
  "service-illustration [@media(hover:hover)]:group-hover:-translate-y-[0.1875rem] " +
  "group-focus-visible:-translate-y-[0.1875rem] active:translate-y-[0.0625rem]";

/* 카드별 일러스트 배치 (lg 전용) — 0729 시안(2207:12970, 1100 캔버스, 카드 상대좌표) 실측(px÷16=rem).
   학습진단·목표관리·콜멘토는 시안 직접 실측치. 수행평가·자기평가·심화탐구는 시안 미제공 —
   구 시안(카드 356.4×181.1) 배치 비율을 신 카드(352×179, sx≈0.9877 / sy≈0.9883)로 재산정.
   시안은 세로 중앙이 아닌 카드 상단 기준 배치이며 카드마다 본체 크기·우측 여백이 다르고
   수행평가만 18.66° 회전. 받침 그림자는 동일 자산을 카드 하단 기준 shadowBottom만큼 띄워
   본체 하단과 겹치게 깐다(그림자 위치는 시안 미제공 — 구 값을 동일 비율로 재산정).
   boxW: 래퍼 폭(회전 카드는 회전 후 bbox 폭), w/h: 본체 이미지, top: 본체 상단 오프셋.
   인덱스 = sort_order 순 = 시안 카드 순서. */
const ILLUSTRATION_LAYOUTS = [
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
];

function ServiceCard({ service, layout = ILLUSTRATION_LAYOUTS[0] }) {
  const link = resolveServiceLink(service);
  const isExternal = /^https?:\/\//i.test(link);
  const FallbackIcon = serviceIconMap[service.icon] || serviceIconMap.default;

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
      <span className="flex h-full flex-col gap-[1.25rem] pl-8 pr-[6rem] pt-[2.75rem] sm:pl-[2.75rem] sm:pr-[12.5rem] lg:gap-[1.02rem] lg:pl-[2.54rem] lg:pr-[10.44rem] lg:pt-[3.05rem]">
        {/* 이름 24→20px(1.25rem, lg, 시안 원값 유지) — 자간은 시안 -0.48/24 = -0.02em, em 단위라 축소 시 비율 유지 */}
        <span className="block break-keep text-[1.5rem] font-semibold leading-[1.4] tracking-[-0.02em] text-[#525252] lg:text-[1.25rem]">
          {service.name}
        </span>
        {/* 설명 lg 13.1px(0.82rem) — 시안 문자값 충실(사용자 확정, 가독성 클램프 폐기) */}
        {service.description && (
          <span className="block whitespace-pre-line break-keep text-[1rem] font-medium leading-[1.4] text-[#525252] lg:text-[0.82rem]">
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
          style={{
            "--illo-box-w": layout.boxW,
            "--illo-w": layout.w,
            "--illo-h": layout.h,
            "--illo-right": layout.right,
            "--illo-top": layout.top,
            "--illo-rotate": layout.rotate,
            "--illo-shadow-w": layout.shadowW,
            "--illo-shadow-h": layout.shadowH,
            "--illo-shadow-bottom": layout.shadowBottom,
          }}
          className={`pointer-events-none absolute inset-y-0 right-4 flex w-36 origin-right scale-[0.45] flex-col items-center justify-center sm:right-10 sm:scale-100 lg:right-[var(--illo-right)] lg:w-[var(--illo-box-w)] lg:justify-start ${ILLUSTRATION_LIFT_CLASS}`}
        >
          <img
            src={service.icon_image_url}
            alt=""
            loading="lazy"
            className="relative z-10 h-[9.5rem] w-28 object-contain lg:mt-[var(--illo-top)] lg:h-[var(--illo-h)] lg:w-[var(--illo-w)] lg:rotate-[var(--illo-rotate)]"
          />
          <img
            src={ICON_SHADOW_SRC}
            alt=""
            loading="lazy"
            className="-mt-6 h-[1.8125rem] w-[8.5rem] object-contain opacity-90 lg:absolute lg:bottom-[var(--illo-shadow-bottom)] lg:left-1/2 lg:mt-0 lg:h-[var(--illo-shadow-h)] lg:w-[var(--illo-shadow-w)] lg:-translate-x-1/2"
          />
        </span>
      ) : (
        <span
          aria-hidden="true"
          className="pointer-events-none absolute inset-y-0 right-4 flex w-[6rem] scale-[0.45] items-center sm:right-[3.125rem] sm:scale-100"
        >
          {/* 별도 span에서만 translate 적용 — 부모의 세로 중앙 정렬과 transform 충돌 방지 */}
          <span
            className={`flex h-[6rem] w-[6rem] items-center justify-center rounded-full bg-[#F8F7F3] ${ILLUSTRATION_LIFT_CLASS}`}
          >
            <FallbackIcon className="h-10 w-10 text-[#013262]" />
          </span>
        </span>
      )}
    </>
  );

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

/**
 * 핵심 서비스 섹션 (명세 3.3)
 * - 아이브로우(accent) + 2줄 2톤 대제목(1행 #525252, 2행 #013262) + 3열×2행 카드 그리드
 *   (0729 시안 2207:12970, 1100 캔버스, 카드 352×179px÷16=rem)
 * - 카드: 좌측 텍스트(제목/설명) + 우측 3D 일러스트(icon_image_url, 없으면 lucide 폴백)
 * - 일러스트: lg 미만은 세로 중앙, lg는 시안 카드별 상단 기준 배치(크기·여백·회전 차등)
 * - 카드 전체가 link 필드로 이동하는 클릭 영역 (resolveServiceLink — 죽은 값/공백은
 *   서비스명 매칭 후 최종 /services/learning-diagnosis로 폴백)
 *
 * @param {object} props
 * @param {Array<{id: string, name: string, description?: string, link?: string,
 *   icon?: string, icon_image_url?: string, sort_order?: number}>} props.services
 *   program_categories 활성 rows (sort_order asc)
 */
export default function ServicesSection({ services = [] }) {
  const visibleServices = useMemo(
    () =>
      [...services]
        .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
        .slice(0, 6),
    [services],
  );

  if (visibleServices.length === 0) return null;

  return (
    <section aria-label="핵심 서비스" className="bg-white">
      {/* 섹션 상하 여백 — pt: 합격선배→서비스 갭 100px(6.25rem, lg), pb: 0(lg, 다음 섹션이 여백 담당) */}
      <div className="mx-auto w-full max-w-content px-5 pb-10 pt-10 sm:px-8 lg:pb-0 lg:pt-[6.25rem]">
        {/* 헤더 — 0729 시안 실측(px÷16=rem): 아이브로우 20px(1.25rem, accent, Regular),
            대제목 32px(2rem, lg). 대제목 자간 -0.04rem은 lg 폰트 2rem 기준 -0.02em과 동일 비율 */}
        <p className="text-[1.25rem] font-normal leading-[1.3] text-accent">
          핵심 서비스
        </p>
        {/* 대제목 2톤 — 시안: 1행 #525252, 2행 #013262. 모바일/sm은 lg 축소 비율(32/36.64≈0.8734)로 비례 축소 */}
        <h2 className="mt-[0.375rem] text-[1.53rem] font-semibold leading-[1.4] tracking-[-0.04rem] sm:text-[1.97rem] lg:text-[2rem]">
          <span className="block text-[#525252]">진학의 순간들을</span>
          <span className="block text-[#013262]">
            막막하지 않도록. 필요한 만큼만.
          </span>
        </h2>

        {/* 3열×2행 카드 그리드 (모바일+태블릿 1열 → lg 3열, 시안과 동일)
            — md(768px)에서 2열로 전환하면 카드 폭이 좁아져 2줄 고정 설명이 3~4줄로 깨짐(태블릿 실측).
            768~1023 구간은 1열로 유지해 모바일과 같은 넉넉한 카드 폭(텍스트 공간)을 확보한다.
            lg 3열: 콘텐츠 1100px 기준 열폭 (1100 − 2×20)/3 = 352px(grid 1fr로 자동).
            열 gap 20px(1.25rem) / 행 gap 29px(1.8125rem), 대제목→그리드 39px(2.4375rem). */}
        <ul className="mt-10 grid grid-cols-1 justify-items-center gap-8 lg:mt-[2.4375rem] lg:grid-cols-3 lg:gap-x-[1.25rem] lg:gap-y-[1.8125rem]">
          {visibleServices.map((service, index) => (
            <li key={service.id} className="w-full max-w-[28.0938rem]">
              <ServiceCard
                service={service}
                layout={ILLUSTRATION_LAYOUTS[index] ?? ILLUSTRATION_LAYOUTS[0]}
              />
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
