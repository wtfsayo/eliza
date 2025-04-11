import { toV2State } from './state';
import { State } from './types';
import { TemplateType } from './types';
import {
  composePrompt as coreComposePrompt,
  addHeader as coreAddHeader,
} from '@elizaos/core-plugin-v2';

export const composeContext = ({
  state,
  template,
  templatingEngine,
}: {
  state: State;
  template: TemplateType;
  templatingEngine?: 'handlebars';
}) => {
  const v2State = toV2State(state);
  return coreComposePrompt({ state: v2State, template, templatingEngine });
};

export const addHeader = (header: string, body: string) => {
  return coreAddHeader(header, body);
};
