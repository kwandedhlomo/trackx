import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { auth, db } from "../firebase";
import { doc, getDoc } from "firebase/firestore";

function WaitingRoomPage() {
  const navigate = useNavigate();
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState("");

  const handleCheckStatus = async () => {
    try {
      setChecking(true);
      setError("");

      const user = auth.currentUser;
      if (user) {
        await user.reload(); // Refresh Firebase auth state
        if (!user.emailVerified) {
          setError("Your email is no longer verified. Please log in again.");
          return;
        }

        const userDoc = await getDoc(doc(db, "users", user.uid));
        if (userDoc.exists()) {
          const userData = userDoc.data();

          if (userData.isApproved) {
            navigate("/home"); 
          } else {
            setError("You’re still waiting for approval.");
          }
        } else {
          setError("User data not found. Please contact support.");
        }
      } else {
        setError("You are not logged in.");
      }
    } catch (err) {
      console.error("Error checking approval:", err);
      setError("Something went wrong. Please try again later.");
    } finally {
      setChecking(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-black text-white flex-col space-y-6 px-4 text-center">
      <div className="text-5xl mb-4">⏳</div>
      <h1 className="text-3xl font-bold">Waiting for Admin Approval</h1>
      <p className="text-lg max-w-md">
        Your email is verified. You’ll get access once an admin approves your account.
      </p>

      {error && <p className="text-sm text-red-400">{error}</p>}

      <button
        onClick={handleCheckStatus}
        disabled={checking}
        className="px-6 py-2 bg-blue-600 hover:bg-blue-700 rounded-md transition disabled:opacity-50"
      >
        {checking ? "Checking..." : "Check Status"}
      </button>
    </div>
  );
}

export default WaitingRoomPage;
