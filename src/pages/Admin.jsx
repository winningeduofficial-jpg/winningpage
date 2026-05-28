import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';

export default function Admin() {
  const [services, setServices] = useState([]);
  const [loading, setLoading] = useState(false);

  async function fetchServices() {
    const { data, error } = await supabase
      .from('services')
      .select('*')
      .order('sort_order', { ascending: true });

    if (error) {
      alert('서비스 조회 실패');
      return;
    }

    setServices(data || []);
  }

  useEffect(() => {
    fetchServices();
  }, []);

  function updateLocal(id, key, value) {
    setServices((prev) =>
      prev.map((item) =>
        item.id === id ? { ...item, [key]: value } : item
      )
    );
  }

  async function saveService(service) {
    setLoading(true);

    const { error } = await supabase
      .from('services')
      .update({
        title: service.title,
        description: service.description,
        link: service.link,
        icon: service.icon,
        sort_order: service.sort_order,
        is_active: service.is_active
      })
      .eq('id', service.id);

    setLoading(false);

    if (error) {
      alert('저장 실패');
      return;
    }

    alert('저장 완료');
  }

  return (
    <main className="min-h-screen bg-slate-100 px-6 pt-28">
      <div className="mx-auto max-w-6xl">
        <h1 className="text-3xl font-extrabold text-slate-900">
          관리자 페이지
        </h1>
        <p className="mt-2 text-slate-600">
          홈페이지에 노출되는 서비스 내용을 수정할 수 있습니다.
        </p>

        <div className="mt-8 space-y-5">
          {services.map((service) => (
            <div key={service.id} className="rounded-2xl bg-white p-6 shadow-sm">
              <div className="grid gap-4 md:grid-cols-2">
                <div>
                  <label className="text-sm font-bold text-slate-700">서비스명</label>
                  <input
                    className="mt-2 w-full rounded-lg border border-slate-200 px-4 py-3"
                    value={service.title || ''}
                    onChange={(e) => updateLocal(service.id, 'title', e.target.value)}
                  />
                </div>

                <div>
                  <label className="text-sm font-bold text-slate-700">링크</label>
                  <input
                    className="mt-2 w-full rounded-lg border border-slate-200 px-4 py-3"
                    value={service.link || ''}
                    onChange={(e) => updateLocal(service.id, 'link', e.target.value)}
                  />
                </div>

                <div>
                  <label className="text-sm font-bold text-slate-700">아이콘</label>
                  <input
                    className="mt-2 w-full rounded-lg border border-slate-200 px-4 py-3"
                    value={service.icon || ''}
                    onChange={(e) => updateLocal(service.id, 'icon', e.target.value)}
                  />
                </div>

                <div>
                  <label className="text-sm font-bold text-slate-700">노출 순서</label>
                  <input
                    type="number"
                    className="mt-2 w-full rounded-lg border border-slate-200 px-4 py-3"
                    value={service.sort_order || 0}
                    onChange={(e) => updateLocal(service.id, 'sort_order', Number(e.target.value))}
                  />
                </div>
              </div>

              <div className="mt-4">
                <label className="text-sm font-bold text-slate-700">설명</label>
                <textarea
                  className="mt-2 w-full rounded-lg border border-slate-200 px-4 py-3"
                  rows="3"
                  value={service.description || ''}
                  onChange={(e) => updateLocal(service.id, 'description', e.target.value)}
                />
              </div>

              <div className="mt-4 flex items-center justify-between">
                <label className="flex items-center gap-2 text-sm font-bold text-slate-700">
                  <input
                    type="checkbox"
                    checked={!!service.is_active}
                    onChange={(e) => updateLocal(service.id, 'is_active', e.target.checked)}
                  />
                  홈페이지 노출
                </label>

                <button
                  onClick={() => saveService(service)}
                  disabled={loading}
                  className="rounded-lg bg-blue-600 px-6 py-3 font-bold text-white hover:bg-blue-500 disabled:opacity-60"
                >
                  저장하기
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </main>
  );
}
