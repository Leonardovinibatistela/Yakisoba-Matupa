import { useEffect, useMemo, useRef, useState } from "react";
import { addonSections, menuSections } from "../menuData";
import type { CustomMenuItem } from "../customItems";
import type { DailyCombo } from "../dailyCombos";
import { flatDeliveryFee, type DeliveryFeeConfig } from "../deliveryFeeRule";
import { newOrderId, registerOrderWithRetry } from "../orders";
import { SAVE_FAILED, normalize, parseNumber, toDraft, withTimeout } from "./stockFormat";
import {
  ADDON_SEPARATOR, INSTANCE_SEPARATOR, MANUAL_SOURCES, MAX_NAME_LENGTH, MAX_PHONE_LENGTH, addonCartId, baseItemId, buildCatalog, buildLines, buildManualOrderPayload, linesSubtotal, round2,
  type CatalogItem, type Cutlery, type ManualOrderForm, type ManualSource, type PaymentMethod,
} from "./manualOrderLogic";

const money = (value: number) => value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const inputClass = "min-h-[44px] w-full rounded-lg border border-white/15 bg-white/[0.06] px-2.5 py-1.5 text-[16px] text-white outline-none placeholder:text-white/30 focus:border-[#ff6b32] md:min-h-0 md:text-sm";
const labelClass = "text-[10px] font-bold uppercase tracking-[.14em] text-white/45";
const pillBase = "min-h-[40px] rounded-full border px-3.5 py-2 text-xs font-bold transition md:min-h-0";
const pillOn = "border-[#ff5a19] bg-[#ff5a19] text-white";
const pillOff = "border-white/15 text-white/60 hover:border-white/35 hover:text-white";

const PAYMENTS: { id: PaymentMethod; label: string }[] = [{ id: "pix", label: "Pix" }, { id: "cartao", label: "Cartão" }, { id: "dinheiro", label: "Dinheiro" }];
const CUTLERY: { id: Cutlery; label: string }[] = [{ id: "hashi", label: "Hashi" }, { id: "garfo", label: "Garfo" }, { id: "nenhum", label: "Não precisa" }];

type Props = {
  customItems: CustomMenuItem[];
  dailyCombos: DailyCombo[] | null;
  soldOutIds: Set<string>;
  hiddenIds: Set<string>;
  priceOverrides: Record<string, number>;
  nameOverrides: Record<string, string>;
  deliveryFeeConfig: DeliveryFeeConfig | null;
};

/**
 * Aba "Pedido manual": a equipe digita aqui o pedido que chegou por telefone, WhatsApp ou balcão, no lugar de
 * abrir o site público. O pedido é gravado igual ao do site (mesmo número sequencial, mesma coleção), então toca o
 * sininho, desconta o estoque, imprime (se a impressora estiver ligada) e entra no Financeiro sozinho. Funciona
 * mesmo com o site fechado, pausado ou fora do horário — quem decide aqui é a equipe.
 */
