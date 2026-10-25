import { computed, Signal } from '@angular/core';
import { FieldTree } from '@angular/forms/signals';
import { ArrayNode, ControlNode, GroupNode, LayoutNode, LayoutNodeOptions } from './layout-types';

// ── control() ──────────────────────────────────────────────────────────────

/**
 * Creates a ControlNode.
 *
 * @example
 * control(f.name)
 * control(f.name, { type: 'text', bindings: [inputBinding('label', () => 'Name')] })
 * control(f.name, { component: CustomInput })
 */
export function control<T>(field: FieldTree<T>, options?: LayoutNodeOptions): ControlNode<T> {
  return { kind: 'control', field, ...options };
}

// ── Shared options ────────────────────────────────────────────────────────

/** Options for group() and array() builders. */
export type ContainerOptions = LayoutNodeOptions;

// ── group() ────────────────────────────────────────────────────────────────

/**
 * Creates a GroupNode (keyed collection).
 *
 * Two forms:
 * - Explicit children: first arg is Record<string, LayoutNode>
 * - Data-driven: first arg is FieldTree<T>, last arg is a callback receiving subfields
 *
 * @example
 * // Explicit children
 * group({ name: control(f.name), email: control(f.email) })
 * group({ name: control(f.name) }, { component: CardComponent, bindings: [inputBinding('title', () => 'Info')] })
 *
 * // Data-driven sub-object field
 * group(f.address, (g) => ({ street: control(g.street, { type: 'text' }) }))
 * group(f.address, { component: AddressCard }, (g) => ({ street: control(g.street) }))
 */
export function group(children: Record<string, LayoutNode>, options?: ContainerOptions): GroupNode;
export function group<T>(field: FieldTree<T>, fn: (g: FieldTree<T>) => Record<string, LayoutNode>): GroupNode;
export function group<T>(field: FieldTree<T>, options: ContainerOptions, fn: (g: FieldTree<T>) => Record<string, LayoutNode>): GroupNode;
export function group<T>(
  fieldOrChildren: FieldTree<T> | Record<string, LayoutNode>,
  optionsOrFn?: ContainerOptions | ((g: FieldTree<T>) => Record<string, LayoutNode>),
  maybeFn?: (g: FieldTree<T>) => Record<string, LayoutNode>,
): GroupNode {
  if (typeof fieldOrChildren === 'function') {
    // Data-driven group: keep the field so visibility can defer to its native hidden().
    // GroupNode stores the field existentially, so the generic T is erased here.
    const field = fieldOrChildren as GroupNode['field'];
    if (typeof optionsOrFn === 'function') {
      return { kind: 'group', field, children: optionsOrFn(fieldOrChildren) };
    }
    return { kind: 'group', ...(optionsOrFn ?? {}), field, children: maybeFn!(fieldOrChildren) };
  }
  const options = typeof optionsOrFn === 'function' ? {} : (optionsOrFn ?? {});
  return { kind: 'group', ...options, children: fieldOrChildren };
}

// ── array() ────────────────────────────────────────────────────────────────

/**
 * Creates an ArrayNode.
 *
 * Four forms:
 * - Static ordered nodes: first arg is LayoutNode[]
 * - Renderer-owned field: first arg is FieldTree<T[]>, second is options (renderer gets the field)
 * - Library-iterated (no options): first arg is FieldTree<T[]>, second is per-item layout fn
 * - Library-iterated (with component): field, options, per-item layout fn
 *
 * @example
 * // Static ordered nodes
 * array([control(f.step1), control(f.step2)])
 *
 * // Renderer owns the field (handles iteration, add/remove, etc.)
 * array(f.items, { component: BudgetListComponent })
 *
 * // Library iterates — per-item fn, no wrapper component
 * array(f.items, (item) => group(item, (g) => ({ name: control(g.name, { type: 'text' }) })))
 *
 * // Library iterates — per-item fn + wrapper component that receives children
 * array(f.items, { component: SortableList, bindings: [outputBinding('moved', onMove)] }, (item) => group(item, ...))
 */
export function array(children: LayoutNode[], options?: ContainerOptions): ArrayNode;
export function array<T>(field: FieldTree<T[]>, options?: ContainerOptions): ArrayNode;
export function array<T>(field: FieldTree<T[]>, fn: (item: FieldTree<T>) => LayoutNode): ArrayNode;
export function array<T>(field: FieldTree<T[]>, options: ContainerOptions, fn: (item: FieldTree<T>) => LayoutNode): ArrayNode;
export function array<T>(
  fieldOrChildren: FieldTree<T[]> | LayoutNode[],
  optionsOrFn?: ContainerOptions | ((item: FieldTree<T>) => LayoutNode),
  maybeFn?: (item: FieldTree<T>) => LayoutNode,
): ArrayNode {
  if (Array.isArray(fieldOrChildren)) {
    const options = typeof optionsOrFn === 'function' ? {} : (optionsOrFn ?? {});
    return { kind: 'array', ...options, children: fieldOrChildren };
  }
  // ArrayNode stores itemLayout existentially (LayoutNode is a heterogeneous union, so the
  // item type cannot be tracked), so the generic T is erased to the declared storage type here.
  if (typeof optionsOrFn === 'function') {
    return { kind: 'array', field: fieldOrChildren, itemLayout: optionsOrFn as ArrayNode['itemLayout'] };
  }
  if (maybeFn) {
    return { kind: 'array', ...(optionsOrFn ?? {}), field: fieldOrChildren, itemLayout: maybeFn as ArrayNode['itemLayout'] };
  }
  return { kind: 'array', ...(optionsOrFn ?? {}), field: fieldOrChildren };
}

// ── layout() ───────────────────────────────────────────────────────────────

/**
 * Creates a reactive layout for a form. `fn` receives the form's FieldTree<T> for
 * type-safe path access (e.g. `f.name`, `f.items`).
 *
 * Returns a `computed` Signal<LayoutNode[]>. If `fn` reads a signal, it re-runs whenever that
 * signal changes and builds new nodes, so every component it renders is recreated (inputs lose
 * focus and local state); dev mode logs a warning the first time. That suits structure that
 * changes rarely, such as fields decided by loaded config or permissions. For conditions that
 * change while the user fills the form, `when()`/`switchCase()` or the schema's `hidden()`
 * re-render only what changes, and values can be read inside binding closures
 * (`inputBinding('label', () => …)`).
 *
 * @example
 * const myLayout = layout(userForm, (f) => [
 *   group({ name: control(f.name, { type: 'text' }) }),
 *   array(f.items, (item) => group(item, (g) => ({ name: control(g.name) }))),
 * ]);
 */
export type LayoutSignal = Signal<LayoutNode[]>;

export function layout<T>(
  formRef: FieldTree<T>,
  fn: (f: FieldTree<T>) => LayoutNode[],
): LayoutSignal {
  return computed(() => fn(formRef));
}
