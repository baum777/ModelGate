import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { RuntimeJournal, JournalSource } from "../lib/runtime-journal.js";

const JournalRecentQuerySchema = z.object({
  limit: z.string().trim().optional(),
  source: z.enum(["chat", "github", "matrix", "auth", "rate_limit", "diagnostics", "system"]).optional()
});

type JournalRouteDependencies = {
  runtimeJournal: RuntimeJournal;
};

function parseLimit(raw: string | undefined) {
  if (!raw) {
    return undefined;
  }

  const parsed = Number.parseInt(raw, 10);

  if (!Number.isFinite(parsed) || Number.isNaN(parsed) || parsed < 1) {
    return undefined;
  }

  return Math.floor(parsed);
}

export function journalRoutes(app: FastifyInstance, deps: JournalRouteDependencies) {
  app.get("/journal/recent", async (request, reply) => {
    const parsed = JournalRecentQuerySchema.safeParse(request.query);

    if (!parsed.success) {
      return reply.status(400).send({
        ok: false,
        error: {
          code: "invalid_request",
          message: "Invalid journal query"
        }
      });
    }

    const limit = parseLimit(parsed.data.limit);
    const source = parsed.data.source as JournalSource | undefined;
    const entries = deps.runtimeJournal.listRecent({
      limit,
      source
    });

    return reply.status(200).send({
      ok: true,
      entries
    });
  });
}
