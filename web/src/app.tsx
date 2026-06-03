import { startTransition, useEffect, useMemo, useState } from "react";
import {
  ArrowUpLeft,
  Bot,
  CheckCircle,
  Copy,
  CreditCard,
  Headphones,
  LayoutGrid,
  LoaderCircle,
  MessageSquare,
  Monitor,
  MoonStar,
  RefreshCw,
  RotateCcw,
  ShieldCheck,
  ShoppingBag,
  Sparkles,
  SunMedium,
  UploadCloud,
  UserCheck,
  Wifi,
  XCircle
} from "lucide-react";
import { toast, Toaster } from "sonner";

import { api, ApiError } from "./lib/api";
import { formatBytes, formatCount, formatDate, formatRelativeDays } from "./lib/format";
import { createPreviewSnapshot } from "./lib/mock-data";
import { applyResolvedTheme, getStoredThemePreference, resolveEffectiveTheme, setStoredThemePreference, type ResolvedTheme, type ThemePreference } from "./lib/theme";
import { getTelegramThemeSource, getTelegramWebApp } from "./lib/telegram";
import type { AdminOrderDto, AdminQueueSummaryDto, AdminScope, AdminTicketDto, AppSnapshot, OrderDto, PlanDto, ServiceDto, TicketDto, UserDto } from "./lib/types";
import { Badge } from "./components/ui/badge";
import { Button } from "./components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "./components/ui/card";
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "./components/ui/dialog";
import { Input } from "./components/ui/input";
import { Skeleton } from "./components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "./components/ui/tabs";
import { Textarea } from "./components/ui/textarea";

type Phase = "booting" | "ready" | "preview" | "error";
type AppMode = "user" | "admin";
type AppTab = "dashboard" | "buy" | "services" | "support";
type AdminTab = "orders" | "tickets";
type RouteSummary = {
  eyebrow: string;
  title: string;
  description: string;
  actionLabel: string;
  actionIcon: typeof LayoutGrid;
  onAction: () => void;
  stats: Array<{ label: string; value: string }>;
};

