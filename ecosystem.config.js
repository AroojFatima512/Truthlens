// NFR-10: keeps the TruthLens servers running. PM2 starts them, restarts any that crash (within a few
// seconds, waiting a bit longer each time if it keeps crashing), keeps their logs and can start them
// again when Windows starts.
//
//   npm install -g pm2                 (once)
//   pm2 start ecosystem.config.js      (from this folder: starts the backend and the ML service)
//   pm2 status                         (are they running? how often have they restarted?)
//   pm2 logs                           (live output of both)
//   pm2 restart all / pm2 stop all
//
// The ML service's folder and Python come from backend/.env (ML_DIR and ML_PYTHON), the same values
// the "Run crawl now" button uses. ML_APP is the FastAPI app uvicorn starts (default app.main:app,
// i.e. what you would type after "uvicorn" to start the ML service by hand).
const fs = require('fs');
const path = require('path');

const env = {};
try {
  for (const line of fs.readFileSync(path.join(__dirname, 'backend', '.env'), 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m) env[m[1]] = m[2].replace(/^"(.*)"$/, '$1');
  }
} catch { /* no backend/.env yet */ }

const mlDir = env.ML_DIR || path.join(__dirname, 'ml-service');
const mlPython = env.ML_PYTHON || 'python';
const mlPort = (env.ML_URL || '').match(/:(\d+)/)?.[1] || '8000';
const mlApp = env.ML_APP || 'app.main:app';
const logDir = path.join(__dirname, 'backend', 'logs');
try { fs.mkdirSync(logDir, { recursive: true }); } catch { /* PM2 creates it otherwise */ }

// Only start the ML service when its folder and Python really exist; otherwise say what to fix.
const mlProblem = !fs.existsSync(mlDir) ? `ML_DIR folder not found: ${mlDir}`
  : (path.isAbsolute(mlPython) && !fs.existsSync(mlPython)) ? `ML_PYTHON not found: ${mlPython}` : null;
if (mlProblem) {
  console.warn(`\n[TruthLens] The ML service was NOT started: ${mlProblem}`
    + '\n[TruthLens] Set ML_DIR and ML_PYTHON in backend/.env to the real paths, then: pm2 delete all && pm2 start ecosystem.config.js\n');
}

const common = {
  autorestart: true,
  max_restarts: 20,             // give up after 20 crashes in a row (something is really wrong then)
  min_uptime: '20s',            // running 20 s counts as a good start
  exp_backoff_restart_delay: 1000,
  time: true,                   // timestamps in the logs
};

const mlApp_ = {
      ...common,
      name: 'truthlens-ml',
      // a small Node launcher starts uvicorn hidden (no empty python.exe window on Windows)
      cwd: path.join(__dirname, 'backend'),
      script: path.join(__dirname, 'backend', 'scripts', 'run-ml.js'),
      env: { ML_DIR: mlDir, ML_PYTHON: mlPython, ML_APP: mlApp, ML_PORT: mlPort, PYTHONUNBUFFERED: '1' },
      kill_timeout: 8000,     // give uvicorn time to shut down cleanly
      error_file: path.join(__dirname, 'backend', 'logs', 'ml-error.log'),
      out_file: path.join(__dirname, 'backend', 'logs', 'ml-out.log'),
      max_memory_restart: '3G',
    };

module.exports = {
  apps: [
    {
      ...common,
      name: 'truthlens-backend',
      cwd: path.join(__dirname, 'backend'),
      script: 'server.js',
      error_file: path.join(__dirname, 'backend', 'logs', 'backend-error.log'),
      out_file: path.join(__dirname, 'backend', 'logs', 'backend-out.log'),
      max_memory_restart: '700M',
    },
    ...(mlProblem ? [] : [mlApp_]),
  ],
};
