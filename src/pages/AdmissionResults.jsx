import Header from '../components/Header';

const SUSI_FIELDS = [
  '대학명',
  '중심전형',
  '전형명',
  '모집단위',
  '모집인원',
  '경쟁률',
  '충원순위',
  '최종등록자 교과등급',
  '최종등록자 환산점수',
  '반영교과'
];

const JUNGSI_FIELDS = [
  '대학교',
  '전공',
  '모집군',
  '정원',
  '적정점수',
  '예상점수',
  '소신점수',
  '적정누백',
  '예상누백',
  '소신누백',
  '과거입시결과 합격권',
  '과거입시결과 상위70%'
];

export default function AdmissionResults() {
  return (
    <div className="min-h-screen bg-white text-[#0D1B2A]">
      <Header />
      <main className="pt-[84px]">
        <section className="border-b border-[#E8EDF3] bg-[#F8FAFC]">
          <div className="mx-auto max-w-[1280px] px-6 py-14 text-center">
            <p className="text-sm font-black text-[#7B2FF7]">위닝에듀 입시정보</p>
            <h1 className="mt-3 text-4xl font-black tracking-[-0.04em] md:text-5xl">대학 입결정보 검색</h1>
            <p className="mx-auto mt-5 max-w-[760px] text-base font-bold leading-7 text-gray-500">
              대학명과 모집단위를 기준으로 수시 입결과 정시 지원선·과거 입시결과를 함께 조회하는 페이지입니다.
            </p>
          </div>
        </section>

        <section className="mx-auto max-w-[1280px] px-6 py-10">
          <div className="rounded-[34px] border border-[#E3E7EE] bg-white p-8 shadow-[0_12px_34px_rgba(13,27,42,0.08)]">
            <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
              <div>
                <p className="text-sm font-black text-[#B88737]">구현 예정 구조</p>
                <h2 className="mt-2 text-3xl font-black tracking-[-0.04em]">수시 DB와 정시 DB를 분리해 한 화면에서 검색</h2>
            
              </div>
              <div className="rounded-2xl bg-[#F3F0FF] px-5 py-4 text-sm font-black text-[#5B21B6]">
                현재 단계: 헤더·라우트만 연결
              </div>
            </div>

            <div className="mt-8 grid gap-6 lg:grid-cols-2">
              <div className="rounded-3xl border border-[#E3E7EE] bg-[#F8FAFC] p-6">
                <h3 className="text-xl font-black tracking-[-0.04em]">수시 입결 반영 예정 항목</h3>
                <div className="mt-5 grid grid-cols-2 gap-3">
                  {SUSI_FIELDS.map((field) => (
                    <div key={field} className="rounded-xl bg-white px-4 py-3 text-sm font-black text-gray-700 shadow-sm">
                      {field}
                    </div>
                  ))}
                </div>
              </div>

              <div className="rounded-3xl border border-[#E3E7EE] bg-[#F8FAFC] p-6">
                <h3 className="text-xl font-black tracking-[-0.04em]">정시 자료 반영 예정 항목</h3>
                <div className="mt-5 grid grid-cols-2 gap-3">
                  {JUNGSI_FIELDS.map((field) => (
                    <div key={field} className="rounded-xl bg-white px-4 py-3 text-sm font-black text-gray-700 shadow-sm">
                      {field}
                    </div>
                  ))}
                </div>
              </div>
            </div>

           
          </div>
        </section>
      </main>
    </div>
  );
}
