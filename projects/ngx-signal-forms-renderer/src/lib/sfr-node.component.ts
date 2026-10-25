import {
  Binding,
  Component,
  computed,
  DirectiveWithBindings,
  effect,
  ElementRef,
  forwardRef,
  inject,
  input,
  inputBinding,
  reflectComponentType,
  Signal,
  Type,
} from '@angular/core';
import { FieldTree, FormField } from '@angular/forms/signals';
import { LayoutBranch, LayoutNode, SwitchCaseNode, WhenNode } from './layout-types';
import { SIGNAL_FORMS_RENDERER_TYPE_REGISTRY } from './provider';
import { SfrComponentOutletDirective } from './sfr-component-outlet.directive';
import { LAYOUT_RERUN_ADVICE, warnOnce } from './dev-warnings';

/**
 * Recursive layout node renderer. Receives a LayoutNode and renders the resolved
 * component via `*sfrComponentOutlet`, passing reactive signal bindings (and, for
 * control nodes, the `FormField` host directive). When no component is resolved it
 * falls back to rendering the node's children, each through a nested `sfr-node`.
 *
 * For control nodes whose component implements `FormValueControl<T>` or
 * `FormCheckboxControl`, the `FormField` directive is attached so value, errors, touched,
 * disabled, etc. are bound automatically from the field. Independently, any control that
 * declares `field` and/or `state` inputs receives them.
 */
@Component({
  selector: 'sfr-node',
  imports: [SfrComponentOutletDirective, forwardRef(() => SfrNodeComponent)],
  // The host renders no box (like ng-container), so a node never adds a wrapper element to a
  // parent's flex/grid layout. A hidden node renders nothing and thus takes no space at all.
  styles: ':host { display: contents; }',
  template: `
    @if (!isHidden()) {
      @if (resolvedComponent(); as comp) {
        <ng-container *sfrComponentOutlet="comp; directives: directives(); bindings: bindings()" />
      } @else {
        @for (child of children(); track child) {
          <sfr-node [node]="child" />
        }
      }
    }
  `,
})
export class SfrNodeComponent {
  readonly node = input.required<LayoutNode>();

