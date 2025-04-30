import { Link } from "react-router-dom";
import { FaSearch, FaMapMarkerAlt, FaCalendarAlt } from "react-icons/fa";
import adfLogo from "../assets/adf-logo.png";

function ManageCasesPage() {
  return (
    <div className="relative flex flex-col min-h-screen">
      {/* Gradient Background */}
      <div className="absolute inset-0 bg-gradient-to-br from-black via-gray-900 to-black -z-20" />

      {/* Navbar */}
      <nav className="flex justify-between items-center bg-black bg-opacity-60 backdrop-blur-md p-4 relative font-sans">
        <div className="flex items-center space-x-4">
          <div className="text-white text-3xl cursor-pointer">&#9776;</div>
          <img src={adfLogo} alt="ADF Logo" className="h-10 w-auto" />
        </div>

        <div className="absolute left-1/2 transform -translate-x-1/2 text-3xl font-extrabold text-white font-sans">
          Manage Cases
        </div>

        <div className="flex items-center space-x-6 text-white font-sans">
          <Link to="/home" className="hover:text-gray-300">Home</Link>
          <div className="flex flex-col text-right">
            <span className="text-white">Username</span>
            <button className="text-sm text-gray-300 hover:text-white">Sign Out</button>
          </div>
          <div className="text-sm text-gray-300">
            {new Date().toLocaleString()}
          </div>
        </div>
      </nav>

      {/* Main Content */}
      <main className="flex flex-col flex-grow p-8 space-y-6 items-center">
        {/* Back Home Button */}
        <div className="w-full max-w-6xl">
          <Link
            to="/home"
            className="bg-blue-800 text-white px-4 py-2 rounded hover:bg-blue-700 transition-colors duration-200"
          >
            Back Home
          </Link>
        </div>

        {/* Search Row */}
        <div className="flex flex-wrap justify-between items-center w-full max-w-6xl space-y-4 md:space-y-0 md:space-x-4">
          {/* Search Case */}
          <div className="relative flex-1 min-w-[200px]">
            <FaSearch className="absolute left-3 top-2.5 text-gray-400" />
            <input
              type="text"
              placeholder="Search Case"
              className="pl-10 pr-4 py-2 w-full rounded bg-white bg-opacity-10 text-white border border-gray-600 placeholder-gray-400"
              onFocus={(e) => e.target.placeholder = ''}
              onBlur={(e) => e.target.placeholder = 'Search Case'}
            />
          </div>

          {/* Region Filter */}
          <div className="relative flex-1 min-w-[160px]">
            <FaMapMarkerAlt className="absolute left-3 top-2.5 text-gray-400" />
            <input
              type="text"
              placeholder="Region"
              className="pl-10 pr-4 py-2 w-full rounded bg-white bg-opacity-10 text-white border border-gray-600 placeholder-gray-400"
            />
          </div>

          {/* Date Filter */}
          <div className="relative flex-1 min-w-[160px]">
            <FaCalendarAlt className="absolute left-3 top-2.5 text-gray-400" />
            <input
              type="date"
              className="pl-10 pr-4 py-2 w-full rounded bg-white bg-opacity-10 text-white border border-gray-600"
            />
          </div>
        </div>

        {/* Case List */}
        <div className="w-full max-w-4xl bg-white bg-opacity-10 border border-gray-700 rounded-lg p-6">
          <h2 className="text-xl font-semibold mb-4 text-blue-500">Matching Cases</h2>
          <ul className="space-y-4">
            {["ADF_XY_PE_2025", "ADF_XY_KZN_2024", "ADF_XY_KZN_2024", "ADF_XM_FLKN_2023"].map((caseId, index) => (
              <li key={index} className="flex justify-between items-center border-b border-gray-700 pb-2">
                <span className="text-gray-300">{caseId}</span>
                <button className="text-sm border border-gray-300 text-white py-1 px-3 rounded hover:bg-blue-800 hover:text-white transition-colors duration-200">
                  Manage
                </button>
              </li>
            ))}
          </ul>
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
      </main>
    </div>
  );
}

export default ManageCasesPage;
