import "dotenv/config";
import express from "express";
import cors from "cors";
import analyzeRoutes from "./routes/analyze.routes.js";
import watchlistRoutes from "./routes/watchlist.routes.js";
import nicheRoutes from "./routes/niche.routes.js";
import dashboardRoutes from "./routes/dashboard.routes.js";
import deepRoutes from "./routes/deep.routes.js";
import trendsRoutes from "./routes/trends.routes.js";
import ideasRoutes from "./routes/ideas.routes.js";
import monetizationRoutes from "./routes/monetization.routes.js";
import scansRoutes from "./routes/scans.routes.js";

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors());
app.use(express.json({ limit: "2mb" }));

app.get("/", (req, res) => {
  res.json({ message: "Viral Channel Analyzer Pro API is running" });
});

app.get("/api/health", (req, res) => {
  res.json({ status: "ok" });
});

app.use("/api/analyze", analyzeRoutes);
app.use("/api/watchlist", watchlistRoutes);
app.use("/api/niches", nicheRoutes);
app.use("/api/dashboard", dashboardRoutes);
app.use("/api/deep-analysis", deepRoutes);
app.use("/api/trends", trendsRoutes);
app.use("/api/ideas", ideasRoutes);
app.use("/api/monetization", monetizationRoutes);
app.use("/api/scans", scansRoutes);

app.use((req, res) => {
  res.status(404).json({ message: "Route not found" });
});

app.listen(PORT, () => {
  console.log(`Backend running at http://localhost:${PORT}`);
});
