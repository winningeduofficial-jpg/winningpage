import { useEffect, useMemo, useState } from 'react';
import { Search } from 'lucide-react';
import Header from '../components/Header';
import { supabase } from '../lib/supabase';

function renderAnswer(answer) {
  if (!answer) return null;

  const hasHtml = /<\/?[a-z][\s\S]*>/i.test(answer);

  if (hasHtml) {
    return (
      <div
        className="faq-answer"
        dangerouslySetInnerHTML={{ __html: answer }}
      />
    );
  }

  return (
    <div className="faq-answer whitespace-pre-line">
      {answer}
    </div>
  );
}

export default function Faq() {
  const [faqs, setFaqs] = useState([]);
  const [keyword, setKeyword] = useState('');
  const [openedId, setOpenedId] = useState(null);
  const [loading, setLoading] = useState(true);

  async function loadFaqs() {
    setLoading(true);

    const { data, error } = await supabase
      .from('faqs')
      .select('*')
      .eq('is_active', true)
      .order('sort_order', { ascending: true })
      .order('created_at', { ascending: false });

    setLoading(false);

    if (error) {
      console.error('FAQ 조회 오류:', error);
      setFaqs([]);
      return;
    }

    setFaqs(data || []);
  }

  useEffect(() => {
    loadFaqs();
  }, []);

  const filteredFaqs = useMemo(() => {
    const q = keyword.trim().toLowerCase();

    if (!q) return faqs;

    return faqs.filter((faq) =>
      [faq.question, faq.answer]
        .join(' ')
        .toLowerCase()
        .includes(q)
    );
  }, [faqs, keyword]);

  function toggleFaq(id) {
    setOpenedId((prev) => (prev === id ? null : id));
  }

  return (
    <>
      <Header />

      <main className="min-h-screen bg-white pt-[84px] text-[#0D1B2A]">
        <section className="mx-auto max-w-[1320px] px-6 py-12">
          <div className="relative h-[150px] overflow-hidden rounded-xl bg-[#0D1B2A]">
            <img
              src="/images/faq-banner.jpg"
              alt=""
              className="h-full w-full object-cover opacity-70"
              onError={(e) => {
                e.currentTarget.style.display = 'none';
              }}
            />

            <div className="absolute inset-0 bg-black/25" />

            <div className="absolute inset-0 flex items-center justify-center">
              <h1 className="text-[34px] font-black tracking-[-0.04em] text-white">
                자주하는 질문
              </h1>
            </div>
          </div>

          <div className="mx-auto mt-16 max-w-[1180px]">
            <div className="mb-10 flex items-center border-b border-[#222] pb-4">
              <input
                value={keyword}
                onChange={(e) => setKeyword(e.target.value)}
                placeholder="검색어를 입력해주세요"
                className="h-12 flex-1 border-0 bg-transparent text-[20px] font-medium text-[#222] placeholder:text-gray-400 focus:outline-none"
              />
              <Search size={32} strokeWidth={1.7} className="text-gray-600" />
            </div>

            {loading ? (
              <div className="py-24 text-center text-lg font-bold text-gray-400">
                FAQ를 불러오는 중입니다.
              </div>
            ) : filteredFaqs.length === 0 ? (
              <div className="py-24 text-center text-lg font-bold text-gray-400">
                등록된 FAQ가 없습니다.
              </div>
            ) : (
              <div className="space-y-5">
                {filteredFaqs.map((faq) => {
                  const isOpen = openedId === faq.id;

                  return (
                    <article
                      key={faq.id}
                      className="rounded-2xl border border-[#cfd6df] bg-white px-8 py-7"
                    >
                      <button
                        type="button"
                        onClick={() => toggleFaq(faq.id)}
                        className="flex w-full items-center justify-between gap-6 text-left"
                      >
                        <h2 className="break-keep text-[24px] font-black tracking-[-0.04em] text-black">
                          {faq.question}
                        </h2>

                        <span className="shrink-0 rounded-full bg-[#454C56] px-7 py-3 text-[15px] font-black text-white">
                          {isOpen ? '접기 ↑' : '자세히보기 ↓'}
                        </span>
                      </button>

                      {isOpen && (
                        <div className="mt-8 border-t border-gray-300 pt-6 text-[17px] font-medium leading-[1.85] tracking-[-0.03em] text-[#111827]">
                          {renderAnswer(faq.answer)}
                        </div>
                      )}
                    </article>
                  );
                })}
              </div>
            )}
          </div>
        </section>
      </main>
    </>
  );
}
