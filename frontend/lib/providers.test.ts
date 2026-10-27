import { expect, it } from "vitest";
import { aiSchema, explainResponseSchema } from "./types";

it("accepts Agnes results for persistence while keeping existing OpenAI records readable", () => {
  const explanation = { chinese_meaning: "适应", english_definition: "Adjust.", part_of_speech: "verb", context_explanation: "适应变化", usage_notes: "adapt to", example_en: "We adapt.", example_zh: "我们适应。" };
  for (const provider of ["agnes", "openai"]) {
    const response = explainResponseSchema.parse({ entry_id: "e1", source_term: "adapt", source_context: "We adapt.", explanation, provider, model: "test-model", generated_at: "2026-10-27T00:00:00Z" });
    const stored = aiSchema.parse({ data: response.explanation, provider: response.provider, model: response.model, generated_at: response.generated_at, input_signature: "test" });
    expect(stored.provider).toBe(provider);
    expect(stored.data.chinese_meaning).toBe("适应");
  }
});
