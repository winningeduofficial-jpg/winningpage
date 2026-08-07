import AdmissionModalShell from '../modal/AdmissionModalShell';
import AdmissionModalStyles from '../modal/AdmissionModalStyles';
import AdmissionSurface from '../AdmissionSurface';
import AdmissionEditorSurface from './AdmissionEditorSurface';

// 어드민 대학모집요강 "카테고리 편집" 다이얼로그.
//
// 사용자 기획: "입시정보 > 대학모집요강(서비스)과 어드민 > 대학모집요강,
// 둘 다 같은 표가 나와야 한다. **다이얼로그도 마찬가지.** 서비스에서는
// '보기' 등 뷰어모드, 어드민에서는 '수정' 등 편집모드."
// 직전 피드백: "아직도 2뎁스잖아."
//
// 그래서 껍데기는 공개 모달과 **같은 컴포넌트**(AdmissionModalShell)를 쓰고,
// 본문만 뷰어(AdmissionSectionView) 대신 편집기(DocBlocksEditor 등)를 받는다.
// 본문은 이 파일이 만들지 않고 children 으로 받는다 — 편집 필드 렌더는
// Admin.jsx 의 기존 코드(AdmissionDocFieldEditor / raw·html details)를 그대로
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
// scripts/verify-admission-modal-shell.mjs 의 소스 스캔 락이 막는다.
// 편집 표의 스크롤 래퍼(.admission-scroll-table)는 이미 overflow-x:auto 라
// 숨김 규칙만 안 걸리면 네이티브 바가 그대로 나온다.
//
// 프록시 바를 여기에 이식하지 않는 이유(belowBody 를 넘기지 않는다):
//   1. 프록시는 "쉘 padding == 바디 padding" 을 전제로 트랙 폭을 계산한다
//      (BLOCK3 계약, 실패 5건 이력). 편집 바디는 여백 예산이 다르다.
//   2. pickTarget 은 오버플로 최대 요소 1개만 고르고 동기화는 전부에
//      적용한다 — 편집 모달엔 표가 여러 개 공존할 수 있어 보고 있지 않은
//      표가 조용히 움직인다.
//   3. 셀 input Tab 이동의 브라우저 자동 스크롤과 ratio 역대입이 경합한다.

const EDITOR_SHEET_CLASS =
  'admission-modal-sheet flex max-h-[85vh] w-full flex-col overflow-hidden bg-white md:w-[min(78vw,70rem)]';
// 공개(PUBLIC_BODY_CLASS)에서 가져오지 않은 것: admission-modal-body(위 주석)와
// 공개 타이포(text-sm/font-semibold/leading-7/text-[#525252]). 편집기는 입력
// 요소 위주라 본문 타이포를 물려받으면 라벨·도움말까지 굵어진다.
const EDITOR_BODY_CLASS =
  'admission-editor-modal-body admission-surface flex-1 overflow-auto bg-white px-6 py-4 md:px-12';
const EDITOR_FOOTER_CLASS = 'border-t border-[#e5e7eb] bg-white px-6 py-4 md:px-12';

export default function AdmissionSectionEditModal({
  open,
  sectionKey,
  sectionLabel,
  universityName,
  dirty = false,
  // 'list' = 목록에서 직행(닫기 = 목록 복귀), 'form' = 폼에서 진입(닫기 = 폼 복귀)
  origin = 'form',
  onClose,
  onSave,
  children
}) {
  if (!open) return null;

  const closeLabel = origin === 'list' ? '닫기' : '폼으로';

  return (
    <>
      {/* 모달 껍데기 CSS·표면 CSS 는 어드민 라우트에도 로드돼야 한다.
          셋 다 <style> 만 렌더하는 컴포넌트라 DOM 노드를 만들지 않는다.
          AdmissionEditorSurface 는 공개와 갈리는 **편집 전용** 폭 규칙만 갖고
          있고, 반드시 AdmissionSurface 뒤에 와야 하는 건 아니지만(셀렉터
          specificity 가 더 높다) 읽는 사람이 "공개 → 편집 덮어쓰기" 순서로
          이해하도록 뒤에 둔다. */}
      <AdmissionModalStyles />
      <AdmissionSurface showSectionTitle showChangeNoColumn />
      <AdmissionEditorSurface />
      <AdmissionModalShell
        open
        onClose={onClose}
        idPrefix="admission-editor-modal"
        sheetClassName={EDITOR_SHEET_CLASS}
        bodyClassName={EDITOR_BODY_CLASS}
        bodyProps={{ 'data-section': sectionKey }}
        footerClassName={EDITOR_FOOTER_CLASS}
        eyebrow={
          <span className="inline-flex items-center gap-2">
            {universityName || '(대학명 없음)'}
            {dirty && (
              // 거짓 유실 경고가 아니다: 편집 상태는 모달이 아니라 AdminForm 이
              // 들고 있으므로 이 모달을 닫아도 값은 살아 있다. 다만 DB 에는
              // 아직 안 갔다는 사실만 알린다.
              <span className="inline-flex items-center gap-1 rounded-full bg-[#fff4e5] px-2 py-0.5 text-xs font-black text-[#b45309]">
                ● 저장 안 됨
              </span>
            )}
          </span>
        }
        title={sectionLabel}
        footer={
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-xs font-bold text-gray-500">
              변경은 [저장]을 눌러야 DB에 반영됩니다.
            </p>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={onClose}
                className="h-11 rounded-xl bg-[#4b5563] px-6 text-sm font-black text-white transition hover:bg-[#374151]"
              >
                {closeLabel}
              </button>
              <button
                type="button"
                onClick={onSave}
                className="h-11 rounded-xl bg-[#2348ff] px-8 text-sm font-black text-white transition hover:bg-[#1b39cc]"
              >
                저장
              </button>
            </div>
          </div>
        }
      >
        {children}
      </AdmissionModalShell>
    </>
  );
}
