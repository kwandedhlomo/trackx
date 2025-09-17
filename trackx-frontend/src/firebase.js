// firebase.js - Enhanced Firebase configuration for TrackX
import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { getStorage } from 'firebase/storage';
import { doc, getDoc } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

// Validate configuration before initialization
const validateConfig = (config) => {
  const required = ['apiKey', 'authDomain', 'projectId', 'storageBucket', 'messagingSenderId', 'appId'];
  const missing = required.filter(key => !config[key]);
  
  if (missing.length > 0) {
    throw new Error(`Missing Firebase configuration: ${missing.join(', ')}. Check your .env file.`);
  }
  
  return true;
};

// Initialize Firebase variables with defaults to prevent export errors
let app = null;
let db = null;
let auth = null;
let storage = null;

// Initialize Firebase with proper error handling
try {
  validateConfig(firebaseConfig);
  
  app = initializeApp(firebaseConfig);
  db = getFirestore(app);
  auth = getAuth(app);
  storage = getStorage(app);
  
  console.log('✅ Firebase initialized successfully');
  
  // Debug: Log configuration status (remove in production)
  if (import.meta.env.DEV) {
    console.log('Firebase Config Status:', {
      apiKey: firebaseConfig.apiKey ? 'SET' : 'MISSING',
      authDomain: firebaseConfig.authDomain ? 'SET' : 'MISSING',
      projectId: firebaseConfig.projectId ? 'SET' : 'MISSING',
      storageBucket: firebaseConfig.storageBucket ? 'SET' : 'MISSING',
      messagingSenderId: firebaseConfig.messagingSenderId ? 'SET' : 'MISSING',
      appId: firebaseConfig.appId ? 'SET' : 'MISSING'
    });
  }
  
} catch (error) {
  console.error('❌ Firebase initialization error:', error);
  
  // Provide helpful error messages
  if (error.message.includes('Missing Firebase configuration')) {
    console.error('💡 Solution: Create a .env file in your project root with Firebase configuration values');
    console.error('💡 Get these values from: https://console.firebase.google.com → Project Settings → Your Web App');
  }
  
  // Keep variables as null if initialization fails
  app = null;
  db = null;
  auth = null;
  storage = null;
}

// Helper function to get current user ID
export const getCurrentUserId = () => {
  try {
    if (auth && auth.currentUser) {
      return auth.currentUser.uid;
    }
    
    // Fallback for development/testing
    console.warn('No authenticated user found, using fallback ID');
    return 'dev_user_' + Date.now();
  } catch (error) {
    console.error('Error getting current user ID:', error);
    return 'fallback_user_' + Date.now();
  }
};

// Helper function to check authentication status
export const isAuthenticated = () => {
  try {
    return !!(auth && auth.currentUser);
  } catch (error) {
    console.error('Error checking authentication status:', error);
    return false;
  }
};

// Helper function to wait for auth state to be ready
export const waitForAuth = () => {
  return new Promise((resolve) => {
    if (!auth) {
      resolve(null);
      return;
    }
    
    const unsubscribe = auth.onAuthStateChanged((user) => {
      unsubscribe();
      resolve(user);
    });
  });
};

// Enhanced test connection function
export const testFirebaseConnection = async () => {
  try {
    console.log('🔍 Testing Firebase connection...');
    
    // Check if Firebase is properly initialized
    if (!db || !auth || !storage) {
      throw new Error('Firebase services not initialized - check configuration');
    }
    
    // Check if config is loaded
    if (!firebaseConfig.apiKey) {
      throw new Error('Firebase configuration missing - check your .env file');
    }
    
    // Test Firestore connection
    const testDoc = doc(db, 'test', 'connection');
    await getDoc(testDoc);
    
    // Test if user is authenticated (optional)
    const currentUser = auth.currentUser;
    
    console.log('✅ Firebase connection successful!');
    return { 
      success: true, 
      message: 'Connected to Firebase',
      services: {
        firestore: true,
        auth: true,
        storage: true
      },
      user: currentUser ? 'Authenticated' : 'Anonymous',
      projectId: firebaseConfig.projectId
    };
  } catch (error) {
    console.error('❌ Firebase connection failed:', error);
    
    // Provide specific error guidance
    let helpMessage = 'Connection failed';
    if (error.code === 'permission-denied') {
      helpMessage = 'Permission denied - check Firestore security rules';
    } else if (error.code === 'unavailable') {
      helpMessage = 'Firebase service unavailable - check internet connection';
    } else if (error.message.includes('configuration')) {
      helpMessage = 'Configuration error - check .env file';
    } else if (error.code === 'invalid-api-key') {
      helpMessage = 'Invalid API key - check VITE_FIREBASE_API_KEY';
    }
    
    return {
      success: false,
      message: helpMessage,
      code: error.code,
      details: error.message
    };
  }
};

// Utility function to check Firebase readiness
export const isFirebaseReady = () => {
  return !!(app && db && auth && storage);
};

// Utility function to get current connection status
export const getConnectionStatus = async () => {
  if (!isFirebaseReady()) {
    return { status: 'not-initialized', message: 'Firebase not properly initialized' };
  }
  
  try {
    const testResult = await testFirebaseConnection();
    return { 
      status: testResult.success ? 'connected' : 'error', 
      message: testResult.message,
      details: testResult
    };
  } catch (error) {
    return { status: 'error', message: error.message };
  }
};

// Export Firebase instances - using separate export statements to avoid syntax errors
export { db, auth, storage, app };