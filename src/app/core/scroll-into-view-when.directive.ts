import { Directive, ElementRef, Input, OnChanges, SimpleChanges } from '@angular/core';

/**
 * Rola o elemento para a área visível quando o valor informado passa a ser "verdadeiro".
 * Uso: <div [scrollIntoViewWhen]="!!editingId"> ... formulário de edição ... </div>
 *
 * Dispara apenas na transição falso→verdadeiro (borda de subida), evitando rolagens repetidas.
 */
@Directive({
  selector: '[scrollIntoViewWhen]',
  standalone: true
})
export class ScrollIntoViewWhenDirective implements OnChanges {
  @Input('scrollIntoViewWhen') trigger: any;

  constructor(private el: ElementRef<HTMLElement>) {}

  ngOnChanges(changes: SimpleChanges): void {
    const c = changes['trigger'];
    if (!c) return;
    const agora = !!c.currentValue;
    const antes = !!c.previousValue;
    if (agora && !antes) {
      // aguarda o render do formulário antes de rolar
      setTimeout(() => {
        try {
          this.el.nativeElement.scrollIntoView({ behavior: 'smooth', block: 'start' });
        } catch {
          this.el.nativeElement.scrollIntoView();
        }
      }, 60);
    }
  }
}
