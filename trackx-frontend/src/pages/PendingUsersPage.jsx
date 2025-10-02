import React, { useEffect, useState } from "react";
import { db, auth } from "../firebase";
import {
  collection,
  getDocs,
  updateDoc,
  doc,
  getDoc,
} from "firebase/firestore";
import { signOut } from "firebase/auth";
import { Link, useNavigate } from "react-router-dom";
import adfLogo from "../assets/image-removebg-preview.png";
import trackxLogo from "../assets/trackx-logo-removebg-preview.png";
import emailjs from "@emailjs/browser";

function PendingUsersPage() {
  const [allUsers, setAllUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showMenu, setShowMenu] = useState(false);
  const [profile, setProfile] = useState(null);
  const [filter, setFilter] = useState("pending");
  const [page, setPage] = useState(1);
  const pageSize = 10;

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
        "This user was previously rejected. Are you SURE you want to allow them into the system?"
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
        prev.map((u) =>
          u.id === userId ? { ...u, isApproved: true, status: "approved" } : u
        )
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
        prev.map((u) =>
          u.id === userId ? { ...u, isApproved: false, status: "rejected" } : u
        )
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
    if (filter === "pending")
      return user.isApproved === false && user.status !== "rejected" && user.status !== "revoked";
    if (filter === "rejected") return user.status === "rejected";
    if (filter === "approved") return user.isApproved === true;
    if (filter === "revoked") return user.status === "revoked";
    return true;
  });

  // Pagination slice
  const paginatedUsers = filteredUsers.slice(
    (page - 1) * pageSize,
    page * pageSize
  );

  return (
    <div className="relative flex flex-col min-h-screen">
      <div className="absolute inset-0 w-full min-h-full bg-gradient-to-br from-black via-gray-900 to-black -z-20" />

      {/* Navbar */}
      <nav className="flex justify-between items-center bg-gradient-to-r from-black to-gray-900 bg-opacity-80 backdrop-blur-md p-4 relative font-sans z-20">
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
          <img
            src={trackxLogo}
            alt="TrackX Logo Right"
            className="h-8 w-auto"
          />
        </div>

        <div className="flex items-center space-x-6 text-white font-sans">
          <Link to="/admin-dashboard" className="hover:text-white">
            Admin
          </Link>
          <div className="flex flex-col text-right">
            <span>{profile ? profile.firstName : "Loading..."}</span>
            <button
              onClick={handleSignOut}
              className="text-sm text-white hover:text-white"
            >
              Sign Out
            </button>
          </div>
          <div className="text-sm text-white">{new Date().toLocaleString()}</div>
        </div>
      </nav>

      {/* Sidebar Menu */}
      {showMenu && (
        <div className="absolute top-16 left-0 bg-black bg-opacity-90 backdrop-blur-md text-white w-64 p-6 z-30 space-y-4 border-r border-gray-700 shadow-lg">
          <Link
            to="/home"
            className="block hover:text-blue-400"
            onClick={() => setShowMenu(false)}
          >
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

      <div className="text-center text-white text-lg tracking-wide mt-4 font-sans z-10">
        <h1 className="text-3xl font-bold text-white-500">User Management</h1>
      </div>

      {/* Filters */}
      <div className="flex justify-center space-x-4 mt-6">
        <button
          onClick={() => {
            setFilter("pending");
            setPage(1);
          }}
          className={`px-4 py-2 rounded ${
            filter === "pending" ? "bg-blue-600" : "bg-gray-700"
          }`}
        >
          Pending
        </button>
        <button
          onClick={() => {
            setFilter("approved");
            setPage(1);
          }}
          className={`px-4 py-2 rounded ${
            filter === "approved" ? "bg-green-600" : "bg-gray-700"
          }`}
        >
          Approved
        </button>
        <button
          onClick={() => {
            setFilter("rejected");
            setPage(1);
          }}
          className={`px-4 py-2 rounded ${
            filter === "rejected" ? "bg-red-600" : "bg-gray-700"
          }`}
        >
          Rejected
        </button>
        <button
          onClick={() => {
            setFilter("revoked");
            setPage(1);
          }}
          className={`px-4 py-2 rounded ${
            filter === "revoked" ? "bg-gray-600" : "bg-gray-700"
          }`}
        >
          Revoked
        </button>
      </div>

      {/* Table View */}
      <div className="flex-grow z-10 p-8">
        {loading ? (
          <p className="text-center text-white">Loading users...</p>
        ) : paginatedUsers.length === 0 ? (
          <p className="text-center text-white">No users found.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full table-auto border border-gray-700">
              <thead className="bg-white bg-opacity-10 border border-gray-700">
                <tr>
                  <th className="p-3 text-left text-white">Name</th>
                  <th className="p-3 text-left text-white">Email</th>
                  <th className="p-3 text-left text-white">Role</th>
                  <th className="p-3 text-left text-white">Status</th>
                  <th className="p-3 text-left text-white">Action</th>
                </tr>
              </thead>
              <tbody>
                {paginatedUsers.map((user) => (
                  <tr
                    key={user.id}
                    className="border-b border-gray-700 hover:bg-white/10"
                  >
                    <td className="p-3 text-white">
                      {user.firstName} {user.surname}
                    </td>
                    <td className="p-3 text-white">{user.email}</td>
                    <td className="p-3 text-white">{user.role}</td>
                    <td className="p-3 text-white">
                      <span
                        className={`px-2 py-1 rounded-full text-xs font-bold tracking-wide uppercase ${
                          user.status === "approved"
                            ? "bg-green-600 text-white"
                            : user.status === "rejected"
                            ? "bg-red-600 text-white"
                            : user.status === "revoked"
                            ? "bg-gray-600 text-white"
                            : "bg-yellow-600 text-white"
                        }`}
                      >
                        {user.status || "pending"}
                      </span>
                    </td>
                    <td className="p-3 text-white space-x-2">
                      {filter === "pending" && (
                        <>
                          <button
                            onClick={() => approveUser(user.id)}
                            className="px-3 py-1 bg-green-600 hover:bg-green-700 rounded"
                          >
                            Approve
                          </button>
                          <button
                            onClick={() => rejectUser(user.id)}
                            className="px-3 py-1 bg-red-600 hover:bg-red-700 rounded"
                          >
                            Reject
                          </button>
                        </>
                      )}

                      {filter === "approved" && (
                        <button
                          onClick={async () => {
                            try {
                              const userRef = doc(db, "users", user.id);
                              await updateDoc(userRef, {
                                isApproved: false,
                                status: "revoked",
                              });
                              alert("User access revoked.");
                              setAllUsers((prev) =>
                                prev.map((u) =>
                                  u.id === user.id
                                    ? { ...u, isApproved: false, status: "revoked" }
                                    : u
                                )
                              );
                            } catch (err) {
                              console.error("Error revoking user:", err);
                              alert("Error revoking user.");
                            }
                          }}
                          className="px-3 py-1 bg-red-600 hover:bg-red-700 rounded"
                        >
                          Revoke Access
                        </button>
                      )}

                      {filter === "rejected" && (
                        <button
                          onClick={() => approveUser(user.id, true)}
                          className="px-3 py-1 bg-green-600 hover:bg-green-700 rounded"
                        >
                          Approve Rejected User
                        </button>
                      )}

                      {filter === "revoked" && (
                        <button
                          onClick={async () => {
                            try {
                              const userRef = doc(db, "users", user.id);
                              await updateDoc(userRef, {
                                isApproved: true,
                                status: "approved",
                              });
                              alert("User access restored.");
                              setAllUsers((prev) =>
                                prev.map((u) =>
                                  u.id === user.id
                                    ? { ...u, isApproved: true, status: "approved" }
                                    : u
                                )
                              );
                            } catch (err) {
                              console.error("Error restoring user:", err);
                              alert("Error restoring user.");
                            }
                          }}
                          className="px-3 py-1 bg-blue-600 hover:bg-blue-700 rounded"
                        >
                          Restore Access
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            {/* Pagination */}
            <div className="flex justify-between items-center mt-4">
              <button
                onClick={() => setPage((prev) => Math.max(prev - 1, 1))}
                disabled={page === 1}
                className="px-4 py-2 bg-white bg-opacity-10 border border-gray-600 text-white rounded disabled:opacity-50"
              >
                Prev
              </button>
              <span className="text-sm text-white">Page {page}</span>
              <button
                onClick={() => setPage((prev) => prev + 1)}
                disabled={paginatedUsers.length < pageSize}
                className="px-4 py-2 bg-white bg-opacity-10 border border-gray-600 text-white rounded disabled:opacity-50"
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default PendingUsersPage;
