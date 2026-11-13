// Starts the ML service (uvicorn) for PM2 without opening a console window on Windows.
// PM2 runs this file with Node; it starts Python hidden, passes its output to PM2's logs and stops
// with it. The settings come from ecosystem.config.js (ML_DIR, ML_PYTHON, ML_APP, ML_PORT).
const { spawn } = require('child_process');

const { ML_DIR, ML_PYTHON, ML_APP = 'app.main:app', ML_PORT = '8000' } = process.env;
const child = spawn(ML_PYTHON, ['-m', 'uvicorn', ML_APP, '--host', '127.0.0.1', '--port', ML_PORT], {
  cwd: ML_DIR,
  stdio: 'inherit',          // uvicorn's output goes straight to PM2's logs
  windowsHide: true,         // no empty python.exe window
});
child.on('error', (err) => { console.error(`Could not start the ML service: ${err.message}`); process.exit(1); });
child.on('exit', (code, signal) => process.exit(code ?? (signal ? 1 : 0)));
for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => child.kill(sig));
