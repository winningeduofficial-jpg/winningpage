import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowRight,
  PlayCircle,
  Users,
  TrendingUp,
  BarChart3,
  ShieldCheck,
  ClipboardList,
  PencilLine,
  FileText,
  Star,
} from 'lucide-react';

const banners = [
  {
    title: '데이터가 발견하고,',
    highlight: '위닝 서포터가 성장을 완성합니다',
    subtitle:
      '학생 개인별 학습 분석부터 대입 전략까지, 위닝에듀가 최적의 길을 제시합니다.',
    image: '/images/banner-1.png',
  },
  {
    title: '학습 기록이 쌓이면,',
    highlight: '입시 전략이 더 정교해집니다',
    subtitle:
      '매일의 공부 데이터를 분석해 주간 리포트와 맞춤 전략으로 연결합니다.',
    image: '/images/banner-2.png',
  },
  {
    title: '수행평가와 세특까지,',
    highlight: '학생부의 방향을 설계합니다',
    subtitle:
      '진로와 과목을 연결해 학생부에 남는 탐구 흐름을 만듭니다.',
    image: '/images/banner-3.png',
  },
  {
    title: '부모님이 확인하는',
    highlight: '성장 리포트 시스템',
    subtitle:
      '학습 시간, 집중도, 과목 비중, 합격 가능성 변화를 한눈에 확인합니다.',
    image: '/images/banner-4.png',
  },
];

const stats = [
  {
    icon: Users,
    value: '1,240+',
    label: '누적 회원 수',
  },
  {
    icon: TrendingUp,
    value: '18.7점',
    label: '평균 성적 향상',
  },
  {
    icon: BarChart3,
    value: '86.7%',
    label: '상위권 대학 합격률',
  },
  {
    icon: ShieldCheck,
    value: '1,254개',
    label: '주요대학 합격 사례',
  },
  {
    icon: BarChart3,
    value: '96.2%',
    label: '이용자 만족도',
  },
];

const services = [
  {
    icon: ClipboardList,
    title: '위닝 생기부 분석',
    desc: '학생부 데이터를 심층 분석하여 맞춤형 전략을 제시합니다.',
    link: '/services/record-analysis',
  },
  {
    icon: Users,
    title: '학습 관리 서비스',
    desc: '학습 습관부터 성적 관리까지 맞춤형으로 지원합니다.',
    link: '/services/study-management',
  },
  {
    icon: PencilLine,
    title: '수행/세특팅',
    desc: '수행평가 아이디어부터 완성까지 체계적으로 지원합니다.',
    link: '/services/assessment',
  },
  {
    icon: FileText,
    title: '세특 문장 가이드',
    desc: '교과별 핵심 문장 예시로 세특 작성 실력을 높여드립니다.',
    link: '/services/record-guide',
  },
  {
    icon: BarChart3,
    title: '위닝 생기부 분석 리포트',
    desc: '정량 분석 리포트로 합격 가능성과 보완점을 확인합니다.',
    link: '/services/report',
  },
  {
    icon: Star,
    title: '수시카드 추천',
    desc: '학생 맞춤 수시 전략과 지원 대학 카드를 추천합니다.',
    link: '/services/susi-card',
  },
];

