import { Router, Request, Response } from "express";
import { z } from "zod";
import { analyzeWithGemini } from "../services/gemini.js";
import type { AnalyzeRequest } from "../types/index.js";

const router = Router();

const MessageSchema = z.object({
  sender: z.string().min(1),
  text: z.string().min(1),
});

const AnalyzeRequestSchema = z.object({
  current_message: MessageSchema,
  history: z.array(MessageSchema).max(8).default([]),
  user_preferences: z
    .object({
      receiving: z.array(z.string()).default([]),
      sending: z.array(z.string()).default([]),
      ambiguous: z.array(z.string()).default([]),
    })
    .default({ receiving: [], sending: [], ambiguous: [] }),
  mode: z.enum(["decode", "compose"]),
});

// Hardcoded fallback preferences used when none are provided (iteration 1)
const HARDCODED_PREFERENCES = {
  receiving: [
    "Be explicit about urgency",
    "Get to the point early",
    "Avoid sarcasm or irony",
  ],
  sending: [
    "State requests directly",
    "Avoid vague time references like 'soon' or 'at some point'",
  ],
  ambiguous: ["Flag indirect phrases", "Clarify implied criticism"],
};

router.post("/", async (req: Request, res: Response): Promise<void> => {
  const parsed = AnalyzeRequestSchema.safeParse(req.body);

  if (!parsed.success) {
    res.status(400).json({
      error: "Invalid request payload",
      details: parsed.error.flatten(),
    });
    return;
  }

  const payload: AnalyzeRequest = {
    ...parsed.data,
    // Merge hardcoded prefs if user hasn't provided any (iteration 1 — no DB yet)
    user_preferences: {
      receiving:
        parsed.data.user_preferences.receiving.length
          ? parsed.data.user_preferences.receiving
          : HARDCODED_PREFERENCES.receiving,
      sending:
        parsed.data.user_preferences.sending.length
          ? parsed.data.user_preferences.sending
          : HARDCODED_PREFERENCES.sending,
      ambiguous:
        parsed.data.user_preferences.ambiguous.length
          ? parsed.data.user_preferences.ambiguous
          : HARDCODED_PREFERENCES.ambiguous,
    },
  };

  try {
    const analysis = await analyzeWithGemini(payload);
    res.status(200).json(analysis);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("[/analyze] Gemini call failed:", message);
    res.status(500).json({ error: "Analysis failed", details: message });
  }
});

export default router;
