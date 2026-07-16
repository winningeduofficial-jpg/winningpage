import { Link } from 'react-router-dom';
import { COMPANY, FOOTER_COLUMNS } from '../data/company';

// 결제/랜딩 공용 푸터. 사업자 정보 + 이용약관/개인정보처리방침 링크 포함.
export default function SiteFooter() {
  return (
    <footer className="border-t border-slate-200 bg-[#F8F7F3]">
      <div className="mx-auto max-w-[1500px] px-6 py-14 lg:px-8">
        <div className="grid gap-10 lg:grid-cols-[260px_1fr]">
          {/* 로고 */}
          <div>
            <Link to="/" className="inline-flex items-center">
              <img
                src="/images/winning-logo.png"
                alt="위닝에듀"
                width="180"
                height="63"
                className="h-[60px] w-[180px] object-contain"
              />
            </Link>
          </div>

          {/* 메뉴 컬럼 */}
          <div className="grid grid-cols-2 gap-8 sm:grid-cols-3 lg:grid-cols-5">
            {FOOTER_COLUMNS.map((col) => (
              <nav key={col.title} className="min-w-0">
                <p className="mb-4 text-[15px] font-black text-[#0D1B2A]">{col.title}</p>
                <ul className="space-y-2.5">
                  {col.items.map((item) => (
                    <li key={`${col.title}-${item.label}`}>
                      <Link
                        to={item.to}
                        className="text-[13px] font-medium text-slate-500 transition hover:text-[#0D1B2A]"
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
        <div className="mt-12 flex flex-col gap-4 border-t border-slate-200 pt-8 lg:flex-row lg:items-start lg:justify-between">
          <div className="space-y-1.5 text-[12px] leading-relaxed text-slate-500">
            <p>
              상호명: {COMPANY.name} | 대표: {COMPANY.ceo} | 법인등록번호: {COMPANY.corpRegNo} | 특허출원:{' '}
              {COMPANY.patentNo} | 사업자 등록번호: {COMPANY.bizRegNo} | 통신판매업 신고번호: {COMPANY.mailOrderNo}
            </p>
            <p>
              주소: {COMPANY.address} | 대표전화: {COMPANY.tel} | 센터문의: {COMPANY.centerTel} | 카카오톡:{' '}
              {COMPANY.kakao}
            </p>
          </div>

          <div className="flex flex-col items-start gap-2 lg:items-end">
            <div className="flex items-center gap-5 text-[13px] font-bold text-[#0D1B2A]">
              <Link to="/terms" className="transition hover:text-[#B88737]">
                이용약관
              </Link>
              <Link to="/refund" className="transition hover:text-[#B88737]">
                환불규정
              </Link>
              <Link to="/privacy" className="font-black transition hover:text-[#B88737]">
                개인정보처리방침
              </Link>
            </div>
            <p className="text-[12px] text-slate-400">© All rights reserved.</p>
          </div>
        </div>
      </div>
    </footer>
  );
}
