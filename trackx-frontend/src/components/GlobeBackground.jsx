import { useEffect, useRef } from "react";
import Globe from "globe.gl";

function GlobeBackground() {
  const globeContainerRef = useRef();
  const globeInstanceRef = useRef(null);

  useEffect(() => {
    if (!globeInstanceRef.current) {
      globeInstanceRef.current = Globe()(globeContainerRef.current)
        .globeImageUrl('https://unpkg.com/three-globe/example/img/earth-dark.jpg')
        .backgroundColor('black')
        .pointsData([
          { lat: -33.918861, lng: 18.4233, size: 0.5, color: 'blue' },  // Cape Town
          { lat: -29.8587, lng: 31.0218, size: 0.5, color: 'blue' },    // Durban
        ])
        .pointLat('lat')
        .pointLng('lng')
        .pointColor('color')
        .pointRadius('size')
        .polygonsData([]) // No hex grid
        .polygonCapColor(() => "darkgrey")
        .polygonSideColor(() => "darkgrey")
        .polygonStrokeColor(() => "grey");
    }

    // Enable auto-rotation safely
    const controls = globeInstanceRef.current.controls();
    controls.autoRotate = true;
    controls.autoRotateSpeed = 0.3;

  }, []);

  return (
    <div ref={globeContainerRef} style={{ position: 'absolute', top: 0, left: 0, width: '100vw', height: '100vh', zIndex: -10 }} />
  );
}

export default GlobeBackground;