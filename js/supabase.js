/* Nasr School Management System — Supabase client, data access and auth
 *
 * The project has no build step, so this is an ES module loaded straight from
 * a CDN. It publishes three globals for the classic scripts to use:
 *
 *   window.NasrDB    — the raw supabase-js client (escape hatch)
 *   window.NasrApi   — every read and write the screens need
 *   window.NasrAuth  — sign in, sign out, and who is signed in
 *
 * Because a module executes after the classic scripts, nothing here may be
 * assumed to exist at app.js's first render. app.js waits for the
 * 'nasr:ready' event on window instead.
 *
 * Every function returns { data, error } — never throws, never alerts. The
 * screens decide what to show; this layer only reports.
 */

import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.47.10/+esm';

const cfg = window.NasrConfig || {};

const db = createClient(cfg.supabaseUrl, cfg.supabaseKey, {
  auth: {
    persistSession: true,      // survives a reload, like the rest of the session
    autoRefreshToken: true,
    detectSessionInUrl: false  // no OAuth redirects in this app
  }
});

/* A missing table reaches us either as the Postgres code (42P01) or as
 * PostgREST's schema-cache miss (PGRST205). The schema is applied by hand once
 * (see supabase/schema.sql), so this is the one error worth naming plainly
 * rather than surfacing as a generic failure. */
const MISSING_TABLE = ['42P01', 'PGRST205'];

function wrap(label, promise) {
  return promise.then(function (res) {
    if (res.error) {
      const e = res.error;
      const hint = MISSING_TABLE.indexOf(e.code) !== -1
        ? 'الجداول غير موجودة — شغّل supabase/schema.sql في SQL Editor أولاً.'
        : null;
      console.warn('[nasr:' + label + ']', e.message || e);
      return { data: null, error: e, hint: hint };
    }
    return { data: res.data, error: null, hint: null };
  }, function (e) {
    console.warn('[nasr:' + label + '] network', e);
    return { data: null, error: e, hint: 'تعذّر الوصول إلى الخادم.' };
  });
}

/* ---- Auth ---------------------------------------------------------------
 * The role is never taken from the browser. It is read back from `profiles`,
 * which only an admin can write, so a user cannot promote themselves by
 * editing anything on this side.
 * ---------------------------------------------------------------------- */

const auth = {
  async signIn(email, password) {
    const res = await wrap('signIn', db.auth.signInWithPassword({ email, password }));
    if (res.error) return res;
    const profile = await auth.profile();
    return { data: { session: res.data.session, profile: profile.data }, error: null, hint: null };
  },

  async signUp(email, password, meta) {
    // full_name / role / campus travel in user metadata; the on_auth_user_created
    // trigger copies them into profiles.
    return wrap('signUp', db.auth.signUp({
      email: email,
      password: password,
      options: { data: meta || {} }
    }));
  },

  async signOut() {
    return wrap('signOut', db.auth.signOut());
  },

  async session() {
    const { data } = await db.auth.getSession();
    return data ? data.session : null;
  },

  /* The signed-in user's row in profiles, or null when signed out. */
  async profile() {
    const session = await auth.session();
    if (!session) return { data: null, error: null, hint: null };
    return wrap('profile', db
      .from('profiles')
      .select('id, full_name, role, campus')
      .eq('id', session.user.id)
      .maybeSingle());
  },

  onChange(fn) {
    db.auth.onAuthStateChange(function (_event, session) { fn(session); });
  }
};

/* ---- Data ---------------------------------------------------------------
 * Reads are scoped by the policies, not by these queries: an admin's
 * listStudents() returns every student, a teacher's returns their campus,
 * a guardian's returns their own children — same call, same code.
 * ---------------------------------------------------------------------- */

