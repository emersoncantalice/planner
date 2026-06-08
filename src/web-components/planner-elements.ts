class PlannerCardElement extends HTMLElement {
  private _raf = 0;

  // Limita a altura do card ao espaço visível (do topo do card até o fim da
  // janela), com uma margem, e rola internamente quando o conteúdo excede.
  // Assim o card nunca termina por baixo da barra de tarefas / fora da tela.
  private _ajustarAltura = () => {
    const margem = 16;
    const top = this.getBoundingClientRect().top;
    const disponivel = window.innerHeight - top - margem;
    this.style.maxHeight = `${Math.max(220, Math.round(disponivel))}px`;
  };

  private _agendar = () => {
    if (this._raf) return;
    this._raf = requestAnimationFrame(() => {
      this._raf = 0;
      this._ajustarAltura();
    });
  };

  connectedCallback() {
    this.style.display = 'block';
    this.style.background = '#ffffff';
    this.style.border = '1px solid #cdd7ea';
    this.style.borderRadius = '12px';
    this.style.padding = '12px';
    this.style.boxSizing = 'border-box';
    this.style.overflowY = 'auto';
    this._agendar();
    window.addEventListener('resize', this._agendar, true);
    window.addEventListener('scroll', this._agendar, true);
  }

  disconnectedCallback() {
    if (this._raf) cancelAnimationFrame(this._raf);
    window.removeEventListener('resize', this._agendar, true);
    window.removeEventListener('scroll', this._agendar, true);
  }
}

class PlannerKpiElement extends HTMLElement {
  connectedCallback() {
    const label = this.getAttribute('label') ?? 'Indicador';
    const value = this.getAttribute('value') ?? '-';
    this.innerHTML = `<strong>${label}</strong><div>${value}</div>`;
    this.style.display = 'block';
    this.style.padding = '8px';
    this.style.borderRadius = '10px';
    this.style.background = '#eef4ff';
  }
}

const ce = (globalThis as { customElements?: CustomElementRegistry }).customElements;

if (ce && !ce.get('planner-card')) {
  ce.define('planner-card', PlannerCardElement);
}
if (ce && !ce.get('planner-kpi')) {
  ce.define('planner-kpi', PlannerKpiElement);
}
