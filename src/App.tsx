import { Fragment, useEffect, useMemo, useState } from "react";
import { registerOrder, type OrderPayload } from "./orders";
import { fetchCarouselImages, type CarouselImage } from "./carousel";

type MenuItem = { id: string; name: string; description?: string; price: number; priceLabel: string; image?: string };
type MenuSection = { id: string; eyebrow: string; title: string; subtitle?: string; items: MenuItem[] };

const menuSections: MenuSection[] = [
  { id: "combinados", eyebrow: "Combinados", title: "Combinados", items: [
    { id: "combo-48", name: "Combinado 48 peças", description: "6 hot roll, 30 sushis sortidos, 4 jou, 8 sashimis", price: 185, priceLabel: "$185", image: "cardapio/combo-48.jpg" },
    { id: "combo-32", name: "Combinado 32 peças", description: "8 hot roll, 20 sushis sortidos, 4 sashimis", price: 145, priceLabel: "$145", image: "cardapio/combo-32.jpg" },
    { id: "combo-28", name: "Combinado 28 peças", description: "8 hot roll, 20 sushis sortidos", price: 89, priceLabel: "$89", image: "cardapio/combo-28.jpg" },
    { id: "combo-57", name: "Combinado especial 57 peças", description: "8 hot roll, 33 sushis sortidos, 4 jou, 4 uniguiri, 8 sashimi, 300g ceviche de tilápia", price: 280, priceLabel: "$280", image: "cardapio/combo-57.png" },
  ] },
  { id: "porcoes", eyebrow: "Porções individuais", title: "Porções individuais", items: [
    { id: "hot-roll", name: "Hot Roll Filadélfia (8 unidades)", price: 32.9, priceLabel: "$32,90", image: "cardapio/hot-roll.jpg" },
    { id: "hossomaki", name: "Hossomaki (8 unidades)", price: 30.9, priceLabel: "$30,90", image: "cardapio/hossomaki.jpg" },
    { id: "uramaki-fila", name: "Uramaki Filadélfia (8 unidades)", price: 35.9, priceLabel: "$35,90", image: "cardapio/uramaki-fila.jpg" },
    { id: "uramaki-grelhado", name: "Uramaki Grelhado (8 unidades)", price: 35.9, priceLabel: "$35,90", image: "cardapio/uramaki-grelhado.jpg" },
    { id: "uramaki-skin", name: "Uramaki Skin (8 unidades)", price: 32.9, priceLabel: "$32,90", image: "cardapio/uramaki-skin.jpg" },
    { id: "sashimi-salmao", name: "Sashimi Salmão (5 unidades)", price: 45.9, priceLabel: "$45,90", image: "cardapio/sashimi-salmao.jpg" },
    { id: "ceviche", name: "Ceviche Tilápia (300g)", price: 53.9, priceLabel: "$53,90", image: "cardapio/ceviche.jpg" },
    { id: "sushi-dog", name: "Sushi Dog (120g de salmão cru)", price: 52.9, priceLabel: "$52,90", image: "cardapio/sushi-dog.jpg" },
    { id: "sushi-dog-grelhado", name: "Sushi Dog Salmão Grelhado (120g de salmão grelhado)", price: 52.9, priceLabel: "$52,90", image: "cardapio/sushi-dog-grelhado.jpg" },
  ] },
  { id: "yaki-medio", eyebrow: "Yakisoba Médio (500g)", title: "Seu yakisoba, do seu jeito", items: [
    { id: "medio-porco", name: "Porco 500g", price: 36.9, priceLabel: "R$36,90", image: "cardapio/yaki-porco.jpg" },
    { id: "medio-frango", name: "Frango 500g", price: 33.9, priceLabel: "R$33,90", image: "cardapio/yaki-frango.jpg" },
    { id: "medio-misto", name: "Misto 500g", price: 35.9, priceLabel: "R$35,90", image: "cardapio/yaki-carne.jpg" },
    { id: "medio-carne", name: "Carne 500g", price: 38.9, priceLabel: "R$38,90", image: "cardapio/yaki-carne.jpg" },
  ] },
  { id: "yaki-grande", eyebrow: "Yakisoba Grande (750g)", title: "Mais sabor para compartilhar", items: [
    { id: "grande-carne", name: "Carne 750g", price: 49.9, priceLabel: "R$49,90", image: "cardapio/yaki-carne.jpg" },
    { id: "grande-porco", name: "Porco 750g", price: 45.9, priceLabel: "R$45,90", image: "cardapio/yaki-porco.jpg" },
    { id: "grande-frango", name: "Frango 750g", price: 41.9, priceLabel: "R$41,90", image: "cardapio/yaki-frango.jpg" },
    { id: "grande-misto", name: "Misto 750g", price: 47.9, priceLabel: "R$47,90", image: "cardapio/yaki-carne.jpg" },
  ] },
  { id: "yaki-proteico", eyebrow: "Yaki Proteico (sem macarrão)", title: "Yaki Proteico", subtitle: "G com 200g de proteína, M com 150g de proteína", items: [
    { id: "proteico-frango-g", name: "Frango (G)", price: 33.9, priceLabel: "R$33,90", image: "cardapio/proteico-frango.jpg" },
    { id: "proteico-frango-m", name: "Frango (M)", price: 23.9, priceLabel: "R$23,90", image: "cardapio/proteico-frango.jpg" },
    { id: "proteico-carne-g", name: "Carne (G)", price: 47.9, priceLabel: "R$47,90", image: "cardapio/proteico-carne.jpg" },
    { id: "proteico-carne-m", name: "Carne (M)", price: 35.9, priceLabel: "R$35,90", image: "cardapio/proteico-carne.jpg" },
    { id: "proteico-misto-g", name: "Misto (G)", price: 37.9, priceLabel: "R$37,90", image: "cardapio/proteico-misto.jpg" },
    { id: "proteico-misto-m", name: "Misto (M)", price: 27.9, priceLabel: "R$27,90", image: "cardapio/proteico-misto.jpg" },
  ] },
  { id: "bebidas", eyebrow: "Bebidas", title: "Pra acompanhar", items: [
    { id: "coca-lata", name: "Coca-Cola lata", price: 5, priceLabel: "R$5,00", image: "cardapio/coca-lata.webp" },
    { id: "agua-com-gas", name: "Água com gás", price: 5, priceLabel: "R$5,00", image: "cardapio/agua-com-gas.jpg" },
    { id: "coca-1-5", name: "Coca-Cola 1,5L", price: 12, priceLabel: "R$12,00", image: "cardapio/coca-1-5.webp" },
  ] },
];

const addonSections: MenuSection[] = [
  { id: "legumes", eyebrow: "Adicionais de legumes", title: "Mais cor, mais crocância", items: [
    { id: "brocolis", name: "Brócolis", price: 3, priceLabel: "R$3,00" }, { id: "couve-flor", name: "Couve flor", price: 3, priceLabel: "R$3,00" }, { id: "repolho", name: "Repolho", price: 3, priceLabel: "R$3,00" }, { id: "repolho-roxo", name: "Repolho roxo", price: 3, priceLabel: "R$3,00" }, { id: "pimentao-vermelho", name: "Pimentão vermelho", price: 3, priceLabel: "R$3,00" }, { id: "pimentao-amarelo", name: "Pimentão amarelo", price: 3, priceLabel: "R$3,00" }, { id: "cebola", name: "Cebola", price: 3, priceLabel: "R$3,00" }, { id: "cenoura", name: "Cenoura", price: 3, priceLabel: "R$3,00" }, { id: "todos-legumes", name: "Todos", price: 10, priceLabel: "R$10,00" },
  ] },
  { id: "carnes", eyebrow: "Adicionais de carnes", title: "Complete seu pedido", items: [
    { id: "frango-extra", name: "Carne de frango", price: 4, priceLabel: "R$4,00" }, { id: "bovina-extra", name: "Carne bovina", price: 5, priceLabel: "R$5,00" },
  ] },
];

