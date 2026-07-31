import ServiceLandingPage from '../../components/services/ServiceLandingPage';
import { SERVICE_LANDING_CONTENT } from '../../data/serviceLandingContent';

// 자기평가 서비스 랜딩 — /services/self-assessment (구 경로 /page/services-self-assessment)
export default function SelfAssessment() {
  return <ServiceLandingPage content={SERVICE_LANDING_CONTENT.selfAssessment} />;
}
