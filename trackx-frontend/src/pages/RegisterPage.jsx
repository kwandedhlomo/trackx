"use client"

import { useState } from "react"
import { Link, useNavigate } from "react-router-dom"
import { Eye, EyeOff, Loader2 } from "lucide-react"
import { createUserWithEmailAndPassword, sendEmailVerification } from "firebase/auth"
import { doc, setDoc } from "firebase/firestore"
import { auth, db } from "../firebase"
import "../css/register-animations.css";
import NotificationModal from "../components/NotificationModal";
import useNotificationModal from "../hooks/useNotificationModal";
import { getFriendlyErrorMessage } from "../utils/errorMessages";
import axiosInstance from "../api/axios";

export default function RegisterPage() {
  const navigate = useNavigate()
  const [firstName, setFirstName] = useState("")
  const [surname, setSurname] = useState("")
  const [email, setEmail] = useState("")
  const [idNumber, setIdNumber] = useState("")
  const [investigatorId, setInvestigatorId] = useState("")
  const [dob, setDob] = useState("")
  const [password, setPassword] = useState("")
  const [confirmPassword, setConfirmPassword] = useState("")
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirmPassword, setShowConfirmPassword] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const { modalState, openModal, closeModal } = useNotificationModal();

  const isValidSouthAfricanId = (id) => {
    const idRegex = /^\d{13}$/;
    return idRegex.test(id);
  };

  const handleRegister = async (e) => {
    e.preventDefault();

    if (password !== confirmPassword) {
      openModal({
        variant: "warning",
        title: "Passwords do not match",
        description: "Please make sure your password and confirmation match before continuing.",
      });
      return;
    }

    if (!isValidSouthAfricanId(idNumber)) {
      openModal({
        variant: "warning",
        title: "Invalid ID number",
        description: "Enter a valid 13-digit South African ID number to continue.",
      });
      return;
    }

    try {
      setIsLoading(true);

      const userCredential = await createUserWithEmailAndPassword(auth, email, password);
      const user = userCredential.user;

      await sendEmailVerification(user);

      await setDoc(doc(db, "users", user.uid), {
        firstName,
        surname,
        email,
        idNumber,
        investigatorId,
        dob,
        role: "user",
        isApproved: false,
        createdAt: new Date().toISOString(),
      });

      await user.getIdToken();

      await axiosInstance.post("/auth/register", {
        first_name: firstName,
        surname: surname,
        email,
        id_number: idNumber,
        investigator_id: investigatorId,
        dob,
        password,
      });

      navigate("/verify-email");
    } catch (error) {
      console.error("Registration error:", error);
      openModal({
        variant: "error",
        title: "Registration failed",
        description: getFriendlyErrorMessage(error, "We couldn't complete your registration. Please try again."),
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-black via-gray-900 to-black p-6">
      <div className="w-full max-w-3xl px-4">
        <div className="relative rounded-2xl border border-white/10 bg-white/5 backdrop-blur-lg p-8 shadow-[0_30px_60px_rgba(2,6,23,0.7)]">
          <div className="absolute -inset-0.5 rounded-2xl bg-gradient-to-r from-white/5 to-transparent blur opacity-60" />
          <div className="relative z-10 grid grid-cols-1 md:grid-cols-2 gap-8 items-center">
            <div className="px-4 md:px-6">
              <h2 className="text-3xl font-extrabold text-white">Create an account</h2>
              <p className="mt-2 text-gray-300">Join TrackX to manage cases and collaborate with your team.</p>

              <div className="mt-6 space-y-4">
                <div className="text-sm text-gray-400">By creating an account you agree to our terms and privacy policy.</div>
              </div>
            </div>

            <div className="px-4 md:px-6">
              <form onSubmit={handleRegister} className="space-y-4">
                <div className="grid grid-cols-2 gap-3">
                  <input
                    id="firstName"
                    type="text"
                    placeholder="First"
                    value={firstName}
                    onChange={(e) => setFirstName(e.target.value)}
                    className="w-full rounded-xl px-3 py-2 bg-transparent text-white placeholder-gray-400 border border-white/8 focus:outline-none focus:ring-2 focus:ring-blue-600"
                    required
                  />
                  <input
                    id="surname"
                    type="text"
                    placeholder="Surname"
                    value={surname}
                    onChange={(e) => setSurname(e.target.value)}
                    className="w-full rounded-xl px-3 py-2 bg-transparent text-white placeholder-gray-400 border border-white/8 focus:outline-none focus:ring-2 focus:ring-blue-600"
                    required
                  />
                </div>

                <input
                  id="email"
                  type="email"
                  placeholder="Email address"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full rounded-xl px-3 py-2 bg-transparent text-white placeholder-gray-400 border border-white/8 focus:outline-none focus:ring-2 focus:ring-blue-600"
                  required
                />

                <input
                  id="idNumber"
                  type="text"
                  placeholder="ID Number"
                  value={idNumber}
                  onChange={(e) => setIdNumber(e.target.value)}
                  className="w-full rounded-xl px-3 py-2 bg-transparent text-white placeholder-gray-400 border border-white/8 focus:outline-none focus:ring-2 focus:ring-blue-600"
                  required
                />

                <input
                  id="investigatorId"
                  type="text"
                  placeholder="Investigator ID"
                  value={investigatorId}
                  onChange={(e) => setInvestigatorId(e.target.value)}
                  className="w-full rounded-xl px-3 py-2 bg-transparent text-white placeholder-gray-400 border border-white/8 focus:outline-none focus:ring-2 focus:ring-blue-600"
                  required
                />

                <div className="relative">
                  <input
                    id="password"
                    type={showPassword ? "text" : "password"}
                    placeholder="Password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full rounded-xl px-3 py-2 bg-transparent text-white placeholder-gray-400 border border-white/8 focus:outline-none focus:ring-2 focus:ring-blue-600"
                    required
                  />
                  <div className="absolute top-1/2 right-3 -translate-y-1/2 cursor-pointer text-gray-300" onClick={() => setShowPassword(!showPassword)}>
                    {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                  </div>
                </div>

                <div className="relative">
                  <input
                    id="confirmPassword"
                    type={showConfirmPassword ? "text" : "password"}
                    placeholder="Confirm Password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    className="w-full rounded-xl px-3 py-2 bg-transparent text-white placeholder-gray-400 border border-white/8 focus:outline-none focus:ring-2 focus:ring-blue-600"
                    required
                  />
                  <div className="absolute top-1/2 right-3 -translate-y-1/2 cursor-pointer text-gray-300" onClick={() => setShowConfirmPassword(!showConfirmPassword)}>
                    {showConfirmPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={isLoading}
                  className={`w-full inline-flex items-center justify-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold text-white bg-gradient-to-r from-blue-900 via-indigo-900 to-purple-900 border border-white/10 shadow-[0_18px_40px_rgba(15,23,42,0.6)] transition ${isLoading ? "opacity-70 cursor-not-allowed" : ""}`}
                >
                  {isLoading ? (
                    <>
                      <Loader2 className="animate-spin w-5 h-5" />
                      <span>Registering...</span>
                    </>
                  ) : (
                    "Register"
                  )}
                </button>

                <div className="text-center text-sm mt-2">
                  Already have an account? <Link to="/signin" className="bg-gradient-to-r from-blue-300 via-indigo-400 to-purple-300 bg-clip-text text-transparent font-medium">Sign In</Link>
                </div>
              </form>
            </div>
          </div>
        </div>
      </div>

      <NotificationModal
        isOpen={modalState.isOpen}
        title={modalState.title}
        description={modalState.description}
        variant={modalState.variant}
        onClose={closeModal}
        primaryAction={modalState.primaryAction}
        secondaryAction={modalState.secondaryAction}
      />
    </div>
  )
}
