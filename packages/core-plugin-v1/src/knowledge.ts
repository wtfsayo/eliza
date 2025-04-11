/**
 * Formats knowledge data into a readable string.
 * // TODO check if we can use something from core-plugin-v2
 * // but so far I don't see any good match
 *
 * @param knowledgeData An array of knowledge items to format
 * @returns A formatted string representation of the knowledge data
 */
export function formatKnowledge(knowledgeData: any[]): string {
  if (!knowledgeData || !Array.isArray(knowledgeData) || knowledgeData.length === 0) {
    return '';
  }

  return knowledgeData
    .map((item) => {
      // Handle different knowledge data formats
      if (typeof item === 'string') {
        return item;
      }

      // If it has content property, use that
      if (item.content || item.text) {
        return item.content || item.text;
      }

      // If it's an object, try to extract meaningful data
      if (typeof item === 'object') {
        // Try to extract title and content if available
        const title = item.title ? `# ${item.title}\n` : '';
        const content = item.content || item.text || JSON.stringify(item);
        return `${title}${content}`;
      }

      return JSON.stringify(item);
    })
    .join('\n\n');
}
