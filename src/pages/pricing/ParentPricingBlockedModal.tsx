import { useNavigate } from "react-router-dom";
import ConfirmModal from "../../components/checkout/ConfirmModal";

// 학부모가 "이용신청 > 서비스요금"(/pricing)으로 들어왔을 때 뜨는 차단 모달
// (2026-08-12b 팀 리드 지시). 학부모는 이 화면에서 새 상품을 직접 결제할 수
// 없다 — 결제는 항상 학생의 요청을 마이페이지에서 수락하는 경로로만 간다
// (sql/68·69 제품 규칙).
//
// 모달 마크업은 ConfirmModal(src/components/checkout/ConfirmModal.jsx, 시안
// 3921:7480 실측 기반 공용 컴포넌트)을 재사용한다(2026-08-12d 팀 리드 지시 —
// 같은 결제 흐름 안에서 학생 실패 모달과 이 모달의 생김새가 갈리면 안 된다).
// 이전에 이 파일이 직접 그리던 자체 마크업(overlay+카드+제목+본문+버튼, 약
// 30줄)은 걷어냈다 — ConfirmModal.jsx 자체는 다른 에이전트 소유라 손대지
// 않았다.
//
// 배경 클릭·ESC·확인 전부 /mypage(replace) 로 통일한다(2026-08-12c 팀 리드
// 지시 유지) — 이 페이지엔 학부모가 볼 다른 내용이 없으므로 모달을 닫기만
// 하고 빈 화면에 남겨두지 않는다. ConfirmModal 은 onClose(ESC·오버레이 클릭)
// 와 onConfirm(버튼, 생략 시 onClose 로 대체)을 분리해 받으므로 둘 다 같은
// goMyPage 를 물려 세 경로를 하나로 합친다.
//
// "페이지 접근 전" 차단(2026-08-12c 사용자 확정) — 이 컴포넌트는 서비스요금
// 본문 위에 모달을 "띄우는" 게 아니라 페이지 자체를 이 컴포넌트로 완전히
// "대체"한다. Pricing.jsx 가 memberType==='parent' 일 때 PricingSelling 대신
// 이 컴포넌트 하나만 반환하므로(다른 파일, 조건부 return) 서비스요금 본문은
// 애초에 렌더되지 않는다 — 아래 main 은 헤더 아래 빈 배경일 뿐 실제 페이지
// 콘텐츠가 아니다. 배경에 아무것도 비치지 않아야 "페이지 접근 전" 요구가
// 성립하므로, 이 배경을 채우거나 실제 콘텐츠로 바꾸지 말 것.
//
// 문구 — 2026-08-12c 사용자 승인(짧게 축약, "페이지 접근 전" 노출 확정).
const TITLE = "학생이 요청한 결제만 진행할 수 있어요";
const BODY = "학생이 결제를 요청하면 마이페이지에서 진행할 수 있어요.";

export default function ParentPricingBlockedModal() {
  const navigate = useNavigate();

  function goMyPage() {
    navigate("/mypage", { replace: true });
  }

  return (
    <>
      {/* 이 빈 main 이 "페이지 대체"의 실체다 — 뒤에 서비스요금 본문이 없으므로
          비칠 콘텐츠 자체가 없다(위 파일 상단 주석 참고). */}
      <main className="min-h-screen bg-white pt-16" />
      <ConfirmModal title={TITLE} onConfirm={goMyPage} onClose={goMyPage}>
        {BODY}
      </ConfirmModal>
    </>
  );
}
