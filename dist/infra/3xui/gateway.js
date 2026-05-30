"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ThreeXUiGateway = void 0;
const logger_1 = require("../logger");
function isRecord(value) {
    return typeof value === "object" && value !== null;
}
class ThreeXUiGateway {
    baseUrl;
    apiToken;
    constructor(config) {
        this.baseUrl = `${config.panelBaseUrl}/panel/api`;
        this.apiToken = config.panelApiToken;
    }
    async createClient(client, inboundId) {
        const result = await this.request("/clients/add", {
            method: "POST",
            body: JSON.stringify({
                client,
                inboundIds: [inboundId]
            })
        });
        return this.extractClient(result, client);
    }
    async updateClient(email, client, inboundId) {
        const result = await this.request(`/clients/update/${encodeURIComponent(email)}`, {
            method: "POST",
            body: JSON.stringify({
                client,
                inboundIds: [inboundId]
            })
        });
        return this.extractClient(result, client);
    }
    async deleteClient(email) {
        await this.request(`/clients/del/${encodeURIComponent(email)}`, {
            method: "POST"
        });
    }
    async getClient(email) {
        return this.request(`/clients/get/${encodeURIComponent(email)}`, {
            method: "GET"
        });
    }
    async getTraffic(email) {
        const result = await this.request(`/clients/traffic/${encodeURIComponent(email)}`, {
            method: "GET"
        });
        return {
            up: Number(result?.up ?? 0),
            down: Number(result?.down ?? 0)
        };
    }
    async getLinks(email) {
        const result = await this.request(`/clients/links/${encodeURIComponent(email)}`, {
            method: "GET"
        });
        return extractStrings(result);
    }
    async getSubLink(subId) {
        const result = await this.request(`/clients/subLinks/${encodeURIComponent(subId)}`, {
            method: "GET"
        });
        return extractStrings(result);
    }
    async resetTraffic(email) {
        await this.request(`/clients/resetTraffic/${encodeURIComponent(email)}`, {
            method: "POST"
        });
    }
    async verifyAccess() {
        await this.request("/inbounds/list", { method: "GET" });
    }
    async request(path, init) {
        let response;
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
        }
        catch (error) {
            if (error instanceof Error && error.name === "TimeoutError") {
                throw new Error(`3x-ui request timed out for ${path}.`);
            }
            throw error;
        }
        if (!response.ok) {
            throw new Error(`3x-ui request failed with status ${response.status}.`);
        }
        const payload = (await response.json());
        if (payload.success === false) {
            throw new Error(payload.msg || "3x-ui request failed.");
        }
        return (payload.obj ?? payload);
    }
    extractClient(result, fallback) {
        const email = String(result.email ?? fallback.email);
        const clientUuid = String(result.id ?? fallback.id ?? "");
        const subId = String(result.subId ?? fallback.subId ?? "");
        if (!email || !clientUuid || !subId) {
            logger_1.logger.warn("3x-ui response missing client identity fields", { result });
            throw new Error("3x-ui response did not include enough client identity data.");
        }
        return { email, clientUuid, subId };
    }
}
exports.ThreeXUiGateway = ThreeXUiGateway;
function extractStrings(value) {
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
