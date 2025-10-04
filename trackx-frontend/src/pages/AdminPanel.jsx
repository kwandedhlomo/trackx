import { useEffect, useState } from "react";
import axios from "axios";
import { useAuth } from "../context/AuthContext";
import { useNavigate, Link } from "react-router-dom";
import adfLogo from "../assets/image-removebg-preview.png";
import trackxLogo from "../assets/trackx-logo-removebg-preview.png";
import { signOut } from "firebase/auth";
import { auth } from "../firebase";
import { Home, FilePlus2, FolderOpen, Briefcase, LayoutDashboard, Users, UserPlus, X } from "lucide-react";
import NotificationModal from "../components/NotificationModal";
import useNotificationModal from "../hooks/useNotificationModal";
import { getFriendlyErrorMessage } from "../utils/errorMessages";


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
        userID: caseItem.userID || null,
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
      : targetCase.userID
      ? [targetCase.userID]
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
            ? { ...caseItem, userIds: userIds, userID: userIds[0] }
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
          <Link to="/home" className="inline-flex">
            <img
              src={adfLogo}
              alt="ADF Logo"
              className="h-10 w-auto cursor-pointer hover:opacity-80 transition"
            />
          </Link>
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
        <div className="absolute top-16 left-0 w-64 rounded-r-3xl border border-white/10 bg-gradient-to-br from-gray-900/95 to-black/90 backdrop-blur-xl p-6 z-30 shadow-2xl space-y-2">
          <Link
            to="/home"
            className="flex items-center gap-3 px-3 py-2 rounded-2xl text-sm font-medium text-gray-200 hover:text-white hover:bg-white/10 transition"
            onClick={() => setShowMenu(false)}
          >
            <Home className="w-4 h-4" />
            Home
          </Link>
          <Link
            to="/new-case"
            className="flex items-center gap-3 px-3 py-2 rounded-2xl text-sm font-medium text-gray-200 hover:text-white hover:bg-white/10 transition"
            onClick={() => setShowMenu(false)}
          >
            <FilePlus2 className="w-4 h-4" />
            Create New Case
          </Link>
          <Link
            to="/manage-cases"
            className="flex items-center gap-3 px-3 py-2 rounded-2xl text-sm font-medium text-gray-200 hover:text-white hover:bg-white/10 transition"
            onClick={() => setShowMenu(false)}
          >
            <FolderOpen className="w-4 h-4" />
            Manage Cases
          </Link>
          <Link
            to="/my-cases"
            className="flex items-center gap-3 px-3 py-2 rounded-2xl text-sm font-medium text-gray-200 hover:text-white hover:bg-white/10 transition"
            onClick={() => setShowMenu(false)}
          >
            <Briefcase className="w-4 h-4" />
            My Cases
          </Link>
          <Link
            to="/pending-users"
            className="flex items-center gap-3 px-3 py-2 rounded-2xl text-sm font-medium text-gray-200 hover:text-white hover:bg-white/10 transition"
            onClick={() => setShowMenu(false)}
          >
            <Users className="w-4 h-4" />
            Pending Users
          </Link>
          <div className="flex items-center gap-3 px-3 py-2 rounded-2xl text-sm font-medium text-white bg-white/10">
            <LayoutDashboard className="w-4 h-4" />
            Admin Dashboard
          </div>
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

        <div className="mt-10 bg-gray-900 bg-opacity-70 border border-gray-700 rounded-2xl p-6 space-y-4">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <div>
              <h2 className="text-lg font-semibold text-white">Case Access Management</h2>
              <p className="text-sm text-gray-400">Assign or remove investigators on existing cases.</p>
            </div>
            <div className="flex items-center gap-3">
              <input
                type="text"
                value={caseSearch}
                onChange={(e) => setCaseSearch(e.target.value)}
                placeholder="Search cases"
                className="px-3 py-2 rounded-lg bg-gray-800 border border-gray-700 text-white text-sm placeholder-gray-500"
              />
              <button
                type="button"
                onClick={fetchCases}
                className="px-3 py-2 rounded-lg bg-blue-700 hover:bg-blue-600 text-white text-sm"
              >
                Refresh
              </button>
            </div>
          </div>

          <div className="grid gap-3 md:grid-cols-2">
            <select
              value={selectedCaseId}
              onChange={(e) => handleSelectCase(e.target.value)}
              className="px-3 py-2 rounded-lg bg-gray-800 border border-gray-700 text-white text-sm"
            >
              <option value="">Select a case</option>
              {filteredCases.map((caseItem) => (
                <option key={caseItem.id} value={caseItem.id}>
                  {caseItem.caseNumber || caseItem.id} — {caseItem.caseTitle || 'Untitled'}
                </option>
              ))}
            </select>
            {selectedCase && (
              <div className="text-sm text-gray-400">
                <p><span className="text-gray-500">Case number:</span> {selectedCase.caseNumber || 'N/A'}</p>
                <p><span className="text-gray-500">Title:</span> {selectedCase.caseTitle || 'Untitled'}</p>
              </div>
            )}
          </div>

          {isFetchingCases ? (
            <p className="text-sm text-gray-400">Loading cases...</p>
          ) : selectedCaseId && !selectedCase ? (
            <p className="text-sm text-gray-400">Case not found.</p>
          ) : selectedCaseId ? (
            <div className="space-y-4">
              <div>
                <h3 className="text-sm font-semibold text-white mb-2">Assigned Investigators</h3>
                <div className="flex flex-wrap gap-2">
                  {selectedCaseUsers.map((user) => (
                    <span
                      key={user.id}
                      className="inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1 text-xs text-white"
                    >
                      <span className="font-medium">{user.name || user.email || user.id}</span>
                      <button
                        type="button"
                        onClick={() => handleRemoveCaseUser(user.id)}
                        className="text-gray-300 hover:text-red-300"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </span>
                  ))}
                  {selectedCaseUsers.length === 0 && (
                    <span className="text-xs text-gray-500">No users assigned.</span>
                  )}
                </div>
              </div>

              <div className="flex flex-col sm:flex-row sm:items-center gap-3">
                <input
                  type="text"
                  value={caseUserSearchTerm}
                  onChange={(e) => setCaseUserSearchTerm(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      handleCaseUserSearch();
                    }
                  }}
                  placeholder="Search users to add"
                  className="flex-1 rounded-lg bg-gray-800 border border-gray-700 text-white px-3 py-2 text-sm placeholder-gray-500"
                />
                <button
                  type="button"
                  onClick={handleCaseUserSearch}
                  className="inline-flex items-center gap-2 px-4 py-2 bg-blue-700 hover:bg-blue-600 rounded-lg text-sm text-white"
                >
                  <UserPlus className="w-4 h-4" />
                  Search
                </button>
              </div>

              <div className="space-y-2">
                {caseUserResults.length > 0 ? (
                  caseUserResults.map((user) => (
                    <div
                      key={user.id}
                      className="flex items-center justify-between bg-gray-800 bg-opacity-60 border border-gray-700 rounded-lg px-3 py-2 text-xs"
                    >
                      <div>
                        <p className="text-white font-medium">{user.name || user.email || user.id}</p>
                        <p className="text-gray-400">{user.email}</p>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleAddCaseUser(user)}
                        className="inline-flex items-center gap-1 px-3 py-1 bg-green-600 hover:bg-green-500 rounded-full text-white"
                      >
                        <UserPlus className="w-3 h-3" /> Add
                      </button>
                    </div>
                  ))
                ) : caseUserSearchTerm ? (
                  <p className="text-xs text-gray-500">No users found.</p>
                ) : (
                  <p className="text-xs text-gray-500">Search to find users to assign.</p>
                )}
              </div>

              <div className="flex justify-end">
                <button
                  type="button"
                  onClick={handleSaveAssignments}
                  disabled={isAssigningUsers}
                  className={`inline-flex items-center gap-2 px-5 py-2 rounded-lg text-sm text-white ${
                    isAssigningUsers ? 'bg-blue-900 cursor-not-allowed opacity-60' : 'bg-blue-700 hover:bg-blue-600'
                  }`}
                >
                  {isAssigningUsers ? 'Saving...' : 'Update Assignments'}
                </button>
              </div>
            </div>
          ) : (
            <p className="text-sm text-gray-500">Select a case to manage user access.</p>
          )}
        </div>
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
