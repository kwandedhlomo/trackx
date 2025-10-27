import React, { useState, useEffect, useRef } from "react";
import { Link, useNavigate, useLocation } from "react-router-dom";
import adflogo from "../assets/image-removebg-preview.png";
import { motion } from "framer-motion";
import { AlertTriangle, MapPin, FileText, Camera, Home, FilePlus2, FolderOpen, Briefcase, LayoutDashboard, Trash2, Plus, Search, Link2 } from "lucide-react";
import jsPDF from "jspdf";
import { useAuth } from "../context/AuthContext";
import { signOut } from "firebase/auth";
import { auth } from "../firebase";
import FirebaseStatus from "../components/FirebaseStatus";
import NotificationModal from "../components/NotificationModal";
import useNotificationModal from "../hooks/useNotificationModal";
import { getFriendlyErrorMessage } from "../utils/errorMessages";
import TechnicalTermsSelector from "../components/TechnicalTermsSelector";
import { formatTechnicalTerm, normalizeTechnicalTermList } from "../utils/technicalTerms";
import EvidenceLocker from "../components/EvidenceLocker";
import { consumeTaskHook } from "../utils/taskHooks";
import axiosInstance from "../api/axios";

// ---- DOCX + save-as ----
import { Document, Packer, Paragraph, TextRun, HeadingLevel, ImageRun } from "docx";
import { saveAs } from "file-saver";


// ---- Firebase services ----
import {
  saveCaseWithAnnotations,
  loadCaseWithAnnotations,
  updateCaseAnnotations,
  createReportDocument,
  getCaseReports,
  loadSnapshotsFromFirebase,
  getCurrentUserId,
  loadEvidenceByCase,
  batchSaveEvidence,
  loadAllEvidence,
  searchEvidence,
  linkEvidenceToCase,
} from "../services/firebaseServices";

// Optional (not used directly for embedding but left for completeness)
const GOOGLE_MAPS_API_KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY;

// ---------- NEW: robust image normalization helpers ----------
function getFormatFromDataURL(dataURL) {
  if (!dataURL?.startsWith("data:image/")) return undefined;
  if (dataURL.startsWith("data:image/jpeg")) return "JPEG";
  if (dataURL.startsWith("data:image/png")) return "PNG";
  return undefined;
}

function blobToDataURL(blob) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result);
    r.onerror = reject;
    r.readAsDataURL(blob);
  });
}

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const i = new Image();
    i.crossOrigin = "anonymous";
    i.onload = () => resolve(i);
    i.onerror = reject;
    i.src = src;
  });
}

function canvasToDataURL(img, type = "image/png") {
  const canvas = document.createElement("canvas");
  canvas.width = img.naturalWidth || img.width;
  canvas.height = img.naturalHeight || img.height;
  const ctx = canvas.getContext("2d");
  ctx.drawImage(img, 0, 0);
  return canvas.toDataURL(type, 0.92);
}

// Force-rasterize ANY src to a friendly PNG dataURL for jsPDF.
// Also downscale very large images to avoid jsPDF choking on them.
async function forcePngForPdf(src, maxPx = 1400) {
  const norm = await normalizeToPngDataURL(src);
  if (!norm) return null;

  const img = await loadImage(norm);
  const w = img.naturalWidth || img.width;
  const h = img.naturalHeight || img.height;
  if (!w || !h) return norm; // fallback

  const scale = Math.min(1, maxPx / Math.max(w, h));
  const outW = Math.max(1, Math.round(w * scale));
  const outH = Math.max(1, Math.round(h * scale));

  const canvas = document.createElement("canvas");
  canvas.width = outW;
  canvas.height = outH;
  const ctx = canvas.getContext("2d");
  ctx.drawImage(img, 0, 0, outW, outH);
  return canvas.toDataURL("image/png", 0.92); // guaranteed PNG
}


// Ensure we always return a PNG/JPEG data URL suitable for PDF/DOCX
async function normalizeToPngDataURL(src) {
  if (!src) return null;
  if (src.startsWith("data:image/png") || src.startsWith("data:image/jpeg")) return src;

  if (src.startsWith("data:image/webp")) {
    try {
      const img = await loadImage(src);
      return canvasToDataURL(img, "image/png");
    } catch {
      return null;
    }
  }

  if (src.startsWith("http")) {
    try {
      const resp = await fetch(src, { mode: "cors" });
      const blob = await resp.blob();
      let dataUrl = await blobToDataURL(blob);
      if (dataUrl.startsWith("data:image/webp")) {
        const img = await loadImage(dataUrl);
        dataUrl = canvasToDataURL(img, "image/png");
      }
      return dataUrl;
    } catch {
      return null;
    }
  }

  return null;
}

// Convert data URL → Uint8Array (for docx ImageRun)
function dataURLToUint8Array(dataURL) {
  try {
    const base64 = dataURL.split(",")[1];
    const bin = atob(base64);
    const len = bin.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) bytes[i] = bin.charCodeAt(i);
    return bytes;
  } catch {
    return null;
  }
}

// Accepts various shapes and returns the unified shape used by Overview/PDF/DOCX
function normalizeSnapshotShape(s, idxFallback = 0, title = "", description = "") {
  if (!s) return null;
  const index = s.index ?? s.idx ?? idxFallback;

  const mapImage =
    s.mapImage ||
    s.mapSnapshotUrl ||
    s.mapUrl ||
    s.map ||
    null;

  const streetViewImage =
    s.streetViewImage ||
    s.streetViewSnapshotUrl ||
    s.streetViewUrl ||
    s.streetUrl ||
    null;

  return {
    index,
    mapImage,
    streetViewImage,
    title: s.title ?? title ?? "",
    description: s.description ?? description ?? "",
  };
}

function normalizeSnapshotArray(arr) {
  if (!Array.isArray(arr)) return [];
  return arr.map((s, i) => normalizeSnapshotShape(s, i)).filter(Boolean);
}

