import type { ActionExample, Evaluator } from './types';

/**
 * Formats the names of evaluators into a comma-separated list, each enclosed in single quotes.
 * @param evaluators - An array of evaluator objects.
 * @returns A string that concatenates the names of all evaluators, each enclosed in single quotes and separated by commas.
 */
export function formatEvaluatorNames(evaluators: Evaluator[]) {
  return evaluators.map((evaluator: Evaluator) => `'${evaluator.name}'`).join(',\n');
}

/**
 * Formats evaluator details into a string, including both the name and description of each evaluator.
 * @param evaluators - An array of evaluator objects.
 * @returns A string that concatenates the name and description of each evaluator, separated by a colon and a newline character.
 */
export function formatEvaluators(evaluators: Evaluator[]) {
  return evaluators
    .map((evaluator: Evaluator) => `'${evaluator.name}: ${evaluator.description}'`)
    .join(',\n');
}

/**
 * Formats evaluator examples into a readable string.
 * @param evaluators - An array of evaluator objects, each containing examples to format.
 * @returns A string that presents each evaluator example in a structured format.
 */
export function formatEvaluatorExamples(evaluators: Evaluator[]) {
  return evaluators
    .map((evaluator) => {
      return (evaluator.examples || [])
        .map((example: any) => {
          if (!example) return '';

          const formattedContext = example.context || '';
          const formattedOutcome = example.outcome || '';

          const formattedMessages = (example.messages || [])
            .map((message: ActionExample) => {
              let messageString = `${message.user}: ${message.content.text}`;
              return messageString + (message.content.action ? ` (${message.content.action})` : '');
            })
            .join('\n');

          return `Context:\n${formattedContext}\n\nMessages:\n${formattedMessages}\n\nOutcome:\n${formattedOutcome}`;
        })
        .join('\n\n');
    })
    .join('\n\n');
}

/**
 * Generates a string summarizing the descriptions of each evaluator example.
 * @param evaluators - An array of evaluator objects, each containing examples.
 * @returns A string that summarizes the descriptions for each evaluator example.
 */
export function formatEvaluatorExampleDescriptions(evaluators: Evaluator[]) {
  return evaluators
    .map((evaluator) =>
      (evaluator.examples || [])
        .map(
          (_example, index) => `${evaluator.name} Example ${index + 1}: ${evaluator.description}`
        )
        .join('\n')
    )
    .join('\n\n');
}
