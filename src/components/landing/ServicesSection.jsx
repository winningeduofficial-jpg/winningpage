import { useMemo } from 'react';
import { Link } from 'react-router-dom';
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
} from 'lucide-react';

const ICON_SHADOW_SRC = '/images/landing/services/icon-shadow.png';

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

/* 카드 셸 — 시안(1889:4876, 1920 캔버스) 실측 → 1136 환산(×0.8347 = 1136/그리드 실폭 1361)
   높이 217→181.1px(11.32rem, lg), radius 30→25px(1.5625rem, lg), 테두리 1px #D7D7D7(시안),
   그림자 0 4px 8px 4px rgba(128,128,128,0.3) → 0 3.3 6.7 3.3(색·투명도는 원값 유지).
   hover는 시안에 없는 구현측 인터랙션 — 동작은 유지하되 그림자 색만 기본과 동계열로 통일. */
const CARD_CLASS =
  'group relative block h-[11.5625rem] w-full overflow-hidden rounded-[1.875rem] border border-[#D7D7D7] bg-white ' +
  'shadow-[0_0.2063rem_0.4188rem_0.2063rem_rgba(128,128,128,0.3)] transition-[background-color,box-shadow] duration-200 ' +
  '[@media(hover:hover)]:hover:bg-[#f6fbff] [@media(hover:hover)]:hover:shadow-[0_0.375rem_1rem_0.25rem_rgba(128,128,128,0.4)] ' +
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#013262] focus-visible:ring-offset-2 ' +
  'lg:h-[11.32rem] lg:rounded-[1.5625rem]';

// 카드 일러스트 hover/focus 리프트 — 터치 기기에는 hover 없이 :active만 적용
const ILLUSTRATION_LIFT_CLASS =
  'service-illustration [@media(hover:hover)]:group-hover:-translate-y-[0.1875rem] ' +
  'group-focus-visible:-translate-y-[0.1875rem] active:translate-y-[0.0625rem]';

/* 카드별 일러스트 배치 (lg 전용) — 시안 실측(1920, 카드 상대좌표) → 1136 환산(×0.8347).
   시안은 세로 중앙이 아닌 카드 상단 기준 배치이며 카드마다 본체 크기·우측 여백이 다르고
   수행평가만 18.66° 회전. 받침 그림자는 동일 자산(136×29, 무료진단만 124.4×26.5)을
   카드 하단 기준 shadowBottom만큼 띄워 본체 하단과 ~5-10px 겹치게 깐다.
   boxW: 래퍼 폭(회전 카드는 회전 후 bbox 폭), w/h: 본체 이미지, top: 본체 상단 오프셋
   (수행평가는 bbox top 21.2 + (bboxH 138.4 − 본체 103.5)/2 = 38.7px — 회전 원점이 중앙이므로 보정).
   인덱스 = sort_order 순 = 시안 카드 순서. */
const ILLUSTRATION_LAYOUTS = [
  // 무료진단 — 본체 146×123.1 / right 60 / top 48 / 그림자 124.4×26.5, 하단 44.1
  { boxW: '7.62rem', w: '7.62rem', h: '6.42rem', right: '3.13rem', top: '2.5rem',
    rotate: '0deg', shadowW: '6.49rem', shadowH: '1.38rem', shadowBottom: '2.3rem' },
  // 목표관리 — 본체 137×151 / right 51 / top 21 / 그림자 하단 26
  { boxW: '7.15rem', w: '7.15rem', h: '7.88rem', right: '2.66rem', top: '1.1rem',
    rotate: '0deg', shadowW: '7.09rem', shadowH: '1.51rem', shadowBottom: '1.36rem' },
  // 콜멘토 — 본체 175.2×144 / right 47.8 / top 25 / 그림자 하단 21
  { boxW: '9.14rem', w: '9.14rem', h: '7.51rem', right: '2.49rem', top: '1.3rem',
    rotate: '0deg', shadowW: '7.09rem', shadowH: '1.51rem', shadowBottom: '1.1rem' },
  // 수행평가 — 본체 151×124 회전 18.66° → bbox 182.7×165.8 / bbox right ~2 / bbox top 25.4 / 그림자 하단 23
  { boxW: '9.53rem', w: '7.88rem', h: '6.47rem', right: '0.1rem', top: '2.42rem',
    rotate: '18.66deg', shadowW: '7.09rem', shadowH: '1.51rem', shadowBottom: '1.2rem' },
  // 자기평가 — 본체 146×144 / right 52 / top 35 / 그림자 하단 18
  { boxW: '7.62rem', w: '7.62rem', h: '7.51rem', right: '2.71rem', top: '1.83rem',
    rotate: '0deg', shadowW: '7.09rem', shadowH: '1.51rem', shadowBottom: '0.94rem' },
  // 심화탐구 — 본체 169.3×133 / right 44.7 / top 45 / 그림자 하단 23
  { boxW: '8.83rem', w: '8.83rem', h: '6.94rem', right: '2.33rem', top: '2.35rem',
    rotate: '0deg', shadowW: '7.09rem', shadowH: '1.51rem', shadowBottom: '1.2rem' },
];

