export interface Totals {
  linesAdded: number;
  linesDeleted: number;
  filesChanged: number;
  commitsCount: number;
}

export interface Averages {
  linesAdded: number;
  linesDeleted: number;
  filesChanged: number;
  commitsCount: number;
}

export interface PRFileChangeInfo {
  path: string;
  linesAdded: number;
  linesDeleted: number;
  totalChanges: number;
}

export interface ReportFileInfo extends PRFileChangeInfo {
  prCount: number;
}

export interface PRReportInfo {
  prNumber: number;
  title: string;
  url: string;
  owner: string;
  mergedAt: Date;
  totals: Totals;
  files: PRFileChangeInfo[];
}

export interface ReportUserInfo {
  owner: string;
  totals: Totals & { prCount: number };
  averages: Averages;
  prs: PRReportInfo[];
}

export interface ReportInfo {
  periodStart: Date;
  periodEnd: Date;
  totals: Totals & { prCount: number };
  averages: Averages & { prCount: number };
  users: ReportUserInfo[];
  table: ReportTableRow[];
  files: ReportFileInfo[];
}

export interface ReportTableRow {
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
