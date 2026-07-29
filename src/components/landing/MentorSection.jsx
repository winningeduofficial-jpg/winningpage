import { useInfiniteMarquee } from '../../hooks/useInfiniteMarquee';
import MentorCard from './MentorCard';

/**
 * 멘토 섹션 (명세 3.4, 0729 시안 2207:13029 리뉴얼)
 * - 순수 화이트 배경(기존 그라데이션 밴드 제거) + 무한 마퀴 사진 스트립 (카드 기본 210×360, 김무경 230×360)
 * - 카드 렌더는 MentorCard 프레젠테이션 컴포넌트에 위임 (신규 합성/crop 처리, 필수 항목 미비 row는 null 반환)
 * - useInfiniteMarquee 훅 사용 (화살표 없음, hover pause + 드래그/터치 스크롤 가드)
 *
 * @param {object} props
 * @param {Array<object>} props.mentors
 *   home_mentor_strategies 활성 rows (sort_order asc). row 필드 상세는 MentorCard jsdoc 참조.
 */
export default function MentorSection({ mentors = [] }) {
  const { scrollRef, repeatIndices, containerHandlers } = useInfiniteMarquee({
    itemCount: mentors.length
  });

  if (mentors.length === 0) return null;

  // 2개 이상일 때만 N배 반복 마퀴(기본 3배, 훅이 폭에 맞춰 자동 증가), 1개면 원본만 정적 렌더
  const isMarquee = mentors.length > 1;
  const renderIndices = isMarquee ? repeatIndices : mentors.map((_, index) => index);

  return (
    <section
      aria-label="위닝 멘토"
      className="mx-auto w-full max-w-[120rem] bg-white pt-10 pb-0 lg:pt-[7.5rem]"
    >
      <div className="flex w-full flex-col gap-[2.5rem]">
        <div className="mx-auto w-full max-w-content px-5 sm:px-8">
          <p className="text-[1.25rem] font-normal leading-[1.3] text-accent">멘토스 소개</p>
          <h2 className="mt-[0.5rem] break-keep text-left text-[2rem] font-semibold leading-[1.4] tracking-[-0.05rem]">
            <span className="text-[#013262]">위닝과 함께 합격한 선배에게 </span>
            <span className="text-[#808080]">멘토 상담을 받아보세요</span>
          </h2>
        </div>

        {/* 컨텐츠 폭 캡 무한 마퀴 스트립 — AcceptanceSection과 동일 구조(스크롤 컨테이너 +
            내부 w-max 리스트)로 공용 landing-marquee-mask를 사용해 콘텐츠 폭 1100px 경계
            기준 좌우 페이드(데스크톱 9rem)를 동일하게 적용한다. */}
        <div className="mx-auto w-full max-w-[120rem]" {...containerHandlers}>
          <div
            ref={scrollRef}
            className="landing-marquee-mask w-full cursor-grab overflow-x-auto [-ms-overflow-style:none] [scrollbar-width:none] active:cursor-grabbing [&::-webkit-scrollbar]:hidden"
          >
            <ul
              className={`flex w-max min-w-full items-center gap-8 px-5 sm:px-8 ${
                isMarquee ? '' : 'justify-center'
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
                  <MentorCard key={`${mentor.id}-${position}`} mentor={mentor} isClone={isClone} />
                );
              })}
            </ul>
          </div>
        </div>
      </div>
    </section>
  );
}
