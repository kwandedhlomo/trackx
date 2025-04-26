import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';                      // Your Tailwind CSS
import 'leaflet/dist/leaflet.css';         // ✅ Add this line for Leaflet CSS
import App from './App.jsx';

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
);