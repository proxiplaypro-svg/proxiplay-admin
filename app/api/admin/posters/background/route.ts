import { NextResponse } from "next/server";
import { getConfiguredAdminEmails, isAllowedAdminEmail } from "@/lib/firebase/adminAccess";
import { getAdminAuth } from "@/lib/firebase/admin-app";
import type { PosterVisualFormat } from "@/lib/admin/posterVisualGenerator";

type GeneratePosterBackgroundBody = {
  gameId?: string;
  prompt?: string;
  format?: PosterVisualFormat;
};

const POSTER_BACKGROUND_POLICY_SUFFIX = [
  "This output must be only a premium advertising background plate for later system overlays.",
  "Do not include any readable text, letters, words, numbers, dates, percentages, price tags, discount claims, or promotional copy.",
  "Do not include any QR code, barcode, coupon code, ticket, voucher, scan marker, or scannable square.",
  "Do not include any logo, icon lockup, brand mark, watermark, invented app UI, or fake brand typography.",
  "Do not depict any false promotion, false percentage, false deadline, or fake offer card.",
  "Leave clean empty space for overlays in the top-left, right side, and bottom legal area.",
].join(" ");

const IMAGE_SIZE_BY_FORMAT: Record<PosterVisualFormat, "1024x1536" | "1024x1024" | "1024x1792"> = {
  "a4-portrait": "1024x1536",
  "facebook-square": "1024x1024",
  "instagram-story": "1024x1792",
};

async function assertIsAdminRequest(request: Request) {
  const authorization = request.headers.get("authorization") ?? "";
  const [scheme, token] = authorization.split(" ");

  if (scheme !== "Bearer" || !token) {
    throw new Error("UNAUTHENTICATED");
  }

  const decodedToken = await getAdminAuth().verifyIdToken(token);

  if (!isAllowedAdminEmail(decodedToken.email, getConfiguredAdminEmails())) {
    throw new Error("FORBIDDEN");
  }

  return decodedToken;
}

function normalizePrompt(value: string | undefined) {
  return value?.trim() ?? "";
}

function normalizeGameId(value: string | undefined) {
  return value?.trim() ?? "";
}

function normalizeFormat(value: PosterVisualFormat | undefined): PosterVisualFormat {
  if (
    value === "a4-portrait" ||
    value === "facebook-square" ||
    value === "instagram-story"
  ) {
    return value;
  }

  return "a4-portrait";
}

export const runtime = "nodejs";

export async function POST(request: Request) {
  const startedAt = Date.now();

  try {
    const decodedToken = await assertIsAdminRequest(request);
    const body = (await request.json()) as GeneratePosterBackgroundBody;
    const gameId = normalizeGameId(body.gameId);
    const prompt = normalizePrompt(body.prompt);
    const format = normalizeFormat(body.format);
    const apiKey = process.env.OPENAI_API_KEY?.trim();
    const hasApiKey = Boolean(apiKey);

    if (!gameId) {
      return NextResponse.json({ error: "Identifiant du jeu manquant." }, { status: 400 });
    }

    if (!prompt) {
      return NextResponse.json({ error: "Prompt IA manquant." }, { status: 400 });
    }

    if (prompt.length > 4000) {
      return NextResponse.json({ error: "Prompt IA trop long." }, { status: 400 });
    }

    console.info("[ADMIN_POSTER_BACKGROUND_START]", {
      gameId,
      format,
      hasOpenAiApiKey: hasApiKey,
      adminEmail: decodedToken.email ?? null,
    });

    if (!apiKey) {
      console.error("[ADMIN_POSTER_BACKGROUND_ERROR]", {
        gameId,
        format,
        hasOpenAiApiKey: hasApiKey,
        reason: "MISSING_OPENAI_API_KEY",
        durationMs: Date.now() - startedAt,
      });
      return NextResponse.json(
        { error: "La cle OPENAI_API_KEY est absente du serveur. Le fond degrade ProxiPlay reste disponible." },
        { status: 500 },
      );
    }
    const safePrompt = `${prompt} ${POSTER_BACKGROUND_POLICY_SUFFIX}`.trim();

    const openAiResponse = await fetch("https://api.openai.com/v1/images/generations", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "gpt-image-1",
        prompt: safePrompt,
        size: IMAGE_SIZE_BY_FORMAT[format],
        quality: "high",
        output_format: "png",
        background: "opaque",
      }),
    });

    const payload = (await openAiResponse.json().catch(() => null)) as
      | {
          data?: Array<{ b64_json?: string }>;
          error?: { message?: string };
        }
      | null;

    if (!openAiResponse.ok) {
      const errorMessage = payload?.error?.message?.trim() || "Erreur OpenAI pendant la generation du fond.";
      console.error("[ADMIN_POSTER_BACKGROUND_ERROR]", {
        gameId,
        format,
        hasOpenAiApiKey: hasApiKey,
        status: openAiResponse.status,
        success: false,
        errorMessage,
        durationMs: Date.now() - startedAt,
      });
      return NextResponse.json({ error: errorMessage }, { status: 502 });
    }

    const imageBase64 = payload?.data?.[0]?.b64_json?.trim();

    if (!imageBase64) {
      console.error("[ADMIN_POSTER_BACKGROUND_ERROR]", {
        gameId,
        format,
        hasOpenAiApiKey: hasApiKey,
        reason: "MISSING_IMAGE_DATA",
        success: false,
        durationMs: Date.now() - startedAt,
      });
      return NextResponse.json(
        { error: "OpenAI n a pas retourne d image exploitable." },
        { status: 502 },
      );
    }

    console.info("[ADMIN_POSTER_BACKGROUND_SUCCESS]", {
      gameId,
      format,
      hasOpenAiApiKey: hasApiKey,
      success: true,
      durationMs: Date.now() - startedAt,
    });

    return NextResponse.json({
      imageDataUrl: `data:image/png;base64,${imageBase64}`,
    });
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHENTICATED") {
      return NextResponse.json({ error: "Connexion admin requise." }, { status: 401 });
    }

    if (error instanceof Error && error.message === "FORBIDDEN") {
      return NextResponse.json({ error: "Acces admin requis." }, { status: 403 });
    }

    console.error("[ADMIN_POSTER_BACKGROUND_ERROR]", {
      success: false,
      durationMs: Date.now() - startedAt,
      error,
    });
    return NextResponse.json(
      { error: "Impossible de generer le fond IA pour le moment." },
      { status: 500 },
    );
  }
}
