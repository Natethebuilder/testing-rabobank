/**
 * Verification of Payee: check the beneficiary name against the holder of a Woodgrove account.
 *
 *   verifyPayee('NL20WGBK0123456789', 'J. de Vries')
 *   → { result: 'CLOSE_MATCH', suggestedName: 'Jan de Vries' }
 *
 * Returns null when the IBAN is invalid or the name is empty: there is nothing to check yet.
 * The check is advisory; it never blocks a transfer.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(require('./iban'), require('../data/accounts'));
  } else {
    root.Woodgrove = root.Woodgrove || {};
    root.Woodgrove.payee = factory(root.Woodgrove.iban, root.Woodgrove.accounts);
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function (iban, accounts) {
  'use strict';

  const MAX_TYPOS = 2;

  // Surname particles that belong to the surname and cannot be shortened to an initial.
  const PARTICLES = ['de', 'den', 'der', 'van', 'von', 'het', 'ten', 'ter', 'te', 'la', 'le', 'du', 'des', 'di', 'da'];

  /** "  ÉMILIE  van den  Berg " → "emilie van den berg"; dots count as spaces ("J.de" → "j de"). */
  function normalizeName(value) {
    return String(value)
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/\./g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  /** Index of the first surname word: the last word plus any particles directly before it. */
  function surnameStart(words) {
    let start = words.length - 1;
    while (start > 0 && PARTICLES.includes(words[start - 1])) start -= 1;
    return start;
  }

  /** True when given names are shortened to initials and the surname is exactly the same. */
  function isInitialsOf(typed, holder) {
    const typedWords = typed.split(' ');
    const holderWords = holder.split(' ');
    if (typedWords.length !== holderWords.length) return false;

    const start = surnameStart(holderWords);
    if (start === 0) return false;

    let usedInitial = false;
    for (let i = 0; i < holderWords.length; i += 1) {
      if (typedWords[i] === holderWords[i]) continue;
      if (i >= start || typedWords[i].length !== 1 || holderWords[i][0] !== typedWords[i]) return false;
      usedInitial = true;
    }
    return usedInitial;
  }

  /** Number of single-character insertions, deletions or substitutions to turn a into b. */
  function levenshtein(a, b) {
    let previous = Array.from({ length: b.length + 1 }, (_, j) => j);
    for (let i = 1; i <= a.length; i += 1) {
      const current = [i];
      for (let j = 1; j <= b.length; j += 1) {
        const cost = a[i - 1] === b[j - 1] ? 0 : 1;
        current[j] = Math.min(previous[j] + 1, current[j - 1] + 1, previous[j - 1] + cost);
      }
      previous = current;
    }
    return previous[b.length];
  }

  function verifyPayee(accountIban, name) {
    if (typeof name !== 'string' || !iban.isValidIban(accountIban)) return null;
    const typed = normalizeName(name);
    if (!typed) return null;

    const holderName = accounts[iban.normalizeIban(accountIban)];
    if (!holderName) return { result: 'NOT_POSSIBLE' };

    const holder = normalizeName(holderName);
    if (typed === holder) return { result: 'MATCH' };
    if (isInitialsOf(typed, holder) || levenshtein(typed, holder) <= MAX_TYPOS) {
      return { result: 'CLOSE_MATCH', suggestedName: holderName };
    }
    return { result: 'NO_MATCH' };
  }

  return { verifyPayee };
});
