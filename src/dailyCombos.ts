import { addDoc, collection, deleteDoc, doc, onSnapshot, orderBy, query, serverTimestamp, updateDoc } from "firebase/firestore";
import { db } from "./firebase";

// Combos da "Promoção do dia" — o próprio admin escolhe em quais dias da
// semana cada combo aparece, o texto e a foto, tudo pelo painel. Substitui a
// lista fixa que existia antes em menuData.ts.
export type DailyCombo = {
  id: string;
  name: string;
  description?: string;
  price: number;
  priceLabel: string;
  image?: string;
  days: number[]; // 0 = domingo ... 6 = sábado (Date.getDay())
};

const formatPrice = (value: number) => value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

// Nome de cada dia da semana (Date.getDay(): 0 = domingo ... 6 = sábado) e um
// texto tipo "Terça-feira e Quarta-feira" a partir de uma lista de dias —
// usado tanto no site (badge "Vale hoje") quanto no painel admin.
export const WEEKDAYS: { value: number; short: string; label: string }[] = [
  { value: 1, short: "Seg", label: "Segunda-feira" },
  { value: 2, short: "Ter", label: "Terça-feira" },
  { value: 3, short: "Qua", label: "Quarta-feira" },
  { value: 4, short: "Qui", label: "Quinta-feira" },
  { value: 5, short: "Sex", label: "Sexta-feira" },
  { value: 6, short: "Sáb", label: "Sábado" },
  { value: 0, short: "Dom", label: "Domingo" },
];
const WEEKDAY_LABEL_BY_VALUE = new Map(WEEKDAYS.map((day) => [day.value, day.label]));

export function formatDaysLabel(days: number[]): string {
  const sorted = [...days].sort((a, b) => (a === 0 ? 7 : a) - (b === 0 ? 7 : b));
  const names = sorted.map((day) => WEEKDAY_LABEL_BY_VALUE.get(day) ?? "").filter(Boolean);
  if (names.length === 0) return "Nenhum dia selecionado";
  if (names.length === 1) return names[0];
  return `${names.slice(0, -1).join(", ")} e ${names[names.length - 1]}`;
}

const dailyCombosCollectionRef = collection(db, "dailyCombos");

export function subscribeDailyCombos(onUpdate: (combos: DailyCombo[]) => void, onError?: (error: unknown) => void): () => void {
  return onSnapshot(
    query(dailyCombosCollectionRef, orderBy("createdAt", "asc")),
    (snapshot) => onUpdate(snapshot.docs.map((docSnap) => {
      const data = docSnap.data();
      const price = Number(data.price) || 0;
      return {
        id: docSnap.id,
        name: data.name as string,
        description: (data.description as string | undefined) || undefined,
        price,
        priceLabel: formatPrice(price),
        image: (data.image as string | undefined) || undefined,
        days: (data.days as number[]) ?? [],
      };
    })),
    onError
  );
}

export async function addDailyCombo(input: { name: string; description?: string; price: number; image?: string; days: number[] }): Promise<void> {
  await addDoc(dailyCombosCollectionRef, {
    name: input.name,
    description: input.description ?? "",
    price: input.price,
    image: input.image ?? "",
    days: input.days,
    createdAt: serverTimestamp(),
  });
}

export async function updateDailyCombo(id: string, input: { name?: string; description?: string; price?: number; image?: string; days?: number[] }): Promise<void> {
  await updateDoc(doc(db, "dailyCombos", id), { ...input });
}

export async function removeDailyCombo(id: string): Promise<void> {
  await deleteDoc(doc(db, "dailyCombos", id));
}

// Combos que já existiam fixos no código antes dessa função existir — usados
// só pra "importar" de uma vez no primeiro uso do painel, caso a lista no
// Firestore esteja vazia (ver botão "Importar combos atuais" no admin).
export const DEFAULT_DAILY_COMBOS: { name: string; description: string; price: number; image: string; days: number[] }[] = [
  { name: "Combo Individual", description: "1 Yakisoba Médio, 1 porção de Hot Roll, 1 Coca-Cola lata", price: 65.9, image: "cardapio/combo-individual.jpg", days: [1] },
  { name: "Combo Filadélfia", description: "1 Uramaki Filadélfia, 1 Hot Roll Filadélfia, 1 Coca-Cola lata", price: 67.9, image: "cardapio/combo-filadelfia.jpg", days: [2, 3] },
  { name: "Combo Duplo", description: "2 Yakisobas Médios + 1 Coca-Cola 1,5L", price: 76.9, image: "cardapio/combo-duplo.jpg", days: [3, 4] },
  { name: "Combo Família", description: "1 Yakisoba Grande + 1 Yakisoba Médio + 1 Porção de Hot Roll + 1 Coca-Cola 1,5L", price: 118.9, image: "cardapio/combo-familia.jpg", days: [5, 6, 0] },
];
