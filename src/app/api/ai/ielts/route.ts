import { NextResponse } from "next/server";

type AiMode = "vocab" | "explain" | "grammar" | "note" | "solve";
type AiProvider = "auto" | "groq" | "gemini" | "ollama" | "openai";

interface AiRequestBody {
  mode: AiMode;
  text: string;
  imageDataUrl?: string;
  sourceBookTitle?: string;
  sourcePage?: number;
  provider?: AiProvider;
  providerOrder?: AiProvider[];
}

const modeLabels: Record<AiMode, string> = {
  vocab: "vocabulary card",
  explain: "clear IELTS explanation",
  grammar: "grammar note",
  note: "study note",
  solve: "exercise solver"
};

function isAiMode(value: unknown): value is AiMode {
  return value === "vocab" || value === "explain" || value === "grammar" || value === "note" || value === "solve";
}

function isAiProvider(value: unknown): value is AiProvider {
  return value === "auto" || value === "groq" || value === "gemini" || value === "ollama" || value === "openai";
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

function extractOpenAiCompatibleChatText(response: unknown) {
  if (!response || typeof response !== "object" || !("choices" in response) || !Array.isArray(response.choices)) {
    return "";
  }

  return (response.choices as unknown[])
    .flatMap((choice: unknown) => {
      if (!choice || typeof choice !== "object" || !("message" in choice)) {
        return [];
      }
      const message = choice.message;
      if (message && typeof message === "object" && "content" in message && typeof message.content === "string") {
        return [message.content];
      }
      return [];
    })
    .join("\n")
    .trim();
}

function fallbackJson(text: string, mode: AiMode) {
  return {
    title: modeLabels[mode],
    summary: text,
    ipa: "",
    partOfSpeech: "",
    meaning: "",
    synonyms: "",
    antonyms: "",
    usage: "",
    collocations: "",
    commonMistake: "",
    example: "",
    grammar: "",
    vietnamese: "",
    suggestedNote: text
  };
}

function extractImagePayload(value?: string) {
  if (!value) {
    return null;
  }

  const match = value.match(/^data:(image\/(?:png|jpe?g|webp));base64,([\s\S]+)$/i);
  if (!match) {
    return null;
  }

  return {
    mimeType: match[1].toLowerCase(),
    data: match[2].replace(/\s/g, "")
  };
}

function buildPrompt(body: AiRequestBody, text: string, hasImage: boolean) {
  const source = [body.sourceBookTitle, body.sourcePage ? `page ${body.sourcePage}` : ""]
    .filter(Boolean)
    .join(", ");

  return `You are an IELTS Band 8 study coach.
Return only valid compact JSON with these keys:
title, summary, ipa, partOfSpeech, meaning, synonyms, antonyms, usage, collocations, commonMistake, example, grammar, vietnamese, suggestedNote.

Mode: ${body.mode} (${modeLabels[body.mode]})
Source: ${source || "unknown"}
Image selection attached: ${hasImage ? "yes" : "no"}
Selected text:
${text || "[No selectable PDF text. Read the attached image selection first.]"}

Rules:
- Explain for IELTS learners, not generic English learners.
- Keep output concise and useful for a PDF margin note.
- If an image selection is attached, OCR/read only the highlighted crop first, then answer from that crop.
- If mode is vocab, focus on IPA pronunciation, part of speech, word/phrase meaning, Vietnamese meaning, synonyms, antonyms, collocation, IELTS usage, and one natural example.
- If mode is explain, make it a mini lesson: plain meaning, why it is used in this context, Vietnamese explanation, IELTS usage, collocations, common mistake or contrast, and one natural example.
- If mode is grammar, identify the grammar pattern and why it matters.
- If mode is solve, solve the selected exercise text. Put the answer first.
- For mode solve, title should be "Answer: ..." and summary should include the completed sentence or answer list.
- For fill-in-the-blank verb exercises, choose the correct verb form and put the short grammar reason in grammar.
- For present simple vs present continuous exercises, use present continuous for changes happening around now, current temporary situations, and trends; use present simple for habits, facts, routines, and stative verbs.
- ipa should be a standard IPA transcription when the selected text is a word or short phrase; otherwise use an empty string.
- partOfSpeech should be short, e.g. noun, verb, adjective, adverb, phrase, phrasal verb, collocation.
- synonyms should be 2-4 close IELTS-useful alternatives separated by commas; use an empty string if none fit.
- antonyms should be 1-3 useful opposites separated by commas; use an empty string if none fit.
- usage should explain how to use the word, phrase, or grammar point in IELTS writing/speaking.
- collocations should be 2-5 natural collocations or fixed phrases separated by commas.
- commonMistake should warn about a likely learner mistake, false friend, register problem, or wrong collocation.
- vietnamese should briefly explain in Vietnamese.
- suggestedNote should be ready to save as a sticky note.`;
}

function parseJsonOrFallback(outputText: string, text: string, mode: AiMode) {
  const candidates = [
    outputText,
    outputText.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim(),
    outputText.match(/\{[\s\S]*\}/)?.[0] ?? ""
  ].filter(Boolean);

  for (const candidate of candidates) {
    try {
      const parsed = JSON.parse(candidate);
      if (typeof parsed === "string") {
        return JSON.parse(parsed);
      }
      return parsed;
    } catch {
      // Try the next cleanup strategy.
    }
  }

  try {
    return JSON.parse(outputText);
  } catch {
    return fallbackJson(outputText || text, mode);
  }
}

function stripTrailingSlash(value: string) {
  return value.replace(/\/+$/, "");
}

function configuredProvider(providerOverride?: AiProvider) {
  return providerOverride ?? (process.env.AI_PROVIDER?.toLowerCase() as AiProvider | undefined) ?? "auto";
}

function shouldTryProvider(providerName: string, providerOverride?: AiProvider) {
  const provider = configuredProvider(providerOverride);
  return !provider || provider === "auto" || provider === providerName;
}

function shouldContinueAfterProviderError(providerOverride?: AiProvider) {
  return configuredProvider(providerOverride) === "auto";
}

async function responseErrorMessage(response: Response, fallback: string) {
  try {
    const payload = (await response.clone().json()) as { error?: unknown; message?: unknown; provider?: unknown };
    const provider = typeof payload.provider === "string" ? `${payload.provider}: ` : "";
    const message =
      typeof payload.error === "string"
        ? payload.error
        : typeof payload.message === "string"
          ? payload.message
          : JSON.stringify(payload.error ?? payload.message ?? fallback);
    return `${provider}${message}`;
  } catch {
    return fallback;
  }
}

function ollamaEndpoint(path: string) {
  const baseUrl = stripTrailingSlash(process.env.OLLAMA_BASE_URL ?? "http://127.0.0.1:11434");
  const apiBaseUrl = baseUrl.endsWith("/api") ? baseUrl : `${baseUrl}/api`;
  return `${apiBaseUrl}${path}`;
}

function isLikelyVisionModel(model: string) {
  return /\b(?:gemma4|llava|bakllava|moondream|minicpm-v|vision|vl|pixtral)\b/i.test(model);
}

function ollamaImageModel() {
  const visionModel = process.env.OLLAMA_VISION_MODEL?.trim();
  const textModel = process.env.OLLAMA_MODEL?.trim();

  if (visionModel) {
    return visionModel;
  }
  if (textModel && isLikelyVisionModel(textModel)) {
    return textModel;
  }

  return "";
}

function getOllamaErrorMessage(payload: unknown) {
  if (!payload || typeof payload !== "object" || !("error" in payload)) {
    return "Ollama request failed.";
  }

  const error = payload.error;
  if (typeof error === "string") {
    return error;
  }
  try {
    return JSON.stringify(error);
  } catch {
    return "Ollama request failed.";
  }
}

async function callOllama(prompt: string, image?: { mimeType: string; data: string } | null, providerOverride?: AiProvider) {
  const hasOllamaConfig = Boolean(
    process.env.OLLAMA_BASE_URL || process.env.OLLAMA_MODEL || process.env.OLLAMA_API_KEY || configuredProvider(providerOverride) === "ollama"
  );
  if (!shouldTryProvider("ollama", providerOverride)) {
    return null;
  }
  if (!hasOllamaConfig) {
    return null;
  }

  const model = image ? ollamaImageModel() : process.env.OLLAMA_MODEL ?? "llama3.2";
  if (image && !model) {
    return NextResponse.json(
      {
        error:
          "This scanned/image-only selection needs a vision model. Set OLLAMA_VISION_MODEL=gemma4 or another Ollama vision model, then redeploy/restart.",
        provider: "ollama"
      },
      { status: 400 }
    );
  }
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
            content: prompt,
            ...(image ? { images: [image.data] } : {})
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
    const message = getOllamaErrorMessage(payload);
    const quotaHint =
      response.status === 429
        ? `Ollama quota/rate limit hit for ${model}. Try again later, add usage in Ollama, or switch to another model/provider.`
        : message;
    const imageHint =
      image && !process.env.OLLAMA_VISION_MODEL
        ? " For scanned pages, configure OLLAMA_VISION_MODEL=gemma4 or another vision-capable model."
        : "";
    return NextResponse.json({ error: `${quotaHint}${imageHint}`, provider: "ollama" }, { status: response.status });
  }

  return extractOllamaOutputText(payload);
}

