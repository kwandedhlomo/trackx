import { BrowserRouter, Routes, Route } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import ProtectedRoute from "../components/ProtectedRoute";

// Import pages
import HomePage from "../pages/HomePage";
import LandingPage from "../pages/LandingPage";
import SignInPage from "../pages/SignInPage";
import RegisterPage from "../pages/RegisterPage";
import OverviewPage from "../pages/OverviewPage";
import SimulationPage from "../pages/SimulationPage";
import NewCasePage from "../pages/NewCasePage";
import AnnotationsPage from "../pages/AnnotationsPage";
import ManageCasesPage from "../pages/ManageCasesPage";
import VerifyEmailPage from "../pages/VerifyEmailPage";
import EditCasePage from "../pages/EditCase";


//LOOKS DIFFERENT, BUT VERY SIMILAR TO BEFORE 
// ADDED A TAG FOR ROUTES WHICH ARE PROTECTED (NEED AUTH)
// ADDED A TAG FOR ROUTES WHICH ARE NOT PROTECTED (NO NEED FOR AUTH)


function AppRouter() {
  const { loading } = useAuth();

  // Optional: while checking auth state, don't load routes yet
  if (loading) return null;

  return (
    <BrowserRouter>
      <Routes>
        {/* Public routes (no login required) */}
        <Route path="/" element={<LandingPage />} />
        <Route path="/signin" element={<SignInPage />} />
        <Route path="/register" element={<RegisterPage />} />
        <Route path="/verify-email" element={<VerifyEmailPage />} />

        {/* Protected routes — only accessible if logged in and verified */}
        <Route
          path="/home"
          element={
            <ProtectedRoute>
              <HomePage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/overview"
          element={
            <ProtectedRoute>
              <OverviewPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/simulation"
          element={
            <ProtectedRoute>
              <SimulationPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/new-case"
          element={
            <ProtectedRoute>
              <NewCasePage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/annotations"
          element={
            <ProtectedRoute>
              <AnnotationsPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/manage-cases"
          element={
            <ProtectedRoute>
              <ManageCasesPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/edit-case"
          element={
            <ProtectedRoute>
              <EditCasePage />
            </ProtectedRoute>
          }
        />
      </Routes>
    </BrowserRouter>
  );
}export default AppRouter;