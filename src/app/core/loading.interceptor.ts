import { HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { finalize, timeout } from 'rxjs';
import { LoadingService } from './loading.service';

export const loadingInterceptor: HttpInterceptorFn = (req, next) => {
  const loading = inject(LoadingService);
  loading.begin();
  return next(req).pipe(
    // Evita spinner infinito quando o backend nao responde.
    timeout(20000),
    finalize(() => loading.end())
  );
};
