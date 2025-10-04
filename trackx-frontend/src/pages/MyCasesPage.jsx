import { useState, useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import { auth } from "../firebase";
import { useAuth } from "../context/AuthContext";
import { signOut } from "firebase/auth";
import axios from "axios";
import adfLogo from "../assets/image-removebg-preview.png";
import trackxLogo from "../assets/trackx-logo-removebg-preview.png";
import { Calendar, MapPin, Hash, Info, Route, Home, FilePlus2, FolderOpen, Briefcase, LayoutDashboard } from "lucide-react";
import {
  PieChart,
  Pie,
  Cell,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";
import MiniHeatMapWindow from "../components/MiniHeatMapWindow";
import NotificationModal from "../components/NotificationModal";
import useNotificationModal from "../hooks/useNotificationModal";
import { getFriendlyErrorMessage } from "../utils/errorMessages";

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
  const [date, setDate] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [urgencyFilter, setUrgencyFilter] = useState("");
  const { modalState, openModal, closeModal } = useNotificationModal();

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

  // Fetch current user's cases
  const fetchCases = async () => {
    try {
      const uid = auth.currentUser?.uid;
      if (!uid) return;
      const response = await axios.get("http://localhost:8000/cases/search", {
        params: {
          user_id: uid,
          searchTerm,
          region,
          date,
          status: statusFilter,
          urgency: urgencyFilter,
        },
      });
      setMyCases(response.data.cases || []);
    } catch (error) {
      console.error("Failed to fetch user cases:", error);
    }
  };

  // Trigger search on button click
  const handleSearch = () => {
    fetchCases();
  };

  // Automatically fetch all cases for the user when the component mounts
  useEffect(() => {
    fetchCases();
  }, []);

  // Aggregate heatmap points for these cases
  const [heatPoints, setHeatPoints] = useState([]);
  useEffect(() => {
    const fetchUserHeatPoints = async () => {
      if (myCases.length === 0) return;
      try {
        let allPoints = [];
        for (let c of myCases) {
          const res = await axios.get(
            `http://localhost:8000/cases/${c.doc_id}/all-points`
          );
          allPoints = [...allPoints, ...(res.data.points || [])];
        }
        setHeatPoints(allPoints);
      } catch (e) {
        console.error("Failed to fetch user-specific heatmap points:", e);
      }
    };
    fetchUserHeatPoints();
  }, [myCases]);

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
        description: `“${caseItem.caseTitle}” has been removed successfully.`,
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
      description: `Are you sure you want to delete “${caseReference.caseTitle}”? This action cannot be undone.`,
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

  const pieData = [
    { name: "In Progress", value: inProgress },
    { name: "Completed", value: completed },
  ];
  const COLORS = ["#FBBF24", "#10B981"];

  const tagColors = {
    Low: "bg-green-700",
    Medium: "bg-yellow-600",
    High: "bg-orange-600",
    Critical: "bg-red-700",
  };

  return (
    <div className="relative flex flex-col min-h-screen">
      {/* Background */}
      <div className={`absolute inset-0 bg-gradient-to-br from-black via-gray-900 to-black -z-20 ${aiOpen ? "blur-sm" : ""}`} />

      {/* Navbar */}
      <nav className={`flex justify-between items-center bg-gradient-to-r from-black to-gray-900 bg-opacity-80 backdrop-blur-md p-4 relative font-sans z-20 ${aiOpen ? "blur-sm pointer-events-none" : ""}`}>
        <div className="flex items-center space-x-4">
          <div
            className="text-white text-3xl cursor-pointer"
            onClick={() => setShowMenu(!showMenu)}
          >
            &#9776;
          </div>
          <Link to="/home" className="inline-flex">
            <img
              src={adfLogo}
              alt="ADF Logo"
              className="h-10 cursor-pointer hover:opacity-80 transition"
            />
          </Link>
        </div>
        <div className="absolute left-1/2 transform -translate-x-1/2 text-3xl font-extrabold text-white flex items-center space-x-2">
          <img src={trackxLogo} alt="TrackX Logo Left" className="h-8" />
          <span>TRACKX</span>
          <img src={trackxLogo} alt="TrackX Logo Right" className="h-8" />
        </div>
        <div className="flex items-center space-x-6 text-white">
          <Link to="/home" className="hover:text-gray-300">Home</Link>
          <div className="flex flex-col text-right">
            <span>{profile ? profile.firstName : "Loading..."}</span>
            <button onClick={handleSignOut} className="text-sm text-gray-300 hover:text-white">
              Sign Out
            </button>
          </div>
          <div className="text-sm text-gray-300">{new Date().toLocaleString()}</div>
        </div>
      </nav>

      {showMenu && !aiOpen && (
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
          <div className="flex items-center gap-3 px-3 py-2 rounded-2xl text-sm font-medium text-white bg-white/10">
            <Briefcase className="w-4 h-4" />
            My Cases
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

      {/* Main Container */}
      <div className={`relative flex flex-row min-h-screen ${aiOpen ? "blur-sm pointer-events-none" : ""}`}>
        {/* Left Section (Main Content) */}
        <div className="flex-grow flex flex-col p-6 space-y-8">
          {/* Main heading */}
          <h1 className="text-2xl font-bold text-white mt-2">My Cases</h1>

          {/* Analytics Bar */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 w-full mb-4">
            <div className="bg-gray-800 rounded-lg p-4 text-center text-white shadow">
              <p className="text-sm text-gray-400">Total Cases</p>
              <p className="text-2xl font-bold">{totalCases}</p>
            </div>
            <div className="bg-gray-800 rounded-lg p-4 text-center text-yellow-400 shadow">
              <p className="text-sm text-gray-400">In Progress</p>
              <p className="text-2xl font-bold">{inProgress}</p>
            </div>
            <div className="bg-gray-800 rounded-lg p-4 text-center text-green-400 shadow">
              <p className="text-sm text-gray-400">Completed</p>
              <p className="text-2xl font-bold">{completed}</p>
            </div>
            <div className="bg-gray-800 rounded-lg p-4 text-center text-purple-400 shadow">
              <p className="text-sm text-gray-400">Most Active Region</p>
              <p className="text-lg font-bold">{mostActiveRegion}</p>
            </div>
          </div>

          {/* Search + Filter Row */}
          <div className="grid grid-cols-1 md:grid-cols-6 gap-4 mb-6">
            <input
              type="text"
              placeholder="Search title or number"
              className="px-3 py-2 rounded bg-white bg-opacity-10 text-white placeholder-gray-400"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />

            <select
              className="px-3 py-2 rounded bg-white bg-opacity-10 text-white"
              value={region}
              onChange={(e) => setRegion(e.target.value)}
            >
              <option value="">All Regions</option>
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

            <input
              type="date"
              className="px-3 py-2 rounded bg-white bg-opacity-10 text-white"
              value={date}
              onChange={(e) => setDate(e.target.value)}
            />

            <select
              className="px-3 py-2 rounded bg-white bg-opacity-10 text-white"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
            >
              <option value="">All Statuses</option>
              <option value="not started">Not Started</option>
              <option value="in progress">In Progress</option>
              <option value="completed">Completed</option>
            </select>

            <select
              className="px-3 py-2 rounded bg-white bg-opacity-10 text-white"
              value={urgencyFilter}
              onChange={(e) => setUrgencyFilter(e.target.value)}
            >
              <option value="">All Urgencies</option>
              <option value="Low">Low</option>
              <option value="Medium">Medium</option>
              <option value="High">High</option>
              <option value="Critical">Critical</option>
            </select>

            <button
              onClick={handleSearch}
              className="px-4 py-2 rounded bg-blue-600 text-white font-semibold shadow-md hover:bg-blue-700 transition-colors duration-200"
            >
              Search
            </button>
          </div>

          {/* Cases List */}
          <div className="w-full bg-white bg-opacity-10 border border-gray-700 rounded-lg p-6 space-y-4">
            {myCases.length > 0 ? (
              myCases.map((caseItem) => (
                <div
                  key={caseItem.doc_id}
                  className={`relative flex justify-between items-center border-b border-gray-700 pb-3 cursor-pointer rounded-md px-3 py-2 transition-colors duration-200 ${
                    selectedCase?.doc_id === caseItem.doc_id ? "bg-blue-800 bg-opacity-40" : "hover:bg-white hover:bg-opacity-10"
                  }`}
                  onClick={() => handleSelectCase(caseItem)}
                  onMouseEnter={() => setHoveredCase(caseItem)}
                  onMouseLeave={() => setHoveredCase(null)}
                >
                  <div className="flex flex-col text-gray-200">
                    <span className="font-semibold flex items-center gap-2">
                      {caseItem.caseTitle}
                      {caseItem.urgency && (
                        <span className={`text-xs px-2 py-1 rounded ${tagColors[caseItem.urgency]}`}>
                          {caseItem.urgency}
                        </span>
                      )}
                    </span>
                    <span className="text-sm text-gray-400">Status: {caseItem.status}</span>
                  </div>

                  <div className="flex items-center gap-3">
                    <select
                      className="bg-gray-800 text-white text-sm border border-gray-600 rounded px-2 py-1"
                      value={caseItem.status}
                      onChange={(e) => {
                        e.stopPropagation();
                        handleStatusChange(caseItem, e.target.value);
                      }}
                    >
                      <option value="not started">Not Started</option>
                      <option value="in progress">In Progress</option>
                      <option value="completed">Completed</option>
                    </select>

                    <select
                      className="bg-gray-800 text-white text-sm border border-gray-600 rounded px-2 py-1"
                      value={caseItem.urgency || ""}
                      onChange={(e) => {
                        e.stopPropagation();
                        handleTagChange(caseItem, e.target.value);
                      }}
                    >
                      <option value="">Set Urgency</option>
                      <option value="Low">Low</option>
                      <option value="Medium">Medium</option>
                      <option value="High">High</option>
                      <option value="Critical">Critical</option>
                    </select>

                    <Link
                      to="/edit-case"
                      state={{ caseData: { ...caseItem } }}
                      className="text-sm border border-gray-300 text-white py-1 px-3 rounded hover:bg-blue-800 hover:text-white transition-colors duration-200"
                      onClick={(e) => e.stopPropagation()}
                    >
                      Manage
                    </Link>
                  </div>

                  {hoveredCase?.doc_id === caseItem.doc_id && (
                    <div className="absolute top-0 right-0 translate-x-full -translate-y-25 ml-4 bg-gray-900 bg-opacity-90 backdrop-blur-md text-white rounded-lg shadow-lg p-4 w-80 z-40">
                      <h3 className="font-bold text-lg mb-2 flex items-center gap-2">
                        <Info size={16} /> Case Metadata
                      </h3>
                      <div className="text-sm space-y-2">
                        <div className="flex items-center gap-2">
                          <Calendar size={16} /> Date: {caseItem.dateOfIncident}
                        </div>
                        <div className="flex items-center gap-2">
                          <MapPin size={16} /> Region: {caseItem.region}
                        </div>
                        <div className="flex items-center gap-2">
                          <Route size={16} /> Between: {caseItem.between || "N/A"}
                        </div>
                        <div className="flex items-center gap-2">
                          <Hash size={16} /> Case #: {caseItem.caseNumber}
                        </div>
                        <div className="flex items-center gap-2">
                          <span
                            className={`px-2 py-1 rounded text-xs font-bold ${
                              caseItem.status === "completed"
                                ? "bg-green-700"
                                : caseItem.status === "in progress"
                                ? "bg-yellow-600"
                                : "bg-red-700"
                            }`}
                          >
                            {caseItem.status}
                          </span>
                        </div>
                        {hoverData && (
                          <div className="mt-2">
                            <p className="font-semibold mb-1">Points:</p>
                            <p
                              onClick={() => openStreetView(hoverData.first.lat, hoverData.first.lng)}
                              className="cursor-pointer underline hover:text-blue-400"
                            >
                              📍 First: {hoverData.first.lat.toFixed(4)}, {hoverData.first.lng.toFixed(4)}
                            </p>
                            <p
                              onClick={() => openStreetView(hoverData.last.lat, hoverData.last.lng)}
                              className="cursor-pointer underline hover:text-blue-400"
                            >
                              📍 Last: {hoverData.last.lat.toFixed(4)}, {hoverData.last.lng.toFixed(4)}
                            </p>
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              ))
            ) : (
              <p className="text-gray-400 text-sm">You have no cases yet.</p>
            )}
          </div>
        </div>

        {/* Right Section (Notifications Panel) */}
        <div className={`w-1/4 bg-gray-800 rounded-lg p-4 text-white shadow mt-4 flex flex-col ${aiOpen ? "blur-sm pointer-events-none" : ""}`} style={{ height: "calc(100vh - 5rem)" }}>
          <h2 className="text-lg font-bold mb-4">Notifications</h2>
          {notifications.length > 0 ? (
            <div className="flex flex-col flex-grow overflow-hidden">
              <ul className="space-y-4 overflow-y-auto flex-grow min-h-0 pr-1">
                {notifications.map((notification) => (
                  <li key={notification.id} className={`p-3 rounded ${notification.read ? "bg-gray-700" : "bg-blue-700"}`}>
                    <h3 className="font-semibold">{notification.title}</h3>
                    <p className="text-sm">{notification.message}</p>
                    <p className="text-xs text-gray-400">{new Date(notification.timestamp).toLocaleString()}</p>
                    <button
                      onClick={() => toggleReadStatus(notification)}
                      className={`mt-2 px-3 py-1 rounded text-sm font-semibold ${
                        notification.read ? "bg-green-600 hover:bg-green-700 text-white" : "bg-gray-600 hover:bg-gray-700 text-white"
                      }`}
                    >
                      {notification.read ? "Mark as Unread" : "Mark as Read"}
                    </button>
                  </li>
                ))}
              </ul>
              {/* Pagination Controls */}
              <div className="flex justify-between items-center mt-4">
                <button
                  onClick={handlePreviousPage}
                  disabled={currentPage === 1}
                  className="px-3 py-1 bg-gray-600 hover:bg-gray-700 text-white rounded disabled:opacity-50"
                >
                  Previous
                </button>
                <span className="text-sm text-gray-400">
                  Page {currentPage} of {Math.ceil(totalNotifications / notificationsPerPage)}
                </span>
                <button
                  onClick={handleNextPage}
                  disabled={currentPage === Math.ceil(totalNotifications / notificationsPerPage)}
                  className="px-3 py-1 bg-gray-600 hover:bg-gray-700 text-white rounded disabled:opacity-50"
                >
                  Next
                </button>
              </div>
            </div>
          ) : (
            <p className="text-sm text-gray-400">No notifications available.</p>
          )}
        </div>
      </div>

      {/* Simulation Button */}
      <button
        onClick={() => {
          if (!selectedCase) return;
          localStorage.setItem("trackxCaseData", JSON.stringify({
            caseId: selectedCase.doc_id,
            caseNumber: selectedCase.caseNumber,
            caseTitle: selectedCase.caseTitle,
          }));
          window.open("/simulation", "_blank");
        }}
        disabled={!selectedCase}
        className={`fixed bottom-6 left-6 z-40 font-bold py-3 px-6 rounded-full shadow-lg transition-colors duration-200 ${
          selectedCase
            ? "border border-green-600 text-green-600 hover:bg-green-600 hover:text-white"
            : "border border-gray-500 text-gray-500 cursor-not-allowed"
        }`}
      >
        View Simulation
      </button>

      {/* Delete Button */}
      <button
                onClick={requestCaseDeletion}
        disabled={!selectedCase}
        className={`fixed bottom-6 right-6 z-40 font-bold py-3 px-6 rounded-full shadow-lg transition-colors duration-200 ${
          selectedCase
            ? "border border-red-600 text-red-600 hover:bg-red-600 hover:text-white"
            : "border border-gray-500 text-gray-500 cursor-not-allowed"
        }`}
      >
        Delete Case
      </button>

      {/* AI Summary Button */}
      <button
        onClick={openAISummary}
        disabled={!selectedCase}
        className={`fixed bottom-6 left-1/2 -translate-x-1/2 z-40 font-bold py-3 px-6 rounded-full shadow-lg transition-colors duration-200 ${
          selectedCase
            ? "border border-blue-600 text-blue-600 hover:bg-blue-600 hover:text-white"
            : "border border-gray-500 text-gray-500 cursor-not-allowed"
        }`}
      >
        AI Summary
      </button>

      {/* === AI Summary overlay === */}
      {aiOpen && (
        <div className="fixed inset-0 z-50">
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-black/70 backdrop-blur-sm"
            onClick={() => !aiLoading && setAiOpen(false)}
          />
          {/* Panel */}
          <div className="absolute inset-x-0 top-10 mx-auto w-11/12 md:w-3/4 lg:w-1/2 bg-gray-900 border border-gray-700 rounded-xl shadow-xl p-6 text-white">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-bold">
                AI Summary {selectedCase ? `– ${selectedCase.caseTitle}` : ""}
              </h2>
              <button
                className={`px-3 py-1 rounded ${aiLoading ? "opacity-50 cursor-not-allowed" : "hover:bg-gray-700"}`}
                onClick={() => !aiLoading && setAiOpen(false)}
                disabled={aiLoading}
              >
                Close
              </button>
            </div>

            {aiLoading && <Spinner />}

            {!aiLoading && aiError && (
              <div className="bg-red-900/40 border border-red-700 rounded p-3 text-sm">
                {aiError}
              </div>
            )}

            {!aiLoading && !aiError && (
              <>
                {/* If you install react-markdown, replace this <pre> with <ReactMarkdown>{aiMarkdown}</ReactMarkdown> */}
                <pre className="whitespace-pre-wrap text-sm max-h-[60vh] overflow-y-auto">
                  {aiMarkdown}
                </pre>
                <div className="mt-4 flex gap-3">
                  <button
                    className="px-4 py-2 bg-blue-700 hover:bg-blue-600 rounded"
                    onClick={() => {
                      const blob = new Blob([aiMarkdown], { type: "text/markdown" });
                      const url = URL.createObjectURL(blob);
                      const a = document.createElement("a");
                      a.href = url;
                      a.download = `AI_Summary_${selectedCase?.caseNumber || "case"}.md`;
                      a.click();
                      URL.revokeObjectURL(url);
                    }}
                  >
                    Download .md
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      <NotificationModal
        isOpen={modalState.isOpen}
        title={modalState.title}
        description={modalState.description}
        variant={modalState.variant}
        onClose={closeModal}
        primaryAction={modalState.primaryAction}
        secondaryAction={modalState.secondaryAction}
      />
    </div>
  );
}

export default MyCasesPage;
