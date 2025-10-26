import { useState, useEffect, useMemo } from "react";
import { Link, useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { auth } from "../firebase";
import { useAuth } from "../context/AuthContext";
import { signOut } from "firebase/auth";
import axios from "axios";
import adfLogo from "../assets/image-removebg-preview.png";
import { Calendar, MapPin, Hash, Info, Route, Home, FilePlus2, FolderOpen, Briefcase, LayoutDashboard } from "lucide-react";
import { FaMapMarkerAlt } from "react-icons/fa";
import {
  PieChart,
  Pie,
  Cell,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";
import MiniHeatMapWindow from "../components/MiniHeatMapWindow";
import { getMiniHeatmapPoints } from "../services/miniHeatmapService";
import NotificationModal from "../components/NotificationModal";
import RegionSelectorModal from "../components/RegionSelectorModal";
import useNotificationModal from "../hooks/useNotificationModal";
import { getFriendlyErrorMessage } from "../utils/errorMessages";
import ZA_REGIONS from "../data/za_regions";


function MyCasesPage() {
  const { profile } = useAuth();
  const navigate = useNavigate();
  const [showMenu, setShowMenu] = useState(false);
  const [myCases, setMyCases] = useState([]);
  const [selectedCase, setSelectedCase] = useState(null);
  const [hoveredCase, setHoveredCase] = useState(null);
  const [hoverData, setHoverData] = useState(null);
  const [notifications, setNotifications] = useState([]);
  const [currentPage, setCurrentPage] = useState(1); // Current page for notifications
  const [totalNotifications, setTotalNotifications] = useState(0); // Total notifications
  const notificationsPerPage = 5; // Number of notifications per page

  // State for filters
  const [searchTerm, setSearchTerm] = useState("");
  const [region, setRegion] = useState("");
  const [provinceCode, setProvinceCode] = useState("");
  const [districtCode, setDistrictCode] = useState("");
  const [showRegionModal, setShowRegionModal] = useState(false);  const selectedRegionLabel = useMemo(() => {
    const pName = region || ZA_REGIONS.find(p => p.code === provinceCode)?.name || "";
    const prov = ZA_REGIONS.find(p => p.code === provinceCode);
    const dName = prov?.districts?.find(d => String(d.code) === String(districtCode))?.name || "";
    if (!pName && !dName) return "";
    return dName ? `${pName} — ${dName}` : pName;
  }, [region, provinceCode, districtCode]);
  const prettyRegion = (c) => {
    const p = c?.provinceName || c?.region || "";
    const d = c?.districtName || "";
    return d ? `${p} - ${d}` : p;
  };
  const [date, setDate] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [urgencyFilter, setUrgencyFilter] = useState("");
  const { modalState, openModal, closeModal } = useNotificationModal();
  const formattedDateTime = new Date().toLocaleString();
  const CASES_PER_PAGE = 10;
  const [casePage, setCasePage] = useState(1);

  // === AI Summary state
  const [aiOpen, setAiOpen] = useState(false);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiMarkdown, setAiMarkdown] = useState("");
  const [aiError, setAiError] = useState("");

  // Simple spinner
  const Spinner = () => (
    <div className="flex items-center justify-center py-10">
      <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-white"></div>
    </div>
  );

  // Unified search (mirrors ManageCases, scoped by user)
  const handleSearch = async (overrides = {}) => {
    const nextSearchTerm = overrides.searchTerm !== undefined ? overrides.searchTerm : searchTerm;
    const nextProvinceCode = overrides.provinceCode !== undefined ? overrides.provinceCode : provinceCode;
    const nextDistrictCode = overrides.districtCode !== undefined ? overrides.districtCode : districtCode;
    const nextDate = overrides.date !== undefined ? overrides.date : date;

    if (overrides.searchTerm !== undefined) setSearchTerm(overrides.searchTerm);
    if (overrides.provinceCode !== undefined) setProvinceCode(overrides.provinceCode);
    if (overrides.districtCode !== undefined) setDistrictCode(overrides.districtCode);
    if (overrides.date !== undefined) setDate(overrides.date);

    const prov = ZA_REGIONS.find(p => p.code === nextProvinceCode);
    setRegion(prov ? prov.name : region);

    try {
      const uid = auth.currentUser?.uid;
      if (!uid) return;
      const response = await axios.get("http://localhost:8000/cases/search", {
        params: {
          user_id: uid,
          searchTerm: nextSearchTerm || undefined,
          // send both provinceName and legacy region label to maximize server-side matching
          provinceName: (prov?.name || region) || undefined,
          region: (prov?.name || region) || undefined,
          provinceCode: nextProvinceCode || undefined,
          districtCode: nextDistrictCode || undefined,
          date: nextDate || undefined,
          status: statusFilter || undefined,
          urgency: urgencyFilter || undefined,
        },
      });
      setMyCases(Array.isArray(response.data.cases) ? response.data.cases : []);
      setCasePage(1);
    } catch (error) {
      console.error("Failed to fetch user cases:", error);
    }
  };

  // Automatically fetch all cases for the user when the component mounts
  useEffect(() => {
    handleSearch();
  }, []);

  // Mini heatmap points (cached, lightweight)
  const [heatPoints, setHeatPoints] = useState([]);
  useEffect(() => {
    const loadMiniHeatmap = async () => {
      try {
        const points = await getMiniHeatmapPoints({ limit: 10 });
        setHeatPoints(points);
      } catch (e) {
        console.error("Failed to fetch mini heatmap points:", e);
      }
    };
    loadMiniHeatmap();
  }, []);

  useEffect(() => {
    const totalPages = Math.max(Math.ceil(myCases.length / CASES_PER_PAGE), 1);
    if (casePage > totalPages) {
      setCasePage(totalPages);
    }
  }, [myCases, casePage]);

  // Fetch hover metadata
  useEffect(() => {
    if (!hoveredCase) {
      setHoverData(null);
      return;
    }
    const fetchPoints = async () => {
      try {
        const res = await axios.get(
          `http://localhost:8000/cases/${hoveredCase.doc_id}/all-points`
        );
        const pts = res.data.points || [];
        if (pts.length > 0) {
          setHoverData({
            first: pts[0],
            last: pts[pts.length - 1],
          });
        }
      } catch (e) {
        console.error("Failed to load points for hover:", e);
      }
    };
    fetchPoints();
  }, [hoveredCase]);

  const handleSignOut = async () => {
    try {
      await signOut(auth);
      navigate("/");
    } catch (error) {
      console.error("Sign-out failed:", error.message);
    }
  };

  const handleSelectCase = (caseItem) => setSelectedCase(caseItem);

  const openStreetView = (lat, lng) =>
    window.open(`https://www.google.com/maps?q=&layer=c&cbll=${lat},${lng}`, "_blank");

  // Update status
  const handleStatusChange = async (caseItem, newStatus) => {
    try {
      await axios.put("http://localhost:8000/cases/update", {
        ...caseItem,
        status: newStatus,
      });
      setMyCases((prev) =>
        prev.map((c) => (c.doc_id === caseItem.doc_id ? { ...c, status: newStatus } : c))
      );
    } catch (e) {
      console.error("Failed to update status:", e);
    }
  };

  // Update urgency
  const handleTagChange = async (caseItem, newUrgency) => {
    try {
      await axios.put("http://localhost:8000/cases/update", {
        ...caseItem,
        urgency: newUrgency,
      });
      setMyCases((prev) =>
        prev.map((c) =>
          c.doc_id === caseItem.doc_id ? { ...c, urgency: newUrgency } : c
        )
      );
    } catch (e) {
      console.error("Failed to update urgency:", e);
    }
  };

  const deleteSelectedCase = async (caseItem) => {
    closeModal();
    if (!caseItem) return;
    try {
      await axios.delete(`http://localhost:8000/cases/delete/${caseItem.doc_id}`);
      openModal({
        variant: "success",
        title: "Case deleted",
        description: `"${caseItem.caseTitle}" has been removed successfully.`,
      });
      setMyCases((prev) => prev.filter((c) => c.doc_id !== caseItem.doc_id));
      if (selectedCase?.doc_id === caseItem.doc_id) {
        setSelectedCase(null);
      }
    } catch (err) {
      console.error("Delete failed:", err);
      openModal({
        variant: "error",
        title: "Delete failed",
        description: getFriendlyErrorMessage(err, "We couldn't delete the case. Please try again."),
      });
    }
  };

  const requestCaseDeletion = () => {
    if (!selectedCase) return;
    const caseReference = selectedCase;
    openModal({
      variant: "warning",
      title: "Delete case?",
      description: `Are you sure you want to delete "${caseReference.caseTitle}"? This action cannot be undone.`,
      primaryAction: {
        label: "Delete case",
        closeOnClick: false,
        onClick: () => deleteSelectedCase(caseReference),
      },
      secondaryAction: {
        label: "Cancel",
      },
    });
  };

  // Fetch notifications for the current user with pagination
  const fetchNotifications = async (page = 1) => {
    try {
      const uid = auth.currentUser?.uid;
      if (!uid) {
        console.warn("No user ID found. Cannot fetch notifications.");
        return;
      }
      const response = await axios.get(`http://localhost:8000/notifications/${uid}`, {
        params: { page, limit: notificationsPerPage },
      });
      setNotifications(response.data.notifications || []);
      setTotalNotifications(response.data.total || 0);
      setCurrentPage(page);
    } catch (error) {
      console.error("Failed to fetch notifications:", error);
    }
  };

  // Fetch notifications when the component mounts
  useEffect(() => {
    fetchNotifications();
  }, []);

  // Pagination controls
  const handlePreviousPage = () => {
    if (currentPage > 1) {
      fetchNotifications(currentPage - 1);
    }
  };

  const handleNextPage = () => {
    if (currentPage < Math.ceil(totalNotifications / notificationsPerPage)) {
      fetchNotifications(currentPage + 1);
    }
  };

  const toggleReadStatus = async (notification) => {
    try {
      const uid = auth.currentUser?.uid;
      if (!uid) {
        console.warn("No user ID found. Cannot update notification.");
        return;
      }

      const updatedReadStatus = !notification.read;
      await axios.patch(
        `http://localhost:8000/notifications/${uid}/${notification.id}`,
        { read: updatedReadStatus },
        { headers: { "Content-Type": "application/json" } }
      );

      setNotifications((prev) =>
        prev.map((n) =>
          n.id === notification.id ? { ...n, read: updatedReadStatus } : n
        )
      );
    } catch (error) {
      console.error("Failed to update notification read status:", error);
    }
  };

  // === AI Summary actions
  const openAISummary = async () => {
    if (!selectedCase) {
      openModal({
        variant: "info",
        title: "Select a case",
        description: "Choose a case from the list before opening an AI summary.",
      });
      return;
    }
    setAiOpen(true);
    setAiLoading(true);
    setAiMarkdown("");
    setAiError("");

    try {
      // 1) Derive (re)build rollup for this case
      await axios.post(`http://localhost:8000/derive/cases/${selectedCase.doc_id}`);

      // 2) Call AI
      const uid = auth.currentUser?.uid;
      const role = profile?.role || "user";
      const res = await axios.post("http://localhost:8000/ai/briefings", {
        user_id: uid,
        user_role: role,
        case_ids: [selectedCase.doc_id],
        backend: "openai",
      });

      setAiMarkdown(res.data.markdown || "(No summary returned)");
    } catch (err) {
      console.error("AI summary failed:", err);
      const msg =
        err?.response?.data?.detail ||
        err?.message ||
        "Failed to generate AI summary.";
      setAiError(msg);
    } finally {
      setAiLoading(false);
    }
  };

  // Analytics
  const totalCases = myCases.length;
  const inProgress = myCases.filter((c) => c.status === "in progress").length;
  const completed = myCases.filter((c) => c.status === "completed").length;
  const regionCounts = {};
  myCases.forEach((c) => {
    if (c.region) regionCounts[c.region] = (regionCounts[c.region] || 0) + 1;
  });
  const mostActiveRegion =
    Object.entries(regionCounts).sort((a, b) => b[1] - a[1])[0]?.[0] || "N/A";

  const totalCasePages = Math.max(Math.ceil(myCases.length / CASES_PER_PAGE), 1);
  const paginatedCases = myCases.slice(
    (casePage - 1) * CASES_PER_PAGE,
    (casePage - 1) * CASES_PER_PAGE + CASES_PER_PAGE
  );

  const pieData = [
    { name: "In Progress", value: inProgress },
    { name: "Completed", value: completed },
  ];
  const COLORS = ["#FBBF24", "#10B981"];

  const tagColors = {
    Low: "border border-emerald-400/30 bg-emerald-500/15 text-emerald-200",
    Medium: "border border-amber-400/30 bg-amber-500/15 text-amber-200",
    High: "border border-orange-500/40 bg-orange-500/15 text-orange-200",
    Critical: "border border-rose-500/40 bg-rose-500/20 text-rose-200",
  };

  return (
    <>
      <motion.div
          initial={{ opacity: 0, y: 18 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8 }}
          className={`relative min-h-screen overflow-hidden bg-gradient-to-br from-black via-gray-900 to-black font-sans text-white ${aiOpen ? 'overflow-hidden' : ''}`}
        >
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(59,130,246,0.15),transparent_55%)]" />
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_bottom,rgba(129,140,248,0.12),transparent_60%)]" />
  
      <nav className={`mx-6 mt-6 flex items-center justify-between rounded-3xl border border-white/10 bg-gradient-to-br from-black/85 via-slate-900/70 to-black/80 px-6 py-4 shadow-xl shadow-[0_25px_65px_rgba(8,11,24,0.65)] backdrop-blur-xl ${aiOpen ? 'pointer-events-none blur-sm' : ''}`}>
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
              src={adfLogo}
              alt="ADF Logo"
              className="h-11 w-auto drop-shadow-[0_10px_20px_rgba(59,130,246,0.35)] transition hover:opacity-90"
            />
          </Link>
        </div>
  
        <div className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 text-2xl font-semibold tracking-[0.35em] text-white/80 drop-shadow-[0_2px_12px_rgba(15,23,42,0.55)]">
          MY CASES
        </div>
  
        <div className="flex items-center gap-4 text-sm text-gray-200">
          <Link
            to="/home"
            className="hidden md:inline-flex items-center rounded-full border border-white/10 bg-white/[0.02] px-4 py-2 text-xs font-semibold text-gray-200 shadow-inner shadow-white/5 transition hover:border-white/25 hover:text-white"
          >
            Home
          </Link>
          <div className="hidden text-right lg:block">
            <span className="block text-xs text-gray-400">Cases: {myCases.length}</span>
            <span className="block text-xs text-gray-500">Region: {mostActiveRegion}</span>
          </div>
          <div className="flex flex-col items-end">
            <span className="text-base font-semibold text-white">
              {profile ? `${profile.firstName || ''} ${profile.surname || ''}`.trim() || 'Investigator' : 'Loading...'}
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
  
      {showMenu && !aiOpen && (
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
            <Briefcase className="h-4 w-4" />
            My Cases
          </div>
          {profile?.role === 'admin' && (
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
  
      <div className={`mx-6 mt-6 flex justify-center gap-8 rounded-full border border-white/10 bg-white/[0.02] px-6 py-2 text-xs font-semibold text-gray-300 shadow-[0_15px_40px_rgba(15,23,42,0.45)] backdrop-blur-xl ${aiOpen ? 'pointer-events-none blur-sm' : ''}`}>
        <Link to="/home" className="text-gray-400 transition hover:text-white">
          Home
        </Link>
        <Link to="/new-case" className="text-gray-400 transition hover:text-white">
          New Case
        </Link>
        <Link to="/manage-cases" className="text-gray-400 transition hover:text-white">
          Manage Cases
        </Link>
        <span className="inline-flex items-center rounded-full bg-gradient-to-r from-blue-900/80 to-purple-900/80 px-5 py-1.5 text-white shadow-[0_12px_30px_rgba(15,23,42,0.45)]">
          My Cases
        </span>
      </div>
  
      <div className={`mx-auto mt-8 flex w-full max-w-7xl flex-col gap-8 px-6 pb-24 xl:flex-row ${aiOpen ? 'pointer-events-none blur-sm' : ''}`}>
        <div className="flex-1 space-y-8 xl:pr-6">
          <section className="relative overflow-hidden rounded-3xl border border-white/10 bg-white/[0.02] px-8 py-8 shadow-[0_35px_90px_rgba(15,23,42,0.55)] backdrop-blur-2xl">
            <div className="pointer-events-none absolute -top-28 right-0 h-56 w-56 rounded-full bg-blue-900/25 blur-3xl" />
            <div className="pointer-events-none absolute -bottom-24 left-0 h-48 w-48 rounded-full bg-purple-900/20 blur-3xl" />
            <div className="relative z-10 flex flex-col gap-8 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.35em] text-gray-400">Case Portfolio</p>
                <h1 className="mt-3 text-3xl font-semibold text-white">Monitor ongoing investigations</h1>
                <p className="mt-3 max-w-xl text-sm text-gray-400">
                  Filter by geography, status, or urgency to surface the caseload that needs your focus. Hover a case to preview timeline checkpoints or jump directly into annotations.
                </p>
                <div className="mt-6 flex flex-wrap gap-3">
                  <button
                    type="button"
                    onClick={() => handleSearch()}
                    className="inline-flex items-center justify-center rounded-full bg-gradient-to-r from-blue-600 to-indigo-600 px-5 py-2 text-sm font-semibold text-white shadow-lg shadow-blue-500/20 transition hover:from-blue-500 hover:to-indigo-500"
                  >
                    Refresh list
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setSearchTerm('');
                      setRegion('');
                      setProvinceCode('');
                      setDistrictCode('');
                      setDate('');
                      setStatusFilter('');
                      setUrgencyFilter('');
                      handleSearch({ searchTerm: '', provinceCode: '', districtCode: '', date: '' });
                    }}
                    className="inline-flex items-center justify-center rounded-full border border-white/15 bg-white/[0.05] px-5 py-2 text-sm font-semibold text-gray-200 transition hover:border-white/30 hover:text-white"
                  >
                    Clear filters
                  </button>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4 text-sm text-gray-300">
                <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-4">
                  <p className="text-xs uppercase tracking-wide text-gray-500">Total cases</p>
                  <p className="mt-2 text-2xl font-semibold text-white">{totalCases}</p>
                  <p className="text-xs text-gray-500">Assigned to you</p>
                </div>
                <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-4">
                  <p className="text-xs uppercase tracking-wide text-gray-500">In progress</p>
                  <p className="mt-2 text-2xl font-semibold text-amber-300">{inProgress}</p>
                  <p className="text-xs text-gray-500">Active missions</p>
                </div>
                <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-4">
                  <p className="text-xs uppercase tracking-wide text-gray-500">Completed</p>
                  <p className="mt-2 text-2xl font-semibold text-emerald-300">{completed}</p>
                  <p className="text-xs text-gray-500">Closed with reports</p>
                </div>
                <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-4">
                  <p className="text-xs uppercase tracking-wide text-gray-500">Most active region</p>
                  <p className="mt-2 text-lg font-semibold capitalize text-white">{mostActiveRegion}</p>
                  <p className="text-xs text-gray-500">Based on case distribution</p>
                </div>
              </div>
            </div>
          </section>
  
          <section className="rounded-3xl border border-white/10 bg-white/[0.018] p-6 shadow-[0_25px_70px_rgba(15,23,42,0.45)] backdrop-blur-2xl">
            <div className="grid w-full gap-4 md:grid-cols-2 lg:grid-cols-5">
              <input
                type="text"
                placeholder="Search case title or number"
                className="w-full rounded-2xl border border-white/12 bg-white/[0.05] px-4 py-3 text-sm text-white placeholder-gray-500 focus:border-blue-600/60 focus:outline-none focus:ring-2 focus:ring-blue-600/20"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
              <div className="relative">
                <button
                  type="button"
                  onClick={() => setShowRegionModal(true)}
                  className="w-full rounded-2xl border border-white/12 bg-white/[0.05] pl-10 pr-4 py-3 text-left text-sm text-white shadow-inner shadow-black/20 focus:border-indigo-600/60 focus:outline-none focus:ring-2 focus:ring-indigo-600/20"
                >
                  <FaMapMarkerAlt className="absolute left-3 top-3.5 h-4 w-4 text-gray-400" />
                  <span className="block truncate">{region || 'Region'}</span>
                </button>
              </div>
              <input
                type="date"
                className="w-full rounded-2xl border border-white/12 bg-white/[0.05] px-4 py-3 text-sm text-white focus:border-purple-600/60 focus:outline-none focus:ring-2 focus:ring-purple-600/20"
                value={date}
                onChange={(e) => setDate(e.target.value)}
              />
              <select
                className="w-full rounded-2xl border border-white/12 bg-white/[0.05] px-4 py-3 text-sm text-white focus:border-emerald-600/60 focus:outline-none focus:ring-2 focus:ring-emerald-600/20"
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
              >
                <option value="">All statuses</option>
                <option value="not started">Not Started</option>
                <option value="in progress">In Progress</option>
                <option value="completed">Completed</option>
              </select>
              <div className="flex gap-3">
                <select
                  className="w-full rounded-2xl border border-white/12 bg-white/[0.05] px-4 py-3 text-sm text-white focus:border-amber-600/60 focus:outline-none focus:ring-2 focus:ring-amber-600/20"
                  value={urgencyFilter}
                  onChange={(e) => setUrgencyFilter(e.target.value)}
                >
                  <option value="">All urgencies</option>
                  <option value="Low">Low</option>
                  <option value="Medium">Medium</option>
                  <option value="High">High</option>
                  <option value="Critical">Critical</option>
                </select>
                <button
                  onClick={handleSearch}
                  className="inline-flex items-center justify-center rounded-2xl bg-gradient-to-r from-blue-600 to-indigo-600 px-4 py-3 text-sm font-semibold text-white shadow-lg shadow-blue-500/20 transition hover:from-blue-500 hover:to-indigo-500"
                >
                  Search
                </button>
              </div>
            </div>
          </section>
  
          <section className="rounded-3xl border border-white/10 bg-white/[0.018] p-6 shadow-[0_25px_70px_rgba(15,23,42,0.45)] backdrop-blur-2xl">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-white">Case library</h2>
              <span className="rounded-full bg-white/[0.05] px-3 py-1 text-xs font-medium text-gray-300">
                {myCases.length} item{myCases.length === 1 ? '' : 's'}
              </span>
            </div>
            <div className="mt-4 space-y-3">
              {myCases.length > 0 ? (
                paginatedCases.map((caseItem) => (
                  <div
                    key={caseItem.doc_id}
                    className={`relative rounded-2xl border px-4 py-4 transition hover:border-blue-500/40 hover:bg-white/[0.06] ${
                      selectedCase?.doc_id === caseItem.doc_id
                        ? 'border-blue-500/60 bg-blue-500/10'
                        : 'border-white/10 bg-white/[0.04]'
                    }`}
                    onClick={() => handleSelectCase(caseItem)}
                    onMouseEnter={() => setHoveredCase(caseItem)}
                    onMouseLeave={() => setHoveredCase(null)}
                  >
                    <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                      <div>
                        <p className="flex items-center gap-3 text-base font-semibold text-white">
                          {caseItem.caseTitle || 'Untitled case'}
                          {caseItem.urgency && (
                            <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${tagColors[caseItem.urgency] || 'border border-white/20 bg-white/10 text-white'}`}>
                              {caseItem.urgency}
                            </span>
                          )}
                        </p>
                        <div className="mt-2 flex flex-wrap gap-x-4 gap-y-2 text-xs text-gray-400">
                          <span className="flex items-center gap-1">
                            <Hash size={12} />
                            {caseItem.caseNumber || 'â€”'}
                          </span>
                          <span className="flex items-center gap-1">
                            <Calendar size={12} />
                            {caseItem.dateOfIncident || 'N/A'}
                          </span>
                          <span className="flex items-center gap-1 capitalize">
                            <MapPin size={12} />
                            {prettyRegion(caseItem) || 'Unknown region'}
                          </span>
                          <span className="flex items-center gap-1">
                            <Route size={12} />
                            {caseItem.between || 'No range specified'}
                          </span>
                        </div>
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        <select
                          className="rounded-xl border border-white/12 bg-white/[0.05] px-3 py-2 text-xs text-white focus:border-blue-500/60 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                          value={caseItem.status}
                          onClick={(e) => e.stopPropagation()}
                          onChange={(e) => handleStatusChange(caseItem, e.target.value)}
                        >
                          <option value="not started">Not Started</option>
                          <option value="in progress">In Progress</option>
                          <option value="completed">Completed</option>
                        </select>
                        <select
                          className="rounded-xl border border-white/12 bg-white/[0.05] px-3 py-2 text-xs text-white focus:border-purple-500/50 focus:outline-none focus:ring-2 focus:ring-purple-500/20"
                          value={caseItem.urgency || ''}
                          onClick={(e) => e.stopPropagation()}
                          onChange={(e) => handleTagChange(caseItem, e.target.value)}
                        >
                          <option value="">Set urgency</option>
                          <option value="Low">Low</option>
                          <option value="Medium">Medium</option>
                          <option value="High">High</option>
                          <option value="Critical">Critical</option>
                        </select>
                        <Link
                          to="/edit-case"
                          state={{ caseData: { ...caseItem } }}
                          onClick={(e) => e.stopPropagation()}
                          className="inline-flex items-center justify-center rounded-full border border-white/20 px-4 py-2 text-xs font-semibold text-gray-200 transition hover:border-blue-500/60 hover:text-white"
                        >
                          Manage
                        </Link>
                      </div>
                    </div>
                  {hoveredCase?.doc_id === caseItem.doc_id && (
                    <div className="absolute right-0 top-0 z-[120] w-80 translate-x-[calc(100%+1rem)] rounded-2xl border border-white/10 bg-black/85 p-4 text-xs text-gray-200 shadow-2xl backdrop-blur-xl">
                        <h3 className="mb-2 flex items-center gap-2 text-sm font-semibold text-white">
                          <Info size={14} /> Case metadata
                        </h3>
                        <div className="space-y-2">
                          <p className="flex items-center gap-2">
                            <Calendar size={12} />
                            Date: {caseItem.dateOfIncident || 'N/A'}
                          </p>
                          <p className="flex items-center gap-2 capitalize">
                            <MapPin size={12} />
                            Region: {prettyRegion(caseItem) || 'Unknown'}
                          </p>
                          <p className="flex items-center gap-2">
                            <Route size={12} />
                            Between: {caseItem.between || 'N/A'}
                          </p>
                          <p className="flex items-center gap-2">
                            <Hash size={12} />
                            Case #: {caseItem.caseNumber || 'N/A'}
                          </p>
                          <p className="flex items-center gap-2">
                            <span
                              className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                                caseItem.status === 'completed'
                                  ? 'bg-emerald-500/15 text-emerald-200 border border-emerald-400/40'
                                  : caseItem.status === 'in progress'
                                  ? 'bg-amber-500/15 text-amber-200 border border-amber-400/40'
                                  : 'bg-rose-500/20 text-rose-200 border border-rose-400/40'
                              }`}
                            >
                              {caseItem.status}
                            </span>
                          </p>
                          {hoverData && (
                            <div className="pt-2 text-[11px] text-gray-300">
                              <p className="font-semibold text-gray-200">Points</p>
                              <button
                                type="button"
                                onClick={() => openStreetView(hoverData.first.lat, hoverData.first.lng)}
                                className="mt-1 block w-full rounded border border-white/10 bg-white/[0.04] px-2 py-1 text-left text-xs text-white transition hover:border-blue-400/40 hover:text-blue-200"
                              >
                                 First: {hoverData.first.lat.toFixed(4)}, {hoverData.first.lng.toFixed(4)}
                              </button>
                              <button
                                type="button"
                                onClick={() => openStreetView(hoverData.last.lat, hoverData.last.lng)}
                                className="mt-1 block w-full rounded border border-white/10 bg-white/[0.04] px-2 py-1 text-left text-xs text-white transition hover:border-blue-400/40 hover:text-blue-200"
                              >
                                 Last: {hoverData.last.lat.toFixed(4)}, {hoverData.last.lng.toFixed(4)}
                              </button>
                            </div>
                          )}
                        </div>
                      </div>
                  )}
                </div>
              ))
            ) : (
              <p className="text-sm text-gray-400">You have no cases yet.</p>
            )}
            </div>
            {myCases.length > CASES_PER_PAGE && (
              <div className="mt-4 flex items-center justify-between text-xs text-gray-400">
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setCasePage((prev) => Math.max(prev - 1, 1));
                  }}
                  disabled={casePage === 1}
                  className="rounded-full border border-white/15 px-3 py-1 text-xs font-semibold text-gray-200 transition hover:border-white/30 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  Previous
                </button>
                <span>
                  Page {casePage} of {totalCasePages}
                </span>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setCasePage((prev) => Math.min(prev + 1, totalCasePages));
                  }}
                  disabled={casePage === totalCasePages}
                  className="rounded-full border border-white/15 px-3 py-1 text-xs font-semibold text-gray-200 transition hover:border-white/30 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  Next
                </button>
              </div>
            )}
          </section>
        </div>
  
        <aside className="w-full space-y-6 xl:w-[360px]">
          <section className="rounded-3xl border border-white/10 bg-white/[0.018] p-6 shadow-[0_25px_70px_rgba(15,23,42,0.45)] backdrop-blur-2xl">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-white">Selected case</h2>
              {selectedCase && (
                <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                  tagColors[selectedCase.urgency] || 'border border-white/20 bg-white/10 text-white'
                }`}>
                  {selectedCase.urgency || 'No urgency'}
                </span>
              )}
            </div>
            {selectedCase ? (
              <div className="mt-4 space-y-4 text-sm text-gray-300">
                <div className="space-y-2">
                  <p className="flex items-center gap-2">
                    <Hash size={14} />
                    Case #: {selectedCase.caseNumber || 'N/A'}
                  </p>
                  <p className="flex items-center gap-2">
                    <Calendar size={14} />
                    {selectedCase.dateOfIncident || 'Date unknown'}
                  </p>
                  <p className="flex items-center gap-2 capitalize">
                    <MapPin size={14} />
                    {prettyRegion(selectedCase) || 'Region unknown'}
                  </p>
                  <p className="flex items-center gap-2">
                    <Route size={14} />
                    {selectedCase.between || 'No window specified'}
                  </p>
                  <p className="flex items-center gap-2">
                    <Info size={14} />
                    Status: {selectedCase.status}
                  </p>
                </div>
                <div className="flex flex-wrap gap-3">
                  <Link
                    to="/edit-case"
                    state={{ caseData: { ...selectedCase } }}
                    className="inline-flex items-center justify-center rounded-full bg-gradient-to-r from-blue-600 to-indigo-600 px-4 py-2 text-xs font-semibold text-white shadow-lg shadow-blue-500/20 transition hover:from-blue-500 hover:to-indigo-500"
                  >
                    Manage Case
                  </Link>
                  <button
                    type="button"
                    onClick={openAISummary}
                    className="inline-flex items-center justify-center rounded-full border border-white/15 bg-white/[0.05] px-4 py-2 text-xs font-semibold text-gray-200 transition hover:border-white/30 hover:text-white"
                  >
                    AI Summary
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      localStorage.setItem('trackxCaseData', JSON.stringify({
                        caseId: selectedCase.doc_id,
                        caseNumber: selectedCase.caseNumber,
                        caseTitle: selectedCase.caseTitle,
                      }));
                      window.open('/simulation', '_blank');
                    }}
                    className="inline-flex items-center justify-center rounded-full border border-emerald-400/40 bg-emerald-500/10 px-4 py-2 text-xs font-semibold text-emerald-200 transition hover:border-emerald-400/60 hover:text-white"
                  >
                    View Simulation
                  </button>
                  <button
                    type="button"
                    onClick={requestCaseDeletion}
                    className="inline-flex items-center justify-center rounded-full border border-rose-500/40 bg-rose-500/10 px-4 py-2 text-xs font-semibold text-rose-200 transition hover:border-rose-500/60 hover:text-white"
                  >
                    Delete Case
                  </button>
                </div>
              </div>
            ) : (
              <p className="mt-4 text-sm text-gray-400">Select a case to view details and actions.</p>
            )}
          </section>
  
          <section className="rounded-3xl border border-white/10 bg-white/[0.018] p-6 shadow-[0_25px_70px_rgba(15,23,42,0.45)] backdrop-blur-2xl">
            <h2 className="text-lg font-semibold text-white">Case breakdown</h2>
            {totalCases > 0 ? (
              <div className="h-44">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={pieData} dataKey="value" nameKey="name" innerRadius={45} outerRadius={60} paddingAngle={3}>
                      {pieData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip
                      contentStyle={{ background: 'rgba(15,23,42,0.8)', border: 'none', borderRadius: '0.75rem', color: '#fff' }}
                    />
                    <Legend verticalAlign="bottom" height={24} iconType="circle" wrapperStyle={{ color: '#cbd5f5', fontSize: '0.75rem' }} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <p className="mt-4 text-xs text-gray-400">No analytics available yet.</p>
            )}
          </section>
  
          {heatPoints.length > 0 && (
            <section className="rounded-3xl border border-white/10 bg-white/[0.018] p-6 shadow-[0_25px_70px_rgba(15,23,42,0.45)] backdrop-blur-2xl">
              <h2 className="text-lg font-semibold text-white">Heatmap preview</h2>
              <p className="mb-3 text-xs text-gray-400">Click the map to open the full analytics workspace.</p>
              <MiniHeatMapWindow points={heatPoints} />
            </section>
          )}
  
          <section className="flex h-full flex-col rounded-3xl border border-white/10 bg-white/[0.018] p-6 shadow-[0_25px_70px_rgba(15,23,42,0.45)] backdrop-blur-2xl">
            <h2 className="text-lg font-semibold text-white">Notifications</h2>
            {notifications.length > 0 ? (
              <div className="mt-4 flex flex-1 flex-col overflow-hidden">
                <ul className="space-y-3 overflow-y-auto pr-1 text-sm text-gray-200">
                  {notifications.map((notification) => (
                    <li
                      key={notification.id}
                      className={`rounded-2xl border px-4 py-3 transition ${
                        notification.read
                          ? 'border-white/10 bg-white/[0.04]'
                          : 'border-blue-500/40 bg-blue-500/10'
                      }`}
                    >
                      <p className="text-sm font-semibold text-white">{notification.title}</p>
                      <p className="text-xs text-gray-300">{notification.message}</p>
                      <p className="mt-1 text-[11px] text-gray-500">{new Date(notification.timestamp).toLocaleString()}</p>
                      <button
                        onClick={() => toggleReadStatus(notification)}
                        className={`mt-2 inline-flex items-center rounded-full px-3 py-1 text-[11px] font-semibold transition ${
                          notification.read
                            ? 'border border-emerald-400/40 bg-emerald-500/15 text-emerald-200 hover:border-emerald-400/60'
                            : 'border border-blue-400/40 bg-blue-500/15 text-blue-200 hover:border-blue-400/60'
                        }`}
                      >
                        {notification.read ? 'Mark as unread' : 'Mark as read'}
                      </button>
                    </li>
                  ))}
                </ul>
                <div className="mt-4 flex items-center justify-between text-xs text-gray-400">
                  <button
                    onClick={handlePreviousPage}
                    disabled={currentPage === 1}
                    className="rounded-full border border-white/15 px-3 py-1 text-xs font-semibold text-gray-200 transition hover:border-white/30 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    Previous
                  </button>
                  <span>
                    Page {currentPage} of {Math.max(Math.ceil(totalNotifications / notificationsPerPage), 1)}
                  </span>
                  <button
                    onClick={handleNextPage}
                    disabled={currentPage === Math.ceil(totalNotifications / notificationsPerPage)}
                    className="rounded-full border border-white/15 px-3 py-1 text-xs font-semibold text-gray-200 transition hover:border-white/30 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    Next
                  </button>
                </div>
              </div>
            ) : (
              <p className="mt-4 text-sm text-gray-400">No notifications available.</p>
            )}
          </section>
        </aside>
      </div>
  
      {aiOpen && (
        <div className="fixed inset-0 z-50">
          <div
            className="absolute inset-0 bg-black/70 backdrop-blur-sm"
            onClick={() => !aiLoading && setAiOpen(false)}
          />
          <div className="relative mx-auto mt-12 w-11/12 max-w-2xl rounded-3xl border border-white/10 bg-white/[0.04] p-6 text-white shadow-[0_35px_90px_rgba(15,23,42,0.65)] backdrop-blur-2xl">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold">
                AI Summary {selectedCase ? `- ${selectedCase.caseTitle}` : ''}
              </h2>
              <button
                className={`rounded-full border border-white/15 px-3 py-1 text-xs font-semibold text-gray-200 transition hover:border-white/30 ${aiLoading ? 'cursor-not-allowed opacity-50' : ''}`}
                onClick={() => !aiLoading && setAiOpen(false)}
                disabled={aiLoading}
              >
                Close
              </button>
            </div>
            <div className="mt-4 max-h-[60vh] overflow-y-auto rounded-2xl border border-white/10 bg-white/[0.03] p-4 text-sm text-gray-200">
              {aiLoading && <Spinner />}
              {!aiLoading && aiError && (
                <div className="rounded-2xl border border-rose-500/40 bg-rose-500/10 p-3 text-sm text-rose-100">
                  {aiError}
                </div>
              )}
              {!aiLoading && !aiError && (
                <pre className="whitespace-pre-wrap text-sm text-gray-200">{aiMarkdown}</pre>
              )}
            </div>
            {!aiLoading && !aiError && (
              <div className="mt-4 flex gap-3">
                <button
                  className="inline-flex items-center justify-center rounded-full border border-white/15 bg-white/[0.05] px-4 py-2 text-xs font-semibold text-gray-200 transition hover:border-white/30 hover:text-white"
                  onClick={() => {
                    const blob = new Blob([aiMarkdown], { type: 'text/markdown' });
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement('a');
                    a.href = url;
                    a.download = `AI_Summary_${selectedCase?.caseNumber || 'case'}.md`;
                    a.click();
                    URL.revokeObjectURL(url);
                  }}
                >
                  Download .md
                </button>
              </div>
            )}
          </div>
        </div>
      )}
            <RegionSelectorModal
        isOpen={showRegionModal}
        onClose={() => setShowRegionModal(false)}
        onSelect={({ provinceCode: pCode, provinceName: pName, districtCode: dCode }) => {
          setProvinceCode(pCode || "");
          setRegion(pName || "");
          setDistrictCode(dCode || "");
        }}
      /></motion.div>
      <NotificationModal
        isOpen={modalState.isOpen}
        title={modalState.title}
        description={modalState.description}
        variant={modalState.variant}
        onClose={closeModal}
        primaryAction={modalState.primaryAction}
        secondaryAction={modalState.secondaryAction}
      />
    </>
  );
}

export default MyCasesPage;





