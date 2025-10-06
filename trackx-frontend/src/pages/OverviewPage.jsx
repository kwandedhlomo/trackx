import React, { useState, useEffect, useRef } from "react";
import { Link, useNavigate, useLocation } from "react-router-dom";
import adflogo from "../assets/image-removebg-preview.png";
import { motion } from "framer-motion";
import { AlertTriangle, MapPin, FileText, Camera, Home, FilePlus2, FolderOpen, Briefcase, LayoutDashboard } from "lucide-react";
import jsPDF from "jspdf";
import { useAuth } from "../context/AuthContext";
import { signOut } from "firebase/auth";
import { auth } from "../firebase";
import FirebaseStatus from "../components/FirebaseStatus";
import axios from "axios";
import NotificationModal from "../components/NotificationModal";
import useNotificationModal from "../hooks/useNotificationModal";
import { getFriendlyErrorMessage } from "../utils/errorMessages";
import TechnicalTermsSelector from "../components/TechnicalTermsSelector";
import { formatTechnicalTerm, normalizeTechnicalTermList } from "../utils/technicalTerms";

// ---- DOCX + save-as ----
import { Document, Packer, Paragraph, TextRun, HeadingLevel, ImageRun } from "docx";
import { saveAs } from "file-saver";

// ---- Google Doc (optional) ----
const API_BASE = (import.meta.env.VITE_API_URL || "").replace(/\/+$/, "");
const REPORTS_ENDPOINT = `${API_BASE}/api/reports/google-doc`;
const GOOGLE_OAUTH_CLIENT_ID = (import.meta.env.VITE_GOOGLE_OAUTH_CLIENT_ID || "").trim();
const GOOGLE_SCOPES = [
  "https://www.googleapis.com/auth/drive.file",
  "https://www.googleapis.com/auth/documents",
].join(" ");

// ---- Firebase services ----
import {
  saveCaseWithAnnotations,
  loadCaseWithAnnotations,
  updateCaseAnnotations,
  createReportDocument,
  getCaseReports,
  loadSnapshotsFromFirebase,
} from "../services/firebaseServices";

// Optional (not used directly for embedding but left for completeness)
const GOOGLE_MAPS_API_KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY;