async function callGemini(prompt: string, image?: { mimeType: string; data: string } | null, providerOverride?: AiProvider) {
  if (!shouldTryProvider("gemini", providerOverride)) {
    return null;
  }

  const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
  if (!apiKey) {
    return null;
  }

  const model = process.env.GEMINI_MODEL ?? "gemini-3-flash-preview";
  const parts: unknown[] = [{ text: prompt }];
  if (image) {
    parts.push({
      inlineData: {
        mimeType: image.mimeType,
        data: image.data
      }
    });
  }

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
            parts
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

function groqEndpoint(path: string) {
  const baseUrl = stripTrailingSlash(process.env.GROQ_BASE_URL ?? "https://api.groq.com/openai/v1");
  return `${baseUrl}${path}`;
}

async function callGroq(prompt: string, image?: { mimeType: string; data: string } | null, providerOverride?: AiProvider) {
  if (!shouldTryProvider("groq", providerOverride)) {
    return null;
  }

  const apiKey = process.env.GROQ_API_KEY || process.env.GROQ;
  if (!apiKey) {
    return null;
  }

  if (image) {
    if (configuredProvider(providerOverride) === "groq") {
      return NextResponse.json(
        { error: "Groq is configured for text-only AI in this app. Use OCR/PDF text, or configure Gemini/Ollama vision for image selections.", provider: "groq" },
        { status: 400 }
      );
    }
    return null;
  }

  const model = process.env.GROQ_MODEL ?? "llama-3.1-8b-instant";
  let response: Response;
  try {
    response = await fetch(groqEndpoint("/chat/completions"), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model,
        messages: [{ role: "user", content: prompt }],
        response_format: { type: "json_object" },
        temperature: 0.2
      })
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? `Groq request failed: ${error.message}. Check GROQ_API_KEY and GROQ_BASE_URL.`
            : "Groq request failed. Check GROQ_API_KEY and GROQ_BASE_URL.",
        provider: "groq"
      },
      { status: 502 }
    );
  }

  const payload = (await response.json()) as unknown;
  if (!response.ok) {
    const message =
      payload && typeof payload === "object" && "error" in payload
        ? JSON.stringify(payload.error)
        : "Groq request failed.";
    const quotaHint =
      response.status === 429
        ? `Groq quota/rate limit hit for ${model}. Trying another provider works when AI_PROVIDER=auto.`
        : message;
    return NextResponse.json({ error: quotaHint, provider: "groq" }, { status: response.status });
  }

  return extractOpenAiCompatibleChatText(payload);
}

