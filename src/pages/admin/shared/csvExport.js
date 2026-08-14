export function formatValue(value, type, options) {
  if (value === null || value === undefined || value === "") return "-";

  if (Array.isArray(options)) {
    const matched = options.find(
      (option) =>
        option && typeof option === "object" && option.value === value,
    );
    if (matched) return matched.label;
  }

  if (type === "boolean") return value ? "사용" : "미사용";

  // 멘토 신청 내역 목록 전용 — 개인정보 최소 노출(팀장 지시). 상세 화면에서는 마스킹 없이
  // 원본 휴대폰번호를 그대로 보여준다.
  if (type === "maskedPhone") {
    const digits = String(value).replace(/\D/g, "");
    if (digits.length < 8) return String(value);
    return `${digits.slice(0, 3)}-****-${digits.slice(-4)}`;
  }

  if (type === "money") return `${Number(value || 0).toLocaleString()}원`;

  if (type === "date") {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return String(value);
    return date.toISOString().slice(0, 10);
  }

  if (type === "datetime") {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return String(value);
    // toISOString()은 UTC라 KST 00~09시 신청 건이 하루 전날로 잘린다 — Asia/Seoul 고정 표시.
    return date.toLocaleString("ko-KR", {
      timeZone: "Asia/Seoul",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    });
  }

  return String(value);
}

export function searchable(row) {
  return Object.values(row || {})
    .map((value) => String(value ?? ""))
    .join(" ")
    .toLowerCase();
}

export function csvEscape(value) {
  const raw = String(value ?? "");
  // CSV formula injection 방어 — Excel/Sheets는 따옴표로 감싼 필드여도
  // 선두 = + - @ 및 탭/CR을 수식으로 해석한다. 선행 작은따옴표로 무력화한다.
  const safe = /^[=+\-@\t\r]/.test(raw) ? `'${raw}` : raw;
  return `"${safe.replace(/"/g, '""')}"`;
}

export function csvHeader(columns) {
  return columns.map((column) => csvEscape(column.label)).join(",");
}

// 행 배열 → CSV 본문 줄들. 전량 로드 경로(downloadCsv)와 청크 내보내기(입결 43k행)가
// 같은 이스케이프 규칙을 쓰도록 뽑아둔 것 — 청크 쪽은 받은 행 객체를 계속 붙들지 않고
// 줄 문자열로 접어 모은다(43k행 × 30컬럼을 통째로 메모리에 쌓지 않기 위해).
export function csvBody(rows, columns) {
  // CSV는 표시용이 아니라 데이터 교환용이다 — column.options를 넘기지 마라.
  // 라벨(수시/정시)로 내보내면 Supabase 재업로드 시 category CHECK 제약을 위반한다.
  return rows
    .map((row) =>
      columns
        .map((column) => csvEscape(formatValue(row[column.key], column.type)))
        .join(","),
    )
    .join("\n");
}

// 헤더/본문 문자열을 그대로 받아 파일로 떨군다. 청크 내보내기는 본문을 여러 번에
// 나눠 만든 뒤 이어 붙여 넘기므로 rows 배열을 요구하지 않는 이 형태가 필요하다.
export function downloadCsvText(filename, header, body) {
  const blob = new Blob([`\ufeff${header}\n${body}`], {
    type: "text/csv;charset=utf-8;",
  });

  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");

  a.href = url;
  a.download = filename;
  a.click();

  URL.revokeObjectURL(url);
}

export function downloadCsv(filename, rows, columns) {
  downloadCsvText(filename, csvHeader(columns), csvBody(rows, columns));
}

export function normalizeArray(value) {
  if (Array.isArray(value)) return value;
  if (!value) return [];

  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return value ? [value] : [];
    }
  }

  return [];
}

export function getFileNameFromUrl(value) {
  if (!value) return "첨부파일";

  try {
    const raw = typeof value === "string" ? value : value.url;
    const pathname = new URL(raw).pathname;
    return decodeURIComponent(pathname.split("/").pop() || "첨부파일");
  } catch {
    return "첨부파일";
  }
}

export function formatListValue(value, type) {
  const list = normalizeArray(value);
  if (list.length === 0) return "-";
  if (type === "imageList") return `이미지 ${list.length}개`;
  if (type === "fileList") return `첨부파일 ${list.length}개`;
  return `${list.length}개`;
}

export function truncateText(value, maxLength = 10) {
  if (value === null || value === undefined || value === "") return "-";
  const flat = String(value).replace(/\r?\n/g, " ");
  const chars = Array.from(flat);
  if (chars.length <= maxLength) return flat;
  return `${chars.slice(0, maxLength).join("")}…`;
}
