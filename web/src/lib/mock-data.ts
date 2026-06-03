import type { AppSnapshot } from "./types";

export function createPreviewSnapshot(options?: { admin?: boolean }): AppSnapshot {
  return {
    preview: true,
    user: {
      id: 0,
      telegramId: 0,
      username: "preview",
      displayName: "پیش‌نمایش MerkaBot",
      isAdmin: options?.admin ?? false,
      trialUsed: false,
      createdAt: new Date().toISOString()
    },
    payment: {
      cardTitle: "MerkaBot Preview",
      cardNumber: "6037 9900 0000 0000",
      notes: "این پیش‌نمایش فقط برای مشاهده رابط است. برای عملیات واقعی، مینی‌اپ را از داخل تلگرام باز کنید."
    },
    plans: [
      {
        code: "monthly-pro",
        title: "پلن ماهانه پرو",
        days: 30,
        trafficBytes: 120 * 1024 ** 3,
        deviceLimit: 3,
        priceLabel: "۳۹۹٬۰۰۰ تومان",
        enabled: true,
        isTrial: false
      },
      {
        code: "quarter-studio",
        title: "پلن سه‌ماهه استودیو",
        days: 90,
        trafficBytes: 400 * 1024 ** 3,
        deviceLimit: 5,
        priceLabel: "۹۹۹٬۰۰۰ تومان",
        enabled: true,
        isTrial: false
      }
    ],
    services: [
      {
        id: 101,
        planCode: "monthly-pro",
        type: "paid",
        status: "active",
        email: "tg_preview_101",
        subId: "preview-sub-101",
        inboundId: 1,
        expiresAt: new Date(Date.now() + 12 * 24 * 60 * 60 * 1000).toISOString(),
        trafficBytes: 120 * 1024 ** 3,
        lastUsageUp: 12 * 1024 ** 3,
        lastUsageDown: 31 * 1024 ** 3,
        lastSyncAt: new Date().toISOString(),
        createdAt: new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString(),
        updatedAt: new Date().toISOString(),
        plan: {
          code: "monthly-pro",
          title: "پلن ماهانه پرو",
          days: 30,
          trafficBytes: 120 * 1024 ** 3,
          deviceLimit: 3,
          priceLabel: "۳۹۹٬۰۰۰ تومان",
          enabled: true,
          isTrial: false
        },
        deliveryMessage: "نمونه پیام تحویل کانفیگ در این بخش نمایش داده می‌شود.\nvmess://preview-config"
      }
    ],
    orders: [
      {
        id: 501,
        kind: "renew",
        status: "under_review",
        receiptText: "رسید نمونه در حالت پیش‌نمایش",
        adminNote: null,
        targetServiceId: 101,
        hasReceiptImage: true,
        requiresReceipt: true,
        createdAt: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
        updatedAt: new Date(Date.now() - 45 * 60 * 1000).toISOString(),
        plan: {
          code: "monthly-pro",
          title: "پلن ماهانه پرو",
          days: 30,
          trafficBytes: 120 * 1024 ** 3,
          deviceLimit: 3,
          priceLabel: "۳۹۹٬۰۰۰ تومان",
          enabled: true,
          isTrial: false
        },
        service: {
          id: 101,
          status: "active",
          expiresAt: new Date(Date.now() + 12 * 24 * 60 * 60 * 1000).toISOString()
        }
      }
    ],
    tickets: [
      {
        id: 77,
        status: "open",
        createdAt: new Date(Date.now() - 8 * 60 * 60 * 1000).toISOString(),
        updatedAt: new Date(Date.now() - 20 * 60 * 1000).toISOString(),
        closedAt: null,
        messages: [
          {
            id: 1,
            ticketId: 77,
            body: "سلام، سرعت سرویس من در بعضی ساعات افت می‌کند.",
            senderRole: "user",
            createdAt: new Date(Date.now() - 7 * 60 * 60 * 1000).toISOString()
          },
          {
            id: 2,
            ticketId: 77,
            body: "سلام، بررسی شد. لطفاً لوکیشن مصرف را هم ارسال کنید.",
            senderRole: "admin",
            createdAt: new Date(Date.now() - 6.5 * 60 * 60 * 1000).toISOString()
          }
        ]
      }
    ]
  };
}
