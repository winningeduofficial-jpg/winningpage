// 마이페이지 "내 정보 수정" 탭 — 이번 범위는 학생 화면만이다(사용자 지시로 학부모 변형
// 3762:20390은 범위 제외). memberType prop은 받되 분기하지 않는다(팀 리더 지시).
//
// 레이아웃·필드 라벨·순서는 team-lead가 전달한 시안 PNG(profile-20170.png, 3762:20170)를
// 직접 판독해 반영했다. 정확한 여백·폰트 스케일까지 픽셀 재현하지는 않았다(러프 구현 지시).

import { ChevronRight } from "lucide-react";
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "../../lib/supabase";
import ChangeEmailModal from "./ChangeEmailModal";
import ChangePasswordModal from "./ChangePasswordModal";
import ChangePhoneModal from "./ChangePhoneModal";
import ProfileField from "./ProfileField";
import ToggleRow from "./ToggleRow";
import WithdrawModal from "./WithdrawModal";

const SCHOOL_TYPES = ["초등학교", "중학교", "고등학교", "N수생", "기타"];

// 이용안내(chevron 링크) — PNG 라벨 그대로, 라우트는 src/App.jsx에 실제 등록된 것만
// 사용(읽기로 확인). "마케팅 목적의 개인정보 수집 및 이용"/"광고성 정보 수신 동의"는 PNG상
// 별도 링크가 아니라 토글 행이라 여기 목록에는 넣지 않는다(아래 ToggleRow 2개로 별도 렌더).
//
// 학부모는 본인인증 약관 라우트가 없다 — /terms/parent/* 에 등록된 것은 service·
// privacy·marketing 3개뿐이고 identity 는 학생 전용이다(App.jsx:287-294). 없는
// 라우트를 링크하면 404 로 떨어지므로 2개만 노출한다.
const STUDENT_GUIDE_LINKS = [
  { label: "서비스 이용약관", to: "/terms/student/service" },
  { label: "개인정보처리방침", to: "/terms/student/privacy" },
  { label: "본인 인증을 위한 정보 수집 약관", to: "/terms/student/identity" },
];

const PARENT_GUIDE_LINKS = [
  { label: "서비스 이용약관", to: "/terms/parent/service" },
  { label: "개인정보처리방침", to: "/terms/parent/privacy" },
];

const ROW_BOX_CLASS =
  "flex h-[3.25rem] items-center rounded-xl border border-line px-5 text-base text-ink";

function cleanText(value) {
  return String(value || "").trim();
}

function formatLinkDate(iso: string | null | undefined) {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return `${d.getFullYear()}. ${d.getMonth() + 1}. ${d.getDate()}.`;
}

type ProfileUser = {
  id: string;
  email?: string;
};

type Profile = {
  id?: string;
  name?: string;
  email?: string;
  phone?: string;
  school_type?: string;
  school_name?: string;
};

type ParentLink = {
  id: string;
  status: string;
  date?: string | null;
};

type ProfileTabProps = {
  user: ProfileUser | null;
  profile: Profile | null;
  memberType?: string;
};

