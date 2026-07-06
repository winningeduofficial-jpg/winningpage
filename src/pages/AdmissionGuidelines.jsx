import Header from '../components/Header';

const SAMPLE_RESOURCES = [
  '입학처 바로가기',
  '수시모집요강',
  '정시모집요강',
  '전년도 입시결과',
  '학생부종합가이드북',
  '선행학습영향평가',
  '대입전형시행계획'
];

export default function AdmissionGuidelines() {
  return (
    <div className="min-h-screen bg-[#F6F7F9] text-[#0D1B2A]">
      <Header />
      <main className="pt-[84px]">
        <section className="bg-[#0D1B2A]">
          <div className="mx-auto max-w-[1280px] px-6 py-12">
            <div className="rounded-[28px] bg-[#2C2F33] px-8 py-10 text-white shadow-[0_12px_34px_rgba(0,0,0,0.24)]">
              <p className="text-sm font-black text-[#F4C36A]">위닝에듀 입시정보</p>
              <h1 className="mt-3 text-4xl font-black tracking-[-0.04em] md:text-5xl">
                대입모집요강 검색
              </h1>
              <p className="mt-5 max-w-[760px] text-base font-bold leading-7 text-white/70">
                대학별 입학처, 수시·정시 모집요강, 전년도 입시결과, 가이드북 자료를 한 학교 단위로 묶어 검색하는 페이지입니다.
              </p>
            </div>
          </div>
        </section>

        <section className="mx-auto max-w-[1280px] px-6 py-10">
          <div className="rounded-[28px] border border-[#E3E7EE] bg-white p-8 shadow-[0_8px_28px_rgba(13,27,42,0.08)]">
            <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
              <div>
                <p className="text-sm font-black text-[#B88737]">구현 예정 구조</p>
                <h2 className="mt-2 text-3xl font-black tracking-[-0.04em]">대학 기본정보 + 자료 목록 분리형</h2>
                <p className="mt-4 max-w-[760px] text-base font-semibold leading-7 text-gray-600">
                  이 페이지는 대학 기본정보를 먼저 등록하고, 그 대학에 여러 자료를 계속 추가하는 방식으로 연결합니다. PDF 파일 업로드와 외부 URL 입력을 모두 지원하는 구조로 설계합니다.
                </p>
              </div>
              <div className="rounded-2xl bg-[#F8FAFC] px-5 py-4 text-sm font-black text-gray-500">
                현재 단계: 헤더·라우트만 연결
              </div>
            </div>

            <div className="mt-8 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {SAMPLE_RESOURCES.map((label) => (
                <div key={label} className="rounded-2xl border border-[#E3E7EE] bg-[#F8FAFC] px-5 py-4 text-sm font-black text-[#0D1B2A]">
                  {label}
                </div>
              ))}
            </div>

            <div className="mt-8 rounded-2xl border border-dashed border-[#B88737]/50 bg-[#FFF8E8] p-5 text-sm font-bold leading-7 text-[#6F4C13]">
              다음 단계에서 Supabase 테이블을 확정한 뒤 실제 검색·파일 업로드·대학별 카드 UI를 연결합니다. 지금은 존재하지 않는 DB를 호출하지 않도록 안전하게 비워둔 상태입니다.
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}
