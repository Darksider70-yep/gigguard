import * as fs from 'fs';
import * as path from 'path';

const messagesDir = path.join(__dirname, '../messages');

type Translations = Record<string, any>;

function flattenKeys(obj: Translations, prefix = ''): string[] {
  let keys: string[] = [];
  for (const k in obj) {
    if (k === '_meta') continue;

    if (typeof obj[k] === 'object' && obj[k] !== null) {
      keys = keys.concat(flattenKeys(obj[k], `${prefix}${k}.`));
    } else {
      keys.push(`${prefix}${k}`);
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
  const locRaw = fs.readFileSync(path.join(messagesDir, `${locale}.json`), 'utf-8');
  const locJson = JSON.parse(locRaw);
  const locKeys = new Set(flattenKeys(locJson));

  const missing = [...enKeys].filter(x => !locKeys.has(x));
  const extra = [...locKeys].filter(x => !enKeys.has(x));

  if (missing.length > 0) {
    console.error(`\u274C [${locale}] Missing keys:`, missing);
    hasError = true;
  }
  if (extra.length > 0) {
    console.error(`\u26A0\uFE0F [${locale}] Extra keys:`, extra);
  }

  // Ensure Tier 1 placeholders aren't modified until explicitly done by a human
  if (locJson._meta?.status?.includes('INCOMPLETE')) {
    const tier1Check = 'TODO \u2014 [HUMAN TRANSLATE]';
    const checkNested = (obj: any): boolean => {
      for (const key in obj) {
        if (key === '_meta') continue;
        if (typeof obj[key] === 'object') {
          if (!checkNested(obj[key])) return false;
        } else if (typeof obj[key] === 'string') {
          // If in Tier 1 section (claim_detail or notifications)
          if (
            (key.includes('message') || key.includes('flag_')) &&
            !obj[key].includes(tier1Check) &&
            enJson['claim_detail']?.[key] !== undefined
          ) {
            console.error(`\u274C [${locale}] Tier 1 string modified without status update: ${key}`);
            hasError = true;
          }
        }
      }
      return true;
    };
    checkNested(locJson);
  }
}

if (hasError) {
  process.exit(1);
} else {
  console.log('\u2705 All translation keys match en.json');
}
