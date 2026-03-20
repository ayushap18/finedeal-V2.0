import { NextRequest } from "next/server";
import { corsJson, corsError, handleOptions } from "@/lib/api-helpers";
import {
  classifyProduct,
  compareProducts,
  analyzePriceTrend,
  generateDealSummary,
  checkApiConnectivity,
} from "@/lib/ai";

export async function GET() {
  try {
    const connectivity = await checkApiConnectivity();

    const models = [
      {
        id: "groq-llama3-70b",
        name: "LLaMA 3.3 70B",
        provider: "Groq",
        status: connectivity.groq.status === "connected" ? "active" : "error",
        accuracy: 91.8,
        last_trained: null,
      },
      {
        id: "gemini-3-flash-preview",
        name: "Gemini 3 Flash Preview",
        provider: "Google",
        status: connectivity.gemini.status === "connected" ? "active" : "error",
        accuracy: 94.2,
        last_trained: null,
      },
    ];

    const connectedCount = [connectivity.groq, connectivity.gemini].filter(c => c.status === "connected").length;

    return corsJson({
      models,
      connectivity,
      training_stats: {
        model_accuracy: connectivity.groq.status === "connected" ? 91.8 : (connectivity.gemini.status === "connected" ? 94.2 : 0),
        connected_models: connectedCount,
        total_models: 2,
        classification_rate: connectedCount > 0 ? 97.2 : 0,
        last_checked: new Date().toISOString(),
        groq_available: connectivity.groq.status === "connected",
        gemini_available: connectivity.gemini.status === "connected",
      },
    });
  } catch (e) {
    return corsError("Failed to fetch AI data", 500);
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { action } = body;

    switch (action) {
      case "classify": {
        if (!body.product) return corsError("Missing 'product' field", 400);
        const result = await classifyProduct(body.product, body.description);
        return corsJson({ action: "classify", result });
      }

      case "compare": {
        if (!body.products || !Array.isArray(body.products))
          return corsError("Missing 'products' array", 400);
        const result = await compareProducts(body.products);
        return corsJson({ action: "compare", result });
      }

      case "analyze": {
        if (!body.product || !body.history)
          return corsError("Missing 'product' or 'history' field", 400);
        const result = await analyzePriceTrend(body.product, body.history);
        return corsJson({ action: "analyze", result });
      }

      case "summarize": {
        if (!body.products || !Array.isArray(body.products))
          return corsError("Missing 'products' array", 400);
        const result = await generateDealSummary(body.products);
        return corsJson({ action: "summarize", result });
      }

      default:
        return corsError(
          `Unknown action '${action}'. Valid actions: classify, compare, analyze, summarize`,
          400,
        );
    }
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unknown error";
    return corsError(`AI request failed: ${message}`, 500);
  }
}

export async function OPTIONS() {
  return handleOptions();
}
