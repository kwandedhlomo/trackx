import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import adfLogo from "../assets/image-removebg-preview.png"; 
import trackxLogo from "../assets/trackx-logo-removebg-preview.png";
import BarChartComponent from "../components/BarChartComponent";
import MapComponent from "../components/MapComponent";
import GlobeBackground from "../components/GlobeBackground"; 
import { auth } from "../firebase"; 
import { useAuth } from "../context/AuthContext";
import { signOut } from "firebase/auth";
import { useNavigate } from "react-router-dom";


function HomePage() {
    const [clearMode, setClearMode] = useState(false); 
    const [showMenu, setShowMenu] = useState(false);
    const { profile } = useAuth();
    const navigate = useNavigate(); // For redirecting


    // For Sign Out functionality
    const handleSignOut = async () => {
      try {
        await signOut(auth);
        navigate("/"); // Redirect to LandingPage
      } catch (error) {
        console.error("Sign-out failed:", error.message);
      }
    };

    
    //This is only to check who the logged in user is
    useEffect(() => { // Use Effect = 'React Hook' to be able to do something when a component mounts/updates etc
      const user = auth.currentUser;
      if (user) {
        console.log("Logged in user:", user);
      } else {
        console.warn(" No user is currently logged in.");
      }
    }, []);

    return (
      <div className="relative flex flex-col min-h-screen">
      {/* Gradient background that grows properly */}
      <div className="absolute inset-0 w-full min-h-full bg-gradient-to-br from-black via-gray-900 to-black -z-20" />
        {/* 🌍 Globe Background */}
        <GlobeBackground interactive={clearMode} />
   
        {/* 🔘 Clear Button */}
        <div className="absolute top-20 right-4 z-20">
          <button
            onClick={() => setClearMode(!clearMode)}
            className="bg-blue-800 text-white px-4 py-2 rounded hover:bg-blue-700 transition-colors duration-200"
          >
            {clearMode ? "Back to Dashboard" : "Clear (Explore Globe)"}
          </button>
        </div>
  
        {/* 🟦 Main Content (hidden when clearMode is true) */}
        {!clearMode && (
          <div className="flex-grow flex flex-col relative z-10">
            {/* 🟦 Navbar */}
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
                <Link to="/manage-cases" className="block hover:text-blue-400" onClick={() => setShowMenu(false)}>📁 Manage Cases</Link>
              </div>
            )}
  
            {/* 🟦 Slogan */}
            <div className="text-center text-gray-300 text-lg tracking-wide mt-4 font-sans">
              Let's track the case
            </div>
  
            {/* 🟦 Main Content */}
            <main className="flex flex-col items-center justify-center w-full p-8 space-y-10">
              {/* Two placeholder images */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-8 w-full max-w-6xl">
                <div className="bg-white bg-opacity-10 border border-gray-700 rounded-lg h-64 flex items-center justify-center">
                  <span className="text-gray-300">[Snapshot Placeholder]</span>
                </div>
                <div className="bg-white bg-opacity-10 border border-gray-700 rounded-lg h-64 flex items-center justify-center">
                  <span className="text-gray-300">[Route Simulation Placeholder]</span>
                </div>
              </div>
  
              {/* Recent Cases */}
              <div className="w-full max-w-4xl bg-white bg-opacity-10 border border-gray-700 rounded-lg p-6">
                <h2 className="text-xl font-semibold mb-4 text-blue-500">Recent Cases</h2>
                <ul className="space-y-4">
                  {["ADF_XY_PE_2025", "ADF_XY_KZN_2024", "ADF_XY_KZN_2024", "ADF_XM_FLKN_2023"].map((caseId, index) => (
                    <li key={index} className="flex justify-between items-center border-b border-gray-700 pb-2">
                      <span className="text-gray-300">{caseId}</span>
                      <button className="text-sm border border-gray-300 text-white py-1 px-3 rounded hover:bg-blue-800 hover:text-white transition-colors duration-200">
                        Manage
                      </button>
                    </li>
                  ))}
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
                  <BarChartComponent />
                </div>
  
                {/* Map Visualization */}
                <div className="bg-white bg-opacity-10 border border-gray-700 rounded-lg p-6">
                  <h3 className="text-lg text-blue-500 mb-4 font-semibold">Vehicle Movement Heatmap</h3>
                  <MapComponent />
                </div>
              </div>
            </main>
          </div>
        )}
      </div>
    );
  }
  
  export default HomePage;