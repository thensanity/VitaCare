import "dotenv/config";
import cors from "cors";
import express from "express";
import { elderlyRouter } from "./routes/elderly.js";
import { fitnessRouter } from "./routes/fitness.js";
import { chatRouter } from "./routes/chat.js";
import { finetuneRouter } from "./routes/finetune.js";
import { nutritionRouter } from "./routes/nutrition.js";
import { wellnessRouter } from "./routes/wellness.js";

const app = express();
app.use(cors());
app.use(express.json({ limit: "1mb" }));

app.get("/health", (_req, res) => {
  res.json({ ok: true, service: "vitacare-api" });
});

app.use("/api/elderly", elderlyRouter);
app.use("/api/fitness", fitnessRouter);
app.use("/api/nutrition", nutritionRouter);
app.use("/api/finetune", finetuneRouter);
app.use("/api/chat", chatRouter);
app.use("/api/wellness", wellnessRouter);

const port = Number(process.env.PORT) || 3001;
const server = app.listen(port, () => {
  console.log(`VitaCare API listening on http://localhost:${port}`);
});
server.on("error", (err: NodeJS.ErrnoException) => {
  if (err.code === "EADDRINUSE") {
    console.error(
      `Port ${port} is already in use. Stop the other process or set PORT in .env to another value.`
    );
    console.error(
      `Windows: netstat -ano | findstr :${port}  then  taskkill /PID <pid> /F`
    );
    process.exit(1);
    return;
  }
  throw err;
});
