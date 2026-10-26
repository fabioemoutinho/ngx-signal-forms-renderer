import { inputBinding } from '@angular/core';
import { FieldTree } from '@angular/forms/signals';
import { control, group, array, when, LayoutNode } from 'ngx-signal-forms-renderer';
import { CardGroupComponent } from '../components/card-group.component';
import { SortableListComponent } from '../components/sortable-list.component';
import { ProductPickerComponent } from '../components/product-picker.component';
import { QuantityInputComponent } from '../components/quantity-input.component';
import { RatingInputComponent } from '../components/rating-input.component';
import { StackComponent } from '../components/stack.component';
import { CheckoutModel, LineItem } from './checkout.model';
import { checkoutSchema, NodeConfig, SectionConfig, FieldConfig } from './checkout.schema';

export interface AdapterCallbacks {
  moveItem: (from: number, to: number) => void;
  addItem: () => void;
  removeItem: (index: number) => void;
}

/** Turn the plain-data schema into a renderer layout for the given form. */
export function buildCheckoutLayout(
  f: FieldTree<CheckoutModel>,
  cb: AdapterCallbacks,
): LayoutNode[] {
  const sections = checkoutSchema.map((node) => buildNode(node, f, cb));
  // Wrap the sections in a StackComponent so the top-level spacing is owned by a layout component.
  return [array(sections, { component: StackComponent })];
}

function buildNode(node: NodeConfig, f: FieldTree<CheckoutModel>, cb: AdapterCallbacks): LayoutNode {
  switch (node.kind) {
    case 'field':
      return fieldControl(node, child(f, node.name));
    case 'array':
      return array(
        child(f, node.name) as FieldTree<LineItem[]>,
        {
          component: SortableListComponent,
          bindings: [
            inputBinding('onMove', () => cb.moveItem),
            inputBinding('onAdd', () => cb.addItem),
            inputBinding('onRemove', () => cb.removeItem),
          ],
        },
        lineItemLayout,
      );
    case 'section':
      return sectionGroup(node, f);
  }
}

function sectionGroup(node: SectionConfig, f: FieldTree<CheckoutModel>): LayoutNode {
  const titleBinding = inputBinding('title', () => node.title);
  if (node.field) {
    // Data-driven group bound to a sub-object field; native hidden() applies automatically.
    return group(
      child(f, node.field),
      { component: CardGroupComponent, bindings: [titleBinding] },
      (g) => fieldsRecord(node.fields, g),
    );
  }
  const section = () =>
    group(fieldsRecord(node.fields, f), { component: CardGroupComponent, bindings: [titleBinding] });
  // A section that follows a field's visibility renders through when(field): built when the field
  // becomes visible, removed when the schema hides it.
  return node.whenVisible ? when(child(f, node.whenVisible), section) : section();
}

function fieldsRecord(fields: FieldConfig[], node: FieldTree<unknown>): Record<string, LayoutNode> {
  const record: Record<string, LayoutNode> = {};
  for (const fc of fields) record[fc.name] = fieldControl(fc, child(node, fc.name));
  return record;
}

function fieldControl(fc: FieldConfig, field: FieldTree<unknown>): LayoutNode {
  const bindings = [];
  if (fc.label != null) bindings.push(inputBinding('label', () => fc.label));
  if (fc.placeholder != null) bindings.push(inputBinding('placeholder', () => fc.placeholder));
  if (fc.inputType != null) bindings.push(inputBinding('inputType', () => fc.inputType));
  if (fc.options != null) bindings.push(inputBinding('options', () => fc.options));
  const resolved = fc.type === 'rating' ? { component: RatingInputComponent } : { type: fc.type };
  return control(field, { ...resolved, bindings });
}

function lineItemLayout(item: FieldTree<LineItem>): LayoutNode {
  return group(
    item,
    { component: CardGroupComponent, bindings: [inputBinding('title', () => 'Item')] },
    (g) => ({
      sku: control(g.sku, { component: ProductPickerComponent }),
      quantity: control(g.quantity, { component: QuantityInputComponent }),
    }),
  );
}

/** Index a field tree node by string key (the schema is dynamic, so keys aren't statically known). */
function child(node: FieldTree<unknown>, key: string): FieldTree<unknown> {
  return (node as unknown as Record<string, FieldTree<unknown>>)[key];
}
