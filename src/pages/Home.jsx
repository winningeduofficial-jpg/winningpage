import HeroSlider from '../components/HeroSlider';
import StatsBar from '../components/StatsBar';
import ServiceCards from '../components/ServiceCards';
import ReviewSection from '../components/ReviewSection';

export default function Home() {
  return (
    <main className="bg-slate-50">
      <HeroSlider />
      <StatsBar />
      <ServiceCards />
      <ReviewSection />
    </main>
  );
}
