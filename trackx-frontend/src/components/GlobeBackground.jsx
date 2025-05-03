// GlobeBackground.jsx
import { useEffect, useRef } from "react";
import Globe from "globe.gl";

function GlobeBackground({ interactive }) {
  const globeContainerRef = useRef();
  const globeInstanceRef = useRef(null);

  useEffect(() => {
    if (!globeInstanceRef.current) {
      globeInstanceRef.current = Globe()(globeContainerRef.current)
        .globeImageUrl("https://unpkg.com/three-globe/example/img/earth-dark.jpg")
        .backgroundColor("rgba(0, 0, 0, 0)") // Transparent background
        .pointsData([
          { lat: -33.918861, lng: 18.4233, size: 0.5, color: "blue" },
          { lat: -29.8587, lng: 31.0218, size: 0.5, color: "blue" },
        ])
        .pointLat("lat")
        .pointLng("lng")
        .pointColor("color")
        .pointRadius("size");
    }

    globeInstanceRef.current.controls().autoRotate = true;
    globeInstanceRef.current.controls().autoRotateSpeed = 0.3;
  }, []);

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