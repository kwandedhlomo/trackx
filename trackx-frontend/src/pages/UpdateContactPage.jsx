import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { auth } from "../firebase";
import { useAuth } from "../context/AuthContext";
import { signOut } from "firebase/auth";
import { useNavigate } from "react-router-dom";
import axios from "axios";
import adfLogo from "../assets/image-removebg-preview.png";
import trackxLogo from "../assets/trackx-logo-removebg-preview.png";

function UpdateContactPage() {
  const { profile } = useAuth();
  const [showMenu, setShowMenu] = useState(false);
  const [formData, setFormData] = useState({
    firstName: "",
    surname: "",
    email: "",
    dob: "",
    investigatorId: "",
    idNumber: "",
    role: ""
  });
  const navigate = useNavigate();

  // Load user details from profile
  useEffect(() => {
    if (profile) {
      setFormData({
        firstName: profile.firstName || "",
        surname: profile.surname || "",
        email: profile.email || "",
        dob: profile.dob || "",
        investigatorId: profile.investigatorId || "",
        idNumber: profile.idNumber || "",
        role: profile.role || ""
      });
    }
  }, [profile]);

  // Sign out
  const handleSignOut = async () => {
    try {
      await signOut(auth);
      navigate("/");
    } catch (error) {
      console.error("Sign-out failed:", error.message);
    }
  };

  const handleChange = (e) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value
    });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    try {
      await axios.put("http://localhost:8000/users/update", {
        user_id: profile.userID,
        email: formData.email
      });
      alert("Details updated successfully!");
    } catch (error) {
      console.error("Failed to update:", error);
      alert("Failed to update details");
    }
  };

  return (
    <div className="relative flex flex-col min-h-screen">
      {/* Gradient background */}
      <div className="absolute inset-0 w-full min-h-full bg-gradient-to-br from-black via-gray-900 to-black -z-20" />

      {/* Navbar/Header */}
      <nav className="flex justify-between items-center bg-gradient-to-r from-black to-gray-900 bg-opacity-80 backdrop-blur-md p-4 relative font-sans z-20">
        <div className="flex items-center space-x-4">
          <div
            className="text-white text-3xl cursor-pointer"
            onClick={() => setShowMenu(!showMenu)}
          >
            &#9776;
          </div>
          <img src={adfLogo} alt="ADF Logo" className="h-10 w-auto" />
        </div>

        <div className="absolute left-1/2 transform -translate-x-1/2 text-3xl font-extrabold text-white font-sans flex items-center space-x-2">
          <img src={trackxLogo} alt="TrackX Logo Left" className="h-8 w-auto" />
          <span>TRACKX</span>
          <img src={trackxLogo} alt="TrackX Logo Right" className="h-8 w-auto" />
        </div>

        <div className="flex items-center space-x-6 text-white font-sans">
          <Link to="/home" className="hover:text-gray-300">
            Home
          </Link>
          <div className="flex flex-col text-right">
            <span className="text-white">{profile?.firstName || "Loading..."}</span>
            <button
              onClick={handleSignOut}
              className="text-sm text-gray-300 hover:text-white"
            >
              Sign Out
            </button>
          </div>
          <div className="text-sm text-gray-300">{new Date().toLocaleString()}</div>
        </div>
      </nav>

      {/* Side Menu */}
      {showMenu && (
        <div className="absolute top-16 left-0 bg-black bg-opacity-90 backdrop-blur-md text-white w-64 p-6 z-30 space-y-4 border-r border-gray-700 shadow-lg">
          <Link to="/home" className="block hover:text-blue-400">🏠 Home</Link>
          <Link to="/new-case" className="block hover:text-blue-400">📝 Create New Case</Link>
          <Link to="/my-cases" className="block hover:text-blue-400">📁 My Cases</Link>
          {profile?.role === "admin" && (
            <Link to="/admin-dashboard" className="block hover:text-blue-400">🛠 Admin Dashboard</Link>
          )}
        </div>
      )}

      {/* Content */}
      <main className="flex flex-col items-center justify-center flex-grow p-8 z-10">
        <div className="w-full max-w-3xl bg-white bg-opacity-10 border border-gray-700 rounded-lg p-6">
          <h2 className="text-2xl font-semibold text-blue-500 mb-6">Update Contact Details</h2>
          <form onSubmit={handleSubmit} className="space-y-6 text-white">

            {/* First Name */}
            <div>
              <label>First Name</label>
              <input type="text" value={formData.firstName} readOnly className="w-full p-2 rounded bg-gray-800 text-gray-400" />
            </div>

            {/* Surname */}
            <div>
              <label>Surname</label>
              <input type="text" value={formData.surname} readOnly className="w-full p-2 rounded bg-gray-800 text-gray-400" />
            </div>

            {/* Email (editable) */}
            <div>
              <label>Email</label>
              <input type="email" name="email" value={formData.email} onChange={handleChange} className="w-full p-2 rounded bg-gray-900" />
            </div>

            {/* DOB */}
            <div>
              <label>Date of Birth</label>
              <input type="text" value={formData.dob} readOnly className="w-full p-2 rounded bg-gray-800 text-gray-400" />
            </div>

            {/* Investigator ID */}
            <div>
              <label>Investigator ID</label>
              <input type="text" value={formData.investigatorId} readOnly className="w-full p-2 rounded bg-gray-800 text-gray-400" />
            </div>

            {/* ID Number */}
            <div>
              <label>ID Number</label>
              <input type="text" value={formData.idNumber} readOnly className="w-full p-2 rounded bg-gray-800 text-gray-400" />
            </div>

            {/* Role */}
            <div>
              <label>Role</label>
              <input type="text" value={formData.role} readOnly className="w-full p-2 rounded bg-gray-800 text-gray-400" />
            </div>

            {/* Save button */}
            <div className="flex justify-end">
              <button type="submit" className="bg-blue-800 px-6 py-2 rounded hover:bg-blue-700">Save Changes</button>
            </div>
          </form>
        </div>
      </main>
    </div>
  );
}

export default UpdateContactPage;


