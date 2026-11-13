/**
 * Registers receipts with the fiscal module in the background: right after
 * each sale, when the connection comes back, and on a slow timer. A failure
 * is kept on the receipt and retried until it succeeds.
 *
 * Modules that sign on the till (Kosovo) are handled in two steps: the
 * receipt is signed at once, online or not, and sent when there is a
 * connection. Receipts go out in the order they were made, so a refund is
 * never sent before the sale it refunds.
 */
import type { Store } from '../store/store';
import { AtkError } from './xk/api';
import { fiscalModule } from './index';

export class FiscalQueue {
  private current: Promise<number> | null = null;
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

  /** Sign and send everything waiting. Returns how many were registered. */
  run(): Promise<number> {
    if (this.current) return this.current;
    this.current = this.work().finally(() => {
      this.current = null;
    });
    return this.current;
  }

  /**
   * Right after a sale: sign it and try to send it before the receipt is
   * handed over, waiting at most `timeoutMs`. If it has not reached the tax
   * service by then, the receipt is marked to print with OFFLINE.
   */
  async settle(saleId: string, timeoutMs = 8_000): Promise<void> {
    const before = this.current;
    const attempt = (async () => {
      if (before) await before.catch(() => 0);
      await this.run();
    })();
    await Promise.race([attempt, new Promise((r) => setTimeout(r, timeoutMs))]);
    const s = this.store.sale(saleId);
    if (s && s.fiscal.status !== 'done' && s.fiscal.status !== 'off' && !s.fiscal.offline) this.store.setFiscal(saleId, { offline: true });
  }

  private async work(): Promise<number> {
    let done = 0;
    const online = this.online();
    const pending = [...this.store.pendingFiscal()].sort((a, b) => a.created_at.localeCompare(b.created_at) || a.number - b.number);
    for (const queued of pending) {
      const mod = fiscalModule(queued.fiscal.provider);
      if (mod.id === 'none') {
        this.store.setFiscal(queued.id, { status: 'off' });
        continue;
      }
      let sending = false;
      try {
        if (mod.sign && mod.send) {
          if (!queued.fiscal.payload) {
            const signed = await mod.sign(queued, this.store.settings, { sale: (id) => this.store.sale(id), product: (id) => this.store.product(id) });
            this.store.setFiscal(queued.id, { ...signed, status: 'pending' });
          }
          if (!online) continue;
          sending = true;
          const sale = this.store.sale(queued.id)!;
          const r = await mod.send(sale, this.store.settings);
          this.store.setFiscal(sale.id, { ...r, status: 'done', error: null, attempts: sale.fiscal.attempts + 1 });
          done++;
        } else if (mod.register) {
          if (!online) continue;
          const r = await mod.register(queued, this.store.settings);
          this.store.setFiscal(queued.id, { status: 'done', code: r.code, qr: r.qr, error: null, attempts: queued.fiscal.attempts + 1 });
          done++;
        }
      } catch (e) {
        const sale = this.store.sale(queued.id) ?? queued;
        const msg = e instanceof Error ? e.message : String(e);
        // ATK already has this coupon (a reply that got lost on the way back): it counts as sent
        if (e instanceof AtkError && /already|exist|duplicate/i.test(msg)) {
          this.store.setFiscal(sale.id, { status: 'done', error: null, attempts: sale.fiscal.attempts + 1, sent_at: new Date().toISOString() });
          done++;
          continue;
        }
        this.store.setFiscal(sale.id, { status: 'failed', error: msg, attempts: sale.fiscal.attempts + 1 });
        // a refund must not reach ATK before its sale: stop at the first network failure
        if (sending && !(e instanceof AtkError)) break;
      }
    }
    return done;
  }
}
