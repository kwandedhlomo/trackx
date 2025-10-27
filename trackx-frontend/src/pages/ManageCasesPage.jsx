import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { FaSearch, FaMapMarkerAlt, FaCalendarAlt } from "react-icons/fa";
import adfLogo from "../assets/image-removebg-preview.png";
import { useState, useEffect, useMemo } from "react";
import axios from "axios";
import { useAuth } from "../context/AuthContext";
import { signOut } from "firebase/auth";
import { auth } from "../firebase";
import { useNavigate } from "react-router-dom";
import NotificationModal from "../components/NotificationModal";
import useNotificationModal from "../hooks/useNotificationModal";
import { getFriendlyErrorMessage } from "../utils/errorMessages";
import { Home, FilePlus2, FolderOpen, Briefcase, LayoutDashboard } from "lucide-react";
import ZA_REGIONS from "../data/za_regions";
import RegionSelectorModal from "../components/RegionSelectorModal";
import NotificationBell from "../components/NotificationBell";



function ManageCasesPage() {
  const [searchTerm, setSearchTerm] = useState("");
  const [region, setRegion] = useState("");
  const [provinceCode, setProvinceCode] = useState("");
  const [districtCode, setDistrictCode] = useState("");
  const [showRegionModal, setShowRegionModal] = useState(false);

  const selectedRegionLabel = useMemo(() => {
    const pName = region || ZA_REGIONS.find(p => p.code === provinceCode)?.name || "";
    const prov = ZA_REGIONS.find(p => p.code === provinceCode);
    const dName = prov?.districts?.find(d => String(d.code) === String(districtCode))?.name || "";
    if (!pName && !dName) return "";
    return dName ? `${pName} - ${dName}` : pName;
  }, [region, provinceCode, districtCode]);
  const [date, setDate] = useState("");
  const [cases, setCases] = useState([]);
  const { profile } = useAuth();
  const navigate = useNavigate(); 
  const [showMenu, setShowMenu] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const casesPerPage = 10; // You can change this value based on your preference
  const indexOfLastCase = currentPage * casesPerPage;
  const indexOfFirstCase = indexOfLastCase - casesPerPage;
  const currentCases = cases.slice(indexOfFirstCase, indexOfLastCase);
  const totalPages = Math.ceil(cases.length / casesPerPage);
  const { modalState, openModal, closeModal } = useNotificationModal();
  const formattedDateTime = new Date().toLocaleString();

  useEffect(() => {
    handleSearch(); // Triggers unfiltered search on first load
  }, []);
  


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
    setRegion(prov ? prov.name : "");

    try {
      const response = await axios.get("http://localhost:8000/cases/search", {
        params: {
          searchTerm: nextSearchTerm || undefined,
          region: prov?.name || undefined,
          provinceCode: nextProvinceCode || undefined,
          districtCode: nextDistrictCode || undefined,
          date: nextDate || undefined,
        }
      });
      setCases(Array.isArray(response.data.cases) ? response.data.cases : []);
      setCurrentPage(1);
    } catch (error) {
      console.error("Search failed:", error);
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

  /*const performDelete = async (caseItem) => {
    closeModal();
    try {
      await axios.delete(`http://localhost:8000/cases/delete/${caseItem.doc_id}`);
      openModal({
        variant: "success",
        title: "Case deleted",
        description: `"${caseItem.caseTitle}" has been removed successfully.`,
      });
      handleSearch(); 
    } catch (err) {
      console.error("Delete failed:", err);
      openModal({
        variant: "error",
        title: "Delete failed",
        description: getFriendlyErrorMessage(err, "Failed to delete the case. Please try again."),
      });
    }
  };
  */

  const performSoftDelete = async (caseItem) => {
  closeModal();
  try {
    await axios.put(`http://localhost:8000/cases/soft-delete/${caseItem.doc_id}`);
    openModal({
      variant: "success",
      title: "Case moved to Trash",
      description: `"${caseItem.caseTitle}" has been moved to the Trash Bin.`,
    });
    handleSearch();
  } catch (err) {
    console.error("Soft delete failed:", err);
    openModal({
      variant: "error",
      title: "Delete failed",
      description: getFriendlyErrorMessage(err, "Failed to move case to Trash. Please try again."),
    });
  }
};

 /* const confirmDelete = (caseItem) => {
    openModal({
      variant: "warning",
      title: "Delete case?",
      description: `Are you sure you want to delete "${caseItem.caseTitle}"? This action cannot be undone.`,
      primaryAction: {
        label: "Delete case",
        closeOnClick: false,
        onClick: () => performDelete(caseItem),
      },
      secondaryAction: {
        label: "Cancel",
      },
    });
  };
  */
 const confirmDelete = (caseItem) => {
  openModal({
    variant: "warning",
    title: "Move to Trash?",
    description: `Are you sure you want to move "${caseItem.caseTitle}" to the Trash Bin? You can restore it later.`,
    primaryAction: {
      label: "Move to Trash",
      closeOnClick: false,
      onClick: () => performSoftDelete(caseItem),
    },
    secondaryAction: {
      label: "Cancel",
    },
  });
};


  return (
    <motion.div
      initial={{ opacity: 0, y: 18 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.8 }}
      className="relative min-h-screen overflow-hidden bg-gradient-to-br from-black via-gray-900 to-black font-sans text-white"
    >
      <div className="absolute inset-0 bg-gradient-to-br from-black via-gray-900 to-black -z-10" />
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(59,130,246,0.14),transparent_55%)]" />

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
              src={adfLogo}
              alt="ADF Logo"
              className="h-11 w-auto drop-shadow-[0_10px_20px_rgba(59,130,246,0.35)] transition hover:opacity-90"
            />
          </Link>
        </div>

        <div className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 text-2xl font-semibold tracking-[0.35em] text-white/80 drop-shadow-[0_2px_12px_rgba(15,23,42,0.55)]">
          MANAGE CASES
        </div>

        <div className="flex items-center gap-4 text-sm text-gray-200">
          <NotificationBell className="hidden lg:block" />
          <Link
            to="/home"
            className="hidden md:inline-flex items-center rounded-full border border-white/10 bg-white/[0.02] px-4 py-2 text-xs font-semibold text-gray-200 shadow-inner shadow-white/5 transition hover:border-white/25 hover:text-white"
          >
            Home
          </Link>
          <div className="hidden text-right lg:block">
            <span className="block text-xs text-gray-400">
              {cases.length} case{cases.length === 1 ? "" : "s"} found
            </span>
            <span className="block text-xs text-gray-500">Page {currentPage} of {Math.max(totalPages, 1)}</span>
          </div>
          <div className="flex flex-col items-end">
            <span className="text-base font-semibold text-white">
              {profile ? `${profile.firstName || ""} ${profile.surname || ""}`.trim() || "Investigator" : "Loading..."}
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
          <div className="flex items-center gap-3 rounded-2xl px-3 py-2 text-sm font-medium text-white bg-white/[0.045] shadow-inner shadow-white/10">
            <FolderOpen className="h-4 w-4" />
            Manage Cases
          </div>
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
        <Link to="/home" className="text-gray-400 transition hover:text-white">
          Home
        </Link>
        <Link to="/new-case" className="text-gray-400 transition hover:text-white">
          New Case
        </Link>
        <span className="inline-flex items-center rounded-full bg-gradient-to-r from-blue-900/80 to-purple-900/80 px-5 py-1.5 text-white shadow-[0_12px_30px_rgba(15,23,42,0.45)]">
          Manage Cases
        </span>
        <Link to="/my-cases" className="text-gray-400 transition hover:text-white">
          My Cases
        </Link>
        <Link
          to="/trash-bin"
          className="text-gray-400 transition hover:text-white"
          onClick={() => setShowMenu(false)}
        >
          Trash Bin
        </Link>

      </div>

      <main className="pb-24">
        <section className="relative mx-auto mt-10 w-full max-w-6xl px-6">
          <div className="relative overflow-hidden rounded-3xl border border-white/10 bg-white/[0.02] px-8 py-8 shadow-[0_35px_90px_rgba(15,23,42,0.55)] backdrop-blur-2xl">
            <div className="pointer-events-none absolute -top-28 right-0 h-56 w-56 rounded-full bg-blue-900/25 blur-3xl" />
            <div className="pointer-events-none absolute -bottom-24 left-0 h-48 w-48 rounded-full bg-purple-900/20 blur-3xl" />
            <div className="relative z-10 flex flex-col gap-10 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.35em] text-gray-400">Case Library</p>
                <h1 className="mt-3 text-3xl font-semibold text-white">Orchestrate your investigations</h1>
                <p className="mt-3 max-w-xl text-sm text-gray-400">
                  Search, filter, and maintain case metadata across your TrackX workspace. Keep collaborators aligned and your docket pristine.
                </p>
                <div className="mt-6 flex flex-wrap gap-3">
                  <Link
                    to="/new-case"
                    className="inline-flex items-center justify-center rounded-full bg-gradient-to-r from-blue-600 to-indigo-600 px-6 py-2.5 text-sm font-semibold text-white shadow-lg shadow-blue-500/25 transition hover:from-blue-500 hover:to-indigo-500"
                  >
                    + Create case
                  </Link>
                  <Link
                    to="/home"
                    className="inline-flex items-center justify-center rounded-full border border-white/15 bg-white/[0.04] px-6 py-2.5 text-sm font-semibold text-gray-200 transition hover:border-white/30 hover:text-white"
                  >
                    Back home
                  </Link>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4 text-sm text-gray-300">
                <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-4">
                  <p className="text-xs uppercase tracking-wide text-gray-500">Matches</p>
                  <p className="mt-2 text-2xl font-semibold text-white">{cases.length}</p>
                  <p className="text-xs text-gray-500">Based on your current filters.</p>
                </div>
                <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-4">
                  <p className="text-xs uppercase tracking-wide text-gray-500">Page results</p>
                  <p className="mt-2 text-2xl font-semibold text-white">{currentCases.length}</p>
                  <p className="text-xs text-gray-500">Showing per page.</p>
                </div>
                <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-4">
                  <p className="text-xs uppercase tracking-wide text-gray-500">Region filter</p>
                  <p className="mt-2 text-base font-medium capitalize text-white">{region ? region.replace(/-/g, " ") : "All regions"}</p>
                  <p className="text-xs text-gray-500">Narrow by geography.</p>
                </div>
                <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-4">
                  <p className="text-xs uppercase tracking-wide text-gray-500">Date filter</p>
                  <p className="mt-2 text-base font-medium text-white">{date || "Any date"}</p>
                  <p className="text-xs text-gray-500">Target event windows.</p>
                </div>
              </div>
            </div>
          </div>
        </section>

        <div className="mx-auto mt-10 w-full max-w-6xl px-6 space-y-8">
          <div className="rounded-3xl border border-white/10 bg-white/[0.018] p-6 shadow-[0_25px_70px_rgba(15,23,42,0.45)] backdrop-blur-2xl">
            <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
              <div className="grid w-full gap-4 md:grid-cols-2 lg:grid-cols-5">
                <div className="relative">
                  <FaSearch className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
                  <input
                    type="text"
                    placeholder="Search case"
                    className="w-full rounded-2xl border border-white/12 bg-white/[0.05] px-10 py-3 text-sm text-white placeholder-gray-500 shadow-inner shadow-black/20 focus:border-blue-600/60 focus:outline-none focus:ring-2 focus:ring-blue-600/20"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                  />
                </div>
                <div className="relative">
                  <button
                    type="button"
                    onClick={() => setShowRegionModal(true)}
                    className="w-full appearance-none rounded-2xl border border-white/12 bg-white/[0.05] pl-10 pr-4 py-3 text-left text-sm text-white shadow-inner shadow-black/20 focus:border-indigo-600/60 focus:outline-none focus:ring-2 focus:ring-indigo-600/20"
                  >
                    <FaMapMarkerAlt className="absolute left-3 top-3.5 h-4 w-4 text-gray-400" />
                    <span className="block truncate">{selectedRegionLabel || 'Region'}</span>
                  </button>
                </div>
                <div className="relative">
                  <FaCalendarAlt className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
                  <input
                    type="date"
                    value={date}
                    onChange={(e) => setDate(e.target.value)}
                    className="w-full rounded-2xl border border-white/12 bg-white/[0.05] px-10 py-3 text-sm text-white shadow-inner shadow-black/20 focus:border-purple-600/60 focus:outline-none focus:ring-2 focus:ring-purple-600/20"
                  />
                </div>
                <button
                  onClick={handleSearch}
                  className="inline-flex items-center justify-center rounded-2xl bg-gradient-to-r from-blue-600 to-indigo-600 px-4 py-3 text-sm font-semibold text-white shadow-lg shadow-blue-500/20 transition hover:from-blue-500 hover:to-indigo-500"
                >
                  Search
                </button>
              </div>
              <button
                onClick={() => handleSearch({ searchTerm: "", provinceCode: "", districtCode: "", date: "" })}
                className="inline-flex items-center justify-center rounded-full border border-white/15 bg-white/[0.03] px-4 py-2 text-xs font-semibold text-gray-300 transition hover:border-white/30 hover:text-white"
              >
                Clear filters
              </button>
            </div>
            <RegionSelectorModal
              isOpen={showRegionModal}
              onClose={() => setShowRegionModal(false)}
              onSelect={({ provinceCode: pCode, provinceName: pName, districtCode: dCode }) => {
                setProvinceCode(pCode || "");
                setRegion(pName || "");
                setDistrictCode(dCode || "");
              }}
            />
          </div>

          <div className="rounded-3xl border border-white/10 bg-white/[0.018] p-6 shadow-[0_25px_70px_rgba(15,23,42,0.45)] backdrop-blur-2xl">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2 className="text-lg font-semibold text-white">Matching cases</h2>
                <p className="text-xs text-gray-400">Refine filters to narrow the docket you want to manage.</p>
              </div>
              <span className="rounded-full bg-white/[0.05] px-3 py-1 text-xs font-medium text-gray-300">
                {cases.length} total result{cases.length === 1 ? "" : "s"}
              </span>
            </div>
            <div className="mt-6 space-y-4">
              {currentCases.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-white/12 bg-black/30 px-6 py-10 text-center text-sm text-gray-400">
                  No cases match your criteria yet. Adjust the filters or create a new case to begin.
                </div>
              ) : (
                currentCases.map((caseItem, index) => {
                  const key = caseItem.doc_id ?? `${caseItem.caseTitle || "case"}-${index}`;
                  const prettyRegion = caseItem.region ? caseItem.region.replace(/-/g, " ") : null;
                  const incidentDate = caseItem.dateOfIncident || caseItem.date_of_incident || caseItem.date || null;
                  return (
                    <div
                      key={key}
                      className="flex flex-col gap-4 rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-5 text-sm text-gray-200 shadow-[0_18px_40px_rgba(15,23,42,0.45)] transition hover:border-blue-500/40 sm:flex-row sm:items-center sm:justify-between"
                    >
                      <div>
                        <p className="text-base font-semibold text-white">{caseItem.caseTitle || "Untitled case"}</p>
                        <div className="mt-2 flex flex-wrap gap-2 text-xs text-gray-400">
                          {caseItem.caseNumber && (
                            <span className="inline-flex items-center gap-1 rounded-full bg-white/[0.05] px-2 py-1 text-[11px] font-medium text-gray-300">
                              #{caseItem.caseNumber}
                            </span>
                          )}
                          {prettyRegion && (
                            <span className="inline-flex items-center gap-1 rounded-full bg-white/[0.05] px-2 py-1 text-[11px] font-medium capitalize text-gray-300">
                              <FaMapMarkerAlt className="h-3 w-3" />
                              {prettyRegion}
                            </span>
                          )}
                          {incidentDate && (
                            <span className="inline-flex items-center gap-1 rounded-full bg-white/[0.05] px-2 py-1 text-[11px] font-medium text-gray-300">
                              <FaCalendarAlt className="h-3 w-3" />
                              {incidentDate}
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="flex flex-wrap gap-3">
                        <Link
                          to="/edit-case"
                          state={{ caseData: { ...caseItem, doc_id: caseItem.doc_id } }}
                          className="inline-flex items-center justify-center rounded-full bg-gradient-to-r from-blue-600 to-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow-lg shadow-blue-500/20 transition hover:from-blue-500 hover:to-indigo-500"
                        >
                          Manage
                        </Link>
                        <button
                          onClick={() => confirmDelete(caseItem)}
                          className="inline-flex items-center justify-center rounded-full bg-gradient-to-r from-rose-500 to-orange-500 px-4 py-2 text-sm font-semibold text-white shadow-lg shadow-rose-500/20 transition hover:from-rose-400 hover:to-orange-400"
                        >
                          Delete
                        </button>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>

          <div className="flex flex-col items-center gap-4 rounded-3xl border border-white/10 bg-white/[0.018] px-6 py-5 shadow-[0_25px_70px_rgba(15,23,42,0.45)] backdrop-blur-2xl sm:flex-row sm:justify-between">
            <div className="flex items-center gap-3">
              <button
                onClick={() => setCurrentPage((prev) => Math.max(prev - 1, 1))}
                disabled={currentPage === 1}
                className={`inline-flex items-center justify-center rounded-full px-4 py-2 text-sm font-semibold transition ${
                  currentPage === 1
                    ? "cursor-not-allowed bg-white/10 text-gray-400"
                    : "bg-gradient-to-r from-blue-600 to-indigo-600 text-white hover:from-blue-500 hover:to-indigo-500"
                }`}
              >
                Previous
              </button>
              <button
                onClick={() => setCurrentPage((prev) => Math.min(prev + 1, totalPages || 1))}
                disabled={currentPage === totalPages || totalPages === 0}
                className={`inline-flex items-center justify-center rounded-full px-4 py-2 text-sm font-semibold transition ${
                  currentPage === totalPages || totalPages === 0
                    ? "cursor-not-allowed bg-white/10 text-gray-400"
                    : "bg-gradient-to-r from-blue-600 to-indigo-600 text-white hover:from-blue-500 hover:to-indigo-500"
                }`}
              >
                Next
              </button>
            </div>
            <span className="text-xs text-gray-400">
              Page {currentPage} of {Math.max(totalPages, 1)}
            </span>
          </div>

          <div className="rounded-3xl border border-white/10 bg-white/[0.018] p-6 shadow-[0_25px_70px_rgba(15,23,42,0.45)] backdrop-blur-2xl">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="text-sm text-gray-400">Need to capture new telemetry? Start a fresh case and assign collaborators.</p>
              <div className="flex flex-wrap gap-3">
                <Link
                  to="/new-case"
                  className="inline-flex items-center justify-center rounded-full bg-gradient-to-r from-blue-600 to-indigo-600 px-5 py-2 text-sm font-semibold text-white shadow-lg shadow-blue-500/20 transition hover:from-blue-500 hover:to-indigo-500"
                >
                  + Create case
                </Link>
                <Link
                  to="/home"
                  className="inline-flex items-center justify-center rounded-full border border-white/15 bg-white/[0.04] px-5 py-2 text-sm font-semibold text-gray-200 transition hover:border-white/30 hover:text-white"
                >
                  Back home
                </Link>
              </div>
            </div>
          </div>
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

export default ManageCasesPage;
