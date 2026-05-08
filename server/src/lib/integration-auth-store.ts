import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
  randomUUID
} from "node:crypto";
import type { AppEnv } from "./env.js";

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

type IntegrationAuthIntent = {
  provider: IntegrationProvider;
  state: string;
  sessionId: string;
  returnTo: string;
  createdAtMs: number;
  expiresAtMs: number;
};

type EncryptedCredentialEnvelope = {
  keyId: string;
  keyVersion: number;
  iv: string;
  tag: string;
  data: string;
};

type StoredCredentialPayload = {
  sessionId: string;
  provider: IntegrationProvider;
  credential: Record<string, unknown>;
  storedAt: string;
};

type IntegrationCredentialKeyConfig = {
  keyId: string;
  keyVersion: number;
  keyMaterial: string;
};

type IntegrationCredentialKey = {
  keyId: string;
  keyVersion: number;
  key: Buffer;
};

type CredentialEnvelopeByProvider = Partial<Record<IntegrationProvider, EncryptedCredentialEnvelope>>;

type IntegrationAuthStoreSnapshot = {
  version: 1;
  sessions: Array<{
    sessionId: string;
    connections: SessionConnections;
  }>;
  credentials: Array<{
    sessionId: string;
    providers: CredentialEnvelopeByProvider;
  }>;
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
    source: "user_connected_stub" | "user_connected";
  }) => IntegrationConnectionRecord;
  disconnect: (sessionId: string, provider: IntegrationProvider) => IntegrationConnectionRecord;
  reverify: (sessionId: string, provider: IntegrationProvider) => IntegrationConnectionRecord | null;
  setErrorCode: (sessionId: string, provider: IntegrationProvider, code: string | null) => void;
  storeCredential: (sessionId: string, provider: IntegrationProvider, credential: Record<string, unknown>) => boolean;
  readCredential: (sessionId: string | null | undefined, provider: IntegrationProvider) => Record<string, unknown> | null;
  clearCredential: (sessionId: string, provider: IntegrationProvider) => void;
};

export type IntegrationAuthStoreMode = "memory" | "file";

export type IntegrationAuthStoreSelection = {
  mode: IntegrationAuthStoreMode;
  filePath: string;
  encryption: {
    current: IntegrationCredentialKeyConfig | null;
    previous: IntegrationCredentialKeyConfig[];
  };
};

type IntegrationAuthStoreOptions = {
  stateTtlMs?: number;
  mode?: IntegrationAuthStoreMode;
  filePath?: string;
  encryptionSecret?: string;
  currentEncryptionKey?: IntegrationCredentialKeyConfig | null;
  previousEncryptionKeys?: IntegrationCredentialKeyConfig[];
  now?: () => number;
};

const DEFAULT_STATE_TTL_MS = 5 * 60 * 1000;
const DEFAULT_STORE_FILE_PATH = ".local-ai/state/integration-auth-store.json";
const VERCEL_TMP_STORE_ROOT = "mosaicstacked";

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isString(value: unknown): value is string {
  return typeof value === "string";
}

function isNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function isProvider(value: unknown): value is IntegrationProvider {
  return value === "github" || value === "matrix";
}

function parseKeyVersion(raw: string): number | null {
  const normalized = raw.trim();
  const parsed = Number.parseInt(normalized, 10);

  if (!Number.isFinite(parsed) || Number.isNaN(parsed) || parsed < 1) {
    return null;
  }

  return parsed;
}

function parsePreviousEncryptionKeys(input: string): IntegrationCredentialKeyConfig[] {
  const normalized = input.trim();

  if (normalized.length === 0) {
    return [];
  }

  const entries = normalized
    .split(",")
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);
  const parsed: IntegrationCredentialKeyConfig[] = [];

  for (const entry of entries) {
    const [keyMeta, keyMaterialRaw] = entry.split(":", 2);
    const keyMaterial = keyMaterialRaw?.trim() ?? "";

    if (!keyMeta || keyMaterial.length === 0) {
      continue;
    }

    const [keyIdRaw, keyVersionRaw] = keyMeta.split("@", 2);
    const keyId = keyIdRaw?.trim() ?? "";
    const keyVersion = parseKeyVersion(keyVersionRaw?.trim() ?? "");

    if (keyId.length === 0 || keyVersion === null) {
      continue;
    }

    parsed.push({
      keyId,
      keyVersion,
      keyMaterial
    });
  }

  return parsed;
}

