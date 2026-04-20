"use client";

import { useState, useEffect, useRef } from "react";
import dynamic from "next/dynamic";
import { getRhumbLineBearing } from "geolib";

// Dynamically import Map component (Disable SSR for Leaflet)
const MapView = dynamic(() => import("./components/Map"), { 
  ssr: false,
  loading: () => (
    <div className="w-full h-full min-h-[400px] rounded-3xl border-2 border-dashed border-slate-800 animate-pulse flex items-center justify-center bg-slate-900/20">
       <div className="flex flex-col items-center gap-4">
          <div className="w-12 h-12 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin"></div>
          <span className="text-xs text-slate-500 font-black uppercase tracking-[0.2em]">Initialising Satellite Link...</span>
       </div>
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
  const maxRadarDist = 150; 
  const radius = Math.min((distance / maxRadarDist) * 120, 140); 
  
  const angleRad = (bearing - 90) * (Math.PI / 180);
  const x = radius * Math.cos(angleRad);
  const y = radius * Math.sin(angleRad);

  return (
    <div className="relative w-80 h-80 rounded-full border border-slate-800 bg-slate-900/30 backdrop-blur-sm flex items-center justify-center overflow-hidden shadow-[inset_0_0_80px_rgba(0,0,0,0.6)] transition-all">
      <div className="absolute w-full h-full border border-slate-800/30 rounded-full scale-[0.75]"></div>
      <div className="absolute w-full h-full border border-slate-800/20 rounded-full scale-[0.5]"></div>
      <div className="absolute w-full h-full border border-slate-800/10 rounded-full scale-[0.25]"></div>
      <div className="absolute w-full h-full border border-dashed border-indigo-500/10 rounded-full scale-[0.85] animate-[spin_15s_linear_infinite]"></div>
      
      <div className="absolute w-[180px] h-[180px] border-2 border-dashed border-rose-500/10 rounded-full"></div>
      <div className="absolute w-full h-px bg-slate-800/40"></div>
      <div className="absolute h-full w-px bg-slate-800/40"></div>
      <div className="absolute w-1/2 h-1/2 top-0 left-1/2 origin-bottom-left bg-gradient-to-tr from-indigo-500/10 to-transparent animate-[spin_5s_linear_infinite] rounded-tr-full"></div>
      <div className="relative z-10 w-3 h-3 bg-blue-500 rounded-full shadow-[0_0_20px_rgba(59,130,246,0.8)] border-2 border-white/20"></div>
      <div 
        className="absolute transition-all duration-1000 ease-out z-20"
        style={{ transform: `translate(${x}px, ${y}px)` }}
      >
        <div className={`w-5 h-5 rounded-full shadow-2xl border-2 border-white/40 ${isViolated ? "bg-rose-500 shadow-rose-500/50" : "bg-emerald-400 shadow-emerald-400/50"}`}>
           <div className={`absolute inset-0 rounded-full animate-ping opacity-50 ${isViolated ? "bg-rose-500" : "bg-emerald-400"}`}></div>
        </div>
      </div>
      <div className="absolute bottom-4 right-4 text-[10px] font-black text-slate-700 uppercase tracking-widest">Active Scan: 150m</div>
    </div>
  );
}

export default function Home() {
  const [homeLocation, setHomeLocation] = useState<Location | null>(null);
  const [homeIp, setHomeIp] = useState<string | null>(null);
  const [currentLocation, setCurrentLocation] = useState<Location | null>(null);
  const [currentIp, setCurrentIp] = useState<string | null>(null);
  const [trackingMode, setTrackingMode] = useState<TrackingMode>("gps");
  const [viewMode, setViewMode] = useState<ViewMode>("map");
  const [isWorking, setIsWorking] = useState(false);
  const [isValidating, setIsValidating] = useState(false); // NEW: validation feedback
  const [checkResult, setCheckResult] = useState<CheckResult | null>(null);
  const [bearing, setBearing] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const intervalRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    const storedLoc = localStorage.getItem("homeLocation");
    const storedIp = localStorage.getItem("homeIp");
    const storedMode = localStorage.getItem("trackingMode") as TrackingMode;

    if (storedLoc) {
       try { setHomeLocation(JSON.parse(storedLoc)); } catch(e) {}
    }
    if (storedIp) setHomeIp(storedIp);
    if (storedMode) setTrackingMode(storedMode);
  }, []);

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
      setError("Không thể lấy địa chỉ IP. Vui lòng kiểm tra mạng.");
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
      { enableHighAccuracy: true, timeout: 10000 } // Added timeout
    );
  };

  const checkPosition = async () => {
    // Only block if we absolutely have no data for the current mode
    if (trackingMode === "gps" && !homeLocation) return;
    if (trackingMode === "wifi" && !homeIp) return;
    if (trackingMode === "hybrid" && (!homeLocation || !homeIp)) return;

    setIsValidating(true);

    let fetchedIp = currentIp;
    if (trackingMode === "wifi" || trackingMode === "hybrid") {
      fetchedIp = await fetchPublicIp();
      setCurrentIp(fetchedIp);
    }

    // Try to get GPS, otherwise fallback to IP only if permitted
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

        await callCheckApi(currentCoord.latitude, currentCoord.longitude, fetchedIp);
        setIsValidating(false);
      },
      async (err) => {
        if (trackingMode === "wifi") {
           // If WiFi mode, GPS failure is acceptable
           await performIpOnlyCheck(fetchedIp);
        } else {
           setError("Lỗi lấy vị trí (GPS): " + err.message);
        }
        setIsValidating(false);
      },
      { enableHighAccuracy: true, timeout: 8000 }
    );
  };

  const callCheckApi = async (uLat?: number, uLon?: number, uIp?: string | null) => {
    try {
      const res = await fetch("/api/check-distance", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode: trackingMode,
          userLat: uLat,
          userLon: uLon,
          homeLat: homeLocation?.latitude,
          homeLon: homeLocation?.longitude,
          userIp: uIp,
          homeIp: homeIp,
        }),
      });
      const data = await res.json();
      setCheckResult(data);
      setError(null);
    } catch (err) {
      setError("Lỗi kết nối Server");
    }
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

  // Determine if we can show the main visualize display
  const canDisplay = isWorking && (homeLocation || (trackingMode === "wifi" && homeIp));

  return (
    <main className="min-h-screen bg-slate-950 text-slate-100 p-4 md:p-8 font-sans overflow-x-hidden selection:bg-indigo-500/30">
      <div className="max-w-5xl mx-auto space-y-8">
        
        {/* Header Section */}
        <header className="flex flex-col md:flex-row items-center justify-between gap-6 bg-slate-900/40 border border-slate-800 p-8 rounded-[2.5rem] backdrop-blur-xl shadow-2xl relative overflow-hidden">
           <div className="relative z-10 text-center md:text-left space-y-2">
              <h1 className="text-4xl md:text-6xl font-black tracking-tighter bg-gradient-to-br from-white via-slate-300 to-slate-500 bg-clip-text text-transparent italic">
                PROXIMITY
              </h1>
              <p className="text-indigo-400 font-black text-xs uppercase tracking-[0.4em] px-1">Tactical Surveillance v.2.5</p>
           </div>
           
           <div className="relative z-10 bg-slate-950/60 p-2 rounded-2xl border border-slate-800 flex gap-2">
              {[
                { id: "gps", label: "GPS", icon: "🛰️" },
                { id: "wifi", label: "Wi-Fi", icon: "🌐" },
                { id: "hybrid", label: "Hybrid", icon: "💎" },
              ].map((mode) => (
                <button
                  key={mode.id}
                  onClick={() => { setTrackingMode(mode.id as TrackingMode); setCheckResult(null); }}
                  className={`py-3 px-6 rounded-xl text-[10px] font-black transition-all flex items-center justify-center gap-2 border uppercase tracking-widest ${
                    trackingMode === mode.id
                      ? "bg-indigo-600 text-white shadow-xl shadow-indigo-500/30 border-indigo-400/50 scale-105"
                      : "text-slate-500 border-transparent hover:bg-slate-800/50"
                  }`}
                >
                  <span>{mode.icon}</span>
                  {mode.label}
                </button>
              ))}
           </div>
           <div className="absolute top-0 right-0 w-64 h-64 bg-indigo-500/10 blur-[100px] rounded-full -translate-y-1/2 translate-x-1/2"></div>
        </header>

        {/* Hero Display Section */}
        <section className="bg-slate-900/50 border border-slate-800 rounded-[3rem] p-4 md:p-8 backdrop-blur-2xl shadow-[0_0_100px_rgba(0,0,0,0.5)] flex flex-col items-center gap-8 relative">
           
           {/* Top Control Bar */}
           <div className="w-full flex flex-col md:flex-row justify-between items-center gap-4">
              <div className="flex bg-slate-950/80 p-1.5 rounded-2xl border border-slate-800 shadow-inner">
                 <button 
                   onClick={() => setViewMode("radar")}
                   className={`px-6 py-2 text-[10px] font-black uppercase tracking-[0.2em] rounded-xl transition-all ${viewMode === "radar" ? "bg-slate-800 text-white shadow-lg" : "text-slate-600 hover:text-slate-400"}`}
                 >
                   Radar
                 </button>
                 <button 
                   onClick={() => setViewMode("map")}
                   className={`px-6 py-2 text-[10px] font-black uppercase tracking-[0.2em] rounded-xl transition-all ${viewMode === "map" ? "bg-slate-800 text-white shadow-lg" : "text-slate-600 hover:text-slate-400"}`}
                 >
                   Atlas
                 </button>
              </div>

              <div className="flex items-center gap-4">
                 {isValidating && (
                    <div className="flex items-center gap-2 px-4 py-2 text-[10px] font-black text-indigo-400 animate-pulse uppercase tracking-widest">
                       <div className="w-3 h-3 border-2 border-indigo-400 border-t-transparent rounded-full animate-spin"></div>
                       Synchronising...
                    </div>
                 )}
                 {checkResult && !isValidating && (
                    <div className={`px-6 py-2 rounded-full border-2 font-black text-xs uppercase tracking-widest shadow-2xl transition-all duration-500 animate-in zoom-in-50 ${checkResult.isViolated ? "text-rose-500 border-rose-500/30 bg-rose-500/10" : "text-emerald-500 border-emerald-500/30 bg-emerald-500/10"}`}>
                       {checkResult.isViolated ? "⚠️ Violated Domain" : "✓ Secure Perimeter"}
                    </div>
                 )}
                 <button
                    onClick={() => { setIsWorking(!isWorking); setError(null); }}
                    disabled={!homeLocation && !homeIp}
                    className={`group relative flex items-center justify-center p-1 rounded-full transition-all duration-500 ${isWorking ? "bg-emerald-500/20" : "bg-slate-800/40"}`}
                 >
                    <div className={`px-6 py-2 rounded-full font-black text-[10px] uppercase tracking-[0.3em] transition-all border ${isWorking ? "bg-emerald-500 text-white border-emerald-400 shadow-[0_0_30px_rgba(16,185,129,0.5)]" : "bg-slate-900 text-slate-500 border-slate-700"}`}>
                       {isWorking ? "Scanning ON" : "Standby"}
                    </div>
                 </button>
              </div>
           </div>

           {/* MAIN DISPLAY AREA */}
           <div className="w-full flex-1 min-h-[500px] md:min-h-[600px] relative rounded-[2.5rem] overflow-hidden bg-slate-950/80 border border-slate-800 shadow-inner group">
              {canDisplay ? (
                <div className="w-full h-[500px] md:h-[600px] p-4 flex items-center justify-center">
                  {viewMode === "radar" ? (
                    <Radar distance={checkResult?.distance || 0} bearing={bearing} isViolated={checkResult?.isViolated || false} />
                  ) : (
                    <MapView 
                      homeLocation={homeLocation} 
                      currentLocation={currentLocation} 
                      isViolated={checkResult?.isViolated || false} 
                    />
                  )}
                </div>
              ) : (
                <div className="absolute inset-0 flex flex-col items-center justify-center text-center p-8 space-y-6">
                   <div className="w-64 h-64 rounded-full border-4 border-dashed border-slate-800 flex items-center justify-center animate-[spin_20s_linear_infinite] opacity-30">
                      <span className="text-8xl -rotate-45">🛰️</span>
                   </div>
                   <div className="space-y-2 max-w-md">
                      <h3 className="text-xl font-bold text-slate-500 uppercase tracking-widest">Calibration Critical</h3>
                      <p className="text-sm text-slate-700 font-medium leading-relaxed">System requires a verified Checkpoint (GPS or IP) to begin tactical monitoring. Please use the Calibration unit below.</p>
                   </div>
                </div>
              )}

              {/* Data Overlays */}
              <div className="absolute bottom-6 right-6 z-[10] flex flex-col gap-2 pointer-events-none">
                 <div className="bg-slate-900/90 backdrop-blur-xl p-6 rounded-3xl border border-slate-800 shadow-2xl flex flex-col items-end gap-1">
                    <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Outcome Status</span>
                    <div className={`text-6xl font-black tabular-nums tracking-tighter ${checkResult?.isViolated ? "text-rose-500" : "text-emerald-500"}`}>
                       {!isWorking ? "---" : (trackingMode === "wifi" ? (checkResult?.isViolated ? "FAIL" : "PASS") : `${checkResult?.distance || 0}m`)}
                    </div>
                    <span className="text-[9px] font-bold text-slate-600">{checkResult ? `Update: ${new Date(checkResult.timestamp).toLocaleTimeString()}` : "Waiting for scan..."}</span>
                 </div>
              </div>
           </div>
        </section>

        {/* Secondary Info Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
           <div className="md:col-span-1 bg-slate-900/40 border border-slate-800 rounded-[2.5rem] p-6 space-y-6">
              <h2 className="text-xs font-black flex items-center gap-3 text-slate-500 uppercase tracking-widest">
                <span className="w-1.5 h-6 bg-indigo-500 rounded-full"></span>
                Calibration
              </h2>
              <div className="p-5 bg-slate-950/60 rounded-3xl border border-slate-800/50 space-y-4 shadow-inner">
                <div className="space-y-1">
                   <p className="text-[9px] text-slate-600 uppercase tracking-widest font-black">Home Base Lat/Lon</p>
                   <p className="font-mono text-xs text-blue-400/80">
                      {homeLocation ? `${homeLocation.latitude.toFixed(6)}, ${homeLocation.longitude.toFixed(6)}` : "MISSING"}
                   </p>
                </div>
                <div className="pt-4 border-t border-slate-800/40 space-y-1">
                   <p className="text-[9px] text-slate-600 uppercase tracking-widest font-black">Authenticated IP</p>
                   <p className="font-mono text-xs text-emerald-400/80">{homeIp || "MISSING"}</p>
                </div>
              </div>
              <button
                onClick={saveHomeData}
                disabled={loading}
                className="w-full py-4 px-6 bg-white hover:bg-slate-100 active:scale-95 transition-all rounded-[1.5rem] font-black text-slate-950 text-xs uppercase tracking-widest shadow-xl flex items-center justify-center gap-3 disabled:opacity-50"
              >
                {loading ? <div className="w-4 h-4 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin"></div> : "Set Checkpoint"}
              </button>
           </div>

           <div className="md:col-span-2 grid grid-cols-1 sm:grid-cols-2 gap-6">
              <div className="bg-slate-900/40 border border-slate-800 rounded-[2.5rem] p-8 group hover:border-indigo-500/30 transition-all flex flex-col justify-between">
                 <div className="space-y-1 text-right">
                    <h3 className="text-[10px] font-black text-slate-500 uppercase tracking-widest opacity-60">Identity Vector</h3>
                    <p className="font-mono text-2xl text-slate-300 tabular-nums tracking-tight">{currentIp || "---.---.---.---"}</p>
                 </div>
                 <div className="flex items-center gap-2 mt-4 self-end">
                    <span className="text-[9px] font-black text-indigo-500 px-2 py-1 bg-indigo-500/10 rounded-md border border-indigo-500/20">WAN-IPv4</span>
                 </div>
              </div>
              <div className="bg-slate-900/40 border border-slate-800 rounded-[2.5rem] p-8 group hover:border-emerald-500/30 transition-all flex flex-col justify-between">
                 <div className="space-y-1 text-right">
                    <h3 className="text-[10px] font-black text-slate-500 uppercase tracking-widest opacity-60">Compass Bearing</h3>
                    <p className="font-mono text-2xl text-slate-300 tabular-nums tracking-tighter">{bearing.toFixed(1)}°</p>
                 </div>
                 <div className="flex items-center gap-2 mt-4 self-end">
                    <span className="text-[9px] font-black text-emerald-500 px-2 py-1 bg-emerald-500/10 rounded-md border border-emerald-500/20">MAGNETIC</span>
                 </div>
              </div>
           </div>
        </div>

        {error && (
          <div className="fixed bottom-12 left-1/2 -translate-x-1/2 bg-rose-600 text-white px-10 py-5 rounded-[2rem] font-black shadow-[0_0_50px_rgba(225,29,72,0.4)] flex items-center gap-4 animate-in slide-in-from-bottom-12 z-[1000] border border-white/20">
            <span className="text-2xl">⚠️</span>
            <span className="text-xs uppercase tracking-widest leading-none">{error}</span>
          </div>
        )}
      </div>

      <div className="fixed inset-0 -z-10 pointer-events-none">
         <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_0%,rgba(79,70,229,0.08),transparent_70%)]"></div>
         <div className="absolute inset-0 bg-[radial-gradient(circle_at_80%_80%,rgba(16,185,129,0.05),transparent_60%)]"></div>
         <div className="absolute inset-0 bg-[linear-gradient(rgba(15,23,42,0.1)_1px,transparent_1px),linear-gradient(90deg,rgba(15,23,42,0.1)_1px,transparent_1px)] bg-[size:40px_40px]"></div>
      </div>
    </main>
  );
}
