import { useTermsDoc } from "@/hooks/useTermsDocs";
import { withDedupedKeys } from "@/lib/reactKeys";

// 열람용 법적 문서(/terms·/privacy·/refund·/payment-* 등, 카드사·PG 심사 URL) —
// 본문은 public.terms(code) 단일 원본. 하드코딩 사본 없음.

// DB effective_from('YYYY-MM-DD')을 화면 표기('YYYY.MM.DD')로.
function formatEffective(dateStr: string) {
  return dateStr.replaceAll("-", ".");
}

// 번호형 목차(1. 2. …)를 제목으로 쓰는 문서
const NUMBERED_HEADING_CODES = new Set([
  "privacy_policy",
  "payment_consent",
  "service_consent",
  "privacy_additional",
]);

// 조/항 제목 라인 판별
function isHeading(line: string, code: string) {
  const t = line.trim();
  if (/^제\d+조/.test(t)) return true;
  if (/^제\d+장/.test(t)) return true;
  if (/^부칙/.test(t)) return true;
  if (NUMBERED_HEADING_CODES.has(code) && /^\d+\.\s/.test(t)) return true;
  // 서비스별 이용 동의서의 절 제목(Ⅰ. Ⅱ. …)
  if (code === "service_consent" && /^[ⅠⅡⅢⅣⅤ]\.\s/.test(t)) return true;
  return false;
}

type LegalProps = {
  code: string;
};

export default function Legal({ code }: LegalProps) {
  const { doc, loading, error } = useTermsDoc(code);
  const lines: string[] = doc ? doc.content.split("\n") : [];

  return (
    <main className="min-h-screen bg-white pt-16">
      <div className="mx-auto w-full max-w-content px-5 py-16 sm:px-8">
        <h1 className="text-[30px] font-black tracking-[-0.02em] text-ink-strong">
          {doc?.title ?? ""}
        </h1>
        {doc && (
          <p className="mt-2 text-[13px] text-ink-sub">
            시행일: {formatEffective(doc.effectiveFrom)}
          </p>
        )}

        <div className="mt-10 border-t border-line pt-8">
          {error ? (
            <p className="text-[14px] text-ink-sub">{error}</p>
          ) : loading || !doc ? (
            <p className="text-[14px] text-ink-sub">문서를 불러오는 중…</p>
          ) : (
            withDedupedKeys(lines).map(({ item: line, key }) => {
              const t = line.trim();
              if (t === "") return <div key={key} className="h-3" />;
              if (isHeading(t, code)) {
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
