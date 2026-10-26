// Plain-data form schema — no Angular here. It's just data (could come from a server).
// `schema-adapter.ts` turns it into a renderer layout.

export interface FieldConfig {
  kind: 'field';
  name: string;
  type: 'text' | 'select' | 'textarea' | 'checkbox' | 'rating';
  label?: string;
  placeholder?: string;
  inputType?: string;
  options?: string[];
}

export interface SectionConfig {
  kind: 'section';
  title: string;
  fields: FieldConfig[];
  /**
   * If this section maps to a nested object in the model, its key (e.g. 'shipping'). The section
   * is then bound to that sub-object field — its `fields` resolve under it, and it defers to the
   * field's native hidden(). Omit for sections that group top-level fields.
   */
  field?: string;
  /**
   * Show the section only while this field is visible, e.g. 'company'. The condition itself lives
   * in the form schema (`hidden()`), so it's written once and also controls validation.
   */
  whenVisible?: string;
}

export interface ArrayConfig {
  kind: 'array';
  name: string;
  reorderable?: boolean;
}

export type NodeConfig = SectionConfig | FieldConfig | ArrayConfig;
export type FormSchema = NodeConfig[];

export const checkoutSchema: FormSchema = [
  {
    kind: 'section',
    title: 'Customer',
    fields: [
      { kind: 'field', name: 'customerName', type: 'text', label: 'Full name' },
      { kind: 'field', name: 'email', type: 'text', label: 'Email', inputType: 'email' },
    ],
  },
  {
    kind: 'section',
    title: 'Shipping address',
    field: 'shipping',
    fields: [
      { kind: 'field', name: 'street', type: 'text', label: 'Street' },
      { kind: 'field', name: 'city', type: 'text', label: 'City' },
      { kind: 'field', name: 'zip', type: 'text', label: 'ZIP' },
    ],
  },
  {
    kind: 'field',
    name: 'billingSameAsShipping',
    type: 'checkbox',
    label: 'Billing address same as shipping',
  },
  {
    kind: 'section',
    title: 'Billing address',
    field: 'billing',
    fields: [
      { kind: 'field', name: 'street', type: 'text', label: 'Street' },
      { kind: 'field', name: 'city', type: 'text', label: 'City' },
      { kind: 'field', name: 'zip', type: 'text', label: 'ZIP' },
    ],
  },
  { kind: 'array', name: 'items', reorderable: true },
  {
    kind: 'section',
    title: 'Plan',
    fields: [
      { kind: 'field', name: 'plan', type: 'select', label: 'Plan', options: ['Free', 'Pro'] },
    ],
  },
  {
    kind: 'section',
    title: 'Business details',
    whenVisible: 'company',
    fields: [{ kind: 'field', name: 'company', type: 'text', label: 'Company name' }],
  },
  {
    kind: 'section',
    title: 'Feedback',
    fields: [{ kind: 'field', name: 'rating', type: 'rating', label: 'How was your experience?' }],
  },
];
