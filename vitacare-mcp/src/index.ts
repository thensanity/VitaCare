#!/usr/bin/env node
/**
 * VitaCare MCP server — exposes your VitaCare HTTP API as MCP tools for Cursor and other clients.
 * Start the VitaCare API (server/) first unless calling only vitacare_health.
 */
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import * as z from "zod/v4";

import {
  apiBaseDisplay,
  vitacareFetch,
  vitacareFetchFinetune,
} from "./api.js";

function fileBasename(absPath: string): string {
  const norm = absPath.replace(/\\/g, "/");
  const i = norm.lastIndexOf("/");
  return i >= 0 ? norm.slice(i + 1) : norm;
}

const server = new McpServer(
  {
    name: "vitacare",
    version: "1.0.0",
  },
  {
    instructions: `Tools call the VitaCare HTTP API. Set VITACARE_API_URL if needed (default http://127.0.0.1:3001). For fine-tuning tools, also set VITACARE_FINETUNE_SECRET to match FINETUNE_ADMIN_SECRET on the API. Training runs on OpenAI: the API must have OPENAI_API_KEY; use vitacare_finetune_nutrition_full to export SQLite meal labels → upload → start job in one step.`,
  }
);

server.registerResource(
  "vitacare-overview",
  "vitacare://docs/overview",
  {
    title: "VitaCare overview",
    description: "What the VitaCare app and MCP tools cover",
    mimeType: "text/markdown",
  },
  async () => ({
    contents: [
      {
        uri: "vitacare://docs/overview",
        mimeType: "text/markdown",
        text: `# VitaCare (MCP)

- **Backend**: Express + SQLite at \`${apiBaseDisplay()}\` (override with \`VITACARE_API_URL\`).
- **Mobile**: Expo app — elderly monitoring, wellness (hydration, meds, local reminders), nutrition, fitness, voice assistant.
- **Tools**: health, elderly insight, wellness, nutrition, fitness, chat, **fine-tuning** (export/upload/job via backend → OpenAI).
- **Fine-tune**: MCP \`VITACARE_FINETUNE_SECRET\` = API \`FINETUNE_ADMIN_SECRET\`. Full pipeline: \`vitacare_finetune_nutrition_full\`.

MCP does not replace medical care; data is demo-grade unless you harden the stack.`,
      },
    ],
  })
);

server.registerTool(
  "vitacare_health",
  {
    description: "Ping the VitaCare API (GET /health).",
  },
  async () => {
    const data = await vitacareFetch("/health");
    return {
      content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
    };
  }
);

server.registerTool(
  "vitacare_elderly_insight",
  {
    description:
      "Get AI elderly monitoring brief (vitals/activity/sleep trends). Server: GET /api/elderly/insight. Requires OPENAI_API_KEY on API for full model output.",
  },
  async () => {
    const data = await vitacareFetch("/api/elderly/insight");
    return {
      content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
    };
  }
);

server.registerTool(
  "vitacare_nutrition_today",
  {
    description: "Today's nutrition totals from logged meals (GET /api/nutrition/summary/today).",
  },
  async () => {
    const data = await vitacareFetch("/api/nutrition/summary/today");
    return {
      content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
    };
  }
);

server.registerTool(
  "vitacare_log_meal",
  {
    description:
      "Log a meal; API estimates macros (POST /api/nutrition/logs). meal_type: breakfast | lunch | dinner | snack.",
    inputSchema: {
      meal_type: z.enum(["breakfast", "lunch", "dinner", "snack"]),
      description: z
        .string()
        .min(3)
        .describe("Plain-language food description"),
    },
  },
  async ({ meal_type, description }) => {
    const data = await vitacareFetch("/api/nutrition/logs", {
      method: "POST",
      body: JSON.stringify({ meal_type, description }),
    });
    return {
      content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
    };
  }
);

server.registerTool(
  "vitacare_wellness_summary",
  {
    description:
      "Wellness rollup: today's hydration (ml), check-in days in last 7, active medication reminder count (GET /api/wellness/summary).",
  },
  async () => {
    const data = await vitacareFetch("/api/wellness/summary");
    return {
      content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
    };
  }
);

