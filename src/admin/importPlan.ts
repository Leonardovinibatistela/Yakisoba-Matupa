// Só regra — nada de tela nem de Firebase aqui, pra dar pra testar sozinho.
// Importação de ingredientes + fichas técnicas a partir de um arquivo (plano) — ver ImportPanel.tsx.

export type ImportUnit = "kg" | "g" | "l" | "ml" | "un";

/** O arquivo de importação. Quantidades sempre na unidade do ingrediente (ex.: 0,05 = 50 g de um ingrediente em kg). */
export type ImportPlan = {
  versao: 1;
  descricao?: string;
  ingredientes: { nome: string; unidade: ImportUnit; categoria?: string | null; custoReferencia: number }[];
  fichas: { pratoId: string; itens: { ingrediente: string; quantidade: number }[]; custoPlanilha?: number; observacao?: string }[];
};

export type ExistingIngredient = { id: string; name: string; unit: ImportUnit; avgCost: number };
export type ExistingRecipes = Record<string, { ingredientId: string; quantity: number }[]>;
export type CatalogEntry = { id: string; name: string; price: number };

export type IngredientAction =
  | { kind: "criar"; nome: string; unidade: ImportUnit; categoria: string | null; custo: number }
  | { kind: "existe"; nome: string; id: string; unidade: ImportUnit; custoNoSistema: number; custoDoArquivo: number; diverge: boolean };

export type RecipeAction = {
  pratoId: string;
  pratoNome: string;
  preco: number;
  itens: { ingrediente: string; quantidade: number; unidade: ImportUnit; custoUnitario: number; custo: number }[];
  custo: number;
  margemPct: number | null;
  custoPlanilha: number | null;
  observacao: string | null;
  /** já existe ficha desse prato (ela será substituída) */
  substitui: { itens: number } | null;
};

export type ImportPreview = { ingredientes: IngredientAction[]; fichas: RecipeAction[]; erros: string[]; avisos: string[] };

/** Sem acento, sem maiúscula, sem espaço sobrando — pra "ALGA", "Alga" e "alga " serem o mesmo ingrediente. */
export const normalizeName = (value: string): string => value.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\s+/g, " ").trim();

const UNITS: ImportUnit[] = ["kg", "g", "l", "ml", "un"];
const isPositive = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value) && value > 0;

/** Confere o formato do arquivo lido do disco. Devolve o plano ou a lista de problemas. */
export function parsePlan(raw: unknown): { plan: ImportPlan | null; erros: string[] } {
  const erros: string[] = [];
  const obj = raw as Partial<ImportPlan> | null;
  if (!obj || typeof obj !== "object") return { plan: null, erros: ["O arquivo não é um plano de importação válido."] };
  if (obj.versao !== 1) erros.push('O arquivo precisa ter "versao": 1.');
  if (!Array.isArray(obj.ingredientes)) erros.push('Falta a lista "ingredientes".');
  if (!Array.isArray(obj.fichas)) erros.push('Falta a lista "fichas".');
  if (erros.length > 0) return { plan: null, erros };
  obj.ingredientes!.forEach((ingredient, index) => {
    if (!ingredient || typeof ingredient.nome !== "string" || !ingredient.nome.trim()) erros.push(`Ingrediente ${index + 1}: falta o nome.`);
    else if (!UNITS.includes(ingredient.unidade)) erros.push(`Ingrediente "${ingredient.nome}": unidade "${String(ingredient.unidade)}" inválida (use kg, g, l, ml ou un).`);
    else if (typeof ingredient.custoReferencia !== "number" || !Number.isFinite(ingredient.custoReferencia) || ingredient.custoReferencia < 0) erros.push(`Ingrediente "${ingredient.nome}": custo inválido.`);
  });
  obj.fichas!.forEach((ficha, index) => {
    if (!ficha || typeof ficha.pratoId !== "string" || !ficha.pratoId.trim()) erros.push(`Ficha ${index + 1}: falta o pratoId.`);
    else if (!Array.isArray(ficha.itens) || ficha.itens.length === 0) erros.push(`Ficha "${ficha.pratoId}": sem itens.`);
  });
  return erros.length > 0 ? { plan: null, erros } : { plan: obj as ImportPlan, erros: [] };
}

/**
 * Compara o plano com o que já existe no sistema e diz o que vai acontecer — SEM gravar nada.
 * Ingrediente que já existe (mesmo nome, ignorando acento e maiúscula) é reaproveitado com o custo que ele já tem
 * (que vem de compras de verdade); só ingrediente novo é criado, com o custo de referência do arquivo.
 */
