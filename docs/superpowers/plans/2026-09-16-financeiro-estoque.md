# Financeiro + Estoque de ingredientes — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Dar ao admin do Sooba Yakisoba um controle real de lucro: estoque de ingredientes com custo médio, ficha técnica por prato, baixa automática de estoque por pedido, despesas fixas, e uma aba "Financeiro" com bruto/custo/lucro líquido e ranking de margem por prato.

**Architecture:** Segue o mesmo padrão já usado no projeto (React 18 + TypeScript + Firestore, um arquivo `.ts` por domínio de dados em `src/admin/`, componentes de UI separados consumidos por `AdminApp.tsx`). Todo o estoque descontado por pedido roda dentro de uma transação Firestore, disparada reativamente quando o admin detecta um pedido novo — mesmo gatilho que já dispara o som e a impressão automática hoje.

**Tech Stack:** React 18, TypeScript, Firebase Firestore (client SDK, `runTransaction`), Tailwind v4. Sem framework de testes automatizado neste projeto — verificação é feita por `npx tsc --noEmit`, `npm run build`, scripts Node avulsos (`node --input-type=module`) pra checar funções puras isoladas, e checklist manual de fumaça no fim (login real não é acessível ao agente, então a verificação ao vivo fica documentada como passo pro humano rodar).

**Spec:** [docs/superpowers/specs/2026-09-16-financeiro-estoque-design.md](../specs/2026-09-16-financeiro-estoque-design.md)

## Global Constraints

- Escritas com `setDoc(...,{merge:true})` em campo do tipo `{ [chave]: valor }` DEVEM usar objeto aninhado de verdade (`{ mapa: { [chave]: valor } }`), nunca chave com ponto literal (`"mapa.chave"`) — bug já visto e corrigido nesse projeto (ver `src/priceOverrides.ts`).
- Custo de ingrediente usa **média ponderada simples** (sem FIFO/lote).
- Aviso de preço de compra fora do normal (>3x ou <1/3 do custo médio atual) **não bloqueia** o salvamento, só confirma.
- `order.ingredientCost` é gravado no momento da baixa de estoque e nunca recalculado depois (relatório de mês passado não deve mudar se o custo do ingrediente mudar hoje).
- Gasto fixo só entra no card de **Mês** (não em Hoje/Semana).
- Item de pedido sem ficha técnica cadastrada nunca conta como custo R$0 silenciosamente — sempre sinalizado. O mesmo vale pra item COM ficha técnica mas com algum ingrediente sem custo real (nunca comprado, ou apagado): nunca é tratado como custo R$0 sem aviso.
- `deductStockForOrder` lê as receitas (`menuStatus/recipes`) direto do Firestore **dentro da própria transação** — nunca recebe receitas como parâmetro vindo do estado do React (evita corrida entre a assinatura de pedidos e a de receitas no carregamento do painel).
- Editar/apagar uma compra (`ingredientPurchases`) recalcula `avgCost` do zero a partir do histórico que sobrou — nunca em cima do valor errado.
- Qualquer mudança em `firestore.rules` é só editada localmente pelo agente — quem publica no Firebase Console é sempre o humano (regra permanente deste projeto).
- Nomes de arquivo/commit em português, seguindo o padrão já usado no resto do projeto.

---

## Task 1: `src/admin/ingredients.ts` — dados de ingredientes e compras

**Files:**
- Create: `src/admin/ingredients.ts`
- Modify: `firestore.rules` (adiciona regras de `ingredients` e `ingredientPurchases`)

**Interfaces:**
- Produces: `type IngredientUnit = "kg" | "l" | "un"`; `type Ingredient = { id: string; name: string; unit: IngredientUnit; stock: number; avgCost: number }`; `type IngredientPurchase = { id: string; ingredientId: string; quantity: number; totalCost: number; createdAt: Date }`; `computeWeightedAvgCost(currentStock: number, currentAvgCost: number, purchaseQty: number, purchaseUnitCost: number): number`; `computeAvgCostFromPurchases(purchases: { quantity: number; totalCost: number }[]): number`; `isPurchasePriceUnusual(newUnitCost: number, currentAvgCost: number): boolean`; `subscribeIngredients(onUpdate: (ingredients: Ingredient[]) => void, onError?: (error: unknown) => void): () => void`; `subscribeIngredientPurchases(onUpdate: (purchases: IngredientPurchase[]) => void, onError?: (error: unknown) => void): () => void`; `addIngredient(name: string, unit: IngredientUnit): Promise<void>`; `registerPurchase(ingredientId: string, quantity: number, totalCost: number): Promise<void>`; `adjustStock(ingredientId: string, newStock: number): Promise<void>`; `editPurchase(purchase: IngredientPurchase, newQuantity: number, newTotalCost: number): Promise<void>`; `deletePurchase(purchase: IngredientPurchase): Promise<void>`.

- [ ] **Step 1: Escrever o arquivo `src/admin/ingredients.ts`**

```ts
import { addDoc, collection, doc, getDocs, onSnapshot, orderBy, query, runTransaction, serverTimestamp, Timestamp, updateDoc, where } from "firebase/firestore";
import { db } from "../firebase";

export type IngredientUnit = "kg" | "l" | "un";
export type Ingredient = { id: string; name: string; unit: IngredientUnit; stock: number; avgCost: number };
export type IngredientPurchase = { id: string; ingredientId: string; quantity: number; totalCost: number; createdAt: Date };

/** Novo custo médio por unidade depois de somar uma compra ao estoque existente — média ponderada simples (sem FIFO/lote). */
export function computeWeightedAvgCost(currentStock: number, currentAvgCost: number, purchaseQty: number, purchaseUnitCost: number): number {
  const totalStock = currentStock + purchaseQty;
  if (totalStock <= 0) return purchaseUnitCost;
  return (currentStock * currentAvgCost + purchaseQty * purchaseUnitCost) / totalStock;
}

/** true se o preço unitário digitado numa compra estiver bem fora do custo médio atual (mais de 3x maior ou menor) — usado só pra confirmar com o admin, nunca bloqueia. */
export function isPurchasePriceUnusual(newUnitCost: number, currentAvgCost: number): boolean {
  if (currentAvgCost <= 0) return false;
  return newUnitCost > currentAvgCost * 3 || newUnitCost < currentAvgCost / 3;
}

const ingredientsCollection = collection(db, "ingredients");

export function subscribeIngredients(onUpdate: (ingredients: Ingredient[]) => void, onError?: (error: unknown) => void): () => void {
  return onSnapshot(
    query(ingredientsCollection, orderBy("name")),
    (snapshot) => onUpdate(snapshot.docs.map((docSnap) => {
      const data = docSnap.data();
      return { id: docSnap.id, name: data.name ?? "", unit: (data.unit ?? "un") as IngredientUnit, stock: data.stock ?? 0, avgCost: data.avgCost ?? 0 };
    })),
    onError
  );
}

/** Cadastra um ingrediente novo, sem estoque (o estoque entra depois via registerPurchase). */
export async function addIngredient(name: string, unit: IngredientUnit): Promise<void> {
  await addDoc(ingredientsCollection, { name, unit, stock: 0, avgCost: 0 });
}

/** Registra uma compra: soma no estoque, recalcula o custo médio, e grava o histórico da compra. */
export async function registerPurchase(ingredientId: string, quantity: number, totalCost: number): Promise<void> {
  const ingredientRef = doc(db, "ingredients", ingredientId);
  const purchaseRef = doc(collection(db, "ingredientPurchases"));
  const unitCost = totalCost / quantity;
  await runTransaction(db, async (transaction) => {
    const snap = await transaction.get(ingredientRef);
    const data = snap.data() ?? {};
    const currentStock = (data.stock as number) ?? 0;
    const currentAvgCost = (data.avgCost as number) ?? 0;
    const newAvgCost = computeWeightedAvgCost(currentStock, currentAvgCost, quantity, unitCost);
    transaction.update(ingredientRef, { stock: currentStock + quantity, avgCost: newAvgCost });
    transaction.set(purchaseRef, { ingredientId, quantity, totalCost, createdAt: serverTimestamp() });
  });
}

/** Corrige a quantidade em estoque na mão (perda, quebra, gastou mais que o previsto) sem mexer no custo médio. */
export async function adjustStock(ingredientId: string, newStock: number): Promise<void> {
  await updateDoc(doc(db, "ingredients", ingredientId), { stock: newStock });
}

const ingredientPurchasesCollection = collection(db, "ingredientPurchases");

/**
 * Todas as compras já registradas, mais recente primeiro. Usado no
 * Financeiro pra mostrar "quanto foi comprado esse mês" mesmo antes de
 * qualquer ficha técnica existir (visão aproximada, ver spec).
 */
export function subscribeIngredientPurchases(onUpdate: (purchases: IngredientPurchase[]) => void, onError?: (error: unknown) => void): () => void {
  return onSnapshot(
    query(ingredientPurchasesCollection, orderBy("createdAt", "desc")),
    (snapshot) => onUpdate(snapshot.docs.map((docSnap) => {
      const data = docSnap.data();
      const createdAt = data.createdAt instanceof Timestamp ? data.createdAt.toDate() : new Date();
      return { id: docSnap.id, ingredientId: data.ingredientId ?? "", quantity: data.quantity ?? 0, totalCost: data.totalCost ?? 0, createdAt };
    })),
    onError
  );
}

/** Custo médio recalculado do ZERO a partir de uma lista de compras — usado ao editar/apagar uma compra, pra nunca ficar em cima de um valor que já sabemos estar errado. */
export function computeAvgCostFromPurchases(purchases: { quantity: number; totalCost: number }[]): number {
  const totalQuantity = purchases.reduce((sum, purchase) => sum + purchase.quantity, 0);
  if (totalQuantity <= 0) return 0;
  const totalCost = purchases.reduce((sum, purchase) => sum + purchase.totalCost, 0);
  return totalCost / totalQuantity;
}

/** Recalcula avgCost do zero (a partir das compras que sobrarem) e ajusta o estoque pela diferença — usado tanto por editPurchase quanto por deletePurchase. newQuantity/newTotalCost nulos = apagar a compra. */
async function savePurchaseEdit(purchaseId: string, ingredientId: string, oldQuantity: number, newQuantity: number | null, newTotalCost: number | null): Promise<void> {
  const otherPurchasesSnap = await getDocs(query(ingredientPurchasesCollection, where("ingredientId", "==", ingredientId)));
  const otherPurchases = otherPurchasesSnap.docs.filter((docSnap) => docSnap.id !== purchaseId).map((docSnap) => ({ quantity: (docSnap.data().quantity as number) ?? 0, totalCost: (docSnap.data().totalCost as number) ?? 0 }));
  const remainingPurchases = newQuantity !== null && newTotalCost !== null ? [...otherPurchases, { quantity: newQuantity, totalCost: newTotalCost }] : otherPurchases;
  const newAvgCost = computeAvgCostFromPurchases(remainingPurchases);
  const stockDelta = (newQuantity ?? 0) - oldQuantity;
  const ingredientRef = doc(db, "ingredients", ingredientId);
  const purchaseRef = doc(db, "ingredientPurchases", purchaseId);
  await runTransaction(db, async (transaction) => {
    const ingredientSnap = await transaction.get(ingredientRef);
    const currentStock = (ingredientSnap.data()?.stock as number) ?? 0;
    transaction.update(ingredientRef, { stock: currentStock + stockDelta, avgCost: newAvgCost });
    if (newQuantity !== null && newTotalCost !== null) transaction.update(purchaseRef, { quantity: newQuantity, totalCost: newTotalCost });
    else transaction.delete(purchaseRef);
  });
}

/** Corrige uma compra registrada errada (ex.: dígito a mais no valor). Recalcula avgCost do zero a partir do histórico — nunca fica em cima do valor errado. */
export async function editPurchase(purchase: IngredientPurchase, newQuantity: number, newTotalCost: number): Promise<void> {
  await savePurchaseEdit(purchase.id, purchase.ingredientId, purchase.quantity, newQuantity, newTotalCost);
}

/** Apaga uma compra lançada por engano. Devolve o estoque que ela tinha somado e recalcula avgCost do zero com o que sobrou. */
export async function deletePurchase(purchase: IngredientPurchase): Promise<void> {
  await savePurchaseEdit(purchase.id, purchase.ingredientId, purchase.quantity, null, null);
}
```

