import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { DeckGL } from '@deck.gl/react';
import { HeatmapLayer } from '@deck.gl/aggregation-layers';
import Map from 'react-map-gl';
import axios from 'axios';

const MAPBOX_TOKEN = 'pk.eyJ1Ijoiam9ubHVrZTciLCJhIjoiY21icjgzYW1lMDczazJqc2Fmbm4xd2RteSJ9.pbPMQ4ywc52Fy0TXp4ndHg';

function HeatmapPage() {
  const [points, setPoints] = useState([]);
  const navigate = useNavigate();

  useEffect(() => {
    const fetchPoints = async () => {
      try {
        const res = await axios.get('http://localhost:8000/cases/all-points');
        const raw = res.data.points;
        console.log(" Heatmap page points from backend:", raw);
        const formatted = raw.map(p => ({
          position: [p.lng || p.longitude, p.lat || p.latitude]
        }));
        setPoints(formatted);
      } catch (error) {
        console.error(' Failed to fetch heatmap data:', error);
      }
    };

    fetchPoints();
  }, []);

  const heatmapLayer = new HeatmapLayer({
    id: 'heatmap-layer',
    data: points,
    getPosition: d => d.position,
    getWeight: () => 1,
    radiusPixels: 60
  });

  return (
    <div style={{ width: '100vw', height: '100vh', position: 'relative' }}>
      <DeckGL
        initialViewState={{
          longitude: 18.4233,
          latitude: -33.918861,
          zoom: 13,
          bearing: 0,
          pitch: 0,
        }}
        controller={true}
        layers={[heatmapLayer]}
      >
        <Map
          mapboxAccessToken={MAPBOX_TOKEN}
          mapStyle="mapbox://styles/mapbox/dark-v11"
        />
      </DeckGL>

      <button
        onClick={() => navigate("/home")}
        style={{
          position: 'absolute',
          bottom: '20px',
          left: '20px',
          padding: '12px 20px',
          backgroundColor: '#0f172a', // Tailwind blue-900
          color: 'white',
          fontSize: '1rem',
          borderRadius: '999px',
          border: '2px solid #3b82f6', // Tailwind blue-500
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
