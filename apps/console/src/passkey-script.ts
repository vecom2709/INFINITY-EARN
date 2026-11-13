/**
 * Browser-Skript für Passkeys (WebAuthn) – ausgeliefert unter /assets/passkey.js, nur auf den beiden Seiten
 * „Zweiter Schritt“ (Anmeldung) und „Sicherheit“ (Admin) eingebunden. Keine Fremdbibliothek, keine Netzwerkziele
 * außer der eigenen Seite (CSP connect-src 'self').
 */
export const PASSKEY_JS = `(() => {
  const b2a = (b) => btoa(String.fromCharCode(...new Uint8Array(b))).replace(/\\+/g, '-').replace(/\\//g, '_').replace(/=+$/, '');
  const a2b = (s) => { s = s.replace(/-/g, '+').replace(/_/g, '/'); while (s.length % 4) s += '='; return Uint8Array.from(atob(s), (c) => c.charCodeAt(0)); };
  const msg = (t, err) => { const el = document.getElementById('pk-msg'); if (el) { el.textContent = t; el.className = err ? 'err' : 'ok'; } };
  const post = (url, body, csrf) => fetch(url, { method: 'POST', credentials: 'same-origin', headers: Object.assign({ 'content-type': 'application/json' }, csrf ? { 'x-csrf-token': csrf } : {}), body: JSON.stringify(body || {}) });
  const supported = () => { if (window.PublicKeyCredential) return true; msg('Dieser Browser unterstützt keine Passkeys. Bitte Edge, Chrome, Safari oder Firefox in aktueller Version verwenden.', true); return false; };
  const reg = document.getElementById('pk-register');
  if (reg) reg.addEventListener('click', async () => {
    if (!supported()) return;
    const csrf = reg.dataset.csrf;
    try {
      const o = await (await post('/admin/mfa/passkey/optionen', {}, csrf)).json();
      o.challenge = a2b(o.challenge); o.user.id = a2b(o.user.id);
      o.excludeCredentials = o.excludeCredentials.map((c) => Object.assign({}, c, { id: a2b(c.id) }));
      const cred = await navigator.credentials.create({ publicKey: o });
      const labelEl = document.getElementById('pk-label');
      const r = await (await post('/admin/mfa/passkey/registrieren', { id: cred.id, label: labelEl ? labelEl.value : '', response: { clientDataJSON: b2a(cred.response.clientDataJSON), attestationObject: b2a(cred.response.attestationObject) } }, csrf)).json();
      if (!r.ok) { msg('Speichern fehlgeschlagen (' + (r.reason || 'unbekannt') + ').', true); return; }
      if (r.recoveryCodes) {
        const box = document.getElementById('pk-codes');
        const list = box.querySelector('ol');
        r.recoveryCodes.forEach((c) => { const li = document.createElement('li'); li.textContent = c; list.appendChild(li); });
        box.hidden = false;
        msg('Passkey gespeichert – der zweite Faktor ist aktiv. Bitte die Wiederherstellungscodes jetzt sichern, sie werden nur einmal angezeigt.');
      } else { msg('Passkey gespeichert.'); setTimeout(() => location.reload(), 1200); }
    } catch (e) { msg('Abgebrochen oder nicht möglich (' + ((e && e.name) || 'Fehler') + ').', true); }
  });
  const login = document.getElementById('pk-login');
  if (login) login.addEventListener('click', async () => {
    if (!supported()) return;
    try {
      const res = await post('/auth/mfa/optionen', {});
      if (!res.ok) { msg('Bestätigung abgelaufen – bitte erneut mit Passwort anmelden.', true); return; }
      const o = await res.json();
      o.challenge = a2b(o.challenge);
      o.allowCredentials = o.allowCredentials.map((c) => Object.assign({}, c, { id: a2b(c.id) }));
      const a = await navigator.credentials.get({ publicKey: o });
      const r = await post('/auth/mfa/passkey', { id: a.id, response: { clientDataJSON: b2a(a.response.clientDataJSON), authenticatorData: b2a(a.response.authenticatorData), signature: b2a(a.response.signature) } });
      if (r.ok) { location.href = '/dashboard'; return; }
      const j = await r.json().catch(() => ({}));
      msg(j.error === 'LOCKED' || j.error === 'EXPIRED' ? 'Bitte erneut mit Passwort anmelden.' : 'Passkey nicht akzeptiert.', true);
    } catch (e) { msg('Abgebrochen oder nicht möglich (' + ((e && e.name) || 'Fehler') + ').', true); }
  });
})();
`;

/** CSP für Seiten mit Passkey-Skript: nur eigenes Skript, nur eigene Verbindungen. */
export const PASSKEY_CSP = "default-src 'none'; script-src 'self'; connect-src 'self'; style-src 'unsafe-inline'; img-src 'self'; form-action 'self'; frame-ancestors 'none'; base-uri 'none'";
