import React, { useState, useEffect, useRef } from 'react';
import {
  verifyAdminCredentials,
  isAdminAuthenticated,
  clearAdminCredentials,
  getAdminStats,
  getUserStats,
  getDiskUsage,
  deleteUser,
  getAccessLogs,
  getAnalyticsOverview,
  getDAUTrend,
  getEngagementData,
  getTopSongs,
  getTopArtists,
  getTrafficSources,
  type AdminStats,
  type AdminUser,
  type UserStatus,
  type DiskUsage,
  type AccessLogsResponse,
  type AnalyticsOverview,
  type DAUTrend,
  type EngagementData,
  type TopSong,
  type TopArtist,
  type TrafficSourcesResponse,
} from '../lib/api/admin';
import { useUIStore } from '../lib/stores/ui';
import { Button } from '../lib/components/UI/Button';
import { Input } from '../lib/components/UI/Input';
import './Admin.css';

type Section = 'dashboard' | 'users' | 'analytics' | 'library';

export const Admin: React.FC = () => {
  const { showToast } = useUIStore();
  const [isAuthenticated, setIsAuthenticated] = useState(isAdminAuthenticated());
  const [isLoading, setIsLoading] = useState(false);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [authError, setAuthError] = useState('');
  
  const [activeSection, setActiveSection] = useState<Section>('dashboard');
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [userStatus, setUserStatus] = useState<UserStatus | null>(null);
  const [userStats, setUserStats] = useState<AdminUser[]>([]);
  const [diskUsage, setDiskUsage] = useState<DiskUsage | null>(null);
  const [accessLogs, setAccessLogs] = useState<AccessLogsResponse | null>(null);
  const [isScanning, setIsScanning] = useState(false);
  const [scanLogs, setScanLogs] = useState<string[]>([]);
  const [showScanLogs, setShowScanLogs] = useState(false);
  const scanLogsRef = useRef<HTMLDivElement>(null);
  
  // Analytics state
  const [analyticsOverview, setAnalyticsOverview] = useState<AnalyticsOverview | null>(null);
  const [dauTrend, setDauTrend] = useState<DAUTrend | null>(null);
  const [engagement, setEngagement] = useState<EngagementData | null>(null);
  const [topSongs, setTopSongs] = useState<TopSong[]>([]);
  const [topArtists, setTopArtists] = useState<TopArtist[]>([]);
  const [trafficSources, setTrafficSources] = useState<TrafficSourcesResponse | null>(null);

  useEffect(() => {
    if (isAuthenticated) {
      loadDashboardData();
    }
  }, [isAuthenticated]);

  // Refresh access logs periodically for real-time status
  useEffect(() => {
    if (!isAuthenticated) return;
    
    const interval = setInterval(() => {
      loadAccessLogs();
    }, 30000); // Every 30 seconds
    
    return () => clearInterval(interval);
  }, [isAuthenticated]);

  const loadDashboardData = async () => {
    try {
      const [statsData, usersData, diskData, logsData] = await Promise.all([
        getAdminStats(),
        getUserStats().catch(() => []),
        getDiskUsage().catch(() => null),
        getAccessLogs(24).catch(() => null), // Last 24 hours
      ]);
      
      // Map backend field names to our expected names
      const mappedStats: AdminStats = {
        ...statsData,
        total_tracks: statsData.total_songs || statsData.total_tracks || 0,
        total_albums: statsData.unique_albums || statsData.total_albums || 0,
        total_artists: statsData.unique_artists || statsData.total_artists || 0,
        total_users: usersData.length || 0,
      };
      
      setStats(mappedStats);
      
      // Build user status from access logs
      const today = new Date().toISOString().split('T')[0];
      const activeTodayCount = logsData?.recentUsers?.filter(u => {
        const accessDate = u.last_access?.split(' ')[0];
        return accessDate === today;
      }).length || 0;
      
      setUserStatus({
        users: [],
        summary: {
          total_users: usersData.length || 0,
          active_today: activeTodayCount,
          online_now: logsData?.recentUsers?.filter(u => isRecentlyActive(u.last_access)).length || 0,
        }
      });
      
      setDiskUsage(diskData);
      setAccessLogs(logsData);
    } catch (error) {
      console.error('Failed to load dashboard data:', error);
      if ((error as Error).message.includes('credentials')) {
        setIsAuthenticated(false);
      }
    }
  };

  const loadAccessLogs = async () => {
    try {
      const logsData = await getAccessLogs(1);
      setAccessLogs(logsData);
    } catch (error) {
      console.error('Failed to load access logs:', error);
    }
  };

  const loadUsersData = async () => {
    try {
      const [data, logsData] = await Promise.all([
        getUserStats(),
        getAccessLogs(24), // Last 24 hours
      ]);
      
      // Merge user stats with access logs to get device info
      const usersWithDevices = data.map(user => {
        const recentAccess = logsData?.recentUsers?.find(u => u.user_id === user.id);
        return {
          ...user,
          device: recentAccess?.device || null,
          country: recentAccess?.country || null,
          last_seen: recentAccess?.last_access || user.last_login,
          is_online: recentAccess ? isRecentlyActive(recentAccess.last_access) : false,
        };
      });
      
      // Sort: online first, then by last activity
      usersWithDevices.sort((a, b) => {
        if (a.is_online && !b.is_online) return -1;
        if (!a.is_online && b.is_online) return 1;
        return new Date(b.last_seen || 0).getTime() - new Date(a.last_seen || 0).getTime();
      });
      
      setUserStats(usersWithDevices);
      setAccessLogs(logsData);
    } catch (error) {
      console.error('Failed to load users:', error);
    }
  };

  const loadAnalyticsData = async () => {
    try {
      const [overview, dau, eng, songs, artists, traffic] = await Promise.all([
        getAnalyticsOverview('30d').catch(() => null),
        getDAUTrend(30).catch(() => null),
        getEngagementData('30d').catch(() => null),
        getTopSongs(10).catch(() => ({ songs: [] })),
        getTopArtists(10).catch(() => ({ artists: [] })),
        getTrafficSources(30).catch(() => null),
      ]);
      
      setAnalyticsOverview(overview);
      setDauTrend(dau);
      setEngagement(eng);
      setTopSongs(songs?.songs || []);
      setTopArtists(artists?.artists || []);
      setTrafficSources(traffic);
    } catch (error) {
      console.error('Failed to load analytics:', error);
    }
  };

  // Check if a timestamp is within the last 5 minutes (online)
  // SQLite returns timestamps without timezone, so we treat them as UTC
  const isRecentlyActive = (timestamp: string | null | undefined): boolean => {
    if (!timestamp) return false;
    // Add 'Z' to indicate UTC if not present, and replace space with 'T' for ISO format
    const isoTimestamp = timestamp.includes('T') ? timestamp : timestamp.replace(' ', 'T') + 'Z';
    const diff = Date.now() - new Date(isoTimestamp).getTime();
    return diff < 5 * 60 * 1000; // 5 minutes (matches backend)
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setAuthError('');
    
    const success = await verifyAdminCredentials(username, password);
    
    if (success) {
      setIsAuthenticated(true);
      setUsername('');
      setPassword('');
    } else {
      setAuthError('Invalid admin credentials');
    }
    
    setIsLoading(false);
  };

  const handleLogout = () => {
    clearAdminCredentials();
    setIsAuthenticated(false);
    setStats(null);
    setUserStatus(null);
    setUserStats([]);
  };

  const handleScan = async () => {
    setIsScanning(true);
    setScanLogs([]);
    setShowScanLogs(true);
    
    try {
      const token = sessionStorage.getItem('admin_credentials');
      const baseUrl = import.meta.env.VITE_API_URL || '';
      
      const eventSource = new EventSource(`${baseUrl}/api/admin/scan-stream?auth=${encodeURIComponent(token || '')}`);
      
      eventSource.onmessage = (event) => {
        try {
          const { type, data } = JSON.parse(event.data);
          
          if (type === 'log') {
            setScanLogs(prev => [...prev, data]);
            // Auto-scroll to bottom
            setTimeout(() => {
              if (scanLogsRef.current) {
                scanLogsRef.current.scrollTop = scanLogsRef.current.scrollHeight;
              }
            }, 10);
          } else if (type === 'error') {
            setScanLogs(prev => [...prev, `❌ ${data}`]);
          } else if (type === 'complete') {
            eventSource.close();
            setIsScanning(false);
            
            if (data.success) {
              const msg = `✅ Scan completed: ${data.scanned} files, ${data.added} new, ${data.pathsUpdated} paths updated`;
              setScanLogs(prev => [...prev, '', msg]);
              showToast(msg, 'success');
              loadDashboardData();
            } else {
              showToast('Scan failed: ' + (data.error || 'Unknown error'), 'error');
            }
          }
        } catch (e) {
          console.error('Error parsing SSE:', e);
        }
      };
      
      eventSource.onerror = () => {
        eventSource.close();
        setIsScanning(false);
        showToast('Scan connection lost', 'error');
      };
      
    } catch (error) {
      showToast('Failed to start scan', 'error');
      setIsScanning(false);
    }
  };

  const handleDeleteUser = async (userId: number, username: string) => {
    if (!confirm(`Are you sure you want to delete user "${username}"? This cannot be undone.`)) {
      return;
    }
    
    try {
      await deleteUser(userId);
      showToast(`User "${username}" deleted`, 'success');
      loadUsersData();
      loadDashboardData();
    } catch (error) {
      showToast('Failed to delete user', 'error');
    }
  };


  const formatBytes = (bytes: number): string => {
    if (!bytes) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
  };

  const formatDuration = (seconds: number): string => {
    if (!seconds) return '0s';
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    if (hours > 0) return `${hours}h ${minutes}m`;
    if (minutes > 0) return `${minutes}m ${secs}s`;
    return `${secs}s`;
  };

  // Use functions to avoid unused variable warnings
  void formatBytes;
  void formatDuration;

  const getDeviceIcon = (device: string | null) => {
    if (!device) return 'fa-question';
    const d = device.toLowerCase();
    if (d.includes('ios') || d.includes('iphone') || d.includes('ipad')) return 'fa-mobile-alt';
    if (d.includes('android')) return 'fa-mobile-alt';
    if (d.includes('windows')) return 'fa-windows';
    if (d.includes('mac')) return 'fa-apple';
    if (d.includes('linux')) return 'fa-linux';
    return 'fa-laptop';
  };

  const getTimeAgo = (timestamp: string | null) => {
    if (!timestamp) return 'Never';
    // SQLite returns timestamps without timezone - treat as UTC
    const isoTimestamp = timestamp.includes('T') ? timestamp : timestamp.replace(' ', 'T') + 'Z';
    const diff = Date.now() - new Date(isoTimestamp).getTime();
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);
    
    if (minutes < 1) return 'Just now';
    if (minutes < 60) return `${minutes}m ago`;
    if (hours < 24) return `${hours}h ago`;
    return `${days}d ago`;
  };

  // Login Gate
  if (!isAuthenticated) {
    return (
      <div className="admin-auth-gate">
        <div className="admin-auth-card glass-elevated">
          <div className="admin-auth-icon">
            <i className="fas fa-shield-alt"></i>
          </div>
          <h2>Admin Console</h2>
          <p>Enter your admin credentials to continue</p>
          
          <form onSubmit={handleLogin}>
            <Input
              placeholder="Username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              fullWidth
              disabled={isLoading}
            />
            <Input
              type="password"
              placeholder="Password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              fullWidth
              disabled={isLoading}
            />
            
            {authError && (
              <div className="admin-auth-error">
                <i className="fas fa-exclamation-circle"></i>
                {authError}
              </div>
            )}
            
            <Button type="submit" fullWidth isLoading={isLoading}>
              Sign In
            </Button>
          </form>
        </div>
      </div>
    );
  }

  // Count online users from access logs
  const onlineCount = accessLogs?.recentUsers?.filter(u => isRecentlyActive(u.last_access)).length || 0;

  return (
    <div className="admin-page">
      <div className="admin-header">
        <div className="admin-title">
          <i className="fas fa-cog"></i>
          <h1>Admin Console</h1>
        </div>
        <button className="admin-logout" onClick={handleLogout}>
          <i className="fas fa-sign-out-alt"></i>
          Logout
        </button>
      </div>

      <nav className="admin-nav">
        <button
          className={`admin-nav-btn ${activeSection === 'dashboard' ? 'active' : ''}`}
          onClick={() => setActiveSection('dashboard')}
        >
          <i className="fas fa-chart-line"></i>
          Dashboard
        </button>
        <button
          className={`admin-nav-btn ${activeSection === 'users' ? 'active' : ''}`}
          onClick={() => {
            setActiveSection('users');
            loadUsersData();
          }}
        >
          <i className="fas fa-users"></i>
          Users
        </button>
        <button
          className={`admin-nav-btn ${activeSection === 'analytics' ? 'active' : ''}`}
          onClick={() => {
            setActiveSection('analytics');
            loadAnalyticsData();
          }}
        >
          <i className="fas fa-chart-bar"></i>
          Analytics
        </button>
        <button
          className={`admin-nav-btn ${activeSection === 'library' ? 'active' : ''}`}
          onClick={() => setActiveSection('library')}
        >
          <i className="fas fa-music"></i>
          Library
        </button>
      </nav>

      {/* Dashboard Section */}
      {activeSection === 'dashboard' && (
        <div className="admin-section">
          <h2>Dashboard</h2>
          
          <div className="stats-grid">
            <div className="stat-card">
              <div className="stat-icon users">
                <i className="fas fa-users"></i>
              </div>
              <div className="stat-info">
                <span className="stat-value">{userStatus?.summary.total_users || 0}</span>
                <span className="stat-label">Total Users</span>
              </div>
            </div>
            
            <div className="stat-card highlight">
              <div className="stat-icon online">
                <i className="fas fa-circle"></i>
              </div>
              <div className="stat-info">
                <span className="stat-value">{onlineCount}</span>
                <span className="stat-label">Online Now</span>
              </div>
            </div>
            
            <div className="stat-card">
              <div className="stat-icon active">
                <i className="fas fa-clock"></i>
              </div>
              <div className="stat-info">
                <span className="stat-value">{userStatus?.summary.active_today || 0}</span>
                <span className="stat-label">Active Today</span>
              </div>
            </div>
            
            <div className="stat-card">
              <div className="stat-icon tracks">
                <i className="fas fa-music"></i>
              </div>
              <div className="stat-info">
                <span className="stat-value">{stats?.total_tracks?.toLocaleString() || 0}</span>
                <span className="stat-label">Total Tracks</span>
              </div>
            </div>
            
            <div className="stat-card">
              <div className="stat-icon albums">
                <i className="fas fa-compact-disc"></i>
              </div>
              <div className="stat-info">
                <span className="stat-value">{stats?.total_albums?.toLocaleString() || 0}</span>
                <span className="stat-label">Albums</span>
              </div>
            </div>
            
            <div className="stat-card">
              <div className="stat-icon artists">
                <i className="fas fa-microphone"></i>
              </div>
              <div className="stat-info">
                <span className="stat-value">{stats?.total_artists?.toLocaleString() || 0}</span>
                <span className="stat-label">Artists</span>
              </div>
            </div>
          </div>

          {/* Online Users Preview */}
          {accessLogs && accessLogs.recentUsers.length > 0 && (
            <div className="online-users-card glass-card">
              <h3><i className="fas fa-circle online-dot"></i> Currently Online</h3>
              <div className="online-users-list">
                {accessLogs.recentUsers
                  .filter(u => isRecentlyActive(u.last_access))
                  .slice(0, 5)
                  .map((user) => (
                    <div key={user.user_id} className="online-user-item">
                      <div className="user-avatar-sm">
                        {user.username.charAt(0).toUpperCase()}
                      </div>
                      <div className="online-user-info">
                        <span className="name">{user.username}</span>
                        <span className="device">
                          <i className={`fab ${getDeviceIcon(user.device)}`}></i>
                          {user.device || 'Unknown'} • {user.country || 'Unknown'}
                        </span>
                      </div>
                      <span className="online-badge">Online</span>
                    </div>
                  ))}
                {onlineCount === 0 && (
                  <div className="empty-state-sm">No users currently online</div>
                )}
              </div>
            </div>
          )}

          {diskUsage && (
            <div className="disk-usage-card glass-card">
              <h3><i className="fas fa-hdd"></i> Disk Usage</h3>
              <div className="disk-bar">
                <div 
                  className="disk-bar-fill" 
                  style={{ width: `${diskUsage.percent_used || diskUsage.usagePercent || 0}%` }}
                />
              </div>
              <div className="disk-stats">
                <span>Used: {diskUsage.used}</span>
                <span>Free: {diskUsage.free || diskUsage.available}</span>
                <span>Total: {diskUsage.total}</span>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Users Section */}
      {activeSection === 'users' && (
        <div className="admin-section">
          <h2>Users</h2>
          
          <div className="users-table-container glass-card">
            <table className="users-table">
              <thead>
                <tr>
                  <th>User</th>
                  <th>Device</th>
                  <th>Tracks</th>
                  <th>Status</th>
                  <th>Last Seen</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {userStats.map((user) => (
                  <tr key={user.id} className={user.is_online ? 'user-online' : ''}>
                    <td>
                      <div className="user-cell">
                        <div className={`user-avatar ${user.is_online ? 'online' : ''}`}>
                          {user.username.charAt(0).toUpperCase()}
                          {user.is_online && <span className="online-indicator"></span>}
                        </div>
                        <div className="user-info">
                          <span className="user-name">{user.username}</span>
                          {user.is_admin && <span className="admin-badge">Admin</span>}
                          {user.country && <span className="country-badge">{user.country}</span>}
                        </div>
                      </div>
                    </td>
                    <td>
                      <span className="device-info">
                        <i className={`fab ${getDeviceIcon(user.device || null)}`}></i>
                        {user.device || 'Unknown'}
                      </span>
                    </td>
                    <td>{user.music_count || 0}</td>
                    <td>
                      <span className={`status-badge ${user.is_online ? 'online' : user.was_active_today ? 'active' : 'offline'}`}>
                        {user.is_online ? 'Online' : user.was_active_today ? 'Active Today' : 'Offline'}
                      </span>
                    </td>
                    <td className="time-cell">{getTimeAgo(user.last_seen || user.last_login)}</td>
                    <td>
                      <div className="action-buttons">
                        <button
                          className="action-btn delete"
                          onClick={() => handleDeleteUser(user.id, user.username)}
                          title="Delete user"
                        >
                          <i className="fas fa-trash"></i>
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            
            {userStats.length === 0 && (
              <div className="empty-state">
                <i className="fas fa-users"></i>
                <p>No users found</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Analytics Section */}
      {activeSection === 'analytics' && (
        <div className="admin-section">
          <h2>Analytics</h2>
          
          {/* Overview Stats */}
          <div className="stats-grid">
            <div className="stat-card">
              <div className="stat-icon users">
                <i className="fas fa-user-plus"></i>
              </div>
              <div className="stat-info">
                <span className="stat-value">{analyticsOverview?.newUsersToday || 0}</span>
                <span className="stat-label">New Users Today</span>
              </div>
            </div>
            
            <div className="stat-card">
              <div className="stat-icon active">
                <i className="fas fa-user-clock"></i>
              </div>
              <div className="stat-info">
                <span className="stat-value">{analyticsOverview?.activeToday || 0}</span>
                <span className="stat-label">Active Today</span>
              </div>
            </div>
            
            <div className="stat-card">
              <div className="stat-icon tracks">
                <i className="fas fa-headphones"></i>
              </div>
              <div className="stat-info">
                <span className="stat-value">{engagement?.avgSessionLengthFormatted || '0s'}</span>
                <span className="stat-label">Avg Session</span>
              </div>
            </div>
            
            <div className="stat-card">
              <div className="stat-icon albums">
                <i className="fas fa-forward"></i>
              </div>
              <div className="stat-info">
                <span className="stat-value">{engagement?.skipsPerSession?.toFixed(1) || 0}</span>
                <span className="stat-label">Skips / Session</span>
              </div>
            </div>
          </div>

          {/* DAU Trend */}
          {dauTrend && dauTrend.trend && dauTrend.trend.length > 0 && (
            <div className="chart-card glass-card">
              <h3><i className="fas fa-chart-line"></i> Daily Active Users</h3>
              <p className="chart-subtitle">Last 14 days</p>
              <div className="dau-chart">
                {dauTrend.trend.slice(-14).map((day, idx) => {
                  const maxDau = Math.max(...dauTrend.trend.map(d => d.dau), 1);
                  const heightPercent = Math.max(5, (day.dau / maxDau) * 100);
                  const date = new Date(day.date + 'T00:00:00');
                  const dayNum = date.getDate();
                  const monthShort = date.toLocaleDateString('en', { month: 'short' });
                  const isToday = new Date().toDateString() === date.toDateString();
                  
                  return (
                    <div key={idx} className={`dau-bar-wrapper ${isToday ? 'today' : ''}`}>
                      <div className="dau-bar-area">
                        <span className="dau-count">{day.dau}</span>
                        <div 
                          className="dau-bar" 
                          style={{ height: `${heightPercent}%` }}
                        />
                      </div>
                      <div className="dau-date">
                        <span className="day">{dayNum}</span>
                        <span className="month">{monthShort}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Top Content */}
          <div className="analytics-grid">
            {/* Top Songs */}
            <div className="top-list-card glass-card">
              <h3><i className="fas fa-music"></i> Top Songs</h3>
              <div className="top-list">
                {topSongs.slice(0, 5).map((song, idx) => (
                  <div key={song.id} className="top-item">
                    <span className="rank">#{idx + 1}</span>
                    <div className="top-item-info">
                      <span className="title">{song.title}</span>
                      <span className="subtitle">{song.artist}</span>
                    </div>
                    <span className="count">{song.play_count} plays</span>
                  </div>
                ))}
                {topSongs.length === 0 && (
                  <div className="empty-state-sm">No play data yet</div>
                )}
              </div>
            </div>

            {/* Top Artists */}
            <div className="top-list-card glass-card">
              <h3><i className="fas fa-microphone"></i> Top Artists</h3>
              <div className="top-list">
                {topArtists.slice(0, 5).map((artist, idx) => (
                  <div key={artist.artist} className="top-item">
                    <span className="rank">#{idx + 1}</span>
                    <div className="top-item-info">
                      <span className="title">{artist.artist}</span>
                      <span className="subtitle">{artist.track_count} tracks</span>
                    </div>
                    <span className="count">{artist.play_count} plays</span>
                  </div>
                ))}
                {topArtists.length === 0 && (
                  <div className="empty-state-sm">No play data yet</div>
                )}
              </div>
            </div>
          </div>

          {/* Device & Country Breakdown */}
          {accessLogs && (
            <div className="analytics-grid">
              <div className="breakdown-card glass-card">
                <h3><i className="fas fa-mobile-alt"></i> Devices</h3>
                <div className="breakdown-list">
                  {accessLogs.summary.devices.map((device) => (
                    <div key={device.label} className="breakdown-item">
                      <i className={`fab ${getDeviceIcon(device.label)}`}></i>
                      <span className="label">{device.label}</span>
                      <span className="count">{device.count}</span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="breakdown-card glass-card">
                <h3><i className="fas fa-globe"></i> Countries</h3>
                <div className="breakdown-list">
                  {accessLogs.summary.countries.map((country) => (
                    <div key={country.label} className="breakdown-item">
                      <i className="fas fa-map-marker-alt"></i>
                      <span className="label">{country.label}</span>
                      <span className="count">{country.count}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Traffic Sources */}
          {trafficSources && trafficSources.sources.length > 0 && (
            <div className="chart-card glass-card traffic-sources-card">
              <h3><i className="fas fa-share-alt"></i> Traffic Sources</h3>
              <p className="chart-subtitle">Where your users come from (last {trafficSources.days} days)</p>
              <div className="traffic-sources-list">
                {trafficSources.sources.map((source, idx) => {
                  const getSourceIcon = (name: string) => {
                    const n = name.toLowerCase();
                    if (n === 'direct') return 'fas fa-home';
                    if (n.includes('google')) return 'fab fa-google';
                    if (n.includes('reddit')) return 'fab fa-reddit';
                    if (n.includes('twitter') || n.includes('x.com')) return 'fab fa-twitter';
                    if (n.includes('facebook')) return 'fab fa-facebook';
                    if (n.includes('instagram')) return 'fab fa-instagram';
                    if (n.includes('youtube')) return 'fab fa-youtube';
                    if (n.includes('discord')) return 'fab fa-discord';
                    if (n.includes('telegram')) return 'fab fa-telegram';
                    if (n.includes('tiktok')) return 'fab fa-tiktok';
                    if (n.includes('linkedin')) return 'fab fa-linkedin';
                    return 'fas fa-link';
                  };
                  
                  const getSourceColor = (name: string) => {
                    const n = name.toLowerCase();
                    if (n === 'direct') return '#1db954';
                    if (n.includes('google')) return '#4285f4';
                    if (n.includes('reddit')) return '#ff4500';
                    if (n.includes('twitter') || n.includes('x.com')) return '#1da1f2';
                    if (n.includes('facebook')) return '#1877f2';
                    if (n.includes('instagram')) return '#e4405f';
                    if (n.includes('youtube')) return '#ff0000';
                    if (n.includes('discord')) return '#5865f2';
                    return '#888';
                  };
                  
                  return (
                    <div key={source.source} className="traffic-source-item">
                      <div className="source-rank">#{idx + 1}</div>
                      <i className={getSourceIcon(source.source)} style={{ color: getSourceColor(source.source) }}></i>
                      <div className="source-info">
                        <span className="source-name">{source.source}</span>
                        <span className="source-stats">{source.unique_users} users • {source.visits} visits</span>
                      </div>
                      <div className="source-bar-container">
                        <div 
                          className="source-bar" 
                          style={{ 
                            width: `${source.percentage}%`,
                            backgroundColor: getSourceColor(source.source)
                          }}
                        />
                      </div>
                      <span className="source-percent">{source.percentage}%</span>
                    </div>
                  );
                })}
              </div>
              <div className="traffic-totals">
                <span><i className="fas fa-users"></i> {trafficSources.totalUniqueUsers} unique users</span>
                <span><i className="fas fa-eye"></i> {trafficSources.totalVisits} total visits</span>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Library Section */}
      {activeSection === 'library' && (
        <div className="admin-section">
          <h2>Library Management</h2>
          
          <div className="library-actions glass-card">
            <div className="library-action">
              <div className="action-info">
                <h3><i className="fas fa-sync"></i> Safe Scan Library</h3>
                <p>Scan for new files, update moved file paths, fetch missing artwork. Preserves all manual metadata corrections.</p>
              </div>
              <Button onClick={handleScan} isLoading={isScanning}>
                {isScanning ? 'Scanning...' : 'Start Scan'}
              </Button>
            </div>
            
            {/* Scan Log Viewer */}
            {showScanLogs && (
              <div className="scan-log-container">
                <div className="scan-log-header">
                  <h4><i className="fas fa-terminal"></i> Scan Log</h4>
                  <button 
                    className="close-log-btn" 
                    onClick={() => setShowScanLogs(false)}
                    disabled={isScanning}
                  >
                    <i className="fas fa-times"></i>
                  </button>
                </div>
                <div className="scan-log" ref={scanLogsRef}>
                  {scanLogs.length === 0 ? (
                    <div className="log-line log-waiting">Waiting for scan output...</div>
                  ) : (
                    scanLogs.map((log, i) => (
                      <div 
                        key={i} 
                        className={`log-line ${
                          log.startsWith('✅') ? 'log-success' : 
                          log.startsWith('❌') ? 'log-error' : 
                          log.startsWith('⬇️') ? 'log-download' :
                          log.startsWith('🎨') || log.startsWith('👤') ? 'log-artwork' :
                          log.startsWith('📂') || log.startsWith('🔍') ? 'log-info' :
                          ''
                        }`}
                      >
                        {log || '\u00A0'}
                      </div>
                    ))
                  )}
                  {isScanning && (
                    <div className="log-line log-scanning">
                      <i className="fas fa-spinner fa-spin"></i> Scanning...
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>

          <div className="library-info glass-card">
            <h3><i className="fas fa-info-circle"></i> Library Information</h3>
            <div className="info-grid">
              <div className="info-item">
                <span className="info-label">Total Tracks</span>
                <span className="info-value">{stats?.total_tracks?.toLocaleString() || 0}</span>
              </div>
              <div className="info-item">
                <span className="info-label">Albums</span>
                <span className="info-value">{stats?.total_albums?.toLocaleString() || 0}</span>
              </div>
              <div className="info-item">
                <span className="info-label">Artists</span>
                <span className="info-value">{stats?.total_artists?.toLocaleString() || 0}</span>
              </div>
              <div className="info-item">
                <span className="info-label">Playlists</span>
                <span className="info-value">{stats?.total_playlists?.toLocaleString() || 0}</span>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Admin;
