import { Directive, ElementRef, HostListener, NgZone, OnDestroy } from '@angular/core';

/**
 * Adiciona uma busca dentro de qualquer <select> que tenha mais de 5 opcoes.
 *
 * O <select> continua nativo (mostra o valor selecionado normalmente). Quando o
 * usuario tenta abrir o dropdown e ha mais de 5 opcoes, a abertura nativa e
 * interceptada e um painel flutuante com campo de busca + lista filtravel e
 * exibido. Ao escolher, o valor e sincronizado de volta no <select> via
 * selectedIndex + evento 'change' — entao [(ngModel)] e (change) seguem funcionando.
 *
 * Uso: basta importar este directive no componente. Ele se aplica a TODO <select>
 * automaticamente (selector de elemento), mas so ativa a busca quando ha > 5 opcoes.
 */
@Directive({
  selector: 'select',
  standalone: true
})
export class SearchableSelectDirective implements OnDestroy {
  private static readonly MIN_OPCOES = 5;

  private painel: HTMLDivElement | null = null;
  private input: HTMLInputElement | null = null;
  private lista: HTMLDivElement | null = null;
  private opcoes: { index: number; label: string; disabled: boolean; placeholder: boolean }[] = [];
  private filtradas: { index: number; label: string; disabled: boolean; placeholder: boolean }[] = [];
  private activeIdx = 0;

  private readonly select: HTMLSelectElement;

  constructor(el: ElementRef<HTMLSelectElement>, private zone: NgZone) {
    this.select = el.nativeElement;
  }

  ngOnDestroy(): void {
    this.fechar();
  }

  private get deveAtivar(): boolean {
    return !this.select.disabled && this.select.options.length > SearchableSelectDirective.MIN_OPCOES;
  }

  // Intercepta a abertura por mouse.
  @HostListener('mousedown', ['$event'])
  onMouseDown(ev: MouseEvent) {
    if (!this.deveAtivar) return;
    ev.preventDefault();
    this.select.focus();
    this.abrir();
  }

  // Intercepta a abertura por teclado (setas, Enter, espaco).
  @HostListener('keydown', ['$event'])
  onKeyDown(ev: KeyboardEvent) {
    if (!this.deveAtivar) return;
    const teclasAbertura = ['Enter', ' ', 'ArrowDown', 'ArrowUp'];
    if (teclasAbertura.includes(ev.key) || (ev.altKey && ev.key === 'ArrowDown')) {
      ev.preventDefault();
      this.abrir();
    }
  }

  // ── Painel ────────────────────────────────────────────────────────────────
  private abrir() {
    if (this.painel) { this.fechar(); return; }
    this.lerOpcoes();

    const painel = document.createElement('div');
    painel.className = 'ss-panel';

    const busca = document.createElement('input');
    busca.className = 'ss-search';
    busca.type = 'text';
    busca.placeholder = 'Buscar...';
    busca.autocomplete = 'off';
    busca.addEventListener('input', () => this.filtrar(busca.value));
    busca.addEventListener('keydown', (e) => this.onBuscaKeydown(e));
    painel.appendChild(busca);

    const lista = document.createElement('div');
    lista.className = 'ss-list';
    painel.appendChild(lista);

    document.body.appendChild(painel);
    this.painel = painel;
    this.input = busca;
    this.lista = lista;

    this.filtrar('');
    this.posicionar();

    // Listeners globais (fora da zona do Angular para nao disparar CD a toa).
    this.zone.runOutsideAngular(() => {
      setTimeout(() => {
        document.addEventListener('mousedown', this.onDocMouseDown, true);
        window.addEventListener('resize', this.onReposicionar, true);
        window.addEventListener('scroll', this.onReposicionar, true);
      });
    });

    busca.focus();
  }

  private fechar = () => {
    if (!this.painel) return;
    document.removeEventListener('mousedown', this.onDocMouseDown, true);
    window.removeEventListener('resize', this.onReposicionar, true);
    window.removeEventListener('scroll', this.onReposicionar, true);
    this.painel.remove();
    this.painel = null;
    this.input = null;
    this.lista = null;
  };

  private lerOpcoes() {
    this.opcoes = Array.from(this.select.options).map((o, index) => ({
      index,
      label: (o.textContent || '').trim(),
      disabled: o.disabled,
      placeholder: o.value === ''
    }));
    // Ordena alfabeticamente; mantem o placeholder (valor vazio, ex.: "Selecione...") no topo.
    this.opcoes.sort((a, b) => {
      if (a.placeholder !== b.placeholder) return a.placeholder ? -1 : 1;
      return a.label.localeCompare(b.label, 'pt-BR', { sensitivity: 'base' });
    });
  }

