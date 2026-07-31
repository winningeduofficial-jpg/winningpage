import ServiceLandingPage from '../../components/services/ServiceLandingPage';
import { SERVICE_LANDING_CONTENT } from '../../data/serviceLandingContent';

// 수행평가(AI 수행평가) 서비스 랜딩 — /services/performance (구 경로 /page/services-ai-performance)
export default function PerformanceAssessment() {
  return <ServiceLandingPage content={SERVICE_LANDING_CONTENT.performance} />;
}