type ComboOffer = MenuItem & { days: number[]; daysLabel: string };
const comboOffers: ComboOffer[] = [
  { id: "combo-individual", name: "Combo Individual", price: 65.9, priceLabel: "R$65,90", description: "1 Yakisoba Médio, 1 porção de Hot Roll, 1 Coca-Cola lata", days: [1, 2], daysLabel: "Segunda e Terça", image: "cardapio/combo-individual.jpg" },
  { id: "combo-duplo", name: "Combo Duplo", price: 74.9, priceLabel: "R$74,90", description: "2 Yakisobas Médios + 1 Coca-Cola 1,5L", days: [3, 4], daysLabel: "Quarta e Quinta", image: "cardapio/combo-duplo.jpg" },
  { id: "combo-familia", name: "Combo Família", price: 114.9, priceLabel: "R$114,90", description: "1 Yakisoba Grande + 1 Yakisoba Médio + 1 Porção de Hot Roll + 1 Coca-Cola 1,5L", days: [5, 6, 0], daysLabel: "Sexta, Sábado e Domingo", image: "cardapio/combo-familia.jpg" },
];

const allItems = [...menuSections, ...addonSections].flatMap((section) => section.items).concat(comboOffers);
const allItemsById = new Map(allItems.map((item) => [item.id, item]));

// Acompanhamento vira uma linha de carrinho PRÓPRIA, com id composto
// "<item pai>::<acompanhamento>" — assim "Couve flor" pedida junto do Frango
// e "Couve flor" pedida junto do Porco nunca se misturam no carrinho.
type CartLine = MenuItem & { parentId?: string };
const ADDON_SEPARATOR = "::";
const addonCartId = (parentId: string, addonId: string) => `${parentId}${ADDON_SEPARATOR}${addonId}`;
const parseAddonCartId = (id: string): { parentId: string; addonId: string } | null => {
  const separatorIndex = id.indexOf(ADDON_SEPARATOR);
  if (separatorIndex === -1) return null;
  return { parentId: id.slice(0, separatorIndex), addonId: id.slice(separatorIndex + ADDON_SEPARATOR.length) };
};
const resolveCartLine = (id: string): CartLine | null => {
  const parsed = parseAddonCartId(id);
  if (parsed) {
    const addon = allItemsById.get(parsed.addonId);
    return addon ? { ...addon, id, parentId: parsed.parentId } : null;
  }
  const direct = allItemsById.get(id);
  return direct ? { ...direct } : null;
};
/** Agrupa uma lista de linhas do carrinho: cada item "pai" com seus acompanhamentos logo abaixo, e os que ficaram sem pai (caso raro) por último. */
const groupCartLines = (lines: CartLine[]) => {
  const parents = lines.filter((line) => !line.parentId);
  const groups = parents.map((parent) => ({ parent, addons: lines.filter((line) => line.parentId === parent.id) }));
  const orphanAddons = lines.filter((line) => line.parentId && !parents.some((parent) => parent.id === line.parentId));
  return { groups, orphanAddons };
};
const formatTotal = (value: number) => value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const DELIVERY_FEE = 7;
const yakiSectionIds = ["yaki-medio", "yaki-grande"];
// Horário de funcionamento: seg-sex 18:30-21h, sáb-dom 18:30-23h.
function isStoreOpen(date = new Date()) {
  const day = date.getDay(); // 0 = domingo ... 6 = sábado
  const minutesNow = date.getHours() * 60 + date.getMinutes();
  const openMinutes = 18 * 60 + 30;
  const isWeekend = day === 0 || day === 6;
  const closeMinutes = isWeekend ? 23 * 60 : 21 * 60;
  return minutesNow >= openMinutes && minutesNow < closeMinutes;
}
const STORE_HOURS_LABEL = "Seg a Sex 18:30–21h · Sáb e Dom 18:30–23h";
const cutleryOptions: { id: "hashi" | "garfo" | "nenhum"; label: string }[] = [{ id: "hashi", label: "Hashi" }, { id: "garfo", label: "Garfo" }, { id: "nenhum", label: "Não preciso" }];
const paymentOptions: { id: "pix" | "cartao" | "dinheiro"; label: string }[] = [{ id: "pix", label: "Pix" }, { id: "cartao", label: "Cartão" }, { id: "dinheiro", label: "Dinheiro" }];
const PIX_KEY = "66992026783";
const STORE_PICKUP_LABEL = "Rua 4, nº 916 A – Bairro Cidade Alta, Matupá/MT";
const STORE_PICKUP_MAPS_URL = "https://www.google.com/maps/search/?api=1&query=-10.168631,-54.914070";

function PlusIcon({ className = "" }: { className?: string }) { return <svg className={className} viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></svg>; }
function MinusIcon({ className = "" }: { className?: string }) { return <svg className={className} viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></svg>; }
function CartIcon({ className = "" }: { className?: string }) { return <svg className={className} viewBox="0 0 24 24" aria-hidden="true"><path d="M3 3h2l2.1 11.3a2 2 0 0 0 2 1.7h7.9a2 2 0 0 0 1.9-1.4L21 7H6" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /><circle cx="9" cy="20" r="1.25" fill="currentColor" /><circle cx="18" cy="20" r="1.25" fill="currentColor" /></svg>; }
function ArrowIcon({ className = "" }: { className?: string }) { return <svg className={className} viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>; }
function WhatsAppIcon({ className = "" }: { className?: string }) { return <svg className={className} viewBox="0 0 24 24" aria-hidden="true"><path d="M20.5 11.9a8.2 8.2 0 0 1-12 7.3L3.5 20.5l1.3-4.8a8.2 8.2 0 1 1 15.7-3.8Z" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /><path d="M8.4 7.8c.2-.4.4-.4.7-.4h.5c.2 0 .4.1.5.4l.7 1.6c.1.3.1.5-.1.7l-.5.6c.5 1 1.2 1.7 2.2 2.2l.6-.5c.2-.2.4-.2.7-.1l1.6.7c.3.1.4.3.4.5v.5c0 .3 0 .5-.4.7-.3.2-.9.4-1.4.3-2.8-.4-5.1-2.7-5.5-5.5-.1-.5.1-1.1.3-1.4Z" fill="currentColor" stroke="none" /></svg>; }
function Logo() { return <a href="#inicio" className="group flex items-center gap-2.5" aria-label="Sooba Yakisoba e Sushi - início"><img src="sooba-logo.jpg" alt="Sooba Yakisoba e Sushi" className="h-11 w-11 rounded-full object-cover shadow-[0_0_26px_rgba(255,90,25,.35)] ring-1 ring-white/10 transition group-hover:scale-105" /></a>; }

function QuantityControl({ quantity, onChange, label, dark = false }: { quantity: number; onChange: (next: number) => void; label: string; dark?: boolean }) { return <div className={`flex h-10 items-center rounded-full border ${dark ? "border-white/10 bg-white/[0.055]" : "border-[#1a1513]/15 bg-white"}`} aria-label={`Quantidade de ${label}`}><button type="button" onClick={() => onChange(Math.max(0, quantity - 1))} aria-label={`Remover uma unidade de ${label}`} className={`grid h-full w-10 place-items-center transition hover:text-[#ff6b32] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#ff6b32] ${dark ? "text-white/70" : "text-[#1a1513]/70"}`}><MinusIcon className="h-3.5 w-3.5" /></button><span className={`w-5 text-center text-sm font-bold ${dark ? "text-white" : "text-[#1a1513]"}`}>{quantity}</span><button type="button" onClick={() => onChange(quantity + 1)} aria-label={`Adicionar uma unidade de ${label}`} className={`grid h-full w-10 place-items-center transition hover:text-[#ff6b32] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#ff6b32] ${dark ? "text-white/70" : "text-[#1a1513]/70"}`}><PlusIcon className="h-3.5 w-3.5" /></button></div>; }

