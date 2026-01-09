import geoip from 'geoip-lite';
import UAParser from 'ua-parser-js';

let database = null;
const lastLogTimes = new Map();
const DEFAULT_THROTTLE_MS = 1 * 60 * 1000; // 1 minute - for accurate online status tracking

export const setAccessLoggerDatabase = (db) => {
  database = db;
};

const getClientIp = (req) => {
  const forwarded = req.headers['x-forwarded-for'];
  if (forwarded) {
    return forwarded.split(',')[0].trim();
  }
  const remote =
    req.ip ||
    req.connection?.remoteAddress ||
    req.socket?.remoteAddress ||
    req.connection?.socket?.remoteAddress;
  return remote ? remote.replace('::ffff:', '') : null;
};

const formatDeviceLabel = (userAgent = '') => {
  const parser = new UAParser(userAgent);
  const device = parser.getDevice();
  const os = parser.getOS();
  const browser = parser.getBrowser();
  
  const deviceType = device?.type
    ? device.type.charAt(0).toUpperCase() + device.type.slice(1)
    : 'Desktop';
  const osName = os?.name || 'Unknown OS';
  const browserName = browser?.name || 'Unknown Browser';
  
  return `${deviceType} • ${osName} • ${browserName}`;
};

const extractReferrerDomain = (referrer) => {
  if (!referrer) return null;
  try {
    const url = new URL(referrer);
    // Remove www. prefix for cleaner display
    return url.hostname.replace(/^www\./, '');
  } catch {
    return null;
  }
};

const categorizeReferrer = (domain) => {
  if (!domain) return 'Direct';
  const d = domain.toLowerCase();
  
  if (d.includes('google')) return 'Google';
  if (d.includes('bing')) return 'Bing';
  if (d.includes('yahoo')) return 'Yahoo';
  if (d.includes('duckduckgo')) return 'DuckDuckGo';
  if (d.includes('facebook') || d.includes('fb.com')) return 'Facebook';
  if (d.includes('twitter') || d.includes('t.co') || d.includes('x.com')) return 'Twitter/X';
  if (d.includes('instagram')) return 'Instagram';
  if (d.includes('tiktok')) return 'TikTok';
  if (d.includes('linkedin')) return 'LinkedIn';
  if (d.includes('reddit')) return 'Reddit';
  if (d.includes('youtube')) return 'YouTube';
  if (d.includes('discord')) return 'Discord';
  if (d.includes('telegram')) return 'Telegram';
  if (d.includes('whatsapp')) return 'WhatsApp';
  
  return domain; // Return original domain for unknown sources
};

export const logUserAccess = async (req, user, options = {}) => {
  try {
    if (!database || !user) {
      return;
    }

    const { force = false, throttleMs = DEFAULT_THROTTLE_MS } = options;
    const userId = user.id || user.user_id;
    const now = Date.now();

    if (!force && userId) {
      const last = lastLogTimes.get(userId) || 0;
      if (now - last < throttleMs) {
        return;
      }
      lastLogTimes.set(userId, now);
    } else if (force && userId) {
      lastLogTimes.set(userId, now);
    }
    
    const ipAddress = getClientIp(req) || 'Unknown';
    const lookup = ipAddress && !ipAddress.startsWith('::1') ? geoip.lookup(ipAddress) : null;
    const country = lookup?.country || 'Unknown';
    const userAgent = req.headers['user-agent'] || 'Unknown';
    const device = formatDeviceLabel(userAgent);
    
    // Capture referrer
    const referrer = req.headers['referer'] || req.headers['referrer'] || null;
    const referrerDomain = extractReferrerDomain(referrer);
    
    await database.addAccessLog({
      userId,
      username: user.username || user.name || null,
      ipAddress,
      country,
      device,
      userAgent,
      referrer,
      referrerDomain
    });
  } catch (error) {
    console.warn('Access log failed:', error.message);
  }
};

export default {
  setAccessLoggerDatabase,
  logUserAccess
};
