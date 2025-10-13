import React, { useEffect, useState } from "react";
import { db, auth } from "../firebase";
import {
  collection,
  getDocs,
  updateDoc,
  deleteDoc,
  doc,
  query,
  where,
  getDoc,
} from "firebase/firestore";
import { signOut } from "firebase/auth";
import { Link, useNavigate } from "react-router-dom";
import adfLogo from "../assets/image-removebg-preview.png";
import { motion } from "framer-motion";
import AnimatedMap from "../components/AnimatedMap";
import emailjs from "@emailjs/browser";
import NotificationModal from "../components/NotificationModal";
import useNotificationModal from "../hooks/useNotificationModal";
import { getFriendlyErrorMessage } from "../utils/errorMessages";
import { Home, FilePlus2, FolderOpen, Briefcase, LayoutDashboard, Users, UserCheck, UserX } from "lucide-react";

function PendingUsersPage() {
  const [allUsers, setAllUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showMenu, setShowMenu] = useState(false);
  const [profile, setProfile] = useState(null);
  const [filter, setFilter] = useState("pending");
  const navigate = useNavigate();
  const { modalState, openModal, closeModal } = useNotificationModal();
  const formattedDateTime = new Date().toLocaleString();

  useEffect(() => {
    fetchUsers();
    fetchProfile();
  }, []);

  const fetchUsers = async () => {
    try {
      setLoading(true);
      const usersSnap = await getDocs(collection(db, "users"));
      const list = usersSnap.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
      setAllUsers(list);
    } catch (err) {
      console.error("Error fetching users:", err);
    } finally {
      setLoading(false);
    }
  };

  const fetchProfile = async () => {
    const currentUser = auth.currentUser;
    if (currentUser) {
      const docRef = doc(db, "users", currentUser.uid);
      const docSnap = await getDoc(docRef);
      if (docSnap.exists()) {
        setProfile(docSnap.data());
      }
    }
  };

  const approveUser = async (userId, wasRejected = false, skipConfirmation = false) => {
    if (wasRejected && !skipConfirmation) {
      openModal({
        variant: "warning",
        title: "Approve rejected user?",
        description:
          "This user was previously rejected. Approving them will allow access to the system. Continue?",
        primaryAction: {
          label: "Approve user",
          closeOnClick: false,
          onClick: () => {
            closeModal();
            approveUser(userId, true, true);
          },
        },
        secondaryAction: {
          label: "Cancel",
        },
      });
      return;
    }

    try {
      const userRef = doc(db, "users", userId);
      const userSnap = await getDoc(userRef);
      const userData = userSnap.data();

      if (!userData) throw new Error("User data not found");

      await updateDoc(userRef, { isApproved: true, status: "approved" });

      await emailjs.send(
        "service_o9q5hwe",
        "template_1x0ert9",
        {
          to_name: `${userData.firstName} ${userData.surname}`,
          to_email: userData.email,
          firstName: userData.firstName,
        },
        "nv9uRgDbQKDVfYOf4"
      );

      openModal({
        variant: "success",
        title: "User approved",
        description: "The user has been approved and notified via email.",
      });
      setAllUsers((prev) =>
        prev.map((u) => (u.id === userId ? { ...u, isApproved: true, status: "approved" } : u))
      );
    } catch (err) {
      console.error("Error approving user:", err);
      openModal({
        variant: "error",
        title: "Approval failed",
        description: getFriendlyErrorMessage(
          err,
          "We couldn't approve the user or send the email notification. Please try again."
        ),
      });
    }
  };

  const rejectUser = async (userId) => {
    try {
      const userRef = doc(db, "users", userId);
      await updateDoc(userRef, { isApproved: false, status: "rejected" });
      openModal({
        variant: "info",
        title: "User rejected",
        description: "The user has been marked as rejected.",
      });
      setAllUsers((prev) =>
        prev.map((u) => (u.id === userId ? { ...u, isApproved: false, status: "rejected" } : u))
      );
    } catch (err) {
      console.error("Error rejecting user:", err);
      openModal({
        variant: "error",
        title: "Rejection failed",
        description: getFriendlyErrorMessage(err, "We couldn't update the user status. Please try again."),
      });
    }
  };

  const handleSignOut = async () => {
    await signOut(auth);
    navigate("/signin");
  };

  const filteredUsers = allUsers.filter((user) => {
    if (filter === "pending") return user.isApproved === false && user.status !== "rejected";
    if (filter === "rejected") return user.status === "rejected";
    if (filter === "approved") return user.isApproved === true;
    return true;
  });

  const pendingCount = allUsers.filter((user) => user.isApproved === false && user.status !== "rejected").length;
  const approvedCount = allUsers.filter((user) => user.isApproved === true).length;
  const rejectedCount = allUsers.filter((user) => user.status === "rejected").length;
  const filterOptions = [
    {
      value: "pending",
      label: "Pending",
      description: "Awaiting review",
      accent: "from-blue-500/70 to-indigo-500/70",
    },
    {
      value: "approved",
      label: "Approved",
      description: "Active investigators",
      accent: "from-emerald-500/70 to-teal-500/70",
    },
    {
      value: "rejected",
      label: "Rejected",
      description: "Previously declined",
      accent: "from-rose-500/70 to-orange-500/70",
    },
  ];

  const renderUserCard = (user) => {
    const accent = user.status === "rejected"
      ? "from-rose-500/60 via-rose-500/30"
      : user.isApproved
      ? "from-emerald-500/60 via-emerald-500/30"
      : "from-blue-500/60 via-indigo-500/30";

    return (
      <div
        key={user.id}
        className="group relative overflow-hidden rounded-3xl border border-white/10 bg-white/[0.025] p-6 text-left shadow-[0_18px_45px_rgba(15,23,42,0.45)] backdrop-blur-2xl transition hover:border-white/25"
      >
        <div className={`absolute inset-0 -z-10 bg-gradient-to-br ${accent} opacity-0 transition group-hover:opacity-60`} />
        <div className="flex flex-col gap-4 text-sm text-gray-200">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-base font-semibold text-white">
                {user.firstName} {user.surname}
              </p>
              <p className="text-xs text-gray-300">{user.email}</p>
            </div>
            <span className="rounded-full border border-white/20 bg-black/30 px-3 py-1 text-[11px] font-semibold uppercase tracking-wide text-gray-200">
              {user.role || "User"}
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-3 text-xs text-gray-300">
            <span className="rounded-full border border-white/15 bg-white/[0.05] px-3 py-1">
              Status: {user.status || (user.isApproved ? "approved" : "pending")}
            </span>
            <span className="rounded-full border border-white/15 bg-white/[0.05] px-3 py-1">
              UID: {user.id}
            </span>
          </div>

          <div className={`grid gap-3 ${filter === "pending" ? "sm:grid-cols-2" : ""}`}>
            {filter === "pending" && (
              <>
                <button
                  onClick={() => approveUser(user.id)}
                  className="inline-flex items-center justify-center rounded-full bg-gradient-to-r from-emerald-500 to-teal-500 px-4 py-2 text-xs font-semibold text-white shadow-lg shadow-emerald-500/20 transition hover:from-emerald-400 hover:to-teal-400"
                >
                  Approve
                </button>
                <button
                  onClick={() => rejectUser(user.id)}
                  className="inline-flex items-center justify-center rounded-full bg-gradient-to-r from-rose-500 to-orange-500 px-4 py-2 text-xs font-semibold text-white shadow-lg shadow-rose-500/20 transition hover:from-rose-400 hover:to-orange-400"
                >
                  Reject
                </button>
              </>
            )}
            {filter === "rejected" && (
              <button
                onClick={() => approveUser(user.id, true)}
                className="inline-flex items-center justify-center rounded-full bg-gradient-to-r from-amber-500 to-yellow-500 px-4 py-2 text-xs font-semibold text-white shadow-lg shadow-amber-500/20 transition hover:from-amber-400 hover:to-yellow-400"
              >
                Approve User
              </button>
            )}
          </div>
        </div>
      </div>
    );
  };

  return (
    <>
      <motion.div
        initial={{ opacity: 0, y: 18 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.8 }}
        className="relative min-h-screen overflow-hidden bg-gradient-to-br from-black via-gray-900 to-black font-sans text-white"
      >
    <div className="absolute inset-0 -z-20">
      <AnimatedMap />
    </div>
    <div className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(circle_at_top,rgba(59,130,246,0.18),transparent_55%)]" />
    <div className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(circle_at_bottom,rgba(129,140,248,0.14),transparent_60%)]" />
  
    <nav className="mx-6 mt-6 flex items-center justify-between rounded-3xl border border-white/10 bg-gradient-to-br from-black/85 via-slate-900/70 to-black/80 px-6 py-4 shadow-xl shadow-[0_25px_65px_rgba(8,11,24,0.65)] backdrop-blur-xl">
      <div className="flex items-center gap-4">
        <button
          type="button"
          onClick={() => setShowMenu(!showMenu)}
          className="flex h-11 w-11 items-center justify-center rounded-full border border-white/10 bg-white/[0.02] text-xl text-white shadow-inner shadow-white/5 transition hover:bg-white/10"
          aria-label="Toggle navigation"
        >
          &#9776;
        </button>
        <Link to="/home" className="hidden sm:block">
          <img
            src={adfLogo}
            alt="ADF Logo"
            className="h-11 w-auto drop-shadow-[0_10px_20px_rgba(59,130,246,0.35)] transition hover:opacity-90"
          />
        </Link>
      </div>
  
      <div className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 text-2xl font-semibold tracking-[0.35em] text-white/80 drop-shadow-[0_2px_12px_rgba(15,23,42,0.55)]">
        USER ADMIN
      </div>
  
      <div className="flex items-center gap-4 text-sm text-gray-200">
        <span className="hidden text-right md:block">
          <span className="block text-xs text-gray-400">Pending • {pendingCount}</span>
          <span>{formattedDateTime}</span>
        </span>
      </div>
    </nav>
  
    {showMenu && (
      <div className="absolute left-6 top-32 z-30 w-64 space-y-2 rounded-3xl border border-white/10 bg-gradient-to-br from-slate-950/85 via-slate-900/78 to-black/78 p-6 shadow-2xl shadow-[0_30px_60px_rgba(30,58,138,0.45)] backdrop-blur-2xl">
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
        <div className="flex items-center gap-3 rounded-2xl px-3 py-2 text-sm font-medium text-white bg-white/[0.045] shadow-inner shadow-white/10">
          <Users className="h-4 w-4" />
          Pending Users
        </div>
        <Link
          to="/admin-dashboard"
          className="flex items-center gap-3 rounded-2xl px-3 py-2 text-sm font-medium text-gray-200 transition hover:bg-white/10 hover:text-white"
          onClick={() => setShowMenu(false)}
        >
          <LayoutDashboard className="h-4 w-4" />
          Admin Dashboard
        </Link>
      </div>
    )}
  
    <main className="mx-auto flex w-full max-w-6xl flex-col gap-8 px-6 pb-24 pt-16">
      <section className="relative overflow-hidden rounded-3xl border border-white/10 bg-white/[0.03] px-8 py-8 shadow-[0_35px_90px_rgba(15,23,42,0.55)] backdrop-blur-2xl">
        <div className="pointer-events-none absolute -top-24 right-0 h-48 w-48 rounded-full bg-blue-900/25 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-20 left-0 h-40 w-40 rounded-full bg-purple-900/20 blur-3xl" />
        <div className="relative z-10 grid gap-6 lg:grid-cols-4">
          <div className="lg:col-span-2">
            <h1 className="text-3xl font-semibold text-white">User Management Console</h1>
            <p className="mt-3 text-sm text-gray-300">
              Approve incoming investigators, keep tabs on rejected requests, and audit the active roster. Use the filters below to pivot between cohorts.
            </p>
          </div>
          <div className="grid gap-4 text-sm text-gray-200 sm:grid-cols-3 lg:col-span-2">
            <div className="rounded-2xl border border-white/10 bg-white/[0.05] p-4">
              <p className="text-xs uppercase tracking-wide text-gray-400">Pending</p>
              <p className="mt-2 text-xl font-semibold text-white">{pendingCount}</p>
              <p className="text-[11px] text-gray-400">Awaiting decision</p>
            </div>
            <div className="rounded-2xl border border-white/10 bg-white/[0.05] p-4">
              <p className="text-xs uppercase tracking-wide text-gray-400">Approved</p>
              <p className="mt-2 text-xl font-semibold text-emerald-300">{approvedCount}</p>
              <p className="text-[11px] text-gray-400">Active accounts</p>
            </div>
            <div className="rounded-2xl border border-white/10 bg-white/[0.05] p-4">
              <p className="text-xs uppercase tracking-wide text-gray-400">Rejected</p>
              <p className="mt-2 text-xl font-semibold text-rose-300">{rejectedCount}</p>
              <p className="text-[11px] text-gray-400">Require follow-up</p>
            </div>
          </div>
        </div>
      </section>
  
      <section className="rounded-3xl border border-white/10 bg-white/[0.018] p-6 shadow-[0_25px_70px_rgba(15,23,42,0.45)] backdrop-blur-2xl">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <h2 className="text-lg font-semibold text-white">Filter by status</h2>
          <p className="text-xs text-gray-400">Switch between cohorts to focus on the approvals that matter right now.</p>
        </div>
      <div className="mt-5 grid gap-3 sm:grid-cols-3">
        {filterOptions.map(({ value, label, description, accent }) => (
          <button
            key={value}
            onClick={() => setFilter(value)}
            className={`group relative overflow-hidden rounded-2xl border px-4 py-4 text-left transition ${
              filter === value
                ? `border-white/30 text-white`
                : `border-white/10 text-gray-300 hover:border-white/20`
            }`}
          >
            <div
              className={`absolute inset-0 -z-10 bg-gradient-to-br ${accent} transition ${
                filter === value ? 'opacity-70' : 'opacity-0 group-hover:opacity-40'
              }`}
            />
            <p className="text-sm font-semibold">{label}</p>
            <p className="mt-1 text-xs text-gray-200">{description}</p>
          </button>
        ))}
      </div>
      </section>
  
      <section className="rounded-3xl border border-white/10 bg-white/[0.02] p-6 shadow-[0_25px_70px_rgba(15,23,42,0.45)] backdrop-blur-2xl">
       {loading ? (
         <div className="py-12 text-center text-gray-300">
            <div className="flex items-center justify-center gap-3">
              <span className="h-5 w-5 animate-spin rounded-full border-b-2 border-t-2 border-blue-500" />
              Loading users...
            </div>
          </div>
        ) : filteredUsers.length > 0 ? (
          <div className="grid gap-4 md:grid-cols-2">
            {filteredUsers.map(renderUserCard)}
          </div>
        ) : (
          <p className="text-sm text-gray-400">No users match the selected filter.</p>
        )}
      </section>
    </main>
      </motion.div>
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

export default PendingUsersPage;