// --------- Snapshot storage keys + util ----------
const SNAPSHOT_KEY = "trackxSnapshots";
const LEGACY_SNAPSHOT_KEY = "locationSnapshots";
function readJSON(storage, key) {
  try {
    const raw = storage.getItem(key);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}



// ---------- Component ----------
function OverviewPage() {
  const reportRef = useRef(null);
  const { profile } = useAuth();
  const navigate = useNavigate();
  const [showMenu, setShowMenu] = useState(false);
  const { modalState, openModal, closeModal } = useNotificationModal();

  const location = useLocation();
  const caseIdFromState = location.state?.caseId || null;

  // Case & locations
  const [caseDetails, setCaseDetails] = useState({});
  const [locations, setLocations] = useState([]);
  const [selectedLocations, setSelectedLocations] = useState([]);
  const [reportIntro, setReportIntro] = useState("");
  const [reportConclusion, setReportConclusion] = useState("");
  const [locationTitles, setLocationTitles] = useState([]);

  // Toggles
  const [generateReport, setGenerateReport] = useState(true);
  const [generateDocx, setGenerateDocx] = useState(true);
  const [generateSimulation, setGenerateSimulation] = useState(false);
  const [taskHighlight, setTaskHighlight] = useState(null);
  const highlightClass = (targetId) =>
    taskHighlight?.highlightId === targetId
      ? "task-hook-highlight border-blue-500/40 bg-blue-500/10"
      : "";

  const scrollToHighlight = (targetId, attempt = 0) => {
    if (!targetId) return;
    const element = document.getElementById(targetId);
    if (element) {
      element.scrollIntoView({ behavior: "smooth", block: "center" });
      return;
    }
    if (attempt < 10) {
      setTimeout(() => scrollToHighlight(targetId, attempt + 1), 120);
    }
  };

  // UI
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [isGenerating, setIsGenerating] = useState(false);

  // Snapshots
  const [snapshots, setSnapshots] = useState([]);
  const [snapshotsAvailable, setSnapshotsAvailable] = useState(false);

  // Reports (local + Firebase)
  const [generatedReports, setGeneratedReports] = useState([]);
  const [firebaseReports, setFirebaseReports] = useState([]);

  // Cloud state
  const [currentCaseId, setCurrentCaseId] = useState(null);
  const [isSaving, setIsSaving] = useState(false);
  const [lastSaved, setLastSaved] = useState(null);
  const [saveError, setSaveError] = useState(null);

  const totalLocations = locations.length;
  const selectedCount = selectedLocations.length;
  const snapshotsCapturedCount = snapshots.filter((s) => s && (s.mapImage || s.streetViewImage)).length;
const formattedDateTime = new Date().toLocaleString();
const savingStatus = isSaving
  ? "Saving…"
  : saveError
  ? saveError
  : lastSaved
  ? `Saved ${lastSaved}`
  : "";

  useEffect(() => {
    const hook = consumeTaskHook();
    if (!hook || hook.stage !== "overview") {
      return;
    }
    setTaskHighlight(hook);
    requestAnimationFrame(() => scrollToHighlight(hook.highlightId));
    const timeout = setTimeout(() => setTaskHighlight(null), 6000);
    sessionStorage.removeItem("trackxTaskForceCaseId");
    sessionStorage.removeItem("trackxIgnoreLocalCaseData");
    return () => clearTimeout(timeout);
  }, []);

  const showError = (title, error, fallback) =>
    openModal({
      variant: "error",
      title,
      description: getFriendlyErrorMessage(error, fallback),
    });

  const showInfo = (title, description) =>
    openModal({
      variant: "info",
      title,
      description,
    });

  const showSuccess = (title, description) =>
    openModal({
      variant: "success",
      title,
      description,
    });

  // Evidence & Technical Terms
  const [evidenceItems, setEvidenceItems] = useState([]);
  const [technicalTerms, setTechnicalTerms] = useState([]);
  const [showEvidenceSearch, setShowEvidenceSearch] = useState(false);
  const [evidenceSearchTerm, setEvidenceSearchTerm] = useState("");
  const [evidenceSearchResults, setEvidenceSearchResults] = useState([]);
  const [isSearchingEvidence, setIsSearchingEvidence] = useState(false);

  //Intro & Conclusions states
  const [intro, setIntro] = useState("");
  const [conclusion, setConclusion] = useState("");

  // --- AI Suggestion states ---
const [showSuggestionModal, setShowSuggestionModal] = useState(false);
const [suggestedText, setSuggestedText] = useState("");
const [loadingSuggestion, setLoadingSuggestion] = useState(false);
const [suggestTarget, setSuggestTarget] = useState(null);

  // --- helpers ---
  // --- Evidence Locker (structure + utils) ---
  // Generate a stable-ish ID for new items
// Normalize evidence to object shape expected by EvidenceLocker & exports
const generateEvidenceId = () => `EV-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
const normalizeEvidenceItems = (raw, caseNumber = caseDetails.caseNumber || "Pending") => {
  if (!Array.isArray(raw)) return [];
  return raw.map((ev) => {
    if (ev && typeof ev === "object") {
      return {
        id: ev.id || generateEvidenceId(),
        description: ev.description ?? "",
        dateAdded: ev.dateAdded || new Date().toISOString(),
        caseNumber: ev.caseNumber || caseNumber,
      };
    }
    return {
      id: generateEvidenceId(),
      description: String(ev || ""),
      dateAdded: new Date().toISOString(),
      caseNumber,
    };
  });
};


  // Evidence Locker actions
  const handleEvidenceSearch = async () => {
    const term = evidenceSearchTerm.trim();
    if (!term) {
      await handleLoadAllEvidence();
      return;
    }

    setIsSearchingEvidence(true);
    try {
      const results = await searchEvidence(term);
      setEvidenceSearchResults(results);
    } catch (error) {
      console.error("Evidence search failed:", error);
      showError("Search Error", error, "We couldn't search the evidence database. Please try again.");
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
      console.error("Failed to load evidence list:", error);
      showError("Load Error", error, "Could not load evidence items. Please try again.");
    } finally {
      setIsSearchingEvidence(false);
    }
  };

  const linkExistingEvidence = async (evidence) => {
    if (!caseDetails.caseNumber) {
      showError("Cannot Link Evidence", null, "Case number is required before linking evidence.");
      return;
    }

    if (evidenceItems.some((item) => item.id === evidence.id)) {
      showInfo("Already Linked", "This evidence item is already linked to the current case.");
      return;
    }

    try {
      await linkEvidenceToCase(evidence.id, caseDetails.caseNumber);
      const linked = {
        ...evidence,
        caseNumber: caseDetails.caseNumber,
      };
      const next = [...evidenceItems, linked];
      setEvidenceItems(next);
      saveToLocalStorage({ evidenceItems: next });
      setEvidenceSearchResults((prev) => prev.filter((item) => item.id !== evidence.id));

      showSuccess("Evidence Linked", `Evidence ${evidence.id} has been added to this case.`);
    } catch (error) {
      console.error("Failed to link evidence:", error);
      showError("Link Error", error, "We couldn't link the evidence item. Please try again.");
    }
  };


  const formatDateForDisplay = (dateInput) => {
    if (!dateInput) return "Date not available";
    try {
      let d =
        typeof dateInput === "string"
          ? new Date(dateInput.includes("T") ? dateInput : `${dateInput}T00:00:00`)
          : dateInput instanceof Date
          ? dateInput
          : dateInput?.seconds
          ? new Date(dateInput.seconds * 1000)
          : null;
      return d && !isNaN(d.getTime()) ? d.toISOString().split("T")[0] : String(dateInput);
    } catch {
      return String(dateInput);
    }
  };
  const getCurrentUserId = () => profile?.uid || auth.currentUser?.uid || "default_user";
  const formatTimestamp = (timestamp) => {
    if (!timestamp) return "Not available";
    const d = new Date(timestamp);
    return isNaN(d.getTime()) ? String(timestamp) : d.toLocaleString();
  };
  const formatCoordinate = (coord) => (coord === undefined || coord === null ? "N/A" : typeof coord === "number" ? coord.toFixed(6) : coord);
  const getLocationAddress = (location) =>
    !location ? "Unknown Location" : location.address || `Location at ${formatCoordinate(location.lat)}, ${formatCoordinate(location.lng)}`;

  const handleSignOut = async () => {
    try {
      await signOut(auth);
      navigate("/");
    } catch (e) {
      console.error("Sign-out failed:", e.message);
    }
  };

  // ---- Hydrate snapshots from session → local → Firebase (and normalize) ----
  const hydrateSnapshots = async () => {
    // 1) Try sessionStorage (canonical then legacy)
    let raw =
      readJSON(sessionStorage, SNAPSHOT_KEY) ||
      readJSON(sessionStorage, LEGACY_SNAPSHOT_KEY);

    // 2) Fallback localStorage
    if (!raw) {
      raw =
        readJSON(localStorage, SNAPSHOT_KEY) ||
        readJSON(localStorage, LEGACY_SNAPSHOT_KEY);
    }

    // 3) Fallback Firebase
    if (!raw || !Array.isArray(raw) || raw.length === 0) {
      try {
        const idForSnaps = localStorage.getItem("trackxCurrentCaseId");
        if (idForSnaps) {
          const fb = await loadSnapshotsFromFirebase(idForSnaps);
          if (Array.isArray(fb) && fb.length > 0) {
            raw = fb.map((s, i) =>
              normalizeSnapshotShape(
                {
                  index: s.index ?? i,
                  mapImage: s.mapImage || s.mapSnapshotUrl || s.mapUrl || null,
                  streetViewImage: s.streetViewImage || s.streetViewSnapshotUrl || s.streetViewUrl || null,
                  title: s.title || "",
                  description: s.description || "",
                },
                i
              )
            );
            // Cache to session (both keys for backward compatibility)
            sessionStorage.setItem(SNAPSHOT_KEY, JSON.stringify(raw));
            sessionStorage.setItem(LEGACY_SNAPSHOT_KEY, JSON.stringify(raw));
          }
        }
      } catch (e) {
        console.warn("Firebase snapshot hydrate failed:", e);
      }
    }

    if (!raw) raw = [];

    const normalized = normalizeSnapshotArray(raw);
    setSnapshots(normalized);
    const hasAnyImage = normalized.some((s) => s && (s.mapImage || s.streetViewImage));
    setSnapshotsAvailable(hasAnyImage);

    console.log("[Overview] Hydrated snapshots:", {
      count: normalized.length,
      withImages: normalized.filter(s => s && (s.mapImage || s.streetViewImage)).length,
      sample: normalized.slice(0, 2),
    });
  };

// --- load data (Firebase first, fallback to local) ---
useEffect(() => {
  const load = async () => {
    setIsLoading(true);
    setSaveError(null);
    try {
      // Prefer caseId passed via route state, then what's in localStorage
      let caseId = caseIdFromState || localStorage.getItem("trackxCurrentCaseId") || null;
      if (caseIdFromState) {
        // persist so other parts (hydrateSnapshots) can read it
        localStorage.setItem("trackxCurrentCaseId", caseIdFromState);
      }

      if (caseId) {
        try {
          const fb = await loadCaseWithAnnotations(caseId);

          // Basic case fields
          const prettyRegion = (fb) => {
            const p = fb.provinceName || fb.region || "";
            const d = fb.districtName || "";
            return d ? `${p} - ${d}` : p;
          };
          setCaseDetails({
            caseNumber: fb.caseNumber,
            caseTitle: fb.caseTitle,
            dateOfIncident: formatDateForDisplay(fb.dateOfIncident),
            region: prettyRegion(fb),
            between: fb.between || "Not specified",
          });
          setLocations(fb.locations || []);
          setLocationTitles(fb.locationTitles || Array((fb.locations || []).length).fill(""));
          setReportIntro(fb.reportIntro || "");
          setTechnicalTerms(normalizeTechnicalTermList(fb.technicalTerms || []));
          setReportConclusion(fb.reportConclusion || "");
          setSelectedLocations(fb.selectedForReport || []);
          setCurrentCaseId(caseId);

          // Build snapshot array directly from the Firebase-loaded locations (URL fields)
          try {
            const fbLocs = fb.locations || [];
            const fbSnaps = fbLocs
              .map((loc, i) => ({
                index: i,
                mapImage: loc.mapSnapshotUrl || null,
                streetViewImage: loc.streetViewSnapshotUrl || null,
                title: loc.title || "",
                description: loc.description || "",
              }))
              .filter(s => s.mapImage || s.streetViewImage || s.description);

            if (fbSnaps.length > 0) {
              setSnapshots(fbSnaps);
              setSnapshotsAvailable(true);
              // Seed both keys for backward compatibility
              sessionStorage.setItem("trackxSnapshots", JSON.stringify(fbSnaps));
              sessionStorage.setItem("locationSnapshots", JSON.stringify(fbSnaps));
              // (optional) also persist to localStorage for rebuilds
              localStorage.setItem("trackxSnapshots", JSON.stringify(fbSnaps));
              localStorage.setItem("locationSnapshots", JSON.stringify(fbSnaps));
            }
          } catch {
            /* non-fatal */
          }

          // Fetch report metadata
          try {
            const reports = await getCaseReports(caseId);
            setFirebaseReports(reports || []);
          } catch (re) {
            console.warn("Could not load reports from Firebase:", re);
            setFirebaseReports([]);
          }
        } catch (e) {
          console.warn("Firebase load failed; falling back to local:", e);
          setSaveError("Could not connect to cloud database - using local storage");
          await loadFromLocalStorage();
        }
      } else {
        await loadFromLocalStorage();
      }

      // Always try to hydrate snapshots last (will no-op if we already seeded above)
      await hydrateSnapshots();
    } catch (e) {
      console.error("Error loading case data:", e);
      setError("Error loading case data: " + e.message);
    } finally {
      setIsLoading(false);
    }
  };
  load();
  // eslint-disable-next-line react-hooks/exhaustive-deps
}, []);

useEffect(() => {
  const fetchEvidence = async () => {
    if (!caseDetails.caseNumber) {
      return;
    }
    try {
      const items = await loadEvidenceByCase(caseDetails.caseNumber);
      if (items.length > 0) {
        setEvidenceItems(items);
      }
    } catch (error) {
      console.error("Failed to load evidence from Firebase:", error);
    }
  };

  fetchEvidence();
}, [caseDetails.caseNumber]);


  const loadFromLocalStorage = async () => {
    const s = localStorage.getItem("trackxCaseData");
    if (!s) {
      setError("No case data found. Please create a new case first.");
      return;
    }
    const caseData = JSON.parse(s);
    if (!caseData.locations || caseData.locations.length === 0) {
      setError("No location data found in the case.");
      return;
    }
    const prettyRegion = (c) => {
      const p = c.provinceName || c.region || "";
      const d = c.districtName || "";
      return d ? `${p} - ${d}` : p;
    };
    setCaseDetails({
      caseNumber: caseData.caseNumber,
      caseTitle: caseData.caseTitle,
      dateOfIncident: formatDateForDisplay(caseData.dateOfIncident),
      region: prettyRegion(caseData),
      between: caseData.between || "Not specified",
    });
    setLocations(caseData.locations);
    setSelectedLocations(caseData.selectedForReport || []);
    setReportIntro(caseData.reportIntro || "");
    // Evidence is loaded separately from the shared evidence collection
    setTechnicalTerms(normalizeTechnicalTermList(caseData.technicalTerms || []));
    setReportConclusion(caseData.reportConclusion || "");
    setLocationTitles(caseData.locationTitles || Array(caseData.locations.length).fill(""));
    setGeneratedReports(caseData.generatedReports || []);

    if (!localStorage.getItem("trackxCurrentCaseId")) {
      try {
        const userId = getCurrentUserId();
        const newId = await saveCaseWithAnnotations(caseData, userId);
        localStorage.setItem("trackxCurrentCaseId", newId);
        setCurrentCaseId(newId);
        setSaveError(null);
      } catch (e) {
        console.warn("Could not save to Firebase; staying local:", e);
        setSaveError("Unable to connect to cloud database");
      }
    }
  };

  // --- persistence ---
  const saveToLocalStorage = (extra = {}) => {
    try {
      const s = localStorage.getItem("trackxCaseData");
      if (!s) return;
      const caseData = JSON.parse(s);
      const extraCopy = { ...extra };
      let termsForSave;
      if (Object.prototype.hasOwnProperty.call(extraCopy, "technicalTerms")) {
        termsForSave = normalizeTechnicalTermList(extraCopy.technicalTerms);
        delete extraCopy.technicalTerms;
      } else {
        termsForSave = normalizeTechnicalTermList(technicalTerms);
      }
      const updated = {
        ...caseData,
        reportIntro,
        reportConclusion,
        selectedForReport: selectedLocations,
        locationTitles,
        generatedReports,
        evidenceItems,
        technicalTerms,
        ...extra,
      };      
      localStorage.setItem("trackxCaseData", JSON.stringify(updated));
    } catch (e) {
      console.error("Error saving to localStorage:", e);
    }
  };
  
const saveData = async (additionalData = {}) => {
  saveToLocalStorage(additionalData);
  if (!currentCaseId) {
    setSaveError("No cloud connection - using local storage only");
    return;
  }
  setIsSaving(true);
  setSaveError(null);
  try {
    const extraCopy = { ...additionalData };
    let termsForUpdate;
    if (Object.prototype.hasOwnProperty.call(extraCopy, "technicalTerms")) {
      termsForUpdate = normalizeTechnicalTermList(extraCopy.technicalTerms);
      delete extraCopy.technicalTerms;
    } else {
      termsForUpdate = normalizeTechnicalTermList(technicalTerms);
    }

    const updateData = {
      locationTitles,
      reportIntro: reportIntro || "",
      reportConclusion: reportConclusion || "",
      selectedForReport: selectedLocations,
      ...extraCopy,
      technicalTerms: termsForUpdate,
    };
    await updateCaseAnnotations(currentCaseId, updateData);

    try {
      if (caseDetails.caseNumber && evidenceItems.length > 0) {
        await batchSaveEvidence(
          evidenceItems,
          getCurrentUserId(),
          caseDetails.caseNumber
        );
      }
    } catch (evidenceError) {
      console.error("Error saving evidence collection:", evidenceError);
      showError(
        "Evidence Warning",
        evidenceError,
        "Case updated, but we couldn't update the evidence collection."
      );
    }
    setLastSaved(new Date().toLocaleTimeString());
    setSaveError(null);
  } catch (e) {
    console.error("Error saving to Firebase:", e);
    setSaveError("Could not save to cloud database - saved locally only");
    saveToLocalStorage(additionalData);
  } finally {
    setIsSaving(false);
  }
};


    // Debounced auto-save
    useEffect(() => {
      if (
        !isLoading &&
        currentCaseId &&
        (
          reportIntro ||
          reportConclusion ||
          evidenceItems.length > 0 ||
          technicalTerms.length > 0 ||
          locationTitles.length > 0
        )
      ) {
        const t = setTimeout(() => saveData(), 2000);
        return () => clearTimeout(t);
      }
    }, [
      reportIntro,
      reportConclusion,
      evidenceItems,
      technicalTerms,
      selectedLocations,
      locationTitles,
      isLoading,
      currentCaseId
    ]); // eslint-disable-line

// --- Grammar & Spelling Improvement (AI Review) ---
const handleTextImprovement = async (target) => {
  setLoadingSuggestion(true);
  setSuggestTarget(target);

  try {
    let textToImprove = "";

    if (target === "intro") textToImprove = reportIntro;
    else if (target === "conclusion") textToImprove = reportConclusion;
    else if (target === "evidence")
      textToImprove = evidenceItems.map((e) => e.description || e).join("\n");
    else if (target === "technical")
      textToImprove = technicalTerms.join("\n");

    if (!textToImprove.trim()) {
      showError("No Text Found", "Please enter text before requesting improvements.");
      setLoadingSuggestion(false);
      return;
    }

    const response = await axiosInstance.post("/cases/ai-review", {
      text: textToImprove,
      contextType: target,
    });

    setSuggestedText(response.data.suggestedText || "");
    setShowSuggestionModal(true);
  } catch (err) {
    console.error("AI improvement error:", err);
    showError("AI Suggestion Error", err, "Failed to fetch AI improvements.");
  } finally {
    setLoadingSuggestion(false);
  }
};

// --- PDF (with normalization) ---
const generatePDF = async () => {
  if (!reportRef.current) return null;
  try {
    const pdf = new jsPDF("p", "mm", "a4");
    const pdfWidth = pdf.internal.pageSize.getWidth();
    const pdfHeight = pdf.internal.pageSize.getHeight();
    const margin = 15;
    const normalizedTerms = normalizeTechnicalTermList(technicalTerms);
    const displayBetween = caseDetails.between || "Not specified";

    // --- COVER PAGE ---
    pdf.setFontSize(18);
    pdf.text("DIGITAL FORENSIC REPORT", pdfWidth / 2, pdfHeight / 2 - 20, { align: "center" });
    pdf.setFontSize(14);
    // Use BETWEEN instead of case title
    pdf.text(`Case: ${caseDetails.caseNumber} - ${displayBetween}`, pdfWidth / 2, pdfHeight / 2, { align: "center" });
    pdf.text(`Investigator: ${profile?.firstName || ""} ${profile?.surname || ""}`, pdfWidth / 2, pdfHeight / 2 + 10, { align: "center" });
    pdf.text(`Date of Incident: ${caseDetails.dateOfIncident}`, pdfWidth / 2, pdfHeight / 2 + 20, { align: "center" });
    pdf.addPage();

    // --- 1. INTRODUCTION ---
    if (reportIntro) {
      pdf.setFontSize(16);
      pdf.text("1. INTRODUCTION", margin, margin);
      pdf.setFontSize(11);
      const splitIntro = pdf.splitTextToSize(reportIntro, pdfWidth - margin * 2);
      pdf.text(splitIntro, margin, margin + 10);
      pdf.addPage();
    }

    // --- 2. EVIDENCE (Locker) ---
    if (evidenceItems.length > 0) {
      pdf.setFontSize(16);
      pdf.text("2. EVIDENCE", margin, margin);
      pdf.setFontSize(11);
      let yPos = margin + 10;
      evidenceItems.forEach((ev, idx) => {
        if (yPos > pdfHeight - 30) { pdf.addPage(); yPos = margin; }
        pdf.setFontSize(10);
        pdf.setTextColor(100, 100, 100);
        pdf.text(`Evidence ID: ${ev.id}`, margin, yPos); yPos += 5;
        pdf.text(`Date Added: ${new Date(ev.dateAdded).toLocaleDateString()}`, margin, yPos); yPos += 5;
        pdf.setTextColor(0, 0, 0);
        pdf.setFontSize(11);
        const desc = ev.description || "(No description provided)";
        const splitDesc = pdf.splitTextToSize(`${idx + 1}. ${desc}`, pdfWidth - margin * 2);
        pdf.text(splitDesc, margin, yPos);
        yPos += splitDesc.length * 5 + 5;
      });
      pdf.addPage();
    }


    // --- 3. TECHNICAL TERMS ---
    if (normalizedTerms.length > 0) {
      pdf.setFontSize(16);
      pdf.text("3. TECHNICAL TERMS", margin, margin);
      pdf.setFontSize(11);
      normalizedTerms.forEach((term, idx) => {
        const formatted = formatTechnicalTerm(term);
        if (!formatted) return;
        pdf.text(`3.${idx + 1} ${formatted}`, margin, margin + 10 + idx * 8);
      });
      pdf.addPage();
    }


    // --- 4. TRIPS - DATE ---
    const filtered = locations.filter((_, i) => selectedLocations.includes(i));
    if (filtered.length > 0) {
      pdf.setFontSize(16);
      pdf.text(`4. TRIPS - ${caseDetails.dateOfIncident}`, margin, margin);
    }

    for (let i = 0; i < filtered.length; i++) {
      const loc = filtered[i];
      const locIndex = locations.indexOf(loc);
      pdf.addPage();
      let y = margin;

      pdf.setFontSize(14);
      pdf.text(`4.${i + 1} ${locationTitles[locIndex] || loc.title || getLocationAddress(loc)}`, margin, y);
      y += 10;

      pdf.setFontSize(10);
      pdf.text(`Coordinates: ${formatCoordinate(loc.lat)}, ${formatCoordinate(loc.lng)}`, margin, y);
      y += 6;
      if (loc.timestamp) {
        pdf.text(`Time: ${formatTimestamp(loc.timestamp)}`, margin, y);
        y += 6;
      }

      const snap = snapshots.find((s) => s && s.index === locIndex);
      if (snap) {
        if (snap.mapImage) {
          try {
            const pngForPdf = await forcePngForPdf(snap.mapImage);
            if (pngForPdf) {
              pdf.addImage(pngForPdf, "PNG", margin, y, 80, 60);
              y += 70;
            }
          } catch {}
        }
        if (snap.streetViewImage) {
          try {
            const norm = await normalizeToPngDataURL(snap.streetViewImage);
            if (norm) {
              pdf.addImage(norm, "PNG", margin, y, 80, 60);
              y += 70;
            }
          } catch {}
        }
        if (snap.description) {
          pdf.setFontSize(12);
          pdf.text("Description:", margin, y);
          y += 6;
          const splitDesc = pdf.splitTextToSize(snap.description, pdfWidth - margin * 2);
          pdf.text(splitDesc, margin, y);
        }
      }
    }

    // --- 5. CONCLUSION ---
    if (reportConclusion) {
      pdf.addPage();
      pdf.setFontSize(16);
      pdf.text("5. CONCLUSION", margin, margin);
      pdf.setFontSize(11);
      const splitConclusion = pdf.splitTextToSize(reportConclusion, pdfWidth - margin * 2);
      pdf.text(splitConclusion, margin, margin + 10);
    }

    // --- FOOTER ---
    const pageCount = pdf.internal.getNumberOfPages();
    for (let i = 1; i <= pageCount; i++) {
      pdf.setPage(i);
      pdf.setFontSize(8);
      pdf.text(`Report generated on ${new Date().toLocaleDateString()} by TrackX`, margin, pdfHeight - 5);
      pdf.text(`Page ${i} of ${pageCount}`, pdfWidth - margin - 20, pdfHeight - 5);
    }

    return pdf;
  } catch (e) {
    console.error("Error generating PDF:", e);
    return null;
  }
};



  // --- DOCX (with normalization) ---
  const makeHeading = (text, level = HeadingLevel.HEADING_1) =>
    new Paragraph({ text, heading: level, spacing: { after: 200 } });
  const makeText = (text) => new Paragraph({ children: [new TextRun(text || "")], spacing: { after: 120 } });
  const makeSmall = (text) =>
    new Paragraph({ children: [new TextRun({ text: text || "", size: 18, color: "777777" })], spacing: { after: 120 } });

const buildReportPayload = () => {
  const selectedIndices = selectedLocations.slice().sort((a, b) => a - b);
  const locationsForPayload = locations.map((l, idx) => ({
    lat: l.lat,
    lng: l.lng,
    timestamp: l.timestamp,
    address: l.address,
    title: locationTitles[idx] || "",
    _idx: idx,
  }));
  const selectedSnapshotSet = new Set(selectedIndices);
  const filteredSnapshots = (snapshots || []).filter(
    (s) => s && typeof s.index === "number" && selectedSnapshotSet.has(s.index)
  );
  return {
    caseNumber: caseDetails.caseNumber,
    caseTitle: caseDetails.caseTitle,
    dateOfIncident: caseDetails.dateOfIncident,
    region: caseDetails.region,
    between: caseDetails.between || "Not specified",
    intro: reportIntro || "",
    conclusion: reportConclusion || "",
    technicalTerms: normalizeTechnicalTermList(technicalTerms),
    locations: locationsForPayload,
    selectedIndices,
    snapshots: filteredSnapshots,
  };
};


const generateDOCX = async () => {
  const payload = buildReportPayload();
  const docChildren = [];
  const normalizedTerms = normalizeTechnicalTermList(payload.technicalTerms || technicalTerms);
  const displayBetween = payload.between || "Not specified";

  // --- COVER PAGE ---
  docChildren.push(makeHeading("DIGITAL FORENSIC REPORT", HeadingLevel.TITLE));
  docChildren.push(makeText(`Case: ${payload.caseNumber} - ${displayBetween}`));
  docChildren.push(makeText(`Investigator: ${profile?.firstName || ""} ${profile?.surname || ""}`));
  docChildren.push(makeText(`Date of Incident: ${payload.dateOfIncident}`));
  docChildren.push(new Paragraph({ pageBreakBefore: true }));

  // --- 1. INTRODUCTION ---
  if ((payload.intro || "").trim()) {
    docChildren.push(makeHeading("1. INTRODUCTION", HeadingLevel.HEADING_1));
    docChildren.push(makeText(payload.intro));
  }

  // --- 2. EVIDENCE (Locker) ---
  if (evidenceItems.length > 0) {
    docChildren.push(makeHeading("2. EVIDENCE", HeadingLevel.HEADING_1));
    evidenceItems.forEach((ev, idx) => {
      docChildren.push(
        new Paragraph({ children: [new TextRun({ text: `Evidence ID: ${ev.id}`, size: 18, color: "666666" })] })
      );
      docChildren.push(
        new Paragraph({ children: [new TextRun({ text: `Date Added: ${new Date(ev.dateAdded).toLocaleDateString()}`, size: 18, color: "666666" })] })
      );
      docChildren.push(
        new Paragraph({ text: `${idx + 1}. ${ev.description || "(No description provided)"}`, spacing: { after: 200 } })
      );
    });
  }


  // --- 3. TECHNICAL TERMS ---
  if (normalizedTerms.length > 0) {
    docChildren.push(makeHeading("3. TECHNICAL TERMS", HeadingLevel.HEADING_1));
    normalizedTerms.forEach((term, idx) => {
      const formatted = formatTechnicalTerm(term);
      if (!formatted) return;
      docChildren.push(new Paragraph({ text: `3.${idx + 1} ${formatted}` }));
    });
  }

  // --- 4. TRIPS - DATE ---
  const snapByIdx = new Map((payload.snapshots || []).map((s) => [s.index, s]));
  const selected = payload.selectedIndices.map((i) => payload.locations[i]).filter(Boolean);

  if (selected.length > 0) {
    docChildren.push(makeHeading(`4. TRIPS - ${payload.dateOfIncident}`, HeadingLevel.HEADING_1));
  }

  for (let i = 0; i < selected.length; i++) {
    const loc = selected[i];
    const titleLine = loc.title || loc.address || `Location at ${formatCoordinate(loc.lat)}, ${formatCoordinate(loc.lng)}`;
    docChildren.push(makeHeading(`4.${i + 1} ${titleLine}`, HeadingLevel.HEADING_2));
    docChildren.push(makeSmall(`Coordinates: ${formatCoordinate(loc.lat)}, ${formatCoordinate(loc.lng)}`));
    if (loc.timestamp) docChildren.push(makeSmall(`Time: ${formatTimestamp(loc.timestamp)}`));

    const snap = snapByIdx.get(loc._idx);
    const images = [];
    if (snap?.mapImage) images.push(snap.mapImage);
    if (snap?.streetViewImage) images.push(snap.streetViewImage);

    for (const src of images) {
      try {
        const normalized = await normalizeToPngDataURL(src);
        if (!normalized) continue;
        const bytes = dataURLToUint8Array(normalized);
        if (!bytes) continue;

        docChildren.push(
          new Paragraph({
            children: [new ImageRun({ data: bytes, transformation: { width: 480, height: 320 } })],
            spacing: { after: 200 },
          })
        );
      } catch {}
    }

    if (snap?.description) {
      docChildren.push(makeHeading("Description", HeadingLevel.HEADING_2));
      docChildren.push(makeText(snap.description));
    }
  }

  // --- 5. CONCLUSION ---
  if ((payload.conclusion || "").trim()) {
    docChildren.push(makeHeading("5. CONCLUSION", HeadingLevel.HEADING_1));
    docChildren.push(makeText(payload.conclusion));
  }

  // --- FOOTER ---
  docChildren.push(
    new Paragraph({
      children: [
        new TextRun({ text: `Report generated on ${new Date().toLocaleDateString()} by TrackX`, size: 18, color: "777777" }),
      ],
    })
  );

  const doc = new Document({ sections: [{ properties: {}, children: docChildren }] });
  const blob = await Packer.toBlob(doc);
  return blob;
};
  // --- generation handler (merged) ---
const handleGenerate = async () => {
  setIsGenerating(true);
  const newLocal = [...generatedReports];
  const normalizedTerms = normalizeTechnicalTermList(technicalTerms);
  const today = new Date().toISOString().split("T")[0];
  const base = `_${caseDetails.caseNumber}_${today}`;

  try {
    // DOCX
    if (generateDocx) {
      try {
        const blob = await generateDOCX();
        const name = `Report${base}.docx`;
        saveAs(blob, name);
        newLocal.push({ id: Date.now() + 50, type: "report", name, date: new Date().toISOString(), docx: true });
        if (currentCaseId) {
          try {
            await createReportDocument(
              currentCaseId,
              {
                reportType: "docx",
                fileName: name,
                introduction: reportIntro,
                conclusion: reportConclusion,
                evidence: evidenceItems,
                technicalTerms: normalizedTerms,
              },
              getCurrentUserId()
            );
            const updated = await getCaseReports(currentCaseId);
            setFirebaseReports(updated || []);
          } catch (e) {
            console.warn("Failed to save DOCX report metadata to Firebase:", e);
          }
        }
      } catch (err) {
        console.error("DOCX generation failed:", err);
        showError("DOCX generation failed", err, "We couldn't generate the DOCX report. Please try again.");
      }
    }

    // PDF
    if (generateReport) {
      const pdf = await generatePDF();
      if (pdf) {
        const name = `Report${base}.pdf`;
        pdf.save(name);
        newLocal.push({ id: Date.now(), type: "report", name, date: new Date().toISOString(), pdf: true });
        if (currentCaseId) {
          try {
            await createReportDocument(
              currentCaseId,
              {
                reportType: "pdf",
                fileName: name,
                introduction: reportIntro,
                conclusion: reportConclusion,
                evidence: evidenceItems,
                technicalTerms: normalizedTerms,
              },
              getCurrentUserId()
            );
            const updated = await getCaseReports(currentCaseId);
            setFirebaseReports(updated || []);
          } catch (e) {
            console.error("Error saving PDF report to Firebase:", e);
          }
        }
      }
    }

    // Simulation (mock)
    if (generateSimulation) {
      const name = `Simulation${base}.mp4`;
      await new Promise((r) => setTimeout(r, 1500));
      newLocal.push({ id: Date.now() + 1, type: "simulation", name, date: new Date().toISOString() });
      if (currentCaseId) {
        try {
          await createReportDocument(currentCaseId, { reportType: "simulation", fileName: name }, getCurrentUserId());
          const updated = await getCaseReports(currentCaseId);
          setFirebaseReports(updated || []);
        } catch (e) {
          console.warn("Failed to save simulation metadata to Firebase:", e);
        }
      }
    }

    setGeneratedReports(newLocal);
    saveToLocalStorage({ generatedReports: newLocal });
  } catch (e) {
    console.error("Error in report generation:", e);
    showError("Report generation failed", e, "There was an error generating the report. Please try again.");
  } finally {
    setIsGenerating(false);
  }
};


  // --- download/open handler (merged) ---
  const handleDownload = async (report) => {
    if (report.googleDoc && report.webViewLink) {
      window.open(report.webViewLink, "_blank");
      return;
    }

    if (report.type === "report" && report.pdf) {
      const pdf = await generatePDF();
      if (pdf) pdf.save(report.name);
      return;
    }
    if (report.docx) {
      try {
        const blob = await generateDOCX();
        saveAs(blob, report.name);
      } catch (err) {
        showError("Download failed", err, "We couldn't regenerate the DOCX file. Please try again.");
      }
      return;
    }

    if (report.type === "simulation") {
      const s = localStorage.getItem("trackxCaseData");
      if (s) {
        const caseData = JSON.parse(s);
        localStorage.setItem("trackxSimulationCaseId", caseData.id);
      }
      window.open('/simulation', '_blank', 'noopener,noreferrer'); // new tab
    }

    if (report.type === "firebase-report") {
      const name = report.name || `Report_${report.reportId}`;
      if (name.endsWith(".pdf")) {
        const pdf = await generatePDF();
        if (pdf) pdf.save(name);
        return;
      }
      if (name.endsWith(".docx")) {
        try {
          const blob = await generateDOCX();
          saveAs(blob, name);
        } catch (err) {
          showError("Download failed", err, "We couldn't regenerate the DOCX file. Please try again.");
        }
        return;
      }
      if (name.endsWith(".gdoc") && report.webViewLink) {
        window.open(report.webViewLink, "_blank");
        return;
      }
      showInfo("Download unavailable", "This report only has metadata stored in Firebase and cannot be downloaded.");
      return;
    }

    showInfo("Download starting", `Downloading ${report.name}...`);
  };

  // --- UI helpers ---
  const toggleLocationSelection = (index) =>
    setSelectedLocations((prev) => (prev.includes(index) ? prev.filter((i) => i !== index) : [...prev, index]));
  const handleLocationTitleChange = (index, newTitle) => {
    const newTitles = [...locationTitles];
    while (newTitles.length <= index) newTitles.push("");
    newTitles[index] = newTitle;
    setLocationTitles(newTitles);
    saveToLocalStorage();
  };

  const allReports = [
    ...firebaseReports.map((r) => ({
      id: r.reportId,
      type: "firebase-report",
      name: r.fileName || `Report_${r.reportId}`,
      date: r.createdAt?.toISOString?.() || new Date().toISOString(),
      webViewLink: r.webViewLink,
      reportId: r.reportId,
      caseId: r.caseId,
    })),
    ...generatedReports,
  ];

const[loadingIntro, setLoadingIntro] = useState(false);
const [loadingConclusion, setLoadingConclusion] = useState(false);


// Function to call backend for AI Intro
const handleGenerateIntro = async () => {
  if (!currentCaseId) return;
  try {
    setLoadingIntro(true);
    const res = await axiosInstance.post(`/cases/${currentCaseId}/ai-intro`, {
      // optional context payload if you want; currently backend reads from Firestore
    });
    const intro = res.data.reportIntro || "";
    setReportIntro(intro);
    await saveData({ reportIntro: intro }); // save immediately (to Firebase/local)
  } catch (err) {
    console.error("Error generating intro:", err);
  } finally {
    setLoadingIntro(false);
  }
};

const handleGenerateConclusion = async () => {
  if (!currentCaseId) return;
  try {
    setLoadingConclusion(true);
    const res = await axiosInstance.post(`/cases/${currentCaseId}/ai-conclusion`);
    const conclusion = res.data.reportConclusion || "";
    setReportConclusion(conclusion);
    await saveData({ reportConclusion: conclusion });
  } catch (err) {
    console.error("Error generating conclusion:", err);
  } finally {
    setLoadingConclusion(false);
  }
};


  // --- loading & error ---
  if (isLoading) {
    return (
      <div className="min-h-screen bg-black text-white flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-500 mx-auto mb-4"></div>
          <p className="text-gray-300">Loading case data...</p>
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

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 1 }} className="relative min-h-screen text-white font-sans overflow-hidden">
      {/* BG */}
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

          <div className="hidden md:flex items-center gap-2 rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-2 text-xs text-gray-200 shadow-inner shadow-white/5">
            <FirebaseStatus />
          </div>
        </div>

        <div className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 text-2xl font-semibold tracking-[0.35em] text-white/80 drop-shadow-[0_2px_12px_rgba(15,23,42,0.55)]">
          OVERVIEW
        </div>

        <div className="flex items-center gap-4 text-sm text-gray-200">
          <div className="hidden text-right lg:block">
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

      {/* Hamburger Menu */}
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
          <Link
            to="/annotations"
            className="flex items-center gap-3 rounded-2xl px-3 py-2 text-sm font-medium text-gray-200 transition hover:bg-white/10 hover:text-white"
            onClick={() => setShowMenu(false)}
          >
            <MapPin className="h-4 w-4" />
            Annotations
          </Link>
          <Link
            to="/my-cases"
            className="flex items-center gap-3 rounded-2xl px-3 py-2 text-sm font-medium text-gray-200 transition hover:bg-white/10 hover:text-white"
            onClick={() => setShowMenu(false)}
          >
            <Briefcase className="h-4 w-4" />
            My Cases
          </Link>
          <div className="flex items-center gap-3 rounded-2xl px-3 py-2 text-sm font-medium text-white bg-white/[0.045] shadow-inner shadow-white/10">
            <FileText className="h-4 w-4" />
            Overview
          </div>
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

      {/* Navigation Tabs */}
      <div className="mx-6 mt-6 flex justify-center gap-8 rounded-full border border-white/10 bg-white/[0.02] px-6 py-2 text-xs font-semibold text-gray-300 shadow-[0_15px_40px_rgba(15,23,42,0.45)] backdrop-blur-xl">
        <Link to="/new-case" className="text-gray-400 transition hover:text-white">
          Case Information
        </Link>
        <Link to="/annotations" className="text-gray-400 transition hover:text-white">
          Annotations
        </Link>
        <span className="inline-flex items-center rounded-full bg-gradient-to-r from-blue-900/80 to-purple-900/80 px-5 py-1.5 text-white shadow-[0_12px_30px_rgba(15,23,42,0.45)]">
          Overview
        </span>
      </div>

      <section className="relative mx-auto mt-10 w-full max-w-6xl px-6 pb-24">
        <div className="relative overflow-hidden rounded-3xl border border-white/10 bg-white/[0.02] px-8 py-8 shadow-[0_35px_90px_rgba(15,23,42,0.55)] backdrop-blur-2xl">
          <div className="pointer-events-none absolute -top-28 right-6 h-56 w-56 rounded-full bg-blue-900/25 blur-3xl" />
          <div className="pointer-events-none absolute -bottom-24 left-0 h-48 w-48 rounded-full bg-purple-900/20 blur-3xl" />
          <div className="relative z-10 flex flex-col gap-8 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.35em] text-gray-400">Case Overview</p>
              <h1 className="mt-3 text-3xl font-semibold text-white">
                {caseDetails.caseTitle || "Overview"}
              </h1>
              <p className="mt-3 max-w-xl text-sm text-gray-400">
                Shape the investigative storyline, curate locations, and export polished forensic reports.
              </p>
            </div>
            <div className="grid grid-cols-1 gap-4 text-sm text-gray-300 sm:grid-cols-2">
              <div>
                <p className="text-xs uppercase tracking-wide text-gray-500">Case Number</p>
                <p className="mt-1 text-base font-medium text-white">{caseDetails.caseNumber || "-"}</p>
              </div>
              <div>
                <p className="text-xs uppercase tracking-wide text-gray-500">Incident Date</p>
                <p className="mt-1 text-base font-medium text-white">{caseDetails.dateOfIncident || "-"}</p>
              </div>
              <div>
                <p className="text-xs uppercase tracking-wide text-gray-500">Region</p>
                <p className="mt-1 text-base font-medium text-white">{caseDetails.region || "-"}</p>
              </div>
              <div>
                <p className="text-xs uppercase tracking-wide text-gray-500">Between</p>
                <p className="mt-1 text-base font-medium text-white">{caseDetails.between || "Not specified"}</p>
              </div>
            </div>
          </div>

          <div className="relative z-10 mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div className="group rounded-2xl border border-white/10 bg-white/[0.03] p-4 shadow-[0_18px_40px_rgba(15,23,42,0.45)] transition hover:border-blue-500/40">
              <div className="flex items-center justify-between text-xs uppercase tracking-wide text-gray-500">
                Total Locations
                <MapPin className="h-4 w-4 text-blue-400" />
              </div>
              <p className="mt-3 text-2xl font-semibold text-white">{totalLocations}</p>
              <p className="text-xs text-gray-400">Captured from your dataset.</p>
            </div>
            <div className="group rounded-2xl border border-white/10 bg-white/[0.03] p-4 shadow-[0_18px_40px_rgba(15,23,42,0.45)] transition hover:border-indigo-500/40">
              <div className="flex items-center justify-between text-xs uppercase tracking-wide text-gray-500">
                Selected For Report
                <FileText className="h-4 w-4 text-indigo-400" />
              </div>
              <p className="mt-3 text-2xl font-semibold text-white">{selectedCount}</p>
              <p className="text-xs text-gray-400">Choose key waypoints to narrate.</p>
            </div>
            <div className="group rounded-2xl border border-white/10 bg-white/[0.03] p-4 shadow-[0_18px_40px_rgba(15,23,42,0.45)] transition hover:border-emerald-500/40">
              <div className="flex items-center justify-between text-xs uppercase tracking-wide text-gray-500">
                Snapshots Captured
                <Camera className="h-4 w-4 text-emerald-400" />
              </div>
              <p className="mt-3 text-2xl font-semibold text-white">{snapshotsCapturedCount}</p>
              <p className="text-xs text-gray-400">Visual context for the report.</p>
            </div>
            <div className="group rounded-2xl border border-white/10 bg-white/[0.03] p-4 shadow-[0_18px_40px_rgba(15,23,42,0.45)] transition hover:border-purple-500/40">
              <div className="flex items-center justify-between text-xs uppercase tracking-wide text-gray-500">
                Reports Generated
                <FolderOpen className="h-4 w-4 text-purple-400" />
              </div>
              <p className="mt-3 text-2xl font-semibold text-white">{allReports.length}</p>
              <p className="text-xs text-gray-400">Includes local and cloud exports.</p>
            </div>
          </div>
        </div>

        <div className="hidden">
          <div ref={reportRef} id="report-template" className="max-w-[800px] bg-white p-8 text-black" />
        </div>

        <div className="mt-10 space-y-8">
        {/* Selected Locations */}
        <div className="relative overflow-hidden rounded-3xl border border-white/10 bg-white/[0.018] p-6 shadow-[0_25px_70px_rgba(15,23,42,0.45)] backdrop-blur-2xl">
          <div className="pointer-events-none absolute -top-16 right-0 h-32 w-32 rounded-full bg-blue-900/25 blur-3xl" />
          <div className="pointer-events-none absolute -bottom-10 left-0 h-24 w-24 rounded-full bg-cyan-900/20 blur-3xl" />
          <div className="relative z-10">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2 className="text-lg font-semibold text-white">Selected Locations</h2>
                <p className="text-xs text-gray-400">Toggle which key stops appear in your narrative.</p>
              </div>
              <span className="inline-flex items-center rounded-full bg-white/[0.05] px-3 py-1 text-xs font-medium text-gray-300">
                {selectedCount} of {totalLocations} selected
              </span>
            </div>
            <div className="mt-5 max-h-72 space-y-3 overflow-y-auto pr-1">
              {locations.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-white/15 bg-black/30 p-8 text-center text-sm text-gray-400">
                  No locations available yet. Import case data to populate this list.
                </div>
              ) : (
                locations.map((location, index) => {
                  const snapshot = snapshots.find((s) => s && s.index === index && (s.mapImage || s.streetViewImage));
                  const coordsLine = `${formatCoordinate(location.lat)}, ${formatCoordinate(location.lng)}`;
                  return (
                    <div
                      key={index}
                      className="group flex flex-col gap-4 rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-4 text-sm text-gray-200 transition hover:border-blue-500/40 sm:flex-row sm:items-center sm:justify-between"
                    >
                      <label htmlFor={`location-${index}`} className="flex flex-1 items-start gap-3">
                        <input
                          type="checkbox"
                          id={`location-${index}`}
                          checked={selectedLocations.includes(index)}
                          onChange={() => toggleLocationSelection(index)}
                          className="mt-1 h-5 w-5 rounded-md border border-white/20 bg-black/40 text-blue-500 focus:ring-2 focus:ring-blue-500/60 focus:ring-offset-0"
                        />
                        <div>
                          <p className="font-medium text-white">
                            {locationTitles[index] || location.title || getLocationAddress(location)}
                          </p>
                          <p className="mt-1 text-xs text-gray-500">{coordsLine}</p>
                          {snapshot && (
                            <span className="mt-2 inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-0.5 text-[11px] font-medium text-emerald-300">
                              <Camera className="h-3 w-3" />
                              Snapshot ready
                            </span>
                          )}
                        </div>
                      </label>
                      <div className="flex w-full flex-col gap-2 sm:w-auto sm:items-end">
                        <input
                          type="text"
                          value={locationTitles[index] || ""}
                          onChange={(e) => handleLocationTitleChange(index, e.target.value)}
                          placeholder="Add a headline..."
                          className="w-full rounded-xl border border-white/12 bg-slate-950/50 px-3 py-2 text-sm text-white placeholder-gray-500 focus:border-blue-600/60 focus:outline-none focus:ring-2 focus:ring-blue-600/20 sm:w-48"
                        />
                        <Link
                          to="/annotations"
                          className="inline-flex items-center justify-center gap-1 rounded-full border border-blue-500/30 bg-blue-500/10 px-3 py-1 text-xs font-medium text-blue-200 transition hover:border-blue-500/60 hover:bg-blue-500/20"
                          onClick={() => {
                            localStorage.setItem("trackxCurrentLocationIndex", index);
                            saveToLocalStorage();
                          }}
                        >
                          <MapPin className="h-3 w-3" />
                          Edit capture
                        </Link>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>

{/* Report Intro */}
<div
  id="task-target-overview-intro"
  className={`rounded-3xl border border-white/10 bg-white/[0.018] p-6 shadow-[0_25px_70px_rgba(15,23,42,0.45)] backdrop-blur-2xl ${highlightClass(
    "task-target-overview-intro"
  )}`}
>
  {/* Header + Buttons Row */}
  <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
    <div>
      <h2 className="text-lg font-semibold text-white">Report Introduction</h2>
      <p className="text-xs text-gray-400">Set the tone for your findings.</p>
    </div>

    {/* Button Group */}
    <div className="flex gap-3 mt-2 sm:mt-0">
      {/* Generate Button */}
      <button
        onClick={handleGenerateIntro}
        disabled={loadingIntro}
        className={`inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-semibold transition ${
          loadingIntro
            ? "cursor-not-allowed bg-white/10 text-gray-300"
            : "bg-gradient-to-r from-purple-600 to-indigo-600 text-white hover:from-purple-500 hover:to-indigo-500"
        }`}
      >
        {loadingIntro ? (
          <span className="flex items-center gap-2">
            <span className="h-3 w-3 animate-spin rounded-full border-b-2 border-white/70" />
            Generating...
          </span>
        ) : (
          "Generate AI Intro"
        )}
      </button>

      {/* Suggest Button */}
      <button
        onClick={() => handleTextImprovement("intro")}
        disabled={loadingSuggestion}
        className={`inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-semibold transition ${
          loadingSuggestion && suggestTarget === "intro"
            ? "cursor-not-allowed bg-white/10 text-gray-300"
            : "bg-gradient-to-r from-gray-700 to-gray-800 text-white hover:from-gray-600 hover:to-gray-700"
        }`}
      >
        {loadingSuggestion && suggestTarget === "intro" ? (
          <span className="flex items-center gap-2">
            <span className="h-3 w-3 animate-spin rounded-full border-b-2 border-white/70" />
            Loading...
          </span>
        ) : (
          "Suggest Improvements"
        )}
      </button>
    </div>
  </div>

  {/* extarea for input */}
  <textarea
    placeholder="Enter report introduction..."
    value={reportIntro}
    onChange={(e) => setReportIntro(e.target.value)}
    onBlur={() => saveToLocalStorage()}
    className="mt-4 min-h-[140px] w-full rounded-2xl border border-white/10 bg-slate-950/50 px-4 py-3 text-sm text-white placeholder-gray-500 focus:border-purple-500/50 focus:outline-none focus:ring-2 focus:ring-purple-500/30"
  />
</div>


        {/* Evidence Search & Link Section */}
        <section className="rounded-3xl border border-white/10 bg-white/[0.018] p-6 shadow-[0_25px_70px_rgba(15,23,42,0.45)] backdrop-blur-2xl">
          <div className="flex flex-col gap-1 sm:flex-row sm:items-baseline sm:justify-between">
            <div>
              <h3 className="text-sm font-semibold text-white flex items-center gap-2">
                <Search className="h-5 w-5 text-purple-400" />
                Search & Link Existing Evidence
              </h3>
              <p className="text-xs text-gray-400 mt-1">
                Pull in evidence collected for other cases to strengthen this overview.
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
                                    <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
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
                                  <span className="font-medium">Also used in:</span> {ev.relatedCases.filter((c) => c !== ev.caseNumber).join(", ")}
                                </p>
                              </div>
                            )}
                          </div>

                          <button
                            type="button"
                            onClick={() => linkExistingEvidence(ev)}
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

        <div
          id="task-target-overview-evidence"
          className={`rounded-3xl border border-white/10 bg-white/[0.018] p-6 shadow-[0_25px_70px_rgba(15,23,42,0.45)] backdrop-blur-2xl ${highlightClass(
            "task-target-overview-evidence"
          )}`}
        >
          <EvidenceLocker
            evidenceItems={evidenceItems}
            onChange={(next) => {
              setEvidenceItems(next);
              // keep local storage in sync; autosave will handle Firebase
              saveToLocalStorage({ evidenceItems: next });
            }}
            readOnly={isSaving}
            allowAddRemove={!isSaving}
            caseNumber={caseDetails.caseNumber}
          />
        </div>


        <div
          id="task-target-overview-glossary"
          className={`rounded-3xl border border-white/10 bg-white/[0.018] p-6 shadow-[0_25px_70px_rgba(15,23,42,0.45)] backdrop-blur-2xl ${highlightClass(
            "task-target-overview-glossary"
          )}`}
        >
          <TechnicalTermsSelector
            value={technicalTerms}
            onChange={(items) => {
              const next = normalizeTechnicalTermList(items);
              setTechnicalTerms(next);
              saveToLocalStorage({ technicalTerms: next });
            }}
            disabled={isSaving}
          />
        </div>
        {/* Report Conclusion */}
<div
  id="task-target-overview-conclusion"
  className={`rounded-3xl border border-white/10 bg-white/[0.018] p-6 shadow-[0_25px_70px_rgba(15,23,42,0.45)] backdrop-blur-2xl ${highlightClass(
    "task-target-overview-conclusion"
  )}`}
>
  {/* Header + Buttons Row */}
  <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
    <div>
      <h2 className="text-lg font-semibold text-white">Report Conclusion</h2>
      <p className="text-xs text-gray-400"> Wrap up the investigation with decisive commentary.</p>
    </div>

    {/* Button Group */}
    <div className="flex gap-3 mt-2 sm:mt-0">
      {/* Generate Button */}
      <button
        onClick={handleGenerateConclusion}
        disabled={loadingConclusion}
        className={`inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-semibold transition ${
          loadingConclusion
            ? "cursor-not-allowed bg-white/10 text-gray-300"
            : "bg-gradient-to-r from-purple-600 to-indigo-600 text-white hover:from-purple-500 hover:to-indigo-500"
        }`}
      >
        {loadingConclusion ? (
          <span className="flex items-center gap-2">
            <span className="h-3 w-3 animate-spin rounded-full border-b-2 border-white/70" />
            Generating...
          </span>
        ) : (
          "Generate AI Conclusion"
        )}
      </button>

      {/* Suggest Button */}
      <button
        onClick={() => handleTextImprovement("conclusion")}
        disabled={loadingSuggestion}
        className={`inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-semibold transition ${
          loadingSuggestion && suggestTarget === "conclusion"
            ? "cursor-not-allowed bg-white/10 text-gray-300"
            : "bg-gradient-to-r from-gray-700 to-gray-800 text-white hover:from-gray-600 hover:to-gray-700"
        }`}
      >
        {loadingSuggestion && suggestTarget === "conclusion" ? (
          <span className="flex items-center gap-2">
            <span className="h-3 w-3 animate-spin rounded-full border-b-2 border-white/70" />
            Loading...
          </span>
        ) : (
          "Suggest Improvements"
        )}
      </button>
    </div>
  </div>

  {/* Textarea for input */}
  <textarea
    placeholder="Enter report conclusion..."
    value={reportConclusion}
    onChange={(e) => setReportConclusion(e.target.value)}
    onBlur={() => saveToLocalStorage()}
    className="mt-4 min-h-[140px] w-full rounded-2xl border border-white/10 bg-slate-950/50 px-4 py-3 text-sm text-white placeholder-gray-500 focus:border-purple-500/50 focus:outline-none focus:ring-2 focus:ring-purple-500/30"
  />
</div>


        {/* Save bar */}
        <div className="rounded-3xl border border-white/10 bg-white/[0.018] p-6 shadow-[0_25px_70px_rgba(15,23,42,0.45)] backdrop-blur-2xl">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h3 className="text-lg font-semibold text-white">Save Progress</h3>
              <p className="text-xs text-gray-400">Your work auto-saves every few seconds.</p>
            </div>
            <button
              onClick={() => saveData()}
              disabled={isSaving}
              className={`inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-semibold transition ${
                isSaving
                  ? "cursor-not-allowed bg-white/10 text-gray-300"
                  : "bg-gradient-to-r from-emerald-600 to-teal-600 text-white hover:from-emerald-500 hover:to-teal-500"
              }`}
            >
              {isSaving ? "Saving..." : "Save Now"}
            </button>
          </div>
          <div className="mt-4 rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3 text-xs text-gray-400">
            <p>Changes persist automatically while you craft the report.</p>
            <p className="mt-1">
              {currentCaseId ? (
                <span className="text-emerald-300">✓ Connected to Firebase (ID: {String(currentCaseId).slice(-8)})</span>
              ) : (
                <span className="text-amber-300">⚠ Using local storage only</span>
              )}
            </p>
          </div>
        </div>

        {/* Generate */}
        <div
          id="task-target-overview-export"
          className={`rounded-3xl border border-white/10 bg-white/[0.018] p-6 shadow-[0_25px_70px_rgba(15,23,42,0.45)] backdrop-blur-2xl ${highlightClass(
            "task-target-overview-export"
          )}`}
        >
          <div className="flex flex-col gap-4">
            <div>
              <h3 className="text-lg font-semibold text-white">Export & Simulation</h3>
              <p className="text-xs text-gray-400">Choose the deliverables you want to generate.</p>
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <label className="flex items-center justify-between rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3 text-sm text-gray-200 transition hover:border-blue-500/40">
                <span>Generate PDF</span>
                <div className="relative">
                  <input
                    type="checkbox"
                    checked={generateReport}
                    onChange={() => setGenerateReport(!generateReport)}
                    className="peer sr-only"
                  />
                  <div className="h-5 w-9 rounded-full bg-white/15 transition peer-checked:bg-blue-500/70" />
                  <div className="absolute top-0.5 left-0.5 h-4 w-4 rounded-full bg-white transition peer-checked:translate-x-4" />
                </div>
              </label>
              <label className="flex items-center justify-between rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3 text-sm text-gray-200 transition hover:border-indigo-500/40">
                <span>Generate DOCX</span>
                <div className="relative">
                  <input
                    type="checkbox"
                    checked={generateDocx}
                    onChange={() => setGenerateDocx(!generateDocx)}
                    className="peer sr-only"
                  />
                  <div className="h-5 w-9 rounded-full bg-white/15 transition peer-checked:bg-indigo-500/70" />
                  <div className="absolute top-0.5 left-0.5 h-4 w-4 rounded-full bg-white transition peer-checked:translate-x-4" />
                </div>
              </label>
              <label className="flex items-center justify-between rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3 text-sm text-gray-200 transition hover:border-emerald-500/40">
                <span>Generate Simulation</span>
                <div className="relative">
                  <input
                    type="checkbox"
                    checked={generateSimulation}
                    onChange={() => setGenerateSimulation(!generateSimulation)}
                    className="peer sr-only"
                  />
                  <div className="h-5 w-9 rounded-full bg-white/15 transition peer-checked:bg-emerald-500/70" />
                  <div className="absolute top-0.5 left-0.5 h-4 w-4 rounded-full bg-white transition peer-checked:translate-x-4" />
                </div>
              </label>
            </div>
            <button
              className={`inline-flex items-center justify-center gap-2 rounded-full px-6 py-2 text-sm font-semibold transition ${
                (!generateReport && !generateDocx && !generateSimulation) ||
                isGenerating ||
                selectedLocations.length === 0
                  ? "cursor-not-allowed bg-white/10 text-gray-300"
                  : "bg-gradient-to-r from-blue-600 to-cyan-600 text-white hover:from-blue-500 hover:to-cyan-500"
              }`}
              onClick={handleGenerate}
              disabled={
                (!generateReport && !generateDocx && !generateSimulation) ||
                isGenerating ||
                selectedLocations.length === 0
              }
              title={selectedLocations.length === 0 ? "Select at least one location" : ""}
            >
              {isGenerating ? (
                <span className="flex items-center gap-2">
                  <span className="h-4 w-4 animate-spin rounded-full border-b-2 border-white" />
                  Generating...
                </span>
              ) : (
                "Generate"
              )}
            </button>
          </div>
        </div>

        {/* Reports list (Firebase + local) */}
        {allReports.length > 0 && (
          <div className="rounded-3xl border border-white/10 bg-white/[0.018] p-6 shadow-[0_25px_70px_rgba(15,23,42,0.45)] backdrop-blur-2xl">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h3 className="text-lg font-semibold text-white">Generated Reports</h3>
                <p className="text-xs text-gray-400">Reopen or download exports created for this case.</p>
              </div>
              <span className="rounded-full bg-white/[0.05] px-3 py-1 text-xs font-medium text-gray-300">
                {allReports.length} file{allReports.length === 1 ? "" : "s"}
              </span>
            </div>
            <div className="mt-4 space-y-3">
              {allReports.map((report) => (
                <div
                  key={report.id}
                  className="flex flex-col gap-4 rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3 text-sm text-gray-200 transition hover:border-emerald-500/40 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="flex items-center gap-3">
                    {report.type === "firebase-report" ? (
                      <FileText className="h-5 w-5 text-emerald-300" />
                    ) : report.type === "report" ? (
                      <FileText className="h-5 w-5 text-blue-300" />
                    ) : (
                      <span className="text-lg leading-none">🎬</span>
                    )}
                    <div>
                      <p className="font-medium text-white">{report.name}</p>
                      <p className="text-xs text-gray-400">
                        {new Date(report.date).toLocaleString()}
                        {report.type === "firebase-report" && <span className="ml-2 text-emerald-300">• Synced to Firebase</span>}
                      </p>
                    </div>
                  </div>
                  <button
                    className="inline-flex items-center justify-center rounded-full bg-gradient-to-r from-emerald-500 to-teal-500 px-4 py-1.5 text-sm font-semibold text-white transition hover:from-emerald-400 hover:to-teal-400"
                    onClick={() => handleDownload(report)}
                  >
                    {report.googleDoc ? "Open" : report.type === "simulation" ? "View" : "Download"}
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Snapshot Status */}
        <div className="rounded-3xl border border-white/10 bg-white/[0.018] p-6 shadow-[0_25px_70px_rgba(15,23,42,0.45)] backdrop-blur-2xl">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-lg font-semibold text-white">Snapshot Status</h2>
              <p className="text-xs text-gray-400">Keep map and street imagery aligned with your timeline.</p>
            </div>
            <button
              onClick={hydrateSnapshots}
              className="inline-flex items-center gap-2 rounded-full border border-white/12 bg-white/[0.05] px-3 py-1.5 text-xs font-semibold text-gray-200 transition hover:border-blue-500/40 hover:text-white"
              title="Re-check session/local/Firebase for snapshots"
            >
              ↻ Refresh
            </button>
          </div>
          <div className="mt-5 rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-4">
            {snapshotsAvailable ? (
              <div className="flex flex-col gap-2 text-sm text-emerald-300 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-center gap-2">
                  <Camera className="h-4 w-4" />
                  <span>Snapshot images available ({snapshotsCapturedCount} of {locations.length} locations)</span>
                </div>
                <span className="text-xs text-emerald-200">Perfect for rich storytelling.</span>
              </div>
            ) : (
              <div className="flex flex-col gap-2 text-sm text-amber-300 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-center gap-2">
                  <Camera className="h-4 w-4" />
                  <span>No snapshot images yet. Capture them from the annotations workspace.</span>
                </div>
                <span className="text-xs text-amber-200">Add imagery to elevate the report.</span>
              </div>
            )}
            <div className="mt-4 flex flex-wrap items-center gap-3">
              <Link
                to="/annotations"
                className="inline-flex items-center gap-2 rounded-full border border-blue-500/30 bg-blue-500/10 px-4 py-1.5 text-sm font-medium text-blue-200 transition hover:border-blue-500/60 hover:bg-blue-500/20"
              >
                <Camera className="h-4 w-4" />
                {snapshotsAvailable ? "Manage Snapshots" : "Capture Snapshots"}
              </Link>
              <span className="text-xs text-gray-500">Last synced: {lastSaved || "moments ago"}</span>
            </div>
          </div>
        </div>

        {/* Case Summary */}
        <div className="rounded-3xl border border-white/10 bg-white/[0.018] p-6 shadow-[0_25px_70px_rgba(15,23,42,0.45)] backdrop-blur-2xl">
          <h2 className="text-lg font-semibold text-white">Case Summary</h2>
          <p className="mt-1 text-xs text-gray-400">Quick reference for collaborative briefings.</p>
          <dl className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
              <dt className="text-xs uppercase tracking-wide text-gray-500">Selected for report</dt>
              <dd className="mt-2 text-lg font-semibold text-white">{selectedCount} / {totalLocations}</dd>
              <dd className="mt-1 text-xs text-gray-500">Toggle selections above to refine.</dd>
            </div>
            <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
              <dt className="text-xs uppercase tracking-wide text-gray-500">Snapshots prepared</dt>
              <dd className="mt-2 text-lg font-semibold text-white">{snapshotsCapturedCount}</dd>
              <dd className="mt-1 text-xs text-gray-500">{snapshotsAvailable ? "Ready for export." : "Visit annotations to capture visuals."}</dd>
            </div>
            <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
              <dt className="text-xs uppercase tracking-wide text-gray-500">Report tally</dt>
              <dd className="mt-2 text-lg font-semibold text-white">{allReports.length}</dd>
              <dd className="mt-1 text-xs text-gray-500">{firebaseReports.length} cloud • {generatedReports.length} local</dd>
            </div>
            <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
              <dt className="text-xs uppercase tracking-wide text-gray-500">Sync status</dt>
              <dd
                className={`mt-2 text-lg font-semibold ${
                  saveError ? "text-rose-300" : isSaving ? "text-amber-300" : "text-emerald-300"
                }`}
              >
                {savingStatus || (currentCaseId ? "Connected" : "Idle")}
              </dd>
              <dd className="mt-1 text-xs text-gray-500">
                {currentCaseId ? `Cloud ID • ${String(currentCaseId).slice(-8)}` : "Using local storage"}
              </dd>
            </div>
          </dl>
        </div>
      </div>
    </section>

      <NotificationModal
        isOpen={modalState.isOpen}
        title={modalState.title}
        description={modalState.description}
        variant={modalState.variant}
        onClose={closeModal}
        primaryAction={modalState.primaryAction}
        secondaryAction={modalState.secondaryAction}
      />
      {/* --- AI Suggestion Modal --- */}
{showSuggestionModal && (
  <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/65 backdrop-blur-sm px-4">
    <div className="w-full max-w-lg rounded-3xl border border-white/12 bg-gradient-to-br from-slate-950/90 via-slate-900/85 to-black/85 p-6 shadow-[0_35px_80px_rgba(15,23,42,0.65)]">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-lg font-semibold text-white">AI Suggested Improvements</h2>
        <button
          type="button"
          onClick={() => setShowSuggestionModal(false)}
          className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-white/15 text-gray-300 transition hover:border-white/40 hover:text-white"
        >
          <span aria-hidden="true">X</span>
        </button>
      </div>

      <textarea
        className="w-full h-44 resize-none rounded-2xl border border-white/12 bg-white/[0.06] p-3 text-sm text-white placeholder-gray-400 shadow-inner shadow-black/20 transition focus:border-blue-500/60 focus:outline-none focus:ring-1 focus:ring-blue-500/50"
        value={suggestedText}
        onChange={(e) => setSuggestedText(e.target.value)}
      />

      <div className="mt-4 flex justify-end gap-3">
        <button
          type="button"
          className="inline-flex items-center rounded-full border border-white/15 bg-white/[0.05] px-4 py-2 text-xs font-semibold text-gray-200 transition hover:border-white/35 hover:text-white"
          onClick={() => setShowSuggestionModal(false)}
        >
          Close
        </button>

        <button
          type="button"
          className="inline-flex items-center rounded-full bg-gradient-to-r from-emerald-600 to-teal-500 px-4 py-2 text-xs font-semibold text-white shadow-lg shadow-emerald-500/20 transition hover:from-emerald-500 hover:to-teal-400"
          onClick={() => {
            const raw = (suggestedText || "").trim();
            if (!raw) {
              setShowSuggestionModal(false);
              return;
            }

            if (suggestTarget === "intro") setReportIntro(raw);
            else if (suggestTarget === "conclusion") setReportConclusion(raw);
            else if (suggestTarget === "evidence") {
              const lines = raw.split("\n").map((l) => l.trim()).filter(Boolean);
              setEvidenceItems(lines.map((desc) => ({ id: Date.now(), description: desc })));
            } else if (suggestTarget === "technical") {
              const lines = raw.split("\n").map((l) => l.trim()).filter(Boolean);
              setTechnicalTerms(lines);
            }

            setShowSuggestionModal(false);
          }}
        >
          Apply Changes
        </button>
      </div>
    </div>
  </div>
)}

    </motion.div>

    
  );
}

export default OverviewPage;
