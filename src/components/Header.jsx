import { Link } from 'react-router-dom';
import { ChevronDown } from 'lucide-react';

function WinningLogo() {
  return (
    <div className="flex items-center gap-3">
      <svg
        width="38"
        height="26"
        viewBox="0 0 94 62"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        aria-hidden="true"
        className="drop-shadow-[0_8px_18px_rgba(0,0,0,0.18)]"
      >
        <path
          d="M0 0H19.5L31.5 33L47 0H63L78.5 33L90.5 0H94L70 62H54L47 45L40 62H24L0 0Z"
          fill="white"
        />
      </svg>

      <div className="leading-none">
        <div className="text-[18px] font-black tracking-[-0.04em] text-white">
          위닝에듀
        </div>
        <div className="mt-1 hidden text-[9px] font-bold uppercase tracking-[0.35em] text-[#D6B06A] sm:block">
          Winning Edu
        </div>
      </div>
    </div>
  );
}

export default function Header() {
  return (
    <header className="fixed left-0 top-0 z-50 w-full border-b border-white/10 bg-[#0D1B2A]/92 shadow-[0_12px_40px_rgba(0,0,0,0.18)] backdrop-blur-xl">
      <div className="mx-auto flex h-16 max-w-[1400px] items-center justify-between px-6">
        <Link to="/" className="flex items-center">
          <WinningLogo />
        </Link>

        <nav className="hidden items-center gap-10 text-[15px] font-semibold text-white/88 md:flex">
          <Link to="/services" className="flex items-center gap-1 transition hover:text-[#D6B06A]">
            서비스 <ChevronDown size={15} strokeWidth={2.4} />
          </Link>
          <Link to="/learning-analysis" className="transition hover:text-[#D6B06A]">학습 분석</Link>
          <Link to="/admissions" className="transition hover:text-[#D6B06A]">수시 · 대입</Link>
          <Link to="/pricing" className="transition hover:text-[#D6B06A]">가격</Link>
          <Link to="/reviews" className="transition hover:text-[#D6B06A]">후기</Link>
          <Link to="/events" className="transition hover:text-[#D6B06A]">이벤트</Link>
        </nav>

        <div className="flex items-center gap-3">
          <Link
            to="/login"
            className="rounded-xl border border-white/20 bg-white/5 px-5 py-2.5 text-sm font-bold text-white transition hover:border-[#D6B06A]/60 hover:bg-white/10"
          >
            로그인
          </Link>

          <Link
            to="/signup"
            className="rounded-xl bg-[#D6B06A] px-5 py-2.5 text-sm font-black text-[#0D1B2A] shadow-[0_12px_30px_rgba(214,176,106,0.25)] transition hover:bg-[#E6C178]"
          >
            새로 시작하기
          </Link>
        </div>
      </div>
    </header>
  );
}

