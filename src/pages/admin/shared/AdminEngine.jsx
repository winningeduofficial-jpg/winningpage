import {
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  Edit3,
  Eye,
  Settings,
  Trash2,
  UploadCloud,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import AdmissionSurface from "../../../components/admission/AdmissionSurface";
import AdmissionSectionEditModal from "../../../components/admission/editor/AdmissionSectionEditModal";
import DocBlocksEditor from "../../../components/admission/editor/DocBlocksEditor";
import BlockEditor from "../../../components/editor/BlockEditor";
import ColumnPreviewModal from "../../../components/editor/ColumnPreviewModal";
import {
  HWP_SECTION_JSON_KEYS,
  validateAdmissionDoc,
} from "../../../lib/admissionDoc";
import {
  clean as cleanAdmissionText,
  HWP_SECTION_HTML_KEYS,
  HWP_SECTION_LABELS,
  renderDocToHtml,
} from "../../../lib/admissionParsing";
import { blocksToPlainText } from "../../../lib/blockToPlainText";
import { plainTextToBlocks } from "../../../lib/plainTextToBlocks";
import { withDedupedKeys } from "../../../lib/reactKeys";
import { supabase } from "../../../lib/supabase";
import { reportAdminError } from "./adminErrors";
import {
  formatListValue,
  formatValue,
  getFileNameFromUrl,
  normalizeArray,
  truncateText,
} from "./csvExport";

// Admin.jsx 3단계(렌더러 레지스트리 도입) 추출분 — AdminTable/AdminForm(35개
// CONFIGS 항목이 공유하는 제네릭 목록·폼 엔진)과 그 전용 헬퍼들이다.
// PremiumBookAdmin/MentorApplicationsAdmin/GoalStudentsAdmin 등 custom:true
// 도메인 컴포넌트도 이 둘을 그대로 재사용한다(각자 파일에서 import).
// Admin.jsx가 이 파일을 import 하므로 역방향 import는 만들지 않는다 — 순환 참조 방지.

export const PAGE_SIZE = 10;

function AdminInput({ field, value, onChange, disabled }) {
  const base =
    "h-9 w-full border border-[#9ca3af] bg-white px-3 text-sm outline-none disabled:bg-gray-100";
  // field.readOnly: 폼 전체 disabled와 별개로 "이 필드 하나만" 편집 불가로
  // 만든다(예: *_html 미러 — doc이 정본이고 이 필드는 자동 생성값이라
  // 직접 고치면 안 됨). HTML readOnly 속성은 disabled와 달리 값 선택·복사는
  // 허용한다 — 미러 값을 참고용으로 보되 못 고치게 하는 목적에 더 맞는다.
  const readOnly = Boolean(field.readOnly);

  if (field.type === "textarea") {
    return (
      <textarea
        value={value || ""}
        onChange={(e) => onChange(field.key, e.target.value)}
        disabled={disabled}
        readOnly={readOnly}
        rows={field.rows || 5}
        className={`w-full resize-y border border-[#9ca3af] px-3 py-2 font-mono text-xs leading-5 outline-none disabled:bg-gray-100 ${readOnly ? "bg-gray-50 text-gray-500" : "bg-white"}`}
      />
    );
  }

  if (field.type === "select") {
    return (
      <select
        value={value || ""}
        onChange={(e) => onChange(field.key, e.target.value)}
        disabled={disabled}
        className={base}
      >
        <option value="">선택</option>
        {(field.options || []).map((option) => {
          const optionValue =
            typeof option === "object" && option !== null
              ? option.value
              : option;
          const optionLabel =
            typeof option === "object" && option !== null
              ? option.label
              : option;
          return (
            <option key={optionValue} value={optionValue}>
              {optionLabel}
            </option>
          );
        })}
      </select>
    );
  }

  if (field.type === "checkbox") {
    return (
      <label className="inline-flex items-center gap-2 text-sm font-bold">
        <input
          type="checkbox"
          checked={!!value}
          onChange={(e) => onChange(field.key, e.target.checked)}
          disabled={disabled}
        />
        사용
      </label>
    );
  }

  if (field.type === "radioBoolean") {
    return (
      <div className="flex items-center gap-6">
        <label className="inline-flex items-center gap-2 text-sm font-bold">
          <input
            type="radio"
            checked={value === true}
            onChange={() => onChange(field.key, true)}
            disabled={disabled}
          />
          사용
        </label>

        <label className="inline-flex items-center gap-2 text-sm font-bold">
          <input
            type="radio"
            checked={value === false}
            onChange={() => onChange(field.key, false)}
            disabled={disabled}
          />
          미사용
        </label>
      </div>
    );
  }

  return (
    <input
      type={
        field.type === "number"
          ? "number"
          : field.type === "date"
            ? "date"
            : "text"
      }
      value={value ?? ""}
      onChange={(e) => {
        // field.nullable: 숫자 입력을 비우면 0이 아니라 null을 보낸다. 기본값을
        // 0으로 두면 "미공개"와 "값이 0"이 구분되지 않아 공개면이 경쟁률
        // 0.00 : 1, 모집인원 0명을 정상값처럼 렌더한다. 선언한 필드에만 적용되므로
        // sort_order 같은 NOT NULL 숫자 컬럼은 기존 동작(빈 값 → 0) 그대로다.
        const next =
          field.type === "number"
            ? e.target.value === "" && field.nullable
              ? null
              : Number(e.target.value || 0)
            : e.target.value;
        onChange(field.key, next);
      }}
      disabled={disabled}
      readOnly={readOnly}
      // placeholder/min/max/step: 선언한 필드에만 붙는다. 값이 undefined면
      // React가 속성 자체를 DOM에 렌더하지 않으므로, 이 네 키를 선언하지 않은
      // 기존 필드는 마크업이 바이트 단위로 동일하다.
      //
      // 🔴 min/max는 "브라우저 힌트"가 아니라 실제로 submit을 막는다
      //   (rangeUnderflow/rangeOverflow → form.checkValidity() false → onSubmit
      //    자체가 발화하지 않아 config.validate가 호출조차 되지 않는다).
      //   그래서 min을 선언하는 필드는 step도 함께 선언해야 한다 — HTML 사양상
      //   number 입력의 step base는 min 속성이 있으면 min, 없으면 value
      //   콘텐트 속성이다. 기본 step은 1이므로 min만 붙이는 순간 소수값이
      //   전부 stepMismatch로 막힌다(실측: <input type=number min=1 value="2.35">
      //   → stepMismatch true, "가장 근접한 유효 값 2개는 2 및 3입니다").
      //   min/max/step을 선언하지 않은 기존 필드는 step base가 value라
      //   소수 입력이 지금까지 통과해 왔다 — 그래서 이 결함은 min을 처음
      //   선언한 필드(목표관리 대학 컷 avg_cut)에서만 터졌다.
      //   step='any'를 함께 주면 stepMismatch는 사라지고 min/max 범위 방어는
      //   그대로 남는다(실측: step=any + max=9 에 12 → rangeOverflow true).
      placeholder={field.placeholder}
      min={field.min}
      max={field.max}
      step={field.step}
      className={`${base} ${readOnly ? "bg-gray-50 text-gray-500" : ""}`}
    />
  );
}

// admissionGuidelines 전용 필드 렌더러(type:'admissionDoc'). field.key는
// jsonKey(예: selection_method_json), field.sectionKey는 SectionKey(예:
// 'selection_method')다. DocBlocksEditor(문서 블록 배열 편집기)를 감싸고,
// 편집 즉시 병행 저장 계약(doc·html 동시 갱신)을 지킨다 — doc이 바뀔 때마다
// renderDocToHtml로 htmlKey 미러도 같은 자리에서 다시 만든다. 이렇게
// 해야 doc만 고치고 html이 낡는 사고(2026-08-06에 실제로 있었던 결함,
// 27b397e에서 "파싱 실행" 경로는 고쳤지만 편집기 경로는 이번에 처음
// 배선된다)가 편집기에서도 재발하지 않는다.
function AdmissionDocFieldEditor({ field, form, onPatch, onDirty }) {
  const sectionKey = field.sectionKey;
  const htmlKey = HWP_SECTION_HTML_KEYS[sectionKey];
  const existing = form[field.key];
  const doc =
    existing && typeof existing === "object" && Array.isArray(existing.blocks)
      ? existing
      : {
          v: 1,
          section: sectionKey,
          source: "manual",
          generator: "admin-editor",
          generatedAt: new Date().toISOString(),
          blocks: [],
        };

  function handleBlocksChange(nextBlocks) {
    const nextDoc = {
      ...doc,
      blocks: nextBlocks,
      source: "manual",
      generatedAt: new Date().toISOString(),
    };
    const nextPatch = { [field.key]: nextDoc };
    // doc(정본)은 형태와 무관하게 항상 patch에 실린다 — 편집 중 일시적으로
    // 불변식을 어기는 상태(예: 열 개수 변경 중간 단계)도 그대로 저장 시도
    // 대상이 된다(저장 게이트는 formToPayload가 validateAdmissionDoc으로
    // 별도로 막는다). html 미러는 doc이 유효할 때만, 그리고 renderDocToHtml
    // 예외에 대비해 try/catch로 감싸 만든다 — 이 렌더러가 일부 variant에서
    // 방어적이지 않고(예: renderSelectionTable이 row 길이를 검증 없이
    // row[3]로 접근) 예상 밖 형태에 예외를 던지는 걸 직접 재현 확인했다.
    // 실패해도 doc은 정상 저장되고 html 미러 갱신만 건너뛴다(직전 값 유지) —
    // 페이지 전체가 죽는 것보다 훨씬 안전하다.
    // ⚠ renderDocToHtml이 total 함수(어떤 유효 doc에도 안 던지도록,
    // phase0 담당)가 된 뒤에도 이 try/catch는 지우지 마라 — 심층 방어다.
    // DocBlocksEditor의 섹션별 블록 추가 제한(같은 커밋)이 "흔치 않은
    // 조합"을 1차로 막아주지만, 그 제한을 우회하는 경로(예: xlsx
    // 가져오기로 다른 섹션 doc을 억지로 붙여넣는 경우)까지 커버하는 건
    // 이 try/catch뿐이다.
    if (htmlKey) {
      if (validateAdmissionDoc(nextDoc).ok) {
        try {
          nextPatch[htmlKey] = renderDocToHtml(nextDoc, sectionKey);
        } catch (err) {
          console.error(
            "renderDocToHtml 실패 — html 미러 갱신을 건너뜁니다(doc은 정상 저장됩니다):",
            err,
          );
        }
      }
    }
    onDirty();
    onPatch(nextPatch);
  }

  return (
    <DocBlocksEditor
      section={sectionKey}
      blocks={doc.blocks}
      onChange={handleBlocksChange}
      universityName={form.university_name}
      sectionLabel={HWP_SECTION_LABELS[sectionKey]}
    />
  );
}

// URL 마지막 세그먼트를 파일명으로 추출 (쿼리스트링 제거 + decodeURIComponent로 한글 파일명 대비)
function fileNameFromUrl(url) {
  if (!url) return "";
  try {
    const withoutQuery = String(url).split("?")[0].split("#")[0];
    const segments = withoutQuery.split("/").filter(Boolean);
    const last = segments[segments.length - 1] || "";
    return decodeURIComponent(last);
  } catch {
    return String(url);
  }
}

// 2026-08-06 사용자 지적("어드민이 너무 무겁다", 폼 높이 9,873px = 화면
// 11.4개, input 502개) — 근본 원인은 위계가 아니라 구조였다: 6개 카테고리
// (raw+문서+html 미러 3필드씩 18필드)를 한 폼에 전부 펼쳐 동시 렌더했다.
// 카테고리를 묶어 한 번에 하나만 마운트한다 — CSS로 숨기는 게 아니라
// (display:none) 열지 않은 카테고리의 field row 자체를 렌더 트리에서 뺀다 —
// React가 그 서브트리를 만들지 않으므로 DOM 노드·리렌더 비용이 실제로 준다.
// field.group이 없는 필드(admissionGuidelines 외 모든 config)는 항상 그대로
// 렌더돼 다른 화면은 영향 없다.
// 2026-08-07 이후 "여는 장치"는 아코디언이 아니라 편집 다이얼로그다:
// buildFieldRenderItems는 group 필드를 아예 items에 안 넣고(헤더만 남긴다),
// 실제 field는 modalSection === field.group일 때 모달 본문이 마운트한다.
// 동시 마운트 최대 1개라는 불변식은 그대로다.

// 카테고리 헤더에 보여줄 한 줄 요약. doc이 있으면 표/블록 개수, 없으면
// 원문 유무만 판정한다 — 관리자가 어느 카테고리를 열지 판단하는 용도라
// 정확한 렌더 결과 예측까지는 필요 없다(그건 펼쳐서 문서 편집기로 본다).
function summarizeHwpSection(sectionKey, form) {
  const jsonKey = HWP_SECTION_JSON_KEYS[sectionKey];
  const doc = jsonKey ? form[jsonKey] : null;
  const blocks = doc && Array.isArray(doc.blocks) ? doc.blocks : [];
  if (!blocks.length) {
    return cleanAdmissionText(form[sectionKey])
      ? "원문 있음(문서 미생성)"
      : "내용 없음";
  }
  const tableBlocks = blocks.filter((block) => block.kind === "table");
  const parts = [];
  if (tableBlocks.length) {
    const first = tableBlocks[0];
    const cols = Array.isArray(first.columns) ? first.columns.length : 0;
    const rowCount = Array.isArray(first.rows) ? first.rows.length : 0;
    parts.push(`표 ${tableBlocks.length}개 · ${cols}열 ${rowCount}행`);
  }
  const otherCount = blocks.length - tableBlocks.length;
  if (otherCount > 0) parts.push(`블록 ${otherCount}개`);
  return parts.join(" · ") || `블록 ${blocks.length}개`;
}

// fields를 순서 그대로 훑으며 field.group이 있는 항목은 그룹당 헤더 1개로
// 묶는다. group이 없는 필드는 항상 그대로 통과.
//
// 2026-08-07: 카테고리 필드를 폼 안에서 인라인으로 펼치지 않는다. 펼침 대상이
// 아코디언에서 편집 다이얼로그로 바뀌었기 때문이다(사용자 지시 "서비스 모달
// 구조를 그대로"). 위 주석의 원래 목적 — 접힌 카테고리의 서브트리를 아예
// 만들지 않아 폼 높이 9,873px / input 502개를 3,744px / 14개로 줄인 것 — 은
// 그대로 유지된다: 카테고리 필드는 이제 폼이 아니라 모달이 마운트하고,
// 모달은 한 번에 최대 1개만 열린다(modalSection이 단일 값).
function buildFieldRenderItems(fields, form) {
  const items = [];
  const seenGroups = new Set();
  fields.forEach((field) => {
    if (!field.group) {
      items.push({ type: "field", field });
      return;
    }
    if (!seenGroups.has(field.group)) {
      seenGroups.add(field.group);
      items.push({
        type: "header",
        groupKey: field.group,
        label: HWP_SECTION_LABELS[field.group] || field.group,
        summary: summarizeHwpSection(field.group, form),
      });
    }
  });
  return items;
}

// 구 CategoryAccordionHeader. 같은 자리·같은 모양이지만 여는 대상이 인라인
// 펼침이 아니라 편집 다이얼로그다 — ▸ 회전 표시 대신 "수정" 어포던스를 둔다
// (목록 셀의 [수정]과 같은 동작, 같은 모달).
function CategorySectionButton({ item, onOpen }) {
  return (
    <button
      type="button"
      onClick={onOpen}
      className="flex w-full items-center justify-between gap-3 border-b border-[#edf0f4] bg-[#fafafa] px-5 py-3 text-left transition hover:bg-[#f3f4f6]"
    >
      <span className="text-sm font-black">{item.label}</span>
      <span className="flex items-center gap-3">
        <span className="text-xs font-bold text-gray-500">{item.summary}</span>
        <span className="rounded border border-[#c7d2fe] bg-[#eef2ff] px-2.5 py-1 text-xs font-black text-[#2348ff]">
          수정
        </span>
      </span>
    </button>
  );
}

// 카테고리(field.group) 필드 1개의 편집 UI. 아코디언이 폼 안에서 렌더하던
// 것을 **재타이핑 없이** 그대로 떼어 온 것 — 편집 다이얼로그 본문이 이걸
// 쓴다. 문서 편집기(admissionDoc)만 그린다: 원문(raw)·HTML 미러(둘 다
// field.type === 'textarea', group만 admissionDoc과 공유)는 사용자 지시
// (2026-08-10) "원문(raw) 보기/편집, HTML 미러 보기 이 두가지도 dialog에서
// 없애줘. 불필요해" 에 따라 렌더를 뺐다.
//
// ⚠ 필드 자체(config.fields의 raw/html 항목)는 지우지 않았다 — rowToForm이
// row 전체를 스프레드해 form 상태에 그대로 실리고, formToPayload도 form을
// 스프레드해 그대로 되돌려 보낸다(AdminForm.rowToForm/formToPayload,
// :1198/:1207 부근). 여기서 렌더만 껐을 뿐 form[field.key]는 사용자가
// 다이얼로그에서 손대지 않은 값 그대로 저장 왕복한다 — raw는 엑셀 대량
// 업로드의 "업로드 raw == DB raw면 무변경" 판정 기준이고, html은 롤백
// 수단·레거시 임포터 입력원이라 컬럼 자체를 없애면 안 된다.
// 220px 라벨 열을 쓰지 않는 것도 원본 그대로다: 카테고리명은 이미 모달
// 제목에 있어 필드 라벨을 반복할 이유가 없다.
function AdmissionGroupField({
  field,
  form,
  readonly: _readonly,
  onChange: _onChange,
  onPatch,
  onDirty,
}) {
  if (field.type !== "admissionDoc") return null;
  return (
    <div
      // admission-surface: 표 표면 스타일을 공개 모달과 공유(AdmissionSurface.jsx
      // 참고) — minimum_requirements/exam_schedule 폭 규칙이 걸리게 한다.
      // 좌우 px-5는 모달 본문이 이미 px-6/md:px-12를 갖고 있어 뺐다.
      className="admission-surface border-b border-[#edf0f4] py-4"
      data-section={field.group}
    >
      <AdmissionDocFieldEditor
        field={field}
        form={form}
        onPatch={onPatch}
        onDirty={onDirty}
      />
    </div>
  );
}

export function AdminForm({
  config,
  mode,
  row,
  onCancel,
  onSave,
  onUpload,
  origin = "form",
  initialSection = null,
  // createDefaults: 다른 탭에서 "이 값으로 새 행을 만들어라"며 넘겨 온 1회성
  // 프리필. Admin()의 pendingCreateDefaults가 유일한 공급자다. 넘기지 않으면
  // undefined라 아래 spread가 {}가 되어 기존 동작과 완전히 동일하다.
  createDefaults = null,
}) {
  const [form, setForm] = useState(() => {
    if (row) return config.rowToForm ? config.rowToForm(row) : { ...row };
    return { ...(config.defaults || {}), ...(createDefaults || {}) };
  });
  const [dirty, setDirty] = useState(false);
  // 열려 있는 카테고리 편집 다이얼로그의 섹션 키(field.group 있는 config,
  // 현재는 admissionGuidelines 뿐). null이면 닫힘 — 한 번에 최대 1개.
  //
  // 모드 A(origin === 'list'): 목록 셀 [수정]으로 들어오면 initialSection이
  //   실려 와 마운트 즉시 모달이 열린다. 폼은 오버레이 뒤에서 저장 엔진으로만
  //   산다 — 사용자에게는 "목록 → 다이얼로그" 1뎁스로 보인다(공개와 동일).
  // 모드 B(origin === 'form'): 기존 ✏️ 경로. 폼 화면의 카테고리 버튼으로 연다.
  const [modalSection, setModalSection] = useState(initialSection);
  // 모달 푸터 [저장]이 실제 <form>의 submit을 발화시키기 위한 ref.
  // requestSubmit()은 click() 우회와 달리 onSubmit 핸들러와 HTML 검증을
  // 정상적으로 태운다 — 저장 경로가 폼 하단 [저장]과 완전히 동일해진다.
  const formRef = useRef(null);
  // blockEditor는 uncontrolled라 값 변화를 form에 반영하지 않는다 — ref는 key당 1개만 유지.
  const editorRefs = useRef(new Map());
  // 미리보기는 "미리보기" 버튼을 눌렀을 때 getBlocks()를 1회 호출한 스냅샷이다.
  // null이면 닫힘 — 라이브 갱신 없음, 에디터로 되돌아가는 데이터 경로 없음.
  const [previewPost, setPreviewPost] = useState(null);
  const blockEditorField = (config.fields || []).find(
    (field) => field.type === "blockEditor",
  );

  function getEditorRef(key) {
    if (!editorRefs.current.has(key))
      editorRefs.current.set(key, { current: null });
    return editorRefs.current.get(key);
  }

  function openPreview() {
    if (!blockEditorField) return;
    const editorRef = editorRefs.current.get(blockEditorField.key);
    const blocks = editorRef?.current ? editorRef.current.getBlocks() : [];

    setPreviewPost({
      title: form[config.previewTitleKey ?? "title"],
      category: form.category,
      image_urls: form.image_urls,
      image_url: form.image_url,
      content_json: { blocks },
      content: blocksToPlainText(blocks),
    });
  }

  const readonly = config.readOnly;

  // 편집 중 이탈 시 작업 유실을 막기 위한 최소 가드. 정확도보다 "경고가 뜨는 것" 자체가 핵심이라
  // 편집 여부 판정은 단순하게(필드 변경 또는 에디터 영역 입력 감지) 둔다.
  useEffect(() => {
    if (!dirty) return undefined;
    function handleBeforeUnload(e) {
      e.preventDefault();
      e.returnValue = "";
    }
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [dirty]);

  function handleCancel() {
    if (
      dirty &&
      !window.confirm("저장하지 않은 변경사항이 있습니다. 나가시겠습니까?")
    )
      return;
    onCancel();
  }

  // 모달 닫기(푸터 버튼 / X / ESC / 오버레이 공통). 두 모드의 유일한 차이가
  // 여기다.
  //   모드 A: 모달 닫기 = 폼 이탈이므로 기존 handleCancel을 그대로 호출한다
  //          (dirty면 기존 confirm이 뜨고, 확인하면 목록으로 복귀).
  //          새 confirm을 만들지 않는다 — 경고는 한 벌이어야 한다.
  //   모드 B: 폼 화면으로 복귀할 뿐이라 아무것도 유실되지 않는다. 편집 상태는
  //          모달이 아니라 이 AdminForm의 form state가 들고 있고 모달은 그
  //          창일 뿐이다. 여기에 "변경 유실 경고"를 붙이면 거짓말이므로 붙이지
  //          않는다(대신 모달 헤드의 '● 저장 안 됨' 뱃지와 푸터 안내문).
  function closeSectionModal() {
    if (origin === "list") {
      handleCancel();
      return;
    }
    setModalSection(null);
  }

  function change(key, value) {
    setDirty(true);
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function patch(values) {
    setDirty(true);
    setForm((prev) => ({ ...prev, ...values }));
  }

  async function uploadMultiple(fileList, field) {
    const files = Array.from(fileList || []);
    if (files.length === 0) return;

    const uploaded = await onUpload(files, field);
    if (!uploaded || uploaded.length === 0) return;

    if (field.type === "multiImage") {
      const current = normalizeArray(form[field.key]);
      change(field.key, [...current, ...uploaded.map((item) => item.url)]);
      return;
    }

    if (field.type === "multiFile") {
      const current = normalizeArray(form[field.key]);
      change(field.key, [
        ...current,
        ...uploaded.map((item) => ({
          name: item.name,
          url: item.url,
          size: item.size,
          type: item.type,
        })),
      ]);
    }
  }

  function removeListItem(key, index) {
    const current = normalizeArray(form[key]);
    change(
      key,
      current.filter((_, i) => i !== index),
    );
  }

  function submit(e) {
    e.preventDefault();

    if (readonly) {
      onCancel();
      return;
    }

    for (const field of config.fields || []) {
      if (!field.required) continue;

      // uncontrolled 에디터는 form[key]가 애초에 채워지지 않으므로 ref로 별도 판정한다.
      if (field.type === "blockEditor") {
        const editorRef = editorRefs.current.get(field.key);
        if (!editorRef?.current || editorRef.current.isEmpty()) {
          alert(`${field.label} 항목을 입력해주세요.`);
          return;
        }
        continue;
      }

      if (String(form[field.key] ?? "").trim() === "") {
        alert(`${field.label} 항목을 입력해주세요.`);
        return;
      }
    }

    if (config.validate) {
      const error = config.validate(form, row);
      if (error) {
        alert(error);
        return;
      }
    }

    let merged = form;
    const blockEditorFields = (config.fields || []).filter(
      (field) => field.type === "blockEditor",
    );
    if (blockEditorFields.length > 0) {
      merged = { ...form };
      for (const field of blockEditorFields) {
        const editorRef = editorRefs.current.get(field.key);
        merged[`__blocks_${field.key}`] = editorRef?.current
          ? editorRef.current.getBlocks()
          : [];
      }
    }

    setDirty(false);
    onSave(merged);
  }

  // 모달 본문에 넣을 카테고리 필드 3개(문서 json / 원문 raw / html 미러).
  const groupFields = (config.fields || []).filter(
    (field) => field.group === modalSection,
  );

  return (
    // 모달을 <form>의 **형제**로 둔다. 편집 input이 <form> 안에 있으면 셀에서
    // Enter를 치는 순간 폼이 암묵 제출되는데(기존 결함), 모달에서는 그게
    // "의도치 않은 저장 → setMode('list') → 모달 소멸"로 악화된다. 모달 입력은
    // 전부 controlled React state라 <form> 밖에 있어도 form/patch에 아무 영향이
    // 없다 — 부작용으로 기존 Enter-제출 결함이 모달 경로에서 사라진다.
    //
    // 아래 <form> 본문은 들여쓰기를 그대로 뒀다. 한 단계 더 들여쓰면 380줄이
    // 통째로 diff에 잡혀 실제 변경(래핑 + 모달 추가)이 묻힌다.
    <>
      <form ref={formRef} onSubmit={submit}>
        <h1 className="mb-5 text-2xl font-black text-[#111827]">
          {config.title}{" "}
          {mode === "create" ? "등록" : readonly ? "상세" : "수정"}
        </h1>

        {config.homepage && (
          <p className="mb-4 rounded border border-red-100 bg-red-50 px-4 py-3 text-sm font-bold text-red-600">
            이 메뉴에서 저장한 내용은 실제 홈페이지에 반영됩니다.
          </p>
        )}

        {config.guideText && (
          <p className="mb-4 rounded border border-red-200 bg-red-50 px-4 py-3 text-sm font-black leading-6 text-red-600">
            {config.guideText}
          </p>
        )}

        {/* 2단계(2026-08-06): 표 표면 스타일을 공개 모달과 공유 — field.group이
          있는 config(현재 admissionGuidelines뿐)에서만 렌더한다. showSectionTitle/
          showChangeNoColumn 둘 다 어드민 전용 값 — 절 제목 노출, 전년도와 차이점
          번호 컬럼 노출(구 죽은 Admin.jsx 스타일을 AdmissionSurface.jsx가 되살림).
          공개 모달은 자기 자신의 <AdmissionSurface />(기본값 false/false)를 따로
          렌더하므로(별개 라우트, 동시 마운트 안 됨) 여기서 true로 켜도 공개로 새지
          않는다. */}
        {(config.fields || []).some((field) => field.group) && (
          <AdmissionSurface showSectionTitle showChangeNoColumn />
        )}

        <div className="flex flex-col gap-6 xl:flex-row xl:items-start">
          <div className="min-w-0 flex-1 bg-white shadow">
            {buildFieldRenderItems(
              (config.fields || config.columns).filter(
                (field) => !field.showIf || field.showIf(form),
              ),
              form,
            ).map((item) => {
              if (item.type === "header") {
                return (
                  <CategorySectionButton
                    key={`group-header-${item.groupKey}`}
                    item={item}
                    onOpen={() => setModalSection(item.groupKey)}
                  />
                );
              }
              // field.resolve(form, row): 같은 폼의 다른 필드 값에 따라 이 필드의
              // 표시 속성(label/help/placeholder/min/max/readOnly)만 부분 덮어쓴다.
              // 목표관리 대학 컷의 avg_cut이 cut_type에 따라 단위·범위가 통째로
              // 달라지는 요구 때문에 들어왔다(명세 §3-D4 ①). key/type은 덮지 않는
              // 것이 계약이다 — 덮으면 form 상태의 키가 어긋난다.
              // resolve를 선언하지 않은 config는 item.field를 그대로 쓰므로 기존
              // 탭들의 렌더 경로가 바뀌지 않는다(저장소 전체 field.resolve 선언 0건).
              //
              // ⚠ 적용 범위 계약: **이 폼 본문 루프뿐이다.** 카테고리 편집 모달의
              //   groupFields(config.fields.filter(f => f.group === modalSection))는
              //   resolve를 거치지 않고 원본 field를 그대로 렌더한다. 지금은
              //   resolve를 쓰는 config(goalUniversityCuts)에 group 필드가 없어
              //   실효가 없지만, group과 resolve를 함께 쓰려면 그쪽에도 같은
              //   변환을 태워야 한다.
              const field = item.field.resolve
                ? { ...item.field, ...item.field.resolve(form, row) }
                : item.field;

              return (
                <div
                  key={field.key}
                  className="grid grid-cols-[220px_1fr] border-b border-[#edf0f4]"
                >
                  <div className="bg-[#fafafa] px-5 py-3 text-sm font-black">
                    {field.label}
                    {field.required && (
                      <span className="ml-1 text-red-500">*</span>
                    )}
                    {field.help && (
                      <p className="mt-1 text-xs font-normal leading-5 text-gray-500">
                        {field.help}
                      </p>
                    )}
                  </div>

                  <div className="min-w-0 px-5 py-3">
                    {readonly || field.readOnly ? (
                      field.type === "image" && form[field.key] ? (
                        <img
                          src={form[field.key]}
                          alt=""
                          className="h-24 w-40 object-cover"
                        />
                      ) : (
                        <div className="py-2 text-sm">
                          {formatValue(
                            form[field.key],
                            field.type,
                            field.options,
                          )}
                        </div>
                      )
                    ) : (
                      <>
                        {![
                          "file",
                          "multiImage",
                          "multiFile",
                          "blockEditor",
                          "admissionDoc",
                        ].includes(field.type) &&
                          !(field.type === "image" && field.hideUrlInput) &&
                          // readOnly textarea(예: *_html 미러)는 3차 정보 — 데이터 셀보다
                          // 큰 자리를 차지하지 않도록 기본 접힘(details/summary)으로 감싼다.
                          // 기능(값 확인·복사)은 그대로, 펼쳐야 보이게만 바꾼 것.
                          (field.type === "textarea" && field.readOnly ? (
                            <details className="group">
                              <summary className="cursor-pointer text-xs font-bold text-gray-400 hover:text-gray-600">
                                HTML 미러 보기(자동 생성, 편집 불가)
                              </summary>
                              <div className="mt-2">
                                <AdminInput
                                  field={field}
                                  value={form[field.key]}
                                  onChange={change}
                                  disabled={readonly}
                                />
                              </div>
                            </details>
                          ) : (
                            <AdminInput
                              field={field}
                              value={form[field.key]}
                              onChange={change}
                              disabled={readonly}
                            />
                          ))}

                        {field.type === "admissionDoc" && (
                          <AdmissionDocFieldEditor
                            field={field}
                            form={form}
                            onPatch={patch}
                            onDirty={() => setDirty(true)}
                          />
                        )}

                        {field.type === "blockEditor" && (
                          // onInput/onKeyDown은 BlockNote가 내부에 렌더하는 contenteditable DOM에서
                          // 버블링돼 올라온다 — BlockEditor 자체를 건드리지 않고 dirty만 감지한다.
                          // biome-ignore lint/a11y/noStaticElementInteractions: 클릭이 아니라 이미 키보드 이벤트(onKeyDown)까지 감지하는 dirty 트래킹 전용 래퍼다 — 안쪽 BlockNote가 실제 편집 가능 영역을 갖는다.
                          <div
                            onInput={() => setDirty(true)}
                            onKeyDown={() => setDirty(true)}
                          >
                            <BlockEditor
                              ref={getEditorRef(field.key)}
                              key={row?.id ?? "new"}
                              initialContent={
                                form[`${field.key}_json`]?.blocks ??
                                (form[field.key]
                                  ? plainTextToBlocks(form[field.key])
                                  : undefined)
                              }
                              uploadFile={async (file) => {
                                const uploaded = await onUpload(file, field);
                                if (!uploaded?.[0]?.url)
                                  throw new Error(
                                    "이미지 업로드에 실패했습니다.",
                                  );
                                return uploaded[0].url;
                              }}
                            />
                          </div>
                        )}

                        {field.type === "image" && (
                          <div className="mt-3 flex items-center gap-3">
                            {form[field.key] ? (
                              <img
                                src={form[field.key]}
                                alt=""
                                className="h-20 w-32 rounded border object-cover"
                              />
                            ) : (
                              <div className="flex h-20 w-32 items-center justify-center rounded border bg-gray-50 text-xs font-bold text-gray-400">
                                이미지 없음
                              </div>
                            )}

                            <label className="inline-flex cursor-pointer items-center gap-2 rounded border border-gray-400 bg-white px-4 py-2 text-sm font-black hover:bg-gray-50">
                              <UploadCloud size={16} />
                              이미지 업로드
                              <input
                                type="file"
                                accept="image/*"
                                className="hidden"
                                onChange={async (e) => {
                                  const uploaded = await onUpload(
                                    e.target.files?.[0],
                                    field,
                                  );
                                  if (uploaded?.[0]?.url) {
                                    change(field.key, uploaded[0].url);
                                  }
                                }}
                              />
                            </label>
                          </div>
                        )}
                        {field.type === "file" && (
                          <div className="mt-3 flex items-center gap-3">
                            {form[field.key] ? (
                              <a
                                href={form[field.key]}
                                target="_blank"
                                rel="noreferrer"
                                className="inline-flex h-10 items-center rounded border border-blue-200 bg-blue-50 px-4 text-sm font-bold text-blue-700 hover:bg-blue-100"
                              >
                                {form[field.nameKey] || "첨부파일 보기"}
                              </a>
                            ) : (
                              <div className="flex h-10 items-center rounded border bg-gray-50 px-4 text-xs font-bold text-gray-400">
                                첨부파일 없음
                              </div>
                            )}

                            <label className="inline-flex cursor-pointer items-center gap-2 rounded border border-gray-400 bg-white px-4 py-2 text-sm font-black hover:bg-gray-50">
                              <UploadCloud size={16} />
                              파일 등록
                              <input
                                type="file"
                                accept={field.accept || "*"}
                                className="hidden"
                                onChange={async (e) => {
                                  const uploaded = await onUpload(
                                    e.target.files?.[0],
                                    field,
                                  );
                                  if (uploaded?.[0]?.url) {
                                    change(field.key, uploaded[0].url);
                                    if (field.nameKey)
                                      change(field.nameKey, uploaded[0].name);
                                  }
                                }}
                              />
                            </label>

                            {form[field.key] && (
                              <button
                                type="button"
                                onClick={() => {
                                  change(field.key, "");
                                  if (field.nameKey) change(field.nameKey, "");
                                }}
                                className="h-10 rounded border border-red-200 bg-red-50 px-4 text-sm font-black text-red-600 hover:bg-red-100"
                              >
                                삭제
                              </button>
                            )}
                          </div>
                        )}

                        {field.type === "multiImage" && (
                          <div className="space-y-3">
                            <div className="flex flex-wrap gap-3">
                              {normalizeArray(form[field.key]).length > 0 ? (
                                withDedupedKeys(
                                  normalizeArray(form[field.key]),
                                ).map(({ item: url, key }, index) => (
                                  <div key={key} className="relative">
                                    <img
                                      src={url}
                                      alt=""
                                      className="h-28 w-40 rounded border object-cover"
                                    />
                                    <button
                                      type="button"
                                      onClick={() =>
                                        removeListItem(field.key, index)
                                      }
                                      className="absolute right-1 top-1 rounded bg-black/70 px-2 py-1 text-xs font-black text-white"
                                    >
                                      삭제
                                    </button>
                                  </div>
                                ))
                              ) : (
                                <div className="flex h-20 w-32 items-center justify-center rounded border bg-gray-50 text-xs font-bold text-gray-400">
                                  이미지 없음
                                </div>
                              )}
                            </div>

                            <label className="inline-flex cursor-pointer items-center gap-2 rounded border border-gray-400 bg-white px-4 py-2 text-sm font-black hover:bg-gray-50">
                              <UploadCloud size={16} />
                              이미지 여러 개 업로드
                              <input
                                type="file"
                                accept="image/*"
                                multiple
                                className="hidden"
                                onChange={(e) =>
                                  uploadMultiple(e.target.files, field)
                                }
                              />
                            </label>
                          </div>
                        )}

                        {field.type === "multiFile" && (
                          <div className="space-y-3">
                            <div className="space-y-2">
                              {normalizeArray(form[field.key]).length > 0 ? (
                                withDedupedKeys(
                                  normalizeArray(form[field.key]),
                                  (item) =>
                                    typeof item === "string" ? item : item?.url,
                                ).map(({ item, key }, index) => {
                                  const fileUrl =
                                    typeof item === "string" ? item : item?.url;
                                  const fileName =
                                    item?.name || getFileNameFromUrl(fileUrl);

                                  return (
                                    <div
                                      key={key}
                                      className="flex items-center justify-between rounded border bg-gray-50 px-4 py-2"
                                    >
                                      <a
                                        href={fileUrl}
                                        target="_blank"
                                        rel="noreferrer"
                                        className="text-sm font-bold text-blue-700 hover:underline"
                                      >
                                        {fileName}
                                      </a>

                                      <button
                                        type="button"
                                        onClick={() =>
                                          removeListItem(field.key, index)
                                        }
                                        className="rounded border border-red-200 bg-red-50 px-3 py-1 text-xs font-black text-red-600 hover:bg-red-100"
                                      >
                                        삭제
                                      </button>
                                    </div>
                                  );
                                })
                              ) : (
                                <div className="flex h-10 items-center rounded border bg-gray-50 px-4 text-xs font-bold text-gray-400">
                                  첨부파일 없음
                                </div>
                              )}
                            </div>

                            <label className="inline-flex cursor-pointer items-center gap-2 rounded border border-gray-400 bg-white px-4 py-2 text-sm font-black hover:bg-gray-50">
                              <UploadCloud size={16} />
                              파일 여러 개 등록
                              <input
                                type="file"
                                accept={field.accept || "*"}
                                multiple
                                className="hidden"
                                onChange={(e) =>
                                  uploadMultiple(e.target.files, field)
                                }
                              />
                            </label>
                          </div>
                        )}
                      </>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {config.FormPreview && (
            <div className="w-full xl:sticky xl:top-[4.5rem] xl:w-[23.75rem] xl:shrink-0">
              <config.FormPreview
                form={form}
                onPatch={patch}
                locked={Boolean(modalSection)}
              />
            </div>
          )}
        </div>

        <div className="mt-5 flex justify-end gap-2">
          {!readonly && blockEditorField && (
            <button
              type="button"
              onClick={openPreview}
              className="h-10 border border-[#2348ff] bg-white px-5 text-sm font-black text-[#2348ff]"
            >
              미리보기
            </button>
          )}

          <button
            type="button"
            onClick={handleCancel}
            className="h-10 bg-[#4b5563] px-5 text-sm font-black text-white"
          >
            취소
          </button>

          {!readonly && (
            <button
              type="submit"
              className="h-10 bg-[#2348ff] px-5 text-sm font-black text-white"
            >
              저장
            </button>
          )}
        </div>

        <ColumnPreviewModal
          open={Boolean(previewPost)}
          onClose={() => setPreviewPost(null)}
          post={previewPost}
          label={config.previewLabel}
        />
      </form>

      {/* 공개 모달과 **같은 껍데기**(AdmissionModalShell)를 쓰는 편집
          다이얼로그. 본문만 뷰어 대신 편집 필드를 넣는다. */}
      <AdmissionSectionEditModal
        open={Boolean(modalSection)}
        sectionKey={modalSection}
        sectionLabel={HWP_SECTION_LABELS[modalSection] || modalSection}
        universityName={form.university_name}
        dirty={dirty}
        origin={origin}
        onClose={closeSectionModal}
        // 저장은 폼 하단 [저장]과 **완전히 같은 단일 경로**다: requestSubmit →
        // submit(required 검사 → config.validate confirm) → onSave(merged) →
        // saveRow → formToPayload → update().eq('id') → setMode('list').
        // AdminForm이 언마운트되면서 모달도 함께 사라지고 목록으로 돌아간다 —
        // 공개 모달(닫으면 목록)과 같은 루프다. 부분 저장 경로는 만들지 않는다.
        onSave={() => formRef.current?.requestSubmit()}
      >
        {groupFields.map((field) => (
          <AdmissionGroupField
            key={field.key}
            field={field}
            form={form}
            readonly={readonly}
            onChange={change}
            onPatch={patch}
            onDirty={() => setDirty(true)}
          />
        ))}
      </AdmissionSectionEditModal>
    </>
  );
}

// fn_complete_refund 가 그대로 거부할 상태를 버튼 단계에서 먼저 막는다(Baseline
// §2 fn_complete_refund 본문 WC035/WC036 조건과 동일) — refundRequests 탭
// 전용 판정이라 activeKey==='refundRequests' 일 때만 쓰인다.
function isRefundCompletionBlocked(row) {
  if (!row) return true;
  if (row.approval_status !== "approved") return true;
  if (!["requested", "processing"].includes(row.status)) return true;
  return false;
}

export function AdminTable({
  config,
  rows,
  page,
  setPage,
  totalCount,
  onEdit,
  onDelete,
  activeKey,
  onCompleteRefund,
  onOpenSection,
  onOpenMetaEdit,
}) {
  // 두 가지 조달 방식이 한 표를 공유한다.
  //  - 기본(35개 config): loadRows가 전량을 가져오고 여기서 PAGE_SIZE로 잘라 쓴다.
  //  - config.serverPaginate(입결 43k행): rows가 이미 "현재 페이지 PAGE_SIZE행"이라
  //    자르면 안 되고, 전체 건수는 서버 count(totalCount)로 따로 받는다.
  const serverPaginated = Boolean(config.serverPaginate);
  const total = serverPaginated ? totalCount : rows.length;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const start = (page - 1) * PAGE_SIZE;
  const pageRows = useMemo(
    () => (serverPaginated ? rows : rows.slice(start, start + PAGE_SIZE)),
    [rows, start, serverPaginated],
  );

  // 페이지 번호 창. 기존에는 1~10을 고정 렌더했는데, 4,300페이지짜리 입결 목록에서는
  // 그 방식으로 11페이지 이후에 도달할 방법이 없다(≫ 버튼으로 끝으로 점프한 뒤에도
  // 번호줄은 1~10을 가리킨다). 현재 페이지를 가운데 두고 창을 굴린다 —
  // totalPages ≤ 10이면 예전과 완전히 같은 1..N이 나온다.
  const windowSize = Math.min(totalPages, 10);
  const windowStart = Math.min(
    Math.max(1, page - Math.floor(windowSize / 2)),
    Math.max(1, totalPages - windowSize + 1),
  );
  const pageNumbers = Array.from(
    { length: windowSize },
    (_, index) => windowStart + index,
  );

  // 섹션 요약(summarizeHwpSection)은 페이지당 최대 60회(10행 × 6컬럼) 호출되고
  // jsonb doc의 blocks 배열을 훑는다. 셀에서 직접 부르면 keyword 검색 타이핑
  // 한 글자마다 전부 재계산된다 — 페이지 행이 실제로 바뀔 때만 1회 계산한다.
  // admissionSection 컬럼이 없는 35개 config에서는 null이라 비용이 0이다.
  const sectionColumns = config.columns.filter(
    (column) => column.type === "admissionSection",
  );
  // biome-ignore lint/correctness/useExhaustiveDependencies: TODO(useEffectEvent) sectionColumns는 매 렌더 config.columns.filter(...)로 새로 만들어지는 배열이라, 그걸 deps로 쓰면 위 주석이 막으려던 "페이지 행이 안 바뀌어도 매 렌더 재계산"이 그대로 재발한다. 안정적인 config.columns를 대리 deps로 쓴다.
  const sectionSummaries = useMemo(() => {
    if (sectionColumns.length === 0) return null;
    return pageRows.map((row) => {
      const summaries = {};
      sectionColumns.forEach((column) => {
        summaries[column.sectionKey] = summarizeHwpSection(
          column.sectionKey,
          row,
        );
      });
      return summaries;
    });
    // config.columns는 모듈 레벨 CONFIGS 리터럴이라 참조가 안정적이다.
  }, [pageRows, config.columns]);

  return (
    <div className="bg-white p-6 shadow">
      <div className="mb-4 text-sm font-bold text-gray-500">
        전체 <span className="text-blue-600">{total.toLocaleString()}</span>건
      </div>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[1000px] border-collapse text-sm">
          <thead>
            <tr className="border-y border-gray-300">
              <th className="w-14 px-3 py-3 text-left">번호</th>
              {config.columns.map((column) => (
                <th key={column.key} className="px-3 py-3 text-left">
                  {column.label}
                </th>
              ))}
              <th className="w-24 px-3 py-3 text-center">관리</th>
            </tr>
          </thead>

          <tbody>
            {pageRows.length === 0 ? (
              <tr>
                <td
                  colSpan={config.columns.length + 2}
                  className="py-12 text-center text-gray-400"
                >
                  등록된 데이터가 없습니다.
                </td>
              </tr>
            ) : (
              pageRows.map((row, index) => (
                <tr key={row.id} className="border-b border-gray-100">
                  <td className="px-3 py-3">{total - (start + index)}</td>

                  {config.columns.map((column) => (
                    <td key={column.key} className="px-3 py-3">
                      {/* 대학명 = 메타 수정 다이얼로그 진입점.
                          공개 목록에서 대학명을 누르면 그 대학 입시 홈페이지로
                          가듯, 어드민에서 누르면 그 URL을 고칠 수 있는 창이
                          열린다(사용자 지시 2026-08-10).

                          관리 열 ⚙️ 는 그대로 둔다 — 같은 모달을 여는 진입점이
                          2개가 되는 것뿐이고, ⚙️ 를 지우면 대학명 컬럼이 없는
                          다른 config에서 메타 수정 경로가 사라진다.

                          ⚠ 이 분기는 반드시 admissionSection 분기보다 **앞**에
                          있어야 한다. scripts/verify-admission-admin-entry.mjs 는
                          admissionSection 분기의 시작과 fileList 분기의 시작을
                          앵커로 그 사이를 잘라내 하네스에
                          sectionSummaries/index/column/row/onOpenSection 만
                          주입한다. 이 분기가 그 사이에 끼면 onOpenMetaEdit
                          미주입으로 스크립트가 ReferenceError 로 죽는다.
                          (앵커 문자열을 이 주석에 그대로 복제하지도 말 것 —
                          "정확히 1개" 조건이 깨져 슬라이스가 실패한다.) */}
                      {/* column.render(row): 같은 행의 다른 컬럼을 봐야 하는 셀
                          전용 훅. formatValue 시그니처가 (value, type, options)라
                          값 하나만 받아 이웃 컬럼을 볼 수 없다 — 목표관리 대학 컷의
                          avg_cut을 cut_type에 따라 "2.35등급" / "87.5백분위"로
                          렌더하는 요구가 이 훅을 강제한다(명세 §4-1-3 (c)).

                          ⚠ 이 분기는 반드시 admissionSection 분기보다 **앞**에
                          있어야 한다 — 아래 universityNameMeta 분기의 주석과 같은
                          이유다(scripts/verify-admission-admin-entry.mjs 슬라이스).

                          render를 선언하지 않은 컬럼은 아래 기존 분기를 그대로
                          탄다(저장소 전체 column.render 선언 0건).

                          ⚠ 적용 범위 계약: **표 셀뿐이다.** CSV 내보내기(csvBody)는
                          render를 보지 않고 formatValue만 쓴다 — 목록에 "2.35등급"
                          으로 보이는 값이 CSV에는 "2.35"로 나간다. render를 쓰는
                          config(goalUniversityCuts)는 excel/CSV 경로를 아예
                          선언하지 않아 지금은 실효가 없지만, 그 탭에 내보내기를
                          켜려면 csvBody에도 같은 훅을 태워야 한다. */}
                      {column.render ? (
                        column.render(row)
                      ) : column.type === "universityNameMeta" &&
                        onOpenMetaEdit ? (
                        <button
                          type="button"
                          onClick={() => onOpenMetaEdit(row)}
                          title="대학 정보 수정 창 열기"
                          className="text-left font-bold text-[#013262] underline underline-offset-2 transition hover:text-[#0b84fd]"
                        >
                          {formatValue(
                            row[column.key],
                            column.type,
                            column.options,
                          )}
                        </button>
                      ) : column.type === "image" ? (
                        row[column.key] ? (
                          column.showFileName ? (
                            <div className="flex items-center gap-2">
                              <img
                                src={row[column.key]}
                                alt=""
                                className="h-12 w-20 rounded object-cover"
                              />
                              <span
                                className="max-w-[10rem] truncate text-xs font-bold text-gray-500"
                                title={fileNameFromUrl(row[column.key])}
                              >
                                {fileNameFromUrl(row[column.key])}
                              </span>
                            </div>
                          ) : (
                            <img
                              src={row[column.key]}
                              alt=""
                              className="h-12 w-20 rounded object-cover"
                            />
                          )
                        ) : (
                          "-"
                        )
                      ) : column.type === "imageList" ? (
                        normalizeArray(row[column.key]).length > 0 ? (
                          <div className="flex items-center gap-2">
                            <img
                              src={normalizeArray(row[column.key])[0]}
                              alt=""
                              className="h-12 w-20 rounded object-cover"
                            />
                            <span className="text-xs font-bold text-gray-500">
                              {normalizeArray(row[column.key]).length > 1
                                ? `+${normalizeArray(row[column.key]).length - 1}`
                                : ""}
                            </span>
                          </div>
                        ) : (
                          "-"
                        )
                      ) : column.type === "admissionSection" ? (
                        // 공개 목록 표의 [보기] 셀과 같은 자리·같은 어포던스.
                        // 셀 1클릭으로 같은 껍데기의 편집 다이얼로그가 열린다.
                        // title에 요약("표 2개 · 5열 12행")을 실어 어느 칸이
                        // 무거운지 열기 전에 알 수 있게 한다.
                        // 요약은 위 useMemo가 페이지 단위로 미리 계산한 값이다
                        // (summarizeHwpSection은 row[jsonKey]/row[sectionKey]만
                        // 읽는 순수 함수라 목록 row를 그대로 넘길 수 있고,
                        // loadRows가 select('*')이므로 추가 fetch도 0이다).
                        //
                        // ⚠ 빈 칸도 반드시 열려야 한다 (2026-08-07)
                        // ----------------------------------------
                        // 사용자 요청: "모든 다이얼로그에서 '비었을 때 추가'
                        // 기능이 있어야 해." 조사 결과 다이얼로그 **안**은 이미
                        // 완비였다 — 6섹션 × (블록0 / emptyBox 1개 / group만)
                        // 18케이스를 SSR 해보면 전부 블록 추가 셀렉트가 나온다
                        // (DocBlocksEditor의 추가 UI는 blocks.map 바깥에 있고
                        // blocks.length 조건이 없다). 진짜 구멍은 "다이얼로그를
                        // 못 연다"였다: 여기 있던 `'내용 없음' → <span>-</span>`
                        // 게이트가 dev DB 55칸(특수대학 11개교 × 5카테고리)을
                        // 통째로 죽여놨다. 그 11개교는 전형방법 1칸만 내용이
                        // 있고 나머지 5칸이 전부 비어 있어, 목록에서는 영영
                        // 내용을 채워 넣을 수 없었다.
                        // 지금은 폼(✏️)의 CategorySectionButton이 요약과 무관하게
                        // 6개를 항상 렌더해 우회로가 되고 있지만, 그 ✏️는 다음
                        // 커밋에서 사라진다 — 게이트를 먼저 연다.
                        // 모달 쪽 배선은 이미 되어 있다: AdmissionDocFieldEditor가
                        // 값이 없으면 blocks:[] 인 source:'manual' doc을 합성한다.
                        //
                        // 어포던스만 구분한다 — 빈 칸은 회색 점선 [추가],
                        // 내용 있는 칸은 기존 파랑 [수정]. 라벨을 통일하지 않는
                        // 이유는 목록을 훑을 때 "어디가 비었나"가 한눈에 보여야
                        // 하기 때문이다(기존 `-`가 주던 정보를 잃지 않는다).
                        (() => {
                          const summary =
                            sectionSummaries?.[index]?.[column.sectionKey];
                          const empty = summary === "내용 없음";
                          return (
                            <button
                              type="button"
                              title={summary}
                              onClick={() =>
                                onOpenSection?.(row, column.sectionKey)
                              }
                              className={
                                empty
                                  ? "rounded border border-dashed border-gray-300 bg-white px-2.5 py-1 text-xs font-black text-gray-400 transition hover:border-[#2348ff] hover:text-[#2348ff]"
                                  : "rounded border border-[#c7d2fe] bg-[#eef2ff] px-2.5 py-1 text-xs font-black text-[#2348ff] transition hover:border-[#2348ff] hover:bg-[#2348ff] hover:text-white"
                              }
                            >
                              {empty ? "추가" : "수정"}
                            </button>
                          );
                        })()
                      ) : column.type === "fileList" ? (
                        formatListValue(row[column.key], column.type)
                      ) : column.type === "truncate" ? (
                        truncateText(row[column.key])
                      ) : (
                        formatValue(
                          row[column.key],
                          column.type,
                          column.options,
                        )
                      )}
                    </td>
                  ))}

                  <td className="px-3 py-3">
                    <div className="flex justify-center gap-3">
                      {/* config.hideRowEdit: 행 전체 폼(✏️/👁)으로 들어가는
                          진입점을 끈다. AdminTable 은 36개 config 가 공유하는
                          단일 컴포넌트라 이 한 줄이 전 메뉴의 수정 진입점이고,
                          settlements 의 👁 상세보기까지 같은 버튼이다 —
                          무조건 지우면 35개 메뉴가 함께 죽는다. 그래서
                          config.excel / config.noCreate / config.readOnly 와
                          같은 "공용 렌더 + config 스위치" 패턴으로 켠다. */}
                      {!config.hideRowEdit && (
                        <button
                          type="button"
                          onClick={() => onEdit(row)}
                          className="text-gray-500 hover:text-black"
                        >
                          {config.readOnly ? (
                            <Eye size={17} />
                          ) : (
                            <Edit3 size={17} />
                          )}
                        </button>
                      )}

                      {/* config.showMetaEdit: ✏️(행 전체 폼) 대신 메타 9필드만
                          고치는 경량 모달(AdmissionMetaEditModal) 진입점.
                          admissionGuidelines 1개 메뉴에만 켠다 — hideRowEdit과
                          같은 "공용 렌더 + config 스위치" 패턴. */}
                      {config.showMetaEdit && (
                        <button
                          type="button"
                          onClick={() => onOpenMetaEdit?.(row)}
                          aria-label="메타 정보 수정"
                          className="text-gray-500 hover:text-black"
                        >
                          <Settings size={17} />
                        </button>
                      )}

                      {/* 🗑 은 손대지 않는다 — 사용자 미언급이고, 지우면 행
                          삭제 경로가 완전히 사라진다(엑셀 일괄은 insert/update
                          만 한다). 기존 !config.readOnly 게이팅 그대로. */}
                      {!config.readOnly && (
                        <button
                          type="button"
                          onClick={() => onDelete(row)}
                          className="text-gray-500 hover:text-red-600"
                        >
                          <Trash2 size={17} />
                        </button>
                      )}

                      {activeKey === "refundRequests" && (
                        <button
                          type="button"
                          onClick={() => onCompleteRefund(row)}
                          disabled={isRefundCompletionBlocked(row)}
                          title={
                            isRefundCompletionBlocked(row)
                              ? "승인완료 + 접수·처리중 상태의 신청만 환불 완료 처리할 수 있어요."
                              : "환불완료 처리"
                          }
                          className="whitespace-nowrap text-xs font-bold text-gray-500 hover:text-blue-600 disabled:cursor-not-allowed disabled:text-gray-300"
                        >
                          환불완료
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <div className="mt-5 flex flex-col items-center gap-2">
        <div className="inline-flex border border-gray-300">
          <button
            type="button"
            onClick={() => setPage(1)}
            className="h-9 w-10 border-r"
          >
            <ChevronsLeft size={15} className="mx-auto" />
          </button>
          <button
            type="button"
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            className="h-9 w-10 border-r"
          >
            <ChevronLeft size={15} className="mx-auto" />
          </button>

          {pageNumbers.map((num) => (
            <button
              key={num}
              type="button"
              onClick={() => setPage(num)}
              className={`h-9 w-10 border-r text-sm font-bold ${
                page === num
                  ? "bg-gray-600 text-white"
                  : "bg-white text-gray-600"
              }`}
            >
              {num}
            </button>
          ))}

          <button
            type="button"
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            className="h-9 w-10 border-r"
          >
            <ChevronRight size={15} className="mx-auto" />
          </button>
          <button
            type="button"
            onClick={() => setPage(totalPages)}
            className="h-9 w-10"
          >
            <ChevronsRight size={15} className="mx-auto" />
          </button>
        </div>

        {/* 번호줄이 창(최대 10칸)만 보여주므로 지금 몇 번째인지 따로 알려준다.
            페이지가 1장뿐인 대부분의 메뉴에서는 노이즈라 2장 이상일 때만 렌더한다. */}
        {totalPages > 1 && (
          <p className="text-xs font-bold text-gray-500">
            {page.toLocaleString()} / {totalPages.toLocaleString()} 페이지
          </p>
        )}
      </div>
    </div>
  );
}

const IMAGE_BUCKET = "banners";

const COMPRESS_THRESHOLD_BYTES = 500 * 1024;

function formatFileSize(bytes) {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
  return `${Math.round(bytes / 1024)}KB`;
}

// maxMB 초과 시 alert 후 false 반환. 압축 대상 필드는 압축 이후(uploadImage)에 별도 호출.
function validateMaxMB(file, maxMB) {
  if (!maxMB) return true;
  if (file.size > maxMB * 1024 * 1024) {
    alert(
      `파일 용량이 너무 큽니다. 최대 ${maxMB}MB까지 업로드할 수 있습니다. (현재 ${formatFileSize(file.size)})`,
    );
    return false;
  }
  return true;
}

// 압축 적용 대상 필드인지 판정: field.compress === true이고 file/multiFile 타입이 아님
function isCompressibleField(field = {}) {
  return (
    field.compress === true &&
    field.type !== "file" &&
    field.type !== "multiFile"
  );
}

// 이미지 규격 검증: imageSpec = { width, height, tolerance(기본 0.02), maxMB, aspectOnly }
// 반환값 false = 업로드 중단, true = 계속 진행
// options.skipMaxMB: true면 maxMB 검증은 건너뜀 (압축 대상 필드는 압축 이후 별도 검증)
async function validateImageSpec(file, imageSpec, options = {}) {
  if (!imageSpec) return true;

  const { width, height, tolerance = 0.02, maxMB, aspectOnly } = imageSpec;

  if (!options.skipMaxMB && !validateMaxMB(file, maxMB)) return false;

  if (!width || !height) return true;

  let bitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    // 치수 측정 불가 형식(svg 등)은 규격 검증 없이 통과
    return true;
  }

  const actualWidth = bitmap.width;
  const actualHeight = bitmap.height;
  bitmap.close?.();

  let matches;
  let expectedText;

  if (aspectOnly) {
    const expectedRatio = width / height;
    const actualRatio = actualWidth / actualHeight;
    matches =
      Math.abs(actualRatio - expectedRatio) / expectedRatio <= tolerance;
    expectedText = `${width}:${height} 비율`;
  } else {
    matches =
      Math.abs(actualWidth - width) / width <= tolerance &&
      Math.abs(actualHeight - height) / height <= tolerance;
    expectedText = `${width}×${height}`;
  }

  if (matches) return true;

  return window.confirm(
    `이미지 규격이 다릅니다.\n${expectedText} 필요, 현재 ${actualWidth}×${actualHeight} — 계속 업로드할까요?`,
  );
}

// 500KB 초과 이미지 canvas 재인코딩 (치수 유지, png→png / jpeg 품질 0.85)
// 재인코딩 결과가 원본보다 작을 때만 교체. field.compress === true인 필드만 대상 (옵트인).
async function maybeCompressImage(file, field = {}) {
  if (!isCompressibleField(field)) return file;
  if (file.type !== "image/png" && file.type !== "image/jpeg") return file;
  if (file.size <= COMPRESS_THRESHOLD_BYTES) return file;

  let bitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    return file;
  }

  try {
    const canvas = document.createElement("canvas");
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;

    const ctx = canvas.getContext("2d");
    if (!ctx) return file;
    ctx.drawImage(bitmap, 0, 0);

    const isPng = file.type === "image/png";
    const blob = await new Promise((resolve) =>
      canvas.toBlob(resolve, file.type, isPng ? undefined : 0.85),
    );

    if (!blob || blob.size >= file.size) return file;

    alert(
      `${formatFileSize(file.size)} → ${formatFileSize(blob.size)}로 압축됨`,
    );
    return new File([blob], file.name, { type: file.type });
  } catch {
    return file;
  } finally {
    bitmap.close?.();
  }
}

// Admin()이 AdminForm에 onUpload로 넘기던 함수. 컴포넌트 상태를 전혀 참조하지 않는 순수 함수라
// PremiumBookAdmin(제네릭 개별 페이지 편집)도 그대로 재사용할 수 있도록 모듈 스코프로 뺐다.
export async function uploadImage(files, field = {}) {
  const fileList = Array.isArray(files) ? files : [files].filter(Boolean);
  if (fileList.length === 0) return [];

  const uploaded = [];

  for (const rawFile of fileList) {
    const willCompress = isCompressibleField(field);

    if (field.imageSpec) {
      const proceed = await validateImageSpec(rawFile, field.imageSpec, {
        skipMaxMB: willCompress,
      });
      if (!proceed) continue;
    }

    const file = await maybeCompressImage(rawFile, field);

    if (
      willCompress &&
      field.imageSpec?.maxMB &&
      !validateMaxMB(file, field.imageSpec.maxMB)
    ) {
      continue;
    }

    const ext = file.name.split(".").pop()?.toLowerCase() || "file";

    const safeName =
      file.name
        .replace(/\.[^/.]+$/, "")
        .normalize("NFKD")
        .replace(/[^a-zA-Z0-9_-]/g, "_")
        .replace(/_+/g, "_")
        .replace(/^_+|_+$/g, "")
        .slice(0, 50) || "upload";

    const folder =
      field.folder ||
      (field.type === "file" || field.type === "multiFile"
        ? "notice-files"
        : "admin");

    const path = `${folder}/${Date.now()}-${Math.random()
      .toString(36)
      .slice(2)}-${safeName}.${ext}`;

    const { error } = await supabase.storage
      .from(IMAGE_BUCKET)
      .upload(path, file, {
        cacheControl: field.cacheControl || "3600",
        upsert: false,
      });

    if (error) {
      reportAdminError("업로드 실패", error);
      continue;
    }

    const { data } = supabase.storage.from(IMAGE_BUCKET).getPublicUrl(path);

    uploaded.push({
      name: file.name,
      url: data.publicUrl,
      size: file.size,
      type: file.type,
    });
  }

  return uploaded;
}
