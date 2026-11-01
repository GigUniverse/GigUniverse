import { NextRequest, NextResponse } from "next/server";
export const runtime = "nodejs";
const pause = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
export async function GET(request: NextRequest) {
  const ids = [...new Set((request.nextUrl.searchParams.get("ids") ?? "").split(",").filter(id => /^[0-9a-f-]{36}$/i.test(id)))].slice(0, 12);
  if (ids.length < 2) return NextResponse.json({ relationships: [] });
  const relationships: { source: string; target: string; type: string; direction: string }[] = [];
  try {
    for (let i = 0; i < ids.length; i++) {
      if (i > 0) await pause(1100);
      const url = new URL(`https://musicbrainz.org/ws/2/artist/${ids[i]}`);
      url.searchParams.set("inc", "artist-rels"); url.searchParams.set("fmt", "json");
      const response = await fetch(url, { headers: { Accept: "application/json", "User-Agent": "GigUniverse/0.2.0 (artist network prototype)" }, next: { revalidate: 3600 } });
      if (!response.ok) continue;
      const artist = await response.json();
      for (const relation of artist.relations ?? []) {
        const target = relation.artist?.id;
        if (target && ids.includes(target) && target !== ids[i]) relationships.push({ source: ids[i], target, type: relation.type ?? "related artist", direction: relation.direction ?? "forward" });
      }
    }
    return NextResponse.json({ relationships: [...new Map(relationships.map(r => [[r.source, r.target, r.type].join("|"), r])).values()] });
  } catch {
    return NextResponse.json({ relationships: [], warning: "Some relationship data could not be loaded." });
  }
}
