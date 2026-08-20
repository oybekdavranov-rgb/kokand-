/**
 * IMORA AI — kontent qatlami (CLAUDE.md §9).
 * Manba: Imora AI taqdimoti (o'zbekcha slaydlar). Hozircha statik UZ;
 * keyin uz/en i18n adapteriga ko'chiriladi.
 *
 * Imora AI — sun'iy intellekt yordamida ISHORA TILINI o'rganish va
 * muloqot qilish platformasi (kar va soqov insonlar uchun).
 */

export interface Feature {
  id: string;
  tag: string;
  title: string;
  accent: string;
  body: string;
  steps: string[];
}

export interface Item {
  title: string;
  body: string;
}

export const imora = {
  brand: {
    name: "Imora AI",
    kicker: "Muloqot uchun yangi imkoniyat",
    title: "Sun'iy intellekt yordamida ishora tilini o'rganish va muloqot",
    statement: "Sun'iy intellekt yordamida hech kim muloqotdan chetda qolmasin.",
  },

  hero: {
    lines: ["ISHORA TILI", "hammaga", "OCHIQ"],
    lead:
      "Imora AI — sun'iy intellekt, 3D avatar va jonli video muloqotni birlashtirgan platforma. Kar va soqov insonlar uchun ishora tilini o'rganishni oson, arzon va jonli qiladi.",
    ctaPrimary: "Qo'llab-quvvatlash / taklif",
    ctaSecondary: "Imkoniyatlarni ko'rish",
  },

  problem: {
    eyebrow: "Muammo",
    title: ["MULOQOT", "hamma uchun", "EMAS"],
    items: [
      {
        title: "Imkoniyatlar cheklangan",
        body: "Kar va soqov insonlar uchun ishora tilini o'rganish imkoniyatlari juda cheklangan.",
      },
      {
        title: "Mustaqil o'rganish qiyin",
        body: "Uy sharoitida o'rganish qiyin, professional ta'lim esa qimmat tushadi.",
      },
      {
        title: "Amaliy hamkor yo'q",
        body: "Ishora tilida suhbat qilish uchun mos hamkor topish nihoyatda qiyin.",
      },
    ] satisfies Item[],
  },

  solution: {
    eyebrow: "Bizning yechim",
    title: ["YAGONA", "interaktiv", "PLATFORMA"],
    lead: "Imora AI — ishora tilini o'rganish uchun to'liq raqamli yechim.",
    points: [
      "Sun'iy intellekt, 3D avatar va video muloqot birgalikda",
      "Istalgan joydan, istalgan vaqtda o'rganish",
      "Har bir foydalanuvchiga individual yondashuv",
    ],
  },

  features: [
    {
      id: "ai-chat",
      tag: "01 · AI Chat",
      title: "INTERAKTIV",
      accent: "o'rganish",
      body: "Foydalanuvchi AI bilan suhbatlashadi, savol beradi va yangi so'z, gap hamda ishora harakatlarini o'rganadi. Gemini API orqali tabiiy va aqlli suhbat.",
      steps: ["Savol ber", "AI tahlil qiladi", "Ishora ijro qilinadi"],
    },
    {
      id: "avatar",
      tag: "02 · 3D Avatar",
      title: "VIZUAL",
      accent: "o'rganish",
      body: "O'zbekcha so'z yoki gap yozasiz — AI uni tahlil qiladi va 3D avatar mos ishora harakatlarini ko'rsatadi. Takrorlab, ko'rib o'rganasiz.",
      steps: ["Matn kiriting", "AI tahlil qiladi", "Avatar ko'rsatadi"],
    },
    {
      id: "video",
      tag: "03 · Video muloqot",
      title: "REAL",
      accent: "tajriba",
      body: "Ilovadagi boshqa o'rganuvchilar bilan jonli video suhbat. Ishora tilida real muloqot, tajriba almashish va sizni tushunadigan yangi hamjamiyat.",
      steps: ["Ulaning", "Suhbatlashing", "Hamjamiyat quring"],
    },
  ] satisfies Feature[],

  audience: {
    eyebrow: "Kimlar uchun?",
    title: ["HECH KIM", "chetda", "QOLMAYDI"],
    items: [
      {
        title: "Kar va soqov insonlar",
        body: "Zaif eshituvchilar va muloqot imkoniyatini kengaytirmoqchi bo'lganlar.",
      },
      {
        title: "Yaqinlari uchun",
        body: "Nogironligi bo'lgan insonlar bilan muloqotni yaxshilamoqchi bo'lganlar.",
      },
      {
        title: "Mustaqil o'rganuvchilar",
        body: "Uyda o'z sur'atida ishora tilini o'rganishni istagan har kim.",
      },
    ] satisfies Item[],
  },

  tech: {
    eyebrow: "Texnologiyalar",
    title: ["ZAMONAVIY", "texnologiyalar", "YIG'INDISI"],
    items: [
      { title: "Gemini API", body: "Aqlli va tabiiy AI suhbat." },
      { title: "Flutter", body: "iOS, Android va webda bir xil ishlaydi." },
      { title: "GLB 3D modellar", body: "Silliq va aniq avatar animatsiyalari." },
      { title: "Real-time", body: "Jonli video va chat." },
    ] satisfies Item[],
  },

  benefits: {
    eyebrow: "Asosiy afzalliklar",
    title: ["NEGA", "Imora", "AI?"],
    items: [
      { title: "Istalgan joyda", body: "Istalgan vaqtda, istalgan qurilmada o'rganish." },
      { title: "Individual AI", body: "3D vizual va AI bilan shaxsiy mashq." },
      { title: "Real muloqot", body: "Haqiqiy insonlar bilan interaktiv ta'lim." },
      { title: "Accessible", body: "Imkoniyati cheklangan insonlar uchun maxsus." },
    ] satisfies Item[],
  },

  future: {
    eyebrow: "Kelajakdagi rivojlanish",
    title: ["KEYINGI", "qadamlar"],
    items: [
      { title: "Kengaytirilgan lug'at", body: "Ko'proq ishora so'zlari va 3D animatsiyalar." },
      { title: "AI o'quv reja", body: "Individual tavsiyalar va shaxsiy o'quv yo'nalishi." },
      { title: "Kamera aniqlash", body: "Ovoz va kamera orqali ishoralarni real vaqtda aniqlash." },
      { title: "Muassasalar bilan integratsiya", body: "Ta'lim tashkilotlari va maktablar bilan hamkorlik." },
    ] satisfies Item[],
  },

  contact: {
    eyebrow: "Aloqa",
    lines: ["MULOQOT UCHUN", "yangi", "IMKONIYAT"],
    note: "Taklif, hamkorlik yoki qo'llab-quvvatlash — biz eshitishga tayyormiz.",
    pages: [
      { label: "Bosh", href: "/" },
      { label: "Imkoniyatlar", href: "/#features" },
      { label: "Texnologiyalar", href: "/#tech" },
      { label: "Aloqa", href: "/#contact" },
    ],
    social: [
      { label: "Telegram", href: "#" },
      { label: "Instagram", href: "#" },
      { label: "YouTube", href: "#" },
      { label: "GitHub", href: "#" },
    ],
    enquiries: { label: "Hamkorlik / taklif", href: "mailto:hello@imora.ai" },
  },
} as const;