- [ ] **Step 2: Verificar as funções puras com um script Node avulso**

Crie um arquivo temporário `scratch-ingredients-check.mjs` na raiz do projeto (não faz parte do build, é só pra conferir a lógica antes de integrar):

```js
function computeWeightedAvgCost(currentStock, currentAvgCost, purchaseQty, purchaseUnitCost) {
  const totalStock = currentStock + purchaseQty;
  if (totalStock <= 0) return purchaseUnitCost;
  return (currentStock * currentAvgCost + purchaseQty * purchaseUnitCost) / totalStock;
}
function isPurchasePriceUnusual(newUnitCost, currentAvgCost) {
  if (currentAvgCost <= 0) return false;
  return newUnitCost > currentAvgCost * 3 || newUnitCost < currentAvgCost / 3;
}
function computeAvgCostFromPurchases(purchases) {
  const totalQuantity = purchases.reduce((sum, p) => sum + p.quantity, 0);
  if (totalQuantity <= 0) return 0;
  const totalCost = purchases.reduce((sum, p) => sum + p.totalCost, 0);
  return totalCost / totalQuantity;
}

// Recalculo do zero: duas compras de 10kg a R$20 e 10kg a R$30 -> media R$25 (igual ao teste da media ponderada incremental)
console.assert(computeAvgCostFromPurchases([{ quantity: 10, totalCost: 200 }, { quantity: 10, totalCost: 300 }]) === 25, "recalculo do zero bate com a media ponderada");
// Sem nenhuma compra sobrando (apagou a unica que existia) -> 0, nao quebra dividindo por zero
console.assert(computeAvgCostFromPurchases([]) === 0, "sem compras nao quebra");
// Apagar a compra errada (a de R$5000 num lote de 5kg, deveria ser R$50) faz o custo medio voltar pro valor certo
console.assert(computeAvgCostFromPurchases([{ quantity: 5, totalCost: 50 }]) === 10, "apagar compra errada recalcula certo");

// Primeira compra: sem histórico, custo médio vira o próprio preço pago
console.assert(computeWeightedAvgCost(0, 0, 10, 20) === 20, "primeira compra");
// Segunda compra: média ponderada entre 10kg a R$20 e 10kg a R$30 -> R$25
console.assert(computeWeightedAvgCost(10, 20, 10, 30) === 25, "media ponderada");
// Sem custo médio anterior (ingrediente novo), nunca é "estranho"
console.assert(isPurchasePriceUnusual(999, 0) === false, "sem historico nao avisa");
// Preço 4x mais caro que a média -> estranho
console.assert(isPurchasePriceUnusual(80, 20) === true, "preco muito alto avisa");
// Preço 2x mais caro (dentro da faixa de 3x) -> normal
console.assert(isPurchasePriceUnusual(40, 20) === false, "preco 2x nao avisa");

console.log("ingredients.ts: todas as checagens passaram");
```

Run: `node scratch-ingredients-check.mjs`
Expected: `ingredients.ts: todas as checagens passaram` sem nenhum erro de assert.

(`editPurchase`/`deletePurchase`/`subscribeIngredientPurchases` não entram nesse script — dependem do Firestore de verdade, ficam pro checklist manual do Task 13.)

- [ ] **Step 3: Apagar o script avulso**

```bash
rm scratch-ingredients-check.mjs
```

- [ ] **Step 4: Adicionar as regras do Firestore pra `ingredients` e `ingredientPurchases`**

Em `firestore.rules`, adicione (antes do `match /{document=**}` final, igual aos outros blocos):

```
    // Ingredientes (estoque + custo médio) e histórico de compras — só o
    // admin autenticado lê e escreve, o site público nunca acessa isso.
    match /ingredients/{ingredientId} {
      allow read, write: if request.auth != null;
    }
    match /ingredientPurchases/{purchaseId} {
      allow read, write: if request.auth != null;
    }
```

**Não publique essa regra no Firebase Console você mesmo** — isso fica pro humano fazer (regra permanente deste projeto).

- [ ] **Step 5: Checar tipos**

Run: `npx tsc --noEmit`
Expected: sem erros.

- [ ] **Step 6: Commit**

```bash
git add src/admin/ingredients.ts firestore.rules
git commit -m "Adiciona dados de ingredientes: estoque, custo medio, compras e correcao de compra"
```

---

## Task 2: `src/admin/recipes.ts` — ficha técnica por prato

**Files:**
- Create: `src/admin/recipes.ts`

**Interfaces:**
- Consumes: nenhuma (arquivo independente).
- Produces: `type RecipeIngredient = { ingredientId: string; quantity: number }`; `type Recipes = Record<string, RecipeIngredient[]>`; `subscribeRecipes(onUpdate: (recipes: Recipes) => void, onError?: (error: unknown) => void): () => void`; `setRecipe(itemId: string, ingredients: RecipeIngredient[]): Promise<void>`.

- [ ] **Step 1: Escrever o arquivo `src/admin/recipes.ts`**

Segue exatamente o padrão de `src/nameOverrides.ts` (documento único, mapa aninhado por id de item — nunca chave com ponto).

```ts
import { doc, onSnapshot, setDoc } from "firebase/firestore";
import { db } from "../firebase";

export type RecipeIngredient = { ingredientId: string; quantity: number };
export type Recipes = Record<string, RecipeIngredient[]>;

// Um único documento guarda a ficha técnica de todos os pratos, num mapa
// { idDoItem: [{ingredientId, quantity}] }. Item sem entrada aqui ainda não
// teve a ficha técnica cadastrada.
const recipesRef = doc(db, "menuStatus", "recipes");

export function subscribeRecipes(onUpdate: (recipes: Recipes) => void, onError?: (error: unknown) => void): () => void {
  return onSnapshot(
    recipesRef,
    (snap) => onUpdate(snap.exists() ? ((snap.data().recipes as Recipes) ?? {}) : {}),
    onError
  );
}

/** Define (ou substitui) a ficha técnica de um prato. Só o admin autenticado pode chamar isso. */
export async function setRecipe(itemId: string, ingredients: RecipeIngredient[]): Promise<void> {
  // Objeto aninhado, não chave com ponto — mesmo motivo do nameOverrides.ts.
  await setDoc(recipesRef, { recipes: { [itemId]: ingredients } }, { merge: true });
}
```

- [ ] **Step 2: Checar tipos**

Run: `npx tsc --noEmit`
Expected: sem erros.

- [ ] **Step 3: Commit**

```bash
git add src/admin/recipes.ts
git commit -m "Adiciona dados de ficha tecnica (receita) por prato"
```

(Nenhuma regra nova no `firestore.rules` — `menuStatus/{document}` já cobre esse documento.)

---

## Task 3: `src/admin/fixedExpenses.ts` + `src/admin/paymentFees.ts` — despesas fixas e taxa de pagamento

**Files:**
- Create: `src/admin/fixedExpenses.ts`
- Create: `src/admin/paymentFees.ts`
- Modify: `firestore.rules` (adiciona regra de `fixedExpenses`)

**Interfaces:**
- Produces (`fixedExpenses.ts`): `type FixedExpense = { id: string; name: string; amount: number }`; `subscribeFixedExpenses(onUpdate: (expenses: FixedExpense[]) => void, onError?: (error: unknown) => void): () => void`; `addFixedExpense(name: string, amount: number): Promise<void>`; `updateFixedExpense(id: string, name: string, amount: number): Promise<void>`; `deleteFixedExpense(id: string): Promise<void>`.
- Produces (`paymentFees.ts`): `type PaymentMethod = "pix" | "cartao" | "dinheiro"`; `type PaymentFeeRates = Record<PaymentMethod, number>` (fração, ex.: `0.035` = 3,5%); `subscribePaymentFeeRates(onUpdate: (rates: PaymentFeeRates) => void, onError?: (error: unknown) => void): () => void`; `setPaymentFeeRates(rates: PaymentFeeRates): Promise<void>`.

- [ ] **Step 1: Escrever o arquivo `src/admin/fixedExpenses.ts`**

```ts
import { addDoc, collection, deleteDoc, doc, onSnapshot, orderBy, query, updateDoc } from "firebase/firestore";
import { db } from "../firebase";

export type FixedExpense = { id: string; name: string; amount: number };

const fixedExpensesCollection = collection(db, "fixedExpenses");

export function subscribeFixedExpenses(onUpdate: (expenses: FixedExpense[]) => void, onError?: (error: unknown) => void): () => void {
  return onSnapshot(
    query(fixedExpensesCollection, orderBy("name")),
    (snapshot) => onUpdate(snapshot.docs.map((docSnap) => ({ id: docSnap.id, name: docSnap.data().name ?? "", amount: docSnap.data().amount ?? 0 }))),
    onError
  );
}

export async function addFixedExpense(name: string, amount: number): Promise<void> {
  await addDoc(fixedExpensesCollection, { name, amount });
}

export async function updateFixedExpense(id: string, name: string, amount: number): Promise<void> {
  await updateDoc(doc(db, "fixedExpenses", id), { name, amount });
}

export async function deleteFixedExpense(id: string): Promise<void> {
  await deleteDoc(doc(db, "fixedExpenses", id));
}
```

- [ ] **Step 2: Escrever o arquivo `src/admin/paymentFees.ts`**

Segue o mesmo padrão de `src/recipes.ts` (documento único, com valor default quando ainda não foi configurado).

```ts
import { doc, onSnapshot, setDoc } from "firebase/firestore";
import { db } from "../firebase";

export type PaymentMethod = "pix" | "cartao" | "dinheiro";
export type PaymentFeeRates = Record<PaymentMethod, number>;

const DEFAULT_RATES: PaymentFeeRates = { pix: 0, cartao: 0, dinheiro: 0 };
const paymentFeesRef = doc(db, "menuStatus", "paymentFees");

export function subscribePaymentFeeRates(onUpdate: (rates: PaymentFeeRates) => void, onError?: (error: unknown) => void): () => void {
  return onSnapshot(
    paymentFeesRef,
    (snap) => onUpdate(snap.exists() ? { ...DEFAULT_RATES, ...(snap.data().rates as Partial<PaymentFeeRates>) } : DEFAULT_RATES),
    onError
  );
}

export async function setPaymentFeeRates(rates: PaymentFeeRates): Promise<void> {
  await setDoc(paymentFeesRef, { rates });
}
```

(Sem regra nova no `firestore.rules` — `menuStatus/{document}` já cobre esse documento, igual `menuStatus/recipes`.)

