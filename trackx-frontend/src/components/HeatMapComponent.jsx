import { MapContainer, TileLayer, useMap } from "react-leaflet";
import "leaflet.heat";
import { useEffect } from "react";
import L from "leaflet";

// Custom hook component to render the heatmap layer
function HeatLayer({ casePoints }) {
  const map = useMap();

  useEffect(() => {
    if (!map || !casePoints.length) return;

    console.log("Adding heat layer with points:", casePoints);

    const heatLayer = L.heatLayer(
      casePoints.map((p) => [p.lat, p.lng, 2.0]),
      {
        radius: 25,
        blur: 15,
        maxZoom: 10,
        gradient: {
          0.2: "#4B0000",
          0.5: "#B91C1C",
          0.8: "#DC2626",
          1.0: "#FF0000"
        }
      }
    );

    heatLayer.addTo(map);

    return () => {
      heatLayer.remove();
    };
  }, [map, casePoints]);

  return null;
}

function HeatMapComponent({ casePoints }) {
  console.log("HeatMapComponent received casePoints:", casePoints);

  return (
    <MapContainer
      center={[-30.5595, 22.9375]} // South Africa
      zoom={5}
      style={{ height: "230px", width: "100%", borderRadius: "0.5rem" }}
      scrollWheelZoom={false}
    >
      <TileLayer
        url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
        attribution="© OpenStreetMap contributors, © CartoDB"
      />
      <HeatLayer casePoints={casePoints} />
    </MapContainer>
  );
}

export default HeatMapComponent;