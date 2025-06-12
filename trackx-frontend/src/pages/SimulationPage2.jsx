// src/pages/SimulationPage2.jsx
import React from "react";
import { Viewer, Entity, PolylineGraphics } from "resium";
import { Cartesian3, Color } from "cesium";
import adflogo from "../assets/image-removebg-preview.png";
import { motion } from "framer-motion";

function SimulationPage2() {
  const caseName = "Example Case XYZ";

  const routePoints = [
    { lat: -33.918861, lng: 18.4233, height: 0 },
    { lat: -33.9192, lng: 18.4241, height: 10 },
    { lat: -33.9178, lng: 18.4215, height: 20 },
    { lat: -33.9181, lng: 18.4249, height: 5 },
  ];

  const polylinePositions = routePoints.map((point) =>
    Cartesian3.fromDegrees(point.lng, point.lat, point.height)
  );

  const homePosition = Cartesian3.fromDegrees(18.4233, -33.918861, 1500);

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

      {/* Cesium Viewer (increased height) */}
      <div className="relative w-full h-[88vh] border border-gray-600 rounded overflow-hidden">
        <Viewer
          scene3DOnly={false}
          homeButton={true}
          baseLayerPicker={true}
          timeline={true}
          animation={true}
          geocoder={true}
          navigationHelpButton={true}
          fullscreenButton={true}
          sceneModePicker={true}
          selectionIndicator={true}
          infoBox={true}
          shouldAnimate={true}
          camera={{ destination: homePosition }}
          style={{ width: "100%", height: "100%" }}
        >
          <Entity name="Simulated Route">
            <PolylineGraphics
              positions={polylinePositions}
              width={4}
              material={Color.CYAN}
            />
          </Entity>
        </Viewer>
      </div>

      {/* Compact Buttons Section */}
      <div className="absolute bottom-4 left-6 flex flex-wrap gap-4 z-20">
        <button className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded shadow-md">
          Edit Annotation Info
        </button>
        <button className="bg-purple-600 hover:bg-purple-700 text-white px-4 py-2 rounded shadow-md">
          Download Video
        </button>
      </div>
    </motion.div>
  );
}

export default SimulationPage2;
