"use client"

import { useState } from "react"
import { Link, useNavigate } from "react-router-dom"
import { Eye, EyeOff, Loader2 } from "lucide-react"
import { createUserWithEmailAndPassword } from "firebase/auth"
import { doc, setDoc } from "firebase/firestore"
import { auth, db } from "../firebase"
import "../css/register-animations.css"; 
import { sendEmailVerification } from "firebase/auth"; 


function RegisterPage() {
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
  const [isLoading, setIsLoading] = useState(false) // Add loading state

  const isValidSouthAfricanId = (id) => {
    const idRegex = /^\d{13}$/;
    return idRegex.test(id);
  };

const handleRegister = async (e) => {
  e.preventDefault();

  if (password !== confirmPassword) {
    alert("Passwords do not match!");
    return;
  }

  if (!isValidSouthAfricanId(idNumber)) {
    alert("Please enter a valid 13-digit South African ID number.");
    return;
  }
  
  try {
    setIsLoading(true); // Start loading animation

    console.log(" Creating user in Firebase Auth...");
    const userCredential = await createUserWithEmailAndPassword(auth, email, password);
    const user = userCredential.user;

    console.log(" Firebase user created:", user.uid);

    // Send email verification
    console.log("📧 Sending email verification...");
    await sendEmailVerification(user);
    console.log(" Verification email sent!");

    const idToken = await user.getIdToken();

     // Generate a userID
    const generateUserId = () => {
    const randomString = Math.random().toString(36).substring(2, 8).toUpperCase();
    return `USER-${randomString}`;
  };
    const generatedUserId = generateUserId();

    // Save to Firestore
    console.log("🗃️ Adding user to Firestore...");
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
    console.log("✅ Firestore user saved!");

    // Notify backend
    const response = await fetch(`${import.meta.env.VITE_API_URL}/auth/register`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${idToken}`,
      },
      body: JSON.stringify({
        first_name: firstName,
        surname: surname,
        email,
        id_number: idNumber,
        investigator_id: investigatorId,
        dob,
        password,
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      console.error("Backend responded with error:", data);
      throw new Error(data.detail || "Registration failed");
    }

    console.log("Registration successful!", data);
    // alert("Please verify your email before logging in.");
    navigate("/verify-email"); // After the user logs in successfully, redirect to verify-email pagefor email verification status
  } catch (error) {
    console.error("Registration error:", error);
    alert(error.message);
  } finally {
    setIsLoading(false);
  }
};


  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-black via-gray-900 to-black p-4">
      <div className="w-full max-w-md bg-gray-900 rounded-lg shadow-md p-8 space-y-6">
        <div className="space-y-1 text-center">
          <h2 className="text-3xl font-bold text-white">Register</h2>
          <p className="text-gray-400">Create a new account to get started</p>
        </div>

        <form onSubmit={handleRegister} className="space-y-4">
          {/* First and Last Name */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1">
              <label htmlFor="firstName" className="text-sm text-gray-300">
                First Name
              </label>
              <input
                id="firstName"
                type="text"
                placeholder="John"
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                className="w-full rounded-md px-3 py-2 bg-gray-800 text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                required
              />
            </div>
            <div className="space-y-1">
              <label htmlFor="surname" className="text-sm text-gray-300">
                Surname
              </label>
              <input
                id="surname"
                type="text"
                placeholder="Doe"
                value={surname}
                onChange={(e) => setSurname(e.target.value)}
                className="w-full rounded-md px-3 py-2 bg-gray-800 text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                required
              />
            </div>
          </div>

          {/* Email */}
          <div className="space-y-1">
            <label htmlFor="email" className="text-sm text-gray-300">
              Email
            </label>
            <input
              id="email"
              type="email"
              placeholder="john.doe@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded-md px-3 py-2 bg-gray-800 text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              required
            />
          </div>

          {/* ID Number */}
          <div className="space-y-1">
            <label htmlFor="idNumber" className="text-sm text-gray-300">
              ID Number
            </label>
            <input
              id="idNumber"
              type="text"
              placeholder="123456789"
              value={idNumber}
              onChange={(e) => setIdNumber(e.target.value)}
              className="w-full rounded-md px-3 py-2 bg-gray-800 text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              required
            />
          </div>

          {/* Investigator ID */}
          <div className="space-y-1">
            <label htmlFor="investigatorId" className="text-sm text-gray-300">
              Investigator ID
            </label>
            <input
              id="investigatorId"
              type="text"
              placeholder="INV-12345"
              value={investigatorId}
              onChange={(e) => setInvestigatorId(e.target.value)}
              className="w-full rounded-md px-3 py-2 bg-gray-800 text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              required
            />
          </div>

          {/* Date of Birth 
          <div className="space-y-1">
            <label htmlFor="dob" className="text-sm text-gray-300">
              Date of Birth
            </label>
            <input
              id="dob"
              type="date"
              value={dob}
              onChange={(e) => setDob(e.target.value)}
              className="w-full rounded-md px-3 py-2 bg-gray-800 text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              required
            />
          </div>
          */}

          {/* Password Field */}
          <div className="relative space-y-1">
            <label htmlFor="password" className="text-sm text-gray-300">
              Password
            </label>
            <input
              id="password"
              type={showPassword ? "text" : "password"}
              placeholder="Password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-md px-3 py-2 bg-gray-800 text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              required
            />
            {/* Eye Icon */}
            <div
              className="absolute top-8 right-3 cursor-pointer text-gray-400"
              onClick={() => setShowPassword(!showPassword)}
            >
              {showPassword ? <EyeOff size={20} /> : <Eye size={20} />}
            </div>
          </div>

          {/* Confirm Password Field */}
          <div className="relative space-y-1">
            <label htmlFor="confirmPassword" className="text-sm text-gray-300">
              Confirm Password
            </label>
            <input
              id="confirmPassword"
              type={showConfirmPassword ? "text" : "password"}
              placeholder="Confirm Password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              className="w-full rounded-md px-3 py-2 bg-gray-800 text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              required
            />
            {/* Eye Icon */}
            <div
              className="absolute top-8 right-3 cursor-pointer text-gray-400"
              onClick={() => setShowConfirmPassword(!showConfirmPassword)}
            >
              {showConfirmPassword ? <EyeOff size={20} /> : <Eye size={20} />}
            </div>
          </div>

          {/* Submit Button with Loading Animation */}
          <div>
          <button
            type="submit"
            disabled={isLoading}
            className={`w-full py-2 px-4 bg-blue-700 hover:bg-blue-800 text-white font-bold rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-opacity duration-300 ${
              isLoading ? "opacity-70 cursor-not-allowed" : ""
            }`}
          >
            {isLoading ? (
              <div className="flex items-center justify-center gap-2">
                <Loader2 className="animate-spin w-5 h-5" />
                <span>Registering...</span>
              </div>
            ) : (
              "Register"
            )}
          </button>
          </div>
        </form>

        <div className="text-center text-sm text-gray-400">
          Already have an account?{" "}
          <Link to="/signin" className="text-blue-400 hover:underline">
            Sign In
          </Link>
        </div>
      </div>
    </div>
  )
}

export default RegisterPage
