import { inject, InjectionToken, Provider, Type } from '@angular/core';
import { warnOnce } from './dev-warnings';

/**
 * Registry mapping string keys to component classes.
 * A single unified registry for controls, wrappers (groups and arrays) and content.
 */
export type SignalFormsRendererComponentRegistry = Record<string, Type<unknown>>;

/**
 * The components each `provideSignalFormsRenderer()` call contributes to its injector, in provider
 * order.
 * @internal
 */
const SIGNAL_FORMS_RENDERER_COMPONENTS = new InjectionToken<SignalFormsRendererComponentRegistry[]>(
  'SIGNAL_FORMS_RENDERER_COMPONENTS',
);

/**
 * The registry the renderer resolves `component` keys from: this injector's contributions merged
 * over the parent injector's registry. Empty when nothing is provided.
 * @internal
 */
export const SIGNAL_FORMS_RENDERER_REGISTRY = new InjectionToken<SignalFormsRendererComponentRegistry>(
  'SIGNAL_FORMS_RENDERER_REGISTRY',
  { factory: () => ({}) },
);

/**
 * Configuration for provideSignalFormsRenderer().
 */
export interface SignalFormsRendererConfig {
  /**
   * Map of string keys to component classes, for `component: 'key'` on any node: controls,
   * groups, arrays and content alike.
   *
   * @example
   * {
   *   text: TextInputComponent,
   *   select: SelectComponent,
   *   card: CardGroupComponent,
   *   repeatable: RepeatableSectionComponent,
   * }
   */
  components?: SignalFormsRendererComponentRegistry;
}

/**
 * Registers components for the renderer to resolve `component` keys with.
 *
 * Registrations merge: several calls in the same injector add up, and an injector's registry
 * extends its parent's — a route or component can add or override components without repeating
 * the app's. Where both define a key, the child's wins. Registering a key twice in the same
 * injector logs a dev-mode warning; the last registration wins.
 *
 * Works in `ApplicationConfig.providers`, route `providers`, and component `providers`.
 *
 * @example
 * // app.config.ts
 * export const appConfig: ApplicationConfig = {
 *   providers: [
 *     provideSignalFormsRenderer({
 *       components: {
 *         text: TextInputComponent,
 *         select: SelectComponent,
 *         card: CardGroupComponent,
 *       }
 *     })
 *   ]
 * };
 *
 * // A component that adds (or overrides) components for the forms it renders
 * @Component({ providers: [provideSignalFormsRenderer({ components: { card: CompactCard } })] })
 */
export function provideSignalFormsRenderer(config: SignalFormsRendererConfig = {}): Provider[] {
  return [
    { provide: SIGNAL_FORMS_RENDERER_COMPONENTS, multi: true, useValue: config.components ?? {} },
    { provide: SIGNAL_FORMS_RENDERER_REGISTRY, useFactory: mergeRegistry },
  ];
}

function mergeRegistry(): SignalFormsRendererComponentRegistry {
  const parent = inject(SIGNAL_FORMS_RENDERER_REGISTRY, { skipSelf: true, optional: true });
  const contributions = inject(SIGNAL_FORMS_RENDERER_COMPONENTS, { self: true });
  const own: SignalFormsRendererComponentRegistry = {};
  const duplicates = new Set<string>();
  for (const components of contributions) {
    for (const [key, component] of Object.entries(components)) {
      if (Object.hasOwn(own, key) && own[key] !== component) duplicates.add(key);
      own[key] = component;
    }
  }
  if (duplicates.size) {
    warnOnce(
      contributions,
      `Components registered more than once in the same injector: ${[...duplicates].join(', ')}. ` +
        'The last registration wins. Register each component once, or override it in a child ' +
        'injector (route or component providers).',
    );
  }
  return { ...parent, ...own };
}
