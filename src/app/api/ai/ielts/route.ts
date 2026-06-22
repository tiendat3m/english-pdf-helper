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

function extractOutputText(response: unknown) {
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

export async function POST(request: Request) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "Missing OPENAI_API_KEY. Add it to .env.local and restart npm run dev." },
      { status: 500 }
    );
  }

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

  const model = process.env.OPENAI_MODEL ?? "gpt-5.5";
  const source = [body.sourceBookTitle, body.sourcePage ? `page ${body.sourcePage}` : ""]
    .filter(Boolean)
    .join(", ");

  const prompt = `You are an IELTS Band 8 study coach.
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
    return NextResponse.json({ error: message }, { status: response.status });
  }

  const outputText = extractOutputText(payload);
  try {
    return NextResponse.json(JSON.parse(outputText));
  } catch {
    return NextResponse.json(fallbackJson(outputText || text, body.mode));
  }
}
