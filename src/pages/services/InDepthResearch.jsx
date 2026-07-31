import ServiceLandingPage from '../../components/services/ServiceLandingPage';
import { SERVICE_LANDING_CONTENT } from '../../data/serviceLandingContent';

// 심화탐구 서비스 랜딩 — /services/research (구 경로 /page/services-in-depth-research)
export default function InDepthResearch() {
  return <ServiceLandingPage content={SERVICE_LANDING_CONTENT.research} />;
}
