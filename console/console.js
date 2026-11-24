/**
 * Transfer console: a small UI on top of src/transfer.js. Runs in the browser without a build step.
 */
(function () {
  'use strict';

  const { iban, money, transfer, accounts, payee } = window.Woodgrove;
  const $ = (id) => document.getElementById(id);

  // Served by server.js, the account directory stays on the server and the console uses the API.
  // Opened as a local file, it uses data/accounts.js directly.
  const useApi = !accounts;
  const DEFAULT_FROM = 'NL12WGBK0417164300';

  const postJson = (url, body) =>
    fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      .then((response) => response.json());

  const form = $('transfer-form');
  const fields = {
    fromIban: $('fromIban'),
    toIban: $('toIban'),
    beneficiaryName: $('beneficiaryName'),
    amount: $('amount'),
    description: $('description'),
    instant: $('instant'),
  };

  const EXAMPLES = {
    claire: { toIban: 'FR76 3000 6000 0112 3456 7890 189', beneficiaryName: 'Claire Dubois', amount: '125,00', description: 'Invoice 2026-114' },
    giulia: { toIban: 'IT21 A030 6909 6061 0000 0063 789', beneficiaryName: 'Giulia Romano', amount: '480,00', description: 'Apartment Milan, December' },
    jan: { toIban: 'NL20 WGBK 0123 4567 89', beneficiaryName: 'Jan de Vries', amount: '42,50', description: 'Dinner' },
    big: { toIban: 'DE89 3704 0044 0532 0130 00', beneficiaryName: 'Autohaus Müller GmbH', amount: '27.500,00', description: 'Car' },
  };

  // Fill the "From" list with Woodgrove's own accounts.
  function addFromOption(value, label) {
    const option = document.createElement('option');
    option.value = value;
    option.textContent = label;
    fields.fromIban.appendChild(option);
  }

  if (useApi) {
    fetch('/accounts')
      .then((response) => response.json())
      .then((list) => {
        list.forEach((account) => addFromOption(account.id, account.iban));
        const preferred = list.find((account) => account.iban === iban.maskIban(DEFAULT_FROM));
        if (preferred) fields.fromIban.value = preferred.id;
      });
  } else {
    Object.keys(accounts).forEach((accountIban) => addFromOption(accountIban, iban.maskIban(accountIban)));
    fields.fromIban.value = DEFAULT_FROM;
  }

  function readRequest() {
    return {
      [useApi ? 'fromAccountId' : 'fromIban']: fields.fromIban.value,
      toIban: fields.toIban.value,
      beneficiaryName: fields.beneficiaryName.value,
      amountCents: money.parseAmount(fields.amount.value),
      description: fields.description.value,
      instant: fields.instant.checked,
    };
  }

  function updateIbanHint() {
    const hint = $('iban-hint');
    const value = fields.toIban.value;
    hint.className = 'hint';
    if (!value.trim()) {
      hint.textContent = "Enter the beneficiary's IBAN.";
    } else if (iban.isValidIban(value)) {
      const country = iban.countryOf(value);
      hint.textContent = `✓ ${iban.maskIban(value)} · ${country}${iban.isSepaCountry(country) ? ' · SEPA' : ' · outside SEPA'}`;
      hint.classList.add('ok');
    } else {
      hint.textContent = 'This IBAN does not look valid yet.';
      hint.classList.add('warn');
    }
  }

  let nameCheckSequence = 0;

  function showNameCheck(check) {
    const hint = $('name-hint');
    const messages = {
      MATCH: ['ok', '✅ Name matches'],
      CLOSE_MATCH: ['warn', `⚠️ Did you mean ${check && check.suggestedName}?`],
      NO_MATCH: ['bad', "❌ Name doesn't match this account"],
      NOT_POSSIBLE: ['', 'ℹ️ Name check not possible for this bank'],
    };
    const [tone, text] = check ? messages[check.result] : ['', "The name on the beneficiary's account."];
    hint.className = tone ? `hint ${tone}` : 'hint';
    hint.textContent = text;
  }

  function updateNameHint() {
    const toIban = fields.toIban.value;
    const name = fields.beneficiaryName.value;
    if (!useApi) return showNameCheck(payee.verifyPayee(toIban, name));

    // Only the latest answer counts, so a slow reply never overwrites a newer one.
    const sequence = ++nameCheckSequence;
    if (!name.trim() || !iban.isValidIban(toIban)) return showNameCheck(null);
    postJson('/payee-check', { iban: toIban, name })
      .then((body) => {
        if (sequence === nameCheckSequence) showNameCheck(body.check);
      })
      .catch(() => {
        if (sequence === nameCheckSequence) showNameCheck(null);
      });
  }

  function updateAmountHint() {
    const cents = money.parseAmount(fields.amount.value);
    const hint = $('amount-hint');
    hint.textContent = Number.isInteger(cents) ? money.formatAmount(cents) : 'For example 1.234,56';
    updateFeeHint();
  }

  function updateFeeHint() {
    const feeCents = transfer.calculateFee(money.parseAmount(fields.amount.value), fields.instant.checked);
    $('fee-hint').textContent = feeCents === null
      ? 'Enter a valid amount to see the fee.'
      : `Fee: ${money.formatAmount(feeCents)}`;
  }

  function updateDescriptionCount() {
    $('description-count').textContent = `${fields.description.value.length} / 140`;
  }

  function render(result) {
    $('result-empty').hidden = true;
    $('result-body').hidden = false;

    const accepted = result.status === 'ACCEPTED';
    const status = $('result-status');
    status.textContent = result.status;
    status.className = `status ${accepted ? 'accepted' : 'rejected'}`;
    $('result-id').textContent = result.id;
    $('result-amount').textContent = Number.isInteger(result.amountCents) ? money.formatAmount(result.amountCents) : '€ –';

    $('result-summary').innerHTML = `
      <dt>To</dt><dd class="mono">${result.toIban || '–'}</dd>
      <dt>From</dt><dd class="mono">${result.fromIban || '–'}</dd>
      <dt>Description</dt><dd>${result.description || '–'}</dd>
      <dt>Speed</dt><dd>${result.instant ? 'Instant' : 'Standard (next business day)'}</dd>
      <dt>Fee</dt><dd>${result.feeCents === null ? 'Not available (invalid amount)' : money.formatAmount(result.feeCents)}</dd>
      <dt>Created</dt><dd>${new Date(result.createdAt).toLocaleString('en-GB')}</dd>`;

    $('result-errors').innerHTML = result.errors
      .map((error) => `<li><strong>${error.code}</strong> ${error.message}</li>`)
      .join('');

    $('result-json').textContent = JSON.stringify(result, null, 2);
  }

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    if (useApi) {
      postJson('/transfers', readRequest()).then(render);
    } else {
      render(transfer.createTransfer(readRequest()));
    }
  });

  document.querySelectorAll('[data-example]').forEach((button) => {
    button.addEventListener('click', () => {
      const example = EXAMPLES[button.dataset.example];
      Object.keys(example).forEach((name) => {
        fields[name].value = example[name];
      });
      updateIbanHint();
      updateNameHint();
      updateAmountHint();
      updateDescriptionCount();
    });
  });

  fields.toIban.addEventListener('input', () => {
    updateIbanHint();
    updateNameHint();
  });
  fields.beneficiaryName.addEventListener('input', updateNameHint);
  fields.amount.addEventListener('input', updateAmountHint);
  fields.instant.addEventListener('change', updateFeeHint);
  fields.description.addEventListener('input', updateDescriptionCount);
  updateFeeHint();
})();