export default function Home() {
  const [currentBanner, setCurrentBanner] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentBanner((prev) => (prev + 1) % banners.length);
    }, 5000);

    return () => clearInterval(timer);
  }, []);

  const banner = banners[currentBanner];

  return (
    <main className="bg-slate-50">
      <section className="relative overflow-hidden bg-slate-950 text-white">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_20%,rgba(37,99,235,0.35),transparent_30%),radial-gradient(circle_at_80%_10%,rgba(245,158,11,0.20),transparent_25%)]" />
        <div className="absolute inset-0 opacity-30 bg-[linear-gradient(to_right,rgba(255,255,255,0.06)_1px,transparent_1px),linear-gradient(to_bottom,rgba(255,255,255,0.06)_1px,transparent_1px)] bg-[size:90px_90px]" />

        <div className="relative z-10 mx-auto grid min-h-[680px] max-w-7xl grid-cols-1 items-center gap-12 px-6 pb-28 pt-28 lg:grid-cols-[0.9fr_1.1fr]">
          <div>
            <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-amber-400/40 bg-amber-400/10 px-4 py-2 text-sm font-extrabold text-amber-300">
              <Star size={15} fill="currentColor" />
              데이터 기반 맞춤 학습 플랫폼
            </div>

            <h1 className="text-5xl font-black leading-tight tracking-tight md:text-6xl">
              {banner.title}
              <br />
              <span className="bg-gradient-to-r from-blue-400 via-blue-500 to-amber-300 bg-clip-text text-transparent">
                {banner.highlight}
              </span>
            </h1>

            <p className="mt-6 max-w-xl text-lg font-medium leading-8 text-slate-300">
              {banner.subtitle}
            </p>

            <div className="mt-10 flex flex-wrap gap-4">
              <Link
                to="/signup"
                className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-8 py-4 font-black text-white shadow-xl shadow-blue-600/30 hover:bg-blue-500"
              >
                무료로 시작하기
                <ArrowRight size={18} />
              </Link>

              <Link
                to="/services"
                className="inline-flex items-center gap-2 rounded-xl border border-white/20 bg-white/5 px-8 py-4 font-black text-white hover:bg-white/10"
              >
                서비스 둘러보기
                <PlayCircle size={19} />
              </Link>
            </div>

            <div className="mt-8 flex items-center gap-4">
              <div className="flex -space-x-3">
                {['김', '이', '박', '최'].map((item) => (
                  <div
                    key={item}
                    className="flex h-11 w-11 items-center justify-center rounded-full border-2 border-slate-950 bg-white text-sm font-black text-slate-700"
                  >
                    {item}
                  </div>
                ))}
              </div>

              <p className="text-sm font-semibold text-slate-300">
                <span className="text-lg font-black text-blue-400">1,240+</span> 학생들이
                <br />
                위닝에듀와 함께 하고 있어요!
              </p>
            </div>
            <div className="mt-8 flex gap-2">
  {banners.map((_, index) => (
    <button
      key={index}
      onClick={() => setCurrentBanner(index)}
      className={`h-2.5 rounded-full transition-all ${
        currentBanner === index ? 'w-10 bg-blue-500' : 'w-2.5 bg-white/25'
      }`}
      aria-label={`배너 ${index + 1}`}
    />
  ))}
</div>
          </div>

          <div className="relative">
  <div className="absolute -inset-6 rounded-[2rem] bg-blue-600/20 blur-3xl" />

  <div className="relative h-[470px] overflow-hidden rounded-[2rem] border border-white/15 bg-slate-950 shadow-2xl">
    <img
      src={banner.image}
      alt="위닝에듀 배너"
      className="absolute inset-0 h-full w-full object-cover"
    />
  </div>
