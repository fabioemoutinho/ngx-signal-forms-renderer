import { Binding, DirectiveWithBindings, Type } from '@angular/core';
import { FieldTree } from '@angular/forms/signals';

/**
 * Shared options for component resolution on any layout node.
 */
export interface LayoutNodeOptions {
  /** Direct component type. Takes precedence over `type`. */
  component?: Type<unknown>;
  /** String type key, resolved via the type registry. */
  type?: string;
  /**
   * Reactive bindings for the resolved component (`inputBinding`/`outputBinding`/`twoWayBinding`).
   * Merged after the renderer's own bindings (field/state/children); don't re-bind those reserved
   * inputs. Use a reactive accessor inside a binding for values that change over time — swapping
   * the array recreates the component.
   */
  bindings?: Binding[];
  /**
   * Host directives to attach to the resolved component. Merged after the renderer's own
   * (the `FormField` directive auto-attached to `FormValueControl`/`FormCheckboxControl` controls).
   */
  directives?: (Type<unknown> | DirectiveWithBindings<unknown>)[];
}

/**
 * A control node that renders a form control component.
 *
 * The component should implement `FormValueControl<T>` (or `FormCheckboxControl` for a
 * boolean `checked` model) from `@angular/forms/signals` — its value/errors/touched/disabled
 * are then bound automatically via `[formField]` — or otherwise receive the `field` input and
 * wire `[formField]` itself. Either kind also receives `field`/`state` if it declares them.
 */
export interface ControlNode<TValue = unknown> extends LayoutNodeOptions {
  readonly kind: 'control';
  readonly field: FieldTree<TValue>;
}

/**
 * A group node — keyed collection of child nodes. Wrapper components receive
 * `children: Record<string, LayoutNode>` and can place children by key in specific
 * template locations, or iterate all values.
 *
 * `field` is set when the group is data-driven (`group(f.address, ...)`), so its
 * visibility can defer to that field's native `hidden()`. Explicit-children groups
 * (`group({ ... })`) have no field.
 */
export interface GroupNode extends LayoutNodeOptions {
  readonly kind: 'group';
  readonly children: Record<string, LayoutNode>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  readonly field?: FieldTree<any>;
}

/**
 * An array node — either a static ordered list or data-driven from a FieldTree<T[]>.
 *
 * Three modes:
 * - Static:           children: LayoutNode[]                  (renderer receives children)
 * - Renderer-owned:   field: FieldTree<T[]>                   (renderer receives field)
 * - Library-iterated: field: FieldTree<T[]> + itemLayout fn   (sfr-node iterates reactively)
 */
export interface ArrayNode extends LayoutNodeOptions {
  readonly kind: 'array';
  readonly children?: LayoutNode[];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  readonly field?: FieldTree<any[]>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  readonly itemLayout?: (item: FieldTree<any>) => LayoutNode;
  /** Library-iterated arrays: rendered (as the only child) while the array has no items. */
  readonly empty?: LayoutNode;
}

/**
 * A content node: a component that isn't bound to a field — a heading, help text, an alert,
 * form-level errors, a derived value. It receives only its own `bindings`; the renderer binds no
 * inputs of its own. Renders nothing when no component is resolved.
 */
export interface ContentNode extends LayoutNodeOptions {
  readonly kind: 'content';
}

/**
 * Builds the nodes of a `when`/`switchCase` branch. Called only while the branch is active, and
 * again each time it becomes active.
 */
export type LayoutBranch = () => LayoutNode | LayoutNode[];

/**
 * Conditional layout (`when()`): renders `nodes` while `condition` is true, else `else`.
 * Renders no element of its own. The active branch is built only when the condition flips, so
 * its components are kept while the condition's inputs change without flipping it.
 */
export interface WhenNode {
  readonly kind: 'when';
  readonly condition: () => boolean;
  readonly nodes: LayoutBranch;
  readonly else?: LayoutBranch;
}

/**
 * Multi-branch layout (`switchCase()`): renders the case whose name equals `String(key())`,
 * else `default`. Renders no element of its own. The active case is built only when the
 * matched case changes.
 */
export interface SwitchCaseNode {
  readonly kind: 'switchCase';
  readonly key: () => unknown;
  readonly cases: Readonly<Record<string, LayoutBranch>>;
  readonly default?: LayoutBranch;
}

/** Union of all layout node types. */
export type LayoutNode =
  | ControlNode
  | GroupNode
  | ArrayNode
  | ContentNode
  | WhenNode
  | SwitchCaseNode;
