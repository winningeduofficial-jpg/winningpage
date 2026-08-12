import { useSearchParams } from 'react-router-dom';
import GrowthReportBody from '../../components/goal/report/GrowthReportBody';

const VALID_PERIODS = ['weekly', 'monthly'];

// 성장 리포트 라우트(#33 주간 / #34 월간) — 얇은 페이지 셸. 쿼리 파라미터 `period`로 탭 상태를
// URL에 유지하고, 실제 렌더는 셸-비종속 `GrowthReportBody`(components/goal/report/)에 위임한다.
export default function GrowthReport() {
  const [searchParams, setSearchParams] = useSearchParams();
  const periodParam = searchParams.get('period');
  const period = VALID_PERIODS.includes(periodParam) ? periodParam : 'weekly';

  function handlePeriodChange(nextPeriod) {
    setSearchParams((prev) => {
      const params = new URLSearchParams(prev);
      params.set('period', nextPeriod);
      return params;
    });
  }

  return <GrowthReportBody period={period} onPeriodChange={handlePeriodChange} />;
}
