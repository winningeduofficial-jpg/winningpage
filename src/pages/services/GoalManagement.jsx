import ServiceLandingPage from '../../components/services/ServiceLandingPage';
import { SERVICE_LANDING_CONTENT } from '../../data/serviceLandingContent';

// 목표관리 서비스 랜딩 — /services/goal (구 경로 /page/services-goal)
export default function GoalManagement() {
  return <ServiceLandingPage content={SERVICE_LANDING_CONTENT.goal} />;
}
