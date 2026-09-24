import { useMemo, useState } from "react";
import type { Ingredient } from "./ingredients";
import type { RecipeIngredient, Recipes } from "./recipes";
import { buildImportPreview, normalizeName, parsePlan, type CatalogEntry, type ImportPlan, type ImportUnit } from "./importPlan";
import { withTimeout } from "./stockFormat";

const money = (value: number) => value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const pct = (value: number | null) => (value === null ? "—" : `${Math.round(value * 100)}%`);
const round = (value: number) => Math.round(value * 1000) / 1000;

/** 0,05 kg vira "50 g", 0,5 un vira "0,5 un" — mais fácil de conferir do que kg com casa decimal. */
function formatQty(quantity: number, unit: ImportUnit): string {
  if (unit === "kg" && quantity < 1) return `${round(quantity * 1000).toLocaleString("pt-BR")} g`;
  if (unit === "l" && quantity < 1) return `${round(quantity * 1000).toLocaleString("pt-BR")} ml`;
  return `${round(quantity).toLocaleString("pt-BR")} ${unit}`;
}

type Props = {
  ingredients: Ingredient[];
  recipes: Recipes;
  catalog: CatalogEntry[];
  onAddIngredient: (name: string, unit: ImportUnit, category: string | null) => Promise<string>;
  onSetReferenceCost: (ingredientId: string, cost: number) => Promise<void>;
  onSetRecipe: (itemId: string, ingredients: RecipeIngredient[]) => Promise<void>;
};

