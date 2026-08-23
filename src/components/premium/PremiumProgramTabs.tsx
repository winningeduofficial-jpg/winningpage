import { Link } from "react-router";
import {
  PREMIUM_ADMISSION_A_PATH,
  PREMIUM_ADMISSION_S_PATH,
} from "./premiumRoutesPaths";

// 대입컨설팅 A/S 프로그램 상단 탭바 — 헤더 바로 아래, 히어로 위. 시안: 검정 풀폭,
// 세로 패딩 40px(2.5rem), 탭 2개 중앙 정렬 gap 60px(3.75rem), 탭 세로 패딩 20px(1.25rem),
// 텍스트 24px(1.5rem) SemiBold 흰색, 활성 탭만 하단 보더 2px 흰색.
// 모바일: gap 32px(2rem), 텍스트 18px(1.125rem).

type PremiumProgramTabsProps = {
  active: "a" | "s";
};

const TABS = [
  { key: "a" as const, label: "A 프로그램", to: PREMIUM_ADMISSION_A_PATH },
  { key: "s" as const, label: "S 프로그램", to: PREMIUM_ADMISSION_S_PATH },
];

export default function PremiumProgramTabs({
  active,
}: PremiumProgramTabsProps) {
  return (
    <nav
      aria-label="프리미엄 대입컨설팅 프로그램"
      className="w-full bg-black py-8 sm:py-10"
    >
      <div className="mx-auto flex w-full max-w-content items-center justify-center gap-8 px-5 sm:gap-[3.75rem]">
        {TABS.map((tab) => {
          const isActive = tab.key === active;

          return (
            <Link
              key={tab.key}
              to={tab.to}
              aria-current={isActive ? "page" : undefined}
              className={`break-keep border-b-2 py-4 text-[1.125rem] font-semibold leading-[1.4] text-white sm:py-5 sm:text-[1.5rem] ${
                isActive ? "border-white" : "border-transparent"
              }`}
            >
              {tab.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
