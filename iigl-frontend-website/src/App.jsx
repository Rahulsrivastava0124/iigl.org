import EducationSection from './components/sections/EducationSection.jsx';
import HeroSection from './components/sections/HeroSection.jsx';
import IiglReportsSection from './components/sections/IiglReportsSection.jsx';
import Navbar from './components/sections/Navbar.jsx';
import ReportCategoriesSection from './components/sections/ReportCategoriesSection.jsx';
import WhyChooseSection from './components/sections/WhyChooseSection.jsx';

export default function App() {
  return (
    <div className="min-h-screen overflow-x-hidden border-t-2 border-[#187bd2] bg-white text-[#2c3b64]">
      <Navbar />
      <HeroSection />
      <WhyChooseSection />
      <ReportCategoriesSection />
      <IiglReportsSection />
      <EducationSection />
    </div>
  );
}