export function createIntegrationAuthStoreSelection(env: AppEnv): IntegrationAuthStoreSelection {
  const mode = env.INTEGRATION_AUTH_STORE_MODE.trim().toLowerCase() === "memory" ? "memory" : "file";
  const configuredFilePath = env.INTEGRATION_AUTH_STORE_FILE_PATH.trim() || DEFAULT_STORE_FILE_PATH;
  const filePath = mode === "file"
    && process.env.VERCEL === "1"
    && !path.isAbsolute(configuredFilePath)
    ? path.join(os.tmpdir(), VERCEL_TMP_STORE_ROOT, configuredFilePath)
    : configuredFilePath;

  const currentKeyMaterial = env.INTEGRATION_AUTH_ENCRYPTION_CURRENT_KEY.trim();
  const currentKeyId = env.INTEGRATION_AUTH_ENCRYPTION_CURRENT_KEY_ID.trim();
  const currentKeyVersion = parseKeyVersion(env.INTEGRATION_AUTH_ENCRYPTION_CURRENT_KEY_VERSION);
  const previousKeys = parsePreviousEncryptionKeys(env.INTEGRATION_AUTH_ENCRYPTION_PREVIOUS_KEYS);

  let current: IntegrationCredentialKeyConfig | null = null;

  if (currentKeyMaterial.length > 0) {
    if (currentKeyId.length > 0 && currentKeyVersion !== null) {
      current = {
        keyId: currentKeyId,
        keyVersion: currentKeyVersion,
        keyMaterial: currentKeyMaterial
      };
    }
  }

  return {
    mode,
    filePath,
    encryption: {
      current,
      previous: previousKeys
    }
  };
}

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

function createStoreSnapshot(
  sessions: Map<string, SessionConnections>,
  credentials: Map<string, CredentialEnvelopeByProvider>
): IntegrationAuthStoreSnapshot {
  return {
    version: 1,
    sessions: [...sessions.entries()].map(([sessionId, connections]) => ({
      sessionId,
      connections
    })),
    credentials: [...credentials.entries()].map(([sessionId, providers]) => ({
      sessionId,
      providers
    }))
  };
}

function isConnectionRecord(value: unknown): value is IntegrationConnectionRecord {
  if (!isRecord(value)) {
    return false;
  }

  return typeof value.connected === "boolean"
    && (value.connectedAt === null || isString(value.connectedAt))
    && (value.lastVerifiedAt === null || isString(value.lastVerifiedAt))
    && (value.safeIdentityLabel === null || isString(value.safeIdentityLabel))
    && (value.lastErrorCode === null || isString(value.lastErrorCode))
    && (value.source === "user_connected_stub" || value.source === "user_connected");
}

function isSessionConnections(value: unknown): value is SessionConnections {
  if (!isRecord(value)) {
    return false;
  }

  return isConnectionRecord(value.github) && isConnectionRecord(value.matrix);
}

function isEncryptedCredentialEnvelope(value: unknown): value is EncryptedCredentialEnvelope {
  if (!isRecord(value)) {
    return false;
  }

  return isString(value.keyId)
    && isNumber(value.keyVersion)
    && isString(value.iv)
    && isString(value.tag)
    && isString(value.data);
}

function readSnapshotFile(filePath: string): IntegrationAuthStoreSnapshot | null {
  if (!fs.existsSync(filePath)) {
    return null;
  }

  try {
    const raw = fs.readFileSync(filePath, "utf8");
    const parsed = JSON.parse(raw) as unknown;

    if (!isRecord(parsed)) {
      return null;
    }

    if (parsed.version !== 1 || !Array.isArray(parsed.sessions) || !Array.isArray(parsed.credentials)) {
      return null;
    }

    const sessions: IntegrationAuthStoreSnapshot["sessions"] = [];
    const credentials: IntegrationAuthStoreSnapshot["credentials"] = [];

    for (const session of parsed.sessions) {
      if (!isRecord(session) || !isString(session.sessionId) || !isSessionConnections(session.connections)) {
        return null;
      }

      sessions.push({
        sessionId: session.sessionId,
        connections: session.connections
      });
    }

    for (const credential of parsed.credentials) {
      if (!isRecord(credential) || !isString(credential.sessionId) || !isRecord(credential.providers)) {
        return null;
      }

      const providers: CredentialEnvelopeByProvider = {};

      if ("github" in credential.providers) {
        if (!isEncryptedCredentialEnvelope(credential.providers.github)) {
          return null;
        }

        providers.github = credential.providers.github;
      }

      if ("matrix" in credential.providers) {
        if (!isEncryptedCredentialEnvelope(credential.providers.matrix)) {
          return null;
        }

        providers.matrix = credential.providers.matrix;
      }

      credentials.push({
        sessionId: credential.sessionId,
        providers
      });
    }

    return {
      version: 1,
      sessions,
      credentials
    };
  } catch {
    return null;
  }
}

