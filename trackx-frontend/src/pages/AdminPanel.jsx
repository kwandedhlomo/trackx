import { useEffect, useState, useMemo } from "react";
import axios from "axios";
import { useAuth } from "../context/AuthContext";
import { useNavigate, Link } from "react-router-dom";
import { motion } from "framer-motion";
import adfLogo from "../assets/image-removebg-preview.png";
import trackxLogo from "../assets/trackx-logo-removebg-preview.png";
import { signOut } from "firebase/auth";
import { auth } from "../firebase";
import {
  Home,
  FilePlus2,
  FolderOpen,
  Briefcase,
  LayoutDashboard,
  Users,
  UserPlus,
  X,
  ShieldCheck,
  Search,
  UserCircle,
  Target,
} from "lucide-react";
import NotificationModal from "../components/NotificationModal";
import useNotificationModal from "../hooks/useNotificationModal";
import { getFriendlyErrorMessage } from "../utils/errorMessages";
import AnimatedMap from "../components/AnimatedMap";
import NotificationBell from "../components/NotificationBell";


function AdminPanel() {
  const API_BASE = (import.meta.env.VITE_API_URL || "http://localhost:8000").replace(/\/+$/, "");
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [roleFilter, setRoleFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [totalUsers, setTotalUsers] = useState(0);
  const [showMenu, setShowMenu] = useState(false);

  const pageSize = 10;
  const { profile } = useAuth();
  const navigate = useNavigate();
  const [openMenuUserId, setOpenMenuUserId] = useState(null);
  const { modalState, openModal, closeModal } = useNotificationModal();
  const [cases, setCases] = useState([]);
  const [isFetchingCases, setIsFetchingCases] = useState(false);
  const [caseSearch, setCaseSearch] = useState("");
  const [selectedCaseId, setSelectedCaseId] = useState("");
  const [selectedCaseUsers, setSelectedCaseUsers] = useState([]);
  const [caseUserSearchTerm, setCaseUserSearchTerm] = useState("");
  const [caseUserResults, setCaseUserResults] = useState([]);
  const [isAssigningUsers, setIsAssigningUsers] = useState(false);


  const fetchUsers = async () => {
    setLoading(true);
    try {
      const response = await axios.get(`${API_BASE}/admin/users`, {
        params: {
          role: roleFilter !== "all" ? roleFilter : undefined,
          search: search || undefined,
          page,
        },
      });
      setUsers(response.data.users);
      setTotalUsers(response.data.total || 0);
    } catch (error) {
      console.error("Failed to fetch users:", error);
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchUsers();
  }, [roleFilter, search, page]);

  const fetchCases = async () => {
    setIsFetchingCases(true);
    try {
      const { data } = await axios.get(`${API_BASE}/cases/all`);
      const formatted = (data || []).map((caseItem) => ({
        id: caseItem.id || caseItem.caseId,
        caseNumber: caseItem.caseNumber,
        caseTitle: caseItem.caseTitle,
        userIds: caseItem.userIds || caseItem.userIDs || [],
        ownerId: caseItem.userId || caseItem.userID || null,
      }));
      setCases(formatted);
      if (!selectedCaseId && formatted.length) {
        setSelectedCaseId(formatted[0].id);
        await handleSelectCase(formatted[0].id, formatted);
      } else if (selectedCaseId) {
        await handleSelectCase(selectedCaseId, formatted);
      }
    } catch (error) {
      console.error("Failed to load cases:", error);
      openModal({
        variant: "error",
        title: "Could not load cases",
        description: getFriendlyErrorMessage(error, "We couldn't load the case list. Please try again."),
      });
    } finally {
      setIsFetchingCases(false);
    }
  };

  useEffect(() => {
    fetchCases();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSelectCase = async (caseId, providedCases) => {
    setSelectedCaseId(caseId);
    setCaseUserResults([]);
    if (!caseId) {
      setSelectedCaseUsers([]);
      return;
    }

    const sourceCases = providedCases || cases;
    const targetCase = sourceCases.find((c) => c.id === caseId);
    if (!targetCase) {
      setSelectedCaseUsers([]);
      return;
    }

    const ids = targetCase.userIds && targetCase.userIds.length
      ? targetCase.userIds
      : targetCase.ownerId
      ? [targetCase.ownerId]
      : [];

    if (!ids.length) {
      setSelectedCaseUsers([]);
      return;
    }

    try {
      const { data } = await axios.post(`${API_BASE}/admin/users/lookup`, {
        user_ids: ids,
      });
      const userList = data?.users?.length ? data.users : ids.map((id) => ({ id, name: id, email: "" }));
      setSelectedCaseUsers(userList);
    } catch (error) {
      console.error("Failed to load assigned users:", error);
      setSelectedCaseUsers(ids.map((id) => ({ id, name: id, email: "" })));
      openModal({
        variant: "error",
        title: "Could not load users",
        description: getFriendlyErrorMessage(error, "We couldn't load users assigned to this case."),
      });
    }
  };

  const handleCaseUserSearch = async () => {
    if (!selectedCaseId) {
      openModal({
        variant: "info",
        title: "Select a case",
        description: "Choose a case before searching for investigators to assign.",
      });
      return;
    }

    const term = caseUserSearchTerm.trim();
    if (term.length < 2) {
      openModal({
        variant: "info",
        title: "Keep typing",
        description: "Enter at least two characters to search for investigators.",
      });
      return;
    }

    try {
      const { data } = await axios.get(`${API_BASE}/admin/users`, {
        params: {
          search: term,
          page_size: 10,
        },
      });
      const assignedIds = new Set(selectedCaseUsers.map((user) => user.id));
      setCaseUserResults((data?.users || []).filter((user) => user.id && !assignedIds.has(user.id)));
    } catch (error) {
      console.error("User search failed:", error);
      openModal({
        variant: "error",
        title: "Search failed",
        description: getFriendlyErrorMessage(error, "We couldn't search for users at the moment."),
      });
    }
  };

  const handleAddCaseUser = (user) => {
    if (!user?.id) return;
    setSelectedCaseUsers((prev) => {
      if (prev.some((existing) => existing.id === user.id)) {
        return prev;
      }
      return [...prev, user];
    });
    setCaseUserResults((prev) => prev.filter((result) => result.id !== user.id));
  };

  const handleRemoveCaseUser = (userId) => {
    if (!selectedCaseUsers.some((user) => user.id === userId)) return;
    if (selectedCaseUsers.length === 1) {
      openModal({
        variant: "warning",
        title: "At least one user required",
        description: "Each case must have at least one assigned user.",
      });
      return;
    }
    setSelectedCaseUsers((prev) => prev.filter((user) => user.id !== userId));
  };

  const handleSaveAssignments = async () => {
    if (!selectedCaseId) {
      openModal({
        variant: "warning",
        title: "Select a case",
        description: "Choose a case before updating assignments.",
      });
      return;
    }

    if (!selectedCaseUsers.length) {
      openModal({
        variant: "warning",
        title: "Add at least one user",
        description: "Assign at least one investigator to the case.",
      });
      return;
    }

    setIsAssigningUsers(true);
    try {
      const userIds = selectedCaseUsers.map((user) => user.id);
      await axios.post(`${API_BASE}/admin/cases/${selectedCaseId}/assign-users`, {
        user_ids: userIds,
      });

      setCases((prev) =>
        prev.map((caseItem) =>
          caseItem.id === selectedCaseId
            ? { ...caseItem, userIds: userIds, ownerId: userIds[0] }
            : caseItem
        )
      );

      openModal({
        variant: "success",
        title: "Assignments updated",
        description: "The selected investigators now have access to this case.",
      });
    } catch (error) {
      console.error("Failed to save assignments:", error);
      openModal({
        variant: "error",
        title: "Update failed",
        description: getFriendlyErrorMessage(error, "We couldn't update the case assignments."),
      });
    } finally {
      setIsAssigningUsers(false);
    }
  };

const toggleRole = async (userId, currentRole, skipConfirmation = false) => {
  const newRole = currentRole === "admin" ? "user" : "admin";
  if (!skipConfirmation) {
    openModal({
      variant: "warning",
      title: "Change user role?",
      description: `Are you sure you want to make this user a ${newRole}?`,
      primaryAction: {
        label: `Make ${newRole}`,
        closeOnClick: false,
        onClick: () => {
          closeModal();
          toggleRole(userId, currentRole, true);
        },
      },
      secondaryAction: {
        label: "Cancel",
      },
    });
    return;
  }

  try {
    await axios.post(`${API_BASE}/admin/update-role/${userId}`, {
      new_role: newRole,
    });

    setUsers((prevUsers) =>
      prevUsers.map((user) =>
        user.id === userId ? { ...user, role: newRole } : user
      )
    );

    const updatedUser = users.find((user) => user.id === userId);
    openModal({
      variant: "success",
      title: "Role updated",
      description: `${updatedUser?.name || "The user"} is now a ${newRole}.`,
    });
  } catch (error) {
    console.error("Failed to update role:", error);
    openModal({
      variant: "error",
      title: "Update failed",
      description: getFriendlyErrorMessage(error, "We couldn't update the user role. Please try again."),
    });
  }
};

const handleDeleteUser = async (userId, skipConfirmation = false) => {
  if (!skipConfirmation) {
    const targetUser = users.find((user) => user.id === userId);
    setOpenMenuUserId(null);
    openModal({
      variant: "warning",
      title: "Delete user?",
      description: `Are you sure you want to delete ${targetUser?.name || "this user"}? This action cannot be undone.`,
      primaryAction: {
        label: "Delete user",
        closeOnClick: false,
        onClick: () => {
          closeModal();
          handleDeleteUser(userId, true);
        },
      },
      secondaryAction: {
        label: "Cancel",
      },
    });
    return;
  }

  try {
    const targetUser = users.find((user) => user.id === userId);
    await axios.delete(`${API_BASE}/admin/delete-user/${userId}`);
    setUsers((prevUsers) => prevUsers.filter((user) => user.id !== userId));
    openModal({
      variant: "success",
      title: "User deleted",
      description: `${targetUser?.name || "The user"} has been removed successfully.`,
    });
  } catch (error) {
    console.error("Failed to delete user:", error);
    openModal({
      variant: "error",
      title: "Delete failed",
      description: getFriendlyErrorMessage(error, "We couldn't delete the user. Please try again."),
    });
  }
};


  const handleSignOut = async () => {
    try {
      await signOut(auth);
      navigate("/");
    } catch (error) {
      console.error("Sign-out failed:", error.message);
    }
  };

  const filteredCases = cases.filter((caseItem) => {
    if (!caseSearch.trim()) return true;
    const term = caseSearch.trim().toLowerCase();
    return (
      (caseItem.caseNumber || "").toLowerCase().includes(term) ||
      (caseItem.caseTitle || "").toLowerCase().includes(term)
    );
  });

  const selectedCase = selectedCaseId
    ? cases.find((caseItem) => caseItem.id === selectedCaseId)
    : null;

  const approvedUsers = users.filter((user) => user.isApproved).length;
  const pendingUsers = users.filter(
    (user) => !user.isApproved && user.status !== "rejected"
  ).length;
  const rejectedUsers = users.filter((user) => user.status === "rejected").length;
  const adminCount = useMemo(
    () => users.filter((user) => user.role === "admin").length,
    [users]
  );

  const totalPages = Math.max(1, Math.ceil((totalUsers || 0) / pageSize));
  const rangeStart = users.length ? (page - 1) * pageSize + 1 : 0;
  const rangeEnd = users.length ? rangeStart + users.length - 1 : 0;

  const now = new Date();
  const formattedDate = now.toLocaleDateString(undefined, {
    weekday: "long",
    month: "long",
    day: "numeric",
  });
  const formattedTime = now.toLocaleTimeString(undefined, {
    hour: "2-digit",
    minute: "2-digit",
  });

  return (
    <div className="relative flex flex-col min-h-screen font-sans bg-gradient-to-br from-black via-gray-900 to-gray-800">
      {/* Optionally keep the AnimatedMap overlay if desired */}
      <div className="absolute inset-0 -z-20 pointer-events-none opacity-55">
        <AnimatedMap />
      </div>

      <div className="relative z-10 flex flex-col flex-1">
        <nav className="mx-6 mt-6 flex items-center justify-between rounded-3xl border border-white/10 bg-gradient-to-br from-black/80 via-slate-900/75 to-black/85 px-6 py-4 shadow-xl shadow-[0_25px_65px_rgba(8,11,24,0.6)] backdrop-blur-2xl">
          <div className="flex items-center gap-4">
            <button
              type="button"
              onClick={() => setShowMenu(!showMenu)}
              className="flex h-11 w-11 items-center justify-center rounded-full border border-white/10 bg-white/[0.02] text-xl text-white shadow-inner shadow-white/5 transition hover:bg-white/10"
              aria-label="Toggle navigation"
            >
              &#9776;
            </button>
            <img
              src={adfLogo}
              alt="ADF Logo"
              className="h-10 w-auto drop-shadow-[0_10px_20px_rgba(59,130,246,0.35)]"
            />
          </div>

          <div className="pointer-events-none absolute left-1/2 top-1/2 flex -translate-x-1/2 -translate-y-1/2 items-center gap-2 text-3xl font-extrabold">
            <img
              src={trackxLogo}
              alt="TrackX Logo Left"
              className="h-8 w-auto opacity-90"
            />
            <span className="tracking-[0.2em] text-white/75 drop-shadow-[0_2px_12px_rgba(15,23,42,0.55)]">
              TRACKX
            </span>
            <img
              src={trackxLogo}
              alt="TrackX Logo Right"
              className="h-8 w-auto opacity-90"
            />
          </div>

          <div className="flex items-center gap-6 text-sm text-gray-200">
            <NotificationBell className="hidden lg:block" />
            <Link
              to="/home"
              className="rounded-full bg-white/[0.02] px-3 py-1.5 font-medium text-white transition hover:bg-white/15"
            >
              Home
            </Link>
            <div className="flex flex-col items-end">
              <span className="text-base font-semibold text-white">
                {profile ? profile.firstName : "Loading..."}
              </span>
              <button
                onClick={handleSignOut}
                className="text-xs text-gray-400 transition hover:text-white"
              >
                Sign Out
              </button>
            </div>
            <div className="flex flex-col items-end rounded-2xl border border-white/10 bg-white/[0.04] px-3 py-1.5 text-xs font-medium text-gray-400 shadow-inner shadow-white/5">
              <span>{formattedDate}</span>
              <span className="text-sm text-white">{formattedTime}</span>
            </div>
          </div>
        </nav>

        {showMenu && (
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.25, ease: "easeOut" }}
            className="absolute left-4 top-32 z-30 w-64 space-y-2 rounded-3xl border border-white/10 bg-gradient-to-br from-slate-950/85 via-slate-900/78 to-black/78 p-6 shadow-2xl shadow-[0_30px_60px_rgba(30,58,138,0.45)] backdrop-blur-2xl"
          >
            <div className="flex items-center gap-3 rounded-2xl bg-white/[0.018] px-3 py-2 text-sm font-medium text-white">
              <LayoutDashboard className="h-4 w-4" />
              Admin Panel
            </div>
            <Link
              to="/home"
              className="flex items-center gap-3 rounded-2xl px-3 py-2 text-sm font-medium text-gray-200 transition hover:bg-white/10 hover:text-white"
              onClick={() => setShowMenu(false)}
            >
              <Home className="h-4 w-4" />
              Home
            </Link>
            <Link
              to="/new-case"
              className="flex items-center gap-3 rounded-2xl px-3 py-2 text-sm font-medium text-gray-200 transition hover:bg-white/10 hover:text-white"
              onClick={() => setShowMenu(false)}
            >
              <FilePlus2 className="h-4 w-4" />
              Create New Case
            </Link>
            <Link
              to="/manage-cases"
              className="flex items-center gap-3 rounded-2xl px-3 py-2 text-sm font-medium text-gray-200 transition hover:bg-white/10 hover:text-white"
              onClick={() => setShowMenu(false)}
            >
              <FolderOpen className="h-4 w-4" />
              Manage Cases
            </Link>
            <Link
              to="/my-cases"
              className="flex items-center gap-3 rounded-2xl px-3 py-2 text-sm font-medium text-gray-200 transition hover:bg-white/10 hover:text-white"
              onClick={() => setShowMenu(false)}
            >
              <Briefcase className="h-4 w-4" />
              My Cases
            </Link>
            <Link
              to="/pending-users"
              className="flex items-center gap-3 rounded-2xl px-3 py-2 text-sm font-medium text-gray-200 transition hover:bg-white/10 hover:text-white"
              onClick={() => setShowMenu(false)}
            >
              <Users className="h-4 w-4" />
              Pending Users
            </Link>
          </motion.div>
        )}

        <main className="relative z-10 flex-1 px-6 pb-12 pt-8">
          <header className="mb-8 flex flex-col gap-4 text-white lg:flex-row lg:items-center lg:justify-between">
            <div>
              <h1 className="text-3xl font-semibold tracking-tight drop-shadow-[0_12px_30px_rgba(15,23,42,0.45)]">
                Admin Command Center
              </h1>
              <p className="text-sm text-gray-300">
                Oversee accounts, manage access, and keep investigations on track.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.05] px-4 py-2 text-xs font-semibold uppercase tracking-[0.18em] text-gray-200 shadow-lg shadow-[0_12px_32px_rgba(30,64,175,0.35)]">
                <ShieldCheck className="h-4 w-4 text-blue-400" />
                <span>
                  {profile?.role ? `${String(profile.role).toUpperCase()} ACCESS` : "Admin Access"}
                </span>
              </div>
            </div>
          </header>

          <section className="mb-8 grid gap-5 md:grid-cols-2 xl:grid-cols-4">
            <div className="relative overflow-hidden rounded-2xl border border-white/10 bg-white/[0.03] p-6 shadow-lg shadow-[0_20px_45px_rgba(15,23,42,0.42)] backdrop-blur-xl">
              <div className="pointer-events-none absolute -top-16 right-0 h-32 w-32 rounded-full bg-blue-900/25 blur-3xl" />
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-xs uppercase tracking-[0.3em] text-gray-400">Total Accounts</p>
                  <p className="mt-3 text-3xl font-semibold text-white">{totalUsers || users.length || 0}</p>
                  <p className="text-xs text-gray-400">All registered users</p>
                </div>
                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-white/10 text-white">
                  <Users className="h-5 w-5" />
                </div>
              </div>
            </div>

            <div className="relative overflow-hidden rounded-2xl border border-white/10 bg-white/[0.03] p-6 shadow-lg shadow-[0_20px_45px_rgba(15,23,42,0.42)] backdrop-blur-xl">
              <div className="pointer-events-none absolute -bottom-16 left-0 h-32 w-32 rounded-full bg-indigo-900/25 blur-3xl" />
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-xs uppercase tracking-[0.3em] text-gray-400">Admin Seats</p>
                  <p className="mt-3 text-3xl font-semibold text-white">{adminCount}</p>
                  <p className="text-xs text-gray-400">Admins in current view</p>
                </div>
                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-white/10 text-white">
                  <ShieldCheck className="h-5 w-5 text-blue-300" />
                </div>
              </div>
            </div>

            <div className="relative overflow-hidden rounded-2xl border border-white/10 bg-white/[0.03] p-6 shadow-lg shadow-[0_20px_45px_rgba(15,23,42,0.42)] backdrop-blur-xl">
              <div className="pointer-events-none absolute -top-12 left-6 h-28 w-28 rounded-full bg-emerald-900/20 blur-3xl" />
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-xs uppercase tracking-[0.3em] text-gray-400">Approved Users</p>
                  <p className="mt-3 text-3xl font-semibold text-white">{approvedUsers}</p>
                  <p className="text-xs text-gray-400">Visible in this page</p>
                </div>
                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-white/10 text-white">
                  <UserCircle className="h-5 w-5 text-emerald-300" />
                </div>
              </div>
            </div>

            <div className="relative overflow-hidden rounded-2xl border border-white/10 bg-white/[0.03] p-6 shadow-lg shadow-[0_20px_45px_rgba(15,23,42,0.42)] backdrop-blur-xl">
              <div className="pointer-events-none absolute -bottom-14 right-4 h-28 w-28 rounded-full bg-amber-900/25 blur-3xl" />
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-xs uppercase tracking-[0.3em] text-gray-400">Review Queue</p>
                  <p className="mt-3 text-3xl font-semibold text-white">{pendingUsers}</p>
                  <p className="text-xs text-amber-200">Pending (this page)</p>
                  <p className="text-xs text-rose-300">Rejected: {rejectedUsers}</p>
                </div>
                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-white/10 text-white">
                  <Target className="h-5 w-5 text-amber-300" />
                </div>
              </div>
            </div>
          </section>

          <section className="grid gap-8 xl:grid-cols-[1.85fr,1.15fr]">
            <div className="relative overflow-hidden rounded-3xl border border-white/10 bg-white/[0.03] p-6 shadow-lg shadow-[0_22px_45px_rgba(8,11,24,0.55)] backdrop-blur-2xl">
              <div className="pointer-events-none absolute -top-28 right-10 h-44 w-44 rounded-full bg-blue-950/20 blur-3xl" />
              <div className="pointer-events-none absolute -bottom-20 left-12 h-40 w-40 rounded-full bg-slate-900/25 blur-3xl" />
              <div className="flex flex-col gap-6">
                <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                  <div className="flex items-center gap-3">
                    <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.04] text-white shadow-inner shadow-white/5">
                      <Users className="h-5 w-5 text-blue-300" />
                    </div>
                    <div>
                      <h2 className="text-lg font-semibold text-white">User Directory</h2>
                      <p className="text-sm text-gray-300">Manage visibility, roles, and enrolment.</p>
                    </div>
                  </div>
                  <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.05] px-3 py-1.5 text-xs text-gray-300 shadow-inner shadow-white/5">
                    Showing
                    <span className="font-semibold text-white">{users.length ? `${rangeStart}-${rangeEnd}` : "0"}</span>
                    of
                    <span className="font-semibold text-white">{totalUsers || "-"}</span>
                  </div>
                </div>

                <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:gap-6">
                  <label className="relative w-full lg:max-w-sm">
                    <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">
                      <Search className="h-4 w-4" />
                    </span>
                    <input
                      type="text"
                      placeholder="Search by name or email"
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                      className="w-full rounded-full border border-white/10 bg-white/[0.05] px-9 py-2.5 text-sm text-white placeholder-gray-500 shadow-inner shadow-white/5 focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-500/40"
                    />
                    {search && (
                      <button
                        type="button"
                        onClick={() => setSearch("")}
                        className="absolute right-3 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-full bg-white/10 text-white transition hover:bg-white/20"
                        aria-label="Clear search"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    )}
                  </label>

                  <select
                    value={roleFilter}
                    onChange={(e) => setRoleFilter(e.target.value)}
                    className="w-full rounded-2xl border border-white/10 bg-white/[0.05] px-4 py-2.5 text-sm text-white shadow-inner shadow-white/5 focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-500/40 lg:w-40 [&>option]:text-black"
                  >
                    <option value="all">All Roles</option>
                    <option value="admin">Admins</option>
                    <option value="user">Users</option>
                  </select>
                </div>

                {loading ? (
                  <p className="py-10 text-center text-sm text-gray-300">Loading users...</p>
                ) : users.length === 0 ? (
                  <p className="py-10 text-center text-sm text-gray-300">No users matched your filters.</p>
                ) : (
                  <div className="overflow-hidden rounded-2xl border border-white/10 bg-white/[0.02]">
                    <table className="min-w-full border-collapse text-left text-sm text-gray-200">
                      <thead className="bg-white/[0.04] text-xs uppercase tracking-[0.2em] text-gray-400">
                        <tr>
                          <th className="px-4 py-3 font-medium">User</th>
                          <th className="px-4 py-3 font-medium">Email</th>
                          <th className="px-4 py-3 font-medium">Role</th>
                          <th className="px-4 py-3 font-medium text-right">Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {users.map((user) => (
                          <tr
                            key={user.id}
                            className="border-b border-white/5 bg-transparent transition hover:bg-white/5"
                          >
                            <td className="px-4 py-4 text-white">
                              <div className="flex flex-col gap-1">
                                <span className="font-semibold text-white">{user.name || "Unnamed"}</span>
                                <span className="text-xs text-gray-400">ID: {user.id}</span>
                              </div>
                            </td>
                            <td className="px-4 py-4 text-gray-300">{user.email || "No email"}</td>
                            <td className="px-4 py-4">
                              <span
                                className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-wide ${
                                  user.role === "admin"
                                    ? "bg-blue-600/80 text-white shadow-[0_8px_20px_rgba(30,64,175,0.45)]"
                                    : "bg-slate-700/80 text-white/90"
                                }`}
                              >
                                {user.role}
                              </span>
                            </td>
                            <td className="px-4 py-4">
                              <div className="flex items-center justify-end gap-3">
                                <button
                                  onClick={() => toggleRole(user.id, user.role)}
                                  className={`inline-flex items-center gap-2 rounded-full border border-white/10 px-4 py-2 text-xs font-medium text-white shadow-lg transition ${
                                    user.role === "admin"
                                      ? "bg-rose-600/80 hover:bg-rose-500/80"
                                      : "bg-blue-600/80 hover:bg-blue-500/80"
                                  }`}
                                >
                                  {user.role === "admin" ? "Revoke Admin" : "Make Admin"}
                                </button>

                                <div className="relative">
                                  <button
                                    className="flex h-9 w-9 items-center justify-center rounded-full border border-white/10 bg-white/[0.05] text-lg text-white/80 transition hover:bg-white/15 hover:text-white"
                                    onClick={() =>
                                      setOpenMenuUserId((prev) => (prev === user.id ? null : user.id))
                                    }
                                    aria-label="More actions"
                                  >
                                    ⋮
                                  </button>

                                  {openMenuUserId === user.id && (
                                    <motion.div
                                      initial={{ opacity: 0, y: 6 }}
                                      animate={{ opacity: 1, y: 0 }}
                                      transition={{ duration: 0.18, ease: "easeOut" }}
                                      className="absolute right-0 top-11 w-44 rounded-2xl border border-white/10 bg-slate-950/95 p-2 shadow-xl shadow-[0_20px_45px_rgba(8,11,24,0.55)] backdrop-blur-xl"
                                    >
                                      <button
                                        onClick={() => handleDeleteUser(user.id)}
                                        className="flex w-full items-center justify-between rounded-xl px-3 py-2 text-sm text-rose-300 transition hover:bg-white/10 hover:text-rose-200"
                                      >
                                        Delete User
                                        <span className="text-lg leading-none">x</span>
                                      </button>
                                    </motion.div>
                                  )}
                                </div>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}

                <div className="flex flex-col gap-3 pt-4 text-xs text-gray-300 sm:flex-row sm:items-center sm:justify-between">
                  <span>
                    Showing
                    <span className="px-1 font-semibold text-white">{users.length ? `${rangeStart}-${rangeEnd}` : "0"}</span>
                    of
                    <span className="px-1 font-semibold text-white">{totalUsers || "-"}</span>
                    results
                  </span>
                  <div className="flex items-center gap-3">
                    <button
                      onClick={() => setPage((prev) => Math.max(prev - 1, 1))}
                      disabled={page === 1}
                      className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] px-4 py-2 text-sm text-gray-200 transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      Prev
                    </button>
                    <span className="rounded-full border border-white/10 bg-white/[0.06] px-4 py-2 text-sm font-medium text-white">
                      Page {page} of {totalPages}
                    </span>
                    <button
                      onClick={() => setPage((prev) => prev + 1)}
                      disabled={users.length < pageSize}
                      className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] px-4 py-2 text-sm text-gray-200 transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      Next
                    </button>
                  </div>
                </div>
              </div>
            </div>

            <div className="relative overflow-hidden rounded-3xl border border-white/10 bg-white/[0.03] p-6 shadow-lg shadow-[0_22px_45px_rgba(8,11,24,0.55)] backdrop-blur-2xl">
              <div className="pointer-events-none absolute -top-24 left-8 h-40 w-40 rounded-full bg-emerald-900/22 blur-3xl" />
              <div className="pointer-events-none absolute -bottom-20 right-6 h-44 w-44 rounded-full bg-blue-900/18 blur-3xl" />
              <div className="flex items-start gap-3">
                <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.04] text-white shadow-inner shadow-white/5">
                  <Target className="h-5 w-5 text-emerald-300" />
                </div>
                <div>
                  <h2 className="text-lg font-semibold text-white">Case Access Management</h2>
                  <p className="text-sm text-gray-300">Assign or remove investigators on active cases.</p>
                </div>
              </div>

              <div className="mt-6 space-y-6">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <label className="relative w-full sm:max-w-xs">
                    <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">
                      <Search className="h-4 w-4" />
                    </span>
                    <input
                      type="text"
                      value={caseSearch}
                      onChange={(e) => setCaseSearch(e.target.value)}
                      placeholder="Search cases"
                      className="w-full rounded-full border border-white/10 bg-white/[0.05] px-9 py-2.5 text-sm text-white placeholder-gray-500 shadow-inner shadow-white/5 focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-500/40"
                    />
                  </label>
                  <button
                    type="button"
                    onClick={fetchCases}
                    className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-blue-600/80 px-4 py-2 text-sm font-medium text-white shadow-lg shadow-[0_18px_35px_rgba(37,99,235,0.35)] transition hover:bg-blue-500/80"
                  >
                    Refresh
                  </button>
                </div>

                <div className="grid gap-3 sm:grid-cols-[1fr,minmax(0,0.9fr)]">
                  <select
                    value={selectedCaseId}
                    onChange={(e) => handleSelectCase(e.target.value)}
                    className="w-full rounded-2xl border border-white/10 bg-white/[0.05] px-4 py-3 text-sm text-white shadow-inner shadow-white/5 focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-500/40 [&>option]:text-black"
                  >
                    <option value="">Select a case</option>
                    {filteredCases.map((caseItem) => (
                      <option key={caseItem.id} value={caseItem.id}>
                        {`${caseItem.caseNumber || caseItem.id} - ${caseItem.caseTitle || "Untitled"}`}
                      </option>
                    ))}
                  </select>

                  {selectedCase && (
                    <div className="rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3 text-xs text-gray-300 shadow-inner shadow-white/5">
                      <p className="font-medium text-white/80">
                        Case number:
                        <span className="ml-1 text-gray-300">{selectedCase.caseNumber || "N/A"}</span>
                      </p>
                      <p className="mt-1 text-white/80">
                        Title:
                        <span className="ml-1 text-gray-300">{selectedCase.caseTitle || "Untitled"}</span>
                      </p>
                    </div>
                  )}
                </div>

                {isFetchingCases ? (
                  <p className="text-sm text-gray-300">Loading cases...</p>
                ) : selectedCaseId && !selectedCase ? (
                  <p className="text-sm text-gray-300">Case not found.</p>
                ) : selectedCaseId ? (
                  <div className="space-y-5">
                    <div>
                      <h3 className="mb-2 text-sm font-semibold text-white">Assigned Investigators</h3>
                      <div className="flex flex-wrap gap-2">
                        {selectedCaseUsers.map((user) => (
                          <span
                            key={user.id}
                            className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.08] px-3 py-1 text-xs text-white shadow-sm shadow-[0_8px_20px_rgba(15,23,42,0.25)]"
                          >
                            <span className="font-medium">{user.name || user.email || user.id}</span>
                            <button
                              type="button"
                              onClick={() => handleRemoveCaseUser(user.id)}
                              className="flex h-5 w-5 items-center justify-center rounded-full bg-white/10 text-white transition hover:bg-white/20"
                              aria-label="Remove user"
                            >
                              <X className="h-3 w-3" />
                            </button>
                          </span>
                        ))}
                        {selectedCaseUsers.length === 0 && (
                          <span className="text-xs text-gray-400">No users assigned.</span>
                        )}
                      </div>
                    </div>

                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                      <label className="relative flex-1">
                        <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">
                          <Search className="h-4 w-4" />
                        </span>
                        <input
                          type="text"
                          value={caseUserSearchTerm}
                          onChange={(e) => setCaseUserSearchTerm(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") {
                              e.preventDefault();
                              handleCaseUserSearch();
                            }
                          }}
                          placeholder="Search users to add"
                          className="w-full rounded-full border border-white/10 bg-white/[0.05] px-9 py-2.5 text-sm text-white placeholder-gray-500 shadow-inner shadow-white/5 focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-500/40"
                        />
                      </label>
                      <button
                        type="button"
                        onClick={handleCaseUserSearch}
                        className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-emerald-600/80 px-4 py-2 text-sm font-medium text-white shadow-lg shadow-[0_18px_35px_rgba(16,185,129,0.35)] transition hover:bg-emerald-500/80"
                      >
                        <UserPlus className="h-4 w-4" />
                        Search
                      </button>
                    </div>

                    <div className="space-y-2">
                      {caseUserResults.length > 0 ? (
                        caseUserResults.map((user) => (
                          <div
                            key={user.id}
                            className="flex items-center justify-between rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3 text-xs text-white shadow-inner shadow-white/5"
                          >
                            <div>
                              <p className="font-medium">{user.name || user.email || user.id}</p>
                              {user.email && <p className="text-gray-400">{user.email}</p>}
                            </div>
                            <button
                              type="button"
                              onClick={() => handleAddCaseUser(user)}
                              className="inline-flex items-center gap-1 rounded-full border border-white/10 bg-emerald-600/80 px-3 py-1 text-xs font-medium text-white transition hover:bg-emerald-500/80"
                            >
                              <UserPlus className="h-3 w-3" />
                              Add
                            </button>
                          </div>
                        ))
                      ) : caseUserSearchTerm ? (
                        <p className="text-xs text-gray-400">No users found.</p>
                      ) : (
                        <p className="text-xs text-gray-400">Search to find users to assign.</p>
                      )}
                    </div>

                    <div className="flex justify-end">
                      <button
                        type="button"
                        onClick={handleSaveAssignments}
                        disabled={isAssigningUsers}
                        className={`inline-flex items-center gap-2 rounded-full border border-white/10 px-5 py-2.5 text-sm font-medium text-white shadow-lg shadow-[0_18px_35px_rgba(37,99,235,0.35)] transition ${
                          isAssigningUsers
                            ? "bg-blue-900/60 cursor-not-allowed opacity-60"
                            : "bg-blue-600/80 hover:bg-blue-500/80"
                        }`}
                      >
                        {isAssigningUsers ? "Saving..." : "Update Assignments"}
                      </button>
                    </div>
                  </div>
                ) : (
                  <p className="text-sm text-gray-400">Select a case to manage user access.</p>
                )}
              </div>
            </div>
          </section>
        </main>
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
    </div>
  );
}

export default AdminPanel;
