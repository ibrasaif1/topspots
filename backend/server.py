import os, math, json, time, urllib.parse
from concurrent.futures import ThreadPoolExecutor, as_completed

import requests
from flask import Flask, request, jsonify
from flask_cors import CORS

# ====== Config ======
GOOGLE_API_KEY = os.environ.get("GOOGLE_API_KEY", "")
OUTPUT_DIR = os.environ.get("OUTPUT_DIR", "data")
MAX_WORKERS = int(os.environ.get("MAX_WORKERS", "16"))
COUNT_LIMIT = 100  # INSIGHT_PLACES cap
USER_AGENT = "restaurant-finder-demo/1.0 (+contact@example.com)"
os.makedirs(OUTPUT_DIR, exist_ok=True)

# ====== Flask ======
app = Flask(__name__)
CORS(app, origins="*")  # allow all origins for development

# ====== Helpers ======
def slugify_city(city: str) -> str:
    return city.strip().lower().replace(" ", "_")


def get_city_bbox(city: str):
    # Nominatim: returns boundingbox [south, north, west, east]
    print(f"Looking up coordinates for {city}...")
    url = f"https://nominatim.openstreetmap.org/search?format=json&limit=1&city={urllib.parse.quote(city)}"
    try:
        r = requests.get(url, headers={"User-Agent": USER_AGENT}, timeout=10)
        r.raise_for_status()
        arr = r.json()
        if not arr:
            raise ValueError(f"City not found: {city}")
        south, north, west, east = map(float, arr[0]["boundingbox"])
        print(f"Found bbox for {city}: {south}, {north}, {west}, {east}")
        # Return as top/bottom/left/right for convenience
        return {"top": north, "bottom": south, "left": west, "right": east}
    except Exception as e:
        print(f"Error getting city bbox: {e}")
        raise

def bbox_center_radius_m(b):
    # circle that covers the bbox: radius = half-diagonal (meters)
    top, bottom, left, right = b["top"], b["bottom"], b["left"], b["right"]
    lat_c = (top + bottom) / 2.0
    lng_c = (left + right) / 2.0
    lat_delta = (top - bottom) / 2.0
    lng_delta = (right - left) / 2.0
    m_per_deg_lat = 111_320.0
    m_per_deg_lng = 111_320.0 * math.cos(math.radians(lat_c))
    r_m = math.sqrt((lat_delta * m_per_deg_lat) ** 2 + (lng_delta * m_per_deg_lng) ** 2)
    return lat_c, lng_c, max(r_m, 50.0)  # enforce tiny minimum

def split_bbox(b):
    mid_lat = (b["top"] + b["bottom"]) / 2.0
    mid_lng = (b["left"] + b["right"]) / 2.0
    return [
        {"top": b["top"], "bottom": mid_lat, "left": b["left"], "right": mid_lng},  # NW
        {"top": b["top"], "bottom": mid_lat, "left": mid_lng, "right": b["right"]}, # NE
        {"top": mid_lat, "bottom": b["bottom"], "left": b["left"], "right": mid_lng},# SW
        {"top": mid_lat, "bottom": b["bottom"], "left": mid_lng, "right": b["right"]}# SE
    ]


def aggregate_count_for_bbox(b):
    lat, lng, radius = bbox_center_radius_m(b)
    body = {
        "insights": ["INSIGHT_COUNT"],
        "filter": {
            "locationFilter": {
                "circle": {
                    "center": {"latLng": {"latitude": lat, "longitude": lng}},
                    "radius": radius
                }
            },
            "typeFilter": {"includedTypes": ["restaurant"]},
            "ratingFilter": {"minRating": 4.5, "maxRating": 5.0},
            "operatingStatus": ["OPERATING_STATUS_OPERATIONAL"]
        }
    }
    resp = requests.post(
        "https://areainsights.googleapis.com/v1:computeInsights",
        headers={
            "Content-Type": "application/json",
            "X-Goog-Api-Key": GOOGLE_API_KEY
        },
        json=body,
        timeout=30
    )
    resp.raise_for_status()
    data = resp.json()
    # response like: {"count":"123"}
    return int(data.get("count", "0"))


