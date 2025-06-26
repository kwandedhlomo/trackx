import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { DeckGL } from '@deck.gl/react';
import { HeatmapLayer } from '@deck.gl/aggregation-layers';
import { ScatterplotLayer } from '@deck.gl/layers';
import Map from 'react-map-gl';
import axios from 'axios';
import MapSwitcherPanel from "../components/MapSwitcherPanel";
import { HexagonLayer } from '@deck.gl/aggregation-layers';



const MAPBOX_TOKEN = 'pk.eyJ1Ijoiam9ubHVrZTciLCJhIjoiY21icjgzYW1lMDczazJqc2Fmbm4xd2RteSJ9.pbPMQ4ywc52Fy0TXp4ndHg';

function HeatmapPage() {
  const [points, setPoints] = useState([]);
  const [activeMap, setActiveMap] = useState("Heatmap");
  const [startPointsEnabled, setStartPointsEnabled] = useState(false);
  const [endPointsEnabled, setEndPointsEnabled] = useState(false);
  const [mapStyle, setMapStyle] = useState("mapbox://styles/mapbox/dark-v11");
  const navigate = useNavigate();
  const [showHeatmap, setShowHeatmap] = useState(true);
  const [caseDataMap, setCaseDataMap] = useState({});


  useEffect(() => {
  const fetchAndProcessPoints = async () => {
    try {
      const res = await axios.get('http://localhost:8000/cases/all-points-with-case-ids');
      const rawPoints = res.data.points;

      // 1. Group by caseId
      const grouped = {};
      for (const point of rawPoints) {
        const caseId = point.caseId;
        if (!grouped[caseId]) grouped[caseId] = [];
        grouped[caseId].push(point);
      }

      const finalPoints = [];

      for (const caseId in grouped) {
        const casePoints = grouped[caseId];

        // 2. Sort by record number in timestamp (e.g., "Record 1")
        casePoints.sort((a, b) => {
          const aNum = parseInt(a.timestamp?.replace(/\D/g, "")) || 0;
          const bNum = parseInt(b.timestamp?.replace(/\D/g, "")) || 0;
          return aNum - bNum;
        });

        // 3. Label the first and last
        casePoints.forEach((p, index) => {
          const label =
            index === 0
              ? "start"
              : index === casePoints.length - 1
              ? "end"
              : "middle";
          finalPoints.push({
            position: [p.lng, p.lat],
            type: label,
            caseId: p.caseId,
            timestamp: p.timestamp,
          });
        });
      }

      console.log("🏁 Tagged points:", finalPoints);
      setPoints(finalPoints);

      
      try {
        const caseRes = await axios.get("http://localhost:8000/cases/all");
        console.log("✅ Raw case documents:", caseRes.data); // Add this

        const caseDocs = caseRes.data; // ✅ This is already the array!

        const caseMap = {};
        caseDocs.forEach(doc => {
          console.log("🧾 Inspecting raw case doc:", doc); // 👈 Add this

          const id = doc.id; // 👈 Try using the field you expect to be unique
          if (id) {
            caseMap[id] = doc;
          } else {
            console.warn("⚠️ Could not extract ID from case doc:", doc);
          }
        });


        setCaseDataMap(caseMap);
        console.log("📂 Final caseDataMap keys:", Object.keys(caseMap)); // ⬅️ Add this here

      } catch (caseError) {
        console.error("❌ Failed to fetch case metadata:", caseError);
      }
    } catch (error) {
      console.error("Failed to fetch processed points:", error);
    }
  };

  fetchAndProcessPoints();
}, []);


useEffect(() => {
  const fetchCaseDocuments = async () => {
    try {
      const res = await axios.get("http://localhost:8000/cases/all"); // or your deployed API URL
      const cases = res.data;

      const map = {};
      cases.forEach(c => {
        map[c.id] = c; // `id` must match `caseId` from the point data
      });

      setCaseDataMap(map);
    } catch (error) {
      console.error("❌ Failed to fetch case documents", error);
    }
  };

  fetchCaseDocuments();
}, []);


  // Heatmap layer
const heatmapLayer = new HeatmapLayer({
  id: 'heatmap-layer',
  data: points,
  getPosition: d => d.position,
  getWeight: () => 1,
  radiusPixels: 60,
  opacity: !showHeatmap ? 0 : (startPointsEnabled || endPointsEnabled ? 0.2 : 1.0),
});


  // Start Points as Scatterplot
const startPointsLayer = new ScatterplotLayer({
  id: 'start-points-layer',
  data: points.filter(p => p.type === 'start'),
  getPosition: d => d.position,
  getFillColor: [34, 197, 94],
  getRadius: 50,
  opacity: 0.9,
  radiusMinPixels: 3,
  radiusMaxPixels: 15,
  pickable: true,
  getTooltip: ({ object }) => {
  try {
    if (!object || !object.caseId) return null; // ✅ Skip if object/caseId is missing

    const caseDoc = caseDataMap[object.caseId];
    return caseDoc
      ? `Start of Case: ${caseDoc.caseTitle || "Unknown"} – ${caseDoc.dateOfIncident || "No date"}`
      : "Start Point";

  } catch (e) {
    console.warn("⚠️ Tooltip error:", e);
    return null;
  }
}

});


const endPointsLayer = new ScatterplotLayer({
  id: 'end-points-layer',
  data: points.filter(p => p.type === 'end'),
  getPosition: d => d.position,
  getFillColor: [255, 70, 70],
  getRadius: 50,
  opacity: 0.9,
  radiusMinPixels: 3,
  radiusMaxPixels: 15,
  pickable: true,
  getTooltip: ({ object }) => {
  try {
    if (!object || !object.caseId) return null; // ✅ Skip if object/caseId is missing
    console.log("🧪 Tooltip object:", object);
    const caseDoc = caseDataMap[object.caseId];
    return caseDoc
      ? `Start of Case: ${caseDoc.name || object.caseId}`
      : "End Point";

  } catch (e) {
    console.warn("⚠️ Tooltip error:", e);
    return null;
  }
}
});


const hexagonLayer = new HexagonLayer({
  id: 'hexagon-layer',
  data: points.filter(p => p.type === 'start' || p.type === 'end'),
  getPosition: d => d.position,
  radius: 2000,
  elevationScale: 50,
  extruded: true,
  pickable: true,
  colorAggregation: 'SUM',
  elevationAggregation: 'SUM',
  getColorWeight: () => 1,
  getElevationWeight: () => 1,
  gpuAggregation: false, // 🔥 Required for on-hover tooltips to work

  getTooltip: ({ object }) => {
    if (!object || !object.points) return null;

    const uniqueCases = new Set(object.points.map(p => p.caseId));

    const casesInfo = [...uniqueCases].map(caseId => {
      const doc = caseDataMap[caseId];

      // 🔍 Logging to inspect document structure
      console.log("📦 Tooltip doc for caseId:", caseId, doc);

      const name = doc?.caseTitle || "Unknown Case";
      const date = doc?.dateOfIncident || "No date";
      return `🔹 ${name} – ${date}`;
    });

    return {
      text: `${uniqueCases.size} case(s) in this area:\n${casesInfo.join('\n')}`
    };
  }
});


// const hexLayer = new HexagonLayer({
//   id: 'hex-layer',
//   data: points.filter(p => p.type === 'start' || p.type === 'end'),
//   getPosition: d => d.position,
//   radius: 1000, // adjust this to change hex size
//   elevationScale: 50,
//   extruded: true,
//   pickable: true,
//   elevationRange: [0, 1000],
//   opacity: 0.6,
// });

const getLayers = () => {
  const layers = [];

  if (activeMap === "Heatmap") {
    if (showHeatmap) layers.push(heatmapLayer);
    if (startPointsEnabled) layers.push(startPointsLayer);
    if (endPointsEnabled) layers.push(endPointsLayer);
  }

  if (activeMap === "HexMap") {
    layers.push(hexagonLayer);
    layers.push(startPointsLayer);
    layers.push(endPointsLayer);
  }

  return layers;
};

  return (
    <div style={{ width: '100vw', height: '100vh', position: 'relative' }}>
      <MapSwitcherPanel
        onMapChange={setActiveMap}
        startPointsEnabled={startPointsEnabled}
        endPointsEnabled={endPointsEnabled}
        onToggleStartPoints={setStartPointsEnabled}
        onToggleEndPoints={setEndPointsEnabled}
        mapStyle={mapStyle}
        setMapStyle={setMapStyle}
        showHeatmap={showHeatmap}
        setShowHeatmap={setShowHeatmap}
      />

          <DeckGL
          initialViewState={{
            longitude: 18.4233,
            latitude: -33.918861,
            zoom: 13,
            bearing: 0,
            pitch: 0,
          }}
            controller={true}
            layers={getLayers()}
            getTooltip={info => info?.layer?.props?.getTooltip?.(info)} // ✅ Add this line
          >
          <Map
            mapboxAccessToken={MAPBOX_TOKEN}
            mapStyle={mapStyle}
          />
        </DeckGL>


      <button
        onClick={() => navigate("/home")}
        style={{
          position: 'absolute',
          bottom: '20px',
          left: '20px',
          padding: '12px 20px',
          backgroundColor: '#0f172a',
          color: 'white',
          fontSize: '1rem',
          borderRadius: '999px',
          border: '2px solid #3b82f6',
          cursor: 'pointer',
          boxShadow: '0 0 12px #3b82f6, 0 0 20px rgba(59, 130, 246, 0.4)',
          zIndex: 999,
          transition: 'all 0.3s ease-in-out'
        }}
        onMouseEnter={e => {
          e.currentTarget.style.boxShadow = '0 0 16px #60a5fa, 0 0 28px rgba(59, 130, 246, 0.6)';
          e.currentTarget.style.transform = 'scale(1.05)';
        }}
        onMouseLeave={e => {
          e.currentTarget.style.boxShadow = '0 0 12px #3b82f6, 0 0 20px rgba(59, 130, 246, 0.4)';
          e.currentTarget.style.transform = 'scale(1)';
        }}
      >
        ⬅ Back to Home
      </button>
    </div>
  );
}

export default HeatmapPage;
