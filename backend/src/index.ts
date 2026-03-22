import "dotenv/config";
import express from "express";
import analyzeRouter from "./routes/analyze.js";
import preferencesRouter from "./routes/preferences.js";

const app = express();
const PORT = process.env.PORT ?? 3000;

app.use(express.json());

// Health check
app.get("/health", (_req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

app.use("/analyze", analyzeRouter);
app.use("/preferences", preferencesRouter);

app.listen(PORT, () => {
  console.log(`Communication Bridge API running on http://localhost:${PORT}`);
  console.log(`  POST http://localhost:${PORT}/analyze`);
  console.log(`  GET  http://localhost:${PORT}/health`);
});
