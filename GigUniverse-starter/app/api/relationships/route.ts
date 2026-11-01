import { NextRequest, NextResponse } from "next/server";
export const runtime = "nodejs";
const pause = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
type Link = { source: string; target: string; type: string; direction: string };
type Member = { id: string; name: string; relationType: string };

export async function GET(request: NextRequest) {
  const ids = [...new Set((request.nextUrl.searchParams.get("ids") ?? "").split(",").filter(id => /^[0-9a-f-]{36}$/i.test(id)))].slice(0, 12);
  if (ids.length < 2) return NextResponse.json({ relationships: [] });

  const relationships: Link[] = [];
  const membersByArtist = new Map<string, Member[]>();
  try {
    for (let i = 0; i < ids.length; i++) {
      if (i > 0) await pause(1100); // Respect MusicBrainz's request rate limit.
      const url = new URL(`https://musicbrainz.org/ws/2/artist/${ids[i]}`);
      url.searchParams.set("inc", "artist-rels");
      url.searchParams.set("fmt", "json");
      const response = await fetch(url, {
        headers: { Accept: "application/json", "User-Agent": "GigUniverse/0.3.0 (artist network prototype)" },
        next: { revalidate: 3600 },
      });
      if (!response.ok) continue;
      const artist = await response.json();
      const members: Member[] = [];
      for (const relation of artist.relations ?? []) {
        const related = relation.artist;
        if (!related?.id) continue;
        const relationType = String(relation.type ?? "related artist");
        // Keep direct links between artists already in the user's universe.
        if (ids.includes(related.id) && related.id !== ids[i]) {
          relationships.push({ source: ids[i], target: related.id, type: relationType, direction: relation.direction ?? "forward" });
        }
        // A band's MusicBrainz record can list its members as artist relationships.
        // Retain those intermediary people so two bands can be linked through a shared member.
        if (/member|band member|founder/i.test(relationType)) {
          members.push({ id: related.id, name: related.name ?? "Shared member", relationType });
        }
      }
      membersByArtist.set(ids[i], members);
    }

    // Connect selected bands when their MusicBrainz records identify the same member.
    for (let i = 0; i < ids.length; i++) {
      for (let j = i + 1; j < ids.length; j++) {
        const left = membersByArtist.get(ids[i]) ?? [];
        const right = membersByArtist.get(ids[j]) ?? [];
        const rightIds = new Set(right.map(member => member.id));
        const shared = left.find(member => rightIds.has(member.id));
        if (shared) {
          relationships.push({
            source: ids[i], target: ids[j],
            type: `Shared band member: ${shared.name}`,
            direction: "shared-member",
          });
        }
      }
    }

    const unique = [...new Map(relationships.map(r => [[r.source, r.target, r.type].sort().join("|"), r])).values()];
    return NextResponse.json({ relationships: unique });
  } catch {
    return NextResponse.json({ relationships, warning: "Some relationship data could not be loaded." });
  }
}
