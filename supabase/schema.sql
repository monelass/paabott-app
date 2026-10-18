-- =========================================================
-- PAABOT — Supabase schema
-- Roles: customer, driver, store_owner
-- Run this in the Supabase SQL editor.
-- =========================================================

-- 1. Profiles (extends auth.users, one row per signed-up user)
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text,
  phone text,
  role text not null check (role in ('customer', 'driver', 'store_owner')),
  avatar_url text,
  is_online boolean default false,           -- drivers: available for jobs
  vehicle_type text,                          -- drivers: motorcycle, car, bicycle...
  current_lat double precision,
  current_lng double precision,
  created_at timestamptz default now()
);

-- 2. Stores (owned by store_owner profiles)
create table if not exists public.stores (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  name text not null,
  description text,
  address text,
  lat double precision,
  lng double precision,
  is_open boolean default true,
  created_at timestamptz default now()
);

-- 3. Products (optional, for store owners with a catalog)
create table if not exists public.products (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete cascade,
  name text not null,
  price numeric(10,2) not null,
  is_available boolean default true,
  created_at timestamptz default now()
);

-- 4. Orders / Delivery requests
-- Supports both "order from a store" and "custom delivery request"
-- (customer describes an item/errand with no store attached).
create table if not exists public.delivery_requests (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.profiles(id) on delete cascade,
  store_id uuid references public.stores(id) on delete set null,
  driver_id uuid references public.profiles(id) on delete set null,

  request_type text not null check (request_type in ('store_order', 'custom')),
  description text,                 -- for custom requests: what to pick up/deliver
  items jsonb,                      -- for store orders: [{product_id, qty, price}]

  pickup_address text,
  pickup_lat double precision,
  pickup_lng double precision,

  dropoff_address text not null,
  dropoff_lat double precision not null,
  dropoff_lng double precision not null,

  status text not null default 'pending' check (
    status in ('pending', 'accepted', 'picked_up', 'in_transit', 'delivered', 'cancelled')
  ),

  distance_km numeric(10,2),
  eta_minutes integer,
  delivery_fee numeric(10,2),
  total_amount numeric(10,2),

  notes text,
  created_at timestamptz default now(),
  accepted_at timestamptz,
  picked_up_at timestamptz,
  delivered_at timestamptz
);

-- 5. Live driver location pings (history + realtime tracking)
create table if not exists public.driver_locations (
  id bigint generated always as identity primary key,
  driver_id uuid not null references public.profiles(id) on delete cascade,
  delivery_id uuid references public.delivery_requests(id) on delete cascade,
  lat double precision not null,
  lng double precision not null,
  heading double precision,
  recorded_at timestamptz default now()
);

-- 6. Ratings (optional but nice for trust between the 3 roles)
create table if not exists public.ratings (
  id uuid primary key default gen_random_uuid(),
  delivery_id uuid not null references public.delivery_requests(id) on delete cascade,
  rated_by uuid not null references public.profiles(id),
  rated_user uuid not null references public.profiles(id),
  rating int not null check (rating between 1 and 5),
  comment text,
  created_at timestamptz default now()
);

-- =========================================================
-- Row Level Security
-- =========================================================
alter table public.profiles enable row level security;
alter table public.stores enable row level security;
alter table public.products enable row level security;
alter table public.delivery_requests enable row level security;
alter table public.driver_locations enable row level security;
alter table public.ratings enable row level security;

-- Profiles: users can read any profile (needed to show driver/store names),
-- but only edit their own.
create policy "profiles readable by all authenticated users"
  on public.profiles for select using (auth.role() = 'authenticated');
create policy "users update own profile"
  on public.profiles for update using (auth.uid() = id);
create policy "users insert own profile"
  on public.profiles for insert with check (auth.uid() = id);

-- Stores: readable by everyone signed in; only owner can write.
create policy "stores readable by all" on public.stores
  for select using (auth.role() = 'authenticated');
create policy "owner manages own store" on public.stores
  for all using (auth.uid() = owner_id) with check (auth.uid() = owner_id);

-- Products: readable by all; writable by the store's owner only.
create policy "products readable by all" on public.products
  for select using (auth.role() = 'authenticated');
create policy "owner manages own products" on public.products
  for all using (
    exists (select 1 from public.stores s where s.id = store_id and s.owner_id = auth.uid())
  );

-- Delivery requests:
--  - customer can see/manage their own
--  - driver can see pending ones (to accept) + the ones assigned to them
--  - store owner can see orders placed on their store
create policy "customer sees own requests" on public.delivery_requests
  for select using (auth.uid() = customer_id);
create policy "customer creates requests" on public.delivery_requests
  for insert with check (auth.uid() = customer_id);
create policy "customer updates own pending request" on public.delivery_requests
  for update using (auth.uid() = customer_id and status = 'pending');

create policy "driver sees pending or own deliveries" on public.delivery_requests
  for select using (status = 'pending' or auth.uid() = driver_id);
create policy "driver accepts and updates own deliveries" on public.delivery_requests
  for update using (auth.uid() = driver_id or status = 'pending');

create policy "store owner sees own store orders" on public.delivery_requests
  for select using (
    exists (select 1 from public.stores s where s.id = store_id and s.owner_id = auth.uid())
  );

-- Driver locations: driver writes their own pings; customer/store on that
-- delivery can read them (simplified — tighten with a join check in prod).
create policy "driver inserts own location" on public.driver_locations
  for insert with check (auth.uid() = driver_id);
create policy "participants read delivery locations" on public.driver_locations
  for select using (auth.role() = 'authenticated');

-- Ratings: anyone in the conversation can insert; all authenticated can read.
create policy "ratings readable by all" on public.ratings
  for select using (auth.role() = 'authenticated');
create policy "user inserts rating for their delivery" on public.ratings
  for insert with check (auth.uid() = rated_by);

-- =========================================================
-- Realtime: enable so driver location + order status stream live
-- =========================================================
alter publication supabase_realtime add table public.delivery_requests;
alter publication supabase_realtime add table public.driver_locations;
