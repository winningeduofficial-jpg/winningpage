import "@testing-library/jest-dom/vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import ChangePhoneModal from "./ChangePhoneModal";

// QA 행240 — 휴대폰 번호 변경을 "본인 확인(auth) → 새 번호 입력(form)" 두
// 단계로 나눈 전이를 검증한다. sendPhoneCode/verifyPhoneCode 는 auth 단계
// 전이와 무관해 실제 모듈을 그대로 쓰고(supabase.auth 만 모킹), Header.test.tsx
// 의 vi.mock("@/lib/supabase") 관례를 따른다.
const mockGetSession = vi.fn();
const mockSignInWithPassword = vi.fn();

vi.mock("@/lib/supabase", () => ({
  supabase: {
    auth: {
      getSession: (...args: unknown[]) => mockGetSession(...args),
      signInWithPassword: (...args: unknown[]) =>
        mockSignInWithPassword(...args),
    },
  },
}));

function renderModal() {
  return render(
    <ChangePhoneModal open currentPhone="01012345678" onClose={() => {}} />,
  );
}

describe("ChangePhoneModal — 본인 확인 게이트(QA 행240)", () => {
  beforeEach(() => {
    mockGetSession.mockReset();
    mockSignInWithPassword.mockReset();
    mockGetSession.mockResolvedValue({
      data: { session: { user: { email: "student@example.com" } } },
    });
  });

  it("모달을 열면 비밀번호를 먼저 요구하는 auth 단계로 시작한다", () => {
    renderModal();

    expect(screen.getByText("본인 확인이 필요해요")).toBeInTheDocument();
    expect(screen.queryByText("새 휴대폰 번호")).not.toBeInTheDocument();
  });

  it("비밀번호가 틀리면 에러 문구를 보여주고 auth 단계에 머문다", async () => {
    mockSignInWithPassword.mockResolvedValue({
      error: { status: 400, message: "Invalid login credentials" },
    });
    renderModal();

    fireEvent.change(
      screen.getByPlaceholderText("본인 확인을 위해 비밀번호를 입력해주세요"),
      {
        target: { value: "wrong-password" },
      },
    );
    fireEvent.click(screen.getByRole("button", { name: "확인" }));

    await waitFor(() =>
      expect(
        screen.getByText("비밀번호가 일치하지 않아요."),
      ).toBeInTheDocument(),
    );
    expect(screen.getByText("본인 확인이 필요해요")).toBeInTheDocument();
  });

  it("비밀번호가 맞으면 새 번호 입력(form) 단계로 넘어가고 비밀번호 입력칸은 사라진다", async () => {
    mockSignInWithPassword.mockResolvedValue({ error: null });
    renderModal();

    fireEvent.change(
      screen.getByPlaceholderText("본인 확인을 위해 비밀번호를 입력해주세요"),
      {
        target: { value: "correct-password" },
      },
    );
    fireEvent.click(screen.getByRole("button", { name: "확인" }));

    await waitFor(() =>
      expect(screen.getByText("휴대폰 번호를 변경해요")).toBeInTheDocument(),
    );
    expect(screen.getByText("새 휴대폰 번호")).toBeInTheDocument();
    expect(
      screen.queryByPlaceholderText("본인 확인을 위해 비밀번호를 입력해주세요"),
    ).not.toBeInTheDocument();
    expect(mockSignInWithPassword).toHaveBeenCalledWith({
      email: "student@example.com",
      password: "correct-password",
    });
  });
});
