import type { DocumentState, ExportProfile } from './model';
import { renderComponent, resolveTemplate, fontCSS, xml } from './layout';
import { compareDocuments } from './revision';
export interface ProductionJob {
  name: string;
  html: string;
  width: number;
  height: number;
  bleed: number;
}
export function productionJobs(
  doc: DocumentState,
  profile: ExportProfile,
  baseline?: DocumentState,
): ProductionJob[] {
  const changed =
    profile.changedOnly && baseline
      ? new Set(compareDocuments(baseline, doc).map((c) => `${c.setId}/${c.rowId}`))
      : null;
  return doc.sets
    .filter((s) => !profile.setIds.length || profile.setIds.includes(s.id))
    .flatMap((set) => {
      const template = resolveTemplate(doc, set.templateId),
        bleed = profile.bleed ? template.bleed : 0,
        width = template.width + 2 * bleed,
        height = template.height + 2 * bleed;
      const pages = set.rows
        .filter((r) => Number(r.qty ?? 1) > 0 && (!changed || changed.has(`${set.id}/${r.id}`)))
        .flatMap((row) =>
          (set.backTemplateId ? [false, true] : [false]).map(
            (back) =>
              `<section>${renderComponent(doc, set, row, { back, bleed: profile.bleed, locale: profile.locale, layer: profile.layer })}</section>`,
          ),
        );
      if (!pages.length) return [];
      const html = `<!doctype html><html><head><meta charset="utf-8"><title>${xml(doc.name)} · ${xml(set.name)}</title><style>${fontCSS()}@page{size:${width}mm ${height}mm;margin:0}*{box-sizing:border-box}html,body{margin:0;padding:0}section{width:${width}mm;height:${height}mm;break-after:page;overflow:hidden}section:last-child{break-after:auto}svg{display:block}</style></head><body>${pages.join('')}</body></html>`;
      return [{ name: set.name, html, width, height, bleed }];
    });
}
