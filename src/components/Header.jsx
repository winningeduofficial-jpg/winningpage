import { Link } from 'react-router-dom';
import { ChevronDown } from 'lucide-react';

function WinningLogo() {
  return (
    <div className="flex items-center gap-3">
      <svg
        width="170"
        height="42"
        viewBox="0 0 170 42"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        aria-hidden="true"
        className="shrink-0"
      >
        {/* W 심볼 */}
        <g transform="translate(0,2)">
          <path
            d="M2 0H10.8L17.6 16.2L24.7 0H31.2L20.5 25.2H14.8L9 12.4L3.2 25.2H0L2 0Z"
            fill="white"
          />
          <path
            d="M18.5 0H25.9L33 16.4L40 0H48L36.8 25.2H31.1L25.2 12.5L19.3 25.2H13.8L18.5 0Z"
            fill="white"
          />
        </g>

        {/* 한글 */}
        <text
          x="58"
          y="18"
          fill="white"
          fontFamily="Pretendard, Apple SD Gothic Neo, Noto Sans KR, Arial, sans-serif"
          fontSize="19"
          fontWeight="800"
          letterSpacing="-0.8"
        >
          위닝에듀
        </text>

        {/* 영문 */}
        <text
          x="58"
          y="34"
          fill="#D6B06A"
          fontFamily="Inter, Arial, sans-serif"
          fontSize="10.5"
          fontWeight="800"
          letterSpacing="3.8"
        >
          WINNING EDU
        </text>
      </svg>
    </div>
  );
}

export default function Header() {
  return (
    <header className="fixed left-0 top-0 z-50 w-full">
      <div className="absolute inset-0 border-b border-white/10 bg-[linear-gradient(90deg,rgba(13,27,42,0.96)_0%,rgba(17,31,47,0.97)_35%,rgba(13,27,42,0.96)_100%)] shadow-[0_14px_40px_rgba(0,0,0,0.30)] backdrop-blur-xl" />
      <div className="absolute bottom-0 left-0 h-px w-full bg-gradient-to-r from-transparent via-[#D6B06A]/45 to-transparent" />

      <div className="relative mx-auto flex h-[72px] max-w-[1400px] items-center justify-between px-6">
        <Link to="/" className="flex items-center">
          <WinningLogo />
        </Link>

        <nav className="hidden items-center gap-10 text-[15px] font-semibold text-white/88 md:flex">
          <Link
            to="/services"
            className="flex items-center gap-1 transition hover:text-[#D6B06A]"
          >
            서비스 <ChevronDown size={15} strokeWidth={2.4} />
          </Link>
          <Link
            to="/learning-analysis"
            className="transition hover:text-[#D6B06A]"
          >
            학습 분석
          </Link>
          <Link
            to="/admissions"
            className="transition hover:text-[#D6B06A]"
          >
            수시 · 대입
          </Link>
          <Link
            to="/pricing"
            className="transition hover:text-[#D6B06A]"
          >
            가격
          </Link>
          <Link
            to="/reviews"
            className="transition hover:text-[#D6B06A]"
          >
            후기
          </Link>
          <Link
            to="/events"
            className="transition hover:text-[#D6B06A]"
          >
            이벤트
          </Link>
        </nav>

        <div className="flex items-center gap-3">
          <Link
            to="/login"
            className="rounded-xl border border-white/18 bg-white/6 px-5 py-2.5 text-sm font-bold text-white transition hover:border-[#D6B06A]/55 hover:bg-white/10"
          >
            로그인
          </Link>

          <Link
            to="/signup"
            className="rounded-xl bg-[#D6B06A] px-5 py-2.5 text-sm font-black text-[#0D1B2A] shadow-[0_10px_28px_rgba(214,176,106,0.28)] transition hover:bg-[#E4BE74]"
          >
            새로 시작하기
          </Link>
        </div>
      </div>
    </header>
  );
}
