import fs from "node:fs";
import path from "node:path";
import { createCipheriv, createDecipheriv, createHash, randomBytes, randomUUID } from "node:crypto";
import type { AppEnv } from "./env.js";

export const USER_OPENROUTER_ALIAS = "user_openrouter_default";

export type UserOpenRouterModel = {
  alias: typeof USER_OPENROUTER_ALIAS;
  label: string;
  source: "user_configured";
};

export type UserOpenRouterCredential = {
  apiKey: string;
  modelId: string;
};

export type UserOpenRouterCredentialStore = {
  read(profileId: string): UserOpenRouterCredential | null;
  write(profileId: string, credential: UserOpenRouterCredential): "stored" | "encryption_not_configured";
  status(profileId: string): { configured: boolean; models: UserOpenRouterModel[] };
};

type EncryptedEnvelope = {
  version: 1;
  iv: string;
  tag: string;
  data: string;
};

type StoredPayload = {
  profileId: string;
  credential: UserOpenRouterCredential;
  storedAt: string;
};

function isProductionDeployment() {
  return process.env.NODE_ENV === "production";
}

function normalizeEncryptionKey(keyMaterial: string) {
  const trimmed = keyMaterial.trim();

  if (!trimmed) {
    return null;
  }

  return createHash("sha256").update(trimmed).digest();
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isEnvelope(value: unknown): value is EncryptedEnvelope {
  return isRecord(value)
    && value.version === 1
    && typeof value.iv === "string"
    && typeof value.tag === "string"
    && typeof value.data === "string";
}

function modelEntry(modelId: string): UserOpenRouterModel {
  return {
    alias: USER_OPENROUTER_ALIAS,
    label: modelId,
    source: "user_configured"
  };
}

function sanitizeProfileId(profileId: string) {
  return /^[a-f0-9-]{36}$/i.test(profileId) ? profileId : null;
}

function resolveProfileFile(basePath: string, profileId: string) {
  const safeProfileId = sanitizeProfileId(profileId);

  if (!safeProfileId) {
    return null;
  }

  const root = path.resolve(basePath);
  const target = path.resolve(root, safeProfileId, "openrouter-credentials.json");

  if (!target.startsWith(`${root}${path.sep}`)) {
    return null;
  }

  return target;
}

function encryptPayload(key: Buffer, payload: StoredPayload): EncryptedEnvelope {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([
    cipher.update(Buffer.from(JSON.stringify(payload), "utf8")),
    cipher.final()
  ]);

  return {
    version: 1,
    iv: iv.toString("base64"),
    tag: cipher.getAuthTag().toString("base64"),
    data: encrypted.toString("base64")
  };
}

function decryptPayload(key: Buffer, envelope: EncryptedEnvelope, profileId: string): UserOpenRouterCredential | null {
  try {
    const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(envelope.iv, "base64"));
    decipher.setAuthTag(Buffer.from(envelope.tag, "base64"));
    const decrypted = Buffer.concat([
      decipher.update(Buffer.from(envelope.data, "base64")),
      decipher.final()
    ]);
    const parsed = JSON.parse(decrypted.toString("utf8")) as unknown;

    if (!isRecord(parsed) || parsed.profileId !== profileId || !isRecord(parsed.credential)) {
      return null;
    }

    const apiKey = typeof parsed.credential.apiKey === "string" ? parsed.credential.apiKey : "";
    const modelId = typeof parsed.credential.modelId === "string" ? parsed.credential.modelId : "";

    if (!apiKey || !modelId) {
      return null;
    }

    return {
      apiKey,
      modelId
    };
  } catch {
    return null;
  }
}

export function createUserOpenRouterCredentialStore(env: AppEnv): UserOpenRouterCredentialStore {
  const mode = env.USER_CREDENTIALS_STORE_MODE === "memory" ? "memory" : "file";
  const encryptionKey = normalizeEncryptionKey(env.USER_CREDENTIALS_ENCRYPTION_KEY);
  const memory = new Map<string, EncryptedEnvelope | UserOpenRouterCredential>();
  const allowPlainMemoryPreview = mode === "memory" && !isProductionDeployment();

  function canStoreWithoutEncryption() {
    return !encryptionKey && allowPlainMemoryPreview;
  }

  function readEnvelopeFromFile(profileId: string) {
    const filePath = resolveProfileFile(env.USER_CREDENTIALS_STORE_PATH, profileId);

    if (!filePath || !fs.existsSync(filePath)) {
      return null;
    }

    try {
      const parsed = JSON.parse(fs.readFileSync(filePath, "utf8")) as unknown;
      return isEnvelope(parsed) ? parsed : null;
    } catch {
      return null;
    }
  }

  function writeEnvelopeToFile(profileId: string, envelope: EncryptedEnvelope) {
    const filePath = resolveProfileFile(env.USER_CREDENTIALS_STORE_PATH, profileId);

    if (!filePath) {
      return;
    }

    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    const tempPath = `${filePath}.tmp-${process.pid}-${randomUUID()}`;
    fs.writeFileSync(tempPath, `${JSON.stringify(envelope)}\n`, "utf8");
    fs.renameSync(tempPath, filePath);
  }

  return {
    read(profileId) {
      if (canStoreWithoutEncryption()) {
        const credential = memory.get(profileId);
        return credential && !("data" in credential) ? credential : null;
      }

      if (!encryptionKey) {
        return null;
      }

      const envelope = mode === "memory"
        ? memory.get(profileId)
        : readEnvelopeFromFile(profileId);

      if (!envelope || !("data" in envelope)) {
        return null;
      }

      return decryptPayload(encryptionKey, envelope, profileId);
    },

    write(profileId, credential) {
      if (canStoreWithoutEncryption()) {
        memory.set(profileId, credential);
        return "stored";
      }

      if (!encryptionKey) {
        return "encryption_not_configured";
      }

      const envelope = encryptPayload(encryptionKey, {
        profileId,
        credential,
        storedAt: new Date().toISOString()
      });

      if (mode === "memory") {
        memory.set(profileId, envelope);
      } else {
        writeEnvelopeToFile(profileId, envelope);
      }

      return "stored";
    },

    status(profileId) {
      const credential = this.read(profileId);

      if (!credential) {
        return {
          configured: false,
          models: []
        };
      }

      return {
        configured: true,
        models: [modelEntry(credential.modelId)]
      };
    }
  };
}
