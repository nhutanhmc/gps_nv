import { NextRequest, NextResponse } from "next/server";
import { getDistance } from "geolib";

export async function POST(req: NextRequest) {
  try {
    const { mode, userLat, userLon, homeLat, homeLon, userIp, homeIp } = await req.json();

    let isViolated = false;
    let distance = 0;
    let details = {
      gpsValid: true,
      wifiValid: true,
    };

    // Check GPS
    if (mode === "gps" || mode === "hybrid") {
      if (
        userLat === undefined ||
        userLon === undefined ||
        homeLat === undefined ||
        homeLon === undefined
      ) {
        details.gpsValid = false;
      } else {
        distance = getDistance(
          { latitude: userLat, longitude: userLon },
          { latitude: homeLat, longitude: homeLon }
        );
        if (distance > 100) {
          details.gpsValid = false;
        }
      }
    }

    // Check Wi-Fi (IP)
    if (mode === "wifi" || mode === "hybrid") {
      if (!userIp || !homeIp || userIp !== homeIp) {
        details.wifiValid = false;
      }
    }

    // Violation Logic
    if (mode === "gps") {
      isViolated = !details.gpsValid;
    } else if (mode === "wifi") {
      isViolated = !details.wifiValid;
    } else if (mode === "hybrid") {
      isViolated = !details.gpsValid || !details.wifiValid;
    }

    return NextResponse.json({
      distance,
      isViolated,
      details,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("API Error:", error);
    return NextResponse.json(
      { error: "Internal Server Error" },
      { status: 500 }
    );
  }
}
