import React, { useEffect, useState, useRef } from "react";
import { Viewer, CzmlDataSource } from "resium";
import * as Cesium from "cesium";
import { Cartesian3 } from "cesium";
import adflogo from "../assets/image-removebg-preview.png";
import { motion } from "framer-motion";
import axios from "axios";
import SimulationSidebar from "../components/SimulationSidebar";
import { db } from "../firebase";
import { useAuth } from "../context/AuthContext";
import { signOut } from "firebase/auth";
import { auth } from "../firebase";
import { doc, getDoc } from "firebase/firestore";
import {
  collection,
  getDocs,
  updateDoc,
  deleteDoc,
  query, // ← ADD THIS
  where, // ← ALSO PROBABLY USED
  onSnapshot,
} from "firebase/firestore";
import { useNavigate } from "react-router-dom";

Cesium.Ion.defaultAccessToken = import.meta.env.VITE_CESIUM_ION_TOKEN;



function SimulationPage2() {
  const [czml, setCzml] = useState(null);
  const [flaggedPoints, setFlaggedPoints] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const viewerRef = useRef();
  const lastKnownPositionRef = useRef(null);
  const [vehicleReady, setVehicleReady] = useState(false);
  const vehicleEntityRef = useRef(null); // ← holds the entity object directly
  const lastSimMillisRef = useRef(null);
  const caseDataString = localStorage.getItem("trackxCaseData");
  const caseId = caseDataString ? JSON.parse(caseDataString)?.caseId || null : null;
  const caseNumber = caseDataString ? JSON.parse(caseDataString)?.caseNumber || null : null;
  const navigate = useNavigate();

  console.log("📦 Loaded caseId from localStorage:", caseId);
  console.log("🔢 Loaded caseNumber from localStorage:", caseNumber);

  const homePosition = Cartesian3.fromDegrees(18.4233, -33.918861, 1500); // Cape Town
  const [showFlagModal, setShowFlagModal] = useState(false); //forflagging
  const [flagTitle, setFlagTitle] = useState("");//forflagging
  const [flagNote, setFlagNote] = useState("");//forflagging

const { profile } = useAuth();

const handleSignOut = async () => {
  try {
    await signOut(auth);
    navigate("/"); // Redirect to landing page
  } catch (error) {
    console.error("Sign-out failed:", error.message);
  }
};


  const extractFirstCoordinate = (czmlData) => {
    try {
      const pathEntity = czmlData.find(item => item.id === 'pathEntity');
      if (pathEntity && pathEntity.position && pathEntity.position.cartographicDegrees) {
        const coords = pathEntity.position.cartographicDegrees;
        if (coords.length >= 4) {
          return {
            longitude: coords[1],
            latitude: coords[2],
            height: coords[3] + 1000
          };
        }
      }
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

  useEffect(() => {
  if (!caseId) return;

  const ref = collection(db, `cases/${caseId}/interpolatedPoints`);
  const q = query(ref, where("isFlagged", "==", true));

  const unsubscribe = onSnapshot(q, (snapshot) => {
    const fetched = snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data(),
    }));
    setFlaggedPoints(fetched);
  });

  return () => unsubscribe();
}, [caseId]);


useEffect(() => {
  const interval = setInterval(() => {
  const viewer = viewerRef.current?.cesiumElement;
  const vehicleEntity = vehicleEntityRef.current;
  const vehicle = viewer?.entities.getById("trackingVehicle");

    if (viewer && vehicle && vehicle.position) {
      const currentTime = viewer.clock.currentTime;
      const pos = vehicle.position.getValue(currentTime);
      if (pos) {
        lastKnownPositionRef.current = pos;
      }
    }
  }, 500);

  return () => clearInterval(interval);
}, []);

