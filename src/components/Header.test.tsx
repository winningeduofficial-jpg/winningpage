import "@testing-library/jest-dom/vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { describe, expect, it, vi } from "vitest";
import Header from "./Header";

// QA 행241·242·327 회귀 테스트. useNavGroups는 실제 구현(cleanText·isSameObject 등)을
// 그대로 쓰고 그룹 목록만 고정값으로 바꾼다 — 실 Supabase 조회가 테스트에 영향을 주지
// 않게 하기 위함이다(Onboarding.test.tsx의 useAuth 스텁 관례를 따른다).
vi.mock("@/hooks/useNavGroups", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/hooks/useNavGroups")>();
  return {
    ...actual,
    useNavGroups: () => [
      { title: "서비스", to: "/services", items: [] },
      { title: "프리미엄", to: "/premium", items: [] },
      { title: "입시정보", to: "/info", items: [] },
      { title: "이용신청", to: "/apply", items: [] },
      { title: "고객안내", to: "/support", items: [] },
    ],
  };
});

const mockUseAuth = vi.fn();
vi.mock("@/context/AuthProvider", () => ({
  useAuth: () => mockUseAuth(),
}));

// Header가 세션 확정 후 profiles 테이블을 조회한다(queryProfileById 등) — 실제 네트워크
// 대신 이 mock으로 프로필 행을 즉시/항상 돌려준다. queryProfileById가 byId?.name으로
// 곧장 성공하므로 select/eq 체인 어떤 필드로 불려도 이 한 응답으로 충분하다.
let mockProfileRow: Record<string, unknown> | null = null;
vi.mock("@/lib/supabase", () => ({
  supabase: {
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({ data: mockProfileRow, error: null }),
        }),
      }),
    }),
    // src/lib/queryClient.ts가 모듈 로드 시점에 구독한다(전역 SIGNED_OUT 캐시 클리어) —
    // Header import 체인에 딸려오므로 구독 해제 함수까지 최소 형태로 스텁한다.
    auth: {
      onAuthStateChange: () => ({
        data: { subscription: { unsubscribe: () => {} } },
      }),
    },
  },
}));

function renderHeader() {
  return render(
    <MemoryRouter>
      <Header />
    </MemoryRouter>,
  );
}

describe("Header — 햄버거 표시 조건(QA 행242)", () => {
  it("데스크톱 브레이크포인트 이상에서는 숨겨지는 클래스(desktop:hidden)를 갖는다", () => {
    mockUseAuth.mockReturnValue({
      session: null,
      user: null,
      isReady: true,
    });
    renderHeader();

    const hamburger = screen.getByRole("button", { name: "전체 메뉴 열기" });
    expect(hamburger.className).toContain("desktop:hidden");
  });
});

describe("Header — 로그인 상태 계정 그룹(QA 행241)", () => {
  it("프로필 로딩 완료 시 이름 칩이 /mypage 링크가 되고, 별도 마이페이지 버튼은 없다", async () => {
    mockProfileRow = {
      id: "u1",
      email: "student@test.com",
      name: "홍길동",
      member_type: "student",
      role: "student",
    };
    mockUseAuth.mockReturnValue({
      session: { user: { id: "u1", email: "student@test.com" } },
      user: { id: "u1", email: "student@test.com" },
      isReady: true,
    });

    renderHeader();

    const nameChip = await screen.findByRole("link", { name: "마이페이지" });
    expect(nameChip).toHaveAttribute("href", "/mypage");
    expect(nameChip.textContent).toContain("홍길동");

    // "마이페이지"라는 별도 텍스트를 가진 버튼/링크가 더 없어야 한다(이름 칩 자체가
    // aria-label="마이페이지"인 유일한 마이페이지 진입점).
    expect(screen.getAllByRole("link", { name: "마이페이지" })).toHaveLength(1);
    expect(
      screen.queryByRole("button", { name: "마이페이지" }),
    ).not.toBeInTheDocument();
  });

  it("로그인은 됐지만 프로필이 없으면 마이페이지 버튼 없이 로그아웃만 보인다", async () => {
    mockProfileRow = null;
    mockUseAuth.mockReturnValue({
      session: { user: { id: "u2", email: "loading@test.com" } },
      user: { id: "u2", email: "loading@test.com" },
      isReady: true,
    });

    renderHeader();

    await screen.findByRole("button", { name: "로그아웃" });
    expect(
      screen.queryByRole("link", { name: "마이페이지" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "마이페이지" }),
    ).not.toBeInTheDocument();
  });
});

