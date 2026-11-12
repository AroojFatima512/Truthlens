import React from 'react';
import { AlertCircle, Wand2 } from 'lucide-react';
import { emailProblem, suggestEmail } from '../../utils/validation';

// Under an e-mail field: what's wrong with the address (once the field has been left), and a
// one-click fix for common typos such as "gmial.com".
const EmailHint = ({ email, touched, onFix }) => {
  const problem = touched && email ? emailProblem(email) : null;
  const suggestion = email ? suggestEmail(email) : null;
  if (!problem && !suggestion) return null;
  return (
    <div className="mt-1.5 space-y-1" aria-live="polite">
      {problem && (
        <p className="flex items-center gap-1.5 text-[11px] text-red-400"><AlertCircle size={12} className="shrink-0" /> {problem}</p>
      )}
      {suggestion && (
        <p className="flex items-center gap-1.5 text-[11px] text-amber-300">
          <Wand2 size={12} className="shrink-0" /> Did you mean <span className="font-semibold">{suggestion}</span>?
          <button type="button" onClick={() => onFix?.(suggestion)} className="ml-1 underline hover:text-amber-200">Use it</button>
        </p>
      )}
    </div>
  );
};

export const emailOk = (email) => !emailProblem(email);
export default EmailHint;
