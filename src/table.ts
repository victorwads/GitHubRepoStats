function formatPM(plus: number, minus: number): string {
  return `${chalk.blue("+" + formatInteger(plus))}${chalk.gray(",")}${chalk.red("-" + formatInteger(minus))}`;
}
import Table from "cli-table3";
import chalk from "chalk";
import type { Averages, ReportExtensionInfo, ReportFileInfo, ReportTableRow, Totals } from "./type";

const integerFormatter = new Intl.NumberFormat("en-US");
const decimalFormatter = new Intl.NumberFormat("en-US", { maximumFractionDigits: 2, minimumFractionDigits: 2 });

export interface TableRenderOptions {
  totals: Totals & { prCount: number };
  averages: Averages & { prCount: number };
}

export function renderReportTable(rows: ReportTableRow[], options: TableRenderOptions): string {
  // Descobre todas as extensões presentes
  const allExtensions = Array.from(
    new Set(
      rows.flatMap((row) => Object.keys(row.extensionLineCounts))
    )
  ).sort();

  const head = [
    chalk.cyan("Owner"),
    chalk.cyan("PRs"),
    chalk.cyan("Commits"),
    chalk.cyan("Files"),
    chalk.cyan("Lines +/-"),
    chalk.cyan("Avg Commits"),
    chalk.cyan("Avg Files"),
    chalk.cyan("Avg +/-"),
    ...allExtensions.map((ext) => chalk.cyan(ext)),
  ];
  const colAligns = [
    "left", "right", "right", "right", "right", "right", "right", "right", "right",
    ...Array(allExtensions.length).fill("right"),
  ];
  const table = new Table({
    head,
    colAligns,
    style: { head: [], border: [] },
    wordWrap: true,
  });

  for (const row of rows) {
    table.push([
      chalk.green(row.owner),
      formatInteger(row.prCount),
      formatInteger(row.commitsCount),
      formatInteger(row.filesChanged),
      formatPM(row.linesAdded, row.linesDeleted),
      formatDecimal(row.avgCommitsCount),
      formatDecimal(row.avgFilesChanged),
      `${chalk.blue(formatDecimal(row.avgLinesAdded))}${chalk.gray(",")}${chalk.red("-" + formatDecimal(row.avgLinesDeleted))}`,
      ...allExtensions.map((ext) => {
        const added = row.extensionLineCounts[ext]?.added ?? 0;
        const deleted = row.extensionLineCounts[ext]?.deleted ?? 0;
        return formatPM(added, deleted);
      }),
    ]);
  }

  // Totais por extensão
  const totalExtensionCounts: Record<string, { added: number; deleted: number }> = {};
  for (const ext of allExtensions) {
    totalExtensionCounts[ext] = { added: 0, deleted: 0 };
    for (const row of rows) {
      totalExtensionCounts[ext].added += row.extensionLineCounts[ext]?.added ?? 0;
      totalExtensionCounts[ext].deleted += row.extensionLineCounts[ext]?.deleted ?? 0;
    }
  }

  table.push([
    chalk.bold("Total"),
    chalk.bold(formatInteger(options.totals.prCount)),
    chalk.bold(formatInteger(options.totals.commitsCount)),
    chalk.bold(formatInteger(options.totals.filesChanged)),
    formatPM(options.totals.linesAdded, options.totals.linesDeleted),
    chalk.bold(formatDecimal(options.averages.commitsCount)),
    chalk.bold(formatDecimal(options.averages.filesChanged)),
    `${chalk.bold(chalk.blue(formatDecimal(options.averages.linesAdded)))}${chalk.gray(",")}${chalk.bold(chalk.red("-" + formatDecimal(options.averages.linesDeleted)))}`,
    ...allExtensions.map((ext) => {
      const added = totalExtensionCounts[ext].added;
      const deleted = totalExtensionCounts[ext].deleted;
      return formatPM(added, deleted);
    }),
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
    ...Array(allExtensions.length).fill("")
  ]);

  return table.toString();
}

export function renderFileChangesTable(files: ReportFileInfo[], limit: number): string {
  const table = new Table({
    head: [
      chalk.cyan("Arquivo"),
      chalk.cyan("PRs"),
      chalk.cyan("Lines +"),
      chalk.cyan("Lines -"),
      chalk.cyan("Total"),
    ],
    colAligns: ["left", "right", "right", "right", "right"],
    style: { head: [], border: [] },
    wordWrap: true,
  });

  const rows = files.slice(0, Math.max(0, limit));

  for (const file of rows) {
    table.push([
      chalk.green(file.path),
      formatInteger(file.prCount),
      chalk.blue(formatInteger(file.linesAdded)),
      chalk.red(formatInteger(file.linesDeleted)),
      formatInteger(file.totalChanges),
    ]);
  }

  return table.toString();
}

export function renderExtensionChangesTable(extensions: ReportExtensionInfo[]): string {
  const table = new Table({
    head: [
      chalk.cyan("Extensão"),
      chalk.cyan("Arquivos"),
      chalk.cyan("Lines +"),
      chalk.cyan("Lines -"),
      chalk.cyan("Total"),
    ],
    colAligns: ["left", "right", "right", "right", "right"],
    style: { head: [], border: [] },
    wordWrap: true,
  });

  for (const extension of extensions) {
    table.push([
      chalk.green(extension.extension),
      formatInteger(extension.filesCount),
      chalk.blue(formatInteger(extension.linesAdded)),
      chalk.red(formatInteger(extension.linesDeleted)),
      formatInteger(extension.totalChanges),
    ]);
  }

  return table.toString();
}

function formatInteger(value: number): string {
  return integerFormatter.format(Math.trunc(value));
}

function formatDecimal(value: number): string {
  return decimalFormatter.format(value);
}
