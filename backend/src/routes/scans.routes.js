import express from "express";
import { z } from "zod";
import { prisma } from "../prisma.js";

const router = express.Router();

const scanSchema = z.object({
  name: z.string().min(2),
  keyword: z.string().min(2),
  regionCode: z.string().max(10).optional().nullable(),
  daysBack: z.coerce.number().int().min(1).max(365).default(30),
  maxChannelAgeDays: z.coerce.number().int().min(1).max(5000).default(365),
  maxResults: z.coerce.number().int().min(1).max(50).default(25),
  minVideoViews: z.coerce.number().int().min(0).default(10000),
  videoFormatFilter: z.string().default("all"),
  cadence: z.string().default("daily"),
  active: z.boolean().optional().default(true),
});

router.get("/", async (req, res) => {
  const scans = await prisma.scheduledScan.findMany({ orderBy: [{ active: "desc" }, { updatedAt: "desc" }] });
  res.json({ scans });
});

router.post("/", async (req, res) => {
  try {
    const input = scanSchema.parse(req.body);
    const scan = await prisma.scheduledScan.create({ data: input });
    res.json({ scan });
  } catch (error) {
    res.status(400).json({ message: "Failed to create scan", error: error.message });
  }
});

router.patch("/:id", async (req, res) => {
  try {
    const id = Number(req.params.id);
    const data = scanSchema.partial().parse(req.body);
    const scan = await prisma.scheduledScan.update({ where: { id }, data });
    res.json({ scan });
  } catch (error) {
    res.status(400).json({ message: "Failed to update scan", error: error.message });
  }
});

router.delete("/:id", async (req, res) => {
  await prisma.scheduledScan.delete({ where: { id: Number(req.params.id) } });
  res.json({ ok: true });
});

export default router;
