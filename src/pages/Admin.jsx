import { useEffect, useState } from 'react';
import { ImagePlus, Save, UploadCloud } from 'lucide-react';
import { supabase } from '../lib/supabase';

const DEFAULT_BANNERS = [
  {
    title: '데이터가 발견하고,',
    highlight: '위닝 서포터가 성장을 완성합니다',
    subtitle: '학생 개인별 학습 분석부터 대입 전략까지, 위닝에듀가 최적의 길을 제시합니다.',
    button_text: '지금 시작하기',
    button_link: '/signup',
    image_url: '/images/banner-1.png',
    sort_order: 1,
    is_active: true
  },
  {
    title: '학습 기록이 쌓이면,',
    highlight: '입시 전략이 더 정교해집니다',
    subtitle: '매일의 공부 데이터를 분석해 주간 리포트와 맞춤 전략으로 연결합니다.',
    button_text: '지금 시작하기',
    button_link: '/signup',
    image_url: '/images/banner-2.png',
    sort_order: 2,
    is_active: true
  },
  {
    title: '수행평가와 세특까지,',
    highlight: '학생부의 방향을 설계합니다',
    subtitle: '진로와 과목을 연결해 학생부에 남는 탐구 흐름을 만듭니다.',
    button_text: '지금 시작하기',
    button_link: '/signup',
    image_url: '/images/banner-3.png',
    sort_order: 3,
    is_active: true
  },
  {
    title: '부모님이 확인하는',
    highlight: '성장 리포트 시스템',
    subtitle: '학습 시간, 집중도, 과목 비중, 합격 가능성 변화를 한눈에 확인합니다.',
    button_text: '지금 시작하기',
    button_link: '/signup',
    image_url: '/images/banner-4.png',
    sort_order: 4,
    is_active: true
  }
];

const BANNER_BUCKET = 'banners';

