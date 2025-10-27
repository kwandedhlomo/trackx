import React, { useState, useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { Upload, Info, CheckCircle, AlertCircle, FileText, Home, FilePlus2, FolderOpen, Briefcase, LayoutDashboard, UserPlus, X, Shield, AlertTriangle, Search, Link2 } from "lucide-react";
import Papa from "papaparse";
import adflogo from "../assets/image-removebg-preview.png";
import axios from "axios";
import { auth } from "../firebase";
import { signOut } from "firebase/auth";
import { useAuth } from "../context/AuthContext";
import { db } from "../firebase";
import { doc, collection, writeBatch, serverTimestamp } from "firebase/firestore";
import { clearCaseSession } from "../utils/caseSession";
import NotificationModal from "../components/NotificationModal";
import useNotificationModal from "../hooks/useNotificationModal";
import { getFriendlyErrorMessage } from "../utils/errorMessages";
import TechnicalTermsSelector from "../components/TechnicalTermsSelector";
import { normalizeTechnicalTermList } from "../utils/technicalTerms";
import EvidenceLocker from "../components/EvidenceLocker";
// Firebase services
import { updateCaseAnnotations, getCurrentUserId, loadAllEvidence, searchEvidence, batchSaveEvidence } from "../services/firebaseServices";
import RegionSelectorModal from "../components/RegionSelectorModal";



// ADD: Security config and scanner (lightweight content/mimetype checks; client-side only)
let pdfjsLib = null;

const SECURITY_CONFIG = {
  maxFileSize: 10 * 1024 * 1024, // 10MB
  allowedMimeTypes: [
    "text/csv",
    "text/plain",
    "application/vnd.ms-excel",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "application/pdf",
  ],
  allowedExtensions: [".csv", ".xls", ".xlsx", ".pdf"],
  maliciousPatterns: [
    /<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi,
    /javascript:/gi,
    /vbscript:/gi,
    /onload\s*=/gi,
    /onerror\s*=/gi,
    /eval\s*\(/gi,
    /document\.write/gi,
    /innerHTML/gi,
    /<\?php/gi,
    /<%/gi,
    /<asp:/gi,
    /cmd\.exe/gi,
    /powershell/gi,
    /system\(/gi,
    /exec\(/gi,
  ],
};

class FileSecurityScanner {
  constructor() {
    this.config = SECURITY_CONFIG;
  }
  async scanFile(file) {
    const results = { safe: true, threats: [], warnings: [], fileHash: null, scanResults: {} };
    try {
      if (file.size > this.config.maxFileSize) {
        results.safe = false;
        results.threats.push(`File size exceeds limit (${(file.size / 1024 / 1024).toFixed(1)}MB > 10MB)`);
      }
      const ext = file.name.toLowerCase().slice(file.name.lastIndexOf("."));
      if (!this.config.allowedExtensions.includes(ext)) {
        results.safe = false;
        results.threats.push(`File extension '${ext}' is not allowed`);
      }
      if (!this.config.allowedMimeTypes.includes(file.type)) {
        results.warnings.push(`MIME type '${file.type}' may not be supported`);
      }
      results.fileHash = await this.generateFileHash(file);

      if (ext === ".pdf") {
        const pdfScan = await this.scanPDFStructureRelaxed(file);
        results.scanResults.pdfScan = pdfScan;
        if (!pdfScan.safe) {
          results.safe = false;
          results.threats.push(...pdfScan.threats);
        }
        if (pdfScan.warnings && pdfScan.warnings.length > 0) {
          results.warnings.push(...pdfScan.warnings);
        }
      } else {
        const contentScan = await this.scanFileContent(file);
        results.scanResults.contentScan = contentScan;
        if (!contentScan.safe) {
          results.safe = false;
          results.threats.push(...contentScan.threats);
        }
      }
      results.riskLevel = !results.safe ? "HIGH" : results.warnings.length ? "MEDIUM" : "LOW";
    } catch (e) {
      console.warn("Security scan encountered an error:", e);
      results.warnings.push(`Security scan encountered an error: ${e.message}`);
      results.riskLevel = "MEDIUM";
    }
    return results;
  }
  async generateFileHash(file) {
    try {
      const buffer = await file.arrayBuffer();
      const hashBuffer = await crypto.subtle.digest("SHA-256", buffer);
      const hashArray = Array.from(new Uint8Array(hashBuffer));
      return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
    } catch {
      return null;
    }
  }
  async scanFileContent(file) {
    const res = { safe: true, threats: [], patternsFound: [] };
    try {
      const txt = await new Promise((resolve, reject) => {
        const r = new FileReader();
        r.onload = () => resolve(r.result);
        r.onerror = () => reject(r.error);
        r.readAsText(file.slice(0, 50000));
      });
      if (file.type.startsWith("text/") && txt.includes("\x00")) {
        res.safe = false;
        res.threats.push("File contains binary data but has a text MIME type");
      }
      for (const p of this.config.maliciousPatterns) {
        if (p.test(txt)) {
          res.safe = false;
          const pat = p.toString().slice(1, -3);
          res.threats.push(`Potentially malicious pattern detected: ${pat}`);
          res.patternsFound.push(pat);
        }
      }
      if (txt.includes("MZ") || txt.includes("PK")) {
        res.safe = false;
        res.threats.push("File may contain embedded executable/archive content");
      }
      if (/\\x[0-9a-fA-F]{2}|\\u[0-9a-fA-F]{4}|%[0-9a-fA-F]{2}/g.test(txt)) {
        res.safe = false;
        res.threats.push("File contains suspicious encoded content");
      }
    } catch {}
    return res;
  }
  async scanPDFStructureRelaxed(file) {
    const res = { safe: true, threats: [], warnings: [] };
    try {
      const buf = await file.arrayBuffer();
      const text = new TextDecoder().decode(buf);
      if (!text.startsWith("%PDF-")) {
        res.safe = false;
        res.threats.push("Invalid PDF header (file may be corrupted)");
        return res;
      }

      if (text.includes("/JavaScript") || text.includes("/JS")) {
        res.warnings.push("PDF contains JavaScript (common in interactive forms)");
      }

      for (const feature of ["/Launch", "/Movie", "/Sound"]) {
        if (text.includes(feature)) {
          res.safe = false;
          res.threats.push(`PDF contains potentially dangerous feature: ${feature}`);
        }
      }

      if (text.includes("/Encrypt")) {
        res.warnings.push("PDF is encrypted (may require password to open or process)");
      }

      if (text.includes("/EmbeddedFile")) {
        res.warnings.push("PDF contains embedded files");
      }
    } catch (error) {
      console.warn("PDF structure scan error:", error);
      res.warnings.push("Unable to fully scan PDF structure");
    }
    return res;
  }
  async scanPDFStructure(file) {
    return this.scanPDFStructureRelaxed(file);
  }
}

// Dynamic PDF.js loader
const initPDFJS = async () => {
  if (!pdfjsLib) {
    const workerSrc = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/2.16.105/pdf.worker.min.js";
    const script = document.createElement("script");
    script.src = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/2.16.105/pdf.min.js";
    document.head.appendChild(script);
    await new Promise((resolve) => {
      const tick = () => {
        if (window.pdfjsLib) {
          pdfjsLib = window.pdfjsLib;
          pdfjsLib.GlobalWorkerOptions.workerSrc = workerSrc;
          resolve();
        } else setTimeout(tick, 80);
      };
      tick();
    });
  }
  return pdfjsLib;
};


function NewCasePage() {
  const navigate = useNavigate();
  const { profile } = useAuth();

  // Form state
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
  const [urgency, setUrgency] = useState("");
  const [selectedTechnicalTerms, setSelectedTechnicalTerms] = useState([]);

  // File processing state
  const [file, setFile] = useState(null);
  const [parsedData, setParsedData] = useState(null);
  const [isDragging, setIsDragging] = useState(false);
  const [parseError, setParseError] = useState(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [csvStats, setCsvStats] = useState(null);
  const [showGuide, setShowGuide] = useState(false);
  const [fileType, setFileType] = useState(null);
  const [showMenu, setShowMenu] = useState(false);
  const { modalState, openModal, closeModal } = useNotificationModal();
  const [assignedUsers, setAssignedUsers] = useState([]);
  const [userSearchTerm, setUserSearchTerm] = useState("");
  const [userSearchResults, setUserSearchResults] = useState([]);
  const [isSearchingUsers, setIsSearchingUsers] = useState(false);
  const [isScanning, setIsScanning] = useState(false);
  const [securityResults, setSecurityResults] = useState(null);
  const [showSecurityDetails, setShowSecurityDetails] = useState(false);
  const [evidenceItems, setEvidenceItems] = useState([]);
  const [showEvidenceSearch, setShowEvidenceSearch] = useState(false);
  const [evidenceSearchTerm, setEvidenceSearchTerm] = useState("");
  const [evidenceSearchResults, setEvidenceSearchResults] = useState([]);
  const [isSearchingEvidence, setIsSearchingEvidence] = useState(false);
  const API_BASE = (import.meta.env.VITE_API_URL || "http://localhost:8000").replace(/\/+$/, "");
  const formattedDateTime = new Date().toLocaleString();
  const canProceed = Boolean(
    parsedData && parsedData.stoppedPoints && parsedData.stoppedPoints.length > 0 && !isProcessing
  );

  useEffect(() => {
    const current = auth.currentUser;
    if (!current) return;
    setAssignedUsers((prev) => {
      if (prev.some((u) => u.id === current.uid)) {
        return prev;
      }
      const displayName = profile
        ? `${profile.firstName || ""} ${profile.surname || ""}`.trim() || current.email || "Current user"
        : current.email || "Current user";
      return [
        ...prev,
        {
          id: current.uid,
          name: displayName,
          email: current.email || "",
        },
      ];
    });
  }, [profile]);

  const currentUserId = auth.currentUser?.uid;

  const handleUserSearch = async () => {
    const term = userSearchTerm.trim();
    if (term.length < 2) {
      openModal({
        variant: "info",
        title: "Keep typing",
        description: "Enter at least two characters to search for users.",
      });
      return;
    }

    setIsSearchingUsers(true);
    try {
      const { data } = await axios.get(`${API_BASE}/admin/users`, {
        params: {
          search: term,
          page_size: 10,
        },
      });
      const results = data?.users || [];
      const assignedIds = new Set(assignedUsers.map((u) => u.id));
      setUserSearchResults(results.filter((user) => user.id && !assignedIds.has(user.id)));
    } catch (error) {
      console.error("User search failed:", error);
      openModal({
        variant: "error",
        title: "Search failed",
        description: getFriendlyErrorMessage(error, "We couldn't search for users right now. Please try again."),
      });
    } finally {
      setIsSearchingUsers(false);
    }
  };

  const handleAddUserToCase = (user) => {
    if (!user?.id) return;
    setAssignedUsers((prev) => {
      if (prev.some((u) => u.id === user.id)) {
        return prev;
      }
      return [...prev, user];
    });
    setUserSearchResults((prev) => prev.filter((u) => u.id !== user.id));
  };

  const handleRemoveAssignedUser = (userId) => {
    if (userId === currentUserId) {
      openModal({
        variant: "warning",
        title: "Cannot remove",
        description: "You cannot remove yourself from the case you are creating.",
      });
      return;
    }

    setAssignedUsers((prev) => prev.filter((user) => user.id !== userId));
  };

  // ============================================
  // Evidence search and link helpers
  // ============================================

  const handleEvidenceSearch = async () => {
    const term = evidenceSearchTerm.trim();
    if (term.length < 2) {
      openModal({
        variant: "info",
        title: "Keep typing",
        description: "Enter at least two characters to search for evidence.",
      });
      return;
    }

    setIsSearchingEvidence(true);
    try {
      const results = await searchEvidence(term);
      setEvidenceSearchResults(results);

      if (results.length === 0) {
        openModal({
          variant: "info",
          title: "No results",
          description: `No evidence found matching "${term}". Try different keywords or search by case number.`,
        });
      }
    } catch (error) {
      console.error("Evidence search failed:", error);
      openModal({
        variant: "error",
        title: "Search failed",
        description: getFriendlyErrorMessage(
          error,
          "We couldn't search for evidence right now. Please try again."
        ),
      });
    } finally {
      setIsSearchingEvidence(false);
    }
  };

  const linkExistingEvidence = (evidence) => {
    if (evidenceItems.some((item) => item.id === evidence.id)) {
      openModal({
        variant: "info",
        title: "Already Added",
        description: "This evidence item is already in your evidence locker for this case.",
      });
      return;
    }

    const linkedEvidence = {
      ...evidence,
      caseNumber: caseNumber || evidence.caseNumber,
    };

    setEvidenceItems((prev) => [...prev, linkedEvidence]);

    openModal({
      variant: "success",
      title: "Evidence Linked",
      description: `Evidence item "${evidence.id}" has been successfully added to this case.`,
    });

    setEvidenceSearchResults((prev) => prev.filter((result) => result.id !== evidence.id));
  };

  const handleLoadAllEvidence = async () => {
    setIsSearchingEvidence(true);
    try {
      const items = await loadAllEvidence(50);
      setEvidenceSearchResults(items);
      setShowEvidenceSearch(true);
    } catch (error) {
      console.error("Failed to load evidence:", error);
      openModal({
        variant: "error",
        title: "Load failed",
        description: "Could not load existing evidence. Please try again.",
      });
    } finally {
      setIsSearchingEvidence(false);
    }
  };


  useEffect(() => {
    clearCaseSession();   // ✅ guarantees a clean slate when user lands on /new-case
  }, []);
  

    // minimal mirror writer (no cross-deps on firebaseServices.js)
  async function upsertFirebaseMirror(caseId, mirror) {
    const caseRef = doc(db, "cases", caseId);
    const batch = writeBatch(db);
    batch.set(caseRef, {
      caseId,
      caseNumber: mirror.caseNumber,
      caseTitle: mirror.caseTitle,
      dateOfIncident: mirror.dateOfIncident ? new Date(mirror.dateOfIncident) : new Date(),
      region: mirror.region,
      between: mirror.between || "",
      urgency: mirror.urgency || "Medium",
      userId: mirror.userId || null,
      userIds: mirror.userIds || (mirror.userId ? [mirror.userId] : []),
      locationTitles: mirror.locationTitles || [],
      reportIntro: mirror.reportIntro || "",
      reportConclusion: mirror.reportConclusion || "",
      selectedForReport: mirror.selectedForReport || [],
      technicalTerms: mirror.technicalTerms || [],
      // keep legacy mirrors so old readers don't break; safe to remove after migration
      title: mirror.caseTitle,
      date: mirror.dateOfIncident ? new Date(mirror.dateOfIncident) : new Date(),
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    }, { merge: true });

    // also fan-out locations into a subcollection the Annotations page can read
    const locs = mirror.locations || [];
    locs.forEach((loc, idx) => {
      const locRef = doc(collection(db, "cases", caseId, "locations"), `location_${idx}`);
      batch.set(locRef, {
        locationId: `location_${idx}`,
        // store raw numbers to avoid GeoPoint coupling (Annotations code reads lat/lng directly)
        lat: Number(loc.lat),
        lng: Number(loc.lng),
        order: idx,
        // user-editable fields start blank
        title: mirror.locationTitles?.[idx] || "",
        description: "",
        // metadata the UI shows
        timestamp: loc.timestamp || null,
        ignitionStatus: loc.ignitionStatus || "Unknown",
        address: loc.address || null,
        // keep original for "View original data"
        originalData: {
          csvDescription: loc.description || null,
          rawData: loc.rawData || null,
        },
        mapSnapshotUrl: null,
        streetViewSnapshotUrl: null,
        snapshotUrl: null,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      }, { merge: true });
    });

    await batch.commit();
  }

  /**
   * Timestamp normalization helpers: coerce various time/date fragments into ISO strings.
   */
  const EXCEL_EPOCH_UTC = Date.UTC(1899, 11, 30);

  const toISOIfValid = (dateObj) => {
    if (!(dateObj instanceof Date)) return null;
    return Number.isNaN(dateObj.getTime()) ? null : dateObj.toISOString();
  };

  const buildISOFromParts = (year, month, day, hours = 0, minutes = 0, seconds = 0, milliseconds = 0) => {
    if (![year, month, day].every((part) => Number.isFinite(part))) return null;
    const date = new Date(Date.UTC(year, month - 1, day, hours, minutes, seconds, milliseconds));
    return toISOIfValid(date);
  };

  const parseTimeComponents = (value) => {
    if (value === null || value === undefined) return null;
    const str = String(value).trim();
    if (!str) return null;

    const timePattern = /^(\d{1,2}):(\d{2})(?::(\d{2}))?(?:\.(\d+))?(?:\s*(AM|PM))?$/i;
    const colonMatch = str.match(timePattern);
    if (colonMatch) {
      let hours = parseInt(colonMatch[1], 10);
      const minutes = parseInt(colonMatch[2], 10);
      const seconds = colonMatch[3] ? parseInt(colonMatch[3], 10) : 0;
      const millis = colonMatch[4] ? parseInt(colonMatch[4].slice(0, 3).padEnd(3, "0"), 10) : 0;
      const period = colonMatch[5] ? colonMatch[5].toUpperCase() : null;

      if (Number.isNaN(hours) || minutes > 59 || seconds > 59) return null;

      if (period === "PM" && hours < 12) hours += 12;
      if (period === "AM" && hours === 12) hours = 0;

      if (hours > 23) return null;

      return { hours, minutes, seconds, millis };
    }

    const compactMatch = str.match(/^(\d{2})(\d{2})(\d{2})$/);
    if (compactMatch) {
      const hours = parseInt(compactMatch[1], 10);
      const minutes = parseInt(compactMatch[2], 10);
      const seconds = parseInt(compactMatch[3], 10);
      if (hours > 23 || minutes > 59 || seconds > 59) return null;
      return { hours, minutes, seconds, millis: 0 };
    }

    return null;
  };

  const parseDateComponents = (value) => {
    if (value === null || value === undefined) return null;
    const str = String(value).trim();
    if (!str) return null;

    const incidentParts = dateOfIncident ? dateOfIncident.split("-").map((part) => parseInt(part, 10)) : null;
    const inferDayMonthOrder = (first, second) => {
      if (first > 12 && second <= 12) return { day: first, month: second };
      if (second > 12 && first <= 12) return { day: second, month: first };

      if (incidentParts) {
        const [, incidentMonth, incidentDay] = incidentParts;
        if (first === incidentDay && second === incidentMonth) return { day: first, month: second };
        if (second === incidentDay && first === incidentMonth) return { day: second, month: first };
      }

      return { day: first, month: second };
    };

    const isoMatch = str.match(/^(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})$/);
    if (isoMatch) {
      const year = parseInt(isoMatch[1], 10);
      const month = parseInt(isoMatch[2], 10);
      const day = parseInt(isoMatch[3], 10);
      return { year, month, day };
    }

    const dmyMatch = str.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})$/);
    if (dmyMatch) {
      let year = parseInt(dmyMatch[3], 10);
      if (year < 100) year += year >= 70 ? 1900 : 2000;
      const first = parseInt(dmyMatch[1], 10);
      const second = parseInt(dmyMatch[2], 10);
      const { day, month } = inferDayMonthOrder(first, second);
      return { year, month, day };
    }

    const compactMatch = str.match(/^(\d{4})(\d{2})(\d{2})$/);
    if (compactMatch) {
      const year = parseInt(compactMatch[1], 10);
      const month = parseInt(compactMatch[2], 10);
      const day = parseInt(compactMatch[3], 10);
      return { year, month, day };
    }

    if (incidentParts && str === dateOfIncident) {
      const [year, month, day] = incidentParts;
      return { year, month, day };
    }

    const parsed = new Date(str);
    if (!Number.isNaN(parsed.getTime())) {
      return {
        year: parsed.getUTCFullYear(),
        month: parsed.getUTCMonth() + 1,
        day: parsed.getUTCDate(),
      };
    }

    return null;
  };

  const parseDateTimeString = (value) => {
    if (value === null || value === undefined) return null;
    const str = String(value).trim();
    if (!str) return null;

    const clean = str.replace(/['"]/g, "").replace(/\s+/g, " ");

    const directDate = new Date(clean);
    if (!Number.isNaN(directDate.getTime())) {
      return toISOIfValid(directDate);
    }

    const isoLike = clean.match(/^(\d{4}-\d{2}-\d{2})\s+(\d{1,2}:\d{2}(?::\d{2})?)$/);
    if (isoLike) {
      const candidate = `${isoLike[1]}T${isoLike[2]}`;
      const date = new Date(candidate);
      if (!Number.isNaN(date.getTime())) {
        return date.toISOString();
      }
      const utcCandidate = `${candidate}Z`;
      return toISOIfValid(new Date(utcCandidate));
    }

    const dmy = clean.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})\s+(\d{1,2}:\d{2}(?::\d{2})?)$/);
    if (dmy) {
      const dateParts = parseDateComponents(`${dmy[1]}-${dmy[2]}-${dmy[3]}`);
      const timeParts = parseTimeComponents(dmy[4]);
      if (dateParts && timeParts) {
        return buildISOFromParts(
          dateParts.year,
          dateParts.month,
          dateParts.day,
          timeParts.hours,
          timeParts.minutes,
          timeParts.seconds,
          timeParts.millis
        );
      }
    }

    const numeric = clean.match(/^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})$/);
    if (numeric) {
      return buildISOFromParts(
        parseInt(numeric[1], 10),
        parseInt(numeric[2], 10),
        parseInt(numeric[3], 10),
        parseInt(numeric[4], 10),
        parseInt(numeric[5], 10),
        parseInt(numeric[6], 10)
      );
    }

    return null;
  };

  const convertExcelSerial = (value) => {
    if (typeof value !== "number" || Number.isNaN(value) || !Number.isFinite(value)) return null;
    if (value === 0) return null;

    const hasDateComponent = value >= 1;
    const serial = value > 59 ? value - 1 : value;
    const milliseconds = Math.round(serial * 24 * 60 * 60 * 1000);

    if (!hasDateComponent && dateOfIncident) {
      const [year, month, day] = dateOfIncident.split("-").map((part) => parseInt(part, 10));
      return toISOIfValid(new Date(Date.UTC(year, month - 1, day, 0, 0, 0, 0) + milliseconds));
    }

    return toISOIfValid(new Date(EXCEL_EPOCH_UTC + milliseconds));
  };

  const normalizeTimestampNumber = (value) => {
    if (typeof value !== "number" || Number.isNaN(value)) return null;
    if (value > 1e11) {
      return toISOIfValid(new Date(value));
    }
    if (value > 1e9) {
      return toISOIfValid(new Date(value * 1000));
    }
    if (value >= 1) {
      return convertExcelSerial(value);
    }
    return null;
  };

  const normalizeTimestampString = (value) => {
    if (value === null || value === undefined) return null;
    const str = String(value).trim();
    if (!str || str.toLowerCase().startsWith("record")) return null;

    const numeric = Number(str);
    if (!Number.isNaN(numeric) && Number.isFinite(numeric)) {
      const fromNumeric = normalizeTimestampNumber(numeric);
      if (fromNumeric) return fromNumeric;
    }

    const direct = parseDateTimeString(str);
    if (direct) return direct;

    const timeMatch = str.match(/(\d{1,2}:\d{2}(?::\d{2})?\s*(?:AM|PM)?)/i);
    if (timeMatch) {
      const timeParts = parseTimeComponents(timeMatch[1]);
      if (timeParts) {
        const dateParts = parseDateComponents(str);
        if (dateParts) {
          return buildISOFromParts(
            dateParts.year,
            dateParts.month,
            dateParts.day,
            timeParts.hours,
            timeParts.minutes,
            timeParts.seconds,
            timeParts.millis
          );
        }
        if (dateOfIncident) {
          const [year, month, day] = dateOfIncident.split("-").map((part) => parseInt(part, 10));
          return buildISOFromParts(
            year,
            month,
            day,
            timeParts.hours,
            timeParts.minutes,
            timeParts.seconds,
            timeParts.millis
          );
        }
      }
    }

    return null;
  };

  const combineDateAndTimeColumns = (row, timestampColumns = []) => {
    if (!row || timestampColumns.length < 2) return null;
    const lower = timestampColumns.map((col) => col.toLowerCase());

    const dateIndex = lower.findIndex((col) => col.includes("date"));
    const timeIndex = lower.findIndex((col) => col.includes("time"));

    if (dateIndex === -1 || timeIndex === -1) return null;

    const dateParts = parseDateComponents(row[timestampColumns[dateIndex]]);
    const timeParts = parseTimeComponents(row[timestampColumns[timeIndex]]);

    if (!dateParts || !timeParts) return null;

    return buildISOFromParts(
      dateParts.year,
      dateParts.month,
      dateParts.day,
      timeParts.hours,
      timeParts.minutes,
      timeParts.seconds,
      timeParts.millis
    );
  };

  const scanRowForTime = (row) => {
    if (!row || typeof row !== "object") return null;
    for (const [key, value] of Object.entries(row)) {
      if (value instanceof Date) {
        const iso = toISOIfValid(value);
        if (iso) return iso;
      }

      const lowerKey = key.toLowerCase();
      const keySuggestsTime =
        lowerKey.includes("time") ||
        lowerKey.includes("date") ||
        lowerKey.includes("stamp") ||
        lowerKey.includes("utc") ||
        lowerKey.includes("recorded");

      if (typeof value === "number" && keySuggestsTime) {
        const iso =
          value > 1e11
            ? toISOIfValid(new Date(value))
            : value > 1e9
            ? toISOIfValid(new Date(value * 1000))
            : convertExcelSerial(value);
        if (iso) return iso;
      }

      if (typeof value === "string") {
        const iso = normalizeTimestampString(value);
        if (iso) return iso;
        if (keySuggestsTime) {
          const numeric = Number(value);
          if (!Number.isNaN(numeric) && Number.isFinite(numeric)) {
            const numericIso = normalizeTimestampNumber(numeric);
            if (numericIso) return numericIso;
          }
        }
      }
    }
    return null;
  };

  const convertDescriptionToISO = (description) => {
    if (!description || !dateOfIncident) return null;
    const timeMatch = description.match(/(\d{1,2}:\d{2}(?::\d{2})?\s*(?:AM|PM)?)/i);
    if (!timeMatch) return null;

    const timeParts = parseTimeComponents(timeMatch[1]);
    if (!timeParts) return null;

    const [year, month, day] = dateOfIncident.split("-").map((part) => parseInt(part, 10));
    return buildISOFromParts(
      year,
      month,
      day,
      timeParts.hours,
      timeParts.minutes,
      timeParts.seconds,
      timeParts.millis
    );
  };

  const normalizeTimestampValue = (rawValue, row, description, timestampColumns = []) => {
    if (rawValue instanceof Date) {
      const iso = toISOIfValid(rawValue);
      if (iso) return iso;
    }

    if (typeof rawValue === "number") {
      const iso = normalizeTimestampNumber(rawValue);
      if (iso) return iso;
    }

    if (typeof rawValue === "string") {
      const iso = normalizeTimestampString(rawValue);
      if (iso) return iso;
    }

    const combined = combineDateAndTimeColumns(row, timestampColumns);
    if (combined) return combined;

    const scanned = scanRowForTime(row);
    if (scanned) return scanned;

    return convertDescriptionToISO(description);
  };

  /**
   * Validate if coordinates are within reasonable bounds
   */
  const isValidCoordinate = (lat, lng) =>
    lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180 && lat !== 0 && lng !== 0;

  /**
   * Enhanced GPS coordinate extraction supporting multiple formats
   */
  const extractGPSCoordinates = (text) => {
    const coordinates = [];

    // Pattern 1: Standard decimal degrees
    const decimalPattern = /(-?\d+\.\d+)[,\s]+(-?\d+\.\d+)/g;

    // Pattern 2: Labeled coordinates
    const labeledPattern =
      /(?:lat|latitude)[:\s]*(-?\d+\.\d+)[\s\w]*(?:lon|lng|longitude)[:\s]*(-?\d+\.\d+)/gi;

    // Pattern 3: DMS (Degrees Minutes Seconds)
    const dmsPattern =
      /(\d+)°(\d+)'([\d.]+)"([NSEW])\s+(\d+)°(\d+)'([\d.]+)"([NSEW])/g;

    // Pattern 4: Coordinates prefix
    const coordPattern =
      /(?:coordinates?|gps)[:\s]*(-?\d+\.\d+)[,\s]+(-?\d+\.\d+)/gi;

    // Pattern 5: Tabular format (Time Latitude Longitude Status)
    const processStructuredData = (t) => {
      const coords = [];
      const lines = t.split("\n");
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();
        const timeCoordPattern =
          /(\d{2}:\d{2}(?::\d{2})?)\s+(-?\d+\.\d+)\s+(-?\d+\.\d+)\s+(stopped|idle|moving)/gi;
        const match = timeCoordPattern.exec(line);
        if (match) {
          const [, time, lat, lng, status] = match;
          coords.push({
            lat: parseFloat(lat),
            lng: parseFloat(lng),
            time,
            status,
            source: "structured_table",
          });
        }

        if (
          line.toLowerCase().includes("latitude") ||
          line.toLowerCase().includes("lat:")
        ) {
          const latMatch = line.match(/(-?\d+\.\d+)/);
          if (latMatch && i + 1 < lines.length) {
            const nextLine = lines[i + 1];
            const lngMatch = nextLine.match(/(-?\d+\.\d+)/);
            if (lngMatch) {
              coords.push({
                lat: parseFloat(latMatch[1]),
                lng: parseFloat(lngMatch[1]),
                source: "multi_line",
              });
            }
          }
        }
      }
      return coords;
    };

    let match;
    while ((match = decimalPattern.exec(text)) !== null) {
      const lat = parseFloat(match[1]);
      const lng = parseFloat(match[2]);
      if (isValidCoordinate(lat, lng)) {
        coordinates.push({
          lat,
          lng,
          source: "decimal_standard",
          originalText: match[0],
        });
      }
    }
    while ((match = labeledPattern.exec(text)) !== null) {
      const lat = parseFloat(match[1]);
      const lng = parseFloat(match[2]);
      if (isValidCoordinate(lat, lng)) {
        coordinates.push({
          lat,
          lng,
          source: "labeled",
          originalText: match[0],
        });
      }
    }
    while ((match = dmsPattern.exec(text)) !== null) {
      try {
        let lat =
          parseInt(match[1]) +
          parseInt(match[2]) / 60 +
          parseFloat(match[3]) / 3600;
        let lng =
          parseInt(match[5]) +
          parseInt(match[6]) / 60 +
          parseFloat(match[7]) / 3600;

        if (match[4] === "S") lat = -lat;
        if (match[8] === "W") lng = -lng;

        if (isValidCoordinate(lat, lng)) {
          coordinates.push({
            lat,
            lng,
            source: "dms",
            originalText: match[0],
          });
        }
      } catch (error) {
        console.log("DMS parsing error:", error);
      }
    }
    while ((match = coordPattern.exec(text)) !== null) {
      const lat = parseFloat(match[1]);
      const lng = parseFloat(match[2]);
      if (isValidCoordinate(lat, lng)) {
        coordinates.push({
          lat,
          lng,
          source: "coord_prefix",
          originalText: match[0],
        });
      }
    }

    coordinates.push(...processStructuredData(text));

    // De-dup within ~0.001°
    const unique = [];
    coordinates.forEach((coord) => {
      const isDuplicate = unique.some(
        (existing) =>
          Math.abs(existing.lat - coord.lat) < 0.001 &&
          Math.abs(existing.lng - coord.lng) < 0.001
      );
      if (!isDuplicate) unique.push(coord);
    });

    return unique;
  };

  /**
   * Enhanced timestamp extraction supporting multiple formats
   */
  const extractTimestamps = (text) => {
    const timestamps = [];
    const patterns = [
      /\b\d{4}[/-]\d{2}[/-]\d{2}[,\s]+\d{2}:\d{2}:\d{2}\b/g, // YYYY-MM-DD HH:MM:SS
      /\b\d{2}[/-]\d{2}[/-]\d{4}[,\s]+\d{2}:\d{2}:\d{2}\b/g, // DD/MM/YYYY HH:MM:SS
      /\b\d{2}:\d{2}:\d{2}\b/g, // HH:MM:SS
      /\b\d{2}:\d{2}\b/g, // HH:MM
      /Time[:\s]+(\d{2}:\d{2}(?::\d{2})?)/gi, // "Time: 12:34"
      /\b\d{4}\/\d{2}\/\d{2}\b/g, // YYYY/MM/DD
    ];

    patterns.forEach((pattern) => {
      let match;
      while ((match = pattern.exec(text)) !== null) {
        timestamps.push(match[0]);
      }
    });

    return [...new Set(timestamps)];
  };

  /**
   * Enhanced vehicle status extraction with more comprehensive keywords
   */
  const extractVehicleStatus = (text, context = "") => {
    const combinedText = (text + " " + context).toLowerCase();

    const statusKeywords = {
      stopped: [
        "stopped",
        "parked",
        "stationary",
        "ignition off",
        "engine off",
        "halt",
        "standstill",
        "not moving",
        "vehicle stopped",
        "engine switched off",
        "no movement detected",
        "vehicle parked",
        "final destination",
        "end of tracking",
      ],
      idle: [
        "idling",
        "idle",
        "engine on",
        "ignition on",
        "running",
        "waiting",
        "engine running",
        "temporary stop",
        "brief stop",
        "passenger drop-off",
        "vehicle idling",
        "engine running briefly",
      ],
      moving: [
        "moving",
        "motion",
        "driving",
        "traveling",
        "travelling",
        "speed",
        "en route",
        "in transit",
        "vehicle in motion",
        "coordinate recorded during movement",
        "significant movement",
        "movement detected",
      ],
    };

    for (const [status, keywords] of Object.entries(statusKeywords)) {
      if (keywords.some((keyword) => combinedText.includes(keyword))) {
        return status.charAt(0).toUpperCase() + status.slice(1);
      }
    }

    if (combinedText.includes("airport") && combinedText.includes("departure"))
      return "Idle";
    if (
      combinedText.includes("mall") ||
      combinedText.includes("shopping") ||
      combinedText.includes("checkpoint") ||
      combinedText.includes("inspection")
    )
      return "Stopped";

    return "Unknown";
  };

  /**
   * Parse PDF file and extract GPS data with enhanced format support
   */
  const parsePDF = async (file) => {
    setIsProcessing(true);
    setParseError(null);

    try {
      const pdfjs = await initPDFJS();
      if (!pdfjs) {
        throw new Error("PDF processing library not available");
      }

      const arrayBuffer = await file.arrayBuffer();
      const pdf = await pdfjs.getDocument({ data: arrayBuffer }).promise;

      let fullText = "";
      let pageTexts = [];

      for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
        const page = await pdf.getPage(pageNum);
        const textContent = await page.getTextContent();
        const pageText = textContent.items.map((item) => item.str).join(" ");
        pageTexts.push(pageText);
        fullText += pageText + "\n";
      }

      console.log("Extracted PDF text from", pdf.numPages, "pages");
      console.log("Sample text:", fullText.substring(0, 500));

      const coordinates = extractGPSCoordinates(fullText);
      console.log("Extracted coordinates:", coordinates);

      if (coordinates.length === 0) {
        let allCoords = [];
        pageTexts.forEach((pageText) => {
          const pageCoords = extractGPSCoordinates(pageText);
          allCoords.push(...pageCoords);
        });

        if (allCoords.length === 0) {
          setParseError(
            `No GPS coordinates found in the PDF.

Detected text sample: "${fullText.substring(0, 200)}..."

The PDF may contain:
• Scanned images instead of text
• Coordinates in an unsupported format
• No GPS coordinate data

Please ensure your PDF contains GPS coordinates in one of these formats:
• Decimal: -33.918861, 18.423300
• Labeled: Latitude: -33.918861, Longitude: 18.423300
• DMS: 33°55'07.9"S 18°25'23.9"E`
          );
          setParsedData(null);
          setCsvStats(null);
          setIsProcessing(false);
          return;
        }
        coordinates.push(...allCoords);
      }

      const timestamps = extractTimestamps(fullText);
      console.log("Extracted timestamps:", timestamps);

      const processedData = coordinates.map((coord, index) => {
        const coordText = coord.originalText || "";
        const coordIndex = fullText.indexOf(coordText);
        const contextStart = Math.max(0, coordIndex - 100);
        const contextEnd = Math.min(fullText.length, coordIndex + 200);
        const context = fullText.substring(contextStart, contextEnd);

        const rawTimestamp = timestamps[index] ?? coord.time ?? null;
        let timestamp =
          normalizeTimestampString(rawTimestamp) ||
          convertDescriptionToISO(context) ||
          convertDescriptionToISO(coord.originalText);
        if (!timestamp && rawTimestamp) {
          const numeric = Number(rawTimestamp);
          if (!Number.isNaN(numeric) && Number.isFinite(numeric)) {
            timestamp = normalizeTimestampNumber(numeric);
          }
        }
        if (!timestamp && rawTimestamp && typeof rawTimestamp === "string" && rawTimestamp.trim()) {
          // Try parsing against the incident date if the string only has a time fragment
          const timeParts = parseTimeComponents(rawTimestamp);
          if (timeParts && dateOfIncident) {
            const [year, month, day] = dateOfIncident.split("-").map((part) => parseInt(part, 10));
            timestamp = buildISOFromParts(
              year,
              month,
              day,
              timeParts.hours,
              timeParts.minutes,
              timeParts.seconds,
              timeParts.millis
            );
          }
        }
        if (!timestamp) {
          console.warn("[NewCase] Unable to derive PDF timestamp for point", index, rawTimestamp);
        }
        const description =
          coord.source === "structured_table"
            ? `GPS Point ${index + 1} (from table)`
            : `GPS Point ${index + 1} (${coord.source})`;

        let ignitionStatus = coord.status || extractVehicleStatus(context, coordText);

        const locationMatch = context.match(
          /(?:at|near|location|stop)\s+([A-Z][A-Za-z\s]{3,30})/i
        );
        const locationName = locationMatch ? locationMatch[1] : null;

        return {
          id: index,
          lat: coord.lat,
          lng: coord.lng,
          timestamp,
          description: locationName ? `${description} - ${locationName}` : description,
          ignitionStatus,
          rawData: {
            source: coord.source,
            originalText: coordText,
            context: context,
            pageText: fullText.substring(0, 200) + "...",
          },
        };
      });

      console.log("Processed data:", processedData);

      const stoppedPoints = processedData.filter((point) => {
        const status = String(point.ignitionStatus).toLowerCase();
        return (
          status === "stopped" ||
          status === "idle" ||
          status === "unknown" ||
          point.rawData.source === "structured_table"
        );
      });

      const finalStoppedPoints =
        stoppedPoints.length > 0 ? stoppedPoints : processedData;

      // De-dup by ~100m
      const uniquePoints = [];
      finalStoppedPoints.forEach((point) => {
        const isDuplicate = uniquePoints.some((existing) => {
          const distance = Math.sqrt(
            Math.pow((existing.lat - point.lat) * 111000, 2) +
              Math.pow(
                (existing.lng - point.lng) * 111000 * Math.cos((point.lat * Math.PI) / 180),
                2
              )
          );
        return distance < 100;
        });

        if (!isDuplicate) uniquePoints.push(point);
      });

      setParsedData({
        raw: processedData,
        stoppedPoints: uniquePoints,
      });

      setCsvStats({
        totalPoints: processedData.length,
        stoppedPoints: uniquePoints.length,
        columnsUsed: {
          source: "PDF extraction",
          formats: [...new Set(coordinates.map((c) => c.source))],
        },
        derivedStatus: true,
        pdfInfo: {
          pages: pdf.numPages,
          coordinateFormats: [...new Set(coordinates.map((c) => c.source))],
          timestampsFound: timestamps.length,
        },
      });
    } catch (error) {
      console.error("Error parsing PDF:", error);
      let errorMessage = `Error parsing PDF: ${error.message}`;

      if (error.message.includes("PDF processing library")) {
        errorMessage = `PDF processing library failed to load. Please check your internet connection and try again.`;
      } else if (error.message.includes("Invalid PDF")) {
        errorMessage = `Invalid PDF file. Please ensure the file is not corrupted.`;
      } else if (error.message.includes("password")) {
        errorMessage = `Password-protected PDFs are not supported. Please provide an unprotected PDF.`;
      }

      setParseError(errorMessage);
      setParsedData(null);
      setCsvStats(null);
    } finally {
      setIsProcessing(false);
    }
  };

  // --- CSV parsing helpers & parser ---
  const determineIgnitionStatus = (description) => {
    if (!description) return null;

    const desc = description.toLowerCase();

    if (
      desc.includes("stopped") ||
      desc.includes("parked") ||
      desc.includes("stationary") ||
      desc.includes("ignition off") ||
      desc.includes("engine off") ||
      desc.includes("not moving") ||
      desc.includes("halt") ||
      desc.includes("standstill")
    ) {
      return "Stopped";
    }

    if (
      desc.includes("idling") ||
      desc.includes("idle") ||
      desc.includes("engine on") ||
      desc.includes("ignition on") ||
      desc.includes("running") ||
      desc.includes("waiting")
    ) {
      return "Idle";
    }

    if (
      desc.includes("moving") ||
      desc.includes("motion") ||
      desc.includes("driving") ||
      desc.includes("traveling") ||
      desc.includes("travelling") ||
      desc.includes("en route") ||
      desc.includes("in transit") ||
      desc.includes("speed")
    ) {
      return "Moving";
    }

    return null;
  };

  const parseCSV = (file) => {
    setIsProcessing(true);
    setParseError(null);

    Papa.parse(file, {
      header: true,
      dynamicTyping: true,
      skipEmptyLines: true,
      complete: function (results) {
        setIsProcessing(false);

        if (results.errors.length > 0) {
          console.error("CSV parsing errors:", results.errors);
          setParseError(
            `Error parsing CSV: ${results.errors[0].message}. Check console for details.`
          );
          setParsedData(null);
          setCsvStats(null);
          return;
        }

        try {
          if (!results.data || results.data.length === 0) {
            setParseError("CSV file appears to be empty");
            setParsedData(null);
            setCsvStats(null);
            return;
          }

          const firstRow = results.data[0];
          const columns = Object.keys(firstRow);

          const possibleColumns = {
            lat: columns.filter(
              (col) =>
                col.toLowerCase().includes("lat") ||
                col.toLowerCase().includes("latitude")
            ),
            lng: columns.filter(
              (col) =>
                col.toLowerCase().includes("lon") ||
                col.toLowerCase().includes("lng") ||
                col.toLowerCase().includes("long")
            ),
            timestamp: columns.filter(
              (col) =>
                col.toLowerCase().includes("time") ||
                col.toLowerCase().includes("date") ||
                col.toLowerCase().includes("stamp")
            ),
            description: columns.filter(
              (col) =>
                col.toLowerCase().includes("desc") ||
                col.toLowerCase().includes("note") ||
                col.toLowerCase().includes("comment") ||
                col.toLowerCase().includes("text")
            ),
            ignition: columns.filter(
              (col) =>
                col.toLowerCase().includes("ignition") ||
                col.toLowerCase().includes("status") ||
                col.toLowerCase().includes("engine")
            ),
          };

          if (possibleColumns.lat.length === 0 || possibleColumns.lng.length === 0) {
            setParseError("Could not identify latitude/longitude columns in the CSV");
            setParsedData(null);
            setCsvStats(null);
            return;
          }

          const bestColumns = {
            lat: possibleColumns.lat[0],
            lng: possibleColumns.lng[0],
            timestamp:
              possibleColumns.timestamp.length > 0
                ? possibleColumns.timestamp[0]
                : null,
            description:
              possibleColumns.description.length > 0
                ? possibleColumns.description[0]
                : null,
            ignition:
              possibleColumns.ignition.length > 0
                ? possibleColumns.ignition[0]
                : null,
          };

          const processedData = results.data
            .map((row, index) => {
              const lat = parseFloat(row[bestColumns.lat]);
              const lng = parseFloat(row[bestColumns.lng]);

              const description = bestColumns.description
                ? row[bestColumns.description]
                : null;

              let ignitionStatus = bestColumns.ignition
                ? row[bestColumns.ignition]
                : null;

              if ((!ignitionStatus || ignitionStatus === "") && description) {
                ignitionStatus = determineIgnitionStatus(description);
              }

              const rawTimestamp = bestColumns.timestamp
                ? row[bestColumns.timestamp]
                : null;
              const normalizedTimestamp = normalizeTimestampValue(
                rawTimestamp,
                row,
                description,
                possibleColumns.timestamp
              );
              const timestamp = normalizedTimestamp || null;
              if (!normalizedTimestamp) {
                console.warn(
                  "[NewCase] Unable to normalize timestamp for row",
                  index,
                  rawTimestamp
                );
              }

              if (isNaN(lat) || isNaN(lng)) return null;

              return {
                id: index,
                lat,
                lng,
                timestamp,
                description,
                ignitionStatus,
                rawData: row,
              };
            })
            .filter(Boolean);

          if (processedData.length === 0) {
            setParseError("No valid GPS coordinates found in the CSV");
            setParsedData(null);
            setCsvStats(null);
            return;
          }

          const stoppedPoints = processedData.filter((point) => {
            if (!point.ignitionStatus) return false;
            const status = String(point.ignitionStatus).toLowerCase();
            return status === "stopped" || status === "off" || status === "idle";
          });

          if (stoppedPoints.length === 0) {
            setParseError("No stopped or idle vehicle points found in the CSV.");
            setParsedData(null);
            setCsvStats({
              totalPoints: processedData.length,
              stoppedPoints: 0,
              columnsUsed: bestColumns,
            });
            return;
          }

          setParsedData({
            raw: processedData,
            stoppedPoints: stoppedPoints,
          });

          setCsvStats({
            totalPoints: processedData.length,
            stoppedPoints: stoppedPoints.length,
            columnsUsed: bestColumns,
            derivedStatus:
              !bestColumns.ignition ||
              processedData.some(
                (p) => !p.ignitionStatus && determineIgnitionStatus(p.description)
              ),
          });
        } catch (error) {
          console.error("Error processing CSV data:", error);
          setParseError(`Error processing CSV data: ${error.message}`);
          setParsedData(null);
          setCsvStats(null);
        }
      },
      error: function (error) {
        console.error("Error reading CSV file:", error);
        setIsProcessing(false);
        setParseError(`Error reading CSV file: ${error.message}`);
        setParsedData(null);
        setCsvStats(null);
      },
    });
  };

  

  const handleCreateCase = async () => {
    try {
      if (!caseNumber || !caseTitle || !dateOfIncident || !provinceName || !parsedData) {
        alert("Please fill all required fields and upload a valid file");
        return;
      }

      setIsProcessing(true);

      // 1) Create in backend, return caseId
      const payload = {
        case_number: caseNumber,
        case_title: caseTitle,
        date_of_incident: dateOfIncident,
        region: provinceName,
        provinceCode,
        provinceName,
        districtCode,
        districtName,
        between: between || "",
        urgency,
        userID: auth.currentUser ? auth.currentUser.uid : null,
        userIds: assignedUsers.map(u => u.id),
        csv_data: (parsedData.stoppedPoints || []).map((p) => ({
          latitude: p.lat,
          longitude: p.lng,
          timestamp: p.timestamp || null,
          description: p.description || null,
          ignitionStatus: p.ignitionStatus || "Unknown",
        })),
        all_points: (parsedData.raw || []).map((p) => ({
          latitude: p.lat,
          longitude: p.lng,
          timestamp: p.timestamp || null,
          description: p.description || null,
        })),
      };

      const base = (import.meta.env.VITE_API_URL || "http://localhost:8000").replace(/\/+$/,"");
      const { data: created } = await axios.post(`${base}/cases/create`, payload, {
        headers: { "Content-Type": "application/json" },
      });

      const backendCaseId = created?.caseId || created?.id || created?.case_id;
      if (!backendCaseId) throw new Error("Backend did not return caseId");

      // 2) Mirror to Firebase via Jon's updater
      const mirror = {
        caseNumber,
        caseTitle,
        dateOfIncident,
        region: provinceName,
        provinceCode,
        provinceName,
        districtCode,
        districtName,
        between: between || "",
        urgency,
        userId: getCurrentUserId() || auth.currentUser?.uid || null,
        userIds: assignedUsers.map(u => u.id),
        // Persist selected technical terms at creation
        technicalTerms: normalizeTechnicalTermList(selectedTechnicalTerms || []),
        locations: (parsedData.stoppedPoints || []).map((p, i) => ({
          lat: p.lat,
          lng: p.lng,
          timestamp: p.timestamp || null,
          description: p.description || "",
          ignitionStatus: p.ignitionStatus || "Unknown",
          order: i,
        })),
        locationTitles: (parsedData.stoppedPoints || []).map(() => ""),
        reportIntro: "",
        reportConclusion: "",
        selectedForReport: (parsedData.stoppedPoints || []).map((_, i) => i),
      };

      await upsertFirebaseMirror(backendCaseId, mirror);

      if (evidenceItems && evidenceItems.length > 0) {
        try {
          await batchSaveEvidence(
            evidenceItems,
            getCurrentUserId() || auth.currentUser?.uid,
            caseNumber
          );
        } catch (evidenceError) {
          console.error("Failed to save evidence to collection:", evidenceError);
          openModal({
            variant: "warning",
            title: "Evidence Warning",
            description:
              "Case created, but there was an issue saving evidence items to the evidence database. Evidence is still attached locally.",
          });
        }
      } else {
        console.log("No evidence items to save");
      }

      // 3) Route to annotations
      localStorage.setItem("trackxCurrentCaseId", backendCaseId);
      localStorage.setItem("trackxCaseData", JSON.stringify({ ...mirror, caseId: backendCaseId }));
      navigate("/annotations");
    } catch (err) {
      console.error("Failed to create case:", err);
      alert(`Failed to create case: ${err.message}`);
    } finally {
      setIsProcessing(false);
    }
  };


  // ---------- Handlers for upload UI ----------
  const handleDragOver = (e) => {
    e.preventDefault();
    setIsDragging(true);
  };
  const handleDragLeave = () => setIsDragging(false);
  const handleDrop = (e) => {
    e.preventDefault();
    setIsDragging(false);

    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFile(e.dataTransfer.files[0]);
    }
  };
  const handleFileSelect = (e) => {
    if (e.target.files && e.target.files[0]) {
      handleFile(e.target.files[0]);
    }
  };
