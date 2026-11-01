# GigUniverse account-system update

This update adds Supabase email/password sign-up, login/logout, and per-user saved artists. It retains MusicBrainz search and uses the shared-member relationship endpoint.

## 1. Install dependency
The package.json now includes `@supabase/supabase-js`. Vercel installs it on the next deployment.

## 2. Supabase database table and security
In the Supabase dashboard, open **SQL Editor** -> **New query**. Open `supabase/setup-user-artists.sql`, copy all its contents into the SQL editor, and click **Run**. This creates the private artist table and Row Level Security policies. Do this before testing saving artists.

## 3. Vercel environment variables
The app reads:
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`

It also accepts `NEXT_PUBLIC_SUPABASE_ANON_KEY` as a fallback. The URL and publishable key must contain the matching values from this Supabase project. Do not add a secret/service-role key to any `NEXT_PUBLIC_` variable.

Ensure these variables are available to Production (and Preview/Development if desired), then redeploy.

## 4. Supabase Auth URLs
In Authentication -> URL Configuration:
- Site URL: your live Vercel production URL.
- Redirect URLs: include that URL and its `/**` wildcard.

## 5. Email confirmation
With email confirmation enabled, sign-up tells the user to check their inbox. After clicking the confirmation link, they can return to the site and log in. For early testing, you can configure confirmation settings in Supabase Authentication, but keeping email confirmation enabled is recommended.

## Project layout
The deployable Next.js project is inside `GigUniverse-starter/`. If your Vercel project currently uses that as its Root Directory, keep it there. If Vercel currently uses the repository root, either change Root Directory to `GigUniverse-starter` in Vercel Settings -> Build and Deployment, or move the project files to the repository root. Do not have two competing copies deployed.
