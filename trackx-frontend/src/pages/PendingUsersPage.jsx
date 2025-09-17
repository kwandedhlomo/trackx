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
import trackxLogo from "../assets/trackx-logo-removebg-preview.png";
import { motion } from "framer-motion";
import emailjs from "@emailjs/browser";

function PendingUsersPage() {
  const [allUsers, setAllUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showMenu, setShowMenu] = useState(false);
  const [profile, setProfile] = useState(null);
  const [filter, setFilter] = useState("pending");
  const navigate = useNavigate();

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

  const approveUser = async (userId, wasRejected = false) => {
    if (wasRejected) {
      const confirmed = window.confirm(
        "This user was previously rejected. Are you SURE you want to allow them into the system with their account?"
      );
      if (!confirmed) return;
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

      alert("User approved and notified via email.");
      setAllUsers((prev) =>
        prev.map((u) => (u.id === userId ? { ...u, isApproved: true, status: "approved" } : u))
      );
    } catch (err) {
      console.error("Error approving user:", err);
      alert("Error approving user or sending email.");
    }
  };

  const rejectUser = async (userId) => {
    try {
      const userRef = doc(db, "users", userId);
      await updateDoc(userRef, { isApproved: false, status: "rejected" });
      alert("User rejected.");
      setAllUsers((prev) =>
        prev.map((u) => (u.id === userId ? { ...u, isApproved: false, status: "rejected" } : u))
      );
    } catch (err) {
      console.error("Error rejecting user:", err);
      alert("Error rejecting user.");
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

  const renderUserCard = (user) => (
    <div
      key={user.id}
      className="bg-gray-800 rounded-lg p-4 shadow-md text-white space-y-2 w-full max-w-md mx-auto"
    >
      <p>
        <strong>Name:</strong> {user.firstName} {user.surname}
      </p>
      <p>
        <strong>Email:</strong> {user.email}
      </p>
      <p>
        <strong>Role:</strong> {user.role}
      </p>
      <div className="flex space-x-4">
        {filter === "pending" && (
          <>
            <button
              onClick={() => approveUser(user.id)}
              className="bg-green-600 hover:bg-green-700 px-4 py-1 rounded w-full"
            >
              Approve
            </button>
            <button
              onClick={() => rejectUser(user.id)}
              className="bg-red-600 hover:bg-red-700 px-4 py-1 rounded w-full"
            >
              Reject
            </button>
          </>
        )}
        {filter === "rejected" && (
          <button
            onClick={() => approveUser(user.id, true)}
            className="bg-yellow-600 hover:bg-yellow-700 px-4 py-1 rounded w-full"
          >
            Approve This Rejected User
          </button>
        )}
      </div>
    </div>
  );

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 1 }}
      className="min-h-screen bg-black text-white font-sans"
    >
      <nav className="flex justify-between items-center bg-gradient-to-r from-black to-gray-900 bg-opacity-80 backdrop-blur-md p-4 relative font-sans">
        <div className="flex items-center space-x-4">
          <div
            className="text-white text-3xl cursor-pointer"
            onClick={() => setShowMenu(!showMenu)}
          >
            &#9776;
          </div>
          <img src={adfLogo} alt="ADF Logo" className="h-10 w-auto" />
        </div>

        <div className="absolute left-1/2 transform -translate-x-1/2 text-3xl font-extrabold text-white font-sans flex items-center space-x-2">
          <img src={trackxLogo} alt="TrackX Logo Left" className="h-8 w-auto" />
          <span>TRACKX</span>
          <img src={trackxLogo} alt="TrackX Logo Right" className="h-8 w-auto" />
        </div>

        <div className="flex items-center space-x-6 text-white font-sans">
          <Link to="/admin-dashboard" className="hover:text-gray-300">
            Admin
          </Link>
          <div className="flex flex-col text-right">
            <span>{profile ? profile.firstName : "Loading..."}</span>
            <button
              onClick={handleSignOut}
              className="text-sm text-gray-300 hover:text-white"
            >
              Sign Out
            </button>
          </div>
          <div className="text-sm text-gray-300">{new Date().toLocaleString()}</div>
        </div>
      </nav>

      {showMenu && (
        <div className="absolute top-16 left-0 bg-black bg-opacity-90 backdrop-blur-md text-white w-64 p-6 z-30 space-y-4 border-r border-gray-700 shadow-lg">
          <Link to="/home" className="block hover:text-blue-400" onClick={() => setShowMenu(false)}>
            🏠 Home
          </Link>
          <Link
            to="/new-case"
            className="block hover:text-blue-400"
            onClick={() => setShowMenu(false)}
          >
            📝 Create New Case / Report
          </Link>
          <Link
            to="/manage-cases"
            className="block hover:text-blue-400"
            onClick={() => setShowMenu(false)}
          >
            📁 Manage Cases
          </Link>
          <Link
            to="/admin-dashboard"
            className="block hover:text-blue-400"
            onClick={() => setShowMenu(false)}
          >
            🛠️ Admin Dashboard
          </Link>
        </div>
      )}

      <div className="flex flex-col items-center justify-center px-4 py-10 space-y-6">
        <h1 className="text-3xl font-bold mb-4">User Management</h1>

        <div className="flex space-x-4 mb-6">
          <button
            onClick={() => setFilter("pending")}
            className={`px-4 py-2 rounded ${filter === "pending" ? "bg-blue-600" : "bg-gray-700"}`}
          >
            Pending
          </button>
          <button
            onClick={() => setFilter("approved")}
            className={`px-4 py-2 rounded ${filter === "approved" ? "bg-green-600" : "bg-gray-700"}`}
          >
            Approved
          </button>
          <button
            onClick={() => setFilter("rejected")}
            className={`px-4 py-2 rounded ${filter === "rejected" ? "bg-red-600" : "bg-gray-700"}`}
          >
            Rejected
          </button>
        </div>

        {loading ? (
          <p className="text-gray-400">Loading...</p>
        ) : filteredUsers.length > 0 ? (
          <div className="space-y-6 w-full">{filteredUsers.map(renderUserCard)}</div>
        ) : (
          <p className="text-gray-400">No users found.</p>
        )}
      </div>
    </motion.div>
  );
}

export default PendingUsersPage;
