import { startTransition, useEffect, useMemo, useState } from "react";
import {
  ArrowUpLeft,
  Bot,
  Copy,
  CreditCard,
  Headphones,
  LayoutGrid,
  LoaderCircle,
  Monitor,
  MoonStar,
  RefreshCw,
  ShoppingBag,
  Sparkles,
  SunMedium,
  UploadCloud,
  Wifi
} from "lucide-react";
import { toast, Toaster } from "sonner";

import { api, ApiError } from "./lib/api";
import { formatBytes, formatCount, formatDate, formatRelativeDays } from "./lib/format";
import { createPreviewSnapshot } from "./lib/mock-data";
import { applyResolvedTheme, getStoredThemePreference, resolveEffectiveTheme, setStoredThemePreference, type ResolvedTheme, type ThemePreference } from "./lib/theme";
import { getTelegramThemeSource, getTelegramWebApp } from "./lib/telegram";
import type { AppSnapshot, OrderDto, PlanDto, ServiceDto, TicketDto, UserDto } from "./lib/types";
import { Badge } from "./components/ui/badge";
import { Button } from "./components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "./components/ui/card";
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "./components/ui/dialog";
import { Input } from "./components/ui/input";
import { Skeleton } from "./components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "./components/ui/tabs";
import { Textarea } from "./components/ui/textarea";

type Phase = "booting" | "ready" | "preview" | "error";
type AppTab = "dashboard" | "buy" | "services" | "support";

const themeOptions: Array<{
  id: ThemePreference;
  label: string;
  icon: typeof SunMedium;
}> = [
  { id: "light", label: "روشن", icon: SunMedium },
  { id: "dark", label: "تیره", icon: MoonStar },
  { id: "system", label: "خودکار", icon: Monitor }
];

const navItems: Array<{
  id: AppTab;
  label: string;
  icon: typeof LayoutGrid;
}> = [
  { id: "dashboard", label: "داشبورد", icon: LayoutGrid },
  { id: "buy", label: "خرید", icon: ShoppingBag },
  { id: "services", label: "سرویس‌ها", icon: Wifi },
  { id: "support", label: "پشتیبانی", icon: Headphones }
];