type AdminDeepLink = {
  mode: AppMode;
  tab: AdminTab;
  id: number | null;
};

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
  const initialDeepLink = useMemo(() => readAdminDeepLink(), []);
  const [phase, setPhase] = useState<Phase>("booting");
  const [snapshot, setSnapshot] = useState<AppSnapshot | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [appMode, setAppMode] = useState<AppMode>("user");
  const [activeTab, setActiveTab] = useState<AppTab>("dashboard");
  const [adminTab, setAdminTab] = useState<AdminTab>("orders");
  const [adminScope, setAdminScope] = useState<AdminScope>("unclaimed");
  const [adminSummary, setAdminSummary] = useState<AdminQueueSummaryDto | null>(null);
  const [adminOrders, setAdminOrders] = useState<AdminOrderDto[]>([]);
  const [adminTickets, setAdminTickets] = useState<AdminTicketDto[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [busyKey, setBusyKey] = useState<string | null>(null);

  const [selectedOrder, setSelectedOrder] = useState<OrderDto | null>(null);
  const [selectedService, setSelectedService] = useState<ServiceDto | null>(null);
  const [selectedTicket, setSelectedTicket] = useState<TicketDto | null>(null);
  const [selectedAdminOrder, setSelectedAdminOrder] = useState<AdminOrderDto | null>(null);
  const [selectedAdminTicket, setSelectedAdminTicket] = useState<AdminTicketDto | null>(null);
  const [detailLoading, setDetailLoading] = useState<"order" | "service" | "ticket" | null>(null);
  const [adminDetailLoading, setAdminDetailLoading] = useState<"order" | "ticket" | null>(null);

  const [receiptText, setReceiptText] = useState("");
  const [receiptFile, setReceiptFile] = useState<File | null>(null);
  const [ticketDraft, setTicketDraft] = useState("");
  const [adminNoteDraft, setAdminNoteDraft] = useState("");
  const [adminReplyDraft, setAdminReplyDraft] = useState("");
  const [adminDeepLinkHandled, setAdminDeepLinkHandled] = useState(false);
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

  useEffect(() => {
    if (!snapshot || adminDeepLinkHandled || initialDeepLink.mode !== "admin") {
      return;
    }

    setAdminDeepLinkHandled(true);

    if (!snapshot.user.isAdmin) {
      toast.error("دسترسی مدیریت برای این کاربر فعال نیست.");
      return;
    }

    setAppMode("admin");
    setAdminTab(initialDeepLink.tab);

    if (initialDeepLink.id !== null) {
      if (initialDeepLink.tab === "orders") {
        void openAdminOrder(initialDeepLink.id);
      } else {
        void openAdminTicket(initialDeepLink.id);
      }
    }
  }, [adminDeepLinkHandled, initialDeepLink, snapshot]);

  useEffect(() => {
    if (!snapshot?.user.isAdmin || appMode !== "admin") {
      return;
    }

    void refreshAdminData({ silent: true });
  }, [adminScope, adminTab, appMode, snapshot?.user.isAdmin]);

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
        return createPreviewSnapshot({ admin: initialDeepLink.mode === "admin" });
      }

      throw error;
    }
  }

  async function loadSnapshot(user: UserDto, preview: boolean): Promise<AppSnapshot> {
    if (preview) {
      return createPreviewSnapshot({ admin: initialDeepLink.mode === "admin" });
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
        setSnapshot(createPreviewSnapshot({ admin: initialDeepLink.mode === "admin" }));
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

  async function refreshAdminData(options?: { silent?: boolean }) {
    if (!snapshot?.user.isAdmin) {
      return;
    }

    if (!options?.silent) {
      setRefreshing(true);
    }

    try {
      if (phase === "preview") {
        const previewAdmin = createPreviewAdminData(snapshot);
        setAdminSummary(previewAdmin.summary);
        setAdminOrders(filterAdminItems(previewAdmin.orders, adminScope, snapshot.user.id));
        setAdminTickets(filterAdminItems(previewAdmin.tickets, adminScope, snapshot.user.id));
        return;
      }

      const [summaryPayload, ordersPayload, ticketsPayload] = await Promise.all([
        api.admin.getSummary(),
        api.admin.getOrders(adminScope),
        api.admin.getTickets(adminScope)
      ]);

      setAdminSummary(summaryPayload.summary);
      setAdminOrders(ordersPayload.orders);
      setAdminTickets(ticketsPayload.tickets);
    } catch (error) {
      toast.error(getErrorMessage(error));
    } finally {
      if (!options?.silent) {
        setRefreshing(false);
      }
    }
  }

  async function openAdminOrder(orderId: number) {
    const previewOrder = adminOrders.find((order) => order.id === orderId)
      ?? createPreviewAdminData(snapshot).orders.find((order) => order.id === orderId)
      ?? null;

    if (phase === "preview") {
      setSelectedAdminOrder(previewOrder);
      return;
    }

    setAdminDetailLoading("order");

    try {
      const response = await api.admin.getOrder(orderId);
      setSelectedAdminOrder(response.order);
    } catch (error) {
      toast.error(getErrorMessage(error));
    } finally {
      setAdminDetailLoading(null);
    }
  }

  async function openAdminTicket(ticketId: number) {
    const previewTicket = adminTickets.find((ticket) => ticket.id === ticketId)
      ?? createPreviewAdminData(snapshot).tickets.find((ticket) => ticket.id === ticketId)
      ?? null;

    if (phase === "preview") {
      setSelectedAdminTicket(previewTicket);
      return;
    }

    setAdminDetailLoading("ticket");

    try {
      const response = await api.admin.getTicket(ticketId);
      setSelectedAdminTicket(response.ticket);
    } catch (error) {
      toast.error(getErrorMessage(error));
    } finally {
      setAdminDetailLoading(null);
    }
  }

  async function mutateAdminOrder(orderId: number, action: "claim" | "release" | "approve" | "reject" | "clarify") {
    if (!snapshot?.user.isAdmin) {
      return;
    }

    if (["reject", "clarify"].includes(action) && !adminNoteDraft.trim()) {
      toast.info("یادداشت ادمین را وارد کنید.");
      return;
    }

    setBusyKey(`admin:order:${action}:${orderId}`);

    try {
      if (phase === "preview") {
        const nextOrder = applyPreviewOrderMutation(selectedAdminOrder, snapshot.user, action, adminNoteDraft.trim());
        setSelectedAdminOrder(nextOrder);
        setAdminOrders((current) => current.map((order) => order.id === orderId ? nextOrder : order));
      } else {
        const response = action === "claim"
          ? await api.admin.claimOrder(orderId)
          : action === "release"
            ? await api.admin.releaseOrder(orderId)
            : action === "approve"
              ? await api.admin.approveOrder(orderId)
              : action === "reject"
                ? await api.admin.rejectOrder(orderId, adminNoteDraft.trim())
                : await api.admin.clarifyOrder(orderId, adminNoteDraft.trim());
        setSelectedAdminOrder(response.order);
      }

      setAdminNoteDraft("");
      toast.success("سفارش به‌روزرسانی شد.");
      if (phase !== "preview") {
        await refreshAdminData({ silent: true });
      }
    } catch (error) {
      toast.error(getErrorMessage(error));
    } finally {
      setBusyKey(null);
    }
  }

  async function mutateAdminTicket(ticketId: number, action: "claim" | "release" | "reply" | "close") {
    if (!snapshot?.user.isAdmin) {
      return;
    }

    if (action === "reply" && !adminReplyDraft.trim()) {
      toast.info("متن پاسخ را وارد کنید.");
      return;
    }

    setBusyKey(`admin:ticket:${action}:${ticketId}`);

    try {
      if (phase === "preview") {
        const nextTicket = applyPreviewTicketMutation(selectedAdminTicket, snapshot.user, action, adminReplyDraft.trim());
        setSelectedAdminTicket(nextTicket);
        setAdminTickets((current) => current.map((ticket) => ticket.id === ticketId ? nextTicket : ticket));
      } else {
        const response = action === "claim"
          ? await api.admin.claimTicket(ticketId)
          : action === "release"
            ? await api.admin.releaseTicket(ticketId)
            : action === "reply"
              ? await api.admin.replyTicket(ticketId, adminReplyDraft.trim())
              : await api.admin.closeTicket(ticketId);
        setSelectedAdminTicket(response.ticket);
      }

      setAdminReplyDraft("");
      toast.success("تیکت به‌روزرسانی شد.");
      if (phase !== "preview") {
        await refreshAdminData({ silent: true });
      }
    } catch (error) {
      toast.error(getErrorMessage(error));
    } finally {
      setBusyKey(null);
    }
  }

  function handleThemePreferenceChange(nextPreference: ThemePreference) {
    setStoredThemePreference(nextPreference);
    setThemePreference(nextPreference);
  }

  function getRouteSummary(): RouteSummary {
    if (!snapshot || !metrics) {
      throw new Error("Snapshot is not ready.");
    }

    switch (activeTab) {
      case "buy":
        return {
          eyebrow: "پرداخت و سفارش",
          title: "خرید سرویس",
          description: "پلن را انتخاب کنید، کارت مقصد را ببینید و رسیدهای باز را از همین مسیر تکمیل کنید.",
          actionLabel: "سفارش‌های باز",
          actionIcon: CreditCard,
          onAction: () => setActiveTab("dashboard"),
          stats: [
            { label: "پلن قابل خرید", value: formatCount(snapshot.plans.length) },
            { label: "در انتظار رسید", value: formatCount(pendingOrders.length) },
            { label: "کارت مقصد", value: snapshot.payment.cardTitle }
          ]
        };
      case "services":
        return {
          eyebrow: "مدیریت دسترسی",
          title: "سرویس‌های من",
          description: "مصرف، انقضا، کانفیگ و تمدید سرویس‌ها در همین سطح عملیاتی قابل پیگیری است.",
          actionLabel: "خرید سرویس",
          actionIcon: ShoppingBag,
          onAction: () => setActiveTab("buy"),
          stats: [
            { label: "فعال", value: formatCount(activeServices.length) },
            { label: "آرشیو", value: formatCount(archivedServices.length) },
            { label: "نزدیک‌ترین انقضا", value: activeServices[0]?.expiresAt ? formatDate(activeServices[0].expiresAt) : "ثبت نشده" }
          ]
        };
      case "support":
        return {
          eyebrow: "گفت‌وگو و پیگیری",
          title: "پشتیبانی",
          description: "تیکت باز کنید، سابقه پیام‌ها را ببینید و پاسخ ادمین را بدون برگشت به چت دنبال کنید.",
          actionLabel: "باز کردن تیکت",
          actionIcon: Headphones,
          onAction: () => void ensureOpenTicket(),
          stats: [
            { label: "تیکت باز", value: formatCount(metrics.openTickets) },
            { label: "کل تیکت‌ها", value: formatCount(snapshot.tickets.length) },
            { label: "آخرین پاسخ", value: snapshot.tickets[0]?.updatedAt ? formatDate(snapshot.tickets[0].updatedAt) : "ثبت نشده" }
          ]
        };
      default:
        return {
          eyebrow: "نمای کلی",
          title: "داشبورد",
          description: "وضعیت سفارش‌ها، سرویس‌ها و پیام‌های پشتیبانی را در یک نمای فشرده دنبال کنید.",
          actionLabel: "خرید سرویس",
          actionIcon: ShoppingBag,
          onAction: () => setActiveTab("buy"),
          stats: [
            { label: "سرویس فعال", value: formatCount(metrics.activeServices) },
            { label: "سفارش باز", value: formatCount(metrics.pendingOrders) },
            { label: "تیکت باز", value: formatCount(metrics.openTickets) }
          ]
        };
    }
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
              const preview = createPreviewSnapshot({ admin: initialDeepLink.mode === "admin" });
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

  const routeSummary = getRouteSummary();

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

      <header className="mb-4 rounded-[26px] border border-[color:var(--app-border)] bg-[color:var(--app-surface)] px-3 py-3 shadow-[var(--app-card-shadow)]">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[18px] border border-[color:var(--app-border)] bg-[color:var(--app-surface-muted)]">
              <Bot className="h-5 w-5 text-[color:var(--app-text)]" />
            </div>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-base font-bold leading-6 text-[color:var(--app-text)]">پنل سرویس‌های شما</h1>
                <Badge variant={snapshot.preview ? "warning" : "info"} className="px-2.5 py-0.5 text-[11px]">
                  {snapshot.preview ? "پیش‌نمایش" : "مینی‌اپ"}
                </Badge>
              </div>
              <p className="mt-1 truncate text-xs text-[color:var(--app-text-muted)]">
                {snapshot.user.displayName}
                {snapshot.preview ? " • فقط نمایش رابط" : " • ورود امن از تلگرام"}
              </p>
            </div>
          </div>
          <div className="flex items-center justify-between gap-2 sm:justify-end">
            {snapshot.user.isAdmin ? (
              <ModeSwitcher mode={appMode} onChange={setAppMode} />
            ) : null}
            <ThemeSwitcher preference={themePreference} onChange={handleThemePreferenceChange} />
            <Button
              variant="outline"
              size="icon"
              onClick={() => appMode === "admin" ? void refreshAdminData() : void refreshSnapshot()}
              disabled={refreshing}
              aria-label="به‌روزرسانی"
              className="h-9 w-9 rounded-[14px]"
            >
              <RefreshCw className={refreshing ? "h-4 w-4 animate-spin" : "h-4 w-4"} />
            </Button>
          </div>
        </div>
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

      {appMode === "admin" && snapshot.user.isAdmin ? (
        <AdminWorkspace
          summary={adminSummary}
          orders={adminOrders}
          tickets={adminTickets}
          activeTab={adminTab}
          scope={adminScope}
          currentAdminUserId={snapshot.user.id}
          refreshing={refreshing}
          onTabChange={setAdminTab}
          onScopeChange={setAdminScope}
          onRefresh={() => void refreshAdminData()}
          onOpenOrder={(orderId) => void openAdminOrder(orderId)}
          onOpenTicket={(ticketId) => void openAdminTicket(ticketId)}
        />
      ) : (
        <>
          <RouteSummaryPanel summary={routeSummary} />

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
        </>
      )}

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

      <Dialog open={selectedAdminOrder !== null} onOpenChange={(open) => {
        if (!open) {
          setSelectedAdminOrder(null);
          setAdminNoteDraft("");
        }
      }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>مدیریت سفارش #{selectedAdminOrder?.id ?? "-"}</DialogTitle>
            <DialogDescription>رسید، کاربر و تصمیم نهایی سفارش در همین پنل مدیریت می‌شود.</DialogDescription>
          </DialogHeader>
          <DialogBody className="app-scrollbar">
            {adminDetailLoading === "order" && !selectedAdminOrder ? (
              <DialogSkeleton />
            ) : selectedAdminOrder ? (
              <div className="space-y-5">
                <AdminAssignmentHeader
                  assignedAdminDisplayName={selectedAdminOrder.assignedAdminDisplayName}
                  claimedAt={selectedAdminOrder.claimedAt}
                  isMine={selectedAdminOrder.assignedAdminUserId === snapshot.user.id}
                />
                <div className="flex items-center justify-between gap-4 rounded-[24px] border border-[color:var(--app-border)] bg-[color:var(--app-surface-muted)] p-4">
                  <div>
                    <p className="text-sm font-semibold text-[color:var(--app-text)]">{selectedAdminOrder.user.displayName}</p>
                    <p className="mt-2 text-sm text-[color:var(--app-text-muted)]">
                      {selectedAdminOrder.plan.title} • {selectedAdminOrder.plan.priceLabel} • {mapOrderKind(selectedAdminOrder.kind)}
                    </p>
                  </div>
                  <StatusBadge status={selectedAdminOrder.status} />
                </div>
                <InfoGrid
                  items={[
                    { label: "تلگرام", value: String(selectedAdminOrder.user.telegramId) },
                    { label: "ساخته‌شده", value: formatDate(selectedAdminOrder.createdAt) },
                    { label: "آخرین بروزرسانی", value: formatDate(selectedAdminOrder.updatedAt) },
                    { label: "رسید تصویری", value: selectedAdminOrder.hasReceiptImage ? "ثبت شده" : "ندارد" }
                  ]}
                />
                <Card className="border-dashed">
                  <CardHeader>
                    <CardTitle className="text-sm">رسید و توضیحات کاربر</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-sm leading-7 text-[color:var(--app-text-muted)]">{selectedAdminOrder.receiptText ?? selectedAdminOrder.preview}</p>
                  </CardContent>
                </Card>
                <div className="space-y-3">
                  <SectionLabel title="یادداشت برای کاربر" description="برای رد سفارش یا درخواست توضیح، متن پیام کاربر را وارد کنید." />
                  <Textarea
                    value={adminNoteDraft}
                    onChange={(event) => setAdminNoteDraft(event.target.value)}
                    placeholder="دلیل رد یا توضیح موردنیاز..."
                    disabled={selectedAdminOrder.assignedAdminUserId !== snapshot.user.id}
                  />
                </div>
              </div>
            ) : null}
          </DialogBody>
          <DialogFooter>
            {selectedAdminOrder ? (
              <>
                {selectedAdminOrder.assignedAdminUserId === null ? (
                  <Button onClick={() => void mutateAdminOrder(selectedAdminOrder.id, "claim")} disabled={busyKey === `admin:order:claim:${selectedAdminOrder.id}`}>
                    {busyKey === `admin:order:claim:${selectedAdminOrder.id}` ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <UserCheck className="h-4 w-4" />}
                    Claim
                  </Button>
                ) : selectedAdminOrder.assignedAdminUserId === snapshot.user.id ? (
                  <>
                    <Button variant="outline" onClick={() => void mutateAdminOrder(selectedAdminOrder.id, "release")} disabled={busyKey === `admin:order:release:${selectedAdminOrder.id}`}>
                      <RotateCcw className="h-4 w-4" />
                      Release
                    </Button>
                    <Button variant="outline" onClick={() => void mutateAdminOrder(selectedAdminOrder.id, "clarify")} disabled={!adminNoteDraft.trim() || busyKey === `admin:order:clarify:${selectedAdminOrder.id}`}>
                      <MessageSquare className="h-4 w-4" />
                      توضیح
                    </Button>
                    <Button variant="destructive" onClick={() => void mutateAdminOrder(selectedAdminOrder.id, "reject")} disabled={!adminNoteDraft.trim() || busyKey === `admin:order:reject:${selectedAdminOrder.id}`}>
                      <XCircle className="h-4 w-4" />
                      رد
                    </Button>
                    <Button onClick={() => void mutateAdminOrder(selectedAdminOrder.id, "approve")} disabled={busyKey === `admin:order:approve:${selectedAdminOrder.id}`}>
                      {busyKey === `admin:order:approve:${selectedAdminOrder.id}` ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <CheckCircle className="h-4 w-4" />}
                      تایید
                    </Button>
                  </>
                ) : null}
              </>
            ) : null}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={selectedAdminTicket !== null} onOpenChange={(open) => {
        if (!open) {
          setSelectedAdminTicket(null);
          setAdminReplyDraft("");
        }
      }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>مدیریت تیکت #{selectedAdminTicket?.id ?? "-"}</DialogTitle>
            <DialogDescription>پاسخ ادمین و بستن تیکت فقط برای assignee فعال است.</DialogDescription>
          </DialogHeader>
          <DialogBody className="app-scrollbar">
            {adminDetailLoading === "ticket" && !selectedAdminTicket ? (
              <DialogSkeleton />
            ) : selectedAdminTicket ? (
              <div className="space-y-5">
                <AdminAssignmentHeader
                  assignedAdminDisplayName={selectedAdminTicket.assignedAdminDisplayName}
                  claimedAt={selectedAdminTicket.claimedAt}
                  isMine={selectedAdminTicket.assignedAdminUserId === snapshot.user.id}
                />
                <div className="flex items-center justify-between gap-4 rounded-[24px] border border-[color:var(--app-border)] bg-[color:var(--app-surface-muted)] p-4">
                  <div>
                    <p className="text-sm font-semibold text-[color:var(--app-text)]">{selectedAdminTicket.user.displayName}</p>
                    <p className="mt-2 text-sm text-[color:var(--app-text-muted)]">آخرین بروزرسانی: {formatDate(selectedAdminTicket.updatedAt)}</p>
                  </div>
                  <StatusBadge status={selectedAdminTicket.status} />
                </div>
                <div className="space-y-3">
                  {(selectedAdminTicket.messages ?? []).map((message) => (
                    <div key={message.id} className={`rounded-[22px] px-4 py-3 ${message.senderRole === "user" ? "mr-8 border border-[color:var(--app-border)] bg-[color:var(--app-surface)]" : "ml-8 bg-[color:var(--app-surface-muted)]"}`}>
                      <div className="mb-2 flex items-center gap-2">
                        <Badge variant={message.senderRole === "admin" ? "info" : "default"}>{message.senderRole === "admin" ? "ادمین" : "کاربر"}</Badge>
                        <span className="text-xs text-[color:var(--app-text-muted)]">{formatDate(message.createdAt)}</span>
                      </div>
                      <p className="text-sm leading-7 text-[color:var(--app-text)]">{message.body}</p>
                    </div>
                  ))}
                </div>
                <div className="space-y-3">
                  <SectionLabel title="پاسخ ادمین" description="پاسخ برای کاربر ارسال می‌شود و در thread ذخیره می‌ماند." />
                  <Textarea
                    value={adminReplyDraft}
                    onChange={(event) => setAdminReplyDraft(event.target.value)}
                    placeholder="پاسخ پشتیبانی..."
                    disabled={selectedAdminTicket.assignedAdminUserId !== snapshot.user.id || selectedAdminTicket.status !== "open"}
                  />
                </div>
              </div>
            ) : null}
          </DialogBody>
          <DialogFooter>
            {selectedAdminTicket ? (
              <>
                {selectedAdminTicket.assignedAdminUserId === null ? (
                  <Button onClick={() => void mutateAdminTicket(selectedAdminTicket.id, "claim")} disabled={busyKey === `admin:ticket:claim:${selectedAdminTicket.id}`}>
                    {busyKey === `admin:ticket:claim:${selectedAdminTicket.id}` ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <UserCheck className="h-4 w-4" />}
                    Claim
                  </Button>
                ) : selectedAdminTicket.assignedAdminUserId === snapshot.user.id ? (
                  <>
                    <Button variant="outline" onClick={() => void mutateAdminTicket(selectedAdminTicket.id, "release")} disabled={busyKey === `admin:ticket:release:${selectedAdminTicket.id}`}>
                      <RotateCcw className="h-4 w-4" />
                      Release
                    </Button>
                    <Button variant="outline" onClick={() => void mutateAdminTicket(selectedAdminTicket.id, "close")} disabled={selectedAdminTicket.status !== "open" || busyKey === `admin:ticket:close:${selectedAdminTicket.id}`}>
                      <XCircle className="h-4 w-4" />
                      بستن
                    </Button>
                    <Button onClick={() => void mutateAdminTicket(selectedAdminTicket.id, "reply")} disabled={!adminReplyDraft.trim() || selectedAdminTicket.status !== "open" || busyKey === `admin:ticket:reply:${selectedAdminTicket.id}`}>
                      {busyKey === `admin:ticket:reply:${selectedAdminTicket.id}` ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <MessageSquare className="h-4 w-4" />}
                      ارسال پاسخ
                    </Button>
                  </>
                ) : null}
              </>
            ) : null}
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
      <div className="mb-4 rounded-[24px] border border-[color:var(--app-border)] bg-[color:var(--app-surface)] px-4 py-4">
        <Skeleton className="h-5 w-28" />
        <Skeleton className="mt-3 h-7 w-72 max-w-full" />
        <div className="mt-4 grid gap-2 sm:grid-cols-3">
          <Skeleton className="h-14 rounded-[18px]" />
          <Skeleton className="h-14 rounded-[18px]" />
          <Skeleton className="h-14 rounded-[18px]" />
        </div>
      </div>
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
      className="inline-flex min-w-0 shrink-0 items-center rounded-[16px] border border-[color:var(--app-border)] bg-[color:var(--app-surface-muted)] p-0.5"
      role="group"
      aria-label="تغییر تم"
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
              "inline-flex h-8 min-w-8 items-center justify-center gap-1.5 rounded-[13px] px-2 text-xs font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--app-link)] sm:px-2.5",
              active
                ? "bg-[color:var(--app-surface)] text-[color:var(--app-text)] shadow-sm"
                : "text-[color:var(--app-text-muted)] hover:bg-[color:var(--app-surface)] hover:text-[color:var(--app-text)]"
            ].join(" ")}
            aria-pressed={active}
            aria-label={`تم ${option.label}`}
          >
            <Icon className="h-3.5 w-3.5 shrink-0" />
            <span className="hidden sm:inline">{option.label}</span>
          </button>
        );
      })}
    </div>
  );
}