// ---------- Google OAuth script loader ----------
let gsiScriptPromise = null;
function loadGsiScript() {
  if (gsiScriptPromise) return gsiScriptPromise;
  gsiScriptPromise = new Promise((resolve, reject) => {
    if (window.google?.accounts?.oauth2) return resolve();
    const s = document.createElement("script");
    s.src = "https://accounts.google.com/gsi/client";
    s.async = true;
    s.defer = true;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error("Failed to load Google Identity Services script"));
    document.head.appendChild(s);
  });
  return gsiScriptPromise;
}
async function getGoogleAccessToken() {
  if (!GOOGLE_OAUTH_CLIENT_ID) {
    throw new Error("Google OAuth Client ID missing. Set VITE_GOOGLE_OAUTH_CLIENT_ID.");
  }
  await loadGsiScript();
  return new Promise((resolve, reject) => {
    try {
      const tokenClient = window.google.accounts.oauth2.initTokenClient({
        client_id: GOOGLE_OAUTH_CLIENT_ID,
        scope: GOOGLE_SCOPES,
        prompt: "",
        callback: (response) => {
          if (response?.access_token) resolve(response.access_token);
          else reject(new Error("Failed to obtain Google access token"));
        },
        error_callback: (err) => reject(err instanceof Error ? err : new Error(err?.message || "Google OAuth failed")),
      });
      tokenClient.requestAccessToken();
    } catch (e) {
      reject(e);
    }
  });
}

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
  const [generateGoogleDoc, setGenerateGoogleDoc] = useState(false);
  const [generateSimulation, setGenerateSimulation] = useState(false);

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

  //Intro & Conclusions states
  const [intro, setIntro] = useState("");
  const [conclusion, setConclusion] = useState("");

  // --- helpers ---
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
          setCaseDetails({
            caseNumber: fb.caseNumber,
            caseTitle: fb.caseTitle,
            dateOfIncident: formatDateForDisplay(fb.dateOfIncident),
            region: fb.region,
            between: fb.between || "Not specified",
          });
          setLocations(fb.locations || []);
          setLocationTitles(fb.locationTitles || Array((fb.locations || []).length).fill(""));
          setReportIntro(fb.reportIntro || "");
          setEvidenceItems(fb.evidenceItems || []);
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
    setCaseDetails({
      caseNumber: caseData.caseNumber,
      caseTitle: caseData.caseTitle,
      dateOfIncident: formatDateForDisplay(caseData.dateOfIncident),
      region: caseData.region,
      between: caseData.between || "Not specified",
    });
    setLocations(caseData.locations);
    setSelectedLocations(caseData.selectedForReport || []);
    setReportIntro(caseData.reportIntro || "");
    setEvidenceItems(caseData.evidenceItems || []);
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
        ...extraCopy,
        technicalTerms: termsForSave,
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
        evidenceItems,
        ...extraCopy,
        technicalTerms: termsForUpdate,
      };
      await updateCaseAnnotations(currentCaseId, updateData);
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
    pdf.text(`Case: ${caseDetails.caseNumber} – ${displayBetween}`, pdfWidth / 2, pdfHeight / 2, { align: "center" });
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

    // --- 2. EVIDENCE ---
    if (evidenceItems.length > 0) {
      pdf.setFontSize(16);
      pdf.text("2. EVIDENCE", margin, margin);
      pdf.setFontSize(11);
      evidenceItems.forEach((ev, idx) => {
        pdf.text(`2.${idx + 1} ${ev}`, margin, margin + 10 + idx * 8);
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
        if (!formatted) {
          return;
        }
        pdf.text(`3.${idx + 1} ${formatted}`, margin, margin + 10 + idx * 8);
      });
      pdf.addPage();
    }

    // --- 4. TRIPS – DATE ---
    const filtered = locations.filter((_, i) => selectedLocations.includes(i));
    if (filtered.length > 0) {
      pdf.setFontSize(16);
      pdf.text(`4. TRIPS – ${caseDetails.dateOfIncident}`, margin, margin);
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
    const filteredSnapshots = (snapshots || []).filter((s) => s && typeof s.index === "number" && selectedSnapshotSet.has(s.index));
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

// --- DOCX (with normalization) ---
const generateDOCX = async () => {
  const payload = buildReportPayload();
  const docChildren = [];
  const normalizedTerms = normalizeTechnicalTermList(payload.technicalTerms || technicalTerms);
  const displayBetween = payload.between || "Not specified";

  // --- COVER PAGE ---
  docChildren.push(makeHeading("DIGITAL FORENSIC REPORT", HeadingLevel.TITLE));
  // Use BETWEEN instead of case title
  docChildren.push(makeText(`Case: ${payload.caseNumber} – ${displayBetween}`));
  docChildren.push(makeText(`Investigator: ${profile?.firstName || ""} ${profile?.surname || ""}`));
  docChildren.push(makeText(`Date of Incident: ${payload.dateOfIncident}`));
  docChildren.push(new Paragraph({ pageBreakBefore: true }));

  // --- 1. INTRODUCTION ---
  if ((payload.intro || "").trim()) {
    docChildren.push(makeHeading("1. INTRODUCTION", HeadingLevel.HEADING_1));
    docChildren.push(makeText(payload.intro));
  }

  // --- 2. EVIDENCE ---
  if (evidenceItems.length > 0) {
    docChildren.push(makeHeading("2. EVIDENCE", HeadingLevel.HEADING_1));
    evidenceItems.forEach((ev, idx) => {
      docChildren.push(new Paragraph({ text: `2.${idx + 1} ${ev}` }));
    });
  }

  // --- 3. TECHNICAL TERMS ---
  if (normalizedTerms.length > 0) {
    docChildren.push(makeHeading("3. TECHNICAL TERMS", HeadingLevel.HEADING_1));
    normalizedTerms.forEach((term, idx) => {
      const formatted = formatTechnicalTerm(term);
      if (!formatted) {
        return;
      }
      docChildren.push(new Paragraph({ text: `3.${idx + 1} ${formatted}` }));
    });
  }

  // --- 4. TRIPS – DATE ---
  const snapByIdx = new Map((payload.snapshots || []).map((s) => [s.index, s]));
  const selected = payload.selectedIndices.map((i) => payload.locations[i]).filter(Boolean);

  if (selected.length > 0) {
    docChildren.push(makeHeading(`4. TRIPS – ${payload.dateOfIncident}`, HeadingLevel.HEADING_1));
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


  // --- Google Doc (optional) ---
  const generateGoogleDocOnServer = async () => {
    const payload = buildReportPayload();
    const accessToken = await getGoogleAccessToken();
    const res = await fetch(REPORTS_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}` },
      body: JSON.stringify(payload),
    });
    const bodyText = await res.text();
    let maybeJson = null;
    try {
      maybeJson = JSON.parse(bodyText);
    } catch {}
    if (!res.ok) {
      const detail = (maybeJson && (maybeJson.detail || maybeJson.message)) || bodyText || "Unknown error";
      throw new Error(detail);
    }
    return maybeJson || {};
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

      // Google Doc (optional)
      if (generateGoogleDoc) {
        try {
          const data = await generateGoogleDocOnServer();
          const name = `${data.title || "Report"}${base}.gdoc`;
          newLocal.push({
            id: Date.now() + 100,
            type: "report",
            name,
            date: new Date().toISOString(),
            googleDoc: true,
            documentId: data.documentId,
            webViewLink: data.webViewLink,
          });
          if (currentCaseId) {
            try {
              await createReportDocument(
                currentCaseId,
                {
                  reportType: "google-doc",
                  fileName: name,
                  documentId: data.documentId,
                  webViewLink: data.webViewLink,
                  introduction: reportIntro,
                  conclusion: reportConclusion,
                },
                getCurrentUserId()
              );
              const updated = await getCaseReports(currentCaseId);
              setFirebaseReports(updated || []);
            } catch (e) {
              console.warn("Failed to save Google Doc metadata to Firebase:", e);
            }
          }
        } catch (err) {
          console.error("Google Doc generation failed:", err);
          showError("Google Doc generation failed", err, "We couldn't create the Google Doc. Please try again.");
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
    const res = await axios.post(`${API_BASE}/cases/${currentCaseId}/ai-intro`, {
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
    const res = await axios.post(`${API_BASE}/cases/${currentCaseId}/ai-conclusion`);
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
      <div className="flex items-center justify-between px-6 py-4 bg-gradient-to-r from-black to-gray-900 shadow-md">
        <div className="flex items-center space-x-4">
          <div className="text-3xl cursor-pointer" onClick={() => setShowMenu(!showMenu)}>
            &#9776;
          </div>
          <Link to="/home">
            <img src={adflogo} alt="Logo" className="h-12 cursor-pointer hover:opacity-80 transition" />
          </Link>
        </div>

        <h1 className="text-xl font-bold text-white">Overview</h1>

        <div className="flex items-center space-x-4">
          <div className="max-w-sm">
            <FirebaseStatus />
          </div>
          <div className="text-sm">
            {isSaving && <span className="text-yellow-400">Saving...</span>}
            {saveError && <span className="text-red-400">{saveError}</span>}
            {lastSaved && !isSaving && !saveError && <span className="text-green-400">Saved {lastSaved}</span>}
            {currentCaseId && !isSaving && !saveError && <span className="text-xs text-gray-400 block">Cloud sync enabled</span>}
          </div>
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
            to="/annotations"
            className="flex items-center gap-3 px-3 py-2 rounded-2xl text-sm font-medium text-gray-200 hover:text-white hover:bg-white/10 transition"
            onClick={() => setShowMenu(false)}
          >
            <MapPin className="w-4 h-4" />
            Annotations
          </Link>
          <Link
            to="/my-cases"
            className="flex items-center gap-3 px-3 py-2 rounded-2xl text-sm font-medium text-gray-200 hover:text-white hover:bg-white/10 transition"
            onClick={() => setShowMenu(false)}
          >
            <Briefcase className="w-4 h-4" />
            My Cases
          </Link>
          <div className="flex items-center gap-3 px-3 py-2 rounded-2xl text-sm font-medium text-white bg-white/10">
            <FileText className="w-4 h-4" />
            Overview
          </div>
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

      {/* Tabs */}
      <div className="flex justify-center space-x-8 bg-gradient-to-r from-black to-gray-900 bg-opacity-80 backdrop-blur-md py-2 text-white text-sm">
        <Link to="/new-case" className="text-gray-300 hover:text-white">
          Case Information
        </Link>
        <Link to="/annotations" className="text-gray-300 hover:text-white">
          Annotations
        </Link>
        <span className="inline-flex items-center rounded-full bg-white/15 px-4 py-1.5 font-semibold text-white">
          Overview
        </span>
      </div>

      {/* Case bar */}
      <div className="bg-gradient-to-r from-black to-gray-900 bg-opacity-80 backdrop-blur-md border-b border-white/10 py-3 px-6">
        <div className="flex flex-wrap justify-between text-sm text-gray-200">
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

      {/* Hidden PDF container */}
      <div className="hidden">
        <div ref={reportRef} id="report-template" className="bg-white text-black p-8 max-w-[800px]" />
      </div>

      {/* Content */}
      <div className="max-w-6xl mx-auto px-6 py-8 space-y-8">
        {/* Selected Locations */}
        <div className="bg-gray-800 p-4 rounded-lg shadow">
          <h2 className="text-lg font-semibold mb-3">Selected Locations</h2>
          <div className="space-y-2 max-h-64 overflow-y-auto">
            {locations.map((location, index) => (
              <div key={index} className="flex items-center justify-between p-3 rounded bg-gray-700">
                <div className="flex items-center space-x-2">
                  <input
                    type="checkbox"
                    id={`location-${index}`}
                    checked={selectedLocations.includes(index)}
                    onChange={() => toggleLocationSelection(index)}
                    className="form-checkbox h-5 w-5 text-blue-600 rounded border-gray-600 bg-gray-700 focus:ring-blue-500"
                  />
                  <label htmlFor={`location-${index}`} className="flex items-center cursor-pointer">
                    <MapPin className="h-4 w-4 text-blue-400 mr-2" />
                    <div className="flex flex-col">
                      <span>{locationTitles[index] || location.title || getLocationAddress(location)}</span>
                      {snapshots.find((s) => s && (s.index === index) && (s.mapImage || s.streetViewImage)) && (
                        <span className="text-xs text-green-400">✓ Snapshot image available</span>
                      )}
                    </div>
                  </label>
                </div>

                <div className="flex items-center space-x-2">
                  <input
                    type="text"
                    value={locationTitles[index] || ""}
                    onChange={(e) => handleLocationTitleChange(index, e.target.value)}
                    placeholder="Add title..."
                    className="text-sm bg-gray-800 border border-gray-600 rounded px-2 py-1 w-48"
                  />
                  <Link
                    to="/annotations"
                    className="text-xs text-blue-400 hover:underline"
                    onClick={() => {
                      localStorage.setItem("trackxCurrentLocationIndex", index);
                      saveToLocalStorage();
                    }}
                  >
                    Edit
                  </Link>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Report Intro */}
        <div className="bg-gray-800 p-4 rounded-lg shadow">
          <h2 className="text-lg font-semibold mb-3">Report Introduction</h2>
          <textarea
            placeholder="Enter report introduction..."
            value={reportIntro}
            onChange={(e) => setReportIntro(e.target.value)}
            onBlur={() => saveToLocalStorage()}
            className="w-full h-32 p-3 rounded bg-gray-900 text-white border border-gray-700 resize-none focus:border-blue-500 focus:ring focus:ring-blue-500 focus:ring-opacity-50"
          />
            <button
    onClick={handleGenerateIntro}
    disabled={loadingIntro}
    className="mt-3 px-4 py-2 bg-purple-600 hover:bg-purple-700 rounded text-white text-sm"
  >
    {loadingIntro ? "Generating..." : "Generate AI Intro"}
  </button>
        </div>

        {/* Report Evidence */}
        <div className="bg-gray-800 p-4 rounded-lg shadow">
          <h2 className="text-lg font-semibold mb-3">Evidence</h2>
          {evidenceItems.map((item, idx) => (
            <div key={idx} className="flex items-center mb-2">
              <span className="mr-2 text-gray-400">2.{idx + 1}</span>
              <input
                type="text"
                value={item}
                onChange={(e) => {
                  const newItems = [...evidenceItems];
                  newItems[idx] = e.target.value;
                  setEvidenceItems(newItems);
                  saveToLocalStorage();
                }}
                className="flex-grow bg-gray-900 border border-gray-700 rounded px-2 py-1 text-white"
              />
            </div>
          ))}
          <button
            onClick={() => setEvidenceItems([...evidenceItems, ""])}
            className="mt-2 px-3 py-1 bg-blue-600 hover:bg-blue-700 rounded text-white text-sm"
          >
            + Add Evidence
          </button>
        </div>

        <TechnicalTermsSelector
          value={technicalTerms}
          onChange={(items) => {
            const next = normalizeTechnicalTermList(items);
            setTechnicalTerms(next);
            saveToLocalStorage({ technicalTerms: next });
          }}
          disabled={isSaving}
        />


        {/* Report Conclusion */}
        <div className="bg-gray-800 p-4 rounded-lg shadow">
          <h2 className="text-lg font-semibold mb-3">Report Conclusion</h2>
          <textarea
            placeholder="Enter report conclusion..."
            value={reportConclusion}
            onChange={(e) => setReportConclusion(e.target.value)}
            onBlur={() => saveToLocalStorage()}
            className="w-full h-32 p-3 rounded bg-gray-900 text-white border border-gray-700 resize-none focus:border-blue-500 focus:ring focus:ring-blue-500 focus:ring-opacity-50"
          />
            <button
    onClick={handleGenerateConclusion}
    disabled={loadingConclusion}
    className="mt-3 px-4 py-2 bg-purple-600 hover:bg-purple-700 rounded text-white text-sm"
  >
    {loadingConclusion ? "Generating..." : "Generate AI Conclusion"}
  </button>
        </div>

        {/* Save bar */}
        <div className="bg-gray-800 p-4 rounded-lg shadow">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-lg font-semibold">Save Progress</h3>
              <p className="text-sm text-gray-400">
                Your work is automatically saved every 2 seconds.
                {currentCaseId ? (
                  <span className="text-green-400 ml-2">✓ Connected to Firebase (ID: {String(currentCaseId).slice(-8)})</span>
                ) : (
                  <span className="text-yellow-400 ml-2">⚠ Using local storage only</span>
                )}
              </p>
            </div>
            <button
              onClick={() => saveData()}
              disabled={isSaving}
              className="bg-green-600 hover:bg-green-700 disabled:bg-gray-600 text-white py-2 px-4 rounded font-medium transition-colors"
            >
              {isSaving ? "Saving..." : "Save Now"}
            </button>
          </div>
        </div>

        {/* Generate */}
        <div className="bg-gray-800 p-4 rounded-lg shadow">
          <div className="flex flex-wrap items-center justify-between">
            <div className="space-x-6 mb-4 md:mb-0">
              <label className="inline-flex items-center">
                <input
                  type="checkbox"
                  checked={generateReport}
                  onChange={() => setGenerateReport(!generateReport)}
                  className="form-checkbox h-5 w-5 text-blue-600 rounded border-gray-600 bg-gray-700 focus:ring-blue-500"
                />
                <span className="ml-2">Generate PDF</span>
              </label>
              <label className="inline-flex items-center">
                <input
                  type="checkbox"
                  checked={generateDocx}
                  onChange={() => setGenerateDocx(!generateDocx)}
                  className="form-checkbox h-5 w-5 text-indigo-500 rounded border-gray-600 bg-gray-700 focus:ring-indigo-500"
                />
                <span className="ml-2">Generate DOCX</span>
              </label>
              <label className="inline-flex items-center">
                <input
                  type="checkbox"
                  checked={generateGoogleDoc}
                  onChange={() => setGenerateGoogleDoc(!generateGoogleDoc)}
                  className="form-checkbox h-5 w-5 text-amber-500 rounded border-gray-600 bg-gray-700 focus:ring-amber-500"
                />
                <span className="ml-2">Generate Google Doc</span>
              </label>
              <label className="inline-flex items-center">
                <input
                  type="checkbox"
                  checked={generateSimulation}
                  onChange={() => setGenerateSimulation(!generateSimulation)}
                  className="form-checkbox h-5 w-5 text-green-600 rounded border-gray-600 bg-gray-700 focus:ring-green-500"
                />
                <span className="ml-2">Generate Simulation</span>
              </label>
            </div>
            <button
              className={`bg-blue-700 hover:bg-blue-800 text-white px-6 py-2 rounded shadow transition ${
                (!generateReport && !generateDocx && !generateGoogleDoc && !generateSimulation) ||
                isGenerating ||
                selectedLocations.length === 0
                  ? "opacity-50 cursor-not-allowed"
                  : ""
              }`}
              onClick={handleGenerate}
              disabled={
                (!generateReport && !generateDocx && !generateGoogleDoc && !generateSimulation) ||
                isGenerating ||
                selectedLocations.length === 0
              }
              title={selectedLocations.length === 0 ? "Select at least one location" : ""}
            >
              {isGenerating ? (
                <div className="flex items-center">
                  <div className="animate-spin rounded-full h-4 w-4 border-t-2 border-b-2 border-white mr-2"></div>
                  Generating...
                </div>
              ) : (
                "Generate"
              )}
            </button>
          </div>
        </div>

        {/* Reports list (Firebase + local) */}
        {allReports.length > 0 && (
          <div className="bg-gray-800 p-4 rounded-lg shadow">
            <h3 className="text-lg font-semibold mb-3">Generated Reports</h3>
            <div className="space-y-2">
              {allReports.map((report) => (
                <div key={report.id} className="flex items-center justify-between bg-gray-700 p-4 rounded">
                  <div className="flex items-center">
                    {report.type === "firebase-report" ? (
                      <FileText className="h-5 w-5 text-green-400 mr-3" />
                    ) : report.type === "report" ? (
                      <FileText className="h-5 w-5 text-blue-400 mr-3" />
                    ) : (
                      <div className="h-5 w-5 text-green-400 mr-3">🎬</div>
                    )}
                    <div>
                      <p className="font-medium">{report.name}</p>
                      <p className="text-xs text-gray-400">
                        {new Date(report.date).toLocaleString()}
                        {report.type === "firebase-report" && <span className="ml-2 text-green-400">• Saved to Firebase</span>}
                      </p>
                    </div>
                  </div>
                  <button
                    className="bg-green-600 hover:bg-green-700 text-white px-4 py-1 rounded transition"
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
        <div className="bg-gray-800 p-4 rounded-lg shadow">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-lg font-semibold">Snapshot Status</h2>
            <button
              onClick={hydrateSnapshots}
              className="text-xs px-2 py-1 bg-gray-700 hover:bg-gray-600 rounded"
              title="Re-check session/local/Firebase for snapshots"
            >
              Reload snapshots
            </button>
          </div>
          <div className="bg-gray-700 p-4 rounded">
            {snapshotsAvailable ? (
              <div className="flex items-center text-green-400">
                <Camera size={18} className="mr-2" />
                <p>
                  Snapshot images available ({snapshots.filter((s) => s && (s.mapImage || s.streetViewImage)).length} of{" "}
                  {locations.length} locations)
                </p>
              </div>
            ) : (
              <div className="flex items-center text-yellow-400">
                <Camera size={18} className="mr-2" />
                <p>No snapshot images available. Please go to the Annotations page to capture them.</p>
              </div>
            )}
            <div className="mt-4">
              <Link to="/annotations" className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded inline-flex items-center">
                <Camera size={16} className="mr-2" />
                {snapshotsAvailable ? "Edit Snapshots" : "Capture Snapshots"}
              </Link>
            </div>
          </div>
        </div>

        {/* Case Summary */}
        <div className="bg-gray-800 p-4 rounded-lg shadow">
          <h2 className="text-lg font-semibold mb-3">Case Summary</h2>
          <div className="bg-gray-700 p-4 rounded">
            <p>
              <span className="font-medium">Case Number:</span> {caseDetails.caseNumber}
            </p>
            <p>
              <span className="font-medium">Title:</span> {caseDetails.caseTitle}
            </p>
            <p>
              <span className="font-medium">Date of Incident:</span> {caseDetails.dateOfIncident}
            </p>
            <p>
              <span className="font-medium">Region:</span> {caseDetails.region}
            </p>
            <p>
              <span className="font-medium">Between:</span> {caseDetails.between}
            </p>
            <p className="mt-2">
              <span className="font-medium">Locations:</span> {locations.length} total, {selectedLocations.length} selected for report
            </p>
            <p>
              <span className="font-medium">Reports:</span> {allReports.length} generated ({firebaseReports.length} in Firebase,{" "}
              {generatedReports.length} local)
            </p>
          </div>
        </div>
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

export default OverviewPage;
