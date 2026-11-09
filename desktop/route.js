// Getting past ISP blocks on Cloudflare.
//
// Some ISPs block Cloudflare addresses wholesale (in Spain, Movistar and others do it during LaLiga matches), and a
// workers.dev name resolves to only two of them. Every Cloudflare edge address serves every Worker: the edge goes by
// the TLS name, and the certificate is still checked against the server's real name. So when the normal address
// can't be reached, Beam pins the server's hostname to another edge address that answers, and drops the pin once the
// normal one works again.
const dns = require('dns');
const https = require('https');

// Spread over several Cloudflare ranges so one block rarely catches them all. Not every edge address serves every
// site (some answer 403 / error 1034); all of these served the Beam worker when they were picked.
const EDGE_IPS = [
  '188.114.98.5', '188.114.99.5', '104.18.0.1', '104.20.0.1', '104.21.0.1',
  '104.24.0.1', '104.26.0.1', '172.66.0.1', '162.159.128.1', '162.159.140.1',
];
const PROBE_MS = 6000;
const MIN_GAP_MS = 15 * 1000; // between checks, so a burst of failures doesn't start a burst of probes
const RECHECK_MS = 15 * 60 * 1000; // while pinned, how often to try the normal address again

const pins = new Map(); // hostname -> edge address
const systemLookup = dns.lookup;
const answer = (ip, opts, cb) => process.nextTick(() => (opts && opts.all ? cb(null, [{ address: ip, family: 4 }]) : cb(null, ip, 4)));
const hostOf = (server) => { try { return new URL(server).hostname; } catch { return null; } };

// Node's fetch and WebSocket resolve names through dns.lookup, so this one hook reroutes every request to a pinned host.
dns.lookup = function lookup(hostname, opts, cb) {
  if (typeof opts === 'function') [cb, opts] = [opts, {}];
  const ip = pins.get(hostname);
  if (ip) return answer(ip, opts, cb);
  return systemLookup.call(dns, hostname, opts, cb);
};

// Does Beam answer through this edge address (or through normal DNS when ip is null)? Only a real reply from Beam
// counts, not an error page from an edge that doesn't serve this site.
function reachable(host, ip) {
  return new Promise((resolve) => {
    const req = https.get({
      host, path: '/manifest.webmanifest', agent: false, timeout: PROBE_MS,
      lookup: ip ? (_h, opts, cb) => answer(ip, opts, cb) : systemLookup,
    }, (res) => { res.resume(); resolve(res.statusCode === 200); });
    req.on('timeout', () => req.destroy());
    req.on('error', () => resolve(false));
  });
}

let checking = null, checkedAt = 0, changedAt = 0;

// Call when the server can't be reached. Resolves true when the route to it has just changed, so a retry is worth it.
function checkRoute(server) {
  if (checking) return checking;
  const host = hostOf(server);
  if (!host) return Promise.resolve(false);
  if (Date.now() - checkedAt < MIN_GAP_MS) return Promise.resolve(Date.now() - changedAt < MIN_GAP_MS);
  checking = (async () => {
    const before = pins.get(host) || null;
    const direct = reachable(host, null);
    const edge = Promise.any(EDGE_IPS.map((ip) => reachable(host, ip).then((ok) => (ok ? ip : Promise.reject()))))
      .catch(() => null);
    let after = before;
    if (await direct) after = null;
    else after = (await edge) || before; // nothing answers at all: the laptop is offline, leave things as they are
    if (after) pins.set(host, after); else pins.delete(host);
    if (after !== before) changedAt = Date.now();
    return after !== before;
  })().finally(() => { checking = null; checkedAt = Date.now(); });
  return checking;
}

// Back to the normal address once the block is over.
setInterval(() => {
  for (const host of pins.keys()) reachable(host, null).then((ok) => { if (ok) pins.delete(host); });
}, RECHECK_MS).unref();

const pinnedFor = (server) => pins.get(hostOf(server)) || null;

module.exports = { checkRoute, pinnedFor, EDGE_IPS };
