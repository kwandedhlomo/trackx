import { useEffect, useState } from "react";
import { db } from "../firebase";
import { collection, query, where, onSnapshot, doc, updateDoc, deleteDoc } from "firebase/firestore";
import * as Cesium from "cesium";
import { Pencil, Trash2 } from "lucide-react";
import "../css/Sidebar.css";
import NotificationModal from "./NotificationModal";
import useNotificationModal from "../hooks/useNotificationModal";
import { getFriendlyErrorMessage } from "../utils/errorMessages";

export default function SimulationSidebar({ viewerRef, disabled = false }) {
  const [collapsed, setCollapsed] = useState(false);
  const [activeIndex, setActiveIndex] = useState(null);
  const [flaggedPoints, setFlaggedPoints] = useState([]);
  const [caseId, setCaseId] = useState(null);
  const [editingPoint, setEditingPoint] = useState(null);
  const [editTitle, setEditTitle] = useState("");
  const [editNote, setEditNote] = useState("");
  const [flashingIndex, setFlashingIndex] = useState(null);
  const { modalState, openModal, closeModal } = useNotificationModal();

  useEffect(() => {
    const caseDataString = localStorage.getItem("trackxCaseData");
    const caseData = caseDataString ? JSON.parse(caseDataString) : null;
    if (caseData?.caseId) setCaseId(caseData.caseId);
  }, []);

  useEffect(() => {
    if (!caseId) return;

    const ref = collection(db, `cases/${caseId}/interpolatedPoints`);
    const q = query(ref, where("isFlagged", "==", true));

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const points = snapshot.docs.map((doc) => ({
          id: doc.id,
          ...doc.data(),
        }));

        points.sort((a, b) => {
          const aTime = a.timestamp?.toDate?.() || new Date(0);
          const bTime = b.timestamp?.toDate?.() || new Date(0);
          return aTime - bTime;
        });

        localStorage.setItem("flaggedSidebarFlash", JSON.stringify(points));
        setFlaggedPoints(points);
      },
      (error) => console.error("Real-time listener failed:", error)
    );

    return () => unsubscribe();
  }, [caseId]);

  useEffect(() => {
    const listener = (e) => {
      const idx = e.detail;
      setFlashingIndex(idx);
      setTimeout(() => setFlashingIndex(null), 1000);
    };
    window.addEventListener("flashSidebarItem", listener);
    return () => window.removeEventListener("flashSidebarItem", listener);
  }, []);

  const deleteFlaggedPoint = async (point) => {
    closeModal();
    if (!caseId || !point?.id) {
      openModal({
        variant: "error",
        title: "Delete failed",
        description: "We couldn't identify which point to delete. Please try again.",
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
        description: getFriendlyErrorMessage(err, "We couldn't delete the flagged point. Please try again."),
      });
    }
  };

  const handleDelete = (point) => {
    openModal({
      variant: "warning",
      title: "Delete flagged point?",
      description: "Are you sure you want to remove this flagged point? This action cannot be undone.",
      primaryAction: {
        label: "Delete point",
        closeOnClick: false,
        onClick: () => deleteFlaggedPoint(point),
      },
      secondaryAction: {
        label: "Cancel",
      },
    });
  };

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
        boxShadow: "0 0 24px rgba(0, 0, 0, 0.6), 0 0 12px rgba(100, 100, 100, 0.3)",
        zIndex: 999,
        transition: "all 0.4s ease",
        overflow: "hidden",
      }}
      >
      {/* Collapse Button */}
      <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: collapsed ? "0" : "16px" }}>
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
          <h2 style={{ fontSize: "1.2rem", fontWeight: "bold", marginBottom: "12px" }}>
            Flagged Points
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

            {/* Scrollable Point Items */}
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
                pointerEvents: disabled ? "none" : "auto",  // ← block clicks while preparing
                opacity: disabled ? 0.5 : 1,               // ← grey it out
                filter: disabled ? "grayscale(60%)" : "none",
              }}
            >
              {flaggedPoints.length === 0 ? (
                <p style={{ color: "#94a3b8", fontSize: "0.85rem" }}>
                  No flagged points yet.
                </p>
              ) : (
                flaggedPoints.map((point, idx) => (
                  <div
                    key={point.id}
                    onClick={() => {
                      if (disabled) return; // ← belt & braces guard
                      if (!viewerRef?.current?.cesiumElement || !point.timestamp) return;

                      const viewer = viewerRef.current.cesiumElement;
                      const cesiumTime = Cesium.JulianDate.fromDate(
                        new Date(point.timestamp.seconds * 1000)
                      );
                      viewer.clock.currentTime = cesiumTime;
                      viewer.clock.shouldAnimate = false;
                      setActiveIndex(idx);
                      setFlashingIndex(idx);
                      setTimeout(() => setFlashingIndex(null), 1000);
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
                      cursor: disabled ? "default" : "pointer",
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
                        backgroundColor: activeIndex === idx ? "#ffffff" : "#38bdf8",
                        border: "2px solid #1e1e1e",
                      }}
                    />

                    <div>
                      <p
                        style={{
                          fontWeight: "600",
                          fontSize: "0.95rem",
                          color: "#38bdf8",
                          wordWrap: "break-word",
                          whiteSpace: "normal",
                          maxWidth: "220px",
                        }}
                      >
                        {point.title || "Untitled"}
                      </p>
                      <p
                        style={{
                          fontSize: "0.85rem",
                          marginTop: "2px",
                          color: "#cbd5e1",
                          wordWrap: "break-word",
                          whiteSpace: "normal",
                          maxWidth: "220px",
                        }}
                      >
                        {point.note || "(no note)"}
                      </p>
                      {point.timestamp && (
                        <p style={{ fontSize: "0.75rem", color: "#94a3b8", marginTop: "4px" }}>
                          {new Date(point.timestamp.seconds * 1000).toLocaleTimeString("en-GB", {
                            hour: "2-digit",
                            minute: "2-digit",
                            second: "2-digit",
                            timeZone: "UTC",
                          })}
                        </p>
                      )}
                      <div style={{ marginTop: "6px", display: "flex", gap: "12px" }}>
                        <Pencil
                          size={16}
                          color="#9ca3af"
                          style={{ cursor: "pointer" }}
                          onClick={(e) => {
                            e.stopPropagation();
                            setEditingPoint(point);
                            setEditTitle(point.title || "");
                            setEditNote(point.note || "");
                          }}
                        />
                        <Trash2
                          size={16}
                          color="#9ca3af"
                          style={{ cursor: "pointer" }}
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDelete(point);
                          }}
                        />
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
            <h2 style={{ fontSize: "1.2rem", marginBottom: "12px" }}>Edit Flag</h2>

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

            <div style={{ display: "flex", justifyContent: "flex-end", gap: "12px" }}>
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
                  const ref = doc(db, `cases/${caseId}/interpolatedPoints`, editingPoint.id);
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
