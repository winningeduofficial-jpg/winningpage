import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { ChevronDown, LogOut, Settings, X } from 'lucide-react';
import { MY_MENU } from './myMenuItems';

const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), input, select, textarea, [tabindex]:not([tabindex="-1"])';

// 헤더 nav(desktop:flex 미만)를 대체하는 전체화면 드로어.
// 5개 nav 그룹 + 로그인 상태의 마이페이지/관리자/로그아웃(또는 로그인/회원가입)을 아코디언으로 노출한다.
export default function MobileNavDrawer({
  open,
  onClose,
  navGroups,
  shouldShowLoggedInHeader,
  isLoggedIn,
  displayName,
  memberLabel,
  csatDDay,
  isAdmin,
  onLogout,
  triggerRef
}) {
  const panelRef = useRef(null);
  const closeButtonRef = useRef(null);
  const [openGroup, setOpenGroup] = useState(null);

  useEffect(() => {
    if (!open) return undefined;

    const { style } = document.body;
    const previousOverflow = style.overflow;
    style.overflow = 'hidden';

    return () => {
      style.overflow = previousOverflow;
    };
  }, [open]);

  useEffect(() => {
    if (!open) return undefined;

    closeButtonRef.current?.focus();

    function handleKeyDown(event) {
      if (event.key === 'Escape') {
        event.preventDefault();
        onClose();
        return;
      }

      if (event.key !== 'Tab') return;

      const panel = panelRef.current;
      if (!panel) return;

      const focusable = Array.from(panel.querySelectorAll(FOCUSABLE_SELECTOR)).filter(
        (el) => !el.hasAttribute('disabled')
      );

      if (focusable.length === 0) return;

      const first = focusable[0];
      const last = focusable[focusable.length - 1];

      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }

    document.addEventListener('keydown', handleKeyDown);

    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      triggerRef?.current?.focus();
    };
  }, [open, onClose, triggerRef]);

  useEffect(() => {
    if (!open) {
      setOpenGroup(null);
    }
  }, [open]);

  function toggleGroup(title) {
    setOpenGroup((prev) => (prev === title ? null : title));
  }

  return (
    <div
      className={`fixed inset-0 z-[60] desktop:hidden ${open ? '' : 'pointer-events-none'}`}
      aria-hidden={!open}
    >
      <div
        className={`absolute inset-0 bg-black/40 transition-opacity duration-300 ease-[var(--ease-out-quart)] motion-reduce:transition-none motion-reduce:duration-0 ${
          open ? 'opacity-100' : 'opacity-0'
        }`}
        onClick={onClose}
      />

      <div
        id="mobile-nav-drawer"
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label="전체 메뉴"
        className={`absolute right-0 top-0 flex h-full w-[85vw] max-w-[22rem] flex-col overflow-y-auto bg-white shadow-[-18px_0_45px_rgba(13,27,42,0.14)] transition-transform duration-300 ease-[var(--ease-out-quart)] motion-reduce:transition-none motion-reduce:duration-0 ${
          open ? 'translate-x-0' : 'translate-x-full'
        }`}
      >
        <div className="flex items-center justify-between border-b border-[#eeeeee] px-6 py-5">
          {shouldShowLoggedInHeader ? (
            <div className="flex items-center gap-2 whitespace-nowrap">
              <span className="rounded bg-[#013262] px-2.5 py-1 text-xs text-white">
                {csatDDay}
              </span>
              <span className="text-sm font-medium text-[#1e293b]">
                {displayName}님{memberLabel ? ` ${memberLabel}` : ''}
              </span>
            </div>
          ) : (
            <span className="text-lg font-semibold text-[#013262]">메뉴</span>
          )}

          <button
            ref={closeButtonRef}
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
            const hasDropdown = Array.isArray(group.items) && group.items.length > 0;
            const isOpen = openGroup === group.title;

            return (
              <div key={group.title} className="border-b border-[#eeeeee]">
                <div className="flex items-center">
                  <Link
                    to={group.to}
                    onClick={onClose}
                    className="flex-1 whitespace-nowrap px-4 py-4 text-lg font-medium text-[#1e293b]"
                  >
                    {group.title}
                  </Link>

                  {hasDropdown && (
                    <button
                      type="button"
                      onClick={() => toggleGroup(group.title)}
                      aria-expanded={isOpen}
                      aria-controls={`mobile-nav-group-${group.title}`}
                      aria-label={`${group.title} 하위 메뉴 ${isOpen ? '닫기' : '열기'}`}
                      className="inline-flex h-11 w-11 shrink-0 items-center justify-center text-[#4d4d4d]"
                    >
                      <ChevronDown
                        size={18}
                        strokeWidth={2.2}
                        className={`transition ${isOpen ? 'rotate-180' : ''}`}
                      />
                    </button>
                  )}
                </div>

                {hasDropdown && (
                  <div
                    id={`mobile-nav-group-${group.title}`}
                    className={`overflow-hidden transition-[grid-template-rows] duration-300 ease-[var(--ease-out-quart)] motion-reduce:transition-none motion-reduce:duration-0 grid ${
                      isOpen ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'
                    }`}
                  >
                    <div className="min-h-0">
                      {group.items.map((item) => (
                        <Link
                          key={`${group.title}-${item.to}-${item.label}`}
                          to={item.to}
                          onClick={onClose}
                          className="block whitespace-nowrap px-8 py-3 text-base text-[#525252] transition hover:text-[#013262]"
                        >
                          {item.label}
                        </Link>
                      ))}
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
              {MY_MENU.map((item) => {
                const Icon = item.icon;

                return (
                  <Link
                    key={item.label}
                    to={item.to}
                    onClick={onClose}
                    className="flex items-center gap-3 whitespace-nowrap px-4 py-3 text-base font-medium text-[#4d4d4d] transition hover:text-[#013262]"
                  >
                    <Icon size={18} />
                    {item.label}
                  </Link>
                );
              })}

              {isAdmin && (
                <Link
                  to="/admin"
                  onClick={onClose}
                  className="flex items-center gap-3 whitespace-nowrap px-4 py-3 text-base font-medium text-[#4d4d4d] transition hover:text-[#013262]"
                >
                  <Settings size={18} />
                  관리자
                </Link>
              )}

              <button
                type="button"
                onClick={() => {
                  onClose();
                  onLogout();
                }}
                className="mt-2 flex w-full items-center justify-center gap-2 whitespace-nowrap rounded-lg bg-[#013262] px-6 py-3 text-base font-medium text-[#f5f5f5] transition hover:bg-[#012347]"
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
              className="flex w-full items-center justify-center gap-2 whitespace-nowrap rounded-lg border border-[#d7d7d7] px-6 py-3 text-base font-medium text-[#1e293b] transition hover:border-[#013262] hover:text-[#013262]"
            >
              로그아웃
            </button>
          ) : (
            <div className="flex flex-col gap-3">
              <Link
                to="/login"
                onClick={onClose}
                className="flex items-center justify-center whitespace-nowrap rounded-lg border border-[#d7d7d7] px-6 py-3 text-base font-medium text-[#1e293b] transition hover:border-[#013262] hover:text-[#013262]"
              >
                로그인
              </Link>

              <Link
                to="/signup"
                onClick={onClose}
                className="flex items-center justify-center whitespace-nowrap rounded-lg bg-[#013262] px-6 py-3 text-base font-medium text-[#f5f5f5] transition hover:bg-[#012347]"
              >
                회원가입
              </Link>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
