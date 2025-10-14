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
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-black via-gray-900 to-black p-6">
      <div className="w-full max-w-md">
  <div className="relative rounded-2xl border border-white/10 bg-white/5 backdrop-blur-lg p-6 shadow-[0_30px_60px_rgba(2,6,23,0.7)]">
          <div className="absolute -inset-0.5 rounded-2xl bg-gradient-to-r from-white/5 to-transparent blur opacity-60" />
          <div className="relative z-10 space-y-6">
            <div className="flex items-center justify-center gap-3">
              <h2 className="text-center text-2xl font-extrabold text-white">Sign In to TrackX</h2>
            </div>

            <form onSubmit={handleSignIn} className="space-y-4">
              <div className="space-y-3">
                <label className="sr-only" htmlFor="email">Email</label>
                <input
                  id="email"
                  type="email"
                  required
                  placeholder="Email address"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full rounded-xl px-3 py-2 bg-transparent text-white placeholder-gray-400 border border-white/8 focus:outline-none focus:ring-2 focus:ring-blue-600"
                />
              </div>

              <div className="relative">
                <label className="sr-only" htmlFor="password">Password</label>
                <input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  required
                  placeholder="Password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full rounded-xl px-3 py-2 bg-transparent text-white placeholder-gray-400 border border-white/8 focus:outline-none focus:ring-2 focus:ring-blue-600"
                />
                <div
                  className="absolute top-1/2 right-3 transform -translate-y-1/2 cursor-pointer text-gray-300"
                  onClick={() => setShowPassword(!showPassword)}
                >
                  {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </div>
              </div>

              {/* Error Message */}
              {errorMessage && (
                <p className="text-sm text-red-400 text-center">{errorMessage}</p>
              )}

              <div>
                <button
                  type="submit"
                  disabled={isLoading}
                  className={`w-full inline-flex items-center justify-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold text-white bg-gradient-to-r from-blue-900 via-indigo-900 to-purple-900 border border-white/10 shadow-[0_18px_40px_rgba(15,23,42,0.6)] transition ${isLoading ? "opacity-70 cursor-not-allowed" : ""}`}
                >
                  {isLoading ? (
                    <>
                      <Loader2 className="animate-spin w-5 h-5" />
                      <span>Signing in...</span>
                    </>
                  ) : (
                    "Sign In"
                  )}
                </button>
              </div>

              <div className="flex items-center justify-between text-sm">
                <Link to="/forgot-password" className="bg-gradient-to-r from-blue-300 via-indigo-400 to-purple-300 bg-clip-text text-transparent font-medium hover:underline">Forgot password?</Link>
                <Link to="/register" className="bg-gradient-to-r from-blue-300 via-indigo-400 to-purple-300 bg-clip-text text-transparent font-medium hover:underline">Register</Link>
              </div>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}

export default SignInPage;
