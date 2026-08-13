// 멘토 지원서 폼 섹션 5 「증빙 서류 및 동의」 + ※ 선발 취소 사유 안내 + 제출 버튼
// — docs/mentor-apply-spec.md § 폼 명세 섹션 5 / §6-1(블록 배치) / §6-7 / §6-8.
//
// 상태를 소유하지 않는 **제어 컴포넌트**다(섹션 4와 동일 계약). 파일 객체와 본인인증 성공
// 여부까지 부모가 들고 있어야 제출 페이로드가 한 곳에서 조립되고, 작성 현황 사이드바(§6-3)가
// 5번 단계의 완성도를 셀 수 있다.
//
// ⚠ 렌더 범위 — 시안 §6-1 의 폼 컬럼 y좌표상 「※ 선발 취소 사유 안내」(y=4909)와 「지원서
//    제출하기」(y=5009)는 5번 섹션 카드(끝 y=4877) **밖**에 있는 형제 블록이다. 카드 안에
//    넣으면 흰 카드 배경 위에 얹혀 시안과 달라지므로 카드 뒤에 형제로 쌓는다. 블록 간
//    세로 간격 32(2rem)는 섹션 카드 간 gap 과 같은 값이라, 부모가 섹션들을 gap-8 로 쌓으면
//    이 래퍼 안팎의 리듬이 그대로 이어진다.
//
// ⚠ id 충돌 회피 — FileDropzone 은 `${id}-error`, MentorFieldShell 도 `${fieldId}-error` 로
//    에러 노드 id 를 만든다. 두 id 를 같게 두면 에러가 뜰 때 DOM 에 같은 id 가 둘 생기므로
//    드롭존/약관 블록은 shell 과 **다른 fieldId** 를 쓴다. 그 대가로 해당 라벨의 htmlFor 가
//    가리킬 컨트롤이 없어지는데, MentorAgreementBlock·FileDropzone 은 담당 파일이 아니라
//    수정할 수 없어(리뷰 WARN #3) 그 두 컴포넌트에는 접근 이름을 줄 aria-label prop 자체가
//    없다. 그래서 여기서는 MentorFieldShell 을 `groupLabel` 모드(<label htmlFor> 대신
//    id 만 있는 <span>)로 그리고, 그 라벨을 `role="group"` 래퍼의 `aria-labelledby` 로
//    참조해 이름을 전달한다. 칩 그룹(다른 섹션 파일)은 자체적으로 ariaLabel prop 을 받는
//    구조라 이 패턴이 필요 없다.
import {
  CANCELLATION_NOTICE,
  FORM_SECTIONS,
  MENTOR_AGREEMENTS,
  SUBMIT_BUTTON_LABEL,
} from "../../data/mentorApply";
import PrimaryButton from "../auth/PrimaryButton";
import FileDropzone from "./FileDropzone";
import FormSectionCard from "./FormSectionCard";
import MentorAgreementBlock from "./MentorAgreementBlock";
import { getMentorFieldLabelId, MentorFieldShell } from "./MentorTextField";
import PhoneVerifyField from "./PhoneVerifyField";

const SECTION = FORM_SECTIONS.find((section) => section.no === 5);

// 사이드바 앵커 기본값(§6-3).
export const DOCUMENTS_SECTION_ID = "mentor-apply-section-5";

// 이 섹션이 소유하는 필드. 파일과 번호는 `values` 가 아니라 전용 prop 으로 오르내리지만,
// 필수 카운트·진행률 계산의 기준이 되어야 하므로 이름을 함께 노출한다.
export const DOCUMENTS_FIELD_NAMES = ["proof_file", "phone"];

// 약관 동의 키(= DB agree_* 컬럼과 1:1). 부모가 초기 상태 맵을 만들 때 쓴다.
export const DOCUMENTS_AGREEMENT_KEYS = MENTOR_AGREEMENTS.map(
  (item) => item.key,
);
export const DOCUMENTS_REQUIRED_AGREEMENT_KEYS = MENTOR_AGREEMENTS.filter(
  (item) => item.required,
).map((item) => item.key);

// 컨트롤 id — 파일 상단 ⚠ 참고. `*-field` 접미가 붙은 쪽이 라벨/에러 슬롯(shell) 소유다.
const FILE_INPUT_ID = "mentor-apply-proof-file";
const FILE_FIELD_ID = "mentor-apply-proof";
const PHONE_INPUT_ID = "mentor-apply-phone";
const AGREEMENT_FIELD_ID = "mentor-apply-agreements";

