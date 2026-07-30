import { Link } from 'react-router-dom';
import { COMPANY } from '../data/company';
import { useNavGroups } from '../hooks/useNavGroups';

// 결제/랜딩 공용 푸터. 사업자 정보 + 이용약관/개인정보처리방침 링크 포함.
// 메뉴 컬럼은 헤더 메가메뉴와 동일한 useNavGroups()(DB → 캐시 → fallback)를 공유한다.
// lg+ 데스크톱: 로고와 메뉴 격자 모두 컨텐츠 영역(max-w-content) 안에서 한 flex 컨테이너로
// 배치한다. 메뉴 컬럼은 시안 2207:13215(0729) 기준 — 컬럼은 hug(콘텐츠 폭), gap 3.75rem(60px),
// 블록은 컨텐츠 영역 우측 정렬. 단 "프리미엄" 컬럼만 긴 서브아이템 라벨("국제・해외고 국내대
// 입학컨설팅")이 시안대로 2줄 래핑되도록 max-w-[8.25rem](132px)을 유지한다.

export default function SiteFooter() {
  const navGroups = useNavGroups();

  return (
    <footer className="bg-[#f9fafb]">
      <div className="relative py-[6.25rem]">
        {/* 모바일/태블릿(<lg): 로고 + 메뉴 흐름 배치 (현행 유지) */}
        <div className="mx-auto flex max-w-content flex-col gap-10 px-6 lg:hidden">
          <Link to="/" className="inline-flex shrink-0 items-center">
            <img
              src="/images/winning-logo.png"
              alt="위닝에듀"
              className="h-[6.25rem] w-auto object-contain"
            />
          </Link>

          <div className="grid grid-cols-2 gap-x-8 gap-y-10 sm:grid-cols-3">
            {navGroups.map((group) => (
              <nav key={group.title} className="min-w-0">
                <p className="mb-5 text-sm font-medium text-[#808080]">{group.title}</p>
                <ul className="space-y-3">
                  {group.items.map((item) => (
                    <li key={`${group.title}-${item.label}`}>
                      <Link
                        to={item.to}
                        className="inline-block break-keep py-1 text-sm font-medium text-[#525252] transition hover:text-[#013262]"
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
            로고와 메뉴는 같은 컨테이너에 있어 서로 겹치지 않는다(격자 최소폭 764px +
            로고 185px = 949px < 컨텐츠 내부폭 1136px). */}
        <div className="mx-auto hidden w-full max-w-content items-start justify-between px-8 lg:flex">
          <Link to="/" className="inline-flex shrink-0 items-center">
            <img
              src="/images/winning-logo-stacked.svg"
              alt="위닝에듀"
              className="h-auto w-[11.5625rem]"
            />
          </Link>

          <div className="flex gap-[3.75rem]">
            {navGroups.map((group) => (
              <nav
                key={group.title}
                className={`shrink-0${group.title === '프리미엄' ? ' max-w-[8.25rem]' : ''}`}
              >
                <p className="mb-[1.25rem] text-sm font-medium text-[#808080]">{group.title}</p>
                <ul className="space-y-3">
                  {group.items.map((item) => (
                    <li key={`${group.title}-${item.label}`}>
                      <Link
                        to={item.to}
                        className="inline-block break-keep text-sm font-medium text-[#525252] transition hover:text-[#013262]"
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

      {/* 사업자 정보: 헤더 좌표계 1(로고/계정 그룹)과 같은 축 — mx-auto max-w-[120rem]
          px-8 2xl:px-[7.5rem]. border-t는 뷰포트 풀폭이 아닌 이 컨테이너 폭에만 그린다. */}
      <div className="mx-auto max-w-[120rem] border-t border-black/20 px-8 2xl:px-[7.5rem]">
        <div className="flex flex-col gap-6 py-10 lg:flex-row lg:items-start lg:justify-between">
          <div className="space-y-1 break-keep py-3 text-sm leading-[1.4] text-[#525252]">
            <p>
              상호명: {COMPANY.name} | 대표: {COMPANY.ceo} | 법인등록번호: {COMPANY.corpRegNo} |
              특허출원: {COMPANY.patentNo} | 사업자 등록번호: {COMPANY.bizRegNo} | 통신판매업
              신고번호: {COMPANY.mailOrderNo}
            </p>
            <p>
              주소: {COMPANY.address} | 대표전화: {COMPANY.tel} | 센터문의: {COMPANY.centerTel} |
              카카오톡: {COMPANY.kakao}
            </p>
          </div>

          <div className="flex flex-col items-start gap-2 py-3 lg:items-end">
            <div className="flex items-center gap-8 text-sm font-semibold text-[#525252]">
              <Link
                to="/terms"
                className="whitespace-nowrap py-1 transition hover:text-[#013262] lg:py-0"
              >
                이용약관
              </Link>
              <Link
                to="/privacy"
                className="whitespace-nowrap py-1 transition hover:text-[#013262] lg:py-0"
              >
                개인정보처리방침
              </Link>
              <Link
                to="/refund"
                className="whitespace-nowrap py-1 transition hover:text-[#013262] lg:py-0"
              >
                환불규정
              </Link>
            </div>
            <p className="text-sm text-[#525252]">© All rights reserved.</p>
          </div>
        </div>
      </div>
    </footer>
  );
}
