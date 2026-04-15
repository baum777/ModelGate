import type { IncomingMessage, ServerResponse } from "node:http";
import { handleVercelRequest } from "../../_handler.js";

export default function matrixApiHandler(request: IncomingMessage, response: ServerResponse) {
  return handleVercelRequest(request, response);
}
