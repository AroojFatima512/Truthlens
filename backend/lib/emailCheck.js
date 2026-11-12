// Sign-up check: can this e-mail address's domain receive mail at all? It looks up the domain's mail
// servers (MX records, or an address record as the fallback mail standards allow). This catches typos
// like "gmial.com" and made-up domains. It cannot tell whether one mailbox exists: only the e-mailed
// verification link proves that.
// If the DNS lookup itself fails (no internet), the address is let through: the verification e-mail
// still has to be clicked before the account works.
const dns = require('dns').promises;

const DOMAIN_GONE = new Set(['ENOTFOUND', 'ENODATA', 'NXDOMAIN', 'ENONAME']);

async function lookup(domain) {
  try {
    const mx = await dns.resolveMx(domain);
    if (mx.some((r) => r.exchange && r.exchange !== '.')) return 'ok';
    return 'no-mail';                                        // "null MX": the domain says it takes no mail
  } catch (err) {
    if (!DOMAIN_GONE.has(err.code)) return 'unknown';
  }
  try {
    const a = await dns.resolve(domain);                    // no MX, but an address can still take mail
    return a.length ? 'ok' : 'no-mail';
  } catch (err) {
    return DOMAIN_GONE.has(err.code) ? 'no-mail' : 'unknown';
  }
}

let resolver = null;                                          // tests set their own
const setResolver = (fn) => { resolver = fn; dnsHealthy = { ok: null, at: 0 }; };

// Some networks answer "no such domain" for everything (a broken DNS or a filtering proxy). Before
// refusing an address we check that a domain known to take mail looks fine; if it doesn't, DNS can't be
// trusted right now and the address is let through. The answer is remembered for 10 minutes.
let dnsHealthy = { ok: null, at: 0 };
async function dnsWorks(check) {
  if (dnsHealthy.ok !== null && Date.now() - dnsHealthy.at < 10 * 60 * 1000) return dnsHealthy.ok;
  dnsHealthy = { ok: (await check('gmail.com')) === 'ok', at: Date.now() };
  return dnsHealthy.ok;
}

// -> null when fine, or a message for the user
async function checkEmailDomain(email) {
  const domain = String(email).split('@')[1] || '';
  if (!/^[a-z0-9-]+(\.[a-z0-9-]+)+$/i.test(domain)) return 'Enter a valid e-mail address';
  if (!resolver && process.env.EMAIL_DOMAIN_CHECK === 'off') return null;
  const check = resolver || lookup;
  if ((await check(domain)) !== 'no-mail') return null;
  if (!(await dnsWorks(check))) return null;
  return `"${domain}" can't receive e-mail. Check the address for typos.`;
}

module.exports = { checkEmailDomain, setResolver };
