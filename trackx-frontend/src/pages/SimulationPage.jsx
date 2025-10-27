import React from "react";
import { Link } from "react-router-dom";
import adflogo from "../assets/image-removebg-preview.png";
//import profileIcon from "../assets/profile-icon.png"; 
import { motion } from "framer-motion";
import { useAuth } from "../context/AuthContext";
import { auth } from "../firebase";
import { signOut } from "firebase/auth";


function SimulationPage() {
  const caseName = "Example Case XYZ";
  const { profile } = useAuth();

  const handleSignOut = async () => {
    try {
      await signOut(auth);
    } catch (error) {
      console.error("Failed to sign out:", error);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 1 }}
      className="relative min-h-screen text-white font-sans overflow-hidden flex flex-col"
    >
       {/* Gradient Background */}
       <div className="absolute inset-0 bg-gradient-to-br from-black via-gray-900 to-black -z-10" />
      {/* Navbar */}
      <nav className="flex items-center justify-between px-6 py-4 bg-gradient-to-r from-black to-gray-900 bg-opacity-80 backdrop-blur-md shadow-md">
        <Link to="/home" className="inline-flex">
          <img src={adflogo} alt="Logo" className="h-12 cursor-pointer transition hover:opacity-80" />
        </Link>

        <h1 className="text-xl font-semibold uppercase tracking-[0.3em] text-white">Simulation</h1>

        <div className="text-right text-sm text-gray-200">
          <p>{profile ? `${profile.firstName} ${profile.surname}` : "Loading..."}</p>
          <button onClick={handleSignOut} className="text-red-400 hover:text-red-500 text-xs transition">
            Sign Out
          </button>
        </div>
      </nav>

      {/* Content */}
      <div className="px-6 py-8 space-y-6">
        {/* Title */}
        <h2 className="text-lg font-semibold mb-4">
          Google Earth Simulation of {caseName}
        </h2>

        {/* Google Earth Component Placeholder */}
        <div className="w-full h-[500px] bg-gray-800 border border-gray-600 rounded flex items-center justify-center text-gray-400">
          {/* Replace this with the actual embedded Google Earth component */}
          Google Earth Simulation Component Here
        </div>

        {/* Buttons */}
        <div className="flex justify-start space-x-4 mt-6">
          <button className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded">
            Edit Annotation Info
          </button>
          <button className="bg-purple-600 hover:bg-purple-700 text-white px-4 py-2 rounded">
            Download Video
          </button>
        </div>
      </div>
    </motion.div>
  );
}

export default SimulationPage;
