import { Component, EventEmitter, Input, Output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

@Component({
  selector: 'app-project-budget-panel',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './project-budget-panel.component.html',
  styleUrl: './project-budget-panel.component.scss'
})
export class ProjectBudgetPanelComponent {
  @Input() orcamentos: any[] = [];
  @Input() perfis: any[] = [];
  @Input() token = '';

  @Output() create = new EventEmitter<any>();
  @Output() update = new EventEmitter<{ id: string; payload: any }>();
  @Output() remove = new EventEmitter<string>();

  // ── view state ────────────────────────────────────────────────────────────
  searchTerm = '';
  selectedId = '';
  activeTab: 'atividades' | 'cronograma' | 'resumo' = 'atividades';

  // budget form
  formOpen = false;
  editingBudgetId = '';
  budgetForm = this.emptyBudgetForm();

  // activity form
  atividadeFormOpen = false;
  editingAtividadeId = '';
  atividadeForm = this.emptyAtividadeForm();

  readonly Number = Number;

  readonly ganttColors = [
    '#4f87f0', '#f59e0b', '#10b981', '#ef4444',
    '#8b5cf6', '#06b6d4', '#f97316', '#ec4899',
    '#84cc16', '#6366f1',
  ];

  // ── list helpers ──────────────────────────────────────────────────────────

  filtered(): any[] {
    const q = this.searchTerm.trim().toLowerCase();
    return this.orcamentos.filter(o =>
      !q || `${o.nome} ${o.descricao ?? ''}`.toLowerCase().includes(q)
    );
  }

  selectedOrcamento(): any | null {
    return this.orcamentos.find(o => o.id === this.selectedId) ?? null;
  }

  atividades(orc?: any): any[] {
    const o = orc ?? this.selectedOrcamento();
    return (o?.atividades ?? []) as any[];
  }

  atividadesOrdenadas(): any[] {
    return [...this.atividades()].sort((a, b) => {
      if (!a.dataInicio) return 1;
      if (!b.dataInicio) return -1;
      return a.dataInicio.localeCompare(b.dataInicio);
    });
  }

  // ── profile helpers ───────────────────────────────────────────────────────

  perfilNome(perfilId: string): string {
    const nome = this.perfis.find(p => p.id === perfilId)?.nomePerfil ?? '';
    return nome.split('|')[0].trim() || perfilId;
  }

  perfilValorHora(perfilId: string): number {
    const raw = this.perfis.find(p => p.id === perfilId)?.valorHora ?? 0;
    return raw > 1000 ? raw / 100 : raw;
  }

  currency(v: number): string {
    return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  }

  formatDate(d: string): string {
    if (!d) return '—';
    return new Date(d + 'T00:00:00').toLocaleDateString('pt-BR');
  }

  // ── summary ───────────────────────────────────────────────────────────────

  resumoPorPerfil(): Array<{ perfilId: string; nome: string; horas: number; valorHora: number; total: number }> {
    const map = new Map<string, { nome: string; horas: number; valorHora: number }>();
    for (const a of this.atividades()) {
      if (!map.has(a.perfilId)) {
        map.set(a.perfilId, { nome: this.perfilNome(a.perfilId), horas: 0, valorHora: this.perfilValorHora(a.perfilId) });
      }
      map.get(a.perfilId)!.horas += Number(a.horas || 0);
    }
    return Array.from(map.entries())
      .map(([perfilId, v]) => ({ perfilId, ...v, total: v.horas * v.valorHora }))
      .sort((a, b) => b.total - a.total);
  }

  totalGeral(): number {
    return this.resumoPorPerfil().reduce((s, r) => s + r.total, 0);
  }

  totalHoras(): number {
    return this.atividades().reduce((s, a) => s + Number(a.horas || 0), 0);
  }

  totalCustoBudget(orc: any): number {
    return (orc.atividades ?? []).reduce((s: number, a: any) =>
      s + Number(a.horas || 0) * this.perfilValorHora(a.perfilId), 0);
  }

  // ── gantt ─────────────────────────────────────────────────────────────────

  dayDiff(a: string, b: string): number {
    return Math.round((new Date(b + 'T00:00:00').getTime() - new Date(a + 'T00:00:00').getTime()) / 86400000);
  }

  ganttRange(): { minDate: string; maxDate: string; totalDays: number } | null {
    const ativs = this.atividades().filter(a => a.dataInicio && a.dataFim);
    if (!ativs.length) return null;
    const minDate = [...ativs].sort((a, b) => a.dataInicio.localeCompare(b.dataInicio))[0].dataInicio;
    const maxDate = [...ativs].sort((a, b) => b.dataFim.localeCompare(a.dataFim))[0].dataFim;
    return { minDate, maxDate, totalDays: this.dayDiff(minDate, maxDate) + 1 };
  }

  ganttBarStyle(a: any): Record<string, string> {
    const range = this.ganttRange();
    if (!range || !a.dataInicio || !a.dataFim) return { display: 'none' };
    const left = (this.dayDiff(range.minDate, a.dataInicio) / range.totalDays) * 100;
    const width = ((this.dayDiff(a.dataInicio, a.dataFim) + 1) / range.totalDays) * 100;
    return { left: `${left.toFixed(2)}%`, width: `${Math.max(0.8, width).toFixed(2)}%`, background: a.cor || '#4f87f0' };
  }

  ganttMonths(): Array<{ label: string; leftPct: number; widthPct: number }> {
    const range = this.ganttRange();
    if (!range) return [];
    const start = new Date(range.minDate + 'T00:00:00');
    const end   = new Date(range.maxDate + 'T00:00:00');
    const result: Array<{ label: string; leftPct: number; widthPct: number }> = [];
    let cur = new Date(start.getFullYear(), start.getMonth(), 1);
    while (cur <= end) {
      const next = new Date(cur.getFullYear(), cur.getMonth() + 1, 1);
      const mStart = new Date(Math.max(cur.getTime(), start.getTime()));
      const mEnd   = new Date(Math.min(next.getTime() - 86400000, end.getTime()));
      const leftDays  = Math.round((mStart.getTime() - start.getTime()) / 86400000);
      const widthDays = Math.round((mEnd.getTime() - mStart.getTime()) / 86400000) + 1;
      result.push({
        label: cur.toLocaleDateString('pt-BR', { month: 'short', year: '2-digit' }).replace('. de ', '/'),
        leftPct:  (leftDays  / range.totalDays) * 100,
        widthPct: (widthDays / range.totalDays) * 100,
      });
      cur = next;
    }
    return result;
  }

  // ── budget CRUD ───────────────────────────────────────────────────────────

  openCreate() {
    this.editingBudgetId = '';
    this.budgetForm = this.emptyBudgetForm();
    this.formOpen = true;
  }

  openEdit(orc: any) {
    this.editingBudgetId = orc.id;
    this.budgetForm = { nome: orc.nome ?? '', descricao: orc.descricao ?? '' };
    this.formOpen = true;
  }

  cancelForm() {
    this.formOpen = false;
    this.editingBudgetId = '';
    this.budgetForm = this.emptyBudgetForm();
  }

  submitBudget() {
    if (!this.budgetForm.nome.trim()) return;
    if (this.editingBudgetId) {
      const orc = this.orcamentos.find(o => o.id === this.editingBudgetId);
      this.update.emit({ id: this.editingBudgetId, payload: { ...orc, ...this.budgetForm } });
    } else {
      this.create.emit({ ...this.budgetForm, atividades: [] });
    }
    this.cancelForm();
  }

  excluirOrcamento(id: string) {
    this.remove.emit(id);
    if (this.selectedId === id) this.selectedId = '';
  }

  // ── activity CRUD ─────────────────────────────────────────────────────────

  openAtividadeCreate() {
    this.editingAtividadeId = '';
    this.atividadeForm = this.emptyAtividadeForm();
    this.atividadeFormOpen = true;
  }

  openAtividadeEdit(a: any) {
    this.editingAtividadeId = a.id;
    this.atividadeForm = { nome: a.nome ?? '', perfilId: a.perfilId ?? '', horas: a.horas ?? 0, dataInicio: a.dataInicio ?? '', dataFim: a.dataFim ?? '' };
    this.atividadeFormOpen = true;
  }

  cancelAtividadeForm() {
    this.atividadeFormOpen = false;
    this.editingAtividadeId = '';
    this.atividadeForm = this.emptyAtividadeForm();
  }

  submitAtividade() {
    if (!this.atividadeForm.nome.trim() || !this.atividadeForm.perfilId) return;
    const orc = this.selectedOrcamento();
    if (!orc) return;
    const atividades = [...(orc.atividades ?? [])];
    if (this.editingAtividadeId) {
      const idx = atividades.findIndex((a: any) => a.id === this.editingAtividadeId);
      if (idx >= 0) atividades[idx] = { ...atividades[idx], ...this.atividadeForm };
    } else {
      atividades.push({
        id: crypto.randomUUID(),
        ...this.atividadeForm,
        cor: this.ganttColors[atividades.length % this.ganttColors.length],
      });
    }
    this.update.emit({ id: orc.id, payload: { ...orc, atividades } });
    this.cancelAtividadeForm();
  }

  excluirAtividade(atividadeId: string) {
    const orc = this.selectedOrcamento();
    if (!orc) return;
    const atividades = (orc.atividades ?? []).filter((a: any) => a.id !== atividadeId);
    this.update.emit({ id: orc.id, payload: { ...orc, atividades } });
  }

  // ── PDF export ────────────────────────────────────────────────────────────

  exportandoPDF = false;

  async exportarPDF() {
    const orc = this.selectedOrcamento();
    if (!orc || this.exportandoPDF) return;
    this.exportandoPDF = true;
    try {
      const { jsPDF } = await import('jspdf');
      const { default: autoTable } = await import('jspdf-autotable');
      const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
      const W = doc.internal.pageSize.getWidth();
      const H = doc.internal.pageSize.getHeight();
      const now = new Date();

      // header
      doc.setFillColor(15, 52, 96);
      doc.rect(0, 0, W, 26, 'F');
      doc.setFillColor(29, 99, 218);
      doc.rect(0, 22, W, 4, 'F');
      doc.setTextColor(255, 255, 255);
      doc.setFontSize(16);
      doc.setFont('helvetica', 'bold');
      doc.text('Orçamento de Projeto', 14, 11);
      doc.setFontSize(10);
      doc.text(orc.nome, 14, 19);
      doc.setFontSize(7.5);
      doc.setFont('helvetica', 'normal');
      doc.text(`Gerado em ${now.toLocaleDateString('pt-BR')} às ${now.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`, W - 14, 11, { align: 'right' });
      if (orc.descricao) doc.text(orc.descricao, W - 14, 18, { align: 'right', maxWidth: 100 });

      // KPIs
      const resumo = this.resumoPorPerfil();
      const kpis: { label: string; value: string; color: [number, number, number] }[] = [
        { label: 'Atividades',      value: String(this.atividades().length),  color: [30, 64, 175] },
        { label: 'Total de Horas',  value: `${this.totalHoras()}h`,           color: [5, 122, 85] },
        { label: 'Perfis',          value: String(resumo.length),             color: [109, 40, 217] },
        { label: 'Custo Total',     value: this.currency(this.totalGeral()),  color: [161, 65, 0] },
      ];
      const kpiY = 30; const kpiW = (W - 28 - 9) / 4;
      kpis.forEach((k, i) => {
        const x = 14 + i * (kpiW + 3);
        doc.setFillColor(...k.color);
        doc.roundedRect(x, kpiY, kpiW, 15, 2, 2, 'F');
        doc.setTextColor(255, 255, 255);
        doc.setFontSize(i === 3 ? 9 : 13); doc.setFont('helvetica', 'bold');
        doc.text(k.value, x + kpiW / 2, kpiY + 7, { align: 'center' });
        doc.setFontSize(6.5); doc.setFont('helvetica', 'normal');
        doc.text(k.label, x + kpiW / 2, kpiY + 12.5, { align: 'center' });
      });

      // activities table
      autoTable(doc, {
        startY: kpiY + 19,
        head: [['Atividade', 'Perfil', 'Horas', 'Início', 'Fim', 'Duração (d)', 'Custo']],
        body: this.atividadesOrdenadas().map(a => {
          const dur = a.dataInicio && a.dataFim ? String(this.dayDiff(a.dataInicio, a.dataFim) + 1) : '—';
          return [a.nome, this.perfilNome(a.perfilId), `${a.horas}h`, this.formatDate(a.dataInicio), this.formatDate(a.dataFim), dur, this.currency(Number(a.horas) * this.perfilValorHora(a.perfilId))];
        }),
        theme: 'striped',
        headStyles: { fillColor: [15, 52, 96], textColor: [255, 255, 255], fontStyle: 'bold', fontSize: 8 },
        bodyStyles: { fontSize: 7.5, textColor: [30, 41, 59] },
        alternateRowStyles: { fillColor: [241, 245, 249] },
        columnStyles: { 0: { cellWidth: 'auto' }, 1: { cellWidth: 38 }, 2: { cellWidth: 14, halign: 'center' }, 3: { cellWidth: 20, halign: 'center' }, 4: { cellWidth: 20, halign: 'center' }, 5: { cellWidth: 18, halign: 'center' }, 6: { cellWidth: 26, halign: 'right', fontStyle: 'bold' } },
        margin: { left: 14, right: 14 },
      });

      // profile summary
      const y1 = (doc as any).lastAutoTable.finalY + 8;
      doc.setFontSize(9); doc.setFont('helvetica', 'bold');
      doc.setTextColor(15, 52, 96);
      doc.text('Resumo por Perfil', 14, y1);
      autoTable(doc, {
        startY: y1 + 4,
        head: [['Perfil', 'Horas', 'Valor/hora', 'Total']],
        body: resumo.map(r => [r.nome, `${r.horas}h`, this.currency(r.valorHora), this.currency(r.total)]),
        foot: [['Total Geral', `${this.totalHoras()}h`, '', this.currency(this.totalGeral())]],
        theme: 'grid',
        headStyles: { fillColor: [30, 64, 175], textColor: [255, 255, 255], fontStyle: 'bold', fontSize: 8 },
        bodyStyles: { fontSize: 7.5 },
        footStyles: { fillColor: [241, 245, 249], textColor: [15, 52, 96], fontStyle: 'bold', fontSize: 8 },
        columnStyles: { 1: { halign: 'center' }, 2: { halign: 'right' }, 3: { halign: 'right', fontStyle: 'bold' } },
        margin: { left: 14, right: 14 },
      });

      // gantt in PDF
      const range = this.ganttRange();
      const ativOrdenadas = this.atividadesOrdenadas().filter(a => a.dataInicio && a.dataFim);
      if (range && ativOrdenadas.length) {
        const ganttY0 = (doc as any).lastAutoTable.finalY + 10;
        if (ganttY0 < H - 50) {
          doc.setFontSize(9); doc.setFont('helvetica', 'bold'); doc.setTextColor(15, 52, 96);
          doc.text('Linha do Tempo', 14, ganttY0);
          const chartX = 14; const chartW = W - 28;
          const labelW = 48; const barAreaX = chartX + labelW; const barAreaW = chartW - labelW;
          const rowH = 7; const headerH = 7;
          let y = ganttY0 + 5;

          doc.setFillColor(15, 52, 96); doc.rect(chartX, y, chartW, headerH, 'F');
          for (const m of this.ganttMonths()) {
            const mx = barAreaX + (m.leftPct / 100) * barAreaW;
            const mw = (m.widthPct / 100) * barAreaW;
            if (m.leftPct > 0) { doc.setDrawColor(255, 255, 255); doc.setLineWidth(0.3); doc.line(mx, y, mx, y + headerH); }
            if (mw > 5) { doc.setTextColor(255, 255, 255); doc.setFontSize(6); doc.text(m.label, mx + mw / 2, y + 4.5, { align: 'center' }); }
          }
          y += headerH;

          ativOrdenadas.forEach((a, idx) => {
            doc.setFillColor(idx % 2 === 0 ? 248 : 241, idx % 2 === 0 ? 250 : 245, 255);
            doc.rect(chartX, y, chartW, rowH, 'F');
            doc.setTextColor(30, 41, 59); doc.setFontSize(6); doc.setFont('helvetica', 'normal');
            doc.text(a.nome.length > 16 ? a.nome.slice(0, 15) + '…' : a.nome, chartX + 2, y + rowH / 2 + 1);
            const bs = this.ganttBarStyle(a) as any;
            const bx = barAreaX + (parseFloat(bs.left) / 100) * barAreaW;
            const bw = Math.max((parseFloat(bs.width) / 100) * barAreaW, 1.5);
            const hex = (a.cor || '#4f87f0').replace('#', '');
            doc.setFillColor(parseInt(hex.slice(0, 2), 16), parseInt(hex.slice(2, 4), 16), parseInt(hex.slice(4, 6), 16));
            doc.roundedRect(bx, y + 1.5, bw, rowH - 3, 1, 1, 'F');
            if (bw > 10) { doc.setTextColor(255, 255, 255); doc.setFontSize(5); doc.text(`${a.horas}h`, bx + bw / 2, y + rowH / 2 + 1, { align: 'center' }); }
            y += rowH;
          });
          doc.setDrawColor(203, 213, 225); doc.line(chartX, y, chartX + chartW, y);
        }
      }

      // footer
      const total = (doc.internal as any).getNumberOfPages();
      for (let p = 1; p <= total; p++) {
        doc.setPage(p);
        doc.setFillColor(241, 245, 249); doc.rect(0, H - 7, W, 7, 'F');
        doc.setDrawColor(203, 213, 225); doc.line(0, H - 7, W, H - 7);
        doc.setTextColor(100, 116, 139); doc.setFontSize(6.5); doc.setFont('helvetica', 'normal');
        doc.text(`Orçamento: ${orc.nome}`, 14, H - 2.5);
        doc.text(`Página ${p} de ${total}`, W - 14, H - 2.5, { align: 'right' });
      }
      doc.save(`orcamento-${orc.nome.toLowerCase().replace(/\s+/g, '-')}-${now.toISOString().slice(0, 10)}.pdf`);
    } finally {
      this.exportandoPDF = false;
    }
  }

  // ── private ───────────────────────────────────────────────────────────────

  private emptyBudgetForm() { return { nome: '', descricao: '' }; }
  private emptyAtividadeForm() { return { nome: '', perfilId: '', horas: 0, dataInicio: '', dataFim: '' }; }
}
