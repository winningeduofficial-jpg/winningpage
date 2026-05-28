import { Link } from 'react-router-dom';

export default function Header() {
  return (
    <header className="fixed top-0 left-0 z-50 w-full border-b border-white/10 bg-slate-950/80 backdrop-blur-xl">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-6">
        <Link to="/" className="flex items-center gap-2 text-xl font-extrabold text-white">
          <span className="text-2xl">W</span>
          <span>위닝에듀</span>
        </Link>

        <nav className="hidden items-center gap-10 text-sm font-semibold text-slate-200 md:flex">
          <Link to="/services" className="hover:text-blue-400">서비스</Link>
          <Link to="/learning-analysis" className="hover:text-blue-400">학습 분석</Link>
          <Link to="/admissions" className="hover:text-blue-400">수시·대입</Link>
          <Link to="/pricing" className="hover:text-blue-400">가격</Link>
          <Link to="/reviews" className="hover:text-blue-400">후기</Link>
          <Link to="/events" className="hover:text-blue-400">이벤트</Link>
        </nav>

        <div className="flex items-center gap-3">
          <Link 
            to="/login" 
            className="rounded-lg border border-white/20 px-5 py-2 text-sm font-semibold text-white hover:bg-white/10"
          >
            로그인
          </Link>
          <Link 
            to="/signup" 
            className="rounded-lg bg-blue-600 px-5 py-2 text-sm font-semibold text-white shadow-lg shadow-blue-600/30 hover:bg-blue-500"
          >
            무료 시작하기
          </Link>
        </div>
      </div>
    </header>
  );
}
