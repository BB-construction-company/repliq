import Groq from "groq-sdk";
import type { AnalyzeRequest, AnalyzeResponse, Message } from "../types/index.js";

const FALLBACK_RESPONSE: AnalyzeResponse = {
  tone_summary: "Unable to analyze",
  tone_flag: "unclear",
  explanation: "The analysis service is temporarily unavailable. Please try again.",
  possible_meanings: [
    { text: "Message could not be analyzed at this time.", likelihood: "high" },
  ],
  suggested_reply: null,
  compose_rewrite: null,
  flag_reason: null,
};

function buildDecodePrompt(req: AnalyzeRequest): string {
  const history = req.history
    .slice(-8)
    .map((m: Message) => `${m.sender}: ${m.text}`)
    .join("\n");

  const prefs = req.user_preferences.receiving.length
    ? req.user_preferences.receiving.join("; ")
    : "No specific preferences set.";

  return `You are a workplace communication assistant. Analyze the tone and subtext of an email message and help the receiver understand what the sender likely meant.

RECEIVER PREFERENCES (how this user prefers communication):
${prefs}

CONVERSATION HISTORY (most recent last):
${history || "(no prior messages)"}

CURRENT MESSAGE FROM: ${req.current_message.sender}
"${req.current_message.text}"

Return ONLY a valid JSON object with this exact schema - no markdown, no preamble:
{
  "tone_summary": "<one short phrase describing the overall tone>",
  "tone_flag": "<neutral|caution|unclear>",
  "explanation": "<2-3 sentences explaining the likely intent behind this message>",
  "possible_meanings": [
    { "text": "<interpretation>", "likelihood": "<high|medium|low>" },
    { "text": "<interpretation>", "likelihood": "<high|medium|low>" }
  ],
  "suggested_reply": "<a ready-to-use reply the receiver can send to check in, or null>",
  "compose_rewrite": null,
  "flag_reason": null
}

Rules:
- tone_flag must be exactly one of: neutral, caution, unclear
- possible_meanings must have 2-3 items
- Frame interpretations as possibilities ("this message may indicate..."), never as certainties
- suggested_reply should be a brief, natural check-in message, or null if the message is clearly neutral`;
}

function buildComposePrompt(req: AnalyzeRequest): string {
  const context = req.history
    .slice(-4)
    .map((m: Message) => `${m.sender}: ${m.text}`)
    .join("\n");

  return `You are a workplace communication clarity checker. Analyze the following email draft for ambiguity patterns that may confuse or cause anxiety in the recipient.

CONVERSATION CONTEXT:
${context || "(new message, no prior context)"}

DRAFT BEING COMPOSED:
"${req.current_message.text}"

Common ambiguity patterns to check for:
- Indirect time references ("at some point", "soon", "whenever")
- Softening language that obscures actual meaning ("that's fine", "no worries")
- Implied urgency with no explicit signal
- Rhetorical questions that may be read literally
- Requests buried inside hedging language

Return ONLY a valid JSON object with this exact schema - no markdown, no preamble:
{
  "tone_summary": "<one short phrase>",
  "tone_flag": "<neutral|caution|unclear>",
  "explanation": "<why this draft may be ambiguous, or confirm it is clear>",
  "possible_meanings": [
    { "text": "<how recipient might interpret this>", "likelihood": "<high|medium|low>" }
  ],
  "suggested_reply": null,
  "compose_rewrite": "<a rewritten version of the draft that is clearer, or null if no issues found>",
  "flag_reason": "<brief description of what is ambiguous, or null if nothing found>"
}

Rules:
- If the draft is clear with no ambiguity, set compose_rewrite to null and tone_flag to neutral
- tone_flag must be exactly one of: neutral, caution, unclear
- possible_meanings must have 1-3 items`;
}

export async function analyzeWithGemini(req: AnalyzeRequest): Promise<AnalyzeResponse> {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    throw new Error("GROQ_API_KEY is not set in environment variables.");
  }

  const groq = new Groq({ apiKey });

  const prompt = req.mode === "decode"
    ? buildDecodePrompt(req)
    : buildComposePrompt(req);

  const result = await groq.chat.completions.create({
    model: "llama-3.3-70b-versatile",
    messages: [{ role: "user", content: prompt }],
    temperature: 0.3,
    response_format: { type: "json_object" },
  });

  const text = result.choices[0].message.content?.trim() ?? "";

  let parsed: AnalyzeResponse;
  try {
    parsed = JSON.parse(text) as AnalyzeResponse;
  } catch {
    console.error("Groq returned non-JSON response:", text);
    return FALLBACK_RESPONSE;
  }

  // Normalize tone_flag to a valid enum value
  const validFlags = ["neutral", "caution", "unclear"] as const;
  if (!validFlags.includes(parsed.tone_flag)) {
    parsed.tone_flag = "unclear";
  }

  return parsed;
}
