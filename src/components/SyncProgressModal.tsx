'use client';

import { useState, useEffect } from 'react';
import { X, Database, Clock, Zap, CheckCircle, AlertCircle, TrendingUp } from 'lucide-react';

interface SyncProgressData {
  totalRecords: number;
  processedRecords: number;
  createdRecords: number;
  updatedRecords: number;
  errorRecords: number;
  currentBatch: number;
  totalBatches: number;
  startTime: number;
  estimatedTimeRemaining?: number;
  recordsPerSecond?: number;
  status: 'initializing' | 'syncing' | 'completed' | 'error';
  currentOperation?: string;
  errors?: string[];
}

interface SyncProgressModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCancel?: () => void;
  databaseName: string;
  collectionName: string;
  progressData: SyncProgressData;
}

export default function SyncProgressModal({
  isOpen,
  onClose,
  onCancel,
  databaseName,
  collectionName,
  progressData
}: SyncProgressModalProps) {
  const [animatedProgress, setAnimatedProgress] = useState(0);
  const [elapsedTime, setElapsedTime] = useState(0);

  // Calculate progress percentage
  const progressPercentage = progressData.totalRecords > 0 
    ? Math.round((progressData.processedRecords / progressData.totalRecords) * 100)
    : 0;

  // Animate progress bar
  useEffect(() => {
    const timer = setTimeout(() => {
      setAnimatedProgress(progressPercentage);
    }, 100);
    return () => clearTimeout(timer);
  }, [progressPercentage]);

  // Update elapsed time
  useEffect(() => {
    if (progressData.status === 'syncing' && progressData.startTime) {
      const interval = setInterval(() => {
        setElapsedTime(Date.now() - progressData.startTime);
      }, 1000);
      return () => clearInterval(interval);
    }
  }, [progressData.status, progressData.startTime]);

  // Format time duration
  const formatTime = (milliseconds: number) => {
    const seconds = Math.floor(milliseconds / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    
    if (hours > 0) {
      return `${hours}h ${minutes % 60}m ${seconds % 60}s`;
    } else if (minutes > 0) {
      return `${minutes}m ${seconds % 60}s`;
    } else {
      return `${seconds}s`;
    }
  };

  // Format estimated time remaining
  const formatEstimatedTime = (milliseconds?: number) => {
    if (!milliseconds || milliseconds <= 0) return 'Calculating...';
    
    const seconds = Math.floor(milliseconds / 1000);
    const minutes = Math.floor(seconds / 60);
    
    if (minutes > 0) {
      return `~${minutes}m ${seconds % 60}s remaining`;
    } else {
      return `~${seconds}s remaining`;
    }
  };

  // Get status color and icon
  const getStatusDisplay = () => {
    switch (progressData.status) {
      case 'initializing':
        return {
          color: 'text-blue-400',
          bgColor: 'bg-blue-500/20',
          borderColor: 'border-blue-500/30',
          icon: <Database className="w-5 h-5 animate-pulse" />,
          text: 'Initializing sync...'
        };
      case 'syncing':
        return {
          color: 'text-green-400',
          bgColor: 'bg-green-500/20',
          borderColor: 'border-green-500/30',
          icon: <Zap className="w-5 h-5 animate-bounce" />,
          text: 'Syncing data...'
        };
      case 'completed':
        return {
          color: 'text-green-400',
          bgColor: 'bg-green-500/20',
          borderColor: 'border-green-500/30',
          icon: <CheckCircle className="w-5 h-5" />,
          text: 'Sync completed!'
        };
      case 'error':
        return {
          color: 'text-red-400',
          bgColor: 'bg-red-500/20',
          borderColor: 'border-red-500/30',
          icon: <AlertCircle className="w-5 h-5" />,
          text: 'Sync failed'
        };
      default:
        return {
          color: 'text-gray-400',
          bgColor: 'bg-gray-500/20',
          borderColor: 'border-gray-500/30',
          icon: <Database className="w-5 h-5" />,
          text: 'Unknown status'
        };
    }
  };

  const statusDisplay = getStatusDisplay();

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-gradient-to-br from-gray-900 to-gray-800 rounded-2xl border border-gray-700/50 p-4 sm:p-6 lg:p-8 max-w-4xl w-full max-h-[90vh] overflow-y-auto shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center space-x-3">
            <div className="w-12 h-12 bg-gradient-to-br from-blue-500 to-purple-600 rounded-xl flex items-center justify-center">
              <Database className="w-6 h-6 text-white" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-white">Database Sync</h2>
              <p className="text-gray-400 text-sm">{databaseName} → {collectionName}</p>
            </div>
          </div>
          {progressData.status === 'completed' && (
            <button
              onClick={onClose}
              className="p-2 text-gray-400 hover:text-white transition-colors rounded-lg hover:bg-gray-700/50"
            >
              <X className="w-5 h-5" />
            </button>
          )}
        </div>

        {/* Status Banner */}
        <div className={`flex items-center space-x-3 p-4 rounded-xl border ${statusDisplay.bgColor} ${statusDisplay.borderColor} mb-6`}>
          <div className={statusDisplay.color}>
            {statusDisplay.icon}
          </div>
          <div className="flex-1">
            <p className={`font-medium ${statusDisplay.color}`}>{statusDisplay.text}</p>
            {progressData.currentOperation && (
              <p className="text-gray-400 text-sm mt-1">{progressData.currentOperation}</p>
            )}
          </div>
        </div>

        {/* Progress Bar */}
        <div className="mb-8">
          <div className="flex items-center justify-between mb-3">
            <span className="text-white font-medium">Progress</span>
            <span className="text-2xl font-bold bg-gradient-to-r from-blue-400 to-purple-500 bg-clip-text text-transparent">
              {animatedProgress}%
            </span>
          </div>
          
          <div className="relative h-4 bg-gray-700/50 rounded-full overflow-hidden">
            <div 
              className="absolute inset-y-0 left-0 bg-gradient-to-r from-blue-500 via-purple-500 to-green-500 rounded-full transition-all duration-1000 ease-out"
              style={{ width: `${animatedProgress}%` }}
            >
              <div className="absolute inset-0 bg-white/20 animate-pulse rounded-full"></div>
            </div>
            
            {/* Animated shimmer effect */}
            {progressData.status === 'syncing' && (
              <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/10 to-transparent animate-shimmer"></div>
            )}
          </div>
          
          <div className="flex items-center justify-between mt-2 text-sm text-gray-400">
            <span>{progressData.processedRecords.toLocaleString()} of {progressData.totalRecords.toLocaleString()} records</span>
            <span>{progressData.totalRecords - progressData.processedRecords} remaining</span>
          </div>
        </div>

        {/* Statistics Grid */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          <div className="bg-gray-800/50 rounded-xl p-4 border border-gray-700/30">
            <div className="flex items-center space-x-2 mb-2">
              <div className="w-2 h-2 bg-green-400 rounded-full animate-pulse"></div>
              <span className="text-gray-400 text-xs uppercase tracking-wide">Created</span>
            </div>
            <p className="text-xl font-bold text-green-400">{progressData.createdRecords.toLocaleString()}</p>
          </div>
          
          <div className="bg-gray-800/50 rounded-xl p-4 border border-gray-700/30">
            <div className="flex items-center space-x-2 mb-2">
              <div className="w-2 h-2 bg-blue-400 rounded-full animate-pulse"></div>
              <span className="text-gray-400 text-xs uppercase tracking-wide">Updated</span>
            </div>
            <p className="text-xl font-bold text-blue-400">{progressData.updatedRecords.toLocaleString()}</p>
          </div>
          
          <div className="bg-gray-800/50 rounded-xl p-4 border border-gray-700/30">
            <div className="flex items-center space-x-2 mb-2">
              <TrendingUp className="w-3 h-3 text-purple-400" />
              <span className="text-gray-400 text-xs uppercase tracking-wide">Speed</span>
            </div>
            <p className="text-xl font-bold text-purple-400">
              {progressData.recordsPerSecond ? `${Math.round(progressData.recordsPerSecond)}/s` : '—'}
            </p>
          </div>
          
          <div className="bg-gray-800/50 rounded-xl p-4 border border-gray-700/30">
            <div className="flex items-center space-x-2 mb-2">
              <Clock className="w-3 h-3 text-orange-400" />
              <span className="text-gray-400 text-xs uppercase tracking-wide">Elapsed</span>
            </div>
            <p className="text-xl font-bold text-orange-400">{formatTime(elapsedTime)}</p>
          </div>
        </div>

        {/* Time Estimation */}
        {progressData.status === 'syncing' && (
          <div className="bg-gradient-to-r from-blue-500/10 to-purple-500/10 rounded-xl p-4 border border-blue-500/20 mb-6">
            <div className="flex items-center space-x-3">
              <Clock className="w-5 h-5 text-blue-400 animate-pulse" />
              <div>
                <p className="text-white font-medium">
                  {formatEstimatedTime(progressData.estimatedTimeRemaining)}
                </p>
                <p className="text-gray-400 text-sm">
                  Batch {progressData.currentBatch} of {progressData.totalBatches}
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Error Display */}
        {progressData.errorRecords > 0 && (
          <div className="bg-red-500/10 rounded-xl p-4 border border-red-500/20 mb-6">
            <div className="flex items-center space-x-3 mb-3">
              <AlertCircle className="w-5 h-5 text-red-400" />
              <p className="text-red-400 font-medium">
                {progressData.errorRecords} record{progressData.errorRecords !== 1 ? 's' : ''} failed to sync
              </p>
            </div>
            {progressData.errors && progressData.errors.length > 0 && (
              <div className="space-y-1">
                {progressData.errors.slice(0, 3).map((error, index) => (
                  <p key={index} className="text-red-300 text-sm font-mono bg-red-900/20 p-2 rounded">
                    {error}
                  </p>
                ))}
                {progressData.errors.length > 3 && (
                  <p className="text-red-400 text-sm">
                    +{progressData.errors.length - 3} more errors...
                  </p>
                )}
              </div>
            )}
          </div>
        )}

        {/* Sync Actions */}
        {(progressData.status === 'initializing' || progressData.status === 'syncing') && onCancel && (
          <div className="flex items-center justify-between pt-4 border-t border-gray-700/50">
            <div className="flex items-center space-x-2 text-yellow-400">
              <div className="w-2 h-2 bg-yellow-400 rounded-full animate-pulse"></div>
              <span className="font-medium">Sync in progress...</span>
            </div>
            <button
              onClick={onCancel}
              className="px-6 py-2 bg-gradient-to-r from-red-600 to-red-700 text-white rounded-lg hover:from-red-700 hover:to-red-800 transition-all duration-200 font-medium flex items-center space-x-2"
            >
              <X className="w-4 h-4" />
              <span>Stop Sync</span>
            </button>
          </div>
        )}

        {/* Completion Actions */}
        {progressData.status === 'completed' && (
          <div className="flex items-center justify-between pt-4 border-t border-gray-700/50">
            <div className="flex items-center space-x-2 text-green-400">
              <CheckCircle className="w-5 h-5" />
              <span className="font-medium">Sync completed successfully!</span>
            </div>
            <button
              onClick={onClose}
              className="px-6 py-2 bg-gradient-to-r from-blue-600 to-purple-600 text-white rounded-lg hover:from-blue-700 hover:to-purple-700 transition-all duration-200 font-medium"
            >
              Close
            </button>
          </div>
        )}

        {/* Error Actions */}
        {progressData.status === 'error' && (
          <div className="flex items-center justify-between pt-4 border-t border-gray-700/50">
            <div className="flex items-center space-x-2 text-red-400">
              <AlertCircle className="w-5 h-5" />
              <span className="font-medium">Sync failed</span>
            </div>
            <button
              onClick={onClose}
              className="px-6 py-2 bg-gradient-to-r from-gray-600 to-gray-700 text-white rounded-lg hover:from-gray-700 hover:to-gray-800 transition-all duration-200 font-medium"
            >
              Close
            </button>
          </div>
        )}
      </div>

      <style jsx>{`
        @keyframes shimmer {
          0% { transform: translateX(-100%); }
          100% { transform: translateX(100%); }
        }
        .animate-shimmer {
          animation: shimmer 2s infinite;
        }
      `}</style>
    </div>
  );
}
