import React, { useState, useEffect, useRef } from "react";
import { Link, useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { ArrowLeft, ArrowRight, MapPin, AlertTriangle, Camera } from "lucide-react";
import adflogo from "../assets/image-removebg-preview.png";

function AnnotationsPage() {
  const navigate = useNavigate();
  
  // Refs for capturing snapshots
  const mapImageRef = useRef(null);
  const streetViewImageRef = useRef(null);
  
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
  
  // State to store snapshots
  const [snapshots, setSnapshots] = useState([]);
  const [isCapturingSnapshot, setIsCapturingSnapshot] = useState(false);
  const [snapshotCaptured, setSnapshotCaptured] = useState(false);

  // Google Maps API Key 
  const GOOGLE_MAPS_API_KEY = "AIzaSyBy0dcphg3Np6Y87uj7FYQYyDIdmAfmgK8"; 
  
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
      
      // Initialize annotations array
      const initialAnnotations = caseData.locations.map(location => {
        if (location.annotation) {
          return location.annotation;
        }
        
        // Otherwise create a new empty annotation object
        return { title: '', description: '' };
      });
      
      setAnnotations(initialAnnotations);
      
      // Initialize selected locations 
      if (caseData.selectedForReport && Array.isArray(caseData.selectedForReport)) {
        setSelectedForReport(caseData.selectedForReport);
      } else {
        // By default, select all locations for the report
        setSelectedForReport(caseData.locations.map((_, index) => index));
      }
      
      // Load any saved snapshots from sessionStorage
      const savedSnapshots = sessionStorage.getItem('locationSnapshots');
      if (savedSnapshots) {
        try {
          const parsedSnapshots = JSON.parse(savedSnapshots);
          setSnapshots(parsedSnapshots);
          
          // Check if the current location has a snapshot
          if (parsedSnapshots[0] && parsedSnapshots[0].index === 0) {
            setSnapshotCaptured(true);
          }
        } catch (error) {
          console.error("Error parsing saved snapshots:", error);
        }
      } else {
        // Initialize empty snapshots array
        setSnapshots(new Array(caseData.locations.length).fill(null));
      }
      
      // Check if there's a specific location index to navigate to
      const storedLocationIndex = localStorage.getItem('trackxCurrentLocationIndex');
      if (storedLocationIndex && !isNaN(parseInt(storedLocationIndex))) {
        const index = parseInt(storedLocationIndex);
        if (index >= 0 && index < caseData.locations.length) {
          setCurrentIndex(index);
        }
        // Clear the stored index after using it
        localStorage.removeItem('trackxCurrentLocationIndex');
      }
      
      setIsLoading(false);
    } catch (error) {
      console.error("Error loading case data:", error);
      setError("Error loading case data: " + error.message);
      setIsLoading(false);
    }
  }, []);
  
  // Check if snapshot is captured whenever the current index changes
  useEffect(() => {
    const currentSnapshot = snapshots.find(snapshot => snapshot && snapshot.index === currentIndex);
    setSnapshotCaptured(!!currentSnapshot);
  }, [currentIndex, snapshots]);
  
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
    
    // Also update the description in the snapshot if it exists
    updateSnapshotDescription(value);
  };
  
  // Update snapshot description
  const updateSnapshotDescription = (description) => {
    if (!snapshots) return;
    
    const newSnapshots = [...snapshots];
    const snapshotIndex = newSnapshots.findIndex(
      snapshot => snapshot && snapshot.index === currentIndex
    );
    
    if (snapshotIndex !== -1) {
      newSnapshots[snapshotIndex] = {
        ...newSnapshots[snapshotIndex],
        description
      };
      
      setSnapshots(newSnapshots);
      
      // Save to sessionStorage
      sessionStorage.setItem('locationSnapshots', JSON.stringify(newSnapshots));
    }
  };
  
  // Capture snapshots from map and street view images
  const captureSnapshots = async () => {
    if (!mapImageRef.current || !streetViewImageRef.current) {
      alert("Cannot capture snapshots. Image elements not found.");
      return;
    }
    
    setIsCapturingSnapshot(true);
    
    try {
      // Use html2canvas to capture the images
      const html2canvas = (await import('html2canvas')).default;
      
      // Helper function to get image data
      const getImageData = async (imgElement) => {
        // Create a canvas element
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        
        // Set canvas dimensions to match the image
        canvas.width = imgElement.naturalWidth || imgElement.width;
        canvas.height = imgElement.naturalHeight || imgElement.height;
        
        // Draw the image onto canvas
        ctx.drawImage(imgElement, 0, 0, canvas.width, canvas.height);
        
        // Get the image data as base64 string
        return canvas.toDataURL('image/png');
      };
      
      // Capture map and street view images
      const mapImage = await getImageData(mapImageRef.current);
      const streetViewImage = await getImageData(streetViewImageRef.current);
      
      // Create new snapshot object
      const newSnapshot = {
        index: currentIndex,
        mapImage,
        streetViewImage,
        description: annotations[currentIndex]?.description || ""
      };
      
      // Update snapshots array
      const newSnapshots = [...snapshots];
      const existingIndex = newSnapshots.findIndex(
        snapshot => snapshot && snapshot.index === currentIndex
      );
      
      if (existingIndex !== -1) {
        newSnapshots[existingIndex] = newSnapshot;
      } else {
        newSnapshots[currentIndex] = newSnapshot;
      }
      
      setSnapshots(newSnapshots);
      setSnapshotCaptured(true);
      
      // Save to sessionStorage
      sessionStorage.setItem('locationSnapshots', JSON.stringify(newSnapshots));
      
      alert("Snapshots captured successfully!");
    } catch (error) {
      console.error("Error capturing snapshots:", error);
      alert("Error capturing snapshots: " + error.message);
    } finally {
      setIsCapturingSnapshot(false);
    }
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

          {/* Snapshot Status Indicator */}
          <div className={`mb-4 p-3 rounded flex items-center ${snapshotCaptured ? 'bg-green-900 bg-opacity-30' : 'bg-yellow-900 bg-opacity-30'}`}>
            <div className={`mr-3 p-1 rounded-full ${snapshotCaptured ? 'bg-green-500' : 'bg-yellow-500'}`}>
              <Camera size={18} className="text-white" />
            </div>
            <div className="flex-grow">
              <p className={snapshotCaptured ? 'text-green-400' : 'text-yellow-400'}>
                {snapshotCaptured 
                  ? "Snapshots have been captured for this location" 
                  : "No snapshots captured yet. Capture snapshots to include in the report."}
              </p>
            </div>
            <button
              onClick={captureSnapshots}
              disabled={isCapturingSnapshot}
              className={`px-4 py-2 rounded text-white ${
                isCapturingSnapshot 
                  ? 'bg-gray-700 cursor-not-allowed' 
                  : (snapshotCaptured ? 'bg-green-700 hover:bg-green-600' : 'bg-blue-700 hover:bg-blue-600')
              }`}
            >
              {isCapturingSnapshot 
                ? 'Capturing...' 
                : (snapshotCaptured ? 'Recapture Snapshots' : 'Capture Snapshots')}
            </button>
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
                      ref={mapImageRef}
                      src={getGoogleMapUrl(currentLocation)} 
                      alt="Map view of location" 
                      className="w-full h-full object-cover"
                      onError={(e) => {
                        e.target.onerror = null;
                        e.target.src = "https://placehold.co/600x300?text=Street+View+Not+Available";
                      }}
                      crossOrigin="anonymous" // Important for capturing the image
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
                      ref={streetViewImageRef}
                      src={getStreetViewUrl(currentLocation)} 
                      alt="Street view of location" 
                      className="w-full h-full object-cover"
                      onError={(e) => {
                        e.target.onerror = null;
                        e.target.src = "https://placehold.co/600x300?text=Street+View+Not+Available";
                      }}
                      crossOrigin="anonymous" // Important for capturing the image
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