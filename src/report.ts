import { fetchMergedPullRequests, type FetchPullRequestsOptions } from "./github";
import type {
  Averages,
  PRReportInfo,
  ReportInfo,
  ReportTableRow,
  ReportUserInfo,
  Totals,
} from "./type";

interface GenerateReportOptions extends FetchPullRequestsOptions {}

export async function generateReport(options: GenerateReportOptions): Promise<ReportInfo> {
  const pulls = await fetchMergedPullRequests(options);

  const periodStart = determinePeriodStart(options, pulls.map((item) => item.summary.mergedAt));
  const periodEnd = determinePeriodEnd(options, pulls.map((item) => item.summary.mergedAt));

  const users = buildUserReports(pulls);
  const totals = computeTotals(users);
  const averages = computeAverages(totals, users.length);
  const table = buildTable(users);

  return {
    periodStart,
    periodEnd,
    totals,
    averages,
    users,
    table,
  };
}

function determinePeriodStart(options: FetchPullRequestsOptions, mergedDates: Date[]): Date {
  if (options.since) {
    return options.since;
  }
  if (mergedDates.length > 0) {
    return new Date(Math.min(...mergedDates.map((date) => date.getTime())));
  }
  return new Date(0);
}

function determinePeriodEnd(options: FetchPullRequestsOptions, mergedDates: Date[]): Date {
  if (options.until) {
    return options.until;
  }
  if (mergedDates.length > 0) {
    return new Date(Math.max(...mergedDates.map((date) => date.getTime())));
  }
  return new Date();
}

function buildUserReports(pulls: Awaited<ReturnType<typeof fetchMergedPullRequests>>): ReportUserInfo[] {
  const userMap = new Map<string, ReportUserInfo>();

  for (const { summary, data } of pulls) {
    const linesAdded = data.additions ?? 0;
    const linesDeleted = data.deletions ?? 0;
    const filesChanged = data.changed_files ?? 0;
    const commitsCount = data.commits ?? 0;

    const prInfo: PRReportInfo = {
      prNumber: summary.number,
      title: summary.title,
      url: summary.url,
      owner: summary.owner,
      mergedAt: summary.mergedAt,
      totals: {
        linesAdded,
        linesDeleted,
        filesChanged,
        commitsCount,
      },
    };

    const existing = userMap.get(summary.owner);

    if (!existing) {
      userMap.set(summary.owner, {
        owner: summary.owner,
        totals: {
          linesAdded,
          linesDeleted,
          filesChanged,
          commitsCount,
          prCount: 1,
        },
        averages: computeAveragesFromTotals({
          linesAdded,
          linesDeleted,
          filesChanged,
          commitsCount,
          prCount: 1,
        }),
        prs: [prInfo],
      });
      continue;
    }

    existing.prs.push(prInfo);
    existing.totals.linesAdded += linesAdded;
    existing.totals.linesDeleted += linesDeleted;
    existing.totals.filesChanged += filesChanged;
    existing.totals.commitsCount += commitsCount;
    existing.totals.prCount += 1;
    existing.averages = computeAveragesFromTotals(existing.totals);
  }

  return Array.from(userMap.values()).sort((a, b) => b.totals.prCount - a.totals.prCount);
}

function computeTotals(users: ReportUserInfo[]): Totals & { prCount: number } {
  return users.reduce(
    (accumulator, user) => {
      accumulator.linesAdded += user.totals.linesAdded;
      accumulator.linesDeleted += user.totals.linesDeleted;
      accumulator.filesChanged += user.totals.filesChanged;
      accumulator.commitsCount += user.totals.commitsCount;
      accumulator.prCount += user.totals.prCount;
      return accumulator;
    },
    { linesAdded: 0, linesDeleted: 0, filesChanged: 0, commitsCount: 0, prCount: 0 },
  );
}

function computeAverages(
  totals: Totals & { prCount: number },
  userCount: number,
): Averages & { prCount: number } {
  return {
    linesAdded: safeDivide(totals.linesAdded, totals.prCount),
    linesDeleted: safeDivide(totals.linesDeleted, totals.prCount),
    filesChanged: safeDivide(totals.filesChanged, totals.prCount),
    commitsCount: safeDivide(totals.commitsCount, totals.prCount),
    prCount: safeDivide(totals.prCount, userCount),
  };
}

function buildTable(users: ReportUserInfo[]): ReportTableRow[] {
  return users.map((user) => ({
    owner: user.owner,
    prCount: user.totals.prCount,
    linesAdded: user.totals.linesAdded,
    linesDeleted: user.totals.linesDeleted,
    filesChanged: user.totals.filesChanged,
    commitsCount: user.totals.commitsCount,
    avgLinesAdded: user.averages.linesAdded,
    avgLinesDeleted: user.averages.linesDeleted,
    avgFilesChanged: user.averages.filesChanged,
    avgCommitsCount: user.averages.commitsCount,
  }));
}

function computeAveragesFromTotals(totals: Totals & { prCount: number }): Averages {
  return {
    linesAdded: safeDivide(totals.linesAdded, totals.prCount),
    linesDeleted: safeDivide(totals.linesDeleted, totals.prCount),
    filesChanged: safeDivide(totals.filesChanged, totals.prCount),
    commitsCount: safeDivide(totals.commitsCount, totals.prCount),
  };
}

function safeDivide(numerator: number, denominator: number): number {
  if (!denominator) {
    return 0;
  }
  return numerator / denominator;
}
