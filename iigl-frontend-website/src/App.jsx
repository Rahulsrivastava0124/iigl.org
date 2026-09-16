import AvailableCoursesSection from './components/sections/AvailableCoursesSection.jsx';
import BlogPage, { BlogArticlePage } from './components/sections/BlogPage.jsx';
import BranchPage from './components/sections/BranchPage.jsx';
import CompanyCertificatesSection from './components/sections/CompanyCertificatesSection.jsx';
import CoursePage from './components/sections/CoursePage.jsx';
import EducationPage from './components/sections/EducationPage.jsx';
import VerifyReportPage from './components/sections/VerifyReportPage.jsx';
import EducationSection from './components/sections/EducationSection.jsx';
import FaqSection from './components/sections/FaqSection.jsx';
import GallerySection from './components/sections/GallerySection.jsx';
import Footer from './components/sections/Footer.jsx';
import HeroSection from './components/sections/HeroSection.jsx';
import IiglReportsSection from './components/sections/IiglReportsSection.jsx';
import OurBranchesSection from './components/sections/OurBranchesSection.jsx';
import Navbar from './components/sections/Navbar.jsx';
import ReportCategoriesSection from './components/sections/ReportCategoriesSection.jsx';
import RegisteredCustomersSection from './components/sections/RegisteredCustomersSection.jsx';
import ReviewsSection from './components/sections/ReviewsSection.jsx';
import StatsSection from './components/sections/StatsSection.jsx';
import WhyChooseSection from './components/sections/WhyChooseSection.jsx';

export default function App() {
  // One page besides the home page: a branch's own, at /branches/<id>.
  const branchId = window.location.pathname.match(/^\/branches\/(\d+)\/?$/)?.[1];
  // And a course's own, at /courses/<id>.
  const courseId = window.location.pathname.match(/^\/courses\/(\d+)\/?$/)?.[1];
  // And the Education page, at /education.
  const education = /^\/education\/?$/.test(window.location.pathname);
  // Verify Report, at /verify-report — and /verify-report/<id>, the address
  // every printed report's QR code carries.
  const verify = window.location.pathname.match(/^\/verify-report(?:\/(\d+))?\/?$/);
  // The blog, at /blog, and one article at /blog/<slug>.
  const blog = window.location.pathname.match(/^\/blog(?:\/([^/]+))?\/?$/);

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
      {branchId ? (
        <BranchPage id={branchId} />
      ) : courseId ? (
        <CoursePage id={courseId} />
      ) : verify ? (
        <VerifyReportPage id={verify[1]} />
      ) : blog ? (
        blog[1] ? <BlogArticlePage slug={blog[1]} /> : <BlogPage />
      ) : education ? (
        <EducationPage />
      ) : (
        <>
      <HeroSection />
      <StatsSection />
      <WhyChooseSection />
      <ReportCategoriesSection />
      <IiglReportsSection />
      <EducationSection />
      <AvailableCoursesSection />
      <ReviewsSection />
      <CompanyCertificatesSection />
      <RegisteredCustomersSection />
      <GallerySection />
      <OurBranchesSection />
      <FaqSection />
        </>
      )}
      <Footer />
    </div>
  );
}
