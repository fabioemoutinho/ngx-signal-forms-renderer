import { Component, input } from '@angular/core';
import { FieldTree, FieldState, FormField } from '@angular/forms/signals';
import { MatFormField, MatLabel, MatError } from '@angular/material/form-field';
import { MatInput } from '@angular/material/input';

/**
 * The text-like types this control takes. Signal forms sets up date and time inputs when the control
 * is created, before a `[type]` binding applies, so those need a control with a static `type`.
 */
export type TextInputType = 'text' | 'email' | 'tel' | 'url' | 'search' | 'password';

@Component({
  selector: 'app-text-input',
  imports: [MatFormField, MatLabel, MatInput, MatError, FormField],
  template: `
    <mat-form-field appearance="outline">
      @if (label(); as l) {
        <mat-label>{{ l }}</mat-label>
      }
      <input matInput [type]="inputType()" [placeholder]="placeholder()" [formField]="field()" />
      <mat-error>{{ state().errors()[0]?.message ?? state().errors()[0]?.kind }}</mat-error>
    </mat-form-field>
  `,
  styles: `
    :host {
      display: block;
    }
  `,
})
export class TextInputComponent {
  readonly field = input.required<FieldTree<string>>();
  readonly state = input.required<FieldState<string>>();

  readonly label = input('');
  readonly inputType = input<TextInputType>('text');
  readonly placeholder = input('');
}
