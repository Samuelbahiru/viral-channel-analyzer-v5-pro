import express from "express";
import { z } from "zod";
import { prisma } from "../prisma.js";
import { getChannelStats, getVideoStats } from "../youtube.js";
import { calculateScores } from "../scoring.js";

const router = express.Router();

const saveSchema = z.object({
  channelId: z.string().min(3),
  videoId: z.string().min(3).optional().nullable(),
  runId: z.coerce.number().int().optional().nullable(),
  keyword: z.string().optional().nullable(),
  regionCode: z.string().optional().nullable(),
  viralScore: z.coerce.number().default(0),
  opportunityScore: z.coerce.number().default(0),
  reason: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
});

const updateSchema = z.object({
  status: z.enum(["watching", "priority", "ignored", "done"]).optional(),
  notes: z.string().max(1000).optional().nullable(),
});

function toNumber(value) {
  if (typeof value === "bigint") return Number(value);
  const parsed = Number(value || 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function toBigInt(value) {
  const parsed = Number(value || 0);
  if (!Number.isFinite(parsed) || parsed < 0) return BigInt(0);
  return BigInt(Math.floor(parsed));
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

async function createChannelSnapshot({ channelId, channelStats, source = "watchlist_refresh" }) {
  return prisma.channelSnapshot.create({
    data: {
      youtubeChannelId: channelId,
      subscriberCount: toBigInt(channelStats.subscriberCount),
      totalViewCount: toBigInt(channelStats.viewCount),
      videoCount: toBigInt(channelStats.videoCount),
      source,
    },
  });
}

async function createVideoSnapshot({ videoId, videoStats, source = "watchlist_refresh" }) {
  return prisma.videoSnapshot.create({
    data: {
      youtubeVideoId: videoId,
      viewCount: toBigInt(videoStats.viewCount),
      likeCount: toBigInt(videoStats.likeCount),
      commentCount: toBigInt(videoStats.commentCount),
      source,
    },
  });
}

function buildIdeaKit(saved) {
  const keyword = saved.savedKeyword || "this niche";
  const channelTitle = saved.channel?.title || "the saved channel";
  const format = saved.video?.videoFormat || "video";
  const base = keyword.replace(/\s+/g, " ").trim();

  return {
    contentDirection: `Study ${channelTitle} and test ${format} content around ${base}.`,
    titleIdeas: [
      `Why ${base} is getting attention right now`,
      `The ${base} moment people cannot stop watching`,
      `${base}: the simple idea behind this viral format`,
      `I tried the pattern behind a viral ${base} channel`,
      `What new creators can learn from ${channelTitle}`,
    ],
    productionChecklist: [
      "Capture the hook in the first 3 seconds",
      "Use one clear emotional or practical promise",
      "Keep the visual pattern repeatable",
      "Publish a 5-video test before judging the niche",
      "Track subscriber and view growth daily for at least one week",
    ],
  };
}

function mapGrowth(channelSnapshots = [], videoSnapshots = []) {
  const latestChannel = channelSnapshots[0];
  const previousChannel = channelSnapshots[1];
  const latestVideo = videoSnapshots[0];
  const previousVideo = videoSnapshots[1];

  return {
    channelSnapshots: channelSnapshots.map((snapshot) => ({
      id: snapshot.id,
      createdAt: snapshot.createdAt,
      subscriberCount: toNumber(snapshot.subscriberCount),
      totalViewCount: toNumber(snapshot.totalViewCount),
      videoCount: toNumber(snapshot.videoCount),
      source: snapshot.source,
    })),
    videoSnapshots: videoSnapshots.map((snapshot) => ({
      id: snapshot.id,
      createdAt: snapshot.createdAt,
      viewCount: toNumber(snapshot.viewCount),
      likeCount: toNumber(snapshot.likeCount),
      commentCount: toNumber(snapshot.commentCount),
      source: snapshot.source,
    })),
    subscriberDelta: latestChannel && previousChannel ? toNumber(latestChannel.subscriberCount) - toNumber(previousChannel.subscriberCount) : null,
    channelViewDelta: latestChannel && previousChannel ? toNumber(latestChannel.totalViewCount) - toNumber(previousChannel.totalViewCount) : null,
    videoViewDelta: latestVideo && previousVideo ? toNumber(latestVideo.viewCount) - toNumber(previousVideo.viewCount) : null,
    lastTrackedAt: latestChannel?.createdAt || latestVideo?.createdAt || null,
  };
}

function mapSavedChannel(saved, snapshotsByChannel = new Map(), snapshotsByVideo = new Map()) {
  const channelSnapshots = snapshotsByChannel.get(saved.youtubeChannelId) || [];
  const videoSnapshots = saved.youtubeVideoId ? snapshotsByVideo.get(saved.youtubeVideoId) || [] : [];
  const growth = mapGrowth(channelSnapshots, videoSnapshots);

  const mapped = {
    id: saved.id,
    channelId: saved.youtubeChannelId,
    videoId: saved.youtubeVideoId,
    sourceRunId: saved.sourceRunId,
    savedKeyword: saved.savedKeyword,
    savedRegionCode: saved.savedRegionCode,
    savedScore: Number(saved.savedScore || 0),
    savedOpportunityScore: Number(saved.savedOpportunityScore || 0),
    savedReason: saved.savedReason,
    notes: saved.notes,
    status: saved.status,
    createdAt: saved.createdAt,
    updatedAt: saved.updatedAt,
    growth,
    channel: saved.channel
      ? {
          channelId: saved.channel.youtubeChannelId,
          title: saved.channel.title,
          description: saved.channel.description,
          publishedAt: saved.channel.publishedAt,
          subscriberCount: toNumber(saved.channel.subscriberCount),
          hiddenSubscriberCount: saved.channel.hiddenSubscriberCount,
          totalViewCount: toNumber(saved.channel.totalViewCount),
          videoCount: toNumber(saved.channel.videoCount),
          thumbnailUrl: saved.channel.thumbnailUrl,
          country: saved.channel.country,
          customUrl: saved.channel.customUrl,
          channelUrl: `https://www.youtube.com/channel/${saved.channel.youtubeChannelId}`,
        }
      : null,
    video: saved.video
      ? {
          videoId: saved.video.youtubeVideoId,
          title: saved.video.title,
          publishedAt: saved.video.publishedAt,
          viewCount: toNumber(saved.video.viewCount),
          likeCount: toNumber(saved.video.likeCount),
          commentCount: toNumber(saved.video.commentCount),
          durationSeconds: saved.video.durationSeconds,
          videoFormat: saved.video.videoFormat,
          engagementRate: saved.video.engagementRate,
          thumbnailUrl: saved.video.thumbnailUrl,
          videoUrl: saved.video.videoUrl || `https://www.youtube.com/watch?v=${saved.video.youtubeVideoId}`,
        }
      : null,
  };

  mapped.ideaKit = buildIdeaKit(saved);
  return mapped;
}

async function getSavedChannels() {
  const rows = await prisma.savedChannel.findMany({
    orderBy: [{ status: "asc" }, { savedOpportunityScore: "desc" }, { updatedAt: "desc" }],
    include: {
      channel: true,
      video: true,
    },
  });

  const channelIds = rows.map((row) => row.youtubeChannelId);
  const videoIds = rows.map((row) => row.youtubeVideoId).filter(Boolean);

  const [channelSnapshots, videoSnapshots] = await Promise.all([
    channelIds.length
      ? prisma.channelSnapshot.findMany({
          where: { youtubeChannelId: { in: channelIds } },
          orderBy: { createdAt: "desc" },
        })
      : [],
    videoIds.length
      ? prisma.videoSnapshot.findMany({
          where: { youtubeVideoId: { in: videoIds } },
          orderBy: { createdAt: "desc" },
        })
      : [],
  ]);

  const snapshotsByChannel = new Map();
  for (const snapshot of channelSnapshots) {
    if (!snapshotsByChannel.has(snapshot.youtubeChannelId)) snapshotsByChannel.set(snapshot.youtubeChannelId, []);
    if (snapshotsByChannel.get(snapshot.youtubeChannelId).length < 2) snapshotsByChannel.get(snapshot.youtubeChannelId).push(snapshot);
  }

  const snapshotsByVideo = new Map();
  for (const snapshot of videoSnapshots) {
    if (!snapshotsByVideo.has(snapshot.youtubeVideoId)) snapshotsByVideo.set(snapshot.youtubeVideoId, []);
    if (snapshotsByVideo.get(snapshot.youtubeVideoId).length < 2) snapshotsByVideo.get(snapshot.youtubeVideoId).push(snapshot);
  }

  return rows.map((row) => mapSavedChannel(row, snapshotsByChannel, snapshotsByVideo));
}

async function refreshOneSavedChannel(saved) {
  const [channel] = await getChannelStats([saved.youtubeChannelId]);
  let updatedChannelStats = null;
  let updatedVideoStats = null;

  if (channel) {
    const channelSnippet = channel.snippet || {};
    const channelStats = channel.statistics || {};
    updatedChannelStats = channelStats;

    await prisma.channel.update({
      where: { youtubeChannelId: saved.youtubeChannelId },
      data: {
        title: channelSnippet.title || saved.channel?.title || "Untitled channel",
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

    await createChannelSnapshot({ channelId: saved.youtubeChannelId, channelStats });
  }

  if (saved.youtubeVideoId) {
    const [video] = await getVideoStats([saved.youtubeVideoId]);
    if (video) {
      const videoSnippet = video.snippet || {};
      const videoStats = video.statistics || {};
      updatedVideoStats = videoStats;
      const fallbackChannel = channel || { snippet: saved.channel || {}, statistics: updatedChannelStats || {} };
      const scoreData = channel ? calculateScores({ video, channel }) : { durationSeconds: null, videoFormat: "unknown", engagementRate: 0 };

      await prisma.video.update({
        where: { youtubeVideoId: saved.youtubeVideoId },
        data: {
          title: videoSnippet.title || saved.video?.title || "Untitled video",
          publishedAt: videoSnippet.publishedAt ? new Date(videoSnippet.publishedAt) : null,
          viewCount: toBigInt(videoStats.viewCount),
          likeCount: toBigInt(videoStats.likeCount),
          commentCount: toBigInt(videoStats.commentCount),
          durationSeconds: scoreData.durationSeconds,
          videoFormat: scoreData.videoFormat,
          engagementRate: scoreData.engagementRate,
          thumbnailUrl: bestThumbnail(videoSnippet.thumbnails),
          videoUrl: `https://www.youtube.com/watch?v=${saved.youtubeVideoId}`,
        },
      });

      await createVideoSnapshot({ videoId: saved.youtubeVideoId, videoStats });
      void fallbackChannel;
    }
  }

  await prisma.savedChannel.update({
    where: { youtubeChannelId: saved.youtubeChannelId },
    data: { updatedAt: new Date() },
  });
}

router.get("/", async (req, res) => {
  const channels = await getSavedChannels();
  res.json({ channels });
});

router.post("/", async (req, res) => {
  try {
    const input = saveSchema.parse(req.body);

    const saved = await prisma.savedChannel.upsert({
      where: { youtubeChannelId: input.channelId },
      create: {
        youtubeChannelId: input.channelId,
        youtubeVideoId: input.videoId || null,
        sourceRunId: input.runId || null,
        savedKeyword: input.keyword || null,
        savedRegionCode: input.regionCode || null,
        savedScore: input.viralScore || 0,
        savedOpportunityScore: input.opportunityScore || 0,
        savedReason: input.reason || null,
        notes: input.notes || null,
        status: "watching",
      },
      update: {
        youtubeVideoId: input.videoId || undefined,
        sourceRunId: input.runId || undefined,
        savedKeyword: input.keyword || undefined,
        savedRegionCode: input.regionCode || undefined,
        savedScore: input.viralScore || 0,
        savedOpportunityScore: input.opportunityScore || 0,
        savedReason: input.reason || undefined,
        notes: input.notes || undefined,
        status: "watching",
      },
      include: { channel: true, video: true },
    });

    res.status(201).json({ channel: mapSavedChannel(saved) });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ message: "Invalid request body", issues: error.issues });
    }

    console.error("Save watchlist error:", error);
    res.status(500).json({ message: "Failed to save channel" });
  }
});

router.patch("/:channelId", async (req, res) => {
  try {
    const input = updateSchema.parse(req.body);
    const saved = await prisma.savedChannel.update({
      where: { youtubeChannelId: req.params.channelId },
      data: input,
      include: { channel: true, video: true },
    });

    res.json({ channel: mapSavedChannel(saved) });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ message: "Invalid request body", issues: error.issues });
    }

    console.error("Update watchlist error:", error);
    res.status(500).json({ message: "Failed to update saved channel" });
  }
});

