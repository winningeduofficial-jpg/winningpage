import { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, Building2, Download, Search } from 'lucide-react';
import { useSearchParams } from 'react-router-dom';
import Header from '../components/Header';
import { supabase } from '../lib/supabase';

function normalizeArray(value) {
  if (Array.isArray(value)) return value;
  if (!value) return [];

  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed : [value];
    } catch {
      return [value];
    }
  }

  return [];
}

function cleanText(value) {
  return String(value || '').trim();
}

function formatDate(value) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value).slice(0, 10);
  return date.toISOString().slice(0, 10);
}

function getAttachmentName(file) {
  if (!file || typeof file === 'string') return '첨부파일 다운로드';
  return file.name || '첨부파일 다운로드';
}

function getAttachmentUrl(file) {
  if (!file) return '';
  return typeof file === 'string' ? file : file.url;
}

function renderContent(content) {
  if (!content) return null;

  if (/<\/?[a-z][\s\S]*>/i.test(content)) {
    return (
      <div
        className="notice-content"
        dangerouslySetInnerHTML={{ __html: content }}
      />
    );
  }

  return <div className="notice-content whitespace-pre-line">{content}</div>;
}

function CompanyIntro({ page }) {
  const title = cleanText(page?.title) || '위닝에듀';
  const subtitle =
    cleanText(page?.subtitle) ||
    '학생의 학습 과정과 입시 전략을 데이터와 멘토링으로 연결합니다.';
  const body = cleanText(page?.body);
  const bottomImages = normalizeArray(page?.image_urls).filter(Boolean);

  return (
    <section className="border-b border-[#E7ECF2] bg-[#F7F9FC]">
      <div className="mx-auto grid max-w-[1280px] gap-10 px-6 py-16 lg:grid-cols-[minmax(0,1fr)_440px] lg:items-center lg:py-20">
        <div>
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[#0D1B2A] text-white">
            <Building2 size={25} />
          </div>
          <p className="mt-7 text-sm font-black text-[#B88737]">COMPANY</p>
          <h1 className="mt-3 break-keep text-4xl font-black tracking-[-0.05em] text-[#0D1B2A] sm:text-5xl">
            {title}
          </h1>
          <p className="mt-5 max-w-[760px] break-keep text-lg font-bold leading-8 text-[#566477]">
            {subtitle}
          </p>
          {body && (
            <p className="mt-6 max-w-[820px] whitespace-pre-line text-[15px] font-semibold leading-7 text-[#718096]">
              {body}
            </p>
          )}
        </div>

        <div className="overflow-hidden rounded-[26px] border border-[#173F7A]/12 bg-white shadow-[0_20px_45px_rgba(13,27,42,0.10)]">
          {page?.image_url ? (
            <img
              src={page.image_url}
              alt={title}
              className="aspect-[4/3] h-full w-full object-cover"
            />
          ) : bottomImages[0] ? (
            <img
              src={bottomImages[0]}
              alt={title}
              className="aspect-[4/3] h-full w-full object-cover"
            />
          ) : (
            <div className="flex aspect-[4/3] flex-col items-center justify-center bg-[linear-gradient(145deg,#0D1B2A,#24466A)] px-8 text-center text-white">
              <img
                src="/images/winning-logo.png"
                alt="위닝에듀"
                className="h-24 w-auto rounded-xl bg-white/95 p-3 object-contain"
              />
              <p className="mt-6 text-sm font-bold leading-6 text-white/75">
                회사소개 상단 이미지는 관리자 페이지의 세부 페이지 관리에서<br />
                company-intro 항목으로 변경할 수 있습니다.
              </p>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

export default function CompanyNews() {
  const [searchParams, setSearchParams] = useSearchParams();
  const selectedId = searchParams.get('id');
  const [introPage, setIntroPage] = useState(null);
  const [rows, setRows] = useState([]);
  const [keyword, setKeyword] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;

    async function loadPage() {
      setLoading(true);

      const [introResult, newsResult] = await Promise.all([
        supabase
          .from('page_contents')
          .select('*')
          .eq('slug', 'company-intro')
          .eq('is_active', true)
          .maybeSingle(),
        supabase
          .from('company_news')
          .select('*')
          .eq('is_active', true)
          .order('is_pinned', { ascending: false })
          .order('sort_order', { ascending: true })
          .order('created_at', { ascending: false }),
      ]);

      if (!alive) return;

      if (introResult.error) {
        console.error('회사소개 조회 오류:', introResult.error);
      } else {
        setIntroPage(introResult.data || null);
      }

      if (newsResult.error) {
        console.error('회사소식 조회 오류:', newsResult.error);
        setRows([]);
      } else {
        setRows(newsResult.data || []);
      }

      setLoading(false);
    }

    loadPage();

    return () => {
      alive = false;
    };
  }, []);

  const filteredRows = useMemo(() => {
    const q = keyword.trim().toLowerCase();
    if (!q) return rows;

    return rows.filter((row) =>
      [row.title, row.content, row.file_name]
        .join(' ')
        .toLowerCase()
        .includes(q),
    );
  }, [keyword, rows]);

  const selectedRow = useMemo(() => {
    if (!selectedId) return null;
    return rows.find((row) => String(row.id) === String(selectedId)) || null;
  }, [rows, selectedId]);

  if (selectedId && selectedRow) {
    const images = normalizeArray(selectedRow.image_urls);
    const finalImages = images.length ? images : selectedRow.image_url ? [selectedRow.image_url] : [];
    const attachments = normalizeArray(selectedRow.attachments);

    return (
      <>
        <Header />
        <main className="min-h-screen bg-white pt-[84px] text-[#0D1B2A]">
          <section className="mx-auto max-w-[1180px] px-6 py-16">
            <button
              type="button"
              onClick={() => setSearchParams({})}
              className="mb-8 inline-flex items-center gap-2 text-[16px] font-bold text-gray-600 hover:text-black"
            >
              <ArrowLeft size={20} />
              회사소식 목록으로
            </button>

            <article className="border-y border-[#D9DEE6]">
              <header className="border-b border-[#E7ECF2] px-4 py-8">
                <div className="mb-3 flex items-center gap-2">
                  {selectedRow.is_pinned && (
                    <span className="rounded bg-[#0D1B2A] px-2 py-1 text-xs font-black text-white">
                      주요소식
                    </span>
                  )}
                  <span className="text-sm font-semibold text-slate-400">
                    {formatDate(selectedRow.created_at)}
                  </span>
                </div>
                <h1 className="break-keep text-[30px] font-black leading-[1.35] tracking-[-0.03em]">
                  {selectedRow.title}
                </h1>
              </header>

              <div className="min-h-[420px] px-4 py-12">
                {finalImages.length > 0 && (
                  <div className="mx-auto mb-10 max-w-[920px] space-y-4">
                    {finalImages.map((url, index) => (
                      <img
                        key={`${url}-${index}`}
                        src={url}
                        alt={`${selectedRow.title} 이미지 ${index + 1}`}
                        className="w-full rounded-2xl object-contain"
                      />
                    ))}
                  </div>
                )}

                {renderContent(selectedRow.content)}

                {(attachments.length > 0 || selectedRow.file_url) && (
                  <div className="mt-12 rounded-xl border border-gray-200 bg-gray-50 p-5">
                    <p className="mb-3 text-sm font-black">첨부파일</p>
                    <div className="space-y-2">
                      {attachments.map((file, index) => {
                        const url = getAttachmentUrl(file);
                        if (!url) return null;

                        return (
                          <a
                            key={`${url}-${index}`}
                            href={url}
                            target="_blank"
                            rel="noreferrer"
                            className="flex items-center gap-2 rounded-lg border border-gray-300 bg-white px-4 py-3 text-sm font-bold text-gray-700 hover:border-[#0D1B2A]"
                          >
                            <Download size={16} />
                            {getAttachmentName(file)}
                          </a>
                        );
                      })}

                      {attachments.length === 0 && selectedRow.file_url && (
                        <a
                          href={selectedRow.file_url}
                          target="_blank"
                          rel="noreferrer"
                          className="flex items-center gap-2 rounded-lg border border-gray-300 bg-white px-4 py-3 text-sm font-bold text-gray-700 hover:border-[#0D1B2A]"
                        >
                          <Download size={16} />
                          {selectedRow.file_name || '첨부파일 다운로드'}
                        </a>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </article>
          </section>
        </main>
      </>
    );
  }

  return (
    <>
      <Header />
      <main className="min-h-screen bg-white pt-[84px] text-[#0D1B2A]">
        <CompanyIntro page={introPage} />

        <section className="mx-auto max-w-[1280px] px-6 py-16 lg:py-20">
          <div className="text-center">
            <p className="text-sm font-black text-[#B88737]">WINNING NEWS</p>
            <h2 className="mt-3 text-4xl font-black tracking-[-0.05em]">회사소식</h2>
            <p className="mt-4 text-lg font-semibold text-slate-500">
              위닝에듀의 새로운 소식과 주요 활동을 전합니다.
            </p>
          </div>

          <div className="mx-auto mt-12 flex h-14 max-w-[1120px] items-center border-b border-[#111827]">
            <input
              value={keyword}
              onChange={(event) => setKeyword(event.target.value)}
              placeholder="검색어를 입력해주세요"
              className="h-full flex-1 bg-transparent px-4 text-lg font-semibold outline-none placeholder:text-slate-300"
            />
            <Search size={29} strokeWidth={1.7} className="mr-4 text-slate-500" />
          </div>

          <div className="mx-auto mt-10 max-w-[1120px]">
            <p className="mb-7 text-base font-semibold text-slate-500">
              총 <span className="font-black text-[#0B73C9]">{filteredRows.length}</span>건의 소식이 있습니다.
            </p>

            {loading ? (
              <div className="py-24 text-center text-sm font-bold text-slate-400">
                회사소식을 불러오는 중입니다.
              </div>
            ) : filteredRows.length === 0 ? (
              <div className="py-24 text-center text-sm font-bold text-slate-400">
                등록된 회사소식이 없습니다.
              </div>
            ) : (
              <div className="divide-y divide-[#E7ECF2] border-y border-[#0D1B2A]">
                {filteredRows.map((row) => (
                  <button
                    key={row.id}
                    type="button"
                    onClick={() => setSearchParams({ id: String(row.id) })}
                    className="grid w-full gap-3 px-4 py-6 text-left transition hover:bg-[#F7F9FC] sm:grid-cols-[110px_minmax(0,1fr)_120px] sm:items-center"
                  >
                    <div>
                      {row.is_pinned ? (
                        <span className="inline-flex rounded bg-[#0D1B2A] px-3 py-1 text-xs font-black text-white">
                          주요소식
                        </span>
                      ) : (
                        <span className="text-sm font-bold text-slate-400">회사소식</span>
                      )}
                    </div>
                    <h3 className="line-clamp-1 text-base font-black text-[#26364A] sm:text-lg">
                      {row.title}
                    </h3>
                    <p className="text-sm font-semibold text-slate-400 sm:text-right">
                      {formatDate(row.created_at)}
                    </p>
                  </button>
                ))}
              </div>
            )}
          </div>
        </section>
      </main>
    </>
  );
}
