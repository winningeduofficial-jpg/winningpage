import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';

const fallbackReviews = [
  {
    id: 1,
    student_name: '김OO 학생',
    school_result: '서울대학교 합격',
    content: 'AI 분석과 컨설팅 덕분에 제 강점을 정확히 알고, 목표 대학에 맞는 전략을 세울 수 있었습니다.',
  },
  {
    id: 2,
    student_name: '이OO 학생',
    school_result: '연세대학교 합격',
    content: '수행평가와 세특 방향이 분명해져서 학생부 전체 흐름을 안정적으로 만들 수 있었습니다.',
  },
  {
    id: 3,
    student_name: '박OO 학생',
    school_result: '고려대학교 합격',
    content: '막연했던 학습 관리가 데이터로 보이니 매주 무엇을 보완해야 하는지 알 수 있었습니다.',
  },
];

export default function ReviewSection() {
  const [reviews, setReviews] = useState(fallbackReviews);

  useEffect(() => {
    async function fetchReviews() {
      const { data, error } = await supabase
        .from('reviews')
        .select('*')
        .eq('is_active', true)
        .order('sort_order', { ascending: true });

      if (!error && data?.length) {
        setReviews(data);
      }
    }

    fetchReviews();
  }, []);

  return (
    <section className="mx-auto max-w-7xl px-6 pb-20">
      <div className="rounded-3xl border border-slate-200 bg-white p-8 shadow-sm">
        <div className="mb-8 flex items-end justify-between">
          <div>
            <p className="text-sm font-bold text-blue-600">이용자 후기</p>
            <h2 className="mt-2 text-3xl font-extrabold text-slate-900">
              결과로 증명하는 위닝에듀
            </h2>
          </div>

          <a href="/reviews" className="text-sm font-bold text-blue-600">
            더보기 →
          </a>
        </div>

        <div className="grid gap-5 md:grid-cols-3">
          {reviews.slice(0, 3).map((review) => (
            <article
              key={review.id}
              className="rounded-2xl border border-slate-200 bg-slate-50 p-6"
            >
              <p className="text-sm leading-7 text-slate-700">
                “{review.content}”
              </p>

              <div className="mt-6 border-t border-slate-200 pt-4">
                <p className="font-extrabold text-slate-900">
                  {review.student_name}
                </p>
                <p className="mt-1 text-sm font-semibold text-blue-600">
                  {review.school_result}
                </p>
              </div>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
