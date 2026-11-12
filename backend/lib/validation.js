// Rules for e-mail addresses, passwords and names, checked by the server whenever an account is created
// or a password is set (sign-up, reset, change). The React app shows the same rules live while typing
// (frontend/src/utils/validation.js); the server's check is the one that counts.

// ---------------------------------------------------------------- e-mail
// One part before "@" (letters, digits and . _ % + -, no dot at the start or end, no ".."), then a domain
// made of labels (letters, digits, -, not starting or ending with -) and a top-level part of 2+ letters.
const EMAIL_RE = /^(?!\.)(?!.*\.\.)[a-z0-9._%+-]+(?<!\.)@(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,24}$/;

// Throw-away inbox services: a sign-up with one of these can't be reached later.
const DISPOSABLE = new Set([
  'mailinator.com', 'guerrillamail.com', 'guerrillamail.net', 'sharklasers.com', '10minutemail.com', '10minutemail.net',
  'tempmail.com', 'temp-mail.org', 'temp-mail.io', 'tempmail.net', 'tempmailo.com', 'throwawaymail.com', 'yopmail.com',
  'yopmail.net', 'getnada.com', 'nada.email', 'dispostable.com', 'maildrop.cc', 'mailnesia.com', 'trashmail.com',
  'fakeinbox.com', 'mintemail.com', 'mohmal.com', 'emailondeck.com', 'mytemp.email', 'tempinbox.com', 'burnermail.io',
  'moakt.com', 'spamgourmet.com', 'mailcatch.com', 'inboxkitten.com', 'emailfake.com', 'tempr.email', 'discard.email',
]);

const normEmail = (email) => String(email || '').trim().toLowerCase();

// -> null when fine, or the problem as a sentence
function emailProblem(email) {
  const e = normEmail(email);
  if (!e) return 'Enter your e-mail address';
  if (e.length > 254) return 'That e-mail address is too long';
  const [local] = e.split('@');
  if (local && local.length > 64) return 'The part before "@" is too long';
  if (!EMAIL_RE.test(e)) return 'Enter a valid e-mail address, like name@gmail.com';
  return null;
}
const isDisposable = (email) => DISPOSABLE.has(normEmail(email).split('@')[1] || '');

// ---------------------------------------------------------------- password
// The 100 most common passwords that would otherwise pass the rules (or nearly), compared in lower case.
const COMMON = new Set([
  'password', 'password1', 'password12', 'password123', 'password1234', 'password!', 'password1!', 'password@123', 'p@ssw0rd', 'p@ssword1',
  'passw0rd', 'pass@123', 'pass@1234', 'admin@123', 'admin123', 'admin1234', 'administrator', 'welcome1', 'welcome@123', 'welcome123',
  'qwerty123', 'qwerty@123', 'qwerty1!', 'qwertyuiop', 'qwerty12345', 'abc@1234', 'abc12345', 'abcd@1234', 'abcd1234', 'aa123456',
  '12345678', '123456789', '1234567890', '12345678a', '1q2w3e4r', '1q2w3e4r5t', 'zaq12wsx', '1qaz2wsx', 'iloveyou1', 'iloveyou!',
  'letmein1', 'letmein!', 'monkey123', 'dragon123', 'football1', 'baseball1', 'sunshine1', 'princess1', 'superman1', 'batman123',
  'pakistan', 'pakistan1', 'pakistan123', 'pakistan@123', 'pakistan786', 'lahore123', 'karachi123', 'islamabad1', 'allah786', 'bismillah',
  'bismillah1', 'bismillah786', 'muhammad1', 'mohammad1', 'ali12345', 'khan1234', 'khan@123', 'test1234', 'test@123', 'test@1234',
  'changeme1', 'changeme!', 'default1', 'secret123', 'secret@123', 'truthlens', 'truthlens1', 'truthlens@123', 'truthlens123', 'summer2024',
  'summer2025', 'summer2026', 'winter2025', 'winter2026', 'spring2026', 'autumn2026', 'january2026', 'november2026', 'hello123', 'hello@123',
  'master123', 'shadow123', 'trustno1', 'whatever1', 'computer1', 'internet1', 'starwars1', 'pokemon1', 'cricket1', 'cricket123',
]);
const MIN = 8;
const MAX = 64;                    // bcrypt only uses the first 72 bytes; 64 characters keeps well within it

// Each rule: id, the sentence shown to people, and the test. `ctx` = { email, name }
const PASSWORD_RULES = [
  { id: 'length', text: `${MIN} to ${MAX} characters`, test: (p) => p.length >= MIN && p.length <= MAX },
  { id: 'lower', text: 'A lowercase letter (a-z)', test: (p) => /[a-z]/.test(p) },
  { id: 'upper', text: 'An uppercase letter (A-Z)', test: (p) => /[A-Z]/.test(p) },
  { id: 'number', text: 'A number (0-9)', test: (p) => /\d/.test(p) },
  { id: 'symbol', text: 'A symbol, like ! @ # $ % & *', test: (p) => /[^A-Za-z0-9\s]/.test(p) },
  { id: 'spaces', text: 'No spaces', test: (p) => p.length > 0 && !/\s/.test(p) },
  { id: 'repeat', text: 'No character 4 times in a row (aaaa)', test: (p) => p.length > 0 && !/(.)\1{3}/.test(p) },
  {
    id: 'personal', text: 'Does not contain your name or e-mail',
    test: (p, ctx = {}) => {
      if (!p) return false;
      const low = p.toLowerCase();
      const parts = [normEmail(ctx.email).split('@')[0], ...String(ctx.name || '').toLowerCase().split(/\s+/)]
        .map((x) => x.replace(/[^a-z0-9]/g, '')).filter((x) => x.length >= 3);
      return !parts.some((x) => low.includes(x));
    },
  },
  { id: 'common', text: 'Not a common password', test: (p) => p.length > 0 && !COMMON.has(p.toLowerCase()) },
];

// -> [] when the password is fine, else the sentences of the rules it breaks
const passwordProblems = (password, ctx = {}) => {
  const p = String(password ?? '');
  return PASSWORD_RULES.filter((r) => !r.test(p, ctx)).map((r) => r.text);
};
// -> null, or one message for the API answer
const passwordProblem = (password, ctx = {}) => {
  const broken = passwordProblems(password, ctx);
  return broken.length ? `Password needs: ${broken.join('; ')}.` : null;
};

// ---------------------------------------------------------------- name
const nameProblem = (name) => {
  const n = String(name || '').trim().replace(/\s+/g, ' ');
  if (n.length < 2) return 'Name must be at least 2 characters';
  if (n.length > 60) return 'Name must be 60 characters or fewer';
  if (!/^[\p{L}\p{M}][\p{L}\p{M} .'-]*$/u.test(n)) return "Name can only contain letters, spaces and . ' -";
  return null;
};
const cleanName = (name) => String(name || '').trim().replace(/\s+/g, ' ');

module.exports = { normEmail, emailProblem, isDisposable, passwordProblems, passwordProblem, PASSWORD_RULES, nameProblem, cleanName };
