import { useState } from 'react';
import { ChevronDown } from 'lucide-react';
import BookViewer from '../components/premiumBook/BookViewer';
import { usePremiumBookPages } from '../components/premiumBook/usePremiumBookPages';

// 이용신청 > 프리미엄 이용 (node 1882:11190) 정식 페이지.
// 러프 구현 목표 — 픽셀 재현 아님, 섹션 구조·카피·컬러 위계만 재현한다.
// 자세한 미결 사항은 docs/figma-ready-for-dev-spec.md §4-6 참고(수정·커밋 대상 아님, 읽기 전용).
//
// 책자 뷰어는 premium_book_pages를 읽는 usePremiumBookPages 훅 + 표현 전용 BookViewer가
// 전담한다(명세 §5.1). BookViewer는 components/premiumBook/ 공용 컴포넌트로 이관됐다 —
// 어드민 미리보기가 두 번째 소비자가 되면서 자체 DB 조회 전제가 깨졌기 때문이다. 이 파일에
// 있던 하드코딩 BOOK_SPREADS는 그 자리를 채우던 껍데기라 제거했다.

// 셀렉트 옵션 — 시안에 목록이 없어(B-13) 헤더·푸터 「프리미엄」 6개 프로그램 라벨
// (src/data/navigation.js FALLBACK_NAV_GROUPS)을 정본으로 그대로 쓴다.
const SERVICE_OPTIONS = [
  '대입컨설팅 프로그램',
  '특목고입학 프로그램',
  '대학원입학 프로그램',
  '해외명문대 진학컨설팅',
  '국제학교 학습관리',
  '국제・해외고 국내대 입학컨설팅'
];

const INITIAL_FORM = {
  name: '',
  phone: '',
  email: '',
  service: '',
  message: '',
  agree: false
};

function FormField({ label, children }) {
  return (
    <div className="flex flex-col gap-2">
      <label className="text-sm font-normal text-black">{label}</label>
      {children}
    </div>
  );
}

const inputClass =
  'h-12 w-full rounded-[0.625rem] border border-[#d7d7d7] bg-white px-5 py-4 text-sm font-medium text-[#1e293b] placeholder:text-[#767676] focus:border-[#013262] focus:outline-none';

