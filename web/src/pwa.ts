const canRegisterServiceWorker =
  typeof window !== "undefined"
  && window.isSecureContext
  && "serviceWorker" in navigator;

export async function registerPwa() {
  if (!canRegisterServiceWorker) {
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
