# services/derivations_service.py
from datetime import datetime, timezone
from math import radians, cos, sin, asin, sqrt
from collections import defaultdict
from google.cloud import firestore
from firebase.firebase_config import db

def _to_dt(ts):
    if hasattr(ts, "isoformat"):  # Firestore timestamp
        return ts.replace(tzinfo=timezone.utc)
    if isinstance(ts, str):
        # be lenient with Z
        return datetime.fromisoformat(ts.replace("Z", "+00:00"))
    return None

def haversine_meters(lat1, lon1, lat2, lon2):
    R = 6371000.0
    dlat, dlon = radians(lat2-lat1), radians(lon2-lon1)
    a = sin(dlat/2)**2 + cos(radians(lat1))*cos(radians(lat2))*sin(dlon/2)**2
    return 2*R*asin(sqrt(a))

def _bucket_hour(dt):
    return dt.strftime("%H:00-%H:59")

def compute_rollup_from_allpoints(all_points: list, stop_radius_m=120, min_dwell_s=300):
    """Very lightweight stop detection + rollups without external libs."""
    # 1) sort
    pts = []
    for p in all_points:
        lat, lng = p.get("lat"), p.get("lng")
        dt = _to_dt(p.get("timestamp"))
        if lat is None or lng is None or dt is None: 
            continue
        pts.append({"lat": float(lat), "lng": float(lng), "ts": dt})
    pts.sort(key=lambda x: x["ts"])

    if not pts:
        return {"totalPoints": 0}

    # 2) basic timeline stats
    first, last = pts[0]["ts"], pts[-1]["ts"]
    total_dur = (last - first).total_seconds()

    # 3) cluster stops (greedy: nearby consecutive points form a stop)
    stops = []
    i = 0
    while i < len(pts):
        j = i + 1
        cluster = [pts[i]]
        while j < len(pts):
            if haversine_meters(pts[i]["lat"], pts[i]["lng"], pts[j]["lat"], pts[j]["lng"]) <= stop_radius_m:
                cluster.append(pts[j]); j += 1
            else:
                break
        dwell = (cluster[-1]["ts"] - cluster[0]["ts"]).total_seconds()
        if dwell >= min_dwell_s and len(cluster) >= 2:
            lat = sum(c["lat"] for c in cluster)/len(cluster)
            lng = sum(c["lng"] for c in cluster)/len(cluster)
            stops.append({
                "lat": lat, "lng": lng, 
                "start": cluster[0]["ts"], "end": cluster[-1]["ts"], 
                "dwellSeconds": int(dwell)
            })
        i = j

    # 4) top locations by visit count (grid round ~0.001 ~ 100m)
    key_counts = defaultdict(int)
    for s in stops:
        key = (round(s["lat"], 3), round(s["lng"], 3))
        key_counts[key] += 1
    top_locations = [
        {"lat": k[0], "lng": k[1], "visits": v} 
        for k, v in sorted(key_counts.items(), key=lambda kv: kv[1], reverse=True)[:5]
    ]

    # 5) active hours (simple)
    hours = defaultdict(int)
    for p in pts:
        hours[_bucket_hour(p["ts"])] += 1
    active_hours = [h for h,_ in sorted(hours.items(), key=lambda kv: kv[1], reverse=True)[:6]]

    # 6) anomalies (big jumps > 10km in < 5 minutes)
    anomalies = []
    for a, b in zip(pts, pts[1:]):
        dt = (b["ts"] - a["ts"]).total_seconds()
        if dt <= 300:
            meters = haversine_meters(a["lat"], a["lng"], b["lat"], b["lng"])
            if meters > 10000:
                anomalies.append({"type":"big_jump","ts":b["ts"].isoformat(),"meters":int(meters)})

    longest = max(stops, key=lambda s: s["dwellSeconds"]) if stops else None

    return {
        "computedAt": datetime.now(timezone.utc).isoformat(),
        "totalPoints": len(pts),
        "firstTimestamp": first.isoformat(),
        "lastTimestamp": last.isoformat(),
        "totalDurationSeconds": int(total_dur),
        "stopCount": len(stops),
        "longestDwell": (
            {
                "seconds": longest["dwellSeconds"],
                "lat": longest["lat"], "lng": longest["lng"],
                "start": longest["start"].isoformat(),
                "end": longest["end"].isoformat()
            } if longest else None
        ),
        "topLocations": top_locations,
        "activeHoursBuckets": active_hours,
        "anomalies": anomalies,
        # (Optional) return events to save into subcollection:
        "_events": [
            {
              "type":"stop",
              "start": s["start"].isoformat(),
              "end": s["end"].isoformat(),
              "lat": s["lat"], "lng": s["lng"],
              "dwellSeconds": s["dwellSeconds"],
              "source": "derived-v1"
            } for s in stops
        ]
    }

def write_rollup(case_id: str, rollup: dict):
    case_ref = db.collection("cases").document(case_id)
    derived_ref = case_ref.collection("derived").document("rollup")
    batch = db.batch()
    batch.set(derived_ref, {k:v for k,v in rollup.items() if k != "_events"})

    # optional: replace events
    events_ref = case_ref.collection("events")
    # delete & rewrite (small volumes assumed)
    for old in events_ref.stream():
        batch.delete(old.reference)
    for ev in rollup.get("_events", []):
        batch.set(events_ref.document(), ev)
    batch.commit()

def compute_and_store_rollup(case_id: str):
    allp = [d.to_dict() for d in db.collection("cases").document(case_id).collection("allPoints").stream()]
    if not allp:
        return {"success": False, "message": "No allPoints"}
    rollup = compute_rollup_from_allpoints(allp)
    write_rollup(case_id, rollup)
    return {"success": True, "rollup": rollup}
