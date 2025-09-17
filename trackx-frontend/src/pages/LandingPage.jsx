import React from "react";
import { Link } from "react-router-dom";
import trackxLogo from "../assets/trackx-logo-removebg-preview.png";
import ADFLogoNoBg from "../assets/image-removebg-preview.png";
import AnimatedMap from "../components/AnimatedMap";
import { motion } from "framer-motion";

function LandingPage() {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 1 }}
      className="relative min-h-screen overflow-hidden font-sans bg-black"
    >
      {/* Animated Map as Background */}
      <div className="absolute inset-0 z-0">
        <AnimatedMap />
      </div>

      {/* ADF Logo - top-left */}
      <div className="absolute top-4 left-4 z-10">
        <img src={ADFLogoNoBg} alt="ADF Logo" className="h-14 w-auto opacity-90" />
      </div>

      {/* TrackX Logo - top-right */}
      <div className="absolute top-4 right-4 z-10">
        <img
          src={trackxLogo}
          alt="TrackX Logo"
          className="h-12 w-auto drop-shadow-[0_0_6px_rgba(0,0,0,0.6)]"
        />
      </div>

      {/* Center content */}
      <div className="relative z-10 flex flex-col items-center justify-center min-h-screen text-center text-white px-4">
        <h1 className="text-6xl font-extrabold tracking-wide mb-4">TRACKX</h1>
        <h2 className="text-3xl font-serif italic text-gray-200 mb-12">Welcome</h2>

        <div className="flex flex-col space-y-4">
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