"use client";

import { useEffect } from "react";
import { MapContainer, TileLayer, Marker, Circle, useMap } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

interface Location {
  latitude: number;
  longitude: number;
}

interface MapProps {
  homeLocation: Location | null;
  currentLocation: Location | null;
  isViolated: boolean;
}

// Fixed Leaflet Icon issue: using DivIcon instead of default images
const createIcon = (color: string) => {
  return L.divIcon({
    html: `<div style="background-color: ${color}; width: 12px; height: 12px; border-radius: 50%; border: 2px solid white; box-shadow: 0 0 10px rgba(0,0,0,0.5);"></div>`,
    className: "custom-div-icon",
    iconSize: [12, 12],
    iconAnchor: [6, 6],
  });
};

const homeIcon = createIcon("#3b82f6"); // Blue
const userIcon = createIcon("#10b981"); // Emerald
const userIconViolated = createIcon("#f43f5e"); // Rose

// Component to handle map centering
function ChangeView({ center }: { center: [number, number] }) {
  const map = useMap();
  useEffect(() => {
    map.setView(center);
  }, [center, map]);
  return null;
}

export default function MapView({ homeLocation, currentLocation, isViolated }: MapProps) {
  const defaultCenter: [number, number] = homeLocation 
    ? [homeLocation.latitude, homeLocation.longitude] 
    : [0, 0];

  return (
    <div className="w-full h-full rounded-2xl overflow-hidden border border-slate-800 shadow-2xl relative">
      <MapContainer
        center={defaultCenter}
        zoom={17}
        scrollWheelZoom={true}
        style={{ height: "100%", width: "100%", background: "#020617" }}
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>'
          url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
        />

        {homeLocation && (
          <>
            <Marker 
              position={[homeLocation.latitude, homeLocation.longitude]} 
              icon={homeIcon}
            />
            <Circle
              center={[homeLocation.latitude, homeLocation.longitude]}
              pathOptions={{
                color: isViolated ? "#f43f5e" : "#10b981",
                fillColor: isViolated ? "#f43f5e" : "#10b981",
                fillOpacity: 0.1,
                weight: 2,
                dashArray: "5, 10"
              }}
              radius={100}
            />
          </>
        )}

        {currentLocation && (
          <>
            <ChangeView center={[currentLocation.latitude, currentLocation.longitude]} />
            <Marker
              position={[currentLocation.latitude, currentLocation.longitude]}
              icon={isViolated ? userIconViolated : userIcon}
            />
          </>
        )}
      </MapContainer>
      
      {/* Legend */}
      <div className="absolute bottom-4 left-4 z-[1000] bg-slate-900/80 backdrop-blur-md p-2 rounded-lg border border-slate-700 text-[10px] space-y-1">
         <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-blue-500"></div>
            <span>Home Location</span>
         </div>
         <div className="flex items-center gap-2">
            <div className={`w-2 h-2 rounded-full ${isViolated ? "bg-rose-500" : "bg-emerald-500"}`}></div>
            <span>Current Position</span>
         </div>
      </div>
    </div>
  );
}
