import React, { useEffect } from 'react';
import { Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { useAuthStore } from './lib/stores/auth';
import { useUIStore } from './lib/stores/ui';
import { useMediaSession } from './lib/hooks/useMediaSession';
// import { useAnalytics } from './lib/hooks/useAnalytics'; // Disabled - backend doesn't have analytics endpoints

// Layout components
import { Sidebar } from './lib/components/Layout/Sidebar';
import { TopBar } from './lib/components/Layout/TopBar';
import { BottomNav } from './lib/components/Layout/BottomNav';

// Player components
import { FullPlayer } from './lib/components/Player/FullPlayer';
import { MiniPlayer } from './lib/components/Player/MiniPlayer';
import { NowPlaying } from './lib/components/Player/NowPlaying';
import { Queue } from './lib/components/Player/Queue';

// Modal components
import { Lyrics } from './lib/components/Modals/Lyrics';
import { ArtistDetail } from './lib/components/Modals/ArtistDetail';
import { AlbumDetail } from './lib/components/Modals/AlbumDetail';
import { ImportModal } from './lib/components/Modals/ImportModal';
import { CreatePlaylist } from './lib/components/Modals/CreatePlaylist';
import { AddToPlaylist } from './lib/components/Modals/AddToPlaylist';
import { WelcomePopup } from './lib/components/Modals/WelcomePopup';

// UI components
import { ToastContainer } from './lib/components/UI/Toast';

// Pages
import { Home } from './pages/Home';
import { Search } from './pages/Search';
import { Library } from './pages/Library';
import { Playlist } from './pages/Playlist';
import { Login } from './pages/Login';
import { Signup } from './pages/Signup';
import { Downloads } from './pages/Downloads';
import { Admin } from './pages/Admin';

// Hooks for keyboard shortcuts
function useKeyboardShortcuts() {
  const { toggleLyrics, toggleQueue, closeAllModals } = useUIStore();

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ignore if typing in input
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement
      ) {
        return;
      }

      switch (e.key) {
        case 'Escape':
          closeAllModals();
          break;
        case 'l':
        case 'L':
          toggleLyrics();
          break;
        case 'q':
        case 'Q':
          toggleQueue();
          break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [toggleLyrics, toggleQueue, closeAllModals]);
}

// Protected Route wrapper
const ProtectedRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { isAuthenticated } = useAuthStore();
  const location = useLocation();

  if (!isAuthenticated) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  return <>{children}</>;
};

// Main App Layout
const AppLayout: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { checkAuth } = useAuthStore();

  useEffect(() => {
    checkAuth();
  }, [checkAuth]);

  useKeyboardShortcuts();
  useMediaSession(); // Enable background playback controls
  // useAnalytics(); // Disabled - backend doesn't have analytics endpoints yet

  return (
    <div className="app-container">
      <Sidebar />
      <TopBar />
      
      <main className="app-content">{children}</main>
      
      <FullPlayer />
      <MiniPlayer />
      <NowPlaying />
      <Queue />
      
      <BottomNav />
      
      {/* Modals */}
      <Lyrics />
      <ArtistDetail />
      <AlbumDetail />
      <ImportModal />
      <CreatePlaylist />
      <AddToPlaylist />
      <WelcomePopup />
      
      {/* Toast Notifications */}
      <ToastContainer />
    </div>
  );
};

// Main App component
function App() {
  return (
    <Routes>
      {/* Auth routes (no layout) */}
      <Route path="/login" element={<Login />} />
      <Route path="/signup" element={<Signup />} />

      {/* Protected routes (with layout) */}
      <Route
        path="/*"
        element={
          <ProtectedRoute>
            <AppLayout>
              <Routes>
                <Route path="/" element={<Home />} />
                <Route path="/search" element={<Search />} />
                <Route path="/library" element={<Library />} />
                <Route path="/playlist/:id" element={<Playlist />} />
                <Route path="/downloads" element={<Downloads />} />
                <Route path="/admin" element={<Admin />} />
                <Route path="*" element={<Navigate to="/" replace />} />
              </Routes>
            </AppLayout>
          </ProtectedRoute>
        }
      />
    </Routes>
  );
}

export default App;

