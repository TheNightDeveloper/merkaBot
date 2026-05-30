export const defaultPlans = [
  {
    code: "trial-1d-3g",
    title: "اکانت تست 1 روزه - 3 گیگ",
    days: 1,
    trafficBytes: 3 * 1024 * 1024 * 1024,
    deviceLimit: 1,
    priceLabel: "رایگان",
    enabled: true,
    isTrial: true
  },
  {
    code: "basic-30d-50g",
    title: "پلن پایه 30 روزه - 50 گیگ",
    days: 30,
    trafficBytes: 50 * 1024 * 1024 * 1024,
    deviceLimit: 2,
    priceLabel: "450,000 تومان",
    enabled: true,
    isTrial: false
  },
  {
    code: "plus-30d-100g",
    title: "پلن پلاس 30 روزه - 100 گیگ",
    days: 30,
    trafficBytes: 100 * 1024 * 1024 * 1024,
    deviceLimit: 3,
    priceLabel: "650,000 تومان",
    enabled: true,
    isTrial: false
  },
  {
    code: "pro-60d-200g",
    title: "پلن حرفه ای 60 روزه - 200 گیگ",
    days: 60,
    trafficBytes: 200 * 1024 * 1024 * 1024,
    deviceLimit: 5,
    priceLabel: "1,150,000 تومان",
    enabled: true,
    isTrial: false
  }
] as const;
