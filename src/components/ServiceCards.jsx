import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  BarChart3,
  Brain,
  ClipboardCheck,
  FileText,
  GraduationCap,
  Target,
  Users,
  Sparkles
} from 'lucide-react';
import { supabase } from '../lib/supabase';

const FALLBACK_SERVICES = [
  {
    id: 'fallback-1',
    name: '목표관리서비스',
    description: '목표 대학과 진로에 맞춘 관리 서비스',
    link: '/services#goal',
    icon: 'goal'
  },
  {
    id: 'fallback-2',
    name: 'AI 수행평가 서비스',
    description: '수행평가 주제와 탐구 구조 설계 서비스',
    link: '/services#ai',
    icon: 'ai'
  },
  {
    id: 'fallback-3',
    name: '세특코치서비스',
    description: '교과 세특 흐름과 학생부 방향 관리 서비스',
    link: '/services#record',
    icon: 'record'
  },
  {
    id: 'fallback-4',
    name: '수시키드',
    description: '수시 지원 전략 및 전형 관리 서비스',
    link: '/services#susi',
    icon: 'susi'
  },
  {
    id: 'fallback-5',
    name: '약점관리서비스',
    description: '학습 약점과 보완 계획 관리 서비스',
    link: '/services#weakness',
    icon: 'weakness'
  },
  {
    id: 'fallback-6',
    name: '특화멘토링',
    description: '전공별 심화 탐구와 진로 멘토링 서비스',
    link: '/services#mentoring',
    icon: 'mentoring'
  }
];

function getIcon(icon) {
  const props = { size: 28, strokeWidth: 2.4 };

  switch (icon) {
    case 'goal':
      return <Target {...props} />;
    case 'ai':
      return <Brain {...props} />;
    case 'record':
      return <FileText {...props} />;
    case 'susi':
      return <GraduationCap {...props} />;
    case 'weakness':
      return <BarChart3 {...props} />;
    case 'mentoring':
      return <Users {...props} />;
    case 'check':
      return <ClipboardCheck {...props} />;
    default:
      return <Sparkles {...props} />;
  }
}

export default function ServiceCards() {
  const [services, setServices] = useState(FALLBACK_SERVICES);

  useEffect(() => {
    let alive = true;

    async function loadServices() {
      const { data, error } = await supabase
        .from('program_categories')
        .select('*')
        .eq('is_active', true)
        .order('sort_order', { ascending: true });

      if (error) {
        console.error('서비스 카드 조회 실패:', error);
        return;
      }

      const next = (data || []).map((item) => ({
        id: item.id,
        name: item.name || '',
        description: item.description || '',
        link: item.link || '/services',
        icon: item.icon || 'default'
      }));

      if (alive && next.length > 0) {
        setServices(next);
      }
    }

    loadServices();

    const channel = supabase
      .channel('public-program-categories-realtime')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'program_categories' },
        () => loadServices()
      )
      .subscribe();

    return () => {
      alive = false;
      supabase.removeChannel(channel);
    };
  }, []);

  return (
    <section className="bg-white py-24">
      <div className="mx-auto max-w-[1500px] px-8">
        <div className="mb-12 flex flex-col justify-between gap-6 md:flex-row md:items-end">
          <div>
            <p className="mb-3 text-sm font-black tracking-[0.18em] text-[#B88737]">
              WINNING SERVICE
            </p>

            <h2 className="text-[36px] font-black tracking-[-0.06em] text-[#0D1B2A] md:text-[46px]">
              학생 성장에 필요한 관리를
              <br />
              하나의 시스템으로 연결합니다.
            </h2>
          </div>

          <Link
            to="/services"
            className="inline-flex w-fit rounded-xl border border-[#0D1B2A]/20 px-6 py-3 text-sm font-black text-[#0D1B2A] transition hover:border-[#B88737] hover:bg-[#FFF8E8] hover:text-[#B88737]"
          >
            전체 서비스 보기
          </Link>
        </div>

        <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
          {services.map((service) => (
            <Link
              key={service.id}
              to={service.link || '/services'}
              className="group relative overflow-hidden rounded-3xl border border-[#E6E9EF] bg-white p-8 shadow-[0_16px_40px_rgba(13,27,42,0.06)] transition hover:-translate-y-1 hover:border-[#B88737]/50 hover:shadow-[0_24px_60px_rgba(13,27,42,0.12)]"
            >
              <div className="absolute right-0 top-0 h-24 w-24 rounded-bl-[60px] bg-[#F7F4EC] transition group-hover:bg-[#FFF2D4]" />

              <div className="relative z-10">
                <div className="mb-7 flex h-14 w-14 items-center justify-center rounded-2xl bg-[#0D1B2A] text-white transition group-hover:bg-[#B88737]">
                  {getIcon(service.icon)}
                </div>

                <h3 className="text-2xl font-black tracking-[-0.05em] text-[#0D1B2A] transition group-hover:text-[#B88737]">
                  {service.name}
                </h3>

                <p className="mt-4 min-h-[56px] text-[15px] font-bold leading-7 text-[#6B7280]">
                  {service.description}
                </p>

                <div className="mt-8 text-sm font-black text-[#0D1B2A]/40 transition group-hover:text-[#B88737]">
                  자세히 보기 →
                </div>
              </div>
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
}
