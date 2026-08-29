-- USERS
create table users (
  id uuid primary key,
  full_name text,
  email text,
  created_at timestamp default now()
);

-- JOBS
create table jobs (
  id uuid primary key,
  title text,
  company text,
  location text,
  salary text,
  description text,
  apply_url text,
  created_at timestamp default now()
);

-- APPLICATIONS
create table applications (
  id uuid primary key,
  user_id uuid,
  job_id uuid,
  status text,
  created_at timestamp default now()
);

-- RESUME VERSIONS
create table resume_versions (
  id uuid primary key,
  user_id uuid,
  job_id uuid,
  pdf_url text,
  created_at timestamp default now()
);
