export interface UpdateStatus {
  currentVersion: string;
  repository: string;
  releaseUrl: string;
  available: boolean;
  checking: boolean;
  checkedAt: string | null;
  latestVersion: string | null;
  message: string;
  authSource: string;
  automatic: boolean;
  useGitHubCli: boolean;
  hasToken: boolean;
  canStoreToken: boolean;
}
