import { useSearchParams } from 'react-router-dom';
import DirectionReportBody from '../../components/goal/report/DirectionReportBody';

const VALID_TABS = ['naesin', 'jeongsi'];

// 학습방향 리포트 라우트(#37 내신 탭 / #38 정시 탭) — 쿼리 파라미터 `tab`으로 상태를 URL에 유지.
export default function DirectionReport() {
  const [searchParams, setSearchParams] = useSearchParams();
  const tabParam = searchParams.get('tab');
  const tab = VALID_TABS.includes(tabParam) ? tabParam : 'naesin';

  function handleTabChange(nextTab) {
    setSearchParams((prev) => {
      const params = new URLSearchParams(prev);
      params.set('tab', nextTab);
      return params;
    });
  }

  return <DirectionReportBody tab={tab} onTabChange={handleTabChange} />;
}
