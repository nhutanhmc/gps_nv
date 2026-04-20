"use client";

import { useState, useEffect, useRef } from "react";
import dynamic from "next/dynamic";
import { getRhumbLineBearing } from "geolib";

// Dynamically import Map component (Disable SSR for Leaflet)
const MapView = dynamic(() => import("./components/Map"), { 
  ssr: false,
  loading: () => (
    <div className="w-full h-full min-h-[280px] rounded-2xl border-2 border-dashed border-slate-800 animate-pulse flex items-center justify-center bg-slate-900/20">
       <span className="text-[10px] text-slate-500 font-bold uppercase tracking-widest">Loading Satellite Data...</span>
    </div>
  )
});

interface Location {
  latitude: number;
  longitude: number;
}

interface CheckResult {
  distance: number;
  isViolated: boolean;
  details: {
    gpsValid: boolean;
    wifiValid: boolean;
  };
  timestamp: string;
}

type TrackingMode = "gps" | "wifi" | "hybrid";
type ViewMode = "radar" | "map";

function Radar({ distance, bearing, isViolated }: { distance: number; bearing: number; isViolated: boolean }) {
  // Map distance to pixels. 150m = radar radius (approx 80px)
  const maxRadarDist = 150; 
  const radius = Math.min((distance / maxRadarDist) * 80, 95);
  
  // Calculate X, Y based on bearing (angle) and radius
  // Bearing 0 is North. In math coords, 0 is East. So we adjust.
  const angleRad = (bearing - 90) * (Math.PI / 180);
  const x = radius * Math.cos(angleRad);
  const y = radius * Math.sin(angleRad);

  return (
    <div className="relative w-56 h-56 rounded-full border border-slate-800 bg-slate-900/30 backdrop-blur-sm flex items-center justify-center overflow-hidden shadow-[inset_0_0_50px_rgba(0,0,0,0.5)] transition-all">
      {/* Target/Scanning rings */}
      <div className="absolute w-full h-full border border-slate-800/30 rounded-full scale-[0.66]"></div>
      <div className="absolute w-full h-full border border-slate-800/20 rounded-full scale-[0.33]"></div>
      <div className="absolute w-full h-full border border-dashed border-emerald-500/10 rounded-full scale-[0.85] animate-[spin_10s_linear_infinite]"></div>
      
      {/* 100m Boundary Ring */}
      <div className="absolute w-[116px] h-[116px] border-2 border-dashed border-rose-500/20 rounded-full"></div>

      {/* Crosshair */}
      <div className="absolute w-full h-px bg-slate-800/40"></div>
      <div className="absolute h-full w-px bg-slate-800/40"></div>

      {/* Scanning effect */}
      <div className="absolute w-1/2 h-1/2 top-0 left-1/2 origin-bottom-left bg-gradient-to-tr from-emerald-500/10 to-transparent animate-[spin_4s_linear_infinite] rounded-tr-full"></div>

      {/* Home Point */}
      <div className="relative z-10 w-2.5 h-2.5 bg-blue-500 rounded-full shadow-[0_0_15px_rgba(59,130,246,0.8)] border border-white/20"></div>

      {/* User Point */}
      <div 
        className="absolute transition-all duration-1000 ease-out z-20"
        style={{ transform: `translate(${x}px, ${y}px)` }}
      >
        <div className={`w-3.5 h-3.5 rounded-full shadow-lg border border-white/40 ${isViolated ? "bg-rose-500 shadow-rose-500/50" : "bg-emerald-400 shadow-emerald-400/50"}`}>
           <div className={`absolute inset-0 rounded-full animate-ping opacity-50 ${isViolated ? "bg-rose-500" : "bg-emerald-400"}`}></div>
        </div>
      </div>

      {/* Scale indicators */}
      <div className="absolute bottom-3 right-3 text-[9px] font-black text-slate-700 uppercase tracking-tighter">Scale: 150m</div>
    </div>
  );
}

