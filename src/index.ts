import "dotenv/config";

import { Command, InvalidArgumentError } from "commander";
import chalk from "chalk";
import { generateReport } from "./report";
import { renderReportTable } from "./table";

interface CliOptions {
  owner: string;
  repo: string;
  since?: Date;
  until?: Date;
  limit?: number;
  token?: string;
  concurrency?: number;
  cacheDir?: string;
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

export async function runCli(argv: string[]): Promise<void> {
  const program = new Command();

  program
    .name("github-stats")
    .description("CLI para gerar estatísticas detalhadas de PRs mergeados no GitHub")
    .requiredOption("-o, --owner <owner>", "Organização ou usuário do repositório")
    .requiredOption("-r, --repo <repo>", "Nome do repositório")
    .option("--since <date>", "Considerar PRs mergeados a partir desta data (ISO)", parseDate)
    .option("--until <date>", "Considerar PRs mergeados até esta data (ISO)", parseDate)
    .option("-l, --limit <number>", "Limitar a quantidade de PRs analisados", parseInteger)
    .option("-t, --token <token>", "Token do GitHub. Também lê GITHUB_TOKEN / GH_TOKEN")
    .option("-c, --concurrency <number>", "Limitar requisições concorrentes ao GitHub", parseInteger, 6)
    .option("--cache-dir <path>", "Diretório para armazenar cache das respostas de PRs")
    .option("--json", "Exibir saída em JSON bruto", false)
    .action(async (options) => {
      const resolvedToken = resolveToken(options.token);

      const cliOptions: CliOptions = {
        owner: options.owner,
        repo: options.repo,
        since: options.since,
        until: options.until,
        limit: options.limit,
        token: resolvedToken,
        concurrency: options.concurrency,
        cacheDir: options.cacheDir,
        json: options.json,
      };

      await execute(cliOptions);
    });

  await program.parseAsync(argv);
}

async function execute(options: CliOptions): Promise<void> {
  try {
    const report = await generateReport({
      owner: options.owner,
      repo: options.repo,
      since: options.since,
      until: options.until,
      limit: options.limit,
      token: options.token,
      concurrentRequests: options.concurrency,
      cacheDir: options.cacheDir,
    });

    if (options.json) {
      console.log(JSON.stringify(report, null, 2));
      return;
    }

    if (report.totals.prCount === 0) {
      console.log(chalk.yellow("Nenhum PR mergeado encontrado com os filtros informados."));
      return;
    }

    console.log(
      chalk.cyan(
        `Período: ${formatDate(report.periodStart)} → ${formatDate(report.periodEnd)} | PRs: ${report.totals.prCount}`,
      ),
    );

    const table = renderReportTable(report.table, {
      totals: report.totals,
      averages: report.averages,
    });
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

function formatDate(date: Date): string {
  return date.toISOString().split("T")[0];
}

if (require.main === module) {
  runCli(process.argv).catch((error) => {
    const message = error instanceof Error ? error.message : String(error);
    console.error(chalk.red(`Falha inesperada: ${message}`));
    process.exit(1);
  });
}
