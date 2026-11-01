"use client";

import { useEffect, useMemo, useState } from "react";
import type { User } from "@supabase/supabase-js";
import { supabase } from "../lib/supabase";

type Relationship = { source: string; target: string; type: string; direction: string };
type Gig = { id: number; artist_id: string; artist_name: string; venue: string; city: string; country: string; event_date: string; tour: string; notes: string; source: string; source_url: string };
type GigSearchResult = { source: string; sourceId: string; sourceUrl: string; artistId: string; artistName: string; venue: string; city: string; country: string; date: string; tour: string };
type Artist = {
  id: string; name: string; type: string; country?: string | null;
  area?: string | null; disambiguation: string; tags: string[];
};
const palette = ["#a78bfa", "#fb9b64", "#4dd6c3", "#60a5fa", "#f472b6", "#facc15"];
function artistColor(a: Artist) {
  const tags = a.tags.join(" ").toLowerCase();
  if (/metal|punk|hardcore/.test(tags)) return "#fb8585";
  if (/electronic|techno|ambient/.test(tags)) return "#60a5fa";
  if (/pop|synthpop/.test(tags)) return "#f472b6";
  if (/rock|indie|alternative/.test(tags)) return "#a78bfa";
  if (/hip.?hop|rap/.test(tags)) return "#facc15";
  return palette[a.name.length % palette.length];
}

