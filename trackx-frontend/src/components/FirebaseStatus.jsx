import React, { useState, useEffect } from 'react';
import { AlertTriangle, CheckCircle, XCircle, RefreshCw } from 'lucide-react';
import { testFirebaseConnection } from '../firebase';

const FirebaseStatus = () => {
  const [connectionStatus, setConnectionStatus] = useState({
    loading: true,
    connected: false,
    message: 'Checking connection...',
    details: null
  });

  const checkConnection = async () => {
    setConnectionStatus(prev => ({ ...prev, loading: true }));
    
    try {
      const result = await testFirebaseConnection();
      setConnectionStatus({
        loading: false,
        connected: result.success,
        message: result.message,
        details: result.code ? `Error code: ${result.code}` : null
      });
    } catch (error) {
      setConnectionStatus({
        loading: false,
        connected: false,
        message: 'Connection test failed',
        details: error.message
      });
    }
  };

  useEffect(() => {
    checkConnection();
  }, []);

  const getStatusIcon = () => {
    if (connectionStatus.loading) {
      return <RefreshCw className="w-5 h-5 animate-spin text-blue-500" />;
    }
    if (connectionStatus.connected) {
      return <CheckCircle className="w-5 h-5 text-green-500" />;
    }
    return <XCircle className="w-5 h-5 text-red-500" />;
  };

  const getStatusColor = () => {
    if (connectionStatus.loading) return 'bg-blue-50 border-blue-200';
    if (connectionStatus.connected) return 'bg-green-50 border-green-200';
    return 'bg-red-50 border-red-200';
  };

  const getTextColor = () => {
    if (connectionStatus.loading) return 'text-blue-700';
    if (connectionStatus.connected) return 'text-green-700';
    return 'text-red-700';
  };

  return (
    <div className={`p-3 border rounded-lg ${getStatusColor()}`}>
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-2">
          {getStatusIcon()}
          <span className={`font-medium ${getTextColor()}`}>
            Firebase: {connectionStatus.message}
          </span>
        </div>
        
        {!connectionStatus.loading && (
          <button
            onClick={checkConnection}
            className="text-xs px-2 py-1 rounded bg-white border hover:bg-gray-50"
          >
            Retry
          </button>
        )}
      </div>
      
      {connectionStatus.details && (
        <div className="mt-2 text-xs text-gray-600">
          {connectionStatus.details}
        </div>
      )}

      {!connectionStatus.connected && !connectionStatus.loading && (
        <div className="mt-2 text-xs text-gray-600">
          <strong>Troubleshooting:</strong>
          <ul className="list-disc list-inside mt-1 space-y-1">
            <li>Check your .env file has all Firebase config values</li>
            <li>Verify your Firebase project settings</li>
            <li>Check browser console for detailed errors</li>
            <li>Ensure you have internet connection</li>
          </ul>
        </div>
      )}
    </div>
  );
};

export default FirebaseStatus;