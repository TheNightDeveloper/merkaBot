import type { AppConfig } from "../../config";
import { logger } from "../logger";
import type { ClientPayload, ClientTraffic, ProvisionedClient } from "./types";

type PanelResponse<T> = {
  success?: boolean;
  msg?: string;
  obj?: T;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export class ThreeXUiGateway {
  private readonly baseUrl: string;

  private readonly apiToken: string;

  constructor(config: AppConfig) {
    this.baseUrl = `${config.panelBaseUrl}/panel/api`;
    this.apiToken = config.panelApiToken;
  }

  async createClient(client: ClientPayload, inboundId: number): Promise<ProvisionedClient> {
    const result = await this.request<Record<string, unknown>>("/clients/add", {
      method: "POST",
      body: JSON.stringify({
        client,
        inboundIds: [inboundId]
      })
    });

    return this.extractClient(result, client);
  }

  async updateClient(email: string, client: ClientPayload, inboundId: number): Promise<ProvisionedClient> {
    const result = await this.request<Record<string, unknown>>(`/clients/update/${encodeURIComponent(email)}`, {
      method: "POST",
      body: JSON.stringify({
        client,
        inboundIds: [inboundId]
      })
    });

    return this.extractClient(result, client);
  }

  async deleteClient(email: string): Promise<void> {
    await this.request(`/clients/del/${encodeURIComponent(email)}`, {
      method: "POST"
    });
  }

  async getClient(email: string): Promise<Record<string, unknown> | null> {
    return this.request<Record<string, unknown> | null>(`/clients/get/${encodeURIComponent(email)}`, {
      method: "GET"
    });
  }

  async getTraffic(email: string): Promise<ClientTraffic> {
    const result = await this.request<Record<string, unknown>>(`/clients/traffic/${encodeURIComponent(email)}`, {
      method: "GET"
    });

    return {
      up: Number(result?.up ?? 0),
      down: Number(result?.down ?? 0)
    };
  }

  async getLinks(email: string): Promise<string[]> {
    const result = await this.request<unknown>(`/clients/links/${encodeURIComponent(email)}`, {
      method: "GET"
    });

    return extractStrings(result);
  }

  async getSubLink(subId: string): Promise<string[]> {
    const result = await this.request<unknown>(`/clients/subLinks/${encodeURIComponent(subId)}`, {
      method: "GET"
    });

    return extractStrings(result);
  }

  async resetTraffic(email: string): Promise<void> {
    await this.request(`/clients/resetTraffic/${encodeURIComponent(email)}`, {
      method: "POST"
    });
  }

  async verifyAccess(): Promise<void> {
    await this.request("/inbounds/list", { method: "GET" });
  }

  private async request<T>(path: string, init: RequestInit): Promise<T> {
    let response: Response;

    try {
      response = await fetch(`${this.baseUrl}${path}`, {
        ...init,
        signal: init.signal ?? AbortSignal.timeout(15_000),
        headers: {
          Authorization: `Bearer ${this.apiToken}`,
          "Content-Type": "application/json",
          ...(init.headers ?? {})
        }
      });
    } catch (error) {
      if (error instanceof Error && error.name === "TimeoutError") {
        throw new Error(`3x-ui request timed out for ${path}.`);
      }

      throw error;
    }

    if (!response.ok) {
      throw new Error(`3x-ui request failed with status ${response.status}.`);
    }

    const payload = (await response.json()) as PanelResponse<T>;

    if (payload.success === false) {
      throw new Error(payload.msg || "3x-ui request failed.");
    }

    return (payload.obj ?? payload) as T;
  }

  private extractClient(result: Record<string, unknown>, fallback: ClientPayload): ProvisionedClient {
    const email = String(result.email ?? fallback.email);
    const clientUuid = String(result.id ?? fallback.id ?? "");
    const subId = String(result.subId ?? fallback.subId ?? "");

    if (!email || !clientUuid || !subId) {
      logger.warn("3x-ui response missing client identity fields", { result });
      throw new Error("3x-ui response did not include enough client identity data.");
    }

    return { email, clientUuid, subId };
  }
}

function extractStrings(value: unknown): string[] {
  if (typeof value === "string") {
    return [value];
  }

  if (Array.isArray(value)) {
    return value.flatMap((item) => extractStrings(item));
  }

  if (!isRecord(value)) {
    return [];
  }

  return Object.values(value).flatMap((item) => extractStrings(item));
}
