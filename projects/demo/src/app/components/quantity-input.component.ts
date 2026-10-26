import { Component, computed, input } from '@angular/core';
import { FieldTree, FieldState, FormField } from '@angular/forms/signals';
import { MatFormField, MatLabel, MatHint } from '@angular/material/form-field';
import { MatInput } from '@angular/material/input';
import { STOCK } from '../checkout/checkout.form-schema';

/**
 * Plain control (receives `field` + `state`) for a line-item quantity.
 *
 * Reads the field's `STOCK` metadata (catalog stock, attached in the signal-forms schema and
 * derived from the sibling product) to show "N in stock", and the schema's `max` error to flag an
 * order over stock — the schema counts every row of the same product, so the control doesn't have
 * to. The layout never knows stock exists — this control reads it straight off the field.
 */
@Component({
  selector: 'app-quantity-input',
  imports: [MatFormField, MatLabel, MatHint, MatInput, FormField],
  template: `
    <mat-form-field appearance="outline">
      <mat-label>Qty</mat-label>
      <input matInput type="number" [formField]="field()" />
      <mat-hint [class.over]="maxError()">{{ stockHint() }}</mat-hint>
    </mat-form-field>
  `,
  styles: `
    .over {
      color: #d32f2f;
      font-weight: 500;
    }
  `,
})
export class QuantityInputComponent {
  readonly field = input.required<FieldTree<number>>();
  readonly state = input.required<FieldState<number>>();

  protected readonly stock = computed(() => this.state().metadata(STOCK)?.() ?? 0);
  /** The schema's over-stock error, if any. */
  protected readonly maxError = computed(() => this.state().errors().find((e) => e.kind === 'max'));
  protected readonly stockHint = computed(() => {
    const stock = this.stock();
    if (stock <= 0) return 'Out of stock';
    return this.maxError()?.message ?? `${stock} in stock`;
  });
}
