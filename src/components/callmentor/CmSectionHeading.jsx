/**
 * 콜멘토 랜딩 전용 섹션 헤딩 셸 (docs/callmentor-spec.md 5.1.5 `CmSectionHeading`).
 * 시안 6개 헤딩(좌/중앙 정렬, eyebrow 유무, 부제 유무, 혼합 색)이 색·줄바꿈 조합이 제각각이라
 * `heading` 은 완성된 노드(문자열 또는 색상 span 조합)를 그대로 받는다 — 무리하게 세분화한
 * props 계약보다 호출부에서 조합하는 편이 유지보수가 쉽다(스펙 문서의 props 후보는 예시일 뿐).
 *
 * @param {object} props
 * @param {string} [props.eyebrow]
 * @param {string} [props.eyebrowColor='#AF9364']
 * @param {import('react').ReactNode} props.heading
 * @param {string} [props.headingColor] 헤딩 전체 단색인 경우만 사용(혼합색은 heading 내부 span으로 지정)
 * @param {'bold'|'semibold'} [props.weight='bold']
 * @param {'left'|'center'} [props.align='left']
 * @param {string} [props.sub] 부제(섹션 3 전용)
 * @param {string} [props.subColor='#FFFFFF']
 */
export default function CmSectionHeading({
  eyebrow,
  eyebrowColor = '#AF9364',
  heading,
  headingColor,
  weight = 'bold',
  align = 'left',
  sub,
  subColor = '#FFFFFF'
}) {
  return (
    <div
      className={`flex flex-col gap-3 ${align === 'center' ? 'items-center text-center' : 'items-start text-left'}`}
    >
      {eyebrow && (
        <p className="text-[1.25rem] font-semibold leading-[1.3]" style={{ color: eyebrowColor }}>
          {eyebrow}
        </p>
      )}
      <h2
        className={`break-keep text-[2rem] leading-[1.4] ${weight === 'semibold' ? 'font-semibold' : 'font-bold'}`}
        style={headingColor ? { color: headingColor } : undefined}
      >
        {heading}
      </h2>
      {sub && (
        <p className="text-[1.25rem] font-semibold leading-[1.3]" style={{ color: subColor }}>
          {sub}
        </p>
      )}
    </div>
  );
}
