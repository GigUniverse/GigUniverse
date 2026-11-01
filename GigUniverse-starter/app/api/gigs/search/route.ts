import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

type GigResult = {
  source: string; sourceId: string; sourceUrl: string; artistId: string;
  artistName: string; venue: string; city: string; country: string;
  date: string; tour: string;
};

function isoDate(value: string): string {
  const match = /^(\d{2})-(\d{2})-(\d{4})$/.exec(value || "");
  return match ? `${match[3]}-${match[2]}-${match[1]}` : "";
}

export async function GET(request: NextRequest) {
  const artistId = request.nextUrl.searchParams.get("artistId")?.trim();
  const artistName = request.nextUrl.searchParams.get("artistName")?.trim() || "";
  const venue = request.nextUrl.searchParams.get("venue")?.trim() || "";
  const city = request.nextUrl.searchParams.get("city")?.trim() || "";
  if (!artistId || !/^[0-9a-f-]{36}$/i.test(artistId)) {
    return NextResponse.json({ error: "Choose a valid MusicBrainz artist first.", gigs: [] }, { status: 400 });
  }
  if (!venue && !city) return NextResponse.json({ error: "Enter a venue or city to narrow the historical search.", gigs: [] }, { status: 400 });

  const apiKey = process.env.SETLISTFM_API_KEY;
  if (apiKey) {
    const url = new URL("https://api.setlist.fm/rest/1.0/search/setlists");
    url.searchParams.set("artistMbid", artistId);
    if (venue) url.searchParams.set("venueName", venue);
    if (city) url.searchParams.set("cityName", city);
    url.searchParams.set("p", "1");
    try {
      const response = await fetch(url, { headers: { Accept: "application/json", "x-api-key": apiKey }, cache: "no-store" });
      if (!response.ok) throw new Error(`setlist.fm returned ${response.status}`);
      const payload = await response.json();
      const gigs: GigResult[] = (payload.setlist ?? []).map((item: any) => ({
        source: "setlist.fm", sourceId: String(item.id ?? item.versionId ?? ""),
        sourceUrl: String(item.url ?? ""), artistId,
        artistName: String(item.artist?.name ?? artistName), venue: String(item.venue?.name ?? "Unknown venue"),
        city: String(item.venue?.city?.name ?? ""), country: String(item.venue?.city?.country?.name ?? ""),
        date: isoDate(String(item.eventDate ?? "")), tour: String(item.tour?.name ?? ""),
      })).filter((item: GigResult) => item.date && item.venue);
      return NextResponse.json({ gigs, source: "setlist.fm", total: payload.total ?? gigs.length, attribution: "setlist.fm" });
    } catch (error) {
      return NextResponse.json({ error: error instanceof Error ? error.message : "Historical search failed.", gigs: [] }, { status: 502 });
    }
  }

  // MusicBrainz has a community-maintained event index. Coverage is less complete than specialist gig archives.
  try {
    const query = [`arid:${artistId}`, venue ? `place:"${venue.replace(/["\\]/g, " ")}"` : "", city ? `area:"${city.replace(/["\\]/g, " ")}"` : ""].filter(Boolean).join(" AND ");
    const url = new URL("https://musicbrainz.org/ws/2/event/");
    url.searchParams.set("query", query); url.searchParams.set("fmt", "json"); url.searchParams.set("limit", "25");
    const response = await fetch(url, { headers: { Accept: "application/json", "User-Agent": "GigUniverse/0.5.0 (gig history feature)" }, next: { revalidate: 3600 } });
    if (!response.ok) throw new Error(`MusicBrainz returned ${response.status}`);
    const payload = await response.json();
    const found = (payload.events ?? []).slice(0, 8);
    const gigs: GigResult[] = [];
    for (let index = 0; index < found.length; index++) {
      if (index > 0) await new Promise(resolve => setTimeout(resolve, 1100));
      const event = found[index];
      const detailUrl = new URL(`https://musicbrainz.org/ws/2/event/${event.id}`);
      detailUrl.searchParams.set("inc", "artist-rels+place-rels"); detailUrl.searchParams.set("fmt", "json");
      const detailResponse = await fetch(detailUrl, { headers: { Accept: "application/json", "User-Agent": "GigUniverse/0.5.0 (gig history feature)" }, next: { revalidate: 3600 } });
      const detail = detailResponse.ok ? await detailResponse.json() : event;
      const rels = detail.relations ?? [];
      const place = rels.find((r: any) => r.place)?.place;
      gigs.push({
        source: "MusicBrainz", sourceId: String(event.id ?? ""), sourceUrl: `https://musicbrainz.org/event/${event.id}`,
        artistId, artistName, venue: String(place?.name ?? "Venue not recorded"),
        city: String(place?.area?.name ?? ""), country: "", date: String(detail["life-span"]?.begin ?? event["life-span"]?.begin ?? ""), tour: String(event.name ?? ""),
      });
    }
    const validGigs = gigs.filter((item: GigResult) => item.date && item.venue !== "Venue not recorded");
    return NextResponse.json({ gigs: validGigs, source: "MusicBrainz", total: payload.count ?? validGigs.length, note: "MusicBrainz event coverage is community-maintained and may be incomplete. You can always add a gig manually." });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Historical search failed.", gigs: [] }, { status: 502 });
  }
}
