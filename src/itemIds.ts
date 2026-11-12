// Ids do carrinho/pedido: o id de uma LINHA pode ter sufixos ("medio-frango#abc123" = uma unidade extra de yaki;
// "medio-frango::brocolis" = acompanhamento). Aqui sai o id do item do cardápio.

export function baseItemId(lineId: string): { id: string; isAddon: boolean } {
  const addon = lineId.indexOf("::");
  if (addon !== -1) return { id: lineId.slice(addon + 2), isAddon: true };
  const instance = lineId.indexOf("#");
  return { id: instance !== -1 ? lineId.slice(0, instance) : lineId, isAddon: false };
}
