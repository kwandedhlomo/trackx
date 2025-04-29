import { BrowserRouter, Routes, Route } from "react-router-dom";

// Import pages
import HomePage from "../pages/HomePage";
import LandingPage from "../pages/LandingPage";
import SignInPage from "../pages/SignInPage";
import RegisterPage from "../pages/RegisterPage";
import OverviewPage from "../pages/OverviewPage";
// (Later: import LandingPage from "../pages/LandingPage";
//         import SignInPage from "../pages/SignInPage";
//         import ManageCasesPage, etc.)

function AppRouter() {
  return (
    <BrowserRouter>
      <Routes>
        {/* Define all your page routes here */}
        {/* I made Landing page not have a route, so it will be the default route */}
        <Route path="/" element={<LandingPage />} />     
        <Route path="/home" element={<HomePage />} />
        <Route path="/signin" element={<SignInPage />} />
        <Route path="/register" element={<RegisterPage />} />
        <Route path="/overview"element={<OverviewPage />} />


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