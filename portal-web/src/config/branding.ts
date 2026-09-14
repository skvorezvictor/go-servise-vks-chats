// Единая точка брендинга. Меняется целиком при подготовке анонимизированной
// версии для публичного репозитория, больше нигде в коде брендовые строки
// не хардкодятся.

export const branding = {
  companyName: 'Компания',
  appTitle: 'GO Компания',
  watermarkText: 'GO Компания ГК',
  versionLabel: '01.02.00 Компания ГК 2026.09',
  easterEggText: 'Создал Скворцов Виктор Владимирович @Skvorez',

  // Логотип/favicon отдаются напрямую основным доменом go.example.ru,
  // а не бандлятся в /app/assets/, переиспользуют брендинг основного сайта.
  logoUrl: 'https://go.example.ru/logo.svg',
  faviconUrl: '/images/favicon.svg',

  // Хост, откуда грузится JitsiMeetExternalAPI (уже развёрнутый прод-Jitsi,
  // не npm-пакет).
  jitsiExternalApiUrl: 'https://go.example.ru/external_api.js',
} as const
