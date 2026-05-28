import { Link } from 'react-router-dom';
import { ChevronDown } from 'lucide-react';

function WinningLogo() {
  return (
    <div className="flex items-center gap-3">
      <svg
        width="190"
        height="48"
        viewBox="0 0 190 52"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        aria-label="위닝에듀 로고"
        className="shrink-0"
      >
        {/* W 심볼 - 참고 이미지처럼 위가 넓고 아래가 날렵한 형태 */}
        <path
          d="
            M0 3
            H18
            L30 35
            L45 3
            H58
            L73 35
            L85 3
            H103
            L80 51
            H66
            L51.5 22
            L37 51
            H23
            L0 3
            Z
          "
          fill="white"
        />

        {/* 한글 로고 */}
        <text
          x="116"
          y="24"
          fill="white"
          fontFamily="Pretendard, Apple SD Gothic Neo, Noto Sans KR, Arial, sans-serif"
          fontSize="21"
          fontWeight="900"
          letterSpacing="-1.4"
        >
          위닝에듀
        </text>

        {/* 영문 로고 */}
        <text
          x="116"
          y="44"
          fill="#D6B06A"
          fontFamily="Inter, Arial, sans-serif"
          fontSize="11"
          fontWeight="900"
          letterSpacing="5.1"
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
      {/* 헤더 배경: 완전 진한 네이비로 고정해서 배너 바뀌어도 안 묻히게 처리 */}
      <div className="absolute inset-0 bg-[#071522] shadow-[0_14px_44px_rgba(0,0,0,0.42)]" />
      <div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(13,27,42,1)_0%,rgba(10,24,38,1)_45%,rgba(13,27,42,1)_100%)]" />
      <div className="absolute bottom-0 left-0 h-px w-full bg-[#D6B06A]/45" />

      <div className="relative mx-auto flex h-[76px] max-w-[1400px] items-center justify-between px-6">
        <Link to="/" className="flex items-center">
          <WinningLogo />
        </Link>

        <nav className="hidden items-center gap-10 text-[15px] font-extrabold text-[#F8F3E8] md:flex">
          <Link
            to="/services"
            className="flex items-center gap-1 transition hover:text-[#D6B06A]"
          >
            서비스 <ChevronDown size={15} strokeWidth={2.6} />
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
            className="rounded-xl border border-white/45 bg-white/5 px-6 py-2.5 text-sm font-black text-white transition hover:border-[#D6B06A] hover:bg-white/12"
          >
            로그인
          </Link>

          <Link
            to="/signup"
            className="rounded-xl bg-[#D6B06A] px-6 py-2.5 text-sm font-black text-[#071522] shadow-[0_10px_28px_rgba(214,176,106,0.32)] transition hover:bg-[#E6C178]"
          >
            새로 시작하기
          </Link>
        </div>
      </div>
    </header>
  );
}
