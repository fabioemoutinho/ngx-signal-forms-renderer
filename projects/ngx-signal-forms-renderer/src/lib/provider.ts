import { inject, InjectionToken, Provider, Type } from '@angular/core';
import { warnOnce } from './dev-warnings';

/**
 * Registry mapping string type keys to component types.
 * A single unified registry for fields, groups, and arrays.
 */
export type SignalFormsRendererTypeRegistry = Record<string, Type<unknown>>;

/**
 * The types each `provideSignalFormsRenderer()` call contributes to its injector, in provider order.
 * @internal
 */
const SIGNAL_FORMS_RENDERER_TYPES = new InjectionToken<SignalFormsRendererTypeRegistry[]>(
  'SIGNAL_FORMS_RENDERER_TYPES',
);

/**
 * The registry the renderer resolves `type` keys from: this injector's contributions merged over
 * the parent injector's registry. Empty when nothing is provided.
 * @internal
 */
export const SIGNAL_FORMS_RENDERER_TYPE_REGISTRY = new InjectionToken<SignalFormsRendererTypeRegistry>(
  'SIGNAL_FORMS_RENDERER_TYPE_REGISTRY',
  { factory: () => ({}) },
);

/**
 * Configuration for provideSignalFormsRenderer().
 */
export interface SignalFormsRendererConfig {
  /**
   * Map of string type keys to component types.
   * Used for fields, groups, and arrays alike.
   *
   * @example
   * {
   *   text: TextInputComponent,
   *   select: SelectComponent,
   *   card: CardGroupComponent,
   *   repeatable: RepeatableSectionComponent,
   * }
   */
  types?: SignalFormsRendererTypeRegistry;
}

/**
 * Registers component types for the renderer to resolve `type` keys with.
 *
 * Registrations merge: several calls in the same injector add up, and an injector's registry
 * extends its parent's — a route or component can add or override types without repeating the
 * app's. Where both define a key, the child's wins. Registering a key twice in the same injector
 * logs a dev-mode warning; the last registration wins.
 *
 * Works in `ApplicationConfig.providers`, route `providers`, and component `providers`.
 *
 * @example
 * // app.config.ts
 * export const appConfig: ApplicationConfig = {
 *   providers: [
 *     provideSignalFormsRenderer({
 *       types: {
 *         text: TextInputComponent,
 *         select: SelectComponent,
 *         card: CardGroupComponent,
 *       }
 *     })
 *   ]
 * };
 *
 * // A component that adds (or overrides) types for the forms it renders
 * @Component({ providers: [provideSignalFormsRenderer({ types: { card: CompactCard } })] })
 */
export function provideSignalFormsRenderer(config: SignalFormsRendererConfig = {}): Provider[] {
  return [
    { provide: SIGNAL_FORMS_RENDERER_TYPES, multi: true, useValue: config.types ?? {} },
    { provide: SIGNAL_FORMS_RENDERER_TYPE_REGISTRY, useFactory: mergeRegistry },
  ];
}

function mergeRegistry(): SignalFormsRendererTypeRegistry {
  const parent = inject(SIGNAL_FORMS_RENDERER_TYPE_REGISTRY, { skipSelf: true, optional: true });
  const contributions = inject(SIGNAL_FORMS_RENDERER_TYPES, { self: true });
  const own: SignalFormsRendererTypeRegistry = {};
  const duplicates = new Set<string>();
  for (const types of contributions) {
    for (const [key, component] of Object.entries(types)) {
      if (Object.hasOwn(own, key) && own[key] !== component) duplicates.add(key);
      own[key] = component;
    }
  }
  if (duplicates.size) {
    warnOnce(
      contributions,
      `Types registered more than once in the same injector: ${[...duplicates].join(', ')}. The ` +
        'last registration wins. Register each type once, or override it in a child injector ' +
        '(route or component providers).',
    );
  }
  return { ...parent, ...own };
}
