import express from "express";
import { prisma } from "../prisma.js";
import { toNumber } from "../insightUtils.js";

const router = express.Router();

function groupByKeyword(rows) {
  const map = new Map();
  for (const row of rows) {
    const key = String(row.keyword || "unknown").toLowerCase();
    if (!map.has(key)) {
      map.set(key, { keyword: row.keyword, searches: 0, totalFit: 0, bestFit: 0, formats: new Map(), latestAt: row.createdAt });
    }
    const item = map.get(key);
    item.searches += 1;
    item.totalFit += Number(row.creatorFitScore || 0);
    item.bestFit = Math.max(item.bestFit, Number(row.creatorFitScore || 0));
    item.latestAt = row.createdAt > item.latestAt ? row.createdAt : item.latestAt;
    item.formats.set(row.bestFormat || "unknown", (item.formats.get(row.bestFormat || "unknown") || 0) + 1);
  }
  return [...map.values()].map((item) => ({
    keyword: item.keyword,
    searches: item.searches,
    averageCreatorFit: Math.round(item.totalFit / Math.max(item.searches, 1)),
    bestCreatorFit: Math.round(item.bestFit),
    dominantFormat: [...item.formats.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] || "unknown",
    latestAt: item.latestAt,
  })).sort((a, b) => b.bestCreatorFit - a.bestCreatorFit || b.searches - a.searches);
}

router.get("/", async (req, res) => {
  const days = Math.min(Number(req.query.days || 14), 90);
  const since = new Date();
  since.setDate(since.getDate() - days);

  const [reports, resultFormats, savedRows, snapshots] = await Promise.all([
    prisma.nicheReport.findMany({ where: { createdAt: { gte: since } }, orderBy: { createdAt: "desc" }, take: 200 }),
    prisma.analysisResult.groupBy({ by: ["videoFormat"], where: { createdAt: { gte: since } }, _count: { _all: true }, _avg: { opportunityScore: true, viralScore: true } }),
    prisma.savedChannel.findMany({ include: { channel: true }, take: 50, orderBy: { savedOpportunityScore: "desc" } }),
    prisma.channelSnapshot.findMany({ where: { createdAt: { gte: since } }, orderBy: { createdAt: "desc" }, take: 500 }),
  ]);

  const snapshotsByChannel = new Map();
  for (const snap of snapshots) {
    if (!snapshotsByChannel.has(snap.youtubeChannelId)) snapshotsByChannel.set(snap.youtubeChannelId, []);
    snapshotsByChannel.get(snap.youtubeChannelId).push(snap);
  }

  const growth = [];
  for (const saved of savedRows) {
    const snaps = snapshotsByChannel.get(saved.youtubeChannelId) || [];
    if (snaps.length < 2) continue;
    const latest = snaps[0];
    const oldest = snaps[snaps.length - 1];
    growth.push({
      channelId: saved.youtubeChannelId,
      title: saved.channel?.title || saved.youtubeChannelId,
      subscriberDelta: toNumber(latest.subscriberCount) - toNumber(oldest.subscriberCount),
      viewDelta: toNumber(latest.totalViewCount) - toNumber(oldest.totalViewCount),
      savedOpportunityScore: Number(saved.savedOpportunityScore || 0),
      latestAt: latest.createdAt,
    });
  }

  const risingNiches = groupByKeyword(reports);
  const formatMomentum = resultFormats.map((row) => ({
    format: row.videoFormat || "unknown",
    count: row._count._all,
    averageOpportunityScore: Math.round(row._avg.opportunityScore || 0),
    averageViralScore: Math.round(row._avg.viralScore || 0),
  })).sort((a, b) => b.averageOpportunityScore - a.averageOpportunityScore);

  const alerts = [];
  if (risingNiches[0]) alerts.push(`${risingNiches[0].keyword} has the strongest recent niche signal.`);
  if (formatMomentum[0]) alerts.push(`${formatMomentum[0].format} is the strongest recent content format.`);
  const fastest = growth.sort((a, b) => b.viewDelta - a.viewDelta)[0];
  if (fastest) alerts.push(`${fastest.title} is the fastest-growing saved channel in tracked views.`);
  if (!alerts.length) alerts.push("Not enough trend history yet. Run more searches and refresh saved channels daily.");

  res.json({ risingNiches, formatMomentum, fastestGrowingChannels: growth.slice(0, 10), alerts, since, days });
});

export default router;
