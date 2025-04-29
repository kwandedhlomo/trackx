import React from "react";
//import { Link } from "react-router-dom";
import adflogo from "../assets/adf-logo.png";
//import profileIcon from "../assets/profile-icon.png"; 
import { motion } from "framer-motion";

function SimulationPage() {
  const caseName = "Example Case XYZ";

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 1 }}
      className="min-h-screen bg-black text-white font-sans"
    >
      {/* Navbar */}
      <div className="flex items-center justify-between px-6 py-4 bg-gray-900 shadow-md">
        <img src={adflogo} alt="Logo" className="h-12" />

        <h1 className="text-xl font-bold text-white">Simulation</h1>

        <div className="flex items-center space-x-4">
          <div>
            <p className="text-sm">Name Surname</p>
            <button className="text-red-400 hover:text-red-600 text-xs">Sign Out</button>
          </div>
        </div>
      </div>

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