export default function Admin() {
  const [services, setServices] = useState([]);
  const [banners, setBanners] = useState([]);
  const [loading, setLoading] = useState(false);
  const [bannerLoading, setBannerLoading] = useState(false);

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

  async function fetchBanners() {
    const { data, error } = await supabase
      .from('banners')
      .select('*')
      .order('sort_order', { ascending: true });

    if (error) {
      console.error('배너 조회 실패:', error);
      setBanners([]);
      return;
    }

    setBanners(data || []);
  }

  useEffect(() => {
    fetchServices();
    fetchBanners();
  }, []);

  function updateLocal(id, key, value) {
    setServices((prev) =>
      prev.map((item) =>
        item.id === id ? { ...item, [key]: value } : item
      )
    );
  }

  function updateBannerLocal(id, key, value) {
    setBanners((prev) =>
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

  async function saveBanner(banner) {
    setBannerLoading(true);

    const { error } = await supabase
      .from('banners')
      .update({
        title: banner.title,
        highlight: banner.highlight,
        subtitle: banner.subtitle,
        button_text: banner.button_text,
        button_link: banner.button_link,
        image_url: banner.image_url,
        sort_order: Number(banner.sort_order || 0),
        is_active: !!banner.is_active
      })
      .eq('id', banner.id);

    setBannerLoading(false);

    if (error) {
      alert('배너 저장 실패');
      return;
    }

    alert('배너 저장 완료');
  }

  async function uploadBannerImage(banner, file) {
    if (!file) return;

    const ext = file.name.split('.').pop()?.toLowerCase() || 'png';
    const fileName = `${banner.id || 'new'}-${Date.now()}.${ext}`;
    const filePath = `home/${fileName}`;

    setBannerLoading(true);

    const { error: uploadError } = await supabase.storage
      .from(BANNER_BUCKET)
      .upload(filePath, file, {
        cacheControl: '3600',
        upsert: true
      });

    if (uploadError) {
      setBannerLoading(false);
      alert('이미지 업로드 실패: Supabase Storage에 banners 버킷이 있는지 확인해 주세요.');
      return;
    }

    const { data } = supabase.storage
      .from(BANNER_BUCKET)
      .getPublicUrl(filePath);

    updateBannerLocal(banner.id, 'image_url', data.publicUrl);
    setBannerLoading(false);
  }

  async function seedDefaultBanners() {
    setBannerLoading(true);

    const { error } = await supabase
      .from('banners')
      .insert(DEFAULT_BANNERS);

    setBannerLoading(false);

    if (error) {
      alert('기본 배너 생성 실패: banners 테이블 권한 또는 구조를 확인해 주세요.');
      return;
    }

    await fetchBanners();
    alert('기본 배너 4개를 생성했습니다.');
  }

  return (
    <main className="min-h-screen bg-slate-100 px-6 pt-28 pb-20">
      <div className="mx-auto max-w-6xl">
        <h1 className="text-3xl font-extrabold text-slate-900">
          관리자 페이지
        </h1>
        <p className="mt-2 text-slate-600">
          홈페이지 서비스와 메인 배너를 수정할 수 있습니다.
        </p>

        <section className="mt-8 rounded-3xl bg-white p-6 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <h2 className="text-2xl font-extrabold text-slate-900">메인 배너 관리</h2>
              <p className="mt-1 text-sm font-bold text-slate-500">
                현재 홈 배너 레이아웃은 유지하고, 이미지와 문구만 교체됩니다. 권장 이미지 비율은 2172×724입니다.
              </p>
            </div>

            {!banners.length && (
              <button
                type="button"
                onClick={seedDefaultBanners}
                disabled={bannerLoading}
                className="inline-flex items-center gap-2 rounded-xl bg-[#0D1B2A] px-5 py-3 text-sm font-black text-white disabled:opacity-60"
              >
                <ImagePlus size={18} />
                기본 배너 생성
              </button>
            )}
          </div>

          <div className="mt-6 space-y-5">
            {banners.map((banner) => (
              <div key={banner.id} className="rounded-2xl border border-slate-200 p-5">
                <div className="grid gap-5 lg:grid-cols-[280px_1fr]">
                  <div>
                    <div className="overflow-hidden rounded-2xl border border-slate-200 bg-slate-50">
                      {banner.image_url ? (
                        <img
                          src={banner.image_url}
                          alt={banner.title || '배너 이미지'}
                          className="h-36 w-full object-cover"
                        />
                      ) : (
                        <div className="flex h-36 items-center justify-center text-sm font-bold text-slate-400">
                          이미지 없음
                        </div>
                      )}
                    </div>

                    <label className="mt-3 flex cursor-pointer items-center justify-center gap-2 rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm font-black text-slate-700 hover:bg-slate-50">
                      <UploadCloud size={17} />
                      이미지 업로드
                      <input
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={(e) => uploadBannerImage(banner, e.target.files?.[0])}
                      />
                    </label>
                  </div>

                  <div className="grid gap-4 md:grid-cols-2">
                    <div>
                      <label className="text-sm font-bold text-slate-700">상단 문구</label>
                      <input
                        className="mt-2 w-full rounded-lg border border-slate-200 px-4 py-3"
                        value={banner.title || ''}
                        onChange={(e) => updateBannerLocal(banner.id, 'title', e.target.value)}
                      />
                    </div>

                    <div>
                      <label className="text-sm font-bold text-slate-700">강조 문구</label>
                      <input
                        className="mt-2 w-full rounded-lg border border-slate-200 px-4 py-3"
                        value={banner.highlight || ''}
                        onChange={(e) => updateBannerLocal(banner.id, 'highlight', e.target.value)}
                      />
                    </div>

                    <div className="md:col-span-2">
                      <label className="text-sm font-bold text-slate-700">설명</label>
                      <input
                        className="mt-2 w-full rounded-lg border border-slate-200 px-4 py-3"
                        value={banner.subtitle || ''}
                        onChange={(e) => updateBannerLocal(banner.id, 'subtitle', e.target.value)}
                      />
                    </div>

                    <div>
                      <label className="text-sm font-bold text-slate-700">버튼 문구</label>
                      <input
                        className="mt-2 w-full rounded-lg border border-slate-200 px-4 py-3"
                        value={banner.button_text || ''}
                        onChange={(e) => updateBannerLocal(banner.id, 'button_text', e.target.value)}
                      />
                    </div>

                    <div>
                      <label className="text-sm font-bold text-slate-700">버튼 링크</label>
                      <input
                        className="mt-2 w-full rounded-lg border border-slate-200 px-4 py-3"
                        value={banner.button_link || ''}
                        onChange={(e) => updateBannerLocal(banner.id, 'button_link', e.target.value)}
                      />
                    </div>

                    <div>
                      <label className="text-sm font-bold text-slate-700">이미지 URL</label>
                      <input
                        className="mt-2 w-full rounded-lg border border-slate-200 px-4 py-3"
                        value={banner.image_url || ''}
                        onChange={(e) => updateBannerLocal(banner.id, 'image_url', e.target.value)}
                      />
                    </div>

                    <div>
                      <label className="text-sm font-bold text-slate-700">노출 순서</label>
                      <input
                        type="number"
                        className="mt-2 w-full rounded-lg border border-slate-200 px-4 py-3"
                        value={banner.sort_order || 0}
                        onChange={(e) => updateBannerLocal(banner.id, 'sort_order', Number(e.target.value))}
                      />
                    </div>
                  </div>
                </div>

                <div className="mt-5 flex items-center justify-between">
                  <label className="flex items-center gap-2 text-sm font-bold text-slate-700">
                    <input
                      type="checkbox"
                      checked={!!banner.is_active}
                      onChange={(e) => updateBannerLocal(banner.id, 'is_active', e.target.checked)}
                    />
                    홈페이지 노출
                  </label>

                  <button
                    onClick={() => saveBanner(banner)}
                    disabled={bannerLoading}
                    className="inline-flex items-center gap-2 rounded-lg bg-[#0D1B2A] px-6 py-3 font-bold text-white hover:bg-[#162A40] disabled:opacity-60"
                  >
                    <Save size={17} />
                    배너 저장
                  </button>
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="mt-8">
          <h2 className="text-2xl font-extrabold text-slate-900">서비스 관리</h2>

          <div className="mt-5 space-y-5">
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
        </section>
      </div>
    </main>
  );
}
