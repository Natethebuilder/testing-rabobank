// Server and repository checks need Node; the browser runner skips this file.
if (typeof module === 'object' && typeof require === 'function') {
  describe('server security', () => {
    const fs = require('fs');
    const path = require('path');
    const server = require('../server');
    const ROOT = path.join(__dirname, '..');

    async function call(method, url, body) {
      if (!server.listening) await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
      const { port } = server.address();
      const response = await fetch(`http://127.0.0.1:${port}${url}`, {
        method,
        headers: body === undefined ? {} : { 'Content-Type': 'application/json' },
        body,
      });
      return { status: response.status, text: await response.text() };
    }

    test('no live API keys in the source code', () => {
      for (const dir of ['src', 'data', 'console']) {
        for (const name of fs.readdirSync(path.join(ROOT, dir))) {
          expect(fs.readFileSync(path.join(ROOT, dir, name), 'utf8')).not.toMatch(/wgb_live_\w+/);
        }
      }
    });

    test('the account directory with holder names is not served', async () => {
      const { status, text } = await call('GET', '/data/accounts.js');
      expect(status).toBe(404);
      expect(text).not.toContain('Jan de Vries');
    });

    test('/accounts lists masked IBANs without names', async () => {
      const { status, text } = await call('GET', '/accounts');
      expect(status).toBe(200);
      expect(JSON.parse(text)[0]).toEqual({ id: 'acc-1', iban: 'NL****6789' });
      expect(text).not.toContain('NL20WGBK0123456789');
      expect(text).not.toContain('Jan de Vries');
    });

    test('/payee-check gives the result, and a holder name only on a close match', async () => {
      const exact = await call('POST', '/payee-check', JSON.stringify({ iban: 'NL20WGBK0123456789', name: 'Jan de Vries' }));
      expect(JSON.parse(exact.text)).toEqual({ check: { result: 'MATCH' } });
      const wrong = await call('POST', '/payee-check', JSON.stringify({ iban: 'NL20WGBK0123456789', name: 'Piet Jansen' }));
      expect(wrong.text).not.toContain('Jan de Vries');
    });

    test('a transfer can use an account id instead of a full IBAN', async () => {
      const request = { fromAccountId: 'acc-2', toIban: 'FR7630006000011234567890189', beneficiaryName: 'Claire Dubois', amountCents: 12500 };
      const { status, text } = await call('POST', '/transfers', JSON.stringify(request));
      expect(status).toBe(201);
      expect(JSON.parse(text).fromIban).toBe('NL****4300');
    });

    test('a malformed IBAN path gives a 400 instead of a crash', async () => {
      const { status, text } = await call('GET', '/ibans/%E0');
      expect(status).toBe(400);
      expect(JSON.parse(text).error.code).toBe('INVALID_IBAN_PATH');
    });

    test('unexpected errors reveal no message, stack or file paths', async () => {
      const request = { fromIban: 'NL20WGBK0123456789', toIban: 'FR7630006000011234567890189', beneficiaryName: 'Claire Dubois', amountCents: 100, description: { toString: 1 } };
      const originalError = console.error;
      console.error = () => {};
      try {
        const { status, text } = await call('POST', '/transfers', JSON.stringify(request));
        expect(status).toBe(500);
        expect(JSON.parse(text)).toEqual({ error: { code: 'INTERNAL_ERROR', message: 'Something went wrong. Please try again later.' } });
        expect(text).not.toContain(ROOT);
      } finally {
        console.error = originalError;
        server.close();
      }
    });
  });
}
