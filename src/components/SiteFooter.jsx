import { Link } from 'react-router-dom';
import { COMPANY, FOOTER_COLUMNS } from '../data/company';

// 결제/랜딩 공용 푸터. 사업자 정보 + 이용약관/개인정보처리방침 링크 포함.
export default function SiteFooter() {
  return (
    <footer className="bg-[#f9fafb]">
      <div className="mx-auto flex max-w-[1500px] flex-col gap-10 px-6 py-[6.25rem] lg:flex-row lg:items-start lg:justify-between lg:px-8">
        {/* 로고 */}
        <Link to="/" className="inline-flex shrink-0 items-center">
          <img
            src="/images/winning-logo.png"
            alt="위닝에듀"
            className="h-[6.25rem] w-auto object-contain"
          />
        </Link>

        {/* 메뉴 컬럼 */}
        <div className="grid grid-cols-2 gap-x-8 gap-y-10 sm:grid-cols-3 lg:flex lg:flex-row lg:gap-[3.75rem]">
          {FOOTER_COLUMNS.map((col) => (
            <nav key={col.title} className="min-w-0">
              <p className="mb-5 text-sm text-[#808080]">{col.title}</p>
              <ul className="space-y-3">
                {col.items.map((item) => (
                  <li key={`${col.title}-${item.label}`}>
                    <Link
                      to={item.to}
                      className="text-sm text-[#525252] transition hover:text-[#013262]"
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

      {/* 사업자 정보 */}
      <div className="border-t border-black/20">
        <div className="mx-auto flex max-w-[1500px] flex-col gap-6 px-6 py-10 lg:flex-row lg:items-start lg:justify-between lg:px-8">
          <div className="space-y-1 py-3 text-sm leading-[1.4] text-[#525252]">
            <p>
              상호명: {COMPANY.name} | 대표: {COMPANY.ceo} | 법인등록번호: {COMPANY.corpRegNo} | 특허출원:{' '}
              {COMPANY.patentNo} | 사업자 등록번호: {COMPANY.bizRegNo} | 통신판매업 신고번호: {COMPANY.mailOrderNo}
            </p>
            <p>
              주소: {COMPANY.address} | 대표전화: {COMPANY.tel} | 센터문의: {COMPANY.centerTel} | 카카오톡:{' '}
              {COMPANY.kakao}
            </p>
          </div>

          <div className="flex flex-col items-start gap-2 py-3 lg:items-end">
            <div className="flex items-center gap-8 text-sm font-semibold text-[#1e293b]">
              <Link to="/terms" className="transition hover:text-[#013262]">
                이용약관
              </Link>
              <Link to="/privacy" className="transition hover:text-[#013262]">
                개인정보처리방침
              </Link>
            </div>
            <p className="text-sm text-[#525252]">© All rights reserved.</p>
          </div>
        </div>
      </div>
    </footer>
  );
}
