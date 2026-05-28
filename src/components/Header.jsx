import { Link } from 'react-router-dom';
import { ChevronDown } from 'lucide-react';

function LogoMark() {
  return (
    <svg
      width="34"
      height="24"
      viewBox="0 0 68 44"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <path
        d="M6 8L16 33L27 12L34 28L41 12L52 33L62 8"
        stroke="white"
        strokeWidth="7"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export default function Header() {
  return (
    <header className="fixed left-0 top-0 z-50 w-full border-b border-white/10 bg-[#04112a]/85 backdrop-blur-xl">
      <div className="mx-auto flex h-16 max-w-[1400px] items-center justify-between px-6">
        <Link to="/" className="flex items-center gap-3 text-white">
          <LogoMark />
          <span className="text-[18px] font-extrabold tracking-tight">위닝에듀</span>
        </Link>

        <nav className="hidden items-center gap-10 text-[15px] font-semibold text-white/90 md:flex">
          <Link to="/services" className="flex items-center gap-1 hover:text-blue-400">
            서비스 <ChevronDown size={16} />
          </Link>
          <Link to="/learning-analysis" className="hover:text-blue-400">학습 분석</Link>
          <Link to="/admissions" className="hover:text-blue-400">수시 · 대입</Link>
          <Link to="/pricing" className="hover:text-blue-400">가격</Link>
          <Link to="/reviews" className="hover:text-blue-400">후기</Link>
          <Link to="/events" className="hover:text-blue-400">이벤트</Link>
        </nav>

        <div className="flex items-center gap-3">
          <Link
            to="/login"
            className="rounded-xl border border-white/20 bg-transparent px-5 py-2.5 text-sm font-bold text-white transition hover:bg-white/8"
          >
            로그인
          </Link>
          <Link
            to="/signup"
            className="rounded-xl bg-gradient-to-r from-[#2563eb] to-[#1d4ed8] px-5 py-2.5 text-sm font-extrabold text-white shadow-[0_10px_30px_rgba(37,99,235,0.35)] transition hover:brightness-110"
          >
            무료 시작하기
          </Link>
        </div>
      </div>
    </header>
  );
}
