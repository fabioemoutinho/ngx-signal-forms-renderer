import { Component, computed, input } from '@angular/core';
import { SfrNodeComponent } from './sfr-node.component';
import { LayoutNode } from './layout-types';

/**
 * Helper component for custom wrapper components (groups and arrays).
 * Accepts children as either a Record (from groups) or array (from arrays)
 * and renders each child using `<sfr-node>`.
 *
 * @example
 * // In a custom group component (receives Record):
 * <sfr-children [children]="children()" />
 *
 * // In a custom array component (receives array):
 * <sfr-children [children]="children()" />
 */
@Component({
  selector: 'sfr-children',
  imports: [SfrNodeComponent],
  // Renders no box of its own (like ng-container) — the consumer's own element is the container
  // that lays out the rendered children.
  styles: ':host { display: contents; }',
  template: `
    @for (child of childList(); track child) {
      <sfr-node [node]="child" />
    }
  `,
})
export class SfrChildrenComponent {
  readonly children = input.required<LayoutNode[] | Record<string, LayoutNode>>();

  /** Normalizes children to an array for iteration. */
  protected readonly childList = computed(() => {
    const c = this.children();
    return Array.isArray(c) ? c : Object.values(c);
  });
}
