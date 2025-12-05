"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
// src/index.ts
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const dotenv_1 = __importDefault(require("dotenv"));
const db_1 = require("./db");
const neynar_1 = require("./neynar");
const neynarHub_1 = require("./neynarHub");
dotenv_1.default.config();
const app = (0, express_1.default)();
const PORT = process.env.PORT || 4000;
app.use((0, cors_1.default)());
app.use(express_1.default.json());
console.log("⚡ Starting server...");
// Helper: map raw Hub casts into simple "post" objects for the frontend
function mapHubCastsToTopPosts(casts, limit) {
    // sort newest → oldest based on timestamp
    const sorted = [...casts].sort((a, b) => {
        var _a, _b;
        const ta = Number((_a = a.timestamp) !== null && _a !== void 0 ? _a : 0);
        const tb = Number((_b = b.timestamp) !== null && _b !== void 0 ? _b : 0);
        return tb - ta;
    });
    const sliced = sorted.slice(0, limit);
    return sliced.map((c) => {
        // Normalize timestamp to ISO string (frontend uses new Date(post.createdAt))
        let createdAtIso = new Date().toISOString();
        if (c.timestamp) {
            const tsNum = typeof c.timestamp === "string"
                ? Number(c.timestamp)
                : Number(c.timestamp);
            if (!Number.isNaN(tsNum) && tsNum > 0) {
                createdAtIso = new Date(tsNum).toISOString();
            }
        }
        return {
            // shape matches what your frontend expects:
            // createdAt, impressions, engagements, text
            createdAt: createdAtIso,
            impressions: 0, // we don’t have real impressions yet from Hub
            engagements: 0, // we’ll add real metrics later
            text: c.text || "",
        };
    });
}
// --------------------- Health & DB --------------------- //
app.get("/health", (req, res) => {
    res.json({ ok: true, message: "Farcaster Analytics backend is running 🚀" });
});
app.get("/db-test", async (req, res) => {
    try {
        await (0, db_1.testDbConnection)();
        res.json({ ok: true, message: "Database connection is working ✅" });
    }
    catch (error) {
        console.error("DB test failed:", error);
        res
            .status(500)
            .json({ ok: false, message: "Database connection failed ❌" });
    }
});
// --------------------- Summary --------------------- //
app.get("/api/me/summary", async (req, res) => {
    try {
        const fidParam = req.query.fid;
        const farcasterId = typeof fidParam === "string" && fidParam.trim().length > 0
            ? fidParam.trim()
            : "12345";
        const account = await (0, db_1.getAccountByFarcasterId)(farcasterId);
        if (!account) {
            return res.status(404).json({
                ok: false,
                message: "Account not found for this Farcaster ID",
            });
        }
        const totalCasts = await (0, db_1.getTotalCastsForFarcasterId)(farcasterId);
        const { totalImpressions, totalEngagements } = await (0, db_1.getImpressionsAndEngagementsForFarcasterId)(farcasterId);
        const avgEngagementRatePercent = totalImpressions > 0
            ? (totalEngagements / totalImpressions) * 100
            : 0;
        const createdAtDate = new Date(account.createdAt);
        const now = new Date();
        const diffMs = now.getTime() - createdAtDate.getTime();
        const accountAgeDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
        const response = {
            account,
            summary: {
                range: "30d",
                totalCasts,
                totalImpressions,
                totalEngagements,
                avgEngagementRatePercent,
                followerCount: 1350, // still mock for now
                accountAgeDays,
            },
            highlights: {
                bestDayImpressions: {
                    date: "2025-11-29",
                    impressions: 12345,
                },
                topCastId: 987,
            },
        };
        res.json(response);
    }
    catch (error) {
        console.error("Error in /api/me/summary:", error);
        res.status(500).json({
            ok: false,
            message: "Internal server error",
        });
    }
});
// --------------------- Daily Activity --------------------- //
app.get("/api/me/activity", async (req, res) => {
    try {
        const fidParam = req.query.fid;
        const farcasterId = typeof fidParam === "string" && fidParam.trim().length > 0
            ? fidParam.trim()
            : "12345";
        const account = await (0, db_1.getAccountByFarcasterId)(farcasterId);
        if (!account) {
            return res.status(404).json({
                ok: false,
                message: "Account not found for this Farcaster ID",
            });
        }
        const days = await (0, db_1.getDailyActivityForFarcasterId)(farcasterId);
        res.json({
            ok: true,
            range: "7d",
            account,
            days,
        });
    }
    catch (error) {
        console.error("Error in /api/me/activity:", error);
        res.status(500).json({
            ok: false,
            message: "Internal server error",
        });
    }
});
// --------------------- Top Posts --------------------- //
app.get("/api/me/top-posts", async (req, res) => {
    try {
        const fidParam = req.query.fid;
        const farcasterId = typeof fidParam === "string" && fidParam.trim().length > 0
            ? fidParam.trim()
            : "12345";
        const account = await (0, db_1.getAccountByFarcasterId)(farcasterId);
        if (!account) {
            return res.status(404).json({
                ok: false,
                message: "Account not found for this Farcaster ID",
            });
        }
        const limitParam = req.query.limit;
        const limit = typeof limitParam === "string" ? parseInt(limitParam, 10) || 5 : 5;
        const topPosts = await (0, db_1.getTopPostsForFarcasterId)(farcasterId, limit);
        res.json({
            account,
            count: topPosts.length,
            posts: topPosts,
        });
    }
    catch (error) {
        console.error("Error in /api/me/top-posts:", error);
        res.status(500).json({
            ok: false,
            message: "Internal server error",
        });
    }
});
// --------------------- Live Top Posts (Hub-based, no DB) --------------------- //
app.get("/api/live/top-posts", async (req, res) => {
    var _a;
    try {
        const fidParam = req.query.fid;
        const fid = fidParam ? Number(fidParam) : NaN;
        if (!fid || Number.isNaN(fid)) {
            return res.status(400).json({
                ok: false,
                message: "Missing or invalid fid query parameter (e.g. ?fid=774643)",
            });
        }
        const limitParam = req.query.limit;
        const limit = typeof limitParam === "string" ? parseInt(limitParam, 10) || 5 : 5;
        // 🔹 Real Farcaster data from Hub
        const hubCasts = await (0, neynarHub_1.fetchCastsByFidFromHub)(fid, 50);
        const posts = mapHubCastsToTopPosts(hubCasts, limit);
        res.json({
            ok: true,
            fid,
            count: posts.length,
            posts,
        });
    }
    catch (error) {
        console.error("Error in /api/live/top-posts:", error);
        res.status(500).json({
            ok: false,
            message: "Internal server error (live top-posts)",
            error: (_a = error === null || error === void 0 ? void 0 : error.message) !== null && _a !== void 0 ? _a : String(error),
        });
    }
});
// --------------------- Debug: user (Neynar v2) --------------------- //
app.get("/api/debug/user", async (req, res) => {
    var _a;
    try {
        const fidParam = req.query.fid;
        const fid = fidParam ? Number(fidParam) : NaN;
        if (!fid || Number.isNaN(fid)) {
            return res.status(400).json({
                ok: false,
                message: "Missing or invalid fid query parameter (e.g. ?fid=5650)",
            });
        }
        const resp = await neynar_1.neynarClient.fetchBulkUsers({ fids: [fid] });
        const users = resp.users || [];
        if (!users || users.length === 0) {
            return res.status(404).json({
                ok: false,
                message: `No Farcaster user found for fid ${fid}`,
            });
        }
        const user = users[0];
        res.json({
            ok: true,
            fid,
            username: user.username,
            displayName: user.display_name,
            raw: user,
        });
    }
    catch (err) {
        console.error("Error in /api/debug/user:", err);
        res.status(500).json({
            ok: false,
            message: "Neynar error",
            error: (_a = err === null || err === void 0 ? void 0 : err.message) !== null && _a !== void 0 ? _a : String(err),
        });
    }
});
// --------------------- Debug: casts (Neynar v2 – may 402) --------------------- //
app.get("/api/debug/casts", async (req, res) => {
    var _a, _b;
    try {
        const fidParam = req.query.fid;
        const fid = fidParam ? Number(fidParam) : NaN;
        if (!fid || Number.isNaN(fid)) {
            return res.status(400).json({
                ok: false,
                message: "Missing or invalid fid query parameter (e.g. ?fid=774643)",
            });
        }
        const data = await (0, neynar_1.fetchCastsByFid)(fid, 50);
        let casts = [];
        if (Array.isArray(data.casts)) {
            casts = data.casts;
        }
        else if (Array.isArray((_a = data.result) === null || _a === void 0 ? void 0 : _a.casts)) {
            casts = data.result.casts;
        }
        const simplified = casts.map((c) => {
            var _a;
            return ({
                hash: c.hash,
                text: c.text,
                timestamp: c.timestamp,
                authorFid: (_a = c.author) === null || _a === void 0 ? void 0 : _a.fid,
                embeds: c.embeds,
                replies: c.replies,
                reactions: c.reactions,
            });
        });
        res.json({
            ok: true,
            fid,
            count: simplified.length,
            casts: simplified,
        });
    }
    catch (err) {
        console.error("Error in /api/debug/casts:", err);
        res.status(500).json({
            ok: false,
            message: "Neynar casts error",
            error: (_b = err === null || err === void 0 ? void 0 : err.message) !== null && _b !== void 0 ? _b : String(err),
        });
    }
});
// --------------------- Debug: user-casts (Neynar v2 – may 402) --------------------- //
app.get("/api/debug/user-casts", async (req, res) => {
    var _a;
    try {
        const fidParam = req.query.fid;
        const fid = fidParam ? Number(fidParam) : NaN;
        if (!fid || Number.isNaN(fid)) {
            return res.status(400).json({
                ok: false,
                message: "Missing or invalid fid query parameter (e.g. ?fid=774643)",
            });
        }
        const data = await (0, neynar_1.fetchUserCastsFromNeynar)(fid, 50);
        let casts = [];
        if (Array.isArray(data.casts)) {
            casts = data.casts;
        }
        const simplified = casts.map((c) => {
            var _a, _b, _c, _d, _e, _f, _g;
            return ({
                hash: c.hash,
                text: c.text,
                timestamp: c.timestamp,
                authorFid: (_a = c.author) === null || _a === void 0 ? void 0 : _a.fid,
                likes: (_c = (_b = c.reactions) === null || _b === void 0 ? void 0 : _b.likes_count) !== null && _c !== void 0 ? _c : 0,
                recasts: (_e = (_d = c.reactions) === null || _d === void 0 ? void 0 : _d.recasts_count) !== null && _e !== void 0 ? _e : 0,
                replies: (_g = (_f = c.replies) === null || _f === void 0 ? void 0 : _f.count) !== null && _g !== void 0 ? _g : 0,
            });
        });
        res.json({
            ok: true,
            fid,
            count: simplified.length,
            casts: simplified,
        });
    }
    catch (err) {
        console.error("Error in /api/debug/user-casts:", err);
        res.status(500).json({
            ok: false,
            message: "Neynar user-casts error",
            error: (_a = err === null || err === void 0 ? void 0 : err.message) !== null && _a !== void 0 ? _a : String(err),
        });
    }
});
// --------------------- Debug: Hub casts (cheap, recommended) --------------------- //
app.get("/api/debug/hub-casts", async (req, res) => {
    var _a;
    try {
        const fidParam = req.query.fid;
        const fid = fidParam ? Number(fidParam) : NaN;
        if (!fid || Number.isNaN(fid)) {
            return res.status(400).json({
                ok: false,
                message: "Missing or invalid fid query parameter (e.g. ?fid=774643)",
            });
        }
        const casts = await (0, neynarHub_1.fetchCastsByFidFromHub)(fid, 50);
        res.json({
            ok: true,
            fid,
            count: casts.length,
            casts,
        });
    }
    catch (err) {
        console.error("Error in /api/debug/hub-casts:", err);
        res.status(500).json({
            ok: false,
            message: "Hub casts error",
            error: (_a = err === null || err === void 0 ? void 0 : err.message) !== null && _a !== void 0 ? _a : String(err),
        });
    }
});
// ✅ Live summary using Neynar + Hub (no Postgres)
// ✅ Live summary using Neynar + Hub (no Postgres)
app.get("/api/live/summary", async (req, res) => {
    var _a, _b, _c, _d, _e, _f, _g, _h, _j;
    try {
        const fidParam = req.query.fid;
        const fid = typeof fidParam === "string" ? Number(fidParam) : NaN;
        if (!fid || Number.isNaN(fid)) {
            return res.status(400).json({
                ok: false,
                message: "Missing or invalid fid query parameter (e.g. ?fid=774643)",
            });
        }
        // 1) Fetch Farcaster user from Neynar SDK (same as /api/debug/user)
        const { users } = await neynar_1.neynarClient.fetchBulkUsers({ fids: [fid] });
        if (!users || users.length === 0) {
            return res.status(404).json({
                ok: false,
                message: `No Farcaster user found for fid ${fid}`,
            });
        }
        const user = users[0];
        const username = (_a = user.username) !== null && _a !== void 0 ? _a : "";
        const displayName = (_d = (_c = (_b = user.display_name) !== null && _b !== void 0 ? _b : user.displayName) !== null && _c !== void 0 ? _c : username) !== null && _d !== void 0 ? _d : "";
        const followerCount = (_f = (_e = user.follower_count) !== null && _e !== void 0 ? _e : user.followers_count) !== null && _f !== void 0 ? _f : 0;
        // 2) Fetch recent casts from Hub (real data, but no impressions)
        const casts = await (0, neynarHub_1.fetchCastsByFidFromHub)(fid, 50);
        const totalCasts = Array.isArray(casts) ? casts.length : 0;
        // 3) Account age in days
        let accountAgeDays = 0;
        // First try user.created_at / createdAt, if Neynar provides it
        const createdAtRaw = (_h = (_g = user.created_at) !== null && _g !== void 0 ? _g : user.createdAt) !== null && _h !== void 0 ? _h : undefined;
        if (createdAtRaw) {
            const createdAt = new Date(createdAtRaw);
            if (!isNaN(createdAt.getTime())) {
                const now = new Date();
                const diffMs = now.getTime() - createdAt.getTime();
                accountAgeDays = Math.max(0, Math.floor(diffMs / (1000 * 60 * 60 * 24)));
            }
        }
        // If that’s missing, approximate from earliest cast timestamp
        if (!createdAtRaw && Array.isArray(casts) && casts.length > 0) {
            let earliestTsMs = null;
            casts.forEach((c) => {
                const t = c.timestamp;
                if (!t)
                    return;
                let ms = null;
                if (typeof t === "number") {
                    // Hub often uses Unix seconds; if it's small, treat as seconds
                    ms = t < 10000000000 ? t * 1000 : t;
                }
                else if (typeof t === "string") {
                    const d = new Date(t);
                    if (!isNaN(d.getTime())) {
                        ms = d.getTime();
                    }
                }
                if (ms !== null) {
                    if (earliestTsMs === null || ms < earliestTsMs) {
                        earliestTsMs = ms;
                    }
                }
            });
            if (earliestTsMs !== null) {
                const nowMs = Date.now();
                const diffMs = nowMs - earliestTsMs;
                const fromCastsDays = Math.max(0, Math.floor(diffMs / (1000 * 60 * 60 * 24)));
                // Use this only if we didn't already get something from created_at
                if (accountAgeDays === 0) {
                    accountAgeDays = fromCastsDays;
                }
            }
        }
        // For now, Farcaster doesn't expose "impressions" directly via Hub,
        // so we keep these as 0 (future: derive from reactions if needed).
        const totalImpressions = 0;
        const totalEngagements = 0;
        const avgEngagementRatePercent = 0;
        return res.json({
            ok: true,
            fid,
            user: {
                fid,
                username,
                displayName,
                followerCount,
            },
            summary: {
                range: "recent", // not strictly 30d yet; just "recent activity"
                totalCasts,
                totalImpressions,
                totalEngagements,
                avgEngagementRatePercent,
                followerCount,
                accountAgeDays,
            },
        });
    }
    catch (err) {
        console.error("Error in /api/live/summary:", err);
        return res.status(500).json({
            ok: false,
            message: "Live summary error",
            error: (_j = err === null || err === void 0 ? void 0 : err.message) !== null && _j !== void 0 ? _j : String(err),
        });
    }
});
// ✅ Live activity using Neynar Hub (no Postgres)
// ✅ Live activity using Neynar (with real engagement counts)
app.get("/api/live/activity", async (req, res) => {
    var _a, _b;
    try {
        const fidParam = req.query.fid;
        const fid = typeof fidParam === "string" ? Number(fidParam) : NaN;
        if (!fid || Number.isNaN(fid)) {
            return res.status(400).json({
                ok: false,
                message: "Missing or invalid fid query parameter (e.g. ?fid=774643)",
            });
        }
        // Optional: ?days= (default 7, clamp between 1 and 30)
        const daysParam = req.query.days;
        let daysWindow = typeof daysParam === "string" ? parseInt(daysParam, 10) || 7 : 7;
        if (daysWindow < 1)
            daysWindow = 1;
        if (daysWindow > 30)
            daysWindow = 30;
        // 1) Fetch recent casts from Neynar main API (same source as /api/debug/casts)
        const raw = (await (0, neynar_1.fetchCastsByFid)(fid, 200));
        let casts = [];
        if (Array.isArray(raw.casts)) {
            casts = raw.casts;
        }
        else if (Array.isArray((_a = raw.result) === null || _a === void 0 ? void 0 : _a.casts)) {
            casts = raw.result.casts;
        }
        // 2) Set up day buckets for the last N days
        const now = new Date();
        now.setHours(0, 0, 0, 0);
        const start = new Date(now);
        start.setDate(now.getDate() - (daysWindow - 1));
        const dayBuckets = {};
        // Initialize all days in the window
        for (let i = 0; i < daysWindow; i++) {
            const d = new Date(start);
            d.setDate(start.getDate() + i);
            const dateOnly = d.toISOString().slice(0, 10); // "YYYY-MM-DD"
            dayBuckets[dateOnly] = {
                date: d.toISOString(),
                postCount: 0,
                engagements: 0,
            };
        }
        // Helper: convert timestamp → Date
        function tsToDate(t) {
            if (!t)
                return null;
            if (typeof t === "number") {
                // If small, treat as Unix seconds
                const ms = t < 10000000000 ? t * 1000 : t;
                const d = new Date(ms);
                return isNaN(d.getTime()) ? null : d;
            }
            if (typeof t === "string") {
                const d = new Date(t);
                return isNaN(d.getTime()) ? null : d;
            }
            return null;
        }
        // 3) Fill buckets from casts
        casts.forEach((c) => {
            var _a, _b, _c, _d, _e, _f;
            const dt = tsToDate(c.timestamp);
            if (!dt)
                return;
            dt.setHours(0, 0, 0, 0);
            const dateOnly = dt.toISOString().slice(0, 10);
            const bucket = dayBuckets[dateOnly];
            if (!bucket) {
                // cast is outside the N-day window → ignore
                return;
            }
            bucket.postCount += 1;
            // Real engagement counts (if present)
            const likes = (_b = (_a = c.reactions) === null || _a === void 0 ? void 0 : _a.likes_count) !== null && _b !== void 0 ? _b : 0;
            const recasts = (_d = (_c = c.reactions) === null || _c === void 0 ? void 0 : _c.recasts_count) !== null && _d !== void 0 ? _d : 0;
            const replies = (_f = (_e = c.replies) === null || _e === void 0 ? void 0 : _e.count) !== null && _f !== void 0 ? _f : 0;
            bucket.engagements += likes + recasts + replies;
        });
        // 4) Convert map → sorted array
        const days = Object.keys(dayBuckets)
            .sort()
            .map((k) => dayBuckets[k]);
        return res.json({
            ok: true,
            fid,
            range: `${daysWindow}d`,
            days,
        });
    }
    catch (err) {
        console.error("Error in /api/live/activity:", err);
        return res.status(500).json({
            ok: false,
            message: "Live activity error",
            error: (_b = err === null || err === void 0 ? void 0 : err.message) !== null && _b !== void 0 ? _b : String(err),
        });
    }
});
// --------------------- Start server --------------------- //
app.listen(PORT, () => {
    console.log(`✅ Server listening on port ${PORT}`);
});