async function callOpenAi(prompt: string, providerOverride?: AiProvider) {
  if (!shouldTryProvider("openai", providerOverride)) {
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
  const image = extractImagePayload(body.imageDataUrl);

  if (!isAiMode(body.mode)) {
    return NextResponse.json({ error: "Invalid AI mode." }, { status: 400 });
  }

  const providerOverride = isAiProvider(body.provider) ? body.provider : undefined;

  if (!text && !image) {
    return NextResponse.json({ error: "Text or image selection is required." }, { status: 400 });
  }

  const fallbackText = text || "Selected image";
  const prompt = buildPrompt(body, text, Boolean(image));
  const providerErrors: string[] = [];
  const defaultTextProviderOrder: AiProvider[] = ["groq", "gemini", "ollama", "openai"];
  const defaultImageProviderOrder: AiProvider[] = ["gemini", "ollama", "groq", "openai"];
  const requestedOrder = (body.providerOrder ?? []).filter((provider): provider is AiProvider => isAiProvider(provider) && provider !== "auto");
  const providerOrder = [
    ...requestedOrder,
    ...(image ? defaultImageProviderOrder : defaultTextProviderOrder)
  ].filter((provider, index, all) => all.indexOf(provider) === index);

  const providerCall = (provider: AiProvider) => {
    if (provider === "groq") {
      return image ? callGroq(prompt, image, providerOverride) : callGroq(prompt, undefined, providerOverride);
    }
    if (provider === "gemini") {
      return image ? callGemini(prompt, image, providerOverride) : callGemini(prompt, undefined, providerOverride);
    }
    if (provider === "ollama") {
      return image ? callOllama(prompt, image, providerOverride) : callOllama(prompt, undefined, providerOverride);
    }
    return image ? Promise.resolve(null) : callOpenAi(prompt, providerOverride);
  };

  for (const provider of providerOrder) {
    const result = await providerCall(provider);
    if (result instanceof NextResponse) {
      if (!shouldContinueAfterProviderError(providerOverride)) {
        return result;
      }
      providerErrors.push(await responseErrorMessage(result, `${provider} request failed.`));
      continue;
    }
    if (typeof result === "string") {
      return NextResponse.json(parseJsonOrFallback(result, fallbackText, body.mode));
    }
  }

  if (providerErrors.length > 0) {
    return NextResponse.json(
      { error: `All configured AI providers failed: ${providerErrors.join(" | ")}` },
      { status: 502 }
    );
  }

  return NextResponse.json(
    { error: "No AI provider configured. Set AI_PROVIDER=auto and configure OLLAMA, GEMINI_API_KEY, GROQ_API_KEY, or OPENAI_API_KEY." },
    { status: 500 }
  );
}
