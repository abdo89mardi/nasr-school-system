/* Nasr School Management System — connection settings
 *
 * The publishable key is meant to be public: it is what the browser ships with
 * every request, and it grants nothing on its own. What a request may read or
 * write is decided by the Row Level Security policies in supabase/schema.sql,
 * enforced by the database itself.
 *
 * A secret key (sb_secret_…) must never appear in this file, or anywhere else
 * the browser can reach — it bypasses every policy.
 */

window.NasrConfig = {
  supabaseUrl: 'https://qrprmpxhipdyykzrbqtk.supabase.co',
  supabaseKey: 'sb_publishable_l2lMSVcmtp3iKW_hem5l9Q_q64PRqFm'
};
