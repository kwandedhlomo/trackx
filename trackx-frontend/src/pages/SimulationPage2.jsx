import React, { useEffect, useState, useRef } from "react";
import { Viewer, CzmlDataSource, Entity, Cesium3DTileset } from "resium";
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
  query, 
  where, 
  onSnapshot,
} from "firebase/firestore";
import { Link, useNavigate } from "react-router-dom";
import { CustomDataSource } from "resium";
import flagIcon from "../assets/flag.png";
console.log("flagIcon path:", flagIcon);
import NotificationModal from "../components/NotificationModal";
import useNotificationModal from "../hooks/useNotificationModal";
import { getFriendlyErrorMessage } from "../utils/errorMessages";




// import { createWorldTerrainAsync } from "cesium";
const USE_GOOGLE_3D = true; // ← set to false to go back to Cesium terrain/imagery mode
Cesium.Ion.defaultAccessToken = import.meta.env.VITE_CESIUM_ION_TOKEN;



function SimulationPage2() {
  const [czml, setCzml] = useState(null);
  const [flaggedPoints, setFlaggedPoints] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const { modalState, openModal, closeModal } = useNotificationModal();
  const showError = (title, error, fallback) =>
    openModal({
      variant: "error",
      title,
      description: getFriendlyErrorMessage(error, fallback),
    });
  const showInfo = (title, description) =>
    openModal({
      variant: "info",
      title,
      description,
    });
  const showWarning = (title, description) =>
    openModal({
      variant: "warning",
      title,
      description,
    });
  const showSuccess = (title, description) =>
    openModal({
      variant: "success",
      title,
      description,
    });
  const viewerRef = useRef();
  const lastKnownPositionRef = useRef(null);
  const [vehicleReady, setVehicleReady] = useState(false);
  const vehicleEntityRef = useRef(null); 
  const lastSimMillisRef = useRef(null);
  const caseDataString = localStorage.getItem("trackxCaseData");
  const caseId = caseDataString ? JSON.parse(caseDataString)?.caseId || null : null;
  const caseNumber = caseDataString ? JSON.parse(caseDataString)?.caseNumber || null : null;
  const navigate = useNavigate();
  const trailPositionsRef = useRef([]);     // running list of Cartesian3 for the trail
  const trailEntityRef = useRef(null);      // the polyline entity
  const trailUpdaterCleanupRef = useRef(null); // to remove the updater on unmount/reload
  const tilesetReadyRef = useRef(false);
  const tilesetRef = useRef(null);      // holds the Google tileset instance
  const tilesReadyRef = useRef(false);  // true when no tiles are pending for current view
  const [progress, setProgress] = useState({ done: 0, total: 0 }); //progress bar for batching czml to google mesh
  const [isPreparing, setIsPreparing] = useState(true);
  const flagsDsRef = useRef(null);
  console.log("📦 Loaded caseId from localStorage:", caseId);
  console.log("🔢 Loaded caseNumber from localStorage:", caseNumber);
  const lastViewRef = useRef(null);
  const assetId = Number(import.meta.env.VITE_CESIUM_LAMBO_ASSET_ID ?? 3725350);

  const homePosition = Cartesian3.fromDegrees(18.4233, -33.918861, 1500); // Cape Town
  const [showFlagModal, setShowFlagModal] = useState(false); //forflagging
  const [flagTitle, setFlagTitle] = useState("");//forflagging
  const [flagNote, setFlagNote] = useState("");//forflagging
  const { profile } = useAuth();
  // --- 3D/2D toggle state & refs ---
  const [mode3D, setMode3D] = useState(true);
  const [isMorphing, setIsMorphing] = useState(false);

  const viewerReady = !!viewerRef.current?.cesiumElement;
  const floatingButtonBaseStyle = {
    position: "absolute",
    right: "30px",
    padding: "10px 18px",
    borderRadius: "999px",
    border: "1px solid rgba(56, 189, 248, 0.35)",
    background: "rgba(15, 23, 42, 0.85)",
    color: "#e2e8f0",
    fontWeight: 600,
    fontSize: "0.9rem",
    boxShadow: "0 12px 30px rgba(15, 23, 42, 0.45)",
    backdropFilter: "blur(6px)",
    letterSpacing: "0.01em",
    zIndex: 1000,
    transition: "transform 0.2s ease, box-shadow 0.2s ease",
    cursor: "pointer"
  };
  // remember whether playback was running before morph
  const wasAnimatingRef = useRef(true);

// keep exactly one onTick handler to force repaint during play/scrub
const onTickCleanupRef = useRef(null);
const MODEL_SCALE = 0.02;       // 0.05 first; tweak 0.02–0.08 as needed
const MIN_PIXEL_SIZE = 0;       // 0 or omit completely
const MAX_SCALE = 2.0;          // safety cap

function attachOnTickStable() {
  const v = viewerRef.current?.cesiumElement;
  if (!v) return;

  // remove any previous onTick to avoid duplicates
  if (onTickCleanupRef.current) {
    onTickCleanupRef.current();
    onTickCleanupRef.current = null;
  }

  const handler = () => {
    // repaint on every sim tick (keeps timeline + trail live)
    v.scene.requestRender();
  };

  v.clock.onTick.addEventListener(handler);
  onTickCleanupRef.current = () => v.clock.onTick.removeEventListener(handler);
}



const handleSignOut = async () => {
  try {
    await signOut(auth);
    navigate("/"); // Redirect to landing page
  } catch (error) {
    console.error("Sign-out failed:", error.message);
  }
};


  const [terrainProvider, setTerrainProvider] = useState(null);
  const [imageryProvider, setImageryProvider] = useState(null);
function getViewer() {
  // Resium: the real Cesium Viewer lives here
  return viewerRef.current?.cesiumElement || null;
}

function isFiniteVec3(v) {
  return v && isFinite(v.x) && isFinite(v.y) && isFinite(v.z);
}

// Safer: store heading/pitch/roll instead of raw direction/up
function captureViewSafe(viewer) {
  const cam = viewer.camera;
  const pos = cam.positionWC;
  if (!isFiniteVec3(pos)) return null;
  return {
    destination: pos.clone(),
    orientation: {
      heading: cam.heading,
      pitch: cam.pitch,
      roll: cam.roll,
    },
  };
}

function restoreViewSafe(viewer, view) {
  if (view && view.destination && isFiniteVec3(view.destination)) {
    viewer.camera.setView(view);
  } else {
    // fall back to current tracked entity or a gentle home
    if (vehicleEntityRef.current) {
      viewer.trackedEntity = vehicleEntityRef.current;
    } else {
      viewer.camera.flyHome(0.0);
    }
  }
}

// Don’t morph if we’re already in that mode; wait until morph completes
function waitForMorphComplete(viewer) {
  return new Promise((resolve) => {
    const off = viewer.scene.morphComplete.addEventListener(() => {
      off();
      resolve();
    });
  });
}

async function switchTo2D() {
  const viewer = getViewer();
  if (!viewer) return;
  if (viewer.scene.mode === Cesium.SceneMode.SCENE2D) return;

  wasAnimatingRef.current = viewer.clock.shouldAnimate;
  setIsMorphing(true);

  lastViewRef.current = captureViewSafe(viewer);

  if (tilesetRef.current) tilesetRef.current.show = false;
  viewer.scene.globe.depthTestAgainstTerrain = false;

  viewer.scene.morphTo2D(0.8);
  await waitForMorphComplete(viewer);

  if (vehicleEntityRef.current) viewer.trackedEntity = vehicleEntityRef.current;

  viewer.clock.shouldAnimate = wasAnimatingRef.current;
  setMode3D(false);
  setIsMorphing(false);
}

async function switchTo3D() {
  const viewer = getViewer();
  if (!viewer) return;
  if (viewer.scene.mode === Cesium.SceneMode.SCENE3D) return;

  wasAnimatingRef.current = viewer.clock.shouldAnimate;

  setIsMorphing(true);

  viewer.scene.morphTo3D(0.8);
  await waitForMorphComplete(viewer);

  if (tilesetRef.current) tilesetRef.current.show = true;
  viewer.scene.globe.depthTestAgainstTerrain = true;

  restoreViewSafe(viewer, lastViewRef.current);

  viewer.clock.shouldAnimate = wasAnimatingRef.current;
  setMode3D(true);
  setIsMorphing(false);
}

function onToggleProjection() {
  if (isMorphing) return;
  const viewer = getViewer();
  if (!viewer) return;
  const mode = viewer.scene.mode;
  if (mode === Cesium.SceneMode.SCENE3D) switchTo2D();
  else switchTo3D();
}



  // // useEffect(() => {
  // //   Cesium.createWorldTerrainAsync({
  // //     requestVertexNormals: true,  // for terrain lighting
  // //     requestWaterMask: true,      // optional but nice for oceans
  // //   }).then((terrain) => {
  // //     setTerrainProvider(terrain);
  // //   });
  // // }, []);

   useEffect(() => { ///NEW for Google 3D Tiles
   if (USE_GOOGLE_3D) return; // globe is off in Google mode
   Cesium.createWorldTerrainAsync({ requestVertexNormals: true, requestWaterMask: true })
     .then(setTerrainProvider);
 }, []);

  
    // // // ✅ Use Cesium Ion imagery to avoid Bing/CORS issues
    // // useEffect(() => {
    // //   Cesium.createWorldImageryAsync({
    // //     style: Cesium.IonWorldImageryStyle.AERIAL_WITH_LABELS
    // //   }).then(setImageryProvider);
    // // }, []);

 useEffect(() => { ///NEW for Google 3D Tiles
   if (USE_GOOGLE_3D) return;
   Cesium.createWorldImageryAsync({
     style: Cesium.IonWorldImageryStyle.AERIAL_WITH_LABELS
   }).then(setImageryProvider);
 }, []);

  // useEffect(() => {
  //   const v = viewerRef.current?.cesiumElement;
  //   if (!v) return;
  //   v.scene.globe.show = false;        // remove 2D underlay
  //   v.scene.skyAtmosphere.show = true; // keep sky
  //   v.scene.requestRender();
  // }, [viewerRef.current]);

  // useEffect(() => {
  //   const v = viewerRef.current?.cesiumElement;
  //   if (!v) return;
  //   v.scene.globe.show = false;        // hide the Cesium globe/imagery
  //   v.scene.skyAtmosphere.show = true; // keep the sky visible
  // }, [viewerRef.current]);

  useEffect(() => {
    const v = viewerRef.current?.cesiumElement;
    if (!v) return;
    v.scene.requestRenderMode = true;
    v.scene.maximumRenderTimeChange = Infinity;
    v.scene.requestRender();
  }, [viewerRef.current]);



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

      // Clear previous CZML before loading new one
      if (viewerRef.current && viewerRef.current.cesiumElement) {
        viewerRef.current.cesiumElement.dataSources.removeAll();
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


  // useEffect(() => { ///NEW for Google 3D Tiles
  //   if (!USE_GOOGLE_3D) return;
  //   const viewer = viewerRef.current?.cesiumElement;
  //   if (!viewer) return;

  //   (async () => {
  //     try {
  //       // Google tiles require the Google geocoder (we set it on the Viewer below)
  //       const tileset = await Cesium.createGooglePhotorealistic3DTileset({
  //         onlyUsingWithGoogleGeocoder: true,
  //       });
  //       viewer.scene.primitives.add(tileset);
  //       console.log("✅ Google Photorealistic 3D Tiles loaded");

  //       // Optional: Atmosphere looks nice with photorealistic tiles
  //       viewer.scene.skyAtmosphere.show = true;

  //       // (Optional) Prove coverage by jumping to a known city for 2 seconds, then back
  //       // const sf = Cesium.Cartesian3.fromDegrees(-122.4194, 37.7749, 1500);
  //       // viewer.camera.flyTo({ destination: sf, orientation: { pitch: Cesium.Math.toRadians(-30) }, duration: 2 });
  //     } catch (err) {
  //       console.error("❌ Failed to load Google Photorealistic 3D Tiles:", err);
  //     }
  //   })();
  // }, [viewerRef.current]);


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
  }, 300); 
  return () => clearInterval(interval);
}, []);

  useEffect(() => {
    const viewer = viewerRef.current?.cesiumElement;
    if (!viewer) return;

    // Don’t draw flags while “Preparing…” is true
    if (isPreparing) {
      // console.debug("Flags: still preparing, skip draw");
      return;
    }

    // Debug: see what we’re about to render
    console.log("Flags: draw request — count =", flaggedPoints?.length, "isPreparing =", isPreparing);

    (async () => {
      try {
        await rebuildFlagBillboards(viewer, flaggedPoints, 1.5);
        console.log("Flags: draw complete");
      } catch (e) {
        console.warn("Flags: rebuild failed:", e);
      }
    })();
  }, [flaggedPoints, isPreparing]);



      // See This Moment
      const handleSeeThisMoment = async () => {
        try {
      const viewer = viewerRef.current?.cesiumElement;
      const vehicleEntity = vehicleEntityRef.current;

      if (!viewer || !vehicleEntity || !vehicleEntity.position) {
            showWarning("Vehicle not ready", "The vehicle position is still loading. Please try again in a moment.");
            return;
      }
    
          const currentTime = viewer.clock.currentTime;
          let position = vehicleEntity.position.getValue(currentTime);
    
          if (!position && lastKnownPositionRef.current) {
            position = lastKnownPositionRef.current;
          }
          if (!position) {
            showWarning("Position unavailable", "We haven't received the vehicle's current position yet. Please try again shortly.");
            return;
          }
    
          const carto = Cesium.Cartographic.fromCartesian(position);
          const lat = Cesium.Math.toDegrees(carto.latitude);
          const lng = Cesium.Math.toDegrees(carto.longitude);
    
          // Open Google Street View at this lat/lng
          window.open(`https://www.google.com/maps?q=&layer=c&cbll=${lat},${lng}`, "_blank");
      } catch (err) {
        console.error("Failed to open Street View:", err);
          showError("Street View failed", err, "We couldn't open Google Street View for this location.");
      }
    };