server.registerTool(
  "vitacare_wellness_hydration_log",
  {
    description:
      "Log a hydration drink (POST /api/wellness/hydration). Default 250 ml if amount_ml omitted.",
    inputSchema: {
      amount_ml: z
        .number()
        .int()
        .min(50)
        .max(2000)
        .optional()
        .describe("Milliliters, e.g. 250 for a cup"),
      note: z.string().max(500).optional(),
    },
  },
  async ({ amount_ml, note }) => {
    const data = await vitacareFetch("/api/wellness/hydration", {
      method: "POST",
      body: JSON.stringify({
        ...(amount_ml != null ? { amount_ml } : {}),
        ...(note != null ? { note } : {}),
      }),
    });
    return {
      content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
    };
  }
);

server.registerTool(
  "vitacare_fitness_profile",
  {
    description: "Read saved fitness profile (GET /api/fitness/profile).",
  },
  async () => {
    const data = await vitacareFetch("/api/fitness/profile");
    return {
      content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
    };
  }
);

server.registerTool(
  "vitacare_fitness_plan_latest",
  {
    description: "Get latest AI-generated fitness plan JSON if any (GET /api/fitness/plan/latest).",
  },
  async () => {
    const data = await vitacareFetch("/api/fitness/plan/latest");
    return {
      content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
    };
  }
);

server.registerTool(
  "vitacare_fitness_coach",
  {
    description: "Virtual coaching for one exercise (POST /api/fitness/coach).",
    inputSchema: {
      exerciseName: z.string().min(1),
      userNotes: z.string().optional().describe("How it felt today"),
    },
  },
  async ({ exerciseName, userNotes }) => {
    const data = await vitacareFetch("/api/fitness/coach", {
      method: "POST",
      body: JSON.stringify({
        exerciseName,
        userNotes: userNotes ?? "",
      }),
    });
    return {
      content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
    };
  }
);

server.registerTool(
  "vitacare_chat",
  {
    description:
      "Wellness Q&A via VitaCare chat (POST /api/chat). Send the latest user message; optional prior turns for context.",
    inputSchema: {
      message: z.string().min(1).describe("User message"),
      history: z
        .array(
          z.object({
            role: z.enum(["user", "assistant"]),
            content: z.string(),
          })
        )
        .optional()
        .describe("Prior user/assistant turns, oldest first"),
    },
  },
  async ({ message, history }) => {
    const messages = [...(history ?? []), { role: "user" as const, content: message }];
    const data = await vitacareFetch("/api/chat", {
      method: "POST",
      body: JSON.stringify({ messages }),
    });
    return {
      content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
    };
  }
);

server.registerTool(
  "vitacare_finetune_nutrition_stats",
  {
    description:
      "Count meal logs eligible for nutrition fine-tuning (GET /api/finetune/nutrition/stats). Requires VITACARE_FINETUNE_SECRET.",
  },
  async () => {
    const data = await vitacareFetchFinetune("/api/finetune/nutrition/stats");
    return {
      content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
    };
  }
);

server.registerTool(
  "vitacare_finetune_nutrition_export",
  {
    description:
      "Write nutrition JSONL under API server data/finetune/ (POST /api/finetune/nutrition/export). Requires secret.",
  },
  async () => {
    const data = await vitacareFetchFinetune("/api/finetune/nutrition/export", {
      method: "POST",
    });
    return {
      content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
    };
  }
);

server.registerTool(
  "vitacare_finetune_upload",
  {
    description:
      "Upload a JSONL already on the API host under data/finetune/ to OpenAI (POST /api/finetune/upload). Body filename is basename only e.g. nutrition-2026....jsonl",
    inputSchema: {
      filename: z.string().min(1).describe("Basename only, file must exist in API data/finetune/"),
    },
  },
  async ({ filename }) => {
    const data = await vitacareFetchFinetune("/api/finetune/upload", {
      method: "POST",
      body: JSON.stringify({ filename }),
    });
    return {
      content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
    };
  }
);

