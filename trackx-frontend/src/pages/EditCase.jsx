import React, { useState, useEffect } from "react";
import { useLocation, useNavigate, Link } from "react-router-dom";
import { motion } from "framer-motion";
import adflogo from "../assets/image-removebg-preview.png";
import axios from "axios";
import { useAuth } from "../context/AuthContext";
import { signOut } from "firebase/auth";
import { auth } from "../firebase";
import {
  MapPin,
  FileText,
  Camera,
  Eye,
  Home,
  FilePlus2,
  FolderOpen,
  Briefcase,
  LayoutDashboard,
  Trash2,
  Plus,
  Search,
  Link2,
} from "lucide-react";
import { clearCaseSession } from "../utils/caseSession";
import NotificationModal from "../components/NotificationModal";
import useNotificationModal from "../hooks/useNotificationModal";
import { getFriendlyErrorMessage } from "../utils/errorMessages";
import EvidenceLocker from "../components/EvidenceLocker";
import RegionSelectorModal from "../components/RegionSelectorModal";
import { consumeTaskHook } from "../utils/taskHooks";


// Firebase services (with Jon's updater)
import {
  loadCaseWithAnnotations,
  getUserCases,
  updateCaseAnnotations,
  getCurrentUserId,
  loadSnapshotsFromFirebase,
  getCaseReports,
  loadEvidenceByCase,
  batchSaveEvidence,
  loadAllEvidence,
  searchEvidence,
  linkEvidenceToCase,
} from "../services/firebaseServices";

