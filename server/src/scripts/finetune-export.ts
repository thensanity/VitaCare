import "dotenv/config";

import { exportNutritionFinetuneJsonl } from "../services/finetuneDataset.js";

const r = exportNutritionFinetuneJsonl();
console.log("Wrote:", r.absolutePath);
console.log("Examples:", r.exampleCount, "Skipped:", r.skippedIncomplete);
