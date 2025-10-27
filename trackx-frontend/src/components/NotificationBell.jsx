import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useNavigate } from "react-router-dom";
import { Bell, CheckCircle2, Loader2, MessageCircle, X } from "lucide-react";
import { auth } from "../firebase";
import axiosInstance from "../api/axios";

const PANEL_LIMIT = 10;
const PANEL_WIDTH = 320;
const PANEL_GAP = 12;

const typeIconMap = {
  COMMENT: MessageCircle,
};

function NotificationBell({ className = "", limit = PANEL_LIMIT }) {
  const navigate = useNavigate();
  const [isOpen, setIsOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [notifications, setNotifications] = useState([]);
  const [currentPage, setCurrentPage] = useState(1);
  const [total, setTotal] = useState(0);
  const buttonRef = useRef(null);
  const panelRef = useRef(null);
  const [panelPosition, setPanelPosition] = useState(null);

  const unreadCount = useMemo(
    () => notifications.filter((item) => !item.read).length,
    [notifications]
  );

  const fetchNotifications = useCallback(
    async (page = 1) => {
      const uid = auth.currentUser?.uid;
      if (!uid) {
        return;
      }
      try {
        setIsLoading(true);
        const response = await axiosInstance.get(`/notifications/${uid}`, {
          params: { page, limit, type: "COMMENT" },
        });
        const fetched = (response.data.notifications || []).filter(
          (item) => item.type === "COMMENT"
        );
        setNotifications(fetched);
        setTotal(response.data.total || fetched.length);
        setCurrentPage(page);
      } catch (error) {
        console.error("Failed to fetch notifications:", error);
      } finally {
        setIsLoading(false);
      }
    },
    [limit]
  );

  useEffect(() => {
    fetchNotifications(1);
  }, [fetchNotifications]);

  const updatePanelPosition = useCallback(() => {
    if (!buttonRef.current) {
      return;
    }
    const rect = buttonRef.current.getBoundingClientRect();
    const desiredLeft = rect.right - PANEL_WIDTH;
    const left = Math.max(desiredLeft, 16);
    const top = rect.bottom + PANEL_GAP;
    setPanelPosition({ left, top });
  }, []);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (
        panelRef.current &&
        !panelRef.current.contains(event.target) &&
        buttonRef.current &&
        !buttonRef.current.contains(event.target)
      ) {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      updatePanelPosition();
      document.addEventListener("mousedown", handleClickOutside);
    }

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [isOpen, updatePanelPosition]);

  useEffect(() => {
    if (!isOpen) {
      return;
    }
    const handleViewportChange = () => updatePanelPosition();
    window.addEventListener("resize", handleViewportChange);
    window.addEventListener("scroll", handleViewportChange, true);
    return () => {
      window.removeEventListener("resize", handleViewportChange);
      window.removeEventListener("scroll", handleViewportChange, true);
    };
  }, [isOpen, updatePanelPosition]);

  const togglePanel = () => {
    setIsOpen((prev) => {
      const next = !prev;
      if (!prev) {
        requestAnimationFrame(() => updatePanelPosition());
      }
      return next;
    });
  };

  const toggleReadStatus = async (notification) => {
    const uid = auth.currentUser?.uid;
    if (!uid) {
      return;
    }
    const updated = !notification.read;
    try {
      await axiosInstance.patch(
        `/notifications/${uid}/${notification.id}`,
        { read: updated },
        { headers: { "Content-Type": "application/json" } }
      );
      setNotifications((prev) =>
        prev.map((item) =>
          item.id === notification.id ? { ...item, read: updated } : item
        )
      );
    } catch (error) {
      console.error("Failed to update notification:", error);
    }
  };

  const handleNotificationClick = async (notification) => {
    if (!notification) {
      return;
    }

    if (!notification.read) {
      await toggleReadStatus(notification);
    }

    const metadata = notification.metadata || {};
    if (notification.type === "COMMENT" && metadata.caseId) {
      navigate(`/cases/${metadata.caseId}/collaboration`, {
        state: { caseId: metadata.caseId, highlightCommentId: metadata.commentId },
      });
      setIsOpen(false);
    }
  };

  const markAllAsRead = async () => {
    for (const notification of notifications) {
      if (!notification.read) {
        await toggleReadStatus(notification);
      }
    }
  };

  const handlePageChange = (direction) => {
    const next = currentPage + direction;
    if (next < 1) return;
    if ((next - 1) * limit >= total) return;
    fetchNotifications(next);
  };

  const panelContent = isOpen && panelPosition
    ? createPortal(
        <div
          ref={panelRef}
          className="fixed z-[1200] rounded-2xl border border-white/10 bg-gradient-to-br from-slate-950/95 via-slate-900/92 to-black/92 p-4 shadow-[0_25px_70px_rgba(15,23,42,0.75)] backdrop-blur-2xl"
          style={{
            top: panelPosition.top,
            left: panelPosition.left,
            width: PANEL_WIDTH,
          }}
        >
          <div className="mb-3 flex items-center justify-between">
            <div>
              <p className="text-sm font-semibold text-white">Notifications</p>
              <p className="text-xs text-gray-400">
                {total} total • {unreadCount} unread
              </p>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={markAllAsRead}
                className="rounded-full border border-white/15 px-3 py-1 text-[11px] font-semibold text-gray-300 transition hover:border-white/30 hover:text-white"
              >
                Mark all read
              </button>
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                className="flex h-7 w-7 items-center justify-center rounded-full border border-white/10 text-gray-400 transition hover:border-white/25 hover:text-white"
                aria-label="Close notifications"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>

          <div className="max-h-72 overflow-y-auto pr-1">
            {isLoading ? (
              <div className="flex items-center justify-center py-6 text-sm text-gray-300">
                <Loader2 className="mr-2 h-4 w-4 animate-spin text-blue-400" />
                Loading notifications…
              </div>
            ) : notifications.length === 0 ? (
              <p className="py-6 text-center text-sm text-gray-400">
                You are all caught up.
              </p>
            ) : (
              <ul className="space-y-3">
                {notifications.map((notification) => {
                  const Icon = typeIconMap[notification.type] || CheckCircle2;
                  const timestamp = notification.timestamp
                    ? new Date(notification.timestamp).toLocaleString()
                    : "";
                  return (
                    <li
                      key={notification.id}
                      className={`cursor-pointer rounded-2xl border px-3 py-3 transition ${
                        notification.read
                          ? "border-white/10 bg-white/[0.03]"
                          : "border-blue-500/40 bg-blue-500/10"
                      }`}
                      onClick={() => handleNotificationClick(notification)}
                    >
                      <div className="flex items-start gap-3">
                        <div className="relative flex h-9 w-9 items-center justify-center rounded-full border border-white/10 bg-black/40 text-white">
                          <Icon className="h-4 w-4" />
                        </div>
                        <div className="flex-1">
                          <p className="text-sm font-semibold text-white">
                            {notification.title}
                          </p>
                          <p className="mt-1 text-xs text-gray-300">
                            {notification.message}
                          </p>
                          {timestamp && (
                            <p className="mt-1 text-[11px] text-gray-500">
                              {timestamp}
                            </p>
                          )}
                        </div>
                        <button
                          type="button"
                          onClick={(event) => {
                            event.stopPropagation();
                            toggleReadStatus(notification);
                          }}
                          className="rounded-full border border-white/15 px-3 py-1 text-[11px] font-semibold text-gray-300 transition hover:border-white/30 hover:text-white"
                        >
                          {notification.read ? "Unread" : "Read"}
                        </button>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          {total > limit && (
            <div className="mt-4 flex items-center justify-between text-[11px] text-gray-400">
              <button
                type="button"
                onClick={() => handlePageChange(-1)}
                disabled={currentPage === 1}
                className="rounded-full border border-white/15 px-3 py-1 transition hover:border-white/30 disabled:cursor-not-allowed disabled:opacity-40"
              >
                Previous
              </button>
              <span>
                Page {currentPage} of {Math.max(Math.ceil(total / limit), 1)}
              </span>
              <button
                type="button"
                onClick={() => handlePageChange(1)}
                disabled={currentPage * limit >= total}
                className="rounded-full border border-white/15 px-3 py-1 transition hover:border-white/30 disabled:cursor-not-allowed disabled:opacity-40"
              >
                Next
              </button>
            </div>
          )}
        </div>,
        document.body
      )
    : null;

  return (
    <>
      <div className={`relative inline-flex ${className}`}>
        <button
          type="button"
          onClick={togglePanel}
          aria-label="Toggle notifications"
          className="relative inline-flex h-11 w-11 items-center justify-center rounded-full border border-white/15 bg-white/[0.03] text-white shadow-inner shadow-white/10 transition hover:border-white/30 hover:bg-white/[0.08]"
          ref={buttonRef}
        >
          <Bell className="h-5 w-5" />
          {unreadCount > 0 && (
            <span className="absolute -top-1 -right-1 flex h-5 min-w-[1.25rem] items-center justify-center rounded-full bg-rose-500 px-1 text-[10px] font-semibold text-white shadow-lg shadow-rose-500/40">
              {unreadCount > 9 ? "9+" : unreadCount}
            </span>
          )}
        </button>
      </div>
      {panelContent}
    </>
  );
}

export default NotificationBell;
