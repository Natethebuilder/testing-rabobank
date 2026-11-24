describe('transfer', () => {
  const { calculateFee, validateTransfer, createTransfer } = Woodgrove.transfer;

  const validRequest = () => ({
    fromIban: 'NL20WGBK0123456789',
    toIban: 'FR7630006000011234567890189',
    beneficiaryName: 'Claire Dubois',
    amountCents: 12500,
    description: 'Invoice 2026-114',
    instant: false,
  });

  const codesOf = (request) => validateTransfer(request).errors.map((error) => error.code);

  test('a valid request has no errors', () => {
    expect(validateTransfer(validRequest())).toEqual({ ok: true, errors: [] });
  });

  test('every error has a code and a plain-English message', () => {
    const { ok, errors } = validateTransfer({});
    expect(ok).toBe(false);
    expect(errors.length).toBeGreaterThan(0);
    for (const error of errors) {
      expect(error.code).toMatch(/^[A-Z_]+$/);
      expect(error.message.length).toBeGreaterThan(10);
    }
  });

  test('rejects an invalid beneficiary IBAN', () => {
    expect(codesOf({ ...validRequest(), toIban: 'FR7630006000011234567890188' })).toEqual(['INVALID_TO_IBAN']);
  });

  test('rejects a transfer to the same account', () => {
    const request = { ...validRequest(), toIban: 'NL20WGBK0123456789' };
    expect(codesOf(request)).toEqual(['SAME_ACCOUNT']);
  });

  test('requires a beneficiary name', () => {
    expect(codesOf({ ...validRequest(), beneficiaryName: '' })).toEqual(['MISSING_BENEFICIARY_NAME']);
    expect(codesOf({ ...validRequest(), beneficiaryName: '   ' })).toEqual(['MISSING_BENEFICIARY_NAME']);
  });

  test('the amount must be a positive integer number of cents', () => {
    expect(codesOf({ ...validRequest(), amountCents: 0 })).toEqual(['INVALID_AMOUNT']);
    expect(codesOf({ ...validRequest(), amountCents: -100 })).toEqual(['INVALID_AMOUNT']);
    expect(codesOf({ ...validRequest(), amountCents: 12.5 })).toEqual(['INVALID_AMOUNT']);
    expect(codesOf({ ...validRequest(), amountCents: '12500' })).toEqual(['INVALID_AMOUNT']);
  });

  test('rejects amounts above € 25.000,00', () => {
    expect(codesOf({ ...validRequest(), amountCents: 3000000 })).toEqual(['AMOUNT_TOO_HIGH']);
  });

  test('createTransfer accepts a valid request', () => {
    const now = new Date('2026-11-25T09:15:00.000Z');
    const transfer = createTransfer({ ...validRequest(), toIban: 'fr76 3000 6000 0112 3456 7890 189' }, now);

    expect(transfer.status).toBe('ACCEPTED');
    expect(transfer.errors).toEqual([]);
    expect(transfer.id).toMatch(/^TRF-20261125-\d{4}$/);
    expect(transfer.fromIban).toBe('NL****6789');
    expect(transfer.toIban).toBe('FR****0189');
    expect(transfer.beneficiaryName).toBeUndefined();
    expect(JSON.stringify(transfer)).not.toContain('Claire Dubois');
    expect(JSON.stringify(transfer)).not.toContain('FR7630006000011234567890189');
    expect(transfer.amountCents).toBe(12500);
    expect(transfer.instant).toBe(false);
    expect(transfer.createdAt).toBe('2026-11-25T09:15:00.000Z');
  });

  test('createTransfer gives every transfer its own id', () => {
    const first = createTransfer(validRequest());
    const second = createTransfer(validRequest());
    expect(first.id).not.toBe(second.id);
  });

  test('transfer logs mask IBANs and omit the beneficiary name', () => {
    const logs = [];
    const originalLog = console.log;
    let transfer;
    console.log = (...args) => logs.push(args.join(' '));
    try {
      transfer = createTransfer(validRequest());
    } finally {
      console.log = originalLog;
    }

    expect(logs.join(' ')).toContain('NL****6789 -> FR****0189');
    expect(logs.join(' ')).not.toContain('NL20WGBK0123456789');
    expect(logs.join(' ')).not.toContain('FR7630006000011234567890189');
    expect(logs.join(' ')).not.toContain('Claire Dubois');
    expect(transfer.beneficiaryName).toBeUndefined();
  });

  for (const [amountCents, instant, feeCents] of [
    [10000, true, 20],
    [123456, true, 123],
    [1000000, true, 250],
    [50000, false, 0],
    [123499, true, 123],
    [123500, true, 124],
    [1, true, 20],
    [20499, true, 20],
    [20500, true, 21],
    [249499, true, 249],
    [249500, true, 250],
  ]) {
    test(`quotes and creates a ${feeCents}-cent fee for ${amountCents} cents (${instant ? 'instant' : 'standard'})`, () => {
      expect(calculateFee(amountCents, instant)).toBe(feeCents);
      const result = createTransfer({ ...validRequest(), amountCents, instant });
      expect(result.status).toBe('ACCEPTED');
      expect(result.feeCents).toBe(feeCents);
    });
  }

  test('only an explicit instant flag incurs a fee', () => {
    for (const instant of [undefined, 'true', 1]) {
      const result = createTransfer({ ...validRequest(), amountCents: 123500, instant });
      expect(result.instant).toBe(false);
      expect(result.feeCents).toBe(0);
      expect(calculateFee(123500, instant)).toBe(0);
    }
  });

  test('invalid amounts have no fee quote and are rejected', () => {
    for (const amountCents of [undefined, NaN, Infinity, 0, -100, 12.5, '12500', Number.MAX_SAFE_INTEGER + 1]) {
      expect(calculateFee(amountCents, true)).toBeNull();
      const result = createTransfer({ ...validRequest(), amountCents, instant: true });
      expect(result.status).toBe('REJECTED');
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.feeCents).toBeNull();
    }
  });

  test('createTransfer rejects an invalid request and lists the errors', () => {
    const transfer = createTransfer({ ...validRequest(), amountCents: 0 });
    expect(transfer.status).toBe('REJECTED');
    expect(transfer.errors.map((error) => error.code)).toEqual(['INVALID_AMOUNT']);
  });
});
