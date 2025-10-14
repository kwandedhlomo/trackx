// SimulationSidebar.jsx — MERGED (your UI + Jon’s unified events/timeline logic)

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

import NotificationModal from "./NotificationModal";
import useNotificationModal from "../hooks/useNotificationModal";
import { getFriendlyErrorMessage } from "../utils/errorMessages";

/** -------------------- DEBUG + helpers -------------------- **/
const DEBUG = false; // set true to inspect ordering/jumps in console
const SA_TZ = "Africa/Johannesburg";

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

/** Prefer CSV-ish/ingested strings; fall back to timestamp if present */
function extractCsvTime(loc) {
  return (
    loc?.csvDescription ||
    loc?.originalData?.csvDescription ||
    loc?.rawData?.Description ||
    loc?.timestamp ||
    null
  );
}

/** Parse HH:MM:SS → {h,m,s} or null */
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

/** Viewer CZML start day → UTC midnight (ms) */
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

/** Place a {h,m,s} on viewer’s start day (UTC) → ms */
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

/** Seconds since UTC midnight for a given ms timestamp */
function secondsSinceMidnightUTC(ms) {
  if (ms == null) return null;
  const d = new Date(ms);
  return d.getUTCHours() * 3600 + d.getUTCMinutes() * 60 + d.getUTCSeconds();
}

/** Fallback spacing if no time-of-day parse: position by order (5s steps) */
function orderFallbackMs(order, baseDayUtcMs) {
  if (baseDayUtcMs == null) return null;
  const offsetSec = Number.isFinite(order) ? order * 5 : 0;
  return baseDayUtcMs + offsetSec * 1000;
}

const badgeFor = (source) =>
  source === "flag" ? "Flag" : source === "stop" ? "Stopped" : "Note";

/** ----------------------------------------------------------- **/

