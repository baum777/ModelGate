import { createHmac, randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
import type { FastifyReply, FastifyRequest } from "fastify";
import type { AppEnv } from "./env.js";

const PROFILE_COOKIE_NAME = "mosaicstack_local_profile";
const PROFILE_COOKIE_VERSION = "v1";
const PROFILE_COOKIE_MAX_AGE_SECONDS = 30 * 24 * 60 * 60;

export type LocalProfileSession = {
  profileId: string;
  created: boolean;
};

export type LocalProfileSessionManager = {
  resolve(request: FastifyRequest, reply: FastifyReply): LocalProfileSession;
};

function isProductionDeployment() {
  return process.env.NODE_ENV === "production";
}

function parseCookieHeader(cookieHeader: string | undefined, cookieName: string) {
  if (!cookieHeader) {
    return null;
  }

  for (const segment of cookieHeader.split(";")) {
    const trimmed = segment.trim();

    if (trimmed.startsWith(`${cookieName}=`)) {
      return trimmed.slice(cookieName.length + 1);
    }
  }

  return null;
}

function compareStringsSecurely(expected: string, actual: string) {
  const expectedBuffer = Buffer.from(expected);
  const actualBuffer = Buffer.from(actual);

  if (expectedBuffer.length !== actualBuffer.length) {
    return false;
  }

  return timingSafeEqual(expectedBuffer, actualBuffer);
}

function signProfileId(secret: string, profileId: string, nonce: string) {
  return createHmac("sha256", secret).update(`${profileId}.${nonce}`).digest("hex");
}

function readProfileCookie(request: FastifyRequest, secret: string) {
  const cookieHeader = Array.isArray(request.headers.cookie)
    ? request.headers.cookie[0]
    : request.headers.cookie;
  const rawValue = parseCookieHeader(cookieHeader, PROFILE_COOKIE_NAME);

  if (!rawValue) {
    return null;
  }

  let decoded: string;

  try {
    decoded = decodeURIComponent(rawValue);
  } catch {
    return null;
  }

  const [version, profileId, nonce, signature] = decoded.split(".");

  if (version !== PROFILE_COOKIE_VERSION || !profileId || !nonce || !signature) {
    return null;
  }

  if (!/^[a-f0-9-]{36}$/i.test(profileId)) {
    return null;
  }

  const expected = signProfileId(secret, profileId, nonce);

  if (!compareStringsSecurely(expected, signature)) {
    return null;
  }

  return profileId;
}

function buildProfileCookie(secret: string, profileId: string) {
  const nonce = randomBytes(16).toString("hex");
  const signature = signProfileId(secret, profileId, nonce);
  const value = encodeURIComponent(`${PROFILE_COOKIE_VERSION}.${profileId}.${nonce}.${signature}`);
  const attributes = [
    `${PROFILE_COOKIE_NAME}=${value}`,
    "HttpOnly",
    "Path=/",
    `Max-Age=${PROFILE_COOKIE_MAX_AGE_SECONDS}`,
    "SameSite=Lax"
  ];

  if (isProductionDeployment()) {
    attributes.push("Secure");
  }

  return attributes.join("; ");
}

function resolveProfileSecret(env: AppEnv) {
  const explicit = env.USER_CREDENTIALS_PROFILE_SECRET.trim();

  if (explicit) {
    return explicit;
  }

  const sessionSecret = env.MOSAIC_STACK_SESSION_SECRET.trim();

  if (sessionSecret) {
    return sessionSecret;
  }

  const credentialKey = env.USER_CREDENTIALS_ENCRYPTION_KEY.trim();

  if (credentialKey) {
    return credentialKey;
  }

  if (!isProductionDeployment()) {
    return "mosaicstack-local-preview-profile-secret";
  }

  return null;
}

export function createLocalProfileSessionManager(env: AppEnv): LocalProfileSessionManager {
  return {
    resolve(request, reply) {
      const secret = resolveProfileSecret(env);

      if (!secret) {
        throw new Error("local_profile_secret_not_configured");
      }

      const existing = readProfileCookie(request, secret);

      if (existing) {
        return {
          profileId: existing,
          created: false
        };
      }

      const profileId = randomUUID();
      reply.header("Set-Cookie", buildProfileCookie(secret, profileId));

      return {
        profileId,
        created: true
      };
    }
  };
}
