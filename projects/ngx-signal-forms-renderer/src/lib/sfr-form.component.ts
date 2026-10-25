import { Component, computed, ElementRef, inject, input, Signal } from '@angular/core';
import { SfrNodeComponent } from './sfr-node.component';
import { LayoutNode } from './layout-types';
import { LAYOUT_RERUN_ADVICE, warnOnce } from './dev-warnings';

/**
 * Top-level form renderer component. Renders a layout produced by `layout()`, which already
 * holds the form's fields.
 *
 * @example
 * <sfr-form [layout]="userLayout" />
 */
@Component({
  selector: 'sfr-form',
  imports: [SfrNodeComponent],
  template: `
    @for (node of nodes(); track node) {
      <sfr-node [node]="node" />
    }
  `,
})
export class SfrFormComponent {
  /** The layout signal produced by the `layout()` builder. */
  readonly layout = input.required<Signal<LayoutNode[]>>();

  readonly #host = inject<ElementRef<HTMLElement>>(ElementRef);
  #previous?: { layout: Signal<LayoutNode[]>; nodes: LayoutNode[] };

  /**
   * The layout's nodes. A layout function only re-runs when it reads a signal, and a re-run
   * builds new node objects, so every component it renders is recreated — warned about in dev
   * mode. Swapping `[layout]` for a different signal is not a re-run.
   */
  protected readonly nodes = computed(() => {
    const layout = this.layout();
    const nodes = layout();
    if (this.#previous?.layout === layout && this.#previous.nodes !== nodes) {
      warnOnce(
        layout,
        'The layout function re-ran (it reads a signal), so every component it renders was ' +
          `recreated (inputs lose focus and local state). ${LAYOUT_RERUN_ADVICE}\nForm:`,
        this.#host.nativeElement,
      );
    }
    this.#previous = { layout, nodes };
    return nodes;
  });
}
