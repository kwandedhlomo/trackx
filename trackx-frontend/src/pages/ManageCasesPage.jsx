import { Link } from "react-router-dom";
import { FaSearch, FaMapMarkerAlt, FaCalendarAlt } from "react-icons/fa";
import adfLogo from "../assets/image-removebg-preview.png";
import { useState, useEffect } from "react";
import axios from "axios";
import { useAuth } from "../context/AuthContext";
import { signOut } from "firebase/auth";
import { auth } from "../firebase";
import { useNavigate } from "react-router-dom";
import NotificationModal from "../components/NotificationModal";
import useNotificationModal from "../hooks/useNotificationModal";
import { getFriendlyErrorMessage } from "../utils/errorMessages";
import { Home, FilePlus2, FolderOpen, Briefcase, LayoutDashboard } from "lucide-react";



function ManageCasesPage() {
  const [searchTerm, setSearchTerm] = useState("");
  const [region, setRegion] = useState("");
  const [date, setDate] = useState("");
  const [cases, setCases] = useState([]);
  const { profile } = useAuth();
  const navigate = useNavigate(); 
  const [showMenu, setShowMenu] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const casesPerPage = 10; // You can change this value based on your preference
  const indexOfLastCase = currentPage * casesPerPage;
  const indexOfFirstCase = indexOfLastCase - casesPerPage;
  const currentCases = cases.slice(indexOfFirstCase, indexOfLastCase);
  const totalPages = Math.ceil(cases.length / casesPerPage);
  const { modalState, openModal, closeModal } = useNotificationModal();

  useEffect(() => {
    handleSearch(); // Triggers unfiltered search on first load
  }, []);
  


  const handleSearch = async () => {
    try {
      const response = await axios.get("http://localhost:8000/cases/search", {
        params: {
          case_name: searchTerm || undefined,
          region: region || undefined,
          date: date || undefined,
        }
      });
      setCases(response.data.cases); 
    } catch (error) {
      console.error("Search failed:", error);
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

  const performDelete = async (caseItem) => {
    closeModal();
    try {
      await axios.delete(`http://localhost:8000/cases/delete/${caseItem.doc_id}`);
      openModal({
        variant: "success",
        title: "Case deleted",
        description: `“${caseItem.caseTitle}” has been removed successfully.`,
      });
      handleSearch(); 
    } catch (err) {
      console.error("Delete failed:", err);
      openModal({
        variant: "error",
        title: "Delete failed",
        description: getFriendlyErrorMessage(err, "Failed to delete the case. Please try again."),
      });
    }
  };

  const confirmDelete = (caseItem) => {
    openModal({
      variant: "warning",
      title: "Delete case?",
      description: `Are you sure you want to delete “${caseItem.caseTitle}”? This action cannot be undone.`,
      primaryAction: {
        label: "Delete case",
        closeOnClick: false,
        onClick: () => performDelete(caseItem),
      },
      secondaryAction: {
        label: "Cancel",
      },
    });
  };

  return (
    <div className="relative flex flex-col min-h-screen">
      {/* Background */}
      <div className="absolute inset-0 bg-gradient-to-br from-black via-gray-900 to-black -z-20" />
  
      {/* Navbar */}
      <nav className="flex justify-between items-center bg-gradient-to-r from-black to-gray-900 p-4 relative font-sans shadow-md">        <div className="flex items-center space-x-4">
          {/* Hamburger Icon */}
          <div className="text-white text-3xl cursor-pointer" onClick={() => setShowMenu(!showMenu)}>
            &#9776;
          </div>
  
          <Link to="/home">
            <img src={adfLogo} alt="ADF Logo" className="h-10 w-auto cursor-pointer hover:opacity-80 transition" />
          </Link>
        </div>
  
        {/* Centered Title */}
        <div className="absolute left-1/2 transform -translate-x-1/2 text-3xl font-extrabold text-white font-sans">
          Manage Cases
        </div>
  
        <div className="flex items-center space-x-6 text-white font-sans">
          <Link to="/home" className="hover:text-gray-300">Home</Link>
          <div className="flex flex-col text-right">
            <p className="text-sm">{profile ? `${profile.firstName} ${profile.surname}` : "Loading..."}</p>
            <button onClick={handleSignOut} className="text-red-400 hover:text-red-600 text-xs">Sign Out</button>
          </div>
          <div className="text-sm text-gray-300">
            {new Date().toLocaleString()}
          </div>
        </div>
      </nav>
  
      {/* Hamburger Menu Content */}
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
          <div className="flex items-center gap-3 px-3 py-2 rounded-2xl text-sm font-medium text-white bg-white/10">
            <FolderOpen className="w-4 h-4" />
            Manage Cases
          </div>
          <Link
            to="/my-cases"
            className="flex items-center gap-3 px-3 py-2 rounded-2xl text-sm font-medium text-gray-200 hover:text-white hover:bg-white/10 transition"
            onClick={() => setShowMenu(false)}
          >
            <Briefcase className="w-4 h-4" />
            My Cases
          </Link>

          {profile?.role === "admin" && (
            <Link
              to="/admin-dashboard"
              className="flex items-center gap-3 px-3 py-2 rounded-2xl text-sm font-medium text-gray-200 hover:text-white hover:bg-white/10 transition"
              onClick={() => setShowMenu(false)}
            >
              <LayoutDashboard className="w-4 h-4" />
              Admin Dashboard
            </Link>
          )}
        </div>
      )}

      {/* Main Content */}
      <main className="flex flex-col flex-grow p-8 space-y-6 items-center">
        <div className="w-full max-w-6xl">
          <Link to="/home" className="bg-blue-800 text-white px-4 py-2 rounded hover:bg-blue-700 transition-colors duration-200">
            Back Home
          </Link>
        </div>

        {/* Filters */}
        <div className="flex flex-wrap justify-between items-center w-full max-w-6xl space-y-4 md:space-y-0 md:space-x-4">
          <div className="relative flex-1 min-w-[200px]">
            <FaSearch className="absolute left-3 top-2.5 text-gray-400" />
            <input
              type="text"
              placeholder="Search Case"
              className="pl-10 pr-4 py-2 w-full rounded bg-white bg-opacity-10 text-white border border-gray-600 placeholder-gray-400"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              onFocus={(e) => e.target.placeholder = ''}
              onBlur={(e) => e.target.placeholder = 'Search Case'}
            />
          </div>

          <div className="relative flex-1 min-w-[160px]">
            <FaMapMarkerAlt className="absolute left-3 top-2.5 text-gray-400" />
            <select
              className="pl-10 pr-4 py-2 w-full rounded bg-white bg-opacity-10 text-white border border-gray-600"
              value={region}
              onChange={(e) => setRegion(e.target.value)}
            >
              <option value="" disabled>Select Region</option>
              <option value="western-cape">Western Cape</option>
              <option value="eastern-cape">Eastern Cape</option>
              <option value="northern-cape">Northern Cape</option>
              <option value="gauteng">Gauteng</option>
              <option value="kwazulu-natal">KwaZulu-Natal</option>
              <option value="free-state">Free State</option>
              <option value="mpumalanga">Mpumalanga</option>
              <option value="limpopo">Limpopo</option>
              <option value="north-west">North West</option>
            </select>
          </div>

          <div className="relative flex-1 min-w-[160px]">
            <FaCalendarAlt className="absolute left-3 top-2.5 text-gray-400" />
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="pl-10 pr-4 py-2 w-full rounded bg-white bg-opacity-10 text-white border border-gray-600"
            />
          </div>

          <button
            onClick={handleSearch}
            className="bg-blue-700 text-white px-4 py-2 rounded hover:bg-blue-600"
          >
            Search
          </button>
        </div>


      {/* Case List */}
      <div className="w-full max-w-4xl bg-white bg-opacity-10 border border-gray-700 rounded-lg p-6">
        <h2 className="text-xl font-semibold mb-4 text-blue-500">Matching Cases</h2>
        <ul className="space-y-4">
          {currentCases.map((caseItem, index) => (
            <li key={index} className="flex justify-between items-center bg-black bg-opacity-20 rounded px-4 py-3 border border-gray-600">
              <span className="text-white font-medium">{caseItem.caseTitle}</span>
              <div className="flex space-x-2">
                <Link
                  to="/edit-case"
                  state={{ caseData: { ...caseItem, doc_id: caseItem.doc_id } }}
                  className="bg-blue-700 text-white px-4 py-2 rounded hover:bg-blue-600 transition"
                >
                  Manage
                </Link>
                <button
                  onClick={() => confirmDelete(caseItem)}
                  className="bg-red-700 text-white px-4 py-2 rounded hover:bg-red-600 transition"
                >
                  Delete
                </button>
              </div>
            </li>
          ))}
        </ul>
      </div>

      <div className="flex justify-center mt-4 space-x-2">
        <button
          onClick={() => setCurrentPage((prev) => Math.max(prev - 1, 1))}
          disabled={currentPage === 1}
          className="px-4 py-2 bg-gray-700 text-white rounded disabled:opacity-50"
        >
          Previous
        </button>

        <span className="text-white px-4 py-2">
          Page {currentPage} of {totalPages}
        </span>

        <button
          onClick={() => setCurrentPage((prev) => Math.min(prev + 1, totalPages))}
          disabled={currentPage === totalPages}
          className="px-4 py-2 bg-gray-700 text-white rounded disabled:opacity-50"
        >
          Next
        </button>
      </div>

        {/* Create Button */}
        <div className="flex justify-end w-full max-w-4xl">
          <Link
            to="/new-case"
            className="flex items-center border border-blue-800 text-blue-800 font-bold py-3 px-6 rounded-full shadow hover:bg-blue-800 hover:text-white transition-colors duration-200"
          >
            ＋ Create
          </Link>
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
      </main>
    </div>
  );
}

export default ManageCasesPage;
