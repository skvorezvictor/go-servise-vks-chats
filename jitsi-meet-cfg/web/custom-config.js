// Портал встраивает конференцию через Jitsi External API (/app/call/<room>),
// в том числе на мобильных браузерах внешних гостей - стандартный экран
// deep-linking ("Video chat isn't available on mobile") должен быть выключен,
// иначе там, где нужно именно веб-присоединение без приложения, будет тупик.
config.disableDeepLinking = true;

config.localRecording = config.localRecording || {};
config.localRecording.notifyAllParticipants = true;
