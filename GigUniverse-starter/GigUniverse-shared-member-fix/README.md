# GigUniverse

A dark, interactive artist-universe prototype powered by MusicBrainz.

## Run locally
1. Install Node.js 20 or newer.
2. In this folder run `npm install`.
3. Run `npm run dev`.
4. Open http://localhost:3000.

## Deploy
Import this repository into Vercel and deploy with the default Next.js settings.

## MusicBrainz
Artist search is proxied through `/api/artists` so the browser does not call MusicBrainz directly. Please review MusicBrainz API terms and update the User-Agent with a project contact URL or email before public launch. Respect the MusicBrainz rate limit.

## Current scope
- Live artist search
- Artist selection and duplicate prevention by MusicBrainz ID
- Artist details and tags
- In-session network map

Not yet implemented: persistent accounts, relationship graph queries, friend discovery, or permanent storage.