export default function App() {
  const [quantities, setQuantities] = useState<Record<string, number>>({});
  const [activeSection, setActiveSection] = useState(menuSections[0].id);
  const [cartOpen, setCartOpen] = useState(false);
  const [deliveryType, setDeliveryType] = useState<"retirada" | "entrega">("retirada");
  const [cutlery, setCutlery] = useState<"hashi" | "garfo" | "nenhum">("nenhum");
  const [paymentMethod, setPaymentMethod] = useState<"pix" | "cartao" | "dinheiro">("pix");
  const [pixCopied, setPixCopied] = useState(false);
  const [confirmedOrderNumber, setConfirmedOrderNumber] = useState<number | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [storeOpen, setStoreOpen] = useState(() => isStoreOpen());
  useEffect(() => {
    const interval = setInterval(() => setStoreOpen(isStoreOpen()), 30000);
    return () => clearInterval(interval);
  }, []);
  const [notes, setNotes] = useState("");
  const [location, setLocation] = useState("");
  const [locatingGps, setLocatingGps] = useState(false);
  useEffect(() => {
    const elements = Array.from(document.querySelectorAll<HTMLElement>(".reveal-on-scroll"));
    if (!("IntersectionObserver" in window)) { elements.forEach((el) => el.classList.add("is-revealed")); return; }
    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) { entry.target.classList.add("is-revealed"); observer.unobserve(entry.target); }
      });
    }, { threshold: 0.1, rootMargin: "0px 0px -5% 0px" });
    elements.forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, []);
  const cartItems = useMemo(() => Object.keys(quantities).filter((id) => quantities[id] > 0).map(resolveCartLine).filter((line): line is CartLine => line !== null), [quantities]);
  const totalQuantity = cartItems.reduce((total, item) => total + quantities[item.id], 0);
  const subtotal = cartItems.reduce((total, item) => total + item.price * quantities[item.id], 0);
  const deliveryFee = deliveryType === "entrega" ? DELIVERY_FEE : 0;
  const total = subtotal + deliveryFee;
  const setQuantity = (id: string, nextQuantity: number) => setQuantities((current) => ({ ...current, [id]: nextQuantity }));
  const changeSection = (id: string) => { setActiveSection(id); document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" }); };
  const requestLocation = () => {
    if (!navigator.geolocation) { setLocation((current) => current || "Meu navegador não permite localização automática — vou descrever o endereço."); return; }
    setLocatingGps(true);
    navigator.geolocation.getCurrentPosition(
      (position) => { setLocation(`https://maps.google.com/?q=${position.coords.latitude},${position.coords.longitude}`); setLocatingGps(false); },
      () => { setLocatingGps(false); },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  };
  const checkout = () => {
    if (!cartItems.length || !storeOpen || isSubmitting) return;
    setIsSubmitting(true);
    const orderTime = new Date().toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" });
    const cutleryLabel = cutleryOptions.find((option) => option.id === cutlery)?.label ?? "Hashi";
    const paymentLabel = paymentOptions.find((option) => option.id === paymentMethod)?.label ?? "Pix";
    const { groups, orphanAddons } = groupCartLines(cartItems);
    const itemLines = groups.flatMap(({ parent, addons }) => [
      `${quantities[parent.id]}x ${parent.name} - ${formatTotal(parent.price * quantities[parent.id])}`,
      ...addons.map((addon) => `   + ${quantities[addon.id]}x ${addon.name} - ${formatTotal(addon.price * quantities[addon.id])}`),
    ]).concat(orphanAddons.map((addon) => `${quantities[addon.id]}x ${addon.name} - ${formatTotal(addon.price * quantities[addon.id])}`));
    const buildMessage = () => [
      "Olá, Sooba! Gostaria de fazer este pedido:",
      "",
      ...itemLines,
      "",
      deliveryType === "entrega" ? `Entrega (+ ${formatTotal(DELIVERY_FEE)})${location ? `\nLocalização: ${location}` : ""}` : `Retirar no local\nLocal de retirada: ${STORE_PICKUP_LABEL}`,
      `Talher: ${cutleryLabel}`,
      `Forma de pagamento: ${paymentLabel}${paymentMethod === "pix" ? " (já vou pagar pela chave Pix)" : ""}`,
      ...(paymentMethod === "pix" ? ["📎 Vou anexar o comprovante do Pix aqui em seguida."] : []),
      ...(notes.trim() ? [`Observações: ${notes.trim()}`] : []),
      "",
      `Total do pedido: ${formatTotal(total)}`,
      "",
      `Horário do pedido: ${orderTime}`,
      "",
      "Aguardo a confirmação do pedido. Obrigado!",
    ].join("\n");
    const orderPayload: OrderPayload = {
      items: cartItems.map((item) => ({ id: item.id, name: item.name, quantity: quantities[item.id], unitPrice: item.price, lineTotal: item.price * quantities[item.id], ...(item.parentId ? { parentId: item.parentId } : {}) })),
      subtotal,
      deliveryFee,
      total,
      deliveryType,
      location,
      cutlery,
      paymentMethod,
      notes: notes.trim(),
    };
    // Abre o WhatsApp IMEDIATAMENTE e de forma síncrona, no mesmo instante do
    // clique — é a única forma realmente confiável de não ser bloqueado por
    // extensões/navegadores (qualquer espera, mesmo de poucos segundos, já é
    // suficiente pra alguns bloqueadores recusarem abrir a aba). O registro no
    // Firestore roda em segundo plano, sem atrasar a abertura.
    window.open(`https://wa.me/556692026783?text=${encodeURIComponent(buildMessage())}`, "_blank", "noopener,noreferrer");
    // Esvazia o carrinho na hora — além de ser o comportamento certo depois de
    // um pedido concluído, também evita que um clique duplo (ou o cliente
    // clicando de novo achando que não funcionou) crie um segundo pedido.
    setQuantities({});
    setIsSubmitting(false);
    registerOrder(orderPayload).then((orderNumber) => {
      setConfirmedOrderNumber(orderNumber);
      setTimeout(() => setConfirmedOrderNumber(null), 10000);
    }).catch(() => {});
  };
  return <div className="min-h-screen overflow-x-hidden bg-[#100d0c] text-[#f7f3ef] selection:bg-[#ff5a19] selection:text-white">
    <header className="fixed inset-x-0 top-0 z-40 border-b border-white/[0.07] bg-[#100d0c]/75 backdrop-blur-xl"><nav className="mx-auto flex h-[72px] max-w-7xl items-center justify-between px-5 lg:px-8" aria-label="Navegação principal"><Logo /><div className="hidden items-center gap-7 text-sm font-medium text-white/65 md:flex"><a className="transition hover:text-white" href="#menu">Cardápio</a><a className="transition hover:text-white" href="#sobre">A experiência</a><a className="transition hover:text-white" href="#duvidas">Dúvidas</a></div><button type="button" onClick={() => setCartOpen(true)} className="inline-flex items-center gap-2 rounded-full border border-[#ff6b32]/30 bg-[#ff5a19]/10 px-3.5 py-2 text-xs font-bold text-[#ff8b60] transition hover:border-[#ff6b32]/65 hover:bg-[#ff5a19]/20" aria-label="Abrir meu pedido"><CartIcon className="h-4 w-4" /><span className="hidden sm:inline">Meu Pedido</span>{totalQuantity > 0 && <span className="grid h-4 min-w-4 place-items-center rounded-full bg-[#ff5a19] px-1 text-[10px] text-white">{totalQuantity}</span>}</button></nav></header>
    {!storeOpen && <div className="relative z-30 mt-[72px] bg-[#ff5a19] px-5 py-3 text-center text-sm font-bold text-white">🕒 Estamos fechados agora — funcionamos {STORE_HOURS_LABEL}. Dá pra ver o cardápio, mas os pedidos só abrem no nosso horário.</div>}
    <main>
      <section id="inicio" className="relative isolate flex min-h-[780px] items-end overflow-hidden pt-[72px] sm:min-h-[790px] lg:min-h-[820px]" aria-labelledby="hero-title"><img src="sooba-hero.jpg" alt="Prato de yakisoba e seleção de sushi (uramaki, sashimi de salmão) do Sooba sobre mesa escura" className="absolute inset-0 -z-20 h-full w-full object-cover object-[62%_center] motion-safe:animate-[hero-in_1.2s_ease-out_both]" /><div className="absolute inset-0 -z-10 bg-[linear-gradient(90deg,rgba(16,13,12,.96)_0%,rgba(16,13,12,.80)_34%,rgba(16,13,12,.24)_75%),linear-gradient(0deg,rgba(16,13,12,.94)_0%,transparent_49%)]" /><div className="hero-glow absolute -left-28 top-36 -z-10 h-72 w-72 rounded-full bg-[#ff4d12]/20 blur-[105px]" /><div className="mx-auto w-full max-w-7xl px-5 pb-16 pt-24 sm:pb-20 lg:px-8 lg:pb-24"><div className="max-w-[655px]"><p className="reveal-up text-xs font-bold uppercase tracking-[0.23em] text-[#ff7c50]">Sushi e yakisoba delivery em Matupá e Peixoto de Azevedo</p><div className="reveal-up delay-1 mt-4 overflow-hidden"><p className="font-display text-[clamp(4.2rem,11vw,8.8rem)] font-black leading-[.76] tracking-[-0.105em] text-white">SOOBA<span className="text-[#ff5a19]">.</span></p></div><h1 id="hero-title" className="reveal-up delay-2 mt-7 max-w-xl font-display text-[clamp(2.25rem,4.3vw,4.4rem)] font-extrabold leading-[.95] tracking-[-0.07em] text-[#fff9f3]">Seu delivery favorito de sushi e yakisoba.</h1><p className="reveal-up delay-3 mt-5 max-w-md text-base leading-relaxed text-white/70 sm:text-lg">Uramaki, sashimi de salmão e yakisoba, prontos pra pedir. A gente prepara em Matupá, você confirma pelo WhatsApp.</p><div className="reveal-up delay-4 mt-8 flex flex-wrap gap-3"><a href="#menu" className="group inline-flex items-center gap-2 rounded-full bg-[#ff5a19] px-5 py-3.5 text-sm font-bold text-white shadow-[0_12px_35px_rgba(255,90,25,.24)] transition hover:-translate-y-0.5 hover:bg-[#ff6a2e]">Ver cardápio <ArrowIcon className="h-4 w-4 transition group-hover:translate-x-0.5" /></a><a href="https://wa.me/556692026783" target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/[0.07] px-5 py-3.5 text-sm font-bold text-white backdrop-blur-sm transition hover:-translate-y-0.5 hover:bg-white/[0.14]"><WhatsAppIcon className="h-4 w-4" /> Pedir no WhatsApp</a></div></div></div><a href="#menu" className="absolute bottom-7 right-6 hidden items-center gap-3 text-[10px] font-bold uppercase tracking-[.2em] text-white/60 lg:flex"><span className="h-px w-9 bg-white/30" /> Explore o cardápio</a></section>
      <section className="border-y border-white/[0.08] bg-[#171211] py-6" aria-label="Destaques do Sooba"><div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-x-10 gap-y-3 px-5 text-xs font-semibold uppercase tracking-[0.16em] text-white/55 lg:px-8"><span className="text-white/85">Sushi com presença</span><span className="hidden h-1 w-1 rounded-full bg-[#ff5a19] sm:block" /><span>Yakisoba feito na hora</span><span className="hidden h-1 w-1 rounded-full bg-[#ff5a19] sm:block" /><span>Pedido direto no WhatsApp</span></div></section>
      <PromoCarousel quantities={quantities} setQuantity={setQuantity} />
      <PhotoCarousel />
      <section id="sobre" className="bg-[#100d0c] py-20 sm:py-28" aria-labelledby="sobre-title"><div className="mx-auto grid max-w-7xl gap-12 px-5 lg:grid-cols-[.82fr_1.18fr] lg:items-end lg:gap-24 lg:px-8"><div className="reveal-on-scroll"><p className="text-xs font-bold uppercase tracking-[.22em] text-[#ff7548]">Do corte à wok</p><h2 id="sobre-title" className="mt-4 max-w-md font-display text-4xl font-extrabold leading-[.96] tracking-[-.065em] text-white sm:text-5xl">Duas vontades. Um pedido memorável.</h2><p className="mt-6 max-w-md text-base leading-relaxed text-white/62">Sushi para quem quer delicadeza. Yakisoba para quem quer intensidade. No Sooba, você escolhe os dois sem abrir mão do sabor.</p><a href="#menu" className="mt-7 inline-flex items-center gap-2 text-sm font-bold text-[#ff7c50] transition hover:text-[#ff9b79]">Montar meu pedido <ArrowIcon className="h-4 w-4" /></a></div><div className="grid grid-cols-2 gap-3 sm:gap-5"><figure className="reveal-on-scroll group relative col-span-1 aspect-[4/5] overflow-hidden bg-[#201817]"><img src="sooba-sushi.jpg" alt="Sushi, sashimi e hot rolls preparados pelo Sooba" className="h-full w-full object-cover transition duration-700 group-hover:scale-105" loading="lazy" /><figcaption className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent px-5 pb-5 pt-16 text-sm font-semibold text-white">Sushi que chama atenção</figcaption></figure><figure className="reveal-on-scroll delay-1 group relative mt-10 aspect-[4/5] overflow-hidden bg-[#201817] sm:mt-14"><img src="sooba-yakisoba.jpg" alt="Yakisoba com carne, legumes frescos e macarrão preparado pelo Sooba" className="h-full w-full object-cover transition duration-700 group-hover:scale-105" loading="lazy" /><figcaption className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent px-5 pb-5 pt-16 text-sm font-semibold text-white">Yakisoba de verdade</figcaption></figure></div></div></section>
      <MenuSectionView quantities={quantities} setQuantity={setQuantity} activeSection={activeSection} changeSection={changeSection} cartItems={cartItems} subtotal={subtotal} total={total} checkout={checkout} deliveryType={deliveryType} setDeliveryType={setDeliveryType} deliveryFee={deliveryFee} cutlery={cutlery} setCutlery={setCutlery} paymentMethod={paymentMethod} setPaymentMethod={setPaymentMethod} pixCopied={pixCopied} setPixCopied={setPixCopied} storeOpen={storeOpen} notes={notes} setNotes={setNotes} location={location} setLocation={setLocation} requestLocation={requestLocation} locatingGps={locatingGps} />
      <section className="bg-[#171211] py-20 sm:py-28" aria-labelledby="processo-title"><div className="mx-auto max-w-7xl px-5 lg:px-8"><div className="max-w-lg reveal-on-scroll"><p className="text-xs font-bold uppercase tracking-[.22em] text-[#ff7548]">Sem complicação</p><h2 id="processo-title" className="mt-4 font-display text-4xl font-extrabold leading-[.96] tracking-[-.065em] text-white sm:text-5xl">Do cardápio à sua mesa em poucos toques.</h2></div><div className="mt-12 grid gap-10 border-t border-white/10 pt-8 sm:grid-cols-3 sm:gap-8">{["Escolha", "Monte", "Confirme"].map((step, index) => <div key={step} className={`reveal-on-scroll delay-${index + 1}`}><span className="font-display text-6xl font-black tracking-[-.1em] text-[#ff5a19]">0{index + 1}</span><h3 className="mt-5 text-xl font-bold text-white">{step} seu sabor</h3><p className="mt-3 max-w-xs text-sm leading-relaxed text-white/55">{index === 0 ? "Navegue pelo cardápio e encontre o seu pedido ideal." : index === 1 ? "Adicione tudo ao Meu Pedido e acompanhe o total." : "Envie no WhatsApp para pagamento e confirmação."}</p></div>)}</div></div></section>
      <section className="bg-[#f5f0eb] py-20 text-[#191514] sm:py-28" aria-labelledby="voices-title"><div className="mx-auto max-w-7xl px-5 lg:px-8"><p className="text-xs font-bold uppercase tracking-[.22em] text-[#db4611]">Feito para matar a vontade</p><h2 id="voices-title" className="mt-4 max-w-xl font-display text-4xl font-extrabold leading-[.96] tracking-[-.065em] sm:text-5xl">Quando dá vontade de Sooba, você entende.</h2><div className="mt-12 grid gap-0 divide-y divide-[#1a1513]/15 border-y border-[#1a1513]/15 sm:grid-cols-3 sm:divide-x sm:divide-y-0">{[["O yakisoba chega com aquele cheirinho que abre o apetite antes da primeira garfada.", "Pedido de yakisoba"], ["Sushi bonito, saboroso e perfeito para transformar a noite em casa.", "Pedido de sushi"], ["O melhor é montar tudo e resolver o pedido no WhatsApp, sem enrolação.", "Pedido misto"]].map(([quote, label], index) => <figure key={label} className={`reveal-on-scroll py-7 sm:px-8 ${index === 0 ? "sm:pl-0" : ""}`}><blockquote className="font-display text-xl font-bold leading-snug tracking-[-.035em] text-[#2a211d]">“{quote}”</blockquote><figcaption className="mt-5 text-xs font-bold uppercase tracking-[.16em] text-[#946f5c]">{label}</figcaption></figure>)}</div></div></section>
      <section id="duvidas" className="bg-[#100d0c] py-20 sm:py-28" aria-labelledby="faq-title"><div className="mx-auto grid max-w-7xl gap-12 px-5 lg:grid-cols-[.75fr_1.25fr] lg:gap-24 lg:px-8"><div className="reveal-on-scroll"><p className="text-xs font-bold uppercase tracking-[.22em] text-[#ff7548]">Sem mistério</p><h2 id="faq-title" className="mt-4 font-display text-4xl font-extrabold leading-[.96] tracking-[-.065em] text-white sm:text-5xl">Dúvidas frequentes</h2><p className="mt-5 max-w-sm text-base leading-relaxed text-white/58">Prefere falar com a gente? Chame no WhatsApp e confirme os detalhes do seu pedido.</p><a href="https://wa.me/556692026783" target="_blank" rel="noreferrer" className="mt-7 inline-flex items-center gap-2 text-sm font-bold text-[#ff7c50] transition hover:text-[#ff9b79]"><WhatsAppIcon className="h-4 w-4" /> Falar no WhatsApp</a></div><div className="divide-y divide-white/10 border-y border-white/10"><FaqItem question="Como faço meu pedido?" answer="Adicione os itens ao Meu Pedido e toque em Finalizar pedido no WhatsApp. A mensagem já vai com seus itens, quantidades e total." /><FaqItem question="Como é feito o pagamento?" answer="O pagamento e a confirmação são combinados diretamente pelo WhatsApp com o Sooba." /><FaqItem question="Posso pedir sushi e yakisoba juntos?" answer="Sim. Monte seu pedido com os itens que quiser e envie tudo em uma única mensagem pelo WhatsApp." /></div></div></section>
      <section className="relative overflow-hidden bg-[#ff5a19] py-20 sm:py-24" aria-labelledby="cta-title"><div className="cta-orbit absolute -right-16 -top-20 h-80 w-80 rounded-full border border-white/20" /><div className="cta-orbit absolute -right-4 -top-8 h-56 w-56 rounded-full border border-white/20" /><div className="relative mx-auto max-w-7xl px-5 text-center lg:px-8"><p className="text-xs font-bold uppercase tracking-[.22em] text-white/75">Sabor no seu tempo</p><h2 id="cta-title" className="mx-auto mt-4 max-w-3xl font-display text-4xl font-extrabold leading-[.92] tracking-[-.07em] text-white sm:text-6xl">Seu pedido está a poucos toques de distância.</h2><a href="#menu" className="mt-8 inline-flex items-center gap-2 rounded-full bg-[#171211] px-6 py-4 text-sm font-bold text-white shadow-lg shadow-[#9a2c0c]/20 transition hover:-translate-y-0.5 hover:bg-black">Escolher do cardápio <ArrowIcon className="h-4 w-4" /></a></div></section>
    </main>
    <footer className="bg-[#100d0c] py-12 text-white/60"><div className="mx-auto flex max-w-7xl flex-col gap-10 px-5 lg:px-8"><div className="flex flex-col justify-between gap-8 sm:flex-row sm:items-end"><Logo /><div className="flex flex-col gap-1.5 text-sm sm:text-right"><a href="tel:+556692026783" className="font-semibold text-white transition hover:text-[#ff7c50]">(66) 9202-6783</a><a href="https://www.instagram.com/sooba.yakisoba" target="_blank" rel="noreferrer" className="transition hover:text-[#ff7c50]">Instagram @sooba.yakisoba</a></div></div><div className="flex flex-col justify-between gap-3 border-t border-white/10 pt-5 text-xs sm:flex-row"><p>Sooba Yakisoba Delivery</p><a href="#inicio" className="transition hover:text-white">Voltar ao topo</a></div></div></footer>
    <button type="button" onClick={() => setCartOpen(true)} className="fixed inset-x-3 bottom-3 z-40 flex items-center justify-between rounded-2xl bg-[#1d1714] px-4 py-3.5 text-white shadow-[0_15px_35px_rgba(0,0,0,.35)] ring-1 ring-white/10 lg:hidden" aria-label="Abrir meu pedido"><span className="flex items-center gap-2.5"><span className="grid h-9 w-9 place-items-center rounded-full bg-[#ff5a19]"><CartIcon className="h-4 w-4" /></span><span className="text-left"><span className="block text-xs font-bold">Meu Pedido</span><span className="block text-[11px] text-white/55">{totalQuantity ? `${totalQuantity} ${totalQuantity === 1 ? "item" : "itens"} selecionado${totalQuantity === 1 ? "" : "s"}` : "Nenhum item selecionado"}</span></span></span><span className="font-display text-lg font-extrabold tracking-[-.04em] text-[#ff875c]">{formatTotal(subtotal)}</span></button>
    {cartOpen && <div className="fixed inset-0 z-50 flex justify-end bg-black/55 backdrop-blur-sm" role="dialog" aria-modal="true" aria-label="Meu Pedido" onMouseDown={() => setCartOpen(false)}><div className="flex h-full w-full max-w-md flex-col bg-[#1a1513] shadow-2xl" onMouseDown={(event) => event.stopPropagation()}><div className="flex items-center justify-between border-b border-white/10 px-5 py-5"><div><p className="text-xs font-bold uppercase tracking-[.18em] text-[#ff7c50]">Sooba</p><h2 className="mt-1 font-display text-2xl font-extrabold tracking-[-.05em] text-white">Meu Pedido</h2></div><button type="button" onClick={() => setCartOpen(false)} className="grid h-10 w-10 place-items-center rounded-full border border-white/15 text-white/70 transition hover:border-white/35 hover:text-white" aria-label="Fechar pedido"><span className="text-xl leading-none">×</span></button></div><div className="min-h-0 flex-1 overflow-y-auto px-5 py-5"><CartSummary cartItems={cartItems} quantities={quantities} subtotal={subtotal} total={total} onQuantityChange={setQuantity} onCheckout={checkout} compact deliveryType={deliveryType} setDeliveryType={setDeliveryType} deliveryFee={deliveryFee} cutlery={cutlery} setCutlery={setCutlery} paymentMethod={paymentMethod} setPaymentMethod={setPaymentMethod} pixCopied={pixCopied} setPixCopied={setPixCopied} storeOpen={storeOpen} notes={notes} setNotes={setNotes} location={location} setLocation={setLocation} requestLocation={requestLocation} locatingGps={locatingGps} /></div></div></div>}
    {confirmedOrderNumber !== null && <div className="fixed inset-x-3 top-3 z-[60] mx-auto flex max-w-sm items-center gap-3 rounded-2xl border border-[#ff5a19]/40 bg-[#1a1513] px-4 py-3.5 shadow-[0_12px_35px_rgba(0,0,0,.4)] sm:left-1/2 sm:right-auto sm:-translate-x-1/2" role="status"><span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-[#ff5a19] font-display text-sm font-extrabold text-white">#{confirmedOrderNumber}</span><div><p className="text-sm font-bold text-white">Pedido #{confirmedOrderNumber} confirmado!</p><p className="text-xs text-white/55">Guarde esse número — ele também aparece no painel do Sooba.</p></div><button type="button" onClick={() => setConfirmedOrderNumber(null)} aria-label="Fechar aviso" className="ml-auto shrink-0 text-white/50 transition hover:text-white">×</button></div>}
  </div>;
}

function PhotoCarousel() {
  const [images, setImages] = useState<CarouselImage[] | null>(null);
  const [index, setIndex] = useState(0);
  useEffect(() => { fetchCarouselImages().then(setImages).catch(() => setImages([])); }, []);
  if (!images || images.length === 0) return null;
  const image = images[index % images.length];
  const goTo = (nextIndex: number) => setIndex((nextIndex + images.length) % images.length);
  return <section className="bg-[#171211] py-14 sm:py-16" aria-labelledby="fotos-title">
    <div className="mx-auto max-w-7xl px-5 lg:px-8">
      <p className="text-xs font-bold uppercase tracking-[.22em] text-[#ff7548]">Direto da cozinha</p>
      <h2 id="fotos-title" className="mt-2 font-display text-3xl font-extrabold tracking-[-.04em] text-white sm:text-4xl">Confira o que está saindo</h2>
      <div className="relative mt-8 overflow-hidden rounded-3xl border border-white/10">
        <img src={image.url} alt="Foto do Sooba" className="h-64 w-full object-cover sm:h-80" />
        {images.length > 1 && <>
          <button type="button" onClick={() => goTo(index - 1)} aria-label="Foto anterior" className="absolute left-3 top-1/2 grid h-9 w-9 -translate-y-1/2 place-items-center rounded-full bg-black/50 text-white backdrop-blur transition hover:bg-black/70"><ArrowIcon className="h-4 w-4 rotate-180" /></button>
          <button type="button" onClick={() => goTo(index + 1)} aria-label="Próxima foto" className="absolute right-3 top-1/2 grid h-9 w-9 -translate-y-1/2 place-items-center rounded-full bg-black/50 text-white backdrop-blur transition hover:bg-black/70"><ArrowIcon className="h-4 w-4" /></button>
          <div className="absolute bottom-3 left-1/2 flex -translate-x-1/2 items-center gap-2">{images.map((img, i) => <button key={img.id} type="button" onClick={() => setIndex(i)} aria-label={`Ver foto ${i + 1}`} className={`h-2 rounded-full transition-all ${i === index ? "w-6 bg-[#ff5a19]" : "w-2 bg-white/50 hover:bg-white/75"}`} />)}</div>
        </>}
      </div>
    </div>
  </section>;
}

function PromoCarousel({ quantities, setQuantity }: { quantities: Record<string, number>; setQuantity: (id: string, nextQuantity: number) => void }) {
  const todayDay = new Date().getDay();
  const combo = comboOffers.find((offer) => offer.days.includes(todayDay));
  if (!combo) return null; // nenhum combo cadastrado pra hoje
  const quantity = quantities[combo.id] ?? 0;
  return <section className="bg-[#100d0c] py-14 sm:py-16" aria-labelledby="combos-title">
    <div className="mx-auto max-w-7xl px-5 lg:px-8">
      <p className="text-xs font-bold uppercase tracking-[.22em] text-[#ff7548]">Combo fixo de hoje</p>
      <h2 id="combos-title" className="mt-2 font-display text-3xl font-extrabold tracking-[-.04em] text-white sm:text-4xl">Promoção do dia</h2>
      <div className="relative mt-8 overflow-hidden rounded-3xl border border-[#ff5a19]/25 bg-gradient-to-br from-[#241813] to-[#100d0c] p-6 sm:p-10">
        <div className="grid items-center gap-8 lg:grid-cols-[1fr_auto]">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-[#ff5a19] px-3 py-1 text-[11px] font-black uppercase tracking-[.1em] text-white">🔥 Vale hoje</span>
              <span className="text-xs font-bold uppercase tracking-[.12em] text-[#ff9b79]">{combo.daysLabel}</span>
            </div>
            <h3 className="mt-3 font-display text-2xl font-extrabold tracking-[-.03em] text-white sm:text-3xl">{combo.name}</h3>
            {combo.description && <p className="mt-2 max-w-md text-sm leading-relaxed text-white/60">{combo.description}</p>}
            <div className="mt-6 flex flex-wrap items-center gap-4">
              <span className="font-display text-2xl font-extrabold tracking-[-.04em] text-[#ff875c]">{combo.priceLabel}</span>
              {quantity > 0 ? <QuantityControl quantity={quantity} onChange={(next) => setQuantity(combo.id, next)} label={combo.name} dark /> : <button type="button" onClick={() => setQuantity(combo.id, 1)} className="inline-flex h-11 items-center gap-1.5 rounded-full bg-[#ff5a19] px-5 text-sm font-bold text-white transition hover:-translate-y-0.5 hover:bg-[#ff6a2e]"><PlusIcon className="h-3.5 w-3.5" /> Adicionar ao pedido</button>}
            </div>
          </div>
          {combo.image && <img src={combo.image} alt={combo.name} loading="lazy" className="aspect-square w-full rounded-2xl object-cover sm:w-64 lg:w-72" onError={(event) => { event.currentTarget.style.display = "none"; }} />}
        </div>
      </div>
    </div>
  </section>;
}

function MenuSectionView({ quantities, setQuantity, activeSection, changeSection, cartItems, subtotal, total, checkout, deliveryType, setDeliveryType, deliveryFee, cutlery, setCutlery, paymentMethod, setPaymentMethod, pixCopied, setPixCopied, storeOpen, notes, setNotes, location, setLocation, requestLocation, locatingGps }: { quantities: Record<string, number>; setQuantity: (id: string, nextQuantity: number) => void; activeSection: string; changeSection: (id: string) => void; cartItems: CartLine[]; subtotal: number; total: number; checkout: () => void; deliveryType: "retirada" | "entrega"; setDeliveryType: (value: "retirada" | "entrega") => void; deliveryFee: number; cutlery: "hashi" | "garfo" | "nenhum"; setCutlery: (value: "hashi" | "garfo" | "nenhum") => void; paymentMethod: "pix" | "cartao" | "dinheiro"; setPaymentMethod: (value: "pix" | "cartao" | "dinheiro") => void; pixCopied: boolean; setPixCopied: (value: boolean) => void; storeOpen: boolean; notes: string; setNotes: (value: string) => void; location: string; setLocation: (value: string) => void; requestLocation: () => void; locatingGps: boolean }) {
  const [openAddons, setOpenAddons] = useState<Record<string, boolean>>({});
  return <section id="menu" className="scroll-mt-20 bg-[#f5f0eb] py-20 text-[#191514] sm:py-28" aria-labelledby="menu-title"><div className="mx-auto max-w-7xl px-5 lg:px-8"><div className="max-w-xl reveal-on-scroll"><p className="text-xs font-bold uppercase tracking-[.22em] text-[#db4611]">Escolha seu favorito</p><h2 id="menu-title" className="mt-4 font-display text-4xl font-extrabold leading-[.96] tracking-[-.065em] sm:text-5xl">Cardápio Sooba</h2><p className="mt-5 text-base leading-relaxed text-[#615750]">Adicione os itens e envie seu pedido completo direto para nosso WhatsApp.</p></div><div className="sticky top-[72px] z-20 -mx-5 mt-10 border-y border-[#1c1512]/10 bg-[#f5f0eb]/95 px-5 py-3 backdrop-blur lg:-mx-8 lg:px-8"><div className="no-scrollbar flex gap-2 overflow-x-auto pb-1">{menuSections.map((section) => <button key={section.id} type="button" onClick={() => changeSection(section.id)} className={`whitespace-nowrap rounded-full border px-3.5 py-2 text-xs font-bold transition ${activeSection === section.id ? "border-[#1a1513] bg-[#1a1513] text-white" : "border-[#1a1513]/15 text-[#6a5d55] hover:border-[#1a1513]/40"}`}>{section.eyebrow}</button>)}</div></div><div className="mt-12 grid items-start gap-10 lg:grid-cols-[minmax(0,1fr)_330px] lg:gap-16"><div className="space-y-16">{menuSections.map((section) => <Fragment key={section.id}><section id={section.id} className="scroll-mt-36" aria-labelledby={`${section.id}-title`}><div className="mb-5 border-b border-[#1a1513]/15 pb-4 sm:mb-6"><p className="text-[10px] font-bold uppercase tracking-[.2em] text-[#d34b19]">{section.eyebrow}</p><h3 id={`${section.id}-title`} className="mt-1.5 font-display text-2xl font-extrabold tracking-[-.045em] sm:text-3xl">{section.title}</h3>{section.subtitle && <p className="mt-1.5 text-sm text-[#71665e]">{section.subtitle}</p>}</div><div className="divide-y divide-[#1a1513]/10 border-y border-[#1a1513]/10">{section.items.map((item) => { const quantity = quantities[item.id] ?? 0; const showAddon = yakiSectionIds.includes(section.id) && quantity > 0; return <div key={item.id}><article className="group grid gap-4 py-5 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center sm:gap-8"><div className="flex items-center gap-4">{item.image && <img src={item.image} alt={item.name} loading="lazy" className="h-16 w-16 shrink-0 rounded-xl object-cover ring-1 ring-[#1a1513]/10" onError={(event) => { event.currentTarget.style.display = "none"; }} />}<div><h4 className="text-[15px] font-bold leading-tight text-[#1d1714] sm:text-base">{item.name}</h4>{item.description && <p className="mt-1.5 max-w-xl text-sm leading-relaxed text-[#756861]">{item.description}</p>}</div></div><div className="flex items-center justify-between gap-4 sm:justify-end"><span className="font-display text-lg font-extrabold tracking-[-.04em] text-[#dc4814]">{item.priceLabel}</span>{quantity > 0 ? <QuantityControl quantity={quantity} onChange={(next) => setQuantity(item.id, next)} label={item.name} /> : <button type="button" onClick={() => setQuantity(item.id, 1)} className="inline-flex h-10 items-center gap-1.5 rounded-full bg-[#1c1714] px-4 text-xs font-bold text-white transition hover:-translate-y-0.5 hover:bg-[#dc4814]"><PlusIcon className="h-3.5 w-3.5" /> Adicionar ao pedido</button>}</div></article>{showAddon && <div className="mb-5 overflow-hidden rounded-2xl border border-[#ff5a19]/30 bg-[#fff4ec]"><button type="button" onClick={() => setOpenAddons((current) => ({ ...current, [item.id]: !current[item.id] }))} aria-expanded={!!openAddons[item.id]} className="flex w-full items-center justify-between gap-3 px-5 py-4 text-left sm:px-6"><span className="inline-flex items-center gap-2 text-sm font-black uppercase tracking-[.1em] text-[#d34b19]"><span className={`grid h-5 w-5 shrink-0 place-items-center rounded-full border border-[#d34b19]/40 text-sm font-normal transition ${openAddons[item.id] ? "rotate-45" : ""}`}>+</span> Acompanhamento do {item.name}</span><span className="text-xs font-semibold text-[#d34b19]/70">{openAddons[item.id] ? "Ocultar" : "Ver opções"}</span></button>{openAddons[item.id] && <div className="border-t border-[#ff5a19]/20 px-5 py-5 sm:px-6"><p className="text-sm text-[#756861]">Adicione legumes ou mais carne no seu yakisoba.</p><div className="mt-4 space-y-4">{addonSections.map((addonSection) => <div key={addonSection.id}><p className="text-[10px] font-bold uppercase tracking-[.16em] text-[#a08f84]">{addonSection.id === "legumes" ? "Legumes" : "Carnes"}</p><div className="mt-2 flex flex-wrap gap-2">{addonSection.items.map((addonItem) => { const cartId = addonCartId(item.id, addonItem.id); const qty = quantities[cartId] ?? 0; return <button key={addonItem.id} type="button" onClick={() => setQuantity(cartId, qty + 1)} className="inline-flex items-center gap-1.5 rounded-full border border-[#1a1513]/15 bg-white px-3.5 py-2 text-xs font-bold text-[#1d1714] transition hover:border-[#ff5a19] hover:text-[#d34b19]"><PlusIcon className="h-3 w-3" /> {addonItem.name} · {addonItem.priceLabel}{qty > 0 && <span className="ml-1 grid h-4 min-w-4 place-items-center rounded-full bg-[#ff5a19] px-1 text-[10px] text-white">{qty}</span>}</button>; })}</div></div>)}</div></div>}</div>}</div>; })}</div></section></Fragment>)}<div className="border-l-2 border-[#ff5a19] bg-[#ecdfd4]/55 px-5 py-5 text-sm leading-relaxed text-[#5f5148]"><p><strong className="text-[#211916]">Nossos legumes frescos:</strong> repolho roxo, repolho, cenoura, pimentão (amarelo e vermelho), brócolis, couve flor e cebola.</p><p className="mt-2"><strong className="text-[#211916]">Proteínas disponíveis:</strong> frango e carne bovina.</p></div></div><aside className="sticky top-36 hidden border border-[#1d1714]/15 bg-[#fbf8f5] p-6 lg:block" aria-label="Resumo do pedido"><CartSummary cartItems={cartItems} quantities={quantities} subtotal={subtotal} total={total} onQuantityChange={setQuantity} onCheckout={checkout} compact={false} deliveryType={deliveryType} setDeliveryType={setDeliveryType} deliveryFee={deliveryFee} cutlery={cutlery} setCutlery={setCutlery} paymentMethod={paymentMethod} setPaymentMethod={setPaymentMethod} pixCopied={pixCopied} setPixCopied={setPixCopied} storeOpen={storeOpen} notes={notes} setNotes={setNotes} location={location} setLocation={setLocation} requestLocation={requestLocation} locatingGps={locatingGps} /></aside></div></div></section>; }

function CartSummary({ cartItems, quantities, subtotal, total, onQuantityChange, onCheckout, compact, deliveryType, setDeliveryType, deliveryFee, cutlery, setCutlery, paymentMethod, setPaymentMethod, pixCopied, setPixCopied, storeOpen, notes, setNotes, location, setLocation, requestLocation, locatingGps }: { cartItems: CartLine[]; quantities: Record<string, number>; subtotal: number; total: number; onQuantityChange: (id: string, nextQuantity: number) => void; onCheckout: () => void; compact: boolean; deliveryType: "retirada" | "entrega"; setDeliveryType: (value: "retirada" | "entrega") => void; deliveryFee: number; cutlery: "hashi" | "garfo" | "nenhum"; setCutlery: (value: "hashi" | "garfo" | "nenhum") => void; paymentMethod: "pix" | "cartao" | "dinheiro"; setPaymentMethod: (value: "pix" | "cartao" | "dinheiro") => void; pixCopied: boolean; setPixCopied: (value: boolean) => void; storeOpen: boolean; notes: string; setNotes: (value: string) => void; location: string; setLocation: (value: string) => void; requestLocation: () => void; locatingGps: boolean }) {
  const labelClass = `text-xs font-bold uppercase tracking-[.14em] ${compact ? "text-white/55" : "text-[#8a7c73]"}`;
  const fieldClass = `w-full rounded-xl border px-3.5 py-2.5 text-sm outline-none transition ${compact ? "border-white/15 bg-white/[0.06] text-white placeholder:text-white/35 focus:border-[#ff6b32]" : "border-[#1d1714]/15 bg-white text-[#1d1714] placeholder:text-[#9c8f86] focus:border-[#ff5a19]"}`;
  const pillBase = "rounded-full border px-3.5 py-2 text-xs font-bold transition";
  const pillOn = "border-[#ff5a19] bg-[#ff5a19] text-white";
  const pillOff = compact ? "border-white/15 text-white/70 hover:border-white/35" : "border-[#1d1714]/15 text-[#6a5d55] hover:border-[#1d1714]/40";
  return <div className={compact ? "flex min-h-full flex-col" : ""}>{!compact && <><p className="text-[10px] font-bold uppercase tracking-[.18em] text-[#d64a17]">Seu pedido</p><h3 className="mt-1 font-display text-2xl font-extrabold tracking-[-.05em] text-[#1d1714]">Tudo certo por aqui?</h3></>}{cartItems.length === 0 ? <div className={`flex ${compact ? "flex-1" : "py-9"} items-center justify-center text-center`}><div><span className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-[#ff5a19]/10 text-[#ff7548]"><CartIcon className="h-5 w-5" /></span><p className={`mt-4 font-bold ${compact ? "text-white" : "text-[#1d1714]"}`}>Seu pedido está vazio.</p><p className={`mt-1 text-sm ${compact ? "text-white/55" : "text-[#756861]"}`}>Adicione seus favoritos para continuar.</p></div></div> : <><div className={`mt-5 divide-y ${compact ? "divide-white/10" : "divide-[#1d1714]/10"}`}>{(() => { const { groups, orphanAddons } = groupCartLines(cartItems); return <>{groups.map(({ parent, addons }) => <div key={parent.id} className="py-4 first:pt-0"><div className="flex justify-between gap-3"><p className={`text-sm font-bold leading-snug ${compact ? "text-white" : "text-[#2b211d]"}`}>{parent.name}</p><span className={`shrink-0 font-display text-sm font-extrabold ${compact ? "text-[#ff8b60]" : "text-[#d84b19]"}`}>{formatTotal(parent.price * quantities[parent.id])}</span></div><div className="mt-3 flex items-center justify-between"><span className={`text-xs ${compact ? "text-white/50" : "text-[#756861]"}`}>{parent.priceLabel} cada</span><QuantityControl quantity={quantities[parent.id]} onChange={(next) => onQuantityChange(parent.id, next)} label={parent.name} dark={compact} /></div>{addons.length > 0 && <div className={`mt-3 space-y-2.5 border-l-2 pl-3 ${compact ? "border-white/15" : "border-[#ff5a19]/25"}`}>{addons.map((addon) => <div key={addon.id} className="flex items-center justify-between gap-3"><p className={`text-xs font-semibold leading-snug ${compact ? "text-white/70" : "text-[#6a5d55]"}`}>+ {addon.name}</p><div className="flex shrink-0 items-center gap-2"><span className={`font-display text-xs font-bold ${compact ? "text-[#ff8b60]/80" : "text-[#d84b19]/80"}`}>{formatTotal(addon.price * quantities[addon.id])}</span><QuantityControl quantity={quantities[addon.id]} onChange={(next) => onQuantityChange(addon.id, next)} label={`${addon.name} do ${parent.name}`} dark={compact} /></div></div>)}</div>}</div>)}{orphanAddons.map((addon) => <div key={addon.id} className="py-4 first:pt-0"><div className="flex justify-between gap-3"><p className={`text-sm font-bold leading-snug ${compact ? "text-white" : "text-[#2b211d]"}`}>{addon.name}</p><span className={`shrink-0 font-display text-sm font-extrabold ${compact ? "text-[#ff8b60]" : "text-[#d84b19]"}`}>{formatTotal(addon.price * quantities[addon.id])}</span></div><div className="mt-3 flex items-center justify-between"><span className={`text-xs ${compact ? "text-white/50" : "text-[#756861]"}`}>{addon.priceLabel} cada</span><QuantityControl quantity={quantities[addon.id]} onChange={(next) => onQuantityChange(addon.id, next)} label={addon.name} dark={compact} /></div></div>)}</>; })()}</div><div className={`mt-5 space-y-5 border-t pt-5 ${compact ? "border-white/10" : "border-[#1d1714]/15"}`}><div><p className={labelClass}>Entrega</p><div className="mt-2 flex flex-wrap gap-2"><button type="button" onClick={() => setDeliveryType("retirada")} className={`${pillBase} ${deliveryType === "retirada" ? pillOn : pillOff}`}>Retirar no local</button><button type="button" onClick={() => setDeliveryType("entrega")} className={`${pillBase} ${deliveryType === "entrega" ? pillOn : pillOff}`}>Entrega (+ {formatTotal(DELIVERY_FEE)})</button></div>{deliveryType === "entrega" && <div className="mt-3 space-y-2"><div className="flex gap-2"><input type="text" value={location} onChange={(event) => setLocation(event.target.value)} placeholder="Endereço de entrega" className={fieldClass} /><button type="button" onClick={requestLocation} disabled={locatingGps} className={`shrink-0 rounded-xl border px-3.5 text-xs font-bold transition disabled:opacity-50 ${compact ? "border-white/15 text-white/80 hover:border-white/35" : "border-[#1d1714]/15 text-[#6a5d55] hover:border-[#1d1714]/40"}`}>{locatingGps ? "Localizando…" : "📍 Usar localização"}</button></div><p className={`text-[11px] leading-relaxed ${compact ? "text-white/40" : "text-[#8a7c73]"}`}>Toque em "Usar localização" para enviar o link do mapa, ou digite o endereço.</p></div>}{deliveryType === "retirada" && <div className="mt-3 flex items-center justify-between gap-3 rounded-xl border border-dashed border-[#ff5a19]/40 bg-[#ff5a19]/5 p-3"><div><p className={`text-xs font-bold ${compact ? "text-white/70" : "text-[#6a5d55]"}`}>Local de retirada</p><p className={`mt-0.5 text-sm font-bold ${compact ? "text-white" : "text-[#1d1714]"}`}>{STORE_PICKUP_LABEL}</p></div><a href={STORE_PICKUP_MAPS_URL} target="_blank" rel="noreferrer" className="shrink-0 rounded-lg bg-[#ff5a19] px-3 py-2 text-xs font-bold text-white transition hover:bg-[#ff6a2e]">Ver no mapa</a></div>}</div><div><p className={labelClass}>Talher</p><div className="mt-2 flex flex-wrap gap-2">{cutleryOptions.map((option) => <button key={option.id} type="button" onClick={() => setCutlery(option.id)} className={`${pillBase} ${cutlery === option.id ? pillOn : pillOff}`}>{option.label}</button>)}</div></div><div><p className={labelClass}>Forma de pagamento</p><div className="mt-2 flex flex-wrap gap-2">{paymentOptions.map((option) => <button key={option.id} type="button" onClick={() => setPaymentMethod(option.id)} className={`${pillBase} ${paymentMethod === option.id ? pillOn : pillOff}`}>{option.label}</button>)}</div>{paymentMethod === "pix" && <div className="mt-3 rounded-xl border border-dashed border-[#ff5a19]/40 bg-[#ff5a19]/5 p-3"><p className={`text-xs font-bold ${compact ? "text-white/70" : "text-[#6a5d55]"}`}>Chave Pix do Sooba</p><div className="mt-1.5 flex items-center gap-2"><code className={`flex-1 truncate rounded-lg px-2.5 py-2 text-xs font-bold ${compact ? "bg-white/[0.06] text-white" : "bg-white text-[#1d1714]"}`}>{PIX_KEY}</code><button type="button" onClick={() => { navigator.clipboard.writeText(PIX_KEY); setPixCopied(true); setTimeout(() => setPixCopied(false), 2000); }} className="shrink-0 rounded-lg bg-[#ff5a19] px-3 py-2 text-xs font-bold text-white transition hover:bg-[#ff6a2e]">{pixCopied ? "Copiado!" : "Copiar"}</button></div><p className={`mt-2 text-[11px] leading-relaxed ${compact ? "text-white/40" : "text-[#8a7c73]"}`}>Copie a chave, pague no app do seu banco, tire print do comprovante e envie junto com esse pedido no WhatsApp.</p></div>}</div><div><label className={labelClass} htmlFor="order-notes">Observações</label><textarea id="order-notes" value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="Ex: mais molho, sem cebola…" rows={2} className={`mt-2 resize-none ${fieldClass}`} /></div></div></>}<div className={`mt-auto border-t pt-5 ${compact ? "border-white/10" : "border-[#1d1714]/15"}`}>{deliveryFee > 0 && <div className={`flex items-center justify-between text-sm ${compact ? "text-white/70" : "text-[#6a5d55]"}`}><span>Subtotal</span><span>{formatTotal(subtotal)}</span></div>}{deliveryFee > 0 && <div className={`mt-1 flex items-center justify-between text-sm ${compact ? "text-white/70" : "text-[#6a5d55]"}`}><span>Entrega</span><span>{formatTotal(deliveryFee)}</span></div>}<div className={`flex items-end justify-between ${deliveryFee > 0 ? "mt-2" : ""} ${compact ? "text-white" : "text-[#1d1714]"}`}><span className="text-sm font-bold">Total</span><span className="font-display text-2xl font-extrabold tracking-[-.05em]">{formatTotal(total)}</span></div>{!storeOpen && <p className="mb-2 rounded-lg bg-[#ff5a19]/10 px-3 py-2 text-center text-xs font-bold text-[#ff875c]">🕒 Fechado agora — abrimos {STORE_HOURS_LABEL}</p>}<button type="button" onClick={onCheckout} disabled={cartItems.length === 0 || !storeOpen} className="mt-5 flex w-full items-center justify-center gap-2 rounded-full bg-[#ff5a19] px-4 py-3.5 text-sm font-bold text-white transition hover:-translate-y-0.5 hover:bg-[#ff6a2e] disabled:cursor-not-allowed disabled:opacity-40"><WhatsAppIcon className="h-4 w-4" /> {storeOpen ? "Finalizar pedido no WhatsApp" : "Estamos fechados"}</button><p className={`mt-3 text-center text-[11px] leading-relaxed ${compact ? "text-white/45" : "text-[#8a7c73]"}`}>Pagamento e confirmação pelo WhatsApp.</p></div></div>; }

function FaqItem({ question, answer }: { question: string; answer: string }) { const [isOpen, setIsOpen] = useState(false); return <div className="py-5"><button type="button" className="flex w-full items-center justify-between gap-5 text-left text-base font-bold text-white" onClick={() => setIsOpen(!isOpen)} aria-expanded={isOpen}><span>{question}</span><span className={`grid h-6 w-6 shrink-0 place-items-center rounded-full border border-white/20 text-lg font-normal text-[#ff7c50] transition ${isOpen ? "rotate-45" : ""}`}>+</span></button>{isOpen && <p className="max-w-2xl pt-3 pr-10 text-sm leading-relaxed text-white/58">{answer}</p>}</div>; }