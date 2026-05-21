import express from "express";
import { z } from "zod";
import { prisma } from "../prisma.js";
import { searchRecentVideos, getVideoStats, getChannelStats } from "../youtube.js";
import { buildNicheReport, calculateScores, matchesVideoFormatFilter } from "../scoring.js";

const router = express.Router();

const analyzeSchema = z.object({
  keyword: z.string().min(2, "keyword must be at least 2 characters"),
  regionCode: z.string().max(10).optional().default("US"),
  daysBack: z.coerce.number().int().min(1).max(365).default(30),
  maxChannelAgeDays: z.coerce.number().int().min(1).max(5000).default(365),
  maxResults: z.coerce.number().int().min(1).max(50).default(25),
  minVideoViews: z.coerce.number().int().min(0).default(0),
  videoFormatFilter: z.enum(["all", "shorts", "standard", "videos", "mid-form", "long-form"]).optional().default("all"),
});

function normalizeRegionCode(regionCode) {
  const value = String(regionCode || "").trim().toUpperCase();
  return value === "GLOBAL" || value === "ANY" ? "" : value;
}

function toBigInt(value) {
  const parsed = Number(value || 0);
  if (!Number.isFinite(parsed) || parsed < 0) return BigInt(0);
  return BigInt(Math.floor(parsed));
}

