import React, { useState, useEffect, useRef } from "react";
import { Link } from "react-router-dom";
import adflogo from "../assets/image-removebg-preview.png";
import { motion } from "framer-motion";
import { AlertTriangle, MapPin, FileText, Camera } from "lucide-react";
import jsPDF from "jspdf";

function OverviewPage() {
  // Create refs for PDF report generation
  const reportRef = useRef(null);
  
  // State to store case data and selected locations
  const [caseDetails, setCaseDetails] = useState({});
  const [locations, setLocations] = useState([]);
  const [selectedLocations, setSelectedLocations] = useState([]);
  const [reportIntro, setReportIntro] = useState("");
  const [reportConclusion, setReportConclusion] = useState("");
  const [generateReport, setGenerateReport] = useState(true);
  const [generateSimulation, setGenerateSimulation] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [generatedReports, setGeneratedReports] = useState([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [snapshots, setSnapshots] = useState([]);
  const [snapshotsAvailable, setSnapshotsAvailable] = useState(false);
  const [locationTitles, setLocationTitles] = useState([]);

  // Load case data from localStorage when component mounts
  useEffect(() => {
    setIsLoading(true);
    try {
      // Get data from localStorage
      const caseDataString = localStorage.getItem('trackxCaseData');
      
      if (!caseDataString) {
        setError("No case data found. Please create a new case first.");
        setIsLoading(false);
        return;
      }
      
      const caseData = JSON.parse(caseDataString);
      
      // Check if locations exist
      if (!caseData.locations || caseData.locations.length === 0) {
        setError("No location data found in the case.");
        setIsLoading(false);
        return;
      }
      
      // Store case details
      setCaseDetails({
        caseNumber: caseData.caseNumber,
        caseTitle: caseData.caseTitle,
        dateOfIncident: caseData.dateOfIncident,
        region: caseData.region,
        between: caseData.between || 'Not specified'
      });
      
      // Set the locations
      setLocations(caseData.locations);
      
      // Set selected locations (if available from previous session)
      if (caseData.selectedForReport && Array.isArray(caseData.selectedForReport)) {
        setSelectedLocations(caseData.selectedForReport);
      }
      
      // Set report intro/conclusion if available
      if (caseData.reportIntro) {
        setReportIntro(caseData.reportIntro);
      }
      
      if (caseData.reportConclusion) {
        setReportConclusion(caseData.reportConclusion);
      }
      
      // Load any previously generated reports
      if (caseData.generatedReports && Array.isArray(caseData.generatedReports)) {
        setGeneratedReports(caseData.generatedReports);
      }
      
      // Check for stored location titles
      if (caseData.locationTitles && Array.isArray(caseData.locationTitles)) {
        setLocationTitles(caseData.locationTitles);
      } else {
        // Initialize empty location titles array
        setLocationTitles(Array(caseData.locations.length).fill(""));
      }

      
      const storedSnapshots = sessionStorage.getItem('locationSnapshots');
      if (storedSnapshots) {
        const parsedSnapshots = JSON.parse(storedSnapshots);
        setSnapshots(parsedSnapshots);
        setSnapshotsAvailable(true);
      }
      
      setIsLoading(false);
    } catch (error) {
      console.error("Error loading case data:", error);
      setError("Error loading case data: " + error.message);
      setIsLoading(false);
    }
  }, []);

  // Save all data to localStorage
  const saveData = () => {
    try {
      const caseDataString = localStorage.getItem('trackxCaseData');
      if (caseDataString) {
        const caseData = JSON.parse(caseDataString);
        
        // Update case data
        const updatedCaseData = {
          ...caseData,
          reportIntro,
          reportConclusion,
          selectedForReport: selectedLocations,
          generatedReports,
          locationTitles
        };
        
        localStorage.setItem('trackxCaseData', JSON.stringify(updatedCaseData));
      }
    } catch (error) {
      console.error("Error saving data:", error);
      alert("There was an error saving your data. Please try again.");
    }
  };

 
  const generatePDF = async () => {
    if (!reportRef.current) return null;
    
    try {
      // Create a new jsPDF instance
      const pdf = new jsPDF('p', 'mm', 'a4');
      const pdfWidth = pdf.internal.pageSize.getWidth();
      const pdfHeight = pdf.internal.pageSize.getHeight();
      const margin = 10; // margin in mm
      
      // Add report title
      pdf.setFontSize(22);
      pdf.setTextColor(40, 40, 40);
      pdf.text(`Case Report: ${caseDetails.caseTitle}`, margin, margin + 10);
      
      // Add case information
      pdf.setFontSize(12);
      pdf.setTextColor(60, 60, 60);
      pdf.text(`Case Number: ${caseDetails.caseNumber}`, margin, margin + 20);
      pdf.text(`Date of Incident: ${caseDetails.dateOfIncident}`, margin, margin + 25);
      pdf.text(`Region: ${caseDetails.region}`, margin, margin + 30);
      pdf.text(`Between: ${caseDetails.between}`, margin, margin + 35);
      
      // Add report introduction
      if (reportIntro) {
        pdf.setFontSize(14);
        pdf.setTextColor(40, 40, 40);
        pdf.text('Introduction', margin, margin + 45);
        pdf.setFontSize(10);
        pdf.setTextColor(60, 60, 60);
        
        // Handle text wrapping for long introduction text
        const splitIntro = pdf.splitTextToSize(reportIntro, pdfWidth - (margin * 2));
        pdf.text(splitIntro, margin, margin + 50);
      }
      
      // Current vertical position for next content
      let yPosition = margin + (reportIntro ? 55 + (pdf.splitTextToSize(reportIntro, pdfWidth - (margin * 2)).length * 5) : 45);
      
      // Add locations section header
      pdf.setFontSize(14);
      pdf.setTextColor(40, 40, 40);
      pdf.text('Selected Locations', margin, yPosition);
      yPosition += 8;
      
      // Add selected locations
      const filteredLocations = locations.filter((_, index) => selectedLocations.includes(index));
      
      for (let i = 0; i < filteredLocations.length; i++) {
        const location = filteredLocations[i];
        const locationIndex = locations.indexOf(location);
        
        // Check if we need a new page
        if (yPosition > pdfHeight - margin * 2) {
          pdf.addPage();
          yPosition = margin + 10;
        }
        
        // Location title
        pdf.setFontSize(12);
        pdf.setTextColor(40, 40, 40);
        const locationTitle = locationTitles[locationIndex] || getLocationAddress(location);
        pdf.text(locationTitle, margin, yPosition);
        yPosition += 5;
        
        // Location coordinates
        pdf.setFontSize(9);
        pdf.setTextColor(80, 80, 80);
        pdf.text(`Coordinates: ${formatCoordinate(location.lat)}, ${formatCoordinate(location.lng)}`, margin, yPosition);
        yPosition += 4;
        
        // Location timestamp if available
        if (location.timestamp) {
          pdf.text(`Time: ${formatTimestamp(location.timestamp)}`, margin, yPosition);
          yPosition += 4;
        }
        
        
        const snapshot = snapshots.find(s => s && s.index === locationIndex);
        if (snapshot) {
          // Add map image if available
          if (snapshot.mapImage) {
            try {
              pdf.addImage(snapshot.mapImage, 'PNG', margin, yPosition, 80, 60);
              yPosition += 65; // Advance position past the image height plus some margin
            } catch (error) {
              console.error("Error adding map image to PDF:", error);
            }
          }
          
          // Add street view image if available
          if (snapshot.streetViewImage) {
            // Check if we need a new page
            if (yPosition > pdfHeight - 70) {
              pdf.addPage();
              yPosition = margin + 10;
            }
            
            try {
              pdf.addImage(snapshot.streetViewImage, 'PNG', margin, yPosition, 80, 60);
              yPosition += 65; // Advance position past the image height plus some margin
            } catch (error) {
              console.error("Error adding street view image to PDF:", error);
            }
          }
          
          // Location description if available
          if (snapshot.description) {
            // Check if we need a new page
            if (yPosition > pdfHeight - margin * 4) {
              pdf.addPage();
              yPosition = margin + 10;
            }
            
            pdf.setFontSize(10);
            pdf.setTextColor(60, 60, 60);
            const splitDesc = pdf.splitTextToSize(snapshot.description, pdfWidth - (margin * 2));
            pdf.text(splitDesc, margin, yPosition);
            yPosition += splitDesc.length * 5;
          }
        }
        
        // Add some spacing between locations
        yPosition += 8;
      }
      
      // Check if we need a new page for conclusion
      if (reportConclusion && yPosition > pdfHeight - margin * 4) {
        pdf.addPage();
        yPosition = margin + 10;
      }
      
      // Add report conclusion
      if (reportConclusion) {
        pdf.setFontSize(14);
        pdf.setTextColor(40, 40, 40);
        pdf.text('Conclusion', margin, yPosition);
        yPosition += 5;
        
        pdf.setFontSize(10);
        pdf.setTextColor(60, 60, 60);
        const splitConclusion = pdf.splitTextToSize(reportConclusion, pdfWidth - (margin * 2));
        pdf.text(splitConclusion, margin, yPosition);
      }
      
      // Footer with date generated
      pdf.setFontSize(8);
      pdf.setTextColor(150, 150, 150);
      pdf.text(`Report generated on ${new Date().toLocaleDateString()} by TrackX`, margin, pdfHeight - 5);
      
      // Return the PDF document
      return pdf;
    } catch (error) {
      console.error("Error generating PDF:", error);
      return null;
    }
  };
  
  // Format timestamp display for PDF
  const formatTimestamp = (timestamp) => {
    if (!timestamp) return "Not available";
    
    // Try to format as a date if it's a valid date string
    const date = new Date(timestamp);
    if (!isNaN(date.getTime())) {
      return date.toLocaleString();
    }
    
    // Otherwise just return the raw timestamp
    return timestamp;
  };
  
  // Generate the report and/or simulation
  const handleGenerate = async () => {
    setIsGenerating(true);
    
    const newReports = [...generatedReports];
    const timestamp = new Date().toISOString().split('T')[0];
    const reportFilename = `Report_${caseDetails.caseNumber}_${timestamp}.pdf`;
    
    try {
      // Generate the PDF if report option is selected
      if (generateReport) {
        const pdf = await generatePDF();
        
        if (pdf) {
          // Save the PDF
          pdf.save(reportFilename);
          
          // Add to generated reports list
          newReports.push({
            id: Date.now(),
            type: 'report',
            name: reportFilename,
            date: new Date().toISOString(),
            pdf: true // Flag to indicate this is a real PDF
          });
        }
      }
      
      // Handle simulation generation (mock for now)
      if (generateSimulation) {
        const simulationFilename = `Simulation_${caseDetails.caseNumber}_${timestamp}.mp4`;
        // Simulate generation delay
        await new Promise(resolve => setTimeout(resolve, 1500));
        
        newReports.push({
          id: Date.now() + 1,
          type: 'simulation',
          name: simulationFilename,
          date: new Date().toISOString()
        });
      }
      
      setGeneratedReports(newReports);
      
      // Save to localStorage
      const caseDataString = localStorage.getItem('trackxCaseData');
      if (caseDataString) {
        const caseData = JSON.parse(caseDataString);
        const updatedCaseData = {
          ...caseData,
          generatedReports: newReports,
          reportIntro,
          reportConclusion
        };
        localStorage.setItem('trackxCaseData', JSON.stringify(updatedCaseData));
      }
    } catch (error) {
      console.error("Error in report generation:", error);
      alert("There was an error generating the report. Please try again.");
    } finally {
      setIsGenerating(false);
    }
  };

  // Format location address or coordinates
  const getLocationAddress = (location) => {
    if (!location) return "Unknown Location";
    
    // Use address field if available
    if (location.address) return location.address;
    
    // Otherwise create a simple description based on coordinates
    return `Location at ${formatCoordinate(location.lat)}, ${formatCoordinate(location.lng)}`;
  };

  // Format coordinate display
  const formatCoordinate = (coord) => {
    if (coord === undefined || coord === null) return "N/A";
    return typeof coord === 'number' ? coord.toFixed(6) : coord;
  };

  // Toggle a location's selection
  const toggleLocationSelection = (index) => {
    setSelectedLocations(prev => {
      if (prev.includes(index)) {
        // If already selected, remove it
        return prev.filter(idx => idx !== index);
      } else {
        // If not selected, add it
        return [...prev, index];
      }
    });
  };

  // Handle downloading a generated report
  const handleDownload = async (report) => {
    if (report.type === 'report' && report.pdf) {
      // For PDF reports that were already generated, regenerate them
      const pdf = await generatePDF();
      if (pdf) {
        pdf.save(report.name);
      }
    } else if (report.type === 'simulation') {
      // For simulation videos, redirect to simulation page
      alert(`Redirecting to simulation view for ${report.name}...`);
      window.location.href = '/simulation';
    } else {
      // For other report types or non-generated PDFs
      alert(`Downloading ${report.name}... (This is a mock action for non-PDF content)`);
    }
  };

  // Handle location title change
  const handleLocationTitleChange = (index, newTitle) => {
    const newTitles = [...locationTitles];
    newTitles[index] = newTitle;
    setLocationTitles(newTitles);
    
    // Save to localStorage
    saveData();
  };

  // Show loading state
  if (isLoading) {
    return (
      <div className="min-h-screen bg-black text-white flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-500 mx-auto mb-4"></div>
          <p className="text-gray-300">Loading case data...</p>
        </div>
      </div>
    );
  }
  
  // Show error state
  if (error) {
    return (
      <div className="min-h-screen bg-black text-white flex flex-col items-center justify-center">
        <AlertTriangle className="text-red-500 w-12 h-12 mb-4" />
        <h1 className="text-xl font-bold mb-2">Error</h1>
        <p className="text-gray-400">{error}</p>
        <Link to="/new-case" className="mt-8 px-4 py-2 bg-blue-700 hover:bg-blue-600 rounded text-white">
          Go to Case Information
        </Link>
      </div>
    );
  }

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

        <h1 className="text-xl font-bold text-white">Overview</h1>

        <div className="flex items-center space-x-4">
          <div>
            <p className="text-sm">Name Surname</p>
            <button className="text-red-400 hover:text-red-600 text-xs">Sign Out</button>
          </div>
        </div>
      </div>

      {/* Nav Tabs */}
      <div className="flex justify-center space-x-8 bg-gray-800 py-2 text-white text-sm">
        <Link to="/new-case" className="text-gray-400 hover:text-white">Case Information</Link>
        <Link to="/annotations" className="text-gray-400 hover:text-white">Annotations</Link>
        <span className="font-bold underline">Overview</span>
      </div>

      {/* Case Information Bar */}
      <div className="bg-gray-800 bg-opacity-50 py-2 px-6">
        <div className="flex flex-wrap justify-between text-sm text-gray-300">
          <div className="mr-6 mb-1">
            <span className="text-gray-400">Case:</span> {caseDetails.caseNumber}
          </div>
          <div className="mr-6 mb-1">
            <span className="text-gray-400">Title:</span> {caseDetails.caseTitle}
          </div>
          <div className="mr-6 mb-1">
            <span className="text-gray-400">Date:</span> {caseDetails.dateOfIncident}
          </div>
          <div className="mb-1">
            <span className="text-gray-400">Region:</span> {caseDetails.region}
          </div>
        </div>
      </div>

      {/* Hidden report template div for PDF generation */}
      <div className="hidden">
        <div ref={reportRef} id="report-template" className="bg-white text-black p-8 max-w-[800px]">
          {/* PDF content will be structured here but the actual generation logic is in the generatePDF function */}
        </div>
      </div>
      
      {/* Page Content */}
      <div className="max-w-6xl mx-auto px-6 py-8 space-y-8">
        {/* Summary */}
        <div className="bg-gray-800 p-4 rounded-lg shadow">
          <h2 className="text-lg font-semibold mb-3">Case Summary</h2>
          <div className="bg-gray-700 p-4 rounded">
            <p><span className="font-medium">Case Number:</span> {caseDetails.caseNumber}</p>
            <p><span className="font-medium">Title:</span> {caseDetails.caseTitle}</p>
            <p><span className="font-medium">Date of Incident:</span> {caseDetails.dateOfIncident}</p>
            <p><span className="font-medium">Region:</span> {caseDetails.region}</p>
            <p><span className="font-medium">Between:</span> {caseDetails.between}</p>
            <p className="mt-2"><span className="font-medium">Locations:</span> {locations.length} total, {selectedLocations.length} selected for report</p>
          </div>
        </div>

        {/* Snapshot Status */}
        <div className="bg-gray-800 p-4 rounded-lg shadow">
          <h2 className="text-lg font-semibold mb-3">Snapshot Status</h2>
          <div className="bg-gray-700 p-4 rounded">
            {snapshotsAvailable ? (
              <div className="flex items-center text-green-400">
                <MapPin size={18} className="mr-2" />
                <p>Location snapshots are available for the report ({snapshots.filter(s => s).length} of {locations.length} locations have snapshots)</p>
              </div>
            ) : (
              <div className="flex items-center text-yellow-400">
                <MapPin size={18} className="mr-2" />
                <p>No location snapshots available. Please go to the Annotations page to capture them.</p>
              </div>
            )}
            
            <div className="mt-4">
              <Link 
                to="/annotations"
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded inline-flex items-center"
              >
                <Camera size={16} className="mr-2" />
                {snapshotsAvailable ? "Edit Snapshots" : "Capture Snapshots"}
              </Link>
            </div>
          </div>
        </div>

        {/* Selected Locations */}
        <div className="bg-gray-800 p-4 rounded-lg shadow">
          <h2 className="text-lg font-semibold mb-3">Selected Locations</h2>
          <div className="space-y-2 max-h-64 overflow-y-auto">
            {locations.map((location, index) => (
              <div key={index} className="flex items-center justify-between p-3 rounded bg-gray-700">
                <div className="flex items-center space-x-2">
                  <input
                    type="checkbox"
                    id={`location-${index}`}
                    checked={selectedLocations.includes(index)}
                    onChange={() => toggleLocationSelection(index)}
                    className="form-checkbox h-5 w-5 text-blue-600 rounded border-gray-600 bg-gray-700 focus:ring-blue-500"
                  />
                  <label htmlFor={`location-${index}`} className="flex items-center cursor-pointer">
                    <MapPin className="h-4 w-4 text-blue-400 mr-2" />
                    <div className="flex flex-col">
                      <span>
                        {locationTitles[index] 
                          ? locationTitles[index]
                          : getLocationAddress(location)}
                      </span>
                      {snapshots.find(s => s && s.index === index) && (
                        <span className="text-xs text-green-400">✓ Snapshot available</span>
                      )}
                    </div>
                  </label>
                </div>
                
                <div className="flex items-center space-x-2">
                  <input
                    type="text"
                    value={locationTitles[index] || ""}
                    onChange={(e) => handleLocationTitleChange(index, e.target.value)}
                    placeholder="Add title..."
                    className="text-sm bg-gray-800 border border-gray-600 rounded px-2 py-1 w-48"
                  />
                  <Link 
                    to="/annotations" 
                    className="text-xs text-blue-400 hover:underline"
                    onClick={() => {
                      // Save the current index to localStorage to navigate directly to this location
                      localStorage.setItem('trackxCurrentLocationIndex', index);
                      saveData();
                    }}
                  >
                    Edit
                  </Link>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Report Introduction */}
        <div className="bg-gray-800 p-4 rounded-lg shadow">
          <h2 className="text-lg font-semibold mb-3">Report Introduction</h2>
          <textarea
            placeholder="Enter report introduction..."
            value={reportIntro}
            onChange={(e) => setReportIntro(e.target.value)}
            onBlur={saveData}
            className="w-full h-32 p-3 rounded bg-gray-900 text-white border border-gray-700 resize-none focus:border-blue-500 focus:ring focus:ring-blue-500 focus:ring-opacity-50"
          />
        </div>

        {/* Report Conclusion */}
        <div className="bg-gray-800 p-4 rounded-lg shadow">
          <h2 className="text-lg font-semibold mb-3">Report Conclusion</h2>
          <textarea
            placeholder="Enter report conclusion..."
            value={reportConclusion}
            onChange={(e) => setReportConclusion(e.target.value)}
            onBlur={saveData}
            className="w-full h-32 p-3 rounded bg-gray-900 text-white border border-gray-700 resize-none focus:border-blue-500 focus:ring focus:ring-blue-500 focus:ring-opacity-50"
          />
        </div>

        {/* Checkboxes and Generate Button */}
        <div className="bg-gray-800 p-4 rounded-lg shadow">
          <div className="flex flex-wrap items-center justify-between">
            <div className="space-x-6 mb-4 md:mb-0">
              <label className="inline-flex items-center">
                <input 
                  type="checkbox" 
                  checked={generateReport}
                  onChange={() => setGenerateReport(!generateReport)}
                  className="form-checkbox h-5 w-5 text-blue-600 rounded border-gray-600 bg-gray-700 focus:ring-blue-500" 
                />
                <span className="ml-2">Generate Report</span>
              </label>
              <label className="inline-flex items-center">
                <input 
                  type="checkbox" 
                  checked={generateSimulation}
                  onChange={() => setGenerateSimulation(!generateSimulation)}
                  className="form-checkbox h-5 w-5 text-green-600 rounded border-gray-600 bg-gray-700 focus:ring-green-500" 
                />
                <span className="ml-2">Generate Simulation</span>
              </label>
            </div>
            <button 
              className={`bg-blue-700 hover:bg-blue-800 text-white px-6 py-2 rounded shadow transition
                ${(!generateReport && !generateSimulation) || isGenerating ? 'opacity-50 cursor-not-allowed' : ''}
              `}
              onClick={handleGenerate}
              disabled={(!generateReport && !generateSimulation) || isGenerating}
            >
              {isGenerating ? (
                <div className="flex items-center">
                  <div className="animate-spin rounded-full h-4 w-4 border-t-2 border-b-2 border-white mr-2"></div>
                  Generating...
                </div>
              ) : 'Generate'}
            </button>
          </div>
        </div>

        {/* Output Downloads */}
        {generatedReports.length > 0 && (
          <div className="bg-gray-800 p-4 rounded-lg shadow">
            <h3 className="text-lg font-semibold mb-3">Generated Reports</h3>
            <div className="space-y-2">
              {generatedReports.map((report) => (
                <div key={report.id} className="flex items-center justify-between bg-gray-700 p-4 rounded">
                  <div className="flex items-center">
                    {report.type === 'report' ? (
                      <FileText className="h-5 w-5 text-blue-400 mr-3" />
                    ) : (
                      <div className="h-5 w-5 text-green-400 mr-3">🎬</div> 
                    )}
                    <div>
                      <p className="font-medium">{report.name}</p>
                      <p className="text-xs text-gray-400">
                        {new Date(report.date).toLocaleString()}
                      </p>
                    </div>
                  </div>
                  <button 
                    className="bg-green-600 hover:bg-green-700 text-white px-4 py-1 rounded transition"
                    onClick={() => handleDownload(report)}
                  >
                    {report.type === 'simulation' ? 'View' : 'Download'}
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </motion.div>
  );
}

export default OverviewPage;