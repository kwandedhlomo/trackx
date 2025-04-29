import React from "react";
import { Link } from "react-router-dom";
import adflogo from "../assets/adf-logo.png";
//import profileIcon from "../assets/profile-icon.png"; 
import { motion } from "framer-motion";

function OverviewPage() {
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

        <h1 className="text-xl font-bold text-white">Overview</h1>

        <div className="flex items-center space-x-4">
          <div>
            <p className="text-sm">Name Surname</p>
            <button className="text-red-400 hover:text-red-600 text-xs">Sign Out</button>
          </div>
        </div>
      </div>

      {/* Nav Tabs */}
      <div className="flex justify-center space-x-8 bg-gray-800 py-2 text-white text-sm">
        <Link to="/case-info" className="hover:underline">Case Information</Link>
        <Link to="/annotations" className="hover:underline">Annotations</Link>
        <span className="font-bold underline">Overview</span>
      </div>

      {/* Page Content */}
      <div className="px-6 py-8 space-y-6">
        {/* Summary */}
        <div>
          <h2 className="text-lg font-semibold mb-2">Case Summary</h2>
          <p className="bg-gray-700 p-4 rounded">Case Name: Example Case XYZ</p>
        </div>

        {/* Report Introduction */}
        <div>
          <h2 className="text-lg font-semibold mb-2">Report Introduction</h2>
          <textarea
            placeholder="Enter report introduction..."
            className="w-full h-32 p-3 rounded bg-gray-800 text-white border border-gray-600 resize-none"
          />
        </div>

        {/* Report Conclusion */}
        <div>
          <h2 className="text-lg font-semibold mb-2">Report Conclusion</h2>
          <textarea
            placeholder="Enter report conclusion..."
            className="w-full h-32 p-3 rounded bg-gray-800 text-white border border-gray-600 resize-none"
          />
        </div>

        {/* Checkboxes and Generate Button */}
        <div className="flex items-center justify-between mt-6">
          <div className="space-x-6">
            <label className="inline-flex items-center">
              <input type="checkbox" className="form-checkbox text-blue-500" />
              <span className="ml-2">Generate Report</span>
            </label>
            <label className="inline-flex items-center">
              <input type="checkbox" className="form-checkbox text-green-500" />
              <span className="ml-2">Generate Simulation</span>
            </label>
          </div>
          <button className="bg-blue-700 hover:bg-blue-800 text-white px-4 py-2 rounded shadow">
            Generate
          </button>
        </div>

        {/* Output Downloads */}
        <div className="mt-8 border-t border-gray-700 pt-6">
          <h3 className="text-lg font-semibold mb-2">Generated Reports</h3>
          <div className="flex items-center justify-between bg-gray-800 p-4 rounded">
            <p>Report_Example_XYZ.pdf</p>
            <button className="bg-green-600 hover:bg-green-700 text-white px-4 py-1 rounded">
              Download
            </button>
          </div>
        </div>
      </div>
    </motion.div>
  );
}

export default OverviewPage;
