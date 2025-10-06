import { useEffect, useMemo, useState } from "react";
import { db } from "../firebase";
import {
  collection,
  query,
  where,
  onSnapshot,
  doc,
  updateDoc,
  deleteDoc,
  getDocs,
  orderBy,
} from "firebase/firestore";
import * as Cesium from "cesium";
import { Pencil, Trash2 } from "lucide-react";
import "../css/Sidebar.css";

/** -------------------- DEBUG + helpers -------------------- **/

const DEBUG = true; // set false to quiet logs
const SA_TZ = "Africa/Johannesburg"; // only for human-friendly logs




const fmtMs = (ms, tz = "UTC") =>
  ms == null
    ? "null"
    : new Date(ms).toLocaleString("en-ZA", {
        timeZone: tz,
        hour12: false,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
      });

/** Get CSV-ish time string from a location doc */
function extractCsvTime(loc) {
  return (
    loc?.csvDescription ||
    loc?.originalData?.csvDescription ||
    loc?.rawData?.Description ||
    loc?.timestamp ||
    null
  );
}

/** Parse HH:MM:SS from any string → {h,m,s} or null */
function parseTOD(csvLike) {
  if (!csvLike) return null;
  const m = String(csvLike).match(/(\d{2}):(\d{2}):(\d{2})/);
  if (!m) return null;
  const h = Number(m[1]),
    mi = Number(m[2]),
    s = Number(m[3]);
  if (
    !Number.isFinite(h) ||
    !Number.isFinite(mi) ||
    !Number.isFinite(s) ||
    h > 23 ||
    mi > 59 ||
    s > 59
  )
    return null;
  return { h, m: mi, s };
}

/** Viewer’s start day at UTC midnight → epoch ms */
function getViewerStartDayUtcMs(viewerRef) {
  const v = viewerRef?.current?.cesiumElement;
  if (!v?.clock?.startTime) return null;
  const start = Cesium.JulianDate.toDate(v.clock.startTime);
  return Date.UTC(
    start.getUTCFullYear(),
    start.getUTCMonth(),
    start.getUTCDate(),
    0,
    0,
    0,
    0
  );
}

/** Place a {h,m,s} on the viewer’s current start day (UTC) */
function todOnViewerStartUTC(viewerRef, tod) {
  const v = viewerRef?.current?.cesiumElement;
  if (!v?.clock?.startTime || !tod) return null;
  const start = Cesium.JulianDate.toDate(v.clock.startTime);
  return Date.UTC(
    start.getUTCFullYear(),
    start.getUTCMonth(),
    start.getUTCDate(),
    tod.h,
    tod.m,
    tod.s,
    0
  );
}

/** Seconds since UTC midnight for any ms timestamp */
function secondsSinceMidnightUTC(ms) {
  if (ms == null) return null;
  const d = new Date(ms);
  return d.getUTCHours() * 3600 + d.getUTCMinutes() * 60 + d.getUTCSeconds();
}

/** Fallback: if no time parsed, space by 'order' from sim-day midnight (5s per step) */
function orderFallbackMs(order, baseDayUtcMs) {
  if (baseDayUtcMs == null) return null;
  const offsetSec = Number.isFinite(order) ? order * 5 : 0;
  return baseDayUtcMs + offsetSec * 1000;
}

const badgeFor = (source) =>
  source === "flag" ? "Flag" : source === "stop" ? "Stopped" : "Note";

/** ----------------------------------------------------------- **/

