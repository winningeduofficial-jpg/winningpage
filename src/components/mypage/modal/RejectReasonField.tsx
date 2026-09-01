// 반려 사유 입력 textarea — RefundApprovalModal ≈ EnrollmentRequestModal이
// 각자 갖고 있던 2단계(반려 확인) 입력 필드를 공용화한다. 마크업 그대로.

type RejectReasonFieldProps = {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
};

export default function RejectReasonField({
  value,
  onChange,
  placeholder,
}: RejectReasonFieldProps) {
  return (
    <textarea
      rows={2}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className="mt-4 w-full resize-none rounded-xl border border-line px-4 py-3 text-[0.875rem] text-ink outline-hidden focus:border-accent"
    />
  );
}
