import { UserRound, CreditCard, RotateCcw } from 'lucide-react';

// 헤더 데스크톱 드롭다운과 모바일 드로어가 공유하는 마이페이지 메뉴.
export const MY_MENU = [
  { label: '내정보·자녀수정', to: '/mypage', icon: UserRound },
  { label: '수강신청·결제', to: '/pricing', icon: CreditCard },
  { label: '환불신청', to: '/mypage#refund', icon: RotateCcw }
];