function ModeSwitcher({
  mode,
  onChange
}: {
  mode: AppMode;
  onChange: (mode: AppMode) => void;
}) {
  return (
    <div className="inline-flex shrink-0 rounded-[16px] border border-[color:var(--app-border)] bg-[color:var(--app-surface-muted)] p-0.5">
      {([
        { id: "user", label: "کاربر", icon: Bot },
        { id: "admin", label: "مدیریت", icon: ShieldCheck }
      ] as Array<{ id: AppMode; label: string; icon: typeof Bot }>).map((item) => {
        const Icon = item.icon;
        const active = mode === item.id;

        return (
          <button
            key={item.id}
            type="button"
            onClick={() => onChange(item.id)}
            className={`inline-flex h-8 items-center justify-center gap-1.5 rounded-[13px] px-2.5 text-xs font-semibold transition ${
              active
                ? "bg-[color:var(--app-surface)] text-[color:var(--app-text)] shadow-sm"
                : "text-[color:var(--app-text-muted)] hover:bg-[color:var(--app-surface)] hover:text-[color:var(--app-text)]"
            }`}
          >
            <Icon className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">{item.label}</span>
          </button>
        );
      })}
    </div>
  );
}

function AdminWorkspace({
  summary,
  orders,
  tickets,
  activeTab,
  scope,
  currentAdminUserId,
  refreshing,
  onTabChange,
  onScopeChange,
  onRefresh,
  onOpenOrder,
  onOpenTicket
}: {
  summary: AdminQueueSummaryDto | null;
  orders: AdminOrderDto[];
  tickets: AdminTicketDto[];
  activeTab: AdminTab;
  scope: AdminScope;
  currentAdminUserId: number;
  refreshing: boolean;
  onTabChange: (tab: AdminTab) => void;
  onScopeChange: (scope: AdminScope) => void;
  onRefresh: () => void;
  onOpenOrder: (orderId: number) => void;
  onOpenTicket: (ticketId: number) => void;
}) {
  const activeItems = activeTab === "orders" ? orders : tickets;

  return (
    <section className="mb-5 flex-1 space-y-4">
      <div className="rounded-[24px] border border-[color:var(--app-border)] bg-[color:var(--app-surface)] px-4 py-4 shadow-[var(--app-card-shadow)]">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[color:var(--app-text-muted)]">Admin Inbox</p>
            <h2 className="mt-2 text-lg font-bold text-[color:var(--app-text)]">رسیدگی به درخواست‌ها</h2>
          </div>
          <Button variant="outline" onClick={onRefresh} disabled={refreshing}>
            <RefreshCw className={refreshing ? "h-4 w-4 animate-spin" : "h-4 w-4"} />
            تازه‌سازی
          </Button>
        </div>
        <div className="mt-4 grid gap-2 sm:grid-cols-4">
          <AdminMetric label="سفارش باز" value={summary?.orders.total ?? 0} />
          <AdminMetric label="سفارش من" value={summary?.orders.mine ?? 0} />
          <AdminMetric label="تیکت باز" value={summary?.tickets.total ?? 0} />
          <AdminMetric label="تیکت من" value={summary?.tickets.mine ?? 0} />
        </div>
      </div>

      <div className="rounded-[24px] border border-[color:var(--app-border)] bg-[color:var(--app-surface)] p-3 shadow-[var(--app-card-shadow)]">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="grid grid-cols-2 gap-2 rounded-[18px] bg-[color:var(--app-surface-muted)] p-1">
            {([
              { id: "orders", label: "سفارش‌ها", icon: CreditCard },
              { id: "tickets", label: "تیکت‌ها", icon: MessageSquare }
            ] as Array<{ id: AdminTab; label: string; icon: typeof CreditCard }>).map((item) => {
              const Icon = item.icon;
              const active = activeTab === item.id;

              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => onTabChange(item.id)}
                  className={`inline-flex h-10 items-center justify-center gap-2 rounded-[14px] px-3 text-sm font-semibold transition ${
                    active ? "bg-[color:var(--app-surface)] text-[color:var(--app-text)] shadow-sm" : "text-[color:var(--app-text-muted)]"
                  }`}
                >
                  <Icon className="h-4 w-4" />
                  {item.label}
                </button>
              );
            })}
          </div>

          <div className="grid grid-cols-3 gap-1 rounded-[18px] bg-[color:var(--app-surface-muted)] p-1">
            {([
              { id: "unclaimed", label: "Unclaimed" },
              { id: "mine", label: "Mine" },
              { id: "all", label: "All" }
            ] as Array<{ id: AdminScope; label: string }>).map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => onScopeChange(item.id)}
                className={`h-9 rounded-[14px] px-2 text-xs font-semibold transition ${
                  scope === item.id ? "bg-[color:var(--app-surface)] text-[color:var(--app-text)] shadow-sm" : "text-[color:var(--app-text-muted)]"
                }`}
              >
                {item.label}
              </button>
            ))}
          </div>
        </div>

        <ListArea className="mt-4">
          {activeItems.length > 0 ? (
            activeTab === "orders"
              ? orders.map((order) => (
                  <AdminOrderCard
                    key={order.id}
                    order={order}
                    currentAdminUserId={currentAdminUserId}
                    onOpen={() => onOpenOrder(order.id)}
                  />
                ))
              : tickets.map((ticket) => (
                  <AdminTicketCard
                    key={ticket.id}
                    ticket={ticket}
                    currentAdminUserId={currentAdminUserId}
                    onOpen={() => onOpenTicket(ticket.id)}
                  />
                ))
          ) : (
            <EmptyState title="موردی در این صف نیست" description="با تغییر فیلتر یا تازه‌سازی، صف‌های دیگر را بررسی کنید." />
          )}
        </ListArea>
      </div>
    </section>
  );
}

