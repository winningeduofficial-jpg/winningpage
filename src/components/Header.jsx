import { Link } from 'react-router-dom';
import { ChevronDown } from 'lucide-react';

function WinningLogo() {
  return (
    <div className="flex items-center gap-4">
      <svg
        width="270"
        height="58"
        viewBox="0 0 270 58"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        aria-label="위닝에듀 로고"
        className="shrink-0"
      >
        {/* 참고 로고형 W */}
        <path
          d="
            M0 0
            H31
            L52 43
            L75 0
            H106
            L129 43
            L150 0
            H181
            L147 58
            H120
            L90.5 11
            L61 58
            H34
            L0 0
            Z
          "
          fill="#FFFFFF"
        />

        {/* 한글 */}
        <text
          x="198"
          y="24"
          fill="#FFFFFF"
          fontFamily="Pretendard, Apple SD Gothic Neo, Noto Sans KR, Arial, sans-serif"
          fontSize="24"
          fontWeight="900"
          letterSpacing="-1.6"
        >
          위닝에듀
        </text>

        {/* 영문 */}
        <text
          x="198"
          y="49"
          fill="#D6B06A"
          fontFamily="Inter, Arial, sans-serif"
          fontSize="13"
          fontWeight="900"
          letterSpacing="6"
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
      {/* 완전 불투명 헤더 */}
      <div className="absolute inset-0 bg-[#071522]" />
      <div className="absolute inset-0 bg-[linear-gradient(90deg,#071522_0%,#0D1B2A_45%,#071522_100%)]" />
      <div className="absolute bottom-0 left-0 h-px w-full bg-[#D6B06A]/55" />

      <div className="relative mx-auto flex h-[82px] max-w-[1600px] items-center justify-between px-8">
        <Link to="/" className="flex items-center">
          <WinningLogo />
        </Link>

        <nav className="hidden items-center gap-9 text-[16px] font-black text-[#F8F3E8] md:flex">
          <Link
            to="/services"
            className="flex items-center gap-1 text-[#F8F3E8] transition hover:text-[#D6B06A]"
          >
            서비스 <ChevronDown size={16} strokeWidth={2.8} />
          </Link>

          <Link
            to="/learning-analysis"
            className="text-[#F8F3E8] transition hover:text-[#D6B06A]"
          >
            학습 분석
          </Link>

          <Link
            to="/admissions"
            className="text-[#F8F3E8] transition hover:text-[#D6B06A]"
          >
            수시 · 대입
          </Link>

          <Link
            to="/pricing"
            className="text-[#F8F3E8] transition hover:text-[#D6B06A]"
          >
            가격
          </Link>

          <Link
            to="/reviews"
            className="text-[#F8F3E8] transition hover:text-[#D6B06A]"
          >
            후기
          </Link>

          <Link
            to="/events"
            className="text-[#F8F3E8] transition hover:text-[#D6B06A]"
          >
            이벤트
          </Link>
        </nav>

        <div className="flex items-center gap-3">
          <Link
            to="/login"
            className="rounded-xl border border-white/55 bg-white/5 px-6 py-2.5 text-sm font-black text-white transition hover:border-[#D6B06A] hover:bg-white/12"
          >
            로그인
          </Link>

          <Link
            to="/signup"
            className="rounded-xl bg-[#D6B06A] px-6 py-2.5 text-sm font-black text-[#071522] shadow-[0_10px_28px_rgba(214,176,106,0.35)] transition hover:bg-[#E6C178]"
          >
            새로 시작하기
          </Link>
        </div>
      </div>
    </header>
  );
}
