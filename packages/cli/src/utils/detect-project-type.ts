import fs from 'node:fs';
import path from 'node:path';
import { isMonorepoContext } from './get-package-info';

export interface ProjectType {
  isProject: boolean;
  isPlugin: boolean;
}

/**
 * Detect whether the provided directory contains an Eliza project or plugin.
 *
 * This checks `package.json` values, common naming conventions and source
 * exports in `src/index.ts` to make a best effort guess at the project type.
 *
 * @param dir Directory to inspect. Defaults to `process.cwd()`.
 */
export async function detectProjectType(dir: string = process.cwd()): Promise<ProjectType> {
  const packageJsonPath = path.join(dir, 'package.json');
  const isMonorepo = await isMonorepoContext();

  console.info(`Running in directory: ${dir}`);
  console.info(`Detected Eliza monorepo context: ${isMonorepo}`);

  let isProject = false;
  let isPlugin = false;

  if (fs.existsSync(packageJsonPath)) {
    try {
      const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8'));

      console.info(`Package name: ${packageJson.name}`);
      console.info(
        `Package type check: ${JSON.stringify({
          'eliza.type': packageJson.eliza?.type,
          'name.includes(plugin)': packageJson.name?.includes('plugin-'),
          keywords: packageJson.keywords,
        })}`
      );

      if (packageJson.name === '@elizaos/cli') {
        return { isProject: false, isPlugin: false };
      }

      if (
        packageJson.eliza?.type === 'plugin' ||
        packageJson.name?.includes('plugin-') ||
        (packageJson.keywords &&
          Array.isArray(packageJson.keywords) &&
          packageJson.keywords.some((k: string) => k === 'elizaos-plugin' || k === 'eliza-plugin'))
      ) {
        isPlugin = true;
        console.info('Identified as a plugin package');
      }

      if (
        packageJson.eliza?.type === 'project' ||
        (packageJson.name &&
          (packageJson.name.includes('project-') || packageJson.name.includes('-org'))) ||
        (packageJson.keywords &&
          Array.isArray(packageJson.keywords) &&
          packageJson.keywords.some((k: string) => k === 'elizaos-project' || k === 'eliza-project'))
      ) {
        isProject = true;
        console.info('Identified as a project package');
      }

      if (!isProject && !isPlugin) {
        const indexPath = path.join(dir, 'src', 'index.ts');
        if (fs.existsSync(indexPath)) {
          const indexContent = fs.readFileSync(indexPath, 'utf-8');
          if (
            indexContent.includes('export const project') ||
            (indexContent.includes('export default') && indexContent.includes('Project'))
          ) {
            isProject = true;
            console.info('Identified as a project by src/index.ts export');
          }
        }
      }
    } catch (error) {
      console.warn(`Error parsing package.json: ${error}`);
    }
  }

  return { isProject, isPlugin };
}