- [ ] **Step 3: Adicionar a regra do Firestore pra `fixedExpenses`**

Em `firestore.rules` (mesmo bloco de antes):

```
    match /fixedExpenses/{expenseId} {
      allow read, write: if request.auth != null;
    }
```

**Não publique essa regra você mesmo** — mesma observação do Task 1.

- [ ] **Step 4: Checar tipos**

Run: `npx tsc --noEmit`
Expected: sem erros.

- [ ] **Step 5: Commit**

```bash
git add src/admin/fixedExpenses.ts src/admin/paymentFees.ts firestore.rules
git commit -m "Adiciona dados de despesas fixas e taxa de pagamento por forma"
```

---

## Task 4: `src/admin/stockDeduction.ts` (parte 1) — cálculo puro de consumo de ingrediente

**Files:**
- Create: `src/admin/stockDeduction.ts`

**Interfaces:**
- Consumes: `OrderLineItem` de `../orders` (campos `id: string; quantity: number`); `Recipes` de `./recipes`.
- Produces: `type ItemConsumption = { itemId: string; consumption: { ingredientId: string; quantity: number }[] }`; `type IngredientUsage = { consumptions: ItemConsumption[]; missingItemIds: string[] }`; `resolveRecipeItemId(rawId: string): string`; `computeIngredientUsage(items: OrderLineItem[], recipes: Recipes): IngredientUsage`; `totalUsageByIngredient(consumptions: ItemConsumption[]): Record<string, number>`.

Nota: o retorno guarda o consumo **por item** (não só o total por ingrediente) de propósito — o Task 5 precisa saber, depois de olhar quais ingredientes têm custo confiável, **quais itens especificamente** ficam com custo incompleto (não dá pra saber isso só com o total agregado).

- [ ] **Step 1: Escrever a parte pura do arquivo `src/admin/stockDeduction.ts`**

```ts
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
```

- [ ] **Step 2: Verificar com um script Node avulso**

Crie `scratch-stock-deduction-check.mjs` na raiz do projeto:

```js
const ADDON_SEPARATOR = "::";
const INSTANCE_SEPARATOR = "#";
function resolveRecipeItemId(rawId) {
  const addonIndex = rawId.indexOf(ADDON_SEPARATOR);
  if (addonIndex !== -1) return rawId.slice(addonIndex + ADDON_SEPARATOR.length);
  const instanceIndex = rawId.indexOf(INSTANCE_SEPARATOR);
  if (instanceIndex !== -1) return rawId.slice(0, instanceIndex);
  return rawId;
}
function computeIngredientUsage(items, recipes) {
  const consumptions = [];
  const missingItemIds = [];
  items.forEach((item) => {
    const recipeItemId = resolveRecipeItemId(item.id);
    const recipe = recipes[recipeItemId];
    if (!recipe || recipe.length === 0) { missingItemIds.push(recipeItemId); return; }
    consumptions.push({ itemId: recipeItemId, consumption: recipe.map(({ ingredientId, quantity }) => ({ ingredientId, quantity: quantity * item.quantity })) });
  });
  return { consumptions, missingItemIds };
}
function totalUsageByIngredient(consumptions) {
  const usage = {};
  consumptions.forEach(({ consumption }) => consumption.forEach(({ ingredientId, quantity }) => { usage[ingredientId] = (usage[ingredientId] ?? 0) + quantity; }));
  return usage;
}

console.assert(resolveRecipeItemId("medio-frango") === "medio-frango", "id direto");
console.assert(resolveRecipeItemId("medio-frango#abc123") === "medio-frango", "unidade extra de yaki");
console.assert(resolveRecipeItemId("medio-frango::brocolis") === "brocolis", "acompanhamento");
console.assert(resolveRecipeItemId("medio-frango#abc123::brocolis") === "brocolis", "acompanhamento de unidade extra");

const recipes = { "medio-frango": [{ ingredientId: "frango", quantity: 0.5 }, { ingredientId: "macarrao", quantity: 0.3 }], "brocolis": [{ ingredientId: "brocolis", quantity: 0.1 }] };
const items = [
  { id: "medio-frango#a1", name: "Frango 500g", quantity: 2, unitPrice: 33.9, lineTotal: 67.8 },
  { id: "medio-frango#a1::brocolis", name: "Brócolis", quantity: 1, unitPrice: 5, lineTotal: 5, parentId: "medio-frango#a1" },
  { id: "sem-ficha-tecnica", name: "Item sem receita", quantity: 1, unitPrice: 10, lineTotal: 10 },
];
const result = computeIngredientUsage(items, recipes);
console.assert(result.consumptions.length === 2, `deveria ter 2 itens com consumo, veio ${result.consumptions.length}`);
console.assert(result.missingItemIds.length === 1 && result.missingItemIds[0] === "sem-ficha-tecnica", "item sem ficha tecnica deveria estar em missingItemIds");
const usage = totalUsageByIngredient(result.consumptions);
console.assert(usage.frango === 1, `frango deveria ser 1, veio ${usage.frango}`);
console.assert(usage.macarrao === 0.6, `macarrao deveria ser 0.6, veio ${usage.macarrao}`);
console.assert(usage.brocolis === 0.1, `brocolis deveria ser 0.1, veio ${usage.brocolis}`);
// O item "medio-frango#a1" (resolvido pra "medio-frango") tem que aparecer nos consumptions, pra o Task 5 saber marcar ele como incompleto se o ingrediente "frango" nao tiver custo cadastrado
console.assert(result.consumptions.some((c) => c.itemId === "medio-frango"), "medio-frango deveria estar nos consumptions");

console.log("stockDeduction.ts (parte pura): todas as checagens passaram");
```

Run: `node scratch-stock-deduction-check.mjs`
Expected: `stockDeduction.ts (parte pura): todas as checagens passaram` sem nenhum erro de assert.

- [ ] **Step 3: Apagar o script avulso**

```bash
rm scratch-stock-deduction-check.mjs
```

- [ ] **Step 4: Checar tipos**

Run: `npx tsc --noEmit`
Expected: sem erros.

- [ ] **Step 5: Commit**

```bash
git add src/admin/stockDeduction.ts
git commit -m "Adiciona calculo puro de consumo de ingrediente por pedido, item por item"
```

---

## Task 5: `src/admin/stockDeduction.ts` (parte 2) — baixa e devolução transacional de estoque

**Files:**
- Modify: `src/admin/stockDeduction.ts` (acrescenta ao arquivo do Task 4)

**Interfaces:**
- Consumes: `db` de `../firebase`; a coleção `orders` (campos `items`, `stockDeducted`), `menuStatus/recipes` e `ingredients` (campos `stock`, `avgCost`) já existentes.
- Produces: `deductStockForOrder(orderId: string): Promise<void>`; `restoreStockForOrder(orderId: string): Promise<void>`.

Repare que `deductStockForOrder` **não recebe `recipes` como parâmetro** — ele lê o documento `menuStatus/recipes` direto do Firestore, dentro da própria transação, do mesmo jeito que já lê os ingredientes. Isso é de propósito: se recebesse `recipes` vindo do estado do React, existiria uma corrida real entre "chegou pedido novo" e "a assinatura de receitas no navegador ainda não tinha carregado" — e como `ingredientCost` nunca é recalculado depois (ver Global Constraints), um erro assim ficaria gravado pra sempre. Lendo direto do banco dentro da transação, esse risco não existe.

- [ ] **Step 1: Acrescentar ao final de `src/admin/stockDeduction.ts`**

```ts
import { doc, runTransaction } from "firebase/firestore";
import { db } from "../firebase";
import type { Recipes } from "./recipes";

/**
 * Desconta do estoque os ingredientes usados por um pedido, e grava no
 * próprio pedido quanto custou (ingredientCost) e exatamente o que foi
 * descontado de cada ingrediente (deductedIngredients — usado depois se o
 * pedido for apagado). Roda dentro de uma transação, então mesmo com o
 * painel aberto em mais de um computador, a baixa acontece só uma vez: a
 * segunda tentativa relê o pedido, vê stockDeducted já true, e não faz nada.
 */
export async function deductStockForOrder(orderId: string): Promise<void> {
  const orderRef = doc(db, "orders", orderId);
  const recipesRef = doc(db, "menuStatus", "recipes");
  await runTransaction(db, async (transaction) => {
    const orderSnap = await transaction.get(orderRef);
    if (!orderSnap.exists()) return;
    const orderData = orderSnap.data();
    if (orderData.stockDeducted) return;

    const recipesSnap = await transaction.get(recipesRef);
    const recipes = (recipesSnap.exists() ? recipesSnap.data().recipes : {}) as Recipes;

    const items = (orderData.items as OrderLineItem[]) ?? [];
    const { consumptions, missingItemIds } = computeIngredientUsage(items, recipes);
    const usage = totalUsageByIngredient(consumptions);
    const ingredientIds = Object.keys(usage);
    const ingredientRefs = ingredientIds.map((id) => doc(db, "ingredients", id));
    const ingredientSnaps = await Promise.all(ingredientRefs.map((ref) => transaction.get(ref)));

    let totalCost = 0;
    const deductedIngredients: { ingredientId: string; quantity: number }[] = [];
    const incompleteCostIngredientIds = new Set<string>();
    ingredientIds.forEach((ingredientId, index) => {
      const snap = ingredientSnaps[index];
      const quantityUsed = usage[ingredientId];
      const data = snap.exists() ? snap.data() : null;
      const avgCost = (data?.avgCost as number) ?? 0;
      // Ingrediente nunca comprado (avgCost 0) ou apagado depois de entrar
      // na ficha técnica (doc não existe mais): a contribuição dele conta
      // como 0 no custo, mas o item fica sinalizado como incompleto — NUNCA
      // é tratado como "esse ingrediente realmente não custa nada".
      if (!snap.exists() || avgCost <= 0) incompleteCostIngredientIds.add(ingredientId);
      totalCost += quantityUsed * avgCost;
      if (snap.exists()) {
        const currentStock = (data!.stock as number) ?? 0;
        transaction.update(ingredientRefs[index], { stock: currentStock - quantityUsed });
        deductedIngredients.push({ ingredientId, quantity: quantityUsed });
      }
    });

    const incompleteCostItemIds = consumptions.filter(({ consumption }) => consumption.some(({ ingredientId }) => incompleteCostIngredientIds.has(ingredientId))).map(({ itemId }) => itemId);

    transaction.update(orderRef, { stockDeducted: true, ingredientCost: totalCost, missingRecipeItemIds: missingItemIds, incompleteCostItemIds, deductedIngredients });
  });
}

/**
 * Devolve ao estoque os ingredientes que um pedido já tinha descontado —
 * chamado antes de apagar um pedido. Se o pedido nunca descontou estoque
 * (stockDeducted false), não faz nada.
 */
export async function restoreStockForOrder(orderId: string): Promise<void> {
  const orderRef = doc(db, "orders", orderId);
  await runTransaction(db, async (transaction) => {
    const orderSnap = await transaction.get(orderRef);
    if (!orderSnap.exists()) return;
    const orderData = orderSnap.data();
    if (!orderData.stockDeducted) return;

    const deductedIngredients = (orderData.deductedIngredients as { ingredientId: string; quantity: number }[]) ?? [];
    const ingredientRefs = deductedIngredients.map((entry) => doc(db, "ingredients", entry.ingredientId));
    const ingredientSnaps = await Promise.all(ingredientRefs.map((ref) => transaction.get(ref)));

    deductedIngredients.forEach((entry, index) => {
      const snap = ingredientSnaps[index];
      if (!snap.exists()) return;
      const currentStock = (snap.data().stock as number) ?? 0;
      transaction.update(ingredientRefs[index], { stock: currentStock + entry.quantity });
    });

    transaction.update(orderRef, { stockDeducted: false });
  });
}
```