function numberFromStat(value) {
  const parsed = Number(value || 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function bestThumbnail(thumbnails = {}) {
  return (
    thumbnails.maxres?.url ||
    thumbnails.standard?.url ||
    thumbnails.high?.url ||
    thumbnails.medium?.url ||
    thumbnails.default?.url ||
    null
  );
}

function compactApiError(error) {
  const apiError = error.response?.data?.error;
  if (!apiError) return error.message;

  return {
    message: apiError.message,
    code: apiError.code,
    errors: apiError.errors,
  };
}

async function getRecentRuns(limit = 10) {
  return prisma.analysisRun.findMany({
    orderBy: { createdAt: "desc" },
    take: limit,
    include: {
      _count: {
        select: { results: true },
      },
    },
  });
}

async function createSnapshots({ channelId, videoId, channelStats, videoStats, source = "analysis" }) {
  await prisma.channelSnapshot.create({
    data: {
      youtubeChannelId: channelId,
      subscriberCount: toBigInt(channelStats.subscriberCount),
      totalViewCount: toBigInt(channelStats.viewCount),
      videoCount: toBigInt(channelStats.videoCount),
      source,
    },
  });

  if (videoId) {
    await prisma.videoSnapshot.create({
      data: {
        youtubeVideoId: videoId,
        viewCount: toBigInt(videoStats.viewCount),
        likeCount: toBigInt(videoStats.likeCount),
        commentCount: toBigInt(videoStats.commentCount),
        source,
      },
    });
  }
}

router.post("/", async (req, res) => {
  let run = null;

  try {
    const parsedInput = analyzeSchema.parse(req.body);
    const input = {
      ...parsedInput,
      keyword: parsedInput.keyword.trim(),
      regionCode: normalizeRegionCode(parsedInput.regionCode),
    };

    run = await prisma.analysisRun.create({
      data: {
        keyword: input.keyword,
        regionCode: input.regionCode || null,
        daysBack: input.daysBack,
        maxChannelAgeDays: input.maxChannelAgeDays,
        maxResults: input.maxResults,
        minVideoViews: input.minVideoViews,
        videoFormatFilter: input.videoFormatFilter,
        status: "running",
      },
    });

    const searchItems = await searchRecentVideos(input);
    const videoIds = searchItems.map((item) => item.id?.videoId).filter(Boolean);
    const videos = await getVideoStats(videoIds);

    const channelIds = [
      ...new Set(videos.map((video) => video.snippet?.channelId).filter(Boolean)),
    ];

    const channels = await getChannelStats(channelIds);
    const channelMap = new Map(channels.map((channel) => [channel.id, channel]));
    const grouped = new Map();

    for (const video of videos) {
      const videoSnippet = video.snippet || {};
      const videoStats = video.statistics || {};
      const channel = channelMap.get(videoSnippet.channelId);
      if (!channel) continue;

      const channelSnippet = channel.snippet || {};
      const channelStats = channel.statistics || {};
      const scoreData = calculateScores({ video, channel });
      const videoViews = numberFromStat(videoStats.viewCount);

      if (scoreData.channelAgeDays > input.maxChannelAgeDays) continue;
      if (videoViews < input.minVideoViews) continue;
      if (!matchesVideoFormatFilter(scoreData.videoFormat, input.videoFormatFilter)) continue;

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

      await createSnapshots({
        channelId: channel.id,
        videoId: video.id,
        channelStats,
        videoStats,
        source: "analysis",
      });

      await prisma.analysisResult.create({
        data: {
          runId: run.id,
          youtubeChannelId: channel.id,
          youtubeVideoId: video.id,
          viralScore: scoreData.viralScore,
          opportunityScore: scoreData.opportunityScore,
          channelAgeDays: scoreData.channelAgeDays,
          viewsPerSubscriber: scoreData.viewsPerSubscriber,
          videoFormat: scoreData.videoFormat,
          recommendation: scoreData.recommendation,
          reason: scoreData.reason,
        },
      });

      const row = {
        channelId: channel.id,
        channelTitle: channelSnippet.title || "Untitled channel",
        channelUrl: `https://www.youtube.com/channel/${channel.id}`,
        channelAgeDays: scoreData.channelAgeDays,
        subscribers: numberFromStat(channelStats.subscriberCount),
        totalChannelViews: numberFromStat(channelStats.viewCount),
        channelVideoCount: numberFromStat(channelStats.videoCount),
        country: channelSnippet.country || null,
        videoId: video.id,
        videoTitle: videoSnippet.title || "Untitled video",
        videoUrl: `https://www.youtube.com/watch?v=${video.id}`,
        videoPublishedAt: videoSnippet.publishedAt || null,
        videoViews,
        likes: numberFromStat(videoStats.likeCount),
        comments: numberFromStat(videoStats.commentCount),
        thumbnailUrl: bestThumbnail(videoSnippet.thumbnails),
        viralScore: scoreData.viralScore,
        opportunityScore: scoreData.opportunityScore,
        viewsPerSubscriber: scoreData.viewsPerSubscriber,
        viewsPerChannelAgeDay: scoreData.viewsPerChannelAgeDay,
        engagementRate: scoreData.engagementRate,
        durationSeconds: scoreData.durationSeconds,
        videoFormat: scoreData.videoFormat,
        recommendation: scoreData.recommendation,
        reason: scoreData.reason,
      };

      const existing = grouped.get(row.channelId);
      if (!existing) {
        grouped.set(row.channelId, { ...row, matchingVideoCount: 1, highOpportunityVideoCount: row.opportunityScore >= 70 ? 1 : 0 });
      } else {
        existing.matchingVideoCount += 1;
        if (row.opportunityScore >= 70) existing.highOpportunityVideoCount += 1;
        if (row.opportunityScore > existing.opportunityScore || row.viralScore > existing.viralScore) {
          grouped.set(row.channelId, {
            ...row,
            matchingVideoCount: existing.matchingVideoCount,
            highOpportunityVideoCount: existing.highOpportunityVideoCount,
          });
        }
      }
    }

    const results = [...grouped.values()].sort(
      (a, b) => b.opportunityScore - a.opportunityScore || b.viralScore - a.viralScore
    );

    const topScore = results[0]?.viralScore || 0;
    const topOpportunityScore = results[0]?.opportunityScore || 0;
    const report = buildNicheReport({ results, input });

    const completedRun = await prisma.analysisRun.update({
      where: { id: run.id },
      data: {
        status: "completed",
        totalVideosChecked: videos.length,
        totalChannelsFound: results.length,
        topScore,
        topOpportunityScore,
        reportJson: report,
      },
    });

    await prisma.nicheReport.upsert({
      where: { runId: completedRun.id },
      create: {
        runId: completedRun.id,
        keyword: input.keyword,
        regionCode: input.regionCode || null,
        videoFormatFilter: input.videoFormatFilter,
        opportunityLevel: report.opportunityLevel,
        nicheDifficulty: report.nicheDifficulty,
        creatorFitScore: Number(report.creatorFitScore || 0),
        bestFormat: report.bestFormat,
        averageOpportunityScore: Number(report.averageOpportunityScore || 0),
        averageViews: Number(report.averageViews || 0),
        averageSubscribers: Number(report.averageSubscribers || 0),
        shortsRatio: Number(report.shortsRatio || 0),
        longFormRatio: Number(report.longFormRatio || 0),
        titlePatterns: report.titlePatterns || [],
        hashtagPatterns: report.hashtagPatterns || [],
        reportJson: report,
      },
      update: {
        keyword: input.keyword,
        regionCode: input.regionCode || null,
        videoFormatFilter: input.videoFormatFilter,
        opportunityLevel: report.opportunityLevel,
        nicheDifficulty: report.nicheDifficulty,
        creatorFitScore: Number(report.creatorFitScore || 0),
        bestFormat: report.bestFormat,
        averageOpportunityScore: Number(report.averageOpportunityScore || 0),
        averageViews: Number(report.averageViews || 0),
        averageSubscribers: Number(report.averageSubscribers || 0),
        shortsRatio: Number(report.shortsRatio || 0),
        longFormRatio: Number(report.longFormRatio || 0),
        titlePatterns: report.titlePatterns || [],
        hashtagPatterns: report.hashtagPatterns || [],
        reportJson: report,
      },
    });

    const recentRuns = await getRecentRuns(8);

    res.json({
      runId: completedRun.id,
      run: completedRun,
      keyword: input.keyword,
      regionCode: input.regionCode || "GLOBAL",
      videoFormatFilter: input.videoFormatFilter,
      totalChannels: results.length,
      totalVideosChecked: videos.length,
      topScore,
      topOpportunityScore,
      report,
      recentRuns,
      results,
    });
  } catch (error) {
    if (run?.id) {
      await prisma.analysisRun.update({
        where: { id: run.id },
        data: {
          status: "failed",
          errorMessage:
            typeof compactApiError(error) === "string"
              ? compactApiError(error)
              : compactApiError(error)?.message || "Unknown error",
        },
      });
    }

    if (error instanceof z.ZodError) {
      return res.status(400).json({
        message: "Invalid request body",
        issues: error.issues,
      });
    }

    console.error("Analyze route error:", error.response?.data || error);

    res.status(500).json({
      message: "Failed to analyze YouTube channels",
      error: compactApiError(error),
    });
  }
});

router.get("/runs", async (req, res) => {
  const limit = Math.min(Number(req.query.limit || 25), 100);
  const runs = await getRecentRuns(limit);
  res.json({ runs });
});

router.get("/daily", async (req, res) => {
  const rows = await prisma.$queryRaw`
    SELECT
      DATE(created_at) AS day,
      COUNT(*)::int AS search_count,
      COALESCE(SUM(total_channels_found), 0)::int AS total_channels_found,
      COALESCE(SUM(total_videos_checked), 0)::int AS total_videos_checked,
      COALESCE(MAX(top_score), 0)::float AS top_score,
      COALESCE(MAX(top_opportunity_score), 0)::float AS top_opportunity_score
    FROM analysis_runs
    GROUP BY DATE(created_at)
    ORDER BY day DESC
    LIMIT 14
  `;

  res.json({
    days: rows.map((row) => ({
      day: row.day,
      searchCount: Number(row.search_count || 0),
      totalChannelsFound: Number(row.total_channels_found || 0),
      totalVideosChecked: Number(row.total_videos_checked || 0),
      topScore: Number(row.top_score || 0),
      topOpportunityScore: Number(row.top_opportunity_score || 0),
    })),
  });
});

export default router;
