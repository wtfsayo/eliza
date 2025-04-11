/**
 * Formats goals data into a readable string.
 *
 * @param goals An array of goal objects to format
 * @returns A formatted string representation of the goals
 */
export function formatGoalsAsString({ goals }: { goals: any[] }): string {
  if (!goals || !Array.isArray(goals) || goals.length === 0) {
    return '';
  }

  return goals
    .map((goal) => {
      const status = goal.status || 'unknown';
      const title = goal.title || 'Untitled Goal';
      const description = goal.description ? `\n${goal.description}` : '';

      return `${title} (${status})${description}`;
    })
    .join('\n\n');
}
