import React, { useState } from "react";
import { Link } from "react-router-dom";
import trackxLogo from "../assets/trackx-logo-removebg-preview.png";
import ADFLogoNoBg from "../assets/image-removebg-preview.png";
import AnimatedMap from "../components/AnimatedMap";
import technicalTermsSeed from "../data/technicalTermsSeed";
import { seedTechnicalTerms } from "../services/firebaseServices";

function AdminDashboardPage() {
  const [isSeedingTerms, setIsSeedingTerms] = useState(false);
  const [seedResult, setSeedResult] = useState(null);
  const [seedError, setSeedError] = useState("");

  const handleSeedTechnicalTerms = async () => {
    if (isSeedingTerms) {
      return;
    }
    const confirmed = window.confirm(
      "This will upsert the predefined technical glossary into Firestore. Continue?"
    );
    if (!confirmed) {
      return;
    }

    try {
      setIsSeedingTerms(true);
      setSeedError("");
      setSeedResult(null);
      const result = await seedTechnicalTerms(technicalTermsSeed);
      setSeedResult(result);
    } catch (error) {
      setSeedError(error.message || "Failed to seed technical terms. Check the console for details.");
    } finally {
      setIsSeedingTerms(false);
    }
  };

  return (
    <div className="relative min-h-screen overflow-hidden font-sans bg-black">
      <div className="absolute inset-0 z-0">
        <AnimatedMap />
      </div>

      <div className="relative z-10 flex flex-col items-center justify-center min-h-screen text-center text-white space-y-6 px-4">
        <img src={ADFLogoNoBg} alt="ADF Logo" className="h-40 mb-6" />
        <div className="mb-8">
          <img src={trackxLogo} alt="TrackX Logo" className="h-16 mx-auto mb-2" />
          <h1 className="text-4xl font-extrabold">Admin Dashboard</h1>
        </div>

        <div className="flex flex-col space-y-4 mt-6">
          <Link to="/pending-users">
            <button className="w-48 bg-gradient-to-r from-gray-500 to-gray-400 text-white py-2 rounded shadow transition-all duration-300 hover:from-blue-800 hover:to-blue-600">
              View Pending Users
            </button>
          </Link>
          <Link to="/all-users">
            <button className="w-48 bg-gradient-to-r from-gray-500 to-gray-400 text-white py-2 rounded shadow transition-all duration-300 hover:from-blue-800 hover:to-blue-600">
              View All Users
            </button>
          </Link>
          <Link to="/home">
            <button className="w-48 bg-gradient-to-r from-gray-500 to-gray-400 text-white py-2 rounded shadow transition-all duration-300 hover:from-blue-800 hover:to-blue-600">
              Return Home
            </button>
          </Link>
          <button
            onClick={handleSeedTechnicalTerms}
            disabled={isSeedingTerms}
            className={`w-48 py-2 rounded shadow transition-all duration-300 ${
              isSeedingTerms
                ? "bg-blue-900 cursor-not-allowed"
                : "bg-gradient-to-r from-green-600 to-green-500 hover:from-green-700 hover:to-green-600"
            }`}
          >
            {isSeedingTerms ? "Seeding Terms..." : "Initial Create Terms"}
          </button>
          {seedResult && (
            <p className="text-sm text-green-400">
              Completed: {seedResult.created} created, {seedResult.updated} updated.
            </p>
          )}
          {seedError && (
            <p className="text-sm text-red-400">{seedError}</p>
          )}
        </div>
      </div>
    </div>
  );
}

export default AdminDashboardPage;
