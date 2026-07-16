import Header from '../components/Header';
import SiteFooter from '../components/SiteFooter';
import { getLegalDoc } from '../data/legalDocs';

// 조/항 제목 라인 판별
function isHeading(line, docKey) {
  const t = line.trim();
  if (/^제\d+조/.test(t)) return true;
  if (/^제\d+장/.test(t)) return true;
  if (/^부칙/.test(t)) return true;
  // 번호형 목차(1. 2. …)를 제목으로 쓰는 문서
  if ((docKey === 'privacy' || docKey === 'payment-consent') && /^\d+\.\s/.test(t)) return true;
  return false;
}

export default function Legal({ docKey }) {
  const doc = getLegalDoc(docKey);
  const lines = doc?.body ? doc.body.split('\n') : [];

  return (
    <>
      <Header />
      <main className="min-h-screen bg-white pt-[84px]">
        <div className="mx-auto max-w-[880px] px-6 py-16">
          <h1 className="text-[30px] font-black tracking-[-0.02em] text-[#0D1B2A]">
            {doc?.title || '문서를 찾을 수 없습니다'}
          </h1>
          {doc?.effective && <p className="mt-2 text-[13px] text-slate-400">시행일: {doc.effective}</p>}

          <div className="mt-10 border-t border-slate-100 pt-8">
            {lines.length === 0 ? (
              <p className="text-[14px] text-slate-500">문서 내용을 준비 중입니다.</p>
            ) : (
              lines.map((line, i) => {
                const t = line.trim();
                if (t === '') return <div key={i} className="h-3" />;
                if (isHeading(t, docKey)) {
                  return (
                    <h2 key={i} className="mb-1 mt-8 text-[17px] font-black text-[#0D1B2A]">
                      {t}
                    </h2>
                  );
                }
                const indent = /^[·\-①-⑳]/.test(t) || /^\d+\.\s/.test(t) ? 'pl-3.5' : '';
                return (
                  <p key={i} className={`break-keep text-[14px] leading-[1.85] text-slate-600 ${indent}`}>
                    {t}
                  </p>
                );
              })
            )}
          </div>
        </div>
        <SiteFooter />
      </main>
    </>
  );
}
