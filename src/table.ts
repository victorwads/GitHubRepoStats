import Table from "cli-table3";
import chalk from "chalk";
import type { Averages, ReportTableRow, Totals } from "./type";

const integerFormatter = new Intl.NumberFormat("en-US");
const decimalFormatter = new Intl.NumberFormat("en-US", { maximumFractionDigits: 2, minimumFractionDigits: 2 });

export interface TableRenderOptions {
  totals: Totals & { prCount: number };
  averages: Averages & { prCount: number };
}

export function renderReportTable(rows: ReportTableRow[], options: TableRenderOptions): string {
  const table = new Table({
    head: [
      chalk.cyan("Owner"),
      chalk.cyan("PRs"),
      chalk.cyan("Lines +"),
      chalk.cyan("Lines -"),
      chalk.cyan("Files"),
      chalk.cyan("Commits"),
      chalk.cyan("Avg +"),
      chalk.cyan("Avg -"),
      chalk.cyan("Avg Files"),
      chalk.cyan("Avg Commits"),
    ],
    colAligns: ["left", "right", "right", "right", "right", "right", "right", "right", "right", "right"],
    style: { head: [], border: [] },
    wordWrap: true,
  });

  for (const row of rows) {
    table.push([
      chalk.green(row.owner),
      formatInteger(row.prCount),
      chalk.blue(formatInteger(row.linesAdded)),
      chalk.red(formatInteger(row.linesDeleted)),
      formatInteger(row.filesChanged),
      formatInteger(row.commitsCount),
      chalk.blue(formatDecimal(row.avgLinesAdded)),
      chalk.red(formatDecimal(row.avgLinesDeleted)),
      formatDecimal(row.avgFilesChanged),
      formatDecimal(row.avgCommitsCount),
    ]);
  }

  table.push([
    chalk.bold("Total"),
    chalk.bold(formatInteger(options.totals.prCount)),
    chalk.bold(chalk.blue(formatInteger(options.totals.linesAdded))),
    chalk.bold(chalk.red(formatInteger(options.totals.linesDeleted))),
    chalk.bold(formatInteger(options.totals.filesChanged)),
    chalk.bold(formatInteger(options.totals.commitsCount)),
    chalk.bold(chalk.blue(formatDecimal(options.averages.linesAdded))),
    chalk.bold(chalk.red(formatDecimal(options.averages.linesDeleted))),
    chalk.bold(formatDecimal(options.averages.filesChanged)),
    chalk.bold(formatDecimal(options.averages.commitsCount)),
  ]);

  table.push([
    chalk.bold("Avg/Owner"),
    chalk.bold(formatDecimal(options.averages.prCount)),
    "",
    "",
    "",
    "",
    "",
    "",
    "",
    "",
  ]);

  return table.toString();
}

function formatInteger(value: number): string {
  return integerFormatter.format(Math.trunc(value));
}

function formatDecimal(value: number): string {
  return decimalFormatter.format(value);
}
