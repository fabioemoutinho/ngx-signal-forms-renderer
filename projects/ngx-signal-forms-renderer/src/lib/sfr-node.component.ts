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
import { LayoutBranch, LayoutNode, NodeDirective, SwitchCaseNode, WhenNode } from './layout-types';
import { SIGNAL_FORMS_RENDERER_REGISTRY } from './provider';
import { SfrComponentOutletDirective } from './sfr-component-outlet.directive';
import { resolveStaticInputs } from './static-inputs';
import { LAYOUT_RERUN_ADVICE, warnOnce, warnOncePer } from './dev-warnings';

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

  private readonly registry = inject(SIGNAL_FORMS_RENDERER_REGISTRY);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);

  protected readonly isHidden = computed(() => {
    const node = this.node();
    if (isConditional(node) || node.kind === 'content') return false;
    // Defer to the related field's native hidden() (signal forms schema rule): always present
    // for controls, optional for groups/arrays that map to a field.
    return node.field?.().hidden() ?? false;
  });

  /** Resolved component: the node's class, or its key looked up in the registry; null for fallback rendering. */
  protected readonly resolvedComponent = computed((): Type<unknown> | null => {
    const node = this.node();
    if (isConditional(node)) return null;
    const { component } = node;
    if (typeof component !== 'string') return component ?? null;
    // Own keys only: a key like 'toString' must not resolve to an Object.prototype member.
    return (Object.hasOwn(this.registry, component) ? this.registry[component] : null) ?? null;
  });

  /**
   * Public inputs of the resolved component (with each input's public name by property name, for
   * static `inputs`) and whether it is a form control `FormField` can bind to: a
   * `FormValueControl<T>` (`value` input + `valueChange` output) or a `FormCheckboxControl`
   * (`checked` input + `checkedChange` output) — the two-way model contracts. Read via
   * `reflectComponentType` because there's no runtime marker for the interfaces. Null when no
   * component is resolved.
   */
  private readonly componentIo = computed(() => {
    const comp = this.resolvedComponent();
    const mirror = comp && reflectComponentType(comp);
    if (!mirror) return null;
    const inputs = new Set(mirror.inputs.map((i) => i.templateName));
    const publicNames = new Map(mirror.inputs.map((i) => [i.propName, i.templateName]));
    const outputs = new Set(mirror.outputs.map((o) => o.templateName));
    const hasModel = (name: string) => inputs.has(name) && outputs.has(`${name}Change`);
    return { inputs, publicNames, isFormControl: hasModel('value') || hasModel('checked') };
  });

  /** Whether the `FormField` directive is attached: a control node whose component is a form control. */
  private readonly formFieldAttached = computed(
    () => this.node().kind === 'control' && !!this.componentIo()?.isFormControl,
  );

  /**
   * Host directives applied to the resolved component: the renderer's own (the `FormField`
   * directive auto-attached to `FormValueControl`/`FormCheckboxControl` controls so
   * value/errors/touched/disabled are wired from the field) followed by any consumer-provided
   * `node.directives`, each with its static `inputs` turned into bindings before its own.
   * Undefined when there are none.
   */
  protected readonly directives = computed(
    (): (Type<unknown> | DirectiveWithBindings<unknown>)[] | undefined => {
      const node = this.node();
      if (isConditional(node)) return undefined;
      const formField = this.formFieldAttached();
      const result: (Type<unknown> | DirectiveWithBindings<unknown>)[] = [];
      if (formField && node.kind === 'control') {
        const field = node.field;
        result.push({ type: FormField, bindings: [inputBinding('formField', () => field)] });
      }
      for (const directive of node.directives ?? []) result.push(this.directiveEntry(directive, formField));
      return result.length ? result : undefined;
    },
  );

  /** A consumer directive as Angular takes it: its static `inputs` become bindings, before its own. */
  private directiveEntry(
    directive: NodeDirective,
    formField: boolean,
  ): Type<unknown> | DirectiveWithBindings<unknown> {
    if (typeof directive === 'function') return directive;
    const { type, inputs, bindings = [] } = directive;
    const context = { formField: formField ? ('directive' as const) : undefined };
    const statics = this.staticInputs(type, inputs, context, true);
    return { type, bindings: [...statics, ...bindings] };
  }

  /**
   * Input bindings for the resolved component: the renderer's reserved bindings by node kind,
   * then the node's static `inputs`, then any consumer-provided `node.bindings` (additive — they
   * must not re-bind the reserved inputs; applied last, so they override a static input):
   * - control: `field` + `state` (value etc. of a FormValueControl/FormCheckboxControl come
   *   from the FormField directive, not bindings)
   * - group: `children` (the keyed record); data-driven groups also `field` + `state`
   * - array (static ordered nodes): `children` (the node's LayoutNode[])
   * - array (renderer-owned, no itemLayout): `field` + `state`
   * - array (library-iterated): `children` (the per-item LayoutNodes, or `[empty]` while there
   *   are no items) + `field` + `state`
   * - content: none — only the node's static `inputs` and `bindings`
   *
   * Each reserved input is bound only if the component declares it, so any component can opt
   * out of any of them without a "binding to unknown input" error.
   */
  protected readonly bindings = computed((): Binding[] => {
    const node = this.node();
    if (isConditional(node)) return [];
    const io = this.componentIo();
    const reserved: Binding[] = [];
    const reservedNames = new Set<string>();
    const bind = (name: string, value: () => unknown) => {
      if (io && !io.inputs.has(name)) return;
      reserved.push(inputBinding(name, value));
      reservedNames.add(name);
    };

    const bindField = <T,>(field: FieldTree<T> | undefined) => {
      if (!field) return;
      bind('field', () => field);
      bind('state', () => field());
    };

    switch (node.kind) {
      case 'control':
        bindField(node.field);
        break;
      case 'group': {
        const { children } = node;
        bind('children', () => children);
        bindField(node.field);
        break;
      }
      case 'array': {
        const { field, itemLayout, children } = node;
        if (field && itemLayout) bind('children', this.arrayItems);
        else if (!field) bind('children', () => children ?? []);
        bindField(field);
        break;
      }
    }
    const component = this.resolvedComponent();
    const statics =
      io && component
        ? this.staticInputs(
            component,
            node.inputs,
            {
              publicNames: io.publicNames,
              reserved: reservedNames,
              formField: this.formFieldAttached() ? 'control' : undefined,
            },
            false,
          )
        : [];
    return [...reserved, ...statics, ...(node.bindings ?? [])];
  });

  /**
   * Bindings for static `inputs` of a component or directive (`target`). Each value is read inside
   * its binding, so it updates in place rather than rebuilding the bindings (which would recreate
   * the component). Ignored inputs and signal values are warned about once per target class.
   */
  private staticInputs(
    target: Type<unknown>,
    inputs: Readonly<Record<string, unknown>> | undefined,
    options: Parameters<typeof resolveStaticInputs>[1],
    forDirective: boolean,
  ): Binding[] {
    if (!inputs) return [];
    const { bind, ignored, signals } = resolveStaticInputs(inputs, options);
    const devMode = typeof ngDevMode === 'undefined' || ngDevMode;
    if (devMode && ignored.length) {
      warnOncePer(target, `Static inputs ignored: ${ignored.join('; ')}.\nNode:`, this.host.nativeElement);
    }
    if (devMode && signals.length) {
      const first = bind.find((b) => b.key === signals[0])!.name;
      warnOncePer(
        target,
        `Signals passed as static input values: ${signals.map((k) => `'${k}'`).join(', ')}. The ` +
          `input receives the signal itself, which the ${forDirective ? 'directive' : 'component'} must ` +
          `read. To bind its value instead, use ${forDirective ? "the directive entry's bindings" : 'bindings'}: ` +
          `[inputBinding('${first}', signal)].\nNode:`,
        this.host.nativeElement,
      );
    }
    return bind.map(({ name, key }) => inputBinding(name, () => inputs[key]));
  }

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
    const { field, itemLayout, empty } = node;
    const itemNodes = Array.from(field, (itemField) => {
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
    // The same `empty` node each time, so it isn't recreated while the array stays empty.
    return itemNodes.length === 0 && empty ? [empty] : itemNodes;
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
          `logged.\n${this.node().kind}():`,
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
    if (isConditional(node)) return this.branchNodes();
    if (node.kind === 'group') return Object.values(node.children);
    if (node.kind === 'array') return node.itemLayout ? this.arrayItems() : (node.children ?? []);
    return [];
  });

  /**
   * Dev-mode warning when a node's component doesn't resolve: a control or content node renders
   * nothing, and a group or array renders its children without a wrapper — worth a warning when it
   * names an unregistered key, or carries inputs, bindings or directives no wrapper receives. Once
   * per message and registry, with the first such node's element.
   */
  readonly #warnUnresolved = effect(() => {
    const node = this.node();
    if (isConditional(node) || this.resolvedComponent()) return;
    const { kind, component } = node;
    const unused =
      (node.inputs !== undefined && resolveStaticInputs(node.inputs, {}).bind.length > 0) ||
      !!node.bindings?.length ||
      !!node.directives?.length;
    const register = "Register it in provideSignalFormsRenderer({ components }), or pass the class as 'component'.";
    let message: string | undefined;
    if (kind === 'control' || kind === 'content') {
      message =
        typeof component === 'string'
          ? `Component '${component}' is not registered, so this ${kind} node renders nothing. ${register}`
          : `A ${kind} node has no 'component', so it renders nothing. Pass one (a class or a ` +
            `registered key) in the ${kind}() call.`;
    } else if (typeof component === 'string') {
      message =
        `Component '${component}' is not registered, so this ${kind} node renders its children ` +
        `without a wrapper${unused ? ', and its inputs, bindings and directives are ignored' : ''}. ${register}`;
    } else if (unused) {
      message =
        `${kind === 'array' ? 'An' : 'A'} ${kind} node has inputs, bindings or directives but no ` +
        "'component' to receive them, so they are ignored. Pass a 'component', or remove them.";
    }
    // Per registry (one per injector that provides one): the registry is what the key missed.
    if (message) warnOncePer(this.registry, `${message}\nNode:`, this.host.nativeElement);
  });
}

/** `when`/`switchCase` nodes: they render their active branch, with no component, bindings or field. */
function isConditional(node: LayoutNode): node is WhenNode | SwitchCaseNode {
  return node.kind === 'when' || node.kind === 'switchCase';
}