Repare que esse `import { doc, runTransaction } from "firebase/firestore";`, `import { db } from "../firebase";` e `import type { Recipes } from "./recipes";` devem ficar junto dos outros imports no topo do arquivo (não duplicar o import), junto com `import type { OrderLineItem } from "../orders";` já escrito no Task 4.

- [ ] **Step 2: Checar tipos**

Run: `npx tsc --noEmit`
Expected: sem erros.

- [ ] **Step 3: Commit**

```bash
git add src/admin/stockDeduction.ts
git commit -m "Adiciona baixa e devolucao transacional de estoque, lendo receita direto do banco pra evitar corrida"
```

(Sem verificação automatizada possível aqui — precisa de um banco Firestore de verdade. A verificação ao vivo fica no checklist manual do Task 13.)

---

## Task 6: `src/admin/adminData.ts` — novos campos no `OrderRecord`

**Files:**
- Modify: `src/admin/adminData.ts`

**Interfaces:**
- Produces: `OrderRecord` ganha `stockDeducted: boolean; ingredientCost: number; missingRecipeItemIds: string[]; incompleteCostItemIds: string[]; deductedIngredients: { ingredientId: string; quantity: number }[]`.

- [ ] **Step 1: Adicionar os campos ao tipo `OrderRecord`**

Em `src/admin/adminData.ts`, no tipo `OrderRecord` (linha ~5-14), acrescente depois de `location: string;`:

```ts
  stockDeducted: boolean;
  ingredientCost: number;
  missingRecipeItemIds: string[];
  incompleteCostItemIds: string[];
  deductedIngredients: { ingredientId: string; quantity: number }[];
```

- [ ] **Step 2: Preencher os campos em `mapSnapshotToOrders`**

No `return { ... }` de `mapSnapshotToOrders` (linha ~48), acrescente antes do `};` final:

```ts
, stockDeducted: data.stockDeducted ?? false, ingredientCost: data.ingredientCost ?? 0, missingRecipeItemIds: data.missingRecipeItemIds ?? [], incompleteCostItemIds: data.incompleteCostItemIds ?? [], deductedIngredients: data.deductedIngredients ?? []
```

(Cole isso logo antes do fechamento do objeto retornado — o resultado deve continuar sendo uma única linha de `return {...}`, igual ao resto do arquivo.)

- [ ] **Step 3: Checar tipos**

Run: `npx tsc --noEmit`
Expected: sem erros.

- [ ] **Step 4: Commit**

```bash
git add src/admin/adminData.ts
git commit -m "Adiciona campos de estoque/custo ao OrderRecord"
```

---

## Task 7: `src/admin/AdminApp.tsx` — liga a baixa/devolução automática de estoque

**Files:**
- Modify: `src/admin/AdminApp.tsx`

**Interfaces:**
- Consumes: `subscribeIngredients`, `subscribeIngredientPurchases`, `Ingredient`, `IngredientPurchase` de `./ingredients`; `subscribeRecipes`, `Recipes` de `./recipes`; `subscribeFixedExpenses`, `FixedExpense` de `./fixedExpenses`; `deductStockForOrder`, `restoreStockForOrder` de `./stockDeduction`; `deletingOrderId` (estado já existente no componente).

- [ ] **Step 1: Importar os módulos novos**

No topo de `src/admin/AdminApp.tsx`, junto dos outros imports de `./`:

```ts
import { subscribeIngredients, subscribeIngredientPurchases, type Ingredient, type IngredientPurchase } from "./ingredients";
import { subscribeRecipes, type Recipes } from "./recipes";
import { subscribeFixedExpenses, type FixedExpense } from "./fixedExpenses";
import { subscribePaymentFeeRates, type PaymentFeeRates } from "./paymentFees";
import { deductStockForOrder, restoreStockForOrder } from "./stockDeduction";
```

- [ ] **Step 2: Adicionar os estados e assinaturas, perto de `printerConn`/`autoPrint`**

```ts
const [ingredients, setIngredients] = useState<Ingredient[]>([]);
useEffect(() => subscribeIngredients(setIngredients), []);
const [ingredientPurchases, setIngredientPurchases] = useState<IngredientPurchase[]>([]);
useEffect(() => subscribeIngredientPurchases(setIngredientPurchases), []);
const [recipes, setRecipes] = useState<Recipes>({});
useEffect(() => subscribeRecipes(setRecipes), []);
const [fixedExpenses, setFixedExpenses] = useState<FixedExpense[]>([]);
useEffect(() => subscribeFixedExpenses(setFixedExpenses), []);
const [paymentFeeRates, setPaymentFeeRates] = useState<PaymentFeeRates>({ pix: 0, cartao: 0, dinheiro: 0 });
useEffect(() => subscribePaymentFeeRates(setPaymentFeeRates), []);
```

- [ ] **Step 3: Descontar estoque em pedido novo — e recuperar baixa que falhou numa sessão anterior**

Troque o `useEffect` existente que detecta pedido novo (procure por `seenOrderIdsRef`):

```ts
useEffect(() => {
  if (!orders) return;
  if (seenOrderIdsRef.current === null) {
    seenOrderIdsRef.current = new Set(orders.map((order) => order.id));
    // Varredura única: tenta descontar de novo o estoque de pedidos que já
    // existiam mas nunca tiveram stockDeducted true (ex.: erro de rede numa
    // sessão anterior). Silencioso de propósito — não é um problema novo,
    // é recuperação de algo que já devia ter acontecido. deductStockForOrder
    // é idempotente, então tentar de novo nunca duplica nada. Ignora
    // qualquer pedido que esteja sendo apagado agora, pra não brigar com a
    // devolução de estoque (ver handleDeleteOrder).
    orders.filter((order) => !order.stockDeducted && order.id !== deletingOrderId).forEach((order) => {
      deductStockForOrder(order.id).catch(() => {});
    });
    return;
  }
  const newOrders = orders.filter((order) => !seenOrderIdsRef.current!.has(order.id));
  if (newOrders.length === 0) return;
  newOrders.forEach((order) => seenOrderIdsRef.current!.add(order.id));
  if (soundEnabled) playNewOrderChime(soundVolume / 100);
  newOrders.forEach((order) => {
    deductStockForOrder(order.id).catch((error) => setSaveError(`Não consegui descontar o estoque do Pedido #${order.orderNumber}.\n\nDetalhe do erro: ${error?.message ?? error}`));
  });
  if (!autoPrint || !printerConn) return;
  newOrders.forEach((order) => {
    printOrderReceipt(printerConn.characteristic, order).catch((error) => setSaveError(`Não consegui imprimir o Pedido #${order.orderNumber} automaticamente.\n\nDetalhe do erro: ${error?.message ?? error}`));
  });
}, [orders, autoPrint, printerConn, soundEnabled, soundVolume, deletingOrderId]);
```

(A única diferença do original é: a varredura única de recuperação dentro do `if (seenOrderIdsRef.current === null)`, e a chamada a `deductStockForOrder(order.id)` — sem parâmetro de receitas, já que agora ele lê direto do Firestore — logo depois do som, antes da impressão.)

- [ ] **Step 4: Devolver estoque ao apagar pedido**

Troque o `handleDeleteOrder` existente:

```ts
const handleDeleteOrder = (order: OrderRecord) => {
  if (!window.confirm(`Apagar o Pedido #${order.orderNumber}? Essa ação não pode ser desfeita.`)) return;
  setDeletingOrderId(order.id);
  restoreStockForOrder(order.id)
    .then(() => deleteOrder(order.id))
    .catch(() => setSaveError(`Não foi possível apagar o Pedido #${order.orderNumber} (falha ao devolver o estoque). Tenta de novo.`))
    .finally(() => setDeletingOrderId(null));
};
```

- [ ] **Step 5: Checar tipos**

Run: `npx tsc --noEmit`
Expected: sem erros.

- [ ] **Step 6: Build**

Run: `npm run build`
Expected: build termina sem erro (`✓ built in ...`).

- [ ] **Step 7: Commit**

```bash
git add src/admin/AdminApp.tsx
git commit -m "Liga baixa automatica, devolucao e recuperacao de estoque aos pedidos"
```

---

## Task 8: `src/admin/IngredientsPanel.tsx` — UI de ingredientes e estoque

**Files:**
- Create: `src/admin/IngredientsPanel.tsx`

**Interfaces:**
- Consumes: `Ingredient`, `IngredientUnit`, `IngredientPurchase`, `isPurchasePriceUnusual` de `./ingredients`.
- Produces: componente `IngredientsPanel` com props `{ ingredients: Ingredient[]; ingredientPurchases: IngredientPurchase[]; onAddIngredient: (name: string, unit: IngredientUnit) => Promise<void>; onRegisterPurchase: (ingredientId: string, quantity: number, totalCost: number) => Promise<void>; onAdjustStock: (ingredientId: string, newStock: number) => Promise<void>; onEditPurchase: (purchase: IngredientPurchase, newQuantity: number, newTotalCost: number) => Promise<void>; onDeletePurchase: (purchase: IngredientPurchase) => Promise<void> }`.

- [ ] **Step 1: Escrever `src/admin/IngredientsPanel.tsx`**

```tsx
import { useState } from "react";
import { isPurchasePriceUnusual, type Ingredient, type IngredientPurchase, type IngredientUnit } from "./ingredients";

const UNIT_LABELS: Record<IngredientUnit, string> = { kg: "kg", l: "litros", un: "unidades" };

function PurchaseHistoryRow({ purchase, unit, onEdit, onDelete }: { purchase: IngredientPurchase; unit: IngredientUnit; onEdit: (newQuantity: number, newTotalCost: number) => Promise<void>; onDelete: () => Promise<void> }) {
  const [editing, setEditing] = useState(false);
  const [quantityDraft, setQuantityDraft] = useState(String(purchase.quantity));
  const [totalCostDraft, setTotalCostDraft] = useState(String(purchase.totalCost));
  const [saving, setSaving] = useState(false);

  if (editing) {
    return (
      <div className="flex flex-wrap items-center gap-2 py-2">
        <input type="text" inputMode="decimal" value={quantityDraft} onChange={(event) => setQuantityDraft(event.target.value)} className="w-24 rounded-lg border border-white/15 bg-white/[0.06] px-2.5 py-1.5 text-xs text-white outline-none focus:border-[#ff6b32]" />
        <input type="text" inputMode="decimal" value={totalCostDraft} onChange={(event) => setTotalCostDraft(event.target.value)} className="w-24 rounded-lg border border-white/15 bg-white/[0.06] px-2.5 py-1.5 text-xs text-white outline-none focus:border-[#ff6b32]" />
        <button type="button" disabled={saving} onClick={() => { const q = Number(quantityDraft.replace(",", ".")); const c = Number(totalCostDraft.replace(",", ".")); if (!q || q <= 0 || !c || c <= 0) return; setSaving(true); onEdit(q, c).then(() => setEditing(false)).finally(() => setSaving(false)); }} className="rounded-full border border-white/15 px-3 py-1 text-[11px] font-bold text-white/70 transition hover:border-white/35 hover:text-white disabled:opacity-50">{saving ? "…" : "Salvar"}</button>
        <button type="button" onClick={() => setEditing(false)} className="text-[11px] font-bold text-white/40 hover:text-white">Cancelar</button>
      </div>
    );
  }
  return (
    <div className="flex flex-wrap items-center gap-2 py-2 text-xs text-white/60">
      <span>{purchase.createdAt.toLocaleDateString("pt-BR")}</span>
      <span>{purchase.quantity.toLocaleString("pt-BR")} {UNIT_LABELS[unit]} por R${purchase.totalCost.toFixed(2)}</span>
      <button type="button" onClick={() => setEditing(true)} className="text-[11px] font-bold text-[#ff875c] underline decoration-dotted underline-offset-2 hover:text-white">Editar</button>
      <button type="button" onClick={() => { if (window.confirm("Apagar essa compra? O custo médio recalcula sozinho com o que sobrar.")) onDelete(); }} className="text-[11px] font-bold text-red-400/80 hover:text-red-300">🗑</button>
    </div>
  );
}

