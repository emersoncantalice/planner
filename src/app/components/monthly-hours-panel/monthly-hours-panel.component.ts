import { CommonModule } from '@angular/common';
import { Component, CUSTOM_ELEMENTS_SCHEMA, EventEmitter, Input, Output } from '@angular/core';
import { FormsModule } from '@angular/forms';

@Component({
  selector: 'app-monthly-hours-panel',
  standalone: true,
  imports: [CommonModule, FormsModule],
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
  templateUrl: './monthly-hours-panel.component.html',
  styleUrl: './monthly-hours-panel.component.scss'
})
export class MonthlyHoursPanelComponent {
  @Input() horasMes: any[] = [];
  @Output() saveAll = new EventEmitter<Array<{ mes: number; horas: number }>>();
  draftHoras: Record<number, number> = {};

  meses = [
    { num: 1, sigla: 'JAN' }, { num: 2, sigla: 'FEV' }, { num: 3, sigla: 'MAR' }, { num: 4, sigla: 'ABR' },
    { num: 5, sigla: 'MAI' }, { num: 6, sigla: 'JUN' }, { num: 7, sigla: 'JUL' }, { num: 8, sigla: 'AGO' },
    { num: 9, sigla: 'SET' }, { num: 10, sigla: 'OUT' }, { num: 11, sigla: 'NOV' }, { num: 12, sigla: 'DEZ' }
  ];

  getHoras(mes: number): number {
    if (this.draftHoras[mes] != null) return this.draftHoras[mes];
    const found = this.horasMes.find((h: any) => Number(h.mes) === mes);
    return found ? Number(found.horas) : 160;
  }

  setDraftHoras(mes: number, horas: number) {
    this.draftHoras[mes] = Number(horas || 0);
  }

  salvarTodos() {
    const payload = this.meses.map((m) => ({ mes: m.num, horas: this.getHoras(m.num) }));
    this.saveAll.emit(payload);
  }
}
