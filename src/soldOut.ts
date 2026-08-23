import { arrayRemove, arrayUnion, doc, onSnapshot, setDoc } from "firebase/firestore";
import { db } from "./firebase";

// Um único documento guarda a lista de IDs de itens esgotados no momento.
// Simples de bastar: o cardápio inteiro cabe tranquilo num array só, e assim
// dá pra escutar em tempo real com um único listener (sem precisar de uma
// coleção com um documento por item).
const soldOutRef = doc(db, "menuStatus", "soldOut");

/**
 * Escuta a lista de itens esgotados em tempo real — tanto o site público
 * quanto o painel admin usam essa mesma função, então uma mudança feita no
 * admin já aparece pro cliente sem precisar recarregar a página.
 */
export function subscribeSoldOutItems(onUpdate: (ids: Set<string>) => void, onError?: (error: unknown) => void): () => void {
  return onSnapshot(
    soldOutRef,
    (snap) => onUpdate(new Set<string>(snap.exists() ? ((snap.data().itemIds as string[]) ?? []) : [])),
    onError
  );
}

/** Marca ou desmarca um item como esgotado. Só o admin autenticado pode chamar isso. */
export async function setItemSoldOut(itemId: string, soldOut: boolean): Promise<void> {
  await setDoc(soldOutRef, { itemIds: soldOut ? arrayUnion(itemId) : arrayRemove(itemId) }, { merge: true });
}
