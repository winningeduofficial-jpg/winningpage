import { BarChart3, ShieldCheck, TrendingUp, Users } from 'lucide-react';

export default function StatsBar() {
  const stats = [
    {
      icon: Users,
      value: '12,400+',
      label: '누적 회원 수',
    },
    {
      icon: TrendingUp,
      value: '18.7점',
      label: '평균 성적 향상',
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

  return (
    <section className="relative z-20 mx-auto -mt-12 max-w-7xl px-6">
      <div className="grid overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xl md:grid-cols-4">
        {stats.map((item, index) => {
          const Icon = item.icon;

          return (
            <div
              key={item.label}
              className={`flex items-center gap-4 px-8 py-6 ${
                index !== stats.length - 1 ? 'border-b border-slate-100 md:border-b-0 md:border-r' : ''
              }`}
            >
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-blue-50 text-blue-600">
                <Icon size={24} />
              </div>

              <div>
                <p className="text-2xl font-extrabold text-blue-600">{item.value}</p>
                <p className="mt-1 text-sm font-semibold text-slate-500">{item.label}</p>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
