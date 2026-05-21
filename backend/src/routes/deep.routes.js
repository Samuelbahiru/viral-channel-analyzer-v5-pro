import express from "express";
import { z } from "zod";
import { prisma } from "../prisma.js";
import { getChannelStats, getVideoStats, searchChannelRecentVideos } from "../youtube.js";
import { calculateScores } from "../scoring.js";
import {
  average,
  bestThumbnail,
  calcUploadCadence,
  clamp,
  dominantFormatFromRows,
  formatBreakdown,
  safeNumber,
  toBigInt,
  topTerms,
} from "../insightUtils.js";

const router = express.Router();

const deepSchema = z.object({
  channelId: z.string().min(5),
  maxResults: z.coerce.number().int().min(5).max(50).default(25),
});

function mapVideo(video, channel) {
  const videoSnippet = video.snippet || {};
  const videoStats = video.statistics || {};
  const scoreData = calculateScores({ video, channel });
  return {
    videoId: video.id,
    title: videoSnippet.title || "Untitled video",
    publishedAt: videoSnippet.publishedAt || null,
    views: safeNumber(videoStats.viewCount),
    likes: safeNumber(videoStats.likeCount),
    comments: safeNumber(videoStats.commentCount),
    engagementRate: scoreData.engagementRate,
    durationSeconds: scoreData.durationSeconds,
    videoFormat: scoreData.videoFormat,
    opportunityScore: scoreData.opportunityScore,
    viralScore: scoreData.viralScore,
    thumbnailUrl: bestThumbnail(videoSnippet.thumbnails),
    videoUrl: `https://www.youtube.com/watch?v=${video.id}`,
  };
}

function buildDeepReport({ channel, videos, maxResults }) {
  const channelSnippet = channel.snippet || {};
  const channelStats = channel.statistics || {};
  const rows = videos.map((video) => mapVideo(video, channel));
  const sortedByViews = [...rows].sort((a, b) => b.views - a.views);
  const avgViews = Math.round(average(rows, "views"));
  const avgEngagement = Number(average(rows, "engagementRate").toFixed(2));
  const avgOpportunity = Math.round(average(rows, "opportunityScore"));
  const dominantFormat = dominantFormatFromRows(rows);
  const formatBreakdownData = formatBreakdown(rows, "videoFormat");
  const uploadCadence = calcUploadCadence(rows);
  const titlePatterns = topTerms(rows.map((video) => video.title), { limit: 12 });
  const hashtagPatterns = topTerms(rows.map((video) => video.title), { type: "hashtags", limit: 10 });
  const repeatedWinners = rows.filter((row) => row.views >= avgViews && row.opportunityScore >= 60).length;
  const repeatabilityScore = Math.round(clamp(avgOpportunity * 0.55 + repeatedWinners * 8 + (avgViews > 100000 ? 12 : 0), 0, 100));
  const copyDifficulty =
    dominantFormat === "shorts" && repeatabilityScore >= 65
      ? "Accessible"
      : avgViews > 500000 && repeatabilityScore < 55
        ? "Hard"
        : "Moderate";

  const strengths = [];
  if (repeatedWinners >= 3) strengths.push("Multiple videos show repeatable performance, not only one lucky spike.");
  if (dominantFormat === "shorts") strengths.push("Shorts are the dominant format, which is easier to test quickly.");
  if (avgEngagement >= 2) strengths.push("Engagement rate is strong compared with view volume.");
  if (avgOpportunity >= 65) strengths.push("Average opportunity score is high across recent videos.");
  if (!strengths.length) strengths.push("The channel has useful reference videos, but repeatability needs more validation.");

  const risks = [];
  if (rows.length < 8) risks.push("Small sample size. Fetch more videos before making a strong decision.");
  if (copyDifficulty === "Hard") risks.push("Performance may depend on creator identity, celebrity/news access, or existing audience.");
  if (safeNumber(channelStats.subscriberCount) > 250000) risks.push("The channel is no longer small; results may not represent beginner opportunity.");
  if (!risks.length) risks.push("No major red flag from the fetched sample, but track growth for several days.");

  const recommendedActions = [
    "Copy the repeatable structure, not the exact video or protected creative work.",
    "Build a 5-video test based on the top title/format patterns.",
    "Compare the top 3 videos with the bottom 3 videos to identify what changed in hook, topic, and packaging.",
    "Save this channel and refresh it daily to confirm growth momentum.",
  ];

  return {
    channelId: channel.id,
    channelTitle: channelSnippet.title || "Untitled channel",
    channelUrl: `https://www.youtube.com/channel/${channel.id}`,
    thumbnailUrl: bestThumbnail(channelSnippet.thumbnails),
    subscribers: safeNumber(channelStats.subscriberCount),
    totalViews: safeNumber(channelStats.viewCount),
    totalVideos: safeNumber(channelStats.videoCount),
    maxResults,
    videosAnalyzed: rows.length,
    averageViews: avgViews,
    averageEngagement: avgEngagement,
    averageOpportunityScore: avgOpportunity,
    dominantFormat,
    formatBreakdown: formatBreakdownData,
    uploadCadence,
    repeatabilityScore,
    copyDifficulty,
    titlePatterns,
    hashtagPatterns,
    topVideos: sortedByViews.slice(0, 6),
    weakVideos: [...rows].sort((a, b) => a.views - b.views).slice(0, 4),
    strengths,
    risks,
    recommendedActions,
    decision: repeatabilityScore >= 75 ? "Strong competitor to model" : repeatabilityScore >= 55 ? "Useful reference, validate more" : "Weak repeatability signal",
  };
}

