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

  // Function to extract first coordinate from CZML
  const extractFirstCoordinate = (czmlData) => {
    try {
      // Find the pathEntity in CZML data
      const pathEntity = czmlData.find(item => item.id === 'pathEntity');
      
      if (pathEntity && pathEntity.position && pathEntity.position.cartographicDegrees) {
        const coords = pathEntity.position.cartographicDegrees;
        
        // CZML cartographicDegrees format: [time, lng, lat, height, time, lng, lat, height, ...]
        // First coordinate starts at index 1 (skip first time value)
        if (coords.length >= 4) {
          const longitude = coords[1];
          const latitude = coords[2];
          const height = coords[3];
          
          console.log(`First coordinate: lng=${longitude}, lat=${latitude}, height=${height}`);
          
          return {
            longitude,
            latitude,
            height: height + 1000 // Add some height for better viewing
          };
        }
      }
      
      console.warn("Could not extract coordinates from CZML");
      return null;
    } catch (error) {
      console.error("Error extracting coordinates:", error);
      return null;
    }
  };

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

      {/* Cesium Viewer */}
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
                const viewer = viewerRef.current?.cesiumElement;
                const firstCoord = extractFirstCoordinate(czml);
              
                if (!viewer) return;
              
                if (firstCoord) {
                  const destination = Cesium.Cartesian3.fromDegrees(
                    firstCoord.longitude,
                    firstCoord.latitude,
                    firstCoord.height
                  );
              
                  // Fly camera to first coordinate
                  viewer.camera.flyTo({
                    destination,
                    orientation: {
                      heading: Cesium.Math.toRadians(0.0),
                      pitch: Cesium.Math.toRadians(-90.0),
                      roll: 0.0,
                    },
                    duration: 3.0,
                  });
              
                  // Wait briefly, then create tracking entity
                  setTimeout(() => {
                    const pathEntity = dataSource.entities.getById("pathEntity");
              
                    if (pathEntity && pathEntity.position) {
                      const vehicleEntity = dataSource.entities.add({
                        id: "trackingVehicle",
                        name: "Tracking Vehicle",
                        availability: pathEntity.availability,
                        position: pathEntity.position,
                        point: {
                          pixelSize: 15,
                          color: Cesium.Color.YELLOW,
                          outlineColor: Cesium.Color.BLACK,
                          outlineWidth: 3,
                          heightReference: Cesium.HeightReference.CLAMP_TO_GROUND,
                        },
                        billboard: {
                          image:
                            "data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMjQiIGhlaWdodD0iMjQiIHZpZXdCb3g9IjAgMCAyNCAyNCIgZmlsbD0ibm9uZSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj4KPHBhdGggZD0iTTEyIDJMMTMuMDkgOC4yNkwyMCA5TDEzLjA5IDE1Ljc0TDEyIDIyTDEwLjkxIDE1Ljc0TDQgOUwxMC45MSA4LjI2TDEyIDJaIiBmaWxsPSIjRkZEQjAwIiBzdHJva2U9IiMwMDAwMDAiIHN0cm9rZS13aWR0aD0iMSIvPgo8L3N2Zz4K",
                          scale: 2.0,
                          pixelOffset: new Cesium.Cartesian2(0, -24),
                        },
                      });
              
                      // ✅ Start tracking the vehicle
                      viewer.trackedEntity = vehicleEntity;
                      viewer.trackedEntity.viewFrom = new Cesium.Cartesian3(-300, -300, 200);
                    } else {
                      console.warn("Could not create tracking vehicle – pathEntity missing.");
                    }
                  }, 2000);
                } else {
                  // Fallback flyTo
                  viewer.flyTo(dataSource);
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