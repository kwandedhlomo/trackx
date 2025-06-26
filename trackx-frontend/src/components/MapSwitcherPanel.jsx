import { useState } from "react";
import darkPreview from "../assets/maps/Dark.png";
import lightPreview from "../assets/maps/Light.png";
import satellitePreview from "../assets/maps/Satellite.png";
import streetsPreview from "../assets/maps/Streets.png";


const mapOptions = [
  {
    name: "Heatmap",
    description: "Visualizes activity density using GPS data. Ideal for hotspots and clustering.",
  },
  {
    name: "HexMap",
    description: "Visualizes density of routes travelled using hex bins.",
    image: "/images/placeholder.png" 
  },
  {
    name: "Vehicle Route",
    description: "Displays trip paths and connections between start and end locations.",
  }
];

const mapboxStyles = [
  {
    name: "Dark",
    value: "mapbox://styles/mapbox/dark-v11",
    preview: darkPreview
  },
  {
    name: "Light",
    value: "mapbox://styles/mapbox/light-v10",
    preview: lightPreview
  },
  {
    name: "Satellite",
    value: "mapbox://styles/mapbox/satellite-streets-v12",
    preview: satellitePreview
  },
  {
    name: "Streets",
    value: "mapbox://styles/mapbox/streets-v12",
    preview: streetsPreview
  }
];



export default function MapSwitcherPanel({
  onMapChange,
  startPointsEnabled,
  endPointsEnabled,
  onToggleStartPoints,
  onToggleEndPoints,
  mapStyle,
  setMapStyle,
  showHeatmap,
  setShowHeatmap
}) {
  const [mapIndex, setMapIndex] = useState(0);
  const [collapsed, setCollapsed] = useState(false);
  const currentMap = mapOptions[mapIndex];
  
  

  const goNext = () => {
    if (mapIndex < mapOptions.length - 1) {
      const newIndex = mapIndex + 1;
      setMapIndex(newIndex);
      onMapChange(mapOptions[newIndex].name);
    }
  };

  const goPrev = () => {
    if (mapIndex > 0) {
      const newIndex = mapIndex - 1;
      setMapIndex(newIndex);
      onMapChange(mapOptions[newIndex].name);
    }
  };

  return (
    <div
      style={{
        position: "absolute",
        top: "24px",
        left: "24px",
        width: collapsed ? "64px" : "340px",
        backgroundColor: "#1e1e1e",
        color: "#f1f5f9",
        padding: "20px",
        borderRadius: "16px",
        boxShadow: "0 0 24px rgba(0, 0, 0, 0.6), 0 0 12px rgba(100, 100, 100, 0.3)",
        zIndex: 999,
        transition: "all 0.4s ease",
        overflow: "hidden",
      }}
    >
      {/* Collapse Toggle */}
      <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: collapsed ? "0" : "16px" }}>
        <button
          onClick={() => setCollapsed(!collapsed)}
          style={{
            background: "none",
            color: "#38bdf8",
            border: "none",
            cursor: "pointer",
            fontSize: "1.8rem",
            transform: collapsed ? "rotate(90deg)" : "rotate(0deg)",
            transition: "transform 0.4s ease",
          }}
          title={collapsed ? "Expand menu" : "Collapse menu"}
        >
          ☰
        </button>
      </div>

      {!collapsed && (
        <>
          {/* Map Name + Arrows */}
          <div style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: "18px"
          }}>
            {mapIndex > 0 ? (
              <button onClick={goPrev} style={arrowButtonStyle}>⮜</button>
            ) : <div style={{ width: "48px" }} />}
            <span style={{ fontSize: "1.4rem", fontWeight: "bold" }}>{currentMap.name}</span>
            {mapIndex < mapOptions.length - 1 ? (
              <button onClick={goNext} style={arrowButtonStyle}>⮞</button>
            ) : <div style={{ width: "48px" }} />}
          </div>

          {/* Description */}
          <p style={{ fontSize: "1rem", lineHeight: "1.6", color: "#cbd5e1", marginBottom: "16px" }}>
            {currentMap.description}
          </p>

          {/* Show Start/End Point Toggles */}
          {currentMap.name === "Heatmap" && (
            <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem", marginTop: "1rem" }}>
              <label style={{ display: "flex", alignItems: "center", gap: "0.5rem", fontSize: "0.95rem", color: "#22c55e" }}>
                <input
                  type="checkbox"
                  checked={startPointsEnabled}
                  onChange={(e) => onToggleStartPoints(e.target.checked)}
                />
                Show Start Points
              </label>

              <label style={{ display: "flex", alignItems: "center", gap: "0.5rem", fontSize: "0.95rem", color: "#ef4444" }}>
                <input
                  type="checkbox"
                  checked={endPointsEnabled}
                  onChange={(e) => onToggleEndPoints(e.target.checked)}
                />
                Show End Points
              </label>

              <label style={{ display: "flex", alignItems: "center", gap: "0.5rem", fontSize: "0.95rem", color: "#cbd5e1" }}>
                <input
                  type="checkbox"
                  checked={showHeatmap}
                  onChange={(e) => setShowHeatmap(e.target.checked)}
                />
                Show Heatmap
              </label>
            </div>

          )}
                   
          {/* Visual Map Style Selector */}
          <div style={{ marginTop: "12px" }}>
          <label style={{ fontSize: "0.9rem", color: "#cbd5e1", marginBottom: "4px", display: "block" }}>
            Map Style:
          </label>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(2, 1fr)",
              gap: "12px",
              marginTop: "8px",
            }}
          >
            {mapboxStyles.map(style => (
              <div
                key={style.value}
                onClick={() => setMapStyle(style.value)}
                style={{
                  height: "70px",
                  borderRadius: "8px",
                  backgroundImage: `url(${style.preview})`,
                  backgroundSize: "cover",
                  backgroundPosition: "center",
                  cursor: "pointer",
                  boxShadow: mapStyle === style.value
                    ? "0 0 0 3px #38bdf8, 0 0 12px rgba(56, 189, 248, 0.6)"
                    : "0 0 0 1px #555",
                  transition: "all 0.3s ease"
                }}
                title={style.name}
              />
            ))}
          </div>
        </div>
        </>
      )}
    </div>
  );
}

const arrowButtonStyle = {
  background: "#0f172a",
  border: "2px solid #38bdf8",
  color: "#38bdf8",
  fontSize: "1.6rem",
  borderRadius: "999px",
  width: "48px",
  height: "48px",
  cursor: "pointer",
  boxShadow: "0 0 12px rgba(56, 189, 248, 0.6)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  transition: "transform 0.2s ease",
};

const labelStyle = {
  display: "block",
  marginBottom: "8px",
  fontSize: "0.95rem",
};