//For the Flagging:
const handleFlagSubmit = async () => {
  try {
    const viewer = viewerRef.current?.cesiumElement;
    const vehicleEntity = vehicleEntityRef.current;
    console.log("Checking vehicleEntityRef:", vehicleEntity);


    if (!viewer) {
      console.error("Viewer not available.");
      showError("Viewer unavailable", null, "The 3D viewer isn't ready yet. Please wait a moment and try again.");
      return;
    }

    if (!vehicleEntity) {
      console.error("Vehicle entity not found.");
      showWarning("Vehicle not loaded", "The vehicle entity is still loading. Please try again in a moment.");
      return;
    }

    if (!vehicleEntity.position) {
      console.error("Vehicle entity has no position property.");
      showWarning("Position data missing", "We couldn't access the vehicle position data. Please try again later.");
      return;
    }

    const currentTime = viewer.clock.currentTime;
    console.log("Current simulation time:", currentTime.toString());

    let position = vehicleEntity.position.getValue(currentTime);
    console.log("🛰️ Raw position from Cesium:", position);

    if (!position && lastKnownPositionRef.current) {
      console.warn("Falling back to last known position.");
      position = lastKnownPositionRef.current;
    }

    if (!position) {
      console.error("Position is still undefined after fallback.");
      showWarning("Position unavailable", "We haven't received the vehicle's current position yet. Please try again shortly.");
      return;
    }

    const carto = Cesium.Cartographic.fromCartesian(position);
    const lat = Cesium.Math.toDegrees(carto.latitude);
    const lng = Cesium.Math.toDegrees(carto.longitude);
    console.log("Final lat/lng being used:", { lat, lng });

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
      console.log(`Converted ${dateString} → ${ms}ms since midnight`);
      return ms;
    };


    const utcDate = Cesium.JulianDate.toDate(viewer.clock.currentTime); 
    const currentTimeISO = utcDate.toISOString();
    const currentMillisSinceMidnight = toMillisSinceMidnight(currentTimeISO);
    console.log(`Cesium sim time (ISO): ${currentTimeISO}`);
    console.log(`Cesium millis since midnight: ${currentMillisSinceMidnight}`);



    let closestDoc = null;
    let smallestTimeDiff = Infinity;

    snapshot.forEach(docSnap => {
      const data = docSnap.data();

      if (data.timestamp) {
        const firestoreDate = toDateSafe(data.timestamp);
        if (!firestoreDate) return; // skip if conversion failed

        const firestoreISO = firestoreDate.toISOString();
        const pointMillisSinceMidnight = toMillisSinceMidnight(firestoreISO);

        console.log("Firestore Timestamp (full ISO):", firestoreISO);
        console.log("Firestore Time (ms since midnight):", pointMillisSinceMidnight);

        const diff = Math.abs(currentMillisSinceMidnight - pointMillisSinceMidnight);
        if (diff < smallestTimeDiff) {
          smallestTimeDiff = diff;
          closestDoc = { id: docSnap.id, ref: docSnap.ref };
        }
      }
    });


    console.log("Closest doc:", closestDoc?.id, "Time difference:", smallestTimeDiff);
    console.log("Fetching points for caseId:", caseId);
    console.log("Fetched docs count:", snapshot.size);

    if (!closestDoc) {
      console.error("No matching Firestore point found.");
      showInfo("Point not found", "We couldn't find a matching location in Firestore for the current time.");
      return;
    }

    console.log("Closest point doc ID:", closestDoc.id);
    await updateDoc(closestDoc.ref, {
      isFlagged: true,
      title: flagTitle,
      note: flagNote
    });

    showSuccess("Point flagged", "This moment has been flagged for follow-up.");
    setShowFlagModal(false);
    setFlagTitle("");
    setFlagNote("");
  } catch (err) {
    console.error("Flagging failed:", err);
    showError("Flagging failed", err, "We couldn't flag this location. Please try again.");
  }
};

