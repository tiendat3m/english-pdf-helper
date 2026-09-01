create table if not exists public.account_books (
  user_id text not null,
  id text not null,
  title text not null,
  file_name text not null,
  size bigint not null default 0,
  created_at text not null,
  updated_at text not null,
  last_opened_at text not null,
  last_page integer not null default 1,
  total_pages integer not null default 0,
  zoom double precision not null default 1.15,
  progress double precision not null default 0,
  deleted_at text,
  storage_path text not null,
  primary key (user_id, id)
);

create table if not exists public.account_annotations (
  user_id text not null,
  id text not null,
  book_id text,
  page_number integer,
  created_at text not null,
  updated_at text not null,
  data jsonb not null,
  primary key (user_id, id)
);

create table if not exists public.account_bookmarks (
  user_id text not null,
  id text not null,
  book_id text,
  page_number integer,
  created_at text not null,
  updated_at text not null,
  data jsonb not null,
  primary key (user_id, id)
);

create table if not exists public.account_page_statuses (
  user_id text not null,
  id text not null,
  book_id text,
  page_number integer,
  created_at text not null,
  updated_at text not null,
  data jsonb not null,
  primary key (user_id, id)
);

create table if not exists public.account_vocabulary (
  user_id text not null,
  id text not null,
  book_id text,
  page_number integer,
  created_at text not null,
  updated_at text not null,
  data jsonb not null,
  primary key (user_id, id)
);

create table if not exists public.account_activities (
  user_id text not null,
  id text not null,
  book_id text,
  page_number integer,
  created_at text not null,
  updated_at text not null,
  data jsonb not null,
  primary key (user_id, id)
);

create index if not exists account_books_user_updated_idx on public.account_books (user_id, updated_at desc);
create index if not exists account_annotations_user_book_page_idx on public.account_annotations (user_id, book_id, page_number);
create index if not exists account_bookmarks_user_book_page_idx on public.account_bookmarks (user_id, book_id, page_number);
create index if not exists account_page_statuses_user_book_page_idx on public.account_page_statuses (user_id, book_id, page_number);
create index if not exists account_vocabulary_user_book_idx on public.account_vocabulary (user_id, book_id);
create index if not exists account_activities_user_created_idx on public.account_activities (user_id, created_at desc);

notify pgrst, 'reload schema';
