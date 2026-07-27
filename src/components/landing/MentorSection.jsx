import { useInfiniteMarquee } from '../../hooks/useInfiniteMarquee';

/** 라이트 블루 그라데이션 풀폭 밴드 (Figma 1479:4378 추출) */
const BAND_GRADIENT =
  'linear-gradient(106.26deg, #FFFFFF 0.48%, rgba(176, 215, 254, 0.845) 32.4%, rgba(98, 171, 255, 0.2) 79.1%, rgba(11, 132, 253, 0.25) 99.6%)';

/**
 * 멘토 섹션 (명세 3.4, Figma 1982:7301 리뉴얼)
 * - 라이트 블루 그라데이션 풀폭 밴드 + 무한 마퀴 사진 스트립 (카드 기본 210×360, 김무경 230×360)
 * - 카드 = 흰 배경 + 상단 텍스트(badge/title_lines) + 하단 투명 인물사진(photo_url/photo) 합성
 * - badge/title_lines/photo_url 중 하나라도 없는 row(구버전)는 기존 통이미지(image_url) 풀블리드 렌더로 폴백
 * - useInfiniteMarquee 훅 사용 (화살표 없음, hover pause + 드래그/터치 스크롤 가드)
 *
 * @param {object} props
 * @param {Array<{
 *   id: string,
 *   image_url: string,
 *   mentor_name?: string,
 *   badge?: string,
 *   title_lines?: string[],
 *   photo_url?: string,
 *   photo?: { top: number, left: number, width: number, height: number,
 *     crop?: { top: string, height: string } },
 *   card_width?: number,
 *   sort_order?: number,
 * }>} props.mentors
 *   home_mentor_strategies 활성 rows (sort_order asc).
 *   - image_url: 하위호환 통이미지 폴백 (구버전 rows 전용)
 *   - mentor_name: alt 텍스트 생성용 ("${mentor_name} 멘토") 및 통이미지 폴백 alt
 *   - badge/title_lines: 카드 상단 텍스트 블록 (badge 1행 + title_lines 각 라인)
 *   - photo_url/photo: 카드 하단 투명 인물사진 및 절대 위치(px, 컴포넌트에서 rem 환산)
 *   - photo.crop: 사진 높이가 카드를 초과해 내부 크롭이 필요한 경우만 존재 (예: 김성훈)
 *   - card_width: 카드 너비(px), 기본 210
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

              const hasNewCard = Boolean(
                mentor.badge && mentor.title_lines && mentor.photo_url && mentor.photo
              );
              const cardWidthRem = (mentor.card_width || 210) / 16;

              return (
                <li
                  key={`${mentor.id}-${position}`}
                  aria-hidden={isClone || undefined}
                  className="relative h-[22.5rem] shrink-0 overflow-hidden rounded-[1.25rem] bg-white"
                  style={{ width: `${cardWidthRem}rem` }}
                >
                  {hasNewCard ? (
                    <>
                      <div className="absolute left-1/2 top-[1.5rem] flex w-[12.25rem] -translate-x-1/2 flex-col items-center gap-[0.25rem] text-center">
                        <p className="text-[1rem] font-semibold leading-[1.4] text-[#525252]">
                          {mentor.badge}
                        </p>
                        {mentor.title_lines.map((line) => (
                          <p
                            key={line}
                            className="text-[0.9375rem] font-medium leading-[1.4] text-[#808080]"
                          >
                            {line}
                          </p>
                        ))}
                      </div>
                      <div
                        className={`absolute ${mentor.photo.crop ? 'overflow-hidden' : ''}`}
                        style={{
                          top: `${mentor.photo.top / 16}rem`,
                          left: `${mentor.photo.left / 16}rem`,
                          width: `${mentor.photo.width / 16}rem`,
                          height: `${mentor.photo.height / 16}rem`,
                        }}
                      >
                        <img
                          src={mentor.photo_url}
                          alt={`${mentor.mentor_name} 멘토`}
                          loading="lazy"
                          draggable="false"
                          className={
                            mentor.photo.crop
                              ? 'absolute left-0 w-full object-cover'
                              : 'h-full w-full object-cover'
                          }
                          style={
                            mentor.photo.crop
                              ? { top: mentor.photo.crop.top, height: mentor.photo.crop.height }
                              : undefined
                          }
                        />
                      </div>
                    </>
                  ) : (
                    <img
                      src={mentor.image_url}
                      alt={mentor.mentor_name || '위닝 멘토'}
                      width="210"
                      height="360"
                      loading="lazy"
                      draggable="false"
                      className="h-full w-full object-cover"
                    />
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      </div>
    </section>
  );
}