const toDateSafe = (ts) => {
  if (!ts) return null;
  if (typeof ts.toDate === "function") return ts.toDate();  // Firestore Timestamp
  if (typeof ts === "string") return new Date(ts);          // ISO String
  return ts instanceof Date ? ts : null;                    // Already a Date
};

////Helpers:

// For static lon/lat points
function clampedCallbackPositionFromLngLat(lon, lat, fallbackHeight = 30) {
  return new Cesium.CallbackProperty(() => {
    const viewer = viewerRef.current?.cesiumElement;
    const base = Cesium.Cartesian3.fromDegrees(lon, lat, fallbackHeight);
    if (!viewer) return base;
    return viewer.scene.clampToHeight(base) || base;
  }, false);
}

// Lambo Helper - Wait for resource or fall back.
async function getIonResourceSafe(assetId, timeoutMs = 5000) {
  try {
    return await Promise.race([
      Cesium.IonResource.fromAssetId(assetId),                  // may 404
      new Promise((_, rej) => setTimeout(() => rej(new Error("Ion timeout")), timeoutMs)),
    ]);
  } catch (e) {
    console.warn("Ion resource failed:", e);
    return null;
  }
}


//nEW hELPERS i3:
// Clamp a time-varying position (from CZML) to the tiles each frame.
function clampedCallbackPositionFromProperty(positionProperty) {
  return new Cesium.CallbackProperty((time) => {
    const viewer = viewerRef.current?.cesiumElement;
    if (!viewer) return positionProperty.getValue(time);
    const raw = positionProperty.getValue(time); // Cartesian3
    if (!raw) return raw;
    return viewer.scene.clampToHeight(raw) || raw;
  }, false);
}

