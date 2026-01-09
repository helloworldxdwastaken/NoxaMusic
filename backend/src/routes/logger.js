import express from 'express';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const router = express.Router();
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Log file path
const LOG_FILE = path.join(__dirname, '..', '..', '..', 'frontend.log');

// Endpoint to receive frontend logs (batch)
router.post('/log', (req, res) => {
  try {
    const { logs } = req.body;
    
    if (!logs || !Array.isArray(logs)) {
      return res.status(400).json({ success: false, error: 'Invalid logs format' });
    }
    
    // Format and append all logs
    const logEntries = logs.map(log => {
      const { level, message, timestamp, url, userAgent } = log;
      return `[${timestamp}] [${level.toUpperCase()}] ${message}`;
    }).join('\n') + '\n';
    
    // Append to log file
    fs.appendFileSync(LOG_FILE, logEntries, 'utf8');
    
    res.json({ success: true, count: logs.length });
  } catch (error) {
    console.error('Failed to write logs:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Endpoint to get logs
router.get('/logs', (req, res) => {
  try {
    const lines = parseInt(req.query.lines) || 100;
    
    if (!fs.existsSync(LOG_FILE)) {
      return res.json({ logs: [] });
    }
    
    const content = fs.readFileSync(LOG_FILE, 'utf8');
    const logLines = content.split('\n').filter(line => line.trim());
    const recentLogs = logLines.slice(-lines);
    
    res.json({ logs: recentLogs });
  } catch (error) {
    console.error('Failed to read logs:', error);
    res.status(500).json({ error: error.message });
  }
});

// Endpoint to clear logs
router.delete('/logs', (req, res) => {
  try {
    if (fs.existsSync(LOG_FILE)) {
      fs.unlinkSync(LOG_FILE);
    }
    res.json({ success: true, message: 'Logs cleared' });
  } catch (error) {
    console.error('Failed to clear logs:', error);
    res.status(500).json({ error: error.message });
  }
});

export default router;

