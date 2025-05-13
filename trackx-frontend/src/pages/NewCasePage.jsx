import React, { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { Upload, Info, CheckCircle, AlertCircle } from "lucide-react";
import Papa from "papaparse";
import adflogo from "../assets/image-removebg-preview.png";

function NewCasePage() {
  const navigate = useNavigate();
  const [caseNumber, setCaseNumber] = useState("");
  const [caseTitle, setCaseTitle] = useState("");
  const [dateOfIncident, setDateOfIncident] = useState("");
  const [region, setRegion] = useState("");
  const [between, setBetween] = useState("");
  const [file, setFile] = useState(null);
  const [parsedData, setParsedData] = useState(null);
  const [isDragging, setIsDragging] = useState(false);
  const [parseError, setParseError] = useState(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [csvStats, setCsvStats] = useState(null);
  const [showGuide, setShowGuide] = useState(false);

  /**
   * Determines ignition status based on description text
   * @param {string} description - The description text to analyze
   * @returns {string} - The determined ignition status
   */
  const determineIgnitionStatus = (description) => {
    if (!description) return null;
    
    // Convert to lowercase for case-insensitive matching
    const desc = description.toLowerCase();
    
    // Check for "stopped" indicators
    if (
      desc.includes('stopped') || 
      desc.includes('parked') || 
      desc.includes('stationary') ||
      desc.includes('ignition off') ||
      desc.includes('engine off') ||
      desc.includes('not moving') ||
      desc.includes('halt') ||
      desc.includes('standstill')
    ) {
      return 'Stopped';
    }
    
    // Check for "idling" indicators
    if (
      desc.includes('idling') || 
      desc.includes('idle') || 
      desc.includes('engine on') ||
      desc.includes('ignition on') ||
      desc.includes('running') ||
      desc.includes('waiting')
    ) {
      return 'Idle';
    }
    
    // Check for "moving" indicators
    if (
      desc.includes('moving') || 
      desc.includes('motion') || 
      desc.includes('driving') ||
      desc.includes('traveling') || 
      desc.includes('travelling') ||
      desc.includes('en route') ||
      desc.includes('in transit') ||
      desc.includes('speed')
    ) {
      return 'Moving';
    }
    
    // Default return if no match
    return null;
  };

  // Handle drag events
  const handleDragOver = (e) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setIsDragging(false);
    
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFile(e.dataTransfer.files[0]);
    }
  };

  // Handle file selection
  const handleFileSelect = (e) => {
    if (e.target.files && e.target.files[0]) {
      handleFile(e.target.files[0]);
    }
  };

  const handleFile = (file) => {
    // Check if file is CSV
    if (file.type === "text/csv" || file.name.toLowerCase().endsWith('.csv')) {
      setFile(file);
      parseCSV(file);
    } else {
      setParseError("Please upload a CSV file. Other file types will be supported in future iterations.");
      setFile(null);
      setParsedData(null);
      setCsvStats(null);
    }
  };

  // Parse CSV file
  const parseCSV = (file) => {
    setIsProcessing(true);
    setParseError(null);
    
    Papa.parse(file, {
      header: true, // First row is header
      dynamicTyping: true, // Convert numbers to numbers, not strings
      skipEmptyLines: true, // Skip empty rows
      complete: function(results) {
        setIsProcessing(false);
        
        if (results.errors.length > 0) {
          console.error("CSV parsing errors:", results.errors);
          setParseError(`Error parsing CSV: ${results.errors[0].message}. Check console for details.`);
          setParsedData(null);
          setCsvStats(null);
          return;
        }
        
        try {
          // Check if the CSV has any data
          if (!results.data || results.data.length === 0) {
            setParseError("CSV file appears to be empty");
            setParsedData(null);
            setCsvStats(null);
            return;
          }
          
          const firstRow = results.data[0];
          
          // Get all column names
          const columns = Object.keys(firstRow);
          console.log("CSV columns detected:", columns);
          
          // Try to identify potential column matches
          const possibleColumns = {
            lat: columns.filter(col => 
              col.toLowerCase().includes('lat') || 
              col.toLowerCase().includes('latitude')
            ),
            lng: columns.filter(col => 
              col.toLowerCase().includes('lon') || 
              col.toLowerCase().includes('lng') ||
              col.toLowerCase().includes('long')
            ),
            timestamp: columns.filter(col => 
              col.toLowerCase().includes('time') || 
              col.toLowerCase().includes('date') ||
              col.toLowerCase().includes('stamp')
            ),
            description: columns.filter(col => 
              col.toLowerCase().includes('desc') || 
              col.toLowerCase().includes('note') ||
              col.toLowerCase().includes('comment') ||
              col.toLowerCase().includes('text')
            ),
            ignition: columns.filter(col => 
              col.toLowerCase().includes('ignition') || 
              col.toLowerCase().includes('status') ||
              col.toLowerCase().includes('engine')
            )
          };
          
          console.log("Possible matches:", possibleColumns);
          
          // Check if we have at least potential matches for lat/lng
          if (possibleColumns.lat.length === 0 || possibleColumns.lng.length === 0) {
            setParseError("Could not identify latitude/longitude columns in the CSV");
            setParsedData(null);
            setCsvStats(null);
            return;
          }
          
          // Use the first match for each column type
          const bestColumns = {
            lat: possibleColumns.lat[0],
            lng: possibleColumns.lng[0],
            timestamp: possibleColumns.timestamp.length > 0 ? possibleColumns.timestamp[0] : null,
            description: possibleColumns.description.length > 0 ? possibleColumns.description[0] : null,
            ignition: possibleColumns.ignition.length > 0 ? possibleColumns.ignition[0] : null
          };
          
          // Process the data using our best column matches
          const processedData = results.data.map((row, index) => {
            // Get lat/lng values from the identified columns
            const lat = parseFloat(row[bestColumns.lat]);
            const lng = parseFloat(row[bestColumns.lng]);
            
            // Get description if available
            const description = bestColumns.description ? row[bestColumns.description] : null;
            
            // Get ignition status from column or derive from description
            let ignitionStatus = bestColumns.ignition ? row[bestColumns.ignition] : null;
            
            // If ignition status is not available but description is, try to determine it
            if ((!ignitionStatus || ignitionStatus === '') && description) {
              ignitionStatus = determineIgnitionStatus(description);
            }
            
            // Get timestamp if available
            const timestamp = bestColumns.timestamp ? row[bestColumns.timestamp] : `Record ${index + 1}`;
            
            return {
              id: index,
              lat,
              lng,
              timestamp,
              description,
              ignitionStatus,
              rawData: row // Store the full row data for reference
            };
          }).filter(item => {
            // Filter out any rows with invalid lat/lng
            return !isNaN(item.lat) && !isNaN(item.lng);
          });
          
          if (processedData.length === 0) {
            setParseError("No valid GPS coordinates found in the CSV");
            setParsedData(null);
            setCsvStats(null);
            return;
          }
          
          // Filter only "Stopped" or "Off" or "Idle" ignition status points
          const stoppedPoints = processedData.filter(point => {
            if (!point.ignitionStatus) return false;
            
            const status = String(point.ignitionStatus).toLowerCase();
            return status === "stopped" || 
                   status === "off" || 
                   status === "idle";
          });
          
          if (stoppedPoints.length === 0) {
            setParseError("No stopped or idle vehicle points found in the CSV.");
            setParsedData(null);
            setCsvStats({
              totalPoints: processedData.length,
              stoppedPoints: 0,
              columnsUsed: bestColumns
            });
            return;
          }
          
          // Set parsed data
          setParsedData({
            raw: processedData,
            stoppedPoints: stoppedPoints
          });
          
          // Set CSV stats for display
          setCsvStats({
            totalPoints: processedData.length,
            stoppedPoints: stoppedPoints.length,
            columnsUsed: bestColumns,
            derivedStatus: !bestColumns.ignition || 
                           processedData.some(p => !p.ignitionStatus && determineIgnitionStatus(p.description))
          });
          
        } catch (error) {
          console.error("Error processing CSV data:", error);
          setParseError(`Error processing CSV data: ${error.message}`);
          setParsedData(null);
          setCsvStats(null);
        }
      },
      error: function(error) {
        console.error("Error reading CSV file:", error);
        setIsProcessing(false);
        setParseError(`Error reading CSV file: ${error.message}`);
        setParsedData(null);
        setCsvStats(null);
      }
    });
  };

  // Handle form submission
  const handleNext = (e) => {
    e.preventDefault();
    
    // Basic validation
    if (!caseNumber || !caseTitle || !dateOfIncident || !region || !file || !parsedData) {
      alert("Please fill all required fields and upload a valid CSV file");
      return;
    }
    
    // Create the complete case data object
    const caseData = {
      caseNumber,
      caseTitle,
      dateOfIncident,
      region,
      between,
      locations: parsedData.stoppedPoints
    };
    
    // Store in localStorage to share with other pages
    localStorage.setItem('trackxCaseData', JSON.stringify(caseData));
    
    // Navigate to annotations page
    navigate("/annotations");
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 1 }}
      className="relative min-h-screen text-white font-sans overflow-hidden"
    >
      {/* Gradient Background */}
      <div className="absolute inset-0 bg-gradient-to-br from-black via-gray-900 to-black -z-10" />
      {/* Navbar */}
      <div className="flex items-center justify-between px-6 py-4 bg-gradient-to-r from-black to-gray-900 shadow-md">
      <Link to="/home">
      <img src={adflogo} alt="Logo" className="h-12 cursor-pointer hover:opacity-80 transition" />
      </Link>

        <h1 className="text-xl font-bold text-white">New Case</h1>

        <div className="flex items-center space-x-4">
          <div>
            <p className="text-sm">Name Surname</p>
            <button className="text-red-400 hover:text-red-600 text-xs">Sign Out</button>
          </div>
        </div>
      </div>

      {/* Nav Tabs - Updated with clickable links */}
      <div className="flex justify-center space-x-8 bg-gray-800 py-2 text-white text-sm">
        <span className="font-bold underline">Case Information</span>
        <Link to="/annotations" className="text-gray-400 hover:text-white">Annotations</Link>
        <Link to="/overview" className="text-gray-400 hover:text-white">Overview</Link>
      </div>

      {/* Page Content */}
      <div className="max-w-4xl mx-auto px-6 py-8">
        <form onSubmit={handleNext} className="space-y-6">
          {/* Case Details Section */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Case Number */}
            <div>
              <label htmlFor="caseNumber" className="block text-sm font-medium text-gray-300 mb-1">
                Case Number *
              </label>
              <input
                type="text"
                id="caseNumber"
                value={caseNumber}
                onChange={(e) => setCaseNumber(e.target.value)}
                className="w-full p-2 bg-gray-800 border border-gray-600 rounded text-white"
                required
              />
            </div>

            {/* Case Title */}
            <div>
              <label htmlFor="caseTitle" className="block text-sm font-medium text-gray-300 mb-1">
                Case Title *
              </label>
              <input
                type="text"
                id="caseTitle"
                value={caseTitle}
                onChange={(e) => setCaseTitle(e.target.value)}
                className="w-full p-2 bg-gray-800 border border-gray-600 rounded text-white"
                required
              />
            </div>

            {/* Date of Incident */}
            <div>
              <label htmlFor="dateOfIncident" className="block text-sm font-medium text-gray-300 mb-1">
                Date of Incident *
              </label>
              <input
                type="date"
                id="dateOfIncident"
                value={dateOfIncident}
                onChange={(e) => setDateOfIncident(e.target.value)}
                className="w-full p-2 bg-gray-800 border border-gray-600 rounded text-white"
                required
              />
            </div>

            {/* Region */}
            <div>
              <label htmlFor="region" className="block text-sm font-medium text-gray-300 mb-1">
                Region *
              </label>
              <select
                id="region"
                value={region}
                onChange={(e) => setRegion(e.target.value)}
                className="w-full p-2 bg-gray-800 border border-gray-600 rounded text-white"
                required
              >
                <option value="">Select a region</option>
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

            {/* Between */}
            <div className="md:col-span-2">
              <label htmlFor="between" className="block text-sm font-medium text-gray-300 mb-1">
                Between
              </label>
              <input
                type="text"
                id="between"
                value={between}
                onChange={(e) => setBetween(e.target.value)}
                className="w-full p-2 bg-gray-800 border border-gray-600 rounded text-white"
                placeholder="e.g. The State vs. John Doe"
              />
            </div>
          </div>

          {/* File Upload Section */}
          <div className="mt-8">
            <div className="flex items-center justify-between mb-2">
              <label className="block text-sm font-medium text-gray-300">
                Upload GPS Coordinates (CSV) *
              </label>
              <button 
                type="button"
                onClick={() => setShowGuide(!showGuide)}
                className="text-blue-400 hover:text-blue-300 text-sm flex items-center"
              >
                <Info className="w-4 h-4 mr-1" />
                {showGuide ? "Hide Guide" : "View CSV Guide"}
              </button>
            </div>

            {/* CSV Guide - Only shown when toggled */}
            {showGuide && (
              <div className="bg-gray-800 p-4 rounded-lg text-sm text-gray-300 mb-4">
                <h3 className="font-semibold mb-2">CSV Format Guide:</h3>
                <p className="mb-2">Your CSV should include the following columns:</p>
                <ul className="list-disc pl-5 space-y-1">
                  <li>Latitude (decimal coordinates - column name containing "lat" or "latitude")</li>
                  <li>Longitude (decimal coordinates - column name containing "lng", "lon", or "longitude")</li>
                  <li>Description (optional - column name containing "desc", "note", or "comment")</li>
                  <li>Ignition Status (optional if Description is provided - column name containing "ignition" or "status")</li>
                  <li>Timestamp (optional - column name containing "time", "date", or "stamp")</li>
                </ul>
                <p className="mt-2 text-xs text-gray-400">The system will try to automatically identify these columns in your CSV.</p>
                <div className="mt-3 pt-3 border-t border-gray-700">
                  <p className="font-semibold mb-1">Intelligent Ignition Status Detection:</p>
                  <p className="mb-2 text-xs text-gray-400">
                    If an ignition status column isn't found or values are missing, the system will analyze 
                    the description column to determine vehicle status based on keywords:
                  </p>
                  <div className="grid grid-cols-3 gap-2 text-xs mt-2">
                    <div className="p-2 bg-red-900 bg-opacity-20 rounded">
                      <p className="font-semibold text-red-400 mb-1">Stopped</p>
                      <p className="text-gray-400">stopped, parked, ignition off, engine off, stationary, halt, standstill</p>
                    </div>
                    <div className="p-2 bg-yellow-900 bg-opacity-20 rounded">
                      <p className="font-semibold text-yellow-400 mb-1">Idle</p>
                      <p className="text-gray-400">idling, idle, engine on, ignition on, running, waiting</p>
                    </div>
                    <div className="p-2 bg-green-900 bg-opacity-20 rounded">
                      <p className="font-semibold text-green-400 mb-1">Moving</p>
                      <p className="text-gray-400">moving, motion, driving, traveling, speed, en route, in transit</p>
                    </div>
                  </div>
                </div>
              </div>
            )}
            
            <div
              className={`border-2 border-dashed p-8 rounded-lg flex flex-col items-center justify-center cursor-pointer
               ${isDragging ? 'border-blue-500 bg-blue-900 bg-opacity-20' : 'border-gray-600'} 
               ${file && !parseError ? 'bg-green-900 bg-opacity-20' : ''} 
               ${parseError ? 'bg-red-900 bg-opacity-20' : ''}`}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              onClick={() => document.getElementById('file-upload').click()}
            >
              <input
                id="file-upload"
                type="file"
                accept=".csv"
                className="hidden"
                onChange={handleFileSelect}
              />
              
              {isProcessing ? (
                <div className="text-center">
                  <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-blue-500 mx-auto mb-4"></div>
                  <div className="text-blue-400 mb-2">Processing file...</div>
                  <div className="text-xs text-gray-400">Analyzing CSV structure and extracting location data</div>
                </div>
              ) : file && !parseError ? (
                <div className="text-center">
                  <CheckCircle className="h-8 w-8 text-green-400 mx-auto mb-2" />
                  <div className="text-green-400 mb-2">File processed successfully</div>
                  <p className="text-gray-300">{file.name}</p>
                  {csvStats && (
                    <div className="text-gray-400 mt-3 text-sm">
                      <p>Total data points: {csvStats.totalPoints}</p>
                      <p>Stopped locations: {csvStats.stoppedPoints}</p>
                      {csvStats.columnsUsed && (
                        <div className="mt-2 text-xs">
                          <p>Using columns:</p>
                          <p>Latitude: {csvStats.columnsUsed.lat}</p>
                          <p>Longitude: {csvStats.columnsUsed.lng}</p>
                          {csvStats.columnsUsed.ignition && (
                            <p>Ignition Status: {csvStats.columnsUsed.ignition}</p>
                          )}
                          {csvStats.columnsUsed.description && (
                            <p>Description: {csvStats.columnsUsed.description}</p>
                          )}
                          {csvStats.columnsUsed.timestamp && (
                            <p>Timestamp: {csvStats.columnsUsed.timestamp}</p>
                          )}
                          {csvStats.derivedStatus && (
                            <p className="mt-1 text-yellow-400">Using descriptions to determine vehicle status</p>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ) : parseError ? (
                <div className="text-center">
                  <AlertCircle className="h-8 w-8 text-red-400 mx-auto mb-2" />
                  <div className="text-red-400 mb-2">Error processing file</div>
                  <p className="text-red-300 max-w-md">{parseError}</p>
                  <p className="text-gray-400 mt-2">Click to try another file</p>
                </div>
              ) : (
                <>
                  <Upload className="h-12 w-12 text-gray-400 mb-4" />
                  <p className="text-gray-300 mb-2">Drag and drop your CSV file here</p>
                  <p className="text-gray-500 text-sm">or click to browse</p>
                </>
              )}
            </div>
          </div>

          {/* Navigation Buttons */}
          <div className="flex justify-between mt-10">
            <Link 
              to="/home" 
              className="px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded text-white"
            >
              Cancel
            </Link>
            <button 
              type="submit" 
              className={`px-4 py-2 rounded text-white ${parsedData && parsedData.stoppedPoints.length > 0 ? 'bg-blue-700 hover:bg-blue-600' : 'bg-blue-900 cursor-not-allowed opacity-50'}`}
              disabled={!parsedData || parsedData.stoppedPoints.length === 0}
            >
              Next
            </button>
          </div>
        </form>
      </div>
    </motion.div>
  );
}

export default NewCasePage;