export default function PremiumApply() {
  const [form, setForm] = useState(INITIAL_FORM);
  const [submitted, setSubmitted] = useState(false);
  const { pages, loading, error, retry } = usePremiumBookPages();

  function updateField(key, value) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  // 상담 신청 저장용 백엔드 테이블이 아직 없다(B급 — 범위 밖). 폼 유효성만 확인하고
  // 화면 상으로 접수 완료 상태만 보여주는 UI 껍데기다.
  function handleSubmit(event) {
    event.preventDefault();

    if (!form.name || !form.phone || !form.email || !form.service || !form.message || !form.agree) {
      window.alert('필수 항목을 모두 입력하고 개인정보 수집·이용에 동의해주세요.');
      return;
    }

    setSubmitted(true);
  }

  return (
    <main className="min-h-screen bg-white pt-16 text-[#0d1b2a]">
      {/* 히어로 */}
      <section className="mx-auto max-w-content px-6 pt-20 pb-10 text-center">
        <p className="text-base font-semibold leading-7 text-accent">프리미엄 이용</p>
        <h1 className="mx-auto mt-2 max-w-[56.25rem] text-3xl font-semibold leading-tight text-[#525252] md:text-[3.125rem] md:leading-[4.375rem]">
          위닝에듀만의 프리미엄 서비스를 확인해보세요
        </h1>
      </section>

      {/* 플립북 뷰어 — 섹션 래퍼까지 BookViewer가 렌더한다 */}
      <BookViewer pages={pages} loading={loading} error={error} onRetry={retry} />

      {/* 상담 신청 섹션 */}
      <section className="bg-[#f7f7f7] py-20">
        <div className="mx-auto flex max-w-content flex-col gap-10 px-6 lg:flex-row lg:items-start lg:justify-between lg:gap-16">
          <div className="max-w-[32.5rem] shrink-0 lg:pt-4">
            <p className="text-sm font-medium leading-5 text-[#013262]">문의</p>
            <h2 className="mt-2 text-2xl font-semibold leading-[2.5625rem] text-[#525252] md:text-[2rem]">
              프리미엄 서비스 상담 신청하기
            </h2>
            <p className="mt-2 text-base font-normal leading-[1.625rem] text-[#525252]">
              문의사항을 남겨주시면 위닝에듀 팀이 확인 후 연락드립니다.
            </p>
          </div>

          <div className="w-full max-w-[49.9375rem] rounded-[2rem] bg-white p-6 shadow-[0_0.25rem_2rem_rgba(0,0,0,0.16)] md:p-10">
            {submitted ? (
              <div className="flex min-h-[20rem] flex-col items-center justify-center gap-3 text-center">
                <p className="text-xl font-semibold text-[#525252]">상담 신청이 접수되었습니다.</p>
                <p className="text-sm font-normal text-[#767676]">
                  확인 후 입력하신 연락처로 안내드리겠습니다.
                </p>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="flex flex-col gap-9">
                <div className="flex flex-col gap-1.5">
                  <p className="text-xl font-medium leading-[2.0625rem] text-[#525252]">
                    문의사항을 남겨주세요
                  </p>
                  <p className="text-sm font-normal leading-[1.375rem] text-[#525252]">
                    이용하고 싶으신 서비스와 문의사항을 남기면 상담을 시작할 수 있습니다.
                  </p>
                </div>

                <div className="flex flex-col gap-6">
                  <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
                    <FormField label="이름 *">
                      <input
                        type="text"
                        required
                        value={form.name}
                        onChange={(e) => updateField('name', e.target.value)}
                        placeholder="예 : 홍길동"
                        className={inputClass}
                      />
                    </FormField>
                    <FormField label="연락처 *">
                      <input
                        type="tel"
                        required
                        value={form.phone}
                        onChange={(e) => updateField('phone', e.target.value)}
                        placeholder="010-0000-0000"
                        className={inputClass}
                      />
                    </FormField>
                  </div>

                  <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
                    <FormField label="이메일 *">
                      <input
                        type="email"
                        required
                        value={form.email}
                        onChange={(e) => updateField('email', e.target.value)}
                        placeholder="example@winningedu.com"
                        className={inputClass}
                      />
                    </FormField>
                    <FormField label="이용하고 싶으신 서비스 *">
                      <div className="relative">
                        <select
                          required
                          value={form.service}
                          onChange={(e) => updateField('service', e.target.value)}
                          className={`${inputClass} appearance-none pr-10 ${
                            form.service ? 'text-[#1e293b]' : 'text-[#767676]'
                          }`}
                        >
                          <option value="" disabled>
                            이용 서비스 선택
                          </option>
                          {SERVICE_OPTIONS.map((option) => (
                            <option key={option} value={option}>
                              {option}
                            </option>
                          ))}
                        </select>
                        <ChevronDown className="pointer-events-none absolute right-5 top-1/2 h-4 w-4 -translate-y-1/2 text-[#767676]" />
                      </div>
                    </FormField>
                  </div>

                  <FormField label="문의사항 *">
                    <textarea
                      required
                      value={form.message}
                      onChange={(e) => updateField('message', e.target.value)}
                      rows={5}
                      className="w-full resize-none rounded-[0.625rem] border border-[#d7d7d7] bg-white px-5 py-4 text-sm font-medium text-[#1e293b] focus:border-[#013262] focus:outline-none"
                    />
                  </FormField>

                  {/* 개인정보 수집·이용 동의 — 시안에 없으나(B-72) 국내 서비스 법적 필수라 기본값으로 추가 */}
                  <label className="flex items-start gap-2 text-sm font-normal leading-5 text-[#525252]">
                    <input
                      type="checkbox"
                      required
                      checked={form.agree}
                      onChange={(e) => updateField('agree', e.target.checked)}
                      className="mt-0.5 h-4 w-4 shrink-0 rounded border-[#d7d7d7] text-[#013262] focus:ring-[#013262]"
                    />
                    <span>
                      개인정보 수집·이용에 동의합니다.{' '}
                      <a href="/privacy" className="font-medium text-[#013262] underline">
                        내용 보기
                      </a>
                    </span>
                  </label>
                </div>

                <button
                  type="submit"
                  className="flex h-[3.25rem] w-full items-center justify-center rounded-[0.625rem] bg-[#013262] text-sm font-semibold text-white transition hover:bg-[#012347]"
                >
                  상담 신청하기
                </button>
              </form>
            )}
          </div>
        </div>
      </section>
    </main>
  );
}
