import React, { useState, useEffect } from "react";
import { useLocation, useNavigate, Link } from "react-router-dom";
import { motion } from "framer-motion";
import adflogo from "../assets/image-removebg-preview.png";
import axios from "axios";
import { useAuth } from "../context/AuthContext";
import { signOut } from "firebase/auth";
import { auth } from "../firebase";
import { MapPin, FileText, Camera, Eye, Home, FilePlus2, FolderOpen, Briefcase, LayoutDashboard } from "lucide-react";
import { clearCaseSession } from "../utils/caseSession";
import NotificationModal from "../components/NotificationModal";
import useNotificationModal from "../hooks/useNotificationModal";
import { getFriendlyErrorMessage } from "../utils/errorMessages";

// Firebase services (teammate’s)
import {
  loadCaseWithAnnotations,
  getUserCases,
  saveCaseWithAnnotations,
  getCurrentUserId,
  loadSnapshotsFromFirebase,
  getCaseReports,
} from "../services/firebaseServices";

function EditCasePage() {
  const location = useLocation();
  const navigate = useNavigate();
  const { profile } = useAuth();
  const { modalState, openModal, closeModal } = useNotificationModal();

  const showError = (title, error, fallback) =>
    openModal({
      variant: "error",
      title,
      description: getFriendlyErrorMessage(error, fallback),
    });

  const showSuccess = (title, description, primaryAction) =>
    openModal({
      variant: "success",
      title,
      description,
      ...(primaryAction ? { primaryAction: { closeOnClick: true, ...primaryAction } } : {}),
    });

  // Possible sources
  const caseDataFromLocation = location.state?.caseData || null;
  const docIdFromLocation = location.state?.docId || null;      // backend id
  const caseIdFromLocation = location.state?.caseId || null;    // firebase id

  // Loading & base state
  const [loading, setLoading] = useState(true);
  const [caseData, setCaseData] = useState(caseDataFromLocation);

  // Editable fields
  const [caseNumber, setCaseNumber] = useState("");
  const [caseTitle, setCaseTitle] = useState("");
  const [dateOfIncident, setDateOfIncident] = useState("");
  const [region, setRegion] = useState("");
  const [between, setBetween] = useState("");
  const [status, setStatus] = useState("not started");
  const [urgency, setUrgency] = useState("");
  const [showMenu, setShowMenu] = useState(false);

  // Firebase integration state
  const [firebaseCase, setFirebaseCase] = useState(null);
  const [annotationsAvailable, setAnnotationsAvailable] = useState(false);
  const [loadingAnnotations, setLoadingAnnotations] = useState(false);
  const [annotationStats, setAnnotationStats] = useState({
    locations: 0,
    snapshots: 0,
    hasIntro: false,
    hasConclusion: false,
    hasLocationTitles: false,
    firebaseReports: 0,
    caseId: null,
  });

  const handleSignOut = async () => {
    try {
      await signOut(auth);
      navigate("/");
    } catch (error) {
      console.error("Sign-out failed:", error.message);
    }
  };

  // Fetch case (Firebase first, then backend, else use provided state)
  useEffect(() => {
    const fetchCase = async () => {
      setLoading(true);
      try {
        if (caseIdFromLocation) {
          // Prefer Firebase
          try {
            const fb = await loadCaseWithAnnotations(caseIdFromLocation);
            setCaseData(fb);
            setFirebaseCase(fb);
          } catch (e) {
            console.warn("Firebase load failed; trying backend:", e);
            await fetchFromBackend();
          }
        } else if (docIdFromLocation) {
          await fetchFromBackend();
        } else if (caseDataFromLocation) {
          setCaseData(caseDataFromLocation);
        } else {
          console.error("No case identifier provided");
          setLoading(false);
          return;
        }

        await checkForAnnotations(); // after we have caseData
      } catch (err) {
        console.error("Failed to fetch case:", err);
      } finally {
        setLoading(false);
      }
    };

    const fetchFromBackend = async () => {
      try {
        const res = await axios.get("http://localhost:8000/cases/search", { params: {} });
        const found = (res.data?.cases || []).find((c) => c.doc_id === docIdFromLocation);
        if (found) setCaseData(found);
        else console.warn("Case not found in backend");
      } catch (err) {
        console.error("Failed to fetch case from backend:", err);
        throw err;
      }
    };

    fetchCase();
  }, [caseDataFromLocation, docIdFromLocation, caseIdFromLocation]);

  // Normalize into form state
  useEffect(() => {
    if (!caseData) return;

    setCaseNumber(caseData.caseNumber || caseData.case_number || "");
    setCaseTitle(caseData.caseTitle || caseData.title || "");

    // Date: handle strings/Date/Firestore
    let dateValue = "";
    const src = caseData.dateOfIncident || caseData.date;
    if (src) {
      if (typeof src === "string") {
        dateValue = src.split("T")[0];
      } else if (src?.toISOString) {
        dateValue = src.toISOString().split("T")[0];
      } else if (src?.seconds) {
        const d = new Date(src.seconds * 1000);
        dateValue = d.toISOString().split("T")[0];
      }
    }
    setDateOfIncident(dateValue);

    setRegion(caseData.region || "");
    setBetween(caseData.between || "");
    setStatus(caseData.status || "not started");
    setUrgency(caseData.urgency || "");
  }, [caseData]);

  // Check annotations presence (Firebase + session snapshots + reports)
  const checkForAnnotations = async () => {
    if (!caseData) return;
    setLoadingAnnotations(true);

    try {
      const userId = getCurrentUserId();

      // If already a Firebase case with locations
      let existing = null;
      if (caseData.caseId && caseData.locations) {
        existing = caseData;
      } else {
        // Try to locate Firebase case by caseNumber
        try {
          const userCases = await getUserCases(userId);
          const found = userCases.find((c) => c.caseNumber === (caseData.caseNumber || caseData.case_number));
          if (found?.caseId) {
            const full = await loadCaseWithAnnotations(found.caseId);
            existing = full;
            setFirebaseCase(full);
          }
        } catch (e) {
          console.warn("Could not load user cases:", e);
        }
      }

      if (existing?.locations) {
        setAnnotationsAvailable(true);

        // Count snapshots (Firebase hints + sessionStorage)
        let snapshotCount = 0;
        try {
          if (existing.caseId) {
            await loadSnapshotsFromFirebase(existing.caseId);
            snapshotCount = (existing.locations || []).filter(
              (loc) => loc.snapshotUrl || loc.mapSnapshotUrl || loc.streetViewSnapshotUrl
            ).length;

            const ss = sessionStorage.getItem("locationSnapshots");
            if (ss) {
              try {
                const parsed = JSON.parse(ss);
                const localCount = parsed.filter((s) => s && (s.mapImage || s.streetViewImage || s.description)).length;
                snapshotCount = Math.max(snapshotCount, localCount);
              } catch (pe) {
                console.warn("Could not parse session snapshots:", pe);
              }
            }
          }
        } catch (se) {
          console.warn("Could not load snapshots:", se);
        }

        // Reports in Firebase
        let firebaseReportsCount = 0;
        try {
          if (existing.caseId) {
            const reports = await getCaseReports(existing.caseId);
            firebaseReportsCount = reports.length;
          }
        } catch (re) {
          console.warn("Could not load reports:", re);
        }

        // Stats
        const stats = {
          locations: existing.locations?.length || 0,
          snapshots: snapshotCount,
          hasIntro: !!(existing.reportIntro && existing.reportIntro.trim()),
          hasConclusion: !!(existing.reportConclusion && existing.reportConclusion.trim()),
          hasLocationTitles: !!(existing.locationTitles && existing.locationTitles.some((t) => t && t.trim())),
          firebaseReports: firebaseReportsCount,
          caseId: existing.caseId || null,
        };

        setAnnotationStats(stats);
      } else {
        setAnnotationsAvailable(false);
        setAnnotationStats({
          locations: 0,
          snapshots: 0,
          hasIntro: false,
          hasConclusion: false,
          hasLocationTitles: false,
          firebaseReports: 0,
          caseId: null,
        });
      }
    } catch (err) {
      console.error("Error checking annotations:", err);
      setAnnotationsAvailable(false);
    } finally {
      setLoadingAnnotations(false);
    }
  };

  // Save updates: backend (compat) + Firebase (if available)
  const handleUpdate = async (e) => {
    e.preventDefault();

    try {
      // A) Backend update (compat)
      if (docIdFromLocation || caseData?.doc_id) {
        try {
          await axios.put("http://localhost:8000/cases/update", {
            doc_id: caseData?.doc_id || docIdFromLocation,
            caseNumber,
            caseTitle,
            dateOfIncident,
            region,
            between,
            status,
            urgency,
          });
        } catch (backendError) {
          console.warn("Backend update failed:", backendError);
        }
      }

      // B) Firebase update (if we have an existing Firebase case)
      if (firebaseCase?.caseId) {
        try {
          const updated = {
            ...firebaseCase,
            caseNumber,
            caseTitle,
            dateOfIncident,
            region,
            between,
            status,
            urgency,
          };
          await saveCaseWithAnnotations(updated, getCurrentUserId());
        } catch (fbErr) {
          console.warn("Firebase update failed:", fbErr);
        }
      }

      showSuccess(
        "Case updated",
        "Your changes have been saved successfully.",
        {
          label: "Return to dashboard",
          onClick: () => navigate("/home"),
        }
      );
    } catch (error) {
      console.error("Error updating case:", error);
      showError("Update failed", error, "An error occurred while updating the case.");
    }
  };

  // Prepare a case payload for annotations/overview and navigate
  const loadIntoAnnotationSystem = async (targetPage = "annotations") => {
    try {
      let payload;
      if (firebaseCase) {
        payload = {
          caseId: firebaseCase.caseId,
          caseNumber: firebaseCase.caseNumber,
          caseTitle: firebaseCase.caseTitle,
          dateOfIncident: firebaseCase.dateOfIncident,
          region: firebaseCase.region,
          between: firebaseCase.between,
          locations: firebaseCase.locations || [],
          locationTitles: firebaseCase.locationTitles || [],
          reportIntro: firebaseCase.reportIntro || "",
          reportConclusion: firebaseCase.reportConclusion || "",
          selectedForReport: firebaseCase.selectedForReport || [],
          urgency: firebaseCase.urgency || "",
        };
      } else {
        // new case edit flow → hard reset so we don't pull an old case
        clearCaseSession();
        payload = {
          caseId: null,
          caseNumber,
          caseTitle,
          dateOfIncident,
          region,
          between,
          urgency,
          locations: [],
          locationTitles: [],
          reportIntro: "",
          reportConclusion: "",
          selectedForReport: [],
        };
      }

      localStorage.setItem("trackxCaseData", JSON.stringify(payload));
      if (firebaseCase?.caseId) localStorage.setItem("trackxCurrentCaseId", firebaseCase.caseId);
      else localStorage.removeItem("trackxCurrentCaseId");

      navigate(
          targetPage === "overview" ? "/overview" : "/annotations",
          { state: { caseId: firebaseCase?.caseId || null } } );
    } catch (err) {
      console.error("Error loading case into annotation system:", err);
      showError(
        "Unable to load case",
        err,
        "We couldn't load this case for annotations. Please try again."
      );
    }
  };

  // Create a fresh annotations session if none exist
  const createAnnotationSession = async () => {
    try {
      const payload = {
        caseNumber,
        caseTitle,
        dateOfIncident,
        region,
        between,
        urgency,
        locations: [],
        locationTitles: [],
        reportIntro: "",
        reportConclusion: "",
        selectedForReport: [],
      };
      localStorage.setItem("trackxCaseData", JSON.stringify(payload));
      localStorage.removeItem("trackxCurrentCaseId");
      navigate("/new-case");
    } catch (err) {
      console.error("Error creating annotation session:", err);
      showError(
        "Unable to start session",
        err,
        "We couldn't create a new annotation session. Please try again."
      );
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-black text-white flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-500 mx-auto mb-4"></div>
          <p className="text-gray-300">Loading case...</p>
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
      {/* BG */}
      <div className="absolute inset-0 bg-gradient-to-br from-black via-gray-900 to-black -z-10" />

      {/* Navbar */}
      <div className="flex items-center justify-between px-6 py-4 bg-gradient-to-r from-black to-gray-900 shadow-md">
        <div className="flex items-center space-x-4">
          <div className="text-3xl cursor-pointer" onClick={() => setShowMenu(!showMenu)}>
            &#9776;
          </div>
          <Link to="/home">
            <img src={adflogo} alt="Logo" className="h-12 cursor-pointer hover:opacity-80 transition" />
          </Link>
        </div>
        <h1 className="text-xl font-bold text-white">Edit Case</h1>
        <div className="flex items-center space-x-4">
          <div>
            <p className="text-sm">{profile ? `${profile.firstName} ${profile.surname}` : "Loading..."}</p>
            <button onClick={handleSignOut} className="text-red-400 hover:text-red-600 text-xs">
              Sign Out
            </button>
          </div>
        </div>
      </div>

      {/* Hamburger Menu */}
      {showMenu && (
        <div className="absolute top-16 left-0 w-64 rounded-r-3xl border border-white/10 bg-gradient-to-br from-gray-900/95 to-black/90 backdrop-blur-xl p-6 z-30 shadow-2xl space-y-2">
          <Link
            to="/home"
            className="flex items-center gap-3 px-3 py-2 rounded-2xl text-sm font-medium text-gray-200 hover:text-white hover:bg-white/10 transition"
            onClick={() => setShowMenu(false)}
          >
            <Home className="w-4 h-4" />
            Home
          </Link>
          <Link
            to="/new-case"
            className="flex items-center gap-3 px-3 py-2 rounded-2xl text-sm font-medium text-gray-200 hover:text-white hover:bg-white/10 transition"
            onClick={() => setShowMenu(false)}
          >
            <FilePlus2 className="w-4 h-4" />
            Create New Case
          </Link>
          <Link
            to="/manage-cases"
            className="flex items-center gap-3 px-3 py-2 rounded-2xl text-sm font-medium text-gray-200 hover:text-white hover:bg-white/10 transition"
            onClick={() => setShowMenu(false)}
          >
            <FolderOpen className="w-4 h-4" />
            Manage Cases
          </Link>
          <Link
            to="/my-cases"
            className="flex items-center gap-3 px-3 py-2 rounded-2xl text-sm font-medium text-gray-200 hover:text-white hover:bg-white/10 transition"
            onClick={() => setShowMenu(false)}
          >
            <Briefcase className="w-4 h-4" />
            My Cases
          </Link>
          {profile?.role === "admin" && (
            <Link
              to="/admin-dashboard"
              className="flex items-center gap-3 px-3 py-2 rounded-2xl text-sm font-medium text-gray-200 hover:text-white hover:bg-white/10 transition"
              onClick={() => setShowMenu(false)}
            >
              <LayoutDashboard className="w-4 h-4" />
              Admin Dashboard
            </Link>
          )}
        </div>
      )}

      {/* Page Content */}
      <div className="max-w-4xl mx-auto px-6 py-8 space-y-8">
        {/* Annotations & Reports status */}
        <div className="bg-gray-800 p-4 rounded-lg shadow">
          <h3 className="text-lg font-semibold mb-3 flex items-center">
            <FileText className="mr-2" size={20} />
            Annotations & Reports
          </h3>

          {loadingAnnotations ? (
            <div className="flex items-center text-gray-400">
              <div className="animate-spin rounded-full h-4 w-4 border-t-2 border-b-2 border-blue-500 mr-2"></div>
              Checking for annotations and reports...
            </div>
          ) : annotationsAvailable ? (
            <div className="space-y-3">
              <div className="bg-green-900 bg-opacity-30 border border-green-600 rounded p-3">
                <p className="text-green-400 font-medium">Annotations Available</p>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mt-2 text-sm">
                  <div>
                    <span className="text-gray-400">Locations:</span>
                    <span className="ml-1 font-medium">{annotationStats.locations}</span>
                  </div>
                  <div>
                    <span className="text-gray-400">Snapshots:</span>
                    <span className="ml-1 font-medium text-green-400">{annotationStats.snapshots}</span>
                  </div>
                  <div>
                    <span className="text-gray-400">Reports:</span>
                    <span className="ml-1 font-medium text-blue-400">{annotationStats.firebaseReports}</span>
                  </div>
                  <div>
                    <span className="text-gray-400">Introduction:</span>
                    <span className={`ml-1 font-medium ${annotationStats.hasIntro ? "text-green-400" : "text-red-400"}`}>
                      {annotationStats.hasIntro ? "Yes" : "No"}
                    </span>
                  </div>
                  <div>
                    <span className="text-gray-400">Conclusion:</span>
                    <span className={`ml-1 font-medium ${annotationStats.hasConclusion ? "text-green-400" : "text-red-400"}`}>
                      {annotationStats.hasConclusion ? "Yes" : "No"}
                    </span>
                  </div>
                  <div>
                    <span className="text-gray-400">Titles:</span>
                    <span className={`ml-1 font-medium ${annotationStats.hasLocationTitles ? "text-green-400" : "text-yellow-400"}`}>
                      {annotationStats.hasLocationTitles ? "Set" : "Default"}
                    </span>
                  </div>
                </div>

                {annotationStats.caseId && (
                  <div className="mt-2 pt-2 border-t border-green-700">
                    <p className="text-xs text-green-300">
                      Firebase Case ID: {String(annotationStats.caseId).slice(-8)}... <span className="ml-2">✓ Cloud synchronized</span>
                    </p>
                  </div>
                )}
              </div>

              <div className="flex gap-3 flex-wrap">
                <button
                  onClick={() => loadIntoAnnotationSystem("annotations")}
                  className="flex items-center px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded text-white text-sm transition-colors"
                >
                  <MapPin size={16} className="mr-2" />
                  View/Edit Annotations
                </button>

                <button
                  onClick={() => loadIntoAnnotationSystem("overview")}
                  className="flex items-center px-4 py-2 bg-green-600 hover:bg-green-700 rounded text-white text-sm transition-colors"
                >
                  <Eye size={16} className="mr-2" />
                  View Reports & Overview
                </button>

                {annotationStats.snapshots > 0 && (
                  <div className="flex items-center px-3 py-2 bg-purple-900 bg-opacity-50 rounded text-purple-300 text-sm">
                    <Camera size={16} className="mr-2" />
                    {annotationStats.snapshots} Snapshot{annotationStats.snapshots !== 1 ? "s" : ""} Available
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="bg-yellow-900 bg-opacity-30 border border-yellow-600 rounded p-3">
                <p className="text-yellow-400 font-medium">No Annotations Found</p>
                <p className="text-sm text-gray-400 mt-1">
                  This case doesn't have location data or annotations yet. You can create a new annotation session to add GPS data,
                  snapshots, and reports.
                </p>
              </div>

              <button
                onClick={createAnnotationSession}
                className="flex items-center px-4 py-2 bg-purple-600 hover:bg-purple-700 rounded text-white text-sm transition-colors"
              >
                <Camera size={16} className="mr-2" />
                Create Annotation Session
              </button>
            </div>
          )}
        </div>

        {/* Case Edit Form */}
        <div className="bg-gray-800 p-4 rounded-lg shadow">
          <h3 className="text-lg font-semibold mb-4">Case Information</h3>

          <form onSubmit={handleUpdate} className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">Case Number *</label>
                <input
                  type="text"
                  value={caseNumber}
                  onChange={(e) => setCaseNumber(e.target.value)}
                  className="w-full p-2 bg-gray-700 border border-gray-600 rounded text-white"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">Case Title *</label>
                <input
                  type="text"
                  value={caseTitle}
                  onChange={(e) => setCaseTitle(e.target.value)}
                  className="w-full p-2 bg-gray-700 border border-gray-600 rounded text-white"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">Date of Incident *</label>
                <input
                  type="date"
                  value={dateOfIncident}
                  onChange={(e) => setDateOfIncident(e.target.value)}
                  className="w-full p-2 bg-gray-700 border border-gray-600 rounded text-white"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">Region *</label>
                <select
                  value={region}
                  onChange={(e) => setRegion(e.target.value)}
                  className="w-full p-2 bg-gray-700 border border-gray-600 rounded text-white"
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
              <div className="md:col-span-2">
                <label className="block text-sm font-medium text-gray-300 mb-1">Between</label>
                <input
                  type="text"
                  value={between}
                  onChange={(e) => setBetween(e.target.value)}
                  className="w-full p-2 bg-gray-700 border border-gray-600 rounded text-white"
                />
              </div>
              <div className="md:col-span-2">
                <label className="block text-sm font-medium text-gray-300 mb-1">Urgency *</label>
                <select
                  value={urgency}
                  onChange={(e) => setUrgency(e.target.value)}
                  required
                  className="w-full p-2 bg-gray-700 border border-gray-600 rounded text-white"
                >
                  <option value="">Select urgency level</option>
                  <option value="Low">Low</option>
                  <option value="Medium">Medium</option>
                  <option value="High">High</option>
                  <option value="Critical">Critical</option>
                </select>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1">Status *</label>
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value)}
                required
                className="w-full p-2 bg-gray-700 border border-gray-600 rounded text-white"
              >
                <option value="not started">Not Started</option>
                <option value="in progress">In Progress</option>
                <option value="completed">Completed</option>
              </select>
            </div>

            <div className="flex justify-between">
              <Link to="/home" className="px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded text-white">
                Cancel
              </Link>
              <button type="submit" className="px-4 py-2 rounded text-white bg-blue-700 hover:bg-blue-600">
                Save Changes
              </button>
            </div>
          </form>
        </div>

        {/* Additional Actions */}
        <div className="bg-gray-800 p-4 rounded-lg shadow">
          <h3 className="text-lg font-semibold mb-3">Additional Actions</h3>
          <div className="flex gap-4 flex-wrap">
            <button
              type="button"
              className="px-4 py-2 bg-green-600 hover:bg-green-700 rounded text-white"
              onClick={() => {
                const simulationData = {
                  caseId: firebaseCase?.caseId || caseData?.doc_id || docIdFromLocation,
                  caseNumber,
                  caseTitle,
                };
                localStorage.setItem("trackxCaseData", JSON.stringify(simulationData));
                window.open("/simulation", "_blank");
              }}
            >
              View Simulation
            </button>

            {firebaseCase?.caseId && (
              <div className="flex items-center px-4 py-2 bg-blue-900 bg-opacity-50 rounded text-blue-300 text-sm">
                <div className="w-2 h-2 bg-blue-400 rounded-full mr-2"></div>
                Firebase Synchronized
              </div>
            )}

            {!firebaseCase && annotationsAvailable && (
              <div className="flex items-center px-4 py-2 bg-yellow-900 bg-opacity-50 rounded text-yellow-300 text-sm">
                <div className="w-2 h-2 bg-yellow-400 rounded-full mr-2"></div>
                Local Storage Only
              </div>
            )}
          </div>
        </div>

        {/* Case Data Summary */}
        {(firebaseCase || annotationsAvailable) && (
          <div className="bg-gray-800 p-4 rounded-lg shadow">
            <h3 className="text-lg font-semibold mb-3">Case Data Summary</h3>
            <div className="bg-gray-700 p-4 rounded grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
              <div>
                <p>
                  <span className="font-medium text-gray-300">Data Source:</span>{" "}
                  {firebaseCase ? "Firebase (Cloud)" : "Local Storage"}
                </p>
                <p>
                  <span className="font-medium text-gray-300">Locations:</span> {annotationStats.locations}
                </p>
                <p>
                  <span className="font-medium text-gray-300">Snapshots:</span> {annotationStats.snapshots}
                </p>
              </div>
              <div>
                <p>
                  <span className="font-medium text-gray-300">Reports Generated:</span>{" "}
                  {annotationStats.firebaseReports}
                </p>
                <p>
                  <span className="font-medium text-gray-300">Last Updated:</span>{" "}
                  {firebaseCase?.updatedAt ? new Date(firebaseCase.updatedAt).toLocaleDateString() : "Unknown"}
                </p>
              </div>
            </div>
          </div>
        )}
      </div>

      <NotificationModal
        isOpen={modalState.isOpen}
        title={modalState.title}
        description={modalState.description}
        variant={modalState.variant}
        onClose={closeModal}
        primaryAction={modalState.primaryAction}
        secondaryAction={modalState.secondaryAction}
      />
    </motion.div>
  );
}

export default EditCasePage;
import React, { useState, useEffect } from "react";
import { useLocation, useNavigate, Link } from "react-router-dom";
import { motion } from "framer-motion";
import adflogo from "../assets/image-removebg-preview.png";
import axios from "axios";
import { useAuth } from "../context/AuthContext";
import { signOut } from "firebase/auth";
import { auth } from "../firebase";
import { MapPin, FileText, Camera, Eye } from "lucide-react";
import { clearCaseSession } from "../utils/caseSession";

// Firebase services (teammate’s)
import {
  loadCaseWithAnnotations,
  getUserCases,
  updateCaseAnnotations,
  getCurrentUserId,
  loadSnapshotsFromFirebase,
  getCaseReports,
} from "../services/firebaseServices";

function EditCasePage() {
  const location = useLocation();
  const navigate = useNavigate();
  const { profile } = useAuth();

  // Possible sources
  const caseDataFromLocation = location.state?.caseData || null;
  const docIdFromLocation = location.state?.docId || null;      // backend id
  const caseIdFromLocation = location.state?.caseId || null;    // firebase id

  // Loading & base state
  const [loading, setLoading] = useState(true);
  const [caseData, setCaseData] = useState(caseDataFromLocation);

  // Editable fields
  const [caseNumber, setCaseNumber] = useState("");
  const [caseTitle, setCaseTitle] = useState("");
  const [dateOfIncident, setDateOfIncident] = useState("");
  const [region, setRegion] = useState("");
  const [between, setBetween] = useState("");
  const [status, setStatus] = useState("not started");
  const [urgency, setUrgency] = useState("");
  const [showMenu, setShowMenu] = useState(false);

  // Firebase integration state
  const [firebaseCase, setFirebaseCase] = useState(null);
  const [annotationsAvailable, setAnnotationsAvailable] = useState(false);
  const [loadingAnnotations, setLoadingAnnotations] = useState(false);
  const [annotationStats, setAnnotationStats] = useState({
    locations: 0,
    snapshots: 0,
    hasIntro: false,
    hasConclusion: false,
    hasLocationTitles: false,
    firebaseReports: 0,
    caseId: null,
  });

  const handleSignOut = async () => {
    try {
      await signOut(auth);
      navigate("/");
    } catch (error) {
      console.error("Sign-out failed:", error.message);
    }
  };

  // Fetch case (Firebase first, then backend, else use provided state)
  useEffect(() => {
    const fetchCase = async () => {
      setLoading(true);
      try {
        if (caseIdFromLocation) {
          // Prefer Firebase
          try {
            const fb = await loadCaseWithAnnotations(caseIdFromLocation);
            setCaseData(fb);
            setFirebaseCase(fb);
          } catch (e) {
            console.warn("Firebase load failed; trying backend:", e);
            await fetchFromBackend();
          }
        } else if (docIdFromLocation) {
          await fetchFromBackend();
        } else if (caseDataFromLocation) {
          setCaseData(caseDataFromLocation);
        } else {
          console.error("No case identifier provided");
          setLoading(false);
          return;
        }

        await checkForAnnotations(); // after we have caseData
      } catch (err) {
        console.error("Failed to fetch case:", err);
      } finally {
        setLoading(false);
      }
    };

    const fetchFromBackend = async () => {
      try {
        const res = await axios.get("http://localhost:8000/cases/search", { params: {} });
        const found = (res.data?.cases || []).find((c) => c.doc_id === docIdFromLocation);
        if (found) setCaseData(found);
        else console.warn("Case not found in backend");
      } catch (err) {
        console.error("Failed to fetch case from backend:", err);
        throw err;
      }
    };

    fetchCase();
  }, [caseDataFromLocation, docIdFromLocation, caseIdFromLocation]);

  // Normalize into form state
  useEffect(() => {
    if (!caseData) return;

    setCaseNumber(caseData.caseNumber || caseData.case_number || "");
    setCaseTitle(caseData.caseTitle || caseData.title || "");

    // Date: handle strings/Date/Firestore
    let dateValue = "";
    const src = caseData.dateOfIncident || caseData.date;
    if (src) {
      if (typeof src === "string") {
        dateValue = src.split("T")[0];
      } else if (src?.toISOString) {
        dateValue = src.toISOString().split("T")[0];
      } else if (src?.seconds) {
        const d = new Date(src.seconds * 1000);
        dateValue = d.toISOString().split("T")[0];
      }
    }
    setDateOfIncident(dateValue);

    setRegion(caseData.region || "");
    setBetween(caseData.between || "");
    setStatus(caseData.status || "not started");
    setUrgency(caseData.urgency || "");
  }, [caseData]);

  // Check annotations presence (Firebase + session snapshots + reports)
  const checkForAnnotations = async () => {
    if (!caseData) return;
    setLoadingAnnotations(true);

    try {
      const userId = getCurrentUserId();

      // If already a Firebase case with locations
      let existing = null;
      if (caseData.caseId && caseData.locations) {
        existing = caseData;
      } else {
        // Try to locate Firebase case by caseNumber
        try {
          const userCases = await getUserCases(userId);
          const found = userCases.find((c) => c.caseNumber === (caseData.caseNumber || caseData.case_number));
          if (found?.caseId) {
            const full = await loadCaseWithAnnotations(found.caseId);
            existing = full;
            setFirebaseCase(full);
          }
        } catch (e) {
          console.warn("Could not load user cases:", e);
        }
      }

      if (existing?.locations) {
        setAnnotationsAvailable(true);

        // Count snapshots (Firebase hints + sessionStorage)
        let snapshotCount = 0;
        try {
          if (existing.caseId) {
            await loadSnapshotsFromFirebase(existing.caseId);
            snapshotCount = (existing.locations || []).filter(
              (loc) => loc.snapshotUrl || loc.mapSnapshotUrl || loc.streetViewSnapshotUrl
            ).length;

            const ss = sessionStorage.getItem("locationSnapshots");
            if (ss) {
              try {
                const parsed = JSON.parse(ss);
                const localCount = parsed.filter((s) => s && (s.mapImage || s.streetViewImage || s.description)).length;
                snapshotCount = Math.max(snapshotCount, localCount);
              } catch (pe) {
                console.warn("Could not parse session snapshots:", pe);
              }
            }
          }
        } catch (se) {
          console.warn("Could not load snapshots:", se);
        }

        // Reports in Firebase
        let firebaseReportsCount = 0;
        try {
          if (existing.caseId) {
            const reports = await getCaseReports(existing.caseId);
            firebaseReportsCount = reports.length;
          }
        } catch (re) {
          console.warn("Could not load reports:", re);
        }

        // Stats
        const stats = {
          locations: existing.locations?.length || 0,
          snapshots: snapshotCount,
          hasIntro: !!(existing.reportIntro && existing.reportIntro.trim()),
          hasConclusion: !!(existing.reportConclusion && existing.reportConclusion.trim()),
          hasLocationTitles: !!(existing.locationTitles && existing.locationTitles.some((t) => t && t.trim())),
          firebaseReports: firebaseReportsCount,
          caseId: existing.caseId || null,
        };

        setAnnotationStats(stats);
      } else {
        setAnnotationsAvailable(false);
        setAnnotationStats({
          locations: 0,
          snapshots: 0,
          hasIntro: false,
          hasConclusion: false,
          hasLocationTitles: false,
          firebaseReports: 0,
          caseId: null,
        });
      }
    } catch (err) {
      console.error("Error checking annotations:", err);
      setAnnotationsAvailable(false);
    } finally {
      setLoadingAnnotations(false);
    }
  };

  // Save updates: backend (compat) + Firebase (if available)
  const handleUpdate = async (e) => {
    e.preventDefault();

    try {
      // A) Backend update (compat)
      if (docIdFromLocation || caseData?.doc_id) {
        try {
          await axios.put("http://localhost:8000/cases/update", {
            doc_id: caseData?.doc_id || docIdFromLocation,
            caseNumber,
            caseTitle,
            dateOfIncident,
            region,
            between,
            status,
            urgency,
          });
        } catch (backendError) {
          console.warn("Backend update failed:", backendError);
        }
      }

      // B) Firebase update (if we have an existing Firebase case)
      if (firebaseCase?.caseId) {
        try {
          const metadataUpdates = {
            caseNumber,
            caseTitle,
            dateOfIncident,
            region,
            between,
            status,
            urgency,
          };

          const filteredUpdates = Object.fromEntries(
            Object.entries(metadataUpdates).filter(([, value]) => value !== undefined)
          );

          await updateCaseAnnotations(firebaseCase.caseId, filteredUpdates);
        } catch (fbErr) {
          console.warn("Firebase update failed:", fbErr);
        }
      }

      alert("Case updated successfully!");
      navigate("/home");
    } catch (error) {
      console.error("Error updating case:", error);
      alert("An error occurred during update.");
    }
  };

  // Prepare a case payload for annotations/overview and navigate
  const loadIntoAnnotationSystem = async (targetPage = "annotations") => {
    try {
      let payload;
      if (firebaseCase) {
        payload = {
          caseId: firebaseCase.caseId,
          caseNumber: firebaseCase.caseNumber,
          caseTitle: firebaseCase.caseTitle,
          dateOfIncident: firebaseCase.dateOfIncident,
          region: firebaseCase.region,
          between: firebaseCase.between,
          locations: firebaseCase.locations || [],
          locationTitles: firebaseCase.locationTitles || [],
          reportIntro: firebaseCase.reportIntro || "",
          reportConclusion: firebaseCase.reportConclusion || "",
          selectedForReport: firebaseCase.selectedForReport || [],
          urgency: firebaseCase.urgency || "",
        };
      } else {
        // new case edit flow → hard reset so we don't pull an old case
        clearCaseSession();
        payload = {
          caseId: null,
          caseNumber,
          caseTitle,
          dateOfIncident,
          region,
          between,
          urgency,
          locations: [],
          locationTitles: [],
          reportIntro: "",
          reportConclusion: "",
          selectedForReport: [],
        };
      }

      localStorage.setItem("trackxCaseData", JSON.stringify(payload));
      if (firebaseCase?.caseId) localStorage.setItem("trackxCurrentCaseId", firebaseCase.caseId);
      else localStorage.removeItem("trackxCurrentCaseId");

      navigate(
          targetPage === "overview" ? "/overview" : "/annotations",
          { state: { caseId: firebaseCase?.caseId || null } } );
    } catch (err) {
      console.error("Error loading case into annotation system:", err);
      alert("Error loading case for annotations. Please try again.");
    }
  };

  // Create a fresh annotations session if none exist
  const createAnnotationSession = async () => {
    try {
      const payload = {
        caseNumber,
        caseTitle,
        dateOfIncident,
        region,
        between,
        urgency,
        locations: [],
        locationTitles: [],
        reportIntro: "",
        reportConclusion: "",
        selectedForReport: [],
      };
      localStorage.setItem("trackxCaseData", JSON.stringify(payload));
      localStorage.removeItem("trackxCurrentCaseId");
      navigate("/new-case");
    } catch (err) {
      console.error("Error creating annotation session:", err);
      alert("Error creating annotation session. Please try again.");
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-black text-white flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-500 mx-auto mb-4"></div>
          <p className="text-gray-300">Loading case...</p>
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
      {/* BG */}
      <div className="absolute inset-0 bg-gradient-to-br from-black via-gray-900 to-black -z-10" />

      {/* Navbar */}
      <div className="flex items-center justify-between px-6 py-4 bg-gradient-to-r from-black to-gray-900 shadow-md">
        <div className="flex items-center space-x-4">
          <div className="text-3xl cursor-pointer" onClick={() => setShowMenu(!showMenu)}>
            &#9776;
          </div>
          <Link to="/home">
            <img src={adflogo} alt="Logo" className="h-12 cursor-pointer hover:opacity-80 transition" />
          </Link>
        </div>
        <h1 className="text-xl font-bold text-white">Edit Case</h1>
        <div className="flex items-center space-x-4">
          <div>
            <p className="text-sm">{profile ? `${profile.firstName} ${profile.surname}` : "Loading..."}</p>
            <button onClick={handleSignOut} className="text-red-400 hover:text-red-600 text-xs">
              Sign Out
            </button>
          </div>
        </div>
      </div>

      {/* Hamburger Menu */}
      {showMenu && (
        <div className="absolute top-16 left-0 bg-black bg-opacity-90 backdrop-blur-md text-white w-64 p-6 z-30 space-y-4 border-r border-gray-700 shadow-lg">
          <Link to="/home" className="block hover:text-blue-400" onClick={() => setShowMenu(false)}>
            🏠 Home
          </Link>
          <Link to="/new-case" className="block hover:text-blue-400" onClick={() => setShowMenu(false)}>
            📝 Create New Case / Report
          </Link>
          <Link to="/manage-cases" className="block hover:text-blue-400" onClick={() => setShowMenu(false)}>
            📁 Manage Cases
          </Link>
          <Link to="/my-cases" className="block hover:text-blue-400" onClick={() => setShowMenu(false)}>
            📁 My Cases
          </Link>
          {profile?.role === "admin" && (
            <Link to="/admin-dashboard" className="block hover:text-blue-400" onClick={() => setShowMenu(false)}>
              🛠 Admin Dashboard
            </Link>
          )}
        </div>
      )}

      {/* Page Content */}
      <div className="max-w-4xl mx-auto px-6 py-8 space-y-8">
        {/* Annotations & Reports status */}
        <div className="bg-gray-800 p-4 rounded-lg shadow">
          <h3 className="text-lg font-semibold mb-3 flex items-center">
            <FileText className="mr-2" size={20} />
            Annotations & Reports
          </h3>

          {loadingAnnotations ? (
            <div className="flex items-center text-gray-400">
              <div className="animate-spin rounded-full h-4 w-4 border-t-2 border-b-2 border-blue-500 mr-2"></div>
              Checking for annotations and reports...
            </div>
          ) : annotationsAvailable ? (
            <div className="space-y-3">
              <div className="bg-green-900 bg-opacity-30 border border-green-600 rounded p-3">
                <p className="text-green-400 font-medium">Annotations Available</p>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mt-2 text-sm">
                  <div>
                    <span className="text-gray-400">Locations:</span>
                    <span className="ml-1 font-medium">{annotationStats.locations}</span>
                  </div>
                  <div>
                    <span className="text-gray-400">Snapshots:</span>
                    <span className="ml-1 font-medium text-green-400">{annotationStats.snapshots}</span>
                  </div>
                  <div>
                    <span className="text-gray-400">Reports:</span>
                    <span className="ml-1 font-medium text-blue-400">{annotationStats.firebaseReports}</span>
                  </div>
                  <div>
                    <span className="text-gray-400">Introduction:</span>
                    <span className={`ml-1 font-medium ${annotationStats.hasIntro ? "text-green-400" : "text-red-400"}`}>
                      {annotationStats.hasIntro ? "Yes" : "No"}
                    </span>
                  </div>
                  <div>
                    <span className="text-gray-400">Conclusion:</span>
                    <span className={`ml-1 font-medium ${annotationStats.hasConclusion ? "text-green-400" : "text-red-400"}`}>
                      {annotationStats.hasConclusion ? "Yes" : "No"}
                    </span>
                  </div>
                  <div>
                    <span className="text-gray-400">Titles:</span>
                    <span className={`ml-1 font-medium ${annotationStats.hasLocationTitles ? "text-green-400" : "text-yellow-400"}`}>
                      {annotationStats.hasLocationTitles ? "Set" : "Default"}
                    </span>
                  </div>
                </div>

                {annotationStats.caseId && (
                  <div className="mt-2 pt-2 border-t border-green-700">
                    <p className="text-xs text-green-300">
                      Firebase Case ID: {String(annotationStats.caseId).slice(-8)}... <span className="ml-2">✓ Cloud synchronized</span>
                    </p>
                  </div>
                )}
              </div>

              <div className="flex gap-3 flex-wrap">
                <button
                  onClick={() => loadIntoAnnotationSystem("annotations")}
                  className="flex items-center px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded text-white text-sm transition-colors"
                >
                  <MapPin size={16} className="mr-2" />
                  View/Edit Annotations
                </button>

                <button
                  onClick={() => loadIntoAnnotationSystem("overview")}
                  className="flex items-center px-4 py-2 bg-green-600 hover:bg-green-700 rounded text-white text-sm transition-colors"
                >
                  <Eye size={16} className="mr-2" />
                  View Reports & Overview
                </button>

                {annotationStats.snapshots > 0 && (
                  <div className="flex items-center px-3 py-2 bg-purple-900 bg-opacity-50 rounded text-purple-300 text-sm">
                    <Camera size={16} className="mr-2" />
                    {annotationStats.snapshots} Snapshot{annotationStats.snapshots !== 1 ? "s" : ""} Available
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="bg-yellow-900 bg-opacity-30 border border-yellow-600 rounded p-3">
                <p className="text-yellow-400 font-medium">No Annotations Found</p>
                <p className="text-sm text-gray-400 mt-1">
                  This case doesn't have location data or annotations yet. You can create a new annotation session to add GPS data,
                  snapshots, and reports.
                </p>
              </div>

              <button
                onClick={createAnnotationSession}
                className="flex items-center px-4 py-2 bg-purple-600 hover:bg-purple-700 rounded text-white text-sm transition-colors"
              >
                <Camera size={16} className="mr-2" />
                Create Annotation Session
              </button>
            </div>
          )}
        </div>

        {/* Case Edit Form */}
        <div className="bg-gray-800 p-4 rounded-lg shadow">
          <h3 className="text-lg font-semibold mb-4">Case Information</h3>

          <form onSubmit={handleUpdate} className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">Case Number *</label>
                <input
                  type="text"
                  value={caseNumber}
                  onChange={(e) => setCaseNumber(e.target.value)}
                  className="w-full p-2 bg-gray-700 border border-gray-600 rounded text-white"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">Case Title *</label>
                <input
                  type="text"
                  value={caseTitle}
                  onChange={(e) => setCaseTitle(e.target.value)}
                  className="w-full p-2 bg-gray-700 border border-gray-600 rounded text-white"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">Date of Incident *</label>
                <input
                  type="date"
                  value={dateOfIncident}
                  onChange={(e) => setDateOfIncident(e.target.value)}
                  className="w-full p-2 bg-gray-700 border border-gray-600 rounded text-white"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">Region *</label>
                <select
                  value={region}
                  onChange={(e) => setRegion(e.target.value)}
                  className="w-full p-2 bg-gray-700 border border-gray-600 rounded text-white"
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
              <div className="md:col-span-2">
                <label className="block text-sm font-medium text-gray-300 mb-1">Between</label>
                <input
                  type="text"
                  value={between}
                  onChange={(e) => setBetween(e.target.value)}
                  className="w-full p-2 bg-gray-700 border border-gray-600 rounded text-white"
                />
              </div>
              <div className="md:col-span-2">
                <label className="block text-sm font-medium text-gray-300 mb-1">Urgency *</label>
                <select
                  value={urgency}
                  onChange={(e) => setUrgency(e.target.value)}
                  required
                  className="w-full p-2 bg-gray-700 border border-gray-600 rounded text-white"
                >
                  <option value="">Select urgency level</option>
                  <option value="Low">Low</option>
                  <option value="Medium">Medium</option>
                  <option value="High">High</option>
                  <option value="Critical">Critical</option>
                </select>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1">Status *</label>
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value)}
                required
                className="w-full p-2 bg-gray-700 border border-gray-600 rounded text-white"
              >
                <option value="not started">Not Started</option>
                <option value="in progress">In Progress</option>
                <option value="completed">Completed</option>
              </select>
            </div>

            <div className="flex justify-between">
              <Link to="/home" className="px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded text-white">
                Cancel
              </Link>
              <button type="submit" className="px-4 py-2 rounded text-white bg-blue-700 hover:bg-blue-600">
                Save Changes
              </button>
            </div>
          </form>
        </div>

        {/* Additional Actions */}
        <div className="bg-gray-800 p-4 rounded-lg shadow">
          <h3 className="text-lg font-semibold mb-3">Additional Actions</h3>
          <div className="flex gap-4 flex-wrap">
            <button
              type="button"
              className="px-4 py-2 bg-green-600 hover:bg-green-700 rounded text-white"
              onClick={() => {
                const simulationData = {
                  caseId: firebaseCase?.caseId || caseData?.doc_id || docIdFromLocation,
                  caseNumber,
                  caseTitle,
                };
                localStorage.setItem("trackxCaseData", JSON.stringify(simulationData));
                window.open("/simulation", "_blank");
              }}
            >
              View Simulation
            </button>

            {firebaseCase?.caseId && (
              <div className="flex items-center px-4 py-2 bg-blue-900 bg-opacity-50 rounded text-blue-300 text-sm">
                <div className="w-2 h-2 bg-blue-400 rounded-full mr-2"></div>
                Firebase Synchronized
              </div>
            )}

            {!firebaseCase && annotationsAvailable && (
              <div className="flex items-center px-4 py-2 bg-yellow-900 bg-opacity-50 rounded text-yellow-300 text-sm">
                <div className="w-2 h-2 bg-yellow-400 rounded-full mr-2"></div>
                Local Storage Only
              </div>
            )}
          </div>
        </div>

        {/* Case Data Summary */}
        {(firebaseCase || annotationsAvailable) && (
          <div className="bg-gray-800 p-4 rounded-lg shadow">
            <h3 className="text-lg font-semibold mb-3">Case Data Summary</h3>
            <div className="bg-gray-700 p-4 rounded grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
              <div>
                <p>
                  <span className="font-medium text-gray-300">Data Source:</span>{" "}
                  {firebaseCase ? "Firebase (Cloud)" : "Local Storage"}
                </p>
                <p>
                  <span className="font-medium text-gray-300">Locations:</span> {annotationStats.locations}
                </p>
                <p>
                  <span className="font-medium text-gray-300">Snapshots:</span> {annotationStats.snapshots}
                </p>
              </div>
              <div>
                <p>
                  <span className="font-medium text-gray-300">Reports Generated:</span>{" "}
                  {annotationStats.firebaseReports}
                </p>
                <p>
                  <span className="font-medium text-gray-300">Last Updated:</span>{" "}
                  {firebaseCase?.updatedAt ? new Date(firebaseCase.updatedAt).toLocaleDateString() : "Unknown"}
                </p>
              </div>
            </div>
          </div>
        )}
      </div>
    </motion.div>
  );
}

export default EditCasePage;



