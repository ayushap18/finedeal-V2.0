import { NextRequest } from "next/server";
import { corsError } from "@/lib/api-helpers";
import { logger } from "@/lib/logger";

type RouteHandler = (req: NextRequest, context?: unknown) => Promise<Response>;

export function withErrorHandler(
  handler: RouteHandler,
  source: string
): RouteHandler {
  return async (req: NextRequest, context?: unknown) => {
    try {
      return await handler(req, context);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Internal server error";
      const stack = err instanceof Error ? err.stack : undefined;

      logger.error(source, `Unhandled error: ${message}`, {
        method: req.method,
        url: req.url,
        stack,
      });

      return corsError("Internal server error", 500);
    }
  };
}
