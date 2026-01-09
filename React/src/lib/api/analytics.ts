import { post } from './client';

/**
 * Start a new session
 */
export async function startSession(): Promise<{ sessionId: string }> {
  return post('/api/analytics/session/start');
}

/**
 * Send session heartbeat
 */
export async function sessionHeartbeat(): Promise<void> {
  await post('/api/analytics/session/heartbeat');
}

/**
 * End the current session
 */
export async function endSession(): Promise<void> {
  await post('/api/analytics/session/end');
}

/**
 * Start tracking a listen event
 */
export async function startListen(trackId: number): Promise<{ listenId: string }> {
  return post('/api/analytics/listen/start', { trackId });
}

/**
 * End a listen event
 */
export async function endListen(
  listenId: string,
  duration: number,
  completed: boolean,
  skipped: boolean
): Promise<void> {
  await post('/api/analytics/listen/end', {
    listenId,
    duration,
    completed,
    skipped,
  });
}

/**
 * Track a search query
 */
export async function trackSearch(
  query: string,
  resultsCount: number
): Promise<void> {
  await post('/api/analytics/search', { query, resultsCount });
}

