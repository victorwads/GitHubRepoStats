import path from "node:path";

import { minimatch } from "minimatch";

import { fetchMergedPullRequests, type FetchPullRequestsOptions } from "./github";
import type {
  Averages,
  PRFileChangeInfo,
  PRReportInfo,
  ReportInfo,
  ReportFileInfo,
  ReportTableRow,
  ReportUserInfo,
  Totals,
} from "./type";

interface GenerateReportOptions extends FetchPullRequestsOptions {
  ignoredFilePatterns?: string[];
}

export async function generateReport(options: GenerateReportOptions): Promise<ReportInfo> {
  const pulls = await fetchMergedPullRequests(options);

  const ignoreMatcher = buildIgnoreMatcher(options.ignoredFilePatterns ?? []);

  const periodStart = determinePeriodStart(options, pulls.map((item) => item.summary.mergedAt));
  const periodEnd = determinePeriodEnd(options, pulls.map((item) => item.summary.mergedAt));

  const users = buildUserReports(options, pulls, ignoreMatcher);
  const totals = computeTotals(users);
  const averages = computeAverages(totals, users.length);
  const table = buildTable(users);
  const files = buildFileReport(options, pulls, ignoreMatcher);

  return {
    periodStart,
    periodEnd,
    totals,
    averages,
    users,
    table,
    files,
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

type IgnoreMatcher = (filePath: string) => boolean;

function buildUserReports(
  options: GenerateReportOptions,
  pulls: Awaited<ReturnType<typeof fetchMergedPullRequests>>,
  ignoreMatcher: IgnoreMatcher,
): ReportUserInfo[] {
  const userMap = new Map<string, ReportUserInfo>();

  for (const { summary, data, files } of pulls) {
    const prFiles = buildPrFiles(options, files, ignoreMatcher);
    const linesAdded = sumFiles(prFiles, (file) => file.linesAdded);
    const linesDeleted = sumFiles(prFiles, (file) => file.linesDeleted);
    const filesChanged = prFiles.length;
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
      files: prFiles,
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

  return Array.from(userMap.values()).sort((a, b) => {
    const totalChangesA = a.totals.linesAdded + a.totals.linesDeleted;
    const totalChangesB = b.totals.linesAdded + b.totals.linesDeleted;

    if (totalChangesB !== totalChangesA) {
      return totalChangesB - totalChangesA;
    }

    if (b.totals.prCount !== a.totals.prCount) {
      return b.totals.prCount - a.totals.prCount;
    }

    return a.owner.localeCompare(b.owner);
  });
}

function buildFileReport(
  options: GenerateReportOptions,
  pulls: Awaited<ReturnType<typeof fetchMergedPullRequests>>,
  ignoreMatcher: IgnoreMatcher,
): ReportFileInfo[] {
  const fileMap = new Map<string, ReportFileInfo>();

  for (const { files } of pulls) {
    for (const file of files) {
      if (ignoreMatcher(file.filename)) {
        continue;
      }

      if (!isAllowedExtension(options, file.filename)) {
        continue;
      }

      const linesAdded = file.additions ?? 0;
      const linesDeleted = file.deletions ?? 0;
      const totalChanges = resolveTotalChanges(file.changes, linesAdded, linesDeleted);

      const existing = fileMap.get(file.filename);
      if (!existing) {
        fileMap.set(file.filename, {
          path: file.filename,
          linesAdded,
          linesDeleted,
          totalChanges,
          prCount: 1,
        });
        continue;
      }

      existing.linesAdded += linesAdded;
      existing.linesDeleted += linesDeleted;
      existing.totalChanges += totalChanges;
      existing.prCount += 1;
    }
  }

  return Array.from(fileMap.values()).sort((a, b) => {
    if (b.totalChanges !== a.totalChanges) {
      return b.totalChanges - a.totalChanges;
    }
    return a.path.localeCompare(b.path);
  });
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

function buildPrFiles(
  options: GenerateReportOptions,
  files: { filename: string; additions?: number; deletions?: number; changes?: number }[],
  ignore: IgnoreMatcher
): PRFileChangeInfo[] {
  const result: PRFileChangeInfo[] = [];
  for (const file of files) {
    if (ignore(file.filename)) {
      continue;
    }

    if (!isAllowedExtension(options, file.filename)) {
      continue;
    }
    const linesAdded = file.additions ?? 0;
    const linesDeleted = file.deletions ?? 0;
    const totalChanges = resolveTotalChanges(file.changes, linesAdded, linesDeleted);
    result.push({
      path: file.filename,
      linesAdded,
      linesDeleted,
      totalChanges,
    });
  }
  return result;
}

function sumFiles(files: PRFileChangeInfo[], selector: (file: PRFileChangeInfo) => number): number {
  return files.reduce((accumulator, file) => accumulator + selector(file), 0);
}

function resolveTotalChanges(changes: number | undefined, linesAdded: number, linesDeleted: number): number {
  if (typeof changes === "number") {
    return changes;
  }
  return linesAdded + linesDeleted;
}

function buildIgnoreMatcher(patterns: string[]): IgnoreMatcher {
  const sanitized = patterns.filter((pattern) => pattern.trim().length > 0);
  if (sanitized.length === 0) {
    return () => false;
  }

  return (filePath) => sanitized.some((pattern) => minimatch(filePath, pattern, { dot: true }));
}

function isAllowedExtension(options: GenerateReportOptions, filePath: string): boolean {
  const ALLOWED_FILE_EXTENSIONS = options.extensions
  const set = new Set(ALLOWED_FILE_EXTENSIONS.map((extension: string) => extension.toLowerCase()));

  if (set.size === 0) {
    return true;
  }

  const extension = path.extname(filePath).toLowerCase();
  return set.has(extension);
}
