import type { OrderLineItem } from "../orders";
import type { Recipes } from "./recipes";

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

export type ItemConsumption = { itemId: string; consumption: { ingredientId: string; quantity: number }[] };
export type IngredientUsage = { consumptions: ItemConsumption[]; missingItemIds: string[] };

/** Calcula, item por item, quanto de cada ingrediente ele consome pela ficha técnica. Item sem ficha técnica entra em missingItemIds e não gera consumo nenhum. */
export function computeIngredientUsage(items: OrderLineItem[], recipes: Recipes): IngredientUsage {
  const consumptions: ItemConsumption[] = [];
  const missingItemIds: string[] = [];
  items.forEach((item) => {
    const recipeItemId = resolveRecipeItemId(item.id);
    const recipe = recipes[recipeItemId];
    if (!recipe || recipe.length === 0) { missingItemIds.push(recipeItemId); return; }
    consumptions.push({ itemId: recipeItemId, consumption: recipe.map(({ ingredientId, quantity }) => ({ ingredientId, quantity: quantity * item.quantity })) });
  });
  return { consumptions, missingItemIds };
}

/** Soma o consumo por item num total por ingrediente — usado pra saber quanto descontar de cada ingrediente no estoque. */
export function totalUsageByIngredient(consumptions: ItemConsumption[]): Record<string, number> {
  const usage: Record<string, number> = {};
  consumptions.forEach(({ consumption }) => consumption.forEach(({ ingredientId, quantity }) => { usage[ingredientId] = (usage[ingredientId] ?? 0) + quantity; }));
  return usage;
}