function flyToAsync(camera, opts) {
  return new Promise((resolve) => {
    camera.flyTo({
      ...opts,
      complete: resolve,
      cancel: resolve,
    });
  });
}

async function waitForTilesReady(tileset, settleMs = 250) {
  if (!tileset) return;
  // Already ready?
  if (tileset.tilesLoaded) {
    await new Promise(r => setTimeout(r, settleMs));
    return;
  }
  await new Promise((resolve) => {
    const done = () => {
      tileset.loadProgress.removeEventListener(listener);
      // small settle so visuals are crisp before starting
      setTimeout(resolve, settleMs);
    };
    const listener = (pending, processing) => {
      if (pending === 0 && processing === 0) done();
    };
    tileset.loadProgress.addEventListener(listener);
  });
}

// Build a denser time LUT so the line fills/erases smoothly when scrubbing.
// - originalTimes: array of Cesium.JulianDate (monotonic)
// - maxStepSec: maximum seconds between samples after densification
function buildSmoothedTimes(originalTimes, maxStepSec = 0.2) {
  if (!originalTimes || originalTimes.length < 2) return originalTimes || [];
  const out = [originalTimes[0]];
  for (let i = 1; i < originalTimes.length; i++) {
    const a = out[out.length - 1];
    const b = originalTimes[i];
    const segSec = Cesium.JulianDate.secondsDifference(b, a);
    if (segSec > maxStepSec) {
      const steps = Math.floor(segSec / maxStepSec);
      for (let k = 1; k < steps; k++) {
        out.push(Cesium.JulianDate.addSeconds(a, k * maxStepSec, new Cesium.JulianDate()));
      }
    }
    out.push(b);
  }
  return out;
}



// Append current vehicle position to the trail if moved enough.
// Clamps to Google 3D tiles so height matches what you see.
function appendTrailPointIfMoved({ viewer, entity, minMeters = 5, liftMeters = 0 }) {
  const time = viewer.clock.currentTime;
  const current = entity?.position?.getValue(time); // should already be following the path
  if (!current) return;

  // Clamp to tiles so altitude matches the mesh
  // clamp to Google tiles, not terrain
  let clamped = viewer.scene.clampToHeight(current);
  if (!clamped) clamped = current;
  // lift slightly to avoid z-fighting with roofs/roads
  const carto = Cesium.Cartographic.fromCartesian(clamped);
  clamped = Cesium.Cartesian3.fromRadians(carto.longitude, carto.latitude, carto.height + 2);

  const pts = trailPositionsRef.current;
  const last = pts.length ? pts[pts.length - 1] : null;

  // Only add if we've moved far enough
  if (!last || Cesium.Cartesian3.distance(last, clamped) >= minMeters) {
    // Optional small lift so the line renders clearly above the surface
    let raised = clamped;
    if (liftMeters !== 0) {
      const c = Cesium.Cartographic.fromCartesian(clamped);
      raised = Cesium.Cartesian3.fromRadians(c.longitude, c.latitude, c.height + liftMeters);
    }
    pts.push(raised);

    // Update (or create) the polyline entity
    let trail = trailEntityRef.current;
    if (!trail) {
      trail = viewer.entities.add({
        id: "routeTrail",
        polyline: {
          positions: pts,
          width: 4,
          material: Cesium.Color.CYAN.withAlpha(0.95),
          clampToGround: false, // tiles, not globe terrain
          // keep visible even if camera/tiles depth-test would hide it
          disableDepthTestDistance: Number.POSITIVE_INFINITY,
        },
      });
      trailEntityRef.current = trail;
    } else {
      trail.polyline.positions = pts;
    }

    // Render one frame (if requestRenderMode is on)
    viewer.scene.requestRender();
  }
}

// Build a clamped route using the *exact* CZML samples (no corner cutting).
// Returns { sampled: Cesium.SampledPositionProperty, times: Cesium.JulianDate[] }
// Exact clamping: use *CZML's own sample times*, with batching for large routes.
async function buildClampedRouteExact(
  viewer,
  sampledPositionProperty,
  liftMeters = 0,
  setProgressCallback = null
) {
  const internal =
    sampledPositionProperty?._property?._times ||
    sampledPositionProperty?._times ||
    [];
  const times = Array.from(internal);
  if (times.length < 2) {
    return { sampled: sampledPositionProperty, times: [] };
  }

  const raw = times.map((t) => sampledPositionProperty.getValue(t)).filter(Boolean);
  const n = raw.length;

  // Aim for ~8 batches
  const targetBatches = 8;
  let batchSize = Math.ceil(n / targetBatches);
  batchSize = Math.min(Math.max(batchSize, 250), 2000);

  const totalBatches = Math.ceil(n / batchSize);
  if (setProgressCallback) setProgressCallback({ done: 0, total: totalBatches });

  const clamped = [];
  for (let i = 0; i < n; i += batchSize) {
    const slice = raw.slice(i, i + batchSize);
    const part = await viewer.scene.clampToHeightMostDetailed(slice);
    clamped.push(...part);

    if (setProgressCallback) {
      setProgressCallback({ done: Math.min((i + batchSize) / batchSize, totalBatches), total: totalBatches });
    }

    // let UI breathe
    // eslint-disable-next-line no-await-in-loop
    await new Promise((r) => setTimeout(r, 0));
  }

  const sampled = new Cesium.SampledPositionProperty();
  for (let i = 0; i < clamped.length; i++) {
    const p = clamped[i];
    if (!p) continue;
    if (liftMeters !== 0) {
      const c = Cesium.Cartographic.fromCartesian(p);
      sampled.addSample(
        times[i],
        Cesium.Cartesian3.fromRadians(c.longitude, c.latitude, c.height + liftMeters)
      );
    } else {
      sampled.addSample(times[i], p);
    }
  }

  sampled.setInterpolationOptions({
    interpolationAlgorithm: Cesium.LinearApproximation,
    interpolationDegree: 1,
  });

  return { sampled, times };
}