  private static normalizar(txt: string): string {
    return (txt || '').toLowerCase().normalize('NFD').replace(/\p{Diacritic}/gu, '');
  }

  private filtrar(termo: string) {
    const q = SearchableSelectDirective.normalizar(termo);
    this.filtradas = q
      ? this.opcoes.filter(o => SearchableSelectDirective.normalizar(o.label).includes(q))
      : this.opcoes.slice();
    // Posiciona o "ativo" no item selecionado, se visivel; senao no primeiro.
    const selIdx = this.filtradas.findIndex(o => o.index === this.select.selectedIndex);
    this.activeIdx = selIdx >= 0 ? selIdx : 0;
    this.renderLista();
  }

  private renderLista() {
    if (!this.lista) return;
    this.lista.innerHTML = '';
    if (!this.filtradas.length) {
      const vazio = document.createElement('div');
      vazio.className = 'ss-empty';
      vazio.textContent = 'Nenhum resultado';
      this.lista.appendChild(vazio);
      return;
    }
    this.filtradas.forEach((o, i) => {
      const item = document.createElement('div');
      item.className = 'ss-opt';
      if (o.index === this.select.selectedIndex) item.classList.add('sel');
      if (i === this.activeIdx) item.classList.add('active');
      if (o.disabled) item.classList.add('disabled');
      item.textContent = o.label || ' ';
      if (!o.disabled) {
        item.addEventListener('mousedown', (e) => {
          e.preventDefault();
          this.selecionar(o.index);
        });
        item.addEventListener('mousemove', () => {
          if (this.activeIdx !== i) { this.activeIdx = i; this.marcarAtivo(); }
        });
      }
      this.lista!.appendChild(item);
    });
    this.scrollAtivoParaView();
  }

  private marcarAtivo() {
    if (!this.lista) return;
    Array.from(this.lista.children).forEach((c, i) => {
      c.classList.toggle('active', i === this.activeIdx);
    });
    this.scrollAtivoParaView();
  }

  private scrollAtivoParaView() {
    const el = this.lista?.children[this.activeIdx] as HTMLElement | undefined;
    el?.scrollIntoView({ block: 'nearest' });
  }

  private onBuscaKeydown(e: KeyboardEvent) {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      this.moverAtivo(1);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      this.moverAtivo(-1);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const alvo = this.filtradas[this.activeIdx];
      if (alvo && !alvo.disabled) this.selecionar(alvo.index);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      this.fechar();
      this.select.focus();
    }
  }

  private moverAtivo(passo: number) {
    if (!this.filtradas.length) return;
    let i = this.activeIdx;
    for (let n = 0; n < this.filtradas.length; n++) {
      i = (i + passo + this.filtradas.length) % this.filtradas.length;
      if (!this.filtradas[i].disabled) break;
    }
    this.activeIdx = i;
    this.marcarAtivo();
  }

  private selecionar(index: number) {
    if (this.select.selectedIndex !== index) {
      this.select.selectedIndex = index;
      // Dispara dentro da zona do Angular para atualizar ngModel/(change).
      this.zone.run(() => {
        this.select.dispatchEvent(new Event('input', { bubbles: true }));
        this.select.dispatchEvent(new Event('change', { bubbles: true }));
      });
    }
    this.fechar();
    this.select.focus();
  }

  private onDocMouseDown = (e: MouseEvent) => {
    if (this.painel && !this.painel.contains(e.target as Node) && e.target !== this.select) {
      this.fechar();
    }
  };

  private onReposicionar = () => this.posicionar();

  private posicionar() {
    if (!this.painel) return;
    const r = this.select.getBoundingClientRect();
    const margem = 4;
    const altura = this.painel.offsetHeight || 280;
    const espacoAbaixo = window.innerHeight - r.bottom;
    const abrirAcima = espacoAbaixo < altura + margem && r.top > espacoAbaixo;

    this.painel.style.left = `${Math.round(r.left)}px`;
    this.painel.style.width = `${Math.round(r.width)}px`;
    if (abrirAcima) {
      this.painel.style.top = 'auto';
      this.painel.style.bottom = `${Math.round(window.innerHeight - r.top + margem)}px`;
    } else {
      this.painel.style.bottom = 'auto';
      this.painel.style.top = `${Math.round(r.bottom + margem)}px`;
    }
  }
}
