import { useEffect, useState } from "react";
import { MAX_DELIVERY_FEE, computeDeliveryFee, describeDeliveryRule, isBeyondMaxKm, type DeliveryFeeConfig } from "../deliveryFeeRule";
import { SAVE_FAILED, parseNumber, toDraft, withTimeout } from "./stockFormat";

const money = (value: number) => value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const EXAMPLE_KMS = [3, 5, 7, 8, 10, 12, 15, 20];

type Drafts = { enabled: boolean; baseKm: string; baseFee: string; stepKm: string; stepFee: string; maxKm: string };

// Enquanto o cliente ainda não salvou nada, o cartão já vem com a regra que ele pediu — perto R$ 7, longe R$ 10:
// até 3,5 km (da loja até a Av. Oito Oeste, 117, na Zona Industrial: 3,5 km de carro no Google Maps) paga o valor base;
// passou disso soma R$ 3 uma vez só (a faixa de 200 km nunca chega na segunda). A cobrança começa DESLIGADA:
// o cliente liga no quadradinho e salva.
const toDrafts = (config: DeliveryFeeConfig | null): Drafts => config
  ? { enabled: config.enabled, baseKm: toDraft(config.baseKm), baseFee: toDraft(config.baseFee), stepKm: toDraft(config.stepKm), stepFee: toDraft(config.stepFee), maxKm: config.maxKm === null ? "" : toDraft(config.maxKm) }
  : { enabled: false, baseKm: "3,5", baseFee: "7", stepKm: "200", stepFee: "3", maxKm: "" };

/** Lê os campos. Devolve o erro em português, ou a configuração pronta pra salvar. */
function readDrafts(drafts: Drafts): { error: string } | { config: DeliveryFeeConfig } {
  const baseKm = parseNumber(drafts.baseKm), baseFee = parseNumber(drafts.baseFee), stepKm = parseNumber(drafts.stepKm), stepFee = parseNumber(drafts.stepFee);
  const maxKm = drafts.maxKm.trim() === "" ? null : parseNumber(drafts.maxKm);
  if ([baseKm, baseFee, stepKm, stepFee].some((value) => Number.isNaN(value)) || (maxKm !== null && Number.isNaN(maxKm))) return { error: "Preencha só números (pode usar vírgula)." };
  if (baseKm < 0 || baseKm > 200) return { error: "Os km do valor base têm que ficar entre 0 e 200." };
  if (baseFee < 0 || baseFee > MAX_DELIVERY_FEE) return { error: `O valor base tem que ficar entre R$ 0 e R$ ${MAX_DELIVERY_FEE}.` };
  if (!(stepKm > 0) || stepKm > 200) return { error: "\"A cada quantos km\" tem que ser maior que zero." };
  if (stepFee < 0 || stepFee > MAX_DELIVERY_FEE) return { error: `O valor a mais tem que ficar entre R$ 0 e R$ ${MAX_DELIVERY_FEE}.` };
  if (maxKm !== null && maxKm < baseKm) return { error: "O limite de entrega tem que ser maior ou igual aos km do valor base (ou deixe vazio pra não ter limite)." };
  if (maxKm !== null && maxKm <= 0) return { error: "O limite de entrega tem que ser maior que zero (ou deixe vazio pra não ter limite)." };
  return { config: { enabled: drafts.enabled, baseKm, baseFee, stepKm, stepFee, maxKm } };
}

