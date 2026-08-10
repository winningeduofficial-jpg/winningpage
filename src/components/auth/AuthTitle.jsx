// 타이틀(32px SemiBold, 최대 2줄) — docs/login-signup-renewal-spec.md §3.0/§3.3/§5.1.
// 화면마다 1줄/2줄 색 배분이 다르다(예: A-1은 1줄 ink·2줄 primary, B-1은 1줄 primary·2줄 ink,
// C-2는 이름부 ink+강조 primary가 한 줄에 섞임) — 색을 줄 단위로만 강제하면 표현이 부족해
// 각 줄을 문자열 대신 ReactNode로도 받아 줄 내부에서 <span className="text-primary">로
// 부분 강조가 가능하도록 한다(line1Color/line2Color는 해당 줄 전체 기본색만 지정).
export default function AuthTitle({
  line1,
  line2,
  line1Color = 'ink', // 'ink' | 'primary'
  line2Color = 'primary', // 'ink' | 'primary'
  align = 'center', // 'center' | 'left'
  className = ''
}) {
  const colorClass = { ink: 'text-ink', primary: 'text-primary' };

  return (
    <h1
      className={`break-keep text-2xl font-semibold leading-[1.4] tracking-[-0.04rem] sm:text-[2rem] ${
        align === 'center' ? 'text-center' : 'text-left'
      } ${className}`}
    >
      <span className={colorClass[line1Color] || colorClass.ink}>{line1}</span>

      {line2 && (
        <>
          <br />
          <span className={colorClass[line2Color] || colorClass.primary}>{line2}</span>
        </>
      )}
    </h1>
  );
}
