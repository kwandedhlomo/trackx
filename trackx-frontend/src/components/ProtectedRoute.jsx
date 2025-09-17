import { Navigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

const ProtectedRoute = ({ children, requiredRole }) => {
  const { user, profile, loading } = useAuth();

  // Debug logs
  console.log("ProtectedRoute: user =", user);
  console.log("ProtectedRoute: profile =", profile);
  console.log("ProtectedRoute: requiredRole =", requiredRole);

  // Show loader while auth is initializing
  if (loading || user === null) {
    return <div className="text-white text-center mt-20">Loading...</div>;
  }

  // If email is not verified, block access
  if (!user.emailVerified) {
    return <Navigate to="/verify-email" replace />;
  }

  // If a role is required and user does not have it
  if (requiredRole && profile?.role !== requiredRole) {
    console.warn(`ProtectedRoute: Access denied. Required: ${requiredRole}, but user role is: ${profile?.role}`);
    return <Navigate to="/home" replace />;
  }

  return children;
};

export default ProtectedRoute;
