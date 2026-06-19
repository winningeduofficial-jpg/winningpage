import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Search } from 'lucide-react';
import Header from '../components/Header';
import { supabase } from '../lib/supabase';

function normalizeArray(value) {
  if (Array.isArray(value)) return value;
  if (!value) return [];

  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed : value ? [value] : [];
    } catch {
      return value ? [value] : [];
    }
  }

  return [];
}

function formatDate(value) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value).slice(0, 10);
  return date.toISOString().slice(0, 10);
}

export default function Gallery() {
  const { id } = useParams();
  const [rows, setRows] = useState([]);
  const [post, setPost] = useState(null);
  const [keyword, setKeyword] = useState('');
  const [loading, setLoading] = useState(true);

  const filteredRows = useMemo(() => {
    const q = keyword.trim().toLowerCase();
    if (!q) return rows;

    return rows.filter((row) => String(row.title || '').toLowerCase().includes(q));
  }, [rows, keyword]);

  useEffect(() => {
    let alive = true;

    async function loadList() {
      setLoading(true);

      const { data, error } = await supabase
        .from('galleries')
        .select('*')
        .eq('is_active', true)
        .order('created_at', { ascending: false });

      if (!alive) return;

      if (error) {
        console.error('포토갤러리 조회 실패:', error);
        setRows([]);
      } else {
        setRows(data || []);
      }

      setLoading(false);
    }

    async function loadDetail() {
      setLoading(true);

      const { data, error } = await supabase
        .from('galleries')
        .select('*')
        .eq('id', id)
        .eq('is_active', true)
        .maybeSingle();

      if (!alive) return;

      if (error) {
        console.error('포토갤러리 상세 조회 실패:', error);
        setPost(null);
      } else {
        setPost(data || null);
      }

      setLoading(false);
    }

    if (id) loadDetail();
    else loadList();

    return () => {
      alive = false;
    };
  }, [id]);

  if (id) {
    const images = normalizeArray(post?.image_urls);
    const fallbackImages = post?.image_url ? [post.image_url] : [];
    const finalImages = images.length > 0 ? images : fallbackImages;

    return (
      <div className="min-h-screen bg-white text-[#0D1B2A]">
        <Header />
        <main className="pt-[84px]">
          <section className="mx-auto max-w-[1180px] px-6 py-16">
            {loading ? (
              <div className="py-24 text-center text-sm font-bold text-gray-500">
                불러오는 중입니다.
              </div>
            ) : !post ? (
              <div className="py-24 text-center">
                <h1 className="text-2xl font-black">게시글을 찾을 수 없습니다.</h1>
                <Link
                  to="/gallery"
                  className="mt-8 inline-flex h-11 items-center justify-center rounded-xl bg-[#0D1B2A] px-6 text-sm font-black text-white"
                >
                  목록으로
                </Link>
              </div>
            ) : (
              <>
                <div className="border-b border-[#0D1B2A] pb-8 text-center">
                  <h1 className="text-4xl font-black tracking-[-0.04em]">{post.title}</h1>
                  <p className="mt-4 text-sm font-bold text-gray-400">
                    {formatDate(post.created_at)}
                  </p>
                </div>

                <div className="mx-auto mt-12 max-w-[900px] space-y-5">
                  {finalImages.map((url, index) => (
                    <img
                      key={`${url}-${index}`}
                      src={url}
                      alt={`${post.title} 이미지 ${index + 1}`}
                      className="w-full rounded-xl object-cover"
                    />
                  ))}
                </div>

                <div className="mt-14 text-center">
                  <Link
                    to="/gallery"
                    className="inline-flex h-12 items-center justify-center rounded-xl bg-[#0D1B2A] px-8 text-sm font-black text-white"
                  >
                    목록으로
                  </Link>
                </div>
              </>
            )}
          </section>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white text-[#0D1B2A]">
      <Header />
      <main className="pt-[84px]">
        <section className="mx-auto max-w-[1280px] px-6 py-16">
          <div className="text-center">
            <h1 className="text-4xl font-black tracking-[-0.04em]">포토갤러리</h1>
            <p className="mt-6 text-xl font-medium text-gray-500">위닝에듀 센터 스토리</p>
          </div>

          <div className="mx-auto mt-14 flex h-14 max-w-[1160px] items-center border-b border-[#111827]">
            <input
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
              placeholder="검색어를 입력해주세요"
              className="h-full flex-1 bg-transparent px-6 text-lg font-medium outline-none placeholder:text-gray-300"
            />
            <Search size={30} strokeWidth={1.6} className="mr-6 text-gray-500" />
          </div>

          <div className="mt-12 text-lg font-medium text-gray-500">
            총 <span className="font-black text-[#0086d1]">{filteredRows.length}</span>건의 자료가 있습니다.
          </div>

          {loading ? (
            <div className="py-24 text-center text-sm font-bold text-gray-500">
              불러오는 중입니다.
            </div>
          ) : filteredRows.length === 0 ? (
            <div className="py-24 text-center text-sm font-bold text-gray-400">
              등록된 사진이 없습니다.
            </div>
          ) : (
            <div className="mt-8 grid grid-cols-1 gap-x-8 gap-y-12 md:grid-cols-2 lg:grid-cols-3">
              {filteredRows.map((row) => {
                const images = normalizeArray(row.image_urls);
                const thumbnail = images[0] || row.image_url || '';

                return (
                  <Link key={row.id} to={`/gallery/${row.id}`} className="group block">
                    <div className="aspect-[4/3] overflow-hidden bg-gray-100">
                      {thumbnail ? (
                        <img
                          src={thumbnail}
                          alt={row.title || ''}
                          className="h-full w-full object-cover transition duration-500 group-hover:scale-105"
                        />
                      ) : (
                        <div className="flex h-full w-full items-center justify-center text-sm font-bold text-gray-400">
                          이미지 없음
                        </div>
                      )}
                    </div>

                    <h2 className="mt-5 line-clamp-2 text-xl font-bold tracking-[-0.04em] text-[#111827]">
                      {row.title}
                    </h2>
                  </Link>
                );
              })}
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
