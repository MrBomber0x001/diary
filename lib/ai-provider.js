const crypto = require('node:crypto');
const dns = require('node:dns');
const https = require('node:https');
const net = require('node:net');

function encryptionKey() {
  const value = process.env.PERSONAL_MEMO_AI_ENCRYPTION_KEY || '';
  if (!/^[a-f0-9]{64}$/i.test(value)) {
    const error = new Error('Set PERSONAL_MEMO_AI_ENCRYPTION_KEY to a 32-byte (64 hex character) secret before connecting an AI provider.');
    error.code = 'AI_ENCRYPTION_NOT_CONFIGURED';
    throw error;
  }
  return Buffer.from(value, 'hex');
}

function encryptSecret(value) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', encryptionKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
  return {
    ciphertext: ciphertext.toString('base64'),
    iv: iv.toString('base64'),
    authTag: cipher.getAuthTag().toString('base64'),
  };
}

function decryptSecret({ ciphertext, iv, authTag }) {
  const decipher = crypto.createDecipheriv('aes-256-gcm', encryptionKey(), Buffer.from(iv, 'base64'));
  decipher.setAuthTag(Buffer.from(authTag, 'base64'));
  return Buffer.concat([
    decipher.update(Buffer.from(ciphertext, 'base64')),
    decipher.final(),
  ]).toString('utf8');
}

function isPublicAddress(address) {
  if (net.isIPv4(address)) {
    const [first, second, third] = address.split('.').map(Number);
    return !(first === 0 || first === 10 || first === 127 || first >= 224
      || first === 100 && second >= 64 && second <= 127
      || first === 169 && second === 254
      || first === 172 && second >= 16 && second <= 31
      || first === 192 && (second === 168 || second === 0 || second === 2 || second === 88 && third === 99)
      || first === 198 && (second === 18 || second === 19 || second === 51)
      || first === 203 && second === 0 && third === 113);
  }
  if (net.isIPv6(address)) {
    let normalized = address.toLowerCase();
    const ipv4Tail = normalized.match(/(\d{1,3}(?:\.\d{1,3}){3})$/);
    if (ipv4Tail) {
      const octets = ipv4Tail[1].split('.').map(Number);
      if (octets.some(octet => octet > 255)) return false;
      const high = ((octets[0] << 8) | octets[1]).toString(16);
      const low = ((octets[2] << 8) | octets[3]).toString(16);
      normalized = `${normalized.slice(0, -ipv4Tail[1].length)}${high}:${low}`;
    }
    const halves = normalized.split('::');
    if (halves.length > 2) return false;
    const left = halves[0] ? halves[0].split(':') : [];
    const right = halves.length === 2 && halves[1] ? halves[1].split(':') : [];
    const missing = 8 - left.length - right.length;
    if (missing < 0 || (halves.length === 1 && missing !== 0)) return false;
    const groups = [...left, ...Array(missing).fill('0'), ...right];
    if (groups.some(group => !/^[a-f0-9]{1,4}$/.test(group))) return false;
    const value = BigInt(`0x${groups.join('').padStart(32, '0')}`);
    if (value >> 32n === 0xffffn) {
      const ipv4 = Number(value & 0xffffffffn);
      return isPublicAddress(`${ipv4 >>> 24}.${(ipv4 >>> 16) & 255}.${(ipv4 >>> 8) & 255}.${ipv4 & 255}`);
    }
    const globalUnicast = value >> 125n === 1n;
    const special2001 = value >> 105n === BigInt('0x2001') * 128n;
    const documentation = value >> 96n === 0x20010db8n;
    const sixToFour = value >> 112n === 0x2002n;
    const documentationV6 = value >> 108n === 0x3fff0n;
    const nat64WellKnown = value >> 32n === 0x64ff9b00000000n;
    const nat64Local = value >> 80n === 0x64ff9b000001n;
    return globalUnicast && !special2001 && !documentation && !sixToFour
      && !documentationV6 && !nat64WellKnown && !nat64Local;
  }
  return false;
}

function validateProviderBaseUrl(value) {
  let url;
  try {
    url = new URL(value);
  } catch {
    return { error: 'Enter a valid HTTPS provider base URL.' };
  }
  if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash
    || url.hostname === 'localhost' || url.hostname.endsWith('.localhost')
    || net.isIP(url.hostname) || url.href.length > 500) {
    return { error: 'Provider URLs must use HTTPS and a public hostname without credentials, query parameters, or fragments.' };
  }
  return { url: url.href.replace(/\/+$/, '') };
}

async function requestProviderCompletion({ baseUrl, apiKey, model, messages, maxTokens = 1000 }) {
  const valid = validateProviderBaseUrl(baseUrl);
  if (valid.error) throw new Error(valid.error);
  const url = new URL(`${valid.url}/chat/completions`);
  const hostname = url.hostname;
  let lookupTimer;
  let addresses;
  try {
    addresses = await Promise.race([
      dns.promises.lookup(hostname, { all: true, verbatim: true }),
      new Promise((resolve, reject) => {
        lookupTimer = setTimeout(() => reject(new Error('AI provider DNS lookup timed out.')), 10000);
      }),
    ]);
  } finally {
    clearTimeout(lookupTimer);
  }
  if (!addresses.length || addresses.some(entry => !isPublicAddress(entry.address))) {
    throw new Error('The provider hostname resolves to a private or restricted network.');
  }
  const pinned = addresses[0];
  const payload = Buffer.from(JSON.stringify({
    model,
    messages,
    temperature: 0.6,
    max_tokens: maxTokens,
  }));
  const responseBody = await new Promise((resolve, reject) => {
    const request = https.request(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
        'Content-Length': payload.length,
        'User-Agent': 'PersonalMemo/1.0',
      },
      lookup(requestedHost, options, callback) {
        if (requestedHost !== hostname) return callback(new Error('Unexpected AI provider hostname.'));
        if (options?.all) callback(null, [{ address: pinned.address, family: pinned.family }]);
        else callback(null, pinned.address, pinned.family);
      },
    }, response => {
      const chunks = [];
      let size = 0;
      response.on('data', chunk => {
        size += chunk.length;
        if (size > 512 * 1024) {
          request.destroy(new Error('AI provider response exceeded the allowed size.'));
          return;
        }
        chunks.push(chunk);
      });
      response.on('end', () => {
        if (response.statusCode < 200 || response.statusCode >= 300) {
          return reject(new Error(`AI provider returned HTTP ${response.statusCode || 'error'}. Check the endpoint, model, and API key.`));
        }
        try {
          resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')));
        } catch {
          reject(new Error('AI provider returned an invalid JSON response.'));
        }
      });
      response.on('error', reject);
    });
    const deadline = setTimeout(() => request.destroy(new Error('AI provider request timed out.')), 30000);
    request.once('close', () => clearTimeout(deadline));
    request.on('error', reject);
    request.end(payload);
  });
  const content = responseBody?.choices?.[0]?.message?.content;
  if (typeof content !== 'string' || !content.trim()) throw new Error('AI provider returned an empty completion.');
  return content.trim();
}

module.exports = {
  decryptSecret,
  encryptSecret,
  encryptionConfigured: () => /^[a-f0-9]{64}$/i.test(process.env.PERSONAL_MEMO_AI_ENCRYPTION_KEY || ''),
  requestProviderCompletion,
  validateProviderBaseUrl,
};