def aggregate_places_for_bbox(b):
    lat, lng, radius = bbox_center_radius_m(b)
    body = {
        "insights": ["INSIGHT_PLACES"],
        "filter": {
            "locationFilter": {
                "circle": {
                    "center": {"latLng": {"latitude": lat, "longitude": lng}},
                    "radius": radius
                }
            },
            "typeFilter": {"includedTypes": ["restaurant"]},
            "ratingFilter": {"minRating": 4.5, "maxRating": 5.0},
            "operatingStatus": ["OPERATING_STATUS_OPERATIONAL"]
        }
    }
    resp = requests.post(
        "https://areainsights.googleapis.com/v1:computeInsights",
        headers={
            "Content-Type": "application/json",
            "X-Goog-Api-Key": GOOGLE_API_KEY
        },
        json=body,
        timeout=30
    )
    resp.raise_for_status()
    data = resp.json()
    # expected: {"places":[{"name":"places/PLACE_ID"}, ...]}
    names = []
    for p in data.get("places", []):
        n = p.get("name") or p.get("id")
        if n:
            names.append(n)  # n is usually "places/XXXX"
    return names


def place_details(place_resource_name: str):
    # place_resource_name looks like "places/ChIJ...."
    url = f"https://places.googleapis.com/v1/{place_resource_name}"
    # Field mask: Enterprise + Pro + Essentials IDs-only as needed
    field_mask = "id,name,displayName,googleMapsUri,primaryType,primaryTypeDisplayName,types,rating,userRatingCount,priceLevel,priceRange,location"
    resp = requests.get(
        url,
        headers={
            "X-Goog-Api-Key": GOOGLE_API_KEY,
            "X-Goog-FieldMask": field_mask
        },
        timeout=20
    )
    if resp.status_code == 404:
        return None
    resp.raise_for_status()
    return resp.json()

def collect_place_ids_for_city(city: str):
    bbox = get_city_bbox(city)
    ids = set()
    stack = [bbox]
    while stack:
        box = stack.pop()
        try:
            cnt = aggregate_count_for_bbox(box)
        except requests.HTTPError as e:
            # For safety, split on transient errors to keep progressing
            if len(stack) < 2048:
                stack.extend(split_bbox(box))
            continue

        if cnt == 0:
            continue
        if cnt <= COUNT_LIMIT:
            try:
                names = aggregate_places_for_bbox(box)
            except requests.HTTPError:
                # If INSIGHT_PLACES fails here, split once and continue
                stack.extend(split_bbox(box))
                continue
            for n in names:
                ids.add(n)  # "places/.."
        else:
            stack.extend(split_bbox(box))
    return sorted(ids)

def hydrate_places(place_names):
    out = []
    with ThreadPoolExecutor(max_workers=MAX_WORKERS) as ex:
        futs = {ex.submit(place_details, n): n for n in place_names}
        for fut in as_completed(futs):
            data = fut.result()
            if not data:
                continue
            # normalize minimal shape the frontend can read
            location_data = data.get("location", {})
            gps_coordinates = None
            if location_data and "latitude" in location_data and "longitude" in location_data:
                gps_coordinates = {
                    "latitude": location_data["latitude"],
                    "longitude": location_data["longitude"]
                }
            
            out.append({
                "id": data.get("id"),
                "name": data.get("displayName", {}).get("text") if isinstance(data.get("displayName"), dict) else data.get("displayName"),
                "resourceName": data.get("name"),
                "googleMapsUri": data.get("googleMapsUri"),
                "primaryType": data.get("primaryType"),
                "primaryTypeDisplayName": (data.get("primaryTypeDisplayName", {}) or {}).get("text")
                    if isinstance(data.get("primaryTypeDisplayName"), dict) else data.get("primaryTypeDisplayName"),
                "types": data.get("types", []),
                "rating": data.get("rating"),
                "userRatingCount": data.get("userRatingCount"),
                "priceLevel": data.get("priceLevel"),
                "priceRange": data.get("priceRange"),
                "gps_coordinates": gps_coordinates,
            })
    return out

