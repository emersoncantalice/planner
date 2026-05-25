import { Component, EventEmitter, Input, Output } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-topbar',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './topbar.component.html'
})
export class TopbarComponent {
  @Input() token = '';
  @Input() usuario = '';
  @Input() conta: any = null;
  @Input() menuAberto = false;
  @Output() menuToggle = new EventEmitter<void>();
  @Output() openAccount = new EventEmitter<void>();
  @Output() logout = new EventEmitter<void>();

  get initials() {
    const value = (this.usuario || '').trim();
    if (!value) return 'U';
    const parts = value.split(/\s+/).slice(0, 2);
    return parts.map((p) => p[0]?.toUpperCase() ?? '').join('');
  }
}
