/*
 * Public API Surface of ngx-signal-forms-renderer
 */

// Types
export type {
  LayoutNode,
  LayoutNodeOptions,
  ControlNode,
  GroupNode,
  ArrayNode,
  ContentNode,
  WhenNode,
  SwitchCaseNode,
  LayoutBranch,
} from './lib/layout-types';

// Builder functions
export { layout, control, group, array, content, when, switchCase } from './lib/layout';
export type { ArrayOptions, ContainerOptions, LayoutSignal, SwitchCaseKey } from './lib/layout';

// Provider
export { provideSignalFormsRenderer } from './lib/provider';
export type { SignalFormsRendererConfig, SignalFormsRendererTypeRegistry } from './lib/provider';

// Components and directives
export { SfrFormComponent } from './lib/sfr-form.component';
export { SfrNodeComponent } from './lib/sfr-node.component';
export { SfrChildrenComponent } from './lib/children.component';
export { SfrComponentOutletDirective } from './lib/sfr-component-outlet.directive';
