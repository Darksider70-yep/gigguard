const fs = require('fs');
const path = require('path');

const messagesDir = path.join(__dirname, '../messages');

function flattenKeys(obj, prefix) {
  prefix = prefix || '';
  let keys = [];
  for (const k in obj) {
    if (k === '_meta') continue;
    if (typeof obj[k] === 'object' && obj[k] !== null) {
      keys = keys.concat(flattenKeys(obj[k], prefix + k + '.'));
    } else {
      keys.push(prefix + k);
    }
  }
  return keys;
}

const enRaw = fs.readFileSync(path.join(messagesDir, 'en.json'), 'utf-8');
const enJson = JSON.parse(enRaw);
const enKeys = new Set(flattenKeys(enJson));

const locales = ['hi', 'ta', 'te', 'kn', 'mr'];
let hasError = false;

for (const locale of locales) {
  const locPath = path.join(messagesDir, locale + '.json');
  if (!fs.existsSync(locPath)) {
    console.error('\u274C [' + locale + '] File missing: ' + locPath);
    hasError = true;
    continue;
  }

  const locRaw = fs.readFileSync(locPath, 'utf-8');
  const locJson = JSON.parse(locRaw);
  const locKeys = new Set(flattenKeys(locJson));

  const missing = [...enKeys].filter(x => !locKeys.has(x));
  const extra = [...locKeys].filter(x => !enKeys.has(x));

  if (missing.length > 0) {
    console.error('\u274C [' + locale + '] Missing ' + missing.length + ' keys:', missing.join(', '));
    hasError = true;
  }
  if (extra.length > 0) {
    console.warn('\u26A0\uFE0F [' + locale + '] Extra ' + extra.length + ' keys:', extra.join(', '));
  }

  if (missing.length === 0 && extra.length === 0) {
    console.log('\u2705 [' + locale + '] All keys match en.json');
  }
}

if (hasError) {
  console.error('\n\u274C Translation check failed. Fix missing keys above.');
  process.exit(1);
} else {
  console.log('\n\u2705 All translation files match en.json');
}
