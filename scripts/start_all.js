/**
 * Dual-Engine Launcher for SOET VeriTrust System
 * Launches both the Next.js frontend/API server and the PyTorch AI Forensic microservice.
 * Usage: npm run dev:all
 */

const { spawn } = require('child_process');
const http = require('http');

console.log('================================================================');
console.log('🛡️  SOET VeriTrust: Dual-Engine Verification Environment');
console.log('   Ethereum Sepolia + PyTorch Deep Learning Forensic System');
console.log('================================================================\n');

// Check if Python AI microservice is running on port 8000
const req = http.get('http://127.0.0.1:8000/health', (res) => {
  if (res.statusCode === 200) {
    console.log('✅ Python AI Forensic Service is already ACTIVE on http://127.0.0.1:8000');
    startNextDev();
  } else {
    startPythonAI();
  }
});

req.on('error', () => {
  console.log('⚡ Launching PyTorch AI Forensic Microservice (FastAPI on port 8000)...');
  startPythonAI();
});

function startPythonAI() {
  const pythonProc = spawn('python', ['forgery_service/main.py'], {
    stdio: 'inherit',
    shell: true,
  });

  pythonProc.on('error', (err) => {
    console.warn('⚠️ Unable to start Python AI microservice:', err.message);
    console.warn('   Deterministic EVM verification will continue with fallback mode.');
  });

  // Give Python 2.5 seconds to initialize PyTorch model before starting Next.js
  setTimeout(startNextDev, 2500);
}

function startNextDev() {
  console.log('🌐 Starting Next.js Web Application on http://localhost:3000...\n');
  const nextProc = spawn('npx', ['next', 'dev'], {
    stdio: 'inherit',
    shell: true,
  });

  nextProc.on('error', (err) => {
    console.error('❌ Failed to start Next.js application:', err);
  });
}
