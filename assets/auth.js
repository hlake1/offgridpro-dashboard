/*!
 * OffGrid Pro Dashboard — Auth gate
 * Simple client-side password protection using sessionStorage.
 *  - "OffGrid" → client role (default view)
 *  - "Tweak"   → admin role (unlocks Monthly Report builder)
 *
 * NOTE: This is a friction gate for a prototype, not real security.
 * Any real access control must be enforced server-side.
 */
(function () {
  const STORAGE_KEY = 'ogp_dashboard_auth';
  const PASSWORDS = {
    OffGrid: 'client',
    Tweak: 'admin',
  };

  function getRole() {
    try {
      const raw = sessionStorage.getItem(STORAGE_KEY);
      if (!raw) return null;
      const { role, ts } = JSON.parse(raw);
      // sessions last as long as the tab
      if (role && (role === 'client' || role === 'admin')) return role;
      return null;
    } catch { return null; }
  }

  function setRole(role) {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify({ role, ts: Date.now() }));
  }

  function clearRole() {
    sessionStorage.removeItem(STORAGE_KEY);
  }

  function isAdmin() { return getRole() === 'admin'; }
  function isClient() { return getRole() === 'client'; }
  function isAuthed() { return isAdmin() || isClient(); }

  function paintLock() {
    // Hide document until unlocked, to avoid a flash of protected content
    const style = document.createElement('style');
    style.setAttribute('data-ogp-lock', '1');
    style.textContent = 'html.ogp-locked body > *:not(#ogp-lock-overlay){ display:none !important; }';
    document.head.appendChild(style);
    document.documentElement.classList.add('ogp-locked');
  }

  function unpaintLock() {
    document.documentElement.classList.remove('ogp-locked');
    const s = document.querySelector('style[data-ogp-lock="1"]');
    if (s) s.remove();
  }

  function renderOverlay(onSuccess) {
    if (document.getElementById('ogp-lock-overlay')) return;
    const overlay = document.createElement('div');
    overlay.id = 'ogp-lock-overlay';
    overlay.innerHTML = `
      <style>
        #ogp-lock-overlay {
          position: fixed; inset: 0; z-index: 99999;
          background:
            linear-gradient(rgba(0,0,0,0.75) 0%, rgba(10,10,10,0.85) 100%),
            linear-gradient(135deg, #1e293b 0%, #0f172a 100%);
          display: flex; align-items: center; justify-content: center;
          font-family: 'Montserrat', -apple-system, Helvetica, Arial, sans-serif;
          color: #fff;
          padding: 1.25rem;
        }
        #ogp-lock-overlay .card {
          width: 100%; max-width: 420px;
          background: #ffffff; color: #1a1a1a;
          border-radius: 6px; padding: 2.25rem 2rem 2rem;
          box-shadow: 0 30px 60px rgba(0,0,0,0.45);
        }
        #ogp-lock-overlay .brand-row { display:flex; align-items:baseline; gap:0.35rem; }
        #ogp-lock-overlay .brand { font-weight:800; letter-spacing:-0.01em; }
        #ogp-lock-overlay .bar {
          height:4px; margin-top:6px;
          background: linear-gradient(90deg,#a3c94a 0%,#4bc7bf 50%,#5aa5d8 100%);
          border-radius:2px;
        }
        #ogp-lock-overlay h2 { margin: 1.25rem 0 0.4rem; font-weight:500; font-size:1.5rem; color:#1a1a1a; }
        #ogp-lock-overlay p.sub { color:#666; font-size:0.9rem; line-height:1.5; }
        #ogp-lock-overlay label { display:block; font-size:11px; text-transform:uppercase; letter-spacing:0.15em; color:#666; margin: 1.4rem 0 0.5rem; font-weight:600; }
        #ogp-lock-overlay input[type="password"] {
          width:100%; padding: 0.75rem 0.9rem; font-size:1rem;
          border:1px solid #e5e7eb; border-radius:4px; background:#f8faf5;
          font-family: inherit; outline:none; transition:border 0.15s ease;
        }
        #ogp-lock-overlay input[type="password"]:focus { border-color:#4bc7bf; background:#fff; }
        #ogp-lock-overlay .row { margin-top: 1rem; display:flex; align-items:center; justify-content:space-between; gap:0.75rem; }
        #ogp-lock-overlay .err { color:#dc2626; font-size:0.85rem; min-height:1.2em; }
        #ogp-lock-overlay button {
          background:#1a1a1a; color:#fff; border:0; cursor:pointer;
          padding: 0.65rem 1.4rem; font-weight:500; letter-spacing:0.02em;
          font-family: inherit; border-radius:2px;
          transition: background 0.15s ease;
        }
        #ogp-lock-overlay button:hover { background:#333; }
        #ogp-lock-overlay .foot { margin-top:1.6rem; font-size:0.72rem; color:#9ca3af; text-align:center; letter-spacing:0.05em; }
      </style>
      <form class="card" autocomplete="off">
        <div class="brand-row">
          <span class="brand">OFFGRID</span><span class="brand">PRO</span>
        </div>
        <div class="bar"></div>
        <h2>Dashboard access</h2>
        <p class="sub">Enter the access code to view performance reports.</p>
        <label for="ogp-pw">Access code</label>
        <input id="ogp-pw" type="password" autofocus autocomplete="off" spellcheck="false" />
        <div class="row">
          <div class="err" id="ogp-err"></div>
          <button type="submit">Unlock →</button>
        </div>
        <div class="foot">Tweak Marketing · Client Reporting</div>
      </form>
    `;
    document.body.appendChild(overlay);

    const form = overlay.querySelector('form');
    const input = overlay.querySelector('#ogp-pw');
    const err = overlay.querySelector('#ogp-err');
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const val = input.value.trim();
      const role = PASSWORDS[val];
      if (!role) {
        err.textContent = 'Incorrect code. Try again.';
        input.select();
        return;
      }
      setRole(role);
      overlay.remove();
      unpaintLock();
      if (typeof onSuccess === 'function') onSuccess(role);
      // Notify listeners so pages can react (e.g. reveal admin panels)
      document.dispatchEvent(new CustomEvent('ogp:auth', { detail: { role } }));
    });
  }

  function ensureAuth(opts) {
    opts = opts || {};
    if (isAuthed()) {
      // Fire event on next tick so listeners attached after script run still get it
      queueMicrotask(() => document.dispatchEvent(new CustomEvent('ogp:auth', { detail: { role: getRole() } })));
      return;
    }
    // Paint lock synchronously to prevent flash
    paintLock();
    if (document.body) {
      renderOverlay(opts.onSuccess);
    } else {
      document.addEventListener('DOMContentLoaded', () => renderOverlay(opts.onSuccess), { once: true });
    }
  }

  function requireAdmin(redirectTo) {
    if (isAdmin()) return true;
    // Send them home to authenticate
    const target = redirectTo || '../';
    location.replace(target);
    return false;
  }

  function logout(redirectTo) {
    clearRole();
    if (redirectTo) location.href = redirectTo;
    else location.reload();
  }

  // Expose API
  window.OGPAuth = {
    ensureAuth,
    requireAdmin,
    getRole,
    isAdmin,
    isClient,
    isAuthed,
    logout,
  };
})();
