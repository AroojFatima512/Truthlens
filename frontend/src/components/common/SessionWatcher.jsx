import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Clock } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';

// UC-6 / UC-13: ends the session cleanly
//   - after inactivity: readers 30 minutes, admins 15 minutes, with a one-minute warning first
//     (activity in any TruthLens tab counts, so working in one tab keeps the others signed in)
//   - when the login token has expired (it lasts one day) or the server stops accepting it
// Afterwards the person lands on the right login page with a message saying why.
const IDLE_MINUTES = { reader: 30, admin: 15 };
const WARN_SECONDS = 60;
const KEY = 'truthlens_last_active';

const readLast = () => { try { return Number(localStorage.getItem(KEY)) || Date.now(); } catch { return Date.now(); } };
const writeLast = (t) => { try { localStorage.setItem(KEY, String(t)); } catch { /* storage unavailable */ } };
// the token's expiry time (ms), read from the JWT itself
const tokenExpiry = () => {
  try {
    const token = localStorage.getItem('truthlens_token');
    if (!token) return null;
    const payload = JSON.parse(atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
    return payload.exp ? payload.exp * 1000 : null;
  } catch { return null; }
};

const SessionWatcher = () => {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [secondsLeft, setSecondsLeft] = useState(null);     // warning dialog when not null
  const lastWrite = useRef(0);
  const role = user?.role === 'admin' ? 'admin' : 'reader';
  const limitMs = IDLE_MINUTES[role] * 60 * 1000;

  const end = useCallback((reason) => {
    const loginPath = role === 'admin' ? '/admin/login' : '/login';
    setSecondsLeft(null);
    logout(reason === 'idle'
      ? `You were logged out after ${IDLE_MINUTES[role]} minutes without activity.`
      : 'Your session has expired. Please log in again.');
    navigate(loginPath, { replace: true, state: { from: location.pathname } });
  }, [role, logout, navigate, location.pathname]);

  // record activity (at most every 5 seconds)
  useEffect(() => {
    if (!user) return undefined;
    writeLast(Date.now());
    const mark = () => {
      const now = Date.now();
      if (now - lastWrite.current > 5000) { lastWrite.current = now; writeLast(now); }
    };
    const events = ['mousemove', 'mousedown', 'keydown', 'scroll', 'touchstart', 'wheel'];
    events.forEach((e) => window.addEventListener(e, mark, { passive: true }));
    return () => events.forEach((e) => window.removeEventListener(e, mark));
  }, [user]);

  // check every second: expired token, idle warning, idle logout
  useEffect(() => {
    if (!user) { setSecondsLeft(null); return undefined; }
    const tick = () => {
      const exp = tokenExpiry();
      if (exp && Date.now() >= exp) { end('expired'); return; }
      const idleFor = Date.now() - readLast();
      if (idleFor >= limitMs) { end('idle'); return; }
      const left = Math.ceil((limitMs - idleFor) / 1000);
      setSecondsLeft(left <= WARN_SECONDS ? left : null);
    };
    tick();
    const timer = setInterval(tick, 1000);
    return () => clearInterval(timer);
  }, [user, limitMs, end]);

  // the server refused the token (api.js raises this event on a 401)
  useEffect(() => {
    const onExpired = () => { if (localStorage.getItem('truthlens_token')) end('expired'); };
    window.addEventListener('truthlens:session-expired', onExpired);
    return () => window.removeEventListener('truthlens:session-expired', onExpired);
  }, [end]);

  if (!user || secondsLeft == null) return null;
  const admin = role === 'admin';
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 p-4" role="alertdialog" aria-label="Still there?">
      <div className={`w-full max-w-sm rounded-2xl border p-6 text-center shadow-2xl ${admin ? 'bg-[#110505] border-red-900/40' : 'bg-[#0d1a33] border-blue-500/30'}`}>
        <div className={`mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full ${admin ? 'bg-red-500/10 text-red-400' : 'bg-blue-500/10 text-blue-300'}`}><Clock size={22} /></div>
        <h2 className="text-lg font-bold text-white mb-1">Still there?</h2>
        <p className="text-sm text-gray-300 mb-5">For your security you'll be logged out in <span className="font-bold text-white">{secondsLeft} s</span> because there has been no activity.</p>
        <div className="flex gap-2 justify-center">
          <button type="button" onClick={() => end('idle')} className="px-4 py-2 rounded-lg border border-white/15 text-sm text-gray-200 hover:bg-white/5">Log out now</button>
          <button type="button" onClick={() => { writeLast(Date.now()); setSecondsLeft(null); }}
            className={`px-4 py-2 rounded-lg text-sm font-semibold text-white ${admin ? 'bg-[#D32F2F] hover:bg-[#B71C1C]' : 'bg-blue-600 hover:bg-blue-500'}`}>Stay logged in</button>
        </div>
      </div>
    </div>
  );
};

export default SessionWatcher;
