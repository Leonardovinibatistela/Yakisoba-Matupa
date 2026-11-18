import { doc, onSnapshot, setDoc } from "firebase/firestore";
import { db } from "./firebase";
import { DEFAULT_CHECKOUT_EXTRAS, parseCheckoutExtras, serializeCheckoutExtras, type CheckoutExtra } from "./checkoutExtras";

// A lista de adicionais do fechamento fica num campo de TEXTO (checkoutExtrasJson) do mesmo documento público dos itens excluídos
// (menuStatus/hiddenItems): ele já é de leitura pública e só o admin escreve, então não precisa mexer nas regras do Firebase.
// Só tem nome e preço dos adicionais — nenhum dado de cliente.
const checkoutExtrasRef = doc(db, "menuStatus", "hiddenItems");

/** Chama onUpdate com a lista atual (a lista padrão se a equipe nunca salvou uma, ou se o texto estiver estragado) toda vez que ela mudar. */
export function subscribeCheckoutExtras(onUpdate: (extras: CheckoutExtra[]) => void, onError?: (error: unknown) => void): () => void {
  return onSnapshot(
    checkoutExtrasRef,
    (snap) => onUpdate(parseCheckoutExtras(snap.exists() ? snap.data().checkoutExtrasJson : undefined) ?? DEFAULT_CHECKOUT_EXTRAS),
    (error) => { onUpdate(DEFAULT_CHECKOUT_EXTRAS); onError?.(error); },
  );
}

/** Só o painel (admin) chama isso. Merge: não mexe nos outros campos do documento (itens excluídos, ordem, seções, mais pedidos). */
export async function saveCheckoutExtras(extras: CheckoutExtra[]): Promise<void> {
  await setDoc(checkoutExtrasRef, { checkoutExtrasJson: serializeCheckoutExtras(extras) }, { merge: true });
}
