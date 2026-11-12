import React, { useEffect, useRef, useState } from 'react';
import { fetchAuthConfig } from '../../services/authService';

// Google's own "Continue with Google" button (Google Identity Services). Google checks who the person is
// and hands back a signed ID token, which our backend verifies (/api/auth/google).
// The client id comes from the backend (GOOGLE_CLIENT_ID in backend/.env), so nothing to set here.
const GSI_SRC = 'https://accounts.google.com/gsi/client';
let gsiPromise = null;
const loadGsi = () => {
  if (window.google?.accounts?.id) return Promise.resolve();
  gsiPromise = gsiPromise || new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = GSI_SRC; s.async = true; s.defer = true;
    s.onload = resolve; s.onerror = () => { gsiPromise = null; reject(new Error('Could not load Google sign-in')); };
    document.head.appendChild(s);
  });
  return gsiPromise;
};

const GoogleMark = () => (
  <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true">
    <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z" />
    <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
    <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z" />
    <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z" />
  </svg>
);

const GoogleButton = ({ onCredential, text = 'continue_with', disabled = false }) => {
  const box = useRef(null);
  const callback = useRef(onCredential);
  callback.current = onCredential;
  const [state, setState] = useState('loading');   // loading | ready | off | error

  useEffect(() => {
    let alive = true;
    (async () => {
      const { googleClientId } = await fetchAuthConfig();
      if (!alive) return;
      if (!googleClientId) { setState('off'); return; }
      try { await loadGsi(); } catch { if (alive) setState('error'); return; }
      if (!alive || !box.current) return;
      window.google.accounts.id.initialize({
        client_id: googleClientId,
        callback: (resp) => callback.current?.(resp.credential),
        ux_mode: 'popup',
        auto_select: false,
      });
      const width = Math.min(400, Math.max(200, Math.round(box.current.parentElement?.clientWidth || 320)));
      box.current.innerHTML = '';
      window.google.accounts.id.renderButton(box.current, { theme: 'filled_black', size: 'large', shape: 'pill', text, width, logo_alignment: 'center' });
      setState('ready');
    })();
    return () => { alive = false; };
  }, [text]);

  if (state === 'off' || state === 'error') {
    return (
      <button type="button" disabled
        title={state === 'off' ? 'Google sign-in is not set up yet: add GOOGLE_CLIENT_ID to backend/.env' : 'Google sign-in could not load (check the internet connection)'}
        className="w-full flex justify-center items-center gap-2 py-2 lg:py-2.5 px-4 rounded-full border border-[#2a2a2a] text-gray-500 text-[12px] lg:text-[13px] font-medium cursor-not-allowed">
        <GoogleMark /> {state === 'off' ? 'Google sign-in not set up' : 'Google sign-in unavailable'}
      </button>
    );
  }
  return (
    <div className={`w-full flex justify-center min-h-[40px] ${disabled ? 'pointer-events-none opacity-60' : ''}`}>
      <div ref={box} aria-label="Continue with Google" />
      {state === 'loading' && <div className="w-full h-10 rounded-full bg-white/5 animate-pulse" />}
    </div>
  );
};

export default GoogleButton;
