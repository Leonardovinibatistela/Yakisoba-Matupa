import { doc, onSnapshot, setDoc } from "firebase/firestore";
import { db } from "./firebase";
import { parseCustomSections, type CustomSection } from "./customSections";

// As seções que o dono criou (ver customSections.ts) ficam no campo "customSectionsJson" do mesmo documento dos itens
// excluídos e da ordem do cardápio (menuStatus/hiddenItems). Motivo: esse documento JÁ é de leitura pública e escrita só do
// admin nas regras do Firebase — o site dos clientes lê as seções sem ninguém precisar mexer nas regras. Os campos
// "itemIds" e "layoutJson" não são tocados aqui (setDoc com merge só troca o campo "customSectionsJson").
const sectionsRef = doc(db, "menuStatus", "hiddenItems");

/** Chama onUpdate com as seções criadas pelo dono ([] se não tem nenhuma ou se o texto salvo estiver estragado). */
export function subscribeCustomSections(onUpdate: (sections: CustomSection[]) => void, onError?: (error: unknown) => void): () => void {
  return onSnapshot(sectionsRef, (snap) => onUpdate(snap.exists() ? parseCustomSections(snap.data().customSectionsJson) : []), onError);
}

export async function saveCustomSections(sections: CustomSection[]): Promise<void> {
  await setDoc(sectionsRef, { customSectionsJson: JSON.stringify(sections) }, { merge: true });
}
