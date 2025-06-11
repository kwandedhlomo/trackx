// src/pages/SimulationPage2.jsx
import React from "react";
import { Viewer, Entity, PolylineGraphics } from "resium";
import { Cartesian3, Color } from "cesium";
import adflogo from "../assets/image-removebg-preview.png";
import { motion } from "framer-motion";

function SimulationPage2() {
  const caseName = "Example Case XYZ";

  // 🔹 Sample static route data for now
  const routePoints = [
    { lat: -33.918861, lng: 18.4233, height: 0 },
    { lat: -33.9192, lng: 18.4241, height: 10 },
    { lat: -33.9178, lng: 18.4215, height: 20 },
    { lat: -33.9181, lng: 18.4249, height: 5 },
  ];

  // 🔹 Convert route points into Cesium Cartesian3 positions
  const polylinePositions = routePoints.map((point) =>
    Cartesian3.fromDegrees(point.lng, point.lat, point.height)
  );

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
        {/* Title */}
        <h2 className="text-lg font-semibold mb-4">
          CesiumJS Simulation of {caseName}
        </h2>

        {/* Cesium 3D Viewer */}
        <div className="w-full h-[500px] border border-gray-600 rounded overflow-hidden">
          <Viewer full>
            <Entity name="Simulated Route">
              <PolylineGraphics
                positions={polylinePositions}
                width={4}
                material={Color.CYAN}
              />
            </Entity>
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
