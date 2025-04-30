import React, { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { ArrowLeft, ArrowRight, MapPin } from "lucide-react";
import adflogo from "../assets/image-removebg-preview.png";

function AnnotationsPage() {
  const navigate = useNavigate();
  
  // Mock data - this would come from your backend in a real app
  const [locations] = useState([
    {
      id: 1,
      lat: -33.918861,
      lng: 18.4233,
      timestamp: "2025-04-01 13:45:22",
      address: "Long Street, Cape Town",
    },
    {
      id: 2,
      lat: -33.925842,
      lng: 18.4240,
      timestamp: "2025-04-01 14:12:09",
      address: "Adderley Street, Cape Town",
    },
    {
      id: 3,
      lat: -33.932844,
      lng: 18.4348,
      timestamp: "2025-04-01 14:38:45",
      address: "Victoria Road, Woodstock",
    }
  ]);
  
  // State for current location index and annotations
  const [currentIndex, setCurrentIndex] = useState(0);
  const [annotations, setAnnotations] = useState(locations.map(() => ({ title: '', description: '' })));
  
  // Get current location
  const currentLocation = locations[currentIndex];
  
  // Handle navigation between locations
  const goToPrevious = () => {
    if (currentIndex > 0) {
      setCurrentIndex(currentIndex - 1);
    }
  };
  
  const goToNext = () => {
    if (currentIndex < locations.length - 1) {
      setCurrentIndex(currentIndex + 1);
    } else {
      // If this is the last location, navigate to overview
      navigate("/overview");
    }
  };
  
  // Update annotation data
  const updateAnnotation = (field, value) => {
    const newAnnotations = [...annotations];
    newAnnotations[currentIndex] = {
      ...newAnnotations[currentIndex],
      [field]: value
    };
    setAnnotations(newAnnotations);
  };
  
  // Format progress indicator
  const progressText = `Location ${currentIndex + 1} of ${locations.length}`;
  
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
        <img src={adflogo} alt="Logo" className="h-12" />

        <h1 className="text-xl font-bold text-white">Annotations</h1>

        <div className="flex items-center space-x-4">
          <div>
            <p className="text-sm">Name Surname</p>
            <button className="text-red-400 hover:text-red-600 text-xs">Sign Out</button>
          </div>
        </div>
      </div>

      {/* Nav Tabs - Updated with clickable links */}
      <div className="flex justify-center space-x-8 bg-gradient-to-r from-black to-gray-900 py-2 text-white text-sm">
        <Link to="/new-case" className="text-gray-400 hover:text-white">Case Information</Link>
        <span className="font-bold underline">Annotations</span>
        <Link to="/overview" className="text-gray-400 hover:text-white">Overview</Link>
      </div>

      {/* Main Content */}
      <div className="max-w-6xl mx-auto px-6 py-8">
        {/* Location Info */}
        <div className="mb-6 flex justify-between items-center">
          <div className="flex items-center space-x-2">
            <MapPin className="text-blue-500" />
            <h2 className="text-xl font-semibold">{currentLocation.address}</h2>
          </div>
          <div className="text-gray-400">{progressText}</div>
        </div>

        {/* Map Views and Annotation Form */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          {/* Map Images */}
          <div className="space-y-6">
            {/* Google Maps View */}
            <div className="bg-gray-800 rounded-lg overflow-hidden">
              <div className="bg-gray-700 py-2 px-4 text-sm font-medium">Google Maps View</div>
              <div className="h-64 bg-gray-900 flex items-center justify-center">
                {/* In a real app, this would be a Google Maps component */}
                <div className="text-center text-gray-500">
                  <p>Google Maps View</p>
                  <p className="text-xs mt-2">Lat: {currentLocation.lat}, Lng: {currentLocation.lng}</p>
                </div>
              </div>
            </div>
            
            {/* Street View */}
            <div className="bg-gray-800 rounded-lg overflow-hidden">
              <div className="bg-gray-700 py-2 px-4 text-sm font-medium">Google Street View</div>
              <div className="h-64 bg-gray-900 flex items-center justify-center">
                {/* In a real app, this would be a Google Street View component */}
                <div className="text-center text-gray-500">
                  <p>Street View</p>
                  <p className="text-xs mt-2">Timestamp: {currentLocation.timestamp}</p>
                </div>
              </div>
            </div>
          </div>
          
          {/* Annotation Form */}
          <div className="bg-gray-800 rounded-lg overflow-hidden">
            <div className="bg-gray-700 py-2 px-4 text-sm font-medium">Add Location Context</div>
            <div className="p-4 space-y-4">
              {/* Title */}
              <div>
                <label htmlFor="locationTitle" className="block text-sm font-medium text-gray-300 mb-1">
                  Location Title
                </label>
                <input
                  type="text"
                  id="locationTitle"
                  placeholder="e.g. Suspect's Home, Fuel Station, etc."
                  value={annotations[currentIndex].title}
                  onChange={(e) => updateAnnotation('title', e.target.value)}
                  className="w-full p-2 bg-gray-900 border border-gray-700 rounded text-white"
                />
              </div>
              
              {/* Description */}
              <div>
                <label htmlFor="locationDescription" className="block text-sm font-medium text-gray-300 mb-1">
                  Description
                </label>
                <textarea
                  id="locationDescription"
                  placeholder="Provide details about the significance of this location..."
                  value={annotations[currentIndex].description}
                  onChange={(e) => updateAnnotation('description', e.target.value)}
                  className="w-full p-2 bg-gray-900 border border-gray-700 rounded text-white h-64 resize-none"
                />
              </div>
              
              {/* Time Info */}
              <div className="p-3 bg-gray-900 rounded border border-gray-700">
                <p className="text-sm text-gray-400">
                  <span className="font-semibold">Time at location:</span> {currentLocation.timestamp}
                </p>
                <p className="text-sm text-gray-400 mt-1">
                  <span className="font-semibold">Duration:</span> 5 min 12 sec
                </p>
              </div>
            </div>
          </div>
        </div>
        
        {/* Navigation Buttons */}
        <div className="flex justify-between mt-8">
          <button
            onClick={goToPrevious}
            disabled={currentIndex === 0}
            className={`flex items-center px-4 py-2 rounded ${
              currentIndex === 0 ? 'bg-gray-800 text-gray-500 cursor-not-allowed' : 'bg-gray-700 text-white hover:bg-gray-600'
            }`}
          >
            <ArrowLeft className="mr-2 h-4 w-4" />
            Previous Location
          </button>
          
          <button
            onClick={goToNext}
            className="flex items-center px-4 py-2 bg-blue-700 hover:bg-blue-600 rounded text-white"
          >
            {currentIndex < locations.length - 1 ? 'Next Location' : 'Continue to Overview'}
            <ArrowRight className="ml-2 h-4 w-4" />
          </button>
        </div>
      </div>
    </motion.div>
  );
}

export default AnnotationsPage;