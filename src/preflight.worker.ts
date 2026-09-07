import { PreflightCache } from './core/cache';
import { loadEngineFonts } from './fonts';
import type { DocumentState } from './core/model';
const cache = new PreflightCache();
const ready = loadEngineFonts();
self.onmessage = async (event: MessageEvent<{ id: number; doc: DocumentState; locale: string }>) => {
  try {
    await ready;
    self.postMessage({ id: event.data.id, issues: cache.run(event.data.doc, event.data.locale) });
  } catch (error) {
    self.postMessage({ id: event.data.id, error: (error as Error).message });
  }
};
