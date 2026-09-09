import { deleteField, doc, onSnapshot, setDoc } from "firebase/firestore";
import { db } from "./firebase";

// Mesma ideia do nameOverrides.ts: um único documento guarda todas as
// descrições alteradas manualmente pelo admin, num mapa { idDoItem: texto }.
// Item sem entrada aqui usa a descrição padrão que já vem no código (ou a
// que o admin deu quando criou o item pelo painel).
const descriptionOverridesRef = doc(db, "menuStatus", "descriptionOverrides");

export function subscribeDescriptionOverrides(onUpdate: (descriptions: Record<string, string>) => void, onError?: (error: unknown) => void): () => void {
  return onSnapshot(
    descriptionOverridesRef,
    (snap) => onUpdate(snap.exists() ? ((snap.data().descriptions as Record<string, string>) ?? {}) : {}),
    onError
  );
}

/** Define uma descrição nova pra um item. Só o admin autenticado pode chamar isso. */
export async function setItemDescription(itemId: string, description: string): Promise<void> {
  // Objeto aninhado, não chave com ponto — setDoc com merge não entende
  // ponto no nome do campo como caminho aninhado (só o updateDoc entende).
  await setDoc(descriptionOverridesRef, { descriptions: { [itemId]: description } }, { merge: true });
}

/** Volta o item pra descrição padrão (remove o ajuste manual). */
export async function clearItemDescription(itemId: string): Promise<void> {
  await setDoc(descriptionOverridesRef, { descriptions: { [itemId]: deleteField() } }, { merge: true });
}
