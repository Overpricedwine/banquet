# Banquet

Banquet is a React + Vite app with Supabase Auth and Postgres. The current implementation provides account registration and sign-in, profiles, public course and event catalogs, course enrollment and progress, event bookings, mentor requests, and mentor-only publishing.

## Run locally

1. Install Node.js 20.19+ or 22.12+.
2. Run `npm install`.
3. Create a Supabase project and apply `supabase/migrations/202610090001_initial_schema.sql` in the Supabase SQL Editor. You can also use the Supabase CLI with `supabase db push` after linking a project.
4. Copy `.env.example` to `.env.local` and set `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY`.
5. Add `http://localhost:5173` to the Supabase Auth redirect URL allowlist and run `npm run dev`.

The Microsoft sign-in button requires enabling the Azure provider in Supabase Auth and adding provider credentials and redirect URL in Azure. Email/password sign-in works without Microsoft.

## Mentor approval

Student is the default account type. Choosing mentor access creates a `pending` row in `mentor_applications`; it does not change `profiles.account_type`. To provision an administrator, insert their existing auth user ID into `public.admin_users` using the Supabase SQL Editor. An administrator can approve or reject a request with:

```sql
select public.review_mentor_application('<application-uuid>', true, 'Review note');
```

Approval is the only path that sets `account_type` to `mentor`. Database policies check this role on every course/event write. A work email by itself does not grant privileges.

## Hosting

Connect the GitHub repository to Cloudflare Pages when ready. Use build command `npm run build` and output directory `dist`; add the Supabase URL and publishable key as Pages environment variables. Never put a Supabase service-role key in a `VITE_` variable or browser code.

## Remaining product work

This is a starting implementation, not a finished product. Lesson-level course structure, booking cancellation, richer event/course fields, an administrator review screen, email templates, and production deployment settings still need to be specified. The booking RPC locks the event row while checking capacity to prevent overbooking.
