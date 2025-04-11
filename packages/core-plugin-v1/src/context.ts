import { translateV1StateToV2 } from './translators/state-translator';
import { State, TemplateType } from './types';
import {
  composePrompt as coreComposePrompt,
  addHeader as coreAddHeader,
} from '@elizaos/core-plugin-v2';

/**
 * Compose a context for a given state and template
 * // TODO check if we can use something core-plugin-v2
 * // like we are using or we gonna need handlerbars import here
 * // and use composeContext here for plugin-v1
 *
 * @param state - The state to compose the context for
 * @param template - The template to use for the context
 * @param templatingEngine - The templating engine to use
 * @returns The composed context
 */
export const composeContext = ({
  state,
  template,
  templatingEngine,
}: {
  state: State;
  template: TemplateType;
  templatingEngine?: 'handlebars';
}) => {
  const v2State = translateV1StateToV2(state);
  return coreComposePrompt({ state: v2State, template, templatingEngine });
};

export const addHeader = (header: string, body: string) => {
  return coreAddHeader(header, body);
};