router.post("/refresh-all", async (req, res) => {
  try {
    const savedChannels = await prisma.savedChannel.findMany({ include: { channel: true, video: true } });
    for (const saved of savedChannels) {
      await refreshOneSavedChannel(saved);
    }

    const channels = await getSavedChannels();
    res.json({ refreshed: savedChannels.length, channels });
  } catch (error) {
    console.error("Refresh all watchlist error:", error.response?.data || error);
    res.status(500).json({ message: "Failed to refresh saved channels" });
  }
});

router.get("/:channelId/ideas", async (req, res) => {
  try {
    const saved = await prisma.savedChannel.findUnique({
      where: { youtubeChannelId: req.params.channelId },
      include: { channel: true, video: true },
    });

    if (!saved) return res.status(404).json({ message: "Saved channel not found" });
    res.json({ ideaKit: buildIdeaKit(saved) });
  } catch (error) {
    console.error("Idea kit error:", error);
    res.status(500).json({ message: "Failed to build idea kit" });
  }
});

router.post("/:channelId/refresh", async (req, res) => {
  try {
    const saved = await prisma.savedChannel.findUnique({
      where: { youtubeChannelId: req.params.channelId },
      include: { channel: true, video: true },
    });

    if (!saved) {
      return res.status(404).json({ message: "Saved channel not found" });
    }

    await refreshOneSavedChannel(saved);

    const refreshed = await prisma.savedChannel.findUnique({
      where: { youtubeChannelId: req.params.channelId },
      include: { channel: true, video: true },
    });

    res.json({ channel: mapSavedChannel(refreshed) });
  } catch (error) {
    console.error("Refresh watchlist error:", error.response?.data || error);
    res.status(500).json({ message: "Failed to refresh saved channel" });
  }
});

router.delete("/:channelId", async (req, res) => {
  try {
    await prisma.savedChannel.delete({
      where: { youtubeChannelId: req.params.channelId },
    });
    res.json({ success: true });
  } catch (error) {
    console.error("Remove watchlist error:", error);
    res.status(500).json({ message: "Failed to remove saved channel" });
  }
});

export default router;
