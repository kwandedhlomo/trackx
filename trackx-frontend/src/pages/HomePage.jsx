import { useState, useEffect, useMemo } from "react";
import { Link } from "react-router-dom";
import ReactECharts from "echarts-for-react";
import adfLogo from "../assets/image-removebg-preview.png"; 
import trackxLogo from "../assets/trackx-logo-removebg-preview.png";
import { Home as HomeIcon, FilePlus2, FolderOpen, Briefcase, Users, LayoutDashboard } from "lucide-react";
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
  
    const pieData = useMemo(
      () => [
        { name: "Not Started", value: statusStats["not started"] },
        { name: "In Progress", value: statusStats["in progress"] },
        { name: "Completed", value: statusStats.completed },
      ],
      [statusStats]
    );

    const totalCases = pieData.reduce((acc, curr) => acc + (curr.value || 0), 0);
    const activeCases = statusStats["not started"] + statusStats["in progress"];
    const completionRate = totalCases ? Math.round((statusStats.completed / totalCases) * 100) : 0;

    const now = new Date();
    const formattedDateTime = now.toLocaleString();
    const formattedDate = now.toLocaleDateString(undefined, {
      weekday: "long",
      month: "long",
      day: "numeric",
    });
    const formattedTime = now.toLocaleTimeString(undefined, {
      hour: "2-digit",
      minute: "2-digit",
    });
    const userRoleLabel = profile?.role ? `${String(profile.role).toUpperCase()} ACCESS` : "Secure access";

    const pieOption = useMemo(() => {
      const seriesData = pieData.map((item) => ({
        value: item.value,
        name: item.name,
      }));

      return {
        backgroundColor: "transparent",
        legend: {
          top: "bottom",
          textStyle: {
            color: "#e2e8f0",
            fontSize: 11,
          },
          itemWidth: 12,
          itemHeight: 12,
        },
        tooltip: {
          trigger: "item",
          backgroundColor: "rgba(15,23,42,0.88)",
          borderColor: "rgba(30,64,175,0.45)",
          borderWidth: 1,
          textStyle: {
            color: "#f8fafc",
          },
          formatter: ({ name, value, percent }) => `${name}: ${value} (${percent}%)`,
        },
        color: [
          "#c2410c",
          "#1d4ed8",
          "#0f766e",
        ],
        series: [
          {
            name: "Resolution Status",
            type: "pie",
            radius: ["40%", "68%"],
            avoidLabelOverlap: false,
            itemStyle: {
              borderRadius: 12,
              borderColor: "rgba(15,23,42,0.9)",
              borderWidth: 2,
            },
            label: {
              show: true,
              formatter: "{b}: {c}",
              color: "#e2e8f0",
              fontSize: 12,
            },
            labelLine: {
              length: 15,
              length2: 10,
              lineStyle: {
                color: "rgba(226,232,240,0.35)",
              },
            },
            data: seriesData,
          },
        ],
      };
    }, [pieData]);

    const lineOption = useMemo(() => {
      const categories = monthlyCaseCounts.map((item) => item.month ?? "Unknown");
      const values = monthlyCaseCounts.map((item) => item.count ?? 0);

      return {
        backgroundColor: "transparent",
        grid: { top: 40, left: 45, right: 25, bottom: 35 },
        tooltip: {
          trigger: "axis",
          backgroundColor: "rgba(15,23,42,0.88)",
          borderColor: "rgba(30,64,175,0.45)",
          borderWidth: 1,
          textStyle: { color: "#f8fafc" },
        },
        xAxis: {
          type: "category",
          data: categories.length ? categories : ["No Data"],
          boundaryGap: false,
          axisLine: { lineStyle: { color: "rgba(148,163,184,0.45)" } },
          axisLabel: { color: "rgba(226,232,240,0.8)", fontSize: 11 },
          axisTick: { show: false },
        },
        yAxis: {
          type: "value",
          minInterval: 1,
          axisLine: { show: false },
          splitLine: { lineStyle: { color: "rgba(148,163,184,0.2)" } },
          axisLabel: { color: "rgba(226,232,240,0.8)", fontSize: 11 },
        },
        series: [
          {
            name: "Cases",
            type: "line",
            smooth: true,
            showSymbol: true,
            symbolSize: 8,
            lineStyle: {
              width: 3,
              color: "#1e3a8a",
            },
            itemStyle: {
              color: "#1e3a8a",
              borderColor: "rgba(15,23,42,0.9)",
              borderWidth: 2,
            },
            areaStyle: {
              color: {
                type: "linear",
                x: 0,
                y: 0,
                x2: 0,
                y2: 1,
                colorStops: [
                  { offset: 0, color: "rgba(30,64,175,0.45)" },
                  { offset: 1, color: "rgba(15,23,42,0.08)" },
                ],
              },
            },
            data: values.length ? values : [0],
          },
        ],
      };
    }, [monthlyCaseCounts]);

    const barOption = useMemo(() => {
      const regions = regionCounts.map((item) => item.region ?? "Unknown");
      const counts = regionCounts.map((item) => item.count ?? 0);

      return {
        backgroundColor: "transparent",
        grid: { top: 30, left: 45, right: 20, bottom: 40 },
        tooltip: {
          trigger: "axis",
          axisPointer: { type: "shadow" },
          backgroundColor: "rgba(15,23,42,0.88)",
          borderColor: "rgba(30,64,175,0.45)",
          borderWidth: 1,
          textStyle: { color: "#f8fafc" },
        },
        xAxis: {
          type: "category",
          data: regions.length ? regions : ["No Data"],
          axisTick: { show: false },
          axisLine: { lineStyle: { color: "rgba(148,163,184,0.45)" } },
          axisLabel: { color: "rgba(226,232,240,0.82)", fontSize: 11 },
        },
        yAxis: {
          type: "value",
          minInterval: 1,
          axisLine: { show: false },
          splitLine: { lineStyle: { color: "rgba(148,163,184,0.2)" } },
          axisLabel: { color: "rgba(226,232,240,0.82)", fontSize: 11 },
        },
        series: [
          {
            name: "Cases",
            type: "bar",
            barWidth: "45%",
            itemStyle: {
              borderRadius: [8, 8, 0, 0],
              color: {
                type: "linear",
                x: 0,
                y: 0,
                x2: 0,
                y2: 1,
                colorStops: [
                  { offset: 0, color: "rgba(30,64,175,0.95)" },
                  { offset: 1, color: "rgba(15,23,42,0.65)" },
                ],
              },
            },
            data: counts.length ? counts : [0],
          },
        ],
      };
    }, [regionCounts]);

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
            className="group relative overflow-hidden rounded-full border border-white/10 bg-gradient-to-r from-blue-900/95 via-slate-900/90 to-indigo-900/90 px-5 py-2 text-sm font-semibold tracking-wide text-white shadow-lg shadow-[0_15px_35px_rgba(15,23,42,0.55)] transition-all duration-300 hover:-translate-y-0.5"
          >
            <span className="relative z-10">
              {clearMode ? "Back to Dashboard" : "Clear (Explore Globe)"}
            </span>
            <span className="absolute inset-0 bg-gradient-to-r from-white/10 via-transparent to-white/20 opacity-0 transition-opacity duration-300 group-hover:opacity-100" />
          </button>
        </div>
  
        {/* Main Content (hidden when clearMode is true) */}
        {!clearMode && (
          <div className="flex-grow flex flex-col relative z-10">
            {/* Navbar */}
            <nav className="mx-6 mt-6 flex items-center justify-between rounded-3xl border border-white/10 bg-gradient-to-br from-black/75 via-slate-900/65 to-black/75 px-6 py-4 font-sans shadow-xl shadow-[0_25px_65px_rgba(8,11,24,0.6)] backdrop-blur-xl">
              <div className="flex items-center gap-4">
                <button
                  type="button"
                  onClick={() => setShowMenu(!showMenu)}
                  className="flex h-11 w-11 items-center justify-center rounded-full border border-white/10 bg-white/[0.02] text-xl text-white shadow-inner shadow-white/5 transition hover:bg-white/10"
                  aria-label="Toggle navigation"
                >
                  &#9776;
                </button>
                <img src={adfLogo} alt="ADF Logo" className="h-10 w-auto drop-shadow-[0_10px_20px_rgba(59,130,246,0.35)]" />
              </div>

              <div className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 flex items-center space-x-2 text-3xl font-extrabold">
                <img src={trackxLogo} alt="TrackX Logo Left" className="h-8 w-auto opacity-90" />
                <span className="text-white/75 tracking-[0.2em] drop-shadow-[0_2px_12px_rgba(15,23,42,0.55)]">TRACKX</span>
                <img src={trackxLogo} alt="TrackX Logo Right" className="h-8 w-auto opacity-90" />
              </div>

              <div className="flex items-center space-x-6 text-sm text-gray-200">
                <Link to="/home" className="rounded-full bg-white/[0.02] px-3 py-1.5 font-medium text-white transition hover:bg-white/15">
                  Home
                </Link>
                <div className="flex flex-col items-end">
                  <span className="text-base font-semibold text-white">
                    {profile ? profile.firstName : "Loading..."}
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
              <div className="absolute left-4 top-32 z-30 w-64 space-y-2 rounded-3xl border border-white/10 bg-gradient-to-br from-slate-950/82 via-slate-900/78 to-black/78 p-6 shadow-2xl shadow-[0_30px_60px_rgba(30,58,138,0.45)] backdrop-blur-2xl">
                <div className="flex items-center gap-3 px-3 py-2 rounded-2xl text-sm font-medium text-white bg-white/[0.018]">
                  <HomeIcon className="w-4 h-4" />
                  Home
                </div>
                <Link
                  to="/new-case"
                  className="flex items-center gap-3 px-3 py-2 rounded-2xl text-sm font-medium text-gray-200 hover:text-white hover:bg-white/10 transition"
                  onClick={() => setShowMenu(false)}
                >
                  <FilePlus2 className="w-4 h-4" />
                  Create New Case
                </Link>

                {profile?.role === "admin" && (
                  <Link
                    to="/manage-cases"
                    className="flex items-center gap-3 px-3 py-2 rounded-2xl text-sm font-medium text-gray-200 hover:text-white hover:bg-white/10 transition"
                    onClick={() => setShowMenu(false)}
                  >
                    <FolderOpen className="w-4 h-4" />
                    Manage Cases
                  </Link>
                )}

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
                    to="/pending-users"
                    className="flex items-center gap-3 px-3 py-2 rounded-2xl text-sm font-medium text-gray-200 hover:text-white hover:bg-white/10 transition"
                    onClick={() => setShowMenu(false)}
                  >
                    <Users className="w-4 h-4" />
                    Pending Users
                  </Link>
                )}

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
  
            <main className="flex w-full flex-col items-center px-6 pb-16 pt-10 space-y-12">
              <div className="relative w-full max-w-6xl overflow-hidden rounded-3xl border border-white/10 bg-white/[0.02] px-8 py-10 text-white shadow-[0_30px_80px_rgba(15,23,42,0.45)] backdrop-blur-xl">
                <div className="absolute inset-0 bg-gradient-to-r from-blue-900/25 via-transparent to-purple-900/25" />
                <div className="absolute -top-16 right-10 h-44 w-44 rounded-full bg-blue-950/20 blur-3xl" />
                <div className="absolute -bottom-24 left-6 h-44 w-44 rounded-full bg-purple-950/18 blur-3xl" />
                <div className="relative flex flex-col gap-8 text-center sm:flex-row sm:items-center sm:justify-between sm:text-left">
                  <div className="space-y-3">
                    <p className="text-xs font-semibold uppercase tracking-[0.35em] text-gray-300">
                      Operational Intelligence
                    </p>
                    <h1 className="text-3xl font-semibold sm:text-4xl">Let&apos;s track the case.</h1>
                    <p className="max-w-xl text-sm text-gray-300">
                      Stay in control of investigations with live insights, polished visuals, and an immersive globe
                      experience inspired by our refined notifications.
                    </p>
                  </div>
                  <div className="flex flex-col items-center gap-2 rounded-2xl border border-white/10 bg-white/[0.018] px-6 py-5 text-sm text-gray-200 shadow-inner shadow-white/10 backdrop-blur-2xl">
                    <span className="text-xs uppercase tracking-[0.3em] text-gray-400">Snapshot</span>
                    <span className="text-lg font-semibold text-white">{formattedDate}</span>
                    <span className="text-sm text-gray-300">{formattedTime}</span>
                    <span className="text-xs text-gray-400">{userRoleLabel}</span>
                  </div>
                </div>
              </div>

              <div className="grid w-full max-w-5xl grid-cols-1 gap-4 md:grid-cols-3">
                <div className="relative overflow-hidden rounded-2xl border border-white/10 bg-white/[0.02] p-6 shadow-lg shadow-[0_20px_45px_rgba(15,23,42,0.42)] transition-transform duration-300 hover:-translate-y-1 hover:shadow-[0_32px_70px_rgba(37,99,235,0.45)] backdrop-blur-xl">
                  <div className="pointer-events-none absolute -top-14 right-0 h-28 w-28 rounded-full bg-blue-950/25 blur-2xl" />
                  <p className="text-xs uppercase tracking-[0.3em] text-gray-400">Total Cases</p>
                  <p className="mt-3 text-3xl font-semibold text-white">{totalCases}</p>
                  <p className="text-xs text-gray-400">Across all statuses tracked</p>
                </div>
                <div className="relative overflow-hidden rounded-2xl border border-white/10 bg-white/[0.02] p-6 shadow-lg shadow-[0_20px_45px_rgba(15,23,42,0.42)] transition-transform duration-300 hover:-translate-y-1 hover:shadow-[0_32px_70px_rgba(15,118,110,0.4)] backdrop-blur-xl">
                  <div className="pointer-events-none absolute -top-16 left-0 h-28 w-28 rounded-full bg-teal-900/25 blur-2xl" />
                  <p className="text-xs uppercase tracking-[0.3em] text-gray-400">Active Investigations</p>
                  <p className="mt-3 text-3xl font-semibold text-white">{activeCases}</p>
                  <p className="text-xs text-gray-400">Not started &amp; in progress matters</p>
                </div>
                <div className="relative overflow-hidden rounded-2xl border border-white/10 bg-white/[0.02] p-6 shadow-lg shadow-[0_20px_45px_rgba(15,23,42,0.42)] transition-transform duration-300 hover:-translate-y-1 hover:shadow-[0_32px_70px_rgba(88,28,135,0.45)] backdrop-blur-xl">
                  <div className="pointer-events-none absolute -bottom-14 right-2 h-28 w-28 rounded-full bg-purple-950/25 blur-2xl" />
                  <p className="text-xs uppercase tracking-[0.3em] text-gray-400">Completion Rate</p>
                  <p className="mt-3 text-3xl font-semibold text-white">{completionRate}%</p>
                  <p className="text-xs text-gray-400">Cases successfully resolved</p>
                </div>
              </div>

              <div className="grid w-full max-w-6xl grid-cols-1 gap-8 md:grid-cols-2">
                <div className="relative overflow-hidden rounded-2xl border border-white/10 bg-white/[0.02] p-6 shadow-lg shadow-[0_20px_45px_rgba(15,23,42,0.42)] transition-transform duration-300 hover:-translate-y-1 hover:shadow-[0_32px_70px_rgba(37,99,235,0.45)] backdrop-blur-xl">
                  <div className="pointer-events-none absolute -top-20 right-0 h-32 w-32 rounded-full bg-blue-950/25 blur-3xl" />
                  <h3 className="text-lg font-semibold text-white">Resolution Status</h3>
                  <p className="mt-1 text-xs text-gray-400">Understand how each case is progressing at a glance.</p>
                  <ReactECharts
                    option={pieOption}
                    style={{ height: 260, width: "100%" }}
                    notMerge
                    lazyUpdate
                  />
                </div>
                <div className="relative overflow-hidden rounded-2xl border border-white/10 bg-white/[0.02] p-6 shadow-lg shadow-[0_20px_45px_rgba(15,23,42,0.42)] transition-transform duration-300 hover:-translate-y-1 hover:shadow-[0_32px_70px_rgba(30,64,175,0.4)] backdrop-blur-xl">
                  <div className="pointer-events-none absolute -top-12 left-0 h-32 w-32 rounded-full bg-blue-950/22 blur-3xl" />
                  <h3 className="text-lg font-semibold text-white">Case Distribution Over Time</h3>
                  <p className="mt-1 text-xs text-gray-400">Track momentum across the year and anticipate trends.</p>
                  <ReactECharts
                    option={lineOption}
                    style={{ height: 240, width: "100%" }}
                    notMerge
                    lazyUpdate
                  />
                </div>
              </div>

              <div className="relative w-full max-w-5xl overflow-hidden rounded-2xl border border-white/10 bg-white/[0.02] p-6 text-white shadow-lg shadow-[0_20px_45px_rgba(15,23,42,0.42)] backdrop-blur-xl">
                <div className="pointer-events-none absolute -top-24 right-6 h-32 w-32 rounded-full bg-blue-950/18 blur-3xl" />
                <div className="flex flex-col gap-6 md:flex-row md:items-start md:justify-between">
                  <div>
                    <h2 className="text-xl font-semibold">Recent Cases</h2>
                    <p className="mt-1 text-xs text-gray-400">Quickly jump back into ongoing investigations.</p>
                  </div>
                  <div className="flex gap-4 text-sm">
                    <label className="flex items-center space-x-2 rounded-full border border-white/10 bg-white/[0.02] px-3 py-1.5 text-gray-200">
                      <input
                        type="checkbox"
                        checked={sortBy === "dateEntered"}
                        onChange={() => setSortBy("dateEntered")}
                        className="h-4 w-4 rounded border-white/20 bg-black/40 text-blue-500 focus:ring-blue-400"
                      />
                      <span>Date Entered</span>
                    </label>
                    <label className="flex items-center space-x-2 rounded-full border border-white/10 bg-white/[0.02] px-3 py-1.5 text-gray-200">
                      <input
                        type="checkbox"
                        checked={sortBy === "dateOfIncident"}
                        onChange={() => setSortBy("dateOfIncident")}
                        className="h-4 w-4 rounded border-white/20 bg-black/40 text-blue-500 focus:ring-blue-400"
                      />
                      <span>Date of Incident</span>
                    </label>
                  </div>
                </div>
                <ul className="mt-6 space-y-3">
                  {recentCases.length > 0 ? (
                    recentCases.map((caseItem, index) => (
                      <li
                        key={index}
                        className="flex items-center justify-between rounded-2xl border border-white/10 bg-black/15 px-4 py-3 text-sm shadow-inner shadow-white/5 transition hover:border-blue-500/40 hover:bg-white/10"
                      >
                        <div className="flex flex-col">
                          <span className="font-semibold text-white">{caseItem.caseTitle}</span>
                          <span className="text-xs text-gray-400">{caseItem.dateEntered || caseItem.dateOfIncident || "No date available"}</span>
                        </div>
                        <Link
                          to="/edit-case"
                          state={{ caseData: { ...caseItem, doc_id: caseItem.doc_id } }}
                          className="flex items-center gap-2 rounded-full border border-white/10 bg-gradient-to-r from-blue-950/85 to-indigo-900/85 px-4 py-1.5 text-xs font-semibold uppercase tracking-wide text-white shadow shadow-[0_12px_30px_rgba(15,23,42,0.6)] transition hover:from-blue-800 hover:to-purple-900"
                        >
                          Manage
                          <span aria-hidden="true">→</span>
                        </Link>
                      </li>
                    ))
                  ) : (
                    <p className="rounded-2xl border border-dashed border-white/20 bg-white/[0.018] py-6 text-center text-sm text-gray-400">
                      No recent cases available.
                    </p>
                  )}
                </ul>
              </div>

              <Link
                to="/new-case"
                className="group relative flex items-center gap-3 overflow-hidden rounded-full border border-white/10 bg-gradient-to-r from-blue-900 via-indigo-900 to-purple-900 px-8 py-3 text-lg font-semibold text-white shadow-xl shadow-[0_30px_80px_rgba(15,23,42,0.7)] transition-transform duration-300 hover:-translate-y-1"
              >
                <span className="relative z-10 text-2xl">＋</span>
                <span className="relative z-10">Create New Case / Report</span>
                <span className="absolute inset-0 translate-x-[-120%] bg-white/20 opacity-0 transition-all duration-500 group-hover:translate-x-[120%] group-hover:opacity-50" />
              </Link>

              <div className="grid w-full max-w-6xl grid-cols-1 gap-8 md:grid-cols-2">
                <div className="relative overflow-hidden rounded-2xl border border-white/10 bg-white/[0.02] p-6 shadow-lg shadow-[0_20px_45px_rgba(15,23,42,0.42)] transition-transform duration-300 hover:-translate-y-1 hover:shadow-[0_32px_70px_rgba(37,99,235,0.45)] backdrop-blur-xl">
                  <div className="pointer-events-none absolute -top-16 right-2 h-32 w-32 rounded-full bg-blue-900/25 blur-3xl" />
                  <h3 className="text-lg font-semibold text-white">Case Frequency by Region</h3>
                  <p className="mt-1 text-xs text-gray-400">Identify hotspots and scale resources where needed.</p>
                  <ReactECharts
                    option={barOption}
                    style={{ height: 240, width: "100%" }}
                    notMerge
                    lazyUpdate
                  />
                </div>

                <div className="relative overflow-hidden rounded-2xl border border-white/10 bg-white/[0.02] p-6 shadow-lg shadow-[0_20px_45px_rgba(15,23,42,0.42)] transition-transform duration-300 hover:-translate-y-1 hover:shadow-[0_32px_70px_rgba(76,29,149,0.45)] backdrop-blur-xl">
                  <div className="pointer-events-none absolute -bottom-16 left-2 h-32 w-32 rounded-full bg-indigo-900/25 blur-3xl" />
                  <h3 className="text-lg font-semibold text-white">Vehicle Movement Heatmap</h3>
                  <p className="mt-1 text-xs text-gray-400">Visualise the latest movement patterns at a glance.</p>
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
