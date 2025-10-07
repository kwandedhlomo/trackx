import React, { useState, useEffect, useRef } from "react";
import { Link, useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { ArrowLeft, ArrowRight, MapPin, AlertTriangle, Camera } from "lucide-react";
import adflogo from "../assets/image-removebg-preview.png";
import { useAuth } from "../context/AuthContext";
import { signOut } from "firebase/auth";
import { auth } from "../firebase";
import axios from "axios";

// Import Firebase services
import { 
  loadCaseWithAnnotations, 
  saveCaseWithAnnotations,
  updateCaseAnnotations,
  batchSaveAnnotations,
  saveSnapshotsToFirebase,
  getCurrentUserId
} from "../services/firebaseServices";

function AnnotationsPage() {
  const navigate = useNavigate();
  const { profile } = useAuth();
  const [showMenu, setShowMenu] = useState(false);

  const isNum = (v) => typeof v === "number" && !Number.isNaN(v);
    
  // Refs for capturing snapshots
  const mapImageRef = useRef(null);
  const streetViewImageRef = useRef(null);
  
  // NEW: Refs for dynamic Google Maps
  const streetViewContainerRef = useRef(null);
  const panoramaRef = useRef(null);
  const [isGoogleMapsLoaded, setIsGoogleMapsLoaded] = useState(false);
  
  // State to store locations from localStorage/Firebase
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

  // Firebase integration state
  const [currentCaseId, setCurrentCaseId] = useState(null);
  const [isSaving, setIsSaving] = useState(false);
  const [lastSaved, setLastSaved] = useState(null);
  const [saveError, setSaveError] = useState(null);

  const [isGenerating, setIsGenerating] = useState(false);

  const generateAIDescription = async () => {
    if (!currentCaseId) {
      console.error("No caseId available (currentCaseId is missing)");
      return;
    }
    const loc = locations[currentIndex];
    if (!loc) return;
  
    try {
      setIsGenerating(true);
      const payload = {
        lat: loc.lat,
        lng: loc.lng,
        timestamp: loc.timestamp || new Date().toISOString(),
        status: loc.ignitionStatus || "Stopped",
      };
  
      const { data } = await axios.post(
        `${API_BASE}/cases/${currentCaseId}/points/generate-description`,
        payload,
        { headers: { "Content-Type": "application/json" } }
      );
  
      if (data?.description) {
        updateAnnotation("description", data.description);
      }
    } catch (err) {
      console.error("AI description generation failed:", err);
      alert("Could not generate description. Please try again.");
    } finally {
      setIsGenerating(false);
    }
  };

  const API_BASE = (import.meta.env.VITE_API_URL || "").replace(/\/+$/, "");
  const GOOGLE_MAPS_API_KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY;

  // NEW: Load Google Maps JavaScript API
  useEffect(() => {
    if (window.google && window.google.maps) {
      setIsGoogleMapsLoaded(true);
      return;
    }

    const script = document.createElement('script');
    script.src = `https://maps.googleapis.com/maps/api/js?key=${GOOGLE_MAPS_API_KEY}&libraries=places`;
    script.async = true;
    script.defer = true;
    script.onload = () => setIsGoogleMapsLoaded(true);
    script.onerror = () => console.error('Failed to load Google Maps API');
    document.head.appendChild(script);
  }, [GOOGLE_MAPS_API_KEY]);

  // NEW: Initialize Street View Panorama when location changes
  useEffect(() => {
    if (!isGoogleMapsLoaded || !streetViewContainerRef.current || locations.length === 0) return;

    const currentLocation = locations[currentIndex];
    if (!currentLocation || !isNum(currentLocation.lat) || !isNum(currentLocation.lng)) return;

    const position = {
      lat: parseFloat(currentLocation.lat),
      lng: parseFloat(currentLocation.lng)
    };

    // Initialize or update Street View Panorama
    if (!panoramaRef.current) {
      panoramaRef.current = new window.google.maps.StreetViewPanorama(
        streetViewContainerRef.current,
        {
          position: position,
          pov: { heading: 70, pitch: 0 },
          zoom: 1,
          addressControl: true,
          linksControl: true,
          panControl: true,
          enableCloseButton: false,
          fullscreenControl: true,
          motionTracking: true,
          motionTrackingControl: true
        }
      );
    } else {
      panoramaRef.current.setPosition(position);
    }
  }, [currentIndex, locations, isGoogleMapsLoaded]);

  async function fetchDataUrlViaProxy(rawUrl) {
    const res = await fetch(`${API_BASE}/api/proxy-image-data-url?url=${encodeURIComponent(rawUrl)}`);
    if (!res.ok) {
      const text = await res.text();
      throw new Error(text || `Proxy fetch failed (${res.status})`);
    }
    const { dataUrl } = await res.json();
    if (!dataUrl || !dataUrl.startsWith("data:image/")) {
      throw new Error("Invalid data URL from proxy");
    }
    return dataUrl;
  }
  
  const formatDateForDisplay = (dateInput) => {
    if (!dateInput) return "Date not available";
    
    try {
      let date;
      
      if (typeof dateInput === 'string') {
        date = dateInput.includes('T') ? new Date(dateInput) : new Date(dateInput + 'T00:00:00');
      } else if (dateInput instanceof Date) {
        date = dateInput;
      } else if (dateInput && typeof dateInput === 'object' && dateInput.seconds) {
        date = new Date(dateInput.seconds * 1000);
      } else {
        return String(dateInput);
      }
      
      if (isNaN(date.getTime())) {
        return String(dateInput);
      }
      
      return date.toISOString().split('T')[0];
    } catch (error) {
      console.warn('Error formatting date:', error, 'Input:', dateInput);
      return String(dateInput);
    }
  };

  const formatTimestamp = (timestamp) => {
    if (!timestamp) return "Timestamp not available";
    
    if (typeof timestamp === 'string') {
      const timeMatch = timestamp.match(/^(\d{1,2}:\d{2}(?::\d{2})?)/);
      if (timeMatch) {
        return timeMatch[1];
      }
      
      if (timestamp.toLowerCase().includes('record')) {
        return "Timestamp not available";
      }
    }
    
    const date = new Date(timestamp);
    if (!isNaN(date.getTime())) {
      return date.toLocaleString();
    }
    
    return String(timestamp);
  };

  const extractTimeFromLocation = (location) => {
    if (!location) return "Timestamp not available";
    
    if (location.timestamp) {
      const directTime = formatTimestamp(location.timestamp);
      if (directTime !== "Timestamp not available") {
        return directTime;
      }
    }
    
    if (location.originalData?.csvDescription) {
      const timeMatch = location.originalData.csvDescription.match(/^(\d{1,2}:\d{2}(?::\d{2})?)/);
      if (timeMatch) {
        return timeMatch[1];
      }
    }
    
    if (location.originalData?.rawData) {
      const timeFields = ['time', 'timestamp', 'Time', 'Timestamp', 'datetime'];
      for (const field of timeFields) {
        if (location.originalData.rawData[field]) {
          const timeMatch = String(location.originalData.rawData[field]).match(/^(\d{1,2}:\d{2}(?::\d{2})?)/);
          if (timeMatch) {
            return timeMatch[1];
          }
        }
      }
    }
    
    return "Timestamp not available";
  };
  
  const handleSignOut = async () => {
    try {
      await signOut(auth);
      navigate("/"); 
    } catch (error) {
      console.error("Sign-out failed:", error.message);
    }
  };

  const updateAnnotation = (field, value) => {
    const newAnnotations = [...annotations];
    while (newAnnotations.length <= currentIndex) {
      newAnnotations.push({ title: '', description: '' });
    }
    newAnnotations[currentIndex] = {
      ...newAnnotations[currentIndex],
      [field]: value
    };
    setAnnotations(newAnnotations);
    
    if (field === 'description' && snapshots[currentIndex]) {
      updateSnapshotDescription(value);
    }
  };

  // NEW: Handle blur events - save when user clicks away from text fields
  const handleBlur = () => {
    console.log('Field blurred - saving annotations...');
    saveAllAnnotations();
  };
  
  const updateSnapshotDescription = (description) => {
    if (!snapshots || !snapshots[currentIndex]) return;
    
    const newSnapshots = [...snapshots];
    newSnapshots[currentIndex] = {
      ...newSnapshots[currentIndex],
      description,
      title: annotations[currentIndex]?.title || ''
    };
    
    setSnapshots(newSnapshots);
    sessionStorage.setItem('locationSnapshots', JSON.stringify(newSnapshots));
  };
  
  const deleteSnapshot = () => {
    const newSnapshots = [...snapshots];
    if (newSnapshots[currentIndex]) {
      newSnapshots[currentIndex] = null;
      setSnapshots(newSnapshots);
      setSnapshotCaptured(false);
      
      sessionStorage.setItem('locationSnapshots', JSON.stringify(newSnapshots));
      
      console.log(`Deleted snapshot for location ${currentIndex}`);
    }
  };
  
  // UPDATED: Capture snapshots using both static API and dynamic panorama
  const captureSnapshots = async () => {
    const loc = locations[currentIndex];
    if (!loc) return;

    const mapUrl = getGoogleMapUrl(loc);
    let svUrl = getStreetViewUrl(loc);
    
    // NEW: If panorama is loaded, get the current view parameters
    if (panoramaRef.current) {
      try {
        const pov = panoramaRef.current.getPov();
        const position = panoramaRef.current.getPosition();
        // Update street view URL with current heading and pitch from panorama
        svUrl = `https://maps.googleapis.com/maps/api/streetview?size=600x300&location=${position.lat()},${position.lng()}&fov=80&heading=${Math.round(pov.heading)}&pitch=${Math.round(pov.pitch)}&key=${GOOGLE_MAPS_API_KEY}`;
      } catch (e) {
        console.warn('Could not get panorama POV, using default street view', e);
      }
    }

    if (!mapUrl && !svUrl) {
      alert("No map/street view available for this location.");
      return;
    }

    setIsCapturingSnapshot(true);
    try {
      const [mapImage, streetViewImage] = await Promise.all([
        mapUrl ? fetchDataUrlViaProxy(mapUrl) : Promise.resolve(null),
        svUrl  ? fetchDataUrlViaProxy(svUrl)  : Promise.resolve(null),
      ]);

      const newSnapshot = {
        index: currentIndex,
        mapImage,
        streetViewImage,
        title: annotations[currentIndex]?.title || "",
        description: annotations[currentIndex]?.description || "",
      };

      const next = [...(snapshots || [])];
      while (next.length <= currentIndex) next.push(null);
      next[currentIndex] = newSnapshot;

      setSnapshots(next);
      setSnapshotCaptured(true);
      sessionStorage.setItem("locationSnapshots", JSON.stringify(next));
      console.log("Snapshots captured (via proxy) for location", currentIndex);
      alert("Snapshots captured successfully!");
    } catch (err) {
      console.error("Error capturing snapshots via proxy:", err);
      alert(`Error capturing snapshots: ${err.message || err}`);
    } finally {
      setIsCapturingSnapshot(false);
    }
  };

  const loadFromLocalStorage = async () => {
    const caseDataString = localStorage.getItem('trackxCaseData');
    if (!caseDataString) {
      setError("No case data found. Please create a new case first.");
      return;
    }
    
    const caseData = JSON.parse(caseDataString);
    console.log('Loaded case data from localStorage:', caseData);
    
    if (!caseData.locations || caseData.locations.length === 0) {
      setError("No location data found in the case.");
      return;
    }
    
    setCaseDetails({
      caseNumber: caseData.caseNumber,
      caseTitle: caseData.caseTitle,
      dateOfIncident: formatDateForDisplay(caseData.dateOfIncident),
      region: caseData.region,
      between: caseData.between || 'Not specified'
    });
    
    setLocations(caseData.locations);
    
    const initialAnnotations = caseData.locations.map((location, index) => {
      if (location.annotation && (location.annotation.title || location.annotation.description)) {
        return {
          title: location.annotation.title || '',
          description: location.annotation.description || ''
        };
      }
      const existingTitle = caseData.locationTitles?.[index] || '';
      return { 
        title: existingTitle, 
        description: ''
      };
    });
    
    setAnnotations(initialAnnotations);
    
    if (caseData.selectedForReport && Array.isArray(caseData.selectedForReport)) {
      setSelectedForReport(caseData.selectedForReport);
    } else {
      setSelectedForReport(caseData.locations.map((_, index) => index));
    }

    if (!localStorage.getItem('trackxCurrentCaseId')) {
      try {
        const userId = getCurrentUserId();
        const savedCaseId = await saveCaseWithAnnotations(caseData, userId);
        localStorage.setItem('trackxCurrentCaseId', savedCaseId);
        setCurrentCaseId(savedCaseId);
        console.log('Case automatically saved to Firebase with ID:', savedCaseId);
        setSaveError(null);
      } catch (error) {
        console.warn('Could not auto-save to Firebase, continuing with localStorage only:', error);
        setSaveError('Unable to connect to cloud database');
      }
    }
  };

  useEffect(() => {
    const loadCaseData = async () => {
      setIsLoading(true);
      setSaveError(null);

      try {
        const localStr = localStorage.getItem("trackxCaseData");
        const caseId = localStorage.getItem("trackxCurrentCaseId");

        if (localStr) {
          const localCase = JSON.parse(localStr);
          const hasLocs = Array.isArray(localCase.locations) && localCase.locations.length > 0;

          if (hasLocs) {
            if (caseId) {
              try {
                const fb = await loadCaseWithAnnotations(caseId);
                if (fb.caseNumber && localCase.caseNumber && fb.caseNumber !== localCase.caseNumber) {
                  localStorage.removeItem("trackxCurrentCaseId");
                  sessionStorage.removeItem("locationSnapshots");
                }
              } catch (_err) {
                localStorage.removeItem("trackxCurrentCaseId");
                sessionStorage.removeItem("locationSnapshots");
              }
            }

            setCaseDetails({
              caseNumber: localCase.caseNumber,
              caseTitle: localCase.caseTitle,
              dateOfIncident: formatDateForDisplay(localCase.dateOfIncident),
              region: localCase.region,
              between: localCase.between || "Not specified",
            });

            setLocations(localCase.locations);

            const initialAnnotations = localCase.locations.map((_, i) => ({
              title:
                (localCase.locationTitles && localCase.locationTitles[i]) ||
                (localCase.locations[i] && localCase.locations[i].annotation && localCase.locations[i].annotation.title) ||
                "",
              description:
                (localCase.locations[i] && localCase.locations[i].annotation && localCase.locations[i].annotation.description) ||
                "",
            }));
            setAnnotations(initialAnnotations);

            setSelectedForReport(
              Array.isArray(localCase.selectedForReport)
                ? localCase.selectedForReport
                : localCase.locations.map((_, i) => i)
            );

            if (!localStorage.getItem("trackxCurrentCaseId")) {
              try {
                const savedId = await saveCaseWithAnnotations(localCase, getCurrentUserId());
                localStorage.setItem("trackxCurrentCaseId", savedId);
                setCurrentCaseId(savedId);
                setSaveError(null);
              } catch (e) {
                console.warn("Could not save new case to Firebase; staying local:", e);
                setSaveError("Unable to connect to cloud database");
              }
            } else {
              setCurrentCaseId(localStorage.getItem("trackxCurrentCaseId"));
            }

            const savedSnaps = sessionStorage.getItem("locationSnapshots");
            try {
              setSnapshots(savedSnaps ? JSON.parse(savedSnaps) : []);
            } catch {
              setSnapshots([]);
            }

            const storedIndex = parseInt(localStorage.getItem("trackxCurrentLocationIndex") || "0", 10);
            setCurrentIndex(
              Number.isFinite(storedIndex)
                ? Math.max(0, Math.min(storedIndex, localCase.locations.length - 1))
                : 0
            );
            localStorage.removeItem("trackxCurrentLocationIndex");

            setIsLoading(false);
            return;
          }
        }

        if (caseId) {
          const fb = await loadCaseWithAnnotations(caseId);

          setCaseDetails({
            caseNumber: fb.caseNumber,
            caseTitle: fb.caseTitle,
            dateOfIncident: formatDateForDisplay(fb.dateOfIncident),
            region: fb.region,
            between: fb.between || "Not specified",
          });

          setLocations(fb.locations || []);

          setAnnotations(
            (fb.locations || []).map((l, i) => ({
              title: l.title || (fb.locationTitles && fb.locationTitles[i]) || "",
              description: l.description || "",
            }))
          );

          setSelectedForReport(
            Array.isArray(fb.selectedForReport) ? fb.selectedForReport : (fb.locations || []).map((_, i) => i)
          );

          setCurrentCaseId(caseId);

          const savedSnaps = sessionStorage.getItem("locationSnapshots");
          try {
            setSnapshots(savedSnaps ? JSON.parse(savedSnaps) : []);
          } catch {
            setSnapshots([]);
          }

          const storedIndex = parseInt(localStorage.getItem("trackxCurrentLocationIndex") || "0", 10);
          setCurrentIndex(
            Number.isFinite(storedIndex)
              ? Math.max(0, Math.min(storedIndex, (fb.locations || []).length - 1))
              : 0
          );
          localStorage.removeItem("trackxCurrentLocationIndex");
        } else {
          setError("No case data found. Please create a new case first.");
        }
      } catch (e) {
        console.error("Error loading case data:", e);
        setError("Error loading case data: " + (e && e.message ? e.message : String(e)));
      } finally {
        setIsLoading(false);
      }
    };

    loadCaseData();
  }, []);

  useEffect(() => {
    const currentSnapshot = snapshots.find(snapshot => snapshot && snapshot.index === currentIndex);
    setSnapshotCaptured(!!currentSnapshot);
  }, [currentIndex, snapshots]);

  // REMOVED: Auto-save useEffect that was saving every 3 seconds
  // User changes are now saved only when they click away from text fields (onBlur)
  
  const currentLocation = locations[currentIndex] || null;
  
  const goToPrevious = () => {
    if (currentIndex > 0) {
      setCurrentIndex(currentIndex - 1);
    }
  };
  
  const goToNext = () => {
    if (currentIndex < locations.length - 1) {
      setCurrentIndex(currentIndex + 1);
    } else {
      saveAllAnnotations().then(() => {
        navigate("/overview");
      });
    }
  };
  
  const saveAllAnnotations = async () => {
    saveToLocalStorage();
    
    if (currentCaseId) {
      setIsSaving(true);
      setSaveError(null);
      
      try {
        const locationTitles = annotations.map(ann => ann?.title || '');
        const locationDescriptions = annotations.map(ann => ann?.description || '');
        
        await batchSaveAnnotations(currentCaseId, {
          locationTitles,
          locationDescriptions,
          selectedForReport,
          reportIntro: '',
          reportConclusion: ''
        });

        setLastSaved(new Date().toLocaleTimeString());
        console.log('Successfully saved annotations to Firebase');

        const hasSnapshots = snapshots.some(snapshot => snapshot && snapshot.mapImage);
        if (hasSnapshots) {
          try {
            const result = await saveSnapshotsToFirebase(currentCaseId);
            if (result.results && result.results.length > 0) {
              console.log('Snapshots saved to Firebase:', result.message);
            }
          } catch (snapshotError) {
            console.warn('Could not save snapshots to Firebase:', snapshotError.message);
          }
        }

      } catch (error) {
        console.error('Error saving annotations to Firebase:', error);
        setSaveError('Could not save to cloud database');
      } finally {
        setIsSaving(false);
      }
    } else {
      console.log('No case ID available, only saving to localStorage');
    }
  };

  const saveToLocalStorage = () => {
    try {
      const caseDataString = localStorage.getItem('trackxCaseData');
      if (caseDataString) {
        const caseData = JSON.parse(caseDataString);
        
        const locationsWithAnnotations = caseData.locations.map((location, index) => ({
          ...location,
          annotation: annotations[index] || { title: '', description: '' }
        }));
        
        const updatedCaseData = {
          ...caseData,
          locations: locationsWithAnnotations,
          selectedForReport: selectedForReport,
          locationTitles: annotations.map(ann => ann?.title || '')
        };
        
        localStorage.setItem('trackxCaseData', JSON.stringify(updatedCaseData));
      }

      if (snapshots && snapshots.length > 0) {
        sessionStorage.setItem('locationSnapshots', JSON.stringify(snapshots));
      }
    } catch (error) {
      console.error("Error saving to localStorage:", error);
    }
  };
  
  const toggleLocationSelection = () => {
    setSelectedForReport(prev => {
      if (prev.includes(currentIndex)) {
        return prev.filter(idx => idx !== currentIndex);
      } else {
        return [...prev, currentIndex];
      }
    });
  };
  
  const isCurrentLocationSelected = selectedForReport.includes(currentIndex);
  const progressText = `Location ${currentIndex + 1} of ${locations.length}`;
  
  const formatCoordinate = (coord) => {
    if (coord === undefined || coord === null) return "N/A";
    return typeof coord === 'number' ? coord.toFixed(6) : coord;
  };
  
  const getLocationAddress = (location) => {
    if (!location) return "Unknown Location";
    if (location.address) return location.address;
    return `Location at ${formatCoordinate(location.lat)}, ${formatCoordinate(location.lng)}`;
  };

  const getGoogleMapUrl = (location) => {
    if (!location || !isNum(location.lat) || !isNum(location.lng)) return null;
    return `https://maps.googleapis.com/maps/api/staticmap?center=${location.lat},${location.lng}&zoom=15&size=600x300&maptype=roadmap&markers=color:red%7C${location.lat},${location.lng}&key=${GOOGLE_MAPS_API_KEY}`;
  };
  
  const getStreetViewUrl = (location) => {
    if (!location || !isNum(location.lat) || !isNum(location.lng)) return null;
    return `https://maps.googleapis.com/maps/api/streetview?size=600x300&location=${location.lat},${location.lng}&fov=80&heading=70&pitch=0&key=${GOOGLE_MAPS_API_KEY}`;
  };

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
      <div className="absolute inset-0 bg-gradient-to-br from-black via-gray-900 to-black -z-10" />
  
      <div className="flex items-center justify-between px-6 py-4 bg-gradient-to-r from-black to-gray-900 shadow-md">
        <div className="flex items-center space-x-4">
          <div className="text-3xl cursor-pointer" onClick={() => setShowMenu(!showMenu)}>
            &#9776;
          </div>
          <Link to="/home">
            <img src={adflogo} alt="Logo" className="h-12 cursor-pointer hover:opacity-80 transition" />
          </Link>
        </div>
  
        <h1 className="text-xl font-bold text-white">Annotations</h1>
  
        <div className="flex items-center space-x-4">
          <div className="text-sm">
            {isSaving && <span className="text-yellow-400">Saving...</span>}
            {saveError && <span className="text-red-400">{saveError}</span>}
            {lastSaved && !isSaving && !saveError && (
              <span className="text-green-400">Saved {lastSaved}</span>
            )}
            {currentCaseId && !isSaving && !saveError && (
              <span className="text-xs text-gray-400 block">Cloud sync enabled</span>
            )}
          </div>
          <div>
            <p className="text-sm">{profile ? `${profile.firstName} ${profile.surname}` : "Loading..."}</p>
            <button onClick={handleSignOut} className="text-red-400 hover:text-red-600 text-xs">Sign Out</button>
          </div>
        </div>
      </div>
  
      {showMenu && (
        <div className="absolute top-16 left-0 bg-black bg-opacity-90 backdrop-blur-md text-white w-64 p-6 z-30 space-y-4 border-r border-gray-700 shadow-lg">
          <Link to="/home" className="block hover:text-blue-400" onClick={() => setShowMenu(false)}>🏠 Home</Link>
          <Link to="/new-case" className="block hover:text-blue-400" onClick={() => setShowMenu(false)}>📝 Create New Case / Report</Link>
          <Link to="/manage-cases" className="block hover:text-blue-400" onClick={() => setShowMenu(false)}>📂 Manage Cases</Link>
          <Link to="/my-cases" className="block hover:text-blue-400" onClick={() => setShowMenu(false)}>📋 My Cases</Link>
  
          {profile?.role === "admin" && (
            <Link to="/admin-dashboard" className="block hover:text-blue-400" onClick={() => setShowMenu(false)}>
              🛠 Admin Dashboard
            </Link>
          )}
        </div>
      )}

      <div className="flex justify-center space-x-8 bg-gradient-to-r from-black to-gray-900 bg-opacity-80 backdrop-blur-md py-2 text-white text-sm">        
        <Link to="/new-case" className="text-gray-400 hover:text-white">Case Information</Link>
        <span className="font-bold underline">Annotations</span>
        <Link
          to="/overview"
          onClick={(e) => { e.preventDefault(); saveAllAnnotations().then(() => navigate("/overview")); }}
          className="text-gray-400 hover:text-white"
        >
          Overview
        </Link>
      </div>

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

      {currentLocation && (
        <div className="max-w-6xl mx-auto px-6 py-8">
          <div className="mb-6 flex justify-between items-center">
            <div className="flex items-center space-x-2">
              <MapPin className="text-blue-500" />
              <h2 className="text-xl font-semibold">{getLocationAddress(currentLocation)}</h2>
            </div>
            <div className="flex items-center space-x-4">
              <div className="text-gray-400">{progressText}</div>
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

          <div className="mb-4 p-3 rounded bg-gray-800 bg-opacity-50">
            <div className="flex items-center justify-between">
              <div className="text-sm text-gray-400">
                💡 Your changes are saved automatically when you click away from a text field
                {currentCaseId && (
                  <span className="text-green-400 ml-2">✓ Cloud sync enabled</span>
                )}
                {!currentCaseId && (
                  <span className="text-yellow-400 ml-2">⚠ Local storage only</span>
                )}
              </div>
              <button
                onClick={saveAllAnnotations}
                disabled={isSaving}
                className="px-3 py-1 bg-green-600 hover:bg-green-700 disabled:bg-gray-600 text-white text-sm rounded transition-colors"
              >
                {isSaving ? 'Saving...' : 'Save Now'}
              </button>
            </div>
          </div>

          <div className={`mb-4 p-3 rounded flex items-center ${snapshotCaptured ? 'bg-green-900 bg-opacity-30' : 'bg-gray-800 bg-opacity-50'}`}>
            <div className={`mr-3 p-1 rounded-full ${snapshotCaptured ? 'bg-green-500' : 'bg-gray-500'}`}>
              <Camera size={18} className="text-white" />
            </div>
            <div className="flex-grow">
              <p className={snapshotCaptured ? 'text-green-400' : 'text-gray-400'}>
                {snapshotCaptured 
                  ? "Snapshots have been captured for this location" 
                  : "No snapshots captured. Click 'Capture Snapshots' to save map and street view images."}
              </p>
            </div>
            <div className="flex space-x-2">
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
              {snapshotCaptured && (
                <button
                  onClick={deleteSnapshot}
                  className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded"
                >
                  Delete Snapshots
                </button>
              )}
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            <div className="space-y-6">
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
                        e.target.src = "https://placehold.co/600x300?text=Map+View+Not+Available";
                      }}
                      crossOrigin="anonymous" 
                    />
                  ) : (
                    <div className="text-center text-gray-500">
                      <p className="mb-2">Unable to load map view</p>
                      <p className="text-xs">Coordinates: {formatCoordinate(currentLocation.lat)}, {formatCoordinate(currentLocation.lng)}</p>
                    </div>
                  )}
                </div>
              </div>
              
              <div className="bg-gray-800 rounded-lg overflow-hidden">
                <div className="bg-gray-700 py-2 px-4 text-sm font-medium flex justify-between items-center">
                  <span>Google Street View - Interactive 360°</span>
                  <span className="text-xs text-gray-400">Drag to rotate • Scroll to zoom</span>
                </div>
                <div className="h-64 bg-gray-900 flex items-center justify-center">
                  {isGoogleMapsLoaded && isNum(currentLocation.lat) && isNum(currentLocation.lng) ? (
                    <div 
                      ref={streetViewContainerRef}
                      className="w-full h-full"
                      style={{ minHeight: '256px' }}
                    />
                  ) : (
                    <div className="text-center text-gray-500">
                      <p className="mb-2">Loading interactive street view...</p>
                      <p className="text-xs">Street view may not be available in all areas</p>
                    </div>
                  )}
                </div>
              </div>
            </div>
            
            <div className="bg-gray-800 rounded-lg overflow-hidden">
              <div className="bg-gray-700 py-2 px-4 text-sm font-medium">Add Location Context</div>
              <div className="p-4 space-y-4">
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
                    onBlur={handleBlur}
                    className="w-full p-2 bg-gray-900 border border-gray-700 rounded text-white focus:border-blue-500 focus:ring focus:ring-blue-500 focus:ring-opacity-50"
                  />
                </div>
                
                <div>
                  <label htmlFor="locationDescription" className="block text-sm font-medium text-gray-300 mb-1">
                    Description
                  </label>

                  <div className="mb-2">
                    <button
                      type="button"
                      onClick={generateAIDescription}
                      disabled={isGenerating}
                      className={`px-3 py-2 rounded text-white ${isGenerating ? 'bg-gray-700' : 'bg-purple-700 hover:bg-purple-600'} text-sm`}
                    >
                      {isGenerating ? 'Generating…' : 'Generate AI Description'}
                    </button>
                  </div>

                  <textarea
                    id="locationDescription"
                    placeholder="Provide details about the significance of this location..."
                    value={annotations[currentIndex]?.description || ''}
                    onChange={(e) => updateAnnotation('description', e.target.value)}
                    onBlur={handleBlur}
                    className="w-full p-2 bg-gray-900 border border-gray-700 rounded text-white h-64 resize-none focus:border-blue-500 focus:ring focus:ring-blue-500 focus:ring-opacity-50"
                  />
                </div>

                <div className="p-3 bg-gray-900 rounded border border-gray-700">
                  <div className="grid grid-cols-2 gap-2 text-sm">
                    <div>
                      <p className="text-gray-400">
                        <span className="font-semibold">Time:</span> {extractTimeFromLocation(currentLocation)}
                      </p>
                    </div>
                    <div>
                      <p className="text-gray-400">
                        <span className="font-semibold">Status:</span> {currentLocation.ignitionStatus || "Unknown"}
                      </p>
                    </div>
                    <div className="col-span-2 mt-2">
                      <p className="text-gray-400">
                        <span className="font-semibold">Coordinates:</span> {formatCoordinate(currentLocation.lat)}, {formatCoordinate(currentLocation.lng)}
                      </p>
                    </div>
                    
                    {currentLocation.originalData && (
                      <div className="col-span-2 mt-2">
                        <details className="text-xs">
                          <summary className="text-blue-400 cursor-pointer">View original data from file</summary>
                          <div className="mt-2 p-2 bg-gray-800 rounded max-h-32 overflow-y-auto">
                            {currentLocation.originalData.csvDescription && (
                              <div className="mb-2">
                                <span className="text-gray-400">Original description:</span>
                                <span className="text-white ml-2">{currentLocation.originalData.csvDescription}</span>
                              </div>
                            )}
                            {currentLocation.originalData.rawData && Object.entries(currentLocation.originalData.rawData)
                              .filter(([key]) => key !== 'annotation')
                              .map(([key, value]) => (
                                <div key={key} className="mb-1">
                                  <span className="text-gray-400">{key}:</span> 
                                  <span className="text-white ml-2">{String(value)}</span>
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