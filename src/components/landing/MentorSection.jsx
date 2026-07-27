import { useInfiniteMarquee } from '../../hooks/useInfiniteMarquee';

/** 라이트 블루 그라데이션 풀폭 밴드 (Figma 1479:4378 추출) */
const BAND_GRADIENT =
  'linear-gradient(106.26deg, #FFFFFF 0.48%, rgba(176, 215, 254, 0.845) 32.4%, rgba(98, 171, 255, 0.2) 79.1%, rgba(11, 132, 253, 0.25) 99.6%)';

/**
 * 멘토 섹션 (명세 3.4)
 * - 라이트 블루 그라데이션 풀폭 밴드 + 무한 마퀴 사진 스트립 (카드 210×360)
 * - 카드 = 통이미지 1장 (텍스트는 디자이너가 이미지에 포함해 관리자로 업로드)
 * - useInfiniteMarquee 훅 사용 (화살표 없음, hover pause + 드래그/터치 스크롤 가드)
 *
 * @param {object} props
 * @param {Array<{id: string, image_url: string, mentor_name?: string,
 *   sort_order?: number}>} props.mentors
 *   home_mentor_strategies 활성 rows (sort_order asc) — 렌더에는 image_url만 사용,
 *   mentor_name은 alt 텍스트 폴백용
 */
export default function MentorSection({ mentors = [] }) {
  const { scrollRef, repeatIndices, containerHandlers } = useInfiniteMarquee({
    itemCount: mentors.length,
  });

  if (mentors.length === 0) return null;

  // 2개 이상일 때만 N배 반복 마퀴(기본 3배, 훅이 폭에 맞춰 자동 증가), 1개면 원본만 정적 렌더
  const isMarquee = mentors.length > 1;
  const renderIndices = isMarquee
    ? repeatIndices
    : mentors.map((_, index) => index);

  return (
    <section
      aria-label="위닝 멘토"
      className="w-full pt-10 pb-20"
      style={{ background: BAND_GRADIENT }}
    >
      <div className="flex w-full flex-col gap-[3.75rem]">
        <div className="mx-auto w-full max-w-[93.75rem] px-5 sm:px-8">
          <p className="text-[1.25rem] font-semibold leading-[1.3] text-[#013262]">멘토스 소개</p>
          <h2 className="mt-[0.625rem] break-keep text-left text-[1.75rem] font-bold leading-[1.4] tracking-[-0.06875rem] sm:text-[2.25rem] lg:text-[2.75rem]">
            <span className="text-[#013262]">위닝과 함께 합격한 선배에게 </span>
            <span className="text-[#808080]">멘토 상담을 받아보세요</span>
          </h2>
        </div>

        {/* 좌우 블리드 풀폭 무한 마퀴 스트립 */}
        <div className="w-full" {...containerHandlers}>
          <ul
            ref={scrollRef}
            className={`flex w-full cursor-grab gap-5 overflow-x-auto px-5 [-ms-overflow-style:none] [scrollbar-width:none] active:cursor-grabbing [&::-webkit-scrollbar]:hidden sm:px-8 ${isMarquee ? '' : 'justify-center'
              }`}
          >
            {renderIndices.map((mentorIndex, position) => {
              const mentor = mentors[mentorIndex];
              if (!mentor) return null;

              // N배 반복 중 사이클 1(초기 표시 사이클)만 스크린리더에 노출
              // — AcceptanceSection과 동일한 cycle 계산식 (repeatCount 동적 증가에도 유효)
              const cycle = Math.floor(position / mentors.length);
              const isClone = isMarquee && cycle !== 1;

              return (
                <li
                  key={`${mentor.id}-${position}`}
                  aria-hidden={isClone || undefined}
                  className="h-[22.5rem] w-[13.125rem] shrink-0 overflow-hidden rounded-[1.25rem] bg-white/60"
                >
                  <img
                    src={mentor.image_url}
                    alt={mentor.mentor_name || '위닝 멘토'}
                    width="210"
                    height="360"
                    loading="lazy"
                    draggable="false"
                    className="h-full w-full object-cover"
                  />
                </li>
              );
            })}
          </ul>
        </div>
      </div>
    </section>
  );
}
