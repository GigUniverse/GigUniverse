export function artistRecency(dates: readonly string[], now = Date.now()) {
  const pastDates = dates.map(date => ({ date, time: Date.parse(`${date}T00:00:00Z`) }))
    .filter(({ date, time }) => /^\d{4}-\d{2}-\d{2}$/.test(date) && Number.isFinite(time) &&
      new Date(time).toISOString().slice(0, 10) === date && time <= now);
  if (!pastDates.length) return { attendedCount: 0, latestDate: null, brightness: null, description: "No past gigs logged" };

  const averageRecency = pastDates.reduce((sum, { time }) =>
    sum + Math.exp(-((now - time) / (365.25 * 24 * 60 * 60 * 1000)) / 8), 0) / pastDates.length;
  const effectiveYearsAgo = -8 * Math.log(averageRecency);
  return {
    attendedCount: pastDates.length,
    latestDate: pastDates.reduce((latest, { date }) => date > latest ? date : latest, ""),
    brightness: 0.25 + 0.75 * averageRecency,
    description: effectiveYearsAgo < 2 ? "Recently Seen" : effectiveYearsAgo < 10 ? "Seen in Recent Years" : "Long Ago",
  };
}