async function upsertChannelAndVideos(channel, videos) {
  const channelSnippet = channel.snippet || {};
  const channelStats = channel.statistics || {};
  await prisma.channel.upsert({
    where: { youtubeChannelId: channel.id },
    create: {
      youtubeChannelId: channel.id,
      title: channelSnippet.title || "Untitled channel",
      description: channelSnippet.description || null,
      publishedAt: channelSnippet.publishedAt ? new Date(channelSnippet.publishedAt) : null,
      subscriberCount: toBigInt(channelStats.subscriberCount),
      hiddenSubscriberCount: Boolean(channelStats.hiddenSubscriberCount),
      totalViewCount: toBigInt(channelStats.viewCount),
      videoCount: toBigInt(channelStats.videoCount),
      thumbnailUrl: bestThumbnail(channelSnippet.thumbnails),
      country: channelSnippet.country || null,
      customUrl: channelSnippet.customUrl || null,
    },
    update: {
      title: channelSnippet.title || "Untitled channel",
      description: channelSnippet.description || null,
      publishedAt: channelSnippet.publishedAt ? new Date(channelSnippet.publishedAt) : null,
      subscriberCount: toBigInt(channelStats.subscriberCount),
      hiddenSubscriberCount: Boolean(channelStats.hiddenSubscriberCount),
      totalViewCount: toBigInt(channelStats.viewCount),
      videoCount: toBigInt(channelStats.videoCount),
      thumbnailUrl: bestThumbnail(channelSnippet.thumbnails),
      country: channelSnippet.country || null,
      customUrl: channelSnippet.customUrl || null,
    },
  });

  await prisma.channelSnapshot.create({
    data: {
      youtubeChannelId: channel.id,
      subscriberCount: toBigInt(channelStats.subscriberCount),
      totalViewCount: toBigInt(channelStats.viewCount),
      videoCount: toBigInt(channelStats.videoCount),
      source: "deep_analysis",
    },
  });

  for (const video of videos) {
    const videoSnippet = video.snippet || {};
    const videoStats = video.statistics || {};
    const scoreData = calculateScores({ video, channel });
    await prisma.video.upsert({
      where: { youtubeVideoId: video.id },
      create: {
        youtubeVideoId: video.id,
        youtubeChannelId: channel.id,
        title: videoSnippet.title || "Untitled video",
        publishedAt: videoSnippet.publishedAt ? new Date(videoSnippet.publishedAt) : null,
        viewCount: toBigInt(videoStats.viewCount),
        likeCount: toBigInt(videoStats.likeCount),
        commentCount: toBigInt(videoStats.commentCount),
        durationSeconds: scoreData.durationSeconds,
        videoFormat: scoreData.videoFormat,
        engagementRate: scoreData.engagementRate,
        thumbnailUrl: bestThumbnail(videoSnippet.thumbnails),
        videoUrl: `https://www.youtube.com/watch?v=${video.id}`,
      },
      update: {
        title: videoSnippet.title || "Untitled video",
        publishedAt: videoSnippet.publishedAt ? new Date(videoSnippet.publishedAt) : null,
        viewCount: toBigInt(videoStats.viewCount),
        likeCount: toBigInt(videoStats.likeCount),
        commentCount: toBigInt(videoStats.commentCount),
        durationSeconds: scoreData.durationSeconds,
        videoFormat: scoreData.videoFormat,
        engagementRate: scoreData.engagementRate,
        thumbnailUrl: bestThumbnail(videoSnippet.thumbnails),
        videoUrl: `https://www.youtube.com/watch?v=${video.id}`,
      },
    });
    await prisma.videoSnapshot.create({
      data: {
        youtubeVideoId: video.id,
        viewCount: toBigInt(videoStats.viewCount),
        likeCount: toBigInt(videoStats.likeCount),
        commentCount: toBigInt(videoStats.commentCount),
        source: "deep_analysis",
      },
    });
  }
}

router.post("/", async (req, res) => {
  try {
    const input = deepSchema.parse(req.body);
    const [channel] = await getChannelStats([input.channelId]);
    if (!channel) return res.status(404).json({ message: "Channel not found" });

    const searchItems = await searchChannelRecentVideos({ channelId: input.channelId, maxResults: input.maxResults });
    const videoIds = searchItems.map((item) => item.id?.videoId).filter(Boolean);
    const videos = await getVideoStats(videoIds);
    await upsertChannelAndVideos(channel, videos);

    const report = buildDeepReport({ channel, videos, maxResults: input.maxResults });
    const saved = await prisma.deepChannelAnalysis.create({
      data: {
        youtubeChannelId: channel.id,
        channelTitle: report.channelTitle,
        maxResults: input.maxResults,
        totalVideos: report.videosAnalyzed,
        averageViews: report.averageViews,
        averageEngagement: report.averageEngagement,
        dominantFormat: report.dominantFormat,
        uploadCadence: report.uploadCadence,
        repeatabilityScore: report.repeatabilityScore,
        copyDifficulty: report.copyDifficulty,
        reportJson: report,
      },
    });

    res.json({ analysis: { ...report, id: saved.id, createdAt: saved.createdAt } });
  } catch (error) {
    console.error(error.response?.data || error);
    res.status(500).json({ message: "Failed to run deep channel analysis", error: error.response?.data?.error?.message || error.message });
  }
});

router.get("/", async (req, res) => {
  const limit = Math.min(Number(req.query.limit || 12), 50);
  const rows = await prisma.deepChannelAnalysis.findMany({ orderBy: { createdAt: "desc" }, take: limit });
  res.json({ analyses: rows });
});

router.get("/:id", async (req, res) => {
  const id = Number(req.params.id);
  const row = await prisma.deepChannelAnalysis.findUnique({ where: { id } });
  if (!row) return res.status(404).json({ message: "Deep analysis not found" });
  res.json({ analysis: row });
});

export default router;
