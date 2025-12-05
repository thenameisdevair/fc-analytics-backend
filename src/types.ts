// Types for the /api/me/summary response

export interface AccountInfo {
  farcasterId: string;
  handle: string;
  displayName: string;
  isPremium: boolean;
  createdAt: string; // ISO date string
}

export interface SummaryStats {
  range: string; // e.g. "30d"
  totalCasts: number;
  totalImpressions: number;
  totalEngagements: number;
  avgEngagementRatePercent: number;
  followerCount: number;
  accountAgeDays: number;
}

export interface BestDayImpressions {
  date: string; // "YYYY-MM-DD"
  impressions: number;
}

export interface Highlights {
  bestDayImpressions: BestDayImpressions | null;
  topCastId: number | null;
}

export interface MeSummaryResponse {
  account: AccountInfo;
  summary: SummaryStats;
  highlights: Highlights;
}

export interface DailyActivity {
  date: string;         // e.g. "2025-12-04"
  postCount: number;
  impressions: number;
  engagements: number;
}
