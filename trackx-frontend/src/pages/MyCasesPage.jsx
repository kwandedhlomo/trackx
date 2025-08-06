import { useState, useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import { auth } from "../firebase";
import { useAuth } from "../context/AuthContext";
import { signOut } from "firebase/auth";
import axios from "axios";
import adfLogo from "../assets/image-removebg-preview.png";
import trackxLogo from "../assets/trackx-logo-removebg-preview.png";
import { Calendar, MapPin, Hash, Info, Route } from "lucide-react";
import {
  PieChart,
  Pie,
  Cell,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";
import MiniHeatMapWindow from "../components/MiniHeatMapWindow";

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
    fetchCases(); // Fetch all cases with only the userID parameter
  }, []); // Empty dependency array ensures this runs only once on mount

  // Aggregate heatmap points for these cases
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

  const handleDeleteCase = async () => {
    if (!selectedCase) return;
    if (!window.confirm("Are you sure you want to delete this case?")) return;
    try {
      await axios.delete(`http://localhost:8000/cases/delete/${selectedCase.doc_id}`);
      alert("Case deleted successfully.");
      // Remove it from the local state:
      setMyCases((prev) => prev.filter((c) => c.doc_id !== selectedCase.doc_id));
      setSelectedCase(null);
    } catch (err) {
      console.error("Delete failed:", err);
      alert("Failed to delete case.");
    }
  };

  // Fetch notifications for the current user with pagination
  const fetchNotifications = async (page = 1) => {
    try {
      const uid = auth.currentUser?.uid; // Ensure userID is fetched
      if (!uid) {
        console.warn("No user ID found. Cannot fetch notifications.");
        return;
      }
      const response = await axios.get(`http://localhost:8000/notifications/${uid}`, {
        params: { page, limit: notificationsPerPage },
      });
      setNotifications(response.data.notifications || []);
      setTotalNotifications(response.data.total || 0); // Update total notifications
      setCurrentPage(page); // Update current page
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
        const uid = auth.currentUser?.uid; // Ensure userID is fetched
        if (!uid) {
          console.warn("No user ID found. Cannot update notification.");
          return;
        }
    
        const updatedReadStatus = !notification.read; // Toggle the current read status
        console.log(`Toggling read status for notification ${notification.id} to ${updatedReadStatus}`); // Debugging
    
        await axios.patch(
          `http://localhost:8000/notifications/${uid}/${notification.id}`,
          { read: updatedReadStatus }, // Send the `read` field in the request body
          { headers: { "Content-Type": "application/json" } } // Ensure the correct content type
        );
    
        // Update the local state to reflect the change
        setNotifications((prev) =>
          prev.map((n) =>
            n.id === notification.id ? { ...n, read: updatedReadStatus } : n
          )
        );
        console.log(`Notification ${notification.id} updated successfully.`); // Debugging
      } catch (error) {
        console.error("Failed to update notification read status:", error);
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
      <div className="absolute inset-0 bg-gradient-to-br from-black via-gray-900 to-black -z-20" />

      {/* Navbar */}
      <nav className="flex justify-between items-center bg-gradient-to-r from-black to-gray-900 bg-opacity-80 backdrop-blur-md p-4 relative font-sans z-20">
        <div className="flex items-center space-x-4">
          <div
            className="text-white text-3xl cursor-pointer"
            onClick={() => setShowMenu(!showMenu)}
          >
            &#9776;
          </div>
          <img src={adfLogo} alt="ADF Logo" className="h-10" />
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

      {showMenu && (
        <div className="absolute top-16 left-0 bg-black bg-opacity-90 text-white w-64 p-6 z-30 space-y-4 border-r border-gray-700 shadow-lg">
          <Link to="/home" className="block hover:text-blue-400" onClick={() => setShowMenu(false)}>🏠 Home</Link>
          <Link to="/new-case" className="block hover:text-blue-400" onClick={() => setShowMenu(false)}>📝 Create New Case / Report</Link>
          <Link to="/manage-cases" className="block hover:text-blue-400" onClick={() => setShowMenu(false)}>📁 Manage Cases</Link>
          <Link to="/my-cases" className="block hover:text-blue-400" onClick={() => setShowMenu(false)}>📁 My Cases</Link>
        </div>
      )}

{/* Main Container */}
<div className="relative flex flex-row min-h-screen">
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
<div className="w-1/4 bg-gray-800 rounded-lg p-4 text-white shadow mt-4 flex flex-col" style={{ height: "calc(100vh - 5rem)" }}>  <h2 className="text-lg font-bold mb-4">Notifications</h2>
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
        className={`fixed bottom-6 left-6 z-50 font-bold py-3 px-6 rounded-full shadow-lg transition-colors duration-200 ${
          selectedCase
            ? "border border-green-600 text-green-600 hover:bg-green-600 hover:text-white"
            : "border border-gray-500 text-gray-500 cursor-not-allowed"
        }`}
      >
        View Simulation
      </button>

      {/* Delete Button */}
      <button
        onClick={handleDeleteCase}
        disabled={!selectedCase}
        className={`fixed bottom-6 right-6 z-50 font-bold py-3 px-6 rounded-full shadow-lg transition-colors duration-200 ${
          selectedCase
            ? "border border-red-600 text-red-600 hover:bg-red-600 hover:text-white"
            : "border border-gray-500 text-gray-500 cursor-not-allowed"
        }`}
      >
        Delete Case
      </button>
    </div>
  );
}

export default MyCasesPage;