/** Taxa de entrega por distância: até X km vale o valor base, e a cada Y km a mais soma um valor. Mostra na hora como fica pro cliente. */
export default function DeliveryFeePanel({ config, onSave }: { config: DeliveryFeeConfig | null; onSave: (config: DeliveryFeeConfig) => Promise<void> }) {
  const [drafts, setDrafts] = useState<Drafts>(() => toDrafts(config));
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [testKm, setTestKm] = useState("");
  // Se a configuração chegar (ou mudar em outro aparelho) e o cliente ainda não mexeu em nada, acompanha.
  useEffect(() => { if (!dirty) setDrafts(toDrafts(config)); }, [config, dirty]);

  const edit = (patch: Partial<Drafts>) => { setDrafts((current) => ({ ...current, ...patch })); setDirty(true); setSaved(false); setError(null); };
  const parsed = readDrafts(drafts);
  const valid = "config" in parsed ? parsed.config : null;
  const handleSave = () => {
    if (!valid) { setError("error" in parsed ? parsed.error : null); return; }
    setSaving(true);
    withTimeout(onSave(valid))
      .then(() => { setDirty(false); setSaved(true); })
      .catch(() => setError(SAVE_FAILED))
      .finally(() => setSaving(false));
  };
  const testValue = testKm.trim() === "" ? null : parseNumber(testKm);
  const testOk = testValue !== null && !Number.isNaN(testValue) && testValue >= 0;

  const fields: { key: "baseKm" | "baseFee" | "stepKm" | "stepFee" | "maxKm"; label: string; hint: string; placeholder?: string }[] = [
    { key: "baseKm", label: "Até quantos km vale o valor base?", hint: "Até essa distância o cliente paga só o valor base." },
    { key: "baseFee", label: "Valor base (R$)", hint: "O que cobra de quem está dentro desse limite." },
    { key: "stepKm", label: "A cada quantos km a mais?", hint: "Passou do limite, começa a cobrar a mais a cada faixa de km (1 km, 2 km...)." },
    { key: "stepFee", label: "Quanto soma a cada faixa (R$)", hint: "Esse valor é somado a cada faixa que passar do limite." },
    { key: "maxKm", label: "Entrega até quantos km? (opcional)", hint: "Mais longe que isso o site não deixa pedir entrega. Vazio = sem limite.", placeholder: "sem limite" },
  ];

  return (
    <div className="mt-10 rounded-2xl border border-white/10 bg-[#171211] p-4 sm:p-6">
      <p className="text-xs font-bold uppercase tracking-[.18em] text-[#ff7c50]">Taxa de entrega</p>
      <h2 className="mt-1 font-display text-xl font-extrabold tracking-[-.03em]">Cobrar mais de quem mora longe</h2>
      <p className="mt-1.5 text-sm text-white/50">O cliente que escolhe Entrega calcula a distância pela localização do celular e o site já mostra a taxa. Até o limite paga o valor base; depois disso soma um valor a cada faixa de km. A distância é estimada por estrada (linha reta × 1,3).</p>

      <label className="mt-4 flex cursor-pointer items-start gap-3 rounded-xl border border-white/10 bg-white/[0.03] p-3">
        <input type="checkbox" checked={drafts.enabled} onChange={(event) => edit({ enabled: event.target.checked })} className="mt-0.5 h-5 w-5 shrink-0 accent-[#ff5a19]" />
        <span>
          <span className="block text-sm font-bold text-white">Cobrar pela distância</span>
          <span className="mt-0.5 block text-xs text-white/50">{drafts.enabled ? "Ligado: quem pede entrega precisa calcular a taxa pela localização antes de finalizar." : "Desligado: taxa fixa (o valor base) pra todo mundo, sem pedir localização."}</span>
        </span>
      </label>

      <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {fields.map((field) => (
          <div key={field.key}>
            <label htmlFor={"deliveryfee-" + field.key} className="text-[10px] font-bold uppercase tracking-[.14em] text-white/45">{field.label}</label>
            <input id={"deliveryfee-" + field.key} type="text" inputMode="decimal" value={drafts[field.key]} placeholder={field.placeholder} onChange={(event) => edit({ [field.key]: event.target.value })} onKeyDown={(event) => { if (event.key === "Enter") handleSave(); }} className="mt-1.5 min-h-[44px] w-full rounded-lg border border-white/15 bg-white/[0.06] px-2.5 py-1.5 text-[16px] text-white outline-none focus:border-[#ff6b32] md:min-h-0 md:text-sm" />
            <p className="mt-1 text-[11px] leading-snug text-white/40">{field.hint}</p>
          </div>
        ))}
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <button type="button" onClick={handleSave} disabled={saving || !dirty} className="min-h-[44px] rounded-full bg-[#ff5a19] px-5 py-2 text-xs font-bold text-white transition hover:bg-[#ff6a2e] disabled:cursor-not-allowed disabled:opacity-50 md:min-h-0">{saving ? "Salvando…" : "Salvar"}</button>
        {saved && !dirty && <span role="status" className="text-xs font-bold text-emerald-300">✓ Salvo — o site já usa esses valores</span>}
        {dirty && !error && <span className="text-xs text-white/45">Tem alteração ainda não salva.</span>}
      </div>
      {error && <p role="alert" className="mt-2 text-xs font-semibold text-red-400">{error}</p>}

      {valid && (
        <div className="mt-5 rounded-xl border border-white/10 bg-white/[0.03] p-4">
          <p className="text-[10px] font-bold uppercase tracking-[.14em] text-white/45">Como fica pro cliente</p>
          <p className="mt-1 text-sm text-white/70">{describeDeliveryRule(valid)}</p>
          <dl className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
            {EXAMPLE_KMS.map((km) => {
              const beyond = isBeyondMaxKm(km, valid);
              return (
                <div key={km} className="rounded-lg bg-white/[0.04] px-3 py-2">
                  <dt className="text-[10px] font-bold uppercase tracking-[.12em] text-white/40">{km} km</dt>
                  <dd className={`mt-0.5 text-sm font-bold tabular-nums ${beyond ? "text-white/35" : "text-white/90"}`}>{beyond ? "não entrega" : money(computeDeliveryFee(km, valid))}</dd>
                </div>
              );
            })}
          </dl>
          <div className="mt-4 flex flex-wrap items-center gap-2 text-sm text-white/70">
            <label htmlFor="deliveryfee-test" className="text-xs font-bold text-white/55">Testar: cliente a</label>
            <input id="deliveryfee-test" type="text" inputMode="decimal" value={testKm} onChange={(event) => setTestKm(event.target.value)} placeholder="ex: 9,5" className="w-24 rounded-lg border border-white/15 bg-white/[0.06] px-2.5 py-1.5 text-[16px] text-white outline-none focus:border-[#ff6b32] md:text-sm" />
            <span className="text-xs font-bold text-white/55">km →</span>
            <strong className="tabular-nums text-white">{testOk ? (isBeyondMaxKm(testValue, valid) ? "não entrega" : money(computeDeliveryFee(testValue, valid))) : "—"}</strong>
          </div>
        </div>
      )}
    </div>
  );
}
