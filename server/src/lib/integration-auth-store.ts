import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
  randomUUID
} from "node:crypto";

export type IntegrationProvider = "github" | "matrix";

export type IntegrationConnectionRecord = {
  connected: boolean;
  connectedAt: string | null;
  lastVerifiedAt: string | null;
  safeIdentityLabel: string | null;
  lastErrorCode: string | null;
  source: "user_connected_stub" | "user_connected";
};

type SessionConnections = Record<IntegrationProvider, IntegrationConnectionRecord>;

type EncryptedPayload = {
  iv: string;
  tag: string;
  data: string;
};

type IntegrationAuthIntent = {
  provider: IntegrationProvider;
  state: string;
  sessionId: string;
  returnTo: string;
  createdAtMs: number;
  expiresAtMs: number;
};

export type IntegrationAuthStore = {
  ensureSession: (sessionId: string | null | undefined) => { sessionId: string; created: boolean };
  createIntent: (input: { provider: IntegrationProvider; sessionId: string; returnTo: string }) => {
    state: string;
    expiresAt: string;
  };
  consumeIntent: (provider: IntegrationProvider, state: string) => IntegrationAuthIntent | null;
  readConnection: (sessionId: string | null | undefined, provider: IntegrationProvider) => IntegrationConnectionRecord | null;
  markConnected: (input: {
    sessionId: string;
    provider: IntegrationProvider;
    safeIdentityLabel: string;
    source?: "user_connected_stub" | "user_connected";
  }) => IntegrationConnectionRecord;
  disconnect: (sessionId: string, provider: IntegrationProvider) => IntegrationConnectionRecord;
  reverify: (sessionId: string, provider: IntegrationProvider) => IntegrationConnectionRecord | null;
  setErrorCode: (sessionId: string, provider: IntegrationProvider, code: string | null) => void;
  storeCredential: (sessionId: string, provider: IntegrationProvider, credential: Record<string, unknown>) => boolean;
  readCredential: (sessionId: string | null | undefined, provider: IntegrationProvider) => Record<string, unknown> | null;
  clearCredential: (sessionId: string, provider: IntegrationProvider) => void;
};

type IntegrationAuthStoreOptions = {
  stateTtlMs?: number;
  encryptionSecret?: string;
};

const DEFAULT_STATE_TTL_MS = 5 * 60 * 1000;

function createEmptyConnection(): IntegrationConnectionRecord {
  return {
    connected: false,
    connectedAt: null,
    lastVerifiedAt: null,
    safeIdentityLabel: null,
    lastErrorCode: null,
    source: "user_connected_stub"
  };
}

function createEmptySessionConnections(): SessionConnections {
  return {
    github: createEmptyConnection(),
    matrix: createEmptyConnection()
  };
}

