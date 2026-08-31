import EducationSection from './components/sections/EducationSection.jsx';
import FaqSection from './components/sections/FaqSection.jsx';
import Footer from './components/sections/Footer.jsx';
import HeroSection from './components/sections/HeroSection.jsx';
import IiglReportsSection from './components/sections/IiglReportsSection.jsx';
import Navbar from './components/sections/Navbar.jsx';
import ReportCategoriesSection from './components/sections/ReportCategoriesSection.jsx';
import ReviewsSection from './components/sections/ReviewsSection.jsx';
import WhyChooseSection from './components/sections/WhyChooseSection.jsx';

export default function App() {
  return (
    <div className="min-h-screen overflow-x-hidden bg-white text-[#2c3b64]">
      <Navbar />
      <HeroSection />
      <WhyChooseSection />
      <ReportCategoriesSection />
      <IiglReportsSection />
      <EducationSection />
      <ReviewsSection />
      <FaqSection />
      <Footer />
    </div>
  );
}