function AdminMetric({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-[18px] border border-[color:var(--app-border)] bg-[color:var(--app-surface-muted)] px-3 py-2">
      <p className="text-[11px] font-semibold text-[color:var(--app-text-muted)]">{label}</p>
      <p className="mt-1 text-sm font-bold text-[color:var(--app-text)]">{formatCount(value)}</p>
    </div>
  );
}

function AdminOrderCard({
  order,
  currentAdminUserId,
  onOpen
}: {
  order: AdminOrderDto;
  currentAdminUserId: number;
  onOpen: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onOpen}
      className="flex w-full items-center justify-between gap-4 rounded-[22px] border border-[color:var(--app-border)] bg-[color:var(--app-surface)] px-4 py-4 text-right transition hover:bg-[color:var(--app-surface-muted)]"
    >
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-sm font-semibold text-[color:var(--app-text)]">سفارش #{order.id}</p>
          <StatusBadge status={order.status} />
          <AdminAssignmentBadge item={order} currentAdminUserId={currentAdminUserId} />
        </div>
        <p className="mt-2 truncate text-sm text-[color:var(--app-text-muted)]">{order.user.displayName} • {order.plan.title}</p>
        <p className="mt-1 truncate text-xs text-[color:var(--app-text-muted)]">{order.preview}</p>
      </div>
      <ArrowUpLeft className="h-4 w-4 shrink-0 text-[color:var(--app-text-muted)]" />
    </button>
  );
}

