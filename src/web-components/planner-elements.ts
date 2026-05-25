class PlannerCardElement extends HTMLElement {
  connectedCallback() {
    this.style.display = 'block';
    this.style.background = '#ffffff';
    this.style.border = '1px solid #cdd7ea';
    this.style.borderRadius = '12px';
    this.style.padding = '12px';
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

if (!customElements.get('planner-card')) {
  customElements.define('planner-card', PlannerCardElement);
}
if (!customElements.get('planner-kpi')) {
  customElements.define('planner-kpi', PlannerKpiElement);
}
