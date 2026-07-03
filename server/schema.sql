create extension if not exists pgcrypto;

create table if not exists articles (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  title text not null,
  category text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists article_revisions (
  id uuid primary key default gen_random_uuid(),
  article_id uuid not null references articles(id) on delete cascade,
  note text not null default '',
  html text not null,
  created_at timestamptz not null default now()
);

create index if not exists article_revisions_article_id_created_at_idx
  on article_revisions(article_id, created_at);

create index if not exists articles_updated_at_idx
  on articles(updated_at desc);
