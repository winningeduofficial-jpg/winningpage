import { useState } from "react";
import AdmissionModalShell from "@/components/admission/modal/AdmissionModalShell";
import AdmissionModalStyles from "@/components/admission/modal/AdmissionModalStyles";

type MetaFieldType = "text" | "number" | "textarea" | "select" | "radioBoolean";

interface MetaFieldDef {
  key: string;
  label: string;
  type: MetaFieldType;
  required?: boolean;
  options?: string[];
}

type MetaFieldValue = string | number | boolean;
type MetaForm = Record<string, MetaFieldValue>;

// admission_posts(대학모집요강) 행. select('*') 이후 이 모달이 실제로
// 읽는 필드만 좁혀서 적는다 — 저장 자체는 호출부(Admin.jsx, 범위 밖)가 한다.
export interface AdmissionMetaRow {
  university_name?: string;
  [key: string]: unknown;
}

// 대학모집요강 목록 '관리' 열의 메타 전용 경량 편집 모달.
//
// 배경: 목록 행 전체 폼(✏️)은 config.hideRowEdit(b744659)으로 이 메뉴에서
// 숨겨졌다 — 카테고리 6칸이 각각 [수정] 1클릭으로 편집 다이얼로그를 여는
// 구조가 되면서 행 전체 폼이 중복 진입점이 됐기 때문이다. 그런데 그 결과
// 메타 필드(대학명·지역 등)는 엑셀 왕복 외엔 고칠 방법이 없어졌다.
//
// 사용자 지시(2026-08-08): "아직도 '수정'이 너무 복잡해보여서. 메타만
// 수정하는거로 하자. HWP 원문 붙여넣기 파싱은 필요없어." — 그래서 이
// 모달은 의도적으로 좁다. 표 편집기도, HWP 파싱 패널도 없다. 카테고리
// 콘텐츠(전형방법 등 6종)는 여전히 목록 6칸의 [수정]이 담당한다.
//
// 껍데기는 공용 AdmissionModalShell을 그대로 재사용한다(새 모달 구조를
// 또 만들지 않는다 — AdmissionSectionEditModal.jsx와 같은 패턴).
// bodyClassName은 명시적으로 넘긴다: AdmissionModalShell의 기본값
// (PUBLIC_BODY_CLASS)은 'admission-modal-body'를 포함해 공개 전용
// 가로 스크롤바 숨김 규칙을 물려받는다(src/pages/AdmissionGuidelines.modalShell.test.tsx
// 의 lock:no-admission-modal-body-in-admin이 이 클래스명을 락으로 막는다).
//
// 저장 경로: Admin.jsx의 saveAdmissionMeta가 config.rowToForm/formToPayload를
// 그대로 통해 기존 행 저장 경로(saveRow와 같은 supabase update)를 재사용한다.
// 이 모달은 폼 값(9필드)만 만들어 올릴 뿐 저장 자체는 모른다 — *_json/*_html
// 컬럼을 건드리지 않는 보장은 호출부(Admin.jsx) 쪽 책임이다.
const ADMISSION_META_FIELDS: MetaFieldDef[] = [
  { key: "university_name", label: "대학명", type: "text", required: true },
  { key: "matched_hwp_name", label: "원문 대학명", type: "text" },
  { key: "university_key", label: "대학 키값", type: "text", required: true },
  { key: "region", label: "지역", type: "text", required: true },
  { key: "admission_year", label: "입학연도", type: "number", required: true },
  // URL 2종은 반드시 붙여 놓는다 — 역할이 다른데 dev 218행 중 209행이 값까지
  // 같아서, 떨어뜨려 두면 관리자가 어느 쪽을 고치는지 착각한다.
  //   official_source_url  = 공개 목록에서 **대학명**을 눌렀을 때 가는 곳
  //   jungsi_guideline_url = 공개 목록 **'정시모집요강' 셀 [보기]** 가 가는 곳
  // required 를 주지 않는다: 미등록·자리표시자('-') 행이 실제로 존재하고,
  // 필수화하면 그 행들의 저장이 통째로 막힌다. 공개 측은 http(s) 절대 URL이
  // 아니면 링크를 걸지 않고 평문으로 떨어뜨리므로 빈 값이 화면을 깨지 않는다.
  { key: "official_source_url", label: "대학명 링크 URL", type: "text" },
  { key: "jungsi_guideline_url", label: "정시모집요강 URL", type: "text" },
  { key: "memo", label: "메모", type: "textarea" },
  {
    key: "is_active",
    label: "노출 여부",
    type: "radioBoolean",
    required: true,
  },
  {
    key: "detail_status",
    label: "상태",
    type: "select",
    options: ["상세입력완료", "재가공필요", "HWP상세페이지미확인"],
  },
];

const BODY_CLASS =
  "admission-meta-edit-modal-body flex-1 overflow-auto bg-white px-6 py-5 md:px-10";
const FOOTER_CLASS = "border-t border-[#e5e7eb] bg-white px-6 py-4 md:px-10";