</div>
            </div>
          </div>
        </div>
      </section>

      <section className="relative z-30 mx-auto -mt-16 max-w-7xl px-6">
        <div className="grid overflow-hidden rounded-2xl border border-slate-200 bg-white/95 shadow-2xl backdrop-blur md:grid-cols-5">
          {stats.map((item, index) => {
            const Icon = item.icon;

            return (
              <div
                key={item.label}
                className={`flex items-center justify-center gap-4 px-6 py-5 ${
                  index !== stats.length - 1
                    ? 'border-b border-slate-100 md:border-b-0 md:border-r'
                    : ''
                }`}
              >
                <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-blue-50 text-blue-600">
                  <Icon size={25} />
                </div>

                <div>
                  <p className="text-2xl font-black text-blue-600">{item.value}</p>
                  <p className="mt-1 text-sm font-bold text-slate-500">{item.label}</p>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-6 py-14">
        <div className="mb-8 flex items-end justify-between">
          <div>
            <p className="text-sm font-black text-blue-600">위닝에듀 핵심 서비스</p>
            <h2 className="mt-2 text-3xl font-black tracking-tight text-slate-900">
              위닝 서포터와 완성하는 대입 성공 전략
            </h2>
          </div>

          <Link
            to="/services"
            className="rounded-xl border border-slate-200 bg-white px-5 py-3 text-sm font-black text-slate-700 shadow-sm hover:bg-slate-50"
          >
            모든 서비스 보기 →
          </Link>
        </div>

        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
          {services.map((service) => {
            const Icon = service.icon;

            return (
              <Link
                key={service.title}
                to={service.link}
                className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition hover:-translate-y-1 hover:border-blue-200 hover:shadow-xl"
              >
                <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-blue-50 text-blue-600">
                  <Icon size={24} />
                </div>

                <h3 className="min-h-[48px] text-base font-black leading-6 text-slate-900">
                  {service.title}
                </h3>

                <p className="mt-2 min-h-[72px] text-sm font-medium leading-6 text-slate-600">
                  {service.desc}
                </p>

                <p className="mt-4 text-sm font-black text-blue-600">
                  자세히 보기 →
                </p>
              </Link>
            );
          })}
        </div>
      </section>

      <section className="mx-auto grid max-w-7xl gap-6 px-6 pb-20 lg:grid-cols-[1.1fr_1.3fr_1fr]">
        <div className="rounded-3xl border border-slate-200 bg-white p-7 shadow-sm">
          <h3 className="text-2xl font-black text-slate-900">
            위닝에듀와 함께 하면 달라집니다
          </h3>

          <div className="mt-6 space-y-4">
            {[
              ['학생 맞춤 전략', '보통', '매우 높음'],
              ['생기부 완성도', '보통', '매우 높음'],
              ['합격 가능성', '보통', '매우 높음'],
              ['관리/피드백', '불규칙', '지속성 & 체계적'],
            ].map(([label, before, after]) => (
              <div key={label}>
                <div className="mb-2 flex justify-between text-sm font-bold text-slate-600">
                  <span>{label}</span>
                  <span>
                    {before} → <span className="text-blue-600">{after}</span>
                  </span>
                </div>
                <div className="h-3 rounded-full bg-slate-100">
                  <div className="h-3 w-[86%] rounded-full bg-blue-600" />
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-3xl border border-slate-200 bg-white p-7 shadow-sm">
          <div className="mb-5 flex items-center justify-between">
            <h3 className="text-2xl font-black text-slate-900">
              합격으로 증명하는 위닝에듀
            </h3>
            <a href="/reviews" className="text-sm font-black text-blue-600">
              더 많은 합격사례 보기 →
            </a>
          </div>

          <div className="grid gap-4 md:grid-cols-3">
            {[
              ['김OO 학생', '서울대학교 경영학과', '체계적인 관리로 학생부 흐름을 완성했습니다.'],
              ['이OO 학생', '연세대학교 의예과', '생기부 분석과 맞춤 전략이 합격에 큰 도움이 되었습니다.'],
              ['박OO 학생', '고려대학교 컴퓨터학과', 'AI 분석과 컨설팅으로 전략을 명확히 잡았습니다.'],
            ].map(([name, result, desc]) => (
              <article key={name} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <div className="mb-4 h-24 rounded-xl bg-gradient-to-br from-slate-200 to-slate-100" />
                <p className="font-black text-slate-900">{name}</p>
                <p className="mt-1 text-sm font-black text-blue-600">{result}</p>
                <p className="mt-3 text-sm font-medium leading-6 text-slate-600">{desc}</p>
              </article>
            ))}
          </div>
        </div>

        <div className="rounded-3xl border border-slate-200 bg-white p-7 shadow-sm">
          <div className="mb-5 flex items-center justify-between">
            <h3 className="text-2xl font-black text-slate-900">이용자 후기</h3>
            <a href="/reviews" className="text-sm font-black text-blue-600">
              더보기
            </a>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-6 text-center">
            <p className="text-base font-bold leading-8 text-slate-700">
              AI 분석과 컨설팅 덕분에 제 강점을 정확히 알게 되었고,
              목표 대학에 합격할 수 있었습니다.
            </p>

            <div className="mt-5 border-t border-slate-200 pt-4">
              <p className="font-black text-slate-900">김OO 학생</p>
              <p className="mt-1 text-sm font-bold text-slate-500">서울대학교 합격</p>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
