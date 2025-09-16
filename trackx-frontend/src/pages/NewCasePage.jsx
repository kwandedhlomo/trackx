import React, { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { Upload, Info, CheckCircle, AlertCircle, FileText } from "lucide-react";
import Papa from "papaparse";
import adflogo from "../assets/image-removebg-preview.png";
import axios from "axios";
import { auth } from "../firebase";
import { signOut } from "firebase/auth";
import { useAuth } from "../context/AuthContext";

// Dynamic PDF.js import to ensure version compatibility
let pdfjsLib = null;

// Initialize PDF.js
const initPDFJS = async () => {
  if (!pdfjsLib) {
    try {
      // Try multiple CDN sources for better reliability
      const workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/2.16.105/pdf.worker.min.js';
      
      // Create a script tag to load PDF.js
      const script = document.createElement('script');
      script.src = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/2.16.105/pdf.min.js';
      script.onload = () => {
        if (window.pdfjsLib) {
          pdfjsLib = window.pdfjsLib;
          pdfjsLib.GlobalWorkerOptions.workerSrc = workerSrc;
        }
      };
      document.head.appendChild(script);
      
      // Wait for script to load
      await new Promise((resolve) => {
        const checkLoaded = () => {
          if (window.pdfjsLib) {
            pdfjsLib = window.pdfjsLib;
            pdfjsLib.GlobalWorkerOptions.workerSrc = workerSrc;
            resolve();
          } else {
            setTimeout(checkLoaded, 100);
          }
        };
        checkLoaded();
      });
    } catch (error) {
      console.error('Failed to load PDF.js:', error);
      throw new Error('PDF processing library failed to load');
    }
  }
  return pdfjsLib;
};

function NewCasePage() {
  const navigate = useNavigate();
  const [caseNumber, setCaseNumber] = useState("");
  const [caseTitle, setCaseTitle] = useState("");
  const [dateOfIncident, setDateOfIncident] = useState("");
  const [region, setRegion] = useState("");
  const [between, setBetween] = useState("");
  const [urgency, setUrgency] = useState("");
  const [file, setFile] = useState(null);
  const [parsedData, setParsedData] = useState(null);
  const [isDragging, setIsDragging] = useState(false);
  const [parseError, setParseError] = useState(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [csvStats, setCsvStats] = useState(null);
  const [showGuide, setShowGuide] = useState(false);
  const [fileType, setFileType] = useState(null);
  const [showMenu, setShowMenu] = useState(false);

  /**
   * Extracts time from description and returns ISO timestamp using dateOfIncident
   */
  function convertToISO(description) {
    if (!description || !dateOfIncident) return null;

    const timeMatch = description.match(/\b\d{2}:\d{2}:\d{2}\b/);
    if (!timeMatch) return null;

    const timePart = timeMatch[0];
    const isoString = `${dateOfIncident}T${timePart}Z`;

    const date = new Date(isoString);
    return isNaN(date.getTime()) ? null : date.toISOString();
  }

  /**
   * Enhanced GPS coordinate extraction supporting multiple formats from tracking companies
   */
  const extractGPSCoordinates = (text) => {
    const coordinates = [];
    const lines = text.split('\n');
    
    // Pattern 1: Standard decimal degrees with various separators
    // Matches: -33.918861, 18.423300 | -26.1367 28.2411 | GPS: -33.962800 18.409800
    const decimalPattern = /(-?\d+\.\d+)[,\s]+(-?\d+\.\d+)/g;
    
    // Pattern 2: Labeled coordinates 
    // Matches: Latitude: -34.357000 Longitude: 18.497200 | Lat: -34.036300 Lon: 23.047100
    const labeledPattern = /(?:lat|latitude)[:\s]*(-?\d+\.\d+)[\s\w]*(?:lon|lng|longitude)[:\s]*(-?\d+\.\d+)/gi;
    
    // Pattern 3: DMS (Degrees Minutes Seconds) format
    // Matches: 25°44'52.4"S 28°11'18.6"E | 28°42'50.4"S 28°56'30.8"E
    const dmsPattern = /(\d+)°(\d+)'([\d.]+)"([NSEW])\s+(\d+)°(\d+)'([\d.]+)"([NSEW])/g;
    
    // Pattern 4: Coordinates: prefix format
    // Matches: Coordinates: -26.1367, 28.2411 | GPS coordinates -28.7282, 29.2649
    const coordPattern = /(?:coordinates?|gps)[:\s]*(-?\d+\.\d+)[,\s]+(-?\d+\.\d+)/gi;
    
    // Pattern 5: Tabular format (Time Latitude Longitude Status)
    // Process line by line for structured data
    const processStructuredData = (text) => {
      const coords = [];
      const lines = text.split('\n');
      
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();
        
        // Look for lines with time patterns followed by coordinates
        const timeCoordPattern = /(\d{2}:\d{2}(?::\d{2})?)\s+(-?\d+\.\d+)\s+(-?\d+\.\d+)\s+(stopped|idle|moving)/gi;
        const match = timeCoordPattern.exec(line);
        
        if (match) {
          const [, time, lat, lng, status] = match;
          coords.push({
            lat: parseFloat(lat),
            lng: parseFloat(lng),
            time: time,
            status: status,
            source: 'structured_table'
          });
        }
        
        // Also check for multi-line coordinate blocks
        if (line.toLowerCase().includes('latitude') || line.toLowerCase().includes('lat:')) {
          const latMatch = line.match(/(-?\d+\.\d+)/);
          if (latMatch && i + 1 < lines.length) {
            const nextLine = lines[i + 1];
            const lngMatch = nextLine.match(/(-?\d+\.\d+)/);
            if (lngMatch) {
              coords.push({
                lat: parseFloat(latMatch[1]),
                lng: parseFloat(lngMatch[1]),
                source: 'multi_line'
              });
            }
          }
        }
      }
      return coords;
    };
    
    // Apply all patterns
    let match;
    
    // Pattern 1: Standard decimal degrees
    while ((match = decimalPattern.exec(text)) !== null) {
      const lat = parseFloat(match[1]);
      const lng = parseFloat(match[2]);
      if (isValidCoordinate(lat, lng)) {
        coordinates.push({ 
          lat, 
          lng, 
          source: 'decimal_standard',
          originalText: match[0]
        });
      }
    }
    
    // Pattern 2: Labeled coordinates
    while ((match = labeledPattern.exec(text)) !== null) {
      const lat = parseFloat(match[1]);
      const lng = parseFloat(match[2]);
      if (isValidCoordinate(lat, lng)) {
        coordinates.push({ 
          lat, 
          lng, 
          source: 'labeled',
          originalText: match[0]
        });
      }
    }
    
    // Pattern 3: DMS format
    while ((match = dmsPattern.exec(text)) !== null) {
      try {
        let lat = parseInt(match[1]) + parseInt(match[2])/60 + parseFloat(match[3])/3600;
        let lng = parseInt(match[5]) + parseInt(match[6])/60 + parseFloat(match[7])/3600;
        
        if (match[4] === 'S') lat = -lat;
        if (match[8] === 'W') lng = -lng;
        
        if (isValidCoordinate(lat, lng)) {
          coordinates.push({ 
            lat, 
            lng, 
            source: 'dms',
            originalText: match[0]
          });
        }
      } catch (error) {
        console.log('DMS parsing error:', error);
      }
    }
    
    // Pattern 4: Coordinates prefix
    while ((match = coordPattern.exec(text)) !== null) {
      const lat = parseFloat(match[1]);
      const lng = parseFloat(match[2]);
      if (isValidCoordinate(lat, lng)) {
        coordinates.push({ 
          lat, 
          lng, 
          source: 'coord_prefix',
          originalText: match[0]
        });
      }
    }
    
    // Pattern 5: Structured data
    const structuredCoords = processStructuredData(text);
    coordinates.push(...structuredCoords);
    
    // Remove duplicates (within 0.001 degrees)
    const unique = [];
    coordinates.forEach(coord => {
      const isDuplicate = unique.some(existing => 
        Math.abs(existing.lat - coord.lat) < 0.001 && 
        Math.abs(existing.lng - coord.lng) < 0.001
      );
      if (!isDuplicate) {
        unique.push(coord);
      }
    });
    
    return unique;
  };
  
  /**
   * Validate if coordinates are within reasonable bounds
   */
  const isValidCoordinate = (lat, lng) => {
    return lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180 && 
           lat !== 0 && lng !== 0; // Exclude null coordinates
  };

  /**
   * Enhanced timestamp extraction supporting multiple formats
   */
  const extractTimestamps = (text) => {
    const timestamps = [];
    const patterns = [
      /\b\d{4}[/-]\d{2}[/-]\d{2}[,\s]+\d{2}:\d{2}:\d{2}\b/g, // YYYY-MM-DD HH:MM:SS
      /\b\d{2}[/-]\d{2}[/-]\d{4}[,\s]+\d{2}:\d{2}:\d{2}\b/g, // DD/MM/YYYY HH:MM:SS
      /\b\d{2}:\d{2}:\d{2}\b/g, // HH:MM:SS
      /\b\d{2}:\d{2}\b/g, // HH:MM
      /Time[:\s]+(\d{2}:\d{2}(?::\d{2})?)/gi, // Time: HH:MM:SS
      /\b\d{4}\/\d{2}\/\d{2}\b/g // YYYY/MM/DD
    ];
    
    patterns.forEach(pattern => {
      let match;
      while ((match = pattern.exec(text)) !== null) {
        timestamps.push(match[0]);
      }
    });
    
    return [...new Set(timestamps)]; // Remove duplicates
  };

  /**
   * Enhanced vehicle status extraction with more comprehensive keywords
   */
  const extractVehicleStatus = (text, context = '') => {
    const combinedText = (text + ' ' + context).toLowerCase();
    
    const statusKeywords = {
      stopped: [
        'stopped', 'parked', 'stationary', 'ignition off', 'engine off', 
        'halt', 'standstill', 'not moving', 'vehicle stopped', 'engine switched off',
        'no movement detected', 'vehicle parked', 'final destination', 'end of tracking'
      ],
      idle: [
        'idling', 'idle', 'engine on', 'ignition on', 'running', 'waiting',
        'engine running', 'temporary stop', 'brief stop', 'passenger drop-off',
        'vehicle idling', 'engine running briefly'
      ],
      moving: [
        'moving', 'motion', 'driving', 'traveling', 'travelling', 'speed', 
        'en route', 'in transit', 'vehicle in motion', 'coordinate recorded during movement',
        'significant movement', 'movement detected'
      ]
    };
    
    // Check for explicit status indicators first
    for (const [status, keywords] of Object.entries(statusKeywords)) {
      if (keywords.some(keyword => combinedText.includes(keyword))) {
        return status.charAt(0).toUpperCase() + status.slice(1);
      }
    }
    
    // Contextual analysis
    if (combinedText.includes('airport') && combinedText.includes('departure')) return 'Idle';
    if (combinedText.includes('mall') || combinedText.includes('shopping')) return 'Stopped';
    if (combinedText.includes('checkpoint') || combinedText.includes('inspection')) return 'Stopped';
    
    return 'Unknown';
  };

  /**
   * Parse PDF file and extract GPS data with enhanced format support
   */
  const parsePDF = async (file) => {
    setIsProcessing(true);
    setParseError(null);
    
    try {
      // Initialize PDF.js
      const pdfjs = await initPDFJS();
      if (!pdfjs) {
        throw new Error('PDF processing library not available');
      }
      
      const arrayBuffer = await file.arrayBuffer();
      const pdf = await pdfjs.getDocument({ data: arrayBuffer }).promise;
      
      let fullText = '';
      let pageTexts = [];
      
      // Extract text from all pages
      for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
        const page = await pdf.getPage(pageNum);
        const textContent = await page.getTextContent();
        const pageText = textContent.items.map(item => item.str).join(' ');
        pageTexts.push(pageText);
        fullText += pageText + '\n';
      }
      
      console.log('Extracted PDF text from', pdf.numPages, 'pages');
      console.log('Sample text:', fullText.substring(0, 500));
      
      // Extract GPS coordinates using enhanced patterns
      const coordinates = extractGPSCoordinates(fullText);
      console.log('Extracted coordinates:', coordinates);
      
      if (coordinates.length === 0) {
        // Try processing each page separately if no coordinates found
        let allCoords = [];
        pageTexts.forEach((pageText, index) => {
          const pageCoords = extractGPSCoordinates(pageText);
          allCoords.push(...pageCoords);
        });
        
        if (allCoords.length === 0) {
          setParseError(`No GPS coordinates found in the PDF. 
          
Detected text sample: "${fullText.substring(0, 200)}..."

The PDF may contain:
• Scanned images instead of text
• Coordinates in an unsupported format
• No GPS coordinate data

Please ensure your PDF contains GPS coordinates in one of these formats:
• Decimal: -33.918861, 18.423300
• Labeled: Latitude: -33.918861, Longitude: 18.423300
• DMS: 33°55'07.9"S 18°25'23.9"E`);
          setParsedData(null);
          setCsvStats(null);
          setIsProcessing(false);
          return;
        }
        coordinates.push(...allCoords);
      }
      
      // Extract timestamps and other metadata
      const timestamps = extractTimestamps(fullText);
      console.log('Extracted timestamps:', timestamps);
      
      // Process the coordinates with enhanced metadata
      const processedData = coordinates.map((coord, index) => {
        // Find relevant context around this coordinate
        const coordText = coord.originalText || '';
        const coordIndex = fullText.indexOf(coordText);
        const contextStart = Math.max(0, coordIndex - 100);
        const contextEnd = Math.min(fullText.length, coordIndex + 200);
        const context = fullText.substring(contextStart, contextEnd);
        
        // Extract or derive additional information
        const timestamp = timestamps[index] || coord.time || `Point ${index + 1}`;
        const description = coord.source === 'structured_table' ? 
          `GPS Point ${index + 1} (from table)` : 
          `GPS Point ${index + 1} (${coord.source})`;
        
        // Enhanced status detection using context
        let ignitionStatus = coord.status || extractVehicleStatus(context, coordText);
        
        // Look for location names near coordinates
        const locationMatch = context.match(/(?:at|near|location|stop)\s+([A-Z][A-Za-z\s]{3,30})/i);
        const locationName = locationMatch ? locationMatch[1] : null;
        
        return {
          id: index,
          lat: coord.lat,
          lng: coord.lng,
          timestamp,
          description: locationName ? `${description} - ${locationName}` : description,
          ignitionStatus,
          rawData: { 
            source: coord.source,
            originalText: coordText,
            context: context,
            pageText: fullText.substring(0, 200) + '...'
          }
        };
      });
      
      console.log('Processed data:', processedData);
      
      // Intelligent filtering for stopped/relevant points
      const stoppedPoints = processedData.filter(point => {
        const status = String(point.ignitionStatus).toLowerCase();
        return status === "stopped" || 
               status === "idle" || 
               status === "unknown" ||
               point.rawData.source === 'structured_table';
      });
      
      // If no stopped points, include all points but prioritize those with status info
      const finalStoppedPoints = stoppedPoints.length > 0 ? stoppedPoints : processedData;
      
      // Remove duplicates based on coordinates (within 100m)
      const uniquePoints = [];
      finalStoppedPoints.forEach(point => {
        const isDuplicate = uniquePoints.some(existing => {
          const distance = Math.sqrt(
            Math.pow((existing.lat - point.lat) * 111000, 2) + 
            Math.pow((existing.lng - point.lng) * 111000 * Math.cos(point.lat * Math.PI / 180), 2)
          );
          return distance < 100; // 100 meters threshold
        });
        
        if (!isDuplicate) {
          uniquePoints.push(point);
        }
      });
      
      setParsedData({
        raw: processedData,
        stoppedPoints: uniquePoints
      });
      
      setCsvStats({
        totalPoints: processedData.length,
        stoppedPoints: uniquePoints.length,
        columnsUsed: { source: 'PDF extraction', formats: [...new Set(coordinates.map(c => c.source))] },
        derivedStatus: true,
        pdfInfo: {
          pages: pdf.numPages,
          coordinateFormats: [...new Set(coordinates.map(c => c.source))],
          timestampsFound: timestamps.length
        }
      });
      
    } catch (error) {
      console.error("Error parsing PDF:", error);
      let errorMessage = `Error parsing PDF: ${error.message}`;
      
      if (error.message.includes('PDF processing library')) {
        errorMessage = `PDF processing library failed to load. Please check your internet connection and try again.`;
      } else if (error.message.includes('Invalid PDF')) {
        errorMessage = `Invalid PDF file. Please ensure the file is not corrupted.`;
      } else if (error.message.includes('password')) {
        errorMessage = `Password-protected PDFs are not supported. Please provide an unprotected PDF.`;
      }
      
      setParseError(errorMessage);
      setParsedData(null);
      setCsvStats(null);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleCreateCase = async () => {
    try {
      if (!caseNumber || !caseTitle || !dateOfIncident || !region || !parsedData) {
        alert("Please fill all required fields and upload a valid file");
        return;
      }

      setIsProcessing(true);

      const casePayload = {
        case_number: caseNumber,
        case_title: caseTitle,
        date_of_incident: dateOfIncident,
        region: region,
        between: between || "",
        urgency: urgency,
        userID: auth.currentUser ? auth.currentUser.uid : null,
        csv_data: parsedData.stoppedPoints.map(point => ({
          latitude: point.lat,
          longitude: point.lng,
          timestamp: point.timestamp || null,
          description: point.description || null,
          ignitionStatus: point.ignitionStatus || false
        })),
        all_points: parsedData.raw.map(point => ({
          latitude: point.lat,
          longitude: point.lng,
          timestamp: convertToISO(point.description),
          description: point.description || null
        }))
      };

      const response = await axios.post("http://localhost:8000/cases/create", casePayload, {
        headers: {
          'Content-Type': 'application/json'
        }
      });

      if (response.data) {
        const firestoreDocId = response.data.case_id || response.data.id || response.data.doc_id;
        console.log("Created case Firestore ID:", firestoreDocId);

        // Save full case info to localStorage including Firestore ID
  //  Capture caseId from response
        const caseData = {
          caseId: firestoreDocId,
          caseNumber,
          caseTitle,
          dateOfIncident,
          region,
          between,
          urgency,
          locations: parsedData.stoppedPoints
        };

        localStorage.setItem('trackxCaseData', JSON.stringify(caseData));

        alert("Case created and moving to next step!");
        navigate("/annotations");
      }


    } catch (error) {
      console.error("Failed to create case:", error);
      if (error.response) {
        alert(`Failed to create case: ${JSON.stringify(error.response.data.detail)}`);
      } else if (error.request) {
        alert("Failed to create case: No response from server. Check your network connection.");
      } else {
        alert(`Failed to create case: ${error.message}`);
      }
    } finally {
      setIsProcessing(false);
    }
  };

  const { profile } = useAuth();

  const determineIgnitionStatus = (description) => {
    if (!description) return null;
    
    const desc = description.toLowerCase();
    
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
    const fileName = file.name.toLowerCase();
    
    if (file.type === "text/csv" || fileName.endsWith('.csv')) {
      setFile(file);
      setFileType('csv');
      parseCSV(file);
    } else if (file.type === "application/pdf" || fileName.endsWith('.pdf')) {
      setFile(file);
      setFileType('pdf');
      parsePDF(file);
    } else {
      setParseError("Please upload a CSV or PDF file. Other file types are not supported.");
      setFile(null);
      setFileType(null);
      setParsedData(null);
      setCsvStats(null);
    }
  };

  // CSV parsing function 
  const parseCSV = (file) => {
    setIsProcessing(true);
    setParseError(null);
    
    Papa.parse(file, {
      header: true, 
      dynamicTyping: true, 
      skipEmptyLines: true, 
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
          const columns = Object.keys(firstRow);
          
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
            
            // Get ignition status from column or from description
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
              rawData: row 
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

  const handleNext = async (e) => {
    e.preventDefault();
    
    if (!caseNumber || !caseTitle || !dateOfIncident || !region || !file || !parsedData) {
      alert("Please fill all required fields and upload a valid file");
      return;
    }

    await handleCreateCase();
    alert("Case created and moving to next step!");
    const previous = JSON.parse(localStorage.getItem('trackxCaseData')) || {};

    const caseData = {
      caseId: previous.caseId || previous.id || null, 
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

  // For Sign Out functionality
  const handleSignOut = async () => {
    try {
      await signOut(auth);
      navigate("/"); // Redirect to LandingPage
    } catch (error) {
      console.error("Sign-out failed:", error.message);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 1 }}
      className="relative min-h-screen text-white font-sans overflow-hidden"
    >
      <div className="absolute inset-0 bg-gradient-to-br from-black via-gray-900 to-black -z-10" />
  
      {/* Navbar */}
      <div className="flex items-center justify-between px-6 py-4 bg-gradient-to-r from-black to-gray-900 shadow-md">
        <div className="flex items-center space-x-4">
          {/* Hamburger Icon */}
          <div className="text-3xl cursor-pointer" onClick={() => setShowMenu(!showMenu)}>
            &#9776;
          </div>
  
          <Link to="/home">
            <img src={adflogo} alt="Logo" className="h-12 cursor-pointer hover:opacity-80 transition" />
          </Link>
        </div>
  
        <h1 className="text-xl font-bold text-white">New Case</h1>
  
        <div className="text-right">
          <p className="text-sm text-white">{profile ? `${profile.firstName} ${profile.surname}` : "Loading..."}</p>
          <button
            onClick={handleSignOut}
            className="text-red-400 hover:text-red-600 text-xs"
          >
            Sign Out
          </button>
        </div>
      </div>
  
      {/* Hamburger Menu Content */}
      {showMenu && (
        <div className="absolute top-16 left-0 bg-black bg-opacity-90 backdrop-blur-md text-white w-64 p-6 z-30 space-y-4 border-r border-gray-700 shadow-lg">
          <Link to="/home" className="block hover:text-blue-400" onClick={() => setShowMenu(false)}>🏠 Home</Link>
          <Link to="/new-case" className="block hover:text-blue-400" onClick={() => setShowMenu(false)}>📝 Create New Case / Report</Link>
          <Link to="/manage-cases" className="block hover:text-blue-400" onClick={() => setShowMenu(false)}>📁 Manage Cases</Link>
          <Link to="/my-cases" className="block hover:text-blue-400" onClick={() => setShowMenu(false)}>📁 My Cases</Link>
  
          {profile?.role === "admin" && (
            <Link to="/admin-dashboard" className="block hover:text-blue-400" onClick={() => setShowMenu(false)}>
              🛠 Admin Dashboard
            </Link>
          )}
        </div>
      )}

      {/* Nav Tabs */}
      <div className="flex justify-center space-x-8 bg-gradient-to-r from-black to-gray-900 bg-opacity-80 backdrop-blur-md py-2 text-white text-sm">        <span className="font-bold underline">Case Information</span>
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

        {/* Urgency */}
        <div className="md:col-span-2">
          <label htmlFor="urgency" className="block text-sm font-medium text-gray-300 mb-1">
            Urgency Level *
          </label>
          <select
            id="urgency"
            value={urgency}
            onChange={(e) => setUrgency(e.target.value)}
            className="w-full p-2 bg-gray-800 border border-gray-600 rounded text-white"
            required
          >
            <option value="">Select urgency level</option>
            <option value="Low">Low</option>
            <option value="Medium">Medium</option>
            <option value="High">High</option>
            <option value="Critical">Critical</option>
          </select>
        </div>
        
          {/* Enhanced File Upload Section */}
          <div className="mt-8">
            <div className="flex items-center justify-between mb-2">
              <label className="block text-sm font-medium text-gray-300">
                Upload GPS Coordinates (CSV or PDF) *
              </label>
              <button 
                type="button"
                onClick={() => setShowGuide(!showGuide)}
                className="text-blue-400 hover:text-blue-300 text-sm flex items-center"
              >
                <Info className="w-4 h-4 mr-1" />
                {showGuide ? "Hide Guide" : "View File Guide"}
              </button>
            </div>

            {/* Enhanced Guide */}
            {showGuide && (
              <div className="bg-gray-800 p-4 rounded-lg text-sm text-gray-300 mb-4">
                <h3 className="font-semibold mb-2">Supported File Formats:</h3>
                
                {/* CSV Section */}
                <div className="mb-4">
                  <h4 className="font-semibold text-blue-400 mb-1">CSV Files:</h4>
                  <p className="mb-2">Your CSV should include the following columns:</p>
                  <ul className="list-disc pl-5 space-y-1 text-xs">
                    <li>Latitude (decimal coordinates - column name containing "lat" or "latitude")</li>
                    <li>Longitude (decimal coordinates - column name containing "lng", "lon", or "longitude")</li>
                    <li>Description (optional - column name containing "desc", "note", or "comment")</li>
                    <li>Ignition Status (optional - column name containing "ignition" or "status")</li>
                    <li>Timestamp (optional - column name containing "time", "date", or "stamp")</li>
                  </ul>
                </div>

                {/* PDF Section */}
                <div className="mb-4">
                  <h4 className="font-semibold text-green-400 mb-1">PDF Files:</h4>
                  <p className="mb-2">PDF files will be automatically processed to extract:</p>
                  <ul className="list-disc pl-5 space-y-1 text-xs">
                    <li>GPS coordinates in decimal format (e.g., -33.918861, 18.423300)</li>
                    <li>Coordinates with labels (e.g., "Latitude: -33.918861, Longitude: 18.423300")</li>
                    <li>Degrees/Minutes/Seconds format (e.g., 33°55'07.9"S 18°25'23.9"E)</li>
                    <li>Timestamps and vehicle status information when available</li>
                  </ul>
                  <p className="mt-2 text-xs text-yellow-400">
                    Note: PDF extraction works best with text-based PDFs. Scanned images may not extract properly.
                  </p>
                </div>

                {/* Ignition Status Detection */}
                <div className="mt-3 pt-3 border-t border-gray-700">
                  <p className="font-semibold mb-1">Intelligent Vehicle Status Detection:</p>
                  <p className="mb-2 text-xs text-gray-400">
                    The system analyzes text content to determine vehicle status:
                  </p>
                  <div className="grid grid-cols-3 gap-2 text-xs mt-2">
                    <div className="p-2 bg-red-900 bg-opacity-20 rounded">
                      <p className="font-semibold text-red-400 mb-1">Stopped</p>
                      <p className="text-gray-400">stopped, parked, ignition off, engine off, stationary</p>
                    </div>
                    <div className="p-2 bg-yellow-900 bg-opacity-20 rounded">
                      <p className="font-semibold text-yellow-400 mb-1">Idle</p>
                      <p className="text-gray-400">idling, idle, engine on, ignition on, running</p>
                    </div>
                    <div className="p-2 bg-green-900 bg-opacity-20 rounded">
                      <p className="font-semibold text-green-400 mb-1">Moving</p>
                      <p className="text-gray-400">moving, driving, traveling, speed, en route</p>
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
                accept=".csv,.pdf"
                className="hidden"
                onChange={handleFileSelect}
              />
              
              {isProcessing ? (
                <div className="text-center">
                  <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-blue-500 mx-auto mb-4"></div>
                  <div className="text-blue-400 mb-2">Processing {fileType?.toUpperCase()} file...</div>
                  <div className="text-xs text-gray-400">
                    {fileType === 'pdf' ? 'Extracting text and GPS coordinates from PDF...' : 'Analyzing CSV structure and extracting location data...'}
                  </div>
                </div>
              ) : file && !parseError ? (
                <div className="text-center">
                  <CheckCircle className="h-8 w-8 text-green-400 mx-auto mb-2" />
                  <div className="text-green-400 mb-2">
                    {fileType === 'pdf' ? 'PDF processed successfully' : 'CSV processed successfully'}
                  </div>
                  <p className="text-gray-300 flex items-center justify-center">
                    {fileType === 'pdf' ? <FileText className="w-4 h-4 mr-2" /> : null}
                    {file.name}
                  </p>
                  {csvStats && (
                    <div className="text-gray-400 mt-3 text-sm">
                      <p>Total data points: {csvStats.totalPoints}</p>
                      <p>Stopped/Relevant locations: {csvStats.stoppedPoints}</p>
                      {csvStats.columnsUsed && csvStats.columnsUsed.source !== 'PDF extraction' && (
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
                        </div>
                      )}
                      {fileType === 'pdf' && csvStats.pdfInfo && (
                        <div className="mt-2 text-xs">
                          <p className="text-green-400">✓ Processed {csvStats.pdfInfo.pages} PDF page(s)</p>
                          <p className="text-green-400">✓ Coordinate formats: {csvStats.pdfInfo.coordinateFormats.join(', ')}</p>
                          {csvStats.pdfInfo.timestampsFound > 0 && (
                            <p className="text-green-400">✓ Found {csvStats.pdfInfo.timestampsFound} timestamps</p>
                          )}
                        </div>
                      )}
                      {fileType === 'csv' && csvStats.derivedStatus && (
                        <p className="mt-1 text-yellow-400">
                          {fileType === 'pdf' ? 'Vehicle status derived from PDF content' : 'Using descriptions to determine vehicle status'}
                        </p>
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
                  {fileType === 'pdf' && (
                    <div className="mt-3 text-xs text-gray-400">
                      <p className="font-semibold text-red-400">PDF Processing Failed</p>
                      <p className="mb-2">{parseError}</p>
                      {fileType === 'pdf' && (
                        <div>
                          <p className="font-semibold mb-1">Troubleshooting Tips:</p>
                          <ul className="list-disc list-inside space-y-1">
                            <li>Ensure PDF contains searchable text (not scanned images)</li>
                            <li>Check that GPS coordinates are in supported formats</li>
                            <li>Try a different PDF if this one doesn't work</li>
                            <li>Verify the PDF isn't password-protected</li>
                          </ul>
                          <p className="mt-2 font-semibold">Supported coordinate formats:</p>
                          <ul className="list-disc list-inside text-xs">
                            <li>Decimal: -33.918861, 18.423300</li>
                            <li>Labeled: Latitude: -33.918861, Longitude: 18.423300</li>
                            <li>DMS: 33°55'07.9"S 18°25'23.9"E</li>
                            <li>Tables with Time, Lat, Lng, Status columns</li>
                          </ul>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ) : (
                <>
                  <Upload className="h-12 w-12 text-gray-400 mb-4" />
                  <p className="text-gray-300 mb-2">Drag and drop your CSV or PDF file here</p>
                  <p className="text-gray-500 text-sm">or click to browse</p>
                  <div className="flex items-center mt-4 space-x-4 text-xs text-gray-400">
                    <div className="flex items-center">
                      <div className="w-3 h-3 bg-blue-500 rounded mr-2"></div>
                      CSV Files
                    </div>
                    <div className="flex items-center">
                      <FileText className="w-3 h-3 mr-2" />
                      PDF Files (New!)
                    </div>
                  </div>
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