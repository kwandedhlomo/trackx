import React, { useState, useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { ArrowLeft, ArrowRight, MapPin, AlertTriangle } from "lucide-react";
import adflogo from "../assets/image-removebg-preview.png";

function AnnotationsPage() {
  const navigate = useNavigate();
  
  // State to store locations from localStorage
  const [locations, setLocations] = useState([]);
  const [caseDetails, setCaseDetails] = useState({});
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  
  // State for current location index and annotations
  const [currentIndex, setCurrentIndex] = useState(0);
  const [annotations, setAnnotations] = useState([]);
  
  // State to track which locations are selected for report inclusion
  const [selectedForReport, setSelectedForReport] = useState([]);

  // Google Maps API Key - In production, this should be stored securely
  // You would typically load this from an environment variable
  const GOOGLE_MAPS_API_KEY = "AIzaSyBy0dcphg3Np6Y87uj7FYQYyDIdmAfmgK8"; // Replace with your actual API key
  
  // Load case data from localStorage when component mounts
  useEffect(() => {
    setIsLoading(true);
    try {
      // Get data from localStorage
      const caseDataString = localStorage.getItem('trackxCaseData');
      
      if (!caseDataString) {
        setError("No case data found. Please create a new case first.");
        setIsLoading(false);
        return;
      }
      
      const caseData = JSON.parse(caseDataString);
      
      // Check if locations exist
      if (!caseData.locations || caseData.locations.length === 0) {
        setError("No location data found in the case.");
        setIsLoading(false);
        return;
      }
      
      // Store case details
      setCaseDetails({
        caseNumber: caseData.caseNumber,
        caseTitle: caseData.caseTitle,
        dateOfIncident: caseData.dateOfIncident,
        region: caseData.region,
        between: caseData.between || 'Not specified'
      });
      
      // Set the locations
      setLocations(caseData.locations);
      
      // Initialize annotations array (either from existing data or create new)
      const initialAnnotations = caseData.locations.map(location => {
        // If the location already has annotations from a previous session, use those
        if (location.annotation) {
          return location.annotation;
        }
        
        // Otherwise create a new empty annotation object
        return { title: '', description: '' };
      });
      
      setAnnotations(initialAnnotations);
      
      // Initialize selected locations (either from existing data or select all by default)
      if (caseData.selectedForReport && Array.isArray(caseData.selectedForReport)) {
        setSelectedForReport(caseData.selectedForReport);
      } else {
        // By default, select all locations for the report
        setSelectedForReport(caseData.locations.map((_, index) => index));
      }
      
      setIsLoading(false);
    } catch (error) {
      console.error("Error loading case data:", error);
      setError("Error loading case data: " + error.message);
      setIsLoading(false);
    }
  }, []);
  
  // Get current location
  const currentLocation = locations[currentIndex] || null;
  
  // Handle navigation between locations
  const goToPrevious = () => {
    if (currentIndex > 0) {
      // Save current annotations before moving
      saveCurrentAnnotation();
      setCurrentIndex(currentIndex - 1);
    }
  };
  
  const goToNext = () => {
    // Save current annotations
    saveCurrentAnnotation();
    
    if (currentIndex < locations.length - 1) {
      setCurrentIndex(currentIndex + 1);
    } else {
      // If this is the last location, save all annotations and go to overview
      saveAllAnnotations();
      navigate("/overview");
    }
  };
  
  // Save current annotation to the annotations array
  const saveCurrentAnnotation = () => {
    // This function just updates the local state
    // The full save to localStorage happens in saveAllAnnotations
  };
  
  // Save all annotations to localStorage
  const saveAllAnnotations = () => {
    try {
      const caseDataString = localStorage.getItem('trackxCaseData');
      if (caseDataString) {
        const caseData = JSON.parse(caseDataString);
        
        // Add annotations to each location
        const locationsWithAnnotations = caseData.locations.map((location, index) => ({
          ...location,
          annotation: annotations[index]
        }));
        
        // Update case data with annotations and selected locations
        const updatedCaseData = {
          ...caseData,
          locations: locationsWithAnnotations,
          selectedForReport: selectedForReport
        };
        
        localStorage.setItem('trackxCaseData', JSON.stringify(updatedCaseData));
      }
    } catch (error) {
      console.error("Error saving annotations:", error);
      alert("There was an error saving your annotations. Please try again.");
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
  
  // Toggle location selection for report
  const toggleLocationSelection = () => {
    setSelectedForReport(prev => {
      if (prev.includes(currentIndex)) {
        // If already selected, remove it
        return prev.filter(idx => idx !== currentIndex);
      } else {
        // If not selected, add it
        return [...prev, currentIndex];
      }
    });
  };
  
  // Check if the current location is selected for the report
  const isCurrentLocationSelected = selectedForReport.includes(currentIndex);
  
  // Calculate progress indicator
  const progressText = `Location ${currentIndex + 1} of ${locations.length}`;
  
  // Format coordinate display
  const formatCoordinate = (coord) => {
    if (coord === undefined || coord === null) return "N/A";
    return typeof coord === 'number' ? coord.toFixed(6) : coord;
  };
  
  // Get location address or placeholder
  const getLocationAddress = (location) => {
    if (!location) return "Unknown Location";
    
    // Use address field if available
    if (location.address) return location.address;
    
    // Otherwise create a simple description based on coordinates
    return `Location at ${formatCoordinate(location.lat)}, ${formatCoordinate(location.lng)}`;
  };

  // Format timestamp display
  const formatTimestamp = (timestamp) => {
    if (!timestamp) return "Timestamp not available";
    
    // Try to format as a date if it's a valid date string
    const date = new Date(timestamp);
    if (!isNaN(date.getTime())) {
      return date.toLocaleString();
    }
    
    // Otherwise just return the raw timestamp
    return timestamp;
  };

  // Generate Google Maps Static URL for the current location
  const getGoogleMapUrl = (location) => {
    if (!location || !location.lat || !location.lng) return null;
    
    return `https://maps.googleapis.com/maps/api/staticmap?center=${location.lat},${location.lng}&zoom=15&size=600x300&maptype=roadmap&markers=color:red%7C${location.lat},${location.lng}&key=${GOOGLE_MAPS_API_KEY}`;
  };
  
  // Generate Google Street View URL for the current location
  const getStreetViewUrl = (location) => {
    if (!location || !location.lat || !location.lng) return null;
    
    return `https://maps.googleapis.com/maps/api/streetview?size=600x300&location=${location.lat},${location.lng}&fov=80&heading=70&pitch=0&key=${GOOGLE_MAPS_API_KEY}`;
  };

  // Show loading state
  if (isLoading) {
    return (
      <div className="min-h-screen bg-black text-white flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-500 mx-auto mb-4"></div>
          <p className="text-gray-300">Loading location data...</p>
        </div>
      </div>
    );
  }
  
  // Show error state
  if (error) {
    return (
      <div className="min-h-screen bg-black text-white flex flex-col items-center justify-center">
        <AlertTriangle className="text-red-500 w-12 h-12 mb-4" />
        <h1 className="text-xl font-bold mb-2">Error</h1>
        <p className="text-gray-400">{error}</p>
        <Link to="/new-case" className="mt-8 px-4 py-2 bg-blue-700 hover:bg-blue-600 rounded text-white">
          Go to Case Information
        </Link>
      </div>
    );
  }
  
  // If there are no locations despite loading successfully
  if (locations.length === 0) {
    return (
      <div className="min-h-screen bg-black text-white flex flex-col items-center justify-center">
        <AlertTriangle className="text-yellow-500 w-12 h-12 mb-4" />
        <h1 className="text-xl font-bold mb-2">No Locations Found</h1>
        <p className="text-gray-400">No stopped vehicle locations were found in your data.</p>
        <Link to="/new-case" className="mt-8 px-4 py-2 bg-blue-700 hover:bg-blue-600 rounded text-white">
          Return to Case Information
        </Link>
      </div>
    );
  }
  
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

        <h1 className="text-xl font-bold text-white">Annotations</h1>

        <div className="flex items-center space-x-4">
          <div>
            <p className="text-sm">Name Surname</p>
            <button className="text-red-400 hover:text-red-600 text-xs">Sign Out</button>
          </div>
        </div>
      </div>

      {/* Nav Tabs - Updated with clickable links */}
      <div className="flex justify-center space-x-8 bg-gray-800 py-2 text-white text-sm">
        <Link to="/new-case" className="text-gray-400 hover:text-white">Case Information</Link>
        <span className="font-bold underline">Annotations</span>
        <Link 
          to="/overview" 
          onClick={() => saveAllAnnotations()} 
          className="text-gray-400 hover:text-white"
        >
          Overview
        </Link>
      </div>

      {/* Case Information Bar */}
      <div className="bg-gray-800 bg-opacity-50 py-2 px-6">
        <div className="flex flex-wrap justify-between text-sm text-gray-300">
          <div className="mr-6 mb-1">
            <span className="text-gray-400">Case:</span> {caseDetails.caseNumber}
          </div>
          <div className="mr-6 mb-1">
            <span className="text-gray-400">Title:</span> {caseDetails.caseTitle}
          </div>
          <div className="mr-6 mb-1">
            <span className="text-gray-400">Date:</span> {caseDetails.dateOfIncident}
          </div>
          <div className="mb-1">
            <span className="text-gray-400">Region:</span> {caseDetails.region}
            </div>
        </div>
      </div>

      {/* Main Content */}
      {currentLocation && (
        <div className="max-w-6xl mx-auto px-6 py-8">
          {/* Location Info and Include in Report Checkbox */}
          <div className="mb-6 flex justify-between items-center">
            <div className="flex items-center space-x-2">
              <MapPin className="text-blue-500" />
              <h2 className="text-xl font-semibold">{getLocationAddress(currentLocation)}</h2>
            </div>
            <div className="flex items-center space-x-4">
              <div className="text-gray-400">{progressText}</div>
              {/* Include in Report Checkbox */}
              <div className="flex items-center">
                <input
                  type="checkbox"
                  id="includeInReport"
                  checked={isCurrentLocationSelected}
                  onChange={toggleLocationSelection}
                  className="form-checkbox h-5 w-5 text-blue-600 rounded border-gray-600 bg-gray-700 focus:ring-blue-500"
                />
                <label htmlFor="includeInReport" className="ml-2 text-sm text-gray-300">
                  Include in Report
                </label>
              </div>
            </div>
          </div>

          {/* Map Views and Annotation Form */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            {/* Map Images */}
            <div className="space-y-6">
              {/* Google Maps View */}
              <div className="bg-gray-800 rounded-lg overflow-hidden">
                <div className="bg-gray-700 py-2 px-4 text-sm font-medium">Google Maps View</div>
                <div className="h-64 bg-gray-900 flex items-center justify-center">
                  {getGoogleMapUrl(currentLocation) ? (
                    <img 
                      src={getGoogleMapUrl(currentLocation)} 
                      alt="Map view of location" 
                      className="w-full h-full object-cover"
                      onError={(e) => {
                        e.target.onerror = null;
                        e.target.src = "https://via.placeholder.com/600x300?text=Map+Image+Unavailable";
                      }}
                    />
                  ) : (
                    <div className="text-center text-gray-500">
                      <p className="mb-2">Unable to load map view</p>
                      <p className="text-xs">Coordinates: {formatCoordinate(currentLocation.lat)}, {formatCoordinate(currentLocation.lng)}</p>
                    </div>
                  )}
                </div>
              </div>
              
              {/* Street View */}
              <div className="bg-gray-800 rounded-lg overflow-hidden">
                <div className="bg-gray-700 py-2 px-4 text-sm font-medium">Google Street View</div>
                <div className="h-64 bg-gray-900 flex items-center justify-center">
                  {getStreetViewUrl(currentLocation) ? (
                    <img 
                      src={getStreetViewUrl(currentLocation)} 
                      alt="Street view of location" 
                      className="w-full h-full object-cover"
                      onError={(e) => {
                        e.target.onerror = null;
                        e.target.src = "https://via.placeholder.com/600x300?text=Street+View+Not+Available";
                      }}
                    />
                  ) : (
                    <div className="text-center text-gray-500">
                      <p className="mb-2">Street view not available for this location</p>
                      <p className="text-xs">Street view may not be available in all areas</p>
                    </div>
                  )}
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
                    value={annotations[currentIndex]?.title || ''}
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
                    value={annotations[currentIndex]?.description || ''}
                    onChange={(e) => updateAnnotation('description', e.target.value)}
                    className="w-full p-2 bg-gray-900 border border-gray-700 rounded text-white h-64 resize-none"
                  />
                </div>
                
                {/* Location Info Panel */}
                <div className="p-3 bg-gray-900 rounded border border-gray-700">
                  <div className="grid grid-cols-2 gap-2 text-sm">
                    <div>
                      <p className="text-gray-400">
                        <span className="font-semibold">Time:</span> {formatTimestamp(currentLocation.timestamp)}
                      </p>
                    </div>
                    <div>
                      <p className="text-gray-400">
                        <span className="font-semibold">Status:</span> {currentLocation.ignitionStatus || "Stopped"}
                      </p>
                    </div>
                    <div className="col-span-2 mt-2">
                      <p className="text-gray-400">
                        <span className="font-semibold">Coordinates:</span> {formatCoordinate(currentLocation.lat)}, {formatCoordinate(currentLocation.lng)}
                      </p>
                    </div>
                    
                    {/* If there's additional data in the location, display it */}
                    {currentLocation.rawData && Object.keys(currentLocation.rawData).length > 0 && (
                      <div className="col-span-2 mt-2">
                        <details className="text-xs">
                          <summary className="text-blue-400 cursor-pointer">View all data from CSV</summary>
                          <div className="mt-2 p-2 bg-gray-800 rounded max-h-24 overflow-y-auto">
                            {Object.entries(currentLocation.rawData)
                              .filter(([key]) => key !== 'annotation') // Filter out the annotation field
                              .map(([key, value]) => (
                                <div key={key} className="mb-1">
                                  <span className="text-gray-400">{key}:</span> <span className="text-white">{String(value)}</span>
                                </div>
                              ))}
                          </div>
                        </details>
                      </div>
                    )}
                  </div>
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
      )}
    </motion.div>
  );
}

export default AnnotationsPage;