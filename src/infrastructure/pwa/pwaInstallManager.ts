interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
}

type Listener = () => void;

let deferredPrompt: BeforeInstallPromptEvent | null = null;
let initialized = false;
const listeners = new Set<Listener>();

function notify(): void {
  for (const listener of listeners) listener();
}

export const pwaInstallManager = {
  start(): void {
    if (initialized || typeof window === 'undefined') return;
    initialized = true;

    window.addEventListener('beforeinstallprompt', (event) => {
      event.preventDefault();
      deferredPrompt = event as BeforeInstallPromptEvent;
      notify();
    });

    window.addEventListener('appinstalled', () => {
      deferredPrompt = null;
      notify();
    });
  },

  canPromptInstall(): boolean {
    return deferredPrompt !== null;
  },

  isStandalone(): boolean {
    if (typeof window === 'undefined') return false;
    const cap = (window as unknown as { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor;
    if (cap?.isNativePlatform?.()) return true;
    const standaloneMedia = window.matchMedia?.('(display-mode: standalone)')?.matches;
    const iosStandalone = (window.navigator as Navigator & { standalone?: boolean }).standalone === true;
    return Boolean(standaloneMedia || iosStandalone);
  },

  async promptInstall(): Promise<'accepted' | 'dismissed' | 'unavailable'> {
    if (!deferredPrompt) return 'unavailable';
    const promptEvent = deferredPrompt;
    deferredPrompt = null;
    notify();
    await promptEvent.prompt();
    const choice = await promptEvent.userChoice;
    return choice.outcome;
  },

  subscribe(listener: Listener): () => void {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  },

  getApkDownloadUrl(): string {
    if (typeof window === 'undefined') return './StackFlow-Checklist.apk';
    const base = import.meta.env.BASE_URL || '/';
    const normalizedBase = base.endsWith('/') ? base : `${base}/`;
    return `${window.location.origin}${normalizedBase}StackFlow-Checklist.apk`;
  },
};
