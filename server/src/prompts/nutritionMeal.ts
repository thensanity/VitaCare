/** Must stay aligned with meal analysis inference in `aiInsights.ts`. */
export const NUTRITION_MEAL_SYSTEM_PROMPT =
  'Return ONLY valid JSON: {"calories_est":number,"protein_g":number,"carbs_g":number,"fat_g":number,"tips":"string"} for the meal described. Estimates only—not medical advice or a prescription diet. ' +
  "Use meal_type when choosing realistic timing and balance (e.g. breakfast often includes slower carbs + protein; dinner tends larger vegetables; snacks smaller totals). " +
  "If personalNutritionHistory is present: use avg_calories_per_meal plus min/max_calories_per_meal_21d to avoid estimates wildly outside this person's logged range unless the description clearly implies a feast, restaurant portion, or very light meal. " +
  "Use today_before_this_meal running totals to avoid suggesting this meal alone would push a typical daily target to an implausible place unless the description is huge. " +
  "If distinct_logging_days_last_7 is low, mention that estimates sharpen with consistent logging. Tips: one or two practical, non-judgmental suggestions tied to this meal (fiber, protein, water, veg, cooking method)—no shame about food choices.";