# ====== Endpoints ======
@app.get("/health")
def health():
    return jsonify({"status": "ok", "message": "Server is running"})

@app.get("/test")
def test():
    return jsonify({
        "ok": True,
        "message": "Test endpoint working",
        "api_key_set": bool(GOOGLE_API_KEY),
        "api_key_length": len(GOOGLE_API_KEY) if GOOGLE_API_KEY else 0
    })

@app.get("/count")
def count_restaurants():
    """Just get count of restaurants for cost estimation"""
    if not GOOGLE_API_KEY:
        return jsonify({"error": "Set GOOGLE_API_KEY env var"}), 500

    city = request.args.get("city", "").strip()
    if not city:
        return jsonify({"error": "Missing ?city="}), 400

    print(f"Getting restaurant count for {city}...")
    
    try:
        # Get city bounding box
        bbox = get_city_bbox(city)
        
        # Use a smaller fixed radius instead of the full bbox
        lat, lng, _ = bbox_center_radius_m(bbox)
        
        # Use 10km radius for San Diego center (much smaller than full bbox)
        body = {
            "insights": ["INSIGHT_COUNT"],
            "filter": {
                "locationFilter": {
                    "circle": {
                        "center": {"latLng": {"latitude": lat, "longitude": lng}},
                        "radius": 10000  # 10km radius
                    }
                },
                "typeFilter": {"includedTypes": ["restaurant"]},
                "ratingFilter": {"minRating": 4.5, "maxRating": 5.0},
                "operatingStatus": ["OPERATING_STATUS_OPERATIONAL"]
            }
        }
        
        print(f"Making count API call for area around {lat}, {lng} with radius 10km")
        
        resp = requests.post(
            "https://areainsights.googleapis.com/v1:computeInsights",
            headers={
                "Content-Type": "application/json",
                "X-Goog-Api-Key": GOOGLE_API_KEY
            },
            json=body,
            timeout=30
        )
        resp.raise_for_status()
        data = resp.json()
        
        count = int(data.get("count", "0"))
        cost = count * 0.02
        
        print(f"Found {count} restaurants, estimated cost: ${cost}")
        
        return jsonify({
            "ok": True,
            "city": city,
            "restaurantCount": count,
            "estimatedCost": cost
        })
        
    except Exception as e:
        print(f"Error: {e}")
        return jsonify({"error": str(e)}), 500

@app.get("/search")
def search():
    print(f"Received request for city search")
    if not GOOGLE_API_KEY:
        print("No API key found!")
        return jsonify({"error": "Set GOOGLE_API_KEY env var"}), 500

    city = request.args.get("city", "").strip()
    if not city:
        print("No city provided!")
        return jsonify({"error": "Missing ?city="}), 400

    count_only = request.args.get("count_only", "").lower() == "true"
    print(f"Processing city: {city}, count_only: {count_only}")

    t0 = time.time()
    # 1) get IDs via tiling
    print(f"Getting place IDs for {city}...")
    place_names = collect_place_ids_for_city(city)
    print(f"Found {len(place_names)} place IDs")

    if count_only:
        return jsonify({
            "ok": True, 
            "elapsedSec": round(time.time() - t0, 2),
            "totalHydrated": len(place_names),
            "estimatedCost": len(place_names) * 0.02
        })

    # 2) hydrate details (Enterprise call)
    places = hydrate_places(place_names)

    # 3) save to /data/{city}.json (includes ALL ≥4.5, regardless of userRatingCount)
    payload = {
        "city": city,
        "generatedAt": int(time.time()),
        "totalPlaces": len(places),
        "filters": {"minRating": 4.5},  # userRatingCount filtering happens in frontend serve
        "places": places
    }
    out_path = os.path.join(OUTPUT_DIR, f"{slugify_city(city)}.json")
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(payload, f, ensure_ascii=False)

    dt = round(time.time() - t0, 2)
    return jsonify({"ok": True, "elapsedSec": dt, "saved": out_path, "totalHydrated": len(places), "data": payload})

if __name__ == "__main__":
    app.run(port=5001, debug=True)