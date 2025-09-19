import Table from "cli-table3";
import chalk from "chalk";
import { ContributorStats } from "./github";

const numberFormatter = new Intl.NumberFormat("en-US");

export interface TableRenderOptions {
  totalPullRequests: number;
}

export function renderContributorTable(contributors: ContributorStats[], options: TableRenderOptions): string {
  const table = new Table({
    head: [
      chalk.cyan("Contributor"),
      chalk.cyan("PRs"),
      chalk.cyan("Additions"),
      chalk.cyan("Deletions"),
    ],
    colAligns: ["left", "right", "right", "right"],
    style: { head: [], border: [] },
    wordWrap: true,
  });

  let additionsTotal = 0;
  let deletionsTotal = 0;

  for (const contributor of contributors) {
    additionsTotal += contributor.additions;
    deletionsTotal += contributor.deletions;

    table.push([
      chalk.green(contributor.login),
      numberFormatter.format(contributor.pullRequests),
      chalk.blue(numberFormatter.format(contributor.additions)),
      chalk.red(numberFormatter.format(contributor.deletions)),
    ]);
  }

  table.push([
    chalk.bold("Total"),
    chalk.bold(numberFormatter.format(options.totalPullRequests)),
    chalk.bold(chalk.blue(numberFormatter.format(additionsTotal))),
    chalk.bold(chalk.red(numberFormatter.format(deletionsTotal))),
  ]);

  return table.toString();
}
