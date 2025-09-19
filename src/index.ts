import { Command, InvalidArgumentError } from "commander";
import chalk from "chalk";
import { fetchContributorStats, PullRequestState } from "./github";
import { renderContributorTable } from "./table";

interface CliOptions {
  owner: string;
  repo: string;
  state: PullRequestState;
  since?: Date;
  until?: Date;
  limit?: number;
  token?: string;
  concurrency?: number;
  json?: boolean;
}

function parseDate(value: string): Date {
  const timestamp = Date.parse(value);
  if (Number.isNaN(timestamp)) {
    throw new InvalidArgumentError(`Invalid date: ${value}`);
  }
  return new Date(timestamp);
}

function parseInteger(value: string): number {
  const parsed = Number.parseInt(value, 10);
  if (Number.isNaN(parsed) || parsed < 0) {
    throw new InvalidArgumentError(`Expected a positive integer, received: ${value}`);
  }
  return parsed;
}

function resolveToken(tokenOption?: string): string | undefined {
  return tokenOption ?? process.env.GITHUB_TOKEN ?? process.env.GH_TOKEN;
}

function validateState(state: string): PullRequestState {
  const available: PullRequestState[] = ["open", "closed", "all", "merged"];
  if (available.includes(state as PullRequestState)) {
    return state as PullRequestState;
  }
  throw new InvalidArgumentError(`Invalid state: ${state}. Expected one of ${available.join(", ")}`);
}

export async function runCli(argv: string[]): Promise<void> {
  const program = new Command();

  program
    .name("github-stats")
    .description("CLI para gerar estatísticas de contribuições de PRs no GitHub")
    .requiredOption("-o, --owner <owner>", "Organização ou usuário do repositório")
    .requiredOption("-r, --repo <repo>", "Nome do repositório")
    .option("-s, --state <state>", "Estado dos PRs (open|closed|all|merged)", validateState, "merged")
    .option("--since <date>", "Considerar PRs a partir desta data (ISO)", parseDate)
    .option("--until <date>", "Considerar PRs até esta data (ISO)", parseDate)
    .option("-l, --limit <number>", "Limitar a quantidade de PRs analisados", parseInteger)
    .option("-t, --token <token>", "Token do GitHub. Também lê GITHUB_TOKEN / GH_TOKEN")
    .option("-c, --concurrency <number>", "Limitar requisições concorrentes ao GitHub", parseInteger, 6)
    .option("--json", "Exibir saída em JSON bruto", false)
    .action(async (options) => {
      const resolvedToken = resolveToken(options.token);

      const cliOptions: CliOptions = {
        owner: options.owner,
        repo: options.repo,
        state: options.state,
        since: options.since,
        until: options.until,
        limit: options.limit,
        token: resolvedToken,
        concurrency: options.concurrency,
        json: options.json,
      };

      await execute(cliOptions);
    });

  await program.parseAsync(argv);
}

async function execute(options: CliOptions): Promise<void> {
  try {
    const { contributors, totalPullRequests } = await fetchContributorStats({
      owner: options.owner,
      repo: options.repo,
      state: options.state,
      since: options.since,
      until: options.until,
      limit: options.limit,
      token: options.token,
      concurrentRequests: options.concurrency,
    });

    if (options.json) {
      const payload = {
        repository: `${options.owner}/${options.repo}`,
        state: options.state,
        totalPullRequests,
        contributors,
      };
      console.log(JSON.stringify(payload, null, 2));
      return;
    }

    if (contributors.length === 0) {
      console.log(chalk.yellow("Nenhum PR encontrado com os filtros informados."));
      return;
    }

    const table = renderContributorTable(contributors, { totalPullRequests });
    console.log(table);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(chalk.red(`Erro ao gerar estatísticas: ${message}`));
    if (process.env.DEBUG) {
      console.error(error);
    }
    process.exitCode = 1;
  }
}

if (require.main === module) {
  runCli(process.argv).catch((error) => {
    const message = error instanceof Error ? error.message : String(error);
    console.error(chalk.red(`Falha inesperada: ${message}`));
    process.exit(1);
  });
}
