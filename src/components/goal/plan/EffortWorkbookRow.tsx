import { X } from "lucide-react";
import { type KeyboardEvent, useEffect, useState } from "react";
import {
  getBookDarkTextClass,
  getBookLightBgClass,
} from "@/components/goal/subjectTokens";
import { computeAchievementRate } from "@/lib/goal/workbookProgress";

// 「공부 중인 책」 인셋 박스 안의 문제집 1권 인라인 편집 행 — Figma 4026:6046.
// 제목/현재·전체 페이지를 인라인 입력(dashed)으로 바로 편집하고 blur/Enter에 저장한다
// (시안에 별도 수정 모달이 없다 — 팀장 지시: AddWorkbookModal은 이제 신규 등록에만
// 쓴다). 삭제는 시안에 없어 제목 행 우측 작은 ×로 넣고, 기존 인라인 2단계 확인
// 패턴(CouponAdmin.tsx voidingId)을 그대로 준용한다. 달성률 100%면 "완독! 책장에
// 꽂기" 버튼이 나타난다 — 서버가 자동으로 책장에 옮기지 않고 이 버튼을 눌러야
// shelved_at이 채워진다(수동 전이, supabase/migrations/
// 20260902043539_goal_workbooks_shelved_at.sql).

export type EffortBook = {
  id: string | number;
  title: string;
  currentPage: number | null;
  totalPages: number | null;
};

type EffortWorkbookRowProps = {
  book: EffortBook;
  // 과목 id(korean/math/english/science/etc) — 진행바 채움/완독 버튼 색 계산용.
  subject: string;
  onUpdate: (
    id: string | number,
    patch: { title?: string; currentPage?: number },
  ) => Promise<boolean>;
  onDelete: (id: string | number) => Promise<boolean>;
  onShelve: (id: string | number) => Promise<boolean>;
};

/** 키 입력이 멈춘 뒤 자동 저장까지의 지연. */
const AUTOSAVE_DELAY_MS = 600;

