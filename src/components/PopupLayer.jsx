import { useEffect, useState } from 'react';
import { X } from 'lucide-react';
import { supabase } from '../lib/supabase';

function todayYmd() {
  const now = new Date();
  const kst = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Seoul' }));
  const yyyy = kst.getFullYear();
  const mm = String(kst.getMonth() + 1).padStart(2, '0');
  const dd = String(kst.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

export default function PopupLayer() {
  const [popups, setPopups] = useState([]);

  useEffect(() => {
    let alive = true;

    async function loadPopups() {
      const { data, error } = await supabase
        .from('popups')
        .select('*')
        .eq('is_active', true)
        .order('sort_order', { ascending: true });

      if (error) {
        console.error('팝업 조회 실패:', error);
        return;
      }

      const today = todayYmd();

      const filtered = (data || []).filter((popup) => {
        const hiddenKey = `winning-popup-hidden-${popup.id}-${today}`;
        const hiddenToday = window.localStorage.getItem(hiddenKey) === '1';

        if (hiddenToday) return false;
        if (popup.start_date && popup.start_date > today) return false;
        if (popup.end_date && popup.end_date < today) return false;

        return true;
      });

      if (alive) setPopups(filtered);
    }

    loadPopups();

    return () => {
      alive = false;
    };
  }, []);

  function closePopup(id) {
    setPopups((prev) => prev.filter((popup) => popup.id !== id));
  }

  function hideToday(id) {
    const today = todayYmd();
    window.localStorage.setItem(`winning-popup-hidden-${id}-${today}`, '1');
    closePopup(id);
  }

  if (popups.length === 0) return null;

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/35 px-4">
      <div className="flex max-w-[960px] flex-wrap justify-center gap-5">
        {popups.map((popup) => (
          <div
            key={popup.id}
            className="w-[360px] overflow-hidden rounded-2xl bg-white shadow-[0_24px_80px_rgba(0,0,0,0.28)]"
          >
            <div className="flex items-center justify-between border-b border-gray-100 px-5 py-4">
              <h3 className="text-base font-black text-[#0D1B2A]">
                {popup.title}
              </h3>

              <button
                type="button"
                onClick={() => closePopup(popup.id)}
                className="rounded-full p-1 text-gray-500 hover:bg-gray-100 hover:text-black"
              >
                <X size={18} />
              </button>
            </div>

            {popup.image_url && (
              <button
                type="button"
                onClick={() => {
                  if (!popup.url) return;
                  if (popup.open_new_window) window.open(popup.url, '_blank', 'noopener,noreferrer');
                  else window.location.href = popup.url;
                }}
                className="block w-full"
              >
                <img
                  src={popup.image_url}
                  alt={popup.title}
                  className="h-auto w-full object-cover"
                />
              </button>
            )}

            {popup.content && (
              <div className="whitespace-pre-line px-5 py-4 text-sm font-medium leading-6 text-gray-700">
                {popup.content}
              </div>
            )}

            <div className="flex border-t border-gray-100">
              <button
                type="button"
                onClick={() => hideToday(popup.id)}
                className="flex-1 px-4 py-3 text-sm font-bold text-gray-600 hover:bg-gray-50"
              >
                오늘 하루 보지 않기
              </button>

              <button
                type="button"
                onClick={() => closePopup(popup.id)}
                className="flex-1 border-l border-gray-100 px-4 py-3 text-sm font-black text-[#0D1B2A] hover:bg-gray-50"
              >
                닫기
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
