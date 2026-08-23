import { ExternalLink, RefreshCw, Search } from "lucide-react";
import { useEffect, useEffectEvent, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import { AdminTable } from "@/pages/admin/shared/AdminEngine";
import { getFreshSupabaseAccessTokenOrSignOut } from "@/pages/admin/shared/adminSession";
import { normalizeArray, searchable } from "@/pages/admin/shared/csvExport";
import {
  ActionButton,
  Field,
  MENTOR_APPLICATION_STATUS_OPTIONS,
  Select,
} from "@/pages/admin/shared/formFields";

// ---------------------------------------------------------------------------
// 멘토 신청 내역(mentorApplications) — CONFIGS.mentorApplications 참고.
// 목록만 AdminTable을 재사용하고, 상세/상태변경/증빙파일 열람은 이 파일 안에서 전부
// bespoke로 그린다(제네릭 AdminForm은 필드를 전부 자유 편집 가능하게 만들어 이 화면의
// "상태만 변경 가능, 나머지는 읽기전용" 요구와 맞지 않는다).
// ---------------------------------------------------------------------------

// mentor_applications row. AdminTable(AdminEngine.tsx, 미변환 영역)이 소유하는
// 제네릭 목록 데이터라 구체 타입이 없다 — 이 파일이 실제로 읽고 쓰는 키만 얕게 좁힌다.
interface MentorApplicationRow {
  id: string;
  status?: string;
  // 승인 시 붙는 멘토 계정. 비어 있으면 아직 승인 전이다
  // (20260823000003_mentor_account_link 의 컬럼 주석 참고).
  user_id?: string | null;
  proof_file_path?: string;
  proof_file_name?: string;
  created_at?: string;
  updated_at?: string;
  [key: string]: unknown;
}

// 섹션 구분은 sql/52_mentor_applications.sql 컬럼 주석의 1~5절 순서를 그대로 따른다.
//   array: true       → text[] 컬럼(normalizeArray로 콤마 나열)
//   boolean: true     → boolean 컬럼('동의'/'미동의')
//   type: 'datetime'  → timestamptz 컬럼(formatDateTime)
//   proof: true        → proof_file_name(사용자 입력 원본 파일명) 전용 — 아래 렌더에서 이스케이프됨
interface MentorApplicationDetailField {
  key: string;
  label: string;
  array?: boolean;
  boolean?: boolean;
  type?: "datetime";
  proof?: boolean;
}

interface MentorApplicationDetailSection {
  title: string;
  fields: MentorApplicationDetailField[];
}

const MENTOR_APPLICATION_DETAIL_SECTIONS: MentorApplicationDetailSection[] = [
  {
    title: "1. 지원자 정보",
    fields: [
      { key: "name", label: "이름" },
      { key: "birth_date", label: "생년월일" },
      { key: "phone", label: "휴대폰" },
      { key: "email", label: "이메일" },
      { key: "residence_region", label: "거주지역" },
    ],
  },
  {
    title: "2. 대학 및 합격 전형",
    fields: [
      { key: "university", label: "대학교" },
      { key: "major", label: "학과·학부" },
      { key: "admission_year", label: "입학년도" },
      { key: "enrollment_status", label: "재학상태" },
      { key: "admission_history", label: "입시이력" },
      { key: "final_admission_track", label: "최종전형" },
      { key: "exam_results", label: "입시 성적" },
    ],
  },
  {
    title: "3. 출신 고등학교",
    fields: [
      { key: "highschool_region", label: "고교 지역" },
      { key: "highschool_name", label: "고교명" },
      { key: "highschool_type", label: "고교 유형" },
      { key: "gpa_average", label: "내신 평균" },
      { key: "csat_summary", label: "수능 요약" },
    ],
  },
  {
    title: "4. 멘토 역량",
    fields: [
      { key: "consult_fields", label: "상담 가능 분야", array: true },
      { key: "strongest_field_reason", label: "가장 자신있는 분야 이유" },
      { key: "consult_grades", label: "상담 가능 학년", array: true },
      { key: "weekly_capacity", label: "주당 가능 횟수" },
      { key: "available_timeslot", label: "가능 시간대" },
      { key: "motivation", label: "지원 동기" },
      { key: "strengths", label: "강점" },
      { key: "ineffective_method", label: "비효율적 지도 경험" },
      { key: "situation_answer", label: "상황 대응" },
      { key: "tutoring_experience", label: "과외 경험" },
    ],
  },
  {
    title: "5. 증빙 및 동의",
    fields: [
      { key: "proof_file_name", label: "증빙 파일명", proof: true },
      { key: "phone_verified_at", label: "휴대폰 인증 시각", type: "datetime" },
      { key: "request_ip", label: "제출 IP" },
      { key: "agree_terms", label: "이용약관 동의", boolean: true },
      { key: "agree_privacy", label: "개인정보 수집 동의", boolean: true },
      { key: "agree_identity", label: "본인인증 동의", boolean: true },
      { key: "agree_marketing", label: "마케팅 수신 동의", boolean: true },
      { key: "agree_ad", label: "광고성 정보 수신 동의", boolean: true },
    ],
  },
];

// 상태 'active'(활동중) = 합격이다. 여기서 멘토 계정이 생기고 로그인용 임시코드가
// 메일로 나간다 — 그건 service_role 이 필요해 브라우저에서 못 하므로 서버 라우트로
// 넘긴다(api/admin/approve-mentor). 나머지 상태 전이는 지금처럼
// mentor_applications.status 를 직접 고치면 된다.
const APPROVED_STATUS = "active";

// 🔴 멘토 온보딩 전체가 보류 상태다 (2026-08-23).
//
//   기획이 아직 확정되지 않았다. 2026-08-24(월) 전체회의에서 (1) 이 경로대로
//   갈지 (2) 멘토 쪽 개발을 지금 진행할지를 다시 확인한 뒤 켠다.
//   특히 **멘토 로그인 진입점**(회원 로그인 화면에 칸을 따로 둘지)이 미정이다.
//
//   ⚠️ 켜기 전까지 이 화면은 예전처럼 mentor_applications.status 만 바꾼다.
//     켜져 있으면 「활동중」으로 저장하는 순간 **지원자에게 실제로 메일이 나가고
//     계정이 만들어진다** — 관리자가 모르고 상태를 바꿨다가 되돌릴 수 없는 일이
//     벌어지므로 기본값은 false 다.
//
//   켤 때 같이 켜야 하는 것:
//     - api/admin/approve-mentor.ts 의 MENTOR_APPROVAL_ENABLED
//   확인해야 하는 것:
//     - Supabase 대시보드의 Magic Link 템플릿이 `{{ .Token }}`(숫자 코드)인지.
//       링크 방식이면 멘토가 받는 게 코드가 아니라 링크가 된다.
const MENTOR_APPROVAL_ENABLED = false;

function formatDateTime(value: unknown): string {
  if (!value) return "-";
  const date = new Date(value as string | number | Date);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleString("ko-KR");
}

function renderMentorApplicationDetailValue(
  app: MentorApplicationRow,
  field: MentorApplicationDetailField,
): string {
  const value = app[field.key];

  if (field.array) {
    const list = normalizeArray(value);
    return list.length > 0 ? list.join(", ") : "-";
  }

  if (field.boolean) return value ? "동의" : "미동의";

  if (field.type === "datetime") return formatDateTime(value);

  if (field.proof) {
    // proof_file_name은 지원자가 올린 원본 파일명 — 사용자 입력이다. React의 기본 텍스트
    // 렌더링(자동 이스케이프)만 쓴다. dangerouslySetInnerHTML은 절대 쓰지 않는다.
    return (value as string) || (app.proof_file_path ? "(파일명 없음)" : "-");
  }

  if (value === null || value === undefined || value === "") return "-";
  return String(value);
}

interface MentorApplicationsAdminProps {
  config: {
    title: string;
    searchPlaceholder?: string;
    [key: string]: unknown;
  };
}

export default function MentorApplicationsAdmin({
  config,
}: MentorApplicationsAdminProps) {
  const [rows, setRows] = useState<MentorApplicationRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [keyword, setKeyword] = useState("");
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<MentorApplicationRow | null>(null); // 상세로 연 행. null이면 목록.
  const [statusDraft, setStatusDraft] = useState("");
  const [savingStatus, setSavingStatus] = useState(false);

  async function loadRows() {
    setLoading(true);

    const { data, error } = await supabase
      .from("mentor_applications")
      .select("*")
      .order("created_at", { ascending: false });

    setLoading(false);

    if (error) {
      console.error(error);
      alert(`${config.title} 조회 실패: ${error.message}`);
      setRows([]);
      return;
    }

    setRows((data as MentorApplicationRow[]) || []);
  }

  const onMountLoadRows = useEffectEvent(() => {
    loadRows();
  });

  useEffect(() => {
    onMountLoadRows();
  }, []);

  const filteredRows = useMemo(() => {
    const q = keyword.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((row) => searchable(row).includes(q));
  }, [rows, keyword]);

  function openDetail(row: MentorApplicationRow) {
    setSelected(row);
    setStatusDraft(row.status || "submitted");
  }

  function closeDetail() {
    setSelected(null);
    setStatusDraft("");
  }

  async function postApprove(resend: boolean) {
    const accessToken = await getFreshSupabaseAccessTokenOrSignOut();

    const response = await fetch("/api/admin/approve-mentor", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({ applicationId: selected?.id, resend }),
    });

    const result = await response.json().catch(async () => {
      const text = await response.text().catch(() => "");
      return { detail: text || `HTTP ${response.status}` };
    });

    if (!response.ok) {
      throw new Error(result?.detail || `HTTP ${response.status}`);
    }

    return result;
  }

  async function saveStatus() {
    if (!selected || savingStatus) return;

    if (statusDraft === selected.status) {
      alert("변경된 상태가 없습니다.");
      return;
    }

    // 되돌리기 어려운 결정이라 한 번 되묻는다 — 계정이 만들어지고 지원자에게
    // 메일이 나가므로, 목록에서 잘못 누른 걸 조용히 통과시키면 안 된다.
    if (
      MENTOR_APPROVAL_ENABLED &&
      statusDraft === APPROVED_STATUS &&
      !selected.user_id
    ) {
      if (
        !window.confirm(
          `${String(selected.name || "이 지원자")}님을 멘토로 승인합니다.\n\n멘토 계정이 만들어지고, 로그인용 임시코드가 지원서의 이메일로 발송됩니다.\n계속하시겠습니까?`,
        )
      ) {
        return;
      }
    }

    setSavingStatus(true);

    try {
      if (MENTOR_APPROVAL_ENABLED && statusDraft === APPROVED_STATUS) {
        const result = await postApprove(false);
        const nextSelected = {
          ...selected,
          status: APPROVED_STATUS,
          user_id: result.profileId as string,
        };
        setSelected(nextSelected);
        setRows((prev) =>
          prev.map((row) => (row.id === selected.id ? nextSelected : row)),
        );
        // 승인은 됐는데 메일만 실패할 수 있다(서버가 승인을 되돌리지 않는다).
        // 그 경우 detail 에 사유가 실려 오므로 그대로 보여주고 재발송을 유도한다.
        alert(
          result.emailed
            ? "멘토로 승인했습니다. 로그인용 임시코드를 메일로 보냈습니다."
            : `${result.detail || "임시코드 발송에 실패했습니다."}\n\n아래 '임시코드 재발송'으로 다시 시도할 수 있습니다.`,
        );
        return;
      }

      const { error } = await supabase
        .from("mentor_applications")
        .update({ status: statusDraft })
        .eq("id", selected.id);

      if (error) throw new Error(error.message);

      const nextSelected = { ...selected, status: statusDraft };
      setSelected(nextSelected);
      setRows((prev) =>
        prev.map((row) => (row.id === selected.id ? nextSelected : row)),
      );
      alert("상태를 변경했습니다.");
    } catch (error) {
      alert(`상태 변경 실패: ${(error as Error).message}`);
    } finally {
      setSavingStatus(false);
    }
  }

  // 임시코드는 대시보드의 Email OTP Expiration 대로 만료된다. 승인 직후 받은
  // 코드를 며칠 뒤에 쓰려는 멘토에게는 재발송이 필요하다.
  async function resendLoginCode() {
    if (!selected || savingStatus) return;

    setSavingStatus(true);
    try {
      await postApprove(true);
      alert("임시코드를 다시 보냈습니다.");
    } catch (error) {
      alert(`임시코드 재발송 실패: ${(error as Error).message}`);
    } finally {
      setSavingStatus(false);
    }
  }

  // 비공개 버킷(mentor-applications)이라 getPublicUrl은 쓸 수 없다 — Admin.jsx의 기존
  // getPublicUrl 관용구(IMAGE_BUCKET/banners 버킷 대상, 이 파일의 다른 곳)와는 다른 경로다.
  // createSignedUrl로 단기 서명 URL을 받아 새 탭으로 연다. TTL 60초 — 어드민이 클릭 즉시
  // 여는 일회성 열람이고, 증빙 파일에 개인정보(성적표 등)가 담겨 있어 길게 잡을 이유가 없다.
  async function openProofFile() {
    if (!selected?.proof_file_path) {
      alert("첨부된 증빙 파일이 없습니다.");
      return;
    }

    const { data, error } = await supabase.storage
      .from("mentor-applications")
      .createSignedUrl(selected.proof_file_path, 60);

    if (error || !data?.signedUrl) {
      alert(
        `증빙 파일 열람 실패: ${error?.message || "서명 URL을 가져오지 못했습니다."}`,
      );
      return;
    }

    window.open(data.signedUrl, "_blank", "noopener,noreferrer");
  }

  if (selected) {
    return (
      <div>
        <div className="mb-4 flex items-center justify-between">
          <h1 className="text-2xl font-black text-[#111827]">
            {config.title} 상세
          </h1>
          <ActionButton variant="light" onClick={closeDetail}>
            목록으로
          </ActionButton>
        </div>

        <div className="mb-6 flex flex-wrap items-end gap-3 bg-white p-6 shadow-sm">
          <Field label="상태">
            <Select value={statusDraft} onChange={setStatusDraft}>
              {MENTOR_APPLICATION_STATUS_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </Select>
          </Field>

          <ActionButton onClick={saveStatus} disabled={savingStatus}>
            {savingStatus ? "저장 중..." : "상태 저장"}
          </ActionButton>

          <ActionButton variant="light" onClick={openProofFile}>
            <ExternalLink size={14} />
            증빙 파일 열람
          </ActionButton>

          {/* 승인이 끝난 지원서에만 뜬다 — user_id 가 곧 "멘토 계정이 있다"는 뜻이다.
              멘토 온보딩이 보류라 지금은 아무에게도 보이지 않는다(위 플래그 주석). */}
          {MENTOR_APPROVAL_ENABLED && selected.user_id && (
            <ActionButton
              variant="light"
              onClick={resendLoginCode}
              disabled={savingStatus}
            >
              임시코드 재발송
            </ActionButton>
          )}
        </div>

        {MENTOR_APPLICATION_DETAIL_SECTIONS.map((section) => (
          <div key={section.title} className="mb-6 bg-white shadow-sm">
            <div className="border-b border-[#edf0f4] bg-[#fafafa] px-5 py-3 text-sm font-black">
              {section.title}
            </div>

            {section.fields.map((field) => (
              <div
                key={field.key}
                className="grid grid-cols-[220px_1fr] border-b border-[#edf0f4] last:border-b-0"
              >
                <div className="bg-[#fafafa] px-5 py-3 text-sm font-black">
                  {field.label}
                </div>
                <div className="whitespace-pre-line px-5 py-3 text-sm">
                  {renderMentorApplicationDetailValue(selected, field)}
                </div>
              </div>
            ))}
          </div>
        ))}

        <div className="mb-6 bg-white shadow-sm">
          <div className="border-b border-[#edf0f4] bg-[#fafafa] px-5 py-3 text-sm font-black">
            제출 메타
          </div>

          <div className="grid grid-cols-[220px_1fr] border-b border-[#edf0f4]">
            <div className="bg-[#fafafa] px-5 py-3 text-sm font-black">
              제출일
            </div>
            <div className="px-5 py-3 text-sm">
              {formatDateTime(selected.created_at)}
            </div>
          </div>

          <div className="grid grid-cols-[220px_1fr] border-b border-[#edf0f4]">
            <div className="bg-[#fafafa] px-5 py-3 text-sm font-black">
              수정일
            </div>
            <div className="px-5 py-3 text-sm">
              {formatDateTime(selected.updated_at)}
            </div>
          </div>

          <div className="grid grid-cols-[220px_1fr]">
            <div className="bg-[#fafafa] px-5 py-3 text-sm font-black">
              신청 ID
            </div>
            <div className="px-5 py-3 font-mono text-xs">{selected.id}</div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="mb-6 bg-white px-6 py-5 shadow-sm">
        <div className="flex items-center justify-between gap-4">
          <button
            type="button"
            onClick={loadRows}
            className="inline-flex h-9 items-center gap-2 border border-gray-500 bg-white px-4 text-sm font-bold"
          >
            <RefreshCw size={14} />
            초기화
          </button>

          <div className="flex items-center">
            <input
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
              placeholder={config.searchPlaceholder}
              className="h-9 w-[320px] border border-gray-400 px-3 text-sm outline-hidden"
            />
            <button
              type="button"
              className="inline-flex h-9 items-center gap-1 border border-l-0 border-gray-500 bg-white px-4 text-sm font-bold"
            >
              <Search size={14} />
              검색
            </button>
          </div>
        </div>

        <h1 className="mt-4 text-xl font-black">{config.title}</h1>
      </div>

      {loading ? (
        <div className="bg-white p-12 text-center text-sm font-bold text-gray-500 shadow-sm">
          데이터를 불러오는 중입니다.
        </div>
      ) : (
        <AdminTable
          config={config}
          rows={filteredRows}
          page={page}
          setPage={setPage}
          onEdit={openDetail}
          onDelete={() => {}}
        />
      )}
    </div>
  );
}
