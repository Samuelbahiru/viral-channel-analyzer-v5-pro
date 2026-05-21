import dayjs from "dayjs";

function safeNumber(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function average(items, key) {
  if (!items.length) return 0;
  return items.reduce((sum, item) => sum + Number(item[key] || 0), 0) / items.length;
}

function topTerms(texts, { type = "words", limit = 8 } = {}) {
  const stopWords = new Set([
    "the", "and", "for", "with", "from", "this", "that", "your", "you", "are", "was", "have", "has", "not",
    "new", "official", "video", "music", "shorts", "short", "full", "live", "part", "episode", "how", "why", "what",
    "in", "on", "to", "of", "a", "an", "is", "it", "at", "by", "or", "as"
  ]);

  const counts = new Map();

  for (const text of texts) {
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

export function parseIsoDurationToSeconds(duration) {
  if (!duration || typeof duration !== "string") return null;
  const match = duration.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  if (!match) return null;
  const hours = Number(match[1] || 0);
  const minutes = Number(match[2] || 0);
  const seconds = Number(match[3] || 0);
  return hours * 3600 + minutes * 60 + seconds;
}

export function classifyVideoFormat(durationSeconds) {
  if (!durationSeconds && durationSeconds !== 0) return "unknown";
  if (durationSeconds <= 65) return "shorts";
  if (durationSeconds <= 300) return "mid-form";
  return "long-form";
}

export function matchesVideoFormatFilter(videoFormat, filter = "all") {
  const normalized = String(filter || "all").toLowerCase();
  if (normalized === "all") return true;
  if (normalized === "shorts") return videoFormat === "shorts";
  if (normalized === "standard") return videoFormat === "mid-form" || videoFormat === "long-form";
  if (normalized === "videos") return videoFormat === "mid-form" || videoFormat === "long-form";
  if (normalized === "mid-form") return videoFormat === "mid-form";
  if (normalized === "long-form") return videoFormat === "long-form";
  return true;
}

export function calculateScores({ video, channel }) {
  const videoStats = video.statistics || {};
  const channelStats = channel.statistics || {};
  const channelSnippet = channel.snippet || {};
  const durationSeconds = parseIsoDurationToSeconds(video.contentDetails?.duration);
  const videoFormat = classifyVideoFormat(durationSeconds);

  const videoViews = safeNumber(videoStats.viewCount);
  const likes = safeNumber(videoStats.likeCount);
  const comments = safeNumber(videoStats.commentCount);
  const subscribers = safeNumber(channelStats.subscriberCount);
  const totalChannelViews = safeNumber(channelStats.viewCount);
  const channelVideoCount = safeNumber(channelStats.videoCount);
  const hiddenSubscriberCount = Boolean(channelStats.hiddenSubscriberCount);

  const channelCreatedAt = channelSnippet.publishedAt;
  const channelAgeDays = Math.max(
    1,
    channelCreatedAt ? dayjs().diff(dayjs(channelCreatedAt), "day") : 9999
  );

  const viewsPerSubscriber = subscribers > 0 ? videoViews / subscribers : videoViews;
  const viewsPerChannelAgeDay = videoViews / channelAgeDays;
  const averageChannelViewsPerVideo =
    channelVideoCount > 0 ? totalChannelViews / channelVideoCount : 0;
  const engagementRate = videoViews > 0 ? ((likes + comments) / videoViews) * 100 : 0;
  const engagementScore = likes + comments * 3;

  const viralScore =
    videoViews * 0.42 +
    viewsPerSubscriber * 850 +
    viewsPerChannelAgeDay * 22 +
    engagementScore * 4.5 +
    averageChannelViewsPerVideo * 0.08;

  const ageScore = channelAgeDays <= 30 ? 18 : channelAgeDays <= 90 ? 15 : channelAgeDays <= 180 ? 12 : channelAgeDays <= 365 ? 8 : 3;
  const lowSubCompetitionScore = hiddenSubscriberCount
    ? 5
    : subscribers <= 5000
      ? 18
      : subscribers <= 25000
        ? 15
        : subscribers <= 100000
          ? 10
          : subscribers <= 250000
            ? 6
            : 2;
  const demandScore = clamp(Math.log10(videoViews + 1) * 8, 0, 40);
  const viewsSubScore = clamp(Math.log10(viewsPerSubscriber + 1) * 13, 0, 22);
  const engagementOpportunityScore = clamp(engagementRate * 3.5, 0, 12);
  const formatScore = videoFormat === "shorts" ? 8 : videoFormat === "mid-form" ? 6 : videoFormat === "long-form" ? 5 : 2;
  const productionSimplicityScore = channelVideoCount <= 30 ? 8 : channelVideoCount <= 100 ? 6 : channelVideoCount <= 300 ? 4 : 2;

  const opportunityScore = clamp(
    ageScore +
      lowSubCompetitionScore +
      demandScore +
      viewsSubScore +
      engagementOpportunityScore +
      formatScore +
      productionSimplicityScore,
    0,
    100
  );

  const reasons = [];
  if (channelAgeDays <= 90) reasons.push("very new channel");
  else if (channelAgeDays <= 365) reasons.push("new channel");

  if (videoViews >= 1_000_000) reasons.push("million-view recent video");
  else if (videoViews >= 100_000) reasons.push("high recent video views");

  if (viewsPerSubscriber >= 20) reasons.push("extreme views per subscriber");
  else if (viewsPerSubscriber >= 5) reasons.push("strong views per subscriber");

  if (viewsPerChannelAgeDay >= 5000) reasons.push("strong views per channel age day");
  if (engagementRate >= 2) reasons.push("strong engagement rate");
  if (videoFormat === "shorts") reasons.push("shorts-led growth");

  let recommendation = "Watch this channel before copying the format.";
  if (opportunityScore >= 80) {
    recommendation = "High creator opportunity: study format, hook, posting pattern, and thumbnail/title structure.";
  } else if (opportunityScore >= 65) {
    recommendation = "Strong opportunity: test 5–10 similar ideas and monitor repeat performance.";
  } else if (opportunityScore >= 50) {
    recommendation = "Moderate opportunity: useful signal, but validate with more channels in the niche.";
  }

  return {
    viralScore: Math.round(viralScore),
    opportunityScore: Math.round(opportunityScore),
    channelAgeDays,
    viewsPerSubscriber: Number(viewsPerSubscriber.toFixed(2)),
    viewsPerChannelAgeDay: Math.round(viewsPerChannelAgeDay),
    engagementRate: Number(engagementRate.toFixed(2)),
    durationSeconds,
    videoFormat,
    recommendation,
    reason: reasons.length ? reasons.join(", ") : "moderate performance",
  };
}

export function buildNicheReport({ results, input }) {
  const safeResults = Array.isArray(results) ? results : [];
  const count = safeResults.length;

  if (!count) {
    return {
      keyword: input.keyword,
      videoFormatFilter: input.videoFormatFilter || "all",
      summary: "No strong candidates found with the current filters.",
      opportunityLevel: "Low",
      nicheDifficulty: "Unknown",
      creatorFitScore: 0,
      creatorRecommendation: "Lower the minimum views, expand the date range, test a broader keyword, or switch the Shorts/Videos filter.",
      bestFormat: "unknown",
      averageOpportunityScore: 0,
      averageViewsPerSubscriber: 0,
      averageViews: 0,
      averageSubscribers: 0,
      shortsRatio: 0,
      longFormRatio: 0,
      highOpportunityCount: 0,
      candidatesAnalyzed: 0,
      formatBreakdown: {},
      titlePatterns: [],
      hashtagPatterns: [],
      topSignals: [],
      contentAngles: [],
      strategicActions: [],
    };
  }

  const formatCounts = safeResults.reduce((acc, item) => {
    const format = item.videoFormat || "unknown";
    acc[format] = (acc[format] || 0) + 1;
    return acc;
  }, {});

  const bestFormat = Object.entries(formatCounts).sort((a, b) => b[1] - a[1])[0]?.[0] || "unknown";
  const avgOpportunity = Math.round(average(safeResults, "opportunityScore"));
  const avgViewsPerSubscriber = Number(average(safeResults, "viewsPerSubscriber").toFixed(2));
  const avgViews = Math.round(average(safeResults, "videoViews"));
  const avgSubscribers = Math.round(average(safeResults, "subscribers"));
  const highOpportunityCount = safeResults.filter((item) => item.opportunityScore >= 70).length;
  const highOpportunityRatio = highOpportunityCount / count;
  const shortsRatio = Number((((formatCounts.shorts || 0) / count) * 100).toFixed(1));
  const longFormRatio = Number((((formatCounts["long-form"] || 0) / count) * 100).toFixed(1));
  const standardVideoRatio = Number(((((formatCounts["mid-form"] || 0) + (formatCounts["long-form"] || 0)) / count) * 100).toFixed(1));

  const competitionPressure = avgSubscribers >= 500000 ? 24 : avgSubscribers >= 150000 ? 18 : avgSubscribers >= 50000 ? 12 : avgSubscribers >= 15000 ? 7 : 3;
  const repeatabilitySignal = highOpportunityRatio >= 0.4 ? 20 : highOpportunityRatio >= 0.25 ? 15 : highOpportunityRatio >= 0.15 ? 10 : 5;
  const demandSignal = clamp(Math.log10(avgViews + 1) * 8, 0, 35);
  const smallChannelSignal = avgSubscribers <= 25000 ? 18 : avgSubscribers <= 100000 ? 12 : avgSubscribers <= 250000 ? 7 : 3;
  const creatorFitScore = Math.round(clamp(avgOpportunity * 0.45 + repeatabilitySignal + demandSignal + smallChannelSignal - competitionPressure * 0.4, 0, 100));

  const nicheDifficulty =
    avgSubscribers >= 250000 && highOpportunityRatio < 0.25
      ? "Competitive"
      : avgSubscribers >= 100000 || highOpportunityRatio < 0.2
        ? "Moderate"
        : "Accessible";

  const titlePatterns = topTerms(safeResults.map((item) => item.videoTitle), { type: "words", limit: 10 });
  const hashtagPatterns = topTerms(safeResults.map((item) => item.videoTitle), { type: "hashtags", limit: 8 });

  const topSignals = [];
  if (highOpportunityCount >= 3) topSignals.push("Multiple high-opportunity channels found");
  if (avgViewsPerSubscriber >= 10) topSignals.push("View demand is much higher than subscriber base");
  if (bestFormat === "shorts") topSignals.push("Short-form content is leading discovery");
  if (bestFormat === "long-form") topSignals.push("Long-form videos are carrying demand");
  if (standardVideoRatio >= 60) topSignals.push("Non-Shorts videos are performing strongly");
  if (safeResults.some((item) => item.channelAgeDays <= 90)) topSignals.push("Very new channels are breaking through");
  if (avgSubscribers <= 25000 && avgViews >= 100000) topSignals.push("Small channels are getting meaningful reach");

  const opportunityLevel = creatorFitScore >= 78 ? "High" : creatorFitScore >= 62 ? "Medium-high" : creatorFitScore >= 45 ? "Medium" : "Low";
  const formatLabel = bestFormat === "shorts" ? "Shorts" : bestFormat === "long-form" ? "long-form videos" : bestFormat === "mid-form" ? "mid-form videos" : "mixed videos";

  const creatorRecommendation =
    creatorFitScore >= 78
      ? `This niche is strong. Test a focused ${formatLabel} sprint and save at least 5 channels for daily tracking.`
      : creatorFitScore >= 62
        ? `This niche is promising. Narrow the angle, compare adjacent keywords, and validate repeatability before scaling.`
        : creatorFitScore >= 45
          ? `This niche has mixed signals. Look for a sub-niche where smaller channels are breaking through.`
          : `This niche is weak under current filters. Broaden the date range, lower the views filter, or switch between Shorts and Videos.`;

  const contentAngles = [
    `Create ${bestFormat === "shorts" ? "30–60 second" : "structured"} videos around proven ${input.keyword} topics`,
    "Study the first 3 seconds, title hook, thumbnail, and upload frequency of the top candidates",
    "Build repeatable series formats instead of isolated random uploads",
    "Track saved channels for at least 3–7 days before deciding the niche is stable",
  ];

  const strategicActions = [
    bestFormat === "shorts"
      ? "Start with a Shorts testing sprint: 2–3 uploads per day for 10 days."
      : "Start with 5 focused standard videos and compare retention-driven topics.",
    "Save the top 5 channels and refresh them daily to confirm growth momentum.",
    "Avoid copying exact videos; copy the structure, hook, pacing, and packaging pattern ethically.",
    "Run the same keyword with both Shorts-only and Videos-only filters to compare opportunity quality.",
  ];

  return {
    keyword: input.keyword,
    regionCode: input.regionCode || "GLOBAL",
    videoFormatFilter: input.videoFormatFilter || "all",
    summary: `${count} candidate channel(s), ${highOpportunityCount} high-opportunity signal(s), dominant format: ${bestFormat}, creator fit: ${creatorFitScore}/100.`,
    opportunityLevel,
    nicheDifficulty,
    creatorFitScore,
    creatorRecommendation,
    bestFormat,
    averageOpportunityScore: avgOpportunity,
    averageViewsPerSubscriber: avgViewsPerSubscriber,
    averageViews: avgViews,
    averageSubscribers: avgSubscribers,
    shortsRatio,
    longFormRatio,
    standardVideoRatio,
    highOpportunityCount,
    candidatesAnalyzed: count,
    formatBreakdown: formatCounts,
    titlePatterns,
    hashtagPatterns,
    topSignals: topSignals.length ? topSignals : ["Candidate signals found, but more validation is needed"],
    contentAngles,
    strategicActions,
  };
}
