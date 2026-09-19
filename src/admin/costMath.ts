// Só contas de custo médio — nada de Firebase aqui, pra dar pra testar sozinho.

/**
 * Novo custo médio por unidade depois de somar uma compra ao estoque existente — média ponderada simples (sem FIFO/lote).
 *
 * Estoque de custo desconhecido (currentAvgCost 0: contagem manual feita antes
 * da primeira compra) NÃO entra na média — senão a primeira compra "dilui"
 * pra baixo: 10 un contadas + compra de 2 un a R$ 3 daria R$ 0,50 em vez de R$ 3.
 * Esse estoque passa a valer o preço da primeira compra registrada.
 */
export function computeWeightedAvgCost(currentStock: number, currentAvgCost: number, purchaseQty: number, purchaseUnitCost: number): number {
  if (currentAvgCost <= 0 || currentStock <= 0) return purchaseUnitCost;
  const totalStock = currentStock + purchaseQty;
  if (totalStock <= 0) return purchaseUnitCost;
  return (currentStock * currentAvgCost + purchaseQty * purchaseUnitCost) / totalStock;
}

/** true se o preço unitário digitado numa compra estiver bem fora do custo médio atual (mais de 3x maior ou menor) — usado só pra confirmar com o admin, nunca bloqueia. */
export function isPurchasePriceUnusual(newUnitCost: number, currentAvgCost: number): boolean {
  if (currentAvgCost <= 0) return false;
  return newUnitCost > currentAvgCost * 3 || newUnitCost < currentAvgCost / 3;
}

/** Custo médio recalculado do ZERO a partir de uma lista de compras — usado ao editar/apagar uma compra, pra nunca ficar em cima de um valor que já sabemos estar errado. */
export function computeAvgCostFromPurchases(purchases: { quantity: number; totalCost: number }[]): number {
  const totalQuantity = purchases.reduce((sum, purchase) => sum + purchase.quantity, 0);
  if (totalQuantity <= 0) return 0;
  const totalCost = purchases.reduce((sum, purchase) => sum + purchase.totalCost, 0);
  return totalCost / totalQuantity;
}
