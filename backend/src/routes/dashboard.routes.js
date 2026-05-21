import express from "express";
import { prisma } from "../prisma.js";
import { toNumber } from "../insightUtils.js";

const router = express.Router();

function dayKey(date) {
  return new Date(date).toISOString().slice(0, 10);
}

router.get("/", async (req, res) => {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const last14 = new Date(today);
  last14.setDate(last14.getDate() - 13);

  const [
    totalSearches,
    searchesToday,
    savedChannels,
    nicheReports,
    deepAnalyses,
    ideaSets,
    monetizationReports,
    recentRuns,
    recentReports,
    savedRows,
    formatRows,
    dailyRuns,
  ] = await Promise.all([
    prisma.analysisRun.count(),
    prisma.analysisRun.count({ where: { createdAt: { gte: today } } }),
    prisma.savedChannel.count(),
    prisma.nicheReport.count(),
    prisma.deepChannelAnalysis.count(),
    prisma.contentIdeaSet.count(),
    prisma.monetizationReport.count(),
    prisma.analysisRun.findMany({ orderBy: { createdAt: "desc" }, take: 8 }),
    prisma.nicheReport.findMany({ orderBy: { createdAt: "desc" }, take: 10 }),
    prisma.savedChannel.findMany({ orderBy: { savedOpportunityScore: "desc" }, take: 8, include: { channel: true, video: true } }),
    prisma.analysisResult.groupBy({ by: ["videoFormat"], _count: { _all: true }, _avg: { opportunityScore: true } }),
    prisma.analysisRun.findMany({ where: { createdAt: { gte: last14 } }, orderBy: { createdAt: "asc" } }),
  ]);

  const dailyMap = new Map();
  for (let i = 0; i < 14; i += 1) {
    const d = new Date(last14);
    d.setDate(last14.getDate() + i);
    dailyMap.set(dayKey(d), { date: dayKey(d), searches: 0 });
  }
  for (const run of dailyRuns) {
    const key = dayKey(run.createdAt);
    dailyMap.set(key, { date: key, searches: (dailyMap.get(key)?.searches || 0) + 1 });
  }

  const topNiches = recentReports
    .map((row) => ({
      id: row.id,
      keyword: row.keyword,
      creatorFitScore: Number(row.creatorFitScore || 0),
      opportunityLevel: row.opportunityLevel,
      bestFormat: row.bestFormat,
      createdAt: row.createdAt,
    }))
    .sort((a, b) => b.creatorFitScore - a.creatorFitScore)
    .slice(0, 6);

  const topSavedChannels = savedRows.map((row) => ({
    id: row.id,
    channelId: row.youtubeChannelId,
    title: row.channel?.title || row.youtubeChannelId,
    score: Number(row.savedOpportunityScore || row.savedScore || 0),
    subscribers: toNumber(row.channel?.subscriberCount),
    videoViews: toNumber(row.video?.viewCount),
    thumbnailUrl: row.channel?.thumbnailUrl || row.video?.thumbnailUrl,
    status: row.status,
  }));

  res.json({
    stats: {
      totalSearches,
      searchesToday,
      savedChannels,
      nicheReports,
      deepAnalyses,
      ideaSets,
      monetizationReports,
      bestCreatorFit: topNiches[0]?.creatorFitScore || 0,
      bestSavedChannelScore: topSavedChannels[0]?.score || 0,
    },
    charts: {
      dailySearches: [...dailyMap.values()],
      topNiches,
      formatMix: formatRows.map((row) => ({
        format: row.videoFormat || "unknown",
        count: row._count._all,
        avgOpportunityScore: Math.round(row._avg.opportunityScore || 0),
      })),
    },
    recentRuns,
    topSavedChannels,
  });
});

export default router;
