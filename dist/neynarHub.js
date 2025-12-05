"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.fetchCastsByFidFromHub = fetchCastsByFidFromHub;
// src/neynarHub.ts
const axios_1 = __importDefault(require("axios"));
const dotenv_1 = __importDefault(require("dotenv"));
dotenv_1.default.config();
const NEYNAR_HUB_API_KEY = process.env.NEYNAR_API_KEY || "";
if (!NEYNAR_HUB_API_KEY) {
    console.warn("[neynarHub] NEYNAR_API_KEY is missing – Hub calls will fail until you set it in .env");
}
const NEYNAR_HUB_BASE = "https://hub-api.neynar.com/v1";
/**
 * Fetch recent casts for a given fid from Neynar Hub HTTP API.
 * Uses GET /v1/castsByFid
 */
async function fetchCastsByFidFromHub(fid, pageSize = 50) {
    var _a, _b;
    if (!NEYNAR_HUB_API_KEY) {
        throw new Error("[neynarHub] NEYNAR_API_KEY missing in env");
    }
    const url = `${NEYNAR_HUB_BASE}/castsByFid`;
    const res = await axios_1.default.get(url, {
        params: {
            fid,
            pageSize,
            reverse: true,
        },
        headers: {
            api_key: NEYNAR_HUB_API_KEY,
        },
    });
    const raw = res.data;
    console.dir(raw, { depth: 4 });
    // Hub responses can vary slightly in shape, so we’re defensive:
    const messages = Array.isArray(raw.messages)
        ? raw.messages
        : Array.isArray((_a = raw.result) === null || _a === void 0 ? void 0 : _a.messages)
            ? raw.result.messages
            : Array.isArray((_b = raw.result) === null || _b === void 0 ? void 0 : _b.casts)
                ? raw.result.casts
                : Array.isArray(raw.casts)
                    ? raw.casts
                    : [];
    const simplified = messages.map((m) => {
        var _a, _b, _c;
        const data = m.data || ((_a = m.message) === null || _a === void 0 ? void 0 : _a.data) || m;
        const body = data.castAddBody || data.body || {};
        const text = body.text || data.text || m.text || "";
        return {
            hash: m.hash || data.hash,
            fid: (_b = data.fid) !== null && _b !== void 0 ? _b : m.fid,
            text,
            timestamp: (_c = data.timestamp) !== null && _c !== void 0 ? _c : m.timestamp,
        };
    });
    return simplified;
}
