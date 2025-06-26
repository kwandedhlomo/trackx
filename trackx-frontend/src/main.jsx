import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';                      
import 'leaflet/dist/leaflet.css';         
import 'mapbox-gl/dist/mapbox-gl.css';
import App from './App.jsx';
import "cesium/Build/Cesium/Widgets/widgets.css";




createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
);