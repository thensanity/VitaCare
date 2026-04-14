# VitaCare MCP server

Model Context Protocol (stdio) server for the **VitaCare** app. Each **tool** forwards to your running **Node API** (`server/`).

## Prerequisites

1. Start the API: `cd ../server && npm run dev` (default `http://127.0.0.1:3001`).
2. Install deps here: `npm install`

## Run locally (stdio)

```bash
npm start
```

Do not pipe extra output to stdout (MCP uses stdout for the protocol). Logs use stderr.

## Cursor

1. Open **Cursor Settings → MCP** (or edit your user `mcp.json`).
2. Add a server entry (adjust paths for your machine):

```json
{
  "mcpServers": {
    "vitacare": {
      "command": "node",
      "args": ["--import", "tsx", "C:/Users/ASUS/innovative-ai-app/vitacare-mcp/src/index.ts"],
      "env": {
        "VITACARE_API_URL": "http://127.0.0.1:3001",
        "VITACARE_FINETUNE_SECRET": "same-as-FINETUNE_ADMIN_SECRET-in-server-env"
      }
    }
  }
}
```

On Windows, use forward slashes or escaped backslashes in `args`. After saving, restart Cursor or reload MCP.

## Environment

| Variable | Default | Purpose |
|----------|---------|---------|
| `VITACARE_API_URL` | `http://127.0.0.1:3001` | VitaCare API base URL |
| `VITACARE_FINETUNE_SECRET` | _(unset)_ | Must match **`FINETUNE_ADMIN_SECRET`** on the API for any `/api/finetune/*` tool |

Chat, elderly insight, nutrition analysis, fitness coach need **`OPENAI_API_KEY`** on the **API server**, not on the MCP process.

### Fine-tuning (connected to your backend)

The MCP server **does not train locally**. It calls **your running API**, which reads **SQLite**, writes **JSONL**, and talks to **OpenAI** (upload + fine-tuning job).

- One-shot: tool **`vitacare_finetune_nutrition_full`** → export → upload → create job.
- Step-by-step: `vitacare_finetune_nutrition_export` → `vitacare_finetune_upload` (basename from export response) → `vitacare_finetune_job_create`.

The API process must be the one that created the files (same machine as `server/data/finetune/`). If you only deploy the API remotely, run the pipeline there or mount shared storage.

Set **`OPENAI_API_KEY`** and **`FINETUNE_ADMIN_SECRET`** on the server; set **`VITACARE_FINETUNE_SECRET`** (same value) on the MCP process.

## Tools

| Tool | API |
|------|-----|
| `vitacare_health` | `GET /health` |
| `vitacare_elderly_insight` | `GET /api/elderly/insight` |
| `vitacare_nutrition_today` | `GET /api/nutrition/summary/today` |
| `vitacare_log_meal` | `POST /api/nutrition/logs` |
| `vitacare_fitness_profile` | `GET /api/fitness/profile` |
| `vitacare_fitness_plan_latest` | `GET /api/fitness/plan/latest` |
| `vitacare_fitness_coach` | `POST /api/fitness/coach` |
| `vitacare_chat` | `POST /api/chat` |
| `vitacare_finetune_nutrition_stats` | `GET /api/finetune/nutrition/stats` |
| `vitacare_finetune_nutrition_export` | `POST /api/finetune/nutrition/export` |
| `vitacare_finetune_upload` | `POST /api/finetune/upload` |
| `vitacare_finetune_job_create` | `POST /api/finetune/jobs` |
| `vitacare_finetune_jobs_list` | `GET /api/finetune/jobs` |
| `vitacare_finetune_job_status` | `GET /api/finetune/jobs/:id` |
| `vitacare_finetune_nutrition_full` | export + upload + job in one call |

## Resource

- `vitacare://docs/overview` — short markdown overview of VitaCare + MCP.

## Fine-tuning security

Use a strong `FINETUNE_ADMIN_SECRET` / `VITACARE_FINETUNE_SECRET`. Anyone with both URL and secret can start uploads and training jobs against your OpenAI account.
