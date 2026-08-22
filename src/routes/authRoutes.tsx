import type { RouteObject } from "react-router";
import { Outlet } from "react-router";
import { SignupProvider } from "@/context/SignupContext";
import FindAccount from "@/pages/FindAccount";
import Login from "@/pages/Login";
// 회원가입 플로우(§5.2) — 유형 선택 → 생년월일 → 학생/학부모 분기 폼 → 완료/온보딩
import MemberType from "@/pages/signup/MemberType";
import InviteChild from "@/pages/signup/parent/InviteChild";
import InviteDone from "@/pages/signup/parent/InviteDone";
import LinkChoice from "@/pages/signup/parent/LinkChoice";
import LinkCode from "@/pages/signup/parent/LinkCode";
import LinkDone from "@/pages/signup/parent/LinkDone";
import ParentForm from "@/pages/signup/parent/ParentForm";
import ParentHome from "@/pages/signup/parent/ParentHome";
import StudentBirth from "@/pages/signup/StudentBirth";
import StudentComplete from "@/pages/signup/StudentComplete";
import StudentForm from "@/pages/signup/StudentForm";
import Under14Form from "@/pages/signup/Under14Form";
import Under14Verify from "@/pages/signup/Under14Verify";
import UnifiedSignupForm from "@/pages/signup/UnifiedSignupForm";

// 신규 노드 2516-1974('통합 가입 폼', docs/impl-status-recheck.md §4) — 시안 미확정(손그림
// 낙서) 임시 라우트라 플래그가 켜져 있을 때만 등록한다. 꺼져 있으면 라우트 자체가 없으므로
// 직접 URL 진입도 자연히 막힌다(UnifiedSignupForm.jsx 내부의 이중 방어 useEffect와 함께).
const UNIFIED_SIGNUP_ENABLED =
  import.meta.env.VITE_UNIFIED_SIGNUP_ENABLED === "true";

// /signup 하위 라우트 전용 컨텍스트 경계 — 유형 선택부터 완료/온보딩까지 단계 간 데이터
// (memberType/birthDate/폼데이터/인증 상태)를 SignupProvider(§5.3)로 공유한다.
function SignupFlowLayout() {
  return (
    <SignupProvider>
      <Outlet />
    </SignupProvider>
  );
}

// 로그인·회원가입 리뉴얼(§5.2) — 헤더/푸터 포함 풀 페이지가 시안 확정이므로
// SiteLayout 안으로 편입(구 Login.jsx/Signup.jsx의 pt-16 보정 관례 그대로 재사용).
const authRoutes: RouteObject[] = [
  { path: "/login", Component: Login },
  // 아이디·비밀번호 찾기 — 탭 하나에 두 기능이 들어간다(와이어프레임 구조).
  // ?tab=password 로 비밀번호 탭을 바로 열 수 있게 해 로그인 화면의 두 링크가
  // 같은 페이지를 가리키면서도 각자 자기 탭으로 들어오게 한다.
  { path: "/find-account", Component: FindAccount },

  {
    Component: SignupFlowLayout,
    children: [
      { path: "/signup", Component: MemberType },
      { path: "/signup/student/birth", Component: StudentBirth },
      { path: "/signup/student", Component: StudentForm },
      {
        path: "/signup/student/under14/verify",
        Component: Under14Verify,
      },
      { path: "/signup/student/under14", Component: Under14Form },
      ...(UNIFIED_SIGNUP_ENABLED
        ? [{ path: "/signup/unified", Component: UnifiedSignupForm }]
        : []),
      { path: "/signup/student/complete", Component: StudentComplete },
      { path: "/signup/parent", Component: ParentForm },
      { path: "/signup/parent/link", Component: LinkChoice },
      {
        path: "/signup/parent/link/add",
        Component: () => <LinkChoice mode="add" />,
      },
      { path: "/signup/parent/link/code", Component: LinkCode },
      { path: "/signup/parent/link/done", Component: LinkDone },
      { path: "/signup/parent/invite", Component: InviteChild },
      { path: "/signup/parent/invite/done", Component: InviteDone },
      { path: "/signup/parent/home", Component: ParentHome },
    ],
  },
];

export default authRoutes;
