// components/FirebaseDebugger.jsx - Complete Firebase debugging and testing component
import React, { useState, useEffect } from 'react';
import { 
  collection, 
  doc, 
  setDoc, 
  getDoc, 
  updateDoc, 
  addDoc, 
  query, 
  where, 
  getDocs, 
  serverTimestamp,
  GeoPoint 
} from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { db, storage, auth } from '../firebase';

// Import Firebase services to test
import { 
  saveCaseWithAnnotations,
  loadCaseWithAnnotations,
  updateCaseAnnotations,
  saveSnapshotsToFirebase,
  loadSnapshotsFromFirebase,
  getUserCases
} from '../services/firebaseServices';

function FirebaseDebugger() {
  const [debugResults, setDebugResults] = useState([]);
  const [isRunning, setIsRunning] = useState(false);
  const [testCaseId, setTestCaseId] = useState(null);
  const [showResults, setShowResults] = useState(false);
  
  const addResult = (test, status, message, data = null) => {
    setDebugResults(prev => [...prev, {
      test,
      status, // 'success', 'error', 'warning', 'info'
      message,
      data,
      timestamp: new Date().toISOString()
    }]);
  };

  const getCurrentUserId = () => {
    return auth.currentUser?.uid || 'debug_user_' + Date.now();
  };

  const runComprehensiveTest = async () => {
    setIsRunning(true);
    setDebugResults([]);
    setShowResults(true);
    
    try {
      addResult('START', 'info', '🔍 Starting comprehensive Firebase debugging...', null);
      
      // Test 1: Basic Firebase Connection
      addResult('CONNECTION', 'info', 'Testing Firebase connection...', null);
      try {
        console.log('Testing Firebase instances:', { db, storage, auth });
        addResult('CONNECTION', 'success', '✅ Firebase instances initialized', { db: !!db, storage: !!storage, auth: !!auth });
      } catch (error) {
        addResult('CONNECTION', 'error', '❌ Firebase initialization failed', error.message);
        setIsRunning(false);
        return;
      }

      // Test 2: Environment Variables
      addResult('ENV', 'info', 'Checking environment variables...', null);
      const envVars = {
        VITE_FIREBASE_API_KEY: import.meta.env.VITE_FIREBASE_API_KEY ? '✓' : '❌',
        VITE_FIREBASE_AUTH_DOMAIN: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN ? '✓' : '❌',
        VITE_FIREBASE_PROJECT_ID: import.meta.env.VITE_FIREBASE_PROJECT_ID ? '✓' : '❌',
        VITE_FIREBASE_STORAGE_BUCKET: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET ? '✓' : '❌',
        VITE_FIREBASE_MESSAGING_SENDER_ID: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID ? '✓' : '❌',
        VITE_FIREBASE_APP_ID: import.meta.env.VITE_FIREBASE_APP_ID ? '✓' : '❌'
      };
      
      const missingVars = Object.entries(envVars).filter(([_, value]) => value === '❌');
      if (missingVars.length > 0) {
        addResult('ENV', 'error', `❌ Missing environment variables: ${missingVars.map(([key]) => key).join(', ')}`, envVars);
      } else {
        addResult('ENV', 'success', '✅ All environment variables found', envVars);
      }

      // Test 3: Firestore Write Test
      addResult('FIRESTORE_WRITE', 'info', 'Testing Firestore write permissions...', null);
      try {
        const testDoc = doc(db, 'test', 'debug_test_' + Date.now());
        await setDoc(testDoc, {
          message: 'Debug test document',
          timestamp: serverTimestamp(),
          userId: getCurrentUserId()
        });
        addResult('FIRESTORE_WRITE', 'success', '✅ Firestore write successful', null);
      } catch (error) {
        addResult('FIRESTORE_WRITE', 'error', `❌ Firestore write failed: ${error.message}`, error);
        if (error.code === 'permission-denied') {
          addResult('FIRESTORE_RULES', 'warning', '⚠️ Check your Firestore security rules - they may be blocking writes', null);
        }
      }

      // Test 4: Firestore Read Test
      addResult('FIRESTORE_READ', 'info', 'Testing Firestore read permissions...', null);
      try {
        const testCollection = collection(db, 'test');
        const querySnapshot = await getDocs(testCollection);
        addResult('FIRESTORE_READ', 'success', `✅ Firestore read successful (found ${querySnapshot.size} test documents)`, null);
      } catch (error) {
        addResult('FIRESTORE_READ', 'error', `❌ Firestore read failed: ${error.message}`, error);
      }

      // Test 5: Firebase Storage Test
      addResult('STORAGE', 'info', 'Testing Firebase Storage...', null);
      try {
        // Create a small test image blob
        const canvas = document.createElement('canvas');
        canvas.width = 100;
        canvas.height = 100;
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = 'blue';
        ctx.fillRect(0, 0, 100, 100);
        
        const testBlob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
        const testRef = ref(storage, `test/debug_test_${Date.now()}.png`);
        
        const uploadResult = await uploadBytes(testRef, testBlob);
        const downloadURL = await getDownloadURL(uploadResult.ref);
        
        addResult('STORAGE', 'success', '✅ Firebase Storage upload/download successful', { downloadURL });
      } catch (error) {
        addResult('STORAGE', 'error', `❌ Firebase Storage failed: ${error.message}`, error);
      }

      // Test 6: Test Firebase Services
      addResult('SERVICES', 'info', 'Testing firebaseServices functions...', null);
      
      // Test saving a case
      try {
        const testCaseData = {
          caseNumber: 'DEBUG_CASE_' + Date.now(),
          caseTitle: 'Debug Test Case',
          dateOfIncident: new Date().toISOString().split('T')[0],
          region: 'western-cape',
          between: 'Debug test location A and B',
          locations: [
            {
              lat: -33.9249,
              lng: 18.4241,
              title: 'Debug Location 1',
              description: 'Test location for debugging',
              timestamp: new Date().toISOString(),
              ignitionStatus: 'OFF'
            },
            {
              lat: -33.9060,
              lng: 18.4157,
              title: 'Debug Location 2', 
              description: 'Second test location',
              timestamp: new Date().toISOString(),
              ignitionStatus: 'OFF'
            }
          ],
          locationTitles: ['Debug Location 1', 'Debug Location 2'],
          reportIntro: 'This is a debug test introduction.',
          reportConclusion: 'This is a debug test conclusion.',
          selectedForReport: [0, 1]
        };

        const userId = getCurrentUserId();
        const caseId = await saveCaseWithAnnotations(testCaseData, userId);
        setTestCaseId(caseId);
        addResult('SERVICES', 'success', `✅ saveCaseWithAnnotations successful`, { caseId });

        // Test loading the case back
        const loadedCase = await loadCaseWithAnnotations(caseId);
        addResult('SERVICES', 'success', `✅ loadCaseWithAnnotations successful`, { 
          caseNumber: loadedCase.caseNumber,
          locationsCount: loadedCase.locations?.length || 0
        });

        // Test updating annotations
        await updateCaseAnnotations(caseId, {
          reportIntro: 'Updated debug introduction',
          reportConclusion: 'Updated debug conclusion'
        });
        addResult('SERVICES', 'success', `✅ updateCaseAnnotations successful`, null);

        // Test getting user cases
        const userCases = await getUserCases(userId);
        addResult('SERVICES', 'success', `✅ getUserCases successful (found ${userCases.length} cases)`, null);

      } catch (error) {
        addResult('SERVICES', 'error', `❌ Firebase services test failed: ${error.message}`, error);
      }

      // Test 7: Test Snapshot Functionality
      addResult('SNAPSHOTS', 'info', 'Testing snapshot functionality...', null);
      try {
        // Create fake snapshot data
        const canvas = document.createElement('canvas');
        canvas.width = 200;
        canvas.height = 150;
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = 'red';
        ctx.fillRect(0, 0, 200, 150);
        ctx.fillStyle = 'white';
        ctx.font = '16px Arial';
        ctx.fillText('Test Map', 50, 75);
        
        const mockSnapshots = [
          {
            index: 0,
            mapImage: canvas.toDataURL('image/png'),
            streetViewImage: canvas.toDataURL('image/png'),
            title: 'Debug Location 1',
            description: 'Test snapshot description'
          }
        ];

        // Save mock snapshots to sessionStorage
        sessionStorage.setItem('locationSnapshots', JSON.stringify(mockSnapshots));

        if (testCaseId) {
          // Test saving snapshots to Firebase
          const snapshotResult = await saveSnapshotsToFirebase(testCaseId);
          addResult('SNAPSHOTS', 'success', `✅ saveSnapshotsToFirebase successful: ${snapshotResult.message}`, snapshotResult);

          // Test loading snapshots from Firebase
          const loadedSnapshots = await loadSnapshotsFromFirebase(testCaseId);
          addResult('SNAPSHOTS', 'success', `✅ loadSnapshotsFromFirebase successful (loaded ${loadedSnapshots.length} snapshots)`, null);
        } else {
          addResult('SNAPSHOTS', 'warning', '⚠️ Skipping Firebase snapshot tests (no test case ID)', null);
        }

      } catch (error) {
        addResult('SNAPSHOTS', 'error', `❌ Snapshot functionality test failed: ${error.message}`, error);
      }

      // Test 8: Performance Test
      addResult('PERFORMANCE', 'info', 'Running performance tests...', null);
      try {
        const startTime = performance.now();
        
        // Test multiple rapid saves
        const updatePromises = [];
        for (let i = 0; i < 5; i++) {
          if (testCaseId) {
            updatePromises.push(updateCaseAnnotations(testCaseId, {
              testField: `Performance test ${i}`,
              timestamp: Date.now()
            }));
          }
        }
        
        await Promise.all(updatePromises);
        const endTime = performance.now();
        
        addResult('PERFORMANCE', 'success', `✅ Performance test completed in ${(endTime - startTime).toFixed(2)}ms`, null);
      } catch (error) {
        addResult('PERFORMANCE', 'warning', `⚠️ Performance test had issues: ${error.message}`, error);
      }

      addResult('COMPLETE', 'success', '🎉 All Firebase debugging tests completed!', null);

    } catch (error) {
      addResult('FATAL', 'error', `💥 Fatal error during debugging: ${error.message}`, error);
    } finally {
      setIsRunning(false);
    }
  };

  const clearResults = () => {
    setDebugResults([]);
    setShowResults(false);
    setTestCaseId(null);
  };

  const getStatusIcon = (status) => {
    switch (status) {
      case 'success': return '✅';
      case 'error': return '❌';
      case 'warning': return '⚠️';
      case 'info': return 'ℹ️';
      default: return '📋';
    }
  };

  const getStatusColor = (status) => {
    switch (status) {
      case 'success': return 'text-green-400';
      case 'error': return 'text-red-400';
      case 'warning': return 'text-yellow-400';
      case 'info': return 'text-blue-400';
      default: return 'text-gray-400';
    }
  };

  return (
    <div className="bg-gray-800 p-4 rounded-lg shadow max-w-4xl mx-auto">
      <h2 className="text-xl font-semibold mb-4 text-white">🔥 Firebase Debugging Tool</h2>
      
      <div className="mb-4 space-y-2">
        <p className="text-gray-300">
          This tool runs comprehensive tests on your Firebase setup to identify connection issues.
        </p>
        <div className="flex gap-3">
          <button
            onClick={runComprehensiveTest}
            disabled={isRunning}
            className={`px-4 py-2 rounded font-medium ${
              isRunning 
                ? 'bg-gray-600 cursor-not-allowed text-gray-300' 
                : 'bg-blue-600 hover:bg-blue-700 text-white'
            }`}
          >
            {isRunning ? (
              <div className="flex items-center">
                <div className="animate-spin rounded-full h-4 w-4 border-t-2 border-b-2 border-white mr-2"></div>
                Running Tests...
              </div>
            ) : 'Run Firebase Tests'}
          </button>
          
          {debugResults.length > 0 && (
            <button
              onClick={clearResults}
              className="px-4 py-2 bg-gray-600 hover:bg-gray-700 rounded text-white font-medium"
            >
              Clear Results
            </button>
          )}
        </div>
      </div>

      {showResults && (
        <div className="space-y-3">
          <h3 className="text-lg font-medium text-white">Test Results:</h3>
          <div className="bg-gray-900 rounded p-4 max-h-96 overflow-y-auto">
            {debugResults.map((result, index) => (
              <div key={index} className={`mb-3 p-3 rounded border-l-4 ${
                result.status === 'success' ? 'border-green-500 bg-green-900 bg-opacity-20' :
                result.status === 'error' ? 'border-red-500 bg-red-900 bg-opacity-20' :
                result.status === 'warning' ? 'border-yellow-500 bg-yellow-900 bg-opacity-20' :
                'border-blue-500 bg-blue-900 bg-opacity-20'
              }`}>
                <div className="flex items-start space-x-2">
                  <span className="text-lg">{getStatusIcon(result.status)}</span>
                  <div className="flex-1">
                    <div className="flex items-center space-x-2">
                      <span className="font-medium text-gray-300">{result.test}</span>
                      <span className="text-xs text-gray-500">
                        {new Date(result.timestamp).toLocaleTimeString()}
                      </span>
                    </div>
                    <p className={`mt-1 ${getStatusColor(result.status)}`}>
                      {result.message}
                    </p>
                    {result.data && (
                      <details className="mt-2">
                        <summary className="text-xs text-gray-400 cursor-pointer">View Details</summary>
                        <pre className="text-xs text-gray-300 mt-1 bg-gray-800 p-2 rounded overflow-x-auto">
                          {JSON.stringify(result.data, null, 2)}
                        </pre>
                      </details>
                    )}
                  </div>
                </div>
              </div>
            ))}
            
            {debugResults.length === 0 && isRunning && (
              <div className="text-gray-400 text-center py-8">
                <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-blue-500 mx-auto mb-4"></div>
                Initializing tests...
              </div>
            )}
          </div>
        </div>
      )}

      {/* Quick Fix Suggestions */}
      <div className="mt-6 p-4 bg-gray-700 rounded">
        <h4 className="font-medium text-white mb-2">Common Issues & Quick Fixes:</h4>
        <div className="text-sm text-gray-300 space-y-2">
          <p><strong>Environment Variables Missing:</strong> Check your .env file in the project root</p>
          <p><strong>Permission Denied:</strong> Update Firestore security rules to allow read/write</p>
          <p><strong>Storage Upload Failed:</strong> Check Firebase Storage rules and ensure bucket exists</p>
          <p><strong>Functions Not Found:</strong> Verify firebaseServices.js import paths are correct</p>
          <p><strong>Network Error:</strong> Check internet connection and Firebase project status</p>
        </div>
      </div>
    </div>
  );
}

export default FirebaseDebugger;