// Build ONE clamped route sampled at regular times.
// Returns { sampled: Cesium.SampledPositionProperty, times: JulianDate[], raisedForTrail: Cartesian3[] }
async function buildClampedRoute(viewer, positionProperty, start, stop, maxSamples = 300, liftMetersForTrail = 2) {
  const totalSec = Math.max(1, Math.floor(Cesium.JulianDate.secondsDifference(stop, start)));
  const step = Math.max(0.5, Math.ceil(totalSec / maxSamples));

  const times = [];
  for (let t = 0; t <= totalSec; t += step) {
    times.push(Cesium.JulianDate.addSeconds(start, t, new Cesium.JulianDate()));
  }
  if (times.length === 0) times.push(start);

  // Raw CZML positions
  const raw = times.map((jd) => positionProperty.getValue(jd)).filter(Boolean);
  if (raw.length < 2) return { sampled: positionProperty, times: [], raisedForTrail: [] };

  // Clamp all at once (fast path), then build a sampled property
  const clamped = await viewer.scene.clampToHeightMostDetailed(raw);
  const sampled = new Cesium.SampledPositionProperty();
  const raisedForTrail = [];

  for (let i = 0; i < clamped.length; i++) {
    const c = clamped[i];
    if (!c) continue;
    const carto = Cesium.Cartographic.fromCartesian(c);
    const raised = Cesium.Cartesian3.fromRadians(carto.longitude, carto.latitude, carto.height + liftMetersForTrail);
    sampled.addSample(times[i], raised);      // dot follows this (no live clamp)
    raisedForTrail.push(raised);              // same heights for the trail (if you ever want full path)
  }

  return { sampled, times, raisedForTrail };
}


async function rebuildFlagBillboards(viewer, flaggedPoints, liftMeters = 1.5) {
  if (!viewer) return;

  // Use the Resium-mounted datasource
  const ds = flagsDsRef.current?.cesiumElement;
  if (!ds) {
    console.warn("Flags: datasource not ready");
    return;
  }

  ds.entities.removeAll();

  if (!Array.isArray(flaggedPoints) || flaggedPoints.length === 0) {
    viewer.scene.requestRender();
    console.log("Flags: nothing to draw");
    return;
  }

  // Build raw positions
  const raw = [];
  const payload = [];
  for (const fp of flaggedPoints) {
    if (fp?.longitude == null || fp?.latitude == null) continue;
    raw.push(Cesium.Cartesian3.fromDegrees(fp.longitude, fp.latitude, 30));
    payload.push(fp);
  }

  if (raw.length === 0) {
    console.log("Flags: no valid lon/lat");
    viewer.scene.requestRender();
    return;
  }

  // Try clamping to Google mesh
  let clamped = [];
  try {
    clamped = await viewer.scene.clampToHeightMostDetailed(raw);
  } catch (e) {
    console.warn("Flags: clamp failed, will fallback to fixed height", e);
    clamped = [];
  }

  // If clamp failed or returned empties, fallback to the raw positions (with modest height)
  const positions = clamped.length === raw.length && clamped.every(p => p && isFinite(p.x))
    ? clamped
    : raw;

  for (let i = 0; i < positions.length; i++) {
    const base = positions[i];
    if (!base || !isFinite(base.x) || !isFinite(base.y) || !isFinite(base.z)) continue;

    const c = Cesium.Cartographic.fromCartesian(base);
    const pos = Cesium.Cartesian3.fromRadians(
      c.longitude,
      c.latitude,
      (c.height || 30) + liftMeters
    );

    const p = payload[i];

    ds.entities.add({
      id: `flag-${p.id ?? i}`,
      position: pos,
      name: p.title || "Flag",
      description: `
        <b>${p.title || "Flag"}</b><br/>
        ${p.note ? p.note : ""}
      `,
      billboard: {
        image: flagIcon,
        scale: 1.2, // start small; 10 was huge
        verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
        heightReference: Cesium.HeightReference.NONE,
        disableDepthTestDistance: Number.POSITIVE_INFINITY,
        distanceDisplayCondition: new Cesium.DistanceDisplayCondition(0.0, 8000.0),
      },
      label: {
        text: p.title || "",
        font: "12px sans-serif",
        fillColor: Cesium.Color.WHITE,
        outlineColor: Cesium.Color.BLACK,
        outlineWidth: 2,
        pixelOffset: new Cesium.Cartesian2(0, -32),
        showBackground: true,
        backgroundColor: Cesium.Color.BLACK.withAlpha(0.5),
        disableDepthTestDistance: Number.POSITIVE_INFINITY,
        distanceDisplayCondition: new Cesium.DistanceDisplayCondition(0.0, 5000.0),
      },
      // optional: keep the timestamp on the entity for map-click jumps later
      properties: {
        timestampSecs: p.timestamp?.seconds ?? null,
      },
    });
    // Debug each add
    // console.log("Flags: added", p.title, pos, flagIcon);
  }

  viewer.scene.requestRender();
}




// // Build a polyline that hugs the tiles (pre-clamped positions), slightly lifted.
// async function buildClampedPolylineAboveTiles(viewer, positionsCartesian3, liftMeters = 2.0) {
//   // Clamp all points to the Google tiles at the most-detailed available level
//   const clamped = await viewer.scene.clampToHeightMostDetailed(positionsCartesian3);
//   const lifted = clamped.map(p => {
//     const carto = Cesium.Cartographic.fromCartesian(p);
//     return Cesium.Cartesian3.fromRadians(carto.longitude, carto.latitude, carto.height + liftMeters);
//   });

//   // Add/update a single polyline entity you can keep around
//   const existing = viewer.entities.getById("routePolyline");
//   const polylineOpts = {
//     id: "routePolyline",
//     polyline: {
//       positions: lifted,
//       width: 4,
//       material: Cesium.Color.CYAN.withAlpha(0.95),
//       arcType: Cesium.ArcType.GEODESIC,
//       // Ensure it draws above tiles if there’s any z-fighting
//       clampToGround: false, // (not supported for 3D Tiles)
//       // keep visible even if the camera clips into terrain/tiles occasionally
//       // @ts-ignore (supported on PolylineGraphics)
//       disableDepthTestDistance: Number.POSITIVE_INFINITY,
//     }
//   };
//   if (existing) {
//     existing.polyline.positions = lifted;
//   } else {
//     viewer.entities.add(polylineOpts);
//   }
// }

