/**
 * Model Compatibility Layer - Maps V1 models to V2 models
 *
 * This file contains compatibility functions for V1 model operations that use V2's model system.
 * It allows V1 plugins to interact with V2 models through familiar interfaces.
 */

import { ModelClass } from '../types';

/**
 * Maps a V1 ModelClass to the corresponding V2 ModelType
 * @param modelClass V1 model class
 * @returns V2 model type
 */
export function mapModelClassToModelType(modelClass: ModelClass): string {
  switch (modelClass) {
    case ModelClass.SMALL:
      return 'TEXT_SMALL';
    case ModelClass.MEDIUM:
    case ModelClass.LARGE:
      return 'TEXT_LARGE';
    case ModelClass.EMBEDDING:
      return 'TEXT_EMBEDDING';
    case ModelClass.IMAGE:
      return 'IMAGE';
    default:
      // Default to TEXT_LARGE for unknown models
      console.warn(`[Compat Layer] Unknown model class ${modelClass}, defaulting to TEXT_LARGE`);
      return 'TEXT_LARGE';
  }
}
