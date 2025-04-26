import { MapContainer, TileLayer, Marker, Popup } from "react-leaflet";

function MapComponent() {
  return (
    <MapContainer center={[-33.918861, 18.4233]} zoom={5} style={{ height: "200px", width: "100%" }}>
      <TileLayer
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      <Marker position={[-33.918861, 18.4233]}>
        <Popup>Vehicle detected here (Cape Town)</Popup>
      </Marker>
    </MapContainer>
  );
}

export default MapComponent;