export default function EffortWorkbookRow({
  book,
  subject,
  onUpdate,
  onDelete,
  onShelve,
}: EffortWorkbookRowProps) {
  const [title, setTitle] = useState(book.title);
  const [currentPage, setCurrentPage] = useState(String(book.currentPage ?? 0));
  // 전체 페이지는 등록 시 확정되고 이후 수정 불가(사용자 확정 2026-09-02) —
  // 입력이 아니라 표시만 한다. 현재 페이지는 0~전체 범위로 잠근다.
  const totalPages = book.totalPages ?? 0;
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [shelving, setShelving] = useState(false);

  // 서버 재조회로 같은 책의 제목/진도가 바뀌면(다른 탭에서 수정 등) 로컬 초안을 다시
  // 채운다. book.id는 의존성에 넣지 않는다 — 이 컴포넌트는 EffortSubjectCard에서
  // key={book.id}로 렌더되므로 다른 책으로 바뀌는 경우는 항상 재마운트고, 같은
  // 인스턴스가 살아있는 동안은 book.id가 바뀔 일이 없다(biome
  // lint/correctness/useExhaustiveDependencies 지적 반영).
  useEffect(() => {
    setTitle(book.title);
    setCurrentPage(String(book.currentPage ?? 0));
    setConfirmingDelete(false);
  }, [book.title, book.currentPage]);

  const rate = computeAchievementRate(Number(currentPage) || 0, totalPages);
  // "완독! 책장에 꽂기"는 달성률 표시값(내림)이 아니라 실제 페이지 비교로 판정한다 —
  // 서버 status(current >= total)와 같은 기준. 입력 중인(아직 blur 안 한) 값도
  // 포함해 마지막 쪽을 치는 순간 버튼이 뜬다; 저장은 handleShelve가 꽂기 전에 한다.
  const typedCurrent = Math.min(
    Math.max(Number(currentPage) || 0, 0),
    totalPages,
  );
  const isComplete = totalPages > 0 && typedCurrent >= totalPages;

  function clampCurrentPage(raw: string) {
    if (raw === "") return "";
    const value = Math.floor(Number(raw));
    if (!Number.isFinite(value)) return "";
    return String(Math.min(Math.max(value, 0), totalPages));
  }
  const lightBg = getBookLightBgClass(subject);
  const darkText = getBookDarkTextClass(subject);

  // 자동 저장(사용자 확정 2026-09-02): 별도 저장 버튼 없이 입력이 멈추면 저장한다.
  // blur/Enter 저장(commitTitle/commitPages)은 그대로 두되, 키 입력 후 일정 시간
  // 지나면 먼저 저장해 "언제 저장되지?"가 없게 한다. 저장이 끝나면 부모가 새 book을
  // 내려보내 위 useEffect가 상태를 맞추므로 여기서 되돌릴 건 실패 시뿐이다.
  useEffect(() => {
    const trimmed = title.trim();
    if (!trimmed || trimmed === book.title) return;
    const timer = window.setTimeout(() => {
      void onUpdate(book.id, { title: trimmed });
    }, AUTOSAVE_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, [title, book.id, book.title, onUpdate]);

  useEffect(() => {
    if (currentPage === "") return;
    const next = Math.min(Math.max(Number(currentPage) || 0, 0), totalPages);
    if (next === (book.currentPage ?? 0)) return;
    const timer = window.setTimeout(() => {
      void onUpdate(book.id, { currentPage: next });
    }, AUTOSAVE_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, [currentPage, totalPages, book.id, book.currentPage, onUpdate]);

  async function commitTitle() {
    const trimmed = title.trim();
    if (!trimmed || trimmed === book.title) {
      setTitle(book.title);
      return;
    }
    const ok = await onUpdate(book.id, { title: trimmed });
    if (!ok) setTitle(book.title);
  }

  async function commitPages() {
    const nextCurrent = Math.min(
      Math.max(Number(currentPage) || 0, 0),
      totalPages,
    );
    const prevCurrent = book.currentPage ?? 0;
    if (nextCurrent === prevCurrent) {
      setCurrentPage(String(prevCurrent));
      return;
    }
    const ok = await onUpdate(book.id, { currentPage: nextCurrent });
    if (!ok) setCurrentPage(String(prevCurrent));
  }

  function blurOnEnter(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Enter") {
      event.currentTarget.blur();
    }
  }

  async function handleConfirmDelete() {
    if (deleting) return;
    setDeleting(true);
    try {
      await onDelete(book.id);
    } finally {
      setDeleting(false);
    }
  }

  async function handleShelve() {
    if (shelving) return;
    setShelving(true);
    try {
      // 입력만 하고 blur 전에 바로 꽂기를 누른 경우 — 서버는 저장된 current_page로
      // status를 판정하므로 미저장 페이지를 먼저 반영한 뒤 꽂는다.
      if (typedCurrent !== (book.currentPage ?? 0)) {
        const saved = await onUpdate(book.id, { currentPage: typedCurrent });
        if (!saved) return;
      }
      await onShelve(book.id);
    } finally {
      setShelving(false);
    }
  }

  return (
    <div
      className={`flex w-full flex-col gap-1.5${shelving ? " book-row-out" : ""}`}
    >
      <div className="flex items-center gap-1.5">
        <input
          type="text"
          aria-label="문제집 이름"
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          onBlur={commitTitle}
          onKeyDown={blurOnEnter}
          className="h-7 w-full min-w-0 rounded-md border border-dashed border-surface-01 bg-goal-card px-2 text-[1rem] text-ink-strong focus:border-ink-strong focus:outline-hidden"
        />

        {confirmingDelete ? (
          <div className="flex shrink-0 items-center gap-1.5">
            <button
              type="button"
              onClick={handleConfirmDelete}
              disabled={deleting}
              className="text-[0.75rem] font-semibold text-error transition-opacity hover:opacity-80 disabled:opacity-50"
            >
              {deleting ? "삭제 중" : "삭제"}
            </button>
            <button
              type="button"
              onClick={() => setConfirmingDelete(false)}
              disabled={deleting}
              className="text-[0.75rem] font-medium text-ink-sub transition-colors hover:text-ink-strong disabled:opacity-50"
            >
              취소
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setConfirmingDelete(true)}
            aria-label="문제집 삭제"
            className="flex h-5 w-5 shrink-0 items-center justify-center text-ink-sub transition-colors hover:text-error"
          >
            <X size={14} />
          </button>
        )}
      </div>

      <div className="flex items-center gap-1.5">
        <input
          type="number"
          aria-label="현재 페이지"
          min={0}
          max={totalPages}
          value={currentPage}
          onChange={(event) =>
            setCurrentPage(clampCurrentPage(event.target.value))
          }
          onBlur={commitPages}
          onKeyDown={blurOnEnter}
          className="h-7 w-15 rounded-md border border-dashed border-surface-01 bg-goal-card px-2 text-[1rem] text-ink-strong focus:border-ink-strong focus:outline-hidden"
        />
        <span className="text-[1rem] font-medium text-ink-natural">/</span>
        <output
          aria-label="전체 페이지"
          className="flex h-7 w-15 items-center rounded-md border border-surface-01 bg-goal-activePill px-2 text-[1rem] text-ink-sub"
        >
          {totalPages}
        </output>
        <span className="ml-auto text-[0.75rem] text-ink-natural">{rate}%</span>
      </div>

      <div className="h-3 w-full overflow-hidden rounded-full bg-goal-activePill">
        <div
          className={`h-full rounded-full ${lightBg}`}
          style={{ width: `${rate}%` }}
        />
      </div>

      {isComplete && (
        <button
          type="button"
          onClick={handleShelve}
          disabled={shelving}
          className={`flex h-9 w-full items-center justify-center rounded-md text-[1rem] font-medium transition-opacity hover:opacity-90 disabled:opacity-50 ${lightBg} ${darkText}`}
        >
          {shelving ? "책장에 꽂는 중…" : "완독! 책장에 꽂기"}
        </button>
      )}
    </div>
  );
}
