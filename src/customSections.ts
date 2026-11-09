// Seções (categorias) do cardápio que o dono cria pelo painel — só regra, sem tela nem Firebase, pra dar pra testar sozinho.
// As seções "de fábrica" ficam em menuData.ts; estas são somadas a elas (no site, no painel e no Pedido manual). Uma seção
// criada começa vazia e só aparece no site quando tiver pelo menos um item.
import type { MenuSection } from "./menuData";

/** `id` é gerado pelo sistema (nunca muda, mesmo se o nome mudar); `name` é o que o dono digitou. */
export type CustomSection = { id: string; name: string };

export const CUSTOM_SECTION_PREFIX = "sec-";
export const MAX_CUSTOM_SECTIONS = 20;
export const MAX_SECTION_NAME = 40;

/** Uma seção criada pelo dono no mesmo formato das de fábrica (sem itens: quem junta os itens é quem chama). */
export const toMenuSection = (section: CustomSection): MenuSection => ({ id: section.id, eyebrow: section.name, title: section.name, items: [] });

/** Sem acento, minúsculo e com espaços simples: pra comparar nomes ("Temakis" = "temakis" = "  TÉMAKIS "). */
const fold = (text: string): string => text.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\s+/g, " ").trim();

export const normalizeSectionName = (name: string): string => name.trim().replace(/\s+/g, " ");

/** Mensagem de erro (em português) se o nome não pode ser usado, ou null. `existingNames`: nomes das OUTRAS seções (de fábrica e criadas pelo dono). */
export function validateSectionName(name: string, existingNames: string[]): string | null {
  const clean = normalizeSectionName(name);
  if (clean.length === 0) return "Digite o nome da seção.";
  if (clean.length > MAX_SECTION_NAME) return `O nome pode ter no máximo ${MAX_SECTION_NAME} letras.`;
  if (existingNames.some((existing) => fold(existing) === fold(clean))) return "Já existe uma seção com esse nome.";
  return null;
}

const randomSuffix = (): string => Math.random().toString(36).slice(2, 6).padEnd(4, "0");

/** Id seguro pro HTML e pro Firestore: "sec-" + nome sem acento/símbolos + 4 letras ao acaso. Nunca repete um id que já existe. */
export function newSectionId(name: string, existingIds: string[], random: () => string = randomSuffix): string {
  const slug = fold(name).replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 24).replace(/-+$/g, "") || "secao";
  for (let attempt = 0; attempt < 50; attempt++) {
    const id = `${CUSTOM_SECTION_PREFIX}${slug}-${random()}`;
    if (!existingIds.includes(id)) return id;
  }
  let counter = 2;
  while (existingIds.includes(`${CUSTOM_SECTION_PREFIX}${slug}-${counter}`)) counter++;
  return `${CUSTOM_SECTION_PREFIX}${slug}-${counter}`;
}

/** Lê o texto salvo; o que estiver fora do formato (ou estragado) é ignorado e o site segue só com as seções de fábrica, sem quebrar. */
export function parseCustomSections(text: unknown): CustomSection[] {
  if (typeof text !== "string" || text.length === 0 || text.length > 20000) return [];
  let raw: unknown;
  try { raw = JSON.parse(text); } catch { return []; }
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  const sections: CustomSection[] = [];
  for (const entry of raw) {
    if (sections.length >= MAX_CUSTOM_SECTIONS) break;
    if (!entry || typeof entry !== "object") continue;
    const { id, name } = entry as { id?: unknown; name?: unknown };
    if (typeof id !== "string" || !/^sec-[a-z0-9-]{1,40}$/.test(id) || seen.has(id)) continue;
    if (typeof name !== "string") continue;
    const clean = normalizeSectionName(name);
    if (!clean || clean.length > MAX_SECTION_NAME) continue;
    seen.add(id);
    sections.push({ id, name: clean });
  }
  return sections;
}

export const addSection = (sections: CustomSection[], section: CustomSection): CustomSection[] => [...sections, section];
export const renameSection = (sections: CustomSection[], id: string, name: string): CustomSection[] => sections.map((section) => (section.id === id ? { ...section, name: normalizeSectionName(name) } : section));
export const removeSection = (sections: CustomSection[], id: string): CustomSection[] => sections.filter((section) => section.id !== id);

/**
 * Por que a seção NÃO pode ser excluída agora (mensagem em português), ou null se pode. Só sai uma seção vazia: item dentro dela
 * (ou item criado nela que foi movido pra outro lugar) sumiria do cardápio.
 */
export function sectionDeleteBlocker(itemsInSection: number, customItemsCreatedHere: number): string | null {
  if (itemsInSection > 0) return "Essa seção ainda tem itens. Mova os itens pra outra seção (↕ Organizar) antes de excluir.";
  if (customItemsCreatedHere > 0) return "Ainda existe um item que foi criado nessa seção (hoje ele está em outra). Exclua esse item do cardápio antes de excluir a seção.";
  return null;
}
