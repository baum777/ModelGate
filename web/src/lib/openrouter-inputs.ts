export const OPENROUTER_API_KEY_MIN_LENGTH = 20;
export const OPENROUTER_MODEL_ID_MAX_LENGTH = 200;

const OPENROUTER_MODEL_ID_PATTERN = /^[A-Za-z0-9_.:-]+\/[A-Za-z0-9_.:-]+$/;

function containsWhitespaceOrControl(value: string) {
  return /[\s\x00-\x1F\x7F]/.test(value);
}

export function isOpenRouterApiKeyInputValid(value: string) {
  const trimmed = value.trim();

  return trimmed.length >= OPENROUTER_API_KEY_MIN_LENGTH && !containsWhitespaceOrControl(trimmed);
}

export function isOpenRouterModelIdInputValid(value: string) {
  const trimmed = value.trim();

  return (
    trimmed.length > 0
    && trimmed.length <= OPENROUTER_MODEL_ID_MAX_LENGTH
    && !containsWhitespaceOrControl(trimmed)
    && OPENROUTER_MODEL_ID_PATTERN.test(trimmed)
  );
}

export function areOpenRouterCredentialInputsValid(apiKey: string, modelId: string) {
  return isOpenRouterApiKeyInputValid(apiKey) && isOpenRouterModelIdInputValid(modelId);
}
