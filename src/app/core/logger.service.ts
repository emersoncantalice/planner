import { Injectable } from '@angular/core';

@Injectable({ providedIn: 'root' })
export class LoggerService {
  info(message: string, data?: unknown) {
    console.info(`[Planner] ${message}`, data ?? '');
  }

  warn(message: string, data?: unknown) {
    console.warn(`[Planner] ${message}`, data ?? '');
  }

  error(message: string, data?: unknown) {
    console.error(`[Planner] ${message}`, data ?? '');
  }
}
