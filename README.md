# Paabot 🟢

A React Native (Expo) delivery app for three roles — **Customers**, **Drivers**, and **Store Owners** — built on Supabase and OpenStreetMap.

## Stack

- **Expo / React Native** (JavaScript)
- **Supabase** — email auth, Postgres database, Row Level Security, Realtime
- **OpenStreetMap** via Leaflet in a WebView — no API key, no native map linking
- **OSRM** — free routing engine for distance + ETA on OSM roads
- **React Navigation** — role-based stacks

## 1. Set up Supabase

1. Create a project at https://supabase.com.
2. Go to **SQL Editor** and run everything in `supabase/schema.sql`. This creates:
   - `profiles` (role: customer / driver / store_owner)
   - `stores`, `products`
   - `delivery_requests` (both store orders and custom delivery requests)
   - `driver_locations` (live GPS pings, Realtime-enabled)
   - `ratings`
   - Row Level Security policies for each role
3. In **Authentication → Providers**, make sure **Email** is enabled. Turn off "Confirm email" if you want instant login during dev.
4. In **Project Settings → API**, copy your **Project URL** and **anon public key**.

## 2. Configure the app

Copy `.env.example` to `.env` and fill in your Supabase project URL and **anon public key** from **Project Settings → API**. Expo reads the `EXPO_PUBLIC_` variables when the app starts; restart Expo after changing them.

These values are included in the client app, so never put a Supabase service-role key or other private credentials in them. Keep database access protected with Row Level Security.

The PayMongo secret is server-only. For local Supabase Functions, copy `supabase/functions/.env.example` to `supabase/functions/.env` and fill in `PAYMONGO_SECRET_KEY`, then run the Functions with `supabase functions serve --env-file supabase/functions/.env`. For a deployed project, set it with `supabase secrets set PAYMONGO_SECRET_KEY=your-secret-key` instead; do not add it to the app's `.env`.

## 3. Install & run

```bash
npm install
npx expo start
```

Scan the QR code with **Expo Go** (iOS/Android), or press `a` / `i` for an emulator.

## How the pieces fit together

- **Auth & roles**: `SignupScreen` lets a user pick Customer / Driver / Store Owner. `AuthContext` loads the matching `profiles` row after login, and `RootNavigator` routes to the right app based on `profile.role`.
- **Custom delivery requests**: `NewDeliveryRequestScreen` grabs the customer's GPS position (via `expo-location`) as pickup, lets them set a drop-off, calls OSRM for the route + ETA, shows it on the OSM map, and writes a row to `delivery_requests`.
- **Maps**: `OsmMap` renders Leaflet + OpenStreetMap tiles inside a `WebView`. It accepts markers and an optional route polyline — reused across the customer tracking screen, the driver job map, and the active delivery screen.
- **ETA/distance**: `etaService.js` calls the public OSRM demo server (`router.project-osrm.org`). **For production, self-host OSRM** (or swap in OpenRouteService/Mapbox) — the public demo has no uptime or rate-limit guarantees.
- **Driver flow**: Drivers toggle online/offline, see pending jobs in realtime (`subscribeToNewJobs`), accept a job (race-safe via a `status = pending` check on update), then advance it through `accepted → picked_up → in_transit → delivered` while broadcasting GPS pings every ~5s to `driver_locations`.
- **Live tracking**: The customer's `OrderTrackingScreen` subscribes to both the delivery row and new `driver_locations` inserts via Supabase Realtime, so the map marker moves as the driver moves.
- **Store owners**: `StoreOrdersScreen` shows orders placed against their store. (A "create/edit store" screen and product catalog UI are natural next additions — the `stores`/`products` tables are already there.)

## Design

Theme tokens live in `src/theme/colors.js` — a green (`#0F9D58`) and white palette used consistently across buttons, badges, cards, and headers.

## Suggested next steps

- Replace the manual pickup/drop-off lat-lng flow with real address search (Nominatim geocoding + a search bar), and let customers tap the map to drop a pin.
- Add push notifications (Expo Notifications) for "driver accepted", "order picked up", etc.
- Add a "Create/Edit Store" and product catalog screen for store owners, plus a customer-facing store browsing + cart flow.
- Add background location tracking for drivers (`expo-location` background permissions) so ETA keeps updating even if the app is backgrounded.
- Add ratings UI using the existing `ratings` table.
- Tighten the `driver_locations` RLS policy to only allow reads from the specific customer/store tied to that delivery, instead of any authenticated user.