useEffect(() => {
  const interval = setInterval(() => {
    const viewer = viewerRef.current?.cesiumElement;
    if (!viewer) return;

    const currentTime = viewer.clock.currentTime;
    const currentMillis = Cesium.JulianDate.toDate(currentTime).getTime();
    const lastMillis = lastSimMillisRef.current;

    const storedPoints = JSON.parse(localStorage.getItem("flaggedSidebarFlash") || "[]");

    // Skip first run to initialize
    if (!lastMillis) {
      lastSimMillisRef.current = currentMillis;
      return;
    }

    // Loop through flagged points
    storedPoints.forEach((point, idx) => {
      const pointMillis = point.timestamp?.seconds * 1000;

      // Check if point falls between last and current time
      if (
        pointMillis >= Math.min(lastMillis, currentMillis) &&
        pointMillis <= Math.max(lastMillis, currentMillis)
      ) {
        const event = new CustomEvent("flashSidebarItem", { detail: idx });
        window.dispatchEvent(event);
      }
    });

    lastSimMillisRef.current = currentMillis;
  }, 300); // tighter = more accurate
  return () => clearInterval(interval);
}, []);

      // ✅ NEW FUNCTION: See This Moment
      const handleSeeThisMoment = async () => {
        try {
          const viewer = viewerRef.current?.cesiumElement;
          const vehicleEntity = vehicleEntityRef.current;
    
          if (!viewer || !vehicleEntity || !vehicleEntity.position) {
            alert("Vehicle position not ready yet.");
            return;
          }
    
          const currentTime = viewer.clock.currentTime;
          let position = vehicleEntity.position.getValue(currentTime);
    
          if (!position && lastKnownPositionRef.current) {
            position = lastKnownPositionRef.current;
          }
          if (!position) {
            alert("Position not available yet.");
            return;
          }
    
          const carto = Cesium.Cartographic.fromCartesian(position);
          const lat = Cesium.Math.toDegrees(carto.latitude);
          const lng = Cesium.Math.toDegrees(carto.longitude);
    
          // 🔥 Open Google Street View at this lat/lng
          window.open(`https://www.google.com/maps?q=&layer=c&cbll=${lat},${lng}`, "_blank");
        } catch (err) {
          console.error("❌ Failed to open Street View:", err);
          alert("Could not open Street View.");
        }
      };

//For the Flagging:
const handleFlagSubmit = async () => {
  try {
    const viewer = viewerRef.current?.cesiumElement;
    const vehicleEntity = vehicleEntityRef.current;
    console.log("🧠 Checking vehicleEntityRef:", vehicleEntity);


    if (!viewer) {
      console.error("❌ Viewer not available.");
      alert("Viewer is not ready.");
      return;
    }

    if (!vehicleEntity) {
      console.error("❌ Vehicle entity not found.");
      alert("Vehicle entity is not ready.");
      return;
    }

    if (!vehicleEntity.position) {
      console.error("❌ Vehicle entity has no position property.");
      alert("Vehicle position data is missing.");
      return;
    }

    const currentTime = viewer.clock.currentTime;
    console.log("⏰ Current simulation time:", currentTime.toString());

    let position = vehicleEntity.position.getValue(currentTime);
    console.log("🛰️ Raw position from Cesium:", position);

    if (!position && lastKnownPositionRef.current) {
      console.warn("⚠️ Falling back to last known position.");
      position = lastKnownPositionRef.current;
    }

    if (!position) {
      console.error("❌ Position is still undefined after fallback.");
      alert("Vehicle position is not available yet.");
      return;
    }

    const carto = Cesium.Cartographic.fromCartesian(position);
    const lat = Cesium.Math.toDegrees(carto.latitude);
    const lng = Cesium.Math.toDegrees(carto.longitude);
    console.log("📍 Final lat/lng being used:", { lat, lng });

    const pointsRef = collection(db, `cases/${caseId}/interpolatedPoints`);
    const snapshot = await getDocs(pointsRef);

    const toMillisSinceMidnight = (dateString) => {
      const d = new Date(dateString);
      const ms = (
        d.getUTCHours() * 3600 * 1000 +
        d.getUTCMinutes() * 60 * 1000 +
        d.getUTCSeconds() * 1000 +
        d.getUTCMilliseconds()
      );
      console.log(`🕒 Converted ${dateString} → ${ms}ms since midnight`);
      return ms;
    };


    const utcDate = Cesium.JulianDate.toDate(viewer.clock.currentTime); // always in UTC
    const currentTimeISO = utcDate.toISOString(); // ✅ define this here
    const currentMillisSinceMidnight = toMillisSinceMidnight(currentTimeISO);
    console.log(`🕰️ Cesium sim time (ISO): ${currentTimeISO}`);
    console.log(`🕰️ Cesium millis since midnight: ${currentMillisSinceMidnight}`);



    let closestDoc = null;
    let smallestTimeDiff = Infinity;

    snapshot.forEach(docSnap => {
      const data = docSnap.data();

      if (data.timestamp) {
        const firestoreDate = toDateSafe(data.timestamp);
        if (!firestoreDate) return; // skip if conversion failed

        const firestoreISO = firestoreDate.toISOString();
        const pointMillisSinceMidnight = toMillisSinceMidnight(firestoreISO);

        console.log("📄 Firestore Timestamp (full ISO):", firestoreISO);
        console.log("📄 Firestore Time (ms since midnight):", pointMillisSinceMidnight);

        const diff = Math.abs(currentMillisSinceMidnight - pointMillisSinceMidnight);
        if (diff < smallestTimeDiff) {
          smallestTimeDiff = diff;
          closestDoc = { id: docSnap.id, ref: docSnap.ref };
        }
      }
    });


    console.log("✅ Closest doc:", closestDoc?.id, "Time difference:", smallestTimeDiff);
    console.log("🔍 Fetching points for caseId:", caseId);
    console.log("Fetched docs count:", snapshot.size);

    if (!closestDoc) {
      console.error("❌ No matching Firestore point found.");
      alert("No matching point found in Firestore.");
      return;
    }

    console.log("✅ Closest point doc ID:", closestDoc.id);
    await updateDoc(closestDoc.ref, {
      isFlagged: true,
      title: flagTitle,
      note: flagNote
    });

    alert("Point flagged successfully ✅");
    setShowFlagModal(false);
    setFlagTitle("");
    setFlagNote("");
  } catch (err) {
    console.error("❌ Flagging failed:", err);
    alert("Something went wrong.");
  }
};

