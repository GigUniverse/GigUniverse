# GigUniverse – Gig History update

This update adds a private gig-history feature while retaining the current Supabase account system, MusicBrainz artist search and artist relationships.

## Database setup (one-time)

1. Open the Supabase project → SQL Editor → New query.
2. Paste the contents of `supabase/setup-user-gigs.sql` and run it.
3. The `user_gigs` table has Row Level Security policies so each signed-in user can only read, add and remove their own gig records.

## Historical search

The search route uses the MusicBrainz Events index and looks up the linked place details. Event coverage is community-maintained and incomplete, so the manual-entry form is always available.

For broader historical setlist coverage, an optional setlist.fm API key can be added in Vercel as the server-only environment variable `SETLISTFM_API_KEY` (do not prefix it with `NEXT_PUBLIC_`). The setlist.fm API requires an API key. Its documentation says the API is free for non-commercial projects; contact setlist.fm for commercial use. If using results, the app links back to the setlist.fm source.

After adding/changing an environment variable, redeploy the Vercel project.