// 도움말 내 강조는 시안에서 `#0B84FD`(accent) 동일 크기 인라인 스팬이다(§6-6).
function Accent({ children }) {
  return <span className="text-accent">{children}</span>;
}

export default function FormSectionDocuments({
  values = {},
  errors = {},
  onChange, // (name, value) => void — 여기서는 'phone' 만 사용한다
  file = null, // File | null — 5-1 재학 증빙 서류
  onFileChange, // (File | null) => void
  uploadStatus = "idle", // 'idle' | 'uploading' | 'done' — FileDropzone 선택완료 뷰 배지용.
  // MentorApplyForm 의 submitStage/uploadedProof 를 그대로가 아니라 이 값으로 변환해 받는다
  // (MentorApplyForm.jsx 매핑 주석 참고).
  phoneVerified = false, // 5-2 본인인증 완료 여부(서버가 제출 시 재확인한다)
  onPhoneVerified, // (normalizedPhone: string) => void
  agreements = {}, // { [key]: boolean } — MENTOR_AGREEMENTS 의 key 5종
  onAgreementToggle, // (key) => void
  onAgreementToggleAll, // () => void
  // 제출 핸들러는 조립 페이지가 소유한다. 버튼은 `type="submit"` 이므로 부모가
  // <form onSubmit> 을 쓰면 이 prop 없이도 연결된다. 부모가 <form> 을 쓰지 않는 경우에만
  // 넘길 것 — 둘 다 주면 클릭 한 번에 핸들러가 두 번 돈다.
  onSubmit,
  submitting = false, // 전송 중(스피너 + 처리중 톤)
  submitDisabled = false, // 필수 항목 미충족 등으로 제출 불가
  id = DOCUMENTS_SECTION_ID,
}) {
  return (
    <div className="flex flex-col gap-8">
      <FormSectionCard
        no={SECTION.no}
        title={SECTION.title}
        subtitle={SECTION.subtitle}
        id={id}
      >
        {/* 5-1 재학 증빙 서류 — groupLabel: FileDropzone 은 담당 파일이 아니라 aria-label
            을 줄 수 없다(파일 상단 ⚠ 참고). 선택 완료 뷰에서는 내부 <label htmlFor> 조차
            사라져 숨은 파일 인풋이 이름을 잃으므로, 최소한 그룹 단위 이름은 role="group" +
            aria-labelledby 로 보장한다. */}
        <MentorFieldShell
          fieldId={FILE_FIELD_ID}
          label="재학 증빙 서류"
          required
          groupLabel
          helperText={
            <>
              <Accent>학생증 · 재학증명서 · 대학 합격확인서 중 1개</Accent>를
              올려 주세요. 이름과 대학·학과가 보이도록 촬영해 주시면 확인이
              빠릅니다.
            </>
          }
        >
          {/* 에러는 드롭존이 직접 표시한다 — 형식·용량 위반은 드롭존이 자체 검출하므로
              부모 에러와 한 자리에서 합쳐 보여주는 편이 원인 파악이 쉽다. */}
          <div
            role="group"
            aria-labelledby={getMentorFieldLabelId(FILE_FIELD_ID)}
          >
            <FileDropzone
              id={FILE_INPUT_ID}
              value={file}
              onChange={onFileChange}
              error={errors.proof_file}
              uploadStatus={uploadStatus}
            />
          </div>
        </MentorFieldShell>

        {/* 5-2 휴대폰 본인인증 — 발송/확인 시퀀스와 상태 메시지는 PhoneVerifyField 소유다.
            여기 라벨의 htmlFor 는 번호 인풋을 정확히 가리킨다(id 를 공유). */}
        <MentorFieldShell
          fieldId={PHONE_INPUT_ID}
          label="휴대폰 본인인증"
          required
          helperText="타인 명의 지원을 막기 위한 절차입니다. "
        >
          <PhoneVerifyField
            id={PHONE_INPUT_ID}
            value={values.phone ?? ""}
            onChange={(next) => onChange?.("phone", next)}
            verified={phoneVerified}
            onVerified={onPhoneVerified}
            // 값 형식·필수 에러(errors.phone)와 인증 미완료 에러(errors.phone_verified)는
            // 서로 배타적이라(MentorApplyForm.jsx validateDocumentsSection) 동시에 값을
            // 가질 수 없다 — 어느 쪽이 왔든 이 컨트롤이 그대로 보여준다(리뷰 WARN #1).
            error={errors.phone_verified || errors.phone}
          />
        </MentorFieldShell>

        {/* 5-3 약관 동의 — 필수 3종(이용약관·개인정보·본인인증)이 전부 체크돼야 제출 가능하다.
            체크 상태는 `values` 가 아니라 별도 `agreements` 맵으로 오르내린다(DB 는 agree_* 로
            펼쳐진 boolean 컬럼 5개라 폼 상태에서도 한 덩어리로 두는 편이 매핑이 단순하다).
            groupLabel: MentorAgreementBlock 은 담당 파일이 아니라 그룹 컨테이너에 이름을
            달아줄 prop 이 없다(파일 상단 ⚠ 참고) — role="group" + aria-labelledby 로 보강한다. */}
        <MentorFieldShell
          fieldId={AGREEMENT_FIELD_ID}
          label="약관 동의"
          required
          groupLabel
        >
          <div
            role="group"
            aria-labelledby={getMentorFieldLabelId(AGREEMENT_FIELD_ID)}
          >
            <MentorAgreementBlock
              items={MENTOR_AGREEMENTS}
              values={agreements}
              onToggle={onAgreementToggle}
              onToggleAll={onAgreementToggleAll}
              error={errors.agreements}
            />
          </div>
        </MentorFieldShell>
      </FormSectionCard>

      {/* ※ 선발 취소 사유 안내(§6-7, 3413:5637) — 배경 없음, 제목↔본문 gap 8.
          제목만 error(#EB2626), 본문은 ink.sub(#808080). 둘 다 Medium 14 / lh 1.4. */}
      <div className="flex flex-col gap-2">
        <p className="text-sm font-medium leading-[1.4] text-error">
          {CANCELLATION_NOTICE.title}
        </p>
        <p className="break-keep text-sm font-medium leading-[1.4] text-ink-sub">
          {CANCELLATION_NOTICE.body}
        </p>
      </div>

      {/* 제출 버튼(§6-8, 3413:5592) — auth/PrimaryButton 을 그대로 쓴다.
          시안 규격 h 81 / radius 20 / 라벨 20 은 PrimaryButton 의 lg 프리셋(h 60 / radius 14 /
          20px)과 다르므로 높이·라운드만 className 으로 덮는다.
            · 높이 : `min-h-` 는 `h-` 와 다른 속성이라 순서에 관계없이 항상 이긴다.
            · 라운드: 같은 속성이라 `!` 로 명시적으로 이긴다(선례 BoardListPage.jsx:227).
          ⚠ 시안 라벨 굵기는 Medium 이지만 PrimaryButton 은 SemiBold 고정이다. 굵기까지 덮으면
             "그대로 재사용" 이 아니게 되고 버튼 자체의 정체성이 흔들려 그대로 둔다.
          ⚠ 시안에는 **비활성 상태만** 그려져 있다(bg #F5F5F7 / 텍스트 #808080, 확인 항목 ㉘).
             활성 색은 시안 부재라 PrimaryButton 기본(bg-primary)을 쓰고, 비활성만 시안값
             (surface.muted + ink.sub)으로 덮는다 — 활성 톤은 **파생**이다.
             `disabled:` 변형은 의사클래스가 붙어 PrimaryButton 의 평문 `bg-line text-white`
             보다 특이도가 높으므로 순서와 무관하게 이긴다. 다만 처리중(loading)일 때도
             disabled 속성이 켜지므로, 그때는 처리중 톤(bg-primary/80)을 살리려고 뺀다. */}
      <PrimaryButton
        type="submit"
        size="lg"
        radius="lg"
        onClick={onSubmit}
        disabled={submitDisabled}
        loading={submitting}
        className={`min-h-[5.0625rem] !rounded-[1.25rem] ${
          submitting ? "" : "disabled:bg-surface-muted disabled:text-ink-sub"
        }`}
      >
        {SUBMIT_BUTTON_LABEL}
      </PrimaryButton>
    </div>
  );
}
