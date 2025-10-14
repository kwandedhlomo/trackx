import { useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import Globe from "globe.gl";

function GlobeBackground({ interactive, globePoints }) {
  const globeContainerRef = useRef();
  const globeInstanceRef = useRef(null);
  const navigate = useNavigate();
  const statusColorMap = {
    "not started": "#c2410c", // deep amber to match pie chart
    "in progress": "#1d4ed8", // royal blue
    "completed": "#0f766e", // rich teal
  };

  // Preprocess points to assign color and size
  const processedPoints = (globePoints || []).map((point) => ({
    ...point,
    color: statusColorMap[point.status?.toLowerCase()] || "white",
    size: 0.4,
  }));

  useEffect(() => {
    if (!globeInstanceRef.current) {
      globeInstanceRef.current = Globe()(globeContainerRef.current)
        .globeImageUrl("https://unpkg.com/three-globe/example/img/earth-dark.jpg")
        .backgroundColor("rgba(0, 0, 0, 0)")
        .pointLat("lat")
        .pointLng("lng")
        .pointColor("color")
        .pointRadius("size")
        .pointLabel((d) => `<b>${d.caseTitle}</b>`)
        .onPointClick((point) => {
          if (point.doc_id) {
            navigate("/edit-case", { state: { docId: point.doc_id } });
          }
        });

      globeInstanceRef.current.controls().autoRotate = true;
      globeInstanceRef.current.controls().autoRotateSpeed = 0.1;
    }

    if (processedPoints.length > 0) {
      globeInstanceRef.current.pointsData(processedPoints);
    }
  }, [processedPoints, navigate]);

  return (
    <div
      ref={globeContainerRef}
      style={{
        position: "absolute",
        top: 0,
        left: 0,
        width: "100%",
        height: "100%",
        zIndex: interactive ? 10 : -10,
        pointerEvents: interactive ? "auto" : "none",
      }}
    />
  );
}

export default GlobeBackground;
