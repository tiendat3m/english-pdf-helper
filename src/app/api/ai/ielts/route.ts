import { NextResponse } from "next/server";

type AiMode = "vocab" | "explain" | "grammar" | "note";

interface AiRequestBody {
  mode: AiMode;
  text: string;
  sourceBookTitle?: string;
  sourcePage?: number;
}

const modeLabels: Record<AiMode, string> = {
  vocab: "vocabulary card",
  explain: "clear IELTS explanation",
  grammar: "grammar note",
  note: "study note"
};

function isAiMode(value: unknown): value is AiMode {
  return value === "vocab" || value === "explain" || value === "grammar" || value === "note";
}

function extractOpenAiOutputText(response: unknown) {
  if (
    response &&
    typeof response === "object" &&
    "output_text" in response &&
    typeof response.output_text === "string"
  ) {
    return response.output_text;
  }

  if (!response || typeof response !== "object" || !("output" in response) || !Array.isArray(response.output)) {
    return "";
  }

  return (response.output as unknown[])
    .flatMap((item: unknown) => {
      if (!item || typeof item !== "object" || !("content" in item) || !Array.isArray(item.content)) {
        return [];
      }
      return (item.content as unknown[]).flatMap((content: unknown) => {
        if (!content || typeof content !== "object") {
          return [];
        }
        if ("text" in content && typeof content.text === "string") {
          return [content.text];
        }
        return [];
      });
    })
    .join("\n")
    .trim();
}

function extractGeminiOutputText(response: unknown) {
  if (!response || typeof response !== "object" || !("candidates" in response) || !Array.isArray(response.candidates)) {
    return "";
  }

  return (response.candidates as unknown[])
    .flatMap((candidate: unknown) => {
      if (!candidate || typeof candidate !== "object" || !("content" in candidate)) {
        return [];
      }
      const content = candidate.content;
      if (!content || typeof content !== "object" || !("parts" in content) || !Array.isArray(content.parts)) {
        return [];
      }
      return (content.parts as unknown[]).flatMap((part: unknown) => {
        if (part && typeof part === "object" && "text" in part && typeof part.text === "string") {
          return [part.text];
        }
        return [];
      });
    })
    .join("\n")
    .trim();
}

function fallbackJson(text: string, mode: AiMode) {
  return {
    title: modeLabels[mode],
    summary: text,
    meaning: "",
    example: "",
    grammar: "",
    vietnamese: "",
    suggestedNote: text
  };
}

function buildPrompt(body: AiRequestBody, text: string) {
  const source = [body.sourceBookTitle, body.sourcePage ? `page ${body.sourcePage}` : ""]
    .filter(Boolean)
    .join(", ");

  return `You are an IELTS Band 8 study coach.
Return only valid compact JSON with these keys:
title, summary, meaning, example, grammar, vietnamese, suggestedNote.

Mode: ${body.mode} (${modeLabels[body.mode]})
Source: ${source || "unknown"}
Selected text:
${text}

Rules:
- Explain for IELTS learners, not generic English learners.
- Keep output concise and useful for a PDF margin note.
- If mode is vocab, focus on word/phrase meaning, collocation, IELTS usage, and one natural example.
- If mode is grammar, identify the grammar pattern and why it matters.
- vietnamese should briefly explain in Vietnamese.
- suggestedNote should be ready to save as a sticky note.`;
}

function parseJsonOrFallback(outputText: string, text: string, mode: AiMode) {
  try {
    return JSON.parse(outputText);
  } catch {
    return fallbackJson(outputText || text, mode);
  }
}

async function callGemini(prompt: string) {
  const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
  if (!apiKey) {
    return null;
  }

  const model = process.env.GEMINI_MODEL ?? "gemini-3-flash-preview";
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        contents: [
          {
            role: "user",
            parts: [{ text: prompt }]
          }
        ],
        generationConfig: {
          responseMimeType: "application/json"
        }
      })
    }
  );

  const payload = (await response.json()) as unknown;
  if (!response.ok) {
    const message =
      payload && typeof payload === "object" && "error" in payload
        ? JSON.stringify(payload.error)
        : "Gemini request failed.";
    return NextResponse.json({ error: message, provider: "gemini" }, { status: response.status });
  }

  return extractGeminiOutputText(payload);
}

async function callOpenAi(prompt: string) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return null;
  }

  const model = process.env.OPENAI_MODEL ?? "gpt-5.5";
  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model,
      input: prompt
    })
  });

  const payload = (await response.json()) as unknown;
  if (!response.ok) {
    const message =
      payload && typeof payload === "object" && "error" in payload
        ? JSON.stringify(payload.error)
        : "OpenAI request failed.";
    return NextResponse.json({ error: message, provider: "openai" }, { status: response.status });
  }

  return extractOpenAiOutputText(payload);
}

export async function POST(request: Request) {
  let body: AiRequestBody;
  try {
    body = (await request.json()) as AiRequestBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const text = body.text?.trim();
  if (!text) {
    return NextResponse.json({ error: "Text is required." }, { status: 400 });
  }

  if (!isAiMode(body.mode)) {
    return NextResponse.json({ error: "Invalid AI mode." }, { status: 400 });
  }

  const prompt = buildPrompt(body, text);
  const geminiResult = await callGemini(prompt);
  if (geminiResult instanceof NextResponse) {
    return geminiResult;
  }
  if (typeof geminiResult === "string") {
    return NextResponse.json(parseJsonOrFallback(geminiResult, text, body.mode));
  }

  const openAiResult = await callOpenAi(prompt);
  if (openAiResult instanceof NextResponse) {
    return openAiResult;
  }
  if (typeof openAiResult === "string") {
    return NextResponse.json(parseJsonOrFallback(openAiResult, text, body.mode));
  }

  return NextResponse.json(
    { error: "Missing GEMINI_API_KEY. Add a free Gemini key to .env, or configure OPENAI_API_KEY." },
    { status: 500 }
  );
}
