import chalk from "chalk";
import { Octokit } from "@octokit/rest";
let fetchFn: typeof fetch;
try {
  fetchFn = fetch;
} catch {
  // @ts-ignore
  fetchFn = require('node-fetch');
}

export async function showPrInfo({ owner, repo, prNumber, token, showComments = false, showDiffs = false }: { owner: string; repo: string; prNumber: number; token?: string; showComments?: boolean; showDiffs?: boolean }) {
  const octokit = new Octokit({ auth: token });
  try {
    const pr = await octokit.pulls.get({ owner, repo, pull_number: prNumber });
    const files = await octokit.pulls.listFiles({ owner, repo, pull_number: prNumber });
    let comments = { data: [] };
    if (showComments) {
      comments = await octokit.pulls.listReviewComments({ owner, repo, pull_number: prNumber });
    }
    const diffUrl = pr.data.diff_url;
    let diffContent = "";
    if (showDiffs) {
      // Busca o conteúdo do diff via Octokit
      const diffResponse = await octokit.request('GET /repos/{owner}/{repo}/pulls/{pull_number}', {
        owner,
        repo,
        pull_number: prNumber,
        headers: {
          accept: 'application/vnd.github.v3.diff',
        },
      });
      diffContent = typeof diffResponse.data === 'string' ? diffResponse.data : '';
    }

    console.log(chalk.bold(`PR #${pr.data.number}: ${pr.data.title}`));
    console.log(chalk.cyan(`Autor:`), pr.data.user?.login);
    console.log(chalk.cyan(`Criado em:`), pr.data.created_at);
    console.log(chalk.cyan(`Branch:`), pr.data.head.ref);
    console.log(chalk.cyan(`Descrição:`), pr.data.body || "(sem descrição)");
    console.log(chalk.cyan(`Diff URL:`), diffUrl);
    if (showDiffs && diffContent) {
      console.log(chalk.magenta("\n--- DIFF ---\n"));
      console.log(diffContent);
      console.log(chalk.magenta("\n--- FIM DIFF ---\n"));
    }
    console.log(chalk.cyan(`Arquivos alterados:`));
    files.data.forEach(file => {
      console.log(`- ${file.filename} (${file.changes} mudanças)`);
    });
    if (showComments) {
      console.log(chalk.cyan(`Comentários:`));
      if (comments.data.length === 0) {
        console.log("(sem comentários)");
      } else {
        comments.data.forEach(comment => {
          console.log(`- ${comment.user?.login}: ${comment.body}`);
        });
      }
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(chalk.red(`Erro ao buscar PR: ${message}`));
    if (process.env.DEBUG) {
      console.error(error);
    }
    process.exitCode = 1;
  }
}
