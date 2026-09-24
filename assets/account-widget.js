/*!
 * Tweak Reporting — Account widget
 * Small floating "Account" link shown on any page once a real
 * username/password session (tw_session) exists, so a signed-in
 * team member or client can change their password at any time.
 *
 * Include with: <script src="../assets/account-widget.js" data-setup="../account-setup.html"></script>
 * (data-setup is the relative path to account-setup.html from the including page; defaults to "./account-setup.html")
 */
(function () {
  function getSession() {
    try {
      const raw = sessionStorage.getItem('tw_session');
      return raw ? JSON.parse(raw) : null;
    } catch { return null; }
  }

  function init() {
    const session = getSession();
    if (!session || !session.token) return;
    if (document.getElementById('tw-account-widget')) return;

    const scriptEl = document.currentScript || (function () {
      const scripts = document.getElementsByTagName('script');
      return scripts[scripts.length - 1];
    })();
    const setupPath = (scriptEl && scriptEl.getAttribute('data-setup')) || './account-setup.html';

    const style = document.createElement('style');
    style.textContent = `
      #tw-account-widget {
        position: fixed; right: 1rem; bottom: 1rem; z-index: 9999;
        font-family: 'Montserrat', -apple-system, Helvetica, Arial, sans-serif;
      }
      #tw-account-widget a {
        display: inline-flex; align-items: center; gap: 0.4rem;
        background: #0f172a; color: #fff; text-decoration: none;
        padding: 0.55rem 1rem; border-radius: 999px; font-size: 0.78rem;
        font-weight: 500; letter-spacing: 0.03em;
        box-shadow: 0 8px 20px rgba(0,0,0,0.25);
        transition: background 0.15s ease, transform 0.1s ease;
      }
      #tw-account-widget a:hover { background: #1e293b; transform: translateY(-1px); }
    `;
    document.head.appendChild(style);

    const widget = document.createElement('div');
    widget.id = 'tw-account-widget';
    widget.innerHTML = `<a href="${setupPath}">Account${session.name ? ' · ' + session.name : ''}</a>`;
    document.body.appendChild(widget);
  }

  if (document.body) init();
  else document.addEventListener('DOMContentLoaded', init, { once: true });
})();
