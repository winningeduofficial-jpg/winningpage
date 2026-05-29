import { useLayoutEffect } from 'react';
import { Link } from 'react-router-dom';
import { ChevronDown } from 'lucide-react';

export default function Header() {
  useLayoutEffect(() => {
    const preHeader = document.getElementById('pre-header');

    if (preHeader) {
      preHeader.remove();
    }
  }, []);

  return (
    <header className="fixed left-0 top-0 z-50 w-full border-b border-[#0D1B2A]/10 bg-white shadow-[0_8px_28px_rgba(13,27,42,0.08)]">
      <div className="mx-auto flex h-[84px] max-w-[1500px] items-center justify-between px-8">
        <Link to="/" className="flex h-[84px] w-[190px] items-center">
          <img
            src="/images/winning-logo.png"
            alt="위닝에듀"
            width="190"
            height="66"
            className="h-[66px] w-[190px] object-contain"
          />
        </Link>

        <nav className="hidden items-center gap-10 whitespace-nowrap text-[15px] font-black text-[#0D1B2A] md:flex">
          <Link
            to="/services"
            className="flex items-center gap-1 transition hover:text-[#B88737]"
          >
            서비스 <ChevronDown size={15} strokeWidth={2.7} />
          </Link>
          <Link to="/learning-analysis" className="transition hover:text-[#B88737]">
            학습 분석
          </Link>
          <Link to="/admissions" className="transition hover:text-[#B88737]">
            수시 · 대입
          </Link>
          <Link to="/pricing" className="transition hover:text-[#B88737]">
            가격
          </Link>
          <Link to="/reviews" className="transition hover:text-[#B88737]">
            후기
          </Link>
          <Link to="/events" className="transition hover:text-[#B88737]">
            이벤트
          </Link>
        </nav>

        <div className="flex items-center gap-3">
          <Link
            to="/login"
            className="rounded-xl border border-[#0D1B2A]/25 bg-white px-6 py-2.5 text-sm font-black leading-5 text-[#0D1B2A] transition hover:border-[#0D1B2A] hover:bg-[#F8F7F3]"
          >
            로그인
          </Link>

          <Link
            to="/signup"
            className="rounded-xl bg-[#0D1B2A] px-6 py-2.5 text-sm font-black leading-5 text-white shadow-[0_10px_26px_rgba(13,27,42,0.22)] transition hover:bg-[#162A40]"
          >
            새로 시작하기
          </Link>
        </div>
      </div>
    </header>
  );
}
