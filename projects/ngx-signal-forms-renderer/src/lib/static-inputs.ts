import { InputSignalWithTransform, isSignal, untracked } from '@angular/core';
import { FormCheckboxControl, FormValueControl } from '@angular/forms/signals';

/** Names of the members of `T` typed as signal inputs (`input()`, `model()`). */
type InputNames<T> = {
  [K in keyof T]-?: NonNullable<T[K]> extends InputSignalWithTransform<any, any> ? K : never;
}[keyof T];

/**
 * Inputs the `FormField` directive sets from the field's state: the signal inputs of Angular's
 * `FormValueControl`/`FormCheckboxControl` contracts (`value`/`checked` on the custom control
 * itself, the others on every directive of the node that declares them). Angular rejects template
 * bindings to any of them next to `[formField]`. It exports no runtime list, so `satisfies` fails
 * the build when those contracts change.
 */
const FORM_FIELD_INPUTS: ReadonlySet<string> = new Set(
  Object.keys({
    value: 0,
    checked: 0,
    errors: 0,
    dirty: 0,
    touched: 0,
    invalid: 0,
    pending: 0,
    disabled: 0,
    disabledReasons: 0,
    readonly: 0,
    hidden: 0,
    required: 0,
    min: 0,
    max: 0,
    minLength: 0,
    maxLength: 0,
    pattern: 0,
    name: 0,
  } satisfies Record<InputNames<FormValueControl<unknown>> | InputNames<FormCheckboxControl>, 0>),
);

/**
 * The custom control's model inputs. `FormField` sets the control's own (`value` or `checked`) and
 * Angular reserves both next to `[formField]`; it sets neither on other directives.
 */
const MODEL_INPUTS: ReadonlySet<string> = new Set(['value', 'checked']);

/** `FormField` inputs set from a schema rule of the same name (`disabled()`, `max()`, …). */
const RULE_INPUTS: ReadonlySet<string> = new Set([
  'disabled',
  'readonly',
  'hidden',
  'required',
  'min',
  'max',
  'minLength',
  'maxLength',
  'pattern',
]);

/** Why an input `FormField` reserves is dropped, and what to do instead. */
function formFieldReason(name: string): string {
  if (MODEL_INPUTS.has(name)) {
    return (
      "reserved for the FormField directive's model binding (the value comes from the form model; " +
      'an unrelated input needs another name)'
    );
  }
  const hint = RULE_INPUTS.has(name) ? `use the ${name}() rule in the form's schema` : 'Angular computes it from the field';
  return `set by the FormField directive from the field's state (${hint})`;
}

/** How a node's static `inputs` resolve: what to bind, and what to warn about. */
export interface ResolvedInputs {
  /** Inputs to bind: the public name, and the key to read the value from when Angular binds it. */
  readonly bind: readonly { readonly name: string; readonly key: string }[];
  /** Keys dropped, each with the reason. */
  readonly ignored: readonly string[];
  /** Keys whose value is a signal: bound as the value itself, which the component then reads. */
  readonly signals: readonly string[];
}

/**
 * Resolves static `inputs` against what the renderer knows about the target. Pure: values are read
 * untracked, only to skip `undefined` and spot signals; the bound value is read later, inside the
 * binding, so reading `inputs` never makes the bindings (and with them the component) depend on a
 * signal.
 *
 * - `publicNames`: the component's inputs by property name (to bind an alias by its property name).
 *   Names it doesn't list are bound as written, and Angular decides: the component or one of its
 *   `hostDirectives` receives it, or, in dev mode, it throws NG0315.
 * - `reserved`: inputs the renderer binds itself on this node.
 * - `formField`: set when the `FormField` directive is attached to the node, saying what the inputs
 *   are for: the custom control (`'control'`), on which it sets all of `FORM_FIELD_INPUTS`, or another
 *   directive on the node (`'directive'`), on which it sets them all but `value`/`checked`.
 */
export function resolveStaticInputs(
  inputs: Readonly<Record<string, unknown>>,
  context: {
    publicNames?: ReadonlyMap<string, string>;
    reserved?: ReadonlySet<string>;
    formField?: 'control' | 'directive';
  },
): ResolvedInputs {
  const bind: { name: string; key: string }[] = [];
  const ignored: string[] = [];
  const signals: string[] = [];
  for (const key of Object.keys(inputs)) {
    // `isSignal` too: on a FieldTree value it reads through the field's proxy.
    const [value, signal] = untracked(() => {
      const v = inputs[key];
      return [v, isSignal(v)] as const;
    });
    if (value === undefined) continue;
    const name = context.publicNames?.get(key) ?? key;
    if (context.reserved?.has(name)) {
      ignored.push(`'${key}': bound by the renderer (remove it)`);
    } else if (
      context.formField &&
      FORM_FIELD_INPUTS.has(name) &&
      !(context.formField === 'directive' && MODEL_INPUTS.has(name))
    ) {
      ignored.push(`'${key}': ${formFieldReason(name)}`);
    } else {
      bind.push({ name, key });
      if (signal) signals.push(key);
    }
  }
  return { bind, ignored, signals };
}
