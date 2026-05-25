import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';

@Injectable({ providedIn: 'root' })
export class LoadingService {
  private readonly activeRequests = new BehaviorSubject<number>(0);
  readonly loading$ = new BehaviorSubject<boolean>(false);

  begin() {
    const next = this.activeRequests.value + 1;
    this.activeRequests.next(next);
    this.loading$.next(next > 0);
  }

  end() {
    const next = Math.max(0, this.activeRequests.value - 1);
    this.activeRequests.next(next);
    this.loading$.next(next > 0);
  }
}
