import { Dialog as DialogPrimitive } from "@base-ui/react/dialog";
import { ChevronDown, LogOut, X } from "lucide-react";
import { useEffect, useState } from "react";
import { Link, useLocation } from "react-router";
import { Dialog, DialogOverlay, DialogPortal } from "@/components/ui/dialog";
import type { useNavGroups } from "@/hooks/useNavGroups";
import { buildMyMenu, type MyMenuRole } from "./myMenuItems";

type NavGroups = ReturnType<typeof useNavGroups>;

type MobileNavDrawerProps = {
  open: boolean;
  onClose: () => void;
  navGroups: NavGroups;
  shouldShowLoggedInHeader: boolean;
  isLoggedIn: boolean;
  displayName: string;
  memberLabel: string;
  myMenuRole: MyMenuRole;
  csatDDay: string;
  onLogout: () => void;
  triggerRef: React.RefObject<HTMLButtonElement | null>;
  // 현재 경로가 속한 nav 그룹 타이틀 — Header의 activePathTitle(정확 일치 → 첫 세그먼트
  // 2단계 판정)을 그대로 받아 데스크톱 nav와 활성 표시 기준을 일치시킨다.
  activeGroupTitle?: string | null;
};

// 헤더 햄버거(전체메뉴) 버튼으로 여는 전체화면 드로어. 모바일 전용이 아니라 데스크톱에서도
// nav 5개 메뉴와 병행 노출된다(전체메뉴 버튼 클릭 시 뷰포트 무관하게 항상 열린다).
// 5개 nav 그룹 + 로그인 상태의 마이페이지/관리자/로그아웃(또는 로그인/회원가입)을 아코디언으로 노출한다.
//
// ESC 닫기·포커스 트랩·배경 스크롤 잠금은 shadcn Dialog(Base UI) 내장 동작이 처리한다.
// 트리거(헤더 햄버거 버튼)가 Dialog.Trigger가 아니라 별도 ref로 넘어오므로, 닫힐 때
// 포커스 복귀 대상은 Popup의 finalFocus로 명시한다.
//
// **닫힘 애니메이션이 계약이다.** Base UI Popup은 CSS 트랜지션이 걸린 요소를 감지하면
// 닫힘 시에도 트랜지션이 끝날 때까지 DOM에서 내리지 않는다 — data-open/data-closed
// 셀렉터로 translate-x 트랜지션을 걸어주면 기존의 "DOM 유지 + translate-x-full +
// pointer-events-none" 수동 구현과 동일한 슬라이드 아웃이 재현된다.
export default function MobileNavDrawer({
  open,
  onClose,
  navGroups,
  shouldShowLoggedInHeader,
  isLoggedIn,
  displayName,
  memberLabel,
  myMenuRole,
  csatDDay,
  onLogout,
  triggerRef,
  activeGroupTitle = null,
}: MobileNavDrawerProps) {
  const [openGroup, setOpenGroup] = useState<string | null>(null);
  const { pathname } = useLocation();

  useEffect(() => {
    if (!open) {
      setOpenGroup(null);
    }
  }, [open]);

  function toggleGroup(title: string) {
    setOpenGroup((prev) => (prev === title ? null : title));
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
    >
      <DialogPortal>
        <DialogOverlay className="bg-black/40" />
        <DialogPrimitive.Popup
          // Header의 햄버거 버튼이 aria-controls="mobile-nav-drawer"로 이 패널을
          // 가리킨다 — Base UI가 자동 부여하는 useId 대신 이 고정 id를 유지해야 한다.
          id="mobile-nav-drawer"
          data-slot="dialog-content"
          finalFocus={triggerRef}
          // Base UI Popup은 aria-modal을 자동 배선하지 않는다 — 리터럴로 명시.
          aria-modal="true"
          aria-label="전체 메뉴"
          className="fixed inset-y-0 right-0 z-60 flex h-full w-[85vw] max-w-88 flex-col overflow-y-auto bg-white shadow-[-18px_0_45px_rgba(13,27,42,0.14)] outline-none transition-transform duration-300 ease-(--ease-out-quart) motion-reduce:transition-none motion-reduce:duration-0 data-closed:translate-x-full data-open:translate-x-0"
        >
          <div className="flex items-center justify-between border-b border-[#eeeeee] px-6 py-5">
            {shouldShowLoggedInHeader ? (
              <div className="flex items-center gap-2 whitespace-nowrap">
                <span className="rounded-sm bg-primary px-2.5 py-1 text-xs text-white">
                  {csatDDay}
                </span>
                <span className="text-sm font-medium text-[#1e293b]">
                  {displayName}님{memberLabel ? ` ${memberLabel}` : ""}
                </span>
              </div>
            ) : (
              <span className="text-lg font-semibold text-primary">메뉴</span>
            )}

            <button
              type="button"
              onClick={onClose}
              aria-label="메뉴 닫기"
              className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-[#1e293b] transition hover:bg-[#f5f8fb]"
            >
              <X size={22} />
            </button>
          </div>

          <nav className="flex-1 px-2 py-2">
            {navGroups.map((group) => {
              const hasDropdown =
                Array.isArray(group.items) && group.items.length > 0;
              const isOpen = openGroup === group.title;
              const isGroupActive = activeGroupTitle === group.title;

              return (
                <div key={group.title} className="border-b border-[#eeeeee]">
                  <div className="flex items-center">
                    <Link
                      to={group.to}
                      onClick={onClose}
                      aria-current={isGroupActive ? "page" : undefined}
                      className={`flex-1 whitespace-nowrap px-4 py-4 text-lg ${
                        isGroupActive
                          ? "font-semibold text-primary"
                          : "font-medium text-[#1e293b]"
                      }`}
                    >
                      {group.title}
                    </Link>

                    {hasDropdown && (
                      <button
                        type="button"
                        onClick={() => toggleGroup(group.title)}
                        aria-expanded={isOpen}
                        aria-controls={`mobile-nav-group-${group.title}`}
                        aria-label={`${group.title} 하위 메뉴 ${isOpen ? "닫기" : "열기"}`}
                        className="inline-flex h-11 w-11 shrink-0 items-center justify-center text-ink-header"
                      >
                        <ChevronDown
                          size={18}
                          strokeWidth={2.2}
                          className={`transition ${isOpen ? "rotate-180" : ""}`}
                        />
                      </button>
                    )}
                  </div>

                  {hasDropdown && (
                    <div
                      id={`mobile-nav-group-${group.title}`}
                      className={`overflow-hidden transition-[grid-template-rows] duration-300 ease-(--ease-out-quart) motion-reduce:transition-none motion-reduce:duration-0 grid ${
                        isOpen ? "grid-rows-[1fr]" : "grid-rows-[0fr]"
                      }`}
                    >
                      <div className="min-h-0">
                        {group.items.map((item) => {
                          const isItemActive = item.to === pathname;
                          return (
                            <Link
                              key={`${group.title}-${item.to}-${item.label}`}
                              to={item.to}
                              onClick={onClose}
                              aria-current={isItemActive ? "page" : undefined}
                              className={`block whitespace-nowrap px-8 py-3 text-base transition hover:text-primary ${
                                isItemActive
                                  ? "font-semibold text-primary"
                                  : "text-ink"
                              }`}
                            >
                              {item.label}
                            </Link>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </nav>

          <div className="border-t border-[#eeeeee] px-4 py-4">
            {shouldShowLoggedInHeader ? (
              <>
                {/* 역할별 단일 소스(myMenuItems.buildMyMenu) — 관리자도 별도 버튼 없이
                    이 목록의 "관리자 메뉴" 항목으로 진입한다. */}
                {buildMyMenu(myMenuRole).map((item) => (
                  <Link
                    key={item.label}
                    to={item.to}
                    onClick={onClose}
                    className="flex items-center gap-3 whitespace-nowrap px-4 py-3 text-base font-medium text-ink-header transition hover:text-primary"
                  >
                    {item.label}
                  </Link>
                ))}

                <button
                  type="button"
                  onClick={() => {
                    onClose();
                    onLogout();
                  }}
                  className="mt-2 flex w-full items-center justify-center gap-2 whitespace-nowrap rounded-lg bg-primary px-6 py-3 text-base font-medium text-[#f5f5f5] transition hover:bg-[#012347]"
                >
                  <LogOut size={16} />
                  로그아웃
                </button>
              </>
            ) : isLoggedIn ? (
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onLogout();
                }}
                className="flex w-full items-center justify-center gap-2 whitespace-nowrap rounded-lg border border-line px-6 py-3 text-base font-medium text-[#1e293b] transition hover:border-primary hover:text-primary"
              >
                로그아웃
              </button>
            ) : (
              <div className="flex flex-col gap-3">
                <Link
                  to="/login"
                  onClick={onClose}
                  className="flex items-center justify-center whitespace-nowrap rounded-lg border border-line px-6 py-3 text-base font-medium text-[#1e293b] transition hover:border-primary hover:text-primary"
                >
                  로그인
                </Link>

                <Link
                  to="/signup"
                  onClick={onClose}
                  className="flex items-center justify-center whitespace-nowrap rounded-lg bg-primary px-6 py-3 text-base font-medium text-[#f5f5f5] transition hover:bg-[#012347]"
                >
                  회원가입
                </Link>
              </div>
            )}
          </div>
        </DialogPrimitive.Popup>
      </DialogPortal>
    </Dialog>
  );
}