export default function ImportPanel({ ingredients, recipes, catalog, onAddIngredient, onSetReferenceCost, onSetRecipe }: Props) {
  const [fileName, setFileName] = useState<string | null>(null);
  const [plan, setPlan] = useState<ImportPlan | null>(null);
  const [readErrors, setReadErrors] = useState<string[]>([]);
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState("");
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);

  // Recalcula sozinho quando o sistema muda (ex.: depois de aplicar, os ingredientes criados passam a "já existe").
  const preview = useMemo(() => (plan ? buildImportPreview(plan, ingredients.map((ingredient) => ({ id: ingredient.id, name: ingredient.name, unit: ingredient.unit, avgCost: ingredient.avgCost })), recipes, catalog) : null), [plan, ingredients, recipes, catalog]);

  const handleFile = async (file: File | undefined) => {
    setResult(null);
    setPlan(null);
    setReadErrors([]);
    if (!file) return;
    setFileName(file.name);
    try {
      const parsed = parsePlan(JSON.parse(await file.text()));
      if (parsed.plan) setPlan(parsed.plan); else setReadErrors(parsed.erros);
    } catch {
      setReadErrors(["Não consegui ler esse arquivo. Ele precisa ser o arquivo .json da importação."]);
    }
  };

  const criar = preview?.ingredientes.filter((action) => action.kind === "criar").length ?? 0;
  const substituem = preview?.fichas.filter((ficha) => ficha.substitui).length ?? 0;
  const totalMudancas = criar + (preview?.fichas.length ?? 0);
  const blocked = !preview || preview.erros.length > 0 || totalMudancas === 0 || running;

  const apply = async () => {
    if (!preview || blocked) return;
    const question = `Vai criar ${criar} ingrediente${criar === 1 ? "" : "s"} e gravar ${preview.fichas.length} ficha${preview.fichas.length === 1 ? "" : "s"}${substituem > 0 ? ` (${substituem} ${substituem === 1 ? "substitui uma ficha que já existe" : "substituem fichas que já existem"})` : ""}.\n\nJá baixou um backup na aba Backup?\n\nAplicar agora?`;
    if (!window.confirm(question)) return;
    setRunning(true);
    setResult(null);
    const idsByName = new Map(ingredients.map((ingredient) => [normalizeName(ingredient.name), ingredient.id]));
    let done = 0;
    try {
      for (const action of preview.ingredientes) {
        if (action.kind !== "criar") continue;
        setProgress(`Criando ingrediente: ${action.nome}…`);
        const id = await withTimeout(onAddIngredient(action.nome, action.unidade, action.categoria));
        await withTimeout(onSetReferenceCost(id, action.custo));
        idsByName.set(normalizeName(action.nome), id);
        done += 1;
      }
      for (const ficha of preview.fichas) {
        setProgress(`Gravando a ficha: ${ficha.pratoNome}…`);
        const rows: RecipeIngredient[] = ficha.itens.map((line) => ({ ingredientId: idsByName.get(normalizeName(line.ingrediente)) as string, quantity: line.quantidade }));
        await withTimeout(onSetRecipe(ficha.pratoId, rows));
        done += 1;
      }
      setResult({ ok: true, message: `✓ Importação aplicada: ${criar} ingrediente${criar === 1 ? "" : "s"} criado${criar === 1 ? "" : "s"} e ${preview.fichas.length} ficha${preview.fichas.length === 1 ? "" : "s"} gravada${preview.fichas.length === 1 ? "" : "s"}.` });
    } catch {
      setResult({ ok: false, message: `Parou no meio (${done} de ${totalMudancas} feitos). Confere a internet e escolhe o mesmo arquivo de novo: o que já foi feito é reconhecido e não duplica.` });
    } finally {
      setRunning(false);
      setProgress("");
    }
  };

  return (
    <section className="mt-10 rounded-2xl border border-white/10 bg-[#171211] p-4 sm:p-6">
      <p className="text-xs font-bold uppercase tracking-[.18em] text-[#ff7c50]">Importar</p>
      <h2 className="mt-1 font-display text-xl font-extrabold tracking-[-.03em]">Ingredientes e fichas técnicas por arquivo</h2>
      <p className="mt-1.5 text-sm text-white/55">Escolha o arquivo de importação (.json). Antes de gravar, esta tela mostra tudo o que vai mudar. <strong className="text-white/80">Nada é gravado até você clicar em Aplicar.</strong> Ingrediente que já existe é reaproveitado, com o custo das compras que já estão no sistema. Baixe um backup na aba Backup antes.</p>

      <label className="mt-4 inline-flex min-h-[44px] cursor-pointer items-center gap-2 rounded-full bg-[#ff5a19] px-5 py-2.5 text-sm font-bold text-white transition hover:bg-[#ff6a2e]">
        📂 Escolher arquivo
        <input type="file" accept=".json,application/json" className="hidden" onChange={(event) => { void handleFile(event.target.files?.[0]); event.target.value = ""; }} />
      </label>
      {fileName && <span className="ml-3 text-xs text-white/50">{fileName}</span>}

      {readErrors.length > 0 && <ul role="alert" className="mt-4 space-y-1 rounded-xl border border-red-400/40 bg-red-500/10 p-3 text-sm text-red-200">{readErrors.map((error) => <li key={error}>⚠️ {error}</li>)}</ul>}

      {preview && (
        <div className="mt-5 space-y-5">
          {preview.erros.length > 0 && <div role="alert" className="rounded-xl border border-red-400/40 bg-red-500/10 p-3 text-sm text-red-200"><p className="font-bold">Não dá pra aplicar ainda — conserte o arquivo:</p><ul className="mt-1 space-y-1">{preview.erros.map((error) => <li key={error}>⚠️ {error}</li>)}</ul></div>}
          {preview.avisos.length > 0 && <div className="rounded-xl border border-amber-400/40 bg-amber-400/10 p-3 text-sm text-amber-200"><p className="font-bold">Repare nisto (não impede de aplicar):</p><ul className="mt-1 space-y-1">{preview.avisos.map((aviso) => <li key={aviso}>• {aviso}</li>)}</ul></div>}

          <div>
            <h3 className="text-sm font-extrabold text-white/85">Ingredientes ({preview.ingredientes.length})</h3>
            <ul className="mt-2 divide-y divide-white/10 rounded-xl border border-white/10 text-sm">
              {preview.ingredientes.map((action) => (
                <li key={action.nome} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2">
                  <span className="font-semibold">{action.nome} <span className="font-normal text-white/40">({action.unidade})</span></span>
                  {action.kind === "criar"
                    ? <span className="text-emerald-300">＋ Criar · custo {money(action.custo)}/{action.unidade}</span>
                    : <span className="text-white/60">✓ Já existe · custo no sistema {money(action.custoNoSistema)}/{action.unidade}{action.diverge ? <span className="text-amber-300"> (arquivo: {money(action.custoDoArquivo)})</span> : null}</span>}
                </li>
              ))}
            </ul>
          </div>

          <div>
            <h3 className="text-sm font-extrabold text-white/85">Fichas técnicas ({preview.fichas.length})</h3>
            <div className="mt-2 space-y-2">
              {preview.fichas.map((ficha) => (
                <details key={ficha.pratoId} className="rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2 text-sm">
                  <summary className="cursor-pointer">
                    <span className="font-bold">{ficha.pratoNome}</span>
                    <span className="ml-2 text-white/60">custo {money(ficha.custo)} · preço {money(ficha.preco)} · margem {pct(ficha.margemPct)}</span>
                    {ficha.custoPlanilha !== null && <span className="ml-2 text-xs text-white/40">(planilha: {money(ficha.custoPlanilha)})</span>}
                    {ficha.substitui && <span className="ml-2 rounded bg-amber-400/20 px-1.5 py-0.5 text-[10px] font-bold text-amber-200">substitui a ficha atual ({ficha.substitui.itens} itens)</span>}
                  </summary>
                  <ul className="mt-2 space-y-1 text-xs text-white/70">
                    {ficha.itens.map((line, index) => <li key={`${line.ingrediente}-${index}`} className="flex justify-between gap-3"><span>{line.ingrediente} — {formatQty(line.quantidade, line.unidade)}</span><span className="tabular-nums">{money(line.custo)}</span></li>)}
                    {ficha.observacao && <li className="pt-1 text-white/45">Obs.: {ficha.observacao}</li>}
                  </ul>
                </details>
              ))}
            </div>
          </div>

          <button type="button" onClick={apply} disabled={blocked} className="min-h-[44px] rounded-full bg-emerald-500 px-6 py-2.5 text-sm font-extrabold text-white transition hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-40">{running ? "Aplicando…" : totalMudancas === 0 ? "Nada a fazer" : `Aplicar (${totalMudancas} mudança${totalMudancas === 1 ? "" : "s"})`}</button>
        </div>
      )}

      {progress && <p role="status" className="mt-3 text-sm text-white/60">{progress}</p>}
      {result && <p role={result.ok ? "status" : "alert"} className={`mt-3 text-sm font-bold ${result.ok ? "text-emerald-300" : "text-red-400"}`}>{result.message}</p>}
    </section>
  );
}