function MetaFieldInput({
  field,
  value,
  onChange,
  labelId,
}: {
  field: MetaFieldDef;
  value: MetaFieldValue | undefined;
  onChange: (key: string, value: MetaFieldValue) => void;
  labelId: string;
}) {
  const base =
    "h-9 w-full border border-[#9ca3af] bg-white px-3 text-sm outline-none";

  if (field.type === "textarea") {
    return (
      <textarea
        aria-labelledby={labelId}
        value={(value as string | number | undefined) ?? ""}
        onChange={(e) => onChange(field.key, e.target.value)}
        rows={4}
        className="w-full resize-y border border-[#9ca3af] bg-white px-3 py-2 text-sm outline-none"
      />
    );
  }

  if (field.type === "select") {
    return (
      <select
        aria-labelledby={labelId}
        value={(value as string | number | undefined) ?? ""}
        onChange={(e) => onChange(field.key, e.target.value)}
        className={base}
      >
        <option value="">선택</option>
        {(field.options || []).map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>
    );
  }

  if (field.type === "radioBoolean") {
    return (
      // biome-ignore lint/a11y/useSemanticElements: fieldset은 브라우저 기본 border/padding/margin이 있어 리셋 없이 바꾸면 시각 회귀가 생긴다. role="group" + aria-labelledby로 이미 접근성 요건은 충족한다.
      <div
        role="group"
        aria-labelledby={labelId}
        className="flex items-center gap-6"
      >
        <label className="inline-flex items-center gap-2 text-sm font-bold">
          <input
            type="radio"
            checked={value === true}
            onChange={() => onChange(field.key, true)}
          />
          노출
        </label>
        <label className="inline-flex items-center gap-2 text-sm font-bold">
          <input
            type="radio"
            checked={value === false}
            onChange={() => onChange(field.key, false)}
          />
          비노출
        </label>
      </div>
    );
  }

  return (
    <input
      aria-labelledby={labelId}
      type={field.type === "number" ? "number" : "text"}
      value={(value as string | number | undefined) ?? ""}
      onChange={(e) => {
        const next =
          field.type === "number"
            ? Number(e.target.value || 0)
            : e.target.value;
        onChange(field.key, next);
      }}
      className={base}
    />
  );
}

function buildInitialForm(row: AdmissionMetaRow | null | undefined): MetaForm {
  const form: MetaForm = {};
  ADMISSION_META_FIELDS.forEach((field) => {
    if (field.type === "radioBoolean") {
      form[field.key] = (row?.[field.key] as MetaFieldValue) ?? true;
      return;
    }
    form[field.key] = (row?.[field.key] as MetaFieldValue) ?? "";
  });
  return form;
}

// onSave(form): async — 저장 성공 시 true(또는 truthy)를 반환해야 dirty가
// 풀리고 사용자에게 재확인 없이 닫을 수 있다. 실패 시 false/undefined를
// 반환하면 폼을 그대로 열어둔다(입력값 유실 방지).
export default function AdmissionMetaEditModal({
  row,
  onClose,
  onSave,
}: {
  row: AdmissionMetaRow | null | undefined;
  onClose: () => void;
  onSave: (form: MetaForm) => Promise<boolean | undefined>;
}) {
  const [form, setForm] = useState(() => buildInitialForm(row));
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);

  function change(key: string, value: MetaFieldValue) {
    setDirty(true);
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  // 기존 편집 모달(AdmissionSectionEditModal의 origin==='list' 경로 →
  // AdminForm.handleCancel)과 같은 규칙: dirty면 confirm, 아니면 바로 닫는다.
  function handleClose() {
    if (
      dirty &&
      !window.confirm("저장하지 않은 변경사항이 있습니다. 나가시겠습니까?")
    )
      return;
    onClose();
  }

  async function handleSave() {
    for (const field of ADMISSION_META_FIELDS) {
      if (!field.required) continue;
      if (String(form[field.key] ?? "").trim() === "") {
        alert(`${field.label} 항목을 입력해주세요.`);
        return;
      }
    }
    setSaving(true);
    const ok = await onSave(form);
    setSaving(false);
    if (ok) setDirty(false);
  }

  return (
    <>
      {/* 이 모달은 목록('list' 모드)에서 직접 열린다 — AdminForm을 거치지
          않으므로 그쪽이 렌더하는 <AdmissionModalStyles/>가 로드돼 있지
          않다. 여기서 직접 렌더해야 .admission-modal-sheet 등 껍데기
          CSS(라운드·그림자·헤드 보더)가 붙는다(AdmissionSectionEditModal.jsx
          와 같은 자기완결 패턴). */}
      <AdmissionModalStyles />
      <AdmissionModalShell
        open
        onClose={handleClose}
        idPrefix="admission-meta-edit-modal"
        bodyClassName={BODY_CLASS}
        footerClassName={FOOTER_CLASS}
        eyebrow={row?.university_name || "(대학명 없음)"}
        title="메타 정보 수정"
        footer={
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={handleClose}
              className="h-10 rounded-xl bg-[#4b5563] px-5 text-sm font-black text-white transition hover:bg-[#374151]"
            >
              취소
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={saving}
              className="h-10 rounded-xl bg-[#2348ff] px-6 text-sm font-black text-white transition hover:bg-[#1b39cc] disabled:opacity-50"
            >
              {saving ? "저장 중…" : "저장"}
            </button>
          </div>
        }
      >
        <div className="flex flex-col gap-4">
          {ADMISSION_META_FIELDS.map((field) => (
            <div key={field.key}>
              {/* radioBoolean은 라디오 2개짜리 그룹이라 label htmlFor를 단일 컨트롤에
                  못 매단다 — aria-labelledby로 필드 타입 상관없이 통일한다. */}
              <span
                id={`admission-meta-field-label-${field.key}`}
                className="mb-1 block text-sm font-black text-[#111827]"
              >
                {field.label}
                {field.required && <span className="ml-1 text-red-500">*</span>}
              </span>
              <MetaFieldInput
                field={field}
                value={form[field.key]}
                onChange={change}
                labelId={`admission-meta-field-label-${field.key}`}
              />
            </div>
          ))}
        </div>
      </AdmissionModalShell>
    </>
  );
}
