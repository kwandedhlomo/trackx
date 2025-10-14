import React, { useState, useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { Users, ClipboardList, Home, Database } from "lucide-react";
import trackxLogo from "../assets/trackx-logo-removebg-preview.png";
import adfLogo from "../assets/image-removebg-preview.png";
import AnimatedMap from "../components/AnimatedMap";
import { signOut } from "firebase/auth";
import { auth, db } from "../firebase";
import { doc, getDoc } from "firebase/firestore";

// NEW: Jon's technical terms seed
import technicalTermsSeed from "../data/technicalTermsSeed";
import { seedTechnicalTerms } from "../services/firebaseServices";

function AdminDashboardPage() {
  const [showMenu, setShowMenu] = useState(false);
  const [profile, setProfile] = useState(null);
  const [isSeedingTerms, setIsSeedingTerms] = useState(false);
  const [seedResult, setSeedResult] = useState(null);
  const [seedError, setSeedError] = useState("");

  const navigate = useNavigate();
  const formattedDateTime = new Date().toLocaleString();

  useEffect(() => {
    const loadProfile = async () => {
      const currentUser = auth.currentUser;
      if (!currentUser) return;
      const snap = await getDoc(doc(db, "users", currentUser.uid));
      if (snap.exists()) setProfile(snap.data());
    };
    loadProfile();
  }, []);

  const handleSignOut = async () => {
    await signOut(auth);
    navigate("/signin");
  };

  // NEW: seeding handler
  const handleSeedTechnicalTerms = async () => {
    if (isSeedingTerms) return;

    const confirmed = window.confirm(
      "This will upsert the predefined technical glossary into Firestore. Continue?"
    );
    if (!confirmed) return;

    try {
      setIsSeedingTerms(true);
      setSeedError("");
      setSeedResult(null);
      const result = await seedTechnicalTerms(technicalTermsSeed);
      setSeedResult(result); // { created, updated }
    } catch (error) {
      setSeedError(
        error?.message || "Failed to seed technical terms. Check the console for details."
      );
      console.error("Seeding technical terms failed:", error);
    } finally {
      setIsSeedingTerms(false);
    }
  };

  const actions = [
    {
      title: "Pending Users",
      description: "Review, approve, or reject investigators waiting for access.",
      to: "/pending-users",
      icon: Users,
      accent: "from-blue-500/70 to-indigo-500/70",
    },
    {
      title: "All Users",
      description: "Audit existing accounts, roles, and activity at a glance.",
      to: "/all-users",
      icon: ClipboardList,
      accent: "from-emerald-500/70 to-teal-500/70",
    },
    {
      title: "Return Home",
      description: "Jump back to the operational dashboard for active cases.",
      to: "/home",
      icon: Home,
      accent: "from-purple-500/70 to-pink-500/70",
    },
  ];

  return (
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
      <div className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(circle_at_bottom,rgba(129,140,248,0.16),transparent_60%)]" />

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
          ADMIN HUB
        </div>

        <div className="flex items-center gap-4 text-sm text-gray-200">
          <div className="hidden text-right md:block">
            <span className="block text-xs text-gray-400">Last sync</span>
            <span>{formattedDateTime}</span>
          </div>
          <div className="flex flex-col items-end">
            <span className="text-base font-semibold text-white">
              {profile
                ? `${profile.firstName || ""} ${profile.surname || ""}`.trim() || "Administrator"
                : "Administrator"}
            </span>
            <button
              onClick={handleSignOut}
              className="text-xs text-gray-400 transition hover:text-white"
            >
              Sign Out
            </button>
          </div>
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
            to="/pending-users"
            className="flex items-center gap-3 rounded-2xl px-3 py-2 text-sm font-medium text-gray-200 transition hover:bg-white/10 hover:text-white"
            onClick={() => setShowMenu(false)}
          >
            <Users className="h-4 w-4" />
            Pending Users
          </Link>
          <Link
            to="/all-users"
            className="flex items-center gap-3 rounded-2xl px-3 py-2 text-sm font-medium text-gray-200 transition hover:bg-white/10 hover:text-white"
            onClick={() => setShowMenu(false)}
          >
            <ClipboardList className="h-4 w-4" />
            All Users
          </Link>
          <div className="flex items-center gap-3 rounded-2xl px-3 py-2 text-sm font-medium text-white bg-white/[0.045] shadow-inner shadow-white/10">
            <Home className="h-4 w-4 rotate-180" />
            Admin Hub
          </div>
        </div>
      )}

      <main className="mx-auto flex w-full max-w-5xl flex-col gap-10 px-6 py-16">
        {/* Hero */}
        <section className="relative overflow-hidden rounded-3xl border border-white/10 bg-white/[0.03] px-10 py-12 shadow-[0_35px_90px_rgba(15,23,42,0.55)] backdrop-blur-2xl">
          <div className="pointer-events-none absolute -top-28 right-0 h-56 w-56 rounded-full bg-blue-900/25 blur-3xl" />
          <div className="pointer-events-none absolute -bottom-24 left-0 h-48 w-48 rounded-full bg-purple-900/20 blur-3xl" />
          <div className="relative z-10 flex flex-col gap-6 text-center">
            <div className="mx-auto flex items-center gap-3">
              <img
                src={trackxLogo}
                alt="TrackX Logo"
                className="h-12 w-auto drop-shadow-[0_10px_20px_rgba(59,130,246,0.35)]"
              />
              <span className="text-3xl font-semibold text-white">TrackX Governance</span>
            </div>
            <p className="mx-auto max-w-2xl text-sm text-gray-300">
              Oversee onboarding, enforce security policy, and keep the operations roster aligned.
              Use the cards below to dive straight into the tools you need.
            </p>
          </div>
        </section>

        {/* Core actions */}
        <section className="grid gap-6 md:grid-cols-2">
          {actions.map(({ title, description, to, icon: Icon, accent }) => (
            <Link
              key={title}
              to={to}
              className="group relative overflow-hidden rounded-3xl border border-white/10 bg-white/[0.025] p-6 text-left shadow-[0_25px_70px_rgba(15,23,42,0.55)] backdrop-blur-2xl transition hover:border-white/30"
            >
              <div
                className={`absolute inset-0 -z-10 bg-gradient-to-br ${accent} opacity-0 transition group-hover:opacity-100`}
              />
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h2 className="text-lg font-semibold text-white">{title}</h2>
                  <p className="mt-2 text-sm text-gray-200">{description}</p>
                </div>
                <div className="rounded-full border border-white/20 bg-black/30 p-3 text-white">
                  <Icon className="h-5 w-5" />
                </div>
              </div>
              <span className="mt-6 inline-flex items-center gap-2 text-sm font-semibold text-white/80 transition group-hover:text-white">
                Open
                <span className="translate-x-0 transition group-hover:translate-x-1">→</span>
              </span>
            </Link>
          ))}
        </section>

        {/* NEW: Admin Utilities - Technical Terms seeding */}
        <section className="relative overflow-hidden rounded-3xl border border-white/10 bg-white/[0.025] p-6 shadow-[0_25px_70px_rgba(15,23,42,0.55)] backdrop-blur-2xl">
          <div className="absolute inset-0 -z-10 bg-gradient-to-br from-emerald-600/10 to-teal-600/10" />
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="flex items-center gap-2">
                <Database className="h-5 w-5 text-emerald-300" />
                <h2 className="text-lg font-semibold text-white">Admin Utilities</h2>
              </div>
              <p className="mt-2 text-sm text-gray-300">
                Seed or update the predefined <span className="text-emerald-200">technical glossary</span> used by reports
                and annotations. Safe to run multiple times (upsert).
              </p>
            </div>
          </div>

          <div className="mt-5 flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={handleSeedTechnicalTerms}
              disabled={isSeedingTerms}
              className={`inline-flex items-center justify-center rounded-full px-5 py-2 text-sm font-semibold text-white shadow-lg transition
                ${
                  isSeedingTerms
                    ? "bg-emerald-900 cursor-not-allowed"
                    : "bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500"
                }`}
            >
              {isSeedingTerms ? "Seeding Terms..." : "Initial Create / Update Terms"}
            </button>

            {seedResult && (
              <span className="inline-flex items-center gap-2 rounded-full border border-emerald-400/40 bg-emerald-500/10 px-3 py-1.5 text-xs font-semibold text-emerald-200">
                Completed: {seedResult.created} created, {seedResult.updated} updated.
              </span>
            )}

            {seedError && (
              <span className="inline-flex items-center gap-2 rounded-full border border-rose-400/40 bg-rose-500/10 px-3 py-1.5 text-xs font-semibold text-rose-200">
                {seedError}
              </span>
            )}
          </div>
        </section>
      </main>
    </motion.div>
  );
}

export default AdminDashboardPage;
