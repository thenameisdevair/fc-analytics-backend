// src/neynar.ts
import { Configuration, NeynarAPIClient } from "@neynar/nodejs-sdk";
import dotenv from "dotenv";
import axios from "axios";

dotenv.config();

if (!process.env.NEYNAR_API_KEY) {
  throw new Error(
    "[neynar] NEYNAR_API_KEY is not set in .env – please add it before running the server."
  );
}

// ✅ SDK client (used in /api/debug/user etc.)
const config = new Configuration({
  apiKey: process.env.NEYNAR_API_KEY!, // safe after the check above
});

export const neynarClient = new NeynarAPIClient(config);

/**
 * Fetch recent casts via Neynar v2 `/v2/farcaster/casts`.
 * ⚠️ This endpoint may return 402 on some plans. Use mainly for debugging.
 */
export async function fetchCastsByFid(fid: number, limit = 50) {
  const resp = await axios.get("https://api.neynar.com/v2/farcaster/casts", {
    params: {
      fid,
      limit,
      viewer_fid: fid,
    },
    headers: {
      "x-api-key": process.env.NEYNAR_API_KEY as string,
    },
  });

  return resp.data as any;
}

/**
 * Fetch recent casts for a specific user via `/v2/farcaster/user/casts`.
 * ⚠️ Also may return 402 on some plans – that’s expected.
 */
export async function fetchUserCastsFromNeynar(fid: number, limit = 50) {
  const resp = await axios.get(
    "https://api.neynar.com/v2/farcaster/user/casts",
    {
      params: {
        fid,
        limit,
      },
      headers: {
        "x-api-key": process.env.NEYNAR_API_KEY as string,
      },
    }
  );

  return resp.data as any;
}
