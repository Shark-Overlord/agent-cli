import Anthropic from "@anthropic-ai/sdk";
import "dotenv/config";

export const DEFAULT_MODEL = "deepseek-v4-flash";
export const DEFAULT_MAX_TOKENS = 8096;

let clientInstance: Anthropic | null = null;

export function getClient(): Anthropic {
    if (!clientInstance) {
        const apiKey = process.env.DEEPSEEK_API_KEY;

        if (!apiKey) {
            throw new Error(
                "DEEPSEEK_API_KEY not set. Add it to your .env file."
            );
        }

        clientInstance = new Anthropic({
            apiKey,
            baseURL:
                process.env.DEEPSEEK_BASE_URL ||
                "https://api.deepseek.com/anthropic"
        });
    }

    return clientInstance;
}

export function getModel(): string {
    return process.env.DEEPSEEK_MODEL || DEFAULT_MODEL;
}

export function setClient(client: Anthropic): void {
    clientInstance = client;
}
