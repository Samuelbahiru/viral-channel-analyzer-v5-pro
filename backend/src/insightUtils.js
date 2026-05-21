import dayjs from "dayjs";

export function safeNumber(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

export function toBigInt(value) {
  const parsed = Number(value || 0);
  if (!Number.isFinite(parsed) || parsed < 0) return BigInt(0);
  return BigInt(Math.floor(parsed));
}

export function toNumber(value) {
  const number = Number(value || 0);
  return Number.isFinite(number) ? number : 0;
}

export function clamp(value, min = 0, max = 100) {
  return Math.max(min, Math.min(max, value));
}

export function average(items, getter) {
  if (!Array.isArray(items) || !items.length) return 0;
  return items.reduce((sum, item) => sum + safeNumber(typeof getter === "function" ? getter(item) : item?.[getter]), 0) / items.length;
}

export function bestThumbnail(thumbnails = {}) {
  return (
    thumbnails.maxres?.url ||
    thumbnails.standard?.url ||
    thumbnails.high?.url ||
    thumbnails.medium?.url ||
    thumbnails.default?.url ||
    null
  );
}

export function formatKeyword(value = "") {
  return String(value || "").trim().replace(/\s+/g, " ");
}

export function topTerms(texts, { type = "words", limit = 10 } = {}) {
  const stopWords = new Set([
    "the", "and", "for", "with", "from", "this", "that", "your", "you", "are", "was", "have", "has", "not",
    "new", "official", "video", "music", "shorts", "short", "full", "live", "part", "episode", "how", "why", "what",
    "in", "on", "to", "of", "a", "an", "is", "it", "at", "by", "or", "as", "my", "our", "their", "when", "who", "will"
  ]);
  const counts = new Map();

  for (const text of texts || []) {
    const source = String(text || "").toLowerCase();
    const tokens =
      type === "hashtags"
        ? source.match(/#[\p{L}\p{N}_-]+/gu) || []
        : source.replace(/#[\p{L}\p{N}_-]+/gu, " ").match(/[\p{L}\p{N}]{3,}/gu) || [];
    for (const token of tokens) {
      if (type !== "hashtags" && stopWords.has(token)) continue;
      counts.set(token, (counts.get(token) || 0) + 1);
    }
  }

  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, limit)
    .map(([term, count]) => ({ term, count }));
}

export function formatBreakdown(rows, key = "videoFormat") {
  return (rows || []).reduce((acc, row) => {
    const value = row?.[key] || "unknown";
    acc[value] = (acc[value] || 0) + 1;
    return acc;
  }, {});
}

export function dominantFormatFromRows(rows = []) {
  const counts = formatBreakdown(rows, "videoFormat");
  return Object.entries(counts).sort((a, b) => b[1] - a[1])[0]?.[0] || "unknown";
}

export function calcUploadCadence(videos = []) {
  const dates = videos
    .map((video) => video.publishedAt || video.videoPublishedAt || video.snippet?.publishedAt)
    .filter(Boolean)
    .map((value) => dayjs(value))
    .filter((value) => value.isValid())
    .sort((a, b) => a.valueOf() - b.valueOf());

  if (dates.length < 2) return "Not enough data";
  const first = dates[0];
  const last = dates[dates.length - 1];
  const days = Math.max(1, last.diff(first, "day"));
  const perWeek = (dates.length / days) * 7;
  if (perWeek >= 14) return `${perWeek.toFixed(1)} uploads/week — aggressive daily volume`;
  if (perWeek >= 7) return `${perWeek.toFixed(1)} uploads/week — daily publishing`;
  if (perWeek >= 3) return `${perWeek.toFixed(1)} uploads/week — consistent cadence`;
  if (perWeek >= 1) return `${perWeek.toFixed(1)} uploads/week — weekly cadence`;
  return `${perWeek.toFixed(1)} uploads/week — low frequency`;
}

export function opportunityLevel(score = 0) {
  const n = Number(score || 0);
  if (n >= 80) return "High";
  if (n >= 65) return "Strong";
  if (n >= 50) return "Medium";
  return "Watch";
}

export function generateStrategicActions({ keyword = "this niche", format = "mixed", score = 0 } = {}) {
  const base = formatKeyword(keyword) || "this niche";
  const formatText = format === "shorts" ? "Shorts" : format === "long-form" ? "long-form videos" : "mixed formats";
  const actions = [
    `Create a 7-day test sprint for ${base} using ${formatText}.`,
    "Save 5–10 competitor channels and refresh them daily before scaling.",
    "Copy the packaging pattern ethically: hook, structure, pacing, topic angle, not the exact creative work.",
    "Track views per subscriber, not only raw views.",
  ];
  if (score >= 75) actions.unshift("Prioritize this niche now; the current signal is strong enough for production testing.");
  if (format === "shorts") actions.push("Use 20–45 second videos with a strong first 2 seconds and clear caption style.");
  return actions;
}
