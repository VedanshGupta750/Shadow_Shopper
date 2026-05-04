import { AzureOpenAI } from "openai";
import { env } from "../env.js";

export const GPT_MODEL = env.DEPLOYMENT_NAME;
export const DEFAULT_MAX_TOKENS = 1024;

function createClient(): AzureOpenAI {
  return new AzureOpenAI({
    endpoint: env.AZURE_ENDPOINT,
    apiKey: env.AZURE_API_KEY,
    apiVersion: env.AZURE_API_VERSION,
    deployment: env.DEPLOYMENT_NAME,
  });
}

let _client: AzureOpenAI | undefined;

/** Lazy singleton — created on first call so env is validated before construction. */
export function getAzureClient(): AzureOpenAI {
  if (!_client) _client = createClient();
  return _client;
}
