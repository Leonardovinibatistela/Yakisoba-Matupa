import { useEffect, useRef, useState } from "react";
import { onAuthStateChanged, signInWithEmailAndPassword, signOut, type User } from "firebase/auth";
import { auth } from "../firebase";
import { bestSellers, deleteOrder, endOfDay, endOfMonth, fetchOrdersBetween, ordersInRange, revenueByWeekday, startOfDay, startOfMonth, startOfWeek, subscribeToRecentOrders, sumRevenue, type OrderRecord } from "./adminData";
import { addCarouselImage, CAROUSEL_MAX_IMAGES, fetchCarouselImages, removeCarouselImage, type CarouselImage } from "../carousel";
import { uploadImageToCloudinary } from "../cloudinary";
import { menuSections } from "../menuData";
import { setItemSoldOut, subscribeSoldOutItems } from "../soldOut";
import { clearItemPrice, setItemPrice, subscribePriceOverrides } from "../priceOverrides";
import { clearItemPhoto, setItemPhoto, subscribePhotoOverrides } from "../photoOverrides";
import { addCustomItem, removeCustomItem, subscribeCustomItems, type CustomMenuItem } from "../customItems";
import { setItemHidden, subscribeHiddenItems } from "../hiddenItems";
import { setEmergencyPause, subscribeEmergencyPause } from "../emergencyPause";
import { setManualOpen, subscribeManualOpen } from "../manualOpen";
import { addDailyCombo, DEFAULT_DAILY_COMBOS, formatDaysLabel, removeDailyCombo, subscribeDailyCombos, updateDailyCombo, WEEKDAYS, type DailyCombo } from "../dailyCombos";

const formatTotal = (value: number) => value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const STORE_HOURS_LABEL_ADMIN = "Seg a Sex 22h · Sáb e Dom 23h";

// Assinatura do pedido (itens + total) — dois pedidos com a mesma assinatura,
// do MESMO telefone, feitos poucos minutos um do outro, provavelmente são o
// mesmo cliente tentando de novo (ex.: internet fraca). Clientes diferentes
// pedindo a mesma coisa por coincidência não contam como duplicado.
const orderSignature = (order: OrderRecord) => order.items.map((item) => `${item.id}:${item.quantity}`).sort().join("|") + `#${order.total}`;
const normalizePhone = (phone: string) => phone.replace(/\D/g, "");
const DUPLICATE_WINDOW_MS = 10 * 60 * 1000;
function findDuplicateSuspects(orders: OrderRecord[]): Set<string> {
  const suspects = new Set<string>();
  for (let i = 0; i < orders.length; i++) {
    for (let j = i + 1; j < orders.length; j++) {
      const a = orders[i];
      const b = orders[j];
      const samePerson = normalizePhone(a.customerPhone) === normalizePhone(b.customerPhone);
      if (samePerson && orderSignature(a) === orderSignature(b) && Math.abs(a.createdAt.getTime() - b.createdAt.getTime()) <= DUPLICATE_WINDOW_MS) {
        suspects.add(a.id);
        suspects.add(b.id);
      }
    }
  }
  return suspects;
}
const toDateInputValue = (date: Date) => {
  const d = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return d.toISOString().slice(0, 10);
};

export default function AdminApp() {
  const [user, setUser] = useState<User | null | undefined>(undefined); // undefined = ainda carregando

  useEffect(() => onAuthStateChanged(auth, setUser), []);

  if (user === undefined) return <div className="grid min-h-screen place-items-center bg-[#100d0c] text-white/60">Carregando…</div>;
  return user ? <Dashboard user={user} /> : <LoginScreen />;
}

function LoginScreen() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    setError("");
    setLoading(true);
    signInWithEmailAndPassword(auth, email, password)
      .catch(() => setError("E-mail ou senha incorretos."))
      .finally(() => setLoading(false));
  };

  return (
    <div className="grid min-h-screen place-items-center bg-[#100d0c] px-5">
      <form onSubmit={handleSubmit} className="w-full max-w-sm rounded-2xl border border-white/10 bg-[#171211] p-7">
        <p className="text-xs font-bold uppercase tracking-[.18em] text-[#ff7c50]">Sooba</p>
        <h1 className="mt-1 font-display text-2xl font-extrabold tracking-[-.04em] text-white">Painel administrativo</h1>
        <div className="mt-6 space-y-3">
          <input type="email" required autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="E-mail" className="w-full rounded-xl border border-white/15 bg-white/[0.06] px-3.5 py-2.5 text-sm text-white placeholder:text-white/35 outline-none focus:border-[#ff6b32]" />
          <input type="password" required autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Senha" className="w-full rounded-xl border border-white/15 bg-white/[0.06] px-3.5 py-2.5 text-sm text-white placeholder:text-white/35 outline-none focus:border-[#ff6b32]" />
        </div>
        {error && <p className="mt-3 text-sm text-red-400">{error}</p>}
        <button type="submit" disabled={loading} className="mt-5 flex w-full items-center justify-center gap-2 rounded-full bg-[#ff5a19] px-4 py-3 text-sm font-bold text-white transition hover:-translate-y-0.5 hover:bg-[#ff6a2e] disabled:cursor-not-allowed disabled:opacity-50">
          {loading ? "Entrando…" : "Entrar"}
        </button>
      </form>
    </div>
  );
}