const toDateSafe = (ts) => {
  if (!ts) return null;
  if (typeof ts.toDate === "function") return ts.toDate();  // Firestore Timestamp
  if (typeof ts === "string") return new Date(ts);          // ISO String
  return ts instanceof Date ? ts : null;                    // Already a Date
};


  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.8 }}
      className="relative min-h-screen text-white font-sans overflow-hidden flex flex-col"
    >
      <div className="absolute inset-0 bg-gradient-to-br from-black via-gray-900 to-black -z-10" />

      <div className="flex items-center justify-between px-6 py-4 bg-black shadow-md z-10">
        <img src={adflogo} alt="Logo" className="h-12" />
        <h1 className="text-xl font-bold">Route Simulation</h1>
        <div>
          <p className="text-sm">{profile ? `${profile.firstName} ${profile.surname}` : "Loading..."}</p>
          <button onClick={handleSignOut} className="text-red-400 hover:text-red-600 text-xs">Sign Out</button>
        </div>
      </div>

      <div className="relative w-full h-[88vh] border border-gray-600 rounded overflow-hidden">
        <SimulationSidebar viewerRef={viewerRef}/>
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
          //camera={{ destination: homePosition }}
          style={{ width: "100%", height: "100%" }}
        >
          {czml && (
            <CzmlDataSource
              data={czml}
              onLoad={(dataSource) => {
                const viewer = viewerRef.current?.cesiumElement;
                const firstCoord = extractFirstCoordinate(czml);

                if (!viewer) return;

                // ✅ End loading before animation starts
                setLoading(false);

                if (firstCoord) {
                  const destination = Cesium.Cartesian3.fromDegrees(
                    firstCoord.longitude,
                    firstCoord.latitude,
                    firstCoord.height
                  );

                  viewer.camera.flyTo({
                    destination,
                    orientation: {
                      heading: Cesium.Math.toRadians(0.0),
                      pitch: Cesium.Math.toRadians(-90.0),
                      roll: 0.0,
                    },
                    duration: 3.0,
                  });

                  setTimeout(() => {
                    const pathEntity = dataSource.entities.getById("pathEntity");
                    const existing = viewer.entities.getById("trackingVehicle");

                    if (existing) {
                      console.log("🧠 Existing trackingVehicle found");
                      vehicleEntityRef.current = existing;
                      setVehicleReady(true);
                      return; // ⬅ prevent double-add
                    }

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
                        image: "https://via.placeholder.com/24", // 🔁 Use a valid fallback image for now
                        scale: 2.0,
                        pixelOffset: new Cesium.Cartesian2(0, -24),
                      },
                    });

                    vehicleEntity.viewFrom = new Cesium.Cartesian3(-300, -300, 200);
                    viewer.trackedEntity = vehicleEntity;
                    vehicleEntityRef.current = vehicleEntity;
                    setVehicleReady(true);

                    console.log("🚗 vehicleEntityRef set from NEW:", vehicleEntityRef.current);
                  }, 2000);

                } else {
                  viewer.flyTo(dataSource);
                }
              }}
            />
            
          )}
          {flaggedPoints.map((point) => {
            if (!point.timestamp || !point.latitude || !point.longitude) return null;

            return (
              <Entity
                key={point.id}
                name={point.title || "Flag"}
                position={Cartesian3.fromDegrees(point.longitude, point.latitude)}
                point={{
                  pixelSize: 10,
                  color: Cesium.Color.CYAN.withAlpha(0.9),
                  outlineColor: Cesium.Color.WHITE,
                  outlineWidth: 2,
                }}
                label={{
                  text: point.title || "Flagged",
                  font: "12px sans-serif",
                  fillColor: Cesium.Color.CYAN,
                  outlineColor: Cesium.Color.BLACK,
                  outlineWidth: 2,
                  style: Cesium.LabelStyle.FILL_AND_OUTLINE,
                  pixelOffset: new Cesium.Cartesian2(0, -25),
                  verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
                  scale: 0.6,
                }}
              />
            );
          })}

        </Viewer>

        {!loading && vehicleReady && vehicleEntityRef.current && (
          <button
            onClick={() => setShowFlagModal(true)}
            style={{
              position: "absolute",
              top: "100px",
              right: "30px",
              padding: "10px 20px",
              backgroundColor: "#38bdf8",
              color: "black",
              border: "none",
              borderRadius: "10px",
              fontWeight: "bold",
              fontSize: "0.95rem",
              boxShadow: "0 0 8px rgba(56, 189, 248, 0.5)",
              zIndex: 1000,
              cursor: "pointer"
            }}
          >
            📍 Flag This Moment
          </button>
        )}

        {showFlagModal && (
          <div
            style={{
              position: "absolute",
              top: 0, left: 0, right: 0, bottom: 0,
              backgroundColor: "rgba(0,0,0,0.7)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              zIndex: 2000
            }}
          >
            <div
              style={{
                backgroundColor: "#1e1e1e",
                padding: "24px",
                borderRadius: "12px",
                boxShadow: "0 0 20px rgba(0,0,0,0.4)",
                width: "90%",
                maxWidth: "400px",
                color: "white"
              }}
            >
              <h2 style={{ fontSize: "1.2rem", marginBottom: "12px" }}>📝 Add Note for This Moment</h2>
              
              <input
                type="text"
                placeholder="Title (e.g. Suspect seen here)"
                value={flagTitle}
                onChange={(e) => setFlagTitle(e.target.value)}
                style={{
                  width: "100%",
                  padding: "8px",
                  marginBottom: "12px",
                  borderRadius: "8px",
                  border: "1px solid #333",
                  backgroundColor: "#111",
                  color: "#fff"
                }}
              />
              <textarea
                placeholder="Note details..."
                value={flagNote}
                onChange={(e) => setFlagNote(e.target.value)}
                rows={4}
                style={{
                  width: "100%",
                  padding: "8px",
                  borderRadius: "8px",
                  border: "1px solid #333",
                  backgroundColor: "#111",
                  color: "#fff",
                  marginBottom: "16px"
                }}
              />

              <div style={{ display: "flex", justifyContent: "flex-end", gap: "12px" }}>
                <button
                  onClick={() => setShowFlagModal(false)}
                  style={{
                    padding: "8px 14px",
                    backgroundColor: "#444",
                    borderRadius: "8px",
                    color: "white",
                    border: "none"
                  }}
                >
                  Cancel
                </button>
                <button
                  onClick={handleFlagSubmit}
                  style={{
                    padding: "8px 14px",
                    backgroundColor: "#38bdf8",
                    borderRadius: "8px",
                    color: "#000",
                    fontWeight: "bold",
                    border: "none"
                  }}
                >
                  Save Note
                </button>
              </div>
            </div>
          </div>
        )}
        <button
          onClick={handleSeeThisMoment}
            style={{
            position: "absolute",
            top: "160px",       // adjust vertical position as needed
            right: "30px",      // align with your other button
            padding: "10px 20px",
            backgroundColor: "#34d399", // green accent
            color: "black",
            border: "none",
            borderRadius: "10px",
            fontWeight: "bold",
            fontSize: "0.95rem",
            boxShadow: "0 0 8px rgba(52, 211, 153, 0.5)",
            zIndex: 1000,
            cursor: "pointer"
                  }}
                >
                  👁️ See This Moment
                </button>


        {loading && (
          <div className="absolute inset-0 bg-black bg-opacity-70 flex flex-col items-center justify-center z-50">
            <div className="animate-spin rounded-full h-10 w-10 border-t-2 border-b-2 border-cyan-400 mb-4"></div>
            <p className="text-cyan-300 text-sm">Preparing simulation...</p>
          </div>
        )}
      </div>
    </motion.div>
  );
}

export default SimulationPage2;
