import React, { useEffect, useState, useRef } from "react";
import { Viewer, CzmlDataSource } from "resium";
import * as Cesium from "cesium";
import { Cartesian3 } from "cesium";
import adflogo from "../assets/image-removebg-preview.png";
import { motion } from "framer-motion";
import axios from "axios";

function SimulationPage2() {
  const [czml, setCzml] = useState(null);
  const [error, setError] = useState(null);
  const viewerRef = useRef();

  const caseDataString = localStorage.getItem("trackxCaseData");
  const caseNumber = caseDataString ? JSON.parse(caseDataString).caseNumber : null;

  const homePosition = Cartesian3.fromDegrees(18.4233, -33.918861, 1500); // Cape Town

  useEffect(() => {
    const fetchCZML = async () => {
      try {
        if (!caseNumber) {
          setError("No case number found.");
          return;
        }

        const res = await axios.get(`http://localhost:8000/cases/czml/${caseNumber}`);
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
      transition={{ duration: 0.8 }}
      className="relative min-h-screen text-white font-sans overflow-hidden flex flex-col"
    >
      {/* Background Gradient */}
      <div className="absolute inset-0 bg-gradient-to-br from-black via-gray-900 to-black -z-10" />

      {/* Navbar */}
      <div className="flex items-center justify-between px-6 py-4 bg-black shadow-md z-10">
        <img src={adflogo} alt="Logo" className="h-12" />
        <h1 className="text-xl font-bold">3D Route Simulation</h1>
        <div>
          <p className="text-sm">Name Surname</p>
          <button className="text-red-400 hover:text-red-600 text-xs">Sign Out</button>
        </div>
      </div>

      {/* Cesium Viewer (styled like incoming, but using CZML) */}
      <div className="relative w-full h-[88vh] border border-gray-600 rounded overflow-hidden">
        <Viewer
          full
          ref={viewerRef}
          animation
          timeline
          shouldAnimate={true}
          scene3DOnly={false}
          homeButton={true}
          baseLayerPicker={true}
          geocoder={true}
          navigationHelpButton={true}
          fullscreenButton={true}
          sceneModePicker={true}
          selectionIndicator={true}
          infoBox={true}
          camera={{ destination: homePosition }}
          style={{ width: "100%", height: "100%" }}
        >
          {czml && (
            <CzmlDataSource
              data={czml}
              onLoad={(dataSource) => {
                if (viewerRef.current?.cesiumElement) {
                  viewerRef.current.cesiumElement.flyTo(dataSource.entities.values[0]);
                }
              }}
            />
          )}
        </Viewer>
      </div>

     
    </motion.div>
  );
}

export default SimulationPage2;