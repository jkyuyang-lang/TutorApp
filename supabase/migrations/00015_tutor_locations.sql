-- Add in-person tutoring locations (address + radius in miles)
-- Format: [{"address": "123 Main St, City, ST", "lat": 33.7, "lng": -84.3, "radius_miles": 10, "place_id": "ChIJ..."}]
ALTER TABLE tutors ADD COLUMN IF NOT EXISTS locations jsonb DEFAULT '[]'::jsonb;