// ADD: security-first file handler
const securityScanner = new FileSecurityScanner();
const handleFile = async (selected) => {
  setFile(null); setParsedData(null); setCsvStats(null); setParseError(null);
  setSecurityResults(null); setIsScanning(true);
  try {
    const scan = await securityScanner.scanFile(selected);
    setSecurityResults(scan);
    if (!scan.safe) { setParseError(`🚫 File rejected:\n${scan.threats.join("\n")}`); return; }
    setFile(selected);
    const name = selected.name.toLowerCase();
    if (selected.type === "text/csv" || name.endsWith(".csv")) {
      setFileType("csv");
      setIsScanning(false);
      parseCSV(selected);
    } else if (selected.type === "application/pdf" || name.endsWith(".pdf")) {
      setFileType("pdf");
      setIsScanning(false);
      parsePDF(selected);
    } else {
      setParseError("Please upload a CSV or PDF file");
    }
  } finally {
    setIsScanning(false);
  }
};

  // Submit: just call create
  const handleNext = async (e) => {
    e.preventDefault();

    if (!caseNumber || !caseTitle || !dateOfIncident || !provinceName || !file || !parsedData) {
      openModal({
        variant: "warning",
        title: "Missing information",
        description:
          "Please complete all required fields and upload a valid CSV or PDF file before continuing.",
      });
      return;
    }

    await handleCreateCase();
  };

  // Sign Out
  const handleSignOut = async () => {
    try {
      await signOut(auth);
      navigate("/"); // Redirect to LandingPage
    } catch (error) {
      console.error("Sign-out failed:", error.message);
    }
  };

  // ---------- UI ----------
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
          NEW CASE
        </div>

        <div className="flex items-center space-x-6 text-sm text-gray-200">
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
          <div className="flex items-center gap-3 rounded-2xl px-3 py-2 text-sm font-medium text-white bg-white/[0.045] shadow-inner shadow-white/10">
            <FilePlus2 className="h-4 w-4" />
            Create New Case
          </div>
          <Link
            to="/manage-cases"
            className="flex items-center gap-3 rounded-2xl px-3 py-2 text-sm font-medium text-gray-200 transition hover:bg-white/10 hover:text-white"
            onClick={() => setShowMenu(false)}
          >
            <FolderOpen className="h-4 w-4" />
            Manage Cases
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
        <span className="inline-flex items-center rounded-full bg-gradient-to-r from-blue-900/80 to-purple-900/80 px-5 py-1.5 text-white shadow-[0_12px_30px_rgba(15,23,42,0.45)]">
          Case Information
        </span>
        <Link to="/annotations" className="text-gray-400 transition hover:text-white">
          Annotations
        </Link>
        <Link to="/overview" className="text-gray-400 transition hover:text-white">
          Overview
        </Link>
      </div>

      {/* Page Content */}
      <div className="relative mx-auto mt-10 w-full max-w-5xl px-6 pb-20">
        <form
          onSubmit={handleNext}
          className="relative space-y-10 overflow-hidden rounded-3xl border border-white/10 bg-white/[0.02] px-8 py-10 shadow-[0_35px_90px_rgba(15,23,42,0.55)] backdrop-blur-2xl"
        >
          <div className="pointer-events-none absolute -top-24 right-10 h-56 w-56 rounded-full bg-blue-900/20 blur-3xl" />
          <div className="pointer-events-none absolute -bottom-20 left-0 h-48 w-48 rounded-full bg-purple-900/20 blur-3xl" />
          <div className="relative z-10 space-y-2 text-center sm:text-left">
            <p className="text-xs font-semibold uppercase tracking-[0.35em] text-gray-400">
              Case Onboarding
            </p>
            <h2 className="text-3xl font-semibold text-white">Capture the mission details</h2>
            <p className="text-sm text-gray-400">
              Complete the case metadata, assign collaborators, and upload investigative files to begin analysis.
            </p>
          </div>
          {/* Case Details Section */}
          <section className="relative z-10 space-y-6 rounded-2xl border border-white/10 bg-white/[0.018] p-6 shadow-[0_18px_45px_rgba(15,23,42,0.45)]">
            <div className="flex flex-col gap-1 sm:flex-row sm:items-baseline sm:justify-between">
              <div>
                <h3 className="text-lg font-semibold text-white">Case Details</h3>
                <p className="text-xs text-gray-400">Capture identifiers that anchor this investigation to your docket.</p>
              </div>
            </div>
            <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
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
                className="w-full rounded-xl border border-white/10 bg-white/[0.02] px-3 py-2 text-sm text-white placeholder-gray-500 focus:border-blue-700/50 focus:outline-none focus:ring-2 focus:ring-blue-700/30"
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
                className="w-full rounded-xl border border-white/10 bg-white/[0.02] px-3 py-2 text-sm text-white placeholder-gray-500 focus:border-blue-700/50 focus:outline-none focus:ring-2 focus:ring-blue-700/30"
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
                className="w-full rounded-xl border border-white/10 bg-white/[0.02] px-3 py-2 text-sm text-white placeholder-gray-500 focus:border-blue-700/50 focus:outline-none focus:ring-2 focus:ring-blue-700/30"
                required
              />
            </div>

            {/* Region (Province + optional District) */}
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1">Region *</label>
              <button
                type="button"
                onClick={() => setShowRegionModal(true)}
                className="w-full rounded-xl border border-white/10 bg-white/[0.02] px-3 py-2 text-left text-sm text-white placeholder-gray-500 focus:border-blue-700/50 focus:outline-none focus:ring-2 focus:ring-blue-700/30"
              >
                {provinceName ? (
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="inline-flex items-center gap-1 rounded-full bg-white/[0.06] px-2 py-0.5 text-xs text-gray-200">
                      {provinceName}
                    </span>
                    {districtName && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-white/[0.06] px-2 py-0.5 text-xs text-gray-200">
                        {districtName}
                      </span>
                    )}
                  </div>
                ) : (
                  <span className="text-gray-400">Select province and district</span>
                )}
              </button>
              <p className="mt-1 text-xs text-gray-500">Click to choose the province and optionally a magisterial district.</p>
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
                className="w-full rounded-xl border border-white/10 bg-white/[0.02] px-3 py-2 text-sm text-white placeholder-gray-500 focus:border-blue-700/50 focus:outline-none focus:ring-2 focus:ring-blue-700/30"
                placeholder="e.g. The State vs. John Doe"
              />
            </div>
            </div>
          </section>

          {/* Urgency */}
          <section className="relative z-10 space-y-4 rounded-2xl border border-white/10 bg-white/[0.018] p-6 shadow-[0_18px_45px_rgba(15,23,42,0.45)]">
            <div className="flex flex-col gap-1 sm:flex-row sm:items-baseline sm:justify-between">
              <div>
                <h3 className="text-lg font-semibold text-white">Priority & Workflow</h3>
                <p className="text-xs text-gray-400">Set the urgency to guide notifications and investigator focus.</p>
              </div>
            </div>
            <select
              id="urgency"
              value={urgency}
              onChange={(e) => setUrgency(e.target.value)}
              className="w-full rounded-xl border border-white/10 bg-white/[0.02] px-3 py-2 text-sm text-white focus:border-blue-700/50 focus:outline-none focus:ring-2 focus:ring-blue-700/30"
              required
            >
              <option value="">Select urgency level</option>
              <option value="Low">Low</option>
              <option value="Medium">Medium</option>
              <option value="High">High</option>
              <option value="Critical">Critical</option>
            </select>
          </section>

          {profile?.role === "admin" && (
            <section className="md:col-span-2 space-y-4 rounded-2xl border border-white/10 bg-white/[0.018] p-6 shadow-[0_18px_45px_rgba(15,23,42,0.45)]">
              <div className="flex flex-col gap-1 sm:flex-row sm:items-baseline sm:justify-between">
                <div>
                  <h3 className="text-sm font-semibold text-white">Collaborators</h3>
                  <p className="text-xs text-gray-400">
                    Add additional investigators who should have access to this case.
                  </p>
                </div>
              </div>

              <div className="flex flex-wrap gap-2">
                {assignedUsers.map((user) => (
                  <span
                    key={user.id}
                    className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.045] px-3 py-1 text-xs text-white backdrop-blur"
                  >
                    <span className="font-medium">{user.name || user.email || user.id}</span>
                    {user.id !== currentUserId && (
                      <button
                        type="button"
                        onClick={() => handleRemoveAssignedUser(user.id)}
                        className="text-gray-300 hover:text-rose-300"
                        aria-label={`Remove ${user.name || user.email || user.id}`}
                      >
                        <X className="w-3 h-3" />
                      </button>
                    )}
                  </span>
                ))}
              </div>

              <div className="flex flex-col sm:flex-row sm:items-center gap-3">
                <input
                  type="text"
                  value={userSearchTerm}
                  onChange={(e) => setUserSearchTerm(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      handleUserSearch();
                    }
                  }}
                  placeholder="Search by name or email"
                  className="flex-1 rounded-xl border border-white/10 bg-white/[0.02] px-3 py-2 text-sm text-white placeholder-gray-500 focus:border-blue-700/50 focus:outline-none focus:ring-2 focus:ring-blue-700/30"
                />
                <button
                  type="button"
                  onClick={handleUserSearch}
                  className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-gradient-to-r from-blue-900 via-slate-900 to-indigo-900 px-4 py-2 text-sm font-medium text-white shadow-[0_15px_35px_rgba(15,23,42,0.55)] transition hover:-translate-y-0.5"
                >
                  <UserPlus className="w-4 h-4" />
                  Search
                </button>
              </div>

              <div className="space-y-2">
                {isSearchingUsers ? (
                  <p className="text-xs text-gray-400">Searching users...</p>
                ) : userSearchResults.length > 0 ? (
                  userSearchResults.map((user) => (
                    <div
                      key={user.id}
                      className="flex items-center justify-between rounded-2xl border border-white/10 bg-white/[0.02] px-3 py-2 text-xs shadow-[0_12px_30px_rgba(15,23,42,0.45)]"
                    >
                      <div>
                        <p className="text-white font-medium">{user.name || user.email || user.id}</p>
                        <p className="text-gray-400">{user.email}</p>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleAddUserToCase(user)}
                        className="inline-flex items-center gap-1 rounded-full border border-white/10 bg-gradient-to-r from-emerald-800 to-teal-700 px-3 py-1 text-white transition hover:from-emerald-700 hover:to-teal-600"
                      >
                        <UserPlus className="w-3 h-3" /> Add
                      </button>
                    </div>
                  ))
                ) : userSearchTerm ? (
                  <p className="text-xs text-gray-500">No users found.</p>
                ) : (
                  <p className="text-xs text-gray-500">Search to find users to add to this case.</p>
                )}
              </div>
            </section>
          )}

          {/* NEW: Technical terms selector (case glossary) */}
          <TechnicalTermsSelector
            value={selectedTechnicalTerms}
            onChange={setSelectedTechnicalTerms}
            disabled={isProcessing}
          />

          {/* Evidence Search & Link Section */}
          <section className="md:col-span-2 space-y-4 rounded-2xl border border-white/10 bg-white/[0.018] p-6 shadow-[0_18px_45px_rgba(15,23,42,0.45)]">
            <div className="flex flex-col gap-1 sm:flex-row sm:items-baseline sm:justify-between">
              <div>
                <h3 className="text-sm font-semibold text-white flex items-center gap-2">
                  <Search className="h-5 w-5 text-purple-400" />
                  Search & Link Existing Evidence
                </h3>
                <p className="text-xs text-gray-400 mt-1">
                  Find and attach evidence from other cases to avoid duplication.
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
                {showEvidenceSearch ? "Hide Search" : "Search Evidence"}
              </button>
            </div>

            {showEvidenceSearch && (
              <div className="space-y-4 rounded-2xl border border-white/10 bg-white/[0.02] p-4">
                {/* Search Input */}
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

                {/* Results Area */}
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
                              <div className="flex flex-wrap items-center gap-2 mb-2">
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

          {/* Evidence Locker (shared, glassmorphism) */}
          <EvidenceLocker
            evidenceItems={evidenceItems}
            onChange={setEvidenceItems}
            caseNumber={caseNumber}
            title="Evidence Locker"
            subtitle="Add evidence items that will be associated with this case"
          />

          {/* Enhanced File Upload Section */}
          <section className="relative z-10 mt-8 space-y-4 rounded-2xl border border-white/10 bg-white/[0.018] p-6 shadow-[0_18px_45px_rgba(15,23,42,0.45)]">
            <div className="mb-2 flex items-center justify-between">
              <label className="block text-sm font-medium text-gray-300">
                Upload GPS Coordinates (CSV or PDF) *
              </label>
              <button
                type="button"
                onClick={() => setShowGuide(!showGuide)}
                className="flex items-center text-sm text-blue-300 transition hover:text-white"
              >
                <Info className="w-4 h-4 mr-1" />
                {showGuide ? "Hide Guide" : "View File Guide"}
              </button>
            </div>

            {/* File Guide */}
            {showGuide && (
              <div className="mb-4 rounded-2xl border border-white/10 bg-white/[0.02] p-6 text-sm text-gray-200 shadow-[0_18px_45px_rgba(15,23,42,0.45)]">
                <h3 className="font-semibold mb-2">Supported File Formats:</h3>

                {/* CSV Section */}
                <div className="mb-4">
                  <h4 className="font-semibold text-blue-300 mb-1">CSV Files:</h4>
                  <p className="mb-2">Your CSV should include the following columns:</p>
                  <ul className="list-disc pl-5 space-y-1 text-xs">
                    <li>
                      Latitude (decimal coordinates - column name containing "lat" or
                      "latitude")
                    </li>
                    <li>
                      Longitude (decimal coordinates - column name containing "lng", "lon",
                      or "longitude")
                    </li>
                    <li>
                      Description (optional - column name containing "desc", "note", or
                      "comment")
                    </li>
                    <li>
                      Ignition Status (optional - column name containing "ignition" or
                      "status")
                    </li>
                    <li>Timestamp (optional - column name containing "time", "date", or "stamp")</li>
                  </ul>
                </div>

                {/* PDF Section */}
                <div className="mb-4">
                  <h4 className="font-semibold text-emerald-300 mb-1">PDF Files:</h4>
                  <p className="mb-2">PDF files will be automatically processed to extract:</p>
                  <ul className="list-disc pl-5 space-y-1 text-xs">
                    <li>GPS coordinates in decimal format (e.g., -33.918861, 18.423300)</li>
                    <li>
                      Coordinates with labels (e.g., "Latitude: -33.918861, Longitude:
                      18.423300")
                    </li>
                    <li>Degrees/Minutes/Seconds format (e.g., 33°55'07.9"S 18°25'23.9"E)</li>
                    <li>Timestamps and vehicle status information when available</li>
                  </ul>
                  <p className="mt-2 text-xs text-amber-300">
                    Note: PDF extraction works best with text-based PDFs. Scanned images may
                    not extract properly.
                  </p>
                </div>

                {/* Ignition Status Detection */}
                <div className="mt-3 border-t border-white/10 pt-3">
                  <p className="font-semibold mb-1">Intelligent Vehicle Status Detection:</p>
                  <p className="mb-2 text-xs text-gray-400">
                    The system analyzes text content to determine vehicle status:
                  </p>
                  <div className="grid grid-cols-3 gap-2 text-xs mt-2">
                    <div className="rounded border border-rose-500/20 bg-rose-950/40 p-2">
                      <p className="mb-1 font-semibold text-rose-400">Stopped</p>
                      <p className="text-gray-400">
                        stopped, parked, ignition off, engine off, stationary
                      </p>
                    </div>
                    <div className="rounded border border-amber-500/20 bg-amber-950/40 p-2">
                      <p className="mb-1 font-semibold text-amber-300">Idle</p>
                      <p className="text-gray-400">idling, idle, engine on, ignition on, running</p>
                    </div>
                    <div className="rounded border border-emerald-500/20 bg-emerald-950/40 p-2">
                      <p className="mb-1 font-semibold text-emerald-300">Moving</p>
                      <p className="text-gray-400">moving, driving, traveling, speed, en route</p>
                    </div>
                  </div>
                </div>
              </div>
            )}

            <div
              className={`group relative flex flex-col items-center justify-center rounded-3xl border border-white/12 bg-white/[0.018] p-10 text-center transition-all duration-300 cursor-pointer shadow-[0_22px_55px_rgba(15,23,42,0.45)]
               ${isDragging ? "border-blue-700/80 shadow-[0_28px_70px_rgba(30,64,175,0.45)]" : ""}
               ${file && !parseError ? "border-emerald-600/70 bg-emerald-950/10" : ""}
               ${parseError ? "border-rose-600/70 bg-rose-950/10" : ""}`}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              onClick={() => document.getElementById("file-upload").click()}
            >
              <input
                id="file-upload"
                type="file"
                accept=".csv,.pdf"
                className="hidden"
                onChange={handleFileSelect}
              />

              {isProcessing ? (
                <div className="text-center">
                  <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-blue-700 mx-auto mb-4"></div>
                  <div className="text-blue-300 mb-2">
                    Processing {fileType?.toUpperCase()} file...
                  </div>
                  <div className="text-xs text-gray-400">
                    {fileType === "pdf"
                      ? "Extracting text and GPS coordinates from PDF..."
                      : "Analyzing CSV structure and extracting location data..."}
                  </div>
                </div>
              ) : file && !parseError ? (
                <div className="text-center">
                  <CheckCircle className="mx-auto mb-2 h-8 w-8 text-emerald-300" />
                  <div className="mb-2 text-emerald-300">
                    {fileType === "pdf"
                      ? "PDF processed successfully"
                      : "CSV processed successfully"}
                  </div>
                  <p className="flex items-center justify-center text-gray-200">
                    {fileType === "pdf" ? <FileText className="w-4 h-4 mr-2" /> : null}
                    {file.name}
                  </p>
                  {csvStats && (
                    <div className="mt-3 text-sm text-gray-300">
                      <p>Total data points: {csvStats.totalPoints}</p>
                      <p>Stopped/Relevant locations: {csvStats.stoppedPoints}</p>

                      {csvStats.columnsUsed &&
                        csvStats.columnsUsed.source !== "PDF extraction" && (
                          <div className="mt-2 text-xs text-gray-300">
                            <p>Using columns:</p>
                            <p>Latitude: {csvStats.columnsUsed.lat}</p>
                            <p>Longitude: {csvStats.columnsUsed.lng}</p>
                            {csvStats.columnsUsed.ignition && (
                              <p>Ignition Status: {csvStats.columnsUsed.ignition}</p>
                            )}
                            {csvStats.columnsUsed.description && (
                              <p>Description: {csvStats.columnsUsed.description}</p>
                            )}
                            {csvStats.columnsUsed.timestamp && (
                              <p>Timestamp: {csvStats.columnsUsed.timestamp}</p>
                            )}
                          </div>
                        )}

                      {fileType === "pdf" && csvStats.pdfInfo && (
                        <div className="mt-2 text-xs text-gray-300">
                          <p className="text-emerald-300">
                            ✓ Processed {csvStats.pdfInfo.pages} PDF page(s)
                          </p>
                          <p className="text-emerald-300">
                            ✓ Coordinate formats:{" "}
                            {csvStats.pdfInfo.coordinateFormats.join(", ")}
                          </p>
                          {csvStats.pdfInfo.timestampsFound > 0 && (
                            <p className="text-emerald-300">
                              ✓ Found {csvStats.pdfInfo.timestampsFound} timestamps
                            </p>
                          )}
                        </div>
                      )}

                      {fileType === "csv" && csvStats.derivedStatus && (
                        <p className="mt-1 text-amber-300">
                          {fileType === "pdf"
                            ? "Vehicle status derived from PDF content"
                            : "Using descriptions to determine vehicle status"}
                        </p>
                      )}
                    </div>
                  )}
                </div>
              ) : parseError ? (
                <div className="text-center">
                  <AlertCircle className="h-8 w-8 text-rose-400 mx-auto mb-2" />
                  <div className="text-rose-400 mb-2">Error processing file</div>
                  <p className="text-rose-300 max-w-md">{parseError}</p>
                  <p className="text-gray-400 mt-2">Click to try another file</p>

                  {fileType === "pdf" && (
                    <div className="mt-3 text-xs text-gray-400">
                      <p className="font-semibold text-rose-400">PDF Processing Failed</p>
                      <p className="mb-2">{parseError}</p>
                      <div>
                        <p className="font-semibold mb-1">Troubleshooting Tips:</p>
                        <ul className="list-disc list-inside space-y-1">
                          <li>Ensure PDF contains searchable text (not scanned images)</li>
                          <li>Check that GPS coordinates are in supported formats</li>
                          <li>Try a different PDF if this one doesn't work</li>
                          <li>Verify the PDF isn't password-protected</li>
                        </ul>
                        <p className="mt-2 font-semibold">Supported coordinate formats:</p>
                        <ul className="list-disc list-inside text-xs">
                          <li>Decimal: -33.918861, 18.423300</li>
                          <li>
                            Labeled: Latitude: -33.918861, Longitude: 18.423300
                          </li>
                          <li>DMS: 33°55'07.9"S 18°25'23.9"E</li>
                          <li>Tables with Time, Lat, Lng, Status columns</li>
                        </ul>
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <>
                  <Upload className="mb-4 h-12 w-12 text-gray-300" />
                  <p className="mb-2 text-gray-200">
                    Drag and drop your CSV or PDF file here
                  </p>
                  <p className="text-sm text-gray-400">or click to browse</p>
                  <div className="mt-4 flex items-center space-x-4 text-xs text-gray-400">
                    <div className="flex items-center">
                      <div className="mr-2 h-3 w-3 rounded bg-blue-600"></div>
                      CSV Files
                    </div>
                    <div className="flex items-center">
                      <FileText className="mr-2 h-3 w-3 text-gray-300" />
                      PDF Files (New!)
                    </div>
                  </div>
                </>
              )}
            </div>
          </section>

          {/* Navigation Buttons */}
          <div className="mt-10 flex flex-wrap items-center justify-between gap-4">
            <Link
              to="/home"
              className="rounded-full border border-white/10 bg-white/[0.02] px-5 py-2 text-sm font-medium text-gray-200 transition hover:bg-white/15 hover:text-white"
            >
              Cancel
            </Link>
            <button
              type="submit"
              className={`rounded-full px-6 py-2 text-sm font-semibold transition ${
                canProceed
                  ? "border border-white/10 bg-gradient-to-r from-blue-900 via-slate-900 to-purple-900 text-white shadow-[0_25px_65px_rgba(15,23,42,0.65)] hover:-translate-y-0.5"
                  : "border border-white/10 bg-white/[0.04] text-gray-500 cursor-not-allowed"
              }`}
              disabled={!canProceed}
            >
              {isProcessing ? "Creating Case..." : "Next"}
            </button>
          </div>
        </form>
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

      <RegionSelectorModal
        isOpen={showRegionModal}
        onClose={() => setShowRegionModal(false)}
        onSelect={({ provinceCode: pCode, provinceName: pName, districtCode: dCode, districtName: dName }) => {
          setProvinceCode(pCode || "");
          setProvinceName(pName || "");
          setDistrictCode(dCode || "");
          setDistrictName(dName || "");
          // Legacy mirror
          setRegion(pName || "");
        }}
      />
    </motion.div>
  );
}

export default NewCasePage;