function ServiceCard({ service, layout = ILLUSTRATION_LAYOUTS[0] }) {
  const link = service.link || '/services';
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
          lg 3열(열폭 356.4px)은 시안 환산으로 재산정: pl 50→41.7px(2.61rem),
          pt 60→50.1px(3.13rem), pr 200×0.8347≈167px(10.44rem),
          이름→설명 20→16.7px(1.04rem). */}
      <span className="flex h-full flex-col gap-[1.25rem] pl-8 pr-[6rem] pt-[2.75rem] sm:pl-[2.75rem] sm:pr-[12.5rem] lg:gap-[1.04rem] lg:pl-[2.61rem] lg:pr-[10.44rem] lg:pt-[3.13rem]">
        {/* 이름 24→20px(1.25rem, lg) — 자간은 시안 -0.48/24 = -0.02em, em 단위라 축소 시 비율 유지 */}
        <span className="block break-keep text-[1.5rem] font-semibold leading-[1.4] tracking-[-0.02em] text-[#525252] lg:text-[1.25rem]">
          {service.name}
        </span>
        {/* 설명 16px 환산 13.4px < 본문 가독성 하한 14px → 0.875rem 클램프 */}
        {service.description && (
          <span className="block whitespace-pre-line break-keep text-[1rem] font-medium leading-[1.4] text-[#525252] lg:text-[0.875rem]">
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
            '--illo-box-w': layout.boxW,
            '--illo-w': layout.w,
            '--illo-h': layout.h,
            '--illo-right': layout.right,
            '--illo-top': layout.top,
            '--illo-rotate': layout.rotate,
            '--illo-shadow-w': layout.shadowW,
            '--illo-shadow-h': layout.shadowH,
            '--illo-shadow-bottom': layout.shadowBottom,
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
    <Link to={link} aria-label={`${service.name} 바로가기`} className={CARD_CLASS}>
      {content}
    </Link>
  );
}

/**
 * 핵심 서비스 섹션 (명세 3.3)
 * - 아이브로우 + 2줄 2톤 대제목(1행 #808080, 2행 #013262) + 3열×2행 카드 그리드
 *   (시안 1889:4876, 1920 캔버스 카드 427×217 → 1136 환산 ×0.8347)
 * - 카드: 좌측 텍스트(제목/설명) + 우측 3D 일러스트(icon_image_url, 없으면 lucide 폴백)
 * - 일러스트: lg 미만은 세로 중앙, lg는 시안 카드별 상단 기준 배치(크기·여백·회전 차등)
 * - 카드 전체가 link 필드로 이동하는 클릭 영역 (기본 /services)
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
      {/* 섹션 상하 여백 — 시안 상 119.6 / 하 120px → 환산 99.8/100.2px ≈ 6.25rem (lg) */}
      <div className="mx-auto w-full max-w-content px-5 pb-10 pt-10 sm:px-8 lg:pb-[6.25rem] lg:pt-[6.25rem]">
        {/* 헤더 — 시안 1920 실측 → 1136 환산(×0.8347): 아이브로우 20→16.7px(1.04rem),
            대제목 44→36.7px(2.29rem). 자간은 시안 -0.88/44 = -0.02em — em 단위라 축소 시 비율 유지 */}
        <p className="text-[1.25rem] font-semibold leading-[1.3] text-[#013262] lg:text-[1.04rem]">핵심 서비스</p>
        {/* 대제목 2톤 — 시안: 1행 #808080, 2행 #013262 */}
        <h2 className="mt-[0.625rem] text-[1.75rem] font-bold leading-[1.4] tracking-[-0.02em] sm:text-[2.25rem] lg:text-[2.29rem]">
          <span className="block text-[#808080]">진학의 순간들을</span>
          <span className="block text-[#013262]">막막하지 않도록. 필요한 만큼만.</span>
        </h2>

        {/* 3열×2행 카드 그리드 (모바일+태블릿 1열 → lg 3열, 시안과 동일)
            — md(768px)에서 2열로 전환하면 카드 폭이 좁아져 2줄 고정 설명이 3~4줄로 깨짐(태블릿 실측).
            768~1023 구간은 1열로 유지해 모바일과 같은 넉넉한 카드 폭(텍스트 공간)을 확보한다.
            lg 3열: 콘텐츠 1136px 기준 열폭 (1136 − 2×33.4)/3 = 356.4px — 시안 427×0.8347과 일치.
            간격 40→33.4px(2.09rem), 대제목→그리드 99.4→83px(5.19rem). */}
        <ul className="mt-10 grid grid-cols-1 justify-items-center gap-8 lg:mt-[5.19rem] lg:grid-cols-3 lg:gap-[2.09rem]">
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