export function buildImportPreview(plan: ImportPlan, existing: ExistingIngredient[], recipes: ExistingRecipes, catalog: CatalogEntry[]): ImportPreview {
  const erros: string[] = [];
  const avisos: string[] = [];
  const byName = new Map(existing.map((ingredient) => [normalizeName(ingredient.name), ingredient]));
  const catalogById = new Map(catalog.map((entry) => [entry.id, entry]));

  // nome normalizado -> { unidade, custo } (o que vai valer pras contas das fichas)
  const resolved = new Map<string, { unidade: ImportUnit; custo: number; nomeExibido: string }>();
  const ingredientes: IngredientAction[] = [];
  const seenPlanNames = new Set<string>();

  plan.ingredientes.forEach((item) => {
    const key = normalizeName(item.nome);
    if (seenPlanNames.has(key)) { erros.push(`O ingrediente "${item.nome}" aparece duas vezes no arquivo.`); return; }
    seenPlanNames.add(key);
    const found = byName.get(key);
    if (found) {
      if (found.unit !== item.unidade) erros.push(`"${item.nome}" já existe no sistema em "${found.unit}", mas o arquivo usa "${item.unidade}". Conserte o arquivo pra bater com o sistema.`);
      const diverge = item.custoReferencia > 0 && found.avgCost > 0 && Math.abs(found.avgCost - item.custoReferencia) / item.custoReferencia > 0.05;
      ingredientes.push({ kind: "existe", nome: found.name, id: found.id, unidade: found.unit, custoNoSistema: found.avgCost, custoDoArquivo: item.custoReferencia, diverge });
      resolved.set(key, { unidade: found.unit, custo: found.avgCost, nomeExibido: found.name });
    } else {
      ingredientes.push({ kind: "criar", nome: item.nome.trim(), unidade: item.unidade, categoria: item.categoria ?? null, custo: item.custoReferencia });
      resolved.set(key, { unidade: item.unidade, custo: item.custoReferencia, nomeExibido: item.nome.trim() });
    }
  });

  const fichas: RecipeAction[] = [];
  const seenDishes = new Set<string>();
  plan.fichas.forEach((ficha) => {
    if (seenDishes.has(ficha.pratoId)) { erros.push(`O prato "${ficha.pratoId}" aparece duas vezes no arquivo.`); return; }
    seenDishes.add(ficha.pratoId);
    const dish = catalogById.get(ficha.pratoId);
    if (!dish) { erros.push(`Prato "${ficha.pratoId}" não existe no cardápio.`); return; }
    const itens: RecipeAction["itens"] = [];
    let custo = 0;
    let broken = false;
    ficha.itens.forEach((line) => {
      const info = resolved.get(normalizeName(line.ingrediente));
      if (!info) { erros.push(`Ficha "${dish.name}": o ingrediente "${line.ingrediente}" não está na lista de ingredientes do arquivo nem no sistema.`); broken = true; return; }
      if (!isPositive(line.quantidade)) { erros.push(`Ficha "${dish.name}": quantidade inválida de "${line.ingrediente}".`); broken = true; return; }
      const lineCost = line.quantidade * info.custo;
      custo += lineCost;
      itens.push({ ingrediente: info.nomeExibido, quantidade: line.quantidade, unidade: info.unidade, custoUnitario: info.custo, custo: lineCost });
    });
    if (broken) return;
    const current = recipes[ficha.pratoId];
    fichas.push({
      pratoId: ficha.pratoId, pratoNome: dish.name, preco: dish.price, itens, custo,
      margemPct: dish.price > 0 ? (dish.price - custo) / dish.price : null,
      custoPlanilha: typeof ficha.custoPlanilha === "number" ? ficha.custoPlanilha : null,
      observacao: ficha.observacao ?? null,
      substitui: current && current.length > 0 ? { itens: current.length } : null,
    });
    if (typeof ficha.custoPlanilha === "number" && Math.abs(custo - ficha.custoPlanilha) > 0.5) avisos.push(`"${dish.name}": o custo no sistema ficaria R$ ${custo.toFixed(2).replace(".", ",")}, e na planilha é R$ ${ficha.custoPlanilha.toFixed(2).replace(".", ",")}.`);
  });

  ingredientes.forEach((action) => { if (action.kind === "existe" && action.diverge) avisos.push(`"${action.nome}": o sistema tem R$ ${action.custoNoSistema.toFixed(2).replace(".", ",")} (das compras registradas) e o arquivo R$ ${action.custoDoArquivo.toFixed(2).replace(".", ",")}. Vale o do sistema.`); });
  return { ingredientes, fichas, erros, avisos };
}
