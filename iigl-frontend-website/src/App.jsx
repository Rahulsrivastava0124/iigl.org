import AvailableCoursesSection from './components/sections/AvailableCoursesSection.jsx';
import EducationSection from './components/sections/EducationSection.jsx';
import FaqSection from './components/sections/FaqSection.jsx';
import Footer from './components/sections/Footer.jsx';
import HeroSection from './components/sections/HeroSection.jsx';
import IiglReportsSection from './components/sections/IiglReportsSection.jsx';
import OurBranchesSection from './components/sections/OurBranchesSection.jsx';
import Navbar from './components/sections/Navbar.jsx';
import ReportCategoriesSection from './components/sections/ReportCategoriesSection.jsx';
import ReviewsSection from './components/sections/ReviewsSection.jsx';
import WhyChooseSection from './components/sections/WhyChooseSection.jsx';

export default function App() {
  return (
    <div className="min-h-screen overflow-x-clip bg-white text-[#2c3b64]">
      {/* Paint server for `.icon-gold-outline svg`, which strokes with
          `url(#goldGradient)`. Defined once here: a gradient is document-scoped,
          and every disc on the page refers back to this one. */}
      <svg aria-hidden focusable="false" className="absolute h-0 w-0">
        <defs>
          <linearGradient id="goldGradient" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#8a5a00" />
            <stop offset="25%" stopColor="#d4a72c" />
            <stop offset="50%" stopColor="#e3b447" />
            <stop offset="75%" stopColor="#c99216" />
            <stop offset="100%" stopColor="#7a4d00" />
          </linearGradient>
        </defs>
      </svg>

      <Navbar />
      <HeroSection />
      <WhyChooseSection />
      <ReportCategoriesSection />
      <IiglReportsSection />
      <EducationSection />
      <AvailableCoursesSection />
      <ReviewsSection />
      <OurBranchesSection />
      <FaqSection />
      <Footer />
    </div>
  );
}