export default function Home() {
  const [homeLocation, setHomeLocation] = useState<Location | null>(null);
  const [homeIp, setHomeIp] = useState<string | null>(null);
  const [currentLocation, setCurrentLocation] = useState<Location | null>(null);
  const [currentIp, setCurrentIp] = useState<string | null>(null);
  const [trackingMode, setTrackingMode] = useState<TrackingMode>("gps");
  const [viewMode, setViewMode] = useState<ViewMode>("radar");
  const [isWorking, setIsWorking] = useState(false);
  const [checkResult, setCheckResult] = useState<CheckResult | null>(null);
  const [bearing, setBearing] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const intervalRef = useRef<NodeJS.Timeout | null>(null);

  // Load home data from Local Storage on mount
  useEffect(() => {
    const storedLoc = localStorage.getItem("homeLocation");
    const storedIp = localStorage.getItem("homeIp");
    const storedMode = localStorage.getItem("trackingMode") as TrackingMode;

    if (storedLoc) setHomeLocation(JSON.parse(storedLoc));
    if (storedIp) setHomeIp(storedIp);
    if (storedMode) setTrackingMode(storedMode);
  }, []);

  // Save tracking mode to local storage
  useEffect(() => {
    localStorage.setItem("trackingMode", trackingMode);
  }, [trackingMode]);

  const fetchPublicIp = async (): Promise<string | null> => {
    try {
      const res = await fetch("https://api.ipify.org?format=json");
      const data = await res.json();
      return data.ip;
    } catch (err) {
      console.error("Failed to fetch IP:", err);
      return null;
    }
  };

  const saveHomeData = async () => {
    setLoading(true);
    setError(null);

    const ip = await fetchPublicIp();
    if (!ip) {
      setError("Không thể lấy địa chỉ IP mạng.");
      setLoading(false);
      return;
    }

    if (!navigator.geolocation) {
      setError("Trình duyệt không hỗ trợ Geolocation");
      setLoading(false);
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        const newHomeLoc = {
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
        };
        
        setHomeLocation(newHomeLoc);
        setHomeIp(ip);
        setCurrentIp(ip);

        localStorage.setItem("homeLocation", JSON.stringify(newHomeLoc));
        localStorage.setItem("homeIp", ip);
        
        setLoading(false);
      },
      (err) => {
        setError("Lỗi lấy vị trí: " + err.message);
        setLoading(false);
      },
      { enableHighAccuracy: true }
    );
  };

  const checkPosition = async () => {
    if (!homeLocation && trackingMode !== "wifi") return;

    let fetchedIp = currentIp;
    if (trackingMode === "wifi" || trackingMode === "hybrid") {
      fetchedIp = await fetchPublicIp();
      setCurrentIp(fetchedIp);
    }

    navigator.geolocation.getCurrentPosition(
      async (position) => {
        const currentCoord = {
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
        };
        setCurrentLocation(currentCoord);

        if (homeLocation) {
          const b = getRhumbLineBearing(homeLocation, currentCoord);
          setBearing(b);
        }

        try {
          const res = await fetch("/api/check-distance", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              mode: trackingMode,
              userLat: currentCoord.latitude,
              userLon: currentCoord.longitude,
              homeLat: homeLocation?.latitude,
              homeLon: homeLocation?.longitude,
              userIp: fetchedIp,
              homeIp: homeIp,
            }),
          });

          const data = await res.json();
          setCheckResult(data);
          setError(null);
        } catch (err) {
          setError("Lỗi kết nối Server");
        }
      },
      (err) => {
        if (trackingMode !== "wifi") {
           setError("Lỗi lấy vị trí hiện tại: " + err.message);
        } else {
           performIpOnlyCheck(fetchedIp);
        }
      }
    );
  };

  const performIpOnlyCheck = async (fetchedIp: string | null) => {
     try {
          const res = await fetch("/api/check-distance", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ mode: "wifi", userIp: fetchedIp, homeIp: homeIp }),
          });
          const data = await res.json();
          setCheckResult(data);
        } catch (err) {
          setError("Lỗi kết nối Server (IP Check)");
        }
  };

  useEffect(() => {
    if (isWorking && (homeLocation || homeIp)) {
      checkPosition();
      intervalRef.current = setInterval(checkPosition, 10000);
    } else {
      if (intervalRef.current) clearInterval(intervalRef.current);
    }
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [isWorking, homeLocation, homeIp, trackingMode]);

  return (
    <main className="min-h-screen bg-slate-950 text-slate-100 flex flex-col items-center justify-center p-4 md:p-8 font-sans transition-all duration-700">
      <div className="max-w-2xl w-full space-y-6">
        {/* Header */}
        <div className="text-center space-y-1">
          <h1 className="text-4xl md:text-5xl font-extrabold tracking-tight bg-gradient-to-r from-blue-400 via-indigo-400 to-emerald-400 bg-clip-text text-transparent">
            GPS TRACKER PRO
          </h1>
          <p className="text-slate-400 text-sm font-bold tracking-[0.3em] uppercase opacity-70">Hệ thống giám sát v.2.2</p>
        </div>

        {/* Mode Selector */}
        <div className="bg-slate-900/40 border border-slate-800 p-1.5 rounded-2xl flex gap-1 backdrop-blur-md">
          {[
            { id: "gps", label: "GPS", icon: "🛰️" },
            { id: "wifi", label: "Wi-Fi", icon: "🌐" },
            { id: "hybrid", label: "Hybrid", icon: "💎" },
          ].map((mode) => (
            <button
              key={mode.id}
              onClick={() => setTrackingMode(mode.id as TrackingMode)}
              className={`flex-1 py-3 px-4 rounded-xl text-xs font-black transition-all flex items-center justify-center gap-2 ${
                trackingMode === mode.id
                  ? "bg-indigo-600 text-white shadow-lg shadow-indigo-500/20 translate-y-[-2px]"
                  : "text-slate-500 hover:text-slate-300 hover:bg-slate-800/50"
              }`}
            >
              <span>{mode.icon}</span>
              {mode.label}
            </button>
          ))}
        </div>

        {/* Dashboard Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Status, Radar & Map Card */}
          <div className="bg-slate-900/50 border border-slate-800 rounded-3xl p-6 backdrop-blur-xl shadow-2xl flex flex-col items-center justify-between min-h-[460px]">
             <div className="w-full flex justify-between items-center mb-6">
                <div className="flex bg-slate-950/50 p-1 rounded-xl border border-slate-800 shadow-inner">
                   <button 
                     onClick={() => setViewMode("radar")}
                     className={`px-4 py-1.5 text-[10px] font-black uppercase tracking-tighter rounded-lg transition-all ${viewMode === "radar" ? "bg-slate-800 text-white shadow-sm" : "text-slate-600 hover:text-slate-400"}`}
                   >
                     Radar
                   </button>
                   <button 
                     onClick={() => setViewMode("map")}
                     className={`px-4 py-1.5 text-[10px] font-black uppercase tracking-tighter rounded-lg transition-all ${viewMode === "map" ? "bg-slate-800 text-white shadow-sm" : "text-slate-600 hover:text-slate-400"}`}
                   >
                     Map
                   </button>
                </div>

                {checkResult && (
                  <span className={`text-[10px] font-black px-3 py-1 rounded-full border ${checkResult.isViolated ? "text-rose-500 border-rose-500/30 bg-rose-500/5" : "text-emerald-500 border-emerald-500/30 bg-emerald-500/5"}`}>
                    {checkResult.isViolated ? "⚠️ VIOLATED" : "✓ SECURE"}
                  </span>
                )}
             </div>

             <div className="flex-1 flex items-center justify-center w-full min-h-[250px]">
                {isWorking && homeLocation ? (
                  viewMode === "radar" ? (
                    <Radar distance={checkResult?.distance || 0} bearing={bearing} isViolated={checkResult?.isViolated || false} />
                  ) : (
                    <div className="w-full h-full min-h-[280px]">
                       <MapView 
                        homeLocation={homeLocation} 
                        currentLocation={currentLocation} 
                        isViolated={checkResult?.isViolated || false} 
                       />
                    </div>
                  )
                ) : (
                  <div className="text-center opacity-20 select-none group">
                     <div className="w-48 h-48 rounded-full border-2 border-dashed border-slate-700 flex items-center justify-center group-hover:scale-105 transition-transform">
                        <span className="text-4xl">🛰️</span>
                     </div>
                     <p className="mt-4 text-[10px] font-black text-slate-500 uppercase tracking-widest">Calibration Required</p>
                  </div>
                )}
             </div>

             <div className="w-full mt-6 space-y-1 text-center">
                <div className={`text-5xl font-black tabular-nums transition-all tracking-tighter ${checkResult?.isViolated ? "text-rose-500" : "text-emerald-500"}`}>
                  {isWorking ? (trackingMode === "wifi" ? (checkResult?.isViolated ? "ERR" : "PASS") : `${checkResult?.distance || 0}m`) : "---"}
                </div>
                <p className="text-[10px] text-slate-600 font-bold uppercase tracking-widest opacity-80">
                  {checkResult ? `Updated: ${new Date(checkResult.timestamp).toLocaleTimeString()}` : "Waiting for signal..."}
                </p>
             </div>
          </div>

          {/* Configuration & Controls */}
          <div className="flex flex-col gap-6">
            <div className="bg-slate-900/50 border border-slate-800 rounded-3xl p-6 backdrop-blur-xl shadow-2xl space-y-4 flex-1 flex flex-col">
              <h2 className="text-sm font-black flex items-center gap-2 text-slate-500 mb-2 uppercase tracking-tight">
                <span className="w-1.5 h-4 bg-indigo-500 rounded-full"></span>
                System Calibration
              </h2>
              
              <div className="space-y-3 flex-1">
                <div className="p-4 bg-slate-950/50 rounded-2xl border border-slate-800/50 space-y-4">
                  <div className="group">
                    <p className="text-[9px] text-slate-600 uppercase tracking-widest font-black mb-1 opacity-70">Home Coordinates</p>
                    <p className="font-mono text-xs text-blue-300 group-hover:text-blue-400 transition-colors">
                      {homeLocation ? `${homeLocation.latitude.toFixed(6)}, ${homeLocation.longitude.toFixed(6)}` : "SIGNAL MISSING"}
                    </p>
                  </div>
                  <div className="pt-4 border-t border-slate-800/50 group">
                    <p className="text-[9px] text-slate-600 uppercase tracking-widest font-black mb-1 opacity-70">Authenticated IP</p>
                    <p className="font-mono text-xs text-emerald-400 group-hover:text-emerald-300 transition-colors">{homeIp || "SIGNAL MISSING"}</p>
                  </div>
                </div>

                <button
                  onClick={saveHomeData}
                  disabled={loading}
                  className="w-full py-4 px-6 bg-slate-100 hover:bg-white active:scale-95 transition-all rounded-2xl font-black text-slate-950 text-[11px] uppercase tracking-[0.15em] flex items-center justify-center gap-2 disabled:opacity-50 shadow-xl"
                >
                  {loading ? <span className="animate-spin rounded-full h-4 w-4 border-2 border-slate-950 border-t-transparent"></span> : "Save Checkpoint"}
                </button>
              </div>

              <div className="bg-slate-800/30 p-4 rounded-2xl flex items-center justify-between border border-slate-700/30">
                <div className="flex flex-col">
                   <span className="text-[9px] font-black text-slate-600 uppercase tracking-tighter">Monitoring Status</span>
                   <span className={`text-[11px] font-black ${isWorking ? "text-emerald-400" : "text-slate-500"}`}>{isWorking ? "ACTIVE" : "STANDBY"}</span>
                </div>
                <button
                  onClick={() => setIsWorking(!isWorking)}
                  disabled={!homeLocation && trackingMode !== "wifi"}
                  className={`relative inline-flex h-8 w-14 items-center rounded-full transition-all border border-white/5 ${
                    isWorking ? "bg-emerald-500 shadow-[0_0_20px_rgba(16,185,129,0.3)]" : "bg-slate-700"
                  }`}
                >
                  <span className={`inline-block h-6 w-6 transform rounded-full bg-white transition-transform ${isWorking ? "translate-x-7" : "translate-x-1"}`} />
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Footer Metrics */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
           <div className="bg-slate-900/40 border border-slate-800/80 p-5 rounded-3xl group hover:border-indigo-500/30 transition-all">
              <h3 className="text-[9px] font-black text-slate-600 uppercase tracking-[0.2em] mb-3 opacity-80">Network Identity</h3>
              <div className="flex items-end justify-between">
                 <p className="font-mono text-lg text-slate-300 tabular-nums">{currentIp || "---.---.---.---"}</p>
                 <span className="text-[9px] font-black text-indigo-500 p-1.5 bg-indigo-500/10 rounded-md border border-indigo-500/20">WAN</span>
              </div>
           </div>
           <div className="bg-slate-900/40 border border-slate-800/80 p-5 rounded-3xl group hover:border-emerald-500/30 transition-all">
              <h3 className="text-[9px] font-black text-slate-600 uppercase tracking-[0.2em] mb-3 opacity-80">Tactic Bearing</h3>
              <div className="flex items-end justify-between">
                 <p className="font-mono text-lg text-slate-300 tabular-nums">{bearing.toFixed(1)}°</p>
                 <span className="text-[9px] font-black text-emerald-500 p-1.5 bg-emerald-500/10 rounded-md border border-emerald-500/20">BRG</span>
              </div>
           </div>
        </div>

        {/* Error Alert */}
        {error && (
          <div className="fixed bottom-8 left-1/2 -translate-x-1/2 bg-rose-600 text-white px-8 py-4 rounded-3xl font-black shadow-2xl flex items-center gap-4 animate-in slide-in-from-bottom-8 border border-white/20">
            <span className="text-xl">⚠️</span>
            <span className="text-xs uppercase tracking-[0.05em]">{error}</span>
          </div>
        )}
      </div>

      {/* Grid BG */}
      <div className="fixed inset-0 -z-10 bg-slate-950">
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full h-full bg-[radial-gradient(#1e293b_1px,transparent_1px)] [background-size:60px_60px] opacity-10"></div>
        <div className="absolute top-0 left-0 w-full h-full bg-[linear-gradient(to_bottom,rgba(2,6,23,1),rgba(2,6,23,0.5))] pointer-events-none"></div>
      </div>
    </main>
  );
}
