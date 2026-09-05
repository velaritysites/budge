import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

/**
 * Read a credit-score screenshot and pull out the score and bureau name.
 * The image is sent to the model only — nothing is stored server-side.
 */
export const readScoreScreenshot = createServerFn({ method: "POST" })
  .inputValidator((data) =>
    z.object({ imageDataUrl: z.string().startsWith("data:image/").max(8_000_000) }).parse(data),
  )
  .handler(async ({ data }) => {
    const key = process.env["LOVABLE_API_KEY"];
    if (!key) throw new Error("AI is not configured");

    const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Lovable-API-Key": key },
      body: JSON.stringify({
        model: "google/gemini-3.7-flash",
        messages: [
          {
            role: "system",
            content:
              "You read South African credit report screenshots. Reply with JSON only: {\"score\": number|null, \"bureau\": \"TransUnion\"|\"Experian\"|\"Compuscan\"|\"XDS\"|null}. The score is 0-999.",
          },
          {
            role: "user",
            content: [
              { type: "text", text: "Extract the credit score and the bureau from this screenshot." },
              { type: "image_url", image_url: { url: data.imageDataUrl } },
            ],
          },
        ],
        response_format: { type: "json_object" },
      }),
    });

    if (!res.ok) {
      const body = await res.text();
      throw new Error(res.status === 429 ? "Too many requests — try again shortly." : `Could not read the screenshot (${res.status}): ${body.slice(0, 200)}`);
    }

    const json: any = await res.json();
    const text = json?.choices?.[0]?.message?.content ?? "{}";
    let parsed: any = {};
    try {
      parsed = JSON.parse(text);
    } catch {
      parsed = {};
    }
    const score = Number(parsed.score);
    return {
      score: Number.isFinite(score) && score > 0 && score <= 999 ? Math.round(score) : null,
      bureau: typeof parsed.bureau === "string" ? parsed.bureau : null,
    };
  });
