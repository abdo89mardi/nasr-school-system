/* Nasr School Management System — application controller
 *
 * Dependency-free and declarative: the markup in index.html declares what it
 * needs, this file computes state and applies it.
 *
 *   data-action="name"        click -> ACTIONS[name]
 *   data-if="flag"            element is shown only when flags()[flag] is true
 *   data-i18n="key"           element's text = dictionary[key]
 *   data-i18n-<attr>="key"    element's <attr> = dictionary[key]
 *   data-dyn="name"           element's text = derived()[name]
 *   data-nav="a,b"            sidebar item, active when state.section is a or b
 *   data-lang / data-campus / data-role / data-screen
 *                             segmented / picker buttons, active when the
 *                             matching state field equals the attribute value
 *
 * When rebuilding in React/Vue/etc., keep the STATE shape and the flag names —
 * they are the contract the screens were designed against.
 */

(function () {
  'use strict';

  /* ---- State ------------------------------------------------------------ */

  var state = {
    screen: 'visitor',   // visitor | login | admin | staff | parent
    section: 'overview', // active sidebar section within a dashboard
    lang: 'ar',          // ar | en
    campus: 'girls',     // girls | boys — staff dashboard scope
    role: 'admin',       // login role picker selection
    loading: false,      // skeleton state on the admin student table
    empty: false,        // empty state on the admin student table
    modal: false,        // "Add student" modal
    teacherModal: false, // "Add teacher" modal
    notifOpen: false,    // notification popover
    drawerOpen: false,   // mobile navigation drawer (≤900px only)
    profile: null,       // signed-in account: { id, full_name, role, campus }
    authState: 'pending',// pending | in | out — see the route guard
    wanted: 'visitor',   // the screen that was asked for, before the guard ran
    wantedSection: null  // and the section, held across the checking screen
  };

  /* Section keys per dashboard, in sidebar order. Routing in the real app can
   * be generated from this one list. */
  var SECTIONS = {
    admin:  ['overview', 'students', 'staff', 'classes', 'cal', 'reports', 'finance', 'log', 'settings'],
    staff:  ['overview', 'schedule', 'attendance', 'grades', 'myclasses', 'messages', 'parentq', 'tasks', 'chat'],
    parent: ['overview', 'pgrades', 'patt', 'pfees', 'pask', 'pcal', 'pcirc']
  };

  /* Page title / breadcrumb label per section, per dashboard. Every section a
   * sidebar can reach has an entry here, so a breadcrumb never renders blank.
   * The staff chat label depends on the campus the account belongs to, so it
   * is resolved as a function rather than a key. */
  var TITLE_KEY = {
    admin: {
      overview: 'mOverview', students: 'mStudents', staff: 'mStaffNav', classes: 'mClasses',
      cal: 'mCalendarNav', reports: 'mReports', finance: 'mFinance', log: 'mLogNav',
      settings: 'mSettings'
    },
    staff: {
      overview: 'mMySchedule', schedule: 'mMySchedule', attendance: 'mAttendance',
      grades: 'mGradesNav', myclasses: 'mMyClasses', messages: 'mMessages',
      parentq: 'mParentQ', tasks: 'mTasks',
      chat: function () { return state.campus === 'boys' ? 'chatBoysNav' : 'chatGirlsNav'; }
    },
    parent: {
      overview: 'pOverview', pgrades: 'pGradesNav', patt: 'pAttNav', pfees: 'pFeesNav',
      pask: 'pAskNav', pcal: 'pCalNav', pcirc: 'pCircNav'
    }
  };

  /* The landing page of each dashboard — where the logo and the first crumb go.
   * The staff dashboard has no separate landing screen: its overview *is* the
   * weekly schedule, so the crumb names the schedule rather than promising a
   * "نظرة عامة" page that does not exist. A crumb must name the page it opens. */
  var ROOT_KEY = { admin: 'mOverview', staff: 'mMySchedule', parent: 'pOverview' };

  /* Both staff keys mean the same destination, so neither raises a breadcrumb. */
  var ROOT_SECTIONS = { admin: ['overview'], staff: ['overview', 'schedule'], parent: ['overview'] };

  /* Sidebar groups, in sidebar order — the middle level of the breadcrumb.
   * This mirrors the group headings in index.html; a heading added there needs
   * an entry here, or its sections fall back to a two-level trail.
   *
   * `land` is the section the group opens on. A group that already contains the
   * dashboard's landing section adds nothing to the trail and is skipped, which
   * is why the admin "الإدارة" and parent "المدرسة" groups carry land: null. */
  var GROUPS = {
    admin: [
      { key: 'secAdmin', land: null, sections: ['overview', 'students', 'staff', 'classes', 'cal', 'reports', 'finance'] },
      { key: 'secSystem', land: 'log', sections: ['log', 'settings'] }
    ],
    staff: [
      { key: 'secDaily', land: null, sections: ['overview', 'schedule', 'attendance', 'grades', 'myclasses'] },
      { key: 'secComms', land: 'messages', sections: ['messages', 'parentq', 'tasks'] },
      { key: function () { return state.campus === 'boys' ? 'chatSecBoys' : 'chatSecGirls'; },
        land: 'chat', sections: ['chat'] }
    ],
    parent: [
      { key: 'secParentSchool', land: null,
        sections: ['overview', 'pgrades', 'patt', 'pfees', 'pask', 'pcal', 'pcirc'] }
    ]
  };

  function isDashboard(screen) {
    return Object.prototype.hasOwnProperty.call(SECTIONS, screen);
  }

  function atRoot() {
    var roots = ROOT_SECTIONS[state.screen];
    return !roots || roots.indexOf(state.section) !== -1;
  }

  /* The group the open section sits in, or null when the trail stays flat. */
  function activeGroup() {
    var groups = GROUPS[state.screen];
    if (!groups || atRoot()) return null;
    for (var i = 0; i < groups.length; i++) {
      if (groups[i].sections.indexOf(state.section) !== -1) {
        return groups[i].land ? groups[i] : null;
      }
    }
    return null;
  }

  /* ---- Derived flags ----------------------------------------------------- */

  function flags() {
    var s = state.screen, sec = state.section;
    return {
      // screens
      isVisitor: s === 'visitor', isLogin: s === 'login',
      isChecking: s === 'checking',
      isAdmin: s === 'admin', isStaff: s === 'staff', isParent: s === 'parent',
      // admin sections
      aOverview: sec === 'overview', aStudents: sec === 'students', aStaffSec: sec === 'staff',
      aClasses: sec === 'classes', aCal: sec === 'cal', aReports: sec === 'reports',
      aFinance: sec === 'finance', aLog: sec === 'log', aSettings: sec === 'settings',
      // the activity log surfaces on the overview as a preview, the way the
      // parent calendar and circulars do — "full log" is what opens the page
      aLogOrOverview: sec === 'log' || sec === 'overview',
      // staff sections ("overview" falls back to the weekly schedule)
      sSchedule: sec === 'overview' || sec === 'schedule', sAtt: sec === 'attendance',
      sGrades: sec === 'grades', sClassesSec: sec === 'myclasses', sMsgs: sec === 'messages',
      sPQ: sec === 'parentq', sTasks: sec === 'tasks', sChat: sec === 'chat',
      // parent sections (calendar + circulars also surface on the overview)
      pOv: sec === 'overview', pGr: sec === 'pgrades', pAttSec: sec === 'patt',
      pFees: sec === 'pfees', pAsk: sec === 'pask',
      pCalOrOv: sec === 'overview' || sec === 'pcal',
      pCircOrOv: sec === 'overview' || sec === 'pcirc',
      // breadcrumbs — one flag per dashboard, true on every sub-page
      aNotOverview: s === 'admin' && !atRoot(),
      sNotOverview: s === 'staff' && !atRoot(),
      pNotOverview: s === 'parent' && !atRoot(),
      // the middle crumb only exists for sections that sit under a sidebar
      // group of their own (admin "النظام", staff "التواصل" and campus chat)
      crumbGroup: activeGroup() !== null,
      // campus scope
      isGirlsStaff: state.campus === 'girls', isBoysStaff: state.campus === 'boys',
      // data states
      loading: state.loading,
      empty: state.empty && !state.loading,
      showRows: !state.loading && !state.empty,
      showTrends: true,
      // overlays
      modal: state.modal, teacherModal: state.teacherModal, notifOpen: state.notifOpen
    };
  }

  /* Values rendered through data-dyn. */
  function derived(dict) {
    var map = TITLE_KEY[state.screen] || TITLE_KEY.admin;
    var key = map[state.section];
    if (typeof key === 'function') key = key();
    var group = activeGroup();
    var groupKey = group && (typeof group.key === 'function' ? group.key() : group.key);
    return {
      secTitle: dict[key] || dict[map.overview],
      crumbRoot: dict[ROOT_KEY[state.screen] || 'mOverview'],
      crumbGroup: groupKey ? dict[groupKey] : ''
    };
  }

  /* ---- Actions ----------------------------------------------------------- */

  /* ---- Route guard --------------------------------------------------------

   * The three dashboards require a real Supabase session. The public page and
   * the login screen never do.
   *
   * The difficulty is timing: the session is only known once supabase-js has
   * loaded and getSession() has resolved, which is well after the first paint.
   * A guard that assumes "signed out" until then bounces a signed-in person to
   * the login screen and back on every reload; one that assumes "signed in"
   * shows the dashboard shell to a stranger for a few hundred milliseconds.
   *
   * So authentication has three states, not two, and `pending` renders a
   * neutral checking screen. Nobody sees a dashboard before we know.
   *
   * `state.wanted` keeps the screen that was actually asked for, so once the
   * answer arrives the person continues where they were headed.
   * -------------------------------------------------------------------- */

  /* The single place that decides which screen may be shown. */
  function allowedScreen(requested) {
    if (!isDashboard(requested)) return requested;   // visitor + login: always open
    if (state.authState === 'pending') return 'checking';
    if (state.authState !== 'in') return 'login';

    // Signed in: the dashboard must match the role the server gave us, so a
    // teacher typing #/admin lands on their own dashboard instead.
    var role = state.profile && state.profile.role;
    if (!role) return 'login';                       // session without a profile row
    return role === requested ? requested : role;
  }

  /* Re-applies the guard to whatever was last requested. Called when the auth
   * state changes, which is the moment a held-back route can be released. */
  function applyGuard() {
    var next = allowedScreen(state.wanted || state.screen);
    if (next === state.screen) return false;
    state.screen = next;
    if (!isDashboard(next)) {
      state.section = 'overview';
      return true;
    }
    // Releasing a held dashboard restores the section that was deep-linked, so
    // a reload on #/admin/finance comes back to finance and not to the top.
    var valid = SECTIONS[next];
    state.section = (state.wantedSection && valid.indexOf(state.wantedSection) !== -1)
      ? state.wantedSection
      : 'overview';
    state.wantedSection = null;
    return true;
  }

  function goScreen(next) {
    return function () {
      state.wanted = next;
      state.screen = allowedScreen(next);
      state.section = 'overview';
      state.modal = false;
      state.teacherModal = false;
      state.loading = false;
      state.empty = false;
      state.notifOpen = false;
      state.drawerOpen = false;
      render();
    };
  }

  /* Section navigations are tagged with the section they land on, so the
   * sidebar can derive its own active item from the action name — a nav button
   * cannot fall out of sync with where it actually goes. */
  function goSection(key) {
    var fn = function () {
      state.section = key;
      state.notifOpen = false;
      state.drawerOpen = false; // picking a destination always closes the drawer
      render();
    };
    fn.section = key;
    return fn;
  }

  function set(patch) {
    return function () {
      for (var k in patch) state[k] = patch[k];
      render();
    };
  }

  var ACTIONS = {
    noop: function () {},

    // language
    setAr: set({ lang: 'ar' }),
    setEn: set({ lang: 'en' }),

    // screen routing
    goVisitor: goScreen('visitor'), goLogin: goScreen('login'),

    /* Ends the Supabase session before returning to the login screen, so the
     * next visitor cannot resume the previous one from the stored token. */
    logout: function () {
      state.profile = null;
      state.authState = 'out';
      state.wanted = 'login';
      if (window.NasrAuth) window.NasrAuth.signOut();
      goScreen('login')();
    },
    goAdmin: goScreen('admin'), goStaff: goScreen('staff'), goParent: goScreen('parent'),

    // login
    pickAdmin: set({ role: 'admin' }), pickStaff: set({ role: 'staff' }), pickParent: set({ role: 'parent' }),
    /* Real authentication against Supabase. The role picker above the form is
     * only a hint about which dashboard the person expects; the dashboard they
     * actually get comes from their `profiles` row, which the server owns. */
    submitLogin: function () {
      var emailEl = document.getElementById('loginEmail');
      var passEl = document.getElementById('loginPassword');
      var email = emailEl ? emailEl.value.trim() : '';
      var password = passEl ? passEl.value : '';

      if (!email || !password) {
        showLoginError(dict().authMissing);
        return;
      }
      if (!window.NasrAuth) {
        // Not a connection problem — the data layer itself never loaded. Saying
        // "check your connection" here sends people to debug the wrong thing.
        showLoginError(dict().authNoLib);
        return;
      }

      showLoginError('');
      state.loading = true;
      render();

      window.NasrAuth.signIn(email, password).then(function (res) {
        state.loading = false;
        if (res.error) {
          render();
          showLoginError(authMessage(res.error));
          return;
        }
        applyProfile(res.data.profile);
        state.authState = res.data.profile ? 'in' : 'out';
        if (passEl) passEl.value = '';
        if (state.authState !== 'in') {
          render();
          showLoginError(dict().authNoProfile);
          return;
        }
        goScreen(state.profile.role)();
        loadScreenData();
      });
    },

    // shared: back to the top of whichever dashboard is open (breadcrumb root)
    goOverview: goSection('overview'),

    /* Middle crumb: opens the landing section of the group the current page
     * belongs to. Never fires when it would land on the page you are already
     * reading — render() disables it there. */
    goGroup: function () {
      var group = activeGroup();
      if (group && group.land) goSection(group.land)();
    },

    // "عرض كل التنبيهات" — the notification centre is the full alert list;
    // this design has no separate alerts page to route to.
    openNotif: set({ notifOpen: true }),

    // admin sections
    goStudents: goSection('students'),
    goStaffSec: goSection('staff'), goClasses: goSection('classes'), goCal: goSection('cal'),
    goReports: goSection('reports'), goFinance: goSection('finance'), goLog: goSection('log'),
    goSettings: goSection('settings'),

    // staff sections
    goSchedule: goSection('schedule'), goAtt: goSection('attendance'), goGrades: goSection('grades'),
    goMyClasses: goSection('myclasses'), goMsgs: goSection('messages'), goPQ: goSection('parentq'),
    goTasks: goSection('tasks'), goChat: goSection('chat'),

    // parent sections
    goPOv: goSection('overview'), goPGr: goSection('pgrades'), goPAtt: goSection('patt'),
    goPFees: goSection('pfees'), goPAsk: goSection('pask'), goPCal: goSection('pcal'),
    goPCirc: goSection('pcirc'),

    // campus scope (staff dashboard)
    setBoysStaff: set({ campus: 'boys' }), setGirlsStaff: set({ campus: 'girls' }),

    // overlays
    openModal: set({ modal: true }), closeModal: set({ modal: false }),
    openTeacherModal: set({ teacherModal: true }), closeTeacherModal: set({ teacherModal: false }),

    /* ---- Writes ----------------------------------------------------------
     * The modal stays open until the row is actually in the database, so a
     * failure never looks like a save. On success the list reloads from the
     * server rather than from what was just typed — what you see afterwards is
     * what was really stored.
     * ------------------------------------------------------------------- */

    saveStudent: function () {
      var v = fields({
        full_name: 'stName', campus: 'stCampus', grade: 'stGrade',
        gName: 'stGuardian', gPhone: 'stGuardPhone', gEmail: 'stGuardEmail'
      });
      if (!v.full_name) return flash('saveStudentBtn', dict().mfName);
      var campus = campusValue(v.campus);
      if (!campus) return flash('saveStudentBtn', dict().mfCampus);
      if (!api()) return flash('saveStudentBtn', dict().dbMissing);

      busy('saveStudentBtn', true);
      // A guardian named in the form is created first, so the student can be
      // linked to a real row instead of a loose name.
      guardianFor(v).then(function (guardianId) {
        return window.NasrApi.addStudent({
          full_name: v.full_name,
          grade: v.grade || '',
          campus: campus,
          guardian_id: guardianId
        });
      }).then(function (res) {
        busy('saveStudentBtn', false);
        if (res.error) return flash('saveStudentBtn', res.hint || dict().saveFailed);
        clearFields(['stName', 'stGuardian', 'stGuardPhone', 'stGuardEmail']);
        state.modal = false;
        render();
        loadScreenData();
      });
    },

    saveTeacher: function () {
      var v = fields({ full_name: 'tcName', subject: 'tcSubject', phone: 'tcPhone', email: 'tcEmail' });
      var picked = document.querySelector('input[name="mtCampus"]:checked');
      var campus = picked ? picked.value : 'boys';
      if (!v.full_name) return flash('saveTeacherBtn', dict().mtName);
      if (!api()) return flash('saveTeacherBtn', dict().dbMissing);

      busy('saveTeacherBtn', true);
      window.NasrApi.addStaff({
        full_name: v.full_name,
        subject: v.subject || null,
        campus: campus,
        // The design has no employee-number field; one is minted so the
        // column's uniqueness still means something.
        employee_no: 'EMP-' + Date.now().toString(36).toUpperCase()
      }).then(function (res) {
        busy('saveTeacherBtn', false);
        if (res.error) return flash('saveTeacherBtn', res.hint || dict().saveFailed);
        clearFields(['tcName', 'tcPhone', 'tcEmail']);
        state.teacherModal = false;
        render();
        loadScreenData();
      });
    },
    toggleNotif: function () { state.notifOpen = !state.notifOpen; render(); },

    // mobile drawer
    toggleDrawer: function () { state.drawerOpen = !state.drawerOpen; state.notifOpen = false; render(); },
    closeDrawer: set({ drawerOpen: false }),

    // data-state demos on the admin student table
    toggleLoading: function () { state.loading = !state.loading; state.empty = false; render(); },
    toggleEmpty: function () { state.empty = !state.empty; state.loading = false; render(); }
  };

  /* ---- Account and live data ---------------------------------------------

   * The screens were designed against static content. Wiring them to Supabase
   * keeps that content as the resting state and overlays real rows on top: if
   * the schema has not been applied, or a table is empty, the design still
   * renders exactly as before. Nothing here can leave a screen blank.
   * ---------------------------------------------------------------------- */

  function dict() {
    return window.NasrI18n[state.lang];
  }

  function showLoginError(msg) {
    var el = document.getElementById('loginError');
    if (!el) return;
    el.textContent = msg || '';
    el.hidden = !msg;
  }

  /* Supabase reports auth failures in English; the app speaks the user's
   * language, so the few cases a person can actually act on are translated. */
  function authMessage(err) {
    var d = dict();
    var raw = String((err && err.message) || '');
    if (/Invalid login/i.test(raw)) return d.authBadCreds;
    if (/Email not confirmed/i.test(raw)) return d.authUnconfirmed;
    if (/rate limit|too many/i.test(raw)) return d.authRateLimit;
    if (/fetch|network/i.test(raw)) return d.authOffline;
    return raw || d.authFailed;
  }

  /* The signed-in account decides the dashboard and the campus scope. */
  function applyProfile(profile) {
    state.profile = profile || null;
    if (!profile) return;
    if (profile.role) state.role = profile.role;
    if (profile.campus) state.campus = profile.campus;
  }

  /* ---- Form helpers ------------------------------------------------------ */

  function api() {
    return window.NasrApi && window.NasrDbReady;
  }

  function fields(map) {
    var out = {};
    for (var key in map) {
      var el = document.getElementById(map[key]);
      out[key] = el ? String(el.value || '').trim() : '';
    }
    return out;
  }

  function clearFields(ids) {
    ids.forEach(function (id) {
      var el = document.getElementById(id);
      if (el) el.value = '';
    });
  }

  /* The campus <select> carries translated labels, not values, so the choice is
   * read by position: 0 is the "choose…" placeholder, 1 boys, 2 girls. */
  function campusValue(raw) {
    var el = document.getElementById('stCampus');
    if (!el) return null;
    return el.selectedIndex === 1 ? 'boys' : el.selectedIndex === 2 ? 'girls' : null;
  }

  function busy(btnId, on) {
    var el = document.getElementById(btnId);
    if (!el) return;
    el.disabled = on;
    el.style.opacity = on ? '.6' : '';
  }

  /* Says what went wrong next to the button that failed, and clears itself. */
  function flash(btnId, msg) {
    var btn = document.getElementById(btnId);
    if (!btn) return;
    var slot = btn.parentElement.querySelector('.form-flash');
    if (!slot) {
      slot = document.createElement('div');
      slot.className = 'form-flash';
      slot.setAttribute('role', 'alert');
      btn.parentElement.insertBefore(slot, btn);
    }
    slot.textContent = msg;
    clearTimeout(slot._t);
    slot._t = setTimeout(function () { slot.textContent = ''; }, 4000);
  }

  /* Reuses a guardian with the same name before creating another, so repeated
   * entries for siblings do not fan out into duplicate rows. */
  function guardianFor(v) {
    if (!v.gName) return Promise.resolve(null);
    return window.NasrApi.listGuardians().then(function (res) {
      var found = (res.data || []).filter(function (g) { return g.full_name === v.gName; })[0];
      if (found) return found.id;
      return window.NasrApi.addGuardian({
        full_name: v.gName,
        phone: v.gPhone || null,
        email: v.gEmail || null
      }).then(function (r) { return r.data ? r.data.id : null; });
    });
  }

  /* Resolves one data-live name against whatever has been fetched so far.
   * null means 'nothing loaded yet' — the design's own value stays. */
  function liveValue(name) {
    if (!live.stats && !live.students.length && !live.staff.length) return null;
    switch (name) {
      case 'studentCount': return live.stats ? String(live.stats.students) : null;
      case 'staffCount':   return live.stats ? String(live.stats.staff) : null;
      case 'overdueCount': return live.stats ? String(live.stats.overdue) : null;
      default: return null;
    }
  }

  /* Rows fetched for the current screen. Read by render() through data-live. */
  var live = { students: [], staff: [], stats: null };

  function loadScreenData() {
    if (!window.NasrApi || !window.NasrDbReady) return;
    var screen = state.screen;
    if (!isDashboard(screen)) return;

    window.NasrApi.stats().then(function (res) {
      if (res.data) { live.stats = res.data; render(); }
    });
    window.NasrApi.listStudents().then(function (res) {
      if (res.data) { live.students = res.data; render(); }
    });
    window.NasrApi.listStaff().then(function (res) {
      if (res.data) { live.staff = res.data; render(); }
    });
  }

  /* ---- URL and history ---------------------------------------------------

   * Two different "back" gestures, and they answer two different questions:
   *
   *   Breadcrumb  — "what is the parent of this page?"  Walks the hierarchy
   *                 above, so it always lands on the same place regardless of
   *                 how you arrived.
   *   Browser back — "where was I before?"  Walks visit order, which is what
   *                 the button means everywhere else on the web.
   *
   * Before this, the app pushed nothing, so browser back left the app entirely
   * from any sub-page. Every screen and section is now an addressable entry:
   * #/admin/students, #/staff/attendance, #/parent/pfees.
   * ---------------------------------------------------------------------- */

  var SCREEN_KEYS = ['visitor', 'login', 'admin', 'staff', 'parent'];

  /* While true, render() leaves the URL alone — set when the state change came
   * *from* the URL, so restoring a history entry cannot push a new one. */
  var replaying = false;

  function pathOf() {
    if (!isDashboard(state.screen)) {
      return state.screen === 'visitor' ? '#/' : '#/' + state.screen;
    }
    return '#/' + state.screen + (atRoot() ? '' : '/' + state.section);
  }

  /* null for anything this app has no screen for — a hand-edited or stale URL
   * then falls through to the saved session instead of a blank dashboard. */
  function parsePath(hash) {
    var parts = String(hash || '').replace(/^#\/?/, '').split('/').filter(Boolean);
    var screen = parts[0] || 'visitor';
    if (SCREEN_KEYS.indexOf(screen) === -1) return null;
    var section = 'overview';
    if (isDashboard(screen) && parts[1] && SECTIONS[screen].indexOf(parts[1]) !== -1) {
      section = parts[1];
    }
    return { screen: screen, section: section };
  }

  function historyState() {
    return { screen: state.screen, section: state.section };
  }

  function syncUrl() {
    if (replaying) return;
    var next = pathOf();
    if (location.hash === next) return;
    // The first paint replaces the entry the page loaded with, so the opening
    // page is addressable without adding a step to go back through.
    history.pushState(historyState(), '', next);
  }

  function applyPath(route) {
    state.wanted = route.screen;
    state.wantedSection = route.section;
    state.screen = allowedScreen(route.screen);
    state.section = isDashboard(state.screen) ? route.section : 'overview';
    state.modal = false;
    state.teacherModal = false;
    state.notifOpen = false;
    state.drawerOpen = false;
    replaying = true;
    render();
    replaying = false;
  }

  window.addEventListener('popstate', function () {
    /* A back press with an overlay open closes the overlay and stays on the
     * page — the same thing Escape does, and what the gesture means on mobile.
     * The popped entry is pushed straight back so the position is kept. */
    if (state.modal || state.teacherModal || state.notifOpen || state.drawerOpen) {
      state.modal = state.teacherModal = state.notifOpen = state.drawerOpen = false;
      replaying = true;
      render();
      replaying = false;
      history.pushState(historyState(), '', pathOf());
      return;
    }
    var route = parsePath(location.hash);
    if (route) applyPath(route);
  });

  /* ---- Render ------------------------------------------------------------ */

  /* Bindings are collected once — the DOM is static, only its state changes. */
  var B = null;

  /* Every data-if condition a nav item sits under, from the item outwards.
   * An item is only the active one if all of them currently hold — which
   * scopes it to its own dashboard (three sidebars share the section key
   * "overview") and to its own campus (the girls and boys staff chats share
   * the key "chat", and only one of the two is ever on screen). */
  function condsOf(el) {
    var out = [];
    for (var n = el; n && n.getAttribute; n = n.parentElement) {
      var flag = n.getAttribute('data-if');
      if (flag) out.push(flag);
    }
    return out;
  }

  /* The sections a nav item stands for. data-nav is the explicit form; when it
   * is absent the item's own action supplies the answer, so adding a sidebar
   * entry needs nothing beyond data-action. */
  function sectionsOf(el) {
    var nav = el.getAttribute('data-nav');
    if (nav) return nav.split(',').map(function (s) { return s.trim(); });
    var fn = ACTIONS[el.getAttribute('data-action')];
    return fn && fn.section ? [fn.section] : [];
  }

  function collect() {
    var attrBound = [];
    document.querySelectorAll('[data-i18n-placeholder],[data-i18n-title],[data-i18n-aria-label],[data-i18n-value],[data-i18n-alt]')
      .forEach(function (el) {
        var pairs = [];
        for (var i = 0; i < el.attributes.length; i++) {
          var a = el.attributes[i];
          if (a.name.indexOf('data-i18n-') === 0) pairs.push([a.name.slice(10), a.value]);
        }
        attrBound.push([el, pairs]);
      });

    /* Every sidebar button is a nav item, whether or not the markup spelled out
     * data-nav — that is what makes the active state automatic. */
    var navEls = [].slice.call(document.querySelectorAll('.nav-item,[data-nav]'));

    return {
      ifs: [].slice.call(document.querySelectorAll('[data-if]')),
      text: [].slice.call(document.querySelectorAll('[data-i18n]')),
      dyn: [].slice.call(document.querySelectorAll('[data-dyn]')),
      /* "عرض الكل" links, hidden once you are already reading the page they
       * point at — a link to here is not a destination. */
      hideOn: [].slice.call(document.querySelectorAll('[data-hide-on]'))
        .map(function (el) { return [el, el.getAttribute('data-hide-on').split(',')]; }),
      crumbGroups: [].slice.call(document.querySelectorAll('.crumb-group')),
      live: [].slice.call(document.querySelectorAll('[data-live]'))
        .map(function (el) { return [el, el.getAttribute('data-live')]; }),
      nav: navEls.map(function (el) { return [el, condsOf(el), sectionsOf(el)]; }),
      drawers: [].slice.call(document.querySelectorAll('[data-open]')),
      attrs: attrBound,
      pickers: [['data-lang', 'lang'], ['data-campus', 'campus'], ['data-role', 'role'], ['data-screen', 'screen']]
        .map(function (p) { return [[].slice.call(document.querySelectorAll('[' + p[0] + ']')), p[0], p[1]]; })
    };
  }

  function render() {
    if (!B) B = collect();
    var dict = window.NasrI18n[state.lang];
    var f = flags();
    var d = derived(dict);

    // Direction and language flip the entire layout, not just the copy.
    document.documentElement.lang = state.lang;
    document.documentElement.dir = state.lang === 'en' ? 'ltr' : 'rtl';

    // Visibility
    B.ifs.forEach(function (el) { el.hidden = !f[el.getAttribute('data-if')]; });

    // Copy
    B.text.forEach(function (el) {
      var v = dict[el.getAttribute('data-i18n')];
      if (v !== undefined) el.textContent = v;
    });

    B.attrs.forEach(function (entry) {
      entry[1].forEach(function (p) {
        var v = dict[p[1]];
        if (v !== undefined) entry[0].setAttribute(p[0], v);
      });
    });

    B.dyn.forEach(function (el) {
      var v = d[el.getAttribute('data-dyn')];
      if (v !== undefined) el.textContent = v;
    });

    /* Active sidebar item: the one that is actually on screen and whose
     * sections include the open section. aria-current carries the same fact to
     * assistive technology that the amber edge carries visually. */
    B.nav.forEach(function (entry) {
      var el = entry[0], conds = entry[1], sections = entry[2];
      var on = sections.indexOf(state.section) !== -1 &&
               conds.every(function (flag) { return f[flag]; });
      el.classList.toggle('is-active', on);
      if (on) el.setAttribute('aria-current', 'page');
      else el.removeAttribute('aria-current');
    });

    // Drawer + scrim (the CSS only reacts to this below 900px)
    B.drawers.forEach(function (el) {
      el.setAttribute('data-open', state.drawerOpen ? 'true' : 'false');
    });

    B.pickers.forEach(function (p) {
      p[0].forEach(function (el) {
        el.classList.toggle('is-active', el.getAttribute(p[1]) === state[p[2]]);
      });
    });

    B.hideOn.forEach(function (entry) {
      entry[0].hidden = entry[1].indexOf(state.section) !== -1;
    });

    /* Live figures replace the design's placeholders only once real numbers
     * have arrived. Before that the element keeps the value it shipped with,
     * so the screen is never briefly blank or zeroed. */
    B.live.forEach(function (entry) {
      var v = liveValue(entry[1]);
      if (v !== null && v !== undefined) entry[0].textContent = v;
    });

    /* The group crumb is a category, not a page of its own. It stays plain
     * text whenever its landing section is the one already open. */
    var group = activeGroup();
    B.crumbGroups.forEach(function (el) {
      el.disabled = !group || group.land === state.section;
    });

    syncUrl();
    if (window.NasrStore) window.NasrStore.save(state);
  }

  /* ---- Restore ----------------------------------------------------------- */

  /* Language and campus always come from the saved session; the page you land
   * on comes from the URL when there is one, so a shared or bookmarked link
   * opens what it names rather than wherever the last visit ended. */
  function restore() {
    var saved = window.NasrStore ? window.NasrStore.load() : {};
    if (saved.lang) state.lang = saved.lang;
    if (saved.campus) state.campus = saved.campus;
    if (saved.role) state.role = saved.role;

    var route = parsePath(location.hash);
    if (route && location.hash) {
      state.wanted = route.screen;
      state.wantedSection = route.section;
    } else {
      if (saved.screen) state.wanted = saved.screen;
      var valid = SECTIONS[state.wanted];
      state.wantedSection = (valid && saved.section && valid.indexOf(saved.section) !== -1)
        ? saved.section
        : 'overview';
    }
    state.section = state.wantedSection || 'overview';

    // Nothing is shown until the guard has had its say. On a dashboard URL this
    // means the checking screen, never the dashboard itself.
    state.screen = allowedScreen(state.wanted);
    if (!isDashboard(state.screen)) state.section = 'overview';

    // The opening page replaces the entry the document loaded with, so the
    // first back press leaves the app instead of stepping through a duplicate.
    history.replaceState(historyState(), '', pathOf());
  }

  /* ---- Wiring ------------------------------------------------------------ */

  document.addEventListener('click', function (e) {
    var el = e.target.closest('[data-action]');
    if (!el) return;
    var fn = ACTIONS[el.getAttribute('data-action')];
    if (!fn) return;
    if (el.tagName === 'A') e.preventDefault();
    fn();
  });

  // Escape closes whichever overlay is open.
  document.addEventListener('keydown', function (e) {
    if (e.key !== 'Escape') return;
    if (state.modal || state.teacherModal || state.notifOpen || state.drawerOpen) {
      state.modal = state.teacherModal = state.notifOpen = state.drawerOpen = false;
      render();
    }
  });

  window.NasrApp = {
    state: state, sections: SECTIONS, render: render, actions: ACTIONS,
    isDashboard: isDashboard
  };

  restore();
  render();

  /* The data layer arrives after this file (it is a module). When it does, an
   * existing Supabase session is restored so a reload keeps you signed in, and
   * the dashboards fill with real rows. Until then — and if the schema has not
   * been applied at all — the screens keep the design's own content, so the app
   * is never broken by a database that is not ready. */
  /* Turns `pending` into a real answer and releases whatever route was held.
   * Called exactly once, from whichever of the two paths below wins. */
  var settled = false;
  function settleAuth(profile) {
    if (settled) return;
    settled = true;
    applyProfile(profile);
    state.authState = profile && profile.role ? 'in' : 'out';
    applyGuard();
    render();
    syncUrl();
    loadScreenData();
  }

  window.addEventListener('nasr:ready', function (e) {
    // Without the library there is no way to verify a session, and an
    // unverifiable visitor is treated as signed out. Guessing the other way
    // would hand the dashboards to anyone whose CDN request happened to fail.
    if (!e.detail.lib) {
      settleAuth(null);
      showLoginError(dict().authNoLib);
      return;
    }
    if (!e.detail.db) {
      console.info('[nasr] الجداول غير مطبَّقة — لا يمكن قراءة الأدوار.');
      settleAuth(null);
      return;
    }
    window.NasrAuth.profile().then(function (res) {
      settleAuth(res.data);
    });
  });

  /* If the data layer never reports at all — a blocked CDN, a script that 404s —
   * the checking screen must not become a dead end. */
  setTimeout(function () {
    if (!settled) {
      console.warn('[nasr] لم تصل حالة الجلسة في الوقت المتوقّع — تُعامَل كغير مسجّل.');
      settleAuth(null);
    }
  }, 8000);
})();