function writeSnapshotFile(filePath: string, snapshot: IntegrationAuthStoreSnapshot) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const tempPath = `${filePath}.tmp-${process.pid}-${randomUUID()}`;
  fs.writeFileSync(tempPath, `${JSON.stringify(snapshot)}\n`, "utf8");
  fs.renameSync(tempPath, filePath);
}

function normalizeCredentialKeyConfig(config: IntegrationCredentialKeyConfig | null | undefined): IntegrationCredentialKey | null {
  if (!config) {
    return null;
  }

  const keyId = config.keyId.trim();
  const keyVersion = config.keyVersion;
  const keyMaterial = config.keyMaterial.trim();

  if (keyId.length === 0 || !Number.isFinite(keyVersion) || keyVersion < 1 || keyMaterial.length === 0) {
    return null;
  }

  return {
    keyId,
    keyVersion,
    key: createHash("sha256").update(keyMaterial).digest()
  };
}

function keyMapKey(keyId: string, keyVersion: number) {
  return `${keyId}@${keyVersion}`;
}

export function createIntegrationAuthStore(options: IntegrationAuthStoreOptions = {}): IntegrationAuthStore {
  const now = options.now ?? (() => Date.now());
  const stateTtlMs = options.stateTtlMs ?? DEFAULT_STATE_TTL_MS;
  const mode = options.mode ?? "memory";
  const filePath = mode === "file"
    ? path.resolve(options.filePath ?? DEFAULT_STORE_FILE_PATH)
    : null;
  const intentsByState = new Map<string, IntegrationAuthIntent>();
  const sessions = new Map<string, SessionConnections>();
  const credentials = new Map<string, CredentialEnvelopeByProvider>();

  const explicitCurrentKey = normalizeCredentialKeyConfig(options.currentEncryptionKey);
  const explicitPreviousKeys = (options.previousEncryptionKeys ?? [])
    .map((config) => normalizeCredentialKeyConfig(config))
    .filter((config): config is IntegrationCredentialKey => config !== null);

  const currentEncryptionKey = explicitCurrentKey;
  const decryptionKeys = new Map<string, IntegrationCredentialKey>();

  if (currentEncryptionKey) {
    decryptionKeys.set(keyMapKey(currentEncryptionKey.keyId, currentEncryptionKey.keyVersion), currentEncryptionKey);
  }

  for (const previousKey of explicitPreviousKeys) {
    decryptionKeys.set(keyMapKey(previousKey.keyId, previousKey.keyVersion), previousKey);
  }

  if (filePath) {
    const snapshot = readSnapshotFile(filePath);

    for (const entry of snapshot?.sessions ?? []) {
      sessions.set(entry.sessionId, entry.connections);
    }

    for (const entry of snapshot?.credentials ?? []) {
      credentials.set(entry.sessionId, entry.providers);
    }
  }

  function persist() {
    if (!filePath) {
      return;
    }

    writeSnapshotFile(filePath, createStoreSnapshot(sessions, credentials));
  }

  function pruneExpiredIntents(nowMs = now()) {
    for (const [state, intent] of intentsByState.entries()) {
      if (intent.expiresAtMs <= nowMs) {
        intentsByState.delete(state);
      }
    }
  }

  function getOrCreateSession(sessionId: string): { session: SessionConnections; created: boolean } {
    const existing = sessions.get(sessionId);

    if (existing) {
      return {
        session: existing,
        created: false
      };
    }

    const created = createEmptySessionConnections();
    sessions.set(sessionId, created);
    persist();
    return {
      session: created,
      created: true
    };
  }

  function encryptCredentialPayload(payload: StoredCredentialPayload): EncryptedCredentialEnvelope | null {
    if (!currentEncryptionKey) {
      return null;
    }

    const iv = randomBytes(12);
    const cipher = createCipheriv("aes-256-gcm", currentEncryptionKey.key, iv);
    const plaintext = Buffer.from(JSON.stringify(payload), "utf8");
    const encrypted = Buffer.concat([cipher.update(plaintext), cipher.final()]);
    const tag = cipher.getAuthTag();

    return {
      keyId: currentEncryptionKey.keyId,
      keyVersion: currentEncryptionKey.keyVersion,
      iv: iv.toString("base64"),
      tag: tag.toString("base64"),
      data: encrypted.toString("base64")
    };
  }

  function decryptCredentialPayload(
    envelope: EncryptedCredentialEnvelope,
    sessionId: string,
    provider: IntegrationProvider
  ): Record<string, unknown> | null {
    const key = decryptionKeys.get(keyMapKey(envelope.keyId, envelope.keyVersion));

    if (!key) {
      return null;
    }

    try {
      const iv = Buffer.from(envelope.iv, "base64");
      const tag = Buffer.from(envelope.tag, "base64");
      const encrypted = Buffer.from(envelope.data, "base64");
      const decipher = createDecipheriv("aes-256-gcm", key.key, iv);
      decipher.setAuthTag(tag);
      const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]);
      const parsed = JSON.parse(decrypted.toString("utf8")) as unknown;

      if (!isRecord(parsed)) {
        return null;
      }

      if (!isString(parsed.sessionId) || parsed.sessionId !== sessionId) {
        return null;
      }

      if (!isProvider(parsed.provider) || parsed.provider !== provider) {
        return null;
      }

      if (!isRecord(parsed.credential)) {
        return null;
      }

      return parsed.credential;
    } catch {
      return null;
    }
  }

  return {
    ensureSession(sessionId) {
      const normalized = sessionId?.trim() ?? "";

      if (normalized.length > 0) {
        const ensured = getOrCreateSession(normalized);
        return {
          sessionId: normalized,
          created: ensured.created
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
      const createdAtMs = now();
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
      const ensured = getOrCreateSession(input.sessionId);
      const nowIso = new Date(now()).toISOString();

      ensured.session[input.provider] = {
        connected: true,
        connectedAt: nowIso,
        lastVerifiedAt: nowIso,
        safeIdentityLabel: input.safeIdentityLabel,
        lastErrorCode: null,
        source: input.source
      };
      persist();
      return ensured.session[input.provider];
    },

    disconnect(sessionId, provider) {
      const ensured = getOrCreateSession(sessionId);
      ensured.session[provider] = createEmptyConnection();
      persist();
      return ensured.session[provider];
    },

    reverify(sessionId, provider) {
      const session = sessions.get(sessionId);

      if (!session || !session[provider].connected) {
        return null;
      }

      session[provider] = {
        ...session[provider],
        lastVerifiedAt: new Date(now()).toISOString(),
        lastErrorCode: null
      };
      persist();

      return session[provider];
    },

    setErrorCode(sessionId, provider, code) {
      const ensured = getOrCreateSession(sessionId);
      ensured.session[provider] = {
        ...ensured.session[provider],
        lastErrorCode: code
      };
      persist();
    },

    storeCredential(sessionId, provider, credential) {
      const encrypted = encryptCredentialPayload({
        sessionId,
        provider,
        credential,
        storedAt: new Date(now()).toISOString()
      });

      if (!encrypted) {
        return false;
      }

      const providerCredentials = credentials.get(sessionId) ?? {};
      providerCredentials[provider] = encrypted;
      credentials.set(sessionId, providerCredentials);
      persist();
      return true;
    },

    readCredential(sessionId, provider) {
      const normalized = sessionId?.trim() ?? "";

      if (!normalized) {
        return null;
      }

      const providerCredentials = credentials.get(normalized);
      const encrypted = providerCredentials?.[provider];

      if (!encrypted) {
        return null;
      }

      return decryptCredentialPayload(encrypted, normalized, provider);
    },

    clearCredential(sessionId, provider) {
      const providerCredentials = credentials.get(sessionId);

      if (!providerCredentials) {
        return;
      }

      delete providerCredentials[provider];

      if (Object.keys(providerCredentials).length === 0) {
        credentials.delete(sessionId);
      } else {
        credentials.set(sessionId, providerCredentials);
      }

      persist();
    }
  };
}
