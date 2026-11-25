import { NextRequest, NextResponse } from "next/server";

const API_KEY = process.env.NEXT_PUBLIC_GOOGLE_PLACES_API_KEY;

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const action = searchParams.get("action");
  const input = searchParams.get("input");
  const placeId = searchParams.get("place_id");

  if (!API_KEY) {
    return NextResponse.json({ error: "No API key" }, { status: 500 });
  }

  // Places API (New) — Autocomplete
  if (action === "autocomplete" && input) {
    const res = await fetch(
      "https://places.googleapis.com/v1/places:autocomplete",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Goog-Api-Key": API_KEY,
        },
        body: JSON.stringify({
          input,
          includedRegionCodes: ["us"],
          includedPrimaryTypes: ["geocode"],
        }),
      }
    );
    const data = await res.json();
    // Map new API response to legacy format for the client
    const predictions = (data.suggestions ?? [])
      .filter((s: { placePrediction?: unknown }) => s.placePrediction)
      .map((s: { placePrediction: { text: { text: string }; placeId: string } }) => ({
        description: s.placePrediction.text.text,
        place_id: s.placePrediction.placeId,
      }));
    return NextResponse.json({ predictions, status: "OK" });
  }

  // Places API (New) — Place Details for geocoding
  if (action === "geocode" && placeId) {
    const res = await fetch(
      `https://places.googleapis.com/v1/places/${placeId}`,
      {
        headers: {
          "X-Goog-Api-Key": API_KEY,
          "X-Goog-FieldMask": "location",
        },
      }
    );
    const data = await res.json();
    // Map to legacy geocode format for the client
    if (data.location) {
      return NextResponse.json({
        results: [
          {
            geometry: {
              location: {
                lat: data.location.latitude,
                lng: data.location.longitude,
              },
            },
          },
        ],
        status: "OK",
      });
    }
    return NextResponse.json({ results: [], status: "ZERO_RESULTS" });
  }

  return NextResponse.json({ error: "Invalid request" }, { status: 400 });
}
