import React, { useState } from "react";
import { sendPasswordResetEmail } from "firebase/auth";
import { auth, db } from "../firebase";
import { doc, getDoc } from "firebase/firestore";
import { Link, useNavigate } from "react-router-dom";

function ForgotPassword() {
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const handlePasswordReset = async (e) => {
  e.preventDefault();
  setMessage("");
  setLoading(true);

  try {
    await sendPasswordResetEmail(auth, email);
    setMessage("Password reset email sent! Check your inbox.");
    setLoading(false);

    setTimeout(() => navigate("/signin"), 3000);
  } catch (error) {
    console.error("Password reset error:", error);
    if (error.code === "auth/user-not-found") {
      setMessage("Email not found. Please check and try again.");
    } else {
      setMessage("Error sending password reset email.");
    }
    setLoading(false);
  }
};


  return (
    <div className="min-h-screen bg-gradient-to-br from-black via-gray-900 to-black text-white flex items-center justify-center">
      <div className="bg-gray-800 p-8 rounded-lg shadow-md w-full max-w-md">
        <h1 className="text-2xl font-bold mb-6 text-center">Forgot Password</h1>
        <form onSubmit={handlePasswordReset} className="space-y-4">
          <input
            type="email"
            placeholder="Enter your email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full p-2 bg-gray-700 border border-gray-600 rounded text-white"
            required
          />
          <button
            type="submit"
            disabled={loading}
            className="w-full py-2 bg-blue-600 hover:bg-blue-500 rounded text-white font-bold"
          >
            {loading ? "Sending..." : "Reset Password"}
          </button>
        </form>
        {message && <p className="mt-4 text-center text-sm text-gray-300">{message}</p>}
        <div className="mt-6 text-center">
          <Link to="/signin" className="text-blue-400 hover:underline">
            Back to Sign In
          </Link>
        </div>
      </div>
    </div>
  );
}

export default ForgotPassword;
