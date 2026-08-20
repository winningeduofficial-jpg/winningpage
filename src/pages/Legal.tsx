import { getLegalDoc } from "@/data/legalDocs";
import { useServiceTerms } from "@/hooks/useServiceTerms";
import { withDedupedKeys } from "@/lib/reactKeys";

// DB effective_from('YYYY-MM-DD')을 기존 legalDocs.ts 표기(§'YYYY.MM.DD')와 맞춘다.
function formatEffective(dateStr: string) {
  return dateStr.replaceAll("-", ".");
}

// 조/항 제목 라인 판별
function isHeading(line: string, docKey?: string) {
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

type LegalProps = {
  docKey?: string;
};

export default function Legal({ docKey }: LegalProps) {
  const isServiceTerms = docKey === "terms";
  const {
    terms: dbTerms,
    loading: dbLoading,
    error: dbError,
  } = useServiceTerms();
  // 훅은 unconditional하게 호출하되(Rules of Hooks), 결과는 docKey==='terms'일
  // 때만 쓴다 — 나머지 문서(privacy 등)는 기존 legalDocs.ts 경로를 그대로 유지.
  const staticDoc = isServiceTerms ? null : getLegalDoc(docKey);

  const title = isServiceTerms
    ? dbTerms?.title || "위닝에듀 서비스 이용약관"
    : staticDoc?.title || "문서를 찾을 수 없습니다";
  const effective = isServiceTerms
    ? dbTerms
      ? formatEffective(dbTerms.effectiveFrom)
      : null
    : staticDoc?.effective;
  const body = isServiceTerms ? dbTerms?.content : staticDoc?.body;
  const lines: string[] = body ? body.split("\n") : [];

  return (
    <main className="min-h-screen bg-white pt-16">
      <div className="mx-auto w-full max-w-content px-5 py-16 sm:px-8">
        <h1 className="text-[30px] font-black tracking-[-0.02em] text-ink-strong">
          {title}
        </h1>
        {effective && (
          <p className="mt-2 text-[13px] text-ink-sub">시행일: {effective}</p>
        )}

        <div className="mt-10 border-t border-line pt-8">
          {isServiceTerms && dbError ? (
            <p className="text-[14px] text-ink-sub">{dbError}</p>
          ) : isServiceTerms && dbLoading ? (
            <p className="text-[14px] text-ink-sub">문서를 불러오는 중…</p>
          ) : lines.length === 0 ? (
            <p className="text-[14px] text-ink-sub">
              문서 내용을 준비 중입니다.
            </p>
          ) : (
            withDedupedKeys(lines).map(({ item: line, key }) => {
              const t = line.trim();
              if (t === "") return <div key={key} className="h-3" />;
              if (isHeading(t, docKey)) {
                return (
                  <h2
                    key={key}
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
                  key={key}
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
  );
}
