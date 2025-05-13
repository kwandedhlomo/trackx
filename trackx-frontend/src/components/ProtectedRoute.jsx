import { Navigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

const ProtectedRoute = ({ children }) => {
  const { user, loading } = useAuth();

  // While Firebase is initializing the user, wait
  if (loading || user === null) {
    return <div className="text-white text-center mt-20">Loading...</div>;
  }

  // Now it's safe to check if the user is verified
  if (!user.emailVerified) {
    return <Navigate to="/verify-email" replace />;
  }

  return children;
};

export default ProtectedRoute;