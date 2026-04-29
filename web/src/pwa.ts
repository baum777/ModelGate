type PwaRegistrationEnvironment = {
  isDev: boolean;
  isSecureContext: boolean;
  hasServiceWorker: boolean;
};

export function shouldRegisterPwa(environment: PwaRegistrationEnvironment) {
  return !environment.isDev
    && environment.isSecureContext
    && environment.hasServiceWorker;
}

async function clearDevelopmentPwaState() {
  const serviceWorker = typeof navigator !== "undefined" ? navigator.serviceWorker : undefined;

  if (serviceWorker && "getRegistrations" in serviceWorker) {
    const registrations = await serviceWorker.getRegistrations();
    await Promise.all(registrations.map((registration) => registration.unregister()));
  }

  if (typeof caches !== "undefined") {
    const cacheNames = await caches.keys();
    await Promise.all(cacheNames.map((cacheName) => caches.delete(cacheName)));
  }
}

export async function registerPwa() {
  const environment = {
    isDev: import.meta.env.DEV,
    isSecureContext: typeof window !== "undefined" && window.isSecureContext,
    hasServiceWorker: typeof navigator !== "undefined" && "serviceWorker" in navigator,
  };

  if (!shouldRegisterPwa(environment)) {
    if (environment.isDev && environment.hasServiceWorker) {
      try {
        await clearDevelopmentPwaState();
      } catch (error) {
        console.warn("PWA development cleanup failed", error);
      }
    }
    return false;
  }

  try {
    await navigator.serviceWorker.register("/sw.js", { scope: "/" });
    return true;
  } catch (error) {
    console.warn("PWA service worker registration failed", error);
    return false;
  }
}
