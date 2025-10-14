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
  const { modalState, openModal, closeModal } = useNotificationModal();
  // ADD: interactive Street View
  const streetViewContainerRef = useRef(null);
  const panoramaRef = useRef(null);
  const [isGoogleMapsLoaded, setIsGoogleMapsLoaded] = useState(false);

    // at top of AnnotationsPage.jsx
  const isNum = (v) => typeof v === "number" && !Number.isNaN(v);

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
  const formattedDateTime = new Date().toLocaleString();

  // ADD: click-away saver
  const handleBlur = () => {
    if (!isLoading) saveAllAnnotations();
  };


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

  // ADD: Load Google Maps JS API
  useEffect(() => {
    if (window.google && window.google.maps) {
      setIsGoogleMapsLoaded(true);
      return;
    }
    const script = document.createElement("script");
    script.src = `https://maps.googleapis.com/maps/api/js?key=${GOOGLE_MAPS_API_KEY}&libraries=places`;
    script.async = true;
    script.defer = true;
    script.onload = () => setIsGoogleMapsLoaded(true);
    script.onerror = () => console.error("Failed to load Google Maps API");
    document.head.appendChild(script);
  }, [GOOGLE_MAPS_API_KEY]);

  // ADD: Mount/refresh Street View panorama when location changes
useEffect(() => {
  if (!isGoogleMapsLoaded || !streetViewContainerRef.current) return;
  const loc = locations[currentIndex];
  if (!loc || !isNum(loc.lat) || !isNum(loc.lng)) return;

  const position = { lat: Number(loc.lat), lng: Number(loc.lng) };

  if (!panoramaRef.current) {
    panoramaRef.current = new window.google.maps.StreetViewPanorama(
      streetViewContainerRef.current,
      {
        position,
        pov: { heading: 70, pitch: 0 },
        zoom: 1,
        addressControl: true,
        linksControl: true,
        panControl: true,
        fullscreenControl: true,
        motionTracking: true,
        motionTrackingControl: true,
      }
    );
  } else {
    panoramaRef.current.setPosition(position);
  }
}, [currentIndex, locations, isGoogleMapsLoaded]);


  // helper
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
  
