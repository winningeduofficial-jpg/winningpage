import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Check, ChevronRight } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { SINGLE_SELECT_NOTICE, formatKRW } from '../data/pricingCatalog';
import { useProducts } from '../lib/products';
import { saveCart } from '../lib/cart';

export default function Pricing() {
  const navigate = useNavigate();
  const { services, loading, error, refetch } = useProducts();
  // 서비스별 단일 선택: { [serviceKey]: productId }
  const [selected, setSelected] = useState({});

  function toggle(serviceKey, productId) {
    setSelected((prev) => {
      const next = { ...prev };
      if (next[serviceKey] === productId) delete next[serviceKey];
      else next[serviceKey] = productId;
      return next;
    });
  }

  // 선택된 상품 목록(장바구니 형태로 enrich)
  const selectedItems = useMemo(() => {
    const items = [];
    services.forEach((service) => {
      const pid = selected[service.key];
      if (!pid) return;
      const product = service.products.find((p) => p.id === pid);
      if (!product) return;
      items.push({
        id: product.id,
        serviceKey: service.key,
        serviceName: service.name,
        serviceDesc: service.desc,
        name: product.name,
        listPrice: product.listPrice,
        price: product.price,
        badge: product.badge,
        recommended: product.recommended
      });
    });
    return items;
  }, [services, selected]);

  const totalPrice = selectedItems.reduce((sum, it) => sum + Number(it.price || 0), 0);
  const listTotal = selectedItems.reduce(
    (sum, it) => sum + Number(it.listPrice || it.price || 0),
    0
  );
  const discountTotal = listTotal - totalPrice;

  async function goCheckout() {
    if (selectedItems.length === 0) return;
    saveCart(selectedItems); // 선택 항목 저장 (로그인 후에도 유지)
    // 로그인 안 됐으면 로그인 페이지로 → 로그인 후 바로 결제 페이지로 복귀
    const { data } = await supabase.auth.getSession();
    if (!data?.session?.user) {
      navigate('/login?redirect=/checkout');
      return;
    }
    navigate('/checkout');
  }

  return (
    <>
      <main className="min-h-screen bg-white pt-16">
        {/* 타이틀 */}
        <section className="px-6 pb-4 pt-16 text-center">
          <p className="text-sm font-black text-blue-600">나에게 맞는 서비스를 선택해주세요</p>
          <h1 className="mt-3 text-3xl font-black tracking-[-0.02em] text-[#0D1B2A] sm:text-[40px]">
            결제할 서비스를 선택해주세요
          </h1>
        </section>

        {/* 서비스 섹션들 */}
        <div className="mx-auto max-w-[900px] px-6 pb-40 pt-10">
          {loading && (
            <div className="rounded-2xl border border-slate-200 bg-white p-10 text-center text-sm font-bold text-slate-500">
              요금 정보를 불러오는 중입니다.
            </div>
          )}

          {!loading && (error || services.length === 0) && (
            <div className="rounded-2xl border border-red-200 bg-white p-10 text-center">
              <p className="text-sm font-bold text-red-600">
                요금 정보를 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.
              </p>
              <button
                type="button"
                onClick={refetch}
                className="mt-4 rounded-lg border border-slate-300 px-5 py-2.5 text-sm font-bold text-[#0D1B2A] transition hover:bg-slate-50"
              >
                다시 시도
              </button>
            </div>
          )}

          {!loading && !error && services.map((service) => (
            <section key={service.key} className="mb-16">
              <div className="mb-2 flex items-center gap-2">
                <h2 className="text-2xl font-black text-[#0D1B2A]">{service.name}</h2>
                <ChevronRight size={22} strokeWidth={3} className="text-[#0D1B2A]" />
              </div>
              {service.desc && (
                <p className="mb-6 max-w-[760px] text-[13px] leading-relaxed text-slate-500">
                  {service.desc}
                </p>
              )}

              <div className="space-y-3">
                {service.products.map((product) => {
                  const isSelected = selected[service.key] === product.id;
                  const hasDiscount = product.listPrice > product.price;
                  return (
                    <button
                      type="button"
                      key={product.id}
                      onClick={() => toggle(service.key, product.id)}
                      className={`flex w-full items-center justify-between gap-4 rounded-2xl border px-5 py-5 text-left transition ${
                        isSelected
                          ? 'border-blue-600 bg-blue-50/40 ring-1 ring-blue-200'
                          : 'border-slate-200 bg-white hover:border-slate-300'
                      }`}
                    >
                      <span className="flex min-w-0 items-center gap-3">
                        <span
                          className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-md border transition ${
                            isSelected ? 'border-blue-600 bg-blue-600' : 'border-slate-300 bg-white'
                          }`}
                        >
                          {isSelected && (
                            <Check size={15} strokeWidth={3.5} className="text-white" />
                          )}
                        </span>
                        <span className="truncate text-[15px] font-bold text-[#0D1B2A]">
                          {product.name}
                        </span>
                        {product.recommended && (
                          <span className="shrink-0 rounded-md bg-blue-600 px-2 py-0.5 text-[11px] font-bold text-white">
                            추천
                          </span>
                        )}
                      </span>

                      <span className="flex shrink-0 flex-col items-end leading-tight">
                        {hasDiscount && (
                          <span className="text-[12px] text-slate-400 line-through">
                            {formatKRW(product.listPrice)}
                          </span>
                        )}
                        <span className="flex items-center gap-2">
                          {product.badge && (
                            <span className="text-[13px] font-bold text-blue-600">
                              {product.badge}
                            </span>
                          )}
                          <span className="text-[15px] font-black text-[#0D1B2A]">
                            {formatKRW(product.price)}
                          </span>
                        </span>
                      </span>
                    </button>
                  );
                })}
              </div>

              {service.products.length > 1 && (
                <p className="mt-4 text-[12px] text-slate-400">{SINGLE_SELECT_NOTICE}</p>
              )}
            </section>
          ))}
        </div>
      </main>

      {/* 하단 플로팅 결제바 */}
      {selectedItems.length > 0 && (
        <div className="fixed inset-x-0 bottom-0 z-40 bg-[#E3EEFF] shadow-[0_-6px_24px_rgba(13,27,42,0.08)]">
          <div className="mx-auto flex max-w-[1100px] items-center justify-between gap-6 px-8 py-5">
            <div className="flex items-center gap-12 sm:gap-16">
              <div className="text-center">
                <p className="text-[13px] font-medium text-slate-500">총 판매가</p>
                <p className="mt-1 text-[19px] font-black text-[#0D1B2A]">{formatKRW(listTotal)}</p>
              </div>
              <div className="text-center">
                <p className="text-[13px] font-medium text-slate-500">총 할인금액</p>
                <p className="mt-1 text-[19px] font-black text-blue-600">
                  {formatKRW(discountTotal)}
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={goCheckout}
              className="shrink-0 rounded-lg bg-blue-600 px-8 py-3.5 text-[15px] font-bold text-white shadow-[0_10px_26px_rgba(37,99,235,0.28)] transition hover:bg-blue-700"
            >
              {formatKRW(totalPrice)} 결제하기
            </button>
          </div>
        </div>
      )}
    </>
  );
}
