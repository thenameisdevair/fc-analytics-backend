import dotenv from "dotenv";
import { Pool } from "pg";
import { AccountInfo, DailyActivity } from "./types";




dotenv.config();

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL is not set in .env");
}

// Create a connection pool to PostgreSQL
export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

// (Optional) small helper to test the connection
export async function testDbConnection() {
  const client = await pool.connect();
  try {
    const result = await client.query("SELECT 1 as value");
    console.log("✅ DB connection works, SELECT 1 returned:", result.rows[0].value);
  } catch (err) {
    console.error("❌ DB connection error:", err);
    throw err;
  } finally {
    client.release();
  }
}

export async function getAccountByFarcasterId(
  farcasterId: string
): Promise<AccountInfo | null> {
  const query = `
    SELECT
      farcaster_id,
      handle,
      display_name,
      is_premium,
      created_at
    FROM accounts
    WHERE farcaster_id = $1
    LIMIT 1;
  `;

  const result = await pool.query(query, [farcasterId]);

  if (result.rows.length === 0) {
    return null;
  }

  const row = result.rows[0] as any;

  const account: AccountInfo = {
    farcasterId: row.farcaster_id,
    handle: row.handle,
    displayName: row.display_name ?? row.handle,
    isPremium: row.is_premium,
    createdAt: (row.created_at as Date).toISOString(),
  };

  return account;
}

export async function getTotalCastsForFarcasterId(
  farcasterId: string
): Promise<number> {
  const query = `
    SELECT COUNT(*)::int AS count
    FROM posts p
    JOIN accounts a ON p.account_id = a.id
    WHERE a.farcaster_id = $1;
  `;

  const result = await pool.query(query, [farcasterId]);

  if (result.rows.length === 0) {
    return 0;
  }

  const row = result.rows[0] as any;
  return row.count ?? 0;
}

export interface ImpressionsEngagementsTotals {
  totalImpressions: number;
  totalEngagements: number;
}

export async function getImpressionsAndEngagementsForFarcasterId(
  farcasterId: string
): Promise<ImpressionsEngagementsTotals> {
  const query = `
    SELECT
      COALESCE(SUM(p.impressions), 0)::int AS total_impressions,
      COALESCE(SUM(p.engagements), 0)::int AS total_engagements
    FROM posts p
    JOIN accounts a ON p.account_id = a.id
    WHERE a.farcaster_id = $1;
  `;

  const result = await pool.query(query, [farcasterId]);

  const row = result.rows[0] as any;

  return {
    totalImpressions: row.total_impressions ?? 0,
    totalEngagements: row.total_engagements ?? 0,
  };
}

export interface PostRow {
  id: number;
  farcasterPostId: string;
  text: string | null;
  impressions: number;
  engagements: number;
  createdAt: string; // ISO string
}

export async function getDailyActivityForFarcasterId(
  farcasterId: string
): Promise<DailyActivity[]> {
  const client = await pool.connect();
  try {
    const result = await client.query(
      `
      SELECT
        DATE_TRUNC('day', p.created_at)::date AS day,
        COUNT(*) AS post_count,
        COALESCE(SUM(p.impressions), 0) AS impressions,
        COALESCE(SUM(p.engagements), 0) AS engagements
      FROM posts p
      INNER JOIN accounts a
        ON p.account_id = a.id
      WHERE a.farcaster_id = $1
        AND p.created_at >= NOW() - INTERVAL '7 days'
      GROUP BY day
      ORDER BY day ASC;
      `,
      [farcasterId]
    );

    return result.rows.map((row: any) => ({
      date: row.day.toISOString().slice(0, 10), // "YYYY-MM-DD"
      postCount: Number(row.post_count),
      impressions: Number(row.impressions),
      engagements: Number(row.engagements),
    }));
  } finally {
    client.release();
  }
}



export async function getTopPostsForFarcasterId(
  farcasterId: string,
  limit: number = 10
): Promise<PostRow[]> {
  const query = `
    SELECT
      p.id,
      p.farcaster_post_id,
      p.text,
      p.impressions,
      p.engagements,
      p.created_at
    FROM posts p
    JOIN accounts a ON p.account_id = a.id
    WHERE a.farcaster_id = $1
    ORDER BY p.impressions DESC
    LIMIT $2;
  `;

  const result = await pool.query(query, [farcasterId, limit]);

  return result.rows.map((row: any) => ({
    id: row.id,
    farcasterPostId: row.farcaster_post_id,
    text: row.text ?? null,
    impressions: row.impressions ?? 0,
    engagements: row.engagements ?? 0,
    createdAt: (row.created_at as Date).toISOString(),
  }));
}
