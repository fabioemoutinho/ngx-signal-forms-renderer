import { Component, input, output } from '@angular/core';
import { SfrNodeComponent, LayoutNode } from 'ngx-signal-forms-renderer';
import { MatButton, MatIconButton } from '@angular/material/button';
import { MatIcon } from '@angular/material/icon';

/**
 * Wrapper for a library-iterated array: renders each item's LayoutNode and adds list-level
 * controls (reorder ↑/↓, per-item remove, and an "add" button after the list). It only emits
 * the actions; the layout decides what they do to the array (see the array-actions recipe).
 */
@Component({
  selector: 'app-sortable-list',
  imports: [SfrNodeComponent, MatButton, MatIconButton, MatIcon],
  template: `
    @for (node of children(); track node; let i = $index; let count = $count) {
      <div class="item-row">
        <div class="sort-controls">
          <button matIconButton (click)="move.emit({ from: i, to: i - 1 })" [disabled]="i === 0" aria-label="Move up">
            <mat-icon>arrow_upward</mat-icon>
          </button>
          <button matIconButton (click)="move.emit({ from: i, to: i + 1 })" [disabled]="i === count - 1" aria-label="Move down">
            <mat-icon>arrow_downward</mat-icon>
          </button>
        </div>
        <div class="item-body"><sfr-node [node]="node" /></div>
        <button matIconButton class="remove" (click)="remove.emit(i)" [disabled]="count === 1" aria-label="Remove item">
          <mat-icon>delete</mat-icon>
        </button>
      </div>
    }
    <button matButton="outlined" class="add" (click)="add.emit()">
      <mat-icon>add</mat-icon>
      Add item
    </button>
  `,
  styles: `
    :host { display: flex; flex-direction: column; gap: 12px; }
    .item-row { display: flex; align-items: flex-start; gap: 8px; }
    .sort-controls { display: flex; flex-direction: column; gap: 2px; padding-top: 8px; flex-shrink: 0; }
    .item-body { flex: 1; min-width: 0; }
    .remove { align-self: center; flex-shrink: 0; color: #d32f2f; }
    .add { align-self: flex-start; }
  `,

})
export class SortableListComponent {
  readonly children = input.required<LayoutNode[]>();
  readonly move = output<{ from: number; to: number }>();
  readonly add = output<void>();
  readonly remove = output<number>();
}
