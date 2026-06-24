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

function extractOllamaOutputText(response: unknown) {
  if (!response || typeof response !== "object" || !("message" in response)) {
    return "";
  }

  const message = response.message;
  if (message && typeof message === "object" && "content" in message && typeof message.content === "string") {
    return message.content.trim();
  }

  return "";
}

function fallbackJson(text: string, mode: AiMode) {
  return {
    title: modeLabels[mode],
    summary: text,
    ipa: "",
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
title, summary, ipa, meaning, example, grammar, vietnamese, suggestedNote.

Mode: ${body.mode} (${modeLabels[body.mode]})
Source: ${source || "unknown"}
Selected text:
${text}

Rules:
- Explain for IELTS learners, not generic English learners.
- Keep output concise and useful for a PDF margin note.
- If mode is vocab, focus on IPA pronunciation, word/phrase meaning, Vietnamese meaning, collocation, IELTS usage, and one natural example.
- If mode is grammar, identify the grammar pattern and why it matters.
- ipa should be a standard IPA transcription when the selected text is a word or short phrase; otherwise use an empty string.
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

function stripTrailingSlash(value: string) {
  return value.replace(/\/+$/, "");
}

function ollamaEndpoint(path: string) {
  const baseUrl = stripTrailingSlash(process.env.OLLAMA_BASE_URL ?? "http://127.0.0.1:11434");
  const apiBaseUrl = baseUrl.endsWith("/api") ? baseUrl : `${baseUrl}/api`;
  return `${apiBaseUrl}${path}`;
}

async function callOllama(prompt: string) {
  const provider = process.env.AI_PROVIDER?.toLowerCase();
  const hasOllamaConfig = Boolean(process.env.OLLAMA_BASE_URL || process.env.OLLAMA_MODEL || process.env.OLLAMA_API_KEY || provider === "ollama");
  if (provider && provider !== "auto" && provider !== "ollama") {
    return null;
  }
  if (!hasOllamaConfig) {
    return null;
  }

  const model = process.env.OLLAMA_MODEL ?? "llama3.2";
  const headers: Record<string, string> = {
    "Content-Type": "application/json"
  };
  if (process.env.OLLAMA_API_KEY) {
    headers.Authorization = `Bearer ${process.env.OLLAMA_API_KEY}`;
  }

  let response: Response;
  try {
    response = await fetch(ollamaEndpoint("/chat"), {
      method: "POST",
      headers,
      body: JSON.stringify({
        model,
        messages: [
          {
            role: "user",
            content: prompt
          }
        ],
        format: "json",
        stream: false,
        think: false,
        options: {
          temperature: 0.2
        }
      })
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? `Ollama request failed: ${error.message}. Check OLLAMA_BASE_URL and OLLAMA_API_KEY.`
            : "Ollama request failed. Check OLLAMA_BASE_URL and OLLAMA_API_KEY.",
        provider: "ollama"
      },
      { status: 502 }
    );
  }

  const payload = (await response.json()) as unknown;
  if (!response.ok) {
    const message =
      payload && typeof payload === "object" && "error" in payload
        ? JSON.stringify(payload.error)
        : "Ollama request failed.";
    return NextResponse.json({ error: message, provider: "ollama" }, { status: response.status });
  }

  return extractOllamaOutputText(payload);
}

async function callGemini(prompt: string) {
  const provider = process.env.AI_PROVIDER?.toLowerCase();
  if (provider && provider !== "auto" && provider !== "gemini") {
    return null;
  }

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
  const provider = process.env.AI_PROVIDER?.toLowerCase();
  if (provider && provider !== "auto" && provider !== "openai") {
    return null;
  }

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
  const ollamaResult = await callOllama(prompt);
  if (ollamaResult instanceof NextResponse) {
    return ollamaResult;
  }
  if (typeof ollamaResult === "string") {
    return NextResponse.json(parseJsonOrFallback(ollamaResult, text, body.mode));
  }

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
    { error: "No AI provider configured. Set AI_PROVIDER=ollama with OLLAMA_MODEL, or configure GEMINI_API_KEY / OPENAI_API_KEY." },
    { status: 500 }
  );
}
