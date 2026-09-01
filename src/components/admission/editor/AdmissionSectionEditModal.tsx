import type { ReactNode } from "react";
import AdmissionSurface from "@/components/admission/AdmissionSurface";
import AdmissionModalStyles from "@/components/admission/modal/AdmissionModalStyles";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import AdmissionEditorSurface from "./AdmissionEditorSurface";

// 어드민 대학모집요강 "카테고리 편집" 다이얼로그.
//
// 껍데기 변경(2026-08-24): 공개 모달과 공유하던 AdmissionModalShell을 버리고
// shadcn/ui Dialog(src/components/ui/dialog.tsx)로 전환했다 — 이 메뉴(어드민
// 대입 모집 요강) 한정. 사용자 지시:
//   1. 목록 [수정] 진입 시 뒤에 깔리는 "전체 편집 폼 화면"은 코드상 유지
//      (AdminForm이 저장 엔진으로 계속 산다 — AdminEngine.tsx 모드 A 주석).
//   2. 모달만 shadcn/ui로 교체.
// 공개 모달(AdmissionGuidelines + AdmissionModalShell)과 메타 수정 모달
// (AdmissionMetaEditModal)은 건드리지 않는다.
//
// 본문은 이 파일이 만들지 않고 children 으로 받는다 — 편집 필드 렌더는
// AdminEngine 의 기존 코드(AdmissionDocFieldEditor / raw·html details)를 그대로
// 재사용해야 편집 고유 기능(IME, 행·열 조작, 그룹헤더, 컬럼 role, xlsx 왕복,
// 각주, 비표 블록)이 하나도 죽지 않기 때문이다.
//
// ⚠ 본문 클래스가 `admission-editor-modal-body` 인 것은 실수가 아니다
// -----------------------------------------------------------------
// 공개 모달 본문(.admission-modal-body)에는 네이티브 가로 스크롤바를 숨기는
// 규칙이 걸려 있다. 공개는 그 대신 하단에 프록시 바를 그리므로 문제가
// 없지만, 어드민 편집 표(실측 1280px)에는 프록시가 없다 — 그 클래스를
// 물려받는 순간 1280px 표를 스크롤할 수단 자체가 사라진다(커밋 9a9f3f0 이
// 고친 실제 사고). 이름을 다르게 해서 숨김 규칙이 도달할 셀렉터 경로를
// 문법적으로 없앴다. 여기에 'admission-modal-body' 를 쓰지 마라 —
// src/pages/AdmissionGuidelines.modalShell.test.tsx 의 소스 스캔 락이 막는다.
// 편집 표의 스크롤 래퍼(.admission-scroll-table)는 이미 overflow-x:auto 라
// 숨김 규칙만 안 걸리면 네이티브 바가 그대로 나온다.
//
// AdmissionModalStyles 를 계속 렌더하는 이유: .admission-editor-modal-body 의
// overscroll-behavior/scrollbar-gutter 규칙을 그 파일이 소유한다. 시트 계열
// (.admission-modal-sheet*) 규칙은 이제 이 모달의 DOM 에 매칭되지 않아
// 죽은 코드가 아니라 "공개 모달용"으로만 산다.

type AdmissionSectionEditModalProps = {
  open: boolean;
  sectionKey?: string;
  sectionLabel?: string;
  universityName?: string;
  dirty?: boolean;
  origin?: "list" | "form";
  onClose: () => void;
  onSave: () => void;
  children?: ReactNode;
};

export default function AdmissionSectionEditModal({
  open,
  sectionKey,
  sectionLabel,
  universityName,
  dirty = false,
  // 'list' = 목록에서 직행(닫기 = 목록 복귀), 'form' = 폼에서 진입(닫기 = 폼 복귀)
  origin = "form",
  onClose,
  onSave,
  children,
}: AdmissionSectionEditModalProps) {
  // children 은 AdminForm 의 form 상태 필드를 직접 읽으므로 닫힘 상태에서는
  // 아예 평가되지 않게 언마운트한다(AdmissionModalShell 시절과 동일 계약).
  if (!open) return null;

  const closeLabel = origin === "list" ? "닫기" : "폼으로";

  return (
    <>
      {/* 표면 CSS 는 어드민 라우트에도 로드돼야 한다. 셋 다 <style> 만 렌더하는
          컴포넌트라 DOM 노드를 만들지 않는다. AdmissionEditorSurface 는 공개와
          갈리는 **편집 전용** 폭 규칙만 갖고 있고, 읽는 사람이 "공개 → 편집
          덮어쓰기" 순서로 이해하도록 뒤에 둔다. */}
      <AdmissionModalStyles />
      <AdmissionSurface showSectionTitle showChangeNoColumn />
      <AdmissionEditorSurface />
      <Dialog
        open
        onOpenChange={(next) => {
          if (!next) onClose();
        }}
      >
        {/* shadcn 기본(grid gap-4 p-4 sm:max-w-sm)을 편집 표 규격으로 덮는다:
            내부 스크롤을 본문 div 하나에 몰기 위해 p-0 + flex-col, 폭은 구
            모달과 동일한 md:w-[min(78vw,70rem)] (sm:max-w-sm 해제). */}
        <DialogContent className="flex max-h-[85vh] w-full flex-col gap-0 overflow-hidden p-0 sm:max-w-[calc(100%-2rem)] md:w-[min(78vw,70rem)]">
          <DialogHeader className="border-b px-6 pb-4 pt-6 text-left md:px-12">
            <p className="text-sm font-medium text-primary">
              <span className="inline-flex items-center gap-2">
                {universityName || "(대학명 없음)"}
                {dirty && (
                  // 거짓 유실 경고가 아니다: 편집 상태는 모달이 아니라 AdminForm 이
                  // 들고 있으므로 이 모달을 닫아도 값은 살아 있다. 다만 DB 에는
                  // 아직 안 갔다는 사실만 알린다.
                  <span className="inline-flex items-center gap-1 rounded-full bg-[#fff4e5] px-2 py-0.5 text-xs font-black text-[#b45309]">
                    ● 저장 안 됨
                  </span>
                )}
              </span>
            </p>
            <DialogTitle className="text-xl">{sectionLabel}</DialogTitle>
          </DialogHeader>
          <div
            data-section={sectionKey}
            className="admission-editor-modal-body admission-surface flex-1 overflow-auto bg-white px-6 py-4 md:px-12"
          >
            {children}
          </div>
          {/* shadcn 기본 -mx-4 -mb-4 는 DialogContent p-4 상쇄용 — 여기는 p-0
              이므로 0 으로 되돌리고 좌우 패딩을 본문과 맞춘다. */}
          <DialogFooter className="mx-0 mb-0 flex-row items-center justify-between gap-3 px-6 py-4 sm:justify-between md:px-12">
            <p className="text-xs font-bold text-muted-foreground">
              변경은 [저장]을 눌러야 DB에 반영됩니다.
            </p>
            <div className="flex gap-2">
              <Button type="button" variant="outline" onClick={onClose}>
                {closeLabel}
              </Button>
              <Button type="button" onClick={onSave}>
                저장
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
