// firebaseServices.js - Fixed Firebase services with proper structure and error handling
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
    GeoPoint,
    deleteDoc 
  } from 'firebase/firestore';
  import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
  
  // Import your Firebase configuration 
  import { db, storage, auth, getCurrentUserId as getAuthUserId, isAuthenticated } from '../firebase';
  
  // Collection names - proper structure
  const USERS_COLLECTION = 'users';
  const CASES_COLLECTION = 'cases';
  const REPORTS_COLLECTION = 'reports'; // Separate collection for reports
  const LOCATIONS_SUBCOLLECTION = 'locations';
  
  /**
   * Get current user ID with fallbacks
   */
export const getCurrentUserId = () => {
  try {
    if (getAuthUserId) {
      const userId = getAuthUserId();
      if (userId && userId !== 'anonymous_user_' + Date.now()) {
        return userId;
      }
    }

    if (auth && auth.currentUser) {
      return auth.currentUser.uid;
    }

    console.warn('No authenticated user found, using fallback ID');
    return 'dev_user_' + Date.now();
  } catch (error) {
    console.error('Error getting current user ID:', error);
    return 'fallback_user_' + Date.now();
  }
};

const fetchCaseDocsForUser = async (userId) => {
  if (!db) {
    throw new Error('Firebase database not initialized');
  }

  const casesRef = collection(db, CASES_COLLECTION);
  const docsMap = new Map();

  if (!userId) {
    const snapshot = await getDocs(casesRef);
    snapshot.forEach((docSnap) => docsMap.set(docSnap.id, docSnap));
    return Array.from(docsMap.values());
  }

  try {
    const userIdsQuery = query(casesRef, where('userIds', 'array-contains', userId));
    const userIdsSnapshot = await getDocs(userIdsQuery);
    userIdsSnapshot.forEach((docSnap) => docsMap.set(docSnap.id, docSnap));
  } catch (error) {
    console.warn('userIds query failed or returned no results:', error);
  }

  try {
    const legacyQuery = query(casesRef, where('userId', '==', userId));
    const legacySnapshot = await getDocs(legacyQuery);
    legacySnapshot.forEach((docSnap) => {
      if (!docsMap.has(docSnap.id)) {
        docsMap.set(docSnap.id, docSnap);
      }
    });
  } catch (error) {
    console.warn('legacy userId query failed or returned no results:', error);
  }

  return Array.from(docsMap.values());
};
  
  /**
   * Convert data URL to blob for upload with better error handling
   */
  const dataURLtoBlob = (dataURL) => {
    try {
      if (!dataURL || !dataURL.startsWith('data:')) {
        throw new Error('Invalid data URL format');
      }
      
      const arr = dataURL.split(',');
      if (arr.length !== 2) {
        throw new Error('Malformed data URL');
      }
      
      const mimeMatch = arr[0].match(/:(.*?);/);
      if (!mimeMatch) {
        throw new Error('Could not extract MIME type from data URL');
      }
      
      const mime = mimeMatch[1];
      const bstr = atob(arr[1]);
      let n = bstr.length;
      const u8arr = new Uint8Array(n);
      
      while (n--) {
        u8arr[n] = bstr.charCodeAt(n);
      }
      
      return new Blob([u8arr], { type: mime });
    } catch (error) {
      console.error('Error converting dataURL to blob:', error);
      throw new Error(`Failed to convert image data: ${error.message}`);
    }
  };
  
  /**
   * Save or update a case with proper data separation
   */
  export const saveCaseWithAnnotations = async (caseData, userId = null) => {
    try {
      console.log('Starting saveCaseWithAnnotations...', { caseData, userId });
      
      if (!db) {
        throw new Error('Firebase database not initialized');
      }
      
      const finalUserId = userId || getCurrentUserId();
      console.log('Using userId:', finalUserId);

      const initialUserIds = Array.isArray(caseData.userIds) ? caseData.userIds : [];
      const mergedUserIds = [];
      [...initialUserIds, finalUserId].forEach((uid) => {
        if (uid && !mergedUserIds.includes(uid)) {
          mergedUserIds.push(uid);
        }
      });

      // Create case document ID
      const caseId = caseData.caseId || `case_${caseData.caseNumber?.replace(/[^a-zA-Z0-9]/g, '_')}_${Date.now()}`;
      const caseRef = doc(db, CASES_COLLECTION, caseId);

      const caseDoc = {
        caseId: caseId,
        caseNumber: caseData.caseNumber,
        // canonical names
        caseTitle: caseData.caseTitle,
        dateOfIncident: caseData.dateOfIncident
          ? new Date(caseData.dateOfIncident)
          : new Date(),
      
        region: caseData.region,
        between: caseData.between || '',
        urgency: caseData.urgency || 'Medium',
        userId: mergedUserIds[0] || finalUserId,
        userIds: mergedUserIds,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      
        locationTitles: caseData.locationTitles || [],
        reportIntro: caseData.reportIntro || '',
        reportConclusion: caseData.reportConclusion || '',
        selectedForReport: caseData.selectedForReport || [],

        evidenceItems: caseData.evidenceItems || [],
        technicalTerms: caseData.technicalTerms || [],
      
        // TEMP backward-compat mirrors (safe to remove after migration)
        title: caseData.caseTitle,
        date: caseData.dateOfIncident
          ? new Date(caseData.dateOfIncident)
          : new Date(),
      };
      
      
      console.log('Saving case document:', caseDoc);
      await setDoc(caseRef, caseDoc, { merge: true });
      console.log('Case document saved successfully');
      
      // Save locations as subcollection with clean data
      if (caseData.locations && caseData.locations.length > 0) {
        console.log('Saving locations subcollection...');
        await saveLocationsToSubcollection(caseId, caseData.locations, caseData.locationTitles || []);
        console.log('Locations subcollection saved successfully');
      }
      
      console.log('Case saved to Firebase with ID:', caseId);
      return caseId;
    } catch (error) {
      console.error('Error saving case with annotations:', error);
      throw new Error(`Failed to save case: ${error.message}`);
    }
  };
  
  /**
   * Save locations with clean data structure
   */
  const saveLocationsToSubcollection = async (caseId, locations, locationTitles = []) => {
    try {
      console.log('Saving locations to subcollection:', { caseId, locationCount: locations.length });
      
      const locationsPromises = locations.map(async (location, index) => {
        const locationId = `location_${index}`;
        const locationRef = doc(db, CASES_COLLECTION, caseId, LOCATIONS_SUBCOLLECTION, locationId);
        
        const lat = parseFloat(location.lat) || 0;
        const lng = parseFloat(location.lng) || 0;
        
        const locationDoc = {
          locationId,
          // New: keep both shapes to satisfy all readers
          coordinates: new GeoPoint(lat, lng),
          lat,                     // <— add this
          lng,                     // <— and this
        
          title: locationTitles[index] || "",
          description: "",
          order: index,
          timestamp: location.timestamp || null,
          ignitionStatus: location.ignitionStatus || null,
          address: location.address || null,
          originalData: {
            csvDescription: location.description || null,
            rawData: location.rawData || null
          },
          mapSnapshotUrl: null,
          streetViewSnapshotUrl: null,
          snapshotUrl: null,
          createdAt: serverTimestamp()
        };
        
        
        console.log(`Saving location ${index}:`, locationDoc);
        await setDoc(locationRef, locationDoc, { merge: true });
      });
      
      await Promise.all(locationsPromises);
      console.log('All locations saved to subcollection successfully');
    } catch (error) {
      console.error('Error saving locations subcollection:', error);
      throw new Error(`Failed to save locations: ${error.message}`);
    }
  };
  
  /**
   * Load case with proper data structure
   */
  export const loadCaseWithAnnotations = async (caseId) => {
    try {
      console.log('Loading case with annotations:', caseId);
      
      if (!db || !caseId) {
        throw new Error('Firebase database not initialized or no case ID provided');
      }
      
      // Get case document
      const caseRef = doc(db, CASES_COLLECTION, caseId);
      const caseSnap = await getDoc(caseRef);
      
      if (!caseSnap.exists()) {
        throw new Error(`Case not found: ${caseId}`);
      }
      
      const caseData = caseSnap.data();
      console.log('Loaded case data:', caseData);
      
      // Get locations subcollection
      const locationsQuery = query(
        collection(db, CASES_COLLECTION, caseId, LOCATIONS_SUBCOLLECTION)
      );
      const locationsSnap = await getDocs(locationsQuery);
      
      const locations = [];
      locationsSnap.forEach((doc) => {
        const locationData = doc.data();
        const gp = locationData.coordinates; // may be undefined if older writes used lat/lng only

        const lat =
          (gp && typeof gp.latitude === "number" ? gp.latitude : undefined) ??
          (typeof locationData.lat === "number" ? locationData.lat : undefined) ??
          0;
        
        const lng =
          (gp && typeof gp.longitude === "number" ? gp.longitude : undefined) ??
          (typeof locationData.lng === "number" ? locationData.lng : undefined) ??
          0;
        
        // Reconstruct location with proper structure
        locations[locationData.order] = {
          lat,
          lng,
          title: locationData.title || "",
          description: locationData.description || "",
          timestamp: locationData.timestamp || null,
          ignitionStatus: locationData.ignitionStatus || null,
          address: locationData.address || null,
          originalData: locationData.originalData || {},
          mapSnapshotUrl: locationData.mapSnapshotUrl || null,
          streetViewSnapshotUrl: locationData.streetViewSnapshotUrl || null,
          snapshotUrl: locationData.snapshotUrl || null,
          annotation: {
            title: locationData.title || "",
            description: locationData.description || ""
          }
        };        
      });
      
      console.log('Loaded locations:', locations.filter(Boolean).length);
      
      const result = {
        caseId: caseData.caseId,
        caseNumber: caseData.caseNumber,
        caseTitle: caseData.caseTitle || caseData.title, // prefer canonical
        dateOfIncident:
          caseData.dateOfIncident?.toDate?.() || caseData.dateOfIncident ||
          caseData.date?.toDate?.() || caseData.date,   // fall back to legacy
      
        region: caseData.region,
        between: caseData.between || '',
        urgency: caseData.urgency || '',
        userId: caseData.userId,
        userIds: caseData.userIds || (caseData.userId ? [caseData.userId] : []),
        locations: locations.filter(Boolean),
        locationTitles: caseData.locationTitles || [],
        reportIntro: caseData.reportIntro || '',
        reportConclusion: caseData.reportConclusion || '',
        selectedForReport: caseData.selectedForReport || [],

        evidenceItems: caseData.evidenceItems || [],
        technicalTerms: caseData.technicalTerms || [],
      };
      
      
      console.log('Final loaded case result:', result);
      return result;
    } catch (error) {
      console.error('Error loading case:', error);
      throw new Error(`Failed to load case: ${error.message}`);
    }
  };
  
  /**
   * Update case annotations with proper data handling
   */
  export const updateCaseAnnotations = async (caseId, updates) => {
    try {
      console.log('Updating case annotations:', { caseId, updates });
      
      if (!db || !caseId) {
        throw new Error('Firebase database not initialized or no case ID provided');
      }
      
      const caseRef = doc(db, CASES_COLLECTION, caseId);
      
      const updateData = {
        ...updates,
        updatedAt: serverTimestamp()
      };
      
      await updateDoc(caseRef, updateData);
      console.log('Case annotations updated successfully');
    } catch (error) {
      console.error('Error updating case annotations:', error);
      throw new Error(`Failed to update annotations: ${error.message}`);
    }
  };
  
  /**
   * Update location with better error handling
   */
  export const updateLocationAnnotations = async (caseId, locationIndex, updates) => {
    try {
      console.log('Updating location annotations:', { caseId, locationIndex, updates });
      
      if (!db || !caseId) {
        throw new Error('Firebase database not initialized or no case ID provided');
      }
      
      const locationId = `location_${locationIndex}`;
      const locationRef = doc(db, CASES_COLLECTION, caseId, LOCATIONS_SUBCOLLECTION, locationId);
      
      await updateDoc(locationRef, {
        ...updates,
        updatedAt: serverTimestamp()
      });
      console.log(`Location ${locationIndex} updated successfully`);
    } catch (error) {
      console.error('Error updating location:', error);
      throw new Error(`Failed to update location: ${error.message}`);
    }
  };
  
  /**
   * Upload snapshot with proper error handling and CORS fix
   */
  export const uploadLocationSnapshot = async (caseId, locationIndex, imageBlob, imageType = 'snapshot') => {
    try {
      console.log('Uploading location snapshot:', { caseId, locationIndex, imageType });
      
      if (!storage) {
        throw new Error('Firebase storage not initialized');
      }
      
      if (!imageBlob || imageBlob.size === 0) {
        throw new Error('Invalid image data provided');
      }
      
      const timestamp = Date.now();
      const filename = `snapshots/${caseId}/location_${locationIndex}_${imageType}_${timestamp}.png`;
      const storageRef = ref(storage, filename);
      
      console.log('Uploading to Firebase Storage:', filename);
      
      // Upload with metadata to help with CORS
      const metadata = {
        contentType: 'image/png',
        cacheControl: 'public, max-age=31536000',
        customMetadata: {
          caseId: caseId,
          locationIndex: locationIndex.toString(),
          imageType: imageType
        }
      };
      
      const snapshot = await uploadBytes(storageRef, imageBlob, metadata);
      const downloadURL = await getDownloadURL(snapshot.ref);
      
      console.log('Upload successful, URL:', downloadURL);
      
      // Update location document with snapshot URL
      const updateField = imageType === 'map' ? 'mapSnapshotUrl' : 
                         imageType === 'streetview' ? 'streetViewSnapshotUrl' : 'snapshotUrl';
      
      await updateLocationAnnotations(caseId, locationIndex, {
        [updateField]: downloadURL
      });
      
      console.log(`Location ${locationIndex} updated with ${imageType} URL`);
      return downloadURL;
    } catch (error) {
      console.error('Error uploading snapshot:', error);
      throw new Error(`Failed to upload snapshot: ${error.message}`);
    }
  };
  
  /**
   * Save snapshots with better error handling
   */
  export const saveSnapshotsToFirebase = async (caseId) => {
    try {
      console.log('Starting snapshot save to Firebase for case:', caseId);
      
      if (!caseId) {
        return { success: true, message: 'No case ID provided', results: [] };
      }
      
      const storedSnapshots = sessionStorage.getItem('locationSnapshots');
      if (!storedSnapshots) {
        console.log('No snapshots found in sessionStorage');
        return { success: true, message: 'No snapshots to save', results: [] };
      }
  
      const snapshots = JSON.parse(storedSnapshots);
      const uploadPromises = [];
      let processedCount = 0;
  
      // fetch actual location count
      const locSnap = await getDocs(collection(db, CASES_COLLECTION, caseId, LOCATIONS_SUBCOLLECTION));
      const locationCount = locSnap.size;
      for (let i = 0; i < snapshots.length; i++) {
        const snapshot = snapshots[i];
        if (!snapshot) continue;
        if (i >= locationCount) {
          console.warn(`Skipping snapshot index ${i}: no matching location document (count=${locationCount})`);
          continue;
        }
  
        processedCount++;
        console.log(`Processing snapshot ${i}:`, {
          hasMapImage: !!snapshot.mapImage,
          hasStreetViewImage: !!snapshot.streetViewImage,
          hasDescription: !!snapshot.description
        });
  
        // Upload map image if exists
        if (snapshot.mapImage) {
          try {
            const mapBlob = await sourceToBlob(snapshot.mapImage);
            const mapUploadPromise = uploadLocationSnapshot(caseId, i, mapBlob, 'map')
              .then(mapUrl => {
                console.log(`Map image uploaded for location ${i}:`, mapUrl);
                return { index: i, mapUrl, type: 'map', success: true };
              })
              .catch(error => {
                console.error(`Map upload failed for location ${i}:`, error);
                return { index: i, error: error.message, type: 'map', success: false };
              });
            uploadPromises.push(mapUploadPromise);
          } catch (error) {
            console.error(`Error processing map image for location ${i}:`, error);
            uploadPromises.push(Promise.resolve({ 
              index: i, 
              error: error.message, 
              type: 'map', 
              success: false 
            }));
          }
        }
  
        // Upload street view image if exists
        if (snapshot.streetViewImage) {
          try {
            const streetViewBlob = await sourceToBlob(snapshot.streetViewImage);
            const streetViewUploadPromise = uploadLocationSnapshot(caseId, i, streetViewBlob, 'streetview')
              .then(streetViewUrl => {
                console.log(`Street view image uploaded for location ${i}:`, streetViewUrl);
                return { index: i, streetViewUrl, type: 'streetview', success: true };
              })
              .catch(error => {
                console.error(`Street view upload failed for location ${i}:`, error);
                return { index: i, error: error.message, type: 'streetview', success: false };
              });
            uploadPromises.push(streetViewUploadPromise);
          } catch (error) {
            console.error(`Error processing street view image for location ${i}:`, error);
            uploadPromises.push(Promise.resolve({ 
              index: i, 
              error: error.message, 
              type: 'streetview', 
              success: false 
            }));
          }
        }
  
        // Update description and title
        if (snapshot.description || snapshot.title) {
          const descUpdatePromise = updateLocationAnnotations(caseId, i, {
            description: snapshot.description || '',
            title: snapshot.title || ''
          }).then(() => {
            console.log(`Description and title saved for location ${i}`);
            return { index: i, description: snapshot.description, title: snapshot.title, type: 'annotation', success: true };
          }).catch(error => {
            console.error(`Description save failed for location ${i}:`, error);
            return { index: i, error: error.message, type: 'annotation', success: false };
          });
          uploadPromises.push(descUpdatePromise);
        }
      }
  
      if (uploadPromises.length === 0) {
        return { success: true, message: 'No snapshots to upload', results: [] };
      }
  
      const results = await Promise.all(uploadPromises);
      const successfulUploads = results.filter(result => result && result.success);
      const failedUploads = results.filter(result => result && !result.success);
  
      console.log('Snapshot save results:', {
        processed: processedCount,
        totalOperations: uploadPromises.length,
        successful: successfulUploads.length,
        failed: failedUploads.length
      });
  
      return {
        success: true,
        message: `Processed ${processedCount} snapshots: ${successfulUploads.length} successful, ${failedUploads.length} failed`,
        results: successfulUploads,
        errors: failedUploads
      };
  
    } catch (error) {
      console.error('Error saving snapshots to Firebase:', error);
      throw new Error(`Failed to save snapshots: ${error.message}`);
    }
  };
  
  /**
   * Load snapshots from Firebase with proper error handling
   */
  export const loadSnapshotsFromFirebase = async (caseId) => {
    try {
      console.log('Loading snapshots from Firebase for case:', caseId);
      
      if (!db || !caseId) {
        console.log('No database or case ID, returning empty array');
        return [];
      }
      
      const locationsQuery = query(
        collection(db, CASES_COLLECTION, caseId, LOCATIONS_SUBCOLLECTION)
      );
      const locationsSnap = await getDocs(locationsQuery);
      
      const sessionSnapshots = [];
      let snapshotCount = 0;
  
      locationsSnap.forEach((doc) => {
        const locationData = doc.data();
        const index = locationData.order;
        
        const hasSnapshots = locationData.mapSnapshotUrl || 
                            locationData.streetViewSnapshotUrl || 
                            locationData.snapshotUrl ||
                            locationData.description;
        
        if (hasSnapshots) {
          sessionSnapshots[index] = {
            index: index,
            title: locationData.title || '',
            description: locationData.description || '',
            mapImage: null, // URLs can't be converted back to base64
            streetViewImage: null,
            mapSnapshotUrl: locationData.mapSnapshotUrl,
            streetViewSnapshotUrl: locationData.streetViewSnapshotUrl,
            snapshotUrl: locationData.snapshotUrl,
            hasMapSnapshot: !!locationData.mapSnapshotUrl,
            hasStreetViewSnapshot: !!locationData.streetViewSnapshotUrl
          };
          snapshotCount++;
        }
      });
  
      if (snapshotCount > 0) {
        sessionStorage.setItem('locationSnapshots', JSON.stringify(sessionSnapshots));
        console.log(`Loaded ${snapshotCount} snapshots from Firebase to sessionStorage`);
      } else {
        console.log('No snapshots found in Firebase');
      }
      
      return sessionSnapshots.filter(Boolean);
      
    } catch (error) {
      console.error('Error loading snapshots from Firebase:', error);
      throw new Error(`Failed to load snapshots: ${error.message}`);
    }
  };
  
  /**
   * Create report document in separate collection (FIXED STRUCTURE)
   */
  export const createReportDocument = async (caseId, reportData, userId = null) => {
    try {
      console.log('Creating report document in separate collection:', { caseId, reportData, userId });
      
      if (!db) {
        throw new Error('Firebase database not initialized');
      }
      
      const finalUserId = userId || getCurrentUserId();
      const reportId = `report_${caseId}_${Date.now()}`;
      
      // Create report in separate REPORTS collection
      const reportDoc = {
        reportId: reportId,
        caseId: caseId, // Reference to the case
        introduction: reportData.introduction || '',
        conclusion: reportData.conclusion || '',
        evidence: reportData.evidence || [],
        technicalTerms: reportData.technicalTerms || [],
        userId: finalUserId,
        createdAt: serverTimestamp(),
        reportType: reportData.reportType || 'standard',
        reportFileUrl: reportData.reportFileUrl || null,
        fileName: reportData.fileName || null,
        fileSize: reportData.fileSize || null
      };
      
      const reportRef = doc(db, REPORTS_COLLECTION, reportId);
      await setDoc(reportRef, reportDoc);
      
      console.log('Report created with ID:', reportId);
      return reportId;
    } catch (error) {
      console.error('Error creating report:', error);
      throw new Error(`Failed to create report: ${error.message}`);
    }
  };
  
  /**
   * Get reports for a specific case
   */
  export const getCaseReports = async (caseId) => {
    try {
      console.log('Getting reports for case:', caseId);
      
      if (!db || !caseId) {
        return [];
      }
      
      const reportsQuery = query(
        collection(db, REPORTS_COLLECTION),
        where('caseId', '==', caseId)
      );
      
      const querySnapshot = await getDocs(reportsQuery);
      const reports = [];
      
      querySnapshot.forEach((doc) => {
        const data = doc.data();
        reports.push({
          id: doc.id,
          reportId: data.reportId,
          caseId: data.caseId,
          introduction: data.introduction,
          conclusion: data.conclusion,
          reportType: data.reportType,
          reportFileUrl: data.reportFileUrl,
          fileName: data.fileName,
          createdAt: data.createdAt?.toDate?.() || data.createdAt
        });
      });
      
      const sortedReports = reports.sort((a, b) => {
        const dateA = a.createdAt || new Date(0);
        const dateB = b.createdAt || new Date(0);
        return dateB - dateA;
      });
      
      console.log(`Found ${sortedReports.length} reports for case ${caseId}`);
      return sortedReports;
    } catch (error) {
      console.error('Error getting case reports:', error);
      throw new Error(`Failed to get case reports: ${error.message}`);
    }
  };
  
  /**
   * Get all cases for a user
   */
  export const getUserCases = async (userId = null) => {
    try {
      console.log('Getting user cases for userId:', userId);
      
      if (!db) {
        throw new Error('Firebase database not initialized');
      }
      
      const finalUserId = userId || getCurrentUserId();
      
      const cases = [];
      const docSnapshots = await fetchCaseDocsForUser(finalUserId);

      docSnapshots.forEach((doc) => {
        const data = doc.data() || {};
        cases.push({
          id: doc.id,
          caseId: data.caseId,
          caseNumber: data.caseNumber,
        
          // canonical for UI pages like MyCasesPage
          caseTitle: data.caseTitle || data.title,
          dateOfIncident:
            data.dateOfIncident?.toDate?.() || data.dateOfIncident ||
            data.date?.toDate?.() || data.date,
        
          region: data.region,
          createdAt: data.createdAt?.toDate?.() || data.createdAt,
          urgency: data.urgency || 'Medium',
          locationTitles: data.locationTitles || [],
          reportIntro: data.reportIntro || '',
          reportConclusion: data.reportConclusion || '',
          userIds: data.userIds || [],
        });        
      });
      
      const sortedCases = cases.sort((a, b) => {
        const dateA = a.createdAt || new Date(0);
        const dateB = b.createdAt || new Date(0);
        return dateB - dateA;
      });
      
      console.log(`Found ${sortedCases.length} cases for user ${finalUserId}`);
      return sortedCases;
    } catch (error) {
      console.error('Error getting user cases:', error);
      throw new Error(`Failed to get user cases: ${error.message}`);
    }
  };
  
  /**
   * Batch save annotations with better error handling
   */
  export const batchSaveAnnotations = async (caseId, annotationsData) => {
    try {
      console.log('Batch saving annotations:', { caseId, annotationsData });
      
      if (!db) {
        throw new Error('Firebase database not initialized');
      }
      
      // Update case document
      const caseUpdatePromise = updateCaseAnnotations(caseId, {
        locationTitles: annotationsData.locationTitles || [],
        reportIntro: annotationsData.reportIntro || '',
        reportConclusion: annotationsData.reportConclusion || '',
        selectedForReport: annotationsData.selectedForReport || []
      });
      
      // Update individual locations if data is provided
      const locationUpdatePromises = [];
      if (annotationsData.locationDescriptions && Array.isArray(annotationsData.locationDescriptions)) {
        annotationsData.locationDescriptions.forEach((description, index) => {
          if (description !== undefined) {
            locationUpdatePromises.push(
              updateLocationAnnotations(caseId, index, { 
                description: description,
                title: annotationsData.locationTitles?.[index] || ''
              })
            );
          }
        });
      }
      
      // Wait for all updates to complete
      await Promise.all([caseUpdatePromise, ...locationUpdatePromises]);
      console.log('Batch annotations saved successfully');
    } catch (error) {
      console.error('Error in batch save:', error);
      throw new Error(`Failed to batch save annotations: ${error.message}`);
    }
  };
  
  /**
   * Check if case exists
   */
  export const caseExists = async (caseId) => {
    try {
      if (!db || !caseId) {
        return false;
      }
      
      const caseRef = doc(db, CASES_COLLECTION, caseId);
      const caseSnap = await getDoc(caseRef);
      return caseSnap.exists();
    } catch (error) {
      console.error('Error checking if case exists:', error);
      return false;
    }
  };
  
  /**
   * Delete case and all associated data
   */
  export const deleteCase = async (caseId) => {
    try {
      console.log('Deleting case:', caseId);
      
      if (!db) {
        throw new Error('Firebase database not initialized');
      }
      
      // Delete all locations in the subcollection
      const locationsQuery = query(
        collection(db, CASES_COLLECTION, caseId, LOCATIONS_SUBCOLLECTION)
      );
      const locationsSnap = await getDocs(locationsQuery);
      
      const deletePromises = [];
      locationsSnap.forEach((doc) => {
        deletePromises.push(deleteDoc(doc.ref));
      });
      
      // Delete all reports for this case
      const reportsQuery = query(
        collection(db, REPORTS_COLLECTION),
        where('caseId', '==', caseId)
      );
      const reportsSnap = await getDocs(reportsQuery);
      reportsSnap.forEach((doc) => {
        deletePromises.push(deleteDoc(doc.ref));
      });
      
      await Promise.all(deletePromises);
      
      // Delete the main case document
      const caseRef = doc(db, CASES_COLLECTION, caseId);
      await deleteDoc(caseRef);
      
      console.log('Case and all associated data deleted successfully');
      return true;
    } catch (error) {
      console.error('Error deleting case:', error);
      throw new Error(`Failed to delete case: ${error.message}`);
    }
  };
  
  /**
   * Get case statistics
   */
  export const getCaseStatistics = async (userId = null) => {
    try {
      console.log('Getting case statistics for userId:', userId);
      
      if (!db) {
        throw new Error('Firebase database not initialized');
      }
      
      const finalUserId = userId || getCurrentUserId();
      
      const stats = {
        totalCases: 0,
        casesWithLocations: 0,
        casesWithSnapshots: 0,
        casesWithReports: 0,
        totalLocations: 0,
        totalSnapshots: 0
      };
      const caseDocs = await fetchCaseDocsForUser(finalUserId);

      for (const caseDoc of caseDocs) {
        stats.totalCases++;
        
        // Check locations subcollection
        const locationsQuery = query(
          collection(db, CASES_COLLECTION, caseDoc.id, LOCATIONS_SUBCOLLECTION)
        );
        const locationsSnap = await getDocs(locationsQuery);
        
        if (!locationsSnap.empty) {
          stats.casesWithLocations++;
          stats.totalLocations += locationsSnap.size;
          
          locationsSnap.forEach(locationDoc => {
            const locationData = locationDoc.data();
            if (locationData.mapSnapshotUrl || 
                locationData.streetViewSnapshotUrl || 
                locationData.snapshotUrl) {
              stats.totalSnapshots++;
            }
          });
        }
        
        // Check for reports in separate collection
        const reportsQuery = query(
          collection(db, REPORTS_COLLECTION),
          where('caseId', '==', caseDoc.id)
        );
        const reportsSnap = await getDocs(reportsQuery);
        if (!reportsSnap.empty) {
          stats.casesWithReports++;
        }
      }
      
      stats.casesWithSnapshots = Math.min(stats.totalSnapshots, stats.totalCases);
      
      console.log('Case statistics:', stats);
      return stats;
    } catch (error) {
      console.error('Error getting case statistics:', error);
      throw new Error(`Failed to get case statistics: ${error.message}`);
    }
  };
  
  /**
   * Create or update user profile
   */
  export const createUserProfile = async (userId, userData) => {
    try {
      console.log('Creating/updating user profile:', { userId, userData });
      
      if (!db) {
        throw new Error('Firebase database not initialized');
      }
      
      const userRef = doc(db, USERS_COLLECTION, userId);
      const userDoc = {
        UserID: userId,
        firstname: userData.firstname || '',
        surname: userData.surname || '',
        email: userData.email || '',
        phoneNumber: userData.phoneNumber || '',
        idNumber: userData.idNumber || '',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      };
      
      await setDoc(userRef, userDoc, { merge: true });
      console.log('User profile created/updated successfully');
    } catch (error) {
      console.error('Error creating user profile:', error);
      throw new Error(`Failed to create user profile: ${error.message}`);
    }
  };

  const sourceToBlob = async (src) => {
    if (!src) throw new Error("No image source");
    if (src.startsWith("data:")) {
      return dataURLtoBlob(src);
    }
    if (src.startsWith("http") || src.startsWith("blob:")) {
      const resp = await fetch(src);
      if (!resp.ok) throw new Error(`Fetch failed (${resp.status})`);
      return await resp.blob();
    }
    throw new Error("Unsupported image source");
  };
  
