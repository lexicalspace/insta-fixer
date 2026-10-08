import fs from 'fs';
import path from 'path';

let dataDir = null;

export function initLogger(dir) {
  dataDir = dir;
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }
}

function getLogFileName(date = new Date()) {
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  return `poll-${yyyy}-${mm}.log`;
}

export function writeLog(level, message) {
  if (!dataDir) return;
  const now = new Date();
  const timestamp = now.toISOString();
  const logLine = `[${timestamp}] [${level.toUpperCase()}] ${message}\n`;
  
  const logFile = path.join(dataDir, getLogFileName(now));
  try {
    fs.appendFileSync(logFile, logLine);
  } catch (err) {
    // silently fail if we can't write to log
  }
}

export function getLogsForMonth(yyyy, mm) {
  if (!dataDir) return '';
  const file = path.join(dataDir, `poll-${yyyy}-${mm}.log`);
  if (fs.existsSync(file)) {
    return fs.readFileSync(file, 'utf8');
  }
  return 'No logs for this month.';
}

export function listLogMonths() {
  if (!dataDir) return [];
  try {
    const files = fs.readdirSync(dataDir);
    const logFiles = files.filter(f => f.startsWith('poll-') && f.endsWith('.log'));
    // extract YYYY-MM
    return logFiles.map(f => f.replace('poll-', '').replace('.log', '')).sort().reverse();
  } catch (err) {
    return [];
  }
}

// Override console globally to capture logs
const originalConsoleLog = console.log;
const originalConsoleWarn = console.warn;
const originalConsoleError = console.error;

export function wrapConsole() {
  console.log = (...args) => {
    originalConsoleLog(...args);
    writeLog('info', args.join(' '));
  };
  console.warn = (...args) => {
    originalConsoleWarn(...args);
    writeLog('warn', args.join(' '));
  };
  console.error = (...args) => {
    originalConsoleError(...args);
    writeLog('error', args.join(' '));
  };
}

export const apiErrors = [];
export function logApiError(provider, username, error, feature) {
  apiErrors.unshift({
    timestamp: new Date().toISOString(),
    provider,
    username,
    feature,
    error: error.message || String(error)
  });
  if (apiErrors.length > 500) apiErrors.length = 500;
}
