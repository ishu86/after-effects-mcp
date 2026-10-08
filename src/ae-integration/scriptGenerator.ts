/**
 * Main Script Generator
 *
 * Central registry for all script generators.
 */

// Project generators
export {
  generateCreateProject,
  generateOpenProject,
  generateSaveProject,
  generateCloseProject,
  generateGetProjectInfo,
  generateImportFootage,
  generateListProjectItems
} from './generators/projectGenerators.js';

// Composition generators
export {
  generateCreateComposition,
  generateModifyComposition,
  generateDuplicateComposition,
  generateDeleteComposition,
  generateListCompositions,
  generateGetCompositionInfo,
  generateSetActiveComposition,
  generateRenderFrame,
  generateGetCompReport
} from './generators/compositionGenerators.js';

// Layer generators
export {
  generateAddSolidLayer,
  generateAddTextLayer,
  generateAddTextLayerAdvanced,
  generateAddShapeLayer,
  generateAddNullLayer,
  generateAddAdjustmentLayer,
  generateAddCameraLayer,
  generateAddLightLayer,
  generateAddAVLayer,
  generatePrecomposeLayers,
  generateModifyLayer,
  generateDeleteLayer,
  generateListLayers,
  generateGetLayerInfo
} from './generators/layerGenerators.js';

// Keyframe generators
export {
  generateSetKeyframe,
  generateSetKeyframeAdvanced,
  generateApplyEasyEase,
  generateSetTemporalEase,
  generateOffsetKeyframes,
  generateScaleKeyframeTiming,
  generateReverseKeyframes,
  generateCopyKeyframes,
  generateGetKeyframes
} from './generators/keyframeGenerators.js';

// Expression generators
export {
  generateSetExpression,
  generateGetExpression,
  generateRemoveExpression,
  generateEnableExpression,
  generateAddExpressionControl,
  generateApplyExpressionTemplate,
  generateLinkProperties,
  generateBatchSetExpressions,
  getExpressionTemplates
} from './generators/expressionGenerators.js';

// Effect generators
export {
  generateApplyEffect,
  generateApplyEffectTemplate,
  generateModifyEffectProperties,
  generateRemoveEffect,
  generateReorderEffects,
  generateCopyEffects,
  generateListEffects,
  getEffectTemplates
} from './generators/effectsGenerators.js';

// Template generators
export {
  generateCreateLowerThird,
  generateCreateTitleCard,
  generateCreateTransition,
  generateCreateLogoReveal,
  generateCreateTextAnimator
} from './generators/templateGenerators.js';

// Asset generators
export {
  generateImportFolder,
  generateReplaceFootage,
  generateOrganizeProjectItems,
  generateFindMissingFootage,
  generateCollectFiles,
  generateReduceProject,
  generateSetProxy,
  generateRemoveProxy
} from './generators/assetGenerators.js';

// Marker generators
export {
  generateAddCompositionMarker,
  generateAddLayerMarker,
  generateGetMarkers,
  generateDeleteMarker,
  generateSetWorkArea,
  generateSnapToMarker,
  generateGetCurrentTime,
  generateSetCurrentTime,
  generateGetNearestMarker,
  generateNavigateMarkers
} from './generators/markerGenerators.js';

// Shape generators (bezier paths + shape operators)
export {
  generateCreatePath,
  generateGetPath,
  generateSetPathKeyframes,
  generateAddShapeOperator,
  SHAPE_OPERATORS,
  SHAPE_OPERATOR_PROPERTIES,
  SHAPE_MATCH_NAMES
} from './generators/shapeGenerators.js';

// 3D generators
export {
  generateSetCompRenderer,
  generateSet3DLayer,
  generateSetMaterialOptions,
  generateSetGeometryOptions,
  generateSetCameraOptions,
  generateSetLightOptions,
  generateGet3DInfo,
  RENDERERS,
  EXTRUSION_RENDERERS,
  MATERIAL_PROPERTIES,
  CAMERA_PROPERTIES,
  LIGHT_PROPERTIES,
  EXTRUSION_PROPERTIES,
  PLANE_PROPERTIES,
  TRANSFORM_3D_PROPERTIES
} from './generators/threeDGenerators.js';

// Mask generators
export {
  generateAddMask,
  generateListMasks,
  generateGetMaskPath,
  generateSetMaskPath,
  generateSetMaskKeyframes,
  generateSetMaskProperties,
  generateDeleteMask,
  MASK_MATCH_NAMES
} from './generators/maskGenerators.js';

// Render queue generators
export {
  generateAddToRenderQueue,
  generateListRenderQueue,
  generateListRenderTemplates,
  generateSetRenderQueueItem,
  generateRemoveFromRenderQueue,
  generateControlRender,
  generateQueueInAME
} from './generators/renderQueueGenerators.js';

// Helpers (for direct use if needed)
export {
  escapeString,
  arrayToES3,
  objectToES3,
  colorToES3,
  positionToES3,
  wrapInUndoGroup
} from './generators/helpers.js';
