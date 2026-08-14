// 타이틀(32px SemiBold, 최대 2줄) — docs/login-signup-renewal-spec.md §3.0/§3.3/§5.1.
// 화면마다 1줄/2줄 색 배분이 다르다(예: A-1은 1줄 ink·2줄 primary, B-1은 1줄 primary·2줄 ink,
// C-2는 이름부 ink+강조 primary가 한 줄에 섞임) — 색을 줄 단위로만 강제하면 표현이 부족해
// 각 줄을 문자열 대신 ReactNode로도 받아 줄 내부에서 <span className="text-primary">로
// 부분 강조가 가능하도록 한다(line1Color/line2Color는 해당 줄 전체 기본색만 지정).

// 타이포 프리셋. default 는 위 스펙 값 그대로다(24px → sm 32px SemiBold, lh 1.4,
// ls -0.64px). login 은 결제 플로우 로그인 시안 실측값이다 —
//   390(1882:9300)  24px w700 lh34 ls-0.48
//   1920(1882:9058) 36px w700 lh50 ls-0.72
// ls 는 두 폭 모두 폰트크기 × -0.02 이므로 tracking 은 단일값 -0.02em 으로 충분하다
// (24 × 0.02 = 0.48 / 36 × 0.02 = 0.72). lh 는 34/16 = 2.125rem, 50/16 = 3.125rem.
// default 를 바꾸면 이 컴포넌트를 공유하는 회원가입·약관 20여 화면 타이틀이 함께
// 커지므로, AuthLayout 의 WIDTH_CLASSES.login 선례와 같이 로그인 전용 키로 분리했다.
import type { ReactNode } from "react";

const VARIANT_CLASSES: Record<string, string> = {
  default:
    "text-2xl font-semibold leading-[1.4] tracking-[-0.04rem] sm:text-[2rem]",
  login:
    "text-2xl font-bold leading-[2.125rem] tracking-[-0.02em] sm:text-[2.25rem] sm:leading-[3.125rem]",
};

// 로그인 시안(1882:9058)은 1줄 #181d24(= ink.title) + 2줄 #013262(= primary)로
// 픽셀 실측된다. 줄 단위 색에 'title' 을 추가해 그 배분을 프롭으로 표현할 수 있게 한다.
const COLOR_CLASSES: Record<string, string> = {
  ink: "text-ink",
  title: "text-ink-title",
  primary: "text-primary",
};

type AuthTitleProps = {
  line1: ReactNode;
  line2?: ReactNode;
  line1Color?: string;
  line2Color?: string;
  variant?: string;
  align?: "center" | "left";
  className?: string;
};

export default function AuthTitle({
  line1,
  line2,
  line1Color = "ink",
  line2Color = "primary",
  variant = "default",
  align = "center",
  className = "",
}: AuthTitleProps) {
  return (
    <h1
      className={`break-keep ${VARIANT_CLASSES[variant] || VARIANT_CLASSES.default} ${
        align === "center" ? "text-center" : "text-left"
      } ${className}`}
    >
      <span className={COLOR_CLASSES[line1Color] || COLOR_CLASSES.ink}>
        {line1}
      </span>

      {line2 && (
        <>
          <br />
          <span className={COLOR_CLASSES[line2Color] || COLOR_CLASSES.primary}>
            {line2}
          </span>
        </>
      )}
    </h1>
  );
}
