import HeroSection from './components/sections/HeroSection.jsx';
import Navbar from './components/sections/Navbar.jsx';
import WhyChooseSection from './components/sections/WhyChooseSection.jsx';

export default function App() {
  return (
    <div className="min-h-screen overflow-x-hidden border-t-2 border-[#187bd2] bg-white text-[#2c3b64]">
      <Navbar />
      <HeroSection />
      <WhyChooseSection />
    </div>
  );
}