const api = {
  /* -- students -- */
  listStudents() {
    return wrap('listStudents', db
      .from('students')
      .select('id, student_no, full_name, grade, campus, fee_status, guardian_id, guardians(full_name, phone)')
      .order('created_at', { ascending: false }));
  },

  addStudent(row) {
    return wrap('addStudent', db.from('students').insert(row).select().single());
  },

  updateStudent(id, patch) {
    return wrap('updateStudent', db.from('students').update(patch).eq('id', id).select().single());
  },

  deleteStudent(id) {
    return wrap('deleteStudent', db.from('students').delete().eq('id', id));
  },

  /* -- staff -- */
  listStaff() {
    return wrap('listStaff', db
      .from('staff')
      .select('id, full_name, subject, campus, employee_no')
      .order('created_at', { ascending: false }));
  },

  addStaff(row) {
    return wrap('addStaff', db.from('staff').insert(row).select().single());
  },

  updateStaff(id, patch) {
    return wrap('updateStaff', db.from('staff').update(patch).eq('id', id).select().single());
  },

  deleteStaff(id) {
    return wrap('deleteStaff', db.from('staff').delete().eq('id', id));
  },

  /* -- guardians -- */
  listGuardians() {
    return wrap('listGuardians', db
      .from('guardians')
      .select('id, full_name, phone, email')
      .order('full_name'));
  },

  addGuardian(row) {
    return wrap('addGuardian', db.from('guardians').insert(row).select().single());
  },

  /* -- attendance -- */
  listAttendance(date) {
    let q = db.from('attendance').select('id, student_id, date, status, students(full_name, grade, campus)');
    if (date) q = q.eq('date', date);
    return wrap('listAttendance', q.order('date', { ascending: false }));
  },

  /* One row per student per day — re-marking a student overwrites rather than
   * stacking a second record (see the unique constraint in the schema). */
  markAttendance(studentId, status, date) {
    return wrap('markAttendance', db
      .from('attendance')
      .upsert({
        student_id: studentId,
        status: status,
        date: date || new Date().toISOString().slice(0, 10)
      }, { onConflict: 'student_id,date' })
      .select()
      .single());
  },

  /* -- grades -- */
  listGrades(studentId) {
    let q = db.from('grades').select('id, student_id, subject, score, term, students(full_name, grade)');
    if (studentId) q = q.eq('student_id', studentId);
    return wrap('listGrades', q.order('created_at', { ascending: false }));
  },

  saveGrade(studentId, subject, score, term) {
    return wrap('saveGrade', db
      .from('grades')
      .upsert({ student_id: studentId, subject: subject, score: score, term: term },
              { onConflict: 'student_id,subject,term' })
      .select()
      .single());
  },

  /* -- dashboard counters --
   * head:true asks PostgREST for the count alone, so the rows never travel. */
  async stats() {
    const [students, staff, overdue] = await Promise.all([
      db.from('students').select('id', { count: 'exact', head: true }),
      db.from('staff').select('id', { count: 'exact', head: true }),
      db.from('students').select('id', { count: 'exact', head: true }).eq('fee_status', 'overdue')
    ]);
    return {
      data: {
        students: students.count || 0,
        staff: staff.count || 0,
        overdue: overdue.count || 0
      },
      error: students.error || staff.error || overdue.error || null
    };
  },

  /* True once the schema has been applied — used to decide whether the app
   * shows live data or stays on the design's placeholder content.
   *
   * Deliberately NOT a head:true request: PostgREST answers HEAD against a
   * missing table with 204 and no body, so the error never arrives and every
   * database looks ready. A normal select reports the miss properly. */
  async ready() {
    const res = await db.from('students').select('id').limit(1);
    return !res.error;
  }
};

window.NasrDB = db;
window.NasrApi = api;
window.NasrAuth = auth;

api.ready().then(function (ok) {
  window.NasrDbReady = ok;
  if (!ok) {
    console.warn('[nasr] الجداول غير موجودة بعد — شغّل supabase/schema.sql في SQL Editor.');
  }
  window.dispatchEvent(new CustomEvent('nasr:ready', { detail: { db: ok } }));
});
