/**
 * Registers receipts with the fiscal module in the background: right after
 * each sale, when the connection comes back, and on a slow timer. A failure
 * is kept on the receipt and retried, with growing gaps, until it succeeds.
 */
import type { Store } from '../store/store';
import { fiscalModule } from './index';

export class FiscalQueue {
  private running = false;
  private timer: ReturnType<typeof setInterval> | null = null;

  constructor(private store: Store, private online: () => boolean = () => (typeof navigator === 'undefined' ? true : navigator.onLine)) {}

  start() {
    if (typeof window !== 'undefined') window.addEventListener('online', this.kick);
    this.timer = setInterval(this.kick, 30_000);
    this.kick();
  }

  stop() {
    if (typeof window !== 'undefined') window.removeEventListener('online', this.kick);
    if (this.timer) clearInterval(this.timer);
  }

  kick = () => {
    void this.run();
  };

  /** Send everything waiting. Returns how many were registered. */
  async run(): Promise<number> {
    if (this.running || !this.online()) return 0;
    this.running = true;
    let done = 0;
    try {
      for (const sale of this.store.pendingFiscal()) {
        const mod = fiscalModule(sale.fiscal.provider);
        if (mod.id === 'none') {
          this.store.setFiscal(sale.id, { status: 'off' });
          continue;
        }
        try {
          const r = await mod.register(sale, this.store.settings);
          this.store.setFiscal(sale.id, { status: 'done', code: r.code, qr: r.qr, error: null, attempts: sale.fiscal.attempts + 1 });
          done++;
        } catch (e) {
          this.store.setFiscal(sale.id, { status: 'failed', error: e instanceof Error ? e.message : String(e), attempts: sale.fiscal.attempts + 1 });
        }
      }
    } finally {
      this.running = false;
    }
    return done;
  }
}