  private readonly registry = inject(SIGNAL_FORMS_RENDERER_TYPE_REGISTRY);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);

  protected readonly isHidden = computed(() => {
    const node = this.node();
    if (isRegion(node)) return false;
    // A custom layout-level hidden signal always wins.
    if (node.hidden) return node.hidden();
    // Otherwise defer to the related field's native hidden() (signal forms schema rule):
    // always present for controls, optional for groups/arrays that map to a field.
    return node.field?.().hidden() ?? false;
  });

  /** Resolved component type (explicit `component`, else `type` via the registry), or null for fallback rendering. */
  protected readonly resolvedComponent = computed((): Type<unknown> | null => {
    const node = this.node();
    if (isRegion(node)) return null;
    return node.component ?? this.registry[node.type!] ?? null;
  });

  /**
   * Public inputs of the resolved component and whether it is a form control `FormField` can
   * bind to: a `FormValueControl<T>` (`value` input + `valueChange` output) or a
   * `FormCheckboxControl` (`checked` input + `checkedChange` output) — the two-way model
   * contracts. Read via `reflectComponentType` because there's no runtime marker for the
   * interfaces. Null when no component is resolved.
   */
  private readonly componentIo = computed(() => {
    const comp = this.resolvedComponent();
    const mirror = comp && reflectComponentType(comp);
    if (!mirror) return null;
    const inputs = new Set(mirror.inputs.map((i) => i.templateName));
    const outputs = new Set(mirror.outputs.map((o) => o.templateName));
    const hasModel = (name: string) => inputs.has(name) && outputs.has(`${name}Change`);
    return { inputs, isFormControl: hasModel('value') || hasModel('checked') };
  });

  /**
   * Host directives applied to the resolved component: the renderer's own (the `FormField`
   * directive auto-attached to `FormValueControl`/`FormCheckboxControl` controls so
   * value/errors/touched/disabled are wired from the field) followed by any consumer-provided
   * `node.directives`. Undefined when there are none.
   */
  protected readonly directives = computed(
    (): (Type<unknown> | DirectiveWithBindings<unknown>)[] | undefined => {
      const node = this.node();
      if (isRegion(node)) return undefined;
      const result: (Type<unknown> | DirectiveWithBindings<unknown>)[] = [];
      if (node.kind === 'control' && this.componentIo()?.isFormControl) {
        const field = node.field;
        result.push({ type: FormField, bindings: [inputBinding('formField', () => field)] });
      }
      if (node.directives) result.push(...node.directives);
      return result.length ? result : undefined;
    },
  );

  /**
   * Reactive input bindings for the resolved component: the renderer's reserved bindings by
   * node kind, followed by any consumer-provided `node.bindings` (additive — they must not
   * re-bind the reserved inputs):
   * - control: `field` + `state` (value etc. of a FormValueControl/FormCheckboxControl come
   *   from the FormField directive, not bindings)
   * - group: `children` (the keyed record)
   * - array (static ordered nodes): `children` (the node's LayoutNode[])
   * - array (renderer-owned, no itemLayout): `field`
   * - array (library-iterated): `children` (the per-item LayoutNodes)
   *
   * Each reserved input is bound only if the component declares it, so any component can opt
   * out of any of them without a "binding to unknown input" error.
   */
  protected readonly bindings = computed((): Binding[] => {
    const node = this.node();
    if (isRegion(node)) return [];
    const io = this.componentIo();
    const reserved: Binding[] = [];
    const bind = (name: string, value: () => unknown) => {
      if (!io || io.inputs.has(name)) reserved.push(inputBinding(name, value));
    };

    switch (node.kind) {
      case 'control': {
        const { field } = node;
        bind('field', () => field);
        bind('state', () => field());
        break;
      }
      case 'group': {
        const { children } = node;
        bind('children', () => children);
        break;
      }
      case 'array': {
        const { field, itemLayout, children } = node;
        if (field && itemLayout) bind('children', this.arrayItems);
        else if (field) bind('field', () => field);
        else bind('children', () => children ?? []);
        break;
      }
    }
    return [...reserved, ...(node.bindings ?? [])];
  });

  // Caches one computed per item field, keyed by the field's identity. Signal forms
  // preserves a field's identity across value changes (only structural changes — add,
  // remove, reorder — swap identities), so the same item always yields the same
  // LayoutNode reference. That lets `@for (track node)` reuse components when the user
  // types, instead of recreating them and losing focus. WeakMap, so dropped items are GC'd.
  // `last` remembers the item's previous node, to warn when its itemLayout re-runs.
  private readonly _items = new WeakMap<object, { layout: Signal<LayoutNode>; last?: LayoutNode }>();

  private readonly arrayItems = computed((): LayoutNode[] => {
    const node = this.node();
    if (node.kind !== 'array' || !node.field || !node.itemLayout) return [];
    const { field, itemLayout } = node;
    return Array.from(field, (itemField) => {
      const key = itemField as object;
      let item = this._items.get(key);
      if (!item) {
        item = { layout: computed(() => itemLayout(itemField as FieldTree<any>)) };
        this._items.set(key, item);
      }
      const itemNode = item.layout();
      if (item.last && item.last !== itemNode) {
        warnOnce(
          itemLayout,
          "An array's item layout function re-ran (it reads a signal), so that item's components " +
            `were recreated (inputs lose focus and local state). ${LAYOUT_RERUN_ADVICE}\nArray:`,
          this.host.nativeElement,
        );
      }
      item.last = itemNode;
      return itemNode;
    });
  });

  /**
   * The active branch of a `when`/`switchCase` node. Compared by identity, so `branchNodes`
   * re-runs only when a different branch becomes active, not whenever the condition or key is
   * re-evaluated.
   */
  private readonly activeBranch = computed((): LayoutBranch | undefined => {
    const node = this.node();
    if (node.kind === 'when') return node.condition() ? node.nodes : node.else;
    if (node.kind === 'switchCase') {
      const key = node.key();
      const name = key == null ? undefined : String(key);
      return name !== undefined && Object.hasOwn(node.cases, name) ? node.cases[name] : node.default;
    }
    return undefined;
  });

  // The branch last built and what it returned, to warn when a branch re-runs without a flip.
  #lastBranch?: { branch: LayoutBranch; built: LayoutNode | LayoutNode[] };

  /** The active branch's nodes, built when the branch becomes active. */
  private readonly branchNodes = computed((): LayoutNode[] => {
    const branch = this.activeBranch();
    if (!branch) {
      this.#lastBranch = undefined;
      return [];
    }
    const built = branch();
    if (this.#lastBranch?.branch === branch && this.#lastBranch.built !== built) {
      warnOnce(
        branch,
        `A ${this.node().kind}() branch re-ran (it reads a signal) while the same branch stayed ` +
          'active, so its components were recreated (inputs lose focus and local state). Read ' +
          'values inside binding closures (inputBinding(name, () => …)), or wrap an accidental ' +
          'read in untracked(() => …). Shown once per branch function; later re-runs are not ' +
          'logged.\nRegion:',
        this.host.nativeElement,
      );
    }
    this.#lastBranch = { branch, built };
    return Array.isArray(built) ? built : [built];
  });

  /**
   * Children to render when no wrapper component is resolved: a group's or array's children, or
   * a `when`/`switchCase` node's active branch.
   */
  protected readonly children = computed((): LayoutNode[] => {
    const node = this.node();
    if (isRegion(node)) return this.branchNodes();
    if (node.kind === 'group') return Object.values(node.children);
    if (node.kind === 'array') return node.itemLayout ? this.arrayItems() : (node.children ?? []);
    return [];
  });

  /** Dev-mode warning when a control node has no component resolved. */
  readonly #warnMissingControl = effect(() => {
    if (this.node().kind === 'control' && !this.resolvedComponent()) {
      if (typeof ngDevMode === 'undefined' || ngDevMode) {
        console.warn(
          `[ngx-signal-forms-renderer] No component resolved for control node.`,
          `Provide a 'component' or 'type' in the control() call, or register a type in provideSignalFormsRenderer().`,
        );
      }
    }
  });
}

/** `when`/`switchCase` nodes: renderless regions with no component, bindings or field. */
function isRegion(node: LayoutNode): node is WhenNode | SwitchCaseNode {
  return node.kind === 'when' || node.kind === 'switchCase';
}
