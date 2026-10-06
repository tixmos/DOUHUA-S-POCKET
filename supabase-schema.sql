-- ============================================================
-- 豆花的口袋 · Supabase 初始化脚本
-- 用法：Supabase 后台 → 左侧 SQL Editor → New query
--       把这一整段粘进去 → 点 Run（跑一次就够，重复跑也没事）
-- ============================================================

-- ---------- 1. 内容表 ----------
create table if not exists public.entries (
  id          uuid primary key default gen_random_uuid(),
  type        text not null default 'note',
  title       text not null default '',
  category    text default '杂谈',
  date        date default current_date,
  summary     text default '',
  quote       text default '',
  body        text default '',
  book        jsonb default '{}'::jsonb,
  images      jsonb default '[]'::jsonb,
  videos      jsonb default '[]'::jsonb,
  links       jsonb default '[]'::jsonb,
  tags        jsonb default '[]'::jsonb,
  created_at  timestamptz default now(),
  updated_at  timestamptz default now()
);

alter table public.entries enable row level security;

drop policy if exists "entries 公开可读" on public.entries;
create policy "entries 公开可读" on public.entries
  for select using (true);

drop policy if exists "entries 登录可写" on public.entries;
create policy "entries 登录可写" on public.entries
  for all to authenticated using (true) with check (true);


-- ---------- 2. 评论表：谁都能留言，只有登录的你（站长）能删 ----------
create table if not exists public.comments (
  id          uuid primary key default gen_random_uuid(),
  entry_id    uuid not null references public.entries(id) on delete cascade,
  name        text default '',
  content     text not null,
  created_at  timestamptz default now()
);

create index if not exists comments_entry_id_idx on public.comments (entry_id);

alter table public.comments enable row level security;

drop policy if exists "comments 公开可读" on public.comments;
create policy "comments 公开可读" on public.comments
  for select using (true);

drop policy if exists "comments 谁都能发" on public.comments;
create policy "comments 谁都能发" on public.comments
  for insert with check (true);

drop policy if exists "comments 登录可删" on public.comments;
create policy "comments 登录可删" on public.comments
  for delete to authenticated using (true);


-- ---------- 3. 打开实时推送：你保存的瞬间，别人开着的页面会自己更新 ----------
do $$
begin
  begin
    alter publication supabase_realtime add table public.entries;
  exception when duplicate_object then null;
  end;
  begin
    alter publication supabase_realtime add table public.comments;
  exception when duplicate_object then null;
  end;
end $$;


-- ---------- 4. 图片存储桶：图片传到这里，网页里存的是图片网址 ----------
insert into storage.buckets (id, name, public)
values ('images', 'images', true)
on conflict (id) do nothing;

drop policy if exists "images 公开可读" on storage.objects;
create policy "images 公开可读" on storage.objects
  for select using (bucket_id = 'images');

drop policy if exists "images 登录可传" on storage.objects;
create policy "images 登录可传" on storage.objects
  for insert to authenticated with check (bucket_id = 'images');

drop policy if exists "images 登录可删" on storage.objects;
create policy "images 登录可删" on storage.objects
  for delete to authenticated using (bucket_id = 'images');

-- 完成。回到网站，在 supabase-config.js 里填上 Project URL 和 anon key 即可。


-- ============================================================
-- 【可选加固】把写权限锁死到"只有你这个账号"
--
-- 平时用不着这一段：只要在 Authentication 里关掉
-- 「Allow new users to sign up」，全世界就只有你的账号能登录，
-- 也就只有你能改内容，评论依旧谁都能发。
--
-- 如果你连"万一有人注册了账号"都不想冒险，就执行下面这段：
-- 把两处 <你的用户 uuid> 换成你自己的 User UID
-- （在 Authentication → Users 里点开你的账号就能看到）。
--
-- drop policy if exists "entries 登录可写" on public.entries;
-- create policy "entries 只有站长能写" on public.entries
--   for all to authenticated
--   using (auth.uid() = '<你的用户 uuid>')
--   with check (auth.uid() = '<你的用户 uuid>');
--
-- drop policy if exists "comments 登录可删" on public.comments;
-- create policy "comments 只有站长能删" on public.comments
--   for delete to authenticated
--   using (auth.uid() = '<你的用户 uuid>');
-- ============================================================


-- ============================================================
-- 【待办 / 待读书目 / 日历事项】
-- 已经跑过上面那段的话，只跑这一段就行（重复跑也没事）
-- 这张表只给站长自己用：没有给匿名用户开任何权限，访客读不到
-- ============================================================
create table if not exists public.tasks (
  id         uuid primary key default gen_random_uuid(),
  kind       text not null default 'todo',   -- todo 待办 / book 待读书目 / event 日历事项
  title      text not null default '',
  author     text default '',                -- 书目用
  genre      text default '',                -- 书目用：类型
  note       text default '',                -- 备注
  date       date,                           -- 日历事项的日期 / 待办的截止日
  done       boolean not null default false,
  done_at    timestamptz,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table public.tasks enable row level security;

drop policy if exists "tasks 只有站长" on public.tasks;
create policy "tasks 只有站长" on public.tasks
  for all to authenticated using (true) with check (true);

do $$
begin
  begin
    alter publication supabase_realtime add table public.tasks;
  exception when duplicate_object then null;
  end;
end $$;
