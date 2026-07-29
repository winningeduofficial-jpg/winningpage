/**
 * 멘토 카드 (MentorSection에서 추출한 프레젠테이션 컴포넌트)
 * - 카드 = 흰 배경 + 상단 텍스트(badge/title_lines) + 하단 투명 인물사진(photo_url/photo) 합성
 * - badge/title_lines/photo_url/photo 중 하나라도 없는 row는 카드를 렌더하지 않음(null 반환)
 * - 마퀴/클론 로직은 MentorSection이 소유 — 이 컴포넌트는 isClone 여부만 받아 aria-hidden 처리
 * - 관리자 라이브 프리뷰에서도 동일 컴포넌트를 사용해 프리뷰=실렌더를 보장
 *
 * @param {object} props
 * @param {{
 *   id: string,
 *   mentor_name?: string,
 *   badge?: string,
 *   title_lines?: string[],
 *   photo_url?: string,
 *   photo?: { top: number, left: number, width: number, height: number,
 *     crop?: { top: string, height: string } },
 *   card_width?: number,
 *   sort_order?: number,
 * }} props.mentor
 *   home_mentor_strategies row.
 *   - mentor_name: alt 텍스트 생성용 ("${mentor_name} 멘토")
 *   - badge/title_lines: 카드 상단 텍스트 블록 (badge 1행 + title_lines 각 라인)
 *   - photo_url/photo: 카드 하단 투명 인물사진 및 절대 위치(px, 컴포넌트에서 rem 환산)
 *   - photo.crop: 사진 높이가 카드를 초과해 내부 크롭이 필요한 경우만 존재 (예: 김성훈)
 *   - card_width: 카드 너비(px), 기본 210
 * @param {boolean} [props.isClone=false]
 *   마퀴 N배 반복 중 클론 사이클 여부 — true면 aria-hidden 처리로 스크린리더에서 제외
 * @returns {JSX.Element|null}
 *   badge/title_lines/photo_url/photo 중 하나라도 없으면 null (카드 미노출)
 */
export default function MentorCard({ mentor, isClone = false }) {
  const hasNewCard = Boolean(
    mentor.badge && mentor.title_lines && mentor.photo_url && mentor.photo
  );
  if (!hasNewCard) return null;

  const cardWidthRem = (mentor.card_width || 210) / 16;

  return (
    <li
      aria-hidden={isClone || undefined}
      className="relative h-[22.5rem] shrink-0 overflow-hidden rounded-[1.25rem] bg-white"
      style={{ width: `${cardWidthRem}rem` }}
    >
      <div className="absolute left-1/2 top-[1.5rem] flex w-[12.25rem] -translate-x-1/2 flex-col items-center gap-[0.25rem] text-center">
        <p className="text-[1rem] font-semibold leading-[1.4] text-[#525252]">{mentor.badge}</p>
        {mentor.title_lines.map((line) => (
          <p key={line} className="text-[0.9375rem] font-medium leading-[1.4] text-[#808080]">
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
          height: `${mentor.photo.height / 16}rem`
        }}
      >
        <img
          src={mentor.photo_url}
          alt={`${mentor.mentor_name} 멘토`}
          loading="lazy"
          draggable="false"
          className={
            mentor.photo.crop ? 'absolute left-0 w-full object-cover' : 'h-full w-full object-cover'
          }
          style={
            mentor.photo.crop
              ? { top: mentor.photo.crop.top, height: mentor.photo.crop.height }
              : undefined
          }
        />
      </div>
    </li>
  );
}
