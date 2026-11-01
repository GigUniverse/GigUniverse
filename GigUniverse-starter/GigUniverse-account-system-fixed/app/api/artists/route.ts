import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export async function GET(request: NextRequest) {
  const q = request.nextUrl.searchParams.get("q")?.trim();
  if (!q || q.length < 2) return NextResponse.json({ artists: [] });
  if (q.length > 100) return NextResponse.json({ error: "Search is too long" }, { status: 400 });

  const url = new URL("https://musicbrainz.org/ws/2/artist/");
  url.searchParams.set("query", q);
  url.searchParams.set("fmt", "json");
  url.searchParams.set("limit", "10");

  try {
    const response = await fetch(url, {
      headers: {
        "Accept": "application/json",
        "User-Agent": "GigUniverse/0.1.0 (artist discovery prototype)"
      },
      next: { revalidate: 3600 }
    });
    if (!response.ok) {
      return NextResponse.json({ error: "MusicBrainz search failed" }, { status: response.status });
    }
    const data = await response.json();
    const artists = (data.artists ?? []).map((a: any) => ({
      id: a.id,
      name: a.name,
      type: a.type ?? "Artist",
      country: a.country ?? null,
      area: a.area?.name ?? a["begin-area"]?.name ?? null,
      disambiguation: a.disambiguation ?? "",
      tags: (a.tags ?? []).sort((x: any, y: any) => y.count - x.count).slice(0, 8).map((t: any) => t.name)
    }));
    return NextResponse.json({ artists });
  } catch {
    return NextResponse.json({ error: "Unable to reach MusicBrainz" }, { status: 502 });
  }
}
