import express from "express";
import { prisma } from "../prisma.js";

const router = express.Router();

router.get("/reports", async (req, res) => {
  const limit = Math.min(Number(req.query.limit || 12), 50);
  const reports = await prisma.nicheReport.findMany({
    orderBy: { createdAt: "desc" },
    take: limit,
    include: {
      run: {
        select: {
          id: true,
          keyword: true,
          regionCode: true,
          daysBack: true,
          maxChannelAgeDays: true,
          minVideoViews: true,
          videoFormatFilter: true,
          totalChannelsFound: true,
          totalVideosChecked: true,
          createdAt: true,
        },
      },
    },
  });

  res.json({ reports });
});

router.get("/reports/:id", async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) {
    return res.status(400).json({ message: "Invalid report id" });
  }

  const report = await prisma.nicheReport.findUnique({
    where: { id },
    include: {
      run: {
        include: {
          results: {
            orderBy: { opportunityScore: "desc" },
            take: 25,
          },
        },
      },
    },
  });

  if (!report) {
    return res.status(404).json({ message: "Niche report not found" });
  }

  res.json({ report });
});

export default router;
