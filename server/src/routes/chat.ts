import { Router } from "express";
import multer from "multer";
import OpenAI, { toFile } from "openai";
import { z } from "zod";

import { ASSISTANT_SYSTEM } from "../prompts/wellnessChat.js";
import { getOpenAIChatModel, hasOpenAIKey } from "../services/openaiConfig.js";

export const chatRouter = Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 15 * 1024 * 1024 },
});

const chatBodySchema = z.object({
  messages: z
    .array(
      z.object({
        role: z.enum(["user", "assistant"]),
        content: z.string().min(1).max(12_000),
      })
    )
    .min(1)
    .max(24),
});

chatRouter.post("/", async (req, res) => {
  if (!hasOpenAIKey()) {
    res.status(503).json({
      error:
        "Chat requires OPENAI_API_KEY on the server. Add it in server/.env and restart.",
    });
    return;
  }
  const parsed = chatBodySchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }
  try {
    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    const model = getOpenAIChatModel();
    const completion = await openai.chat.completions.create({
      model,
      messages: [
        { role: "system", content: ASSISTANT_SYSTEM },
        ...parsed.data.messages,
      ],
      max_tokens: 700,
      temperature: 0.55,
    });
    const reply = completion.choices[0]?.message?.content?.trim();
    if (!reply) {
      res.status(502).json({ error: "Empty model response" });
      return;
    }
    res.json({ reply });
  } catch (e) {
    console.error(e);
    res.status(500).json({
      error: e instanceof Error ? e.message : "Chat failed",
    });
  }
});

chatRouter.post("/transcribe", upload.single("audio"), async (req, res) => {
  if (!hasOpenAIKey()) {
    res.status(503).json({
      error:
        "Transcription requires OPENAI_API_KEY. Whisper runs on OpenAI servers.",
    });
    return;
  }
  if (!req.file?.buffer?.length) {
    res.status(400).json({ error: "Missing audio file (field name: audio)" });
    return;
  }
  const mime = req.file.mimetype || "audio/m4a";
  const ext =
    mime.includes("wav") ? "wav" : mime.includes("webm") ? "webm" : "m4a";
  try {
    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    const file = await toFile(req.file.buffer, `clip.${ext}`, { type: mime });
    const tr = await openai.audio.transcriptions.create({
      file,
      model: "whisper-1",
    });
    const text = tr.text?.trim();
    if (!text) {
      res.status(502).json({ error: "No speech recognized" });
      return;
    }
    res.json({ text });
  } catch (e) {
    console.error(e);
    res.status(500).json({
      error: e instanceof Error ? e.message : "Transcription failed",
    });
  }
});