function EditCasePage() {
  const location = useLocation();
  const navigate = useNavigate();
  const { profile } = useAuth();
  // Evidence Locker
  const [evidenceItems, setEvidenceItems] = useState([]);
  const [loadingEvidence, setLoadingEvidence] = useState(false);
  const [showEvidenceSearch, setShowEvidenceSearch] = useState(false);
  const [evidenceSearchTerm, setEvidenceSearchTerm] = useState("");
  const [evidenceSearchResults, setEvidenceSearchResults] = useState([]);
  const [isSearchingEvidence, setIsSearchingEvidence] = useState(false);


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

  const caseDataFromLocation = location.state?.caseData || null;
  const docIdFromLocation = location.state?.docId || null; // backend id
  const caseIdFromLocation = location.state?.caseId || null; // firebase id

  const [loading, setLoading] = useState(true);
  const [caseData, setCaseData] = useState(caseDataFromLocation);

  const [caseNumber, setCaseNumber] = useState("");
  const [caseTitle, setCaseTitle] = useState("");
  const [dateOfIncident, setDateOfIncident] = useState("");
  const [region, setRegion] = useState("");
  const [provinceCode, setProvinceCode] = useState("");
  const [provinceName, setProvinceName] = useState("");
  const [districtCode, setDistrictCode] = useState("");
  const [districtName, setDistrictName] = useState("");
  const [showRegionModal, setShowRegionModal] = useState(false);
  const [between, setBetween] = useState("");
  const [status, setStatus] = useState("not started");
  const [urgency, setUrgency] = useState("");
const [showMenu, setShowMenu] = useState(false);
const [taskHighlight, setTaskHighlight] = useState(null);

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

  const formattedDateTime = new Date().toLocaleString();
  const statusLabel = status ? status.replace(/\b\w/g, (char) => char.toUpperCase()) : "Not set";
const urgencyLabel = urgency || "Not set";
const regionLabel = region ? region.replace(/-/g, " ") : "Not specified";
const heroTitle = caseTitle?.trim() || "Untitled Case";
const isHighlighted = (targetId) => taskHighlight?.highlightId === targetId;

const scrollToHighlight = (targetId, attempt = 0) => {
  if (!targetId) return;
  const node = document.getElementById(targetId);
  if (node) {
    node.scrollIntoView({ behavior: "smooth", block: "center" });
    return;
  }
  if (attempt < 10) {
    window.setTimeout(() => scrollToHighlight(targetId, attempt + 1), 120);
  }
};

  const handleSignOut = async () => {
    try {
      await signOut(auth);
      navigate("/");
    } catch (error) {
      console.error("Sign-out failed:", error.message);
    }
  };

  // ============ Evidence helpers ============

  const loadEvidence = async (caseNum) => {
    if (!caseNum) {
      return;
    }

    setLoadingEvidence(true);
    try {
      const items = await loadEvidenceByCase(caseNum);
      setEvidenceItems(items);
    } catch (error) {
      console.error("Error loading evidence:", error);
      showError("Evidence Load Error", error, "Failed to load evidence items from database");
    } finally {
      setLoadingEvidence(false);
    }
  };

  const saveEvidence = async () => {
    if (!caseNumber || evidenceItems.length === 0) {
      return;
    }

    try {
      await batchSaveEvidence(
        evidenceItems,
        getCurrentUserId() || auth.currentUser?.uid,
        caseNumber
      );
    } catch (error) {
      console.error("Failed to save evidence:", error);
      throw error;
    }
  };

const handleEvidenceSearch = async () => {
  if (!evidenceSearchTerm.trim()) {
    await handleLoadAllEvidence();
    return;
  }

    setIsSearchingEvidence(true);
    try {
      const results = await searchEvidence(evidenceSearchTerm.trim());
      setEvidenceSearchResults(results);
    } catch (error) {
      console.error("Error searching evidence:", error);
      showError("Search Error", error, "Failed to search evidence");
    } finally {
      setIsSearchingEvidence(false);
    }
  };

  const handleLoadAllEvidence = async () => {
    setIsSearchingEvidence(true);
    try {
      const items = await loadAllEvidence(50);
      setEvidenceSearchResults(items);
    } catch (error) {
      console.error("Error loading evidence list:", error);
      showError("Load Error", error, "Failed to load evidence items");
    } finally {
      setIsSearchingEvidence(false);
    }
  };

  const handleLinkEvidence = async (evidence) => {
    if (!caseNumber) {
      showError("Cannot Link Evidence", null, "Case number is required before linking evidence.");
      return;
    }

    const alreadyLinked = evidenceItems.some((item) => item.id === evidence.id);
    if (alreadyLinked) {
      showError("Already Linked", null, "This evidence is already linked to the case.");
      return;
    }

    try {
      await linkEvidenceToCase(evidence.id, caseNumber);
      setEvidenceItems((prev) => [...prev, evidence]);
      showSuccess("Evidence Linked", `Evidence ${evidence.id} has been linked to this case.`);
  } catch (error) {
    console.error("Error linking evidence:", error);
    showError("Link Error", error, "Failed to link evidence to case");
  }
};

  useEffect(() => {
    const hook = consumeTaskHook();
    if (!hook || hook.stage !== "metadata") {
      return;
    }
    setTaskHighlight(hook);
    requestAnimationFrame(() => scrollToHighlight(hook.highlightId));
    const timeout = setTimeout(() => setTaskHighlight(null), 6000);
    sessionStorage.removeItem("trackxTaskForceCaseId");
    sessionStorage.removeItem("trackxIgnoreLocalCaseData");
    return () => clearTimeout(timeout);
  }, []);


  // Fetch case (Firebase first, then backend, else use provided state)
  useEffect(() => {
    const fetchCase = async () => {
      setLoading(true);
      try {
        if (caseIdFromLocation) {
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

        await checkForAnnotations();
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
        if (found){
          setCaseData(found);
        } 
        else console.warn("Case not found in backend");
      } catch (err) {
        console.error("Failed to fetch case from backend:", err);
        throw err;
      }
    };

    fetchCase();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [caseDataFromLocation, docIdFromLocation, caseIdFromLocation]);

  useEffect(() => {
    if (!caseData) return;

    setCaseNumber(caseData.caseNumber || caseData.case_number || "");
    setCaseTitle(caseData.caseTitle || caseData.title || "");

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
    setProvinceName(caseData.provinceName || caseData.region || "");
    setProvinceCode(caseData.provinceCode || "");
    setDistrictName(caseData.districtName || "");
    setDistrictCode(caseData.districtCode || "");
    setBetween(caseData.between || "");
    setStatus(caseData.status || "not started");
    setUrgency(caseData.urgency || "");
  }, [caseData]);

  useEffect(() => {
    if (caseNumber) {
      loadEvidence(caseNumber);
    }
  }, [caseNumber]);

  const checkForAnnotations = async () => {
    if (!caseData) return;
    setLoadingAnnotations(true);

    try {
      const userId = getCurrentUserId();

      let existing = null;
      if (caseData.caseId && caseData.locations) {
        existing = caseData;
      } else {
        try {
          const userCases = await getUserCases(userId);
          const found = userCases.find(
            (c) => c.caseNumber === (caseData.caseNumber || caseData.case_number)
          );
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

        let snapshotCount = 0;
        try {
          if (existing.caseId) {
            await loadSnapshotsFromFirebase(existing.caseId);
            snapshotCount = (existing.locations || []).filter(
              (loc) =>
                loc.snapshotUrl || loc.mapSnapshotUrl || loc.streetViewSnapshotUrl
            ).length;

            const ss = sessionStorage.getItem("locationSnapshots");
            if (ss) {
              try {
                const parsed = JSON.parse(ss);
                const localCount = parsed.filter(
                  (s) => s && (s.mapImage || s.streetViewImage || s.description)
                ).length;
                snapshotCount = Math.max(snapshotCount, localCount);
              } catch (pe) {
                console.warn("Could not parse session snapshots:", pe);
              }
            }
          }
        } catch (se) {
          console.warn("Could not load snapshots:", se);
        }

        let firebaseReportsCount = 0;
        try {
          if (existing.caseId) {
            const reports = await getCaseReports(existing.caseId);
            firebaseReportsCount = reports.length;
          }
        } catch (re) {
          console.warn("Could not load reports:", re);
        }

        const stats = {
          locations: existing.locations?.length || 0,
          snapshots: snapshotCount,
          hasIntro: !!(existing.reportIntro && existing.reportIntro.trim()),
          hasConclusion: !!(existing.reportConclusion && existing.reportConclusion.trim()),
          hasLocationTitles: !!(
            existing.locationTitles && existing.locationTitles.some((t) => t && t.trim())
          ),
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

const handleUpdate = async (e) => {
  e.preventDefault();

  try {
    const normalized = {
      caseNumber: String(caseNumber || "").trim(),
      caseTitle: String(caseTitle || "").trim(),
      dateOfIncident: dateOfIncident || "",
      region: provinceName || region || "",
      provinceCode: provinceCode || null,
      provinceName: provinceName || (region || null),
      districtCode: districtCode || null,
      districtName: districtName || null,
      between: String(between || "").trim(),
      status: status || "not started",
      urgency: urgency || "",
    };

    if (docIdFromLocation || caseData?.doc_id) {
      try {
        await axios.put("http://localhost:8000/cases/update", {
          doc_id: caseData?.doc_id || docIdFromLocation,
          ...normalized,
        });
      } catch (backendError) {
        console.warn("Backend update failed:", backendError);
      }
    }

    if (firebaseCase?.caseId) {
      try {
        const filteredUpdates = Object.fromEntries(
          Object.entries(normalized).filter(([, value]) => value !== undefined)
        );
        await updateCaseAnnotations(firebaseCase.caseId, filteredUpdates);
      } catch (fbErr) {
        console.warn("Firebase update failed:", fbErr);
        showError(
          "Cloud update failed",
          fbErr,
          "The case was updated locally, but we couldn't push the changes to the cloud."
        );
        return;
      }
    }

    try {
      await saveEvidence();
    } catch (evidenceError) {
      showError(
        "Evidence Save Warning",
        evidenceError,
        "Case updated, but we could not save evidence items to the database."
      );
    }

    showSuccess("Case updated", "Your changes have been saved successfully.", {
      label: "Return to dashboard",
      onClick: () => navigate("/home"),
    });
  } catch (error) {
    console.error("Error updating case:", error);
    showError(
      "Update failed",
      error,
      "An error occurred while updating the case. Please try again."
    );
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
    if (firebaseCase?.caseId)
      localStorage.setItem("trackxCurrentCaseId", firebaseCase.caseId);
    else localStorage.removeItem("trackxCurrentCaseId");

    navigate(targetPage === "overview" ? "/overview" : "/annotations", {
      state: { caseId: firebaseCase?.caseId || null },
    });
  } catch (err) {
    console.error("Error loading case into annotation system:", err);
    showError(
      "Unable to load case",
      err,
      "We couldn't load this case for annotations. Please try again."
    );
  }
};


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
      <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-gradient-to-br from-black via-gray-900 to-black text-white">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(59,130,246,0.18),transparent_55%)]" />
        <div className="relative rounded-3xl border border-white/10 bg-white/[0.04] px-10 py-12 text-center shadow-[0_35px_90px_rgba(15,23,42,0.65)] backdrop-blur-xl">
          <div className="mx-auto mb-4 h-12 w-12 animate-spin rounded-full border-b-2 border-t-2 border-blue-500" />
          <p className="text-sm text-gray-300">Loading case...</p>
        </div>
      </div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 18 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.8 }}
      className="relative min-h-screen overflow-hidden bg-gradient-to-br from-black via-gray-900 to-black font-sans text-white"
    >
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(59,130,246,0.16),transparent_55%)]" />
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_bottom,rgba(99,102,241,0.12),transparent_60%)]" />

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
          EDIT CASE
        </div>

        <div className="flex items-center gap-4 text-sm text-gray-200">
          <Link
            to="/manage-cases"
            className="hidden md:inline-flex items-center rounded-full border border-white/10 bg-white/[0.02] px-4 py-2 text-xs font-semibold text-gray-200 shadow-inner shadow-white/5 transition hover:border-white/25 hover:text-white"
          >
            Manage Cases
          </Link>
          <div className="hidden text-right lg:block">
            <span className="block text-xs text-gray-400">Status • {statusLabel}</span>
            <span className="block text-xs text-gray-500">Urgency • {urgencyLabel}</span>
          </div>
          <div className="flex flex-col items-end">
            <span className="text-base font-semibold text-white">
              {profile
                ? `${profile.firstName || ""} ${profile.surname || ""}`.trim() || "Investigator"
                : "Loading..."}
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
            <FileText className="h-4 w-4" />
            Edit Case
          </div>
          <button
            type="button"
            onClick={() => loadIntoAnnotationSystem("annotations")}
            className="flex w-full items-center gap-3 rounded-2xl px-3 py-2 text-sm font-medium text-gray-200 transition hover:bg-white/10 hover:text-white"
          >
            <MapPin className="h-4 w-4" />
            Annotations
          </button>
          <button
            type="button"
            onClick={() => loadIntoAnnotationSystem("overview")}
            className="flex w-full items-center gap-3 rounded-2xl px-3 py-2 text-sm font-medium text-gray-200 transition hover:bg-white/10 hover:text-white"
          >
            <Eye className="h-4 w-4" />
            Overview
          </button>
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

      <div className="mx-6 mt-6 flex justify-center gap-8 rounded-full border border-white/10 bg-white/[0.02] px-6 py-2 text-xs font-semibold text-gray-300 shadow-[0_15px_40px_rgba(15,23,42,0.45)] backdrop-blur-xl">
        <Link to="/manage-cases" className="text-gray-400 transition hover:text-white">
          Manage Cases
        </Link>
        <span className="inline-flex items-center rounded-full bg-gradient-to-r from-blue-900/80 to-purple-900/80 px-5 py-1.5 text-white shadow-[0_12px_30px_rgba(15,23,42,0.45)]">
          Edit Case
        </span>
        <button
          type="button"
          onClick={() => loadIntoAnnotationSystem("annotations")}
          className="text-gray-400 transition hover:text-white"
        >
          Annotations
        </button>
        <button
          type="button"
          onClick={() => loadIntoAnnotationSystem("overview")}
          className="text-gray-400 transition hover:text-white"
        >
          Overview
        </button>
      </div>

      <main className="pb-24">
        <section className="relative mx-auto mt-10 w-full max-w-6xl px-6">
          <div className="relative overflow-hidden rounded-3xl border border-white/10 bg-white/[0.02] px-8 py-8 shadow-[0_35px_90px_rgba(15,23,42,0.55)] backdrop-blur-2xl">
            <div className="pointer-events-none absolute -top-28 right-0 h-56 w-56 rounded-full bg-blue-900/25 blur-3xl" />
            <div className="pointer-events-none absolute -bottom-24 left-0 h-48 w-48 rounded-full bg-purple-900/20 blur-3xl" />
            <div className="relative z-10 flex flex-col gap-10 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.35em] text-gray-400">
                  Case Control
                </p>
                <h1 className="mt-3 text-3xl font-semibold text-white">{heroTitle}</h1>
                <p className="mt-3 max-w-xl text-sm text-gray-400">
                  Refine metadata, sync annotations, and keep cloud state aligned with your
                  investigative workflow.
                </p>
                <div className="mt-6 flex flex-wrap gap-3">
                  <button
                    type="button"
                    onClick={() => loadIntoAnnotationSystem("annotations")}
                    className="inline-flex items-center justify-center rounded-full bg-gradient-to-r from-blue-600 to-indigo-600 px-6 py-2.5 text-sm font-semibold text-white shadow-lg shadow-blue-500/25 transition hover:from-blue-500 hover:to-indigo-500"
                  >
                    <MapPin className="mr-2 h-4 w-4" />
                    Manage Annotations
                  </button>
                  <button
                    type="button"
                    onClick={() => loadIntoAnnotationSystem("overview")}
                    className="inline-flex items-center justify-center rounded-full border border-white/15 bg-white/[0.05] px-6 py-2.5 text-sm font-semibold text-gray-200 transition hover:border-white/30 hover:text-white"
                  >
                    <Eye className="mr-2 h-4 w-4" />
                    Open Overview
                  </button>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4 text-sm text-gray-300">
                <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-4">
                  <p className="text-xs uppercase tracking-wide text-gray-500">Case Number</p>
                  <p className="mt-2 text-2xl font-semibold text-white">{caseNumber || "-"}</p>
                  <p className="text-xs text-gray-500">Primary identifier for this matter.</p>
                </div>
                <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-4">
                  <p className="text-xs uppercase tracking-wide text-gray-500">Status</p>
                  <p className="mt-2 text-2xl font-semibold text-white">{statusLabel}</p>
                  <p className="text-xs text-gray-500">Track investigative progress.</p>
                </div>
                <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-4">
                  <p className="text-xs uppercase tracking-wide text-gray-500">Urgency</p>
                  <p className="mt-2 text-2xl font-semibold text-white">{urgencyLabel}</p>
                  <p className="text-xs text-gray-500">Escalation guideline.</p>
                </div>
                <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-4">
                  <p className="text-xs uppercase tracking-wide text-gray-500">Region</p>
                  <p className="mt-2 text-base font-medium capitalize text-white">{regionLabel}</p>
                  <p className="text-xs text-gray-500">
                    {annotationsAvailable
                      ? `${annotationStats.locations} annotated locations`
                      : "No annotations yet"}
                  </p>
                </div>
              </div>
            </div>
          </div>
        </section>

        <div className="mx-auto mt-10 w-full max-w-6xl px-6 space-y-8">
          <div className="rounded-3xl border border-white/10 bg-white/[0.018] p-6 shadow-[0_25px_70px_rgba(15,23,42,0.45)] backdrop-blur-2xl">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2 className="text-lg font-semibold text-white">Annotations & Reports</h2>
                <p className="text-xs text-gray-400">
                  Review linked artefacts and jump into the relevant workspace.
                </p>
              </div>
              {annotationStats.caseId && (
                <span className="inline-flex items-center gap-2 rounded-full bg-emerald-500/15 px-3 py-1 text-xs font-semibold text-emerald-200">
                  <span className="h-2 w-2 rounded-full bg-emerald-300" />
                  Cloud synced
                </span>
              )}
            </div>
            <div className="mt-5">
              {loadingAnnotations ? (
                <div className="flex items-center gap-3 text-sm text-gray-300">
                  <span className="h-4 w-4 animate-spin rounded-full border-b-2 border-t-2 border-blue-500" />
                  Checking for annotations and reports...
                </div>
              ) : annotationsAvailable ? (
                <div className="space-y-4">
                  <div className="grid gap-4 rounded-2xl border border-emerald-500/25 bg-emerald-500/10 p-4 text-sm text-emerald-100 sm:grid-cols-2 lg:grid-cols-3">
                    <div>
                      <p className="text-xs uppercase tracking-wide text-emerald-300">Locations</p>
                      <p className="mt-1 text-lg font-semibold text-white">
                        {annotationStats.locations}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs uppercase tracking-wide text-emerald-300">Snapshots</p>
                      <p className="mt-1 text-lg font-semibold text-white">
                        {annotationStats.snapshots}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs uppercase tracking-wide text-emerald-300">Reports</p>
                      <p className="mt-1 text-lg font-semibold text-white">
                        {annotationStats.firebaseReports}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs uppercase tracking-wide text-emerald-300">Introduction</p>
                      <p
                        className={`mt-1 text-sm font-semibold ${
                          annotationStats.hasIntro ? "text-emerald-200" : "text-rose-200"
                        }`}
                      >
                        {annotationStats.hasIntro ? "Available" : "Missing"}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs uppercase tracking-wide text-emerald-300">Conclusion</p>
                      <p
                        className={`mt-1 text-sm font-semibold ${
                          annotationStats.hasConclusion ? "text-emerald-200" : "text-rose-200"
                        }`}
                      >
                        {annotationStats.hasConclusion ? "Available" : "Missing"}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs uppercase tracking-wide text-emerald-300">
                        Location Titles
                      </p>
                      <p
                        className={`mt-1 text-sm font-semibold ${
                          annotationStats.hasLocationTitles ? "text-emerald-200" : "text-amber-200"
                        }`}
                      >
                        {annotationStats.hasLocationTitles ? "Customised" : "Default"}
                      </p>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-3">
                    <button
                      type="button"
                      onClick={() => loadIntoAnnotationSystem("annotations")}
                      className="inline-flex items-center justify-center rounded-full bg-gradient-to-r from-blue-600 to-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow-lg shadow-blue-500/20 transition hover:from-blue-500 hover:to-indigo-500"
                    >
                      <MapPin className="mr-2 h-4 w-4" />
                      View / Edit Annotations
                    </button>
                    <button
                      type="button"
                      onClick={() => loadIntoAnnotationSystem("overview")}
                      className="inline-flex items-center justify-center rounded-full bg-gradient-to-r from-emerald-500 to-teal-500 px-4 py-2 text-sm font-semibold text-white shadow-lg shadow-emerald-500/20 transition hover:from-emerald-400 hover:to-teal-400"
                    >
                      <Eye className="mr-2 h-4 w-4" />
                      View Reports & Overview
                    </button>
                    {annotationStats.snapshots > 0 && (
                      <span className="inline-flex items-center gap-2 rounded-full border border-purple-400/40 bg-purple-500/10 px-3 py-1.5 text-xs font-semibold text-purple-200">
                        <Camera className="h-4 w-4" />
                        {annotationStats.snapshots} snapshot
                        {annotationStats.snapshots !== 1 ? "s" : ""}
                      </span>
                    )}
                  </div>

                  {annotationStats.caseId && (
                    <p className="text-xs text-emerald-200/80">
                      Firebase Case ID • {String(annotationStats.caseId).slice(-8)}
                    </p>
                  )}
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="rounded-2xl border border-amber-400/35 bg-amber-500/10 p-4 text-sm text-amber-100">
                    <p className="text-amber-200 font-semibold">No annotations found</p>
                    <p className="mt-2 text-xs text-amber-100/80">
                      Create a new annotation session to capture GPS stops, snapshots, and narrative
                      context for this case.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={createAnnotationSession}
                    className="inline-flex items-center justify-center rounded-full bg-gradient-to-r from-purple-600 to-fuchsia-600 px-4 py-2 text-sm font-semibold text-white shadow-lg shadow-purple-500/20 transition hover:from-purple-500 hover:to-fuchsia-500"
                  >
                    <Camera className="mr-2 h-4 w-4" />
                    Create Annotation Session
                  </button>
                </div>
              )}
            </div>
          </div>

          <div
            id="task-target-metadata-case"
            className={`rounded-3xl border border-white/10 bg-white/[0.018] p-6 shadow-[0_25px_70px_rgba(15,23,42,0.45)] backdrop-blur-2xl transition ${
              isHighlighted("task-target-metadata-case")
                ? "task-hook-highlight border-blue-500/40 bg-blue-500/10"
                : ""
            }`}
          >
            <h2 className="text-lg font-semibold text-white">Case Information</h2>
            <p className="text-xs text-gray-400">
              Update core metadata and sync it across cloud and local storage.
            </p>
            <form onSubmit={handleUpdate} className="mt-6 space-y-6">
              <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
                <div>
                  <label className="mb-2 block text-xs font-semibold uppercase tracking-wide text-gray-400">
                    Case Number *
                  </label>
                  <input
                    type="text"
                    value={caseNumber}
                    onChange={(e) => setCaseNumber(e.target.value)}
                    className="w-full rounded-2xl border border-white/12 bg-white/[0.05] px-4 py-3 text-sm text-white placeholder-gray-500 focus:border-blue-600/60 focus:outline-none focus:ring-2 focus:ring-blue-600/20"
                  />
                </div>
                <div>
                  <label className="mb-2 block text-xs font-semibold uppercase tracking-wide text-gray-400">
                    Case Title *
                  </label>
                  <input
                    type="text"
                    value={caseTitle}
                    onChange={(e) => setCaseTitle(e.target.value)}
                    className="w-full rounded-2xl border border-white/12 bg-white/[0.05] px-4 py-3 text-sm text-white placeholder-gray-500 focus:border-blue-600/60 focus:outline-none focus:ring-2 focus:ring-blue-600/20"
                  />
                </div>
                <div>
                  <label className="mb-2 block text-xs font-semibold uppercase tracking-wide text-gray-400">
                    Date of Incident *
                  </label>
                  <input
                    type="date"
                    value={dateOfIncident}
                    onChange={(e) => setDateOfIncident(e.target.value)}
                    className="w-full rounded-2xl border border-white/12 bg-white/[0.05] px-4 py-3 text-sm text-white focus:border-indigo-600/60 focus:outline-none focus:ring-2 focus:ring-indigo-600/20"
                  />
                </div>
                <div>
                  <label className="mb-2 block text-xs font-semibold uppercase tracking-wide text-gray-400">
                    Region *
                  </label>
                  <button
                    type="button"
                    onClick={() => setShowRegionModal(true)}
                    className="w-full rounded-2xl border border-white/12 bg-white/[0.05] px-4 py-3 text-left text-sm text-white focus:border-indigo-600/60 focus:outline-none focus:ring-2 focus:ring-indigo-600/20"
                  >
                    {provinceName ? (
                      <span className="capitalize">
                        {provinceName}
                        {districtName ? ` - ${districtName}` : ""}
                      </span>
                    ) : (
                      <span className="text-gray-400">Select province and district</span>
                    )}
                  </button>
                </div>
                <div>
                  <label className="mb-2 block text-xs font-semibold uppercase tracking-wide text-gray-400">
                    Between
                  </label>
                  <input
                    type="text"
                    value={between}
                    onChange={(e) => setBetween(e.target.value)}
                    className="w-full rounded-2xl border border-white/12 bg-white/[0.05] px-4 py-3 text-sm text-white placeholder-gray-500 focus:border-purple-600/60 focus:outline-none focus:ring-2 focus:ring-purple-600/20"
                  />
                </div>
                <div>
                  <label className="mb-2 block text-xs font-semibold uppercase tracking-wide text-gray-400">
                    Urgency *
                  </label>
                  <select
                    value={urgency}
                    onChange={(e) => setUrgency(e.target.value)}
                    required
                    className="w-full rounded-2xl border border-white/12 bg-white/[0.05] px-4 py-3 text-sm text-white focus:border-purple-600/60 focus:outline-none focus:ring-2 focus:ring-purple-600/20"
                  >
                    <option value="">Select urgency</option>
                    <option value="Low">Low</option>
                    <option value="Medium">Medium</option>
                    <option value="High">High</option>
                    <option value="Critical">Critical</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="mb-2 block text-xs font-semibold uppercase tracking-wide text-gray-400">
                  Status *
                </label>
                <select
                  value={status}
                  onChange={(e) => setStatus(e.target.value)}
                  required
                  className="w-full rounded-2xl border border-white/12 bg-white/[0.05] px-4 py-3 text-sm text-white focus:border-emerald-600/60 focus:outline-none focus:ring-2 focus:ring-emerald-600/20"
                >
                  <option value="not started">Not Started</option>
                  <option value="in progress">In Progress</option>
                  <option value="completed">Completed</option>
                </select>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-3">
                <Link
                  to="/home"
                  className="inline-flex items-center justify-center rounded-full border border-white/15 bg-white/[0.04] px-5 py-2 text-sm font-semibold text-gray-200 transition hover:border-white/30 hover:text-white"
                >
                  Cancel
                </Link>
                <button
                  type="submit"
                  className="inline-flex items-center justify-center rounded-full bg-gradient-to-r from-blue-600 to-indigo-600 px-5 py-2 text-sm font-semibold text-white shadow-lg shadow-blue-500/20 transition hover:from-blue-500 hover:to-indigo-500"
                >
                  Save Changes
                </button>
              </div>
            </form>
          </div>

          <RegionSelectorModal
            isOpen={showRegionModal}
            onClose={() => setShowRegionModal(false)}
            onSelect={({ provinceCode: pCode, provinceName: pName, districtCode: dCode, districtName: dName }) => {
              setProvinceCode(pCode || "");
              setProvinceName(pName || "");
              setDistrictCode(dCode || "");
              setDistrictName(dName || "");
              setRegion(pName || "");
            }}
          />

          {/* Evidence Search & Link Section */}
          <section className="rounded-3xl border border-white/10 bg-white/[0.018] p-6 shadow-[0_25px_70px_rgba(15,23,42,0.45)] backdrop-blur-2xl">
            <div className="flex flex-col gap-1 sm:flex-row sm:items-baseline sm:justify-between">
              <div>
                <h3 className="text-sm font-semibold text-white flex items-center gap-2">
                  <Search className="h-5 w-5 text-purple-400" />
                  Search & Link Existing Evidence
                </h3>
                <p className="text-xs text-gray-400 mt-1">
                  Reuse evidence collected in other cases to avoid duplication.
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  const next = !showEvidenceSearch;
                  setShowEvidenceSearch(next);
                  if (next) {
                    handleLoadAllEvidence();
                  } else {
                    setEvidenceSearchResults([]);
                    setEvidenceSearchTerm("");
                  }
                }}
                className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-gradient-to-r from-purple-900 to-indigo-900 px-4 py-2 text-sm font-semibold text-white shadow-[0_15px_35px_rgba(15,23,42,0.55)] transition hover:-translate-y-0.5"
              >
                <Search className="h-4 w-4" />
                {showEvidenceSearch ? "Hide Search" : "Browse Evidence"}
              </button>
            </div>

            {showEvidenceSearch && (
              <div className="mt-4 space-y-4 rounded-2xl border border-white/10 bg-white/[0.02] p-4">
                <div className="flex flex-col sm:flex-row sm:items-center gap-3">
                  <div className="relative flex-1">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                    <input
                      type="text"
                      value={evidenceSearchTerm}
                      onChange={(e) => setEvidenceSearchTerm(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          handleEvidenceSearch();
                        }
                      }}
                      placeholder="Search by description, case number, or evidence ID..."
                      className="w-full rounded-xl border border-white/10 bg-white/[0.02] pl-10 pr-3 py-2 text-sm text-white placeholder-gray-500 focus:border-purple-700/50 focus:outline-none focus:ring-2 focus:ring-purple-700/30"
                    />
                  </div>
                  <button
                    type="button"
                    onClick={handleEvidenceSearch}
                    disabled={isSearchingEvidence}
                    className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-gradient-to-r from-purple-900 via-indigo-900 to-purple-900 px-4 py-2 text-sm font-medium text-white shadow-[0_15px_35px_rgba(15,23,42,0.55)] transition hover:-translate-y-0.5 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <Search className="w-4 h-4" />
                    {isSearchingEvidence ? "Searching..." : "Search"}
                  </button>
                </div>

                <div className="max-h-96 space-y-3 overflow-y-auto pr-2">
                  {isSearchingEvidence ? (
                    <div className="flex flex-col items-center justify-center py-8 text-center">
                      <div className="mb-3 h-8 w-8 animate-spin rounded-full border-t-2 border-b-2 border-purple-500"></div>
                      <p className="text-sm text-gray-400">Searching evidence database...</p>
                    </div>
                  ) : evidenceSearchResults.length > 0 ? (
                    <>
                      <div className="mb-3 flex items-center justify-between rounded-xl border border-purple-500/20 bg-purple-500/10 px-3 py-2">
                        <span className="text-xs font-medium text-purple-200">
                          Found {evidenceSearchResults.length} evidence item{evidenceSearchResults.length !== 1 ? "s" : ""}
                        </span>
                        <button
                          type="button"
                          onClick={() => {
                            setEvidenceSearchResults([]);
                            setEvidenceSearchTerm("");
                          }}
                          className="text-xs text-purple-300 hover:text-purple-100 transition"
                        >
                          Clear Results
                        </button>
                      </div>

                      {evidenceSearchResults.map((ev) => {
                        const isAlreadyLinked = evidenceItems.some((item) => item.id === ev.id);
                        return (
                          <div
                            key={ev.id}
                            className="group flex items-start justify-between gap-4 rounded-2xl border border-white/10 bg-white/[0.035] p-4 text-sm shadow-inner shadow-white/5 transition hover:border-purple-500/30 hover:bg-white/[0.05]"
                          >
                            <div className="flex-1 min-w-0">
                              <div className="mb-2 flex flex-wrap items-center gap-2">
                                <span className="inline-flex items-center rounded border border-purple-400/30 bg-purple-900/30 px-2 py-1 font-mono text-[11px] leading-none text-purple-200">
                                  {ev.id}
                                </span>
                                {isAlreadyLinked && (
                                  <span className="inline-flex items-center gap-1 rounded border border-green-400/30 bg-green-900/30 px-2 py-1 text-[10px] leading-none text-green-200">
                                    <svg className="h-3 w-3" fill="currentColor" viewBox="0 0 20 20">
                                      <path
                                        fillRule="evenodd"
                                        d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                                        clipRule="evenodd"
                                      />
                                    </svg>
                                    LINKED
                                  </span>
                                )}
                              </div>

                              <p className="mb-2 text-sm leading-relaxed text-white">
                                {ev.description || <span className="italic text-gray-500">(No description)</span>}
                              </p>

                              <div className="flex flex-wrap gap-3 text-xs text-gray-400">
                                <span className="flex items-center gap-1">
                                  <svg className="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                                  </svg>
                                  Case: <span className="font-medium text-gray-300">{ev.caseNumber}</span>
                                </span>
                                <span>•</span>
                                <span className="flex items-center gap-1">
                                  <svg className="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                                  </svg>
                                  {new Date(ev.dateAdded).toLocaleDateString()}
                                </span>
                              </div>

                              {ev.relatedCases && ev.relatedCases.length > 1 && (
                                <div className="mt-2 rounded-lg border border-blue-500/20 bg-blue-500/10 px-2 py-1">
                                  <p className="text-xs text-blue-200">
                                    <span className="font-medium">Also used in:</span>{" "}
                                    {ev.relatedCases.filter((c) => c !== ev.caseNumber).join(", ")}
                                  </p>
                                </div>
                              )}
                            </div>

                            <button
                              type="button"
                              onClick={() => handleLinkEvidence(ev)}
                              disabled={isAlreadyLinked}
                              className={`inline-flex shrink-0 items-center gap-2 rounded-full px-4 py-2 text-sm font-semibold transition ${
                                isAlreadyLinked
                                  ? "cursor-not-allowed border border-white/10 bg-white/5 text-gray-500"
                                  : "bg-gradient-to-r from-purple-600 to-indigo-600 text-white shadow-lg shadow-purple-500/20 hover:from-purple-500 hover:to-indigo-500"
                              }`}
                              title={isAlreadyLinked ? "Already linked to this case" : "Link this evidence to your case"}
                            >
                              <Link2 className="h-4 w-4" />
                              {isAlreadyLinked ? "Linked" : "Link"}
                            </button>
                          </div>
                        );
                      })}
                    </>
                  ) : evidenceSearchTerm ? (
                    <div className="flex flex-col items-center justify-center py-8 text-center">
                      <div className="mb-3 rounded-full bg-white/5 p-3">
                        <Search className="h-6 w-6 text-gray-400" />
                      </div>
                      <p className="mb-1 text-sm font-medium text-white">No results found</p>
                      <p className="text-xs text-gray-400">
                        No evidence found matching "{evidenceSearchTerm}". Try different keywords.
                      </p>
                    </div>
                  ) : (
                    <div className="flex flex-col items-center justify-center py-8 text-center">
                      <div className="mb-3 rounded-full bg-white/5 p-3">
                        <FileText className="h-6 w-6 text-gray-400" />
                      </div>
                      <p className="mb-1 text-sm font-medium text-white">Recent Evidence</p>
                      <p className="text-xs text-gray-400">
                        Showing recent evidence items. Use search above to find specific items.
                      </p>
                    </div>
                  )}
                </div>
              </div>
            )}
          </section>

          {/* Evidence Locker */}
          {loadingEvidence && (
            <div className="mb-3 text-xs text-gray-400">
              Loading evidence items for this case...
            </div>
          )}
          <div
            id="task-target-metadata-evidence"
            className={`rounded-3xl border border-transparent transition ${
              isHighlighted("task-target-metadata-evidence")
                ? "task-hook-highlight border-blue-500/40 bg-blue-500/10"
                : ""
            }`}
          >
            <EvidenceLocker
              evidenceItems={evidenceItems}
              onChange={setEvidenceItems}
              caseNumber={caseNumber}
              title="Evidence Locker"
              subtitle="Manage evidence items for this case"
            />
          </div>

          <div className="rounded-3xl border border-white/10 bg-white/[0.018] p-6 shadow-[0_25px_70px_rgba(15,23,42,0.45)] backdrop-blur-2xl">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold text-white">Additional Actions</h2>
                <p className="text-xs text-gray-400">
                  Launch supportive tooling and check synchronization state.
                </p>
              </div>
              {firebaseCase?.caseId ? (
                <span className="inline-flex items-center gap-2 rounded-full bg-emerald-500/15 px-3 py-1 text-xs font-semibold text-emerald-200">
                  <span className="h-2 w-2 rounded-full bg-emerald-300" />
                  Firebase synchronized
                </span>
              ) : (
                annotationsAvailable && (
                  <span className="inline-flex items-center gap-2 rounded-full bg-amber-500/15 px-3 py-1 text-xs font-semibold text-amber-200">
                    <span className="h-2 w-2 rounded-full bg-amber-300" />
                    Local storage only
                  </span>
                )
              )}
            </div>
            <div className="mt-4 flex flex-wrap items-center gap-3">
              <button
                type="button"
                className="inline-flex items-center justify-center rounded-full bg-gradient-to-r from-emerald-500 to-teal-500 px-5 py-2 text-sm font-semibold text-white shadow-lg shadow-emerald-500/20 transition hover:from-emerald-400 hover:to-teal-400"
                onClick={() => {
                  const simulationData = {
                    caseId:
                      firebaseCase?.caseId || caseData?.doc_id || docIdFromLocation,
                    caseNumber,
                    caseTitle,
                  };
                  localStorage.setItem(
                    "trackxCaseData",
                    JSON.stringify(simulationData)
                  );
                  window.open("/simulation", "_blank");
                }}
              >
                View Simulation
              </button>
            </div>
          </div>

          {(firebaseCase || annotationsAvailable) && (
            <div className="rounded-3xl border border-white/10 bg-white/[0.018] p-6 shadow-[0_25px_70px_rgba(15,23,42,0.45)] backdrop-blur-2xl">
              <h2 className="text-lg font-semibold text-white">Case Data Summary</h2>
              <p className="text-xs text-gray-400">
                Quick reference for collaborators before diving into annotations.
              </p>
              <dl className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-4">
                  <dt className="text-xs uppercase tracking-wide text-gray-500">Data source</dt>
                  <dd className="mt-2 text-sm font-semibold text-white">
                    {firebaseCase ? "Firebase (Cloud)" : "Local Storage"}
                  </dd>
                  <dd className="mt-1 text-xs text-gray-500">
                    Synchronised with the latest report run.
                  </dd>
                </div>
                <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-4">
                  <dt className="text-xs uppercase tracking-wide text-gray-500">
                    Locations tracked
                  </dt>
                  <dd className="mt-2 text-lg font-semibold text-white">
                    {annotationStats.locations}
                  </dd>
                  <dd className="mt-1 text-xs text-gray-500">
                    {annotationStats.snapshots} snapshot
                    {annotationStats.snapshots === 1 ? "" : "s"} available.
                  </dd>
                </div>
                <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-4">
                  <dt className="text-xs uppercase tracking-wide text-gray-500">
                    Reports generated
                  </dt>
                  <dd className="mt-2 text-lg font-semibold text-white">
                    {annotationStats.firebaseReports}
                  </dd>
                  <dd className="mt-1 text-xs text-gray-500">
                    Exported artefacts stored in Firebase.
                  </dd>
                </div>
                <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-4">
                  <dt className="text-xs uppercase tracking-wide text-gray-500">Last updated</dt>
                  <dd className="mt-2 text-lg font-semibold text-white">
                    {firebaseCase?.updatedAt
                      ? new Date(firebaseCase.updatedAt).toLocaleDateString()
                      : "Unknown"}
                  </dd>
                  <dd className="mt-1 text-xs text-gray-500">
                    Timestamp from the latest cloud sync.
                  </dd>
                </div>
              </dl>
            </div>
          )}
        </div>
      </main>

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
