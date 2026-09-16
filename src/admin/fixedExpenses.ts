import { addDoc, collection, deleteDoc, doc, limit, onSnapshot, orderBy, query, serverTimestamp, Timestamp, updateDoc } from "firebase/firestore";
import { db } from "../firebase";

export type FixedExpense = { id: string; name: string; amount: number };
export type FixedExpenseHistoryEntry = { id: string; expenseId: string; name: string; amount: number; recordedAt: Date };

const fixedExpensesCollection = collection(db, "fixedExpenses");
const fixedExpenseHistoryCollection = collection(db, "fixedExpenseHistory");

export function subscribeFixedExpenses(onUpdate: (expenses: FixedExpense[]) => void, onError?: (error: unknown) => void): () => void {
  return onSnapshot(
    query(fixedExpensesCollection, orderBy("name")),
    (snapshot) => onUpdate(snapshot.docs.map((docSnap) => ({ id: docSnap.id, name: docSnap.data().name ?? "", amount: docSnap.data().amount ?? 0 }))),
    onError
  );
}

/**
 * Histórico de valores que cada despesa fixa já teve, mais recente primeiro
 * — grava uma linha toda vez que o valor é definido (cadastro novo ou
 * atualização), sempre com a data. É assim que a tela consegue mostrar
 * "mês passado: R$X" sem precisar de nenhuma conta especial: é só achar,
 * pra cada despesa, o registro mais recente com data antes do início do
 * mês atual.
 */
export function subscribeFixedExpenseHistory(onUpdate: (entries: FixedExpenseHistoryEntry[]) => void, onError?: (error: unknown) => void): () => void {
  return onSnapshot(
    query(fixedExpenseHistoryCollection, orderBy("recordedAt", "desc"), limit(500)),
    (snapshot) => onUpdate(snapshot.docs.map((docSnap) => {
      const data = docSnap.data();
      const recordedAt = data.recordedAt instanceof Timestamp ? data.recordedAt.toDate() : new Date();
      return { id: docSnap.id, expenseId: data.expenseId ?? "", name: data.name ?? "", amount: data.amount ?? 0, recordedAt };
    })),
    onError
  );
}

export async function addFixedExpense(name: string, amount: number): Promise<void> {
  const ref = await addDoc(fixedExpensesCollection, { name, amount });
  await addDoc(fixedExpenseHistoryCollection, { expenseId: ref.id, name, amount, recordedAt: serverTimestamp() });
}

export async function updateFixedExpense(id: string, name: string, amount: number): Promise<void> {
  await updateDoc(doc(db, "fixedExpenses", id), { name, amount });
  await addDoc(fixedExpenseHistoryCollection, { expenseId: id, name, amount, recordedAt: serverTimestamp() });
}

export async function deleteFixedExpense(id: string): Promise<void> {
  await deleteDoc(doc(db, "fixedExpenses", id));
}
