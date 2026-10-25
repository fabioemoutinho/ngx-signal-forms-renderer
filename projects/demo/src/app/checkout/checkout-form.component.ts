import { Component, computed, signal } from '@angular/core';
import { form } from '@angular/forms/signals';
import { MatButton } from '@angular/material/button';
import { SfrFormComponent, layout } from 'ngx-signal-forms-renderer';
import { CheckoutModel, emptyOrder, sampleOrder } from './checkout.model';
import { checkoutFormSchema } from './checkout.form-schema';
import { buildCheckoutLayout } from './schema-adapter';
import { productOf } from './catalog';

/**
 * The checkout form — what a real app would write: a signal form, a layout built from the schema,
 * and the actions to mutate the items array. Self-contained; the demo shell embeds it.
 */
@Component({
  selector: 'app-checkout-form',
  imports: [SfrFormComponent, MatButton],
  template: `
    <div class="toolbar">
      <button matButton="outlined" (click)="loadSample()" [disabled]="loading()">
        {{ loading() ? 'Loading…' : 'Load sample order' }}
      </button>
      <button matButton (click)="reset()">Reset</button>
    </div>

    <sfr-form [layout]="checkoutLayout" />

    <div class="summary">
      <span class="total">Total: \${{ total() }}</span>
      <span class="status" [class.invalid]="checkout().invalid()">
        {{ checkout().invalid() ? 'Has errors' : 'Valid' }}
      </span>
    </div>
  `,
  styles: `
    :host { display: block; }
    .toolbar { display: flex; gap: 8px; margin: 0 0 16px; flex-wrap: wrap; }
    .summary { display: flex; align-items: center; justify-content: space-between; margin-top: 8px; padding-top: 12px; border-top: 1px solid #eee; }
    .total { font-weight: 600; font-size: 16px; }
    .status { font-size: 13px; color: #2e7d32; }
    .status.invalid { color: #d32f2f; }
  `,
})
export class CheckoutFormComponent {
  private readonly model = signal<CheckoutModel>(emptyOrder());

  readonly checkout = form(this.model, checkoutFormSchema);

  /** Current form value — exposed so the demo shell can show it in its Value pane. */
  readonly value = computed(() => this.checkout().value());

  protected readonly loading = signal(false);

  protected readonly checkoutLayout = layout(this.checkout, (f) =>
    buildCheckoutLayout(f, {
      moveItem: (from, to) => this.moveItem(from, to),
      addItem: () => this.addItem(),
      removeItem: (index) => this.removeItem(index),
    }),
  );

  protected readonly total = computed(() =>
    this.checkout()
      .value()
      .items.reduce((sum, it) => sum + (productOf(it.sku)?.price ?? 0) * (it.quantity || 0), 0)
      .toFixed(2),
  );

  protected addItem(): void {
    this.model.update((m) => ({ ...m, items: [...m.items, { sku: 'SKU-1', quantity: 1 }] }));
  }

  protected removeItem(index: number): void {
    this.model.update((m) => ({ ...m, items: m.items.filter((_, i) => i !== index) }));
  }

  protected moveItem(from: number, to: number): void {
    this.model.update((m) => {
      const items = [...m.items];
      [items[from], items[to]] = [items[to], items[from]];
      return { ...m, items };
    });
  }

  protected reset(): void {
    this.model.set(emptyOrder());
  }

  /** Simulated async load of an existing order — proves create vs edit + hydration. */
  protected loadSample(): void {
    this.loading.set(true);
    setTimeout(() => {
      this.model.set(sampleOrder());
      this.loading.set(false);
    }, 600);
  }
}
