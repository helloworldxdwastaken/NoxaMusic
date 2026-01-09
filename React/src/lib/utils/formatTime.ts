/**
 * Format seconds to mm:ss or hh:mm:ss format
 */
export function formatTime(seconds: number): string {
  if (!seconds || isNaN(seconds)) return '0:00';
  
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);
  
  if (hours > 0) {
    return `${hours}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  }
  
  return `${minutes}:${secs.toString().padStart(2, '0')}`;
}

/**
 * Format duration for display (e.g., "3 hr 45 min" or "45 min")
 */
export function formatDuration(seconds: number): string {
  if (!seconds || isNaN(seconds)) return '0 min';
  
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  
  if (hours > 0) {
    return `${hours} hr ${minutes} min`;
  }
  
  return `${minutes} min`;
}

/**
 * Parse time string (mm:ss or hh:mm:ss) to seconds
 */
export function parseTime(timeStr: string): number {
  const parts = timeStr.split(':').map(Number);
  
  if (parts.length === 3) {
    return parts[0] * 3600 + parts[1] * 60 + parts[2];
  }
  
  if (parts.length === 2) {
    return parts[0] * 60 + parts[1];
  }
  
  return 0;
}

