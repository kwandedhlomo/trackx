import { BrowserRouter, Routes, Route } from "react-router-dom";

// Import your pages
import HomePage from "../pages/HomePage";
// (Later: import LandingPage from "../pages/LandingPage";
//         import SignInPage from "../pages/SignInPage";
//         import ManageCasesPage, etc.)

function AppRouter() {
  return (
    <BrowserRouter>
      <Routes>
        {/* Define all your page routes here */}
        <Route path="/home" element={<HomePage />} />
        
        {/* Future routes (once you create the pages) */}
        {/* <Route path="/" element={<LandingPage />} /> */}
        {/* <Route path="/signin" element={<SignInPage />} /> */}
        {/* <Route path="/manage-cases" element={<ManageCasesPage />} /> */}
        {/* <Route path="/new-case" element={<NewCasePage />} /> */}
        {/* <Route path="/annotation" element={<AnnotationPage />} /> */}
        {/* <Route path="/overview" element={<OverviewPage />} /> */}
        {/* <Route path="/simulation" element={<SimulationPage />} /> */}
      </Routes>
    </BrowserRouter>
  );
}

export default AppRouter;