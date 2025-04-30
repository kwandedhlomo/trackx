import React, { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { Upload } from "lucide-react";
import adflogo from "../assets/image-removebg-preview.png";

function NewCasePage() {
  const navigate = useNavigate();
  const [caseNumber, setCaseNumber] = useState("");
  const [caseTitle, setCaseTitle] = useState("");
  const [dateOfIncident, setDateOfIncident] = useState("");
  const [region, setRegion] = useState("");
  const [between, setBetween] = useState("");
  const [file, setFile] = useState(null);
  const [isDragging, setIsDragging] = useState(false);

  // Handle drag events
  const handleDragOver = (e) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setIsDragging(false);
    
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFile(e.dataTransfer.files[0]);
    }
  };

  // Handle file selection
  const handleFileSelect = (e) => {
    if (e.target.files && e.target.files[0]) {
      handleFile(e.target.files[0]);
    }
  };

  const handleFile = (file) => {
    // Check if file is CSV
    if (file.type === "text/csv" || file.name.endsWith('.csv')) {
      setFile(file);
    } else {
      alert("Please upload a CSV file");
    }
  };

  // Handle form submission
  const handleNext = (e) => {
    e.preventDefault();
    
    // Basic validation
    if (!caseNumber || !caseTitle || !dateOfIncident || !region || !file) {
      alert("Please fill all required fields and upload a CSV file");
      return;
    }
    
    // In a real app, you would process the form data here
    console.log({
      caseNumber,
      caseTitle,
      dateOfIncident,
      region,
      between,
      file
    });
    
    // Navigate to annotations page
    navigate("/annotations");
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 1 }}
      className="relative min-h-screen text-white font-sans overflow-hidden"
    >
      {/* Gradient Background */}
      <div className="absolute inset-0 bg-gradient-to-br from-black via-gray-900 to-black -z-10" />
      {/* Navbar */}
      <div className="flex items-center justify-between px-6 py-4 bg-gradient-to-r from-black to-gray-900 shadow-md">
      <Link to="/home">
      <img src={adflogo} alt="Logo" className="h-12 cursor-pointer hover:opacity-80 transition" />
      </Link>

        <h1 className="text-xl font-bold text-white">New Case</h1>

        <div className="flex items-center space-x-4">
          <div>
            <p className="text-sm">Name Surname</p>
            <button className="text-red-400 hover:text-red-600 text-xs">Sign Out</button>
          </div>
        </div>
      </div>

      {/* Nav Tabs - Updated with clickable links */}
      <div className="flex justify-center space-x-8 bg-gradient-to-r from-black to-gray-900 py-2 text-white text-sm">
        <span className="font-bold underline">Case Information</span>
        <Link to="/annotations" className="text-gray-400 hover:text-white">Annotations</Link>
        <Link to="/overview" className="text-gray-400 hover:text-white">Overview</Link>
      </div>

      {/* Page Content */}
      <div className="max-w-4xl mx-auto px-6 py-8">
        <form onSubmit={handleNext} className="space-y-6">
          {/* Case Details Section */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Case Number */}
            <div>
              <label htmlFor="caseNumber" className="block text-sm font-medium text-gray-300 mb-1">
                Case Number *
              </label>
              <input
                type="text"
                id="caseNumber"
                value={caseNumber}
                onChange={(e) => setCaseNumber(e.target.value)}
                className="w-full p-2 bg-gray-800 border border-gray-600 rounded text-white"
                required
              />
            </div>

            {/* Case Title */}
            <div>
              <label htmlFor="caseTitle" className="block text-sm font-medium text-gray-300 mb-1">
                Case Title *
              </label>
              <input
                type="text"
                id="caseTitle"
                value={caseTitle}
                onChange={(e) => setCaseTitle(e.target.value)}
                className="w-full p-2 bg-gray-800 border border-gray-600 rounded text-white"
                required
              />
            </div>

            {/* Date of Incident */}
            <div>
              <label htmlFor="dateOfIncident" className="block text-sm font-medium text-gray-300 mb-1">
                Date of Incident *
              </label>
              <input
                type="date"
                id="dateOfIncident"
                value={dateOfIncident}
                onChange={(e) => setDateOfIncident(e.target.value)}
                className="w-full p-2 bg-gray-800 border border-gray-600 rounded text-white"
                required
              />
            </div>

            {/* Region */}
            <div>
              <label htmlFor="region" className="block text-sm font-medium text-gray-300 mb-1">
                Region *
              </label>
              <select
                id="region"
                value={region}
                onChange={(e) => setRegion(e.target.value)}
                className="w-full p-2 bg-gray-800 border border-gray-600 rounded text-white"
                required
              >
                <option value="">Select a region</option>
                <option value="western-cape">Western Cape</option>
                <option value="eastern-cape">Eastern Cape</option>
                <option value="northern-cape">Northern Cape</option>
                <option value="gauteng">Gauteng</option>
                <option value="kwazulu-natal">KwaZulu-Natal</option>
                <option value="free-state">Free State</option>
                <option value="mpumalanga">Mpumalanga</option>
                <option value="limpopo">Limpopo</option>
                <option value="north-west">North West</option>
              </select>
            </div>

            {/* Between */}
            <div className="md:col-span-2">
              <label htmlFor="between" className="block text-sm font-medium text-gray-300 mb-1">
                Between
              </label>
              <input
                type="text"
                id="between"
                value={between}
                onChange={(e) => setBetween(e.target.value)}
                className="w-full p-2 bg-gray-800 border border-gray-600 rounded text-white"
                placeholder="e.g. The State vs. John Doe"
              />
            </div>
          </div>

          {/* File Upload Section */}
          <div className="mt-8">
            <label className="block text-sm font-medium text-gray-300 mb-2">
              Upload GPS Coordinates (CSV) *
            </label>
            <div
              className={`border-2 border-dashed p-8 rounded-lg flex flex-col items-center justify-center cursor-pointer
               ${isDragging ? 'border-blue-500 bg-blue-900 bg-opacity-20' : 'border-gray-600'} 
               ${file ? 'bg-green-900 bg-opacity-20' : ''}`}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              onClick={() => document.getElementById('file-upload').click()}
            >
              <input
                id="file-upload"
                type="file"
                accept=".csv"
                className="hidden"
                onChange={handleFileSelect}
              />
              
              {file ? (
                <div className="text-center">
                  <div className="text-green-400 mb-2">✓ File uploaded</div>
                  <p className="text-gray-300">{file.name}</p>
                </div>
              ) : (
                <>
                  <Upload className="h-12 w-12 text-gray-400 mb-4" />
                  <p className="text-gray-300 mb-2">Drag and drop your CSV file here</p>
                  <p className="text-gray-500 text-sm">or click to browse</p>
                </>
              )}
            </div>
          </div>

          {/* Navigation Buttons */}
          <div className="flex justify-between mt-10">
            <Link 
              to="/home" 
              className="px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded text-white"
            >
              Cancel
            </Link>
            <button 
              type="submit" 
              className={`px-4 py-2 rounded text-white ${file ? 'bg-blue-700 hover:bg-blue-600' : 'bg-blue-900 cursor-not-allowed opacity-50'}`}
              disabled={!file}
            >
              Next
            </button>
          </div>
        </form>
      </div>
    </motion.div>
  );
}

export default NewCasePage;