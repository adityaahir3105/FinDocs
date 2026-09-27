import React, { useState } from 'react';
import { FileText, History, LogOut, ScanText, User } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { SubmissionForm } from './SubmissionForm';
import { SubmissionHistory } from './SubmissionHistory';
import { ConsignmentReader } from './ConsignmentReader';
import { Footer } from './Footer';

type View = 'submit' | 'history' | 'consignments';

export function Dashboard() {
  const { user, logout } = useAuth();
  const [currentView, setCurrentView] = useState<View>('submit');
  const [loggingOut, setLoggingOut] = useState(false);

  const handleLogout = async () => {
    setLoggingOut(true);
    try {
      await logout();
    } catch (error) {
      console.error('Logout failed:', error);
    } finally {
      setLoggingOut(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col bg-gray-50">
      {/* Header */}
      <header className="bg-white shadow-xs border-b">
        <div className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-14 sm:h-16">
            <div className="flex items-center gap-2.5 sm:gap-3">
              <div className="w-8 h-8 sm:w-10 sm:h-10 bg-blue-600 rounded-lg sm:rounded-xl flex items-center justify-center shrink-0">
                <FileText className="w-4 h-4 sm:w-5 sm:h-5 text-white" />
              </div>
              <span className="text-lg sm:text-xl font-bold text-gray-900">FinDocs</span>
            </div>

            <div className="flex items-center gap-2 sm:gap-4">
              {user && (
                <div className="flex items-center gap-2">
                  {user.picture ? (
                    <img
                      src={user.picture}
                      alt={user.name || user.email}
                      className="w-7 h-7 sm:w-8 sm:h-8 rounded-full ring-1 ring-gray-200"
                    />
                  ) : (
                    <div className="w-7 h-7 sm:w-8 sm:h-8 bg-gray-100 rounded-full flex items-center justify-center">
                      <User className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-gray-500" />
                    </div>
                  )}
                  <span className="text-sm font-medium text-gray-700 hidden md:block max-w-[150px] truncate">
                    {user.name || user.email}
                  </span>
                </div>
              )}
              <button
                onClick={handleLogout}
                disabled={loggingOut}
                className="flex items-center gap-1.5 px-2.5 py-1.5 sm:px-3 sm:py-2 text-xs sm:text-sm text-gray-600 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors disabled:opacity-50"
                title="Logout"
              >
                <LogOut className="w-4 h-4 shrink-0" />
                <span className="hidden sm:inline">Logout</span>
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Navigation Tabs (Top) */}
      <div className="bg-white border-b sticky top-0 z-30 shadow-xs">
        <div className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8 py-2 sm:py-0">
          <nav className="grid grid-cols-3 gap-1 p-1 bg-gray-100/90 rounded-xl sm:bg-transparent sm:p-0 sm:flex sm:gap-1 sm:rounded-none">
            <button
              onClick={() => setCurrentView('submit')}
              className={`flex items-center justify-center gap-1.5 sm:gap-2 py-2 sm:py-3 px-2 sm:px-4 text-xs sm:text-sm font-medium rounded-lg sm:rounded-none sm:border-b-2 whitespace-nowrap transition-all ${
                currentView === 'submit'
                  ? 'bg-white text-blue-600 shadow-xs sm:shadow-none sm:bg-transparent sm:border-blue-600 font-semibold'
                  : 'text-gray-600 hover:text-gray-900 sm:text-gray-500 sm:hover:text-gray-700 sm:border-transparent sm:hover:border-gray-300'
              }`}
            >
              <FileText className="w-4 h-4 shrink-0" />
              <span className="sm:hidden">Submit</span>
              <span className="hidden sm:inline">Submit Documents</span>
            </button>
            <button
              onClick={() => setCurrentView('history')}
              className={`flex items-center justify-center gap-1.5 sm:gap-2 py-2 sm:py-3 px-2 sm:px-4 text-xs sm:text-sm font-medium rounded-lg sm:rounded-none sm:border-b-2 whitespace-nowrap transition-all ${
                currentView === 'history'
                  ? 'bg-white text-blue-600 shadow-xs sm:shadow-none sm:bg-transparent sm:border-blue-600 font-semibold'
                  : 'text-gray-600 hover:text-gray-900 sm:text-gray-500 sm:hover:text-gray-700 sm:border-transparent sm:hover:border-gray-300'
              }`}
            >
              <History className="w-4 h-4 shrink-0" />
              <span className="sm:hidden">History</span>
              <span className="hidden sm:inline">My Submissions</span>
            </button>
            <button
              onClick={() => setCurrentView('consignments')}
              className={`flex items-center justify-center gap-1.5 sm:gap-2 py-2 sm:py-3 px-2 sm:px-4 text-xs sm:text-sm font-medium rounded-lg sm:rounded-none sm:border-b-2 whitespace-nowrap transition-all ${
                currentView === 'consignments'
                  ? 'bg-white text-blue-600 shadow-xs sm:shadow-none sm:bg-transparent sm:border-blue-600 font-semibold'
                  : 'text-gray-600 hover:text-gray-900 sm:text-gray-500 sm:hover:text-gray-700 sm:border-transparent sm:hover:border-gray-300'
              }`}
            >
              <ScanText className="w-4 h-4 shrink-0" />
              <span>Consignments</span>
            </button>
          </nav>
        </div>
      </div>

      {/* Content */}
      <main className="flex-1 max-w-7xl mx-auto px-3 sm:px-6 lg:px-8 py-6 sm:py-8 w-full pb-20 sm:pb-8">
        {currentView === 'submit' && <SubmissionForm />}
        {currentView === 'history' && <SubmissionHistory />}
        {currentView === 'consignments' && <ConsignmentReader />}
      </main>

      {/* Mobile Bottom Navigation Bar (Fixed for quick thumb access on phones) */}
      <nav className="sm:hidden fixed bottom-0 left-0 right-0 z-40 bg-white/95 backdrop-blur-md border-t border-gray-200 py-1.5 px-4 flex justify-around items-center shadow-lg">
        <button
          onClick={() => setCurrentView('submit')}
          className={`flex flex-col items-center gap-0.5 py-1 px-3 rounded-lg transition-colors ${
            currentView === 'submit' ? 'text-blue-600 font-semibold' : 'text-gray-500 hover:text-gray-900'
          }`}
        >
          <FileText className="w-5 h-5" />
          <span className="text-[11px]">Submit</span>
        </button>
        <button
          onClick={() => setCurrentView('history')}
          className={`flex flex-col items-center gap-0.5 py-1 px-3 rounded-lg transition-colors ${
            currentView === 'history' ? 'text-blue-600 font-semibold' : 'text-gray-500 hover:text-gray-900'
          }`}
        >
          <History className="w-5 h-5" />
          <span className="text-[11px]">History</span>
        </button>
        <button
          onClick={() => setCurrentView('consignments')}
          className={`flex flex-col items-center gap-0.5 py-1 px-3 rounded-lg transition-colors ${
            currentView === 'consignments' ? 'text-blue-600 font-semibold' : 'text-gray-500 hover:text-gray-900'
          }`}
        >
          <ScanText className="w-5 h-5" />
          <span className="text-[11px]">Consignments</span>
        </button>
      </nav>

      <Footer />
    </div>
  );
}
