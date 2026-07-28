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

const CARD_CLASS =
  'group relative block h-[13.5625rem] w-full overflow-hidden rounded-[1.875rem] bg-white ' +
  'shadow-[0_0.125rem_0.25rem_0.125rem_rgba(215,215,215,0.3)] transition-[background-color,box-shadow] duration-200 ' +
  '[@media(hover:hover)]:hover:bg-[#f6fbff] [@media(hover:hover)]:hover:shadow-[0_0.375rem_1rem_0.25rem_rgba(215,215,215,0.5)] ' +
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#013262] focus-visible:ring-offset-2';

// 카드 일러스트 hover/focus 리프트 — 터치 기기에는 hover 없이 :active만 적용
const ILLUSTRATION_LIFT_CLASS =
  'service-illustration [@media(hover:hover)]:group-hover:-translate-y-[0.1875rem] ' +
  'group-focus-visible:-translate-y-[0.1875rem] active:translate-y-[0.0625rem]';

function ServiceCard({ service }) {
  const link = service.link || '/services';
  const isExternal = /^https?:\/\//i.test(link);
  const FallbackIcon = serviceIconMap[service.icon] || serviceIconMap.default;

  const content = (
    <>
      {/* 좌측 텍스트
          — pr-[12.5rem](200px)이 전 breakpoint에 고정돼 320px 카드(폭 280px)에서
          텍스트 실질 폭이 ~48px까지 압착됨. sm(640px)부터는 li의 max-w-[28.0938rem]로
          카드가 이미 데스크톱과 동일한 449.5px에 도달해 원래 값이 안전하므로 그대로 두고
          (lg 2열에서도 max-w-content 콘텐츠 1136px 기준 열폭 548px ≥ 449.5px로 동일),
          그 미만(모바일 단독 구간)만 pr-[6rem]으로 축소한다. 단, pr만 줄이면 절대 위치인
          우측 일러스트(아래 두 분기)와 겹치므로 모바일에서 일러스트도 함께 축소한다. */}
      <span className="flex h-full flex-col gap-[1.25rem] pl-8 pr-[6rem] pt-[3.75rem] sm:pl-[3.125rem] sm:pr-[12.5rem]">
        <span className="block break-keep text-[1.5rem] font-semibold leading-[1.4] tracking-[-0.03rem] text-[#525252]">
          {service.name}
        </span>
        {service.description && (
          <span className="block whitespace-pre-line break-keep text-[1rem] font-medium leading-[1.4] text-[#525252]">
            {service.description}
          </span>
        )}
      </span>

      {/* 우측 3D 일러스트 — 카드 안에서 세로 중앙 정렬 + 하단 받침 그림자 */}
      {service.icon_image_url ? (
        <span
          aria-hidden="true"
          className={`pointer-events-none absolute inset-y-0 right-4 flex w-[10.625rem] origin-right scale-[0.45] flex-col items-center justify-center sm:right-10 sm:scale-100 ${ILLUSTRATION_LIFT_CLASS}`}
        >
          <img
            src={service.icon_image_url}
            alt=""
            loading="lazy"
            className="relative z-10 h-[9.5rem] w-[10.625rem] object-contain"
          />
          <img
            src={ICON_SHADOW_SRC}
            alt=""
            loading="lazy"
            className="-mt-6 h-[1.8125rem] w-[8.5rem] object-contain opacity-90"
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
 * - 골드 eyebrow + 2줄 대제목 + 2열×3행 카드 그리드 (카드 427×217, radius 30)
 * - 카드: 좌측 텍스트(제목/설명) + 우측 3D 일러스트(icon_image_url, 없으면 lucide 폴백)
 * - 일러스트는 카드 안에서 세로 중앙 정렬, 하단에 받침 그림자 이미지 레이어
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
      <div className="mx-auto w-full max-w-content px-5 pb-10 pt-10 sm:px-8">
        {/* 헤더 */}
        <p className="text-[1.25rem] font-semibold leading-[1.3] text-[#013262]">핵심 서비스</p>
        <h2 className="mt-[0.625rem] whitespace-pre-line text-[1.75rem] font-bold leading-[1.4] tracking-[-0.055rem] text-[#525252] sm:text-[2.25rem] lg:text-[2.75rem]">
          {'진학의 순간들을\n막막하지 않도록. 필요한 만큼만.'}
        </h2>

        {/* 2열×3행 카드 그리드 (모바일+태블릿 1열 → lg 2열 상한)
            — md(768px)에서 2열로 전환하면 카드 폭이 좁아져 2줄 고정 설명이 3~4줄로 깨짐(태블릿 실측).
            768~1023 구간은 1열로 유지해 모바일과 같은 넉넉한 카드 폭(텍스트 공간)을 확보한다.
            컨테이너가 max-w-content(1200px, 콘텐츠 1136px)로 좁아져 3열이면 카드가 압착되므로
            lg 이상은 2열 상한 — 2열 기준 열폭 548px ≥ 카드 max-w 449.5px로 원설계 폭이 유지된다. */}
        <ul className="mt-10 grid grid-cols-1 justify-items-center gap-10 lg:grid-cols-2">
          {visibleServices.map((service) => (
            <li key={service.id} className="w-full max-w-[28.0938rem]">
              <ServiceCard service={service} />
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
