// src/neynarHub.ts
import axios from "axios";
import dotenv from "dotenv";

dotenv.config();

const NEYNAR_HUB_API_KEY = process.env.NEYNAR_API_KEY || "";

if (!NEYNAR_HUB_API_KEY) {
  console.warn(
    "[neynarHub] NEYNAR_API_KEY is missing – Hub calls will fail until you set it in .env"
  );
}

const NEYNAR_HUB_BASE = "https://hub-api.neynar.com/v1";

export interface HubCast {
  hash?: string;
  fid?: number;
  text: string;
  timestamp?: number | string;
}

/**
 * Fetch recent casts for a given fid from Neynar Hub HTTP API.
 * Uses GET /v1/castsByFid
 */
export async function fetchCastsByFidFromHub(
  fid: number,
  pageSize = 50
): Promise<HubCast[]> {
  if (!NEYNAR_HUB_API_KEY) {
    throw new Error("[neynarHub] NEYNAR_API_KEY missing in env");
  }

  const url = `${NEYNAR_HUB_BASE}/castsByFid`;

  const res = await axios.get(url, {
    params: {
      fid,
      pageSize,
      reverse: true,
    },
    headers: {
      api_key: NEYNAR_HUB_API_KEY,
    },
  });

  const raw: any = res.data;
  console.dir(raw, { depth: 4 });

  // Hub responses can vary slightly in shape, so we’re defensive:
  const messages: any[] = Array.isArray(raw.messages)
    ? raw.messages
    : Array.isArray(raw.result?.messages)
    ? raw.result.messages
    : Array.isArray(raw.result?.casts)
    ? raw.result.casts
    : Array.isArray(raw.casts)
    ? raw.casts
    : [];

  const simplified: HubCast[] = messages.map((m: any) => {
    const data = m.data || m.message?.data || m;
    const body = data.castAddBody || data.body || {};
    const text = body.text || data.text || m.text || "";

    return {
      hash: m.hash || data.hash,
      fid: data.fid ?? m.fid,
      text,
      timestamp: data.timestamp ?? m.timestamp,
    };
  });

  return simplified;
}
