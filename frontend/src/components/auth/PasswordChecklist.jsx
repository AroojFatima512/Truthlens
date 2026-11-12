import React from 'react';
import { Check, X } from 'lucide-react';
import { PASSWORD_RULES, passwordStrength } from '../../utils/validation';

// Live password rules + strength bar, shown under every "new password" field. The same rules are
// enforced by the server. `confirm` (optional) adds a "both passwords match" line.
const LEVELS = [
  null,
  { label: 'Weak', bar: 'bg-red-500', text: 'text-red-400' },
  { label: 'Fair', bar: 'bg-amber-400', text: 'text-amber-300' },
  { label: 'Good', bar: 'bg-emerald-500', text: 'text-emerald-400' },
  { label: 'Strong', bar: 'bg-emerald-400', text: 'text-emerald-300' },
];

export const passwordReady = (password, ctx = {}, confirm) => PASSWORD_RULES.every((r) => r.test(String(password || ''), ctx))
  && (confirm === undefined || (password.length > 0 && password === confirm));

const PasswordChecklist = ({ password = '', email, name, confirm, light = false }) => {
  const ctx = { email, name };
  const level = passwordStrength(password, ctx);
  const rules = PASSWORD_RULES.map((r) => ({ text: r.text, ok: r.test(password, ctx) }));
  if (confirm !== undefined) rules.push({ text: 'Both passwords match', ok: password.length > 0 && password === confirm });
  const muted = light ? 'text-gray-500' : 'text-gray-500';

  return (
    <div className="mt-2" aria-live="polite">
      <div className="flex items-center gap-2 mb-1.5">
        <div className="flex flex-1 gap-1">
          {[1, 2, 3, 4].map((n) => (
            <span key={n} className={`h-1 flex-1 rounded-full ${level >= n ? LEVELS[level].bar : light ? 'bg-gray-200' : 'bg-white/10'}`} />
          ))}
        </div>
        <span className={`text-[10px] font-semibold w-11 text-right ${level ? LEVELS[level].text : muted}`}>{level ? LEVELS[level].label : ''}</span>
      </div>
      <ul className="grid grid-cols-1 sm:grid-cols-2 gap-x-3 gap-y-0.5">
        {rules.map((r) => (
          <li key={r.text} className={`flex items-center gap-1.5 text-[10.5px] leading-4 ${r.ok ? 'text-emerald-400' : password ? 'text-red-400/90' : muted}`}>
            {r.ok ? <Check size={11} strokeWidth={3} className="shrink-0" /> : password ? <X size={11} strokeWidth={3} className="shrink-0" /> : <span className="w-[11px] h-[11px] shrink-0 rounded-full border border-current" />}
            {r.text}
          </li>
        ))}
      </ul>
    </div>
  );
};

export default PasswordChecklist;
