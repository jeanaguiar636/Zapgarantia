// Service worker mínimo: permite instalar o app. Não guarda nada em cache,
// então o site sempre carrega a versão mais nova.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));
self.addEventListener('fetch', () => {});
