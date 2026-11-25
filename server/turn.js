// Connection helpers ("ICE servers") for the video/phone consultations.
//
// A call goes straight from the doctor's device to the patient's when the two networks allow it. Many don't —
// mobile data (4G/5G), hospital and office Wi-Fi, some home routers — and then the picture and sound have to be
// passed on by a relay ("TURN") server. Without one, the call "connects" but no video or sound ever arrives.
// (The free relay that came with PeerJS no longer exists, so a relay must be configured here.)
//
// Set ONE of these in the hosting environment variables:
//   Cloudflare (recommended; free allowance is large):  CLOUDFLARE_TURN_KEY_ID, CLOUDFLARE_TURN_API_TOKEN
//   Metered.ca:                                         METERED_TURN_DOMAIN (e.g. gp4u.metered.live), METERED_TURN_API_KEY
//   Any other TURN server (fixed login):                TURN_URLS (comma-separated), TURN_USERNAME, TURN_CREDENTIAL
// Short-lived logins are fetched from the provider and cached for an hour; nothing secret is ever sent to the browser
// except those temporary relay logins.
const STUN = [{ urls: ['stun:stun.cloudflare.com:3478', 'stun:stun.l.google.com:19302'] }];
let cache = { at: 0, servers: null };
const TTL_MS = 60 * 60 * 1000;

function provider() {
  const e = process.env;
  if (e.CLOUDFLARE_TURN_KEY_ID && e.CLOUDFLARE_TURN_API_TOKEN) return 'cloudflare';
  if (e.METERED_TURN_DOMAIN && e.METERED_TURN_API_KEY) return 'metered';
  if (e.TURN_URLS && e.TURN_USERNAME && e.TURN_CREDENTIAL) return 'static';
  return null;
}

async function fetchJson(url, options) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 6000);
  try {
    const res = await fetch(url, { ...options, signal: ctrl.signal });
    if (!res.ok) throw new Error(`relay provider answered ${res.status}`);
    return await res.json();
  } finally { clearTimeout(timer); }
}

async function relayServers() {
  const e = process.env;
  switch (provider()) {
    case 'cloudflare': {
      const data = await fetchJson(`https://rtc.live.cloudflare.com/v1/turn/keys/${encodeURIComponent(e.CLOUDFLARE_TURN_KEY_ID)}/credentials/generate-ice-servers`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${e.CLOUDFLARE_TURN_API_TOKEN}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ ttl: 4 * 60 * 60 }),
      });
      const list = Array.isArray(data.iceServers) ? data.iceServers : (data.iceServers ? [data.iceServers] : []);
      // Cloudflare also lists port-53 addresses, which browsers block; leave those out.
      return list.map((s) => ({ ...s, urls: [].concat(s.urls || []).filter((u) => !/:53(\?|$)/.test(u)) })).filter((s) => s.urls.length);
    }
    case 'metered': {
      const data = await fetchJson(`https://${e.METERED_TURN_DOMAIN.replace(/^https?:\/\//, '').replace(/\/.*$/, '')}/api/v1/turn/credentials?apiKey=${encodeURIComponent(e.METERED_TURN_API_KEY)}`);
      return Array.isArray(data) ? data : [];
    }
    case 'static':
      return [{ urls: e.TURN_URLS.split(',').map((u) => u.trim()).filter(Boolean), username: e.TURN_USERNAME, credential: e.TURN_CREDENTIAL }];
    default:
      return [];
  }
}

// Always returns something usable: the relay (when configured and reachable) plus public STUN servers.
async function iceServers() {
  if (cache.servers && Date.now() - cache.at < TTL_MS) return { iceServers: cache.servers, relay: true };
  if (provider()) {
    try {
      const relay = await relayServers();
      if (relay.length) {
        cache = { at: Date.now(), servers: [...STUN, ...relay] };
        return { iceServers: cache.servers, relay: true };
      }
    } catch (err) {
      console.log('Video relay (TURN) could not be fetched:', err.message);
    }
  }
  return { iceServers: STUN, relay: false };
}

module.exports = { iceServers, isConfigured: () => !!provider() };
