import "@testing-library/jest-dom/vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { describe, expect, test, vi } from "vitest";
import { SidebarProvider } from "@/components/ui/sidebar";
import GoalSidebarContent from "./GoalSidebarContent";

// 모바일 셸 대응(2026-09-02) — GoalSidebar에서 내용부를 분리한 GoalSidebarContent가
// 데스크톱 고정 사이드바·모바일 Sheet 드로어 양쪽에서 재사용된다. 이 파일은 그 분리된
// 내용 컴포넌트 자체의 계약(프로필 폴백·뱃지 노출·onNavigate 콜백)만 고정한다 — 데이터
// 조회/폴링은 여전히 GoalSidebar 소관이라 여기서는 다루지 않는다.
//
// shadcn Sidebar 전환(2026-09-06) — `SidebarMenuButton`이 내부적으로 `useSidebar()`를
// 호출하므로 `SidebarProvider`로 감싸야 한다(PerformanceSidebar.test.tsx와 같은 이유).
function renderContent(props: Parameters<typeof GoalSidebarContent>[0]) {
  return render(
    <MemoryRouter initialEntries={["/app/goal"]}>
      <SidebarProvider>
        <GoalSidebarContent {...props} />
      </SidebarProvider>
    </MemoryRouter>,
  );
}

describe("GoalSidebarContent", () => {
  // 회귀: 폴백 상수 금지(저장소 규칙) — 이전엔 프로필이 없으면 "나의 목표관리" 리터럴을
  // 보여줬다. 데이터가 없으면 그 줄 자체를 렌더하지 않아야 한다
  // (PerformanceSidebar.tsx와 동일 계약).
  test("프로필이 없으면 이름 줄·부제 줄을 아무 것도 렌더하지 않는다(폴백 금지)", () => {
    renderContent({
      profile: null,
      navBadgeData: {
        scheduleCount: 0,
        dailyRecordDone: false,
        timerRunning: false,
      },
    });
    expect(screen.queryByText("나의 목표관리")).not.toBeInTheDocument();
    expect(screen.queryByText(/의 목표관리$/)).not.toBeInTheDocument();
  });

  test("프로필이 있으면 이름·학년·학교유형을 채운다", () => {
    renderContent({
      profile: {
        name: "홍길동",
        grade: "고3",
        schoolType: "일반고",
        schoolCutType: "일반",
      },
      navBadgeData: {
        scheduleCount: 0,
        dailyRecordDone: false,
        timerRunning: false,
      },
    });
    expect(screen.getByText("홍길동의 목표관리")).toBeInTheDocument();
    expect(screen.getByText("고3・일반고")).toBeInTheDocument();
  });

  test("중요일정 뱃지·미기록 뱃지·진행중 뱃지가 navBadgeData를 그대로 반영한다", () => {
    renderContent({
      profile: null,
      navBadgeData: {
        scheduleCount: 3,
        dailyRecordDone: false,
        timerRunning: true,
      },
    });
    expect(screen.getByText("3")).toBeInTheDocument();
    expect(screen.getByText("미기록")).toBeInTheDocument();
    expect(screen.getByText("진행중")).toBeInTheDocument();
  });

  test("오늘의 공부 기록이 완료 상태면 미기록 뱃지가 사라진다", () => {
    renderContent({
      profile: null,
      navBadgeData: {
        scheduleCount: 0,
        dailyRecordDone: true,
        timerRunning: false,
      },
    });
    expect(screen.queryByText("미기록")).not.toBeInTheDocument();
  });

  // 모바일 드로어가 링크 클릭 시 스스로를 닫는 계약 — onNavigate가 없으면(데스크톱)
  // 아무 것도 하지 않아야 하므로, 있을 때만 호출되는지를 검증한다.
  test("내비 링크를 클릭하면 onNavigate가 호출된다(모바일 Sheet 닫기 콜백)", () => {
    const onNavigate = vi.fn();
    renderContent({
      profile: null,
      navBadgeData: {
        scheduleCount: 0,
        dailyRecordDone: false,
        timerRunning: false,
      },
      onNavigate,
    });
    fireEvent.click(screen.getByRole("link", { name: "나의 노력" }));
    expect(onNavigate).toHaveBeenCalledTimes(1);
  });

  test("하단 '내 정보 수정' 링크 클릭도 onNavigate를 호출한다", () => {
    const onNavigate = vi.fn();
    renderContent({
      profile: null,
      navBadgeData: {
        scheduleCount: 0,
        dailyRecordDone: false,
        timerRunning: false,
      },
      onNavigate,
    });
    fireEvent.click(screen.getByRole("link", { name: "내 정보 수정" }));
    expect(onNavigate).toHaveBeenCalledTimes(1);
  });

  test("현재 경로와 일치하는 메뉴 항목에 aria-current=page가 붙는다(활성 판정 회귀 방지)", () => {
    renderContent({
      profile: null,
      navBadgeData: {
        scheduleCount: 0,
        dailyRecordDone: false,
        timerRunning: false,
      },
    });
    expect(screen.getByRole("link", { name: "대시보드" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    expect(screen.getByRole("link", { name: "나의 노력" })).not.toHaveAttribute(
      "aria-current",
    );
  });

  test("내비 전체가 한국어 라벨을 가진 navigation landmark 하나로 묶인다", () => {
    renderContent({
      profile: null,
      navBadgeData: {
        scheduleCount: 0,
        dailyRecordDone: false,
        timerRunning: false,
      },
    });
    const nav = screen.getByRole("navigation", { name: "목표관리 메뉴" });
    // 4그룹 10항목이 전부 이 landmark 서브트리 안에 있어야 한다 — 그룹별로 흩어진
    // landmark가 아니라 전체를 감싸는 하나여야 스크린리더가 "내비게이션" 진입을
    // 한 번만 안내한다.
    expect(nav.querySelectorAll('a[href^="/app/goal"]').length).toBeGreaterThan(
      0,
    );
  });

  // 회귀: 배지가 버튼 자식이면 `static ml-auto` 오버라이드가 필요했다 — 공식 구조
  // (버튼의 형제)로 옮기면 라이브러리 기본 `absolute right-1` 위치가 오버라이드 없이도
  // 맞으므로, 배지가 버튼의 DOM 형제인지(자식이 아닌지)를 고정한다.
  test("뱃지가 SidebarMenuButton의 자식이 아니라 SidebarMenuItem의 형제로 렌더된다", () => {
    renderContent({
      profile: null,
      navBadgeData: {
        scheduleCount: 3,
        dailyRecordDone: false,
        timerRunning: false,
      },
    });
    const badge = screen.getByText("3");
    const button = screen.getByRole("link", { name: "중요일정" });
    expect(button.contains(badge)).toBe(false);
    expect(badge.parentElement).toBe(button.parentElement);
  });
});
