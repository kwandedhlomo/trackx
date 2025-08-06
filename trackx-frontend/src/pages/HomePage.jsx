import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import {
  PieChart,
  Pie,
  Cell,
  Tooltip,
  Legend,
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  BarChart,
  Bar
} from "recharts";
import adfLogo from "../assets/image-removebg-preview.png"; 
import trackxLogo from "../assets/trackx-logo-removebg-preview.png";
import BarChartComponent from "../components/BarChartComponent";
// import HeatMapComponent from "../components/HeatMapComponent";
import GlobeBackground from "../components/GlobeBackground"; 
import { auth } from "../firebase"; 
import { useAuth } from "../context/AuthContext";
import { signOut } from "firebase/auth";
import { useNavigate } from "react-router-dom";
import axios from "axios";
import MiniHeatMapWindow from "../components/MiniHeatMapWindow";


function HomePage() {
    const [clearMode, setClearMode] = useState(false); 
    const [showMenu, setShowMenu] = useState(false);
    const [recentCases, setRecentCases] = useState([]);
    const [statusStats, setStatusStats] = useState({ "not started": 0, "in progress": 0, completed: 0 });
    const { profile } = useAuth();
    const navigate = useNavigate(); 
    const [monthlyCaseCounts, setMonthlyCaseCounts] = useState([]);
    const [regionCounts, setRegionCounts] = useState([]);
    const [heatPoints, setHeatPoints] = useState([]);
    const [globePoints, setGlobePoints] = useState([]);
    const [sortBy, setSortBy] = useState("dateEntered"); // default sort option


    const BLUE = "#1E40AF"; 
    const RED = "#B91C1C";  
    const GREEN = "#059669";
    const COLORS = [RED, BLUE, GREEN];

    // For Sign Out functionality
    const handleSignOut = async () => {
      try {
        await signOut(auth);
        navigate("/"); // Redirect to LandingPage
      } catch (error) {
        console.error("Sign-out failed:", error.message);
      }
    };

    
    //check who the logged in user is
    useEffect(() => { 
      const user = auth.currentUser;
      if (user) {
        console.log("Logged in user:", user);
      } else {
        console.warn(" No user is currently logged in.");
      }
    }, []);

    useEffect(() => {
      const fetchRecentCases = async () => {
        try {
          const response = await axios.get("http://localhost:8000/cases/recent", {
            params: {
              sortBy,
              ...(profile?.role !== "admin" && profile?.userID ? { user_id: profile.userID } : {})
            }
          });

          console.log("Recent cases response:", response.data.cases);
          setRecentCases(response.data.cases);
        } catch (error) {
          console.error("Failed to fetch recent cases:", error);
        }
      };

      if (profile) {
        fetchRecentCases();
      }
    }, [sortBy, profile]);


    useEffect(() => {
      const fetchAllCases = async () => {
        try {
          const response = await axios.get("http://localhost:8000/cases/search", {
            params: profile?.role === "admin" ? {} : { user_id: profile?.userID }
          });

          const allCases = response.data.cases || [];

          const notStarted = allCases.filter((c) => c.status === "not started").length;
          const inProgress = allCases.filter((c) => c.status === "in progress").length;
          const completed = allCases.filter((c) => c.status === "completed").length;
          
          setStatusStats({
            "not started": notStarted,
            "in progress": inProgress,
            completed: completed,
          });
        } catch (err) {
          console.error("Failed to fetch case statuses:", err);
        }
      };
  
      fetchAllCases();
    }, []);
  
    const pieData = [
      { name: "Not Started", value: statusStats["not started"] },
      { name: "In Progress", value: statusStats["in progress"] },
      { name: "Completed", value: statusStats.completed },
    ];

    useEffect(() => {
      const fetchMonthlyCounts = async () => {
        try {
          const params = profile?.role === "admin" ? {} : { user_id: profile?.userID };
          console.log("Fetching monthly case counts with params:", params);

          const response = await axios.get("http://localhost:8000/cases/monthly-counts", {
            params,
          });

          console.log("Received monthly counts:", response.data.counts);
          setMonthlyCaseCounts(response.data.counts);
        } catch (error) {
          console.error("Failed to fetch monthly case counts:", error);
        }
      };

      if (profile) {
        fetchMonthlyCounts();
      }
    }, [profile]);


    useEffect(() => {
      const fetchRegionCounts = async () => {
        try {
          const response = await axios.get("http://localhost:8000/cases/region-counts", {
            params: profile?.role === "admin" ? {} : { user_id: profile?.userID }
          });

          console.log("Region count data:", response.data.counts);
          setRegionCounts(response.data.counts || []);
        } catch (err) {
          console.error("Failed to fetch region counts:", err);
        }
      };

      if (profile) {
        fetchRegionCounts();
      }
    }, [profile]);


    useEffect(() => {
      const fetchHeatPoints = async () => {
        try {
          const response = await axios.get("http://localhost:8000/cases/all-points");
          const points = response.data.points || [];
    
          console.log("Raw heatmap points from backend:", points);
          setHeatPoints(points);
          //console.log("HomePage fetched points:", points);
        } catch (err) {
          console.error("Failed to fetch heatmap points:", err);
        }
      };
    
      fetchHeatPoints();
    }, []);

    useEffect(() => {
      const fetchGlobePoints = async () => {
        try {
          const response = await axios.get("http://localhost:8000/cases/last-points");
          const data = response.data.points || [];
    
          console.log("Retrieved globePoints:", data); 
          setGlobePoints(data);
        } catch (err) {
          console.error("Failed to fetch globe points:", err); 
        }
      };
    
      fetchGlobePoints();
    }, []);

    return (
      <div className="relative flex flex-col min-h-screen">
      {/* Gradient background */}
      <div className="absolute inset-0 w-full min-h-full bg-gradient-to-br from-black via-gray-900 to-black -z-20" />
        {/*  Globe Background */}
        <GlobeBackground interactive={clearMode} globePoints={globePoints} />
   
        {/*  Clear Button */}
        <div className="absolute top-20 right-4 z-20">
          <button
            onClick={() => setClearMode(!clearMode)}
            className="bg-blue-800 text-white px-4 py-2 rounded hover:bg-blue-700 transition-colors duration-200"
          >
            {clearMode ? "Back to Dashboard" : "Clear (Explore Globe)"}
          </button>
        </div>
  
        {/* Main Content (hidden when clearMode is true) */}
        {!clearMode && (
          <div className="flex-grow flex flex-col relative z-10">
            {/* Navbar */}
            <nav className="flex justify-between items-center bg-gradient-to-r from-black to-gray-900 bg-opacity-80 backdrop-blur-md p-4 relative font-sans">
              <div className="flex items-center space-x-4">
              <div
                className="text-white text-3xl cursor-pointer"
                onClick={() => setShowMenu(!showMenu)}
              >
                &#9776;
              </div>
                <img src={adfLogo} alt="ADF Logo" className="h-10 w-auto" />
              </div>
  
              <div className="absolute left-1/2 transform -translate-x-1/2 text-3xl font-extrabold text-white font-sans flex items-center space-x-2">
                <img src={trackxLogo} alt="TrackX Logo Left" className="h-8 w-auto" />
                <span>TRACKX</span>
                <img src={trackxLogo} alt="TrackX Logo Right" className="h-8 w-auto" />
              </div>
  
              <div className="flex items-center space-x-6 text-white font-sans">
                <Link to="/home" className="hover:text-gray-300">Home</Link>
                <div className="flex flex-col text-right">
                  <span className="text-white">{profile ? profile.firstName : "Loading..."}</span>
                  <button onClick={handleSignOut} className="text-sm text-gray-300 hover:text-white">Sign Out</button>
                </div>
                <div className="text-sm text-gray-300">
                  {new Date().toLocaleString()}
                </div>
              </div>
            </nav>
            {showMenu && (
              <div className="absolute top-16 left-0 bg-black bg-opacity-90 backdrop-blur-md text-white w-64 p-6 z-30 space-y-4 border-r border-gray-700 shadow-lg">
                <Link to="/home" className="block hover:text-blue-400" onClick={() => setShowMenu(false)}>🏠 Home</Link>
                <Link to="/new-case" className="block hover:text-blue-400" onClick={() => setShowMenu(false)}>📝 Create New Case / Report</Link>

                {profile?.role === "admin" && (
                  <Link to="/manage-cases" className="block hover:text-blue-400" onClick={() => setShowMenu(false)}>📁 Manage Cases</Link>
                )}

                <Link to="/my-cases" className="block hover:text-blue-400" onClick={() => setShowMenu(false)}>📁 My Cases</Link>

                {profile?.role === "admin" && (
                  <Link to="/admin-dashboard" className="block hover:text-blue-400" onClick={() => setShowMenu(false)}>
                    🛠 Admin Dashboard
                  </Link>
                )}
              </div>
            )}
  
            {/*Slogan */}
            <div className="text-center text-gray-300 text-lg tracking-wide mt-4 font-sans">
              Let's track the case
            </div>
  
            {/* Main Content */}
            <main className="flex flex-col items-center justify-center w-full p-8 space-y-10">
              {/* Two placeholder images */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-8 w-full max-w-6xl">
              <div className="bg-white bg-opacity-10 border border-gray-700 rounded-lg p-6">
                <h3 className="text-lg text-blue-500 mb-4 font-semibold">Resolution Status</h3>
                <ResponsiveContainer width="100%" height={250}>
                  <PieChart>
                    <Pie data={pieData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={80} label>
                      {pieData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={COLORS[index]} />
                      ))}
                    </Pie>
                    <Tooltip />
                    <Legend />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div className="bg-white bg-opacity-10 border border-gray-700 rounded-lg p-6">
                <h3 className="text-lg text-blue-500 mb-4 font-semibold">Case Distribution Over Time</h3>
                <ResponsiveContainer width="100%" height={230}>
                  <LineChart data={monthlyCaseCounts} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#444" />
                    <XAxis dataKey="month" stroke="#ccc" />
                    <YAxis stroke="#ccc" allowDecimals={false} />
                    <Tooltip />
                    <Legend />
                    <Line type="monotone" dataKey="count" stroke={BLUE} strokeWidth={2} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>
  
            {/* Recent Cases */}
            <div className="w-full max-w-4xl bg-white bg-opacity-10 border border-gray-700 rounded-lg p-6">
              <h2 className="text-xl font-semibold mb-4 text-blue-500">Recent Cases</h2>
              <div className="flex gap-6 mb-4 text-white">
                <label className="flex items-center space-x-2">
                  <input
                    type="checkbox"
                    checked={sortBy === "dateEntered"}
                    onChange={() => setSortBy("dateEntered")}
                  />
                  <span>Date Entered</span>
                </label>
                <label className="flex items-center space-x-2">
                  <input
                    type="checkbox"
                    checked={sortBy === "dateOfIncident"}
                    onChange={() => setSortBy("dateOfIncident")}
                  />
                  <span>Date of Incident</span>
                </label>
              </div>
              <ul className="space-y-4">
                {recentCases.length > 0 ? (
                  recentCases.map((caseItem, index) => (
                    <li key={index} className="flex justify-between items-center border-b border-gray-700 pb-2">
                      <span className="text-gray-300">{caseItem.caseTitle}</span>
                      <Link
                        to="/edit-case"
                        state={{ caseData: { ...caseItem, doc_id: caseItem.doc_id } }}
                        className="text-sm border border-gray-300 text-white py-1 px-3 rounded hover:bg-blue-800 hover:text-white transition-colors duration-200"
                      >
                        Manage
                      </Link>
                    </li>
                  ))
                ) : (
                  <p className="text-gray-400 text-sm">No recent cases available.</p>
                )}
              </ul>
            </div>
  
              {/* Create New Case Button */}
              <Link
                to="/new-case"
                className="flex items-center border border-blue-800 text-blue-800 font-bold py-3 px-6 rounded-full shadow hover:bg-blue-800 hover:text-white transition-colors duration-200"
              >
                <span className="text-2xl mr-2">＋</span> Create New Case / Report
              </Link>
  
              {/* Dashboard Section */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-8 w-full max-w-6xl mt-10">
                {/* Bar Chart */}
                  <div className="bg-white bg-opacity-10 border border-gray-700 rounded-lg p-6">
                    <h3 className="text-lg text-blue-500 mb-4 font-semibold">Case Frequency by Region</h3>
                    <ResponsiveContainer width="100%" height={230}>
                      <BarChart data={regionCounts} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#444" />
                        <XAxis dataKey="region" stroke="#ccc" />
                        <YAxis stroke="#ccc" allowDecimals={false} />
                        <Tooltip />
                        <Legend />
                        <Bar dataKey="count" fill={BLUE} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
  

                {/* Map Visualization */}
                <div className="bg-white bg-opacity-10 border border-gray-700 rounded-lg p-6">
                  <h3 className="text-lg text-blue-500 mb-4 font-semibold">Vehicle Movement Heatmap</h3>
                  <MiniHeatMapWindow points={heatPoints} />
                </div>
              </div>
            </main>
          </div>
        )}
      </div>
    );
  }
  
  export default HomePage;