export default function App() {
  const telegram = useMemo(() => getTelegramWebApp(), []);
  const [phase, setPhase] = useState<Phase>("booting");
  const [snapshot, setSnapshot] = useState<AppSnapshot | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<AppTab>("dashboard");
  const [refreshing, setRefreshing] = useState(false);
  const [busyKey, setBusyKey] = useState<string | null>(null);

  const [selectedOrder, setSelectedOrder] = useState<OrderDto | null>(null);
  const [selectedService, setSelectedService] = useState<ServiceDto | null>(null);
  const [selectedTicket, setSelectedTicket] = useState<TicketDto | null>(null);
  const [detailLoading, setDetailLoading] = useState<"order" | "service" | "ticket" | null>(null);

  const [receiptText, setReceiptText] = useState("");
  const [receiptFile, setReceiptFile] = useState<File | null>(null);
  const [ticketDraft, setTicketDraft] = useState("");
  const [themePreference, setThemePreference] = useState<ThemePreference>(() => getStoredThemePreference());
  const [resolvedTheme, setResolvedTheme] = useState<ResolvedTheme>(() => {
    if (typeof window === "undefined") {
      return "light";
    }

    return resolveEffectiveTheme(
      getStoredThemePreference(),
      getTelegramThemeSource(getTelegramWebApp()),
      window.matchMedia("(prefers-color-scheme: dark)")
    );
  });

  useEffect(() => {
    const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");

    const syncTheme = () => {
      const telegramTheme = getTelegramThemeSource(telegram);
      const nextResolvedTheme = resolveEffectiveTheme(themePreference, telegramTheme, mediaQuery);
      applyResolvedTheme({
        preference: themePreference,
        resolvedTheme: nextResolvedTheme,
        telegramTheme
      });
      setResolvedTheme((currentTheme) => (currentTheme === nextResolvedTheme ? currentTheme : nextResolvedTheme));
    };

    const handleMediaChange = () => {
      if (themePreference === "system") {
        syncTheme();
      }
    };

    syncTheme();

    if (typeof mediaQuery.addEventListener === "function") {
      mediaQuery.addEventListener("change", handleMediaChange);
    } else {
      mediaQuery.addListener(handleMediaChange);
    }

    telegram?.onEvent?.("themeChanged", syncTheme);

    return () => {
      if (typeof mediaQuery.removeEventListener === "function") {
        mediaQuery.removeEventListener("change", handleMediaChange);
      } else {
        mediaQuery.removeListener(handleMediaChange);
      }

      telegram?.offEvent?.("themeChanged", syncTheme);
    };
  }, [telegram, themePreference]);

  useEffect(() => {
    telegram?.ready();
    telegram?.expand();
    telegram?.disableVerticalSwipes?.();
    void bootstrap();
  }, [telegram]);

  useEffect(() => {
    setReceiptText(selectedOrder?.receiptText ?? "");
    setReceiptFile(null);
  }, [selectedOrder?.id]);

  const metrics = useMemo(() => {
    if (!snapshot) {
      return null;
    }

    return {
      activeServices: snapshot.services.filter((service) => service.status === "active").length,
      pendingOrders: snapshot.orders.filter((order) => ["pending_receipt", "under_review"].includes(order.status)).length,
      openTickets: snapshot.tickets.filter((ticket) => ticket.status === "open").length
    };
  }, [snapshot]);

  const activeServices = useMemo(
    () => snapshot?.services.filter((service) => service.status === "active") ?? [],
    [snapshot?.services]
  );

  const archivedServices = useMemo(
    () => snapshot?.services.filter((service) => service.status !== "active") ?? [],
    [snapshot?.services]
  );

  const pendingOrders = useMemo(
    () => snapshot?.orders.filter((order) => ["pending_receipt", "under_review"].includes(order.status)) ?? [],
    [snapshot?.orders]
  );

  const orderHistory = useMemo(
    () => snapshot?.orders.filter((order) => !["pending_receipt", "under_review"].includes(order.status)) ?? [],
    [snapshot?.orders]
  );

  async function bootstrap() {
    setErrorMessage(null);

    try {
      const nextSnapshot = await resolveSnapshot();
      startTransition(() => {
        setSnapshot(nextSnapshot);
        setPhase(nextSnapshot.preview ? "preview" : "ready");
      });
    } catch (error) {
      setPhase("error");
      setErrorMessage(getErrorMessage(error));
    }
  }

  async function resolveSnapshot(): Promise<AppSnapshot> {
    try {
      const currentUser = await api.getMe();
      return loadSnapshot(currentUser.user, false);
    } catch (error) {
      if (error instanceof ApiError && error.status === 401 && telegram?.initData) {
        const auth = await api.authTelegram(telegram.initData);
        return loadSnapshot(auth.user, false);
      }

      if (!telegram || (error instanceof ApiError && error.status === 401)) {
        return createPreviewSnapshot();
      }

      throw error;
    }
  }

  async function loadSnapshot(user: UserDto, preview: boolean): Promise<AppSnapshot> {
    if (preview) {
      return createPreviewSnapshot();
    }

    const [plansPayload, servicesPayload, ordersPayload, ticketsPayload] = await Promise.all([
      api.getPlans(),
      api.getServices(),
      api.getOrders(),
      api.getTickets()
    ]);

    return {
      preview: false,
      user,
      payment: plansPayload.payment,
      plans: plansPayload.plans,
      services: servicesPayload.services,
      orders: ordersPayload.orders,
      tickets: ticketsPayload.tickets
    };
  }

  async function refreshSnapshot(options?: { silent?: boolean }) {
    if (phase === "preview") {
      startTransition(() => {
        setSnapshot(createPreviewSnapshot());
      });
      return;
    }

    if (!options?.silent) {
      setRefreshing(true);
    }

    try {
      const me = await api.getMe();
      const nextSnapshot = await loadSnapshot(me.user, false);
      startTransition(() => {
        setSnapshot(nextSnapshot);
      });
    } catch (error) {
      toast.error(getErrorMessage(error));
    } finally {
      setRefreshing(false);
    }
  }

  function handleThemePreferenceChange(nextPreference: ThemePreference) {
    setStoredThemePreference(nextPreference);
    setThemePreference(nextPreference);
  }

  function ensureLiveMode() {
    if (phase !== "ready") {
      toast.info("برای انجام عملیات واقعی، مینی‌اپ را از داخل تلگرام باز کنید.");
      return false;
    }

    return true;
  }

  async function handleCreateOrder(plan: PlanDto) {
    if (!ensureLiveMode()) {
      return;
    }

    setBusyKey(`buy:${plan.code}`);

    try {
      const response = await api.createOrder(plan.code);
      setSelectedOrder(response.order);
      setActiveTab("buy");
      toast.success("سفارش ساخته شد. رسید یا شناسه تراکنش را ثبت کنید.");
      await refreshSnapshot({ silent: true });
    } catch (error) {
      toast.error(getErrorMessage(error));
    } finally {
      setBusyKey(null);
    }
  }

  async function handleRequestTrial() {
    if (!ensureLiveMode()) {
      return;
    }

    setBusyKey("trial");

    try {
      const response = await api.requestTrial();
      setSelectedService({
        ...response.service,
        deliveryMessage: response.deliveryMessage
      });
      toast.success("اکانت تست شما صادر شد.");
      await refreshSnapshot({ silent: true });
    } catch (error) {
      toast.error(getErrorMessage(error));
    } finally {
      setBusyKey(null);
    }
  }

  async function handleRenewService(serviceId: number) {
    if (!ensureLiveMode()) {
      return;
    }

    setBusyKey(`renew:${serviceId}`);

    try {
      const response = await api.renewService(serviceId);
      setSelectedOrder(response.order);
      toast.success("سفارش تمدید ساخته شد. رسید را ثبت کنید.");
      await refreshSnapshot({ silent: true });
    } catch (error) {
      toast.error(getErrorMessage(error));
    } finally {
      setBusyKey(null);
    }
  }

  async function openOrder(orderId: number) {
    const previewOrder = snapshot?.orders.find((order) => order.id === orderId) ?? null;

    if (phase === "preview") {
      setSelectedOrder(previewOrder);
      return;
    }

    setDetailLoading("order");

    try {
      const response = await api.getOrder(orderId);
      setSelectedOrder(response.order);
    } catch (error) {
      toast.error(getErrorMessage(error));
    } finally {
      setDetailLoading(null);
    }
  }

  async function openService(serviceId: number) {
    const previewService = snapshot?.services.find((service) => service.id === serviceId) ?? null;

    if (phase === "preview") {
      setSelectedService(previewService);
      return;
    }

    setDetailLoading("service");

    try {
      const response = await api.getService(serviceId);
      setSelectedService(response.service);
    } catch (error) {
      toast.error(getErrorMessage(error));
    } finally {
      setDetailLoading(null);
    }
  }

  async function openTicket(ticketId: number) {
    const previewTicket = snapshot?.tickets.find((ticket) => ticket.id === ticketId) ?? null;

    if (phase === "preview") {
      setSelectedTicket(previewTicket);
      return;
    }

    setDetailLoading("ticket");

    try {
      const response = await api.getTicket(ticketId);
      setSelectedTicket(response.ticket);
    } catch (error) {
      toast.error(getErrorMessage(error));
    } finally {
      setDetailLoading(null);
    }
  }

  async function ensureOpenTicket() {
    if (!ensureLiveMode()) {
      const previewTicket = snapshot?.tickets.find((ticket) => ticket.status === "open");
      if (previewTicket) {
        setSelectedTicket(previewTicket);
      }
      return;
    }

    setBusyKey("ticket:create");

    try {
      const created = await api.ensureTicket();
      await openTicket(created.ticket.id);
      setActiveTab("support");
    } catch (error) {
      toast.error(getErrorMessage(error));
    } finally {
      setBusyKey(null);
    }
  }

  async function handleSendTicketMessage() {
    if (!selectedTicket || !ticketDraft.trim()) {
      return;
    }

    if (!ensureLiveMode()) {
      toast.info("ارسال پیام در حالت پیش‌نمایش فعال نیست.");
      return;
    }

    setBusyKey(`ticket:message:${selectedTicket.id}`);

    try {
      const response = await api.sendTicketMessage(selectedTicket.id, ticketDraft.trim());
      setSelectedTicket((current) =>
        current
          ? {
              ...current,
              messages: [...(current.messages ?? []), response.message]
            }
          : current
      );
      setTicketDraft("");
      toast.success("پیام شما برای پشتیبانی ارسال شد.");
      await refreshSnapshot({ silent: true });
    } catch (error) {
      toast.error(getErrorMessage(error));
    } finally {
      setBusyKey(null);
    }
  }

  async function handleSubmitReceipt() {
    if (!selectedOrder) {
      return;
    }

    if (!receiptText.trim() && !receiptFile) {
      toast.info("حداقل متن تراکنش یا تصویر رسید را وارد کنید.");
      return;
    }

    if (!ensureLiveMode()) {
      return;
    }

    const formData = new FormData();

    if (receiptText.trim()) {
      formData.append("receiptText", receiptText.trim());
    }

    if (receiptFile) {
      formData.append("receiptFile", receiptFile);
    }

    setBusyKey(`receipt:${selectedOrder.id}`);

    try {
      const response = await api.submitReceipt(selectedOrder.id, formData);
      setSelectedOrder(response.order);
      toast.success("رسید شما ثبت شد و برای بررسی ارسال شد.");
      await refreshSnapshot({ silent: true });
    } catch (error) {
      toast.error(getErrorMessage(error));
    } finally {
      setBusyKey(null);
    }
  }

  async function handleCopy(text: string, successMessage: string) {
    try {
      await navigator.clipboard.writeText(text);
      toast.success(successMessage);
    } catch {
      toast.error("کپی خودکار ناموفق بود.");
    }
  }

  if (phase === "booting" || !snapshot || !metrics) {
    return <LoadingShell />;
  }

  if (phase === "error") {
    return (
      <main className="mx-auto flex min-h-screen w-full max-w-3xl items-center px-4 py-8">
        <Card className="w-full">
          <CardHeader>
            <CardTitle>بارگذاری پنل ممکن نشد</CardTitle>
            <CardDescription>{errorMessage ?? "خطای ناشناخته‌ای رخ داده است."}</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-3">
            <Button onClick={() => void bootstrap()}>تلاش مجدد</Button>
            <Button variant="outline" onClick={() => {
              const preview = createPreviewSnapshot();
              setSnapshot(preview);
              setPhase("preview");
            }}>
              نمایش پیش‌نمایش
            </Button>
          </CardContent>
        </Card>
      </main>
    );
  }

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-4xl flex-col px-4 pb-[calc(6rem+env(safe-area-inset-bottom))] pt-[calc(1rem+env(safe-area-inset-top))]">
      <Toaster
        position="top-center"
        theme={resolvedTheme}
        richColors
        toastOptions={{
          style: {
            fontFamily: "Vazirmatn, Segoe UI, Tahoma, sans-serif",
            background: "var(--app-surface)",
            border: "1px solid var(--app-border)",
            color: "var(--app-text)"
          }
        }}
      />

      <header className="mb-5 flex flex-wrap items-start gap-4">
        <div className="min-w-[240px] flex-1 space-y-2">
          <Badge variant={snapshot.preview ? "warning" : "info"} className="w-fit">
            {snapshot.preview ? "حالت پیش‌نمایش" : "مینی‌اپ MerkaBot"}
          </Badge>
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-[20px] border border-[color:var(--app-border)] bg-[color:var(--app-surface)]">
              <Bot className="h-5 w-5 text-[color:var(--app-text)]" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-[color:var(--app-text)]">پنل سرویس‌های شما</h1>
              <p className="text-sm text-[color:var(--app-text-muted)]">
                {snapshot.user.displayName}
                {snapshot.preview ? " • فقط نمایش رابط" : " • ورود امن از داخل تلگرام"}
              </p>
            </div>
          </div>
        </div>
        <ThemeSwitcher preference={themePreference} onChange={handleThemePreferenceChange} />
        <Button
          variant="outline"
          size="icon"
          onClick={() => void refreshSnapshot()}
          disabled={refreshing}
          aria-label="به‌روزرسانی"
        >
          <RefreshCw className={refreshing ? "h-4 w-4 animate-spin" : "h-4 w-4"} />
        </Button>
      </header>

      {snapshot.preview ? (
        <Card className="mb-5 border-dashed">
          <CardContent className="flex items-start justify-between gap-4 py-5">
            <div>
              <p className="text-sm font-semibold text-[color:var(--app-text)]">برای عملیات واقعی، مینی‌اپ را از داخل ربات باز کنید.</p>
              <p className="mt-2 text-sm leading-6 text-[color:var(--app-text-muted)]">
                این حالت فقط برای بررسی UI و جریان‌ها است. احراز هویت، خرید، ثبت رسید و پیام پشتیبانی در پیش‌نمایش غیرفعال هستند.
              </p>
            </div>
            <Sparkles className="mt-1 h-5 w-5 shrink-0 text-[color:var(--app-text-muted)]" />
          </CardContent>
        </Card>
      ) : null}

      <section className="mb-5 grid gap-3 sm:grid-cols-3">
        <MetricCard label="سرویس فعال" value={formatCount(metrics.activeServices)} hint="وضعیت همگام‌شده" />
        <MetricCard label="سفارش در انتظار" value={formatCount(metrics.pendingOrders)} hint="رسید یا بررسی" />
        <MetricCard label="تیکت باز" value={formatCount(metrics.openTickets)} hint="پاسخ در همان پنل" />
      </section>

      <section className="mb-5">
        <Card className="overflow-hidden">
          <CardContent className="grid gap-5 px-5 py-5 sm:grid-cols-[1.4fr_1fr]">
            <div className="space-y-4">
              <div className="space-y-2">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[color:var(--app-text-muted)]">Operational Surface</p>
                <h2 className="text-2xl font-bold leading-tight text-[color:var(--app-text)]">
                  خرید، تمدید و پشتیبانی را بدون خروج از تلگرام مدیریت کنید.
                </h2>
                <p className="text-sm leading-7 text-[color:var(--app-text-muted)]">
                  تمام flowهای کاربر در یک UI فشرده و یکپارچه جمع شده‌اند. بات فقط برای ورود، اعلان و مدیریت ادمین باقی مانده است.
                </p>
              </div>
              <div className="flex flex-wrap gap-3">
                <Button onClick={() => setActiveTab("buy")}>
                  خرید سرویس
                  <ArrowUpLeft className="h-4 w-4" />
                </Button>
                <Button variant="outline" onClick={() => void ensureOpenTicket()}>
                  پشتیبانی
                </Button>
              </div>
            </div>
            <div className="grid gap-3 rounded-[28px] border border-[color:var(--app-border)] bg-[color:var(--app-surface-muted)] p-4">
              <MiniStat label="اولین اکانت تست" value={snapshot.user.trialUsed ? "مصرف شده" : "آماده"} />
              <MiniStat label="آخرین همگام‌سازی" value={snapshot.services[0]?.lastSyncAt ? formatDate(snapshot.services[0].lastSyncAt) : "هنوز ثبت نشده"} />
              <MiniStat label="کارت مقصد" value={snapshot.payment.cardTitle} />
            </div>
          </CardContent>
        </Card>
      </section>

      <section className="mb-5 flex-1">
        {activeTab === "dashboard" ? (
          <div className="grid gap-5 lg:grid-cols-[1.2fr_0.8fr]">
            <Card>
              <CardHeader>
                <CardTitle>وضعیت سفارش‌ها</CardTitle>
                <CardDescription>رسیدها، سفارش‌های در انتظار و تاریخچه اخیر را همین‌جا دنبال کنید.</CardDescription>
              </CardHeader>
              <CardContent>
                <Tabs defaultValue="pending">
                  <TabsList>
                    <TabsTrigger value="pending">در جریان</TabsTrigger>
                    <TabsTrigger value="history">آرشیو اخیر</TabsTrigger>
                  </TabsList>
                  <TabsContent value="pending">
                    <ListArea>
                      {pendingOrders.length > 0 ? pendingOrders.map((order) => (
                        <OrderCard key={order.id} order={order} onOpen={() => void openOrder(order.id)} />
                      )) : <EmptyState title="سفارش فعالی ندارید" description="با خرید یا تمدید سرویس، وضعیت سفارش‌ها از اینجا قابل پیگیری است." />}
                    </ListArea>
                  </TabsContent>
                  <TabsContent value="history">
                    <ListArea>
                      {orderHistory.length > 0 ? orderHistory.slice(0, 4).map((order) => (
                        <OrderCard key={order.id} order={order} onOpen={() => void openOrder(order.id)} />
                      )) : <EmptyState title="تاریخچه‌ای ثبت نشده" description="بعد از اولین خرید یا صدور تست، سابقه سفارش‌ها اینجا قرار می‌گیرد." />}
                    </ListArea>
                  </TabsContent>
                </Tabs>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>دسترسی‌های سریع</CardTitle>
                <CardDescription>عملیات پرتکرار را بدون جابه‌جایی بین صفحه‌ها اجرا کنید.</CardDescription>
              </CardHeader>
              <CardContent className="grid gap-3">
                <QuickAction
                  title="درخواست اکانت تست"
                  description={snapshot.user.trialUsed ? "اکانت تست قبلاً برای شما صادر شده است." : "در صورت نداشتن سرویس فعال، بلافاصله صادر می‌شود."}
                  icon={Sparkles}
                  actionLabel={snapshot.user.trialUsed ? "مصرف شده" : "درخواست تست"}
                  onClick={() => void handleRequestTrial()}
                  disabled={snapshot.user.trialUsed || busyKey === "trial"}
                  loading={busyKey === "trial"}
                />
                <QuickAction
                  title="آخرین سرویس شما"
                  description={activeServices[0] ? `${activeServices[0].plan?.title ?? activeServices[0].planCode} • انقضا ${formatDate(activeServices[0].expiresAt)}` : "هنوز سرویسی برای شما ثبت نشده است."}
                  icon={Wifi}
                  actionLabel={activeServices[0] ? "جزئیات سرویس" : "بدون سرویس"}
                  onClick={() => activeServices[0] && void openService(activeServices[0].id)}
                  disabled={!activeServices[0]}
                />
                <QuickAction
                  title="پشتیبانی"
                  description={snapshot.tickets[0] ? `آخرین بروزرسانی: ${formatDate(snapshot.tickets[0].updatedAt)}` : "یک تیکت باز کنید و پاسخ‌ها را در همین رابط دریافت کنید."}
                  icon={Headphones}
                  actionLabel="باز کردن تیکت"
                  onClick={() => void ensureOpenTicket()}
                  disabled={busyKey === "ticket:create"}
                  loading={busyKey === "ticket:create"}
                />
              </CardContent>
            </Card>
          </div>
        ) : null}

        {activeTab === "buy" ? (
          <div className="grid gap-5 lg:grid-cols-[0.88fr_1.12fr]">
            <Card>
              <CardHeader>
                <CardTitle>اطلاعات پرداخت</CardTitle>
                <CardDescription>پس از واریز، رسید تصویری یا شناسه تراکنش را در سفارش مربوط ثبت کنید.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="rounded-[24px] border border-[color:var(--app-border)] bg-[color:var(--app-surface-muted)] p-4">
                  <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[color:var(--app-text-muted)]">Card to Card</p>
                  <p className="mt-3 text-sm text-[color:var(--app-text-muted)]">دارنده کارت</p>
                  <p className="mt-1 text-base font-semibold text-[color:var(--app-text)]">{snapshot.payment.cardTitle}</p>
                  <div className="mt-4 flex items-center justify-between gap-3 rounded-2xl border border-[color:var(--app-border)] bg-[color:var(--app-surface)] px-4 py-3">
                    <div>
                      <p className="text-xs text-[color:var(--app-text-muted)]">شماره کارت</p>
                      <p className="mt-1 text-base font-semibold tracking-[0.08em] text-[color:var(--app-text)]">{snapshot.payment.cardNumber}</p>
                    </div>
                    <Button variant="secondary" size="sm" onClick={() => void handleCopy(snapshot.payment.cardNumber, "شماره کارت کپی شد.")}>
                      <Copy className="h-4 w-4" />
                      کپی
                    </Button>
                  </div>
                </div>
                <Card className="border-dashed">
                  <CardContent className="py-4">
                    <p className="text-sm leading-7 text-[color:var(--app-text-muted)]">{snapshot.payment.notes}</p>
                  </CardContent>
                </Card>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>پلن‌های قابل خرید</CardTitle>
                <CardDescription>پلن را انتخاب کنید، سپس رسید را در همان سفارش ثبت کنید.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {snapshot.plans.map((plan) => (
                  <div key={plan.code} className="rounded-[24px] border border-[color:var(--app-border)] p-4">
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <p className="text-base font-semibold text-[color:var(--app-text)]">{plan.title}</p>
                        <p className="mt-2 text-sm leading-6 text-[color:var(--app-text-muted)]">
                          {formatRelativeDays(plan.days)} • {formatBytes(plan.trafficBytes)} • {formatCount(plan.deviceLimit)} دستگاه
                        </p>
                      </div>
                      <Badge variant="default">{plan.priceLabel}</Badge>
                    </div>
                    <div className="mt-4 flex items-center justify-between gap-3">
                      <p className="text-xs text-[color:var(--app-text-muted)]">پس از ثبت سفارش، صفحه پرداخت و ثبت رسید باز می‌شود.</p>
                      <Button
                        onClick={() => void handleCreateOrder(plan)}
                        disabled={busyKey === `buy:${plan.code}`}
                      >
                        {busyKey === `buy:${plan.code}` ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <CreditCard className="h-4 w-4" />}
                        خرید
                      </Button>
                    </div>
                  </div>
                ))}
                <div className="pt-2">
                  <SectionLabel title="سفارش‌های در انتظار رسید" description="اگر قبلاً سفارشی ساخته‌اید، از اینجا ادامه دهید." />
                  <ListArea className="mt-3">
                    {pendingOrders.length > 0 ? pendingOrders.map((order) => (
                      <OrderCard key={order.id} order={order} onOpen={() => void openOrder(order.id)} />
                    )) : <EmptyState title="سفارشی در انتظار رسید ندارید" description="بعد از انتخاب پلن، سفارش اینجا ظاهر می‌شود." />}
                  </ListArea>
                </div>
              </CardContent>
            </Card>
          </div>
        ) : null}

        {activeTab === "services" ? (
          <Card>
            <CardHeader>
              <CardTitle>سرویس‌های من</CardTitle>
              <CardDescription>کانفیگ، مصرف، انقضا و تمدید هر سرویس را در یک سطح عملیاتی ببینید.</CardDescription>
            </CardHeader>
            <CardContent>
              <Tabs defaultValue="active">
                <TabsList>
                  <TabsTrigger value="active">فعال</TabsTrigger>
                  <TabsTrigger value="archived">منقضی / غیرفعال</TabsTrigger>
                </TabsList>
                <TabsContent value="active">
                  <ListArea>
                    {activeServices.length > 0 ? activeServices.map((service) => (
                      <ServiceCard
                        key={service.id}
                        service={service}
                        onOpen={() => void openService(service.id)}
                        onRenew={() => void handleRenewService(service.id)}
                        renewBusy={busyKey === `renew:${service.id}`}
                      />
                    )) : <EmptyState title="سرویس فعالی ندارید" description="برای شروع، یک پلن خریداری کنید یا اکانت تست بگیرید." />}
                  </ListArea>
                </TabsContent>
                <TabsContent value="archived">
                  <ListArea>
                    {archivedServices.length > 0 ? archivedServices.map((service) => (
                      <ServiceCard
                        key={service.id}
                        service={service}
                        onOpen={() => void openService(service.id)}
                        onRenew={() => void handleRenewService(service.id)}
                        renewBusy={busyKey === `renew:${service.id}`}
                      />
                    )) : <EmptyState title="سرویس آرشیوشده‌ای وجود ندارد" description="هر سرویس منقضی یا غیرفعال اینجا قرار می‌گیرد." />}
                  </ListArea>
                </TabsContent>
              </Tabs>
            </CardContent>
          </Card>
        ) : null}

        {activeTab === "support" ? (
          <div className="grid gap-5 lg:grid-cols-[0.9fr_1.1fr]">
            <Card>
              <CardHeader>
                <CardTitle>شروع گفت‌وگو با پشتیبانی</CardTitle>
                <CardDescription>برای هر موضوع، همان تیکت باز نگه داشته می‌شود تا روند پاسخ‌گویی پیوسته بماند.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <Button onClick={() => void ensureOpenTicket()} disabled={busyKey === "ticket:create"} className="w-full">
                  {busyKey === "ticket:create" ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Headphones className="h-4 w-4" />}
                  باز کردن تیکت
                </Button>
                <div className="rounded-[24px] border border-[color:var(--app-border)] bg-[color:var(--app-surface-muted)] p-4">
                  <p className="text-sm font-semibold text-[color:var(--app-text)]">روال پاسخ‌دهی</p>
                  <p className="mt-2 text-sm leading-7 text-[color:var(--app-text-muted)]">
                    پیام شما برای ادمین‌های بات ارسال می‌شود و پاسخ‌ها همین‌جا و هم‌زمان از داخل سیستم فعلی مدیریت می‌شوند.
                  </p>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>تیکت‌های اخیر</CardTitle>
                <CardDescription>هر تیکت را باز کنید تا history کامل گفتگو نمایش داده شود.</CardDescription>
              </CardHeader>
              <CardContent>
                <ListArea>
                  {snapshot.tickets.length > 0 ? snapshot.tickets.map((ticket) => (
                    <button
                      key={ticket.id}
                      type="button"
                      onClick={() => void openTicket(ticket.id)}
                      className="flex w-full items-center justify-between gap-4 rounded-[22px] border border-[color:var(--app-border)] bg-[color:var(--app-surface)] px-4 py-4 text-right transition hover:bg-[color:var(--app-surface-muted)]"
                    >
                      <div>
                        <div className="flex items-center gap-2">
                          <p className="text-sm font-semibold text-[color:var(--app-text)]">تیکت #{ticket.id}</p>
                          <StatusBadge status={ticket.status} />
                        </div>
                        <p className="mt-2 text-sm text-[color:var(--app-text-muted)]">آخرین بروزرسانی: {formatDate(ticket.updatedAt)}</p>
                      </div>
                      <ArrowUpLeft className="h-4 w-4 text-[color:var(--app-text-muted)]" />
                    </button>
                  )) : <EmptyState title="تیکتی ثبت نشده است" description="اولین پیام پشتیبانی خود را از همین بخش شروع کنید." />}
                </ListArea>
              </CardContent>
            </Card>
          </div>
        ) : null}
      </section>

      <nav className="sticky bottom-4 z-30 mt-6 grid grid-cols-4 gap-2 rounded-[28px] border border-[color:var(--app-border)] bg-[color:var(--app-surface)] p-2 shadow-[var(--app-card-shadow)] backdrop-blur">
        {navItems.map((item) => {
          const Icon = item.icon;
          const active = activeTab === item.id;

          return (
            <button
              key={item.id}
              type="button"
              onClick={() => setActiveTab(item.id)}
              className={`flex min-h-[64px] flex-col items-center justify-center gap-2 rounded-[22px] px-2 text-xs font-semibold transition ${
                active
                  ? "bg-[color:var(--app-accent)] text-[color:var(--app-accent-contrast)]"
                  : "text-[color:var(--app-text-muted)] hover:bg-[color:var(--app-surface-muted)]"
              }`}
            >
              <Icon className="h-4 w-4" />
              <span>{item.label}</span>
            </button>
          );
        })}
      </nav>

      <Dialog open={selectedOrder !== null} onOpenChange={(open) => !open && setSelectedOrder(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>سفارش #{selectedOrder?.id ?? "-"}</DialogTitle>
            <DialogDescription>وضعیت پرداخت، رسید و بازخورد ادمین را از اینجا دنبال کنید.</DialogDescription>
          </DialogHeader>
          <DialogBody className="app-scrollbar">
            {detailLoading === "order" && !selectedOrder ? (
              <DialogSkeleton />
            ) : selectedOrder ? (
              <div className="space-y-5">
                <div className="flex items-center justify-between gap-4 rounded-[24px] border border-[color:var(--app-border)] bg-[color:var(--app-surface-muted)] p-4">
                  <div>
                    <p className="text-sm font-semibold text-[color:var(--app-text)]">{selectedOrder.plan.title}</p>
                    <p className="mt-2 text-sm text-[color:var(--app-text-muted)]">
                      {selectedOrder.plan.priceLabel} • {formatRelativeDays(selectedOrder.plan.days)} • {formatBytes(selectedOrder.plan.trafficBytes)}
                    </p>
                  </div>
                  <StatusBadge status={selectedOrder.status} />
                </div>

                <InfoGrid
                  items={[
                    { label: "نوع سفارش", value: mapOrderKind(selectedOrder.kind) },
                    { label: "ساخته‌شده", value: formatDate(selectedOrder.createdAt) },
                    { label: "آخرین بروزرسانی", value: formatDate(selectedOrder.updatedAt) },
                    { label: "سرویس هدف", value: selectedOrder.targetServiceId ? `#${selectedOrder.targetServiceId}` : "سرویس جدید" }
                  ]}
                />

                <Card className="border-dashed">
                  <CardHeader>
                    <CardTitle className="text-sm">اطلاعات پرداخت</CardTitle>
                    <CardDescription>پس از واریز، رسید تصویری یا شناسه تراکنش را ثبت کنید.</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="rounded-[22px] border border-[color:var(--app-border)] bg-[color:var(--app-surface)] p-4">
                      <p className="text-xs text-[color:var(--app-text-muted)]">دارنده کارت</p>
                      <p className="mt-1 text-sm font-semibold text-[color:var(--app-text)]">{snapshot.payment.cardTitle}</p>
                      <p className="mt-4 text-xs text-[color:var(--app-text-muted)]">شماره کارت</p>
                      <div className="mt-1 flex items-center justify-between gap-3">
                        <p className="text-sm font-semibold tracking-[0.08em] text-[color:var(--app-text)]">{snapshot.payment.cardNumber}</p>
                        <Button variant="secondary" size="sm" onClick={() => void handleCopy(snapshot.payment.cardNumber, "شماره کارت کپی شد.")}>
                          <Copy className="h-4 w-4" />
                          کپی
                        </Button>
                      </div>
                    </div>
                    <p className="text-sm leading-7 text-[color:var(--app-text-muted)]">{snapshot.payment.notes}</p>
                  </CardContent>
                </Card>

                {selectedOrder.adminNote ? (
                  <Card>
                    <CardHeader>
                      <CardTitle className="text-sm">یادداشت ادمین</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <p className="text-sm leading-7 text-[color:var(--app-text-muted)]">{selectedOrder.adminNote}</p>
                    </CardContent>
                  </Card>
                ) : null}

                <div className="space-y-3">
                  <SectionLabel title="ثبت رسید" description="می‌توانید فقط متن تراکنش، فقط تصویر، یا هر دو را ثبت کنید." />
                  <Textarea
                    value={receiptText}
                    onChange={(event) => setReceiptText(event.target.value)}
                    placeholder="شناسه تراکنش، توضیح پرداخت یا هر جزئیات لازم..."
                    disabled={!selectedOrder.requiresReceipt}
                  />
                  <Input
                    type="file"
                    accept="image/*"
                    onChange={(event) => setReceiptFile(event.target.files?.[0] ?? null)}
                    disabled={!selectedOrder.requiresReceipt}
                  />
                  {receiptFile ? (
                    <p className="text-sm text-[color:var(--app-text-muted)]">فایل انتخاب‌شده: {receiptFile.name}</p>
                  ) : null}
                </div>

                {selectedOrder.service ? (
                  <Card className="bg-[color:var(--app-surface-muted)]">
                    <CardContent className="flex items-center justify-between gap-4 py-4">
                      <div>
                        <p className="text-sm font-semibold text-[color:var(--app-text)]">این سفارش به سرویس #{selectedOrder.service.id} متصل است.</p>
                        <p className="mt-2 text-sm text-[color:var(--app-text-muted)]">در صورت صدور یا تمدید، جزئیات سرویس از همین پنل قابل مشاهده است.</p>
                      </div>
                      <Button variant="outline" onClick={() => selectedOrder.service && void openService(selectedOrder.service.id)}>
                        مشاهده سرویس
                      </Button>
                    </CardContent>
                  </Card>
                ) : null}
              </div>
            ) : null}
          </DialogBody>
          <DialogFooter>
            <Button variant="outline" onClick={() => void refreshSnapshot({ silent: true })}>
              <RefreshCw className="h-4 w-4" />
              تازه‌سازی
            </Button>
            <Button
              onClick={() => void handleSubmitReceipt()}
              disabled={!selectedOrder?.requiresReceipt || busyKey === `receipt:${selectedOrder?.id}`}
            >
              {busyKey === `receipt:${selectedOrder?.id}` ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <UploadCloud className="h-4 w-4" />}
              ثبت رسید
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={selectedService !== null} onOpenChange={(open) => !open && setSelectedService(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>سرویس #{selectedService?.id ?? "-"}</DialogTitle>
            <DialogDescription>وضعیت، مصرف، لینک‌ها و تمدید همین سرویس در یک نمای فشرده.</DialogDescription>
          </DialogHeader>
          <DialogBody className="app-scrollbar">
            {detailLoading === "service" && !selectedService ? (
              <DialogSkeleton />
            ) : selectedService ? (
              <div className="space-y-5">
                <div className="flex items-center justify-between gap-4 rounded-[24px] border border-[color:var(--app-border)] bg-[color:var(--app-surface-muted)] p-4">
                  <div>
                    <p className="text-sm font-semibold text-[color:var(--app-text)]">{selectedService.plan?.title ?? selectedService.planCode}</p>
                    <p className="mt-2 text-sm text-[color:var(--app-text-muted)]">
                      انقضا: {formatDate(selectedService.expiresAt)} • سقف: {formatBytes(selectedService.trafficBytes)}
                    </p>
                  </div>
                  <StatusBadge status={selectedService.status} />
                </div>

                <InfoGrid
                  items={[
                    { label: "ایمیل پنل", value: selectedService.email },
                    { label: "Sub ID", value: selectedService.subId },
                    { label: "مصرف ثبت‌شده", value: formatBytes(selectedService.lastUsageUp + selectedService.lastUsageDown) },
                    { label: "آخرین همگام‌سازی", value: selectedService.lastSyncAt ? formatDate(selectedService.lastSyncAt) : "هنوز همگام نشده" }
                  ]}
                />

                <div className="space-y-2">
                  <SectionLabel title="پیشرفت مصرف" description="نمایش تقریبی از مصرف ثبت‌شده نسبت به سقف فعلی." />
                  <div className="h-3 overflow-hidden rounded-full bg-[color:var(--app-surface-muted)]">
                    <div
                      className="h-full rounded-full bg-[color:var(--app-accent)] transition-all"
                      style={{
                        width: `${Math.min(((selectedService.lastUsageUp + selectedService.lastUsageDown) / Math.max(selectedService.trafficBytes, 1)) * 100, 100)}%`
                      }}
                    />
                  </div>
                </div>

                <div className="space-y-3">
                  <SectionLabel title="پیام تحویل سرویس" description="برای کپی یا استفاده مستقیم در کلاینت خود." />
                  <Textarea value={selectedService.deliveryMessage ?? "در حال بارگذاری پیام تحویل..."} readOnly className="min-h-[220px]" />
                  <div className="flex flex-wrap gap-3">
                    <Button
                      variant="outline"
                      onClick={() => selectedService.deliveryMessage && void handleCopy(selectedService.deliveryMessage, "متن تحویل سرویس کپی شد.")}
                      disabled={!selectedService.deliveryMessage}
                    >
                      <Copy className="h-4 w-4" />
                      کپی پیام
                    </Button>
                    <Button
                      onClick={() => void handleRenewService(selectedService.id)}
                      disabled={busyKey === `renew:${selectedService.id}`}
                    >
                      {busyKey === `renew:${selectedService.id}` ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <CreditCard className="h-4 w-4" />}
                      تمدید سرویس
                    </Button>
                  </div>
                </div>
              </div>
            ) : null}
          </DialogBody>
        </DialogContent>
      </Dialog>

      <Dialog open={selectedTicket !== null} onOpenChange={(open) => !open && setSelectedTicket(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>تیکت #{selectedTicket?.id ?? "-"}</DialogTitle>
            <DialogDescription>گفت‌وگو با پشتیبانی در همین پنل انجام می‌شود و ادمین‌ها پاسخ را از بات مدیریت می‌کنند.</DialogDescription>
          </DialogHeader>
          <DialogBody className="app-scrollbar">
            {detailLoading === "ticket" && !selectedTicket ? (
              <DialogSkeleton />
            ) : selectedTicket ? (
              <div className="space-y-5">
                <div className="flex items-center justify-between gap-4 rounded-[24px] border border-[color:var(--app-border)] bg-[color:var(--app-surface-muted)] p-4">
                  <div>
                    <p className="text-sm font-semibold text-[color:var(--app-text)]">آخرین بروزرسانی: {formatDate(selectedTicket.updatedAt)}</p>
                    <p className="mt-2 text-sm text-[color:var(--app-text-muted)]">
                      {selectedTicket.status === "open" ? "این تیکت هنوز باز است و می‌توانید پیام جدید ارسال کنید." : "این تیکت بسته شده است."}
                    </p>
                  </div>
                  <StatusBadge status={selectedTicket.status} />
                </div>

                <div className="space-y-3">
                  {(selectedTicket.messages ?? []).length > 0 ? (
                    selectedTicket.messages?.map((message) => (
                      <div
                        key={message.id}
                        className={`rounded-[22px] px-4 py-3 ${
                          message.senderRole === "user"
                            ? "mr-8 border border-[color:var(--app-border)] bg-[color:var(--app-surface)]"
                            : "ml-8 bg-[color:var(--app-surface-muted)]"
                        }`}
                      >
                        <div className="mb-2 flex items-center gap-2">
                          <Badge variant={message.senderRole === "admin" ? "info" : "default"}>
                            {message.senderRole === "admin" ? "ادمین" : "شما"}
                          </Badge>
                          <span className="text-xs text-[color:var(--app-text-muted)]">{formatDate(message.createdAt)}</span>
                        </div>
                        <p className="text-sm leading-7 text-[color:var(--app-text)]">{message.body}</p>
                      </div>
                    ))
                  ) : (
                    <EmptyState title="هنوز پیامی ثبت نشده" description="اولین پیام خود را پایین همین گفتگو ارسال کنید." />
                  )}
                </div>

                <div className="space-y-3">
                  <SectionLabel title="پیام جدید" description="پیام شما بلافاصله برای ادمین‌های بات ارسال می‌شود." />
                  <Textarea
                    value={ticketDraft}
                    onChange={(event) => setTicketDraft(event.target.value)}
                    placeholder="مشکل یا درخواست خود را واضح و کوتاه بنویسید..."
                    disabled={selectedTicket.status !== "open"}
                  />
                </div>
              </div>
            ) : null}
          </DialogBody>
          <DialogFooter>
            <Button
              onClick={() => void handleSendTicketMessage()}
              disabled={selectedTicket?.status !== "open" || !ticketDraft.trim() || busyKey === `ticket:message:${selectedTicket?.id}`}
            >
              {busyKey === `ticket:message:${selectedTicket?.id}` ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Headphones className="h-4 w-4" />}
              ارسال پیام
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </main>
  );
}

function LoadingShell() {
  return (
    <main className="mx-auto flex min-h-screen w-full max-w-4xl flex-col px-4 pb-20 pt-6">
      <div className="mb-5 flex items-start justify-between gap-4">
        <div className="space-y-3">
          <Skeleton className="h-7 w-28" />
          <Skeleton className="h-12 w-72" />
        </div>
        <Skeleton className="h-10 w-10 rounded-2xl" />
      </div>
      <div className="mb-5 grid gap-3 sm:grid-cols-3">
        <Skeleton className="h-24 rounded-[28px]" />
        <Skeleton className="h-24 rounded-[28px]" />
        <Skeleton className="h-24 rounded-[28px]" />
      </div>
      <Skeleton className="mb-5 h-56 rounded-[30px]" />
      <div className="grid gap-5 lg:grid-cols-[1.2fr_0.8fr]">
        <Skeleton className="h-[420px] rounded-[30px]" />
        <Skeleton className="h-[420px] rounded-[30px]" />
      </div>
    </main>
  );
}

function ThemeSwitcher({
  preference,
  onChange
}: {
  preference: ThemePreference;
  onChange: (preference: ThemePreference) => void;
}) {
  return (
    <div
      className="inline-flex shrink-0 items-center rounded-[20px] border border-[color:var(--app-border)] bg-[color:var(--app-surface)] p-1 shadow-[var(--app-card-shadow)]"
      role="group"
      aria-label="theme switcher"
    >
      {themeOptions.map((option) => {
        const Icon = option.icon;
        const active = preference === option.id;

        return (
          <button
            key={option.id}
            type="button"
            onClick={() => onChange(option.id)}
            className={[
              "inline-flex items-center gap-2 rounded-[16px] px-3 py-2 text-xs font-semibold transition",
              active
                ? "bg-[color:var(--app-surface-muted)] text-[color:var(--app-text)]"
                : "text-[color:var(--app-text-muted)] hover:text-[color:var(--app-text)]"
            ].join(" ")}
            aria-pressed={active}
          >
            <Icon className="h-3.5 w-3.5" />
            <span>{option.label}</span>
          </button>
        );
      })}
    </div>
  );
}

function MetricCard({ label, value, hint }: { label: string; value: string; hint: string }) {
  return (
    <Card>
      <CardContent className="flex items-end justify-between gap-4 py-5">
        <div>
          <p className="text-sm font-medium text-[color:var(--app-text-muted)]">{label}</p>
          <p className="mt-3 text-3xl font-bold text-[color:var(--app-text)]">{value}</p>
        </div>
        <p className="text-xs text-[color:var(--app-text-muted)]">{hint}</p>
      </CardContent>
    </Card>
  );
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[22px] border border-[color:var(--app-border)] bg-[color:var(--app-surface)] px-4 py-3">
      <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[color:var(--app-text-muted)]">{label}</p>
      <p className="mt-2 text-sm font-semibold text-[color:var(--app-text)]">{value}</p>
    </div>
  );
}

function QuickAction({
  title,
  description,
  actionLabel,
  icon: Icon,
  onClick,
  disabled,
  loading
}: {
  title: string;
  description: string;
  actionLabel: string;
  icon: typeof Sparkles;
  onClick: () => void;
  disabled?: boolean;
  loading?: boolean;
}) {
  return (
    <div className="rounded-[24px] border border-[color:var(--app-border)] p-4">
      <div className="flex items-start gap-3">
        <div className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-[18px] border border-[color:var(--app-border)] bg-[color:var(--app-surface-muted)]">
          <Icon className="h-4 w-4 text-[color:var(--app-text)]" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-[color:var(--app-text)]">{title}</p>
          <p className="mt-2 text-sm leading-7 text-[color:var(--app-text-muted)]">{description}</p>
        </div>
      </div>
      <Button variant="secondary" className="mt-4 w-full" onClick={onClick} disabled={disabled}>
        {loading ? <LoaderCircle className="h-4 w-4 animate-spin" /> : null}
        {actionLabel}
      </Button>
    </div>
  );
}

function OrderCard({ order, onOpen }: { order: OrderDto; onOpen: () => void }) {
  return (
    <button
      type="button"
      onClick={onOpen}
      className="flex w-full items-center justify-between gap-4 rounded-[24px] border border-[color:var(--app-border)] px-4 py-4 text-right transition hover:bg-[color:var(--app-surface-muted)]"
    >
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-sm font-semibold text-[color:var(--app-text)]">{order.plan.title}</p>
          <StatusBadge status={order.status} />
        </div>
        <p className="mt-2 text-sm text-[color:var(--app-text-muted)]">
          سفارش #{order.id} • {mapOrderKind(order.kind)} • {formatDate(order.updatedAt)}
        </p>
      </div>
      <ArrowUpLeft className="h-4 w-4 shrink-0 text-[color:var(--app-text-muted)]" />
    </button>
  );
}

function ServiceCard({
  service,
  onOpen,
  onRenew,
  renewBusy
}: {
  service: ServiceDto;
  onOpen: () => void;
  onRenew: () => void;
  renewBusy: boolean;
}) {
  const consumedRatio = Math.min(((service.lastUsageUp + service.lastUsageDown) / Math.max(service.trafficBytes, 1)) * 100, 100);

  return (
    <div className="rounded-[26px] border border-[color:var(--app-border)] p-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-sm font-semibold text-[color:var(--app-text)]">{service.plan?.title ?? service.planCode}</p>
            <StatusBadge status={service.status} />
          </div>
          <p className="mt-2 text-sm text-[color:var(--app-text-muted)]">
            انقضا {formatDate(service.expiresAt)} • {formatBytes(service.trafficBytes)}
          </p>
        </div>
        <Button variant="ghost" size="sm" onClick={onOpen}>
          جزئیات
        </Button>
      </div>
      <div className="mt-4">
        <div className="mb-2 flex items-center justify-between text-xs text-[color:var(--app-text-muted)]">
          <span>مصرف</span>
          <span>{formatBytes(service.lastUsageUp + service.lastUsageDown)}</span>
        </div>
        <div className="h-2 overflow-hidden rounded-full bg-[color:var(--app-surface-muted)]">
          <div className="h-full rounded-full bg-[color:var(--app-accent)]" style={{ width: `${consumedRatio}%` }} />
        </div>
      </div>
      <div className="mt-4 flex flex-wrap gap-3">
        <Button variant="outline" className="flex-1" onClick={onOpen}>
          مشاهده کانفیگ
        </Button>
        <Button className="flex-1" onClick={onRenew} disabled={renewBusy}>
          {renewBusy ? <LoaderCircle className="h-4 w-4 animate-spin" /> : null}
          تمدید
        </Button>
      </div>
    </div>
  );
}

function SectionLabel({ title, description }: { title: string; description: string }) {
  return (
    <div>
      <p className="text-sm font-semibold text-[color:var(--app-text)]">{title}</p>
      <p className="mt-1 text-sm text-[color:var(--app-text-muted)]">{description}</p>
    </div>
  );
}

function ListArea({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={`space-y-3 ${className ?? ""}`}>{children}</div>;
}

function EmptyState({ title, description }: { title: string; description: string }) {
  return (
    <div className="rounded-[24px] border border-dashed border-[color:var(--app-border)] px-4 py-6 text-center">
      <p className="text-sm font-semibold text-[color:var(--app-text)]">{title}</p>
      <p className="mt-2 text-sm leading-7 text-[color:var(--app-text-muted)]">{description}</p>
    </div>
  );
}

function DialogSkeleton() {
  return (
    <div className="space-y-4">
      <Skeleton className="h-24 rounded-[24px]" />
      <Skeleton className="h-36 rounded-[24px]" />
      <Skeleton className="h-48 rounded-[24px]" />
    </div>
  );
}

function InfoGrid({ items }: { items: Array<{ label: string; value: string }> }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {items.map((item) => (
        <div key={item.label} className="rounded-[22px] border border-[color:var(--app-border)] px-4 py-4">
          <p className="text-xs uppercase tracking-[0.12em] text-[color:var(--app-text-muted)]">{item.label}</p>
          <p className="mt-2 text-sm font-semibold text-[color:var(--app-text)]">{item.value}</p>
        </div>
      ))}
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const variant: "success" | "warning" | "danger" | "info" = status.includes("active") || status.includes("fulfilled") || status === "open"
    ? "success"
    : status.includes("pending") || status.includes("review")
      ? "warning"
      : status.includes("reject") || status.includes("failed") || status === "closed"
        ? "danger"
        : "info";

  return <Badge variant={variant}>{mapStatus(status)}</Badge>;
}

function mapStatus(status: string) {
  switch (status) {
    case "active":
      return "فعال";
    case "expired":
      return "منقضی";
    case "disabled":
      return "غیرفعال";
    case "pending_receipt":
      return "در انتظار رسید";
    case "under_review":
      return "در حال بررسی";
    case "approved":
      return "تایید شده";
    case "rejected":
      return "رد شده";
    case "fulfilled":
      return "صادر شده";
    case "failed":
      return "ناموفق";
    case "open":
      return "باز";
    case "closed":
      return "بسته";
    default:
      return status;
  }
}

function mapOrderKind(kind: OrderDto["kind"]) {
  switch (kind) {
    case "new":
      return "خرید جدید";
    case "renew":
      return "تمدید";
    case "trial":
      return "اکانت تست";
    default:
      return kind;
  }
}

function getErrorMessage(error: unknown) {
  if (error instanceof ApiError) {
    return error.message;
  }

  if (error instanceof Error) {
    return error.message;
  }

  return "خطای ناشناخته‌ای رخ داد.";
}
