import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Search, ArrowLeft, Download } from 'lucide-react';
import Header from '../components/Header';
import { supabase } from '../lib/supabase';

function normalizeArray(value) {
  if (Array.isArray(value)) return value;
  if (!value) return [];

  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return value ? [value] : [];
    }
  }

  return [];
}

function formatDate(value) {
  if (!value) return '';

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return String(value).slice(0, 10);
  }

  return date.toISOString().slice(0, 10);
}

function getAttachmentName(file) {
  if (!file) return '첨부파일 다운로드';
  if (typeof file === 'string') return '첨부파일 다운로드';
  return file.name || '첨부파일 다운로드';
}

function getAttachmentUrl(file) {
  if (!file) return '';
  return typeof file === 'string' ? file : file.url;
}

function renderNoticeContent(content) {
  if (!content) return null;

  const hasHtml = /<\/?[a-z][\s\S]*>/i.test(content);

  if (hasHtml) {
    return (
      <div
        className="notice-content"
        dangerouslySetInnerHTML={{ __html: content }}
      />
    );
  }

  return (
    <div className="notice-content whitespace-pre-line">
      {content}
    </div>
  );
}

export default function Events() {
  const [searchParams, setSearchParams] = useSearchParams();
  const selectedId = searchParams.get('id');

  const [notices, setNotices] = useState([]);
  const [keyword, setKeyword] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;

    async function fetchNotices() {
      setLoading(true);

      const { data, error } = await supabase
        .from('notices')
        .select('*')
        .eq('is_active', true)
        .order('is_pinned', { ascending: false })
        .order('sort_order', { ascending: true })
        .order('created_at', { ascending: false });

      if (!mounted) return;

      if (error) {
        console.error('공지사항 조회 오류:', error);
        setNotices([]);
        setLoading(false);
        return;
      }

      setNotices(data || []);
      setLoading(false);
    }

    fetchNotices();

    return () => {
      mounted = false;
    };
  }, []);

  const filteredNotices = useMemo(() => {
    const q = keyword.trim().toLowerCase();

    if (!q) return notices;

    return notices.filter((notice) => {
      const attachmentsText = normalizeArray(notice.attachments)
        .map((file) => (typeof file === 'string' ? file : file?.name || ''))
        .join(' ');

      const text = [
        notice.title,
        notice.content,
        notice.file_name,
        attachmentsText
      ]
        .join(' ')
        .toLowerCase();

      return text.includes(q);
    });
  }, [keyword, notices]);

  const selectedNotice = useMemo(() => {
    if (!selectedId) return null;
    return notices.find((notice) => String(notice.id) === String(selectedId)) || null;
  }, [selectedId, notices]);

  if (selectedNotice) {
    const images = normalizeArray(selectedNotice.image_urls);
    const attachments = normalizeArray(selectedNotice.attachments);

    return (
      <>
        <Header />

        <main className="min-h-screen bg-white pt-[84px]">
          <section className="mx-auto max-w-[1180px] px-6 py-16">
            <button
              type="button"
              onClick={() => setSearchParams({})}
              className="mb-8 inline-flex items-center gap-2 text-[16px] font-bold text-gray-600 hover:text-black"
            >
              <ArrowLeft size={20} />
              목록으로
            </button>

            <div className="border-y border-[#d9d9d9]">
              <div className="border-b border-[#e5e5e5] px-4 py-7">
                <div className="mb-3 flex items-center gap-2">
                  {selectedNotice.is_pinned && (
                    <span className="rounded bg-[#0D1B2A] px-2 py-1 text-xs font-black text-white">
                      공지
                    </span>
                  )}

                  <span className="text-sm font-medium text-gray-500">
                    {formatDate(selectedNotice.created_at)}
                  </span>
                </div>

                <h1 className="break-keep text-[30px] font-black leading-[1.35] tracking-[-0.03em] text-[#111827]">
                  {selectedNotice.title}
                </h1>
              </div>

              <article className="min-h-[420px] px-4 py-12">
                {images.length > 0 ? (
                  <div className="mb-10 space-y-0 overflow-hidden rounded-2xl border border-gray-200 bg-white">
                    {images.map((url, index) => (
                      <img
                        key={`${url}-${index}`}
                        src={url}
                        alt={`${selectedNotice.title} 이미지 ${index + 1}`}
                        className="w-full object-contain"
                      />
                    ))}
                  </div>
                ) : selectedNotice.image_url ? (
                  <div className="mb-10 flex justify-center">
                    <img
                      src={selectedNotice.image_url}
                      alt={selectedNotice.title}
                      className="max-h-none max-w-full object-contain"
                    />
                  </div>
                ) : null}

                {renderNoticeContent(selectedNotice.content)}

                {attachments.length > 0 ? (
                  <div className="mt-12 rounded-xl border border-gray-200 bg-gray-50 p-5">
                    <p className="mb-3 text-sm font-black text-[#111827]">
                      첨부파일
                    </p>

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
                            className="flex items-center gap-2 rounded-lg border border-gray-300 bg-white px-4 py-3 text-sm font-bold text-gray-700 hover:border-[#0D1B2A] hover:text-[#0D1B2A]"
                          >
                            <Download size={16} />
                            {getAttachmentName(file)}
                          </a>
                        );
                      })}
                    </div>
                  </div>
                ) : selectedNotice.file_url ? (
                  <div className="mt-12 rounded-xl border border-gray-200 bg-gray-50 p-5">
                    <p className="mb-3 text-sm font-black text-[#111827]">
                      첨부파일
                    </p>

                    <a
                      href={selectedNotice.file_url}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-2 rounded-lg border border-gray-300 bg-white px-4 py-3 text-sm font-bold text-gray-700 hover:border-[#0D1B2A] hover:text-[#0D1B2A]"
                    >
                      <Download size={16} />
                      {selectedNotice.file_name || '첨부파일 다운로드'}
                    </a>
                  </div>
                ) : null}
              </article>
            </div>
          </section>
        </main>
      </>
    );
  }

  return (
    <>
      <Header />

      <main className="min-h-screen bg-white pt-[84px]">
        <section className="mx-auto max-w-[1500px] px-8 py-16">
          <div className="text-center">
            <h1 className="text-[44px] font-black tracking-[-0.04em] text-[#222]">
              공지사항
            </h1>

            <p className="mt-6 text-[26px] font-medium tracking-[-0.03em] text-gray-500">
              위닝에듀 알림
            </p>
          </div>

          <div className="mx-auto mt-16 flex max-w-[1340px] items-center border-b border-[#222] pb-4">
            <input
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
              placeholder="검색어를 입력해주세요"
              className="h-12 flex-1 border-0 bg-transparent text-[22px] font-medium text-[#222] placeholder:text-gray-400 focus:outline-none"
            />

            <Search size={38} strokeWidth={1.6} className="text-gray-600" />
          </div>

          <div className="mx-auto mt-14 max-w-[1340px]">
            <p className="mb-8 text-[20px] font-medium text-gray-600">
              총{' '}
              <span className="font-black text-[#00A6D6]">
                {filteredNotices.length}
              </span>
              건의 자료가 있습니다.
            </p>

            {loading ? (
              <div className="py-24 text-center text-lg font-bold text-gray-400">
                공지사항을 불러오는 중입니다.
              </div>
            ) : filteredNotices.length === 0 ? (
              <div className="py-24 text-center text-lg font-bold text-gray-400">
                등록된 공지사항이 없습니다.
              </div>
            ) : (
              <div className="grid gap-x-12 gap-y-11 md:grid-cols-2">
                {filteredNotices.map((notice) => {
                  const isHighlight = notice.is_pinned;

                  return (
                    <button
                      key={notice.id}
                      type="button"
                      onClick={() => setSearchParams({ id: String(notice.id) })}
                      className={`min-h-[118px] border px-6 py-7 text-left transition hover:-translate-y-0.5 hover:shadow-md ${
                        isHighlight
                          ? 'border-[#e2e4cf] bg-[#f2f3d8]'
                          : 'border-gray-200 bg-white'
                      }`}
                    >
                      <h2 className="line-clamp-1 text-[22px] font-black tracking-[-0.03em] text-[#111827]">
                        {notice.is_pinned ? '[공지] ' : ''}
                        {notice.title}
                      </h2>

                      <p className="mt-6 text-[17px] font-medium text-gray-500">
                        {formatDate(notice.created_at)}
                      </p>
                    </button>
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

