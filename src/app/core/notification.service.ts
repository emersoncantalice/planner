import { Injectable } from '@angular/core';

export interface PlannerNotification {
  
  id: string;
  titulo: string;
  corpo: string;
}

@Injectable({ providedIn: 'root' })
export class NotificationService {

  private readonly PREFIX = 'planner_notif_';
  private readonly APP_ICON = '/assets/branding/icon-square.png';
  private readonly FALLBACK_ICON = '/favicon.ico';

  

  private todayKey(): string {
    return this.PREFIX + new Date().toISOString().slice(0, 10);
  }

  private shownToday(): Set<string> {
    try {
      const raw = localStorage.getItem(this.todayKey());
      return new Set(raw ? JSON.parse(raw) : []);
    } catch {
      return new Set();
    }
  }

  private markShown(ids: string[]): void {
    const s = this.shownToday();
    ids.forEach(id => s.add(id));
    try {
      localStorage.setItem(this.todayKey(), JSON.stringify([...s]));
    } catch { /* storage full — ignore */ }
    this.pruneOldKeys();
  }

  
  private pruneOldKeys(): void {
    const today = this.todayKey();
    const toDelete: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i)!;
      if (k.startsWith(this.PREFIX) && k !== today) toDelete.push(k);
    }
    toDelete.forEach(k => localStorage.removeItem(k));
  }

  // ── Public API ───────────────────────────────────────────────────────────────
  
  /**
   * Requests permission (if not yet granted) and fires one browser
   * notification per event that hasn't been shown today yet.
   */
  async notificar(eventos: PlannerNotification[]): Promise<void> {
    if (!('Notification' in window) || eventos.length === 0) return;

    const shown = this.shownToday();
    const pendentes = eventos.filter(e => !shown.has(e.id));
    if (pendentes.length === 0) return;

    
    let perm = Notification.permission;
    if (perm === 'default') {
      try {
        perm = await Notification.requestPermission();
      } catch {
        return;
      }
    }
    if (perm !== 'granted') return;

    for (const ev of pendentes) {
      try {
        new Notification(ev.titulo, {
          body:  ev.corpo,
          icon:  this.APP_ICON,
          tag:   ev.id,   
          badge: this.FALLBACK_ICON,
        });
      } catch {
        // Some browsers block new Notification() outside user-gesture context
      }
    }

    this.markShown(pendentes.map(e => e.id));
  }
}
