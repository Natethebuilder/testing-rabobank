/**
 * Configuration for Woodgrove Transfers.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.Woodgrove = root.Woodgrove || {};
    root.Woodgrove.config = factory();
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  return Object.freeze({
    limits: Object.freeze({
      // € 25.000,00 per transfer
      maxTransferCents: 2_500_000,
      maxDescriptionLength: 140,
    }),

    // Sanctions screening service, called by the nightly screening job.
    // The key comes from the server environment and is never shipped to the browser.
    screening: Object.freeze({
      url: 'https://screening.woodgrove.example/v2/check',
      apiKey: (typeof process !== 'undefined' && process.env && process.env.SCREENING_API_KEY) || null,
      timeoutMs: 2000,
    }),
  });
});
