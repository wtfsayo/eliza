import type { Action, ActionExample } from './types';

/**
 * Formats action examples into a readable string.
 * @param actionsData The actions to format examples for.
 * @param count Maximum number of examples to include.
 * @returns A formatted string with action examples.
 */
export const composeActionExamples = (actionsData: Action[], count: number = 5) => {
  if (!actionsData || actionsData.length === 0) {
    return '';
  }

  // Find actions with examples
  const actionsWithExamples = actionsData.filter(
    (action) => action.examples && action.examples.length > 0
  );

  if (actionsWithExamples.length === 0) {
    return '';
  }

  // Get random examples up to count
  const allExamples: string[] = [];
  let totalExamples = 0;

  while (totalExamples < count && actionsWithExamples.length > 0) {
    // Select a random action
    const randomIndex = Math.floor(Math.random() * actionsWithExamples.length);
    const action = actionsWithExamples[randomIndex];

    // If it has examples, grab one
    if (action.examples && action.examples.length > 0) {
      const exampleGroup = action.examples[Math.floor(Math.random() * action.examples.length)];

      // Format the example
      const formattedExample = exampleGroup
        .map((example: ActionExample) => {
          let result = `${example.user}: ${example.content.text}`;
          if (example.content.action) {
            result += ` (${example.content.action})`;
          }
          return result;
        })
        .join('\n');

      allExamples.push(formattedExample);
      totalExamples++;
    }

    // Remove the action from the list to prevent duplicates
    actionsWithExamples.splice(randomIndex, 1);
  }

  return allExamples.join('\n\n');
};

/**
 * Formats action names into a comma-separated list.
 * @param actions The actions to format.
 * @returns A formatted string with action names.
 */
export function formatActionNames(actions: Action[]) {
  if (!actions || actions.length === 0) {
    return 'none';
  }
  return actions.map((action) => `'${action.name}'`).join(', ');
}

/**
 * Formats detailed action information.
 * @param actions The actions to format.
 * @returns A formatted string with action details.
 */
export function formatActions(actions: Action[]) {
  if (!actions || actions.length === 0) {
    return '';
  }

  return actions
    .map((action) => {
      let result = `${action.name}:`;
      if (action.description) {
        result += ` ${action.description}`;
      }
      if (action.similes && action.similes.length > 0) {
        result += `\nSimilar to: ${action.similes.join(', ')}`;
      }
      return result;
    })
    .join('\n\n');
}