export function createIntegrationAuthStore(options: IntegrationAuthStoreOptions = {}): IntegrationAuthStore {
  const stateTtlMs = options.stateTtlMs ?? DEFAULT_STATE_TTL_MS;
  const intentsByState = new Map<string, IntegrationAuthIntent>();
  const sessions = new Map<string, SessionConnections>();
  const credentials = new Map<string, Record<IntegrationProvider, EncryptedPayload>>();
  const encryptionKey = options.encryptionSecret && options.encryptionSecret.trim().length > 0
    ? createHash("sha256").update(options.encryptionSecret.trim()).digest()
    : null;

  function pruneExpiredIntents(nowMs = Date.now()) {
    for (const [state, intent] of intentsByState.entries()) {
      if (intent.expiresAtMs <= nowMs) {
        intentsByState.delete(state);
      }
    }
  }

  function getOrCreateSession(sessionId: string): SessionConnections {
    const existing = sessions.get(sessionId);

    if (existing) {
      return existing;
    }

    const created = createEmptySessionConnections();
    sessions.set(sessionId, created);
    return created;
  }

  function credentialMapKey(sessionId: string) {
    return sessionId;
  }

  function encryptPayload(payload: Record<string, unknown>): EncryptedPayload | null {
    if (!encryptionKey) {
      return null;
    }

    const iv = randomBytes(12);
    const cipher = createCipheriv("aes-256-gcm", encryptionKey, iv);
    const plaintext = Buffer.from(JSON.stringify(payload), "utf8");
    const encrypted = Buffer.concat([cipher.update(plaintext), cipher.final()]);
    const tag = cipher.getAuthTag();

    return {
      iv: iv.toString("base64"),
      tag: tag.toString("base64"),
      data: encrypted.toString("base64")
    };
  }

  function decryptPayload(payload: EncryptedPayload): Record<string, unknown> | null {
    if (!encryptionKey) {
      return null;
    }

    try {
      const iv = Buffer.from(payload.iv, "base64");
      const tag = Buffer.from(payload.tag, "base64");
      const encrypted = Buffer.from(payload.data, "base64");
      const decipher = createDecipheriv("aes-256-gcm", encryptionKey, iv);
      decipher.setAuthTag(tag);
      const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]);
      const parsed = JSON.parse(decrypted.toString("utf8")) as unknown;

      if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
        return null;
      }

      return parsed as Record<string, unknown>;
    } catch {
      return null;
    }
  }

  return {
    ensureSession(sessionId) {
      const normalized = sessionId?.trim() ?? "";

      if (normalized.length > 0) {
        getOrCreateSession(normalized);
        return {
          sessionId: normalized,
          created: false
        };
      }

      const nextSessionId = randomUUID();
      getOrCreateSession(nextSessionId);
      return {
        sessionId: nextSessionId,
        created: true
      };
    },

    createIntent(input) {
      pruneExpiredIntents();
      const createdAtMs = Date.now();
      const state = randomUUID();

      intentsByState.set(state, {
        provider: input.provider,
        state,
        sessionId: input.sessionId,
        returnTo: input.returnTo,
        createdAtMs,
        expiresAtMs: createdAtMs + stateTtlMs
      });

      return {
        state,
        expiresAt: new Date(createdAtMs + stateTtlMs).toISOString()
      };
    },

    consumeIntent(provider, state) {
      pruneExpiredIntents();
      const intent = intentsByState.get(state);

      if (!intent || intent.provider !== provider) {
        return null;
      }

      intentsByState.delete(state);
      return intent;
    },

    readConnection(sessionId, provider) {
      const normalized = sessionId?.trim() ?? "";

      if (!normalized) {
        return null;
      }

      const session = sessions.get(normalized);

      if (!session) {
        return null;
      }

      return session[provider];
    },

    markConnected(input) {
      const session = getOrCreateSession(input.sessionId);
      const now = new Date().toISOString();

      session[input.provider] = {
        connected: true,
        connectedAt: now,
        lastVerifiedAt: now,
        safeIdentityLabel: input.safeIdentityLabel,
        lastErrorCode: null,
        source: input.source ?? "user_connected_stub"
      };

      return session[input.provider];
    },

    disconnect(sessionId, provider) {
      const session = getOrCreateSession(sessionId);
      session[provider] = createEmptyConnection();
      return session[provider];
    },

    reverify(sessionId, provider) {
      const session = sessions.get(sessionId);

      if (!session || !session[provider].connected) {
        return null;
      }

      session[provider] = {
        ...session[provider],
        lastVerifiedAt: new Date().toISOString(),
        lastErrorCode: null
      };

      return session[provider];
    },

    setErrorCode(sessionId, provider, code) {
      const session = getOrCreateSession(sessionId);
      session[provider] = {
        ...session[provider],
        lastErrorCode: code
      };
    },

    storeCredential(sessionId, provider, credential) {
      const encrypted = encryptPayload(credential);

      if (!encrypted) {
        return false;
      }

      const key = credentialMapKey(sessionId);
      const entry = credentials.get(key) ?? {
        github: encryptPayload({}) ?? { iv: "", tag: "", data: "" },
        matrix: encryptPayload({}) ?? { iv: "", tag: "", data: "" }
      };

      entry[provider] = encrypted;
      credentials.set(key, entry);
      return true;
    },

    readCredential(sessionId, provider) {
      const normalized = sessionId?.trim() ?? "";

      if (!normalized) {
        return null;
      }

      const stored = credentials.get(credentialMapKey(normalized));

      if (!stored) {
        return null;
      }

      return decryptPayload(stored[provider]);
    },

    clearCredential(sessionId, provider) {
      const key = credentialMapKey(sessionId);
      const stored = credentials.get(key);

      if (!stored) {
        return;
      }

      const replacement = encryptPayload({});

      if (!replacement) {
        credentials.delete(key);
        return;
      }

      stored[provider] = replacement;
      credentials.set(key, stored);
    }
  };
}
