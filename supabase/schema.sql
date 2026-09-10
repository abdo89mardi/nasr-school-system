-- ===========================================================================
-- مجمع مدارس النصر — مخطط قاعدة البيانات
-- Nasr School Complex — database schema
--
-- شغّل هذا الملف مرة واحدة في: Supabase Dashboard → SQL Editor → Run
-- الملف idempotent: إعادة تشغيله آمنة ولا تُكرّر شيئاً.
--
-- الجداول: profiles, guardians, staff, students, attendance, grades
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- 1. الأنواع المشتركة
--    القسم (بنين/بنات) هو محور الفصل في المجمع كله، لذلك هو نوع لا نص حر.
-- ---------------------------------------------------------------------------
do $$ begin
  create type public.campus_t as enum ('boys', 'girls');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.role_t as enum ('admin', 'staff', 'parent');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.attendance_t as enum ('present', 'absent', 'late');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.fee_t as enum ('paid', 'due', 'overdue');
exception when duplicate_object then null; end $$;

-- ---------------------------------------------------------------------------
-- 2. profiles — يربط حساب الدخول بدوره وقسمه
--    كل صف هنا يقابل مستخدماً في auth.users. الدور مصدره هذا الجدول وحده،
--    فلا يستطيع المستخدم ترقية نفسه من المتصفح.
-- ---------------------------------------------------------------------------
create table if not exists public.profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  full_name   text not null,
  role        public.role_t not null,
  campus      public.campus_t,               -- للمعلمين فقط؛ null للإدارة وأولياء الأمور
  created_at  timestamptz not null default now()
);

comment on table public.profiles is 'دور وقسم كل حساب دخول';

-- ---------------------------------------------------------------------------
-- 3. guardians — أولياء الأمور
--    user_id اختياري: وليّ الأمر قد يُسجَّل في النظام قبل أن يُنشأ له حساب دخول.
-- ---------------------------------------------------------------------------
create table if not exists public.guardians (
  id          uuid primary key default gen_random_uuid(),
  full_name   text not null,
  phone       text,
  email       text,
  user_id     uuid unique references auth.users(id) on delete set null,
  created_at  timestamptz not null default now()
);

create index if not exists guardians_user_id_idx on public.guardians(user_id);

-- ---------------------------------------------------------------------------
-- 4. staff — المعلمون والموظفون
-- ---------------------------------------------------------------------------
create table if not exists public.staff (
  id           uuid primary key default gen_random_uuid(),
  full_name    text not null,
  subject      text,
  campus       public.campus_t not null,
  employee_no  text not null unique,
  user_id      uuid unique references auth.users(id) on delete set null,
  created_at   timestamptz not null default now()
);

create index if not exists staff_campus_idx  on public.staff(campus);
create index if not exists staff_user_id_idx on public.staff(user_id);

-- ---------------------------------------------------------------------------
-- 5. students — الطلاب
-- ---------------------------------------------------------------------------
create table if not exists public.students (
  id           uuid primary key default gen_random_uuid(),
  student_no   text unique,
  full_name    text not null,
  grade        text not null,                -- الصف، مثل: الرابع (أ)
  campus       public.campus_t not null,
  guardian_id  uuid references public.guardians(id) on delete set null,
  fee_status   public.fee_t not null default 'due',
  created_at   timestamptz not null default now()
);

create index if not exists students_campus_idx   on public.students(campus);
create index if not exists students_guardian_idx on public.students(guardian_id);

-- ---------------------------------------------------------------------------
-- 6. attendance — الحضور
--    قيد الفرادة يمنع تسجيل الطالب مرتين في اليوم نفسه، ويجعل إعادة الرصد
--    عملية upsert بدل صفوف مكرّرة.
-- ---------------------------------------------------------------------------
create table if not exists public.attendance (
  id           uuid primary key default gen_random_uuid(),
  student_id   uuid not null references public.students(id) on delete cascade,
  date         date not null default current_date,
  status       public.attendance_t not null,
  recorded_by  uuid references auth.users(id) on delete set null,
  created_at   timestamptz not null default now(),
  unique (student_id, date)
);

create index if not exists attendance_date_idx    on public.attendance(date);
create index if not exists attendance_student_idx on public.attendance(student_id);

-- ---------------------------------------------------------------------------
-- 7. grades — الدرجات
-- ---------------------------------------------------------------------------
create table if not exists public.grades (
  id           uuid primary key default gen_random_uuid(),
  student_id   uuid not null references public.students(id) on delete cascade,
  subject      text not null,
  score        numeric(5,2) check (score >= 0 and score <= 100),
  term         text not null,                -- مثل: الفصل الأول 1448
  recorded_by  uuid references auth.users(id) on delete set null,
  created_at   timestamptz not null default now(),
  unique (student_id, subject, term)
);

create index if not exists grades_student_idx on public.grades(student_id);

-- ===========================================================================
-- سياسات الأمان (Row Level Security)
--
-- المفتاح المنشور (publishable) الذي يستخدمه المتصفح لا يتجاوز هذه السياسات،
-- لذلك هي — لا الواجهة — ما يمنع وليّ أمر من قراءة درجات طالب آخر.
-- ===========================================================================

