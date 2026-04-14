import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { Router } from "express";
import OpenAI from "openai";
import { z } from "zod";

import {
  countNutritionFinetuneEligible,
  exportNutritionFinetuneJsonl,
} from "../services/finetuneDataset.js";
import { hasOpenAIKey } from "../services/openaiConfig.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const finetuneDir = path.join(__dirname, "..", "..", "data", "finetune");

export const finetuneRouter = Router();

finetuneRouter.use((req, res, next) => {
  const expected = process.env.FINETUNE_ADMIN_SECRET?.trim();
  const got = req.header("x-finetune-secret");
  if (!expected || got !== expected) {
    res.status(403).json({
      error:
        "Set FINETUNE_ADMIN_SECRET in the server environment and send header X-Finetune-Secret with the same value.",
    });
    return;
  }
  next();
});

finetuneRouter.get("/nutrition/stats", (_req, res) => {
  const eligible = countNutritionFinetuneEligible();
  res.json({
    eligibleExamples: eligible,
    note: "OpenAI suggests roughly 10+ quality examples; more rows usually help.",
  });
});

finetuneRouter.post("/nutrition/export", (_req, res) => {
  try {
    const result = exportNutritionFinetuneJsonl();
    res.json({
      file: result.absolutePath,
      exampleCount: result.exampleCount,
      skippedIncomplete: result.skippedIncomplete,
      hint:
        result.exampleCount < 10
          ? "Few examples — log more meals before training for best results."
          : "Ready to upload and create a fine-tuning job.",
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Export failed" });
  }
});

const uploadSchema = z.object({
  filename: z.string().min(1).max(200),
});

finetuneRouter.post("/upload", async (req, res) => {
  if (!hasOpenAIKey()) {
    res.status(400).json({ error: "OPENAI_API_KEY is required for upload." });
    return;
  }
  const parsed = uploadSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }
  const base = path.basename(parsed.data.filename);
  const abs = path.join(finetuneDir, base);
  const resolved = path.resolve(abs);
  if (!resolved.startsWith(path.resolve(finetuneDir))) {
    res.status(400).json({ error: "Invalid path" });
    return;
  }
  if (!fs.existsSync(resolved)) {
    res.status(404).json({ error: "File not found under data/finetune/" });
    return;
  }
  try {
    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    const file = await openai.files.create({
      file: fs.createReadStream(resolved),
      purpose: "fine-tune",
    });
    res.json({ id: file.id, filename: file.filename, bytes: file.bytes });
  } catch (e) {
    console.error(e);
    res.status(500).json({
      error: e instanceof Error ? e.message : "OpenAI upload failed",
    });
  }
});

const jobSchema = z.object({
  training_file: z.string().min(1),
  model: z.string().optional(),
  suffix: z.string().max(40).optional(),
});

finetuneRouter.post("/jobs", async (req, res) => {
  if (!hasOpenAIKey()) {
    res.status(400).json({ error: "OPENAI_API_KEY is required." });
    return;
  }
  const parsed = jobSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }
  const baseModel =
    parsed.data.model?.trim() ||
    process.env.OPENAI_FINETUNE_BASE_MODEL?.trim() ||
    "gpt-4o-mini";
  try {
    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    const job = await openai.fineTuning.jobs.create({
      training_file: parsed.data.training_file,
      model: baseModel,
      suffix: parsed.data.suffix,
    });
    res.status(201).json({
      id: job.id,
      status: job.status,
      model: job.model,
      fine_tuned_model: job.fine_tuned_model,
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({
      error: e instanceof Error ? e.message : "Fine-tuning job create failed",
    });
  }
});

finetuneRouter.get("/jobs", async (req, res) => {
  if (!hasOpenAIKey()) {
    res.status(400).json({ error: "OPENAI_API_KEY is required." });
    return;
  }
  const limit = Math.min(Number(req.query.limit) || 10, 50);
  try {
    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    const list = await openai.fineTuning.jobs.list({ limit });
    const data = list.data.map((j) => ({
      id: j.id,
      status: j.status,
      model: j.model,
      fine_tuned_model: j.fine_tuned_model,
      created_at: j.created_at,
    }));
    res.json({ jobs: data });
  } catch (e) {
    console.error(e);
    res.status(500).json({
      error: e instanceof Error ? e.message : "List jobs failed",
    });
  }
});

finetuneRouter.get("/jobs/:id", async (req, res) => {
  if (!hasOpenAIKey()) {
    res.status(400).json({ error: "OPENAI_API_KEY is required." });
    return;
  }
  try {
    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    const job = await openai.fineTuning.jobs.retrieve(req.params.id);
    res.json({
      id: job.id,
      status: job.status,
      model: job.model,
      fine_tuned_model: job.fine_tuned_model,
      trained_tokens: job.trained_tokens,
      error: job.error,
      created_at: job.created_at,
      finished_at: job.finished_at,
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({
      error: e instanceof Error ? e.message : "Retrieve job failed",
    });
  }
});