export default function SimulationSidebar({ viewerRef, disabled = false }) {
  // UI
  const [collapsed, setCollapsed] = useState(false);
  const [activeIndex, setActiveIndex] = useState(null);
  const [flashingIndex, setFlashingIndex] = useState(null);
  const [expanded, setExpanded] = useState({}); // key: `${source}:${id}` → bool
  const toggleExpand = (key, e) => {
    e.stopPropagation();
    setExpanded((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  // data
  const [caseId, setCaseId] = useState(null);
  const [flaggedPoints, setFlaggedPoints] = useState([]); // Firestore flags (UTC timestamps)
  const [locations, setLocations] = useState([]); // Stops/annotations

  // sim-day anchor
  const [baseDayUtcMs, setBaseDayUtcMs] = useState(null);

  // edit modal state
  const [editingPoint, setEditingPoint] = useState(null);
  const [editTitle, setEditTitle] = useState("");
  const [editNote, setEditNote] = useState("");

  // notifications
  const { modalState, openModal, closeModal } = useNotificationModal();

  /** ---------- bootstrap: caseId ---------- **/
  useEffect(() => {
    try {
      const str = localStorage.getItem("trackxCaseData");
      const parsed = str ? JSON.parse(str) : null;
      if (parsed?.caseId) setCaseId(parsed.caseId);
    } catch {}
  }, []);

  /** ---------- keep baseDay synced to viewer CZML ---------- **/
  useEffect(() => {
    const tick = () => {
      const ms = getViewerStartDayUtcMs(viewerRef);
      setBaseDayUtcMs((prev) => (ms != null && ms !== prev ? ms : prev));
      if (DEBUG && ms != null) {
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
    const id = setInterval(tick, 500);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewerRef]);

  /** ---------- flags: realtime ---------- **/
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
        setFlaggedPoints(pts);
      },
      (err) => console.error("flags listener error:", err)
    );
    return () => unsub();
  }, [caseId]);

  /** ---------- stops/locations: one-time load ---------- **/
  useEffect(() => {
    if (!caseId) return;
    (async () => {
      try {
        const ref = collection(db, `cases/${caseId}/locations`);
        const snap = await getDocs(query(ref, orderBy("order", "asc")));
        const locs = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
        setLocations(locs);
      } catch (e) {
        console.error("fetch locations failed:", e);
      }
    })();
  }, [caseId]);

  /** ---------- normalize to a single, day-agnostic timeline ---------- **/

  // Flags: have true UTC; derive a day-anchored sortKey so they interleave with stops
  const flagItems = useMemo(() => {
    return flaggedPoints.map((p) => {
      const utcMs =
        p.timestamp?.toMillis?.() ??
        (p.timestamp?.seconds ? p.timestamp.seconds * 1000 : null);

      const todSec = secondsSinceMidnightUTC(utcMs);
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
        timestampMs: utcMs, // display/jump uses true UTC
        sortKeyMs, // used only for ordering
        raw: p,
        debug: { chosenVia: "flag-utc", todSec },
      };
    });
  }, [flaggedPoints, baseDayUtcMs]);

  // Stops: parse CSV HH:MM:SS → place on current viewer day (UTC)
  const stopItems = useMemo(() => {
    return locations.map((loc) => {
      const csvStr = extractCsvTime(loc);
      const tod = parseTOD(csvStr);

      const chosenMs =
        tod && baseDayUtcMs != null
          ? baseDayUtcMs + (tod.h * 3600 + tod.m * 60 + tod.s) * 1000
          : orderFallbackMs(loc.order, baseDayUtcMs);

      const sortKeyMs = chosenMs;
      const chosenVia = tod ? "csv-tod+simday-utc" : "order-fallback";

      if (DEBUG) {
        console.debug("[STOP MAP - DAY AGNOSTIC]", {
          id: loc.locationId || loc.id,
          title: loc.title,
          csvRaw: csvStr,
          baseDayUTC: fmtMs(baseDayUtcMs, "UTC"),
          chosenUTC: fmtMs(chosenMs, "UTC"),
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
        timestampMs: chosenMs, // (UTC on viewer day)
        sortKeyMs,
        order: loc.order ?? 0,
        raw: loc,
        debug: { chosenVia, tod },
      };
    });
  }, [locations, baseDayUtcMs]);

  // Merge + order (stops first on ties; then order; then id)
  const items = useMemo(() => {
    const merged = [...stopItems, ...flagItems];
    merged.sort((a, b) => {
      const at = a.sortKeyMs ?? Number.POSITIVE_INFINITY;
      const bt = b.sortKeyMs ?? Number.POSITIVE_INFINITY;
      if (at !== bt) return at - bt;
      if (a.source !== b.source) return a.source === "stop" ? -1 : 1;
      const ao = a.order ?? 0,
        bo = b.order ?? 0;
      if (ao !== bo) return ao - bo;
      return String(a.id).localeCompare(String(b.id));
    });
    try {
      localStorage.setItem("flaggedSidebarFlash", JSON.stringify(merged));
    } catch {}
    return merged;
  }, [stopItems, flagItems]);

  /** ---------- flash support (external) ---------- **/
  useEffect(() => {
    const listener = (e) => {
      const idx = e.detail;
      setFlashingIndex(idx);
      setTimeout(() => setFlashingIndex(null), 1000);
    };
    window.addEventListener("flashSidebarItem", listener);
    return () => window.removeEventListener("flashSidebarItem", listener);
  }, []);

  /** ---------- jump (recompute stop times on current sim day) ---------- **/
  function logJumpRequest(it, idx, viewer) {
    if (!DEBUG) return;
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

    logJumpRequest(it, idx, viewer);

    // For stops, recompute from TOD on the current viewer day (day-agnostic)
    let targetMs = timestampMs;
    if (it.source === "stop" && it.debug?.tod) {
      const recomputed = todOnViewerStartUTC(viewerRef, it.debug.tod);
      if (recomputed != null) targetMs = recomputed;
    }

    const target = Cesium.JulianDate.fromDate(new Date(targetMs));
    const start = viewer.clock.startTime;
    const stop = viewer.clock.stopTime;

    if (Cesium.JulianDate.lessThan(target, start)) {
      viewer.clock.currentTime = Cesium.JulianDate.clone(start);
    } else if (Cesium.JulianDate.greaterThan(target, stop)) {
      viewer.clock.currentTime = Cesium.JulianDate.clone(stop);
    } else {
      viewer.clock.currentTime = target;
    }
    viewer.clock.shouldAnimate = false;
  };

  /** ---------- delete (with your NotificationModal) ---------- **/
  const deleteFlaggedPoint = async (point) => {
    closeModal();
    if (!caseId || !point?.id) {
      openModal({
        variant: "error",
        title: "Delete failed",
        description:
          "We couldn't identify which point to delete. Please try again.",
      });
      return;
    }
    try {
      const pointRef = doc(db, `cases/${caseId}/interpolatedPoints`, point.id);
      await deleteDoc(pointRef);
      openModal({
        variant: "success",
        title: "Flag removed",
        description: "The flagged point has been deleted.",
      });
    } catch (err) {
      console.error("Error deleting point:", err);
      openModal({
        variant: "error",
        title: "Delete failed",
        description: getFriendlyErrorMessage(
          err,
          "We couldn't delete the flagged point. Please try again."
        ),
      });
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

  const confirmDelete = (point) => {
    openModal({
      variant: "warning",
      title: "Delete flagged point?",
      description:
        "Are you sure you want to remove this flagged point? This action cannot be undone.",
      primaryAction: {
        label: "Delete point",
        closeOnClick: false,
        onClick: () => deleteFlaggedPoint(point),
      },
      secondaryAction: { label: "Cancel" },
    });
  };

  /** -------------------- UI -------------------- **/
  return (
    <>
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
                  items.map((it, idx) => {
                    const key = `${it.source}:${it.id}`;
                    const isActive = activeIndex === idx;
                    const isFlashing = flashingIndex === idx;
                    const noteText = it.note || "(no note)";
                    const isExpanded = !!expanded[key];
                    const tooLong = noteText.length > 180;

                    return (
                      <div
                        key={`${it.source}-${it.id}-${idx}`}
                        onClick={() => {
                          if (disabled) return;
                          if (it.timestampMs) {
                            jumpTo(it.timestampMs, idx, it);
                            setActiveIndex(idx);
                            setFlashingIndex(idx);
                            setTimeout(() => setFlashingIndex(null), 1000);
                          }
                        }}
                        style={{
                          backgroundColor: isFlashing
                            ? "#67e8f9"
                            : isActive
                            ? "#ffffff"
                            : "#111827",
                          color: isActive ? "#000" : "#f1f5f9",
                          padding: "10px 14px",
                          borderRadius: "10px",
                          fontSize: "0.95rem",
                          fontWeight: "500",
                          transition: "background-color 0.3s ease",
                          boxShadow: isFlashing
                            ? "0 0 12px rgba(103, 232, 249, 0.8)"
                            : isActive
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

                          {/* Note: collapsible */}
                          <div style={{ marginTop: "2px" }}>
                            <p
                              style={
                                isExpanded
                                  ? {
                                      fontSize: "0.85rem",
                                      marginTop: "2px",
                                      color: "#cbd5e1",
                                      wordWrap: "break-word",
                                      whiteSpace: "normal",
                                      maxWidth: "220px",
                                    }
                                  : {
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
                                    }
                              }
                            >
                              {noteText}
                            </p>

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

                          {/* Time (UTC to mirror Cesium clock) */}
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

                          {/* Edit/Delete for flags only */}
                          <div
                            style={{
                              marginTop: "6px",
                              display: "flex",
                              gap: "12px",
                            }}
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
                                    confirmDelete(it);
                                  }}
                                />
                              </>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          </>
        )}

        {/* Edit modal */}
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
                    try {
                      if (!caseId || !editingPoint?.id) return;
                      const ref = doc(
                        db,
                        `cases/${caseId}/interpolatedPoints`,
                        editingPoint.id
                      );
                      await updateDoc(ref, { title: editTitle, note: editNote });
                      setEditingPoint(null);
                      openModal({
                        variant: "success",
                        title: "Flag updated",
                        description: "Your changes were saved.",
                      });
                    } catch (err) {
                      console.error("Edit flag failed:", err);
                      openModal({
                        variant: "error",
                        title: "Save failed",
                        description: getFriendlyErrorMessage(
                          err,
                          "We couldn't save your changes. Please try again."
                        ),
                      });
                    }
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

      {/* Global notifications / confirms */}
      <NotificationModal
        isOpen={modalState.isOpen}
        title={modalState.title}
        description={modalState.description}
        variant={modalState.variant}
        onClose={closeModal}
        primaryAction={modalState.primaryAction}
        secondaryAction={modalState.secondaryAction}
      />
    </>
  );
}