server.registerTool(
  "vitacare_finetune_job_create",
  {
    description:
      "Start OpenAI fine-tuning job (POST /api/finetune/jobs). training_file is OpenAI file id from upload.",
    inputSchema: {
      training_file: z.string().min(1),
      model: z.string().optional().describe("Base model; else API uses OPENAI_FINETUNE_BASE_MODEL"),
      suffix: z.string().max(40).optional(),
    },
  },
  async ({ training_file, model, suffix }) => {
    const body: Record<string, string> = { training_file };
    if (model) body.model = model;
    if (suffix) body.suffix = suffix;
    const data = await vitacareFetchFinetune("/api/finetune/jobs", {
      method: "POST",
      body: JSON.stringify(body),
    });
    return {
      content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
    };
  }
);

server.registerTool(
  "vitacare_finetune_jobs_list",
  {
    description: "List recent OpenAI fine-tuning jobs (GET /api/finetune/jobs).",
    inputSchema: {
      limit: z.number().int().min(1).max(50).optional(),
    },
  },
  async ({ limit }) => {
    const q = limit != null ? `?limit=${limit}` : "";
    const data = await vitacareFetchFinetune(`/api/finetune/jobs${q}`);
    return {
      content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
    };
  }
);

server.registerTool(
  "vitacare_finetune_job_status",
  {
    description: "Get one fine-tuning job status (GET /api/finetune/jobs/:id).",
    inputSchema: {
      job_id: z.string().min(1),
    },
  },
  async ({ job_id }) => {
    const data = await vitacareFetchFinetune(`/api/finetune/jobs/${encodeURIComponent(job_id)}`);
    return {
      content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
    };
  }
);

server.registerTool(
  "vitacare_finetune_nutrition_full",
  {
    description:
      "End-to-end: export nutrition JSONL from the API database → upload file to OpenAI → create fine-tuning job. Same as calling export, upload (basename), jobs in sequence. API must run on the machine that holds SQLite + JSONL. After success, set API OPENAI_MEAL_MODEL to the returned fine_tuned_model when ready.",
    inputSchema: {
      model: z.string().optional().describe("Override OpenAI base model"),
      suffix: z.string().max(40).optional(),
      min_examples: z.number().int().min(1).optional().describe("Fail if export has fewer examples (default 1)"),
    },
  },
  async ({ model, suffix, min_examples }) => {
    const min = min_examples ?? 1;
    const exported = (await vitacareFetchFinetune("/api/finetune/nutrition/export", {
      method: "POST",
    })) as {
      file: string;
      exampleCount: number;
      skippedIncomplete?: number;
      hint?: string;
    };
    if (exported.exampleCount < min) {
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              {
                error: "Not enough training examples",
                export: exported,
                hint: "Log more meals in the app (with full macro fields) then retry.",
              },
              null,
              2
            ),
          },
        ],
        isError: true,
      };
    }
    const basename = fileBasename(exported.file);
    const uploaded = (await vitacareFetchFinetune("/api/finetune/upload", {
      method: "POST",
      body: JSON.stringify({ filename: basename }),
    })) as { id: string; filename?: string | null; bytes?: number | null };

    const jobBody: Record<string, string> = { training_file: uploaded.id };
    if (model) jobBody.model = model;
    if (suffix) jobBody.suffix = suffix;
    const job = (await vitacareFetchFinetune("/api/finetune/jobs", {
      method: "POST",
      body: JSON.stringify(jobBody),
    })) as {
      id: string;
      status: string;
      model: string;
      fine_tuned_model: string | null;
    };

    const payload = {
      ok: true,
      export: { path: exported.file, examples: exported.exampleCount },
      openai_training_file: uploaded.id,
      fine_tune_job: job,
      nextStep:
        "Poll vitacare_finetune_job_status with job_id until fine_tuned_model is set; then set OPENAI_MEAL_MODEL on the API to that id.",
    };
    return {
      content: [{ type: "text", text: JSON.stringify(payload, null, 2) }],
    };
  }
);

async function main() {
  console.error(`vitacare-mcp → API ${apiBaseDisplay()}`);
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((err) => {
  console.error("vitacare-mcp fatal:", err);
  process.exit(1);
});
