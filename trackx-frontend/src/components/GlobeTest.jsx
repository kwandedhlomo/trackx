import { useEffect, useRef } from "react";
import Globe from "globe.gl";

function GlobeTest() {
  const globeContainerRef = useRef();

  useEffect(() => {
    const globe = Globe()(globeContainerRef.current)
      .globeImageUrl('https://unpkg.com/three-globe/example/img/earth-dark.jpg')
      .backgroundColor('black')
      .pointsData([{ lat: -33.918861, lng: 18.4233, size: 0.5, color: 'blue' }])
      .pointLat('lat')
      .pointLng('lng')
      .pointColor('color')
      .pointRadius('size');

    globe.controls().autoRotate = true;
    globe.controls().autoRotateSpeed = 0.3;
  }, []);

  return (
    <div style={{ width: '100vw', height: '100vh' }} ref={globeContainerRef} />
  );
}

export default GlobeTest;