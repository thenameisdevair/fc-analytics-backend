"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.pool = void 0;
exports.testDbConnection = testDbConnection;
exports.getAccountByFarcasterId = getAccountByFarcasterId;
exports.getTotalCastsForFarcasterId = getTotalCastsForFarcasterId;
exports.getImpressionsAndEngagementsForFarcasterId = getImpressionsAndEngagementsForFarcasterId;
exports.getDailyActivityForFarcasterId = getDailyActivityForFarcasterId;
exports.getTopPostsForFarcasterId = getTopPostsForFarcasterId;
const dotenv_1 = __importDefault(require("dotenv"));
const pg_1 = require("pg");
dotenv_1.default.config();
if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL is not set in .env");
}
// Create a connection pool to PostgreSQL
exports.pool = new pg_1.Pool({
    connectionString: process.env.DATABASE_URL,
});
// (Optional) small helper to test the connection
async function testDbConnection() {
    const client = await exports.pool.connect();
    try {
        const result = await client.query("SELECT 1 as value");
        console.log("✅ DB connection works, SELECT 1 returned:", result.rows[0].value);
    }
    catch (err) {
        console.error("❌ DB connection error:", err);
        throw err;
    }
    finally {
        client.release();
    }
}
async function getAccountByFarcasterId(farcasterId) {
    var _a;
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
    const result = await exports.pool.query(query, [farcasterId]);
    if (result.rows.length === 0) {
        return null;
    }
    const row = result.rows[0];
    const account = {
        farcasterId: row.farcaster_id,
        handle: row.handle,
        displayName: (_a = row.display_name) !== null && _a !== void 0 ? _a : row.handle,
        isPremium: row.is_premium,
        createdAt: row.created_at.toISOString(),
    };
    return account;
}
async function getTotalCastsForFarcasterId(farcasterId) {
    var _a;
    const query = `
    SELECT COUNT(*)::int AS count
    FROM posts p
    JOIN accounts a ON p.account_id = a.id
    WHERE a.farcaster_id = $1;
  `;
    const result = await exports.pool.query(query, [farcasterId]);
    if (result.rows.length === 0) {
        return 0;
    }
    const row = result.rows[0];
    return (_a = row.count) !== null && _a !== void 0 ? _a : 0;
}
async function getImpressionsAndEngagementsForFarcasterId(farcasterId) {
    var _a, _b;
    const query = `
    SELECT
      COALESCE(SUM(p.impressions), 0)::int AS total_impressions,
      COALESCE(SUM(p.engagements), 0)::int AS total_engagements
    FROM posts p
    JOIN accounts a ON p.account_id = a.id
    WHERE a.farcaster_id = $1;
  `;
    const result = await exports.pool.query(query, [farcasterId]);
    const row = result.rows[0];
    return {
        totalImpressions: (_a = row.total_impressions) !== null && _a !== void 0 ? _a : 0,
        totalEngagements: (_b = row.total_engagements) !== null && _b !== void 0 ? _b : 0,
    };
}
async function getDailyActivityForFarcasterId(farcasterId) {
    const client = await exports.pool.connect();
    try {
        const result = await client.query(`
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
      `, [farcasterId]);
        return result.rows.map((row) => ({
            date: row.day.toISOString().slice(0, 10), // "YYYY-MM-DD"
            postCount: Number(row.post_count),
            impressions: Number(row.impressions),
            engagements: Number(row.engagements),
        }));
    }
    finally {
        client.release();
    }
}
async function getTopPostsForFarcasterId(farcasterId, limit = 10) {
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
    const result = await exports.pool.query(query, [farcasterId, limit]);
    return result.rows.map((row) => {
        var _a, _b, _c;
        return ({
            id: row.id,
            farcasterPostId: row.farcaster_post_id,
            text: (_a = row.text) !== null && _a !== void 0 ? _a : null,
            impressions: (_b = row.impressions) !== null && _b !== void 0 ? _b : 0,
            engagements: (_c = row.engagements) !== null && _c !== void 0 ? _c : 0,
            createdAt: row.created_at.toISOString(),
        });
    });
}