function AdminTicketCard({
  ticket,
  currentAdminUserId,
  onOpen
}: {
  ticket: AdminTicketDto;
  currentAdminUserId: number;
  onOpen: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onOpen}
      className="flex w-full items-center justify-between gap-4 rounded-[22px] border border-[color:var(--app-border)] bg-[color:var(--app-surface)] px-4 py-4 text-right transition hover:bg-[color:var(--app-surface-muted)]"
    >
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-sm font-semibold text-[color:var(--app-text)]">تیکت #{ticket.id}</p>
          <StatusBadge status={ticket.status} />
          <AdminAssignmentBadge item={ticket} currentAdminUserId={currentAdminUserId} />
        </div>
        <p className="mt-2 truncate text-sm text-[color:var(--app-text-muted)]">{ticket.user.displayName} • {formatDate(ticket.updatedAt)}</p>
        <p className="mt-1 truncate text-xs text-[color:var(--app-text-muted)]">{ticket.preview}</p>
      </div>
      <ArrowUpLeft className="h-4 w-4 shrink-0 text-[color:var(--app-text-muted)]" />
    </button>
  );
}

function AdminAssignmentBadge({
  item,
  currentAdminUserId
}: {
  item: { assignedAdminUserId: number | null; assignedAdminDisplayName: string | null };
  currentAdminUserId: number;
}) {
  if (item.assignedAdminUserId === null) {
    return <Badge variant="warning">Unclaimed</Badge>;
  }

  if (item.assignedAdminUserId === currentAdminUserId) {
    return <Badge variant="success">Mine</Badge>;
  }

  return <Badge variant="info">{item.assignedAdminDisplayName ?? "Assigned"}</Badge>;
}

