import { promises as fs } from "node:fs";
import path from "node:path";

import { Octokit } from "@octokit/rest";
import pLimit from "p-limit";
import type { RestEndpointMethodTypes } from "@octokit/rest";

export interface FetchPullRequestsOptions {
  owner: string;
  repo: string;
  extensions: string[];
  since?: Date;
  until?: Date;
  limit?: number;
  token?: string;
  concurrentRequests?: number;
  cacheDir?: string;
}

export interface PullRequestSummary {
  number: number;
  title: string;
  url: string;
  owner: string;
  mergedAt: Date;
}

export type PullRequestData = RestEndpointMethodTypes["pulls"]["get"]["response"]["data"];

export type PullRequestFile = RestEndpointMethodTypes["pulls"]["listFiles"]["response"]["data"][number];

export interface PullRequestWithDetails {
  summary: PullRequestSummary;
  data: PullRequestData;
  files: PullRequestFile[];
}

const DEFAULT_CACHE_DIR = path.resolve(process.cwd(), ".cache");

export async function fetchMergedPullRequests(
  options: FetchPullRequestsOptions,
): Promise<PullRequestWithDetails[]> {
  const { owner, repo, token, concurrentRequests = 6 } = options;

  const octokit = new Octokit({ auth: token });

  const summaries = await listMergedPullRequestSummaries(octokit, options);

  const limiter = pLimit(sanitizeConcurrency(concurrentRequests));

  const detailedPulls = await Promise.all(
    summaries.map((summary) =>
      limiter(async () => {
        const cacheOptions: CacheOptions = {
          owner,
          repo,
          cacheDir: options.cacheDir,
        };

        const [data, files] = await Promise.all([
          getPullRequestWithCache(octokit, summary.number, cacheOptions),
          getPullRequestFilesWithCache(octokit, summary.number, cacheOptions),
        ]);
        return { summary, data, files } satisfies PullRequestWithDetails;
      }),
    ),
  );

  return detailedPulls;
}

async function listMergedPullRequestSummaries(
  octokit: Octokit,
  options: FetchPullRequestsOptions,
): Promise<PullRequestSummary[]> {
  const { owner, repo, since, until, limit, cacheDir } = options;

  const summaries: PullRequestSummary[] = [];
  const targetAmount = typeof limit === "number" && limit > 0 ? limit : undefined;

  // Only use cache when both since and until are provided and until is at most yesterday
  if (since && until && isUntilEligibleForCache(until)) {
    const cachePath = computeRangeCacheFilePath(owner, repo, since, until, cacheDir);
    const cached = await readCache(cachePath);
    if (cached) {
      try {
        const parsed = cached as unknown as PullRequestSummary[];
        // If limit is present, respect it
        return typeof targetAmount === "number" ? parsed.slice(0, targetAmount) : parsed;
      } catch (err) {
        // ignore and fallthrough to fresh fetch
      }
    }
    // otherwise fetch and write cache at the end
    const iterator = octokit.paginate.iterator(octokit.pulls.list, {
      owner,
      repo,
      state: "closed",
      per_page: 100,
      sort: "updated",
      direction: "desc",
    });

    outer: for await (const { data } of iterator) {
      for (const pull of data) {
        if (!pull.merged_at) {
          continue;
        }

        const mergedAt = new Date(pull.merged_at);

        if (since && mergedAt < since) {
          continue;
        }

        if (until && mergedAt > until) {
          continue;
        }

        summaries.push({
          number: pull.number,
          title: pull.title ?? `PR #${pull.number}`,
          url: pull.html_url ?? `https://github.com/${owner}/${repo}/pull/${pull.number}`,
          owner: pull.user?.login ?? "unknown",
          mergedAt,
        });

        if (targetAmount && summaries.length >= targetAmount) {
          break outer;
        }
      }
    }

    // write cache asynchronously but await to ensure consistent behavior
    try {
      await writeCache(cachePath, summaries);
    } catch (err) {
      // ignore cache write failures
    }

    return summaries;
  }

  // default (no cache) path
  const iterator = octokit.paginate.iterator(octokit.pulls.list, {
    owner,
    repo,
    state: "closed",
    per_page: 100,
    sort: "updated",
    direction: "desc",
  });

  outer: for await (const { data } of iterator) {
    for (const pull of data) {
      if (!pull.merged_at) {
        continue;
      }

      const mergedAt = new Date(pull.merged_at);

      if (since && mergedAt < since) {
        continue;
      }

      if (until && mergedAt > until) {
        continue;
      }

      summaries.push({
        number: pull.number,
        title: pull.title ?? `PR #${pull.number}`,
        url: pull.html_url ?? `https://github.com/${owner}/${repo}/pull/${pull.number}`,
        owner: pull.user?.login ?? "unknown",
        mergedAt,
      });

      if (targetAmount && summaries.length >= targetAmount) {
        break outer;
      }
    }
  }

  return summaries;
}

