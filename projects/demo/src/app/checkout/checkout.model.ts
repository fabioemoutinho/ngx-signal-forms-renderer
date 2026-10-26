export interface Address {
  street: string;
  city: string;
  zip: string;
}

export interface LineItem {
  /** Catalog SKU chosen via the product picker. */
  sku: string;
  quantity: number;
}

export type Plan = 'Free' | 'Pro';

export interface CheckoutModel {
  customerName: string;
  email: string;
  shipping: Address;
  billingSameAsShipping: boolean;
  billing: Address;
  items: LineItem[];
  plan: Plan;
  /** Business-plan only: the form schema hides it unless plan === 'Pro'. */
  company: string;
  rating: number;
}

const emptyAddress = (): Address => ({ street: '', city: '', zip: '' });

/** A blank order — the "create" path. */
export function emptyOrder(): CheckoutModel {
  return {
    customerName: '',
    email: '',
    shipping: emptyAddress(),
    billingSameAsShipping: true,
    billing: emptyAddress(),
    items: [{ sku: 'SKU-1', quantity: 1 }],
    plan: 'Free',
    company: '',
    rating: 0,
  };
}

/** A populated order — the "edit/load existing" path (simulated fetch). */
export function sampleOrder(): CheckoutModel {
  return {
    customerName: 'Jane Doe',
    email: 'jane@acme.com',
    shipping: { street: '12 Market St', city: 'Lisbon', zip: '1100-001' },
    billingSameAsShipping: false,
    billing: { street: '500 Finance Ave', city: 'Porto', zip: '4000-002' },
    items: [
      { sku: 'SKU-2', quantity: 5 }, // intentionally over stock (3) -> shows the deviation flag on load
      { sku: 'SKU-4', quantity: 2 },
    ],
    plan: 'Pro',
    company: 'Acme Corp',
    rating: 4,
  };
}