function AdminAssignmentHeader({
  assignedAdminDisplayName,
  claimedAt,
  isMine
}: {
  assignedAdminDisplayName: string | null;
  claimedAt: string | null;
  isMine: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-4 rounded-[22px] border border-[color:var(--app-border)] bg-[color:var(--app-surface-muted)] px-4 py-3">
      <div>
        <p className="text-sm font-semibold text-[color:var(--app-text)]">
          {assignedAdminDisplayName ? `Assignee: ${assignedAdminDisplayName}` : "هنوز claim نشده"}
        </p>
        <p className="mt-1 text-xs text-[color:var(--app-text-muted)]">{claimedAt ? formatDate(claimedAt) : "برای شروع رسیدگی claim کنید."}</p>
      </div>
      <Badge variant={isMine ? "success" : assignedAdminDisplayName ? "info" : "warning"}>
        {isMine ? "Mine" : assignedAdminDisplayName ? "Assigned" : "Unclaimed"}
      </Badge>
    </div>
  );
}

function RouteSummaryPanel({ summary }: { summary: RouteSummary }) {
  const ActionIcon = summary.actionIcon;

  return (
    <section className="mb-4 rounded-[24px] border border-[color:var(--app-border)] bg-[color:var(--app-surface)] px-4 py-4 shadow-[var(--app-card-shadow)]">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[color:var(--app-text-muted)]">{summary.eyebrow}</p>
          <div className="mt-2 flex flex-wrap items-end gap-x-3 gap-y-1">
            <h2 className="text-lg font-bold leading-tight text-[color:var(--app-text)]">{summary.title}</h2>
            <p className="max-w-xl text-sm leading-6 text-[color:var(--app-text-muted)]">{summary.description}</p>
          </div>
        </div>
        <Button onClick={summary.onAction} className="shrink-0">
          <ActionIcon className="h-4 w-4" />
          {summary.actionLabel}
        </Button>
      </div>
      <div className="mt-4 grid gap-2 sm:grid-cols-3">
        {summary.stats.map((item) => (
          <div key={item.label} className="rounded-[18px] border border-[color:var(--app-border)] bg-[color:var(--app-surface-muted)] px-3 py-2">
            <p className="text-[11px] font-semibold text-[color:var(--app-text-muted)]">{item.label}</p>
            <p className="mt-1 truncate text-sm font-semibold text-[color:var(--app-text)]">{item.value}</p>
          </div>
        ))}
      </div>
    </section>
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

function readAdminDeepLink(): AdminDeepLink {
  if (typeof window === "undefined") {
    return { mode: "user", tab: "orders", id: null };
  }

  const params = new URLSearchParams(window.location.search);
  const mode = params.get("mode") === "admin" ? "admin" : "user";
  const tab = params.get("tab") === "tickets" ? "tickets" : "orders";
  const idValue = Number(params.get("id"));

  return {
    mode,
    tab,
    id: Number.isFinite(idValue) && idValue > 0 ? idValue : null
  };
}

function createPreviewAdminData(snapshot: AppSnapshot | null): {
  summary: AdminQueueSummaryDto;
  orders: AdminOrderDto[];
  tickets: AdminTicketDto[];
} {
  if (!snapshot) {
    return {
      summary: {
        orders: { total: 0, mine: 0, unclaimed: 0 },
        tickets: { total: 0, mine: 0, unclaimed: 0 }
      },
      orders: [],
      tickets: []
    };
  }

  const previewUser = {
    id: 200,
    telegramId: 99887766,
    username: "customer",
    displayName: "کاربر نمونه"
  };

  const orders: AdminOrderDto[] = snapshot.orders
    .filter((order) => order.status === "under_review")
    .map((order) => ({
      ...order,
      user: previewUser,
      assignedAdminUserId: null,
      assignedAdminDisplayName: null,
      claimedAt: null,
      preview: order.receiptText ?? (order.hasReceiptImage ? "رسید تصویری ثبت شده است." : "رسیدی ثبت نشده است.")
    }));

  const tickets: AdminTicketDto[] = snapshot.tickets
    .filter((ticket) => ticket.status === "open")
    .map((ticket) => {
      const latestMessage = ticket.messages?.[ticket.messages.length - 1] ?? null;

      return {
        ...ticket,
        user: previewUser,
        assignedAdminUserId: null,
        assignedAdminDisplayName: null,
        claimedAt: null,
        preview: latestMessage?.body ?? "پیامی ثبت نشده است."
      };
    });

  return {
    summary: {
      orders: countAdminItems(orders, snapshot.user.id),
      tickets: countAdminItems(tickets, snapshot.user.id)
    },
    orders,
    tickets
  };
}

function filterAdminItems<T extends { assignedAdminUserId: number | null }>(
  items: T[],
  scope: AdminScope,
  adminUserId: number
) {
  if (scope === "mine") {
    return items.filter((item) => item.assignedAdminUserId === adminUserId);
  }

  if (scope === "unclaimed") {
    return items.filter((item) => item.assignedAdminUserId === null);
  }

  return items;
}

function countAdminItems(items: Array<{ assignedAdminUserId: number | null }>, adminUserId: number) {
  return {
    total: items.length,
    mine: items.filter((item) => item.assignedAdminUserId === adminUserId).length,
    unclaimed: items.filter((item) => item.assignedAdminUserId === null).length
  };
}

function applyPreviewOrderMutation(
  current: AdminOrderDto | null,
  user: UserDto,
  action: "claim" | "release" | "approve" | "reject" | "clarify",
  note: string
) {
  if (!current) {
    throw new Error("سفارش انتخاب نشده است.");
  }

  if (action === "claim") {
    return {
      ...current,
      assignedAdminUserId: user.id,
      assignedAdminDisplayName: user.displayName,
      claimedAt: new Date().toISOString()
    };
  }

  if (action === "release") {
    return {
      ...current,
      assignedAdminUserId: null,
      assignedAdminDisplayName: null,
      claimedAt: null
    };
  }

  if (action === "approve") {
    return {
      ...current,
      status: "fulfilled" as const,
      updatedAt: new Date().toISOString()
    };
  }

  return {
    ...current,
    status: action === "reject" ? "rejected" as const : "pending_receipt" as const,
    adminNote: note,
    updatedAt: new Date().toISOString()
  };
}

function applyPreviewTicketMutation(
  current: AdminTicketDto | null,
  user: UserDto,
  action: "claim" | "release" | "reply" | "close",
  body: string
) {
  if (!current) {
    throw new Error("تیکت انتخاب نشده است.");
  }

  if (action === "claim") {
    return {
      ...current,
      assignedAdminUserId: user.id,
      assignedAdminDisplayName: user.displayName,
      claimedAt: new Date().toISOString()
    };
  }

  if (action === "release") {
    return {
      ...current,
      assignedAdminUserId: null,
      assignedAdminDisplayName: null,
      claimedAt: null
    };
  }

  if (action === "close") {
    return {
      ...current,
      status: "closed" as const,
      closedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
  }

  const nextMessage = {
    id: Date.now(),
    ticketId: current.id,
    body,
    senderRole: "admin" as const,
    createdAt: new Date().toISOString()
  };

  return {
    ...current,
    preview: body,
    messages: [...(current.messages ?? []), nextMessage],
    updatedAt: nextMessage.createdAt
  };
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