function isUntilEligibleForCache(until: Date): boolean {
  const now = new Date();
  // compute yesterday at end of day: until must be <= yesterday (now - 1 day)
  const yesterday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1, 23, 59, 59, 999);
  return until.getTime() <= yesterday.getTime();
}

function computeRangeCacheFilePath(owner: string, repo: string, since: Date, until: Date, cacheDir?: string): string {
  const targetDir = path.join(cacheDir ?? DEFAULT_CACHE_DIR, owner, repo, 'range');
  const sinceStr = since.toISOString();
  const untilStr = until.toISOString();
  // sanitize timestamps for filenames
  const key = `since-${sinceStr.replace(/[:.]/g, "-")}-until-${untilStr.replace(/[:.]/g, "-")}.json`;
  return path.join(targetDir, key);
}

interface CacheOptions {
  owner: string;
  repo: string;
  cacheDir?: string;
}

async function getPullRequestWithCache(
  octokit: Octokit,
  pullNumber: number,
  options: CacheOptions,
): Promise<PullRequestData> {
  const cachePath = computeCacheFilePath(pullNumber, options);

  const cached = await readCache(cachePath);
  if (cached) {
    return cached as PullRequestData;
  }

  const { data } = await octokit.pulls.get({
    owner: options.owner,
    repo: options.repo,
    pull_number: pullNumber,
  });

  await writeCache(cachePath, data);

  return data;
}

function computeCacheFilePath(pullNumber: number, options: CacheOptions): string {
  const targetDir = path.join(options.cacheDir ?? DEFAULT_CACHE_DIR, options.owner, options.repo);
  return path.join(targetDir, 'pr', `${pullNumber}.json`);
}

async function getPullRequestFilesWithCache(
  octokit: Octokit,
  pullNumber: number,
  options: CacheOptions,
): Promise<PullRequestFile[]> {
  const cachePath = computeFilesCacheFilePath(pullNumber, options);

  const cached = await readCache(cachePath);
  if (cached) {
    return cached as PullRequestFile[];
  }

  const files = await octokit.paginate(octokit.pulls.listFiles, {
    owner: options.owner,
    repo: options.repo,
    pull_number: pullNumber,
    per_page: 100,
  });

  await writeCache(cachePath, files);

  return files as PullRequestFile[];
}

function computeFilesCacheFilePath(pullNumber: number, options: CacheOptions): string {
  const targetDir = path.join(options.cacheDir ?? DEFAULT_CACHE_DIR, options.owner, options.repo, "pr-files");
  return path.join(targetDir, `${pullNumber}.json`);
}

async function readCache(filePath: string): Promise<unknown | undefined> {
  try {
    const content = await fs.readFile(filePath, "utf8");
    return JSON.parse(content);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return undefined;
    }
    throw error;
  }
}

async function writeCache(filePath: string, data: unknown): Promise<void> {
  const directory = path.dirname(filePath);
  await fs.mkdir(directory, { recursive: true });
  await fs.writeFile(filePath, JSON.stringify(data, null, 2), "utf8");
}

function sanitizeConcurrency(concurrency: number | undefined): number {
  if (!concurrency || Number.isNaN(concurrency)) {
    return 6;
  }
  return Math.max(1, Math.min(25, Math.trunc(concurrency)));
}