function Dashboard({ user }: { user: User }) {
  const [orders, setOrders] = useState<OrderRecord[] | null>(null);
  const [error, setError] = useState("");
  const [pickedDate, setPickedDate] = useState(() => toDateInputValue(new Date()));
  const [pickedDayOrders, setPickedDayOrders] = useState<OrderRecord[] | null>(null);
  const [pickedMonthOrders, setPickedMonthOrders] = useState<OrderRecord[] | null>(null);
  const [pickedLoading, setPickedLoading] = useState(false);
  const [carouselImages, setCarouselImages] = useState<CarouselImage[] | null>(null);
  const [carouselError, setCarouselError] = useState("");
  const [uploading, setUploading] = useState(false);
  const orderListRef = useRef<HTMLDivElement>(null);
  const [isOrderListFullscreen, setIsOrderListFullscreen] = useState(false);
  useEffect(() => {
    const handler = () => setIsOrderListFullscreen(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", handler);
    return () => document.removeEventListener("fullscreenchange", handler);
  }, []);
  const toggleOrderListFullscreen = () => {
    if (document.fullscreenElement) document.exitFullscreen();
    else orderListRef.current?.requestFullscreen();
  };
  const [deletingOrderId, setDeletingOrderId] = useState<string | null>(null);
  const handleDeleteOrder = (order: OrderRecord) => {
    if (!window.confirm(`Apagar o Pedido #${order.orderNumber}? Essa ação não pode ser desfeita.`)) return;
    setDeletingOrderId(order.id);
    deleteOrder(order.id).catch(() => window.alert("Não foi possível apagar esse pedido. Tenta de novo.")).finally(() => setDeletingOrderId(null));
  };

  const [emergencyPaused, setEmergencyPausedState] = useState(false);
  const [togglingPause, setTogglingPause] = useState(false);
  useEffect(() => subscribeEmergencyPause(setEmergencyPausedState), []);
  const handleToggleEmergencyPause = () => {
    const next = !emergencyPaused;
    if (next && !window.confirm("Pausar pedidos agora? O site continua de pé, mas ninguém consegue finalizar pedido até você reativar.")) return;
    setTogglingPause(true);
    setEmergencyPause(next).catch(() => window.alert("Não foi possível atualizar. Tenta de novo.")).finally(() => setTogglingPause(false));
  };

  const [manualOpen, setManualOpenState] = useState(false);
  const [togglingManualOpen, setTogglingManualOpen] = useState(false);
  useEffect(() => subscribeManualOpen(setManualOpenState), []);
  const handleToggleManualOpen = () => {
    const next = !manualOpen;
    setTogglingManualOpen(true);
    setManualOpen(next).catch(() => window.alert("Não foi possível atualizar. Tenta de novo.")).finally(() => setTogglingManualOpen(false));
  };

  const [soldOutIds, setSoldOutIds] = useState<Set<string>>(new Set());
  const [togglingItemId, setTogglingItemId] = useState<string | null>(null);
  useEffect(() => subscribeSoldOutItems(setSoldOutIds), []);
  const handleToggleSoldOut = (itemId: string, currentlySoldOut: boolean) => {
    setTogglingItemId(itemId);
    setItemSoldOut(itemId, !currentlySoldOut).catch(() => window.alert("Não foi possível atualizar esse item. Tenta de novo.")).finally(() => setTogglingItemId(null));
  };

  // Itens "de fábrica" (menuData.ts) que o admin excluiu do site — não apaga
  // nada do código, só some do cardápio público. Reversível a qualquer hora.
  const [hiddenIds, setHiddenIds] = useState<Set<string>>(new Set());
  const [togglingHiddenId, setTogglingHiddenId] = useState<string | null>(null);
  useEffect(() => subscribeHiddenItems(setHiddenIds), []);
  const handleToggleHidden = (itemId: string, itemName: string, currentlyHidden: boolean) => {
    if (!currentlyHidden && !window.confirm(`Excluir "${itemName}" do site? Ele some do cardápio pro público, mas fica guardado aqui — dá pra restaurar quando quiser.`)) return;
    setTogglingHiddenId(itemId);
    setItemHidden(itemId, !currentlyHidden).catch(() => window.alert("Não foi possível atualizar esse item. Tenta de novo.")).finally(() => setTogglingHiddenId(null));
  };

  const [togglingSectionId, setTogglingSectionId] = useState<string | null>(null);
  const handleToggleSection = (sectionId: string, itemIds: string[], markSoldOut: boolean) => {
    setTogglingSectionId(sectionId);
    Promise.all(itemIds.map((itemId) => setItemSoldOut(itemId, markSoldOut)))
      .catch(() => window.alert("Não foi possível atualizar todos os itens. Confere um por um."))
      .finally(() => setTogglingSectionId(null));
  };

  const [priceOverrides, setPriceOverrides] = useState<Record<string, number>>({});
  const [editingPriceId, setEditingPriceId] = useState<string | null>(null);
  const [priceDraft, setPriceDraft] = useState("");
  const [savingPriceId, setSavingPriceId] = useState<string | null>(null);
  useEffect(() => subscribePriceOverrides(setPriceOverrides), []);
  const startEditPrice = (itemId: string, currentPrice: number) => {
    setEditingPriceId(itemId);
    setPriceDraft(currentPrice.toFixed(2).replace(".", ","));
  };
  const handleSavePrice = (itemId: string) => {
    const parsed = Number(priceDraft.replace(",", "."));
    if (!Number.isFinite(parsed) || parsed < 0) { window.alert("Digite um preço válido."); return; }
    setSavingPriceId(itemId);
    setItemPrice(itemId, parsed).then(() => setEditingPriceId(null)).catch(() => window.alert("Não foi possível salvar o preço. Tenta de novo.")).finally(() => setSavingPriceId(null));
  };
  const handleResetPrice = (itemId: string) => {
    setSavingPriceId(itemId);
    clearItemPrice(itemId).then(() => setEditingPriceId(null)).catch(() => window.alert("Não foi possível restaurar o preço. Tenta de novo.")).finally(() => setSavingPriceId(null));
  };

  const [photoOverrides, setPhotoOverrides] = useState<Record<string, string>>({});
  const [uploadingPhotoId, setUploadingPhotoId] = useState<string | null>(null);
  useEffect(() => subscribePhotoOverrides(setPhotoOverrides), []);
  const handleChangeItemPhoto = (itemId: string) => (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    setUploadingPhotoId(itemId);
    uploadImageToCloudinary(file)
      .then(({ url }) => setItemPhoto(itemId, url))
      .catch(() => window.alert("Não foi possível enviar essa foto. Tenta de novo."))
      .finally(() => setUploadingPhotoId(null));
  };
  const handleResetItemPhoto = (itemId: string) => {
    setUploadingPhotoId(itemId);
    clearItemPhoto(itemId).catch(() => window.alert("Não foi possível restaurar a foto padrão.")).finally(() => setUploadingPhotoId(null));
  };

  // Itens que o próprio cliente adiciona pelo painel (sabor novo, combinado
  // novo etc.) — somados aos itens "de fábrica" na hora de listar cada seção.
  const [customItems, setCustomItems] = useState<CustomMenuItem[]>([]);
  useEffect(() => subscribeCustomItems(setCustomItems), []);
  const [removingItemId, setRemovingItemId] = useState<string | null>(null);
  const handleRemoveCustomItem = (item: CustomMenuItem) => {
    if (!window.confirm(`Remover "${item.name}" do cardápio? Essa ação não pode ser desfeita.`)) return;
    setRemovingItemId(item.id);
    removeCustomItem(item.id).catch(() => window.alert("Não foi possível remover esse item. Tenta de novo.")).finally(() => setRemovingItemId(null));
  };

  const [newItemSectionId, setNewItemSectionId] = useState(menuSections[0].id);
  const [newItemName, setNewItemName] = useState("");
  const [newItemDescription, setNewItemDescription] = useState("");
  const [newItemPrice, setNewItemPrice] = useState("");
  const [newItemPhotoFile, setNewItemPhotoFile] = useState<File | null>(null);
  const [newItemPhotoPreview, setNewItemPhotoPreview] = useState<string | null>(null);
  const [addingItem, setAddingItem] = useState(false);
  const handlePickNewItemPhoto = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    setNewItemPhotoFile(file);
    setNewItemPhotoPreview(URL.createObjectURL(file));
  };
  const resetNewItemForm = () => {
    setNewItemName("");
    setNewItemDescription("");
    setNewItemPrice("");
    setNewItemPhotoFile(null);
    setNewItemPhotoPreview(null);
  };
  const handleAddItem = () => {
    const name = newItemName.trim();
    const price = Number(newItemPrice.replace(",", "."));
    if (!name) { window.alert("Digite o nome do item."); return; }
    if (!Number.isFinite(price) || price < 0) { window.alert("Digite um preço válido."); return; }
    setAddingItem(true);
    const create = (image?: string) =>
      addCustomItem({ sectionId: newItemSectionId, name, description: newItemDescription.trim() || undefined, price, image })
        .then(resetNewItemForm)
        .catch(() => window.alert("Não foi possível adicionar o item. Tenta de novo."))
        .finally(() => setAddingItem(false));
    if (newItemPhotoFile) {
      uploadImageToCloudinary(newItemPhotoFile).then(({ url }) => create(url)).catch(() => { window.alert("Não foi possível enviar a foto. Tenta de novo."); setAddingItem(false); });
    } else {
      create(undefined);
    }
  };

  // Combos da "Promoção do dia" — o admin escolhe nome, preço, foto e em
  // quais dias da semana cada combo aparece no site.
  const [dailyCombos, setDailyCombosState] = useState<DailyCombo[] | null>(null);
  useEffect(() => subscribeDailyCombos(setDailyCombosState), []);
  const [importingCombos, setImportingCombos] = useState(false);
  const handleImportDefaultCombos = () => {
    setImportingCombos(true);
    Promise.all(DEFAULT_DAILY_COMBOS.map((combo) => addDailyCombo(combo)))
      .catch(() => window.alert("Não foi possível importar os combos. Tenta de novo."))
      .finally(() => setImportingCombos(false));
  };
  const [editingComboId, setEditingComboId] = useState<string | null>(null);
  const [comboPriceDraft, setComboPriceDraft] = useState("");
  const [savingComboId, setSavingComboId] = useState<string | null>(null);
  const startEditComboPrice = (combo: DailyCombo) => { setEditingComboId(combo.id); setComboPriceDraft(combo.price.toFixed(2).replace(".", ",")); };
  const handleSaveComboPrice = (comboId: string) => {
    const parsed = Number(comboPriceDraft.replace(",", "."));
    if (!Number.isFinite(parsed) || parsed < 0) { window.alert("Digite um preço válido."); return; }
    setSavingComboId(comboId);
    updateDailyCombo(comboId, { price: parsed }).then(() => setEditingComboId(null)).catch(() => window.alert("Não foi possível salvar o preço. Tenta de novo.")).finally(() => setSavingComboId(null));
  };
  const handleToggleComboDay = (combo: DailyCombo, day: number) => {
    const nextDays = combo.days.includes(day) ? combo.days.filter((d) => d !== day) : [...combo.days, day].sort((a, b) => a - b);
    updateDailyCombo(combo.id, { days: nextDays }).catch(() => window.alert("Não foi possível atualizar os dias desse combo. Tenta de novo."));
  };
  const [uploadingComboPhotoId, setUploadingComboPhotoId] = useState<string | null>(null);
  const handleChangeComboPhoto = (comboId: string) => (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    setUploadingComboPhotoId(comboId);
    uploadImageToCloudinary(file)
      .then(({ url }) => updateDailyCombo(comboId, { image: url }))
      .catch(() => window.alert("Não foi possível enviar essa foto. Tenta de novo."))
      .finally(() => setUploadingComboPhotoId(null));
  };
  const [removingComboId, setRemovingComboId] = useState<string | null>(null);
  const handleRemoveCombo = (combo: DailyCombo) => {
    if (!window.confirm(`Remover "${combo.name}" da Promoção do dia? Essa ação não pode ser desfeita.`)) return;
    setRemovingComboId(combo.id);
    removeDailyCombo(combo.id).catch(() => window.alert("Não foi possível remover esse combo. Tenta de novo.")).finally(() => setRemovingComboId(null));
  };
  const [newComboName, setNewComboName] = useState("");
  const [newComboDescription, setNewComboDescription] = useState("");
  const [newComboPrice, setNewComboPrice] = useState("");
  const [newComboDays, setNewComboDays] = useState<number[]>([]);
  const [newComboPhotoFile, setNewComboPhotoFile] = useState<File | null>(null);
  const [newComboPhotoPreview, setNewComboPhotoPreview] = useState<string | null>(null);
  const [addingCombo, setAddingCombo] = useState(false);
  const handlePickNewComboPhoto = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    setNewComboPhotoFile(file);
    setNewComboPhotoPreview(URL.createObjectURL(file));
  };
  const toggleNewComboDay = (day: number) => setNewComboDays((current) => (current.includes(day) ? current.filter((d) => d !== day) : [...current, day].sort((a, b) => a - b)));
  const resetNewComboForm = () => {
    setNewComboName("");
    setNewComboDescription("");
    setNewComboPrice("");
    setNewComboDays([]);
    setNewComboPhotoFile(null);
    setNewComboPhotoPreview(null);
  };
  const handleAddCombo = () => {
    const name = newComboName.trim();
    const price = Number(newComboPrice.replace(",", "."));
    if (!name) { window.alert("Digite o nome do combo."); return; }
    if (!Number.isFinite(price) || price < 0) { window.alert("Digite um preço válido."); return; }
    if (newComboDays.length === 0) { window.alert("Escolhe pelo menos um dia da semana pro combo aparecer."); return; }
    setAddingCombo(true);
    const create = (image?: string) =>
      addDailyCombo({ name, description: newComboDescription.trim() || undefined, price, image, days: newComboDays })
        .then(resetNewComboForm)
        .catch(() => window.alert("Não foi possível adicionar o combo. Tenta de novo."))
        .finally(() => setAddingCombo(false));
    if (newComboPhotoFile) {
      uploadImageToCloudinary(newComboPhotoFile).then(({ url }) => create(url)).catch(() => { window.alert("Não foi possível enviar a foto. Tenta de novo."); setAddingCombo(false); });
    } else {
      create(undefined);
    }
  };

  const loadCarouselImages = () => fetchCarouselImages().then(setCarouselImages).catch(() => setCarouselError("Não foi possível carregar as fotos do carrossel."));

  useEffect(() => {
    const unsubscribe = subscribeToRecentOrders(setOrders, () => setError("Não foi possível carregar os pedidos."));
    loadCarouselImages();
    return unsubscribe;
  }, []);

  useEffect(() => {
    const [year, month, day] = pickedDate.split("-").map(Number);
    if (!year || !month || !day) return;
    const picked = new Date(year, month - 1, day);
    const dayStart = startOfDay(picked);
    const dayEnd = endOfDay(picked);
    const monthStart = startOfMonth(picked);
    const monthEnd = endOfMonth(picked);
    const now = new Date();
    const isCurrentMonth = picked.getFullYear() === now.getFullYear() && picked.getMonth() === now.getMonth();
    if (isCurrentMonth && orders) {
      // Mês atual: os pedidos já estão sendo escutados ao vivo — deriva
      // direto daí, sem nova busca, então atualiza sozinho quando chega pedido novo.
      const monthOrders = ordersInRange(orders, monthStart, monthEnd);
      setPickedMonthOrders(monthOrders);
      setPickedDayOrders(monthOrders.filter((order) => order.createdAt >= dayStart && order.createdAt < dayEnd));
      setPickedLoading(false);
      return;
    }
    setPickedLoading(true);
    fetchOrdersBetween(monthStart, monthEnd)
      .then((monthOrders) => {
        setPickedMonthOrders(monthOrders);
        setPickedDayOrders(monthOrders.filter((order) => order.createdAt >= dayStart && order.createdAt < dayEnd));
      })
      .catch(() => setError("Não foi possível buscar essa data."))
      .finally(() => setPickedLoading(false));
  }, [pickedDate, orders]);

  if (error) return <div className="grid min-h-screen place-items-center bg-[#100d0c] px-5 text-center text-white/70">{error}</div>;
  if (!orders) return <div className="grid min-h-screen place-items-center bg-[#100d0c] text-white/60">Carregando pedidos…</div>;

  const now = new Date();
  const todayOrders = ordersInRange(orders, startOfDay(now));
  const weekOrders = ordersInRange(orders, startOfWeek(now));
  const monthOrders = ordersInRange(orders, startOfMonth(now));
  // O gráfico e o Top 3 aqui embaixo (dentro de "Rever outra data") seguem o
  // mês escolhido no calendário, não a semana atual — assim dá pra comparar
  // qualquer mês passado, não só hoje.
  const weekdayChart = revenueByWeekday(pickedMonthOrders ?? []);
  const maxWeekdayValue = Math.max(1, ...weekdayChart.map((bucket) => bucket.total));
  const pickedTop3 = bestSellers(pickedMonthOrders ?? [], 3);

  const pickedDateObj = (() => {
    const [year, month, day] = pickedDate.split("-").map(Number);
    return new Date(year, (month || 1) - 1, day || 1);
  })();

  const handleUploadImage = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    setCarouselError("");
    setUploading(true);
    uploadImageToCloudinary(file)
      .then(({ url, publicId }) => addCarouselImage(url, publicId))
      .then(loadCarouselImages)
      .catch(() => setCarouselError("Não foi possível enviar essa foto. Tenta de novo."))
      .finally(() => setUploading(false));
  };

  const handleRemoveImage = (id: string) => {
    setCarouselError("");
    removeCarouselImage(id).then(loadCarouselImages).catch(() => setCarouselError("Não foi possível remover essa foto."));
  };

  return (
    <div className="min-h-screen bg-[#100d0c] px-5 py-8 text-white sm:px-8">
      <div className="mx-auto max-w-5xl">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs font-bold uppercase tracking-[.18em] text-[#ff7c50]">Sooba · Painel</p>
            <h1 className="mt-1 font-display text-3xl font-extrabold tracking-[-.045em]">Olá, {user.email}</h1>
          </div>
          <button type="button" onClick={() => signOut(auth)} className="rounded-full border border-white/15 px-4 py-2 text-xs font-bold text-white/70 transition hover:border-white/35 hover:text-white">Sair</button>
        </div>

        <div className={`mt-6 flex items-center justify-between gap-4 rounded-2xl border p-5 ${emergencyPaused ? "border-red-400/50 bg-red-500/10" : "border-white/10 bg-[#171211]"}`}>
          <div>
            <p className={`text-sm font-bold ${emergencyPaused ? "text-red-300" : "text-white"}`}>{emergencyPaused ? "⏸️ Pedidos pausados agora" : "Pedidos funcionando normal"}</p>
            <p className="mt-0.5 text-xs text-white/50">Emergência (cozinha lotou, faltou algo)? Pausa o envio de pedido no site na hora, sem mexer no horário oficial.</p>
          </div>
          <button type="button" onClick={handleToggleEmergencyPause} disabled={togglingPause} className={`shrink-0 rounded-full px-4 py-2.5 text-xs font-bold transition disabled:cursor-wait disabled:opacity-50 ${emergencyPaused ? "bg-white text-red-600 hover:bg-white/90" : "bg-red-500/90 text-white hover:bg-red-500"}`}>
            {togglingPause ? "…" : emergencyPaused ? "Reativar pedidos" : "Pausar pedidos"}
          </button>
        </div>

        <div className={`mt-3 flex items-center justify-between gap-4 rounded-2xl border p-5 ${manualOpen ? "border-emerald-400/50 bg-emerald-500/10" : "border-white/10 bg-[#171211]"}`}>
          <div>
            <p className={`text-sm font-bold ${manualOpen ? "text-emerald-300" : "text-white"}`}>{manualOpen ? "🟢 Abertura antecipada ativada" : "Aberto só no horário normal"}</p>
            <p className="mt-0.5 text-xs text-white/50">Quer começar mais cedo ou tem evento na cidade? Abre o site pra pedido a qualquer hora. Não se preocupa em desligar — o site sempre fecha sozinho no horário oficial ({STORE_HOURS_LABEL_ADMIN}).</p>
          </div>
          <button type="button" onClick={handleToggleManualOpen} disabled={togglingManualOpen} className={`shrink-0 rounded-full px-4 py-2.5 text-xs font-bold transition disabled:cursor-wait disabled:opacity-50 ${manualOpen ? "bg-white text-emerald-700 hover:bg-white/90" : "bg-emerald-500/90 text-white hover:bg-emerald-500"}`}>
            {togglingManualOpen ? "…" : manualOpen ? "Desligar abertura antecipada" : "Abrir agora"}
          </button>
        </div>

        <PeriodSection title="Hoje" orders={todayOrders} />
        <PeriodSection title="Essa semana" orders={weekOrders} />
        <PeriodSection title="Esse mês" orders={monthOrders} monthLabel={now.toLocaleDateString("pt-BR", { month: "long", year: "numeric" })} />

        <div className="mt-10 rounded-2xl border border-[#ff5a19]/25 bg-[#171211] p-6">
          <p className="text-xs font-bold uppercase tracking-[.18em] text-[#ff7c50]">Rever outra data</p>
          <h2 className="mt-1 font-display text-xl font-extrabold tracking-[-.03em]">Pesquisar dia, mês e ano</h2>
          <div className="mt-4 flex flex-wrap items-center gap-2">
            <input type="date" value={pickedDate} onChange={(e) => setPickedDate(e.target.value)} max={toDateInputValue(new Date())} className="rounded-xl border border-white/15 bg-white/[0.06] px-3.5 py-2.5 text-sm text-white outline-none focus:border-[#ff6b32]" />
            <button type="button" onClick={() => setPickedDate(toDateInputValue(new Date()))} className="rounded-full border border-white/15 px-3.5 py-2.5 text-xs font-bold text-white/70 transition hover:border-white/35 hover:text-white">Hoje</button>
            <button type="button" onClick={() => { const d = new Date(); d.setDate(1); d.setMonth(d.getMonth() - 1); setPickedDate(toDateInputValue(d)); }} className="rounded-full border border-white/15 px-3.5 py-2.5 text-xs font-bold text-white/70 transition hover:border-white/35 hover:text-white">Mês passado</button>
          </div>
          {pickedLoading ? (
            <p className="mt-4 text-sm text-white/50">Buscando…</p>
          ) : pickedDayOrders && pickedMonthOrders ? (
            <div className="mt-5 grid gap-4 sm:grid-cols-2">
              <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
                <p className="text-[10px] font-bold uppercase tracking-[.14em] text-white/45">{pickedDateObj.toLocaleDateString("pt-BR", { day: "2-digit", month: "long", year: "numeric" })}</p>
                <p className="mt-2 font-display text-2xl font-extrabold">{formatTotal(sumRevenue(pickedDayOrders))}</p>
                <p className="mt-1 text-xs text-white/55"><strong className="text-white">{pickedDayOrders.length}</strong> pedido{pickedDayOrders.length === 1 ? "" : "s"} nesse dia</p>
              </div>
              <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
                <p className="text-[10px] font-bold uppercase tracking-[.14em] text-white/45">{pickedDateObj.toLocaleDateString("pt-BR", { month: "long", year: "numeric" })} (mês inteiro)</p>
                <p className="mt-2 font-display text-2xl font-extrabold">{formatTotal(sumRevenue(pickedMonthOrders))}</p>
                <p className="mt-1 text-xs text-white/55"><strong className="text-white">{pickedMonthOrders.length}</strong> pedido{pickedMonthOrders.length === 1 ? "" : "s"} nesse mês</p>
              </div>
              <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4 sm:col-span-2">
                <p className="text-[10px] font-bold uppercase tracking-[.14em] text-white/45">Top 3 mais vendidos em {pickedDateObj.toLocaleDateString("pt-BR", { month: "long", year: "numeric" })}</p>
                {pickedTop3.length === 0 ? (
                  <p className="mt-3 text-sm text-white/50">Sem pedidos nesse mês.</p>
                ) : (
                  <div className="mt-3 space-y-2.5">
                    {pickedTop3.map((item, index) => (
                      <div key={item.name} className="flex items-center gap-3">
                        <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-[#ff5a19]/15 text-xs font-extrabold text-[#ff875c]">{index + 1}º</span>
                        <span className="flex-1 truncate text-sm font-bold">{item.name}</span>
                        <span className="shrink-0 text-xs text-white/55">{item.quantity}x</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          ) : null}
          {!pickedLoading && pickedDayOrders && pickedDayOrders.length > 0 && (() => {
            const duplicateSuspects = findDuplicateSuspects(pickedDayOrders);
            return (
              <div ref={orderListRef} className={isOrderListFullscreen ? "mt-5 bg-[#100d0c] p-6" : "mt-5"}>
                <div className="flex items-center justify-between gap-3">
                  <p className={`font-bold uppercase tracking-[.14em] text-white/45 ${isOrderListFullscreen ? "text-sm" : "text-[10px]"}`}>Pedidos desse dia ({pickedDayOrders.length})</p>
                  <button type="button" onClick={toggleOrderListFullscreen} className="shrink-0 rounded-full border border-white/15 px-3 py-1.5 text-[10px] font-bold text-white/70 transition hover:border-white/35 hover:text-white">
                    {isOrderListFullscreen ? "✕ Sair da tela cheia" : "⛶ Tela cheia"}
                  </button>
                </div>
                <div className={`mt-2 space-y-2 overflow-y-auto rounded-xl border border-white/10 bg-white/[0.03] p-3 ${isOrderListFullscreen ? "max-h-[calc(100vh-110px)]" : "max-h-96"}`}>
                  {[...pickedDayOrders]
                    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
                    .map((order) => {
                      const isSuspect = duplicateSuspects.has(order.id);
                      return (
                        <div key={order.id} className={`rounded-lg border p-3 ${isSuspect ? "border-amber-400/50 bg-amber-400/[0.06]" : "border-white/10 bg-[#171211]"}`}>
                          <div className="flex items-center justify-between gap-2">
                            <span className={`flex items-center gap-2 font-bold text-white ${isOrderListFullscreen ? "text-lg" : "text-sm"}`}>
                              Pedido #{order.orderNumber}
                              {isSuspect && <span className="rounded-full bg-amber-400/20 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-amber-300">⚠️ Possível duplicado</span>}
                            </span>
                            <div className="flex shrink-0 items-center gap-2">
                              <span className={`text-white/45 ${isOrderListFullscreen ? "text-sm" : "text-xs"}`}>{order.createdAt.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}</span>
                              <button type="button" onClick={() => handleDeleteOrder(order)} disabled={deletingOrderId === order.id} aria-label={`Apagar Pedido #${order.orderNumber}`} className="rounded-full border border-red-400/30 px-2 py-1 text-[10px] font-bold text-red-300 transition hover:border-red-400/60 hover:bg-red-400/10 disabled:cursor-wait disabled:opacity-50">
                                {deletingOrderId === order.id ? "Apagando…" : "🗑 Apagar"}
                              </button>
                            </div>
                          </div>
                          {(order.customerName || order.customerPhone) && <p className={`mt-1 font-semibold text-white/60 ${isOrderListFullscreen ? "text-sm" : "text-xs"}`}>👤 {order.customerName}{order.customerName && order.customerPhone ? " · " : ""}{order.customerPhone}</p>}
                          <div className="mt-2 space-y-1">
                            {order.items.map((item) => (
                              <div key={item.id} className={`flex items-center justify-between text-white/65 ${isOrderListFullscreen ? "text-sm" : "text-xs"}`}>
                                <span>{item.quantity}x {item.name}</span>
                                <span>{formatTotal(item.lineTotal)}</span>
                              </div>
                            ))}
                          </div>
                          <div className={`mt-2 flex items-center justify-between border-t border-white/10 pt-2 font-bold text-[#ff875c] ${isOrderListFullscreen ? "text-base" : "text-sm"}`}>
                            <span>Total</span>
                            <span>{formatTotal(order.total)}</span>
                          </div>
                        </div>
                      );
                    })}
                </div>
                {duplicateSuspects.size > 0 && <p className="mt-2 text-[11px] leading-relaxed text-amber-300/80">⚠️ Os pedidos marcados têm os mesmos itens e foram feitos com poucos minutos de diferença — confirme com o cliente pelo WhatsApp antes de preparar os dois, pode ser o mesmo pedido tentado de novo.</p>}
              </div>
            );
          })()}

          <div className="mt-6 border-t border-white/10 pt-5">
            <p className="text-[10px] font-bold uppercase tracking-[.14em] text-white/45">{pickedDateObj.toLocaleDateString("pt-BR", { month: "long", year: "numeric" })}</p>
            <h3 className="mt-1 text-sm font-bold text-white">Qual dia da semana vendeu mais</h3>
            <div className="mt-5 flex justify-between gap-2 sm:gap-3" style={{ height: "140px" }}>
              {weekdayChart.map((bucket) => (
                <div key={bucket.label} className="flex flex-1 flex-col items-center gap-2">
                  <div className="flex w-full flex-1 items-end justify-center">
                    <div className="w-full max-w-9 rounded-t-md bg-[#ff5a19]" style={{ height: `${Math.max(4, (bucket.total / maxWeekdayValue) * 100)}%` }} title={formatTotal(bucket.total)} />
                  </div>
                  <span className="text-center text-[9px] font-bold uppercase leading-tight text-white/45">{bucket.label.slice(0, 3)}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="mt-10 rounded-2xl border border-white/10 bg-[#171211] p-6">
          <p className="text-xs font-bold uppercase tracking-[.18em] text-[#ff7c50]">Carrossel do site</p>
          <h2 className="mt-1 font-display text-xl font-extrabold tracking-[-.03em]">Fotos em destaque para o público</h2>
          <p className="mt-1.5 text-sm text-white/50">Máximo de {CAROUSEL_MAX_IMAGES} fotos por vez. Pra trocar, remova uma antes de adicionar outra.</p>
          {carouselError && <p className="mt-3 text-sm text-red-400">{carouselError}</p>}
          {!carouselImages ? (
            <p className="mt-4 text-sm text-white/50">Carregando…</p>
          ) : (
            <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {carouselImages.map((image) => (
                <div key={image.id} className="overflow-hidden rounded-xl border border-white/10 bg-white/[0.03]">
                  <img src={image.url} alt="Foto do carrossel" className="h-40 w-full object-cover" />
                  <button type="button" onClick={() => handleRemoveImage(image.id)} className="flex w-full items-center justify-center gap-1.5 border-t border-white/10 py-2.5 text-xs font-bold text-red-400 transition hover:bg-red-500/10">Remover</button>
                </div>
              ))}
              {carouselImages.length < CAROUSEL_MAX_IMAGES && (
                <label className={`flex h-40 flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-white/20 text-sm font-bold text-white/50 transition hover:border-[#ff5a19]/50 hover:text-white ${uploading ? "pointer-events-none opacity-50" : "cursor-pointer"}`}>
                  <PlusIconAdmin />
                  {uploading ? "Enviando…" : "Adicionar foto"}
                  <input type="file" accept="image/*" onChange={handleUploadImage} disabled={uploading} className="hidden" />
                </label>
              )}
            </div>
          )}
        </div>

        <div className="mt-10 rounded-2xl border border-white/10 bg-[#171211] p-6">
          <p className="text-xs font-bold uppercase tracking-[.18em] text-[#ff7c50]">Cardápio</p>
          <h2 className="mt-1 font-display text-xl font-extrabold tracking-[-.03em]">Preços e disponibilidade</h2>
          <p className="mt-1.5 text-sm text-white/50">Acabou algum ingrediente? Marca como esgotado que o item some do "Adicionar ao pedido" no site na hora. Preço subiu? Edita direto aqui. Não vende mais esse item? "Excluir do site" tira ele do cardápio sem apagar nada — dá pra restaurar quando quiser.</p>
          <div className="mt-5 space-y-6">
            {menuSections.map((section) => {
              const sectionCustomItems = customItems.filter((item) => item.sectionId === section.id);
              const sectionItems: { id: string; name: string; price: number; image?: string }[] = [...section.items, ...sectionCustomItems];
              const sectionItemIds = sectionItems.map((item) => item.id);
              const allSoldOut = sectionItemIds.every((id) => soldOutIds.has(id));
              const isTogglingSection = togglingSectionId === section.id;
              return (
              <div key={section.id}>
                <div className="flex items-center justify-between gap-3">
                  <p className="text-[10px] font-bold uppercase tracking-[.14em] text-white/45">{section.eyebrow}</p>
                  <button type="button" onClick={() => handleToggleSection(section.id, sectionItemIds, !allSoldOut)} disabled={isTogglingSection} className={`shrink-0 rounded-full border px-2.5 py-1 text-[10px] font-bold transition disabled:cursor-wait disabled:opacity-50 ${allSoldOut ? "border-red-400/40 bg-red-400/10 text-red-300 hover:border-red-400/70" : "border-white/15 text-white/50 hover:border-white/35 hover:text-white"}`}>
                    {isTogglingSection ? "…" : allSoldOut ? "Reativar todos" : "Marcar todos esgotados"}
                  </button>
                </div>
                <div className="mt-2 divide-y divide-white/10 rounded-xl border border-white/10">
                  {sectionItems.map((item) => {
                    const isCustom = sectionCustomItems.some((custom) => custom.id === item.id);
                    const isSoldOut = soldOutIds.has(item.id);
                    const isToggling = togglingItemId === item.id;
                    const hasOverride = priceOverrides[item.id] !== undefined;
                    const currentPrice = priceOverrides[item.id] ?? item.price;
                    const isEditingPrice = editingPriceId === item.id;
                    const isSavingPrice = savingPriceId === item.id;
                    const currentPhoto = photoOverrides[item.id] ?? item.image;
                    const isUploadingPhoto = uploadingPhotoId === item.id;
                    const isRemoving = removingItemId === item.id;
                    const isHidden = hiddenIds.has(item.id);
                    const isTogglingHidden = togglingHiddenId === item.id;
                    return (
                      <div key={item.id} className={`flex items-center gap-3 px-4 py-3 ${isHidden ? "opacity-50" : ""}`}>
                        <label className={`relative grid h-12 w-12 shrink-0 place-items-center overflow-hidden rounded-lg border border-white/15 bg-white/[0.04] text-[9px] font-bold text-white/40 transition hover:border-[#ff6b32]/60 ${isUploadingPhoto ? "pointer-events-none opacity-50" : "cursor-pointer"}`}>
                          {currentPhoto ? <img src={currentPhoto} alt={item.name} className="h-full w-full object-cover" /> : "Sem foto"}
                          <span className="absolute inset-0 grid place-items-center bg-black/0 text-transparent transition hover:bg-black/50 hover:text-white">{isUploadingPhoto ? "…" : "Trocar"}</span>
                          <input type="file" accept="image/*" onChange={handleChangeItemPhoto(item.id)} disabled={isUploadingPhoto} className="hidden" />
                        </label>
                        <div className="min-w-0 flex-1">
                          <span className={`text-sm font-bold ${isSoldOut ? "text-white/40 line-through" : "text-white"}`}>{item.name}</span>
                          {isHidden && <span className="ml-2 rounded-full bg-red-500/15 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-red-400">Excluído do site</span>}
                          <div className="mt-1 flex flex-wrap items-center gap-2">
                            {isEditingPrice ? (
                              <>
                                <span className="text-xs text-white/50">R$</span>
                                <input type="text" inputMode="decimal" autoFocus value={priceDraft} onChange={(event) => setPriceDraft(event.target.value)} className="w-20 rounded-lg border border-white/15 bg-white/[0.06] px-2 py-1 text-xs text-white outline-none focus:border-[#ff6b32]" />
                                <button type="button" onClick={() => handleSavePrice(item.id)} disabled={isSavingPrice} className="rounded-full bg-[#ff5a19] px-2.5 py-1 text-[10px] font-bold text-white disabled:opacity-50">{isSavingPrice ? "…" : "Salvar"}</button>
                                <button type="button" onClick={() => setEditingPriceId(null)} className="text-[10px] font-bold text-white/50 hover:text-white">Cancelar</button>
                              </>
                            ) : (
                              <>
                                <span className="text-xs text-white/50">{formatTotal(currentPrice)}{hasOverride && <span className="ml-1 text-white/30">(padrão: {formatTotal(item.price)})</span>}</span>
                                <button type="button" onClick={() => startEditPrice(item.id, currentPrice)} className="text-[10px] font-bold text-white/50 underline decoration-dotted underline-offset-2 hover:text-white">Editar preço</button>
                                {hasOverride && <button type="button" onClick={() => handleResetPrice(item.id)} disabled={isSavingPrice} className="text-[10px] font-bold text-white/50 underline decoration-dotted underline-offset-2 hover:text-white disabled:opacity-50">Restaurar padrão</button>}
                                {currentPhoto && photoOverrides[item.id] !== undefined && <button type="button" onClick={() => handleResetItemPhoto(item.id)} disabled={isUploadingPhoto} className="text-[10px] font-bold text-white/50 underline decoration-dotted underline-offset-2 hover:text-white disabled:opacity-50">Restaurar foto padrão</button>}
                              </>
                            )}
                          </div>
                        </div>
                        <div className="flex shrink-0 flex-col items-end gap-1.5">
                          <button type="button" onClick={() => handleToggleSoldOut(item.id, isSoldOut)} disabled={isToggling} className={`rounded-full border px-3 py-1.5 text-[11px] font-bold transition disabled:cursor-wait disabled:opacity-50 ${isSoldOut ? "border-red-400/40 bg-red-400/10 text-red-300 hover:border-red-400/70" : "border-white/15 text-white/60 hover:border-white/35 hover:text-white"}`}>
                            {isToggling ? "…" : isSoldOut ? "Esgotado — reativar" : "Marcar esgotado"}
                          </button>
                          {isCustom ? (
                            <button type="button" onClick={() => handleRemoveCustomItem(item as CustomMenuItem)} disabled={isRemoving} className="text-[10px] font-bold text-red-400/80 underline decoration-dotted underline-offset-2 hover:text-red-300 disabled:opacity-50">{isRemoving ? "Removendo…" : "🗑 Remover item"}</button>
                          ) : (
                            <button type="button" onClick={() => handleToggleHidden(item.id, item.name, isHidden)} disabled={isTogglingHidden} className="text-[10px] font-bold text-red-400/80 underline decoration-dotted underline-offset-2 hover:text-red-300 disabled:opacity-50">{isTogglingHidden ? "…" : isHidden ? "↩️ Restaurar no site" : "🗑 Excluir do site"}</button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
              );
            })}
          </div>
        </div>

        <div className="mt-10 rounded-2xl border border-white/10 bg-[#171211] p-6">
          <p className="text-xs font-bold uppercase tracking-[.18em] text-[#ff7c50]">Cardápio</p>
          <h2 className="mt-1 font-display text-xl font-extrabold tracking-[-.03em]">Adicionar item novo</h2>
          <p className="mt-1.5 text-sm text-white/50">Um sabor novo de yakisoba, um combinado novo — o que for. Escolhe a seção, preenche e já aparece no site na hora.</p>
          <div className="mt-5 grid gap-4 sm:grid-cols-[auto_1fr]">
            <label className={`flex h-28 w-28 flex-col items-center justify-center gap-1.5 overflow-hidden rounded-xl border border-dashed border-white/20 text-[11px] font-bold text-white/50 transition hover:border-[#ff5a19]/50 hover:text-white ${addingItem ? "pointer-events-none opacity-50" : "cursor-pointer"}`}>
              {newItemPhotoPreview ? <img src={newItemPhotoPreview} alt="Prévia do item novo" className="h-full w-full object-cover" /> : <><PlusIconAdmin /> Foto (opcional)</>}
              <input type="file" accept="image/*" onChange={handlePickNewItemPhoto} disabled={addingItem} className="hidden" />
            </label>
            <div className="grid gap-3">
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <label className="text-[10px] font-bold uppercase tracking-[.14em] text-white/45">Seção</label>
                  <select value={newItemSectionId} onChange={(event) => setNewItemSectionId(event.target.value)} className="mt-1.5 w-full rounded-lg border border-white/15 bg-white/[0.06] px-3 py-2 text-sm text-white outline-none focus:border-[#ff6b32]">
                    {menuSections.map((section) => <option key={section.id} value={section.id} className="bg-[#171211]">{section.eyebrow}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-[10px] font-bold uppercase tracking-[.14em] text-white/45">Preço (R$)</label>
                  <input type="text" inputMode="decimal" value={newItemPrice} onChange={(event) => setNewItemPrice(event.target.value)} placeholder="Ex: 36,90" className="mt-1.5 w-full rounded-lg border border-white/15 bg-white/[0.06] px-3 py-2 text-sm text-white outline-none placeholder:text-white/30 focus:border-[#ff6b32]" />
                </div>
              </div>
              <div>
                <label className="text-[10px] font-bold uppercase tracking-[.14em] text-white/45">Nome do item</label>
                <input type="text" value={newItemName} onChange={(event) => setNewItemName(event.target.value)} placeholder="Ex: Yakisoba de camarão 500g" className="mt-1.5 w-full rounded-lg border border-white/15 bg-white/[0.06] px-3 py-2 text-sm text-white outline-none placeholder:text-white/30 focus:border-[#ff6b32]" />
              </div>
              <div>
                <label className="text-[10px] font-bold uppercase tracking-[.14em] text-white/45">Descrição (opcional)</label>
                <input type="text" value={newItemDescription} onChange={(event) => setNewItemDescription(event.target.value)} placeholder="Ex: Camarão, legumes e macarrão" className="mt-1.5 w-full rounded-lg border border-white/15 bg-white/[0.06] px-3 py-2 text-sm text-white outline-none placeholder:text-white/30 focus:border-[#ff6b32]" />
              </div>
              <button type="button" onClick={handleAddItem} disabled={addingItem} className="mt-1 w-full rounded-full bg-[#ff5a19] px-4 py-2.5 text-xs font-bold text-white transition hover:bg-[#ff6a2e] disabled:cursor-wait disabled:opacity-50 sm:w-auto sm:justify-self-start">
                {addingItem ? "Adicionando…" : "+ Adicionar ao cardápio"}
              </button>
            </div>
          </div>
        </div>

        <div className="mt-10 rounded-2xl border border-white/10 bg-[#171211] p-6">
          <p className="text-xs font-bold uppercase tracking-[.18em] text-[#ff7c50]">Cardápio</p>
          <h2 className="mt-1 font-display text-xl font-extrabold tracking-[-.03em]">Combos do dia</h2>
          <p className="mt-1.5 text-sm text-white/50">É a seção "Promoção do dia" do site. Escolhe em quais dias da semana cada combo aparece, o preço e a foto. Se dois combos caírem no mesmo dia, o site revezua sozinho entre eles.</p>

          {dailyCombos === null ? (
            <p className="mt-4 text-sm text-white/50">Carregando…</p>
          ) : (
            <>
              {dailyCombos.length === 0 && (
                <div className="mt-4 flex flex-col items-start gap-3 rounded-xl border border-dashed border-white/20 p-4 sm:flex-row sm:items-center sm:justify-between">
                  <p className="text-xs text-white/50">Nenhum combo cadastrado ainda. Importa os que já estavam no site pra começar a editar.</p>
                  <button type="button" onClick={handleImportDefaultCombos} disabled={importingCombos} className="shrink-0 rounded-full border border-white/15 px-3 py-1.5 text-[11px] font-bold text-white/70 transition hover:border-white/35 hover:text-white disabled:opacity-50">
                    {importingCombos ? "Importando…" : "Importar combos atuais"}
                  </button>
                </div>
              )}
              <div className="mt-5 space-y-4">
                {dailyCombos.map((combo) => {
                  const isEditingComboPrice = editingComboId === combo.id;
                  const isSavingComboPrice = savingComboId === combo.id;
                  const isUploadingComboPhoto = uploadingComboPhotoId === combo.id;
                  const isRemovingCombo = removingComboId === combo.id;
                  return (
                    <div key={combo.id} className="flex flex-col gap-3 rounded-xl border border-white/10 p-4 sm:flex-row sm:items-start">
                      <label className={`relative grid h-16 w-16 shrink-0 place-items-center overflow-hidden rounded-lg border border-white/15 bg-white/[0.04] text-[9px] font-bold text-white/40 transition hover:border-[#ff6b32]/60 ${isUploadingComboPhoto ? "pointer-events-none opacity-50" : "cursor-pointer"}`}>
                        {combo.image ? <img src={combo.image} alt={combo.name} className="h-full w-full object-cover" /> : "Sem foto"}
                        <span className="absolute inset-0 grid place-items-center bg-black/0 text-transparent transition hover:bg-black/50 hover:text-white">{isUploadingComboPhoto ? "…" : "Trocar"}</span>
                        <input type="file" accept="image/*" onChange={handleChangeComboPhoto(combo.id)} disabled={isUploadingComboPhoto} className="hidden" />
                      </label>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-sm font-bold text-white">{combo.name}</span>
                          {isEditingComboPrice ? (
                            <>
                              <span className="text-xs text-white/50">R$</span>
                              <input type="text" inputMode="decimal" autoFocus value={comboPriceDraft} onChange={(event) => setComboPriceDraft(event.target.value)} className="w-20 rounded-lg border border-white/15 bg-white/[0.06] px-2 py-1 text-xs text-white outline-none focus:border-[#ff6b32]" />
                              <button type="button" onClick={() => handleSaveComboPrice(combo.id)} disabled={isSavingComboPrice} className="rounded-full bg-[#ff5a19] px-2.5 py-1 text-[10px] font-bold text-white disabled:opacity-50">{isSavingComboPrice ? "…" : "Salvar"}</button>
                              <button type="button" onClick={() => setEditingComboId(null)} className="text-[10px] font-bold text-white/50 hover:text-white">Cancelar</button>
                            </>
                          ) : (
                            <>
                              <span className="text-xs text-white/50">{formatTotal(combo.price)}</span>
                              <button type="button" onClick={() => startEditComboPrice(combo)} className="text-[10px] font-bold text-white/50 underline decoration-dotted underline-offset-2 hover:text-white">Editar preço</button>
                            </>
                          )}
                        </div>
                        {combo.description && <p className="mt-1 text-xs text-white/50">{combo.description}</p>}
                        <div className="mt-2 flex flex-wrap gap-1.5">
                          {WEEKDAYS.map((day) => { const active = combo.days.includes(day.value); return (
                            <button key={day.value} type="button" onClick={() => handleToggleComboDay(combo, day.value)} className={`rounded-full border px-2.5 py-1 text-[10px] font-bold transition ${active ? "border-[#ff5a19] bg-[#ff5a19] text-white" : "border-white/15 text-white/50 hover:border-white/35 hover:text-white"}`}>{day.short}</button>
                          ); })}
                        </div>
                        <p className="mt-1.5 text-[11px] text-white/40">{formatDaysLabel(combo.days)}</p>
                      </div>
                      <button type="button" onClick={() => handleRemoveCombo(combo)} disabled={isRemovingCombo} className="shrink-0 text-[10px] font-bold text-red-400/80 underline decoration-dotted underline-offset-2 hover:text-red-300 disabled:opacity-50 sm:self-start">{isRemovingCombo ? "Removendo…" : "🗑 Remover combo"}</button>
                    </div>
                  );
                })}
              </div>
            </>
          )}

          <div className="mt-6 border-t border-white/10 pt-5">
            <p className="text-xs font-bold uppercase tracking-[.18em] text-[#ff7c50]">Novo combo</p>
            <div className="mt-3 grid gap-4 sm:grid-cols-[auto_1fr]">
              <label className={`flex h-28 w-28 flex-col items-center justify-center gap-1.5 overflow-hidden rounded-xl border border-dashed border-white/20 text-[11px] font-bold text-white/50 transition hover:border-[#ff5a19]/50 hover:text-white ${addingCombo ? "pointer-events-none opacity-50" : "cursor-pointer"}`}>
                {newComboPhotoPreview ? <img src={newComboPhotoPreview} alt="Prévia do combo novo" className="h-full w-full object-cover" /> : <><PlusIconAdmin /> Foto (opcional)</>}
                <input type="file" accept="image/*" onChange={handlePickNewComboPhoto} disabled={addingCombo} className="hidden" />
              </label>
              <div className="grid gap-3">
                <div className="grid gap-3 sm:grid-cols-2">
                  <div>
                    <label className="text-[10px] font-bold uppercase tracking-[.14em] text-white/45">Nome do combo</label>
                    <input type="text" value={newComboName} onChange={(event) => setNewComboName(event.target.value)} placeholder="Ex: Combo Terça" className="mt-1.5 w-full rounded-lg border border-white/15 bg-white/[0.06] px-3 py-2 text-sm text-white outline-none placeholder:text-white/30 focus:border-[#ff6b32]" />
                  </div>
                  <div>
                    <label className="text-[10px] font-bold uppercase tracking-[.14em] text-white/45">Preço (R$)</label>
                    <input type="text" inputMode="decimal" value={newComboPrice} onChange={(event) => setNewComboPrice(event.target.value)} placeholder="Ex: 67,90" className="mt-1.5 w-full rounded-lg border border-white/15 bg-white/[0.06] px-3 py-2 text-sm text-white outline-none placeholder:text-white/30 focus:border-[#ff6b32]" />
                  </div>
                </div>
                <div>
                  <label className="text-[10px] font-bold uppercase tracking-[.14em] text-white/45">Descrição (opcional)</label>
                  <input type="text" value={newComboDescription} onChange={(event) => setNewComboDescription(event.target.value)} placeholder="Ex: 1 Yakisoba Médio, 1 Hot Roll, 1 Coca lata" className="mt-1.5 w-full rounded-lg border border-white/15 bg-white/[0.06] px-3 py-2 text-sm text-white outline-none placeholder:text-white/30 focus:border-[#ff6b32]" />
                </div>
                <div>
                  <label className="text-[10px] font-bold uppercase tracking-[.14em] text-white/45">Dias da semana</label>
                  <div className="mt-1.5 flex flex-wrap gap-1.5">
                    {WEEKDAYS.map((day) => { const active = newComboDays.includes(day.value); return (
                      <button key={day.value} type="button" onClick={() => toggleNewComboDay(day.value)} className={`rounded-full border px-2.5 py-1.5 text-[11px] font-bold transition ${active ? "border-[#ff5a19] bg-[#ff5a19] text-white" : "border-white/15 text-white/50 hover:border-white/35 hover:text-white"}`}>{day.short}</button>
                    ); })}
                  </div>
                </div>
                <button type="button" onClick={handleAddCombo} disabled={addingCombo} className="mt-1 w-full rounded-full bg-[#ff5a19] px-4 py-2.5 text-xs font-bold text-white transition hover:bg-[#ff6a2e] disabled:cursor-wait disabled:opacity-50 sm:w-auto sm:justify-self-start">
                  {addingCombo ? "Adicionando…" : "+ Adicionar combo"}
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function PlusIconAdmin() { return <svg className="h-5 w-5" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></svg>; }

function PeriodSection({ title, orders, monthLabel }: { title: string; orders: OrderRecord[]; monthLabel?: string }) {
  const revenue = sumRevenue(orders);
  const top3 = bestSellers(orders, 3);
  return (
    <div className="mt-8">
      <h2 className="font-display text-xl font-extrabold tracking-[-.03em]">{title}{monthLabel ? <span className="ml-2 text-sm font-medium text-white/40">({monthLabel})</span> : null}</h2>
      <div className="mt-4 grid gap-4 lg:grid-cols-[1fr_300px]">
        <div className="grid gap-4 sm:grid-cols-2">
          <StatCard label="Faturamento" value={formatTotal(revenue)} />
          <StatCard label="Pedidos" value={String(orders.length)} highlight />
        </div>
        <div className="rounded-2xl border border-white/10 bg-[#171211] p-5">
          <p className="text-[10px] font-bold uppercase tracking-[.14em] text-white/45">Top 3 mais vendidos</p>
          {top3.length === 0 ? (
            <p className="mt-3 text-sm text-white/50">Sem pedidos ainda.</p>
          ) : (
            <div className="mt-3 space-y-2.5">
              {top3.map((item, index) => (
                <div key={item.name} className="flex items-center gap-3">
                  <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-[#ff5a19]/15 text-xs font-extrabold text-[#ff875c]">{index + 1}º</span>
                  <span className="flex-1 truncate text-sm font-bold">{item.name}</span>
                  <span className="shrink-0 text-xs text-white/55">{item.quantity}x</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function StatCard({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className={`rounded-2xl border p-5 ${highlight ? "border-[#ff5a19]/40 bg-[#ff5a19]/10" : "border-white/10 bg-[#171211]"}`}>
      <p className="text-[10px] font-bold uppercase tracking-[.14em] text-white/45">{label}</p>
      <p className={`mt-2 font-display text-3xl font-extrabold tracking-[-.03em] ${highlight ? "text-[#ff875c]" : "text-white"}`}>{value}</p>
    </div>
  );
}
