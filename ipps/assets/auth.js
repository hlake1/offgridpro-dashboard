/*!
 * Innovative Paint Protection Dashboard — Auth gate
 * Simple client-side password protection using sessionStorage.
 *  - "Ipps" → client role (default view)
 *  - "Tweak"           → admin role (unlocks Monthly Report builder etc.)
 *
 * NOTE: Friction gate for a prototype, not real security.
 * Any real access control must be enforced server-side.
 */
(function () {
  const STORAGE_KEY = 'ipps_dashboard_auth';
  const PASSWORDS = {
    Ipps: 'client',
    Tweak: 'admin',
  };

  function getRole() {
    try {
      const raw = sessionStorage.getItem(STORAGE_KEY);
      if (raw) {
        const { role } = JSON.parse(raw);
        if (role === 'client' || role === 'admin') return role;
      }
    } catch { /* fall through */ }

    // Honour Tweak Reporting portal session (from root landing page)
    try {
      const rawTw = sessionStorage.getItem('tw_session');
      if (rawTw) {
        const s = JSON.parse(rawTw);
        if (s && s.type === 'client') { setRole('client'); return 'client'; }
        if (s && (s.type === 'team' || s.type === 'admin')) { setRole('admin'); return 'admin'; }
      }
    } catch { /* ignore */ }

    return null;
  }

  function setRole(role) {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify({ role, ts: Date.now() }));
  }

  function clearRole() {
    sessionStorage.removeItem(STORAGE_KEY);
  }

  function paintOverlay(onSubmit) {
    const overlay = document.createElement('div');
    overlay.id = 'ipps-auth-overlay';
    overlay.style.cssText = `
      position:fixed;inset:0;background:#f7f8fa;z-index:99999;
      display:flex;align-items:center;justify-content:center;font-family:'Montserrat',Helvetica,Arial,sans-serif;
    `;
    overlay.innerHTML = `
      <form id="ipps-auth-form" style="max-width:380px;width:calc(100% - 3rem);background:#fff;padding:2rem 2.25rem;border:1px solid #e5e7eb;border-radius:6px;box-shadow:0 12px 30px rgba(0,0,0,0.06);">
        <div style="font-size:11px;letter-spacing:0.2em;color:#6b7280;text-transform:uppercase;font-weight:600;">Tweak Reporting</div>
        <div style="height:4px;background:linear-gradient(90deg,#0b2545 0%,#13315c 60%,#4f80b8 100%);border-radius:2px;margin:0.75rem 0 1.25rem;"></div>
        <h1 style="font-size:1.5rem;font-weight:500;color:#111;margin:0 0 0.5rem;">Innovative Paint Protection · Performance Reports</h1>
        <p style="font-size:0.875rem;color:#6b7280;margin:0 0 1.25rem;line-height:1.5;">Enter your access code to continue.</p>
        <input id="ipps-auth-input" type="password" autofocus placeholder="Access code"
          style="width:100%;padding:0.7rem 0.85rem;border:1px solid #d1d5db;border-radius:4px;font-size:0.95rem;font-family:inherit;letter-spacing:0.05em;" />
        <p id="ipps-auth-err" style="color:#dc2626;font-size:0.8rem;margin:0.55rem 0 0;min-height:1em;"></p>
        <button type="submit" style="margin-top:0.9rem;width:100%;background:#060f1d;color:#fff;padding:0.7rem;border:none;border-radius:4px;font-size:0.9rem;font-weight:500;letter-spacing:0.05em;cursor:pointer;">
          Continue
        </button>
      </form>
    `;
    document.body.appendChild(overlay);
    const form = overlay.querySelector('#ipps-auth-form');
    const input = overlay.querySelector('#ipps-auth-input');
    const err = overlay.querySelector('#ipps-auth-err');
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const val = input.value.trim();
      const role = PASSWORDS[val];
      if (!role) { err.textContent = 'Incorrect code. Try again.'; input.select(); return; }
      setRole(role);
      overlay.remove();
      onSubmit(role);
    });
  }

  function isAdmin() { return getRole() === 'admin'; }
  function isClient() { return getRole() === 'client'; }
  function isAuthed() { return isAdmin() || isClient(); }

  function emitAuth(role) {
    document.dispatchEvent(new CustomEvent('ipps:auth', { detail: { role } }));
    if (typeof window.IPPSAuthReady === 'function') window.IPPSAuthReady(role);
  }

  function ensureAuth(opts) {
    opts = opts || {};
    const role = getRole();
    if (role) {
      document.documentElement.classList.toggle('ipps-admin', role === 'admin');
      queueMicrotask(() => emitAuth(role));
      if (typeof opts.onSuccess === 'function') opts.onSuccess(role);
      return role;
    }
    const guard = document.createElement('div');
    guard.id = 'ipps-auth-guard';
    guard.style.cssText = 'position:fixed;inset:0;background:#f7f8fa;z-index:99998;';
    document.documentElement.appendChild(guard);
    document.addEventListener('DOMContentLoaded', () => {
      paintOverlay((role) => {
        document.documentElement.classList.toggle('ipps-admin', role === 'admin');
        guard.remove();
        emitAuth(role);
        if (typeof opts.onSuccess === 'function') opts.onSuccess(role);
      });
    });
    return null;
  }

  function requireAdmin(redirectTo) {
    if (isAdmin()) return true;
    const target = redirectTo || '../';
    if (isClient()) { location.replace(target); return false; }
    return false;
  }

  window.IPPSAuth = {
    ensureAuth,
    getRole,
    setRole,
    clearRole,
    isAdmin,
    isClient,
    isAuthed,
    requireAdmin,
    logout(redirectTo) {
      clearRole();
      try { sessionStorage.removeItem('tw_session'); } catch {}
      window.location.href = redirectTo || '../';
    },
  };
})();
