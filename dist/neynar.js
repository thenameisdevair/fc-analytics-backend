"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.neynarClient = void 0;
exports.fetchCastsByFid = fetchCastsByFid;
exports.fetchUserCastsFromNeynar = fetchUserCastsFromNeynar;
// src/neynar.ts
const nodejs_sdk_1 = require("@neynar/nodejs-sdk");
const dotenv_1 = __importDefault(require("dotenv"));
const axios_1 = __importDefault(require("axios"));
dotenv_1.default.config();
if (!process.env.NEYNAR_API_KEY) {
    throw new Error("[neynar] NEYNAR_API_KEY is not set in .env – please add it before running the server.");
}
// ✅ SDK client (used in /api/debug/user etc.)
const config = new nodejs_sdk_1.Configuration({
    apiKey: process.env.NEYNAR_API_KEY, // safe after the check above
});
exports.neynarClient = new nodejs_sdk_1.NeynarAPIClient(config);
/**
 * Fetch recent casts via Neynar v2 `/v2/farcaster/casts`.
 * ⚠️ This endpoint may return 402 on some plans. Use mainly for debugging.
 */
async function fetchCastsByFid(fid, limit = 50) {
    const resp = await axios_1.default.get("https://api.neynar.com/v2/farcaster/casts", {
        params: {
            fid,
            limit,
            viewer_fid: fid,
        },
        headers: {
            "x-api-key": process.env.NEYNAR_API_KEY,
        },
    });
    return resp.data;
}
/**
 * Fetch recent casts for a specific user via `/v2/farcaster/user/casts`.
 * ⚠️ Also may return 402 on some plans – that’s expected.
 */
async function fetchUserCastsFromNeynar(fid, limit = 50) {
    const resp = await axios_1.default.get("https://api.neynar.com/v2/farcaster/user/casts", {
        params: {
            fid,
            limit,
        },
        headers: {
            "x-api-key": process.env.NEYNAR_API_KEY,
        },
    });
    return resp.data;
}
