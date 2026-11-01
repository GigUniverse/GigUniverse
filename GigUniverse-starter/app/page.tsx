"use client";

import { useEffect, useMemo, useState } from "react";

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
      <div><small>CONNECTIONS</small><strong>{0}</strong></div>
      <div><small>DATA SOURCE</small><strong className="source">MusicBrainz</strong></div>
    </section>
    <section className="mapHeader"><b>YOUR ARTIST MAP</b><button onClick={() => {setArtists([]);setSelected(null);setStatus("Your universe has been reset.");}}>Reset map</button></section>
    <div className="mapWrap">
      <svg viewBox="0 0 700 490" role="img" aria-label="Your artist network">
        <defs><radialGradient id="universe"><stop stopColor="#192642"/><stop offset="1" stopColor="#0b1221"/></radialGradient></defs>
        <rect width="700" height="490" fill="url(#universe)"/>
        {positions.length > 1 && positions.map((p, i) => positions.slice(i + 1).map((q, j) =>
          <line key={`${i}-${j}`} x1={p.x} y1={p.y} x2={q.x} y2={q.y} stroke="#68799e" strokeDasharray="4 6" opacity=".35"/>
        ))}
        {positions.map(({a,x,y}) => <g key={a.id} className="node" onClick={() => setSelected(a)}>
          <circle cx={x} cy={y} r={27} fill={artistColor(a)} opacity=".13"/>
          <circle cx={x} cy={y} r={18} fill={artistColor(a)}/>
          <text x={x} y={y+37} textAnchor="middle">{a.name.length > 22 ? a.name.slice(0,20)+"…" : a.name}</text>
        </g>)}
        {artists.length === 0 && <><text x="350" y="220" textAnchor="middle" fill="#9aa8c2" fontSize="16">Your universe starts here</text><text x="350" y="248" textAnchor="middle" fill="#71809c" fontSize="12">Search for an artist above to add your first star</text></>}
      </svg>
      {selected && <aside className="profile"><button className="close" onClick={() => setSelected(null)}>×</button><div className="profileIcon" style={{background:artistColor(selected)}}>♫</div><h2>{selected.name}</h2><p>{[selected.type, selected.area, selected.country].filter(Boolean).join(" · ")}</p><h3>MusicBrainz tags</h3><div className="tags">{selected.tags.length ? selected.tags.map(t => <span key={t}>{t}</span>) : <small>No tags supplied.</small>}</div><a href={`https://musicbrainz.org/artist/${selected.id}`} target="_blank" rel="noreferrer">Open MusicBrainz record ↗</a></aside>}
    </div>
    <section className="artistList"><b>YOUR ARTISTS</b>{artists.length ? artists.map(a => <button key={a.id} onClick={() => setSelected(a)}><span style={{background:artistColor(a)}}/>{a.name}<small>{a.type}</small></button>) : <p>No artists added yet.</p>}</section>
    <footer>Artist search powered by <a href="https://musicbrainz.org" target="_blank" rel="noreferrer">MusicBrainz</a>. Relationships and persistent accounts are coming next.</footer>
  </main>;
}
