import express from "express";
import { z } from "zod";
import { prisma } from "../prisma.js";
import { clamp, formatKeyword } from "../insightUtils.js";

const router = express.Router();

const schema = z.object({
  keyword: z.string().min(2).optional(),
  nicheReportId: z.coerce.number().int().optional(),
});

function classifyPotential(score) {
  if (score >= 80) return "High";
  if (score >= 60) return "Medium-high";
  if (score >= 40) return "Medium";
  return "Low";
}

function buildMonetization({ keyword, report }) {
  const niche = formatKeyword(keyword || report?.keyword || "selected niche");
  const lower = niche.toLowerCase();
  const fit = Number(report?.creatorFitScore || 50);
  const views = Number(report?.averageViews || 0);
  const isBusiness = /business|finance|software|ai|tech|marketing|real estate|car|cars|laptop|review/.test(lower);
  const isMusic = /music|song|worship|mezmur|lyrics|suno/.test(lower);
  const isFaith = /christian|bible|jesus|worship|prayer|church/.test(lower);
  const isEducation = /learn|tutorial|how to|education|course|study/.test(lower);
  const isEntertainment = /funny|celebrity|drama|movie|reaction|shorts/.test(lower);

  const adsenseScore = clamp((views > 100000 ? 25 : 10) + fit * 0.45 + (isBusiness || isEducation ? 20 : isEntertainment ? 8 : 12), 0, 100);
  const affiliateScore = clamp((isBusiness || isTechLike(lower) || /car|review|laptop|camera|software/.test(lower) ? 70 : 25) + fit * 0.25, 0, 100);
  const sponsorshipScore = clamp((isBusiness || isEducation || /car|review|tech|fitness/.test(lower) ? 55 : 25) + fit * 0.3, 0, 100);
  const productScore = clamp((isEducation || isFaith || isBusiness || isMusic ? 60 : 25) + fit * 0.3, 0, 100);
  const communityScore = clamp((isFaith || isEducation || isMusic ? 65 : 25) + fit * 0.25, 0, 100);
  const streamingScore = clamp(isMusic ? 75 + fit * 0.2 : 15 + fit * 0.1, 0, 100);
  const monetizationScore = Math.round((adsenseScore + affiliateScore + sponsorshipScore + productScore + communityScore + streamingScore) / 6);

  const recommendations = [];
  if (affiliateScore >= 60) recommendations.push("Build product comparison pages, affiliate links, and review videos around buyer-intent topics.");
  if (productScore >= 60) recommendations.push("Create a digital product: guide, presets, template pack, mini-course, or devotional/content kit.");
  if (communityScore >= 60) recommendations.push("Build community monetization with memberships, supporters, or premium resources.");
  if (streamingScore >= 60) recommendations.push("For music niches, distribute tracks outside YouTube and build playlists around repeat listening.");
  if (adsenseScore >= 60) recommendations.push("Prioritize longer videos when possible because watch time and ad inventory matter.");
  if (!recommendations.length) recommendations.push("Validate demand first. Do not build monetization until repeatable views are proven.");

  return {
    keyword: niche,
    monetizationScore,
    adsensePotential: classifyPotential(adsenseScore),
    affiliatePotential: classifyPotential(affiliateScore),
    sponsorshipPotential: classifyPotential(sponsorshipScore),
    productPotential: classifyPotential(productScore),
    communityPotential: classifyPotential(communityScore),
    streamingPotential: classifyPotential(streamingScore),
    scoreBreakdown: {
      adsenseScore: Math.round(adsenseScore),
      affiliateScore: Math.round(affiliateScore),
      sponsorshipScore: Math.round(sponsorshipScore),
      productScore: Math.round(productScore),
      communityScore: Math.round(communityScore),
      streamingScore: Math.round(streamingScore),
    },
    recommendations,
    monetizationLadder: [
      "Stage 1: Validate topic with views and saved-channel tracking.",
      "Stage 2: Build repeatable content series.",
      "Stage 3: Add YouTube monetization and affiliate/product links where appropriate.",
      "Stage 4: Build owned audience: email list, website, community, or product funnel.",
    ],
  };
}

function isTechLike(lower) {
  return /ai|software|app|code|laptop|phone|camera|tech|digital|tool/.test(lower);
}

router.post("/report", async (req, res) => {
  try {
    const input = schema.parse(req.body);
    const report = input.nicheReportId
      ? await prisma.nicheReport.findUnique({ where: { id: input.nicheReportId } })
      : input.keyword
        ? await prisma.nicheReport.findFirst({ where: { keyword: { contains: input.keyword, mode: "insensitive" } }, orderBy: { createdAt: "desc" } })
        : null;
    const monetization = buildMonetization({ keyword: input.keyword, report });
    const saved = await prisma.monetizationReport.create({
      data: {
        keyword: monetization.keyword,
        nicheReportId: input.nicheReportId || report?.id || null,
        adsensePotential: monetization.adsensePotential,
        affiliatePotential: monetization.affiliatePotential,
        sponsorshipPotential: monetization.sponsorshipPotential,
        productPotential: monetization.productPotential,
        communityPotential: monetization.communityPotential,
        monetizationScore: monetization.monetizationScore,
        reportJson: monetization,
      },
    });
    res.json({ report: { id: saved.id, createdAt: saved.createdAt, ...monetization } });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Failed to create monetization report", error: error.message });
  }
});

router.get("/reports", async (req, res) => {
  const limit = Math.min(Number(req.query.limit || 20), 50);
  const rows = await prisma.monetizationReport.findMany({ orderBy: { createdAt: "desc" }, take: limit });
  res.json({ reports: rows });
});

export default router;
