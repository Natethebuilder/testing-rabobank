describe('payee', () => {
  const { verifyPayee } = Woodgrove.payee;
  const JAN = 'NL20WGBK0123456789';
  const EMILIE = 'NL54WGBK9876543210';

  [
    ['Jan de Vries', { result: 'MATCH' }],
    ['J. de Vries', { result: 'CLOSE_MATCH', suggestedName: 'Jan de Vries' }],
    ['Jan de Vris', { result: 'CLOSE_MATCH', suggestedName: 'Jan de Vries' }],
    ['Piet Jansen', { result: 'NO_MATCH' }],
  ].forEach(([name, expected]) => {
    test(`ticket example: "${name}" gives ${expected.result}`, () => {
      expect(verifyPayee(JAN, name)).toEqual(expected);
    });
  });

  test('ticket example: a French IBAN gives NOT_POSSIBLE', () => {
    expect(verifyPayee('FR76 3000 6000 0112 3456 7890 189', 'Claire Dubois')).toEqual({ result: 'NOT_POSSIBLE' });
  });

  test('case, accents and extra spaces are ignored', () => {
    expect(verifyPayee(JAN, '  JAN  DE VRIES ')).toEqual({ result: 'MATCH' });
    expect(verifyPayee(EMILIE, 'Emilie van den Berg')).toEqual({ result: 'MATCH' });
  });

  test('the IBAN may be typed with spaces and lowercase letters', () => {
    expect(verifyPayee('nl20 wgbk 0123 4567 89', 'Jan de Vries')).toEqual({ result: 'MATCH' });
  });

  test('initials work with or without a dot, but the surname must be complete', () => {
    expect(verifyPayee(JAN, 'J de Vries').result).toBe('CLOSE_MATCH');
    expect(verifyPayee(EMILIE, 'É. van den Berg').result).toBe('CLOSE_MATCH');
    expect(verifyPayee(JAN, 'Jan de V.').result).toBe('NO_MATCH');
    expect(verifyPayee(JAN, 'P. de Vries').result).toBe('NO_MATCH');
  });

  test('two typos are a close match, three are not', () => {
    expect(verifyPayee(JAN, 'Jen de Vris').result).toBe('CLOSE_MATCH');
    expect(verifyPayee(JAN, 'Jen do Vris').result).toBe('NO_MATCH');
  });

  test('an empty name or an invalid IBAN gives null', () => {
    expect(verifyPayee(JAN, '')).toBeNull();
    expect(verifyPayee(JAN, '   ')).toBeNull();
    expect(verifyPayee(JAN, undefined)).toBeNull();
    expect(verifyPayee('NL20WGBK0123456780', 'Jan de Vries')).toBeNull();
    expect(verifyPayee('', 'Jan de Vries')).toBeNull();
  });
});
