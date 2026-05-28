import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ClipboardList, Users, PencilLine, FileText, BarChart3, Star } from 'lucide-react';
import { supabase } from '../lib/supabase';

const iconMap = {
  clipboard: ClipboardList,
  users: Users,
  edit: PencilLine,
  file: FileText,
  chart: BarChart3,
  star: Star
};

export default function ServiceCards() {
  const [services, setServices] = useState([]);

  useEffect(() => {
    async function fetchServices() {
      const { data, error } = await supabase
        .from('services')
        .select('*')
        .eq('is_active', true)
        .order('sort_order', { ascending: true });

      if (error) {
        console.error('서비스 조회 오류:', error);
        return;
      }

      setServices(data || []);
    }

    fetchServices();
  }, []);

  return (
    <section className="mx-auto max-w-7xl px-6 py-16">
      <div className="mb-8 flex items-end justify-between">
        <div>
          <p className="text-sm font-bold text-blue-600">위닝에듀 핵심 서비스</p>
          <h2 className="mt-2 text-3xl font-extrabold text-slate-900">
            위닝 서포터와 완성하는 대입 성공 전략
          </h2>
        </div>

        <Link 
          to="/services" 
          className="rounded-lg border border-slate-200 px-5 py-2 text-sm font-bold text-slate-700 hover:bg-white"
        >
          모든 서비스 보기 →
        </Link>
      </div>

      <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-3">
        {services.map((service) => {
          const Icon = iconMap[service.icon] || ClipboardList;

          return (
            <Link
              key={service.id}
              to={service.link || `/services/${service.slug}`}
              className="group rounded-2xl border border-slate-200 bg-white p-6 shadow-sm transition hover:-translate-y-1 hover:shadow-xl"
            >
              <div className="mb-5 flex h-12 w-12 items-center justify-center rounded-2xl bg-blue-50 text-blue-600 group-hover:bg-blue-600 group-hover:text-white">
                <Icon size={24} />
              </div>

              <h3 className="text-xl font-extrabold text-slate-900">
                {service.title}
              </h3>

              <p className="mt-3 min-h-[48px] text-sm leading-6 text-slate-600">
                {service.description}
              </p>

              <p className="mt-5 text-sm font-bold text-blue-600">
                자세히 보기 →
              </p>
            </Link>
          );
        })}
      </div>
    </section>
  );
}
