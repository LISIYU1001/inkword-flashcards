import { z } from "zod";

export const explanationSchema = z.object({
  chinese_meaning: z.string().min(1),
  english_definition: z.string().min(1),
  part_of_speech: z.string().min(1),
  context_explanation: z.string().min(1),
  usage_notes: z.string().min(1),
  example_en: z.string().min(1),
  example_zh: z.string().min(1),
});
export const aiSchema = z.object({
  data: explanationSchema,
  provider: z.enum(["openai", "agnes"]),
  model: z.string(),
  generated_at: z.string(),
  input_signature: z.string(),
});
export const reviewSchema = z.object({
  id: z.string(),
  rating: z.enum(["forgot", "familiar", "remembered"]),
  reviewed_at: z.string(),
  input_signature: z.string(),
});
export const explainResponseSchema = z.object({
  entry_id: z.string(),
  source_term: z.string(),
  source_context: z.string(),
  explanation: explanationSchema,
  provider: z.enum(["openai", "agnes"]),
  model: z.string(),
  generated_at: z.string(),
});
export type ReviewEvent = z.infer<typeof reviewSchema>;
export type Rating = ReviewEvent["rating"];

export const entrySchema = z.object({
  id: z.string(),
  term: z.string(),
  raw_text: z.string(),
  kind: z.enum(["word", "phrase"]),
  page: z.number().int().positive(),
  rect: z.array(z.number()),
  quads: z.array(z.array(z.array(z.number()))),
  context: z.string(),
  context_source: z.enum(["pdf", "manual"]),
  context_status: z.enum(["sentence", "fragment", "review"]),
  warnings: z.array(z.string()),
  source_context: z.string().optional(),
  source_page: z.number().int().positive().optional(),
  ai: aiSchema.optional(),
  reviews: z.array(reviewSchema).optional(),
});
export const diagnosticSchema = z.object({
  code: z.string(),
  message: z.string(),
  page: z.number().nullable().optional(),
  annotation_id: z.string().nullable().optional(),
});
export const parseSchema = z.object({
  schema_version: z.literal(1),
  filename: z.string(),
  document_id: z.string(),
  page_count: z.number().int().positive(),
  highlight_count: z.number(),
  entries: z.array(entrySchema),
  warnings: z.array(diagnosticSchema),
});
export const articleSchema = z.object({
  id: z.string(),
  title: z.string(),
  filename: z.string(),
  page_count: z.number().int().positive(),
  highlight_count: z.number(),
  entries: z.array(entrySchema),
  warnings: z.array(diagnosticSchema),
  status: z.enum(["draft", "confirmed"]),
  updated_at: z.string(),
});
export type Entry = z.infer<typeof entrySchema>;
export type Article = z.infer<typeof articleSchema>;
