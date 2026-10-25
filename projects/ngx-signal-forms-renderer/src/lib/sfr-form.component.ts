import { Component, input, Signal } from '@angular/core';
import { SfrNodeComponent } from './sfr-node.component';
import { LayoutNode } from './layout-types';

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
    @for (node of layout()(); track node) {
      <sfr-node [node]="node" />
    }
  `,
})
export class SfrFormComponent {
  /** The layout signal produced by the `layout()` builder. */
  readonly layout = input.required<Signal<LayoutNode[]>>();
}
