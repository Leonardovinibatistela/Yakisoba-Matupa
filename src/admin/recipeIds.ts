// Mesmos separadores usados no carrinho do site público (src/App.tsx) pra
// formar o id de acompanhamento ("parentId::addonId") e de unidade extra de
// yaki ("baseId#sufixo"). Duplicado aqui de propósito — App.tsx não exporta
// essas constantes, e o admin não deveria depender do código do site público.
const ADDON_SEPARATOR = "::";
const INSTANCE_SEPARATOR = "#";

/**
 * Acha o id real do prato (ou do acompanhamento) pra buscar na ficha
 * técnica, a partir do id salvo no pedido — que pode ter sufixo de unidade
 * extra de yaki e/ou de acompanhamento junto.
 * Exemplos: "medio-frango" -> "medio-frango" (direto);
 * "medio-frango#abc123" -> "medio-frango" (unidade extra de yaki);
 * "medio-frango::brocolis" -> "brocolis" (acompanhamento);
 * "medio-frango#abc123::brocolis" -> "brocolis" (acompanhamento de uma unidade extra).
 */
export function resolveRecipeItemId(rawId: string): string {
  const addonIndex = rawId.indexOf(ADDON_SEPARATOR);
  if (addonIndex !== -1) return rawId.slice(addonIndex + ADDON_SEPARATOR.length);
  const instanceIndex = rawId.indexOf(INSTANCE_SEPARATOR);
  if (instanceIndex !== -1) return rawId.slice(0, instanceIndex);
  return rawId;
}
