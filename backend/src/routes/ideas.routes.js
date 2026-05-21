import express from "express";
import { z } from "zod";
import { prisma } from "../prisma.js";
import { generateStrategicActions, formatKeyword } from "../insightUtils.js";

const router = express.Router();

const ideaSchema = z.object({
  keyword: z.string().optional(),
  channelId: z.string().optional(),
  nicheReportId: z.coerce.number().int().optional(),
  formatPreference: z.enum(["mixed", "shorts", "mid-form", "long-form"]).optional().default("mixed"),
});

function buildIdeas({ keyword, channel, report, formatPreference }) {
  const niche = formatKeyword(keyword || report?.keyword || channel?.title || "creator niche");
  const format = formatPreference === "mixed" ? report?.bestFormat || channel?.video?.videoFormat || "shorts" : formatPreference;
  const angleBase = niche || "this niche";
  const shortMode = format === "shorts";

  const hooks = shortMode
    ? [
        `Most creators miss this simple ${angleBase} pattern...`,
        `This small channel got attention because of one clear hook.`,
        `Before you start ${angleBase}, study this first.`,
        `The first 2 seconds decide everything in this niche.`,
        `Here is why this ${angleBase} idea keeps getting views.`,
      ]
    : [
        `I studied new channels in ${angleBase}, and this pattern kept appearing.`,
        `This is the structure behind the best-performing videos in ${angleBase}.`,
        `A beginner-friendly way to enter ${angleBase} without copying anyone.`,
        `The packaging mistake most new creators make in ${angleBase}.`,
        `What small channels are doing differently in ${angleBase}.`,
      ];

  const titleIdeas = [
    `Why New ${angleBase} Channels Are Growing Fast`,
    `I Studied Viral ${angleBase} Channels — Here Is the Pattern`,
    `${angleBase}: 5 Video Ideas New Creators Can Test`,
    `The Hidden Format Behind Viral ${angleBase} Videos`,
    `Before You Start a ${angleBase} Channel, Watch This`,
    `Small Channels Are Winning With This ${angleBase} Strategy`,
    `The Beginner-Friendly ${angleBase} Content Plan`,
    `How to Find Viral Ideas in ${angleBase}`,
    `The Simple ${angleBase} Hook That Gets Attention`,
    `What I Would Post First in a New ${angleBase} Channel`,
  ];

  const thumbnailConcepts = [
    `Large emotional subject on one side, clean 3-word promise on the other, strong contrast, niche object/symbol in background.`,
    `Before/after split showing ordinary creator vs viral content pattern, minimal text, clear focal point.`,
    `One bold question with a surprised face or symbolic image, uncluttered background, high readability on mobile.`,
    `Visualize the niche outcome: growth arrow, video card, or content scene with one dominant color accent.`,
  ];

  const scriptStructures = [
    {
      name: shortMode ? "30-second Shorts structure" : "6-minute analysis structure",
      steps: shortMode
        ? ["0–2s: direct curiosity hook", "3–10s: show the pattern", "11–22s: explain why it works", "23–30s: clear takeaway or next video tease"]
        : ["Hook with result", "Show competitor evidence", "Break down title/thumbnail/format", "Explain beginner version", "Give 5 test ideas", "End with action step"],
    },
  ];

  return {
    niche: angleBase,
    formatPreference: format,
    contentDirection: shortMode
      ? `Start with short, repeatable ${angleBase} tests that prove demand fast.`
      : `Build structured ${angleBase} videos that explain, compare, or emotionally develop one clear idea.`,
    hooks,
    titleIdeas,
    thumbnailConcepts,
    scriptStructures,
    postingPlan: shortMode
      ? ["Post 2 Shorts per day for 10 days", "Repeat winning hook patterns", "Keep each test under 45 seconds", "Review view velocity after 24 hours"]
      : ["Publish 2 long-form videos per week", "Use Shorts as teasers", "Compare average view duration and CTR", "Update titles after 48 hours if needed"],
    ethicalCopyRules: [
      "Do not reupload another creator's video, music, voice, image, or edit.",
      "Copy the strategy and structure only: hook style, topic angle, pacing, and packaging logic.",
      "Add your own script, visuals, voice, examples, and point of view.",
    ],
    strategicActions: generateStrategicActions({ keyword: angleBase, format, score: report?.creatorFitScore || 0 }),
  };
}

router.post("/generate", async (req, res) => {
  try {
    const input = ideaSchema.parse(req.body);
    const [channel, report] = await Promise.all([
      input.channelId
        ? prisma.savedChannel.findUnique({ where: { youtubeChannelId: input.channelId }, include: { channel: true, video: true } })
        : null,
      input.nicheReportId ? prisma.nicheReport.findUnique({ where: { id: input.nicheReportId } }) : null,
    ]);

    const ideas = buildIdeas({
      keyword: input.keyword,
      channel,
      report,
      formatPreference: input.formatPreference,
    });

    const saved = await prisma.contentIdeaSet.create({
      data: {
        keyword: ideas.niche,
        youtubeChannelId: input.channelId || null,
        sourceType: input.nicheReportId ? "niche_report" : input.channelId ? "saved_channel" : "manual",
        formatPreference: ideas.formatPreference,
        creatorFitScore: Number(report?.creatorFitScore || channel?.savedOpportunityScore || 0),
        ideasJson: ideas,
      },
    });

    res.json({ ideaSet: { id: saved.id, createdAt: saved.createdAt, ...ideas } });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Failed to generate content ideas", error: error.message });
  }
});

router.get("/", async (req, res) => {
  const limit = Math.min(Number(req.query.limit || 20), 50);
  const rows = await prisma.contentIdeaSet.findMany({ orderBy: { createdAt: "desc" }, take: limit });
  res.json({ ideaSets: rows });
});

export default router;
