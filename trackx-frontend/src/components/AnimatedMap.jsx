import React, { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { MapContainer, TileLayer } from "react-leaflet";
import "leaflet/dist/leaflet.css";

function AnimatedMap() {
  const [markers, setMarkers] = useState([]);

  useEffect(() => {
    const interval = setInterval(() => {
      const newMarker = {
        id: Date.now(),
        top: Math.random() * 100,
        left: Math.random() * 100,
      };

      setMarkers((prev) => [...prev, newMarker]);

      setTimeout(() => {
        setMarkers((prev) => prev.filter((m) => m.id !== newMarker.id));
      }, 6000);
    }, 1000);

    return () => clearInterval(interval);
  }, []);

  return (
    <div className="absolute inset-0 z-0 overflow-hidden">

      {/* 🎥 Breathing effect on the map */}
      <motion.div
        initial={{ scale: 1 }}
        animate={{ scale: 1.01 }}
        transition={{
          repeat: Infinity,
          repeatType: "reverse",
          duration: 10,
          ease: "easeInOut",
        }}
        className="w-full h-full"
      >
        {/* 🌍 MAP (Voyager No Labels) */}
        <MapContainer
          center={[-29.0, 24.0]}
          zoom={8}
          minZoom={7}
          maxZoom={8}s
          scrollWheelZoom={false}
          dragging={false}
          doubleClickZoom={false}
          zoomControl={false}
          attributionControl={false}
          style={{ width: "100%", height: "100%" }}
          edgeBufferTiles={2} // Prevent tile seams
        >
          <TileLayer
            url="https://{s}.basemaps.cartocdn.com/rastertiles/dark_nolabels/{z}/{x}/{y}{r}.png"
            attribution='© CartoDB'
            noWrap={true}
          />
        </MapContainer>

        {/* 🔵 Semi-transparent blue overlay */}
        <div className="absolute inset-0 bg-blue-900 bg-opacity-30 z-10"></div>
      </motion.div>

      {/* 🔵 Animated Pulse Markers */}
      {markers.map((marker) => (
        <motion.div
          key={marker.id}
          className="absolute bg-cyan-400 rounded-full opacity-80"
          style={{
            top: `${marker.top}%`,
            left: `${marker.left}%`,
            width: "12px",
            height: "12px",
            transform: "translate(-50%, -50%)",
            zIndex: 50,
          }}
          initial={{ scale: 0 }}
          animate={{ scale: [0.8, 1.4, 0.8] }}
          transition={{
            repeat: Infinity,
            duration: 2,
            ease: "easeInOut",
          }}
        />
      ))}
    </div>
  );
}

export default AnimatedMap;
