import { Octokit } from "@octokit/rest";
import pLimit from "p-limit";

export type PullRequestState = "open" | "closed" | "all" | "merged";

export interface FetchStatsOptions {
  owner: string;
  repo: string;
  state: PullRequestState;
  since?: Date;
  until?: Date;
  limit?: number;
  token?: string;
  concurrentRequests?: number;
}

export interface ContributorStats {
  login: string;
  pullRequests: number;
  additions: number;
  deletions: number;
}

export interface FetchResult {
  contributors: ContributorStats[];
  totalPullRequests: number;
}

interface MinimalPullRequest {
  number: number;
  user?: { login?: string | null } | null;
  merged_at?: string | null;
  updated_at?: string | null;
  created_at?: string | null;
}

export async function fetchContributorStats(options: FetchStatsOptions): Promise<FetchResult> {
  const { owner, repo, state, since, until, limit, token, concurrentRequests = 6 } = options;

  const octokit = new Octokit({ auth: token });

  const apiState = state === "merged" ? "closed" : state;

  const collected: MinimalPullRequest[] = [];
  const targetAmount = typeof limit === "number" && limit > 0 ? limit : undefined;

  const iterator = octokit.paginate.iterator(octokit.pulls.list, {
    owner,
    repo,
    state: apiState,
    per_page: 100,
    sort: "created",
    direction: "desc",
  });

  outer: for await (const { data } of iterator) {
    for (const raw of data) {
      const pull = normalizePull(raw);

      if (state === "merged" && !pull.merged_at) {
        continue;
      }

      if (!passesDateFilters(pull, state, since, until)) {
        continue;
      }

      collected.push(pull);

      if (targetAmount && collected.length >= targetAmount) {
        break outer;
      }
    }
  }

  const limiter = pLimit(sanitizeConcurrency(concurrentRequests));

  const detailedPulls = await Promise.all(
    collected.map((pull) =>
      limiter(async () => {
        const { data } = await octokit.pulls.get({
          owner,
          repo,
          pull_number: pull.number,
        });
        return data;
      }),
    ),
  );

  const contributions = new Map<string, ContributorStats>();

  for (const pull of detailedPulls) {
    const login = pull.user?.login ?? "unknown";
    const current = contributions.get(login) ?? { login, pullRequests: 0, additions: 0, deletions: 0 };

    const additions = pull.additions ?? 0;
    const deletions = pull.deletions ?? 0;

    contributions.set(login, {
      login,
      pullRequests: current.pullRequests + 1,
      additions: current.additions + additions,
      deletions: current.deletions + deletions,
    });
  }

  const contributors = Array.from(contributions.values()).sort((a, b) => {
    if (b.pullRequests !== a.pullRequests) {
      return b.pullRequests - a.pullRequests;
    }
    if (b.additions !== a.additions) {
      return b.additions - a.additions;
    }
    return b.deletions - a.deletions;
  });

  return {
    contributors,
    totalPullRequests: detailedPulls.length,
  };
}

function passesDateFilters(
  pull: MinimalPullRequest,
  state: PullRequestState,
  since?: Date,
  until?: Date,
): boolean {
  if (!since && !until) {
    return true;
  }

  const referenceDate = chooseReferenceDate(pull, state);

  if (!referenceDate) {
    return true;
  }

  if (since && referenceDate < since) {
    return false;
  }

  if (until && referenceDate > until) {
    return false;
  }

  return true;
}

function sanitizeConcurrency(concurrency: number | undefined): number {
  if (!concurrency || Number.isNaN(concurrency)) {
    return 6;
  }
  return Math.max(1, Math.min(25, Math.trunc(concurrency)));
}

function normalizePull(pull: any): MinimalPullRequest {
  return {
    number: pull.number,
    user: pull.user,
    merged_at: pull.merged_at,
    updated_at: pull.updated_at,
    created_at: pull.created_at,
  };
}

function chooseReferenceDate(pull: MinimalPullRequest, state: PullRequestState): Date | undefined {
  const mergedAt = pull.merged_at ? new Date(pull.merged_at) : undefined;
  const updatedAt = pull.updated_at ? new Date(pull.updated_at) : undefined;
  const createdAt = pull.created_at ? new Date(pull.created_at) : undefined;

  if (state === "merged") {
    return mergedAt;
  }

  if (state === "closed") {
    return mergedAt ?? updatedAt ?? createdAt;
  }

  return createdAt ?? updatedAt ?? mergedAt;
}