export default function SimulationSidebar({ viewerRef, disabled = false }) {
  const [collapsed, setCollapsed] = useState(false);
  const [activeIndex, setActiveIndex] = useState(null);

  // data
  const [caseId, setCaseId] = useState(null);
  const [flaggedPoints, setFlaggedPoints] = useState([]); // UTC timestamps
  const [locations, setLocations] = useState([]); // CSV text → TOD

  // base sim day at UTC midnight (for display/sort); we still recompute on click
  const [baseDayUtcMs, setBaseDayUtcMs] = useState(null);

  // edit modal
  const [editingPoint, setEditingPoint] = useState(null);
  const [editTitle, setEditTitle] = useState("");
  const [editNote, setEditNote] = useState("");
  const [flashingIndex, setFlashingIndex] = useState(null);

  // Track which cards are expanded (keyed by "source:id")
const [expanded, setExpanded] = useState({});
const toggleExpand = (key, e) => {
  e.stopPropagation(); // don't trigger the card's onClick jump
  setExpanded(prev => ({ ...prev, [key]: !prev[key] }));
};


  // caseId from localStorage
  useEffect(() => {
    try {
      const str = localStorage.getItem("trackxCaseData");
      const parsed = str ? JSON.parse(str) : null;
      if (parsed?.caseId) setCaseId(parsed.caseId);
    } catch {}
  }, []);

  // Keep base day synced to the viewer’s clock (updates if CZML startTime changes)
  useEffect(() => {
    const tick = () => {
      const ms = getViewerStartDayUtcMs(viewerRef);
      setBaseDayUtcMs((prev) => (ms != null && ms !== prev ? ms : prev));
      if (DEBUG && ms != null && ms !== baseDayUtcMs) {
        console.debug(
          "[SIM-DAY sync] baseDay UTC:",
          fmtMs(ms, "UTC"),
          "(SAST:",
          fmtMs(ms, SA_TZ),
          ")"
        );
      }
    };
    tick();
    const id = setInterval(tick, 500); // lightweight, only sets if changed
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewerRef]);

  /* ---------- flagged points: realtime (already UTC) ---------- */
  useEffect(() => {
    if (!caseId) return;
    const ref = collection(db, `cases/${caseId}/interpolatedPoints`);
    const qy = query(ref, where("isFlagged", "==", true));
    const unsub = onSnapshot(
      qy,
      (snap) => {
        const pts = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
        pts.sort((a, b) => {
          const aMs =
            a.timestamp?.toMillis?.() ??
            (a.timestamp?.seconds ? a.timestamp.seconds * 1000 : 0);
          const bMs =
            b.timestamp?.toMillis?.() ??
            (b.timestamp?.seconds ? b.timestamp.seconds * 1000 : 0);
          return aMs - bMs;
        });
        if (DEBUG) {
          console.debug(
            "[FLAGS] sample:",
            pts.slice(0, 3).map((p) => ({
              id: p.id,
              utc: fmtMs(
                p.timestamp?.toMillis?.() ??
                  (p.timestamp?.seconds ? p.timestamp.seconds * 1000 : null),
                "UTC"
              ),
            }))
          );
        }
        setFlaggedPoints(pts);
      },
      (err) => console.error("flags listener error:", err)
    );
    return () => unsub();
  }, [caseId]);

  /* ---------- locations: one-time fetch → store TOD ---------- */
  useEffect(() => {
    if (!caseId) return;
    (async () => {
      try {
        const ref = collection(db, `cases/${caseId}/locations`);
        const snap = await getDocs(query(ref, orderBy("order", "asc")));
        const locs = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
        if (DEBUG) {
          console.debug(
            "[LOCS] loaded",
            locs.length,
            locs.map((l) => ({
              id: l.id,
              title: l.title,
              order: l.order,
              csv: extractCsvTime(l),
            }))
          );
        }
        setLocations(locs);
      } catch (e) {
        console.error("fetch locations failed:", e);
      }
    })();
  }, [caseId]);

  /** ---------- normalize to a single, day-agnostic timeline ---------- */

  // Flags: real UTC jump time; plus a **day-agnostic sortKeyMs** so they interleave with stops
  const flagItems = useMemo(() => {
    return flaggedPoints.map((p) => {
      const utcMs =
        p.timestamp?.toMillis?.() ??
        (p.timestamp?.seconds ? p.timestamp.seconds * 1000 : null);

      // seconds-of-day from the flag's timestamp
      const todSec = secondsSinceMidnightUTC(utcMs);
      // anchor to viewer day for **sorting only**
      const sortKeyMs =
        baseDayUtcMs != null && todSec != null
          ? baseDayUtcMs + todSec * 1000
          : utcMs;

      return {
        source: "flag",
        id: p.id,
        title: p.title || "Flagged point",
        note: p.note || "",
        lat: p.lat,
        lng: p.lng,
        timestampMs: utcMs,      // for jump/display (true UTC)
        sortKeyMs,               // for ordering (viewer day)
        raw: p,
        debug: { chosenVia: "flag-utc", todSec },
      };
    });
  }, [flaggedPoints, baseDayUtcMs]);

  // Stops/annotations: parse HH:MM:SS → place on current base day (UTC)
  const stopItems = useMemo(() => {
    return locations.map((loc) => {
      const csvStr = extractCsvTime(loc);
      const tod = parseTOD(csvStr);

      const chosenMs =
        tod && baseDayUtcMs != null
          ? baseDayUtcMs + (tod.h * 3600 + tod.m * 60 + tod.s) * 1000
          : orderFallbackMs(loc.order, baseDayUtcMs);

      const sortKeyMs = chosenMs; // for stops, chosenMs is already viewer-day based
      const chosenVia = tod ? "csv-tod+simday-utc" : "order-fallback";

      if (DEBUG) {
        console.debug("[STOP MAP - DAY AGNOSTIC]", {
          id: loc.locationId || loc.id,
          title: loc.title,
          csvRaw: csvStr,
          tod: tod ? `${tod.h}:${String(tod.m).padStart(2, "0")}:${String(tod.s).padStart(2, "0")}` : null,
          baseDayUTC: fmtMs(baseDayUtcMs, "UTC"),
          chosenUTC: fmtMs(chosenMs, "UTC"),
          chosenSAST: fmtMs(chosenMs, SA_TZ),
          via: chosenVia,
        });
      }

      return {
        source: "stop",
        id: loc.locationId || loc.id,
        title: loc.title || "Stopped location",
        note: loc.description || "",
        lat: loc.lat,
        lng: loc.lng,
        timestampMs: chosenMs,  // used for display (UTC time on viewer day)
        sortKeyMs,              // used for ordering
        order: loc.order ?? 0,
        raw: loc,
        debug: { chosenVia, tod },
      };
    });
  }, [locations, baseDayUtcMs]);

  // Merge + **order by sortKeyMs** (NOT absolute timestamp)
  const items = useMemo(() => {
    const merged = [...stopItems, ...flagItems];

    merged.sort((a, b) => {
      const at = a.sortKeyMs ?? Number.POSITIVE_INFINITY;
      const bt = b.sortKeyMs ?? Number.POSITIVE_INFINITY;
      if (at !== bt) return at - bt;

      // ties: stops first, then flags
      if (a.source !== b.source) return a.source === "stop" ? -1 : 1;

      const ao = a.order ?? 0,
        bo = b.order ?? 0;
      if (ao !== bo) return ao - bo;

      return String(a.id).localeCompare(String(b.id));
    });

    if (DEBUG) {
      console.debug(
        "[MERGED ORDER / DAY-AGNOSTIC]",
        merged.map((it) => ({
          src: it.source,
          id: it.id,
          title: it.title,
          via: it.debug?.chosenVia,
          sortKeyUTC: fmtMs(it.sortKeyMs, "UTC"),
          displayUTC: fmtMs(it.timestampMs, "UTC"),
        }))
      );
    }

    return merged;
  }, [stopItems, flagItems]);

  // Flash support
  useEffect(() => {
    const listener = (e) => {
      const idx = e.detail;
      setFlashingIndex(idx);
      setTimeout(() => setFlashingIndex(null), 1000);
    };
    window.addEventListener("flashSidebarItem", listener);
    return () => window.removeEventListener("flashSidebarItem", listener);
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem("flaggedSidebarFlash", JSON.stringify(items));
    } catch {}
  }, [items]);

  /** ---------- JUMP (recompute stop on click so day never mismatches) ---------- **/
  function logJumpRequest(it, idx, viewer) {
    const startMs = viewer?.clock
      ? Cesium.JulianDate.toDate(viewer.clock.startTime).getTime()
      : null;
    const stopMs = viewer?.clock
      ? Cesium.JulianDate.toDate(viewer.clock.stopTime).getTime()
      : null;

    console.groupCollapsed(
      `🛰️ [JUMP request] #${idx} ${it.source.toUpperCase()} :: ${
        it.title ?? "(untitled)"
      }`
    );
    console.table({
      id: it.id,
      source: it.source,
      chosenVia: it.debug?.chosenVia ?? "(n/a)",
      targetUTC: fmtMs(it.timestampMs, "UTC"),
      targetSAST: fmtMs(it.timestampMs, SA_TZ),
    });
    console.table({
      simWindowStartUTC: fmtMs(startMs, "UTC"),
      simWindowStopUTC: fmtMs(stopMs, "UTC"),
    });
    console.groupEnd();
  }

  const jumpTo = (timestampMs, idx, it) => {
    if (disabled || !timestampMs) return;
    const viewer = viewerRef?.current?.cesiumElement;
    if (!viewer?.clock) return;

    // Pre-log (what we *thought* we'd jump to)
    logJumpRequest(it, idx, viewer);

    // For stops, recompute from TOD on the current viewer day (absolutely day-agnostic)
    let targetMs = timestampMs;
    if (it.source === "stop" && it.debug?.tod) {
      const recomputed = todOnViewerStartUTC(viewerRef, it.debug.tod);
      if (recomputed != null) {
        if (DEBUG) {
          console.debug("[JUMP] recomputed on viewer day:", {
            oldUTC: fmtMs(targetMs, "UTC"),
            newUTC: fmtMs(recomputed, "UTC"),
          });
        }
        targetMs = recomputed;
      }
    }

    const target = Cesium.JulianDate.fromDate(new Date(targetMs));
    const start = viewer.clock.startTime;
    const stop = viewer.clock.stopTime;

    const startMs = Cesium.JulianDate.toDate(start).getTime();
    const stopMs = Cesium.JulianDate.toDate(stop).getTime();

    let outcome = "INSIDE_RANGE";
    if (Cesium.JulianDate.lessThan(target, start)) {
      viewer.clock.currentTime = Cesium.JulianDate.clone(start);
      outcome = "CLAMPED_TO_START";
    } else if (Cesium.JulianDate.greaterThan(target, stop)) {
      viewer.clock.currentTime = Cesium.JulianDate.clone(stop);
      outcome = "CLAMPED_TO_STOP";
    } else {
      viewer.clock.currentTime = target;
      outcome = "TARGET_SET";
    }
    viewer.clock.shouldAnimate = false;

    console.groupCollapsed("⏱️ [JUMP clamp-check]");
    console.table({
      targetUTC: new Date(targetMs).toLocaleTimeString("en-GB", {
        hour12: false,
        timeZone: "UTC",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
      }),
      windowStartUTC: new Date(startMs).toLocaleTimeString("en-GB", {
        hour12: false,
        timeZone: "UTC",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
      }),
      windowStopUTC: new Date(stopMs).toLocaleTimeString("en-GB", {
        hour12: false,
        timeZone: "UTC",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
      }),
      outcome,
    });
    console.groupEnd();
  };

  const handleDelete = (point) => {
    if (window.confirm("Are you sure you want to delete this flagged point?")) {
      const pointRef = doc(db, `cases/${caseId}/interpolatedPoints`, point.id);
      deleteDoc(pointRef).catch((err) =>
        console.error("Error deleting point:", err)
      );
    }
  };

  /** -------------------- UI -------------------- **/

  return (
    <div
      style={{
        position: "absolute",
        top: "24px",
        left: "24px",
        width: collapsed ? "64px" : "300px",
        backgroundColor: "#1e1e1e",
        color: "#f1f5f9",
        padding: "20px",
        borderRadius: "16px",
        boxShadow:
          "0 0 24px rgba(0, 0, 0, 0.6), 0 0 12px rgba(100, 100, 100, 0.3)",
        zIndex: 999,
        transition: "all 0.4s ease",
        overflow: "hidden",
      }}
    >
      {/* Collapse Button */}
      <div
        style={{
          display: "flex",
          justifyContent: "flex-end",
          marginBottom: collapsed ? "0" : "16px",
        }}
      >
        <button
          onClick={() => setCollapsed(!collapsed)}
          style={{
            background: "none",
            color: "#38bdf8",
            border: "none",
            cursor: "pointer",
            fontSize: "1.8rem",
            transform: collapsed ? "rotate(90deg)" : "rotate(0deg)",
            transition: "transform 0.4s ease",
          }}
          title={collapsed ? "Expand menu" : "Collapse menu"}
        >
          ☰
        </button>
      </div>

      {!collapsed && (
        <>
          <h2
            style={{
              fontSize: "1.2rem",
              fontWeight: "bold",
              marginBottom: "12px",
            }}
          >
            Events
          </h2>

          <div style={{ position: "relative", paddingLeft: "24px" }}>
            {/* Vertical Line */}
            <div
              style={{
                position: "absolute",
                top: 0,
                left: "10px",
                width: "2px",
                height: "100%",
                backgroundColor: "#4b5563",
                zIndex: 0,
              }}
            />

            {/* Scrollable Items */}
            <div
              aria-disabled={disabled}
              style={{
                display: "flex",
                flexDirection: "column",
                gap: "18px",
                zIndex: 1,
                maxHeight: "60vh",
                overflowY: "auto",
                paddingRight: "6px",
                pointerEvents: disabled ? "none" : "auto",
                opacity: disabled ? 0.5 : 1,
                filter: disabled ? "grayscale(60%)" : "none",
              }}
            >
              {items.length === 0 ? (
                <p style={{ color: "#94a3b8", fontSize: "0.85rem" }}>
                  No events yet.
                </p>
              ) : (
                items.map((it, idx) => (
                  <div
                    key={`${it.source}-${it.id}-${idx}`}
                    onClick={() => {
                      if (disabled) return;
                      if (it.timestampMs) {
                        jumpTo(it.timestampMs, idx, it);
                        setActiveIndex(idx);
                        setFlashingIndex(idx);
                        setTimeout(() => setFlashingIndex(null), 1000);
                      } else {
                        console.warn("No timestamp for item; cannot jump:", it);
                      }
                    }}
                    style={{
                      backgroundColor:
                        flashingIndex === idx
                          ? "#67e8f9"
                          : activeIndex === idx
                          ? "#ffffff"
                          : "#111827",
                      color: activeIndex === idx ? "#000" : "#f1f5f9",
                      padding: "10px 14px",
                      borderRadius: "10px",
                      fontSize: "0.95rem",
                      fontWeight: "500",
                      transition: "background-color 0.3s ease",
                      boxShadow:
                        flashingIndex === idx
                          ? "0 0 12px rgba(103, 232, 249, 0.8)"
                          : activeIndex === idx
                          ? "0 0 8px rgba(255,255,255,0.4)"
                          : "inset 0 0 0 1px rgba(255,255,255,0.05)",
                      position: "relative",
                      cursor:
                        disabled ? "default" : it.timestampMs ? "pointer" : "default",
                    }}
                  >
                    {/* Dot Marker */}
                    <div
                      style={{
                        position: "absolute",
                        top: "50%",
                        left: "-18px",
                        transform: "translateY(-50%)",
                        width: "10px",
                        height: "10px",
                        borderRadius: "999px",
                        backgroundColor:
                          it.source === "flag" ? "#f59e0b" : "#38bdf8",
                        border: "2px solid #1e1e1e",
                      }}
                    />

                    <div>
                      <div
                        style={{
                          display: "flex",
                          justifyContent: "space-between",
                          alignItems: "center",
                        }}
                      >
                        <p
                          style={{
                            fontWeight: "600",
                            fontSize: "0.95rem",
                            color: "#38bdf8",
                            wordWrap: "break-word",
                            whiteSpace: "normal",
                            maxWidth: "200px",
                          }}
                        >
                          {it.title || "Untitled"}
                        </p>
                        <span
                          style={{
                            fontSize: "11px",
                            padding: "2px 8px",
                            borderRadius: "999px",
                            border: "1px solid #334155",
                            color: "#cbd5e1",
                          }}
                        >
                          {badgeFor(it.source)}
                        </span>
                      </div>

                      {/* Note (collapsible) */}
                      {(() => {
                        const key = `${it.source}:${it.id}`;
                        const noteText = it.note || "(no note)";
                        const isExpanded = !!expanded[key];
                        const tooLong = noteText.length > 180; // threshold for showing toggle

                        // Styles: clamped (3 lines) vs expanded (full)
                        const clampedStyle = {
                          fontSize: "0.85rem",
                          marginTop: "2px",
                          color: "#cbd5e1",
                          wordWrap: "break-word",
                          whiteSpace: "normal",
                          maxWidth: "220px",
                          display: "-webkit-box",
                          WebkitLineClamp: 3,
                          WebkitBoxOrient: "vertical",
                          overflow: "hidden",
                        };
                        const expandedStyle = {
                          fontSize: "0.85rem",
                          marginTop: "2px",
                          color: "#cbd5e1",
                          wordWrap: "break-word",
                          whiteSpace: "normal",
                          maxWidth: "220px",
                        };

                        return (
                          <div style={{ marginTop: "2px" }}>
                            <p style={isExpanded ? expandedStyle : clampedStyle}>{noteText}</p>

                            {tooLong && (
                              <button
                                onClick={(e) => toggleExpand(key, e)}
                                style={{
                                  marginTop: "6px",
                                  background: "none",
                                  border: "1px solid #334155",
                                  color: "#cbd5e1",
                                  borderRadius: "999px",
                                  fontSize: "11px",
                                  padding: "2px 8px",
                                  cursor: "pointer",
                                }}
                                title={isExpanded ? "Show less" : "Show more"}
                              >
                                {isExpanded ? "Show less" : "Show more"}
                              </button>
                            )}
                          </div>
                        );
                      })()}


                      {/* Display in UTC to mirror the Cesium clock */}
                      {it.timestampMs && (
                        <p
                          style={{
                            fontSize: "0.75rem",
                            color: "#94a3b8",
                            marginTop: "4px",
                          }}
                        >
                          {new Date(it.timestampMs).toLocaleTimeString(
                            "en-GB",
                            {
                              hour: "2-digit",
                              minute: "2-digit",
                              second: "2-digit",
                              timeZone: "UTC",
                              hour12: false,
                            }
                          )}
                        </p>
                      )}

                      <div
                        style={{ marginTop: "6px", display: "flex", gap: "12px" }}
                      >
                        {it.source === "flag" && (
                          <>
                            <Pencil
                              size={16}
                              color="#9ca3af"
                              style={{ cursor: "pointer" }}
                              onClick={(e) => {
                                e.stopPropagation();
                                setEditingPoint(it.raw);
                                setEditTitle(it.title || "");
                                setEditNote(it.note || "");
                              }}
                            />
                            <Trash2
                              size={16}
                              color="#9ca3af"
                              style={{ cursor: "pointer" }}
                              onClick={(e) => {
                                e.stopPropagation();
                                handleDelete(it);
                              }}
                            />
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </>
      )}

      {editingPoint && (
        <div
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: "rgba(0,0,0,0.7)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 2000,
          }}
        >
          <div
            style={{
              backgroundColor: "#1e1e1e",
              padding: "24px",
              borderRadius: "12px",
              width: "90%",
              maxWidth: "400px",
              color: "white",
            }}
          >
            <h2 style={{ fontSize: "1.2rem", marginBottom: "12px" }}>
              Edit Flag
            </h2>

            <input
              type="text"
              placeholder="Title"
              value={editTitle}
              onChange={(e) => setEditTitle(e.target.value)}
              style={{
                width: "100%",
                padding: "8px",
                marginBottom: "12px",
                borderRadius: "8px",
                border: "1px solid #333",
                backgroundColor: "#111",
                color: "#fff",
              }}
            />

            <textarea
              placeholder="Note"
              value={editNote}
              onChange={(e) => setEditNote(e.target.value)}
              rows={4}
              style={{
                width: "100%",
                padding: "8px",
                borderRadius: "8px",
                border: "1px solid #333",
                backgroundColor: "#111",
                color: "#fff",
                marginBottom: "16px",
              }}
            />

            <div
              style={{ display: "flex", justifyContent: "flex-end", gap: "12px" }}
            >
              <button
                onClick={() => setEditingPoint(null)}
                style={{
                  padding: "8px 14px",
                  backgroundColor: "#444",
                  borderRadius: "8px",
                  color: "white",
                  border: "none",
                }}
              >
                Cancel
              </button>
              <button
                onClick={async () => {
                  if (!caseId || !editingPoint?.id) return;
                  const ref = doc(
                    db,
                    `cases/${caseId}/interpolatedPoints`,
                    editingPoint.id
                  );
                  await updateDoc(ref, { title: editTitle, note: editNote });
                  setEditingPoint(null);
                }}
                style={{
                  padding: "8px 14px",
                  backgroundColor: "#38bdf8",
                  borderRadius: "8px",
                  color: "#000",
                  fontWeight: "bold",
                  border: "none",
                }}
              >
                Save
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