// Build a polyline at a fixed absolute height (AMSL), ignoring ground.
// Good for visual debugging: e.g., 300 m above sea level.
// function buildPolylineAtFixedHeight(viewer, positionsCartesian3, heightMeters = 300) {
//   const raised = positionsCartesian3
//     .filter(Boolean)
//     .map((p) => {
//       const carto = Cesium.Cartographic.fromCartesian(p);
//       return Cesium.Cartesian3.fromRadians(carto.longitude, carto.latitude, heightMeters);
//     });

//   const existing = viewer.entities.getById("routePolyline");
//   const polylineOpts = {
//     id: "routePolyline",
//     polyline: {
//       positions: raised,
//       width: 4,
//       material: Cesium.Color.CYAN.withAlpha(0.95),
//       arcType: Cesium.ArcType.GEODESIC,
//       // draw above everything (tiles/terrain) for debugging
//       disableDepthTestDistance: Number.POSITIVE_INFINITY,
//       clampToGround: false, // don’t clamp when using fixed height
//     }
//   };
//   if (existing) {
//     existing.polyline.positions = raised;
//   } else {
//     viewer.entities.add(polylineOpts);
//   }
// }



  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.8 }}
      className="relative min-h-screen text-white font-sans overflow-hidden flex flex-col"
    >
      <div className="absolute inset-0 bg-gradient-to-br from-black via-gray-900 to-black -z-10" />

      <nav className="flex items-center justify-between px-6 py-4 bg-gradient-to-r from-black to-gray-900 bg-opacity-80 backdrop-blur-md shadow-md z-10">
        <Link to="/home" className="inline-flex">
          <img src={adflogo} alt="Logo" className="h-12 cursor-pointer hover:opacity-80 transition" />
        </Link>
        <h1 className="text-xl font-bold">Route Simulation</h1>
        <div>
          <p className="text-sm">{profile ? `${profile.firstName} ${profile.surname}` : "Loading..."}</p>
          <button onClick={handleSignOut} className="text-red-400 hover:text-red-600 text-xs">Sign Out</button>
        </div>
      </nav>

      <div className="relative w-full h-[88vh] border border-gray-600 rounded overflow-hidden">
        <SimulationSidebar viewerRef={viewerRef} disabled={isPreparing} />
        <Viewer
          full
          ref={viewerRef}
          animation
          timeline
          shouldAnimate={true}
          scene3DOnly={true}
          homeButton={true}
          baseLayerPicker={false}
          // // geocoder={true}
          navigationHelpButton={true}
          fullscreenButton={true}
          sceneModePicker={false}
          selectionIndicator={true}
          infoBox={true}
          //camera={{ destination: homePosition }}
          // // terrainProvider={terrainProvider}
          // // imageryProvider={imageryProvider}
           terrainProvider={USE_GOOGLE_3D ? undefined : terrainProvider}
           imageryProvider={USE_GOOGLE_3D ? undefined : imageryProvider}
           geocoder={USE_GOOGLE_3D ? Cesium.IonGeocodeProviderType.GOOGLE : true}
           //globe={USE_GOOGLE_3D ? false : true}
           style={{ width: "100%", height: "100%" }}
           
        >
        <CustomDataSource name="flags-ds" ref={flagsDsRef} />
        <CzmlDataSource
          data={czml}
          onLoad={async (dataSource) => {
            // Hide any large sheets in the CZML
            dataSource.entities.values.forEach((e) => {
              if (e.rectangle || e.polygon) e.show = false;
            });

            const viewer = viewerRef.current?.cesiumElement;
            if (!viewer) return;

            // 1) Pause sim & keep overlay visible
            viewer.clock.shouldAnimate = false;
            setIsPreparing(true);

            // --- CLOCK SYNC: bind viewer's clock + timeline to the CZML clock ---
            if (dataSource.clock) {
              viewer.clock.startTime   = dataSource.clock.startTime.clone();
              viewer.clock.stopTime    = dataSource.clock.stopTime.clone();
              viewer.clock.currentTime = dataSource.clock.currentTime.clone();
              viewer.clock.clockRange  = Cesium.ClockRange.CLAMPED; // or UNBOUNDED
              viewer.clock.multiplier  = 1.0;
              viewer.timeline?.zoomTo(
                dataSource.clock.startTime,
                dataSource.clock.stopTime
              );
            } else {
              // Fallback if CZML had no clock: use entity availability if present
              let start = viewer.clock.startTime;
              let stop  = viewer.clock.stopTime;
              const pathAvail = dataSource.entities.getById("pathEntity")?.availability;
              if (pathAvail?.start && pathAvail?.stop) {
                start = pathAvail.start;
                stop  = pathAvail.stop;
              }
              viewer.clock.startTime   = start.clone();
              viewer.clock.stopTime    = stop.clone();
              viewer.clock.currentTime = start.clone();
              viewer.clock.clockRange  = Cesium.ClockRange.CLAMPED;
              viewer.timeline?.zoomTo(start, stop);
            }

            // Attach exactly one onTick that keeps frames repainting during play/scrub
            attachOnTickStable();

            // 2) Get the route entity
            const pathEntity = dataSource.entities.getById("pathEntity");
            if (!pathEntity?.position) {
              setLoading(false);
              viewer.flyTo(dataSource);
              return;
            }

            // Smooth interpolation (but we’ll still use a pre-clamped route)
            if (pathEntity.position.setInterpolationOptions) {
              pathEntity.position.setInterpolationOptions({
                interpolationAlgorithm: Cesium.LinearApproximation,
                interpolationDegree: 1,
              });

            }

            // 3) Decide time span
            let start = viewer.clock.startTime;
            let stop  = viewer.clock.stopTime;
            if (pathEntity.availability?.start && pathEntity.availability?.stop) {
              start = pathEntity.availability.start;
              stop  = pathEntity.availability.stop;
            }

            // Lock the clock to the route’s timeframe
            viewer.clock.startTime = start.clone();
            viewer.clock.stopTime  = stop.clone();
            viewer.clock.currentTime = start.clone();
            viewer.clock.clockRange = Cesium.ClockRange.CLAMPED;


            

            // 4) Choose a small window near the start to frame the camera
            const firstSec = Math.min(
              60,
              Math.max(1, Math.floor(Cesium.JulianDate.secondsDifference(stop, start)))
            );
            const sampleTimes = [];
            const step = Math.max(1, Math.ceil(firstSec / 20)); // ~20 samples
            for (let t = 0; t <= firstSec; t += step) {
              sampleTimes.push(Cesium.JulianDate.addSeconds(start, t, new Cesium.JulianDate()));
            }
            const routePositions = sampleTimes.map((jd) => pathEntity.position.getValue(jd)).filter(Boolean);

            // 5) Fly the camera and await completion
            async function flyToBoundingSphereAsync(camera, bs, options) {
              return new Promise((resolve) => {
                camera.flyToBoundingSphere(bs, {
                  ...options,
                  complete: resolve,
                  cancel: resolve,
                });
              });
            }

            if (routePositions.length >= 2) {
              const bs = Cesium.BoundingSphere.fromPoints(routePositions);
              const offset = new Cesium.HeadingPitchRange(
                0,
                Cesium.Math.toRadians(-25),
                Math.max(bs.radius * 3.0, 800)
              );
              await flyToBoundingSphereAsync(viewer.camera, bs, { offset, duration: 1.6 });
            } else {
              const first = pathEntity.position.getValue(start);
              if (first) {
                const c = Cesium.Cartographic.fromCartesian(first);
                const dest = Cesium.Cartesian3.fromRadians(c.longitude, c.latitude, 1200);
                await new Promise((resolve) => {
                  viewer.camera.flyTo({
                    destination: dest,
                    orientation: { heading: 0, pitch: Cesium.Math.toRadians(-25), roll: 0 },
                    duration: 1.4,
                    complete: resolve,
                    cancel: resolve,
                  });
                });
              }
            }

            // 6) Wait until Google tiles around this view are actually loaded
            await waitForTilesReady(tilesetRef.current, 300);

            // 7) Build ONE clamped route (dot + trail share this)
            // (buildClampedRoute is already defined in your file)
            // 7) Build ONE clamped route (dot + trail share this)
            let clampedRoute = pathEntity.position; // fallback
            try {
              const built = await buildClampedRouteExact(
                viewer,
                pathEntity.position,
                0,             // liftMeters
                setProgress    // pass the state updater
              );
              clampedRoute = built.sampled;

            } catch (e) {
              console.warn("buildClampedRouteExact failed; using raw positions", e);
            }
            
            // Get the original sample times, then densify them for a smoother line
            const originalTimes =
              clampedRoute?._property?._times ||
              clampedRoute?._times ||
              [];

            let smoothTimes = buildSmoothedTimes(originalTimes, 0.2); // 0.2s between points (very smooth)

            // Safety cap: if path is huge, relax density to keep things snappy
            if (smoothTimes.length > 10000) {
              smoothTimes = buildSmoothedTimes(originalTimes, 0.5); // ~2× lighter
            }



            // 8) Create/reuse the moving vehicle following the clamped route
            // 1) Get the Ion resource (await!)
            // after you have clampedRoute and pathEntity:
            const orientation = new Cesium.VelocityOrientationProperty(clampedRoute);

            // 1) Try to fetch Ion resource, but don't let it block the sim:
            let modelUri = null;
            const assetIdStr = import.meta.env.VITE_CESIUM_LAMBO_ASSET_ID;
            if (assetIdStr) {
              modelUri = await getIonResourceSafe(Number(assetIdStr), 5000); // ← won't hang forever
            }

            // 2) Optional local fallback (drop a copy in /public/models/Lambo.glb):
            if (!modelUri) {
              // If you *do* have a local GLB, keep this line; otherwise comment it out.
              modelUri = "/models/Lambo.glb";
            }

            // 3) Create/update the entity with best available visual:
            let vehicle = viewer.entities.getById("trackingVehicle");
            if (!vehicle) {
              const base = {
                id: "trackingVehicle",
                name: "Tracking Vehicle",
                availability: pathEntity.availability,
                position: clampedRoute,
                orientation,
              };

              if (modelUri) {
                vehicle = viewer.entities.add({
                  ...base,
                  model: {
                    uri: modelUri,
                    scale: MODEL_SCALE,
                    minimumPixelSize: MIN_PIXEL_SIZE,
                    maximumScale: MAX_SCALE,
                    runAnimations: false,
                    shadows: Cesium.ShadowMode.DISABLED,
                    distanceDisplayCondition: new Cesium.DistanceDisplayCondition(0.0, 20000.0),
                  },
                });
              } else {
                // Final fallback: the yellow dot (ensures the sim still runs)
                vehicle = viewer.entities.add({
                  ...base,
                  point: {
                    pixelSize: 15,
                    color: Cesium.Color.YELLOW,
                    outlineColor: Cesium.Color.BLACK,
                    outlineWidth: 3,
                    disableDepthTestDistance: Number.POSITIVE_INFINITY,
                  },
                });
              }

              vehicle.viewFrom = new Cesium.Cartesian3(-300, -300, 200);
              viewer.trackedEntity = vehicle;
            } else {
              // Converting existing entity
              vehicle.point = undefined;
              vehicle.billboard = undefined;
              vehicle.orientation = orientation;

              if (modelUri) {
                vehicle.model = {
                  uri: modelUri,
                  scale: MODEL_SCALE,
                  minimumPixelSize: MIN_PIXEL_SIZE,
                  maximumScale: MAX_SCALE,
                  runAnimations: false,
                  shadows: Cesium.ShadowMode.DISABLED,
                  distanceDisplayCondition: new Cesium.DistanceDisplayCondition(0.0, 20000.0),
                };
              } else {
                vehicle.model = undefined;
                vehicle.point = {
                  pixelSize: 15,
                  color: Cesium.Color.YELLOW,
                  outlineColor: Cesium.Color.BLACK,
                  outlineWidth: 3,
                  disableDepthTestDistance: Number.POSITIVE_INFINITY,
                };
              }
            }

            vehicleEntityRef.current = vehicle;
            setVehicleReady(true);

            // IMPORTANT: always drop the overlay and start the clock, success or fail
            viewer.clock.shouldAnimate = true;
            setLoading(false);
            setIsPreparing(false);


            vehicleEntityRef.current = vehicle;
            setVehicleReady(true);

            // 9) Create a dynamic trail polyline (smooth fill/erase; lifted above ground)
            if (trailEntityRef.current) {
              viewer.entities.remove(trailEntityRef.current);
              trailEntityRef.current = null;
            }
            trailEntityRef.current = viewer.entities.add({
              id: "routeTrail",
              polyline: {
                positions: new Cesium.CallbackProperty(() => {
                  const now = viewer.clock.currentTime;

                  const pts = [];
                  // collect densified points up to 'now'
                  for (let i = 0; i < smoothTimes.length; i++) {
                    const t = smoothTimes[i];
                    if (Cesium.JulianDate.lessThanOrEquals(t, now)) {
                      const p = clampedRoute.getValue(t);
                      if (!p || isNaN(p.x) || isNaN(p.y) || isNaN(p.z)) continue;
                      const c = Cesium.Cartographic.fromCartesian(p);
                      pts.push(Cesium.Cartesian3.fromRadians(c.longitude, c.latitude, c.height + 2)); // +2 m lift
                    } else {
                      break;
                    }
                  }

                  // add one extra interpolated point exactly at 'now' for a fluid tip
                  const pNow = clampedRoute.getValue(now);
                  if (pNow && !isNaN(pNow.x) && !isNaN(pNow.y) && !isNaN(pNow.z)) {
                    const cn = Cesium.Cartographic.fromCartesian(pNow);
                    pts.push(Cesium.Cartesian3.fromRadians(cn.longitude, cn.latitude, cn.height + 2));
                  }

                  return pts.length >= 2 ? pts : undefined;
                }, false),
                width: 4,
                material: Cesium.Color.CYAN.withAlpha(0.95),
                clampToGround: false, // 3D Tiles (not terrain)
                disableDepthTestDistance: Number.POSITIVE_INFINITY,
              },
            });


            // // 10) Single onTick updater to append trail points from the SAME clamped route
            // if (trailUpdaterCleanupRef.current) {
            //   trailUpdaterCleanupRef.current();
            //   trailUpdaterCleanupRef.current = null;
            // }

            // let lastTime = viewer.clock.currentTime;
            // const minMeters = 5;
            // const lift = 2; // draw trail 2 m above the surface

            // const onTick = () => {
            //   const now = viewer.clock.currentTime;

            //   // If user scrubbed backward, reset trail
            //   if (Cesium.JulianDate.lessThan(now, lastTime)) {
            //     trailPositionsRef.current = [];
            //     if (trailEntityRef.current) trailEntityRef.current.polyline.positions = [];
            //   }
            //   lastTime = now;

            //   const pos = clampedRoute.getValue(now);
            //   if (
            //     !pos ||
            //     isNaN(pos.x) ||
            //     isNaN(pos.y) ||
            //     isNaN(pos.z)
            //   ) {
            //     return; // skip invalid positions
            //   }

            //   const pts = trailPositionsRef.current;
            //   const prev = pts.length ? pts[pts.length - 1] : null;

            //   if (!prev || Cesium.Cartesian3.distance(prev, pos) > minMeters) {
            //     const c = Cesium.Cartographic.fromCartesian(pos);
            //     const raised = Cesium.Cartesian3.fromRadians(c.longitude, c.latitude, c.height + lift);
            //     pts.push(raised);
            //     trailEntityRef.current.polyline.positions = [...pts]; // replace array
            //     viewer.scene.requestRender();
            //   }
            // };

            // viewer.clock.onTick.addEventListener(onTick);
            // trailUpdaterCleanupRef.current = () => {
            //   viewer.clock.onTick.removeEventListener(onTick);
            // };

            // 11) Start the clock & drop the overlay
            viewer.clock.shouldAnimate = true;
            setLoading(false);
            setIsPreparing(false);   // ← now the sim is ready; enable clicks
          }}
        />





          {/* Google Photorealistic 3D Tiles */}
          <Cesium3DTileset
            url={`https://tile.googleapis.com/v1/3dtiles/root.json?key=${import.meta.env.VITE_GOOGLE_MAPS_API_KEY2}`}
            credit={new Cesium.Credit("© Google")}
            onReady={(tileset) => {
              tilesetRef.current = tileset;
              tileset.maximumScreenSpaceError = 16;
              tileset.dynamicScreenSpaceError = true;
              tileset.maximumNumberOfLoadedTiles = 256;

              const v = viewerRef.current?.cesiumElement;
              if (v) {
                const s = v.scene.screenSpaceCameraController;
                s.minimumZoomDistance = 60;
                s.maximumZoomDistance = 30000;

                v.scene.requestRenderMode = true;
                v.scene.maximumRenderTimeChange = Infinity;
                v.scene.fxaa = true;
                v.shadows = false;
                v.resolutionScale = 0.9;

                v.scene.requestRender();
              }
            }}
          />

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
            top: "160px",       
            right: "30px",      
            padding: "10px 20px",
            backgroundColor: "#34d399", 
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

                <div
                  style={{
                    position: "absolute",
                    right: 24,
                    top: 210,           // adjust to sit right under your “See This Moment” button
                    zIndex: 1000
                  }}
                >
                  <button
                    onClick={onToggleProjection}
                    disabled={isMorphing}
                    style={{
                      padding: "10px 20px",
                      borderRadius: 9999,
                      border: "none",
                      fontWeight: 700,
                      fontSize: "0.95rem",
                      color: "#fff",
                      backgroundColor: isMorphing ? "#64748b" : (mode3D ? "#0284c7" : "#4f46e5"),
                      boxShadow: "0 4px 12px rgba(0,0,0,0.2)",
                      cursor: isMorphing ? "not-allowed" : "pointer"
                    }}
                  >
                    {isMorphing ? "Switching…" : (mode3D ? "Switch to 2D (Fallback)" : "Return to 3D")}
                  </button>
                </div>

              
              console.log("viewer?", viewerRef.current?.cesiumElement);

        {loading && (
          <div className="absolute inset-0 bg-black bg-opacity-70 flex flex-col items-center justify-center z-50">
            <div className="animate-spin rounded-full h-10 w-10 border-t-2 border-b-2 border-cyan-400 mb-4"></div>
            <p className="text-cyan-300 text-sm">Preparing simulation...</p>
            {progress.total > 0 && (
              <p className="text-cyan-400 text-xs mt-2">
                Clamped {progress.done} / {progress.total} batches
              </p>
            )}
          </div>
        )}
      </div>

      <NotificationModal
        isOpen={modalState.isOpen}
        title={modalState.title}
        description={modalState.description}
        variant={modalState.variant}
        onClose={closeModal}
        primaryAction={modalState.primaryAction}
        secondaryAction={modalState.secondaryAction}
      />
    </motion.div>
  );
}

export default SimulationPage2;
