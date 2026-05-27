import { HttpErrorResponse, HttpInterceptorFn, HttpResponse } from '@angular/common/http';
import { inject } from '@angular/core';
import { finalize, tap, timeout } from 'rxjs';
import { LoadingService } from './loading.service';
import { LoggerService } from './logger.service';

export const loadingInterceptor: HttpInterceptorFn = (req, next) => {
  const loading = inject(LoadingService);
  const logger = inject(LoggerService);
  const startedAt = Date.now();
  loading.begin();
  logger.info('HTTP request', { method: req.method, url: req.urlWithParams });
  return next(req).pipe(
    // Evita spinner infinito quando o backend nao responde.
    timeout(20000),
    tap({
      next: (event) => {
        if (event instanceof HttpResponse) {
          logger.info('HTTP response', {
            method: req.method,
            url: req.urlWithParams,
            status: event.status,
            durationMs: Date.now() - startedAt
          });
        }
      },
      error: (error: HttpErrorResponse) => {
        logger.error('HTTP error', {
          method: req.method,
          url: req.urlWithParams,
          status: error?.status,
          message: error?.message,
          durationMs: Date.now() - startedAt
        });
      }
    }),
    finalize(() => loading.end())
  );
};
