import React, { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Eye, EyeOff, Loader2 } from "lucide-react";
import { signInWithEmailAndPassword, sendEmailVerification } from "firebase/auth";
import { auth } from "../firebase";
import { getDoc, doc } from "firebase/firestore";
import { db } from "../firebase";

function SignInPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const navigate = useNavigate();

const handleSignIn = async (e) => {
  e.preventDefault();
  setIsLoading(true);
  setErrorMessage("");

  try {
    const userCredential = await signInWithEmailAndPassword(auth, email, password);
    const user = userCredential.user;

    if (!user.emailVerified) {
      try {
        await sendEmailVerification(user);
        console.log("Verification email sent again.");
      } catch (err) {
        console.error("Failed to resend verification:", err.message);
      }
      navigate("/verify-email");
      return;
    }

    const userDocRef = doc(db, "users", user.uid);
    const userDoc = await getDoc(userDocRef);

    if (!userDoc.exists()) {
      console.warn("No user document found for this user.");
      setErrorMessage("User not found.");
      return;
    }

    const userData = userDoc.data();

    if (!userData.isApproved) {
      setErrorMessage("Your account is pending approval by an administrator.");
      return;
    }

    if (userData.role && userData.role.toLowerCase() === "admin") {
      navigate("/home");
    } else {
      navigate("/home");
    }

  } catch (error) {
    console.error("Login failed:", error.message);
    setErrorMessage("Incorrect Email or Password.");
  } finally {
    setIsLoading(false);
  }
};

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-black via-gray-900 to-black p-4">
      <div className="w-full max-w-md space-y-8">
        <h2 className="text-center text-3xl font-extrabold text-white">Sign In to TrackX</h2>

        <form onSubmit={handleSignIn} className="mt-8 space-y-6">
          <div className="rounded-md shadow-sm space-y-4">
            <div>
              <input
                id="email"
                type="email"
                required
                placeholder="Email address"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="appearance-none rounded relative block w-full px-3 py-2 bg-gray-800 text-white placeholder-gray-400 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
              />
            </div>

            <div className="relative">
              <input
                id="password"
                type={showPassword ? "text" : "password"}
                required
                placeholder="Password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="appearance-none rounded relative block w-full px-3 py-2 bg-gray-800 text-white placeholder-gray-400 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
              />
              <div
                className="absolute top-1/2 right-3 transform -translate-y-1/2 cursor-pointer text-gray-400"
                onClick={() => setShowPassword(!showPassword)}
              >
                {showPassword ? <EyeOff size={20} /> : <Eye size={20} />}
              </div>
            </div>
          </div>

          {/* Error Message */}
          {errorMessage && (
            <p className="text-sm text-red-500 text-center">{errorMessage}</p>
          )}

          {/* Sign In Button */}
          <div>
            <button
              type="submit"
              disabled={isLoading}
              className={`group relative w-full flex justify-center py-2 px-4 text-sm font-medium rounded-md text-white bg-blue-700 hover:bg-blue-800 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 transition-opacity duration-300 ${
                isLoading ? "opacity-70 cursor-not-allowed" : ""
              }`}
            >
              {isLoading ? (
                <div className="flex items-center justify-center gap-2">
                  <Loader2 className="animate-spin w-5 h-5" />
                  <span>Signing in...</span>
                </div>
              ) : (
                "Sign In"
              )}
            </button>
          </div>

          <div className="text-center text-sm mt-2">
            <Link to="/forgot-password" className="text-blue-400 hover:text-blue-300">
              Forgot your password?
            </Link>
          </div>
        </form>

        <div className="text-center text-sm text-gray-400">
          Don't have an account?{" "}
          <Link to="/register" className="font-medium text-blue-400 hover:text-blue-300">
            Register
          </Link>
        </div>
      </div>
    </div>
  );
}

export default SignInPage;