export default function Home() {
  const [user, setUser] = useState<User | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [authMode, setAuthMode] = useState<"login" | "signup">("signup");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [authBusy, setAuthBusy] = useState(false);
  const [authMessage, setAuthMessage] = useState("");
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Artist[]>([]);
  const [artists, setArtists] = useState<Artist[]>([]);
  const [selected, setSelected] = useState<Artist | null>(null);
  const [relationships, setRelationships] = useState<Relationship[]>([]);
  const [relationshipStatus, setRelationshipStatus] = useState("Add at least two artists to discover connections.");
  const [status, setStatus] = useState("Search MusicBrainz to add your first artist.");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [gigs, setGigs] = useState<Gig[]>([]);
  const [gigArtistId, setGigArtistId] = useState("");
  const [gigVenue, setGigVenue] = useState("");
  const [gigCity, setGigCity] = useState("");
  const [gigDate, setGigDate] = useState("");
  const [gigNotes, setGigNotes] = useState("");
  const [gigTour, setGigTour] = useState("");
  const [gigResults, setGigResults] = useState<GigSearchResult[]>([]);
  const [gigStatus, setGigStatus] = useState("Choose an artist and search for historical performances, or enter a gig manually.");
  const [gigSearching, setGigSearching] = useState(false);
  const [gigSaving, setGigSaving] = useState(false);

  useEffect(() => {
    let alive = true;
    supabase.auth.getSession().then(({ data }) => {
      if (!alive) return;
      setUser(data.session?.user ?? null);
      setAuthReady(true);
    });
    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
    });
    return () => { alive = false; listener.subscription.unsubscribe(); };
  }, []);

  useEffect(() => {
    if (!authReady || !user) { setArtists([]); return; }
    let cancelled = false;
    setSaving(true);
    (async () => {
      const { data, error } = await supabase
        .from("user_artists")
        .select("artist_id,name,artist_type,country,area,disambiguation,tags")
        .eq("user_id", user.id)
        .order("created_at", { ascending: true });
      const gigResponse = await supabase.from("user_gigs").select("*").eq("user_id", user.id).order("event_date", { ascending: false });
      if (cancelled) return;
      if (!gigResponse.error) setGigs((gigResponse.data ?? []) as Gig[]);
      if (error) {
        setStatus("Couldn't load your saved artists. Check the Supabase database setup.");
      } else {
        const loaded: Artist[] = (data ?? []).map(row => ({
          id: row.artist_id, name: row.name, type: row.artist_type ?? "Artist",
          country: row.country, area: row.area, disambiguation: row.disambiguation ?? "",
          tags: Array.isArray(row.tags) ? row.tags : [],
        }));
        setArtists(loaded);
        setStatus(loaded.length ? "Your saved artist universe has been restored." : "Your account is ready. Search for an artist to begin.");
      }
      setSaving(false);
    })();
    return () => { cancelled = true; };
  }, [authReady, user]);

  useEffect(() => {
    if (!user || query.trim().length < 2) { setResults([]); return; }
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      setLoading(true); setStatus("Searching MusicBrainz…");
      try {
        const res = await fetch(`/api/artists?q=${encodeURIComponent(query.trim())}`, { signal: controller.signal });
        if (!res.ok) throw new Error("Search failed");
        const data = await res.json();
        setResults(data.artists ?? []);
        setStatus(data.artists?.length ? "Choose an artist to add them to your universe." : "No matches found.");
      } catch {
        if (!controller.signal.aborted) setStatus("Search unavailable. Please try again.");
      } finally { if (!controller.signal.aborted) setLoading(false); }
    }, 400);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [query, user]);

  useEffect(() => {
    if (!user || artists.length < 2) {
      setRelationships([]); setRelationshipStatus("Add at least two artists to discover connections."); return;
    }
    const controller = new AbortController();
    setRelationshipStatus("Checking MusicBrainz for documented collaborations and band links…");
    fetch(`/api/relationships?ids=${artists.map(a => a.id).join(",")}`, { signal: controller.signal })
      .then(r => r.json())
      .then(data => { if (!controller.signal.aborted) { setRelationships(data.relationships ?? []); setRelationshipStatus("Relationship check complete."); } })
      .catch(() => { if (!controller.signal.aborted) setRelationshipStatus("Could not load direct relationships just now."); });
    return () => controller.abort();
  }, [artists, user]);

  const genreLinks = useMemo(() => {
    const links: { source: string; target: string; shared: string[] }[] = [];
    for (let i = 0; i < artists.length; i++) for (let j = i + 1; j < artists.length; j++) {
      const shared = artists[i].tags.filter(t => artists[j].tags.some(other => other.toLowerCase() === t.toLowerCase()));
      if (shared.length) links.push({ source: artists[i].id, target: artists[j].id, shared });
    }
    return links;
  }, [artists]);
  const directPairs = useMemo(() => new Set(relationships.map(r => [r.source, r.target].sort().join("|"))), [relationships]);

  async function submitAuth(e: React.FormEvent) {
    e.preventDefault(); setAuthBusy(true); setAuthMessage("");
    try {
      if (authMode === "signup") {
        const { data, error } = await supabase.auth.signUp({
          email: email.trim(), password,
          options: { emailRedirectTo: `${window.location.origin}/` },
        });
        if (error) throw error;
        if (!data.session) setAuthMessage("Account created. Check your email and click the confirmation link, then return here to log in.");
        else setAuthMessage("Account created. Welcome to GigUniverse!");
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
        if (error) throw error;
        setAuthMessage("You're logged in. Loading your universe…");
      }
    } catch (err) {
      setAuthMessage(err instanceof Error ? err.message : "Authentication failed. Please try again.");
    } finally { setAuthBusy(false); }
  }

  async function addArtist(a: Artist) {
    if (!user) return;
    if (artists.some(x => x.id === a.id)) { setStatus(`${a.name} is already in your universe.`); return; }
    setSaving(true);
    const { error } = await supabase.from("user_artists").insert({
      user_id: user.id, artist_id: a.id, name: a.name, artist_type: a.type,
      country: a.country ?? null, area: a.area ?? null,
      disambiguation: a.disambiguation ?? "", tags: a.tags ?? [],
    });
    if (error) {
      setStatus(error.code === "23505" ? `${a.name} is already in your universe.` : `Couldn't save ${a.name}. ${error.message}`);
    } else {
      setArtists(old => [...old, a]); setSelected(a); setQuery(""); setResults([]);
      setStatus(`${a.name} added and saved to your account.`);
    }
    setSaving(false);
  }

  async function searchHistoricalGigs() {
    const artist = artists.find(a => a.id === gigArtistId);
    if (!artist) { setGigStatus("Add or select an artist in your universe first."); return; }
    if (!gigVenue.trim() && !gigCity.trim()) { setGigStatus("Enter a venue or city to search historical performances."); return; }
    setGigSearching(true); setGigResults([]); setGigStatus("Searching historical performance records…");
    try {
      const params = new URLSearchParams({ artistId: artist.id, artistName: artist.name, venue: gigVenue.trim(), city: gigCity.trim() });
      const response = await fetch(`/api/gigs/search?${params.toString()}`);
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Historical search failed.");
      setGigResults(payload.gigs ?? []);
      setGigStatus(payload.gigs?.length ? `Found ${payload.gigs.length} possible performance${payload.gigs.length === 1 ? "" : "s"} via ${payload.source}. Check the details before adding.` : `${payload.note || "No historical matches found."} You can still enter the gig manually.`);
    } catch (error) {
      setGigStatus(error instanceof Error ? error.message : "Historical search failed. You can still enter the gig manually.");
    } finally { setGigSearching(false); }
  }

  async function saveGig(details?: GigSearchResult) {
    if (!user) return;
    const artist = artists.find(a => a.id === (details?.artistId || gigArtistId));
    if (!artist) { setGigStatus("Choose an artist from your universe first."); return; }
    const venue = details?.venue || gigVenue.trim();
    const date = details?.date || gigDate;
    if (!venue || !date) { setGigStatus("A venue and performance date are required."); return; }
    setGigSaving(true);
    const row = {
      user_id: user.id, artist_id: artist.id, artist_name: artist.name,
      venue, city: details?.city || gigCity.trim(), country: details?.country || "",
      event_date: date, tour: details?.tour || gigTour.trim(), notes: gigNotes.trim(),
      source: details?.source || "manual", source_id: details?.sourceId || "", source_url: details?.sourceUrl || "",
    };
    const { data, error } = await supabase.from("user_gigs").insert(row).select("*").single();
    if (error) setGigStatus(`Couldn't save this gig. ${error.message}`);
    else {
      setGigs(old => [data as Gig, ...old].sort((a,b) => b.event_date.localeCompare(a.event_date)));
      setGigResults([]); setGigDate(""); setGigTour(""); setGigNotes("");
      setGigStatus(`${artist.name} at ${venue} saved to your gig history.`);
    }
    setGigSaving(false);
  }

  async function removeGig(id: number) {
    const { error } = await supabase.from("user_gigs").delete().eq("id", id).eq("user_id", user?.id);
    if (error) setGigStatus(`Couldn't remove gig. ${error.message}`);
    else setGigs(old => old.filter(g => g.id !== id));
  }

  async function removeArtist(a: Artist) {
    if (!user) return;
    const { error } = await supabase.from("user_artists").delete().eq("user_id", user.id).eq("artist_id", a.id);
    if (error) { setStatus("Couldn't remove that artist. Please try again."); return; }
    setArtists(old => old.filter(x => x.id !== a.id));
    if (selected?.id === a.id) setSelected(null);
    setStatus(`${a.name} removed from your universe.`);
  }

  async function resetMap() {
    if (!user || !window.confirm("Remove every artist from your saved universe? This cannot be undone.")) return;
    const { error } = await supabase.from("user_artists").delete().eq("user_id", user.id);
    if (error) { setStatus("Couldn't reset your map. Please try again."); return; }
    setArtists([]); setSelected(null); setStatus("Your saved universe has been reset.");
  }

  async function signOut() {
    await supabase.auth.signOut();
    setArtists([]); setSelected(null); setResults([]); setQuery("");
    setStatus("You have signed out.");
  }

  const positions = useMemo(() => artists.map((a, i) => {
    const angle = -Math.PI / 2 + i * 2 * Math.PI / Math.max(artists.length, 1);
    const radius = artists.length < 2 ? 0 : Math.min(190, 65 + artists.length * 13);
    return { a, x: 350 + radius * Math.cos(angle), y: 245 + radius * .65 * Math.sin(angle) };
  }), [artists]);

  if (!authReady) return <main className="shell"><div className="brand">Gig<span>Universe</span></div><p className="status">Connecting to your account…</p></main>;

  if (!user) return <main className="shell authShell">
    <header className="header"><div><div className="brand">Gig<span>Universe</span></div><div className="subtitle">YOUR MUSIC. YOUR HISTORY. YOUR UNIVERSE.</div></div><span className="pill">ARTIST UNIVERSE · BETA</span></header>
    <section className="authCard">
      <div className="authEyebrow">YOUR PERSONAL MUSIC MAP</div>
      <h1>{authMode === "signup" ? "Create your universe" : "Welcome back"}</h1>
      <p>{authMode === "signup" ? "Create an account to save your artists and return to your universe on any device." : "Log in to pick up where your music universe left off."}</p>
      <form onSubmit={submitAuth}>
        <label htmlFor="email">EMAIL ADDRESS</label>
        <input id="email" type="email" required autoComplete="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="you@example.com"/>
        <label htmlFor="password">PASSWORD</label>
        <input id="password" type="password" required minLength={6} autoComplete={authMode === "signup" ? "new-password" : "current-password"} value={password} onChange={e => setPassword(e.target.value)} placeholder="At least 6 characters"/>
        <button className="authSubmit" disabled={authBusy}>{authBusy ? "Please wait…" : authMode === "signup" ? "Create account" : "Log in"}</button>
      </form>
      {authMessage && <div className="authMessage" role="status">{authMessage}</div>}
      <div className="authSwitch">{authMode === "signup" ? "Already have an account?" : "New to GigUniverse?"} <button onClick={() => {setAuthMode(authMode === "signup" ? "login" : "signup");setAuthMessage("");}}>{authMode === "signup" ? "Log in" : "Create an account"}</button></div>
    </section>
    <footer>Artist search and relationship information powered by MusicBrainz.</footer>
  </main>;

  return <main className="shell">
    <header className="header">
      <div><div className="brand">Gig<span>Universe</span></div><div className="subtitle">YOUR MUSIC. YOUR HISTORY. YOUR UNIVERSE.</div></div>
      <div className="accountBar"><span className="pill">{user.email}</span><button className="accountButton" onClick={signOut}>Log out</button></div>
    </header>
    <section className="search">
      <label htmlFor="artist-search">ADD AN ARTIST OR BAND</label>
      <input id="artist-search" value={query} onChange={e => setQuery(e.target.value)} placeholder="Start typing, e.g. Oasis…" autoComplete="off"/>
      <div className="status" aria-live="polite">{loading ? "Searching…" : saving ? "Saving / loading your universe…" : status}</div>
      {results.length > 0 && <div className="results">{results.map(a => <button className="result" key={a.id} onClick={() => addArtist(a)}>
        <span className="musicIcon">♫</span><span className="resultText"><b>{a.name}</b><small>{[a.type, a.area, a.country, a.disambiguation].filter(Boolean).join(" · ")}</small></span><span>›</span>
      </button>)}</div>}
    </section>
    <section className="stats">
      <div><small>ARTISTS</small><strong>{artists.length}</strong></div>
      <div><small>CONNECTIONS</small><strong>{relationships.length + genreLinks.filter(g => !directPairs.has([g.source,g.target].sort().join("|"))).length}</strong></div>
      <div><small>DATA SOURCE</small><strong className="source">MusicBrainz</strong></div>
    </section>
    <section className="mapHeader"><b>YOUR ARTIST MAP</b><button onClick={resetMap}>Reset map</button></section>
    <div className="mapWrap">
      <svg viewBox="0 0 700 490" role="img" aria-label="Your artist network">
        <defs><radialGradient id="universe"><stop stopColor="#192642"/><stop offset="1" stopColor="#0b1221"/></radialGradient></defs>
        <rect width="700" height="490" fill="url(#universe)"/>
        {relationships.map((r, i) => {
          const p = positions.find(x => x.a.id === r.source), q = positions.find(x => x.a.id === r.target);
          return p && q ? <line key={`direct-${i}`} x1={p.x} y1={p.y} x2={q.x} y2={q.y} stroke="#f5c66b" strokeWidth="2.8" opacity=".9" /> : null;
        })}
        {genreLinks.filter(g => !directPairs.has([g.source,g.target].sort().join("|"))).map((g, i) => {
          const p = positions.find(x => x.a.id === g.source), q = positions.find(x => x.a.id === g.target);
          return p && q ? <line key={`genre-${i}`} x1={p.x} y1={p.y} x2={q.x} y2={q.y} stroke="#7294bd" strokeWidth="1.2" strokeDasharray="3 7" opacity=".42" /> : null;
        })}
        {positions.map(({a,x,y}) => <g key={a.id} className="node" onClick={() => setSelected(a)}>
          <circle cx={x} cy={y} r={27} fill={artistColor(a)} opacity=".13"/>
          <circle cx={x} cy={y} r={18} fill={artistColor(a)}/>
          <text x={x} y={y+37} textAnchor="middle">{a.name.length > 22 ? a.name.slice(0,20)+"…" : a.name}</text>
        </g>)}
        {artists.length === 0 && <><text x="350" y="220" textAnchor="middle" fill="#9aa8c2" fontSize="16">Your universe starts here</text><text x="350" y="248" textAnchor="middle" fill="#71809c" fontSize="12">Search for an artist above to add your first star</text></>}
      </svg>
      <div className="legend"><span><i className="directLine"/> Documented relationship</span><span><i className="genreLine"/> Shared tags</span></div>
      {selected && <aside className="profile"><button className="close" onClick={() => setSelected(null)}>×</button><div className="profileIcon" style={{background:artistColor(selected)}}>♫</div><h2>{selected.name}</h2><p>{[selected.type, selected.area, selected.country].filter(Boolean).join(" · ")}</p><h3>MusicBrainz tags</h3><div className="tags">{selected.tags.length ? selected.tags.map(t => <span key={t}>{t}</span>) : <small>No tags supplied.</small>}</div><a href={`https://musicbrainz.org/artist/${selected.id}`} target="_blank" rel="noreferrer">Open MusicBrainz record ↗</a></aside>}
    </div>
    <div className="relationshipStatus">{relationshipStatus} {relationships.length > 0 ? `Found ${relationships.length} documented relationship${relationships.length === 1 ? "" : "s"}.` : ""}</div>
    <section className="gigPanel">
      <div className="gigPanelHead"><div><b>LIVE PERFORMANCES</b><p>Build your personal gig history.</p></div><span className="gigCount">{gigs.length} gigs logged</span></div>
      <div className="gigFormGrid">
        <label>ARTIST<select value={gigArtistId} onChange={e => setGigArtistId(e.target.value)}><option value="">Choose an artist…</option>{artists.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}</select></label>
        <label>VENUE<input value={gigVenue} onChange={e => setGigVenue(e.target.value)} placeholder="e.g. Manchester Arena" /></label>
        <label>CITY (OPTIONAL)<input value={gigCity} onChange={e => setGigCity(e.target.value)} placeholder="e.g. Manchester" /></label>
        <button className="gigSearchButton" onClick={searchHistoricalGigs} disabled={gigSearching || artists.length === 0}>{gigSearching ? "Searching…" : "Find historical performances"}</button>
      </div>
      <div className="gigStatus" aria-live="polite">{gigStatus}</div>
      {gigResults.length > 0 && <div className="gigMatches"><b>HISTORICAL MATCHES — CHECK BEFORE ADDING</b>{gigResults.map((g,i) => <div className="gigMatch" key={`${g.source}-${g.sourceId}-${i}`}><div><strong>{g.date}</strong><span>{g.venue}{g.city ? ` · ${g.city}` : ""}{g.tour ? ` · ${g.tour}` : ""}</span><small>Source: {g.source}{g.source === "setlist.fm" ? " · Please retain source attribution" : ""}</small></div><button onClick={() => saveGig(g)} disabled={gigSaving}>Add gig</button></div>)}</div>}
      <details className="manualGig"><summary>Can't find it? Add a performance manually</summary>
        <div className="gigFormGrid manualGrid">
          <label>PERFORMANCE DATE<input type="date" value={gigDate} onChange={e => setGigDate(e.target.value)} /></label>
          <label>TOUR (OPTIONAL)<input value={gigTour} onChange={e => setGigTour(e.target.value)} placeholder="Tour name" /></label>
          <label className="notesField">MEMORY / NOTES (OPTIONAL)<input value={gigNotes} onChange={e => setGigNotes(e.target.value)} placeholder="Who did you go with? Any memories?" /></label>
          <button className="gigSearchButton" onClick={() => saveGig()} disabled={gigSaving}>{gigSaving ? "Saving…" : "Save manual gig"}</button>
        </div>
      </details>
      <div className="gigHistory"><b>YOUR GIG HISTORY</b>{gigs.length ? gigs.map(g => <div className="gigHistoryRow" key={g.id}><div><strong>{new Date(`${g.event_date}T12:00:00`).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })} · {g.artist_name}</strong><span>{g.venue}{g.city ? `, ${g.city}` : ""}</span>{g.tour && <small>{g.tour}</small>}{g.source_url && <a href={g.source_url} target="_blank" rel="noreferrer">View source ↗</a>}</div><button onClick={() => removeGig(g.id)} aria-label={`Remove ${g.artist_name} gig`}>Remove</button></div>) : <p>No performances logged yet.</p>}</div>
    </section>
    <section className="artistList"><b>YOUR ARTISTS</b>{artists.length ? artists.map(a => <div className="artistRow" key={a.id}><button className="artistName" onClick={() => setSelected(a)}><span style={{background:artistColor(a)}}/>{a.name}<small>{a.type}</small></button><button className="removeArtist" onClick={() => removeArtist(a)} aria-label={`Remove ${a.name}`}>Remove</button></div>) : <p>No artists added yet.</p>}</section>
    <footer>Artist data and documented relationships powered by <a href="https://musicbrainz.org" target="_blank" rel="noreferrer">MusicBrainz</a>. Your artist collection is saved privately to your account.</footer>
  </main>;
}
