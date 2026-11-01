"use client";

import { useEffect, useMemo, useState } from "react";

type Relationship = { source: string; target: string; type: string; direction: string };
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
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Artist[]>([]);
  const [artists, setArtists] = useState<Artist[]>([]);
  const [selected, setSelected] = useState<Artist | null>(null);
  const [relationships, setRelationships] = useState<Relationship[]>([]);
  const [relationshipStatus, setRelationshipStatus] = useState("Add at least two artists to discover connections.");
  const [status, setStatus] = useState("Search MusicBrainz to add your first artist.");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (query.trim().length < 2) { setResults([]); return; }
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      setLoading(true); setStatus("Searching artists…");
      try {
        const res = await fetch(`/api/artists?q=${encodeURIComponent(query.trim())}`, { signal: controller.signal });
        if (!res.ok) throw new Error("Search failed");
        const data = await res.json();
        setResults(data.artists ?? []);
        setStatus(data.artists?.length ? "Choose an artist to add them to your universe." : "No matches found.");
      } catch (e) {
        if (!controller.signal.aborted) setStatus("Search unavailable. Please try again.");
      } finally { if (!controller.signal.aborted) setLoading(false); }
    }, 400);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [query]);

  useEffect(() => {
    if (artists.length < 2) { setRelationships([]); setRelationshipStatus("Add at least two artists to discover connections."); return; }
    const controller = new AbortController();
    setRelationshipStatus("Checking MusicBrainz for documented collaborations and band links…");
    fetch(`/api/relationships?ids=${artists.map(a => a.id).join(",")}`, { signal: controller.signal })
      .then(r => r.json())
      .then(data => { if (!controller.signal.aborted) { setRelationships(data.relationships ?? []); setRelationshipStatus("Relationship check complete."); } })
      .catch(() => { if (!controller.signal.aborted) setRelationshipStatus("Could not load direct relationships just now."); });
    return () => controller.abort();
  }, [artists]);

  const genreLinks = useMemo(() => {
    const links: { source: string; target: string; shared: string[] }[] = [];
    for (let i = 0; i < artists.length; i++) for (let j = i + 1; j < artists.length; j++) {
      const shared = artists[i].tags.filter(t => artists[j].tags.some(other => other.toLowerCase() === t.toLowerCase()));
      if (shared.length) links.push({ source: artists[i].id, target: artists[j].id, shared });
    }
    return links;
  }, [artists]);
  const directPairs = useMemo(() => new Set(relationships.map(r => [r.source, r.target].sort().join("|"))), [relationships]);

  function addArtist(a: Artist) {
    if (artists.some(x => x.id === a.id)) { setStatus(`${a.name} is already in your universe.`); return; }
    setArtists(old => [...old, a]); setSelected(a); setQuery(""); setResults([]);
    setStatus(`${a.name} added.`);
  }
  const positions = useMemo(() => artists.map((a, i) => {
    const angle = -Math.PI / 2 + i * 2 * Math.PI / Math.max(artists.length, 1);
    const radius = artists.length < 2 ? 0 : Math.min(190, 65 + artists.length * 13);
    return { a, x: 350 + radius * Math.cos(angle), y: 245 + radius * .65 * Math.sin(angle) };
  }), [artists]);

  return <main className="shell">
    <header className="header">
      <div><div className="brand">Gig<span>Universe</span></div><div className="subtitle">YOUR MUSIC. YOUR HISTORY. YOUR UNIVERSE.</div></div>
      <span className="pill">ARTIST UNIVERSE · BETA</span>
    </header>
    <section className="search">
      <label htmlFor="artist-search">ADD AN ARTIST OR BAND</label>
      <input id="artist-search" value={query} onChange={e => setQuery(e.target.value)} placeholder="Start typing, e.g. Oasis…" autoComplete="off"/>
      <div className="status" aria-live="polite">{loading ? "Searching…" : status}</div>
      {results.length > 0 && <div className="results">{results.map(a => <button className="result" key={a.id} onClick={() => addArtist(a)}>
        <span className="musicIcon">♫</span><span className="resultText"><b>{a.name}</b><small>{[a.type, a.area, a.country, a.disambiguation].filter(Boolean).join(" · ")}</small></span><span>›</span>
      </button>)}</div>}
    </section>
    <section className="stats">
      <div><small>ARTISTS</small><strong>{artists.length}</strong></div>
      <div><small>CONNECTIONS</small><strong>{relationships.length + genreLinks.filter(g => !directPairs.has([g.source,g.target].sort().join("|"))).length}</strong></div>
      <div><small>DATA SOURCE</small><strong className="source">MusicBrainz</strong></div>
    </section>
    <section className="mapHeader"><b>YOUR ARTIST MAP</b><button onClick={() => {setArtists([]);setSelected(null);setStatus("Your universe has been reset.");}}>Reset map</button></section>
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
    <section className="artistList"><b>YOUR ARTISTS</b>{artists.length ? artists.map(a => <button key={a.id} onClick={() => setSelected(a)}><span style={{background:artistColor(a)}}/>{a.name}<small>{a.type}</small></button>) : <p>No artists added yet.</p>}</section>
    <footer>Artist data and documented relationships powered by <a href="https://musicbrainz.org" target="_blank" rel="noreferrer">MusicBrainz</a>. Shared-tag links are inferred from MusicBrainz tags. Your map currently lives in this browser session.</footer>
  </main>;
}
