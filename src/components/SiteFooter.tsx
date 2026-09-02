import { Link } from "react-router";
import { COMPANY } from "@/data/company";
import { useNavGroups } from "@/hooks/useNavGroups";

// 결제/랜딩 공용 푸터. 사업자 정보 + 이용약관/개인정보처리방침 링크 포함.
// 메뉴 컬럼은 헤더 메가메뉴와 동일한 useNavGroups()(DB → 캐시 → fallback)를 공유한다.
// lg+ 데스크톱: Figma 4782:3568(1920 기준) — 상단 블록 px 220/py 100, 로고 그룹↔컬럼
// gap 300px, 컬럼 간 gap 100px. 1920 미만(lg~1919)은 px/gap을 clamp()로 뷰포트 비례
// 축소하고, 1920 이상은 max-w-[120rem]로 캡해 실측값을 그대로 유지한다(1440~1919 비례
// 축소·1920 실값 일치 방침, docs/header-footer-figma-2026-09.md §7). 로고는 정본
// /images/winning-logo-stacked.svg(dev 기준)를 그대로 유지한다 — 시안의 마크/워드마크
// 분리 배치는 폐기.
// 시안에는 컬럼별 고정폭이 없어(구 2207:13215 스펙과 달리) 컬럼은 hug(auto width)로 둔다.

export default function SiteFooter() {
  const navGroups = useNavGroups();

  return (
    <footer className="bg-surface-footer">
      <div className="relative py-25">
        {/* 모바일/태블릿(<lg): 로고 + 메뉴 흐름 배치 (현행 유지) */}
        <div className="mx-auto flex max-w-content flex-col gap-10 px-6 lg:hidden">
          <Link
            to="/company-news"
            className="inline-flex shrink-0 items-center"
          >
            <img
              src="/images/winning-logo-stacked.svg"
              alt="위닝에듀"
              className="h-25 w-auto object-contain"
            />
          </Link>

          <div className="grid grid-cols-2 gap-x-8 gap-y-10 sm:grid-cols-3">
            {navGroups.map((group) => (
              <nav key={group.title} className="min-w-0">
                <p className="mb-5 text-sm font-medium text-[#808080]">
                  {group.title}
                </p>
                <ul className="space-y-3">
                  {group.items.map((item) => (
                    <li key={`${group.title}-${item.label}`}>
                      <Link
                        to={item.to}
                        className="inline-block break-keep py-1 text-sm font-medium text-ink transition hover:text-primary"
                      >
                        {item.label}
                      </Link>
                    </li>
                  ))}
                </ul>
              </nav>
            ))}
          </div>
        </div>

        {/* 데스크톱(lg+): 로고 + 메뉴 격자를 하나의 flex 컨테이너에서 좌/우로 배치.
            컨테이너는 max-w-[120rem](1920px)로 캡해 초광폭에서 gap이 과도하게
            늘어나지 않게 한다. */}
        <div className="mx-auto hidden w-full max-w-[120rem] items-start justify-between gap-[clamp(3rem,15.625vw,18.75rem)] px-[clamp(3.75rem,11.4583vw,13.75rem)] lg:flex">
          <Link
            to="/company-news"
            className="inline-flex shrink-0 items-center"
          >
            <img
              src="/images/winning-logo-stacked.svg"
              alt="위닝에듀"
              className="h-auto w-46.25"
            />
          </Link>

          <div className="flex flex-wrap justify-end gap-x-[clamp(1.5rem,5.2083vw,6.25rem)] gap-y-8">
            {navGroups.map((group) => (
              <nav key={group.title} className="shrink-0">
                {/* 시안 4782:3568은 "고객안내" 컬럼만 타이틀↔리스트 gap이 10px(나머지는
                    20px)인데, 5컬럼 중 1개만 다른 것은 시안 결함으로 판단해 전 컬럼
                    20px(1.25rem)로 통일한다. */}
                <p className="mb-5 text-sm font-medium leading-5 text-[#808080]">
                  {group.title}
                </p>
                <ul className="space-y-3">
                  {group.items.map((item) => (
                    <li key={`${group.title}-${item.label}`}>
                      <Link
                        to={item.to}
                        className="inline-block break-keep text-sm font-medium text-ink transition hover:text-primary"
                      >
                        {item.label}
                      </Link>
                    </li>
                  ))}
                </ul>
              </nav>
            ))}
          </div>
        </div>
      </div>

      {/* 사업자 정보: 시안 4782:3568 기준 콘텐츠 폭 1565px(97.8125rem)로 제한.
          border-t는 뷰포트 풀폭이 아닌 이 컨테이너 폭에만 그린다(시안 stroke는 사업자
          텍스트 블록과 정확히 같은 폭). border 스타일 자체(1px 20% 검정)는 시안의
          weight 0.2 검정 100%와 시각적으로 동등하고 서브픽셀 렌더가 더 안정적이라 유지. */}
      <div className="mx-auto max-w-[97.8125rem] border-t border-black/20 px-15">
        <div className="flex flex-col gap-6 py-10 lg:flex-row lg:items-start lg:justify-between">
          {/* 시안 4782:3568의 사업자 문구 텍스트에는 "10-2024-0048889| 사업자"(파이프 앞
              공백 누락), "신고번호:  제2026"(이중 공백) 오타가 있다. COMPANY 데이터가
              정상이므로 시안 텍스트를 따르지 않고 현행 그대로 유지한다. */}
          <div className="space-y-1 break-keep py-3 text-sm leading-[1.4] text-ink">
            <p>
              상호명: {COMPANY.name} | 대표: {COMPANY.ceo} | 법인등록번호:{" "}
              {COMPANY.corpRegNo} | 특허출원: {COMPANY.patentNo} | 사업자
              등록번호: {COMPANY.bizRegNo} | 통신판매업 신고번호:{" "}
              {COMPANY.mailOrderNo}
            </p>
            <p>
              주소: {COMPANY.address} | 온라인고객센터 : 카카오 채널 '위닝에듀'
            </p>
          </div>

          <div className="flex flex-col items-start gap-2 py-3 lg:items-end">
            <div className="flex items-center gap-8 text-sm font-semibold text-ink">
              <Link
                to="/terms"
                className="whitespace-nowrap py-1 transition hover:text-primary lg:py-0"
              >
                이용약관
              </Link>
              <Link
                to="/privacy"
                className="whitespace-nowrap py-1 transition hover:text-primary lg:py-0"
              >
                개인정보처리방침
              </Link>
            </div>
            {/* 시안 4782:3568 텍스트는 "@ All rights reserved."인데 "©"의 오타로
                판단해 현행 저작권 기호를 유지한다. */}
            <p className="text-sm text-ink">© All rights reserved.</p>
          </div>
        </div>
      </div>
    </footer>
  );
}
