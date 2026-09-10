/* Nasr School Management System — session persistence
 *
 * The prototype keeps its whole UI state in memory (js/app.js → state). This
 * file is the only place that touches localStorage, so swapping the backing
 * store later means editing this file and nothing else.
 *
 * Only the fields that should survive a reload are persisted: the chosen
 * language, which dashboard you were on, which section inside it, and the
 * staff campus scope. Transient state — modals, the notification popover, the
 * mobile drawer, the loading/empty demos — is deliberately not persisted.
 *
 *   NasrStore.load()        -> {} or the saved patch
 *   NasrStore.save(state)   -> persists the whitelisted fields
 *   NasrStore.clear()       -> forgets the session
 */

(function () {
  'use strict';

  var KEY = 'nasr-school:session:v1';

  /* Persisted fields, each with the values it is allowed to hold. Anything
   * outside these sets is dropped, so a stale or hand-edited entry can never
   * put the app into a state the markup has no screen for. */
  var ALLOWED = {
    lang: ['ar', 'en'],
    screen: ['visitor', 'login', 'admin', 'staff', 'parent'],
    campus: ['girls', 'boys'],
    role: ['admin', 'staff', 'parent'],
    section: null // validated against SECTIONS by app.js, which owns that list
  };

  function available() {
    try {
      window.localStorage.setItem(KEY + ':probe', '1');
      window.localStorage.removeItem(KEY + ':probe');
      return true;
    } catch (e) {
      // Private mode, blocked site data, or a sandboxed frame. The app still
      // works — it just starts fresh every time.
      return false;
    }
  }

  var ok = available();

  function load() {
    if (!ok) return {};
    var raw;
    try {
      raw = window.localStorage.getItem(KEY);
    } catch (e) {
      return {};
    }
    if (!raw) return {};

    var parsed;
    try {
      parsed = JSON.parse(raw);
    } catch (e) {
      return {};
    }
    if (!parsed || typeof parsed !== 'object') return {};

    var out = {};
    Object.keys(ALLOWED).forEach(function (k) {
      var v = parsed[k];
      if (typeof v !== 'string') return;
      var set = ALLOWED[k];
      if (set && set.indexOf(v) === -1) return;
      out[k] = v;
    });
    return out;
  }

  function save(state) {
    if (!ok || !state) return;
    var patch = {};
    Object.keys(ALLOWED).forEach(function (k) {
      if (typeof state[k] === 'string') patch[k] = state[k];
    });
    try {
      window.localStorage.setItem(KEY, JSON.stringify(patch));
    } catch (e) {
      // Quota or a mid-session permission change — the session simply stops
      // being remembered.
      ok = false;
    }
  }

  function clear() {
    if (!ok) return;
    try {
      window.localStorage.removeItem(KEY);
    } catch (e) { /* nothing to recover from */ }
  }

  window.NasrStore = { load: load, save: save, clear: clear, available: ok };
})();
