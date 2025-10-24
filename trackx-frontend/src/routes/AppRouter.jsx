import { BrowserRouter, Routes, Route } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import ProtectedRoute from "../components/ProtectedRoute";
import { Navigate } from "react-router-dom";


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
import HeatmapPage from '../pages/HeatmapPage';
import SimulationPage2 from "../pages/SimulationPage2";
import WaitingRoomPage from "../pages/WaitingRoomPage";
import AdminDashboardPage from "../pages/AdminDashboardPage";
import PendingUsersPage from "../pages/PendingUsersPage";
import AdminPanel from '../pages/AdminPanel.jsx'; 
import ForgotPassword from "../pages/ForgotPassword";
import MyCasesPage from "../pages/MyCasesPage.jsx";
import TrashBinPage from "../pages/TrashBin.jsx";






function AppRouter() {
  const { loading } = useAuth();

  
  if (loading) return null;

  return (
    <BrowserRouter>
      <Routes>
        {/* Public routes (no login required) */}
        <Route path="/" element={<LandingPage />} />
        <Route path="/signin" element={<SignInPage />} />
        <Route path="/register" element={<RegisterPage />} />
        <Route path="/verify-email" element={<VerifyEmailPage />} />
        <Route path="/waiting-room" element={<WaitingRoomPage />} />
        <Route path="/forgot-password" element={<ForgotPassword />} />


        {/* Protected routes — only accessible if logged in and verified */}
        <Route
          path="/admin-dashboard"
          element={
            <ProtectedRoute requiredRole="admin">
              <AdminDashboardPage />
            </ProtectedRoute>
          }
          />
           <Route
          path="/pending-users"
          element={
            <ProtectedRoute requiredRole="admin">
              <PendingUsersPage />
            </ProtectedRoute>
          }
          />

          <Route 
          path="/all-users" 
          element={
            <ProtectedRoute requiredRole="admin">
            <AdminPanel />
            </ProtectedRoute>
            } />

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
              <SimulationPage2/>
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

        <Route path="/heatmap"
          element={
            <ProtectedRoute>
              <HeatmapPage/>
            </ProtectedRoute>
        } 
        />
        <Route
          path="/simulation2"
          element={
            <ProtectedRoute>
              <SimulationPage2/>
            </ProtectedRoute>
          }
        />
        <Route
          path="/forgot-password" 
          element=
          {<ForgotPassword />} 
          />
        <Route
          path="/my-cases"
          element={
            <ProtectedRoute>
              <MyCasesPage/>
            </ProtectedRoute>
          }
        />
        <Route
          path="/trash-bin"
          element={
            <ProtectedRoute>
              <TrashBinPage/>
            </ProtectedRoute>
          }
        />
        {/* Redirect any unknown routes to home */}
        <Route path="*" element={<Navigate to="/home" replace />} />
      </Routes>
    </BrowserRouter>
  );
}export default AppRouter;