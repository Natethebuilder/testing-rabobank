/**
 * Woodgrove Transfers HTTP API (optional). No dependencies: node server.js
 *
 *   GET  /health          → { status: 'ok' }
 *   GET  /accounts        → Woodgrove accounts as { id, iban } with masked IBANs
 *   GET  /ibans/:iban     → validation details for one IBAN
 *   POST /payee-check     → Verification of Payee for { iban, name }
 *   POST /transfers       → create a transfer from a JSON transfer request (fromIban or fromAccountId)
 *   GET  /                → the transfer console (console/index.html)
 */
'use strict';

const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');

const iban = require('./src/iban');
const { createTransfer } = require('./src/transfer');
const { verifyPayee } = require('./src/payee');
const accounts = require('./data/accounts');

const PORT = Number(process.env.PORT) || 3000;
const ROOT = __dirname;

// The account directory (IBAN → holder name) stays on the server. Clients get opaque ids and masked IBANs.
const ACCOUNT_IDS = new Map(Object.keys(accounts).map((accountIban, index) => [`acc-${index + 1}`, accountIban]));

// Static files: the console and the src/ files it loads with <script> tags. data/ is not served.
const STATIC_DIRS = { '/': 'console', '/src/': 'src' };
const CONTENT_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
};

function sendJson(res, status, body) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(body, null, 2));
}

function sendError(res, status, code, message) {
  sendJson(res, status, { error: { code, message } });
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', (chunk) => {
      body += chunk;
    });
    req.on('end', () => resolve(body));
    req.on('error', reject);
  });
}

function serveStatic(req, res, pathname) {
  const prefix = pathname.startsWith('/src/') ? '/src/' : '/';
  const dir = path.join(ROOT, STATIC_DIRS[prefix]);
  const name = pathname === '/' ? 'index.html' : pathname.slice(prefix.length);
  const file = path.resolve(dir, name);
  const type = CONTENT_TYPES[path.extname(file)];

  if (!file.startsWith(dir + path.sep) || !type || !fs.existsSync(file)) {
    return sendError(res, 404, 'NOT_FOUND', `Nothing found at ${pathname}`);
  }
  res.writeHead(200, { 'Content-Type': type });
  fs.createReadStream(file).pipe(res);
}

async function handle(req, res) {
  const { pathname } = new URL(req.url, `http://${req.headers.host || 'localhost'}`);

  if (req.method === 'GET' && pathname === '/health') {
    return sendJson(res, 200, { status: 'ok', service: 'woodgrove-transfers', time: new Date().toISOString() });
  }

  if (req.method === 'GET' && pathname === '/accounts') {
    return sendJson(res, 200, [...ACCOUNT_IDS].map(([id, accountIban]) => ({ id, iban: iban.maskIban(accountIban) })));
  }

  if (req.method === 'GET' && pathname.startsWith('/ibans/')) {
    let value;
    try {
      value = decodeURIComponent(pathname.slice('/ibans/'.length));
    } catch (error) {
      return sendError(res, 400, 'INVALID_IBAN_PATH', 'The IBAN in the address could not be read.');
    }
    const country = iban.countryOf(value);
    const maskedIban = iban.maskIban(value);
    return sendJson(res, 200, {
      iban: maskedIban,
      formatted: iban.formatIban(maskedIban),
      valid: iban.isValidIban(value),
      country,
      sepa: iban.isSepaCountry(country),
    });
  }

  if (pathname === '/payee-check') {
    if (req.method !== 'POST') return sendError(res, 405, 'METHOD_NOT_ALLOWED', 'Use POST to check a payee name.');
    let body;
    try {
      body = JSON.parse(await readBody(req));
    } catch (error) {
      return sendError(res, 400, 'INVALID_JSON', 'The request body must be JSON with an iban and a name.');
    }
    const check = body && typeof body === 'object' ? verifyPayee(body.iban, body.name) : null;
    return sendJson(res, 200, { check });
  }

  if (pathname === '/transfers') {
    if (req.method !== 'POST') return sendError(res, 405, 'METHOD_NOT_ALLOWED', 'Use POST to create a transfer.');

    let request;
    try {
      request = JSON.parse(await readBody(req));
    } catch (error) {
      return sendError(res, 400, 'INVALID_JSON', 'The request body must be a JSON transfer request.');
    }

    if (request && typeof request === 'object' && 'fromAccountId' in request) {
      const { fromAccountId, ...rest } = request;
      request = { ...rest, fromIban: ACCOUNT_IDS.get(fromAccountId) };
    }

    const transfer = createTransfer(request);
    return sendJson(res, transfer.status === 'ACCEPTED' ? 201 : 422, transfer);
  }

  if (req.method === 'GET') return serveStatic(req, res, pathname);

  return sendError(res, 404, 'NOT_FOUND', `No route for ${req.method} ${pathname}`);
}

const server = http.createServer((req, res) => {
  handle(req, res).catch((err) => {
    console.error(err);
    sendError(res, 500, 'INTERNAL_ERROR', 'Something went wrong. Please try again later.');
  });
});

if (require.main === module) {
  server.listen(PORT, () => {
    console.log(`Woodgrove Transfers is running at http://localhost:${PORT}`);
  });
}

module.exports = server;
