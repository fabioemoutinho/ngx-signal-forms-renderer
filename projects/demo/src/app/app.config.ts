import { ApplicationConfig, provideBrowserGlobalErrorListeners } from '@angular/core';
import { provideRouter } from '@angular/router';
import { provideAnimationsAsync } from '@angular/platform-browser/animations/async';
import { provideSignalFormsRenderer } from 'ngx-signal-forms-renderer';
import { routes } from './app.routes';
import { TextInputComponent } from './components/text-input.component';
import { SelectInputComponent } from './components/select-input.component';
import { TextareaInputComponent } from './components/textarea-input.component';
import { CheckboxInputComponent } from './components/checkbox-input.component';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideRouter(routes),
    provideAnimationsAsync(),
    provideSignalFormsRenderer({
      components: {
        text: TextInputComponent,
        select: SelectInputComponent,
        textarea: TextareaInputComponent,
        checkbox: CheckboxInputComponent,
      },
    }),
  ],
};
