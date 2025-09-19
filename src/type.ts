interface Totals {
  linesAdded: number;
  linesDeleted: number;
  filesChanged: number;
  commitsCount: number;
}

interface Averages {
  linesAdded: number;
  linesDeleted: number;
  filesChanged: number;
  commitsCount: number;
}

interface PRReportInfo {
  prNumber: number;
  title: string;
  url: string;
  owner: string;
  mergedAt: Date;
  totals: Totals;
}

interface ReportUserInfo {
  owner: string;
  totals: Totals & { prCount: number };
  averages: Averages;
  prs: PRReportInfo[];
}

interface ReportInfo {
  periodStart: Date;
  periodEnd: Date;
  totals: Totals & { prCount: number };
  averages: Averages & { prCount: number };
  users: ReportUserInfo[];
  table: ReportTableRow[];
}

interface ReportTableRow {
  owner: string;
  prCount: number;
  linesAdded: number;
  linesDeleted: number;
  filesChanged: number;
  commitsCount: number;
  avgLinesAdded: number;
  avgLinesDeleted: number;
  avgFilesChanged: number;
  avgCommitsCount: number;
}
