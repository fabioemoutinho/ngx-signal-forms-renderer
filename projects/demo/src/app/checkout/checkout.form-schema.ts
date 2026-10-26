import {
  applyEach,
  createMetadataKey,
  email,
  hidden,
  max,
  metadata,
  required,
  schema,
} from '@angular/forms/signals';
import { productOf } from './catalog';
import { CheckoutModel, LineItem } from './checkout.model';

/**
 * Field metadata key carrying the catalog stock for a line item's quantity field.
 * It's reference data that travels WITH the field but isn't part of the form value —
 * read by the QuantityInput control to show "N in stock".
 */
export const STOCK = createMetadataKey<number>();

/**
 * The Signal Forms schema — the model's validation, metadata and conditional visibility,
 * passed to `form(model, schema)`. This layer knows nothing about layout or rendering.
 */
export const checkoutFormSchema = schema<CheckoutModel>((f) => {
  required(f.customerName);
  required(f.email);
  email(f.email);

  // Billing address only applies when it differs from shipping.
  hidden(f.billing, { when: ({ valueOf }) => valueOf(f.billingSameAsShipping) });
  // Company is only collected on the business (Pro) plan.
  hidden(f.company, { when: ({ valueOf }) => valueOf(f.plan) !== 'Pro' });

  applyEach(f.items, (item) => {
    required(item.sku);
    // Stock of the chosen product, surfaced as field metadata (derived from the sibling sku).
    metadata(item.quantity, STOCK, ({ valueOf }) => productOf(valueOf(item.sku))?.stock ?? 0);
    // The order may not exceed the stock: rows of the same product share it, so each row may take
    // what the other rows leave.
    max(item.quantity, ({ valueOf }) => {
      const row = valueOf(item);
      return Math.max(0, stockOf(row) - otherRowsQuantity(valueOf(f.items), row));
    }, {
      message: ({ valueOf }) => {
        const row = valueOf(item);
        const others = otherRowsQuantity(valueOf(f.items), row);
        const stock = stockOf(row);
        return others ? `Only ${stock} in stock (${others} in other rows)` : `Only ${stock} in stock`;
      },
    });
  });
});

function stockOf(row: LineItem): number {
  return productOf(row.sku)?.stock ?? 0;
}

/** Quantity of the same product in the order's other rows (rows are compared by identity). */
function otherRowsQuantity(items: LineItem[], row: LineItem): number {
  return items
    .filter((other) => other !== row && other.sku === row.sku)
    .reduce((sum, other) => sum + (other.quantity || 0), 0);
}
