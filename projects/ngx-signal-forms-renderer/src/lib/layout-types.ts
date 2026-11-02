import { Binding, InputSignalWithTransform, Type } from '@angular/core';
import { FieldTree } from '@angular/forms/signals';

/**
 * The public signal inputs of component `C` (`input()`, `input.required()`, `model()`), keyed by
 * property name, each with the type it accepts (a transform's input type, e.g. `booleanAttribute`'s
 * `unknown`). All optional: required inputs aren't enforced.
 */
export type ComponentSignalInputs<C> = {
  // `| undefined` so `undefined` (skipped, keeping the input's default) type-checks under
  // `exactOptionalPropertyTypes` too.
  [K in keyof C as C[K] extends InputSignalWithTransform<any, any> ? K : never]?: C[K] extends InputSignalWithTransform<any, infer W> ? W | undefined : never;
};

/** A node's `component`: a key registered with `provideSignalFormsRenderer()`, or a class. */
export type ComponentOrKey = string | Type<unknown>;

/**
 * Static `inputs` for a node whose `component` is `K`: typed from a class's public signal inputs,
 * else any record (a registry key, `Type<unknown>`, a class with only decorator `@Input()`s). Keys
 * are property names; the renderer binds each under the input's public name (its alias, if any).
 * Required inputs aren't enforced.
 *
 * Not in the type: inputs the class exposes from its own `hostDirectives` (TypeScript can't see
 * decorator arguments); bind those with `bindings`. A union of classes
 * (`cond ? RatingInput : TextInput`) accepts the inputs of any of them; for an input only one has,
 * write two nodes (`cond ? control(…, { component: RatingInput, … }) : control(…)`).
 */
export type ComponentInputs<K> = K extends Type<infer C>
  ? unknown extends C
    ? Record<string, unknown>
    : [keyof ComponentSignalInputs<C>] extends [never]
      ? Record<string, unknown>
      : ComponentSignalInputs<C>
  : Record<string, unknown>;

/**
 * A directive to attach to the node's component: a class, Angular's `{ type, bindings }`, or the
 * same with fixed `inputs` for the directive (by public name). Its `bindings` are applied after its
 * `inputs`.
 */
export type NodeDirective =
  | Type<unknown>
  | {
      type: Type<unknown>;
      inputs?: Readonly<Record<string, unknown>>;
      bindings?: Binding[];
    };

/**
 * Shared options for component resolution on any layout node.
 */
export interface LayoutNodeOptions<K extends ComponentOrKey = ComponentOrKey> {
  /** The component to render: a key registered with `provideSignalFormsRenderer()`, or a class. */
  component?: K;
  /**
   * Fixed values for the component's inputs, typed when `component` is a class:
   * `{ label: 'Name' }` instead of `bindings: [inputBinding('label', () => 'Name')]`. With a
   * registry key they also reach inputs the component exposes from its own `hostDirectives` (with a
   * class those aren't typed: use `bindings`); a directive added through `directives` takes its
   * values on its own entry. `undefined` values are skipped, so the
   * component's default applies. A signal is passed as the value itself (the component reads it),
   * with a dev-mode warning. Inputs the renderer binds itself (`field`, `state`, `children`) and, on
   * a form control, the ones the `FormField` directive sets (`value`, `required`, `min`, `max`, …)
   * are dropped with a dev-mode warning: set those through the form's schema (e.g.
   * `max(p.rating, 5)`). A binding for the same input overrides the value.
   */
  inputs?: NoInfer<ComponentInputs<K>>;
  /**
   * Reactive bindings for the resolved component (`inputBinding`/`outputBinding`/`twoWayBinding`).
   * Merged after the renderer's own bindings (field/state/children) and the static `inputs`; don't
   * re-bind the reserved inputs. Use a reactive accessor inside a binding for values that change
   * over time — swapping the array recreates the component.
   */
  bindings?: Binding[];
  /**
   * Directives to attach to the resolved component, each with its own `inputs` and `bindings`.
   * Merged after the renderer's own (the `FormField` directive auto-attached to
   * `FormValueControl`/`FormCheckboxControl` controls).
   */
  directives?: NodeDirective[];
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
 * visibility can defer to that field's native `hidden()`, and a wrapper that declares
 * `field`/`state` inputs receives them. Explicit-children groups (`group({ ... })`) have no field.
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
 * form-level errors, a derived value. It receives only its own `inputs` and `bindings`; the
 * renderer binds no inputs of its own. Renders nothing when no component is resolved.
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
