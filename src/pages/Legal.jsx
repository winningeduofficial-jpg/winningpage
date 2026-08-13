import { getLegalDoc } from "../data/legalDocs";

// 조/항 제목 라인 판별
function isHeading(line, docKey) {
  const t = line.trim();
  if (/^제\d+조/.test(t)) return true;
  if (/^제\d+장/.test(t)) return true;
  if (/^부칙/.test(t)) return true;
  // 번호형 목차(1. 2. …)를 제목으로 쓰는 문서
  if (
    (docKey === "privacy" || docKey === "payment-consent") &&
    /^\d+\.\s/.test(t)
  )
    return true;
  return false;
}

export default function Legal({ docKey }) {
  const doc = getLegalDoc(docKey);
  const lines = doc?.body ? doc.body.split("\n") : [];

  return (
    <>
      <main className="min-h-screen bg-white pt-16">
        <div className="mx-auto w-full max-w-content px-5 py-16 sm:px-8">
          <h1 className="text-[30px] font-black tracking-[-0.02em] text-ink-strong">
            {doc?.title || "문서를 찾을 수 없습니다"}
          </h1>
          {doc?.effective && (
            <p className="mt-2 text-[13px] text-ink-sub">
              시행일: {doc.effective}
            </p>
          )}

          <div className="mt-10 border-t border-line pt-8">
            {lines.length === 0 ? (
              <p className="text-[14px] text-ink-sub">
                문서 내용을 준비 중입니다.
              </p>
            ) : (
              lines.map((line, i) => {
                const t = line.trim();
                if (t === "") return <div key={i} className="h-3" />;
                if (isHeading(t, docKey)) {
                  return (
                    <h2
                      key={i}
                      className="mb-1 mt-8 text-[17px] font-black text-ink-strong"
                    >
                      {t}
                    </h2>
                  );
                }
                const indent =
                  /^[·\-①-⑳]/.test(t) || /^\d+\.\s/.test(t) ? "pl-3.5" : "";
                return (
                  <p
                    key={i}
                    className={`break-keep text-[14px] leading-[1.85] text-ink ${indent}`}
                  >
                    {t}
                  </p>
                );
              })
            )}
          </div>
        </div>
      </main>
    </>
  );
}
