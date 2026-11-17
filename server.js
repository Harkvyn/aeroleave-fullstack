#!/usr/bin/env node
/**
 * ============================================================================
 * AEROLEAVE GLOBAL — FULL-STACK INTERNATIONAL FLIGHT BOOKING & CORPORATE TRAVEL
 * ============================================================================
 * Arsitektur  : Node.js (v18+) Zero-Dependency Modular REST API + JSON Store
 * Mendukung   : Seluruh API US1-US9 + Rute Internasional, Katalog Bandara,
 *               Interactive Seat Map, Fare Tiers, Checkout Payment, & Boarding Pass
 *
 * Menjalankan Server : node server.js (http://localhost:4000)
 * Menjalankan Test   : node server.js --test
 * ============================================================================
 */

const http = require('node:http');
const store = require('./src/store');
const { handleRequest } = require('./src/routes');
const { runAutomatedTests } = require('./src/tests');

const PORT = Number(process.env.PORT || 4000);

if (require.main === module) {
  if (process.argv.includes('--test')) {
    runAutomatedTests().catch((err) => {
      console.error(err);
      process.exit(1);
    });
  } else {
    store.loadState();
    const server = http.createServer(handleRequest);
    server.listen(PORT, () => {
      console.log(`AeroLeave Global Server berjalan di http://localhost:${PORT}`);
      console.log(`Health Check: http://localhost:${PORT}/api/health`);
    });
  }
}

module.exports = { handleRequest, resetState: store.resetState };