export default function IngredientsPanel({ ingredients, ingredientPurchases, onAddIngredient, onRegisterPurchase, onAdjustStock, onEditPurchase, onDeletePurchase }: { ingredients: Ingredient[]; ingredientPurchases: IngredientPurchase[]; onAddIngredient: (name: string, unit: IngredientUnit) => Promise<void>; onRegisterPurchase: (ingredientId: string, quantity: number, totalCost: number) => Promise<void>; onAdjustStock: (ingredientId: string, newStock: number) => Promise<void>; onEditPurchase: (purchase: IngredientPurchase, newQuantity: number, newTotalCost: number) => Promise<void>; onDeletePurchase: (purchase: IngredientPurchase) => Promise<void> }) {
  const [newName, setNewName] = useState("");
  const [newUnit, setNewUnit] = useState<IngredientUnit>("kg");
  const [addingIngredient, setAddingIngredient] = useState(false);
  const [purchaseDrafts, setPurchaseDrafts] = useState<Record<string, { quantity: string; totalCost: string }>>({});
  const [savingPurchaseId, setSavingPurchaseId] = useState<string | null>(null);
  const [adjustDrafts, setAdjustDrafts] = useState<Record<string, string>>({});
  const [savingAdjustId, setSavingAdjustId] = useState<string | null>(null);
  const [expandedHistoryId, setExpandedHistoryId] = useState<string | null>(null);

  const handleAddIngredient = () => {
    const name = newName.trim();
    if (!name) return;
    setAddingIngredient(true);
    onAddIngredient(name, newUnit).then(() => { setNewName(""); setNewUnit("kg"); }).finally(() => setAddingIngredient(false));
  };

  const handleSavePurchase = (ingredient: Ingredient) => {
    const draft = purchaseDrafts[ingredient.id] ?? { quantity: "", totalCost: "" };
    const quantity = Number(draft.quantity.replace(",", "."));
    const totalCost = Number(draft.totalCost.replace(",", "."));
    if (!quantity || quantity <= 0 || !totalCost || totalCost <= 0) return;
    const unitCost = totalCost / quantity;
    if (isPurchasePriceUnusual(unitCost, ingredient.avgCost)) {
      const confirmed = window.confirm(`Esse valor (R$${unitCost.toFixed(2)}/${UNIT_LABELS[ingredient.unit]}) tá bem diferente do custo médio atual (R$${ingredient.avgCost.toFixed(2)}). Confirma mesmo assim?`);
      if (!confirmed) return;
    }
    setSavingPurchaseId(ingredient.id);
    onRegisterPurchase(ingredient.id, quantity, totalCost)
      .then(() => setPurchaseDrafts((current) => ({ ...current, [ingredient.id]: { quantity: "", totalCost: "" } })))
      .finally(() => setSavingPurchaseId(null));
  };

  const handleSaveAdjust = (ingredient: Ingredient) => {
    const draft = adjustDrafts[ingredient.id];
    if (draft === undefined) return;
    const newStock = Number(draft.replace(",", "."));
    if (Number.isNaN(newStock) || newStock < 0) return;
    setSavingAdjustId(ingredient.id);
    onAdjustStock(ingredient.id, newStock).then(() => setAdjustDrafts((current) => { const next = { ...current }; delete next[ingredient.id]; return next; })).finally(() => setSavingAdjustId(null));
  };

  return (
    <div className="mt-10 rounded-2xl border border-white/10 bg-[#171211] p-6">
      <p className="text-xs font-bold uppercase tracking-[.18em] text-[#ff7c50]">🧂 Ingredientes e Estoque</p>
      <h2 className="mt-1 font-display text-xl font-extrabold tracking-[-.03em]">Compras e custo</h2>
      <p className="mt-1.5 text-sm text-white/50">Cadastre os ingredientes que vocês compram, registre cada compra (quanto comprou + quanto pagou) e o custo médio atualiza sozinho. Lança a quantidade na mesma unidade da nota fiscal (ex.: se veio uma caixa com 50 unidades, lança 50 — não 1 pelo preço da caixa inteira). Errou alguma compra? Edita ou apaga ela no histórico — o custo médio se ajusta sozinho. Precisa corrigir só a quantidade em estoque (perda, quebra)? Usa o ajuste manual, sem mexer no custo.</p>

      <div className="mt-5 flex flex-wrap items-end gap-2 rounded-xl border border-white/10 bg-white/[0.03] p-3">
        <div className="min-w-0 flex-1">
          <label className="text-[10px] font-bold uppercase tracking-[.14em] text-white/45">Novo ingrediente</label>
          <input type="text" value={newName} onChange={(event) => setNewName(event.target.value)} placeholder="Ex: Salmão" className="mt-1.5 w-full rounded-lg border border-white/15 bg-white/[0.06] px-3 py-2 text-sm text-white outline-none focus:border-[#ff6b32]" />
        </div>
        <select value={newUnit} onChange={(event) => setNewUnit(event.target.value as IngredientUnit)} className="rounded-lg border border-white/15 bg-white/[0.06] px-3 py-2 text-sm text-white outline-none focus:border-[#ff6b32]">
          {(Object.keys(UNIT_LABELS) as IngredientUnit[]).map((unit) => <option key={unit} value={unit} className="bg-[#171211]">{UNIT_LABELS[unit]}</option>)}
        </select>
        <button type="button" onClick={handleAddIngredient} disabled={addingIngredient || !newName.trim()} className="rounded-full bg-[#ff5a19] px-4 py-2 text-xs font-bold text-white transition hover:bg-[#ff6a2e] disabled:cursor-not-allowed disabled:opacity-40">{addingIngredient ? "Adicionando…" : "+ Adicionar"}</button>
      </div>

      <div className="mt-4 divide-y divide-white/10 rounded-xl border border-white/10">
        {ingredients.length === 0 ? (
          <p className="p-4 text-sm text-white/50">Nenhum ingrediente cadastrado ainda.</p>
        ) : ingredients.map((ingredient) => {
          const draft = purchaseDrafts[ingredient.id] ?? { quantity: "", totalCost: "" };
          const adjustDraft = adjustDrafts[ingredient.id];
          const history = ingredientPurchases.filter((purchase) => purchase.ingredientId === ingredient.id);
          return (
            <div key={ingredient.id} className="p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <span className="text-sm font-bold text-white">{ingredient.name}</span>
                  <span className="ml-2 text-xs text-white/50">{ingredient.stock.toLocaleString("pt-BR")} {UNIT_LABELS[ingredient.unit]} em estoque · custo médio R${ingredient.avgCost.toFixed(2)}/{UNIT_LABELS[ingredient.unit]}</span>
                </div>
                {history.length > 0 && <button type="button" onClick={() => setExpandedHistoryId(expandedHistoryId === ingredient.id ? null : ingredient.id)} className="text-[11px] font-bold text-white/40 underline decoration-dotted underline-offset-2 hover:text-white">{expandedHistoryId === ingredient.id ? "Esconder histórico" : `Histórico (${history.length})`}</button>}
              </div>
              <div className="mt-3 flex flex-wrap items-end gap-2">
                <div>
                  <label className="text-[10px] font-bold uppercase tracking-[.14em] text-white/45">Comprou quanto</label>
                  <input type="text" inputMode="decimal" value={draft.quantity} onChange={(event) => setPurchaseDrafts((current) => ({ ...current, [ingredient.id]: { ...draft, quantity: event.target.value } }))} placeholder={UNIT_LABELS[ingredient.unit]} className="mt-1.5 w-28 rounded-lg border border-white/15 bg-white/[0.06] px-2.5 py-1.5 text-sm text-white outline-none focus:border-[#ff6b32]" />
                </div>
                <div>
                  <label className="text-[10px] font-bold uppercase tracking-[.14em] text-white/45">Pagou quanto (R$)</label>
                  <input type="text" inputMode="decimal" value={draft.totalCost} onChange={(event) => setPurchaseDrafts((current) => ({ ...current, [ingredient.id]: { ...draft, totalCost: event.target.value } }))} placeholder="0,00" className="mt-1.5 w-28 rounded-lg border border-white/15 bg-white/[0.06] px-2.5 py-1.5 text-sm text-white outline-none focus:border-[#ff6b32]" />
                </div>
                <button type="button" onClick={() => handleSavePurchase(ingredient)} disabled={savingPurchaseId === ingredient.id} className="rounded-full border border-white/15 px-3.5 py-1.5 text-xs font-bold text-white/80 transition hover:border-white/35 hover:text-white disabled:cursor-wait disabled:opacity-50">{savingPurchaseId === ingredient.id ? "Salvando…" : "Registrar compra"}</button>
                <div className="ml-auto flex items-end gap-2">
                  <div>
                    <label className="text-[10px] font-bold uppercase tracking-[.14em] text-white/45">Ajustar estoque pra</label>
                    <input type="text" inputMode="decimal" value={adjustDraft ?? ""} onChange={(event) => setAdjustDrafts((current) => ({ ...current, [ingredient.id]: event.target.value }))} placeholder={String(ingredient.stock)} className="mt-1.5 w-24 rounded-lg border border-white/15 bg-white/[0.06] px-2.5 py-1.5 text-sm text-white outline-none focus:border-[#ff6b32]" />
                  </div>
                  <button type="button" onClick={() => handleSaveAdjust(ingredient)} disabled={savingAdjustId === ingredient.id || adjustDraft === undefined} className="rounded-full border border-white/15 px-3.5 py-1.5 text-xs font-bold text-white/60 transition hover:border-white/35 hover:text-white disabled:cursor-wait disabled:opacity-50">{savingAdjustId === ingredient.id ? "…" : "Ajustar"}</button>
                </div>
              </div>
              {expandedHistoryId === ingredient.id && (
                <div className="mt-3 divide-y divide-white/10 rounded-lg border border-white/10 bg-white/[0.02] px-3">
                  {history.map((purchase) => <PurchaseHistoryRow key={purchase.id} purchase={purchase} unit={ingredient.unit} onEdit={(newQuantity, newTotalCost) => onEditPurchase(purchase, newQuantity, newTotalCost)} onDelete={() => onDeletePurchase(purchase)} />)}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Checar tipos**

Run: `npx tsc --noEmit`
Expected: sem erros.

- [ ] **Step 3: Commit**

```bash
git add src/admin/IngredientsPanel.tsx
git commit -m "Adiciona painel de ingredientes, estoque e historico de compras editavel (ainda nao usado em nenhuma tela)"
```

---

## Task 9: `src/admin/RecipeEditor.tsx` — ficha técnica por prato

**Files:**
- Create: `src/admin/RecipeEditor.tsx`

**Interfaces:**
- Consumes: `Ingredient` de `./ingredients`; `RecipeIngredient` de `./recipes`.
- Produces: componente `RecipeEditor` com props `{ itemId: string; itemName: string; ingredients: Ingredient[]; recipe: RecipeIngredient[]; onSave: (itemId: string, ingredients: RecipeIngredient[]) => Promise<void> }`.

- [ ] **Step 1: Escrever `src/admin/RecipeEditor.tsx`**

```tsx
import { useState } from "react";
import type { Ingredient } from "./ingredients";
import type { RecipeIngredient } from "./recipes";

export default function RecipeEditor({ itemId, itemName, ingredients, recipe, onSave }: { itemId: string; itemName: string; ingredients: Ingredient[]; recipe: RecipeIngredient[]; onSave: (itemId: string, ingredients: RecipeIngredient[]) => Promise<void> }) {
  const [draft, setDraft] = useState<RecipeIngredient[]>(recipe.length > 0 ? recipe : []);
  const [saving, setSaving] = useState(false);

  const addRow = () => {
    if (ingredients.length === 0) return;
    setDraft((current) => [...current, { ingredientId: ingredients[0].id, quantity: 0 }]);
  };
  const updateRow = (index: number, next: Partial<RecipeIngredient>) => setDraft((current) => current.map((row, i) => (i === index ? { ...row, ...next } : row)));
  const removeRow = (index: number) => setDraft((current) => current.filter((_, i) => i !== index));

  const handleSave = () => {
    setSaving(true);
    onSave(itemId, draft.filter((row) => row.quantity > 0)).finally(() => setSaving(false));
  };

  if (ingredients.length === 0) {
    return <div className="mt-2 rounded-lg border border-dashed border-white/15 p-3 text-xs text-white/45">Cadastre algum ingrediente em "Ingredientes e Estoque" (embaixo do cardápio) antes de montar a ficha técnica.</div>;
  }

  return (
    <div className="mt-2 rounded-lg border border-white/10 bg-white/[0.03] p-3">
      <p className="text-[10px] font-bold uppercase tracking-[.14em] text-white/45">Ficha técnica — {itemName}</p>
      <p className="mt-1 text-[11px] leading-relaxed text-white/40">Usa a quantidade BRUTA (antes de limpar/descartar casca, osso etc.) — se 1kg de cebola crua rende só 850g limpa e o prato usa 100g limpa, lança ~118g de cebola aqui, não 100g.</p>
      <div className="mt-2 space-y-2">
        {draft.map((row, index) => {
          const ingredient = ingredients.find((candidate) => candidate.id === row.ingredientId);
          return (
            <div key={index} className="flex items-center gap-2">
              <select value={row.ingredientId} onChange={(event) => updateRow(index, { ingredientId: event.target.value })} className="min-w-0 flex-1 rounded-lg border border-white/15 bg-white/[0.06] px-2.5 py-1.5 text-xs text-white outline-none focus:border-[#ff6b32]">
                {ingredients.map((option) => <option key={option.id} value={option.id} className="bg-[#171211]">{option.name}</option>)}
              </select>
              <input type="text" inputMode="decimal" value={row.quantity || ""} onChange={(event) => updateRow(index, { quantity: Number(event.target.value.replace(",", ".")) || 0 })} placeholder={ingredient?.unit ?? "qtd"} className="w-20 rounded-lg border border-white/15 bg-white/[0.06] px-2.5 py-1.5 text-xs text-white outline-none focus:border-[#ff6b32]" />
              <span className="w-10 shrink-0 text-[10px] text-white/40">{ingredient?.unit}</span>
              <button type="button" onClick={() => removeRow(index)} className="shrink-0 text-xs font-bold text-red-400/80 hover:text-red-300">✕</button>
            </div>
          );
        })}
      </div>
      <div className="mt-2.5 flex items-center gap-2">
        <button type="button" onClick={addRow} className="rounded-full border border-white/15 px-3 py-1.5 text-[11px] font-bold text-white/70 transition hover:border-white/35 hover:text-white">+ Ingrediente</button>
        <button type="button" onClick={handleSave} disabled={saving} className="rounded-full bg-[#ff5a19] px-3.5 py-1.5 text-[11px] font-bold text-white transition hover:bg-[#ff6a2e] disabled:cursor-wait disabled:opacity-50">{saving ? "Salvando…" : "Salvar ficha técnica"}</button>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Checar tipos**

Run: `npx tsc --noEmit`
Expected: sem erros.

- [ ] **Step 3: Commit**

```bash
git add src/admin/RecipeEditor.tsx
git commit -m "Adiciona editor de ficha tecnica por prato (ainda nao usado em nenhuma tela)"
```

---

## Task 10: Ligar `IngredientsPanel` e `RecipeEditor` na aba Cardápio

**Files:**
- Modify: `src/admin/AdminApp.tsx`

**Interfaces:**
- Consumes: `IngredientsPanel` (Task 8), `RecipeEditor` (Task 9), `addIngredient`/`registerPurchase`/`adjustStock`/`editPurchase`/`deletePurchase` de `./ingredients`, `setRecipe` de `./recipes`, estados `ingredients`/`ingredientPurchases`/`recipes` já criados no Task 7.

- [ ] **Step 1: Importar os componentes e funções de escrita**

```ts
import IngredientsPanel from "./IngredientsPanel";
import RecipeEditor from "./RecipeEditor";
import { addIngredient, registerPurchase, adjustStock, editPurchase, deletePurchase } from "./ingredients";
import { setRecipe } from "./recipes";
```

- [ ] **Step 2: Adicionar estado de "qual item tem a ficha técnica aberta"**

Perto de `editingItemId`:

```ts
const [expandedRecipeItemId, setExpandedRecipeItemId] = useState<string | null>(null);
```

- [ ] **Step 3: Adicionar o botão "Ficha técnica" e o `RecipeEditor` na linha de cada item**

Em `src/admin/AdminApp.tsx`, dentro do `.map((item) => ...)` da aba Cardápio, no bloco que já tem o botão "Editar"/"Restaurar padrão" (procure a linha com `startEditItem(item.id, currentName, currentPrice, currentDescription)`), troque esse trecho:

```tsx
<div className="mt-1 flex flex-wrap items-center gap-2">
  <span className="text-xs text-white/50">{formatTotal(currentPrice)}</span>
  <button type="button" onClick={() => startEditItem(item.id, currentName, currentPrice, currentDescription)} className="text-[10px] font-bold text-[#ff875c] underline decoration-dotted underline-offset-2 hover:text-white">Editar</button>
  {hasAnyOverride && <button type="button" onClick={() => handleResetItemAll(item.id)} disabled={isSavingItem} className="text-[10px] font-bold text-white/40 underline decoration-dotted underline-offset-2 hover:text-white disabled:opacity-50">Restaurar padrão</button>}
</div>
```

por:

```tsx
<div className="mt-1 flex flex-wrap items-center gap-2">
  <span className="text-xs text-white/50">{formatTotal(currentPrice)}</span>
  <button type="button" onClick={() => startEditItem(item.id, currentName, currentPrice, currentDescription)} className="text-[10px] font-bold text-[#ff875c] underline decoration-dotted underline-offset-2 hover:text-white">Editar</button>
  {hasAnyOverride && <button type="button" onClick={() => handleResetItemAll(item.id)} disabled={isSavingItem} className="text-[10px] font-bold text-white/40 underline decoration-dotted underline-offset-2 hover:text-white disabled:opacity-50">Restaurar padrão</button>}
  <button type="button" onClick={() => setExpandedRecipeItemId(expandedRecipeItemId === item.id ? null : item.id)} className="text-[10px] font-bold text-white/40 underline decoration-dotted underline-offset-2 hover:text-white">🧂 Ficha técnica{recipes[item.id]?.length ? "" : " (vazia)"}</button>
</div>
{expandedRecipeItemId === item.id && <RecipeEditor itemId={item.id} itemName={currentName} ingredients={ingredients} recipe={recipes[item.id] ?? []} onSave={setRecipe} />}
```

- [ ] **Step 4: Adicionar o `IngredientsPanel` embaixo do cardápio**

No fim do bloco "Cardápio" / "Preços e disponibilidade" (procure o `</div>` que fecha essa seção, logo antes do card "Adicionar item novo" — comentário no arquivo já diz `<div className="mt-10 rounded-2xl border border-white/10 bg-[#171211] p-6">\n<p className="text-xs font-bold uppercase tracking-[.18em] text-[#ff7c50]">Cardápio</p>\n<h2 className="mt-1 font-display text-xl font-extrabold tracking-[-.03em]">Adicionar item novo</h2>`), adicione logo antes desse card:

```tsx
<IngredientsPanel ingredients={ingredients} ingredientPurchases={ingredientPurchases} onAddIngredient={addIngredient} onRegisterPurchase={registerPurchase} onAdjustStock={adjustStock} onEditPurchase={editPurchase} onDeletePurchase={deletePurchase} />
```

- [ ] **Step 5: Checar tipos**

Run: `npx tsc --noEmit`
Expected: sem erros.

- [ ] **Step 6: Build**

Run: `npm run build`
Expected: build termina sem erro.

- [ ] **Step 7: Commit**

```bash
git add src/admin/AdminApp.tsx
git commit -m "Liga ingredientes e ficha tecnica na aba Cardapio do admin"
```

---

## Task 11: `src/admin/FinanceiroPanel.tsx` — painel financeiro

**Files:**
- Create: `src/admin/FinanceiroPanel.tsx`

**Interfaces:**
- Consumes: `OrderRecord` de `./adminData`; `Ingredient` de `./ingredients`; `Recipes`, `RecipeIngredient` de `./recipes`; `FixedExpense` de `./fixedExpenses`; `PaymentMethod`, `PaymentFeeRates` de `./paymentFees`.
- Produces: componente `FinanceiroPanel` com props `{ todayOrders: OrderRecord[]; weekOrders: OrderRecord[]; monthOrders: OrderRecord[]; monthPurchasesTotal: number; ingredients: Ingredient[]; recipes: Recipes; fixedExpenses: FixedExpense[]; paymentFeeRates: PaymentFeeRates; itemCatalog: { id: string; name: string; price: number }[]; onAddFixedExpense: (name: string, amount: number) => Promise<void>; onUpdateFixedExpense: (id: string, name: string, amount: number) => Promise<void>; onDeleteFixedExpense: (id: string) => Promise<void>; onSetPaymentFeeRates: (rates: PaymentFeeRates) => Promise<void> }`.

- [ ] **Step 1: Escrever `src/admin/FinanceiroPanel.tsx`**

```tsx
import { useState } from "react";
import type { OrderRecord } from "./adminData";
import type { Ingredient } from "./ingredients";
import type { Recipes } from "./recipes";
import type { FixedExpense } from "./fixedExpenses";
import type { PaymentFeeRates } from "./paymentFees";

const formatTotal = (value: number) => value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

const PAYMENT_LABELS: Record<keyof PaymentFeeRates, string> = { pix: "Pix", cartao: "Cartão", dinheiro: "Dinheiro" };

const sumRevenue = (orders: OrderRecord[]) => orders.reduce((total, order) => total + order.total, 0);
const sumIngredientCost = (orders: OrderRecord[]) => orders.reduce((total, order) => total + order.ingredientCost, 0);
const sumPaymentFees = (orders: OrderRecord[], rates: PaymentFeeRates) => orders.reduce((total, order) => total + order.total * (rates[order.paymentMethod as keyof PaymentFeeRates] ?? 0), 0);
const countFlaggedOrders = (orders: OrderRecord[]) => orders.filter((order) => order.missingRecipeItemIds.length > 0 || order.incompleteCostItemIds.length > 0).length;
const sumFixedExpenses = (fixedExpenses: FixedExpense[]) => fixedExpenses.reduce((total, expense) => total + expense.amount, 0);

/**
 * Custo atual de um prato pela ficha técnica de hoje (não é o custo
 * histórico do que já foi vendido). `complete: false` quando algum
 * ingrediente da receita não tem custo real (nunca comprado, ou apagado) —
 * nesse caso `cost` ainda é um número, mas NUNCA deve ser mostrado como se
 * fosse confiável.
 */
function currentRecipeCost(itemId: string, recipes: Recipes, ingredients: Ingredient[]): { cost: number; complete: boolean } | null {
  const recipe = recipes[itemId];
  if (!recipe || recipe.length === 0) return null;
  let complete = true;
  const cost = recipe.reduce((total, entry) => {
    const ingredient = ingredients.find((candidate) => candidate.id === entry.ingredientId);
    if (!ingredient || ingredient.avgCost <= 0) complete = false;
    return total + entry.quantity * (ingredient?.avgCost ?? 0);
  }, 0);
  return { cost, complete };
}

function PeriodCard({ title, orders, showFixedExpenses, fixedExpensesTotal, purchasesTotal, paymentFeeRates }: { title: string; orders: OrderRecord[]; showFixedExpenses: boolean; fixedExpensesTotal: number; purchasesTotal?: number; paymentFeeRates: PaymentFeeRates }) {
  const bruto = sumRevenue(orders);
  const custoVariavel = sumIngredientCost(orders);
  const taxaPagamento = sumPaymentFees(orders, paymentFeeRates);
  const margem = bruto - custoVariavel - taxaPagamento;
  const liquido = margem - fixedExpensesTotal;
  const flaggedCount = countFlaggedOrders(orders);
  return (
    <div className="min-w-0 rounded-xl border border-white/10 bg-white/[0.03] p-4">
      <p className="text-[10px] font-bold uppercase tracking-[.14em] text-white/45">{title}</p>
      <p className="mt-2 text-xs text-white/55">Bruto <span className="font-bold text-white">{formatTotal(bruto)}</span></p>
      <p className="mt-1 text-xs text-white/55">Custo variável (pelas vendas) <span className="font-bold text-white">{formatTotal(custoVariavel)}</span></p>
      <p className="mt-1 text-xs text-white/55">Taxa de pagamento <span className="font-bold text-white">{formatTotal(taxaPagamento)}</span></p>
      {purchasesTotal !== undefined && <p className="mt-1 text-xs text-white/40">Total comprado no período <span className="font-bold text-white/70">{formatTotal(purchasesTotal)}</span> <span className="text-[10px]">(aproximado — inclui compra que ainda não foi vendida)</span></p>}
      {showFixedExpenses && <p className="mt-1 text-xs text-white/55">Gastos fixos <span className="font-bold text-white">{formatTotal(fixedExpensesTotal)}</span></p>}
      <p className="mt-2 font-display text-xl font-extrabold text-[#ff875c]">{showFixedExpenses ? formatTotal(liquido) : formatTotal(margem)}</p>
      <p className="text-[10px] text-white/40">{showFixedExpenses ? "lucro líquido" : "margem (bruto − custo variável − taxa)"}</p>
      {flaggedCount > 0 && <p className="mt-2 text-[11px] text-amber-300/80">⚠️ {flaggedCount} pedido{flaggedCount === 1 ? "" : "s"} com prato sem ficha técnica ou com ingrediente sem custo cadastrado — custo pode estar subestimado.</p>}
    </div>
  );
}

function PaymentFeesEditor({ paymentFeeRates, onSetPaymentFeeRates }: { paymentFeeRates: PaymentFeeRates; onSetPaymentFeeRates: (rates: PaymentFeeRates) => Promise<void> }) {
  const [drafts, setDrafts] = useState<Record<string, string>>({ pix: String(paymentFeeRates.pix * 100), cartao: String(paymentFeeRates.cartao * 100), dinheiro: String(paymentFeeRates.dinheiro * 100) });
  const [saving, setSaving] = useState(false);
  const handleSave = () => {
    setSaving(true);
    const rates: PaymentFeeRates = { pix: (Number(drafts.pix.replace(",", ".")) || 0) / 100, cartao: (Number(drafts.cartao.replace(",", ".")) || 0) / 100, dinheiro: (Number(drafts.dinheiro.replace(",", ".")) || 0) / 100 };
    onSetPaymentFeeRates(rates).finally(() => setSaving(false));
  };
  return (
    <div className="rounded-2xl border border-white/10 bg-[#171211] p-6">
      <p className="text-xs font-bold uppercase tracking-[.18em] text-[#ff7c50]">Taxa de pagamento</p>
      <h3 className="mt-1 font-display text-lg font-extrabold tracking-[-.03em]">Quanto a maquininha/plataforma come de cada venda</h3>
      <p className="mt-1.5 text-sm text-white/50">Em porcentagem do valor do pedido. Deixa 0 pra forma de pagamento que não tem taxa (ex.: Pix, dinheiro).</p>
      <div className="mt-4 flex flex-wrap items-end gap-3">
        {(Object.keys(PAYMENT_LABELS) as (keyof PaymentFeeRates)[]).map((method) => (
          <div key={method}>
            <label className="text-[10px] font-bold uppercase tracking-[.14em] text-white/45">{PAYMENT_LABELS[method]} (%)</label>
            <input type="text" inputMode="decimal" value={drafts[method]} onChange={(event) => setDrafts((current) => ({ ...current, [method]: event.target.value }))} className="mt-1.5 w-24 rounded-lg border border-white/15 bg-white/[0.06] px-2.5 py-1.5 text-sm text-white outline-none focus:border-[#ff6b32]" />
          </div>
        ))}
        <button type="button" onClick={handleSave} disabled={saving} className="rounded-full bg-[#ff5a19] px-4 py-2 text-xs font-bold text-white transition hover:bg-[#ff6a2e] disabled:cursor-wait disabled:opacity-50">{saving ? "Salvando…" : "Salvar"}</button>
      </div>
    </div>
  );
}

export default function FinanceiroPanel({ todayOrders, weekOrders, monthOrders, monthPurchasesTotal, ingredients, recipes, fixedExpenses, paymentFeeRates, itemCatalog, onAddFixedExpense, onUpdateFixedExpense, onDeleteFixedExpense, onSetPaymentFeeRates }: { todayOrders: OrderRecord[]; weekOrders: OrderRecord[]; monthOrders: OrderRecord[]; monthPurchasesTotal: number; ingredients: Ingredient[]; recipes: Recipes; fixedExpenses: FixedExpense[]; paymentFeeRates: PaymentFeeRates; itemCatalog: { id: string; name: string; price: number }[]; onAddFixedExpense: (name: string, amount: number) => Promise<void>; onUpdateFixedExpense: (id: string, name: string, amount: number) => Promise<void>; onDeleteFixedExpense: (id: string) => Promise<void>; onSetPaymentFeeRates: (rates: PaymentFeeRates) => Promise<void> }) {
  const [newExpenseName, setNewExpenseName] = useState("");
  const [newExpenseAmount, setNewExpenseAmount] = useState("");
  const [addingExpense, setAddingExpense] = useState(false);
  const [editDrafts, setEditDrafts] = useState<Record<string, { name: string; amount: string }>>({});
  const [savingExpenseId, setSavingExpenseId] = useState<string | null>(null);

  const fixedExpensesTotal = sumFixedExpenses(fixedExpenses);

  const handleAddExpense = () => {
    const name = newExpenseName.trim();
    const amount = Number(newExpenseAmount.replace(",", "."));
    if (!name || !amount || amount <= 0) return;
    setAddingExpense(true);
    onAddFixedExpense(name, amount).then(() => { setNewExpenseName(""); setNewExpenseAmount(""); }).finally(() => setAddingExpense(false));
  };

  const handleSaveExpense = (expense: FixedExpense) => {
    const draft = editDrafts[expense.id] ?? { name: expense.name, amount: String(expense.amount) };
    const amount = Number(draft.amount.replace(",", "."));
    if (!draft.name.trim() || !amount || amount <= 0) return;
    setSavingExpenseId(expense.id);
    onUpdateFixedExpense(expense.id, draft.name.trim(), amount).finally(() => setSavingExpenseId(null));
  };

  const costByItem = itemCatalog.map((item) => ({ item, result: currentRecipeCost(item.id, recipes, ingredients) }));
  const ranking = costByItem
    .filter(({ result }) => result !== null && result.complete)
    .map(({ item, result }) => ({ ...item, cost: result!.cost, margin: item.price - result!.cost }))
    .sort((a, b) => b.margin - a.margin);
  const incompleteCostItems = costByItem.filter(({ result }) => result !== null && !result.complete).map(({ item }) => item);
  const itemsWithoutRecipe = costByItem.filter(({ result }) => result === null).map(({ item }) => item);

  return (
    <div className="space-y-8">
      <div>
        <p className="text-xs font-bold uppercase tracking-[.18em] text-[#ff7c50]">Financeiro</p>
        <h2 className="mt-1 font-display text-xl font-extrabold tracking-[-.03em]">Bruto, custo e lucro real</h2>
        <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-3">
          <PeriodCard title="Hoje" orders={todayOrders} showFixedExpenses={false} fixedExpensesTotal={0} paymentFeeRates={paymentFeeRates} />
          <PeriodCard title="Essa semana" orders={weekOrders} showFixedExpenses={false} fixedExpensesTotal={0} paymentFeeRates={paymentFeeRates} />
          <PeriodCard title="Esse mês" orders={monthOrders} showFixedExpenses fixedExpensesTotal={fixedExpensesTotal} purchasesTotal={monthPurchasesTotal} paymentFeeRates={paymentFeeRates} />
        </div>
      </div>

      <PaymentFeesEditor paymentFeeRates={paymentFeeRates} onSetPaymentFeeRates={onSetPaymentFeeRates} />

      <div className="rounded-2xl border border-white/10 bg-[#171211] p-6">
        <p className="text-xs font-bold uppercase tracking-[.18em] text-[#ff7c50]">Despesas fixas</p>
        <h3 className="mt-1 font-display text-lg font-extrabold tracking-[-.03em]">Aluguel, luz, funcionário...</h3>
        <div className="mt-4 divide-y divide-white/10 rounded-xl border border-white/10">
          {fixedExpenses.length === 0 ? (
            <p className="p-4 text-sm text-white/50">Nenhuma despesa fixa cadastrada ainda.</p>
          ) : fixedExpenses.map((expense) => {
            const draft = editDrafts[expense.id] ?? { name: expense.name, amount: String(expense.amount) };
            return (
              <div key={expense.id} className="flex flex-wrap items-center gap-2 p-3">
                <input type="text" value={draft.name} onChange={(event) => setEditDrafts((current) => ({ ...current, [expense.id]: { ...draft, name: event.target.value } }))} className="min-w-0 flex-1 rounded-lg border border-white/15 bg-white/[0.06] px-2.5 py-1.5 text-sm text-white outline-none focus:border-[#ff6b32]" />
                <input type="text" inputMode="decimal" value={draft.amount} onChange={(event) => setEditDrafts((current) => ({ ...current, [expense.id]: { ...draft, amount: event.target.value } }))} className="w-28 rounded-lg border border-white/15 bg-white/[0.06] px-2.5 py-1.5 text-sm text-white outline-none focus:border-[#ff6b32]" />
                <button type="button" onClick={() => handleSaveExpense(expense)} disabled={savingExpenseId === expense.id} className="rounded-full border border-white/15 px-3 py-1.5 text-[11px] font-bold text-white/70 transition hover:border-white/35 hover:text-white disabled:cursor-wait disabled:opacity-50">{savingExpenseId === expense.id ? "…" : "Salvar"}</button>
                <button type="button" onClick={() => onDeleteFixedExpense(expense.id)} className="text-[11px] font-bold text-red-400/80 hover:text-red-300">🗑</button>
              </div>
            );
          })}
        </div>
        <div className="mt-3 flex flex-wrap items-end gap-2">
          <input type="text" value={newExpenseName} onChange={(event) => setNewExpenseName(event.target.value)} placeholder="Ex: Aluguel" className="min-w-0 flex-1 rounded-lg border border-white/15 bg-white/[0.06] px-2.5 py-1.5 text-sm text-white outline-none focus:border-[#ff6b32]" />
          <input type="text" inputMode="decimal" value={newExpenseAmount} onChange={(event) => setNewExpenseAmount(event.target.value)} placeholder="Valor mensal (R$)" className="w-40 rounded-lg border border-white/15 bg-white/[0.06] px-2.5 py-1.5 text-sm text-white outline-none focus:border-[#ff6b32]" />
          <button type="button" onClick={handleAddExpense} disabled={addingExpense} className="rounded-full bg-[#ff5a19] px-4 py-2 text-xs font-bold text-white transition hover:bg-[#ff6a2e] disabled:cursor-wait disabled:opacity-50">{addingExpense ? "Adicionando…" : "+ Adicionar"}</button>
        </div>
      </div>

      <div className="rounded-2xl border border-white/10 bg-[#171211] p-6">
        <p className="text-xs font-bold uppercase tracking-[.18em] text-[#ff7c50]">Qual prato dá mais lucro</p>
        <h3 className="mt-1 font-display text-lg font-extrabold tracking-[-.03em]">Margem pelo custo atual</h3>
        <p className="mt-1.5 text-sm text-white/50">Preço de venda menos o custo atual dos ingredientes (pela ficha técnica de hoje) — ajuda a decidir se algum prato precisa subir de preço.</p>
        <div className="mt-4 divide-y divide-white/10 rounded-xl border border-white/10">
          {ranking.length === 0 ? (
            <p className="p-4 text-sm text-white/50">Nenhum prato com ficha técnica cadastrada ainda.</p>
          ) : ranking.map((item) => (
            <div key={item.id} className="flex items-center justify-between gap-3 p-3">
              <span className="min-w-0 flex-1 truncate text-sm font-bold text-white">{item.name}</span>
              <span className="shrink-0 text-xs text-white/50">venda {formatTotal(item.price)} − custo {formatTotal(item.cost as number)}</span>
              <span className={`shrink-0 font-display text-sm font-extrabold ${item.margin >= 0 ? "text-emerald-400" : "text-red-400"}`}>{formatTotal(item.margin)}</span>
            </div>
          ))}
        </div>
        {incompleteCostItems.length > 0 && <p className="mt-3 text-[11px] text-amber-300/80">⚠️ {incompleteCostItems.length} prato{incompleteCostItems.length === 1 ? "" : "s"} com ficha técnica cadastrada mas custo incompleto (ingrediente nunca comprado ou apagado) — custo pode estar subestimado: {incompleteCostItems.map((item) => item.name).join(", ")}</p>}
        {itemsWithoutRecipe.length > 0 && <p className="mt-2 text-[11px] text-white/40">{itemsWithoutRecipe.length} prato{itemsWithoutRecipe.length === 1 ? "" : "s"} sem ficha técnica ainda (não aparecem no ranking): {itemsWithoutRecipe.map((item) => item.name).join(", ")}</p>}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Checar tipos**

Run: `npx tsc --noEmit`
Expected: sem erros.

- [ ] **Step 3: Commit**

```bash
git add src/admin/FinanceiroPanel.tsx
git commit -m "Adiciona painel financeiro com taxa de pagamento e custo incompleto sinalizado (ainda nao usado em nenhuma tela)"
```

---

## Task 12: Ligar a aba "Financeiro" no `AdminApp.tsx`

**Files:**
- Modify: `src/admin/AdminApp.tsx`

**Interfaces:**
- Consumes: `FinanceiroPanel` (Task 11); `fixedExpenses`/`ingredients`/`recipes`/`ingredientPurchases`/`paymentFeeRates` já em estado (Task 7); `addFixedExpense`/`updateFixedExpense`/`deleteFixedExpense` de `./fixedExpenses`; `setPaymentFeeRates` de `./paymentFees`; `todayOrders`/`weekOrders`/`monthOrders`/`now` já calculados no `Dashboard`; `menuSections` de `../menuData`, `customItems`, `nameOverrides`, `priceOverrides` já existentes.

- [ ] **Step 1: Importar**

```ts
import FinanceiroPanel from "./FinanceiroPanel";
import { addFixedExpense, updateFixedExpense, deleteFixedExpense } from "./fixedExpenses";
import { setPaymentFeeRates } from "./paymentFees";
```

- [ ] **Step 2: Adicionar "financeiro" ao tipo de aba e à lista de abas**

Troque:

```ts
type AdminTab = "visao" | "cardapio" | "combos" | "fotos";
```

por:

```ts
type AdminTab = "visao" | "cardapio" | "combos" | "fotos" | "financeiro";
```

E no array `ADMIN_TABS`, acrescente ao final:

```ts
  { id: "financeiro", label: "Financeiro" },
```

- [ ] **Step 3: Montar o catálogo de itens (id + nome + preço atuais) e o total comprado no mês**

Dentro do componente `Dashboard`, perto de onde `now`/`todayOrders`/`weekOrders`/`monthOrders` já são calculados:

```ts
const itemCatalog = menuSections.flatMap((section) => [...section.items, ...customItems.filter((item) => item.sectionId === section.id)]).map((item) => ({ id: item.id, name: nameOverrides[item.id] ?? item.name, price: priceOverrides[item.id] ?? item.price }));
const monthPurchasesTotal = ingredientPurchases.filter((purchase) => purchase.createdAt >= startOfMonth(now)).reduce((total, purchase) => total + purchase.totalCost, 0);
```

(`startOfMonth` já vem importado de `./adminData` nesse arquivo — é a mesma função usada pra calcular `monthOrders`.)

- [ ] **Step 4: Renderizar a aba**

Depois do bloco `{activeTab === "fotos" && <>...</>}` (ou onde as abas são renderizadas em sequência), acrescente:

```tsx
{activeTab === "financeiro" && (
  <FinanceiroPanel
    todayOrders={todayOrders}
    weekOrders={weekOrders}
    monthOrders={monthOrders}
    monthPurchasesTotal={monthPurchasesTotal}
    ingredients={ingredients}
    recipes={recipes}
    fixedExpenses={fixedExpenses}
    paymentFeeRates={paymentFeeRates}
    itemCatalog={itemCatalog}
    onAddFixedExpense={addFixedExpense}
    onUpdateFixedExpense={updateFixedExpense}
    onDeleteFixedExpense={deleteFixedExpense}
    onSetPaymentFeeRates={setPaymentFeeRates}
  />
)}
```

- [ ] **Step 5: Checar tipos**

Run: `npx tsc --noEmit`
Expected: sem erros.

- [ ] **Step 6: Build**

Run: `npm run build`
Expected: build termina sem erro.

- [ ] **Step 7: Commit**

```bash
git add src/admin/AdminApp.tsx
git commit -m "Adiciona a aba Financeiro no painel admin"
```

---

## Task 13: Verificação final e deploy

**Files:** nenhum arquivo novo — só verificação e publicação.

- [ ] **Step 1: Checagem completa de tipos e build**

Run: `npx tsc --noEmit && npm run build`
Expected: os dois terminam sem erro.

- [ ] **Step 2: Checklist manual (precisa de login real no admin — não dá pra automatizar sem a senha do cliente)**

Documentar (não executar automaticamente) os seguintes passos pro humano confirmar depois do deploy, logado de verdade no painel:
1. Aba Cardápio → "Ingredientes e Estoque": cadastrar um ingrediente, registrar uma compra, conferir que o estoque e o custo médio atualizaram.
2. Tentar registrar uma compra com preço bem diferente do custo médio → confirmar que aparece o aviso.
3. Registrar uma segunda compra do mesmo ingrediente, depois abrir o histórico e **editar** a primeira compra pra um valor diferente → conferir que o custo médio recalculou certo (não incremental). Apagar uma compra do histórico → conferir que o estoque volta e o custo médio recalcula sem ela.
4. Em um prato do cardápio, clicar "🧂 Ficha técnica", adicionar um ingrediente com quantidade, salvar, reabrir e confirmar que salvou.
5. Simular um pedido de teste com esse prato → conferir no Firestore (ou reabrindo o pedido) que `stockDeducted` virou `true`, o estoque do ingrediente baixou, e `ingredientCost` foi gravado.
6. Cadastrar um segundo prato com ficha técnica usando um ingrediente **recém-criado sem nenhuma compra ainda** (custo médio 0) → simular um pedido com ele e conferir que `incompleteCostItemIds` grava esse item, e que o Financeiro mostra o aviso de custo incompleto (não custo R$0 silencioso).
7. Apagar o pedido de teste do passo 5 → conferir que o estoque do ingrediente voltou ao valor de antes.
8. Aba Financeiro: preencher uma taxa de cartão (ex.: 3%), conferir que ela aparece descontada nos cards; conferir que os cards de Hoje/Semana/Mês aparecem, que o card do mês mostra Gastos fixos, Total comprado no período e Lucro líquido, e que o ranking de pratos mostra o prato do passo 4 — e que o prato do passo 6 aparece separado, marcado como custo incompleto, não no ranking.
9. Cadastrar uma despesa fixa e conferir que ela entra na conta do card do mês.
10. Fechar e reabrir o painel (recarregar a página) com algum pedido antigo sem `stockDeducted` (se houver) → conferir que a varredura de recuperação roda sem travar nada e sem aparecer nenhum erro visível.

- [ ] **Step 3: Publicar as novas regras do Firestore**

O humano (não o agente) precisa colar o `firestore.rules` atualizado no Firebase Console (Firestore Database → Regras) e clicar Publicar — mesma rotina já usada nesse projeto pra toda mudança de regra.

- [ ] **Step 4: Commit final (se sobrou algo sem commitar) e push**

```bash
git status
git add -A
git commit -m "Ajustes finais do sistema de estoque e financeiro" # só se houver algo pendente
git push
```

- [ ] **Step 5: Conferir o deploy automático**

```bash
gh run list --limit 1
gh run watch <id-do-run-mais-recente> --exit-status
```

Expected: workflow "Deploy to GitHub Pages" termina em sucesso.
