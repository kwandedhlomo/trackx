// components/MiniHeatMapWindow.jsx
import React, { useMemo } from 'react';
import { DeckGL } from '@deck.gl/react';
import { HeatmapLayer } from '@deck.gl/aggregation-layers';
import Map from 'react-map-gl';

const MAPBOX_TOKEN = 'pk.eyJ1Ijoiam9ubHVrZTciLCJhIjoiY21icjgzYW1lMDczazJqc2Fmbm4xd2RteSJ9.pbPMQ4ywc52Fy0TXp4ndHg';

const MiniHeatMapWindow = ({ points = [] }) => {
  const safePoints = Array.isArray(points) ? points : [];

  const formattedPoints = useMemo(() => (
    safePoints.map(p => ({
      position: [Number(p.lng) || 0, Number(p.lat) || 0],
    }))
  ), [safePoints]);

  const initialViewState = useMemo(() => {
    // Center on the most recent point if available
    if (safePoints.length > 0) {
      const last = safePoints[safePoints.length - 1];
      const lat = Number(last.lat) || -33.918861;
      const lng = Number(last.lng) || 18.4233;
      return {
        longitude: lng,
        latitude: lat,
        zoom: 12.5,
        bearing: 0,
        pitch: 0,
      };
    }
    // Fallback default (Cape Town area)
    return {
      longitude: 18.4233,
      latitude: -33.918861,
      zoom: 12.5,
      bearing: 0,
      pitch: 0,
    };
  }, [safePoints]);

  const heatmapLayer = new HeatmapLayer({
    id: 'mini-heatmap',
    data: formattedPoints,
    getPosition: d => d.position,
    getWeight: () => 1,
    radiusPixels: 30,
  });

  return (
    <div style={{ width: '100%', height: '300px', position: 'relative', borderRadius: '1rem', overflow: 'hidden' }}>
      <DeckGL
        initialViewState={initialViewState}
        controller={false}
        layers={[heatmapLayer]}
        style={{ width: '100%', height: '100%' }}
      >
        <Map
          mapboxAccessToken={MAPBOX_TOKEN}
          mapStyle="mapbox://styles/mapbox/dark-v11"
          onError={(e) => console.warn("Mini map load error", e)}
        />
      </DeckGL>

      {/*  Hoverable overlay with link */}
      <div
        onClick={() => window.location.href = '/heatmap'}
        onMouseEnter={e => e.currentTarget.style.backgroundColor = 'rgba(0,0,0,0.4)'}
        onMouseLeave={e => e.currentTarget.style.backgroundColor = 'rgba(0,0,0,0)'}
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          width: '100%',
          height: '100%',
          backgroundColor: 'rgba(0, 0, 0, 0)',
          transition: 'background-color 0.3s ease-in-out',
          cursor: 'pointer',
          zIndex: 10
        }}
      >
        <div style={{
          color: 'white',
          fontSize: '1.25rem',
          fontWeight: 'bold',
          position: 'absolute',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          pointerEvents: 'none'
        }}>
          View Full Map
        </div>
      </div>
    </div>
  );
};

export default MiniHeatMapWindow;