describe("Header — 비로그인 상태", () => {
  it("로그인/회원가입 링크를 보여준다", () => {
    mockUseAuth.mockReturnValue({ session: null, user: null, isReady: true });
    renderHeader();

    expect(screen.getByRole("link", { name: "로그인" })).toHaveAttribute(
      "href",
      "/login",
    );
    expect(screen.getByRole("link", { name: "회원가입" })).toHaveAttribute(
      "href",
      "/signup",
    );
  });

  it("게스트 메가 패널은 프로모 카드(로그인하기 CTA)를 보여주고 MY 항목은 없다", () => {
    mockUseAuth.mockReturnValue({ session: null, user: null, isReady: true });
    renderHeader();

    // nav mock 그룹은 items: []라 hasDropdown이 false다(§8 오픈 트리거는 nav 항목
    // 자체가 아니라 로고로도 검증 가능 — 로고는 hasDropdown과 무관하게 항상 연다).
    const logo = screen.getByRole("link", { name: "위닝에듀" });
    fireEvent.mouseOver(logo);

    expect(screen.getByRole("link", { name: "로그인하기" })).toHaveAttribute(
      "href",
      "/login",
    );
    expect(screen.queryByText("MY페이지")).not.toBeInTheDocument();
  });
});

describe("Header — 관리자 단독 버튼 부재(2026-09-03 시안 §6-1)", () => {
  it("관리자 로그인 시에도 별도 '관리자' 버튼/링크가 없다", async () => {
    mockProfileRow = {
      id: "u3",
      email: "admin@test.com",
      name: "관리자짱",
      member_type: "admin",
      role: "admin",
    };
    mockUseAuth.mockReturnValue({
      session: { user: { id: "u3", email: "admin@test.com" } },
      user: { id: "u3", email: "admin@test.com" },
      isReady: true,
    });

    renderHeader();

    await screen.findByRole("link", { name: "마이페이지" });

    expect(
      screen.queryByRole("link", { name: "관리자" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "관리자" }),
    ).not.toBeInTheDocument();
  });
});

describe("Header — 메가 패널 chevron 회전(§6-2·§8)", () => {
  it("이름 칩 hover로 패널이 열리면 chevron이 90도 회전 클래스를 갖는다", async () => {
    mockProfileRow = {
      id: "u1",
      email: "student@test.com",
      name: "홍길동",
      member_type: "student",
      role: "student",
    };
    mockUseAuth.mockReturnValue({
      session: { user: { id: "u1", email: "student@test.com" } },
      user: { id: "u1", email: "student@test.com" },
      isReady: true,
    });

    renderHeader();

    const nameChip = await screen.findByRole("link", { name: "마이페이지" });
    const chevron = screen.getByTestId("header-mega-chevron");

    expect(chevron.className).not.toContain("rotate-90");

    fireEvent.mouseOver(nameChip.parentElement?.parentElement as Element);

    expect(chevron.className).toContain("rotate-90");
  });
});

describe("Header — MY 컬럼 역할별 항목(§6-3, buildMyMenu 단일 소스)", () => {
  async function openMyColumn() {
    const nameChip = await screen.findByRole("link", { name: "마이페이지" });
    fireEvent.mouseOver(nameChip.parentElement?.parentElement as Element);
  }

  it("학생은 MY페이지·나의 서비스·신청 내역·내 정보 수정 4개를 본다", async () => {
    mockProfileRow = {
      id: "u1",
      email: "student@test.com",
      name: "홍길동",
      member_type: "student",
      role: "student",
    };
    mockUseAuth.mockReturnValue({
      session: { user: { id: "u1", email: "student@test.com" } },
      user: { id: "u1", email: "student@test.com" },
      isReady: true,
    });

    renderHeader();
    await openMyColumn();

    expect(screen.getByText("MY페이지")).toBeInTheDocument();
    expect(screen.getByText("나의 서비스")).toBeInTheDocument();
    expect(screen.getByText("신청 내역")).toBeInTheDocument();
    expect(screen.getByText("내 정보 수정")).toBeInTheDocument();
    expect(screen.queryByText("자녀 등록 및 수정")).not.toBeInTheDocument();
  });

  it("학부모는 MY페이지·자녀 등록 및 수정·신청 내역·내 정보 수정 4개를 본다", async () => {
    mockProfileRow = {
      id: "u2",
      email: "parent@test.com",
      name: "이혜진",
      member_type: "parent",
      role: "parent",
    };
    mockUseAuth.mockReturnValue({
      session: { user: { id: "u2", email: "parent@test.com" } },
      user: { id: "u2", email: "parent@test.com" },
      isReady: true,
    });

    renderHeader();
    await openMyColumn();

    expect(screen.getByText("MY페이지")).toBeInTheDocument();
    expect(screen.getByText("자녀 등록 및 수정")).toBeInTheDocument();
    expect(screen.getByText("신청 내역")).toBeInTheDocument();
    expect(screen.getByText("내 정보 수정")).toBeInTheDocument();
    expect(screen.queryByText("나의 서비스")).not.toBeInTheDocument();
  });

  it("관리자는 MY페이지·관리자 메뉴·내 정보 수정 3개를 본다", async () => {
    mockProfileRow = {
      id: "u3",
      email: "admin@test.com",
      name: "관리자짱",
      member_type: "admin",
      role: "admin",
    };
    mockUseAuth.mockReturnValue({
      session: { user: { id: "u3", email: "admin@test.com" } },
      user: { id: "u3", email: "admin@test.com" },
      isReady: true,
    });

    renderHeader();
    await openMyColumn();

    expect(screen.getByText("MY페이지")).toBeInTheDocument();
    expect(screen.getByText("관리자 메뉴")).toBeInTheDocument();
    expect(screen.getByText("내 정보 수정")).toBeInTheDocument();
    expect(screen.queryByText("나의 서비스")).not.toBeInTheDocument();
    expect(screen.queryByText("자녀 등록 및 수정")).not.toBeInTheDocument();
  });
});

describe("Header — 햄버거 위치(§6-7)", () => {
  it("햄버거는 로고와 함께 좌표계 1 밴드(justify-between)의 마지막 자식에 위치한다", () => {
    // nav는 0d3f8487 이전 구조로 되돌아가 좌표계 2(absolute overlay)에 별도로 뜬다 —
    // 더는 이 밴드의 형제가 아니라서 nav 대비 DOM 순서로는 검증할 수 없다. 대신 "로고
    // 옆에 붙는" 버그(§6-7)의 실제 원인이었던 구조 — 좌표계 1 밴드가 정확히 [로고,
    // 햄버거+계정 그룹] 2개 자식만 갖고 justify-between으로 배치되는지를 검증한다.
    mockUseAuth.mockReturnValue({ session: null, user: null, isReady: true });
    renderHeader();

    const hamburger = screen.getByRole("button", { name: "전체 메뉴 열기" });
    const band = hamburger.closest("header")?.firstElementChild;

    expect(band?.className).toContain("justify-between");
    expect(band?.children).toHaveLength(2);
    expect(band?.lastElementChild?.contains(hamburger)).toBe(true);
  });
});
