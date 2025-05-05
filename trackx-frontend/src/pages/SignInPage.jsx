import React, { useState } from "react";
import { Link } from "react-router-dom";
import { Eye, EyeOff } from "lucide-react"; //  Import eye icons
import { signInWithEmailAndPassword } from "firebase/auth";
import { auth } from "../firebase"; // Make sure this path matches


function SignInPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false); //  Manage show/hide state

  const handleSignIn = async (e) => {
    e.preventDefault();
  
    try {
      // 1. Sign in using Firebase Auth
      const userCredential = await signInWithEmailAndPassword(auth, email, password);
      const user = userCredential.user;
  
      // 2. Get Firebase ID Token
      const idToken = await user.getIdToken();
  
      // 3. Send token to backend to verify
      const response = await fetch(`${import.meta.env.VITE_API_URL}/auth/verify`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${idToken}`,
        },
      });
  
      if (!response.ok) {
        throw new Error("Token verification failed");
      }
  
      const data = await response.json();
      console.log("✅ Verified with backend:", data);
  
      alert(`Welcome back, ${data.email || "investigator"}!`);
    } catch (error) {
      console.error("Login failed:", error.message);
      alert("Login failed. Please check your credentials and try again.");
    }
  };
 

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-black via-gray-900 to-black p-4">
      <div className="w-full max-w-md space-y-8">
        {/* Page Title */}
        <h2 className="text-center text-3xl font-extrabold text-white">Sign In to TrackX</h2>

        {/* Form */}
        <form onSubmit={handleSignIn} className="mt-8 space-y-6">
          <div className="rounded-md shadow-sm space-y-4">

            {/* Email Field */}
            <div>
              <label className="sr-only" htmlFor="email">Email address</label>
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

            {/* Password Field */}
            <div className="relative">
              <label className="sr-only" htmlFor="password">Password</label>
              <input
                id="password"
                type={showPassword ? "text" : "password"} //  Toggle visibility
                required
                placeholder="Password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="appearance-none rounded relative block w-full px-3 py-2 bg-gray-800 text-white placeholder-gray-400 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
              />
              {/* Eye icon to toggle */}
              <div
                className="absolute top-1/2 right-3 transform -translate-y-1/2 cursor-pointer text-gray-400"
                onClick={() => setShowPassword(!showPassword)}
              >
                {showPassword ? <EyeOff size={20} /> : <Eye size={20} />}
              </div>
            </div>

          </div>

          {/* Sign In Button */}
          <div>
            <button
              type="submit"
              className="group relative w-full flex justify-center py-2 px-4 border border-transparent text-sm font-medium rounded-md text-white bg-blue-700 hover:bg-blue-800 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
            >
              Sign In
            </button>
          </div>

          {/* Forgot Password Link */}
          <div className="text-center text-sm mt-2">
            <Link to="/forgot-password" className="text-blue-400 hover:text-blue-300">
              Forgot your password?
            </Link>
          </div>
        </form>

        {/* Bottom Link */}
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