export default function ManualOrderPanel({ customItems, dailyCombos, soldOutIds, hiddenIds, priceOverrides, nameOverrides, deliveryFeeConfig }: Props) {
  const [quantities, setQuantities] = useState<Record<string, number>>({});
  const [search, setSearch] = useState("");
  const [source, setSource] = useState<ManualSource>("telefone");
  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [deliveryType, setDeliveryType] = useState<"retirada" | "entrega">("retirada");
  const [street, setStreet] = useState("");
  const [houseNumber, setHouseNumber] = useState("");
  const [neighborhood, setNeighborhood] = useState("");
  const defaultFee = flatDeliveryFee(deliveryFeeConfig);
  const [feeDraft, setFeeDraft] = useState(() => toDraft(defaultFee));
  const [feeTouched, setFeeTouched] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("pix");
  const [cutlery, setCutlery] = useState<Cutlery>("nenhum");
  const [chopstickAdapter, setChopstickAdapter] = useState(false);
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<{ orderNumber: number; total: number } | null>(null);
  // Código do pedido fixo durante as tentativas (um duplo clique ou uma nova tentativa nunca cria dois pedidos).
  const orderIdRef = useRef<string | null>(null);
  const instanceSeq = useRef(0);
  const topRef = useRef<HTMLDivElement>(null);
  const orderColumnRef = useRef<HTMLDivElement>(null);

  // A taxa chega do banco depois que a aba abre; enquanto a equipe não mexer no campo, ele acompanha o valor configurado.
  useEffect(() => { if (!feeTouched) setFeeDraft(toDraft(defaultFee)); }, [defaultFee, feeTouched]);

  const catalog = useMemo(() => buildCatalog({ menuSections, addonSections, customItems, dailyCombos: dailyCombos ?? [], soldOutIds, hiddenIds, priceOverrides, nameOverrides, today: new Date() }), [customItems, dailyCombos, soldOutIds, hiddenIds, priceOverrides, nameOverrides]);
  const lookup = useMemo(() => {
    const map = new Map<string, { name: string; price: number }>();
    catalog.sections.forEach((section) => section.items.forEach((item) => map.set(item.id, { name: item.name, price: item.price })));
    catalog.addons.forEach((section) => section.items.forEach((item) => map.set(item.id, { name: item.name, price: item.price })));
    return map;
  }, [catalog]);
  const lines = useMemo(() => buildLines(quantities, lookup), [quantities, lookup]);
  const subtotal = linesSubtotal(lines);
  const feeValue = parseNumber(feeDraft);
  const fee = deliveryType === "entrega" ? (Number.isFinite(feeValue) ? round2(feeValue) : 0) : 0;
  const total = round2(subtotal + fee);

  const touch = () => { setError(null); setDone(null); };
  const addItem = (item: CatalogItem, yaki: boolean) => {
    touch();
    if (yaki) {
      // Cada yakisoba é uma unidade própria (pode ter adicionais diferentes) — igual ao site.
      instanceSeq.current += 1;
      const instanceId = `${item.id}${INSTANCE_SEPARATOR}${Date.now().toString(36)}${instanceSeq.current}`;
      setQuantities((current) => ({ ...current, [instanceId]: 1 }));
    } else {
      setQuantities((current) => ({ ...current, [item.id]: (current[item.id] ?? 0) + 1 }));
    }
  };
  const changeQuantity = (id: string, delta: number) => {
    touch();
    setQuantities((current) => {
      const next = { ...current };
      const value = (next[id] ?? 0) + delta;
      if (value <= 0) {
        delete next[id];
        // Tirar a unidade tira também os adicionais dela (não sobra adicional "órfão").
        Object.keys(next).forEach((key) => { if (key.startsWith(id + ADDON_SEPARATOR)) delete next[key]; });
      } else {
        next[id] = value;
      }
      return next;
    });
  };

  const resetForm = () => {
    setQuantities({});
    setSearch("");
    setCustomerName("");
    setCustomerPhone("");
    setDeliveryType("retirada");
    setStreet("");
    setHouseNumber("");
    setNeighborhood("");
    setFeeTouched(false);
    setPaymentMethod("pix");
    setCutlery("nenhum");
    setChopstickAdapter(false);
    setNotes("");
    setError(null);
  };

  const submit = () => {
    if (submitting) return;
    setDone(null);
    const form: ManualOrderForm = { source, customerName, customerPhone, deliveryType, street, houseNumber, neighborhood, deliveryFee: deliveryType === "entrega" ? feeValue : 0, paymentMethod, cutlery, chopstickAdapter, notes };
    const result = buildManualOrderPayload(lines, form);
    if (!result.ok) { setError(result.error); return; }
    setError(null);
    setSubmitting(true);
    const orderId = orderIdRef.current ?? (orderIdRef.current = newOrderId());
    withTimeout(registerOrderWithRetry(result.payload, orderId), 45000)
      .then((orderNumber) => {
        orderIdRef.current = null;
        setDone({ orderNumber, total: result.payload.total });
        resetForm();
        // O botão fica lá embaixo e o aviso de sucesso no topo: leva a tela até o aviso.
        topRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      })
      .catch(() => setError(`${SAVE_FAILED} Seus dados continuam na tela. Antes de tentar de novo, confira na "Visão geral" se o pedido já não apareceu.`))
      .finally(() => setSubmitting(false));
  };

  const searchTerm = normalize(search.trim());
  const visibleSections = catalog.sections
    .map((section) => ({ ...section, items: searchTerm ? section.items.filter((item) => normalize(item.name).includes(searchTerm)) : section.items }))
    .filter((section) => section.items.length > 0);

  // Numera "(unidade 1)", "(unidade 2)" quando o mesmo prato aparece mais de uma vez (cada yakisoba tem seus adicionais).
  const parentLines = lines.filter((line) => !line.parentId);
  const occurrences = new Map<string, number>();
  parentLines.forEach((line) => occurrences.set(line.name, (occurrences.get(line.name) ?? 0) + 1));
  const seen = new Map<string, number>();
  const labelFor = (line: { id: string; name: string }) => {
    if ((occurrences.get(line.name) ?? 0) <= 1) return line.name;
    const n = (seen.get(line.name) ?? 0) + 1;
    seen.set(line.name, n);
    return `${line.name} (unidade ${n})`;
  };

  const yakiBase = (cartId: string) => baseItemId(cartId);
  const isYakiInstance = (cartId: string) => cartId.includes(INSTANCE_SEPARATOR) && catalog.sections.some((section) => section.allowsAddons && section.items.some((item) => item.id === yakiBase(cartId)));

  return (
    <div ref={topRef} className={`mt-10 scroll-mt-4 rounded-2xl border border-white/10 bg-[#171211] p-4 sm:p-6 ${lines.length > 0 ? "pb-24 sm:pb-24 lg:pb-6" : ""}`}>
      <p className="text-xs font-bold uppercase tracking-[.18em] text-[#ff7c50]">Pedido manual</p>
      <h2 className="mt-1 font-display text-xl font-extrabold tracking-[-.03em]">Lançar pedido de telefone, WhatsApp ou balcão</h2>
      <p className="mt-1.5 text-sm text-white/50">Escolha os itens, preencha os dados e registre. O pedido entra igual ao do site: toca o sininho, imprime (se a impressora estiver ligada), desconta o estoque e entra no Financeiro. Funciona mesmo com o site fechado.</p>

      {done && <p role="status" className="mt-4 rounded-xl border border-emerald-400/40 bg-emerald-500/10 px-4 py-3 text-sm font-bold text-emerald-200">✓ Pedido #{done.orderNumber} registrado — {money(done.total)}. Já aparece na "Visão geral".</p>}

      <div className="mt-5 grid grid-cols-[minmax(0,1fr)] gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,420px)]">
        <div>
          <label htmlFor="manual-search" className={labelClass}>Buscar item</label>
          <input id="manual-search" type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="ex: frango, combinado, coca…" className={`mt-1.5 ${inputClass}`} />
          <div className="mt-4 space-y-5">
            {visibleSections.length === 0 && <p className="text-sm text-white/45">Nenhum item encontrado.</p>}
            {visibleSections.map((section) => (
              <section key={section.id}>
                <h3 className="text-xs font-bold uppercase tracking-[.14em] text-[#ff9b79]">{section.title}</h3>
                <ul className="mt-2 divide-y divide-white/10 overflow-hidden rounded-xl border border-white/10">
                  {section.items.map((item) => {
                    const count = section.allowsAddons ? Object.keys(quantities).filter((id) => !id.includes(ADDON_SEPARATOR) && id.startsWith(item.id + INSTANCE_SEPARATOR)).length : (quantities[item.id] ?? 0);
                    return (
                      <li key={item.id} className="flex items-center justify-between gap-3 bg-white/[0.02] px-3 py-2.5">
                        <div className="min-w-0">
                          <p className={`text-sm font-bold ${item.soldOut ? "text-white/35 line-through" : "text-white"}`}>{item.name}{count > 0 && <span className="ml-2 rounded-full bg-[#ff5a19] px-2 py-0.5 text-[10px] font-bold text-white">{count}</span>}</p>
                          {item.description && <p className="mt-0.5 truncate text-[11px] text-white/40">{item.description}</p>}
                          <p className="mt-0.5 text-xs font-semibold text-white/55">{money(item.price)}{item.soldOut ? " · esgotado" : ""}</p>
                        </div>
                        <button type="button" disabled={item.soldOut} onClick={() => addItem(item, section.allowsAddons)} className="min-h-[40px] shrink-0 rounded-full border border-[#ff5a19]/50 px-3.5 py-2 text-xs font-bold text-[#ff8b60] transition hover:bg-[#ff5a19]/15 disabled:cursor-not-allowed disabled:opacity-40 md:min-h-0">+ Adicionar</button>
                      </li>
                    );
                  })}
                </ul>
              </section>
            ))}
          </div>
        </div>

        <div ref={orderColumnRef} className="scroll-mt-4 space-y-5 lg:sticky lg:top-4 lg:self-start">
          <section className="rounded-xl border border-white/10 bg-white/[0.03] p-3 sm:p-4">
            <p className={labelClass}>Itens do pedido</p>
            {lines.length === 0 ? <p className="mt-2 text-sm text-white/40">Nada escolhido ainda.</p> : (
              <ul className="mt-2 space-y-3">
                {parentLines.map((line) => {
                  const addonsOfLine = lines.filter((other) => other.parentId === line.id);
                  const yaki = isYakiInstance(line.id);
                  return (
                    <li key={line.id} className="border-b border-white/10 pb-3 last:border-b-0 last:pb-0">
                      <div className="flex items-start justify-between gap-3">
                        <p className="text-sm font-bold text-white">{yaki ? labelFor(line) : `${line.quantity}x ${line.name}`}</p>
                        <span className="shrink-0 text-sm font-bold text-[#ff8b60]">{money(round2(line.price * line.quantity))}</span>
                      </div>
                      <div className="mt-1.5 flex items-center gap-2">
                        {!yaki && <button type="button" aria-label={`Menos um ${line.name}`} onClick={() => changeQuantity(line.id, -1)} className="grid h-9 w-9 place-items-center rounded-full border border-white/20 text-base font-bold text-white/80 hover:border-white/50 md:h-7 md:w-7">−</button>}
                        {!yaki && <button type="button" aria-label={`Mais um ${line.name}`} onClick={() => changeQuantity(line.id, 1)} className="grid h-9 w-9 place-items-center rounded-full border border-white/20 text-base font-bold text-white/80 hover:border-white/50 md:h-7 md:w-7">+</button>}
                        <button type="button" onClick={() => changeQuantity(line.id, -line.quantity)} className="rounded-full border border-red-400/30 px-3 py-1.5 text-[11px] font-bold text-red-300 hover:border-red-400/60 hover:bg-red-400/10">Remover</button>
                      </div>
                      {yaki && (
                        <div className="mt-2">
                          {addonsOfLine.length > 0 && <ul className="mb-2 space-y-1">{addonsOfLine.map((addon) => (
                            <li key={addon.id} className="flex items-center justify-between gap-2 text-xs text-white/70">
                              <span>+ {addon.quantity}x {addon.name}</span>
                              <span className="flex items-center gap-2"><span>{money(round2(addon.price * addon.quantity))}</span><button type="button" aria-label={`Tirar um ${addon.name}`} onClick={() => changeQuantity(addon.id, -1)} className="grid h-7 w-7 place-items-center rounded-full border border-white/20 text-sm font-bold text-white/70 hover:border-white/50">−</button></span>
                            </li>
                          ))}</ul>}
                          <details className="group rounded-lg border border-white/10 bg-white/[0.03]">
                            <summary className="cursor-pointer select-none px-3 py-2 text-xs font-bold text-[#ff9b79]">+ Adicionais (legumes e carnes)</summary>
                            <div className="space-y-2.5 px-3 pb-3">
                              {catalog.addons.map((group) => (
                                <div key={group.id}>
                                  <p className="text-[10px] font-bold uppercase tracking-[.12em] text-white/40">{group.title}</p>
                                  <div className="mt-1.5 flex flex-wrap gap-1.5">
                                    {group.items.map((addon) => (
                                      <button key={addon.id} type="button" disabled={addon.soldOut} onClick={() => { touch(); setQuantities((current) => ({ ...current, [addonCartId(line.id, addon.id)]: (current[addonCartId(line.id, addon.id)] ?? 0) + 1 })); }} className="rounded-full border border-white/15 px-3 py-1.5 text-[11px] font-bold text-white/70 transition hover:border-[#ff5a19]/60 hover:text-white disabled:cursor-not-allowed disabled:opacity-35">
                                        {addon.name} · {money(addon.price)}
                                      </button>
                                    ))}
                                  </div>
                                </div>
                              ))}
                            </div>
                          </details>
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </section>

          <section className="space-y-4 rounded-xl border border-white/10 bg-white/[0.03] p-3 sm:p-4">
            <div>
              <p className={labelClass}>Como o pedido chegou</p>
              <div className="mt-2 flex flex-wrap gap-2">{MANUAL_SOURCES.map((option) => <button key={option.id} type="button" onClick={() => { setSource(option.id); touch(); }} className={`${pillBase} ${source === option.id ? pillOn : pillOff}`}>{option.label}</button>)}</div>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label htmlFor="manual-name" className={labelClass}>Nome {source === "balcao" ? "(opcional)" : ""}</label>
                <input id="manual-name" type="text" value={customerName} maxLength={MAX_NAME_LENGTH} onChange={(event) => { setCustomerName(event.target.value); touch(); }} placeholder={source === "balcao" ? "Balcão" : "Nome do cliente"} className={`mt-1.5 ${inputClass}`} />
              </div>
              <div>
                <label htmlFor="manual-phone" className={labelClass}>Telefone (opcional)</label>
                <input id="manual-phone" type="tel" inputMode="tel" value={customerPhone} maxLength={MAX_PHONE_LENGTH} onChange={(event) => { setCustomerPhone(event.target.value); touch(); }} placeholder="(66) 9…" className={`mt-1.5 ${inputClass}`} />
              </div>
            </div>
            <div>
              <p className={labelClass}>Entrega ou retirada</p>
              <div className="mt-2 flex flex-wrap gap-2">
                <button type="button" onClick={() => { setDeliveryType("retirada"); touch(); }} className={`${pillBase} ${deliveryType === "retirada" ? pillOn : pillOff}`}>Retirada no local</button>
                <button type="button" onClick={() => { setDeliveryType("entrega"); touch(); }} className={`${pillBase} ${deliveryType === "entrega" ? pillOn : pillOff}`}>Entrega</button>
              </div>
              {deliveryType === "entrega" && (
                <div className="mt-3 space-y-3">
                  <input type="text" aria-label="Rua" value={street} maxLength={150} onChange={(event) => { setStreet(event.target.value); touch(); }} placeholder="Rua / avenida" className={inputClass} />
                  <div className="grid grid-cols-[110px_minmax(0,1fr)] gap-3">
                    <input type="text" aria-label="Número" value={houseNumber} maxLength={20} onChange={(event) => { setHouseNumber(event.target.value); touch(); }} placeholder="Nº (ou s/n)" className={inputClass} />
                    <input type="text" aria-label="Bairro" value={neighborhood} maxLength={80} onChange={(event) => { setNeighborhood(event.target.value); touch(); }} placeholder="Bairro" className={inputClass} />
                  </div>
                  <div>
                    <label htmlFor="manual-fee" className={labelClass}>Taxa de entrega (R$)</label>
                    <input id="manual-fee" type="text" inputMode="decimal" value={feeDraft} onChange={(event) => { setFeeDraft(event.target.value); setFeeTouched(true); touch(); }} className={`mt-1.5 ${inputClass}`} />
                    <p className="mt-1 text-[11px] text-white/40">Já vem com o valor base ({money(defaultFee)}). Se for longe, troque pelo valor combinado com o cliente.</p>
                  </div>
                </div>
              )}
            </div>
            <div>
              <p className={labelClass}>Pagamento</p>
              <div className="mt-2 flex flex-wrap gap-2">{PAYMENTS.map((option) => <button key={option.id} type="button" onClick={() => { setPaymentMethod(option.id); touch(); }} className={`${pillBase} ${paymentMethod === option.id ? pillOn : pillOff}`}>{option.label}</button>)}</div>
            </div>
            <div>
              <p className={labelClass}>Talher</p>
              <div className="mt-2 flex flex-wrap gap-2">{CUTLERY.map((option) => <button key={option.id} type="button" onClick={() => { setCutlery(option.id); touch(); }} className={`${pillBase} ${cutlery === option.id ? pillOn : pillOff}`}>{option.label}</button>)}</div>
              {cutlery === "hashi" && (
                <div className="mt-3">
                  <p className="text-xs font-bold text-white/70">Adaptador de hashi? <span className="font-normal text-white/45">(ajuda a segurar)</span></p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    <button type="button" onClick={() => { setChopstickAdapter(true); touch(); }} className={`${pillBase} ${chopstickAdapter ? pillOn : pillOff}`}>Sim, quer</button>
                    <button type="button" onClick={() => { setChopstickAdapter(false); touch(); }} className={`${pillBase} ${!chopstickAdapter ? pillOn : pillOff}`}>Não</button>
                  </div>
                </div>
              )}
            </div>
            <div>
              <label htmlFor="manual-notes" className={labelClass}>Observações</label>
              <textarea id="manual-notes" rows={2} value={notes} maxLength={300} onChange={(event) => { setNotes(event.target.value); touch(); }} placeholder="Ex: sem cebola, troco para R$ 100…" className={`mt-1.5 resize-none ${inputClass}`} />
            </div>
          </section>

          <section className="rounded-xl border border-white/10 bg-white/[0.03] p-3 sm:p-4">
            <dl className="space-y-1 text-sm text-white/70">
              <div className="flex justify-between"><dt>Subtotal</dt><dd className="tabular-nums">{money(subtotal)}</dd></div>
              {deliveryType === "entrega" && <div className="flex justify-between"><dt>Entrega</dt><dd className="tabular-nums">{money(fee)}</dd></div>}
              <div className="flex justify-between border-t border-white/10 pt-2 text-base font-extrabold text-[#ff8b60]"><dt>Total</dt><dd className="tabular-nums">{money(total)}</dd></div>
            </dl>
            {error && <p role="alert" className="mt-3 text-xs font-semibold leading-relaxed text-red-400">{error}</p>}
            <button type="button" onClick={submit} disabled={submitting || lines.length === 0} className="mt-4 min-h-[48px] w-full rounded-full bg-[#ff5a19] px-5 py-3 text-sm font-bold text-white transition hover:bg-[#ff6a2e] disabled:cursor-not-allowed disabled:opacity-50">{submitting ? "Registrando…" : "Registrar pedido"}</button>
          </section>
        </div>
      </div>
      {lines.length > 0 && (
        <div className="fixed inset-x-0 bottom-0 z-30 flex items-center justify-between gap-3 border-t border-white/15 bg-[#171211]/95 px-4 py-3 backdrop-blur lg:hidden">
          <p className="text-sm font-bold text-white">{parentLines.length} {parentLines.length === 1 ? "item" : "itens"} · <span className="text-[#ff8b60]">{money(total)}</span></p>
          <button type="button" onClick={() => orderColumnRef.current?.scrollIntoView({ behavior: "smooth", block: "start" })} className="min-h-[40px] rounded-full bg-[#ff5a19] px-4 py-2 text-xs font-bold text-white">Ver pedido ↓</button>
        </div>
      )}
    </div>
  );
}
