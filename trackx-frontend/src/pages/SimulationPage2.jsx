import React, { useEffect, useState, useRef } from "react";
import { Viewer, CzmlDataSource } from "resium";
import * as Cesium from "cesium"; // ✅ Fix here
import adflogo from "../assets/image-removebg-preview.png";
import { motion } from "framer-motion";
import axios from "axios";



function SimulationPage2() {
  const [czml, setCzml] = useState(null);
  const [error, setError] = useState(null);
  const caseDataString = localStorage.getItem("trackxCaseData");
  const caseNumber = caseDataString ? JSON.parse(caseDataString).caseNumber : null;
  const viewerRef = useRef(); // 👈 New

  useEffect(() => {
    const fetchCZML = async () => {
      try {
        if (!caseNumber) {
          setError("No case number found.");
          return;
        }

        const res = await axios.get(
          `http://localhost:8000/cases/czml/${caseNumber}`
        );
        setCzml(res.data);
      } catch (err) {
        console.error("Error fetching CZML:", err);
        setError("Failed to load simulation data.");
      }
    };

    fetchCZML();
  }, [caseNumber]);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 1 }}
      className="relative min-h-screen text-white font-sans overflow-hidden"
    >
      {/* Gradient Background */}
      <div className="absolute inset-0 bg-gradient-to-br from-black via-gray-900 to-black -z-10" />

      {/* Navbar */}
      <div className="flex items-center justify-between px-6 py-4 bg-black shadow-md">
        <img src={adflogo} alt="Logo" className="h-12" />
        <h1 className="text-xl font-bold text-white">3D Route Simulation</h1>
        <div className="flex items-center space-x-4">
          <div>
            <p className="text-sm">Name Surname</p>
            <button className="text-red-400 hover:text-red-600 text-xs">Sign Out</button>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="px-6 py-8 space-y-6">
        <h2 className="text-lg font-semibold mb-4">CZML Simulation</h2>

        {error && <p className="text-red-400">{error}</p>}

        <div className="w-full h-[500px] border border-gray-600 rounded overflow-hidden">
          <Viewer full ref={viewerRef} animation timeline shouldAnimate={true}>
            {czml && (
              <CzmlDataSource
                data={czml}
                onLoad={(dataSource) => {
                  if (viewerRef.current && viewerRef.current.cesiumElement) {
                    viewerRef.current.cesiumElement.flyTo(dataSource.entities.values[0]); // ✅ Works now
                  }
                }}
              />
            )}
          </Viewer>
        </div>

        {/* Buttons */}
        <div className="flex justify-start space-x-4 mt-6">
          <button className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded">
            Edit Annotation Info
          </button>
          <button className="bg-purple-600 hover:bg-purple-700 text-white px-4 py-2 rounded">
            Download Video
          </button>
        </div>
      </div>
    </motion.div>
  );
}

export default SimulationPage2;