// REPLACE your captureSnapshots with POV-aware version
const captureSnapshots = async () => {
  const loc = locations[currentIndex];
  if (!loc) return;

  const mapUrl = getGoogleMapUrl(loc);
  let svUrl = getStreetViewUrl(loc);

  // If interactive panorama exists, snapshot with its current POV/position
  if (panoramaRef.current) {
    try {
      const pov = panoramaRef.current.getPov();
      const pos = panoramaRef.current.getPosition();
      const lat = typeof pos.lat === "function" ? pos.lat() : pos.lat;
      const lng = typeof pos.lng === "function" ? pos.lng() : pos.lng;
      svUrl = `https://maps.googleapis.com/maps/api/streetview?size=600x300&location=${lat},${lng}&fov=80&heading=${Math.round(pov.heading)}&pitch=${Math.round(pov.pitch)}&key=${GOOGLE_MAPS_API_KEY}`;
    } catch (e) {
      console.warn("Unable to read panorama POV; falling back to default Street View URL.", e);
    }
  }

  if (!mapUrl && !svUrl) {
    openModal({
      variant: "info",
      title: "Imagery unavailable",
      description: "We couldn't retrieve map or street view imagery for this location.",
    });
    return;
  }

  setIsCapturingSnapshot(true);
  try {
    const [mapImage, streetViewImage] = await Promise.all([
      mapUrl ? fetchDataUrlViaProxy(mapUrl) : Promise.resolve(null),
      svUrl ? fetchDataUrlViaProxy(svUrl) : Promise.resolve(null),
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

    openModal({
      variant: "success",
      title: "Snapshots captured",
      description: "Map and street view imagery were saved for this location.",
    });
  } catch (err) {
    console.error("Error capturing snapshots via proxy:", err);
    openModal({
      variant: "error",
      title: "Snapshot capture failed",
      description: getFriendlyErrorMessage(err, "We couldn't capture imagery for this location. Please try again."),
    });
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

  
  const currentLocation = locations[currentIndex] || null;
  const totalLocations = locations.length;
  const selectedCount = selectedForReport.length;
  
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
  const savingStatus = isSaving
    ? "Saving…"
    : saveError
    ? saveError
    : lastSaved
    ? `Saved ${lastSaved}`
    : "";
  
  // Calculate progress indicator
  const progressText = `Location ${currentIndex + 1} of ${totalLocations}`;
  
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
      <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-gradient-to-br from-black via-gray-900 to-black text-white">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top,_rgba(30,64,175,0.22),_transparent_55%)]" />
        <div className="relative rounded-3xl border border-white/10 bg-white/[0.03] px-10 py-12 text-center shadow-[0_35px_90px_rgba(15,23,42,0.65)] backdrop-blur-xl">
          <div className="mx-auto mb-4 h-12 w-12 animate-spin rounded-full border-b-2 border-t-2 border-blue-700" />
          <p className="text-sm text-gray-300">Loading location data…</p>
        </div>
      </div>
    );
  }
  
  if (error) {
    return (
      <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-gradient-to-br from-black via-gray-900 to-black text-white">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_bottom,_rgba(88,28,135,0.25),_transparent_60%)]" />
        <div className="relative flex w-full max-w-md flex-col items-center rounded-3xl border border-white/10 bg-white/[0.03] px-10 py-12 text-center shadow-[0_35px_90px_rgba(15,23,42,0.65)] backdrop-blur-xl">
          <AlertTriangle className="mb-4 h-12 w-12 text-rose-400" />
          <h1 className="text-xl font-semibold">Something went wrong</h1>
          <p className="mt-2 text-sm text-gray-300">{error}</p>
          <Link
            to="/new-case"
            className="mt-8 inline-flex items-center gap-2 rounded-full border border-white/10 bg-gradient-to-r from-blue-900 via-slate-900 to-purple-900 px-5 py-2 text-sm font-semibold text-white shadow-[0_25px_65px_rgba(15,23,42,0.6)] transition hover:-translate-y-0.5"
          >
            Return to Case Information
          </Link>
        </div>
      </div>
    );
  }

  if (locations.length === 0) {
    return (
      <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-gradient-to-br from-black via-gray-900 to-black text-white">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top,_rgba(30,64,175,0.2),_transparent_55%)]" />
        <div className="relative flex w-full max-w-md flex-col items-center rounded-3xl border border-white/10 bg-white/[0.03] px-10 py-12 text-center shadow-[0_35px_90px_rgba(15,23,42,0.65)] backdrop-blur-xl">
          <AlertTriangle className="mb-4 h-12 w-12 text-amber-300" />
          <h1 className="text-xl font-semibold">No Locations Found</h1>
          <p className="mt-2 text-sm text-gray-300">We didn’t detect any stopped vehicle points in your upload.</p>
          <Link
            to="/new-case"
            className="mt-8 inline-flex items-center gap-2 rounded-full border border-white/10 bg-gradient-to-r from-blue-900 via-slate-900 to-purple-900 px-5 py-2 text-sm font-semibold text-white shadow-[0_25px_65px_rgba(15,23,42,0.6)] transition hover:-translate-y-0.5"
          >
            Return to Case Information
          </Link>
        </div>
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
  
      {/* Navbar */}
      <nav className="mx-6 mt-6 flex items-center justify-between rounded-3xl border border-white/10 bg-gradient-to-br from-black/85 via-slate-900/70 to-black/80 px-6 py-4 shadow-xl shadow-[0_25px_65px_rgba(8,11,24,0.65)] backdrop-blur-xl">
        <div className="flex items-center gap-4">
          <button
            type="button"
            onClick={() => setShowMenu(!showMenu)}
            className="flex h-11 w-11 items-center justify-center rounded-full border border-white/10 bg-white/[0.02] text-xl text-white shadow-inner shadow-white/5 transition hover:bg-white/10"
            aria-label="Toggle navigation"
          >
            &#9776;
          </button>

          <Link to="/home" className="hidden sm:block">
            <img
              src={adflogo}
              alt="ADF Logo"
              className="h-11 w-auto drop-shadow-[0_10px_20px_rgba(59,130,246,0.35)] transition hover:opacity-90"
            />
          </Link>
        </div>

        <div className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 text-2xl font-semibold tracking-[0.35em] text-white/80 drop-shadow-[0_2px_12px_rgba(15,23,42,0.55)]">
          ANNOTATIONS
        </div>

        <div className="flex items-center gap-6 text-sm text-gray-200">
          <div className="hidden text-right sm:block">
            {savingStatus && (
              <span className={saveError ? "text-rose-300" : isSaving ? "text-amber-300" : "text-emerald-300"}>
                {savingStatus}
              </span>
            )}
            {currentCaseId && !saveError && !isSaving && (
              <span className="block text-xs text-gray-400">Cloud sync enabled</span>
            )}
          </div>
          <div className="flex flex-col items-end">
            <span className="text-base font-semibold text-white">
              {profile ? `${profile.firstName || ""} ${profile.surname || ""}`.trim() || "Loading..." : "Loading..."}
            </span>
            <button
              onClick={handleSignOut}
              className="text-xs text-gray-400 transition hover:text-white"
            >
              Sign Out
            </button>
          </div>
          <div className="rounded-full bg-white/[0.02] px-3 py-1.5 text-xs font-medium text-gray-400 shadow-inner shadow-white/5">
            {formattedDateTime}
          </div>
        </div>
      </nav>

      {/* Hamburger Menu Content */}
      {showMenu && (
        <div className="absolute left-6 top-32 z-30 w-64 space-y-2 rounded-3xl border border-white/10 bg-gradient-to-br from-slate-950/85 via-slate-900/78 to-black/78 p-6 shadow-2xl shadow-[0_30px_60px_rgba(30,58,138,0.45)] backdrop-blur-2xl">
          <Link
            to="/home"
            className="flex items-center gap-3 rounded-2xl px-3 py-2 text-sm font-medium text-gray-200 transition hover:bg-white/10 hover:text-white"
            onClick={() => setShowMenu(false)}
          >
            <Home className="h-4 w-4" />
            Home
          </Link>
          <Link
            to="/new-case"
            className="flex items-center gap-3 rounded-2xl px-3 py-2 text-sm font-medium text-gray-200 transition hover:bg-white/10 hover:text-white"
            onClick={() => setShowMenu(false)}
          >
            <FilePlus2 className="h-4 w-4" />
            Create New Case
          </Link>
          <Link
            to="/manage-cases"
            className="flex items-center gap-3 rounded-2xl px-3 py-2 text-sm font-medium text-gray-200 transition hover:bg-white/10 hover:text-white"
            onClick={() => setShowMenu(false)}
          >
            <FolderOpen className="h-4 w-4" />
            Manage Cases
          </Link>
          <div className="flex items-center gap-3 rounded-2xl px-3 py-2 text-sm font-medium text-white bg-white/[0.045] shadow-inner shadow-white/10">
            <MapPin className="h-4 w-4" />
            Annotations
          </div>
          <Link
            to="/overview"
            className="flex items-center gap-3 rounded-2xl px-3 py-2 text-sm font-medium text-gray-200 transition hover:bg-white/10 hover:text-white"
            onClick={() => setShowMenu(false)}
          >
            <FileText className="h-4 w-4" />
            Overview
          </Link>
          <Link
            to="/my-cases"
            className="flex items-center gap-3 rounded-2xl px-3 py-2 text-sm font-medium text-gray-200 transition hover:bg-white/10 hover:text-white"
            onClick={() => setShowMenu(false)}
          >
            <Briefcase className="h-4 w-4" />
            My Cases
          </Link>

          {profile?.role === "admin" && (
            <Link
              to="/admin-dashboard"
              className="flex items-center gap-3 rounded-2xl px-3 py-2 text-sm font-medium text-gray-200 transition hover:bg-white/10 hover:text-white"
              onClick={() => setShowMenu(false)}
            >
              <LayoutDashboard className="h-4 w-4" />
              Admin Dashboard
            </Link>
          )}
        </div>
      )}

      {/* Nav Tabs */}
      <div className="mx-6 mt-6 flex justify-center gap-8 rounded-full border border-white/10 bg-white/[0.02] px-6 py-2 text-xs font-semibold text-gray-300 shadow-[0_15px_40px_rgba(15,23,42,0.45)] backdrop-blur-xl">
        <Link to="/new-case" className="text-gray-400 transition hover:text-white">
          Case Information
        </Link>
        <span className="inline-flex items-center rounded-full bg-gradient-to-r from-blue-900/85 to-purple-900/85 px-5 py-1.5 text-white shadow-[0_12px_30px_rgba(15,23,42,0.45)]">
          Annotations
        </span>
        <Link
          to="/overview"
          onClick={(e) => {
            e.preventDefault();
            saveAllAnnotations().then(() => navigate("/overview"));
          }}
          className="text-gray-400 transition hover:text-white"
        >
          Overview
        </Link>
      </div>
      
      {currentLocation && (
        <div className="relative mx-auto mt-10 w-full max-w-6xl px-6 pb-20">
          <section className="relative z-10 mb-8 space-y-6 overflow-hidden rounded-3xl border border-white/10 bg-white/[0.02] px-8 py-8 shadow-[0_35px_90px_rgba(15,23,42,0.55)] backdrop-blur-2xl">
            <div className="pointer-events-none absolute -top-24 right-0 h-48 w-48 rounded-full bg-blue-900/20 blur-3xl" />
            <div className="pointer-events-none absolute -bottom-28 left-4 h-56 w-56 rounded-full bg-purple-900/20 blur-3xl" />
            <div className="relative z-10 flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.35em] text-gray-400">Case Overview</p>
                <h2 className="mt-2 text-2xl font-semibold text-white">{caseDetails.caseTitle || "Untitled Case"}</h2>
                <div className="mt-4 grid grid-cols-1 gap-3 text-sm text-gray-300 sm:grid-cols-2">
                  <div>
                    <span className="text-gray-400">Case #</span>
                    <p className="font-medium text-white">{caseDetails.caseNumber || "N/A"}</p>
                  </div>
                  <div>
                    <span className="text-gray-400">Date</span>
                    <p className="font-medium text-white">{caseDetails.dateOfIncident || "N/A"}</p>
                  </div>
                  <div>
                    <span className="text-gray-400">Region</span>
                    <p className="font-medium text-white">{caseDetails.region || "Not specified"}</p>
                  </div>
                  <div>
                    <span className="text-gray-400">Between</span>
                    <p className="font-medium text-white">{caseDetails.between || "Not specified"}</p>
                  </div>
                </div>
              </div>

              <div className="flex flex-col gap-3">
                <div className="rounded-2xl border border-white/10 bg-white/[0.045] px-4 py-3 text-sm text-gray-300 shadow-inner shadow-white/10">
                  <div className="flex items-center justify-between">
                    <span className="font-medium text-white">Progress</span>
                    {savingStatus && (
                      <span className={`text-xs uppercase tracking-wide ${
                        saveError ? "text-rose-300" : isSaving ? "text-amber-300" : "text-emerald-300"
                      }`}>
                        {savingStatus}
                      </span>
                    )}
                  </div>
                  <div className="mt-3 flex items-center justify-between text-xs text-gray-300">
                    <span className="rounded-full border border-white/10 bg-white/[0.06] px-3 py-1 text-white">{progressText}</span>
                    <div className="flex items-center gap-2">
                      <span className="rounded-full border border-white/10 bg-white/[0.06] px-3 py-1 text-white">{selectedCount} selected</span>
                      <span className="rounded-full border border-white/10 bg-white/[0.06] px-3 py-1 text-gray-300">{totalLocations} total</span>
                    </div>
                  </div>
                </div>

                <div className="flex items-center justify-between rounded-2xl border border-white/10 bg-white/[0.02] px-4 py-3 text-sm text-gray-300 shadow-inner shadow-white/5">
                  <span>Include this location in report</span>
                  <label className="inline-flex items-center gap-2">
                    <input
                      type="checkbox"
                      id="includeInReport"
                      checked={isCurrentLocationSelected}
                      onChange={toggleLocationSelection}
                      className="h-5 w-5 rounded border-white/20 bg-black/40 text-blue-600 focus:ring-blue-500"
                    />
                    <span className="text-xs text-gray-300">{isCurrentLocationSelected ? "Selected" : "Excluded"}</span>
                  </label>
                </div>
              </div>
            </div>
          </section>

          <section className="relative z-10 space-y-8 rounded-3xl border border-white/10 bg-white/[0.02] px-6 py-8 shadow-[0_35px_90px_rgba(15,23,42,0.55)] backdrop-blur-2xl">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
              <div className="flex items-center gap-2 text-lg font-semibold text-white">
                <MapPin className="h-5 w-5 text-blue-400" />
                {getLocationAddress(currentLocation)}
              </div>
              <div className="flex flex-wrap items-center gap-3 text-sm text-gray-300">
                {currentCaseId ? (
                  <span className="rounded-full border border-emerald-400/30 bg-emerald-500/10 px-3 py-1 text-emerald-200">
                    ✓ Cloud sync enabled
                  </span>
                ) : (
                  <span className="rounded-full border border-amber-400/30 bg-amber-500/10 px-3 py-1 text-amber-200">
                    ⚠ Local storage only
                  </span>
                )}
              </div>
            </div>

            <div className="flex flex-col gap-3 rounded-2xl border border-white/10 bg-white/[0.02] px-4 py-3 text-sm text-gray-300 shadow-inner shadow-white/5">
              <span>Annotations auto-save every 3 seconds.</span>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <span className="text-xs text-gray-400">
                  Work through each stop to build a compelling movement report for investigators and prosecutors.
                </span>
                <button
                  onClick={saveAllAnnotations}
                  disabled={isSaving}
                  className={`inline-flex items-center gap-2 rounded-full border border-white/10 px-4 py-2 text-xs font-semibold text-white transition ${
                    isSaving
                      ? "bg-white/[0.05] text-gray-400 cursor-not-allowed"
                      : "bg-gradient-to-r from-emerald-800 to-teal-700 shadow-[0_15px_35px_rgba(15,23,42,0.55)] hover:-translate-y-0.5"
                  }`}
                >
                  {isSaving ? "Saving…" : "Save Now"}
                </button>
              </div>
            </div>

            <div className={`flex flex-col gap-3 rounded-2xl border border-white/10 px-4 py-3 text-sm transition ${
              snapshotCaptured
                ? "bg-emerald-500/10 text-emerald-200 shadow-[0_18px_45px_rgba(16,185,129,0.35)]"
                : "bg-white/[0.02] text-gray-300 shadow-inner shadow-white/5"
            }`}>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <div className={`flex h-8 w-8 items-center justify-center rounded-full border ${
                    snapshotCaptured ? "border-emerald-500/50 bg-emerald-500/20" : "border-white/10 bg-white/[0.04]"
                  }`}>
                    <Camera size={18} className={snapshotCaptured ? "text-emerald-300" : "text-gray-300"} />
                  </div>
                  <div>
                    <p className="font-semibold text-white">
                      {snapshotCaptured ? "Imagery captured" : "Capture supporting imagery"}
                    </p>
                    <p className="text-xs text-gray-400">
                      Save static map and street view snapshots to enrich your contextual notes.
                    </p>
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    onClick={captureSnapshots}
                    disabled={isCapturingSnapshot}
                    className={`rounded-full border border-white/10 px-4 py-2 text-xs font-semibold text-white transition ${
                      isCapturingSnapshot
                        ? "bg-white/[0.05] text-gray-400 cursor-not-allowed"
                        : "bg-gradient-to-r from-blue-900 via-slate-900 to-indigo-900 shadow-[0_15px_35px_rgba(15,23,42,0.55)] hover:-translate-y-0.5"
                    }`}
                  >
                    {isCapturingSnapshot ? "Capturing…" : snapshotCaptured ? "Recapture Imagery" : "Capture Imagery"}
                  </button>
                  {snapshotCaptured && (
                    <button
                      onClick={deleteSnapshot}
                      className="rounded-full border border-white/10 px-4 py-2 text-xs font-semibold text-white transition bg-gradient-to-r from-rose-900 to-red-900 shadow-[0_15px_35px_rgba(127,29,29,0.55)] hover:-translate-y-0.5"
                    >
                      Delete Snapshot
                    </button>
                  )}
                </div>
              </div>
            </div>

            <div className="grid gap-6 lg:grid-cols-2">
              <div className="overflow-hidden rounded-2xl border border-white/10 bg-white/[0.02] shadow-[0_18px_45px_rgba(15,23,42,0.45)]">
                <div className="border-b border-white/10 bg-white/[0.04] px-4 py-3 text-sm font-medium text-gray-200">
                  Map View
                </div>
                <div className="flex h-64 items-center justify-center bg-black/30">
                  {getGoogleMapUrl(currentLocation) ? (
                    <img
                      ref={mapImageRef}
                      src={getGoogleMapUrl(currentLocation)}
                      alt="Map view of location"
                      className="h-full w-full object-cover"
                      onError={(e) => {
                        e.target.onerror = null;
                        e.target.src = "https://placehold.co/600x300?text=Map+View+Not+Available";
                      }}
                      crossOrigin="anonymous"
                    />
                  ) : (
                    <div className="px-6 text-center text-sm text-gray-400">
                      <p className="mb-2">Unable to load map view</p>
                      <p className="text-xs">Coordinates: {formatCoordinate(currentLocation.lat)}, {formatCoordinate(currentLocation.lng)}</p>
                    </div>
                  )}
                </div>
              </div>

              
              <div className="overflow-hidden rounded-2xl border border-white/10 bg-white/[0.02] shadow-[0_18px_45px_rgba(15,23,42,0.45)]">
                <div className="border-b border-white/10 bg-white/[0.04] px-4 py-3 text-sm font-medium text-gray-200">
                  Street View — Interactive 360°
                </div>
                <div className="flex h-64 items-center justify-center bg-black/30">
                  {isGoogleMapsLoaded && isNum(currentLocation?.lat) && isNum(currentLocation?.lng) ? (
                    <div ref={streetViewContainerRef} className="h-full w-full" />
                  ) : (
                    // Fallback to static image or message if API not ready
                    getStreetViewUrl(currentLocation) ? (
                      <img
                        ref={streetViewImageRef}
                        src={getStreetViewUrl(currentLocation)}
                        alt="Street view of location"
                        className="h-full w-full object-cover"
                        onError={(e) => {
                          e.target.onerror = null;
                          e.target.src = "https://placehold.co/600x300?text=Street+View+Not+Available";
                        }}
                        crossOrigin="anonymous"
                      />
                    ) : (
                      <div className="px-6 text-center text-sm text-gray-400">
                        <p className="mb-2">Street view not available for this location</p>
                        <p className="text-xs">Street view may not be available in all areas</p>
                      </div>
                    )
                  )}
                </div>
              </div>
            </div>

            <div className="space-y-6 rounded-2xl border border-white/10 bg-white/[0.02] px-6 py-6 shadow-[0_18px_45px_rgba(15,23,42,0.45)]">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-baseline sm:justify-between">
                <div>
                  <h3 className="text-lg font-semibold text-white">Add Location Context</h3>
                  <p className="text-xs text-gray-400">Craft concise, prosecutable insights for this stop.</p>
                </div>
                <button
                  type="button"
                  onClick={generateAIDescription}
                  disabled={isGenerating}
                  className={`inline-flex items-center gap-2 rounded-full border border-white/10 px-4 py-2 text-xs font-semibold text-white transition ${
                    isGenerating
                      ? "bg-white/[0.05] text-gray-400 cursor-not-allowed"
                      : "bg-gradient-to-r from-purple-900 via-indigo-900 to-blue-900 shadow-[0_15px_35px_rgba(15,23,42,0.55)] hover:-translate-y-0.5"
                  }`}
                >
                  {isGenerating ? "Generating…" : "Generate AI Description"}
                </button>
              </div>

              <div className="space-y-4">
                <div>
                  <label htmlFor="locationTitle" className="mb-1 block text-sm font-medium text-gray-300">
                    Location Title
                  </label>
                  <input
                    type="text"
                    id="locationTitle"
                    placeholder="e.g. Suspect's Home, Fuel Station, etc."
                    value={annotations[currentIndex]?.title || ""}
                    onChange={(e) => updateAnnotation("title", e.target.value)}
                    onBlur={handleBlur}
                    className="w-full rounded-xl border border-white/10 bg-white/[0.02] px-3 py-2 text-sm text-white placeholder-gray-500 focus:border-blue-700/50 focus:outline-none focus:ring-2 focus:ring-blue-700/30"
                  />
                </div>

                <div>
                  <label htmlFor="locationDescription" className="mb-1 block text-sm font-medium text-gray-300">
                    Description
                  </label>
                  <textarea
                    id="locationDescription"
                    placeholder="Provide details about the significance of this location..."
                    value={annotations[currentIndex]?.description || ""}
                    onChange={(e) => updateAnnotation("description", e.target.value)}
                    onBlur={handleBlur}
                    className="h-56 w-full resize-none rounded-xl border border-white/10 bg-white/[0.02] px-3 py-3 text-sm text-white placeholder-gray-500 focus:border-blue-700/50 focus:outline-none focus:ring-2 focus:ring-blue-700/30"
                  />
                </div>

                <div className="rounded-2xl border border-white/10 bg-white/[0.02] px-4 py-4 text-sm text-gray-300 shadow-inner shadow-white/5">
                  <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                    <p>
                      <span className="text-gray-400">Time:</span> <span className="text-white">{extractTimeFromLocation(currentLocation)}</span>
                    </p>
                    <p>
                      <span className="text-gray-400">Status:</span> <span className="text-white">{currentLocation.ignitionStatus || "Unknown"}</span>
                    </p>
                    <p className="md:col-span-2">
                      <span className="text-gray-400">Coordinates:</span> <span className="text-white">{formatCoordinate(currentLocation.lat)}, {formatCoordinate(currentLocation.lng)}</span>
                    </p>
                  </div>
                  {currentLocation.originalData && (
                    <div className="mt-4">
                      <details className="text-xs text-gray-300">
                        <summary className="cursor-pointer text-blue-300">View original data from file</summary>
                        <div className="mt-2 max-h-36 overflow-y-auto rounded-xl border border-white/10 bg-white/[0.02] p-3">
                          {currentLocation.originalData.csvDescription && (
                            <div className="mb-2">
                              <span className="text-gray-400">Original description:</span>
                              <span className="ml-2 text-white">{currentLocation.originalData.csvDescription}</span>
                            </div>
                          )}
                          {currentLocation.originalData.rawData &&
                            Object.entries(currentLocation.originalData.rawData)
                              .filter(([key]) => key !== "annotation")
                              .map(([key, value]) => (
                                <div key={key} className="mb-1">
                                  <span className="text-gray-400">{key}:</span>
                                  <span className="ml-2 text-white">{String(value)}</span>
                                </div>
                              ))}
                        </div>
                      </details>
                    </div>
                  )}
                </div>
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-4">
              <button
                onClick={goToPrevious}
                disabled={currentIndex === 0}
                className={`inline-flex items-center gap-2 rounded-full px-5 py-2 text-sm font-semibold transition ${
                  currentIndex === 0
                    ? "border border-white/10 bg-white/[0.04] text-gray-500 cursor-not-allowed"
                    : "border border-white/10 bg-gradient-to-r from-slate-900 to-blue-900 text-white shadow-[0_20px_45px_rgba(15,23,42,0.55)] hover:-translate-y-0.5"
                }`}
              >
                <ArrowLeft className="h-4 w-4" />
                Previous Location
              </button>

              <button
                onClick={goToNext}
                className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-gradient-to-r from-blue-900 via-indigo-900 to-purple-900 px-5 py-2 text-sm font-semibold text-white shadow-[0_20px_45px_rgba(15,23,42,0.6)] transition hover:-translate-y-0.5"
              >
                {currentIndex < totalLocations - 1 ? "Next Location" : "Continue to Overview"}
                <ArrowRight className="h-4 w-4" />
              </button>
            </div>
          </section>
        </div>
      )}
    </motion.div>
  );
}

export default AnnotationsPage;