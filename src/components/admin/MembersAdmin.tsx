import { Eye, EyeOff, RefreshCw, Search } from "lucide-react";
import { useEffect, useEffectEvent, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import { AdminTable } from "@/pages/admin/shared/AdminEngine";
import { searchable } from "@/pages/admin/shared/csvExport";
import { ActionButton, Select } from "@/pages/admin/shared/formFields";

// ---------------------------------------------------------------------------
// 회원 관리(members) — 목록 + 고객 상세.
//
// QA 182 의 「고객조회상담」 메인메뉴를 별도로 만들지 않고 이 화면에 통합한다
// (사용자 확정 2026-08-22). 근거 자료는 QA 140·179 에 첨부된 참조 HTML
// (「위닝에듀 Admin · 고객조회」 — 두 파일은 바이트 단위로 동일)과 기획자
// 와이어프레임 두 가지다.
//
// 탭은 최종적으로 6개다: 고객상세정보 / 이용서비스 / 결제내역 / 상담 /
// 알림톡·문자 / 서비스이용내역(활동로그). 이 파일은 그중 **앞의 세 개**만
// 구현한다 — 나머지 셋은 선행 작업이 있다:
//   · 상담          : 상담 원장 테이블이 아직 없다(수기 등록 화면).
//   · 알림톡·문자   : 발송 로그 테이블 + aligo 다중 템플릿 일반화가 먼저다
//                     (api/_lib/aligo.ts 는 인증번호 단일 템플릿 전용이고
//                      발송 이력을 남기지 않는다).
//   · 서비스이용내역: 기획자가 와이어프레임에 "어디서-누가-무슨 행동을 했는지
//                     로직이 다 정해져야 한다"고 미확정으로 남겨둔 항목이다.
// 탭 정의(TABS)에는 여섯 개를 모두 두고 미구현분은 안내만 띄운다 — 나중에
// 붙일 자리를 화면에서 먼저 보이게 해 기획자·클라이언트와 합을 맞추기 위해서다.
//
// 제네릭 CRUD 를 쓰지 않는 이유: 이 화면은 profiles 한 테이블이 아니라
// parent_child_links / program_access / orders 를 함께 읽고, 개인정보 마스킹과
// 탭 전환이 필요하다. AdminForm 은 모든 필드를 자유 편집으로 열어버려 맞지 않는다.
// 목록만 AdminTable 을 재사용한다(MentorApplicationsAdmin 과 같은 방식).
// ---------------------------------------------------------------------------

interface ProfileRow {
  id: string;
  name?: string | null;
  username?: string | null;
  email?: string | null;
  phone?: string | null;
  member_type?: string | null;
  role?: string | null;
  created_at?: string | null;
  birth_date?: string | null;
  gender?: string | null;
  school_name?: string | null;
  school_type?: string | null;
  region?: string | null;
  address?: string | null;
  address_detail?: string | null;
  landline?: string | null;
  guardian_phone?: string | null;
  memo?: string | null;
  is_active?: boolean | null;
  terms_service_agreed?: boolean | null;
  privacy_required_agreed?: boolean | null;
  privacy_optional_agreed?: boolean | null;
  marketing_agreed?: boolean | null;
  ads_agreed?: boolean | null;
  sms_agreed?: boolean | null;
  [key: string]: unknown;
}

interface LinkedPerson {
  linkId: string;
  status: string;
  profile: ProfileRow | null;
}

interface ProgramAccessRow {
  id: string;
  program_key: string;
  payment_status?: string | null;
  access_status?: string | null;
  paid_amount?: number | null;
  starts_at?: string | null;
  expires_at?: string | null;
  access_started_at?: string | null;
  access_expires_at?: string | null;
}

interface OrderRow {
  id: string;
  student_profile_id?: string | null;
  parent_profile_id?: string | null;
  status?: string | null;
  order_name?: string | null;
  amount?: number | null;
  list_amount?: number | null;
  discount_amount?: number | null;
  method?: string | null;
  paid_at?: string | null;
  created_at?: string | null;
}

interface MembersAdminProps {
  config: {
    title: string;
    searchPlaceholder: string;
    [key: string]: unknown;
  };
}

const MEMBER_TYPE_LABEL: Record<string, string> = {
  student: "학생",
  parent: "학부모",
  mentor: "멘토",
};

// 가입유형 필터 — 와이어프레임의 "전체 / 학생 / 학부모" 그대로다. mentor 는
// 별도 화면(멘토 신청 내역)이 있어 필터 칩에는 넣지 않지만, '전체'에는 나온다.
const MEMBER_TYPE_FILTERS = [
  { value: "", label: "전체" },
  { value: "student", label: "학생" },
  { value: "parent", label: "학부모" },
];

const TABS = [
  { key: "profile", label: "고객 상세 정보" },
  { key: "services", label: "이용서비스" },
  { key: "pay", label: "결제내역" },
  {
    key: "consult",
    label: "상담",
    pending: "상담 원장 테이블 도입 후 열립니다.",
  },
  {
    key: "msg",
    label: "알림톡·문자",
    pending: "알림톡 발송 로그 도입 후 열립니다.",
  },
  {
    key: "usage",
    label: "서비스이용내역",
    pending: "수집 항목·경로 확정 후 열립니다(기획 확인 대기).",
  },
] as const;

type TabKey = (typeof TABS)[number]["key"];

// 참조 HTML 의 결제 상태 문자열. orders.status CHECK 값과 1:1 이다.
const ORDER_STATUS_LABEL: Record<string, string> = {
  pending: "결제대기",
  paid: "결제완료",
  waiting_deposit: "입금대기",
  failed: "결제실패",
  canceled: "취소",
  refunded: "환불완료",
};

const ACCESS_STATUS_LABEL: Record<string, string> = {
  inactive: "미활성",
  active: "이용중",
  expired: "만료",
  suspended: "정지",
};

function formatDate(value?: string | null) {
  if (!value) return "-";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return String(value);
  return d.toLocaleDateString("ko-KR");
}

function formatDateTime(value?: string | null) {
  if (!value) return "-";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return String(value);
  return d.toLocaleString("ko-KR");
}

function formatMoney(value?: number | null) {
  if (value == null) return "-";
  return `${Number(value).toLocaleString("ko-KR")}원`;
}

// 개인정보 마스킹 — 참조 HTML 의 "🔒 개인정보 마스킹" 토글이 요구하는 표기다
// (기본 마스킹, 버튼으로 해제). 연락처는 가운데 자리를, 이메일은 로컬파트
// 뒷부분을 가린다. 표시만 가리는 것이고 조회 자체를 막지는 않는다 — 조회
// 차단은 RLS(20260822000004)가 fn_admin_can('members','view')로 한다.
function maskPhone(value?: string | null) {
  if (!value) return "-";
  const digits = String(value).replace(/[^0-9]/g, "");
  if (digits.length < 7) return "***";
  const head = digits.slice(0, 3);
  const tail = digits.slice(-4);
  return `${head}-****-${tail}`;
}

function maskEmail(value?: string | null) {
  if (!value) return "-";
  const [local, domain] = String(value).split("@");
  if (!domain || !local) return "***";
  const head = local.slice(0, Math.min(2, local.length));
  return `${head}${"*".repeat(Math.max(1, local.length - head.length))}@${domain}`;
}

export default function MembersAdmin({ config }: MembersAdminProps) {
  const [rows, setRows] = useState<ProfileRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [keyword, setKeyword] = useState("");
  const [memberType, setMemberType] = useState("");
  const [page, setPage] = useState(1);

  const [selected, setSelected] = useState<ProfileRow | null>(null);
  const [tab, setTab] = useState<TabKey>("profile");
  const [unmasked, setUnmasked] = useState(false);

  const [links, setLinks] = useState<LinkedPerson[]>([]);
  const [accesses, setAccesses] = useState<ProgramAccessRow[]>([]);
  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState("");

  async function loadRows() {
    setLoading(true);

    const { data, error } = await supabase
      .from("profiles")
      .select("*")
      .order("created_at", { ascending: false });

    setLoading(false);

    if (error) {
      console.error(error);
      alert(`${config.title} 조회 실패: ${error.message}`);
      setRows([]);
      return;
    }

    setRows((data as ProfileRow[]) || []);
  }

  const onMountLoadRows = useEffectEvent(() => {
    loadRows();
  });

  useEffect(() => {
    onMountLoadRows();
  }, []);

  const filteredRows = useMemo(() => {
    const q = keyword.trim().toLowerCase();
    return rows.filter((row) => {
      if (memberType && String(row.member_type || "") !== memberType) {
        return false;
      }
      if (!q) return true;
      return searchable(row).includes(q);
    });
  }, [rows, keyword, memberType]);

  // 상세 부수 데이터. 세 갈래(연결관계·이용권·주문)를 한 번에 받되, 하나가
  // 실패해도 나머지는 그린다 — RLS 로 막힌 테이블이 있을 때 화면 전체가
  // 빈 채로 죽으면 원인을 못 찾는다(권한 체계 도입 직후라 특히 그렇다).
  async function loadDetail(profile: ProfileRow) {
    setDetailLoading(true);
    setDetailError("");

    const isParent = String(profile.member_type || "") === "parent";

    const [linkRes, accessRes, orderRes] = await Promise.all([
      supabase
        .from("parent_child_links")
        .select("id, parent_id, student_id, status")
        .eq(isParent ? "parent_id" : "student_id", profile.id)
        .in("status", ["pending", "approved"]),
      supabase
        .from("program_access")
        .select(
          "id, program_key, payment_status, access_status, paid_amount, starts_at, expires_at, access_started_at, access_expires_at",
        )
        .eq("id", profile.id),
      // ⚠️ user_id 로 조회하면 학생 상세에서 결제내역이 항상 비어 보인다 —
      //   orders_user_id_is_parent_check(CHECK (user_id = parent_profile_id))가
      //   말하듯 **user_id 는 결제한 학부모**이고, 그 주문이 누구를 위한 것인지는
      //   student_profile_id 가 들고 있다. 두 축을 OR 로 걸어 학생 상세에서는
      //   "나를 위해 결제된 주문", 학부모 상세에서는 "내가 결제한 주문"이 나오게 한다.
      supabase
        .from("orders")
        .select(
          "id, status, order_name, amount, list_amount, discount_amount, method, paid_at, created_at, student_profile_id, parent_profile_id",
        )
        .or(
          `student_profile_id.eq.${profile.id},parent_profile_id.eq.${profile.id}`,
        )
        .order("created_at", { ascending: false }),
    ]);

    const errors = [linkRes.error, accessRes.error, orderRes.error].filter(
      Boolean,
    );
    if (errors.length > 0) {
      console.error(errors);
      setDetailError(
        errors
          .map((e) => e?.message)
          .filter(Boolean)
          .join(" / "),
      );
    }

    // 연결 상대의 프로필은 이미 받아둔 목록(rows)에서 찾는다 — 회원 전체를
    // 이미 들고 있으므로 추가 조회가 필요 없다.
    const counterpartIds = (linkRes.data || []).map((row) =>
      isParent ? row.student_id : row.parent_id,
    );
    const byId = new Map(rows.map((row) => [row.id, row]));

    setLinks(
      (linkRes.data || []).map((row, index) => ({
        linkId: row.id,
        status: row.status,
        profile: byId.get(counterpartIds[index] as string) || null,
      })),
    );
    setAccesses((accessRes.data as ProgramAccessRow[]) || []);
    setOrders((orderRes.data as OrderRow[]) || []);
    setDetailLoading(false);
  }

  function openDetail(row: ProfileRow) {
    setSelected(row);
    setTab("profile");
    setUnmasked(false);
    setLinks([]);
    setAccesses([]);
    setOrders([]);
    loadDetail(row);
  }

  function closeDetail() {
    setSelected(null);
    setDetailError("");
  }

  const phoneOf = (row?: ProfileRow | null) =>
    unmasked ? row?.phone || "-" : maskPhone(row?.phone);
  const emailOf = (row?: ProfileRow | null) =>
    unmasked ? row?.email || "-" : maskEmail(row?.email);

  // 결제 요약 3종 — 참조 HTML 의 "이번 달 결제 / 미납액 / 누적 결제액".
  // 미납액은 아직 결제가 끝나지 않은 주문(pending·waiting_deposit)의 합으로
  // 잡는다. 취소·실패·환불은 받을 돈이 아니므로 제외한다.
  const paySummary = useMemo(() => {
    const now = new Date();
    let thisMonth = 0;
    let unpaid = 0;
    let total = 0;

    for (const order of orders) {
      const amount = Number(order.amount || 0);
      if (order.status === "paid") {
        total += amount;
        const paidAt = order.paid_at ? new Date(order.paid_at) : null;
        if (
          paidAt &&
          paidAt.getFullYear() === now.getFullYear() &&
          paidAt.getMonth() === now.getMonth()
        ) {
          thisMonth += amount;
        }
      } else if (
        order.status === "pending" ||
        order.status === "waiting_deposit"
      ) {
        unpaid += amount;
      }
    }

    return { thisMonth, unpaid, total };
  }, [orders]);

  if (selected) {
    const isParent = String(selected.member_type || "") === "parent";
    const activeTab = TABS.find((t) => t.key === tab);

    return (
      <div>
        <div className="mb-4 flex items-center justify-between">
          <h1 className="text-2xl font-black text-[#111827]">
            {config.title} 상세
          </h1>
          <div className="flex items-center gap-2">
            <ActionButton
              variant="light"
              onClick={() => setUnmasked((prev) => !prev)}
            >
              {unmasked ? <EyeOff size={14} /> : <Eye size={14} />}
              {unmasked ? "개인정보 마스킹" : "마스킹 해제"}
            </ActionButton>
            <ActionButton variant="light" onClick={closeDetail}>
              목록으로
            </ActionButton>
          </div>
        </div>

        {/* 요약 헤더 — 참조 HTML 의 상단 프로필 블록 */}
        <div className="mb-4 flex flex-wrap items-center gap-x-8 gap-y-2 bg-white px-6 py-5 shadow-sm">
          <div>
            <div className="text-lg font-black">{selected.name || "-"}</div>
            <div className="text-xs font-bold text-gray-500">
              {selected.username || "-"}
            </div>
          </div>
          <div className="text-sm">
            <span className="font-black text-gray-500">유형 </span>
            {MEMBER_TYPE_LABEL[String(selected.member_type || "")] ||
              selected.member_type ||
              "-"}
          </div>
          <div className="text-sm">
            <span className="font-black text-gray-500">학교 </span>
            {selected.school_name || "-"}
          </div>
          <div className="text-sm">
            <span className="font-black text-gray-500">연락처 </span>
            {phoneOf(selected)}
          </div>
          <div className="text-sm">
            <span className="font-black text-gray-500">가입일 </span>
            {formatDate(selected.created_at)}
          </div>
        </div>

        {/* 탭 */}
        <div className="mb-4 flex flex-wrap gap-2">
          {TABS.map((item) => (
            <button
              key={item.key}
              type="button"
              onClick={() => setTab(item.key)}
              className={`h-9 border px-5 text-sm font-black transition ${
                tab === item.key
                  ? "border-[#2348ff] bg-[#2348ff] text-white"
                  : "border-gray-300 bg-white text-gray-600 hover:bg-gray-50"
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>

        {detailError && (
          <div className="mb-4 border border-[#B88737]/30 bg-[#FFF8E8] px-5 py-4 text-sm font-bold text-[#7A4A12]">
            일부 데이터를 불러오지 못했습니다 — {detailError}
          </div>
        )}

        {detailLoading ? (
          <div className="bg-white p-12 text-center text-sm font-bold text-gray-500 shadow-sm">
            데이터를 불러오는 중입니다.
          </div>
        ) : activeTab && "pending" in activeTab && activeTab.pending ? (
          <div className="bg-white p-10 shadow-sm">
            <h2 className="text-lg font-black">{activeTab.label}</h2>
            <div className="mt-4 border border-[#B88737]/30 bg-[#FFF8E8] px-5 py-4 text-sm font-bold text-[#7A4A12]">
              {activeTab.pending}
            </div>
          </div>
        ) : tab === "profile" ? (
          <ProfilePane
            profile={selected}
            isParent={isParent}
            links={links}
            unmasked={unmasked}
            phoneOf={phoneOf}
            emailOf={emailOf}
          />
        ) : tab === "services" ? (
          <ServicesPane accesses={accesses} />
        ) : (
          <PayPane
            orders={orders}
            summary={paySummary}
            viewerId={selected.id}
          />
        )}
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

          <div className="flex items-center gap-2">
            <Select value={memberType} onChange={setMemberType}>
              {MEMBER_TYPE_FILTERS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </Select>

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

// ---------------------------------------------------------------------------
// 탭 본문
// ---------------------------------------------------------------------------

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[220px_1fr] border-b border-[#edf0f4] last:border-b-0">
      <div className="bg-[#fafafa] px-5 py-3 text-sm font-black">{label}</div>
      <div className="whitespace-pre-line px-5 py-3 text-sm">{value}</div>
    </div>
  );
}

function Card({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="mb-6 bg-white shadow-sm">
      <div className="border-b border-[#edf0f4] bg-[#fafafa] px-5 py-3 text-sm font-black">
        {title}
      </div>
      {children}
    </div>
  );
}

function ProfilePane({
  profile,
  isParent,
  links,
  unmasked,
  phoneOf,
  emailOf,
}: {
  profile: ProfileRow;
  isParent: boolean;
  links: LinkedPerson[];
  unmasked: boolean;
  phoneOf: (row?: ProfileRow | null) => string;
  emailOf: (row?: ProfileRow | null) => string;
}) {
  const address = [profile.address, profile.address_detail]
    .filter(Boolean)
    .join(" ");

  return (
    <>
      <Card title="기본 정보">
        <Row
          label="회원유형"
          value={
            MEMBER_TYPE_LABEL[String(profile.member_type || "")] ||
            profile.member_type ||
            "-"
          }
        />
        <Row label="아이디" value={profile.username || "-"} />
        <Row label="이름" value={profile.name || "-"} />
        <Row label="성별" value={profile.gender || "-"} />
        <Row label="생년월일" value={profile.birth_date || "-"} />
        <Row label="가입일" value={formatDateTime(profile.created_at)} />
        <Row
          label="계정 상태"
          value={profile.is_active === false ? "비활성" : "활성"}
        />
      </Card>

      <Card title="연락처">
        <Row label="이메일" value={emailOf(profile)} />
        <Row label="휴대전화" value={phoneOf(profile)} />
        <Row
          label="유선전화"
          value={
            unmasked ? profile.landline || "-" : maskPhone(profile.landline)
          }
        />
        <Row label="주소" value={address || "-"} />
        <Row label="지역" value={profile.region || "-"} />
      </Card>

      <Card title="학교">
        <Row label="학교명" value={profile.school_name || "-"} />
        <Row label="학교구분" value={profile.school_type || "-"} />
      </Card>

      {/* 와이어프레임: 학생 상세엔 「연결 학부모」, 학부모 상세엔 「연결 학생1·2」 */}
      <Card title={isParent ? "연결 학생" : "연결 학부모"}>
        {links.length === 0 ? (
          <Row label="연결 없음" value="승인·대기 중인 연결이 없습니다." />
        ) : (
          links.map((link, index) => (
            <div key={link.linkId}>
              <Row
                label={`${isParent ? "학생" : "학부모"}${links.length > 1 ? ` ${index + 1}` : ""}`}
                value={`${link.profile?.name || "(프로필 없음)"}${
                  link.status === "pending" ? " · 승인 대기" : ""
                }`}
              />
              <Row label="이메일" value={emailOf(link.profile)} />
              <Row label="연락처" value={phoneOf(link.profile)} />
            </div>
          ))
        )}
      </Card>

      {/* 참조 HTML 의 「이용 동의 현황」 */}
      <Card title="이용 동의 현황">
        <Row
          label="서비스 이용약관"
          value={profile.terms_service_agreed ? "동의완료" : "미동의"}
        />
        <Row
          label="개인정보 수집·이용 (필수)"
          value={profile.privacy_required_agreed ? "동의완료" : "미동의"}
        />
        <Row
          label="개인정보 수집·이용 (선택)"
          value={profile.privacy_optional_agreed ? "동의완료" : "미동의"}
        />
        <Row
          label="마케팅 정보 수신"
          value={profile.marketing_agreed ? "동의완료" : "미동의"}
        />
        <Row
          label="이벤트·프로모션 안내"
          value={profile.ads_agreed ? "동의완료" : "미동의"}
        />
        <Row
          label="문자 수신"
          value={profile.sms_agreed ? "동의완료" : "미동의"}
        />
      </Card>

      <Card title="운영 메모">
        <Row label="메모" value={profile.memo || "-"} />
        <Row
          label="회원 ID"
          value={<span className="font-mono text-xs">{profile.id}</span>}
        />
      </Card>
    </>
  );
}

function ServicesPane({ accesses }: { accesses: ProgramAccessRow[] }) {
  if (accesses.length === 0) {
    return (
      <div className="bg-white p-12 text-center text-sm font-bold text-gray-500 shadow-sm">
        이용 중이거나 보유한 서비스가 없습니다.
      </div>
    );
  }

  return (
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
      {accesses.map((access) => {
        // starts_at/expires_at 이 정본이고 access_* 는 미러다(program_access
        // 컬럼 주석). 정본이 비어 있을 때만 미러를 보조로 쓴다.
        const startsAt = access.starts_at || access.access_started_at;
        const expiresAt = access.expires_at || access.access_expires_at;

        return (
          <div key={access.id} className="bg-white p-5 shadow-sm">
            <div className="flex items-center justify-between">
              <div className="text-base font-black">{access.program_key}</div>
              <span className="border border-gray-300 px-2 py-1 text-xs font-bold">
                {ACCESS_STATUS_LABEL[String(access.access_status || "")] ||
                  access.access_status ||
                  "-"}
              </span>
            </div>

            <div className="mt-3 text-sm text-gray-600">
              {startsAt || expiresAt
                ? `${formatDate(startsAt)} ~ ${expiresAt ? formatDate(expiresAt) : "무기한"}`
                : "기간 정보 없음"}
            </div>

            <div className="mt-1 text-sm text-gray-600">
              결제 {access.payment_status || "-"} ·{" "}
              {formatMoney(access.paid_amount)}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// viewerId — 지금 보고 있는 회원. 이 도메인은 **학부모가 학생의 서비스를 결제**하고
// (orders_user_id_is_parent_check: CHECK (user_id = parent_profile_id)) 그 주문이
// 누구를 위한 것인지는 student_profile_id 가 들고 있다. 그래서 같은 주문이 학부모
// 상세에도, 학생 상세에도 나온다 — 어느 쪽으로 보고 있는지를 「구분」열로 드러내지
// 않으면 "내가 결제한 것"과 "나를 위해 결제된 것"이 구별되지 않는다.
// (매출/결제 관리 와이어프레임도 같은 이유로 결제자와 이용 학생을 따로 두고 있다.)
function PayPane({
  orders,
  summary,
  viewerId,
}: {
  orders: OrderRow[];
  summary: { thisMonth: number; unpaid: number; total: number };
  viewerId: string;
}) {
  return (
    <>
      {/* 참조 HTML 의 요약 3카드 */}
      <div className="mb-4 grid gap-4 md:grid-cols-3">
        {[
          { label: "이번 달 결제", value: summary.thisMonth },
          { label: "미납액", value: summary.unpaid },
          { label: "누적 결제액", value: summary.total },
        ].map((item) => (
          <div key={item.label} className="bg-white p-5 shadow-sm">
            <div className="text-sm font-black text-gray-500">{item.label}</div>
            <div className="mt-2 text-xl font-black">
              {formatMoney(item.value)}
            </div>
          </div>
        ))}
      </div>

      <div className="overflow-x-auto bg-white shadow-sm">
        <table className="w-full min-w-[860px] text-sm">
          <thead>
            <tr className="border-b border-[#edf0f4] bg-[#fafafa] text-left">
              <th className="px-4 py-3 font-black">주문번호</th>
              <th className="px-4 py-3 font-black">승인 일시</th>
              <th className="px-4 py-3 font-black">상품</th>
              <th className="px-4 py-3 font-black">구분</th>
              <th className="px-4 py-3 font-black">결제 수단</th>
              <th className="px-4 py-3 text-right font-black">결제 금액</th>
              <th className="px-4 py-3 font-black">상태</th>
            </tr>
          </thead>
          <tbody>
            {orders.length === 0 ? (
              <tr>
                <td
                  colSpan={7}
                  className="px-4 py-12 text-center font-bold text-gray-500"
                >
                  결제 내역이 없습니다.
                </td>
              </tr>
            ) : (
              orders.map((order) => (
                <tr key={order.id} className="border-b border-[#edf0f4]">
                  <td className="px-4 py-3 font-mono text-xs">{order.id}</td>
                  <td className="px-4 py-3">
                    {formatDateTime(order.paid_at || order.created_at)}
                  </td>
                  <td className="px-4 py-3">{order.order_name || "-"}</td>
                  <td className="px-4 py-3">
                    {order.parent_profile_id === viewerId
                      ? order.student_profile_id === viewerId
                        ? "본인 결제"
                        : "결제자"
                      : "이용자"}
                  </td>
                  <td className="px-4 py-3">{order.method || "-"}</td>
                  <td className="px-4 py-3 text-right">
                    {formatMoney(order.amount)}
                  </td>
                  <td className="px-4 py-3">
                    {ORDER_STATUS_LABEL[String(order.status || "")] ||
                      order.status ||
                      "-"}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </>
  );
}
