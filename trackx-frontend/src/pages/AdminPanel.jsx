import { useEffect, useState } from "react";
import axios from "axios";
import { useAuth } from "../context/AuthContext";
import { useNavigate, Link } from "react-router-dom";
import adfLogo from "../assets/image-removebg-preview.png";
import trackxLogo from "../assets/trackx-logo-removebg-preview.png";
import { signOut } from "firebase/auth";
import { auth } from "../firebase";

function AdminPanel() {
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


  const fetchUsers = async () => {
    setLoading(true);
    try {
      const response = await axios.get("http://localhost:8000/admin/users", {
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

const toggleRole = async (userId, currentRole) => {
  const newRole = currentRole === "admin" ? "user" : "admin";
  const confirmed = window.confirm(`Are you sure you want to make this user a ${newRole}?`);
  if (!confirmed) return;

  try {
    await axios.post(`http://localhost:8000/admin/update-role/${userId}`, {
      new_role: newRole,
    });

    //  Update just the changed user in state
    setUsers((prevUsers) =>
      prevUsers.map((user) =>
        user.id === userId ? { ...user, role: newRole } : user
      )
    );
  } catch (error) {
    console.error("Failed to update role:", error);
  }
};

//Delete A user
const handleDeleteUser = async (userId) => {
  const confirmed = window.confirm("Are you sure you want to delete this user?");
  if (!confirmed) return;

  try {
    await axios.delete(`http://localhost:8000/admin/delete-user/${userId}`);
    setUsers((prevUsers) => prevUsers.filter((user) => user.id !== userId));
  } catch (error) {
    console.error("Failed to delete user:", error);
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

  return (
    <div className="relative flex flex-col min-h-screen">
      <div className="absolute inset-0 w-full min-h-full bg-gradient-to-br from-black via-gray-900 to-black -z-20" />

      {/* 🟦 Navbar */}
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
          <img src={trackxLogo} alt="TrackX Logo Right" className="h-8 w-auto" />
        </div>

        <div className="flex items-center space-x-6 text-white font-sans">
          <Link to="/home" className="hover:text-white">Home</Link>
          <div className="flex flex-col text-right">
            <span className="text-white">{profile ? profile.firstName : "Loading..."}</span>
            <button onClick={handleSignOut} className="text-sm text-white hover:text-white">Sign Out</button>
          </div>
          <div className="text-sm text-white">
            {new Date().toLocaleString()}
          </div>
        </div>
      </nav>

      {showMenu && (
        <div className="absolute top-16 left-0 bg-black bg-opacity-90 backdrop-blur-md text-white w-64 p-6 z-30 space-y-4 border-r border-gray-700 shadow-lg">
          <Link to="/home" className="block hover:text-blue-400" onClick={() => setShowMenu(false)}>🏠 Home</Link>
          <Link to="/new-case" className="block hover:text-blue-400" onClick={() => setShowMenu(false)}>📝 Create New Case / Report</Link>
          <Link to="/manage-cases" className="block hover:text-blue-400" onClick={() => setShowMenu(false)}>📁 Manage Cases</Link>
        </div>
      )}

      <div className="text-center text-white text-lg tracking-wide mt-4 font-sans z-10">
        <h1 className="text-3xl font-bold text-white-500">Admin Panel</h1>
      </div>

      <div className="flex-grow z-10 p-8">
        <div className="flex flex-col md:flex-row md:items-center justify-between mb-4 space-y-4 md:space-y-0">
          <div className="relative w-full md:w-1/3">
            <input
              type="text"
              placeholder="Search by name or email"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="p-2 rounded bg-white bg-opacity-10 border border-gray-700 text-white border border-gray-600 w-full pr-10"
            />
            {search && (
              <button
                onClick={() => setSearch("")}
                className="absolute right-2 top-1/2 transform -translate-y-1/2 text-xl text-white hover:text-white"
              >
                ✕
              </button>
            )}
          </div>

          <select
            value={roleFilter}
            onChange={(e) => setRoleFilter(e.target.value)}
            className="p-2 rounded bg-white bg-opacity-10 border border-gray-700 text-white border border-gray-600 [&>option]:text-black"
          >
            <option value="all">All Roles</option>
            <option value="admin">Admins</option>
            <option value="user">Users</option>
          </select>
        </div>

        {loading ? (
          <p className="text-center text-white">Loading users...</p>
        ) : users.length === 0 ? (
          <p className="text-center text-white">No users found.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full table-auto border border-gray-700">
              <thead className="bg-white bg-opacity-10 border border-gray-700">
                <tr>
                  <th className="p-3 text-left text-white">Name</th>
                  <th className="p-3 text-left text-white">Email</th>
                  <th className="p-3 text-left text-white">Role</th>
                  <th className="p-3 text-left text-white">Action</th>
                </tr>
              </thead>
              <tbody>
                {users.map((user) => (
                  <tr key={user.id} className="border-b border-gray-700 hover:bg-white/10">
                  <td className="p-3 text-white">{user.name}</td>
                  <td className="p-3 text-white">{user.email}</td>
                  <td className="p-3 text-white">
                    <span
                      className={`px-2 py-1 rounded-full text-xs font-bold tracking-wide uppercase ${
                        user.role === "admin"
                          ? "bg-blue-600 text-white"
                          : "bg-gray-600 text-white"
                      }`}
                    >
                      {user.role}
                    </span>
                  </td>
                  <td className="p-3 text-white flex justify-between items-center space-x-2 relative">
                    {/* Toggle Role Button */}
                    <button
                      onClick={() => toggleRole(user.id, user.role)}
                      className={`px-4 py-2 rounded text-sm transition-colors duration-200 ${
                        user.role === "admin"
                          ? "bg-red-700 hover:bg-red-600"
                          : "bg-blue-700 hover:bg-blue-600"
                      }`}
                    >
                      {user.role === "admin" ? "Revoke Admin" : "Make Admin"}
                    </button>

                    {/* Delete Dropdown on Far Right */}
                    <div className="relative ml-auto">
                      <button
                        className="text-xl px-2 py-1 hover:bg-gray-700 rounded"
                        onClick={() =>
                          setOpenMenuUserId((prev) => (prev === user.id ? null : user.id))
                        }
                      >
                        ⋮
                      </button>

                      {openMenuUserId === user.id && (
                        <div className="absolute right-0 mt-1 bg-black bg-opacity-90 border border-gray-600 rounded shadow-lg z-50">
                          <button
                            onClick={() => handleDeleteUser(user.id)}
                            className="block w-full px-4 py-2 text-sm text-red-500 hover:bg-gray-700"
                          >
                            Delete User
                          </button>
                        </div>
                      )}
                    </div>
                  </td>
                </tr>

                ))}
              </tbody>
            </table>

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
                disabled={users.length < pageSize}
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

export default AdminPanel;
