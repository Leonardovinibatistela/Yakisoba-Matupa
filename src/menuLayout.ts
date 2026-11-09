// Ordem do cardápio escolhida pelo dono (só regra — sem tela nem Firebase, pra dar pra testar sozinho).
// O cardápio "de fábrica" (menuData.ts) tem uma ordem; aqui fica o que o admin mudou: a ordem das seções, a ordem dos itens
// dentro de cada seção e itens movidos pra outra seção. Sem nada salvo, o site segue a ordem de fábrica.

/** `sectionOrder`: ids das seções na ordem. `items`: por seção, os ids dos itens na ordem (um item que aparece na lista de OUTRA seção foi movido pra lá). */
export type MenuLayout = { sectionOrder: string[]; items: Record<string, string[]> };

type Section<T extends { id: string }> = { id: string; items: T[] };

/** Seções na ordem escolhida; as que não estão na lista (seção nova) vão pro fim, na ordem de fábrica. */
export function orderSections<S extends { id: string }>(sections: S[], layout: MenuLayout | null): S[] {
  if (!layout) return sections;
  const byId = new Map(sections.map((section) => [section.id, section]));
  const ordered: S[] = [];
  const used = new Set<string>();
  for (const id of layout.sectionOrder) {
    const section = byId.get(id);
    if (section && !used.has(id)) { ordered.push(section); used.add(id); }
  }
  for (const section of sections) if (!used.has(section.id)) ordered.push(section);
  return ordered;
}

/**
 * Aplica a ordem escolhida nas seções (que já vêm com os itens de fábrica + os que o admin adicionou). Um item que o admin
 * ainda não arrumou (ex.: item novo) fica no fim da seção de onde ele é, na ordem de fábrica; ids que não existem mais são ignorados.
 */
export function arrangeSections<T extends { id: string }, S extends Section<T>>(sections: S[], layout: MenuLayout | null): S[] {
  if (!layout) return sections;
  const pool = new Map<string, T>();
  sections.forEach((section) => section.items.forEach((item) => { if (!pool.has(item.id)) pool.set(item.id, item); }));
  const sectionIds = new Set(sections.map((section) => section.id));
  const placed = new Set<string>();
  const lists = new Map<string, T[]>();
  for (const [sectionId, ids] of Object.entries(layout.items)) {
    if (!sectionIds.has(sectionId)) continue;
    const list: T[] = [];
    for (const id of ids) {
      const item = pool.get(id);
      if (item && !placed.has(id)) { list.push(item); placed.add(id); }
    }
    lists.set(sectionId, list);
  }
  sections.forEach((section) => section.items.forEach((item) => {
    if (placed.has(item.id)) return;
    placed.add(item.id);
    const list = lists.get(section.id) ?? [];
    list.push(item);
    lists.set(section.id, list);
  }));
  return orderSections(sections.map((section) => ({ ...section, items: lists.get(section.id) ?? [] })), layout);
}

/** Foto da arrumação de AGORA (o que está na tela do painel): é a base de qualquer movimento. */
export function snapshotLayout(arranged: { id: string; items: { id: string }[] }[]): MenuLayout {
  return { sectionOrder: arranged.map((section) => section.id), items: Object.fromEntries(arranged.map((section) => [section.id, section.items.map((item) => item.id)])) };
}

const copyLayout = (layout: MenuLayout): MenuLayout => ({ sectionOrder: [...layout.sectionOrder], items: Object.fromEntries(Object.entries(layout.items).map(([id, list]) => [id, [...list]])) });

function swap<T>(list: T[], index: number, delta: -1 | 1): boolean {
  const target = index + delta;
  if (index < 0 || target < 0 || target >= list.length) return false;
  [list[index], list[target]] = [list[target], list[index]];
  return true;
}

/** Sobe (-1) ou desce (+1) um item dentro da própria seção. No limite (primeiro/último) devolve a mesma arrumação. */
export function moveItemInSection(layout: MenuLayout, sectionId: string, itemId: string, delta: -1 | 1): MenuLayout {
  const next = copyLayout(layout);
  const list = next.items[sectionId];
  if (!list) return layout;
  return swap(list, list.indexOf(itemId), delta) ? next : layout;
}

/** Tira o item de onde está e põe no FIM da seção de destino. */
export function moveItemToSection(layout: MenuLayout, itemId: string, toSectionId: string): MenuLayout {
  if (!(toSectionId in layout.items)) return layout;
  const next = copyLayout(layout);
  for (const list of Object.values(next.items)) {
    const index = list.indexOf(itemId);
    if (index !== -1) list.splice(index, 1);
  }
  next.items[toSectionId].push(itemId);
  return next;
}

/** Sobe (-1) ou desce (+1) uma seção inteira. */
export function moveSection(layout: MenuLayout, sectionId: string, delta: -1 | 1): MenuLayout {
  const next = copyLayout(layout);
  return swap(next.sectionOrder, next.sectionOrder.indexOf(sectionId), delta) ? next : layout;
}

/** Seções do mesmo "tipo": itens de yakisoba (que têm os acompanhamentos) só podem ir pra outra seção de yakisoba, e os demais só pra seções sem acompanhamento. */
export function compatibleSectionIds(sectionId: string, allSectionIds: string[], customizableSectionIds: string[]): string[] {
  const customizable = customizableSectionIds.includes(sectionId);
  return allSectionIds.filter((id) => id !== sectionId && customizableSectionIds.includes(id) === customizable);
}

const MAX_SECTIONS = 40;
const MAX_ITEMS = 500;

/** Lê o texto salvo; qualquer coisa fora do formato (ou estragada) vira null e o site volta pra ordem de fábrica, sem quebrar. */
export function parseLayout(text: unknown): MenuLayout | null {
  if (typeof text !== "string" || text.length === 0 || text.length > 100000) return null;
  let raw: unknown;
  try { raw = JSON.parse(text); } catch { return null; }
  if (!raw || typeof raw !== "object") return null;
  const { sectionOrder, items } = raw as { sectionOrder?: unknown; items?: unknown };
  if (!Array.isArray(sectionOrder) || sectionOrder.length > MAX_SECTIONS || !sectionOrder.every((id) => typeof id === "string")) return null;
  if (!items || typeof items !== "object" || Array.isArray(items)) return null;
  const entries = Object.entries(items as Record<string, unknown>);
  if (entries.length > MAX_SECTIONS) return null;
  let total = 0;
  const parsed: Record<string, string[]> = {};
  for (const [sectionId, list] of entries) {
    if (!Array.isArray(list) || !list.every((id) => typeof id === "string")) return null;
    total += list.length;
    if (total > MAX_ITEMS) return null;
    parsed[sectionId] = list as string[];
  }
  return { sectionOrder: sectionOrder as string[], items: parsed };
}
