/// <reference types="vite/client" />
declare module '@pdf-lib/fontkit' {
  const fontkit: { create(data: Uint8Array): import('./core/layout').FontMetrics };
  export default fontkit;
}
interface Window {
  tableloom?: {
    beforeClose: (callback: () => void) => () => void;
    readyToClose: () => Promise<void>;
    platform: string;
    updateStatus: () => Promise<import('./updates').UpdateStatus>;
    checkUpdates: () => Promise<import('./updates').UpdateStatus>;
    configureUpdates: (changes: {
      automatic?: boolean;
      useGitHubCli?: boolean;
      token?: string;
    }) => Promise<import('./updates').UpdateStatus>;
    openRelease: () => Promise<void>;
    onUpdateChanged: (callback: (status: import('./updates').UpdateStatus) => void) => () => void;
    openProject: () => Promise<{ path: string; data: number[] } | null>;
    saveProject: (data: number[], name: string, path?: string) => Promise<string | null>;
    saveFile: (data: number[], name: string) => Promise<string | null>;
    autosave: (id: string, data: string) => Promise<void>;
    listProjects: () => Promise<{ id: string; data: string }[]>;
    cancelExport: () => Promise<void>;
    exportPdf: (html: string, name: string, width: number, height: number) => Promise<string | null>;
    configureProduction: () => Promise<{ version: string; profile: string } | null>;
    productionStatus: () => Promise<{ version: string; profile: string } | null>;
    exportProduction: (
      jobs: import('./core/production').ProductionJob[],
      name: string,
    ) => Promise<string | null>;
    watchAsset: () => Promise<{ path: string; data: number[] } | null>;
    watchSource: () => Promise<{ path: string; data: number[] } | null>;
    onSourceChanged: (callback: (data: { path: string; data: number[] }) => void) => () => void;
    openFolder: (path: string) => Promise<void>;
  };
}