-- دوال مساعدة SECURITY DEFINER.
-- ضرورية: سياسة على profiles تستعلم من profiles تُسبّب تكراراً لا نهائياً،
-- وهذه الدوال تقرأ الجدول خارج نطاق RLS فتكسر الحلقة.
create or replace function public.current_role()
returns public.role_t
language sql stable security definer set search_path = public
as $$ select role from public.profiles where id = auth.uid() $$;

create or replace function public.current_campus()
returns public.campus_t
language sql stable security definer set search_path = public
as $$ select campus from public.profiles where id = auth.uid() $$;

create or replace function public.is_admin()
returns boolean
language sql stable security definer set search_path = public
as $$ select exists (select 1 from public.profiles where id = auth.uid() and role = 'admin') $$;

-- معرّفات أبناء وليّ الأمر الحالي
create or replace function public.my_student_ids()
returns setof uuid
language sql stable security definer set search_path = public
as $$
  select s.id
  from public.students s
  join public.guardians g on g.id = s.guardian_id
  where g.user_id = auth.uid()
$$;

alter table public.profiles   enable row level security;
alter table public.guardians  enable row level security;
alter table public.staff      enable row level security;
alter table public.students   enable row level security;
alter table public.attendance enable row level security;
alter table public.grades     enable row level security;

-- ---- profiles ----
drop policy if exists profiles_read_own on public.profiles;
create policy profiles_read_own on public.profiles
  for select using (id = auth.uid() or public.is_admin());

drop policy if exists profiles_admin_write on public.profiles;
create policy profiles_admin_write on public.profiles
  for all using (public.is_admin()) with check (public.is_admin());

-- ---- guardians ----
drop policy if exists guardians_read on public.guardians;
create policy guardians_read on public.guardians
  for select using (
    public.is_admin()
    or user_id = auth.uid()
    or public.current_role() = 'staff'
  );

drop policy if exists guardians_admin_write on public.guardians;
create policy guardians_admin_write on public.guardians
  for all using (public.is_admin()) with check (public.is_admin());

-- ---- staff ----
-- كل من في النظام يرى قائمة المعلمين؛ الإدارة وحدها تعدّلها.
drop policy if exists staff_read on public.staff;
create policy staff_read on public.staff
  for select using (auth.uid() is not null);

drop policy if exists staff_admin_write on public.staff;
create policy staff_admin_write on public.staff
  for all using (public.is_admin()) with check (public.is_admin());

-- ---- students ----
-- الإدارة ترى الجميع، المعلم يرى قسمه وحده، وليّ الأمر يرى أبناءه وحدهم.
drop policy if exists students_read on public.students;
create policy students_read on public.students
  for select using (
    public.is_admin()
    or (public.current_role() = 'staff'  and campus = public.current_campus())
    or (public.current_role() = 'parent' and id in (select public.my_student_ids()))
  );

drop policy if exists students_admin_write on public.students;
create policy students_admin_write on public.students
  for all using (public.is_admin()) with check (public.is_admin());

-- ---- attendance ----
drop policy if exists attendance_read on public.attendance;
create policy attendance_read on public.attendance
  for select using (
    public.is_admin()
    or student_id in (select id from public.students where campus = public.current_campus())
    or student_id in (select public.my_student_ids())
  );

-- المعلم يرصد الحضور لقسمه؛ الإدارة بلا قيد.
drop policy if exists attendance_write on public.attendance;
create policy attendance_write on public.attendance
  for all using (
    public.is_admin()
    or (public.current_role() = 'staff'
        and student_id in (select id from public.students where campus = public.current_campus()))
  ) with check (
    public.is_admin()
    or (public.current_role() = 'staff'
        and student_id in (select id from public.students where campus = public.current_campus()))
  );

-- ---- grades ----
drop policy if exists grades_read on public.grades;
create policy grades_read on public.grades
  for select using (
    public.is_admin()
    or student_id in (select id from public.students where campus = public.current_campus())
    or student_id in (select public.my_student_ids())
  );

drop policy if exists grades_write on public.grades;
create policy grades_write on public.grades
  for all using (
    public.is_admin()
    or (public.current_role() = 'staff'
        and student_id in (select id from public.students where campus = public.current_campus()))
  ) with check (
    public.is_admin()
    or (public.current_role() = 'staff'
        and student_id in (select id from public.students where campus = public.current_campus()))
  );

-- ===========================================================================
-- ربط الحساب الجديد بملفه تلقائياً
-- الدور والاسم يصلان في raw_user_meta_data وقت التسجيل.
-- ===========================================================================
create or replace function public.handle_new_user()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  insert into public.profiles (id, full_name, role, campus)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'full_name', split_part(new.email, '@', 1)),
    coalesce((new.raw_user_meta_data ->> 'role')::public.role_t, 'parent'),
    (new.raw_user_meta_data ->> 'campus')::public.campus_t
  )
  on conflict (id) do nothing;
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
