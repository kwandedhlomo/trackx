import React, { useEffect, useState } from "react";
import { db, auth } from "../firebase";
import {
  collection,
  getDocs,
  updateDoc,
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

function PendingUsersPage() {
  const [pendingUsers, setPendingUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showMenu, setShowMenu] = useState(false);
  const [profile, setProfile] = useState(null);
  const navigate = useNavigate();

  useEffect(() => {
    fetchPendingUsers();
    fetchProfile();
  }, []);

  const fetchPendingUsers = async () => {
    try {
      setLoading(true);
      const pendingQuery = query(collection(db, "users"), where("isApproved", "==", false));
      const pendingSnap = await getDocs(pendingQuery);
      const list = pendingSnap.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
      setPendingUsers(list);
    } catch (err) {
      console.error("Error fetching pending users:", err);
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

  const approveUser = async (userId) => {
    try {
      await updateDoc(doc(db, "users", userId), { isApproved: true });
      alert("User approved.");
      fetchPendingUsers();
    } catch (err) {
      console.error("Error approving user:", err);
    }
  };

  const handleSignOut = async () => {
    await signOut(auth);
    navigate("/signin");
  };

  const renderUserCard = (user) => (
    <div key={user.id} className="bg-gray-800 rounded-lg p-4 shadow-md text-white space-y-2 w-full max-w-md mx-auto">
      <p><strong>Name:</strong> {user.firstName} {user.surname}</p>
      <p><strong>Email:</strong> {user.email}</p>
      <p><strong>Role:</strong> {user.role}</p>
      <button
        onClick={() => approveUser(user.id)}
        className="bg-green-600 hover:bg-green-700 px-4 py-1 rounded w-full"
      >
        Approve
      </button>
    </div>
  );

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 1 }}
      className="min-h-screen bg-black text-white font-sans"
    >
      {/* Navbar */}
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
          <Link to="/admin-dashboard" className="hover:text-gray-300">Admin</Link>
          <div className="flex flex-col text-right">
            <span>{profile ? profile.firstName : "Loading..."}</span>
            <button onClick={handleSignOut} className="text-sm text-gray-300 hover:text-white">Sign Out</button>
          </div>
          <div className="text-sm text-gray-300">
            {new Date().toLocaleString()}
          </div>
        </div>
      </nav>

      {/* Side Menu */}
      {showMenu && (
        <div className="absolute top-16 left-0 bg-black bg-opacity-90 backdrop-blur-md text-white w-64 p-6 z-30 space-y-4 border-r border-gray-700 shadow-lg">
          <Link to="/home" className="block hover:text-blue-400" onClick={() => setShowMenu(false)}>🏠 Home</Link>
          <Link to="/new-case" className="block hover:text-blue-400" onClick={() => setShowMenu(false)}>📝 Create New Case / Report</Link>
          <Link to="/manage-cases" className="block hover:text-blue-400" onClick={() => setShowMenu(false)}>📁 Manage Cases</Link>
          <Link to="/admin-dashboard" className="block hover:text-blue-400" onClick={() => setShowMenu(false)}>🛠️ Admin Dashboard</Link>
        </div>
      )}

      {/* Pending Users */}
      <div className="flex flex-col items-center justify-center px-4 py-10 space-y-6">
        <h1 className="text-3xl font-bold mb-4">Pending Users</h1>
        {loading ? (
          <p className="text-gray-400">Loading...</p>
        ) : pendingUsers.length > 0 ? (
          <div className="space-y-6 w-full">{pendingUsers.map(renderUserCard)}</div>
        ) : (
          <p className="text-gray-400">No pending users found.</p>
        )}
      </div>
    </motion.div>
  );
}

export default PendingUsersPage;



