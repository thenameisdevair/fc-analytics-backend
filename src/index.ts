// src/index.ts
import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import {
  testDbConnection,
  getAccountByFarcasterId,
  getTotalCastsForFarcasterId,
  getImpressionsAndEngagementsForFarcasterId,
  getTopPostsForFarcasterId,
  getDailyActivityForFarcasterId,
} from "./db";
import {
  neynarClient,
  fetchCastsByFid, // debug / unused in production
  fetchUserCastsFromNeynar, // debug / unused in production
} from "./neynar";
import { fetchCastsByFidFromHub, HubCast } from "./neynarHub";

import { MeSummaryResponse } from "./types";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 4000;

app.use(cors());
app.use(express.json());

console.log("⚡ Starting server...");

// Helper: map raw Hub casts into simple "post" objects for the frontend
function mapHubCastsToTopPosts(casts: HubCast[], limit: number) {
  // sort newest → oldest based on timestamp
  const sorted = [...casts].sort((a, b) => {
    const ta = Number(a.timestamp ?? 0);
    const tb = Number(b.timestamp ?? 0);
    return tb - ta;
  });

  const sliced = sorted.slice(0, limit);

  return sliced.map((c) => {
    // Normalize timestamp to ISO string (frontend uses new Date(post.createdAt))
    let createdAtIso = new Date().toISOString();
    if (c.timestamp) {
      const tsNum =
        typeof c.timestamp === "string"
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
    await testDbConnection();
    res.json({ ok: true, message: "Database connection is working ✅" });
  } catch (error) {
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
    const farcasterId =
      typeof fidParam === "string" && fidParam.trim().length > 0
        ? fidParam.trim()
        : "12345";

    const account = await getAccountByFarcasterId(farcasterId);
    if (!account) {
      return res.status(404).json({
        ok: false,
        message: "Account not found for this Farcaster ID",
      });
    }

    const totalCasts = await getTotalCastsForFarcasterId(farcasterId);

    const { totalImpressions, totalEngagements } =
      await getImpressionsAndEngagementsForFarcasterId(farcasterId);

    const avgEngagementRatePercent =
      totalImpressions > 0
        ? (totalEngagements / totalImpressions) * 100
        : 0;

    const createdAtDate = new Date(account.createdAt);
    const now = new Date();
    const diffMs = now.getTime() - createdAtDate.getTime();
    const accountAgeDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    const response: MeSummaryResponse = {
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
  } catch (error) {
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
    const farcasterId =
      typeof fidParam === "string" && fidParam.trim().length > 0
        ? fidParam.trim()
        : "12345";

    const account = await getAccountByFarcasterId(farcasterId);
    if (!account) {
      return res.status(404).json({
        ok: false,
        message: "Account not found for this Farcaster ID",
      });
    }

    const days = await getDailyActivityForFarcasterId(farcasterId);

    res.json({
      ok: true,
      range: "7d",
      account,
      days,
    });
  } catch (error) {
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
    const farcasterId =
      typeof fidParam === "string" && fidParam.trim().length > 0
        ? fidParam.trim()
        : "12345";

    const account = await getAccountByFarcasterId(farcasterId);
    if (!account) {
      return res.status(404).json({
        ok: false,
        message: "Account not found for this Farcaster ID",
      });
    }

    const limitParam = req.query.limit;
    const limit =
      typeof limitParam === "string" ? parseInt(limitParam, 10) || 5 : 5;

    const topPosts = await getTopPostsForFarcasterId(farcasterId, limit);

    res.json({
      account,
      count: topPosts.length,
      posts: topPosts,
    });
  } catch (error) {
    console.error("Error in /api/me/top-posts:", error);
    res.status(500).json({
      ok: false,
      message: "Internal server error",
    });
  }
});

// --------------------- Live Top Posts (Hub-based, no DB) --------------------- //

app.get("/api/live/top-posts", async (req, res) => {
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
    const limit =
      typeof limitParam === "string" ? parseInt(limitParam, 10) || 5 : 5;

    // 🔹 Real Farcaster data from Hub
    const hubCasts = await fetchCastsByFidFromHub(fid, 50);

    const posts = mapHubCastsToTopPosts(hubCasts, limit);

    res.json({
      ok: true,
      fid,
      count: posts.length,
      posts,
    });
  } catch (error: any) {
    console.error("Error in /api/live/top-posts:", error);
    res.status(500).json({
      ok: false,
      message: "Internal server error (live top-posts)",
      error: error?.message ?? String(error),
    });
  }
});


// --------------------- Debug: user (Neynar v2) --------------------- //

app.get("/api/debug/user", async (req, res) => {
  try {
    const fidParam = req.query.fid;
    const fid = fidParam ? Number(fidParam) : NaN;

    if (!fid || Number.isNaN(fid)) {
      return res.status(400).json({
        ok: false,
        message: "Missing or invalid fid query parameter (e.g. ?fid=5650)",
      });
    }

    const resp = await neynarClient.fetchBulkUsers({ fids: [fid] });
    const users: any[] = (resp as any).users || [];

    if (!users || users.length === 0) {
      return res.status(404).json({
        ok: false,
        message: `No Farcaster user found for fid ${fid}`,
      });
    }

    const user = users[0] as any;

    res.json({
      ok: true,
      fid,
      username: user.username,
      displayName: user.display_name,
      raw: user,
    });
  } catch (err: any) {
    console.error("Error in /api/debug/user:", err);
    res.status(500).json({
      ok: false,
      message: "Neynar error",
      error: err?.message ?? String(err),
    });
  }
});

// --------------------- Debug: casts (Neynar v2 – may 402) --------------------- //

app.get("/api/debug/casts", async (req, res) => {
  try {
    const fidParam = req.query.fid;
    const fid = fidParam ? Number(fidParam) : NaN;

    if (!fid || Number.isNaN(fid)) {
      return res.status(400).json({
        ok: false,
        message: "Missing or invalid fid query parameter (e.g. ?fid=774643)",
      });
    }

    const data: any = await fetchCastsByFid(fid, 50);

    let casts: any[] = [];
    if (Array.isArray(data.casts)) {
      casts = data.casts;
    } else if (Array.isArray(data.result?.casts)) {
      casts = data.result.casts;
    }

    const simplified = casts.map((c: any) => ({
      hash: c.hash,
      text: c.text,
      timestamp: c.timestamp,
      authorFid: c.author?.fid,
      embeds: c.embeds,
      replies: c.replies,
      reactions: c.reactions,
    }));

    res.json({
      ok: true,
      fid,
      count: simplified.length,
      casts: simplified,
    });
  } catch (err: any) {
    console.error("Error in /api/debug/casts:", err);
    res.status(500).json({
      ok: false,
      message: "Neynar casts error",
      error: err?.message ?? String(err),
    });
  }
});

// --------------------- Debug: user-casts (Neynar v2 – may 402) --------------------- //

app.get("/api/debug/user-casts", async (req, res) => {
  try {
    const fidParam = req.query.fid;
    const fid = fidParam ? Number(fidParam) : NaN;

    if (!fid || Number.isNaN(fid)) {
      return res.status(400).json({
        ok: false,
        message: "Missing or invalid fid query parameter (e.g. ?fid=774643)",
      });
    }

    const data: any = await fetchUserCastsFromNeynar(fid, 50);

    let casts: any[] = [];
    if (Array.isArray(data.casts)) {
      casts = data.casts;
    }

    const simplified = casts.map((c: any) => ({
      hash: c.hash,
      text: c.text,
      timestamp: c.timestamp,
      authorFid: c.author?.fid,
      likes: c.reactions?.likes_count ?? 0,
      recasts: c.reactions?.recasts_count ?? 0,
      replies: c.replies?.count ?? 0,
    }));

    res.json({
      ok: true,
      fid,
      count: simplified.length,
      casts: simplified,
    });
  } catch (err: any) {
    console.error("Error in /api/debug/user-casts:", err);
    res.status(500).json({
      ok: false,
      message: "Neynar user-casts error",
      error: err?.message ?? String(err),
    });
  }
});

// --------------------- Debug: Hub casts (cheap, recommended) --------------------- //

app.get("/api/debug/hub-casts", async (req, res) => {
  try {
    const fidParam = req.query.fid;
    const fid = fidParam ? Number(fidParam) : NaN;

    if (!fid || Number.isNaN(fid)) {
      return res.status(400).json({
        ok: false,
        message: "Missing or invalid fid query parameter (e.g. ?fid=774643)",
      });
    }

    const casts = await fetchCastsByFidFromHub(fid, 50);

    res.json({
      ok: true,
      fid,
      count: casts.length,
      casts,
    });
  } catch (err: any) {
    console.error("Error in /api/debug/hub-casts:", err);
    res.status(500).json({
      ok: false,
      message: "Hub casts error",
      error: err?.message ?? String(err),
    });
  }
});

// ✅ Live summary using Neynar + Hub (no Postgres)
// ✅ Live summary using Neynar + Hub (no Postgres)
app.get("/api/live/summary", async (req, res) => {
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
    const { users } = await neynarClient.fetchBulkUsers({ fids: [fid] });

    if (!users || users.length === 0) {
      return res.status(404).json({
        ok: false,
        message: `No Farcaster user found for fid ${fid}`,
      });
    }

    const user: any = users[0];

    const username: string = user.username ?? "";
    const displayName: string =
      user.display_name ?? user.displayName ?? username ?? "";
    const followerCount: number =
      user.follower_count ?? user.followers_count ?? 0;

    // 2) Fetch recent casts from Hub (real data, but no impressions)
    const casts = await fetchCastsByFidFromHub(fid, 50);
    const totalCasts = Array.isArray(casts) ? casts.length : 0;

    // 3) Account age in days
    let accountAgeDays = 0;

    // First try user.created_at / createdAt, if Neynar provides it
    const createdAtRaw: string | undefined =
      user.created_at ?? user.createdAt ?? undefined;

    if (createdAtRaw) {
      const createdAt = new Date(createdAtRaw);
      if (!isNaN(createdAt.getTime())) {
        const now = new Date();
        const diffMs = now.getTime() - createdAt.getTime();
        accountAgeDays = Math.max(
          0,
          Math.floor(diffMs / (1000 * 60 * 60 * 24))
        );
      }
    }

    // If that’s missing, approximate from earliest cast timestamp
    if (!createdAtRaw && Array.isArray(casts) && casts.length > 0) {
      let earliestTsMs: number | null = null;

      casts.forEach((c: any) => {
        const t = c.timestamp;
        if (!t) return;

        let ms: number | null = null;

        if (typeof t === "number") {
          // Hub often uses Unix seconds; if it's small, treat as seconds
          ms = t < 10_000_000_000 ? t * 1000 : t;
        } else if (typeof t === "string") {
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
        const fromCastsDays = Math.max(
          0,
          Math.floor(diffMs / (1000 * 60 * 60 * 24))
        );

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
  } catch (err: any) {
    console.error("Error in /api/live/summary:", err);
    return res.status(500).json({
      ok: false,
      message: "Live summary error",
      error: err?.message ?? String(err),
    });
  }
});

// ✅ Live activity using Neynar Hub (no Postgres)
// ✅ Live activity using Neynar (with real engagement counts)
// Live activity endpoint – uses Hub API only (no paid Neynar casts endpoints)
app.get("/api/live/activity", async (req, res) => {
  try {
    const fidParam = req.query.fid;
    const fid = fidParam ? Number(fidParam) : NaN;

    if (!fid || Number.isNaN(fid)) {
      return res.status(400).json({
        ok: false,
        message: "Missing or invalid fid query parameter (e.g. ?fid=774643)",
      });
    }

    // 1) Fetch recent casts from Hub
    const casts = await fetchCastsByFidFromHub(fid);

    // 2) Build a 7-day window (oldest -> newest)
    const now = new Date();
    const daysMap: Record<
      string,
      { date: string; postCount: number; engagements: number }
    > = {};

    for (let i = 0; i < 7; i++) {
      const d = new Date(now);
      d.setDate(now.getDate() - (6 - i)); // 6 days ago ... today
      const iso = d.toISOString().slice(0, 10); // YYYY-MM-DD
      daysMap[iso] = {
        date: iso,
        postCount: 0,
        engagements: 0,
      };
    }

    // 3) Bucket casts into those days
    casts.forEach((c: any) => {
      if (!c.timestamp) return;

      const ts = new Date(c.timestamp);
      const dayKey = ts.toISOString().slice(0, 10);

      if (!daysMap[dayKey]) return;

      // For now, we don't have real engagement counts from Hub,
      // so we set engagements = 0 or 1 as a placeholder.
      daysMap[dayKey].postCount += 1;
      // Placeholder: 0 engagements per cast – can be enhanced later if you
      // start pulling reactions from Neynar or another source.
      daysMap[dayKey].engagements += 0;
    });

    const days = Object.values(daysMap);

    return res.json({
      ok: true,
      fid,
      range: "7d",
      days,
    });
  } catch (err: any) {
    console.error("Error in /api/live/activity:", err);
    return res.status(500).json({
      ok: false,
      message: "Live activity error",
      error: err?.message ?? String(err),
    });
  }
});




// --------------------- Start server --------------------- //

app.listen(PORT, () => {
  console.log(`✅ Server listening on port ${PORT}`);
});
