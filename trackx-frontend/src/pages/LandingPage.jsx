import React from "react";
import { Link } from "react-router-dom";
import trackxLogo from "../assets/trackx-logo-removebg-preview.png";
import ADFLogoNoBg from "../assets/image-removebg-preview.png";
import AnimatedMap from "../components/AnimatedMap"; // Reusable import
import { motion } from "framer-motion"; // 🛠 Import framer-motion

function LandingPage() {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 1 }}
      className="relative min-h-screen overflow-hidden font-sans bg-black"
    >
      {/* 🔵 Animated Map as Background */}
      <div className="absolute inset-0 z-0">
        <AnimatedMap />
      </div>

      {/* 🟣 Foreground Content */}
      <div className="relative z-10 flex flex-col items-center justify-center min-h-screen text-center text-white space-y-6 px-4">
        
        {/* ADF Logo */}
        <img src={ADFLogoNoBg} alt="ADF Logo" className="h-40 mb-6" />

        {/* TRACKX Logo and Title */}
        <div className="mb-8">
          <img src={trackxLogo} alt="TrackX Logo" className="h-16 mx-auto mb-2" />
          <h1 className="text-4xl font-extrabold">TRACKX</h1>
        </div>

        {/* Welcome Text */}
        <h2 className="text-lg text-gray-300">Welcome to</h2>

        {/* Buttons */}
        <div className="flex flex-col space-y-4 mt-6">
          <Link to="/signin">
            <button className="w-48 bg-gradient-to-r from-gray-500 to-gray-400 text-white py-2 rounded shadow transition-all duration-300 hover:from-blue-800 hover:to-blue-600">
              Sign In
            </button>
          </Link>
          <Link to="/register">
            <button className="w-48 bg-gradient-to-r from-gray-500 to-gray-400 text-white py-2 rounded shadow transition-all duration-300 hover:from-blue-800 hover:to-blue-600">
              Register
            </button>
          </Link>
        </div>

      </div>
    </motion.div>
  );
}

export default LandingPage;
