import type { IncomingMessage, ServerResponse } from "node:http";
import { handleVercelRequest } from "./_handler.js";

export default async function handler(request: IncomingMessage, response: ServerResponse) {
  await handleVercelRequest(request, response);
}
