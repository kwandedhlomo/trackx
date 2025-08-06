import { useEffect, useState } from "react";
import { auth, db } from "../firebase";
import { onAuthStateChanged, sendEmailVerification } from "firebase/auth";
import { useNavigate } from "react-router-dom";
import Lottie from "lottie-react";
import BlueLoadingAnimation from "../assets/BlueLoadingAnimation.json";
import { doc, getDoc } from "firebase/firestore";

function VerifyEmailPage() {
  const [isVerified, setIsVerified] = useState(false);
  const [checking, setChecking] = useState(true);
  const [resending, setResending] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const navigate = useNavigate();

  useEffect(() => {
    const interval = setInterval(async () => {
      const user = auth.currentUser;

      if (user) {
        await user.reload();
        if (user.emailVerified) {
          clearInterval(interval);
          setIsVerified(true);
           try {
            const userDoc = await getDoc(doc(db, "users", user.uid));
            const userData = userDoc.exists() ? userDoc.data() : null;

            if (userData?.isApproved) {
              navigate("/home");
            } else {
              navigate("/waiting-room");
            }
          } catch (err) {
            console.error("Error fetching user approval status:", err);
            navigate("/waiting-room");
          }
        } else {
          setChecking(false);
        }
      }
    }, 5000);

    return () => clearInterval(interval);
  }, [navigate]);

  const handleResend = async () => {
    try {
      setResending(true);
      setError("");
      const user = auth.currentUser;

      if (user && !user.emailVerified) {
        await sendEmailVerification(user);
        setMessage("Verification email sent again!");
      } else {
        setMessage("Your email is already verified.");
      }
    } catch (err) {
      if (err.code === "auth/too-many-requests") {
        setError("Too many requests. Please wait before trying again.");
      } else {
        setError("Failed to resend verification email.");
      }
      console.error(err);
    } finally {
      setResending(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-black text-white flex-col space-y-6 px-4">
      {/* Reverted to original animation */}
      <Lottie
        animationData={BlueLoadingAnimation}
        loop
        autoplay
        style={{ height: "200px", width: "200px", marginBottom: "20px" }}
      />

      <h1 className="text-3xl font-bold text-center">📧 Verify Your Email</h1>
      <p className="text-lg text-center max-w-md">
        We've sent a verification link to your email. Please check your inbox.
      </p>

      {!checking && (
        <p className="text-yellow-400 text-md text-center">
          Waiting for verification... (this page will redirect when done)
        </p>
      )}

      {message && <p className="text-sm text-green-400 text-center">{message}</p>}
      {error && <p className="text-sm text-red-500 text-center">{error}</p>}

      <button
        onClick={handleResend}
        disabled={resending}
        className="mt-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 rounded-md transition"
      >
        {resending ? "Resending..." : "Resend Email"}
      </button>
    </div>
  );
}

export default VerifyEmailPage;