export default function ProfileTab({
  user,
  profile,
  memberType,
}: ProfileTabProps) {
  // 학부모 변형(Figma 3379:12569 외) — 이름/휴대폰/이메일/비밀번호/이용안내만 있고
  // 학교·학년, 학부모 연결, 내 연결코드가 없다. 그 셋은 전부 학생 계정의 개념이다
  // (학부모에겐 연결할 "학부모"도, 발급받을 연결코드도 없다 — 코드는 학생이 발급하고
  // 학부모가 입력한다, sql/40 issue_student_link_code).
  const isParent = memberType === "parent";
  const guideLinks = isParent ? PARENT_GUIDE_LINKS : STUDENT_GUIDE_LINKS;

  const profileId = profile?.id || user?.id;

  const [form, setForm] = useState({
    name: profile?.name || "",
    email: profile?.email || user?.email || "",
    phone: profile?.phone || "",
    school_type: profile?.school_type || "",
    school_name: profile?.school_name || "",
  });
  const [toggles, setToggles] = useState({
    marketing_agreed: false,
    ads_agreed: false,
  });
  const [errorMsg, setErrorMsg] = useState("");
  const [withdrawOpen, setWithdrawOpen] = useState(false);
  const [emailOpen, setEmailOpen] = useState(false);
  const [passwordOpen, setPasswordOpen] = useState(false);
  const [phoneOpen, setPhoneOpen] = useState(false);

  // 이름 인라인 편집(블러 시 저장) — 마지막으로 서버에 반영된 값과 비교해 불필요한 저장을 막는다.
  const [savedName, setSavedName] = useState(profile?.name || "");
  const [savingName, setSavingName] = useState(false);

  // 학교·학년 인라인 편집.
  const [editingSchool, setEditingSchool] = useState(false);
  const [schoolDraft, setSchoolDraft] = useState({
    school_type: "",
    school_name: "",
  });
  const [savingSchool, setSavingSchool] = useState(false);

  // 학부모 연동 상태 — undefined 로딩중, null 연결 없음, {id,status,date} 연결/요청 있음.
  const [parentLink, setParentLink] = useState<ParentLink | null | undefined>(
    undefined,
  );
  const [revoking, setRevoking] = useState(false);

  // 내 연결코드.
  const [linkCode, setLinkCode] = useState("");
  const [reissuing, setReissuing] = useState(false);
  const [copied, setCopied] = useState(false);

  // profile prop은 마이페이지 셸(다른 에이전트가 동시 작업 중)이 어떤 컬럼을 select 했는지에
  // 따라 형태가 달라질 수 있어, 이 탭에 필요한 컬럼(학교·수신동의 2종)을 user.id 기준으로
  // 직접 다시 읽어 보강한다. 실패해도 화면은 profile prop 값으로 그대로 동작한다.
  useEffect(() => {
    if (!profileId) return;
    let alive = true;

    (async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select(
          "name, email, phone, school_type, school_name, marketing_agreed, ads_agreed",
        )
        .eq("id", profileId)
        .maybeSingle();

      if (!alive || error || !data) return;

      setForm((prev) => ({
        ...prev,
        name: data.name ?? prev.name,
        email: data.email ?? prev.email,
        phone: data.phone ?? prev.phone,
        school_type: data.school_type ?? prev.school_type,
        school_name: data.school_name ?? prev.school_name,
      }));
      setSavedName(data.name || "");
      setToggles({
        marketing_agreed: Boolean(data.marketing_agreed),
        ads_agreed: Boolean(data.ads_agreed),
      });
    })();

    return () => {
      alive = false;
    };
  }, [profileId]);

  // 학부모 연동 상태 — 승인/대기 중 연결만 읽기 전용으로 조회한다. 주의: profiles RLS가
  // 본인 행만 select 허용해(profiles_select_own) 연결된 학부모의 이름은 클라이언트에서
  // 읽을 수 없다 — 이름을 보여주려면 서버 RPC가 하나 더 필요하다(이 작업 범위 밖, 지어내지
  // 않음). 그래서 이름 대신 일반 라벨("학부모님")로 표시한다.
  useEffect(() => {
    if (!profileId || isParent) return;
    let alive = true;

    (async () => {
      const { data, error } = await supabase
        .from("parent_child_links")
        .select("id, status, requested_at, responded_at")
        .eq("student_id", profileId)
        .in("status", ["approved", "pending"]);

      if (!alive) return;
      if (error || !data || data.length === 0) {
        setParentLink(null);
        return;
      }
      const row = data.find((r) => r.status === "approved") || data[0];
      setParentLink({
        id: row.id,
        status: row.status,
        date: row.status === "approved" ? row.responded_at : row.requested_at,
      });
    })();

    return () => {
      alive = false;
    };
  }, [profileId, isParent]);

  // 내 연결코드 — student_link_codes 활성 코드 1건(RLS: 본인 조회만 허용).
  useEffect(() => {
    if (!profileId || isParent) return;
    let alive = true;

    (async () => {
      const { data, error } = await supabase
        .from("student_link_codes")
        .select("code")
        .eq("student_id", profileId)
        .eq("is_active", true)
        .maybeSingle();

      if (!alive || error) return;
      setLinkCode(data?.code || "");
    })();

    return () => {
      alive = false;
    };
  }, [profileId, isParent]);

  function updateForm(key: keyof typeof form, value: string) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  // 공용 저장 헬퍼 — src/pages/MyPage.jsx handleSubmit의 upsert 흐름을 재사용한다.
  async function persistProfile(
    fields: Record<string, unknown>,
    { syncAuthName = false }: { syncAuthName?: boolean } = {},
  ) {
    const payload = {
      id: profileId,
      updated_at: new Date().toISOString(),
      ...fields,
    };
    const { error } = await supabase
      .from("profiles")
      .upsert(payload, { onConflict: "id" });

    if (error) {
      console.error("프로필 저장 실패:", error);
      setErrorMsg("저장에 실패했습니다. 잠시 후 다시 시도해 주세요.");
      return false;
    }

    if (syncAuthName && fields.name) {
      try {
        await supabase.auth.updateUser({
          data: { name: fields.name, full_name: fields.name },
        });
      } catch (metadataError) {
        console.error("인증 메타데이터 저장 오류:", metadataError);
      }
    }

    setErrorMsg("");
    window.dispatchEvent(new Event("winning-profile-updated"));
    return true;
  }

  // 이름 — 별도 "변경" 버튼 없이 블러 시 자동 저장(시안 실측: 이름 행에만 액션 버튼이 없음).
  async function handleNameBlur() {
    const name = cleanText(form.name);
    if (!name || name === savedName) return;

    setSavingName(true);
    const ok = await persistProfile({ name }, { syncAuthName: true });
    setSavingName(false);
    if (ok) setSavedName(name);
  }

  function startEditSchool() {
    setSchoolDraft({
      school_type: form.school_type,
      school_name: form.school_name,
    });
    setEditingSchool(true);
  }

  async function saveSchool() {
    setSavingSchool(true);
    const school_name = cleanText(schoolDraft.school_name);
    const ok = await persistProfile({
      school_type: schoolDraft.school_type,
      school_name,
    });
    setSavingSchool(false);
    if (ok) {
      updateForm("school_type", schoolDraft.school_type);
      updateForm("school_name", school_name);
      setEditingSchool(false);
    }
  }

  // 수신 동의 토글 — profiles.marketing_agreed/ads_agreed는 이미 존재하는 컬럼이라
  // (sql/00_base_schema.sql) 스키마 변경 없이 바로 저장한다. 낙관적 업데이트 후 실패 시 롤백.
  async function persistToggle(key: keyof typeof toggles, value: boolean) {
    setToggles((prev) => ({ ...prev, [key]: value }));
    const ok = await persistProfile({ [key]: value });
    if (!ok) setToggles((prev) => ({ ...prev, [key]: !value }));
  }

  // 학부모 연결 해제 — sql/40_auth_signup.sql의 revoke_parent_link RPC(본인 소유 링크만
  // revoked 처리, 실제 삭제 아님·재요청 가능)를 그대로 호출한다. 새 기능을 지어내지 않는다.
  async function handleRevokeLink() {
    if (!parentLink?.id || revoking) return;
    setRevoking(true);
    const { error } = await supabase.rpc("revoke_parent_link", {
      p_link_id: parentLink.id,
    });
    setRevoking(false);
    if (error) {
      console.error("학부모 연결 해제 실패:", error);
      setErrorMsg("연결 해제에 실패했습니다. 잠시 후 다시 시도해 주세요.");
      return;
    }
    setParentLink(null);
  }

  // 연결코드 복사 — clipboard API 는 보안 컨텍스트(https/localhost)에서만
  // 동작하므로 실패 시 조용히 넘긴다(코드 자체는 화면에 보이므로 손으로도 옮길 수 있다).
  async function handleCopyCode() {
    if (!linkCode) return;
    try {
      await navigator.clipboard.writeText(linkCode);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch (copyError) {
      console.warn("연결코드 복사 실패:", copyError);
    }
  }

  // 연결코드 재발급 — sql/40_auth_signup.sql의 reissue_link_code RPC를 그대로 호출한다.
  async function _handleReissueCode() {
    if (reissuing) return;
    setReissuing(true);
    const { data, error } = await supabase.rpc("reissue_link_code");
    setReissuing(false);
    if (error) {
      console.error("연결코드 재발급 실패:", error);
      setErrorMsg(
        "연결코드 재발급에 실패했습니다. 잠시 후 다시 시도해 주세요.",
      );
      return;
    }
    if (data?.link_code) setLinkCode(data.link_code);
  }

  const schoolSummary =
    [form.school_name, form.school_type].filter(Boolean).join(" · ") || "-";

  return (
    <div className="mx-auto w-full max-w-sm">
      {/* 학부모 연결 — 학생 전용(학부모에겐 연결할 상대가 이 축에 없다). */}
      {!isParent && (
        <div className="mb-5">
          <p className="mb-2 text-sm text-ink">학부모 연결</p>

          {parentLink ? (
            <div className="rounded-xl border border-line bg-surface-card px-4 py-3">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <span className="text-sm text-ink">학부모님</span>
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
                      parentLink.status === "approved"
                        ? "bg-surface-info text-accent"
                        : "bg-surface-footer text-ink-sub"
                    }`}
                  >
                    {parentLink.status === "approved"
                      ? "연결됨"
                      : "승인 대기중"}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={handleRevokeLink}
                  disabled={revoking}
                  className="text-xs text-ink-sub underline underline-offset-2 hover:text-ink disabled:cursor-not-allowed disabled:opacity-50"
                >
                  연결 해제
                </button>
              </div>
              {parentLink.date && (
                <p className="mt-1 text-xs text-ink-sub">
                  {formatLinkDate(parentLink.date)}{" "}
                  {parentLink.status === "approved" ? "연결" : "요청"}
                </p>
              )}
            </div>
          ) : (
            <div className="rounded-xl border border-line bg-surface-card px-4 py-3 text-sm text-ink-sub">
              연결된 학부모가 없습니다.
            </div>
          )}
        </div>
      )}

      {/* 이름 */}
      <ProfileField
        label="이름"
        value={form.name}
        onChange={(v) => updateForm("name", v)}
        onBlur={handleNameBlur}
        placeholder="이름 입력"
        readOnly={savingName}
        className="mb-5"
      />

      {/* 학교 · 학년 — 학생 전용(학부모 시안 3379:12569 에는 이 행이 없다). */}
      {!isParent && (
        <ProfileField label="학교 · 학년" className="mb-5">
          {/* 학년(숫자) 컬럼이 profiles에 없어 재학 구분(학교급)만 반영한다 — PNG의 "고1" 같은
            구체 학년은 스키마 확장이 필요하다(이 작업 범위 밖, DB 마이그레이션 금지 지시). */}
          {editingSchool ? (
            <div className="flex w-full flex-col gap-2">
              <div className="grid grid-cols-2 gap-2">
                <select
                  value={schoolDraft.school_type}
                  onChange={(e) =>
                    setSchoolDraft((prev) => ({
                      ...prev,
                      school_type: e.target.value,
                    }))
                  }
                  className="h-[3.25rem] w-full rounded-xl border border-line px-4 text-base text-ink outline-none focus:border-primary"
                >
                  <option value="">선택</option>
                  {SCHOOL_TYPES.map((item) => (
                    <option key={item} value={item}>
                      {item}
                    </option>
                  ))}
                </select>
                <input
                  type="text"
                  value={schoolDraft.school_name}
                  onChange={(e) =>
                    setSchoolDraft((prev) => ({
                      ...prev,
                      school_name: e.target.value,
                    }))
                  }
                  placeholder="학교명 입력"
                  className="h-[3.25rem] w-full rounded-xl border border-line px-4 text-base text-ink outline-none focus:border-primary"
                />
              </div>
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setEditingSchool(false)}
                  className="h-9 rounded-lg border border-line px-3 text-xs text-ink-sub"
                >
                  취소
                </button>
                <button
                  type="button"
                  onClick={saveSchool}
                  disabled={savingSchool}
                  className="h-9 rounded-lg bg-primary px-3 text-xs font-semibold text-white disabled:opacity-60"
                >
                  저장
                </button>
              </div>
            </div>
          ) : (
            <div className="flex w-full items-center gap-2">
              <div
                className={`${ROW_BOX_CLASS} flex-1 bg-surface-footer text-ink-sub`}
              >
                {schoolSummary}
              </div>
              <button
                type="button"
                onClick={startEditSchool}
                className="h-[3.25rem] shrink-0 whitespace-nowrap rounded-xl border border-line px-4 text-sm text-ink transition hover:bg-surface-card"
              >
                변경
              </button>
            </div>
          )}
        </ProfileField>
      )}

      {/* 휴대폰 번호 — 변경은 모달(카카오 인증번호) 경유, 인라인 즉시저장 아님
          (Figma 3973:15330→16090→16297→16478, ChangePhoneModal.jsx). */}
      <ProfileField
        label="휴대폰 번호"
        value={form.phone || "-"}
        readOnly
        actionLabel="변경"
        onAction={() => setPhoneOpen(true)}
        className="mb-5"
      />

      {/* 이메일 — 변경 플로우(인증 메일 등) 백엔드 미구현. */}
      <ProfileField
        label="이메일"
        value={form.email}
        readOnly
        actionLabel="변경"
        onAction={() => setEmailOpen(true)}
        className="mb-5"
      />

      {/* 비밀번호 — 변경 플로우 백엔드 미구현. */}
      <ProfileField
        label="비밀번호"
        value="***********"
        readOnly
        actionLabel="변경"
        onAction={() => setPasswordOpen(true)}
        className="mb-5"
      />

      {errorMsg && (
        <div className="mb-5 rounded-xl bg-[#FCEAEE] px-4 py-3 text-xs text-[#D6336C]">
          {errorMsg}
        </div>
      )}

      {/* 이용안내 — chevron 링크 3종 + 토글 2종, 같은 박스 목록으로 렌더. */}
      <div className="mb-5">
        <p className="mb-2 text-sm text-ink">이용안내</p>
        <div className="flex flex-col gap-2">
          {guideLinks.map((link) => (
            <Link
              key={link.to}
              to={link.to}
              className={`${ROW_BOX_CLASS} justify-between transition hover:bg-surface-card`}
            >
              <span>{link.label}</span>
              <ChevronRight size={18} className="text-ink-sub" />
            </Link>
          ))}

          <ToggleRow
            label="마케팅 목적의 개인정보 수집 및 이용"
            checked={toggles.marketing_agreed}
            onChange={(v) => persistToggle("marketing_agreed", v)}
          />
          <ToggleRow
            label="광고성 정보 수신 동의"
            checked={toggles.ads_agreed}
            onChange={(v) => persistToggle("ads_agreed", v)}
          />
        </div>
      </div>

      {/* 내 연결코드 — 학생 전용. 코드는 학생이 발급하고 학부모가 입력하는 방향이라
          (sql/40 issue_student_link_code) 학부모 화면에는 존재하지 않는다. */}
      {!isParent && (
        <div className="mb-6">
          <p className="mb-2 text-sm text-ink">내 연결코드</p>
          <div className="flex items-center gap-2">
            <div
              className={`${ROW_BOX_CLASS} flex-1 tracking-[0.2em] bg-surface-footer text-ink-sub`}
            >
              {linkCode || "-"}
            </div>
            {/* 시안(3665:5323)은 '복사'다. 재발급(reissue_link_code)은 코드를 바꿔
              버려서 학부모가 이미 받아 둔 코드를 무효로 만든다 — 학생이 코드를
              전달하려고 누르는 버튼의 동작으로는 맞지 않는다. 복사로 바꾸고
              재발급은 노출하지 않는다(필요해지면 별도 진입점으로). */}
            <button
              type="button"
              onClick={handleCopyCode}
              disabled={!linkCode}
              className="shrink-0 whitespace-nowrap text-sm font-semibold text-accent underline underline-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {copied ? "복사됨" : "복사"}
            </button>
          </div>
        </div>
      )}

      <button
        type="button"
        onClick={() => setWithdrawOpen(true)}
        className="text-sm text-ink-sub underline underline-offset-2 hover:text-ink"
      >
        회원탈퇴
      </button>

      <WithdrawModal
        open={withdrawOpen}
        onClose={() => setWithdrawOpen(false)}
      />

      <ChangeEmailModal
        open={emailOpen}
        currentEmail={form.email}
        profileId={profileId}
        onClose={() => setEmailOpen(false)}
        onChanged={(email) => {
          updateForm("email", email);
          // 헤더 등 다른 화면도 프로필을 다시 읽게 한다(persistProfile 과 같은 신호).
          window.dispatchEvent(new Event("winning-profile-updated"));
        }}
      />

      <ChangePasswordModal
        open={passwordOpen}
        email={form.email}
        onClose={() => setPasswordOpen(false)}
      />

      <ChangePhoneModal
        open={phoneOpen}
        currentPhone={form.phone}
        onClose={() => setPhoneOpen(false)}
        onChanged={(phone) => {
          updateForm("phone", phone);
          window.dispatchEvent(new Event("winning-profile-updated"));
        }}
      />
    </div>
  );
}
