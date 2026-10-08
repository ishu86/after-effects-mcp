/**
 * Effects-related Script Generators
 *
 * Generates ES3-compatible ExtendScript for effect operations.
 */

import {
  escapeString,
  generateProjectCheck,
  generateCompAccess,
  generateLayerAccess,
  wrapInUndoGroup,
  generateResultObject,
  colorToES3,
  arrayToES3
} from './helpers.js';
import { EFFECT_MATCH_NAMES } from '../../types/aeTypes.js';

// Effect templates with preset configurations
const EFFECT_TEMPLATES: Record<string, {
  effects: Array<{
    matchName: string;
    properties: Record<string, any>;
  }>;
  description: string;
}> = {
  // Blur effects
  gaussianBlur: {
    effects: [{
      matchName: 'ADBE Gaussian Blur 2',
      properties: { 'Blurriness': 10 }
    }],
    description: 'Gaussian blur effect'
  },
  directionalBlur: {
    effects: [{
      matchName: 'ADBE Motion Blur',
      properties: { 'Direction': 0, 'Blur Length': 20 }
    }],
    description: 'Directional/motion blur'
  },
  glassBlur: {
    effects: [
      { matchName: 'ADBE Gaussian Blur 2', properties: { 'Blurriness': 50 } },
      { matchName: 'ADBE HUE SATURATION', properties: { 'Saturation': -20 } }
    ],
    description: 'Frosted glass effect'
  },

  // Color effects
  curves: {
    effects: [{
      matchName: 'ADBE CurvesCustom',
      properties: {}
    }],
    description: 'Curves color correction'
  },
  colorBalance: {
    effects: [{
      matchName: 'ADBE Color Balance 2',
      properties: {}
    }],
    description: 'Color balance adjustment'
  },
  brightnessContrast: {
    effects: [{
      matchName: 'ADBE Brightness & Contrast 2',
      properties: { 'Brightness': 0, 'Contrast': 0 }
    }],
    description: 'Brightness and contrast'
  },
  vibrance: {
    effects: [{
      matchName: 'ADBE Vibrance',
      properties: { 'Vibrance': 30, 'Saturation': 0 }
    }],
    description: 'Vibrance color enhancement'
  },

  // Stylistic effects
  glow: {
    effects: [{
      matchName: 'ADBE Glo2',
      properties: { 'Glow Threshold': 60, 'Glow Radius': 25, 'Glow Intensity': 1 }
    }],
    description: 'Glow effect'
  },
  dropShadow: {
    effects: [{
      matchName: 'ADBE Drop Shadow',
      properties: {
        'Opacity': 75,
        'Direction': 135,
        'Distance': 10,
        'Softness': 10
      }
    }],
    description: 'Drop shadow effect'
  },
  vignette: {
    effects: [{
      matchName: 'ADBE Ramp',
      properties: {
        'Start of Ramp': [0.5, 0.5],
        'End of Ramp': [0.5, 0],
        'Start Color': [0, 0, 0, 0],
        'End Color': [0, 0, 0, 1],
        'Ramp Shape': 2 // Radial
      }
    }],
    description: 'Vignette effect'
  },

  // Creative looks
  cinematicLook: {
    effects: [
      {
        matchName: 'ADBE CurvesCustom',
        properties: {}
      },
      {
        matchName: 'ADBE Vibrance',
        properties: { 'Vibrance': -15, 'Saturation': -10 }
      },
      {
        matchName: 'ADBE Brightness & Contrast 2',
        properties: { 'Brightness': -5, 'Contrast': 15 }
      }
    ],
    description: 'Cinematic film look'
  },
  vhsRetro: {
    effects: [
      {
        matchName: 'ADBE Noise',
        properties: { 'Amount of Noise': 8 }
      },
      {
        matchName: 'ADBE HUE SATURATION',
        properties: { 'Saturation': -30 }
      },
      {
        matchName: 'ADBE Brightness & Contrast 2',
        properties: { 'Contrast': -10 }
      }
    ],
    description: 'VHS retro look'
  },
  neonGlow: {
    effects: [
      {
        matchName: 'ADBE Glo2',
        properties: {
          'Glow Threshold': 40,
          'Glow Radius': 50,
          'Glow Intensity': 2
        }
      },
      {
        matchName: 'ADBE Vibrance',
        properties: { 'Vibrance': 50 }
      }
    ],
    description: 'Neon glow effect'
  },
  filmGrain: {
    effects: [{
      matchName: 'ADBE Add Grain',
      properties: {
        'Intensity': 0.5,
        'Size': 1.5
      }
    }],
    description: 'Film grain texture'
  },
  chromaticAberration: {
    effects: [
      // Simulated using channel shift (requires CC effects)
      {
        matchName: 'ADBE HUE SATURATION',
        properties: {}
      }
    ],
    description: 'Chromatic aberration effect'
  },
  duotone: {
    effects: [
      {
        matchName: 'ADBE Tritone',
        properties: {
          'Highlights': [1, 0.9, 0.8],
          'Midtones': [0.5, 0.3, 0.2],
          'Shadows': [0.1, 0.05, 0.1]
        }
      }
    ],
    description: 'Duotone color effect'
  }
};

/**
 * Generate script to apply an effect to a layer
 */
export function generateApplyEffect(params: {
  compId?: number;
  compName?: string;
  layerIndex?: number;
  layerName?: string;
  effect: string;
  properties?: Record<string, any>;
}): string {
  let script = '';
  script += generateProjectCheck();
  script += generateCompAccess(params.compId, params.compName);
  script += generateLayerAccess('comp', params.layerIndex, params.layerName);

  // Resolve effect match name
  const matchName = EFFECT_MATCH_NAMES[params.effect] || params.effect;

  script += 'var effects = layer.property("Effects");\n';
  script += 'var effect = effects.addProperty("' + escapeString(matchName) + '");\n';
  script += 'if (!effect) {\n';
  script += '  throw new Error("Effect not found or not installed: ' + escapeString(params.effect) + '");\n';
  script += '}\n';

  // Apply properties if provided
  if (params.properties) {
    for (const propName in params.properties) {
      const value = params.properties[propName];
      script += 'try {\n';
      script += '  var propRef = effect.property("' + escapeString(propName) + '");\n';
      script += '  if (propRef) {\n';

      if (Array.isArray(value)) {
        script += '    propRef.setValue(' + arrayToES3(value) + ');\n';
      } else if (typeof value === 'object' && value.r !== undefined) {
        script += '    propRef.setValue(' + colorToES3(value) + ');\n';
      } else if (typeof value === 'number' || typeof value === 'boolean') {
        script += '    propRef.setValue(' + value + ');\n';
      } else if (typeof value === 'string') {
        script += '    propRef.setValue("' + escapeString(value) + '");\n';
      }

      script += '  }\n';
      script += '} catch (e) { /* Property not found */ }\n';
    }
  }

  script += generateResultObject({
    effectName: 'effect.name',
    matchName: 'effect.matchName',
    effectIndex: 'effect.propertyIndex'
  });

  return wrapInUndoGroup(script, 'Apply Effect');
}

/**
 * Generate script to apply an effect template
 */
export function generateApplyEffectTemplate(params: {
  compId?: number;
  compName?: string;
  layerIndex?: number;
  layerName?: string;
  template: string;
  intensity?: number;
  customParams?: Record<string, any>;
}): string {
  const templateDef = EFFECT_TEMPLATES[params.template];
  if (!templateDef) {
    let script = 'throw new Error("Unknown effect template: ' + escapeString(params.template) + '");\n';
    return script;
  }

  let script = '';
  script += generateProjectCheck();
  script += generateCompAccess(params.compId, params.compName);
  script += generateLayerAccess('comp', params.layerIndex, params.layerName);

  const intensity = params.intensity !== undefined ? params.intensity / 100 : 1;

  script += 'var effects = layer.property("Effects");\n';
  script += 'var addedEffects = [];\n';

  for (let i = 0; i < templateDef.effects.length; i++) {
    const effectDef = templateDef.effects[i];
    script += '// Effect ' + (i + 1) + ': ' + effectDef.matchName + '\n';
    script += 'var effect' + i + ' = effects.addProperty("' + escapeString(effectDef.matchName) + '");\n';
    script += 'if (effect' + i + ') {\n';

    // Apply default properties scaled by intensity where applicable
    for (const propName in effectDef.properties) {
      let value = effectDef.properties[propName];

      // Apply custom params if provided
      if (params.customParams && params.customParams[propName] !== undefined) {
        value = params.customParams[propName];
      }

      // Scale numeric values by intensity
      if (typeof value === 'number' && intensity !== 1) {
        value = value * intensity;
      }

      script += '  try {\n';
      script += '    var propRef = effect' + i + '.property("' + escapeString(propName) + '");\n';
      script += '    if (propRef) {\n';

      if (Array.isArray(value)) {
        script += '      propRef.setValue(' + arrayToES3(value) + ');\n';
      } else {
        script += '      propRef.setValue(' + value + ');\n';
      }

      script += '    }\n';
      script += '  } catch (e) {}\n';
    }

    script += '  addedEffects.push({ name: effect' + i + '.name, index: effect' + i + '.propertyIndex });\n';
    script += '}\n';
  }

  script += 'var result = {};\n';
  script += 'result.template = "' + escapeString(params.template) + '";\n';
  script += 'result.effects = addedEffects;\n';
  script += 'result;\n';

  return wrapInUndoGroup(script, 'Apply Effect Template');
}

/**
 * Generate script to modify effect properties
 */
export function generateModifyEffectProperties(params: {
  compId?: number;
  compName?: string;
  layerIndex?: number;
  layerName?: string;
  effectIndex?: number;
  effectName?: string;
  properties: Record<string, any>;
}): string {
  let script = '';
  script += generateProjectCheck();
  script += generateCompAccess(params.compId, params.compName);
  script += generateLayerAccess('comp', params.layerIndex, params.layerName);

  script += 'var effects = layer.property("Effects");\n';

  if (params.effectIndex) {
    script += 'var effect = effects(' + params.effectIndex + ');\n';
  } else if (params.effectName) {
    script += 'var effect = effects.property("' + escapeString(params.effectName) + '");\n';
  } else {
    script += 'throw new Error("effectIndex or effectName must be provided");\n';
    return script;
  }

  script += 'if (!effect) {\n';
  script += '  throw new Error("Effect not found");\n';
  script += '}\n';

  // Modify properties
  script += 'var modifiedProps = [];\n';
  for (const propName in params.properties) {
    const value = params.properties[propName];
    script += 'try {\n';
    script += '  var propRef = effect.property("' + escapeString(propName) + '");\n';
    script += '  if (propRef) {\n';

    if (Array.isArray(value)) {
      script += '    propRef.setValue(' + arrayToES3(value) + ');\n';
    } else if (typeof value === 'object' && value.r !== undefined) {
      script += '    propRef.setValue(' + colorToES3(value) + ');\n';
    } else if (typeof value === 'number' || typeof value === 'boolean') {
      script += '    propRef.setValue(' + value + ');\n';
    } else if (typeof value === 'string') {
      script += '    propRef.setValue("' + escapeString(value) + '");\n';
    }

    script += '    modifiedProps.push("' + escapeString(propName) + '");\n';
    script += '  }\n';
    script += '} catch (e) {}\n';
  }

  script += generateResultObject({
    effectName: 'effect.name',
    modifiedProperties: 'modifiedProps'
  });

  return wrapInUndoGroup(script, 'Modify Effect Properties');
}

/**
 * Generate script to remove an effect
 */
export function generateRemoveEffect(params: {
  compId?: number;
  compName?: string;
  layerIndex?: number;
  layerName?: string;
  effectIndex?: number;
  effectName?: string;
}): string {
  let script = '';
  script += generateProjectCheck();
  script += generateCompAccess(params.compId, params.compName);
  script += generateLayerAccess('comp', params.layerIndex, params.layerName);

  script += 'var effects = layer.property("Effects");\n';

  if (params.effectIndex) {
    script += 'var effect = effects(' + params.effectIndex + ');\n';
  } else if (params.effectName) {
    script += 'var effect = effects.property("' + escapeString(params.effectName) + '");\n';
  } else {
    script += 'throw new Error("effectIndex or effectName must be provided");\n';
    return script;
  }

  script += 'if (!effect) {\n';
  script += '  throw new Error("Effect not found");\n';
  script += '}\n';

  script += 'var removedName = effect.name;\n';
  script += 'effect.remove();\n';

  script += generateResultObject({
    success: 'true',
    removedEffect: 'removedName'
  });

  return wrapInUndoGroup(script, 'Remove Effect');
}

/**
 * Generate script to reorder effects
 */
export function generateReorderEffects(params: {
  compId?: number;
  compName?: string;
  layerIndex?: number;
  layerName?: string;
  effectIndex: number;
  newIndex: number;
}): string {
  let script = '';
  script += generateProjectCheck();
  script += generateCompAccess(params.compId, params.compName);
  script += generateLayerAccess('comp', params.layerIndex, params.layerName);

  script += 'var effects = layer.property("ADBE Effect Parade");\n';
  script += 'if (' + params.effectIndex + ' < 1 || ' + params.effectIndex + ' > effects.numProperties) {\n';
  script += '  throw new Error("Effect index ' + params.effectIndex + ' out of range; layer has " + effects.numProperties + " effect(s)");\n';
  script += '}\n';
  script += 'if (' + params.newIndex + ' < 1 || ' + params.newIndex + ' > effects.numProperties) {\n';
  script += '  throw new Error("New index ' + params.newIndex + ' out of range; layer has " + effects.numProperties + " effect(s)");\n';
  script += '}\n';
  script += 'var effect = effects.property(' + params.effectIndex + ');\n';

  // moveTo() invalidates this reference, so read the name first.
  script += 'var movedEffectName = effect.name;\n';
  script += 'effect.moveTo(' + params.newIndex + ');\n';

  script += generateResultObject({
    effectName: 'movedEffectName',
    newIndex: String(params.newIndex)
  });

  return wrapInUndoGroup(script, 'Reorder Effects');
}

/**
 * Generate script to copy effects between layers
 */
export function generateCopyEffects(params: {
  compId?: number;
  compName?: string;
  sourceLayerIndex?: number;
  sourceLayerName?: string;
  targetLayerIndex?: number;
  targetLayerName?: string;
  effectIndices?: number[];
}): string {
  let script = '';
  script += generateProjectCheck();
  script += generateCompAccess(params.compId, params.compName);

  // Get source layer
  script += generateLayerAccess('comp', params.sourceLayerIndex, params.sourceLayerName);
  script += 'var sourceLayer = layer;\n';

  // Get target layer
  script += generateLayerAccess('comp', params.targetLayerIndex, params.targetLayerName);
  script += 'var targetLayer = layer;\n';

  script += 'var sourceEffects = sourceLayer.property("Effects");\n';
  script += 'var targetEffects = targetLayer.property("Effects");\n';

  script += 'var copiedEffects = [];\n';

  if (params.effectIndices && params.effectIndices.length > 0) {
    script += 'var indices = ' + arrayToES3(params.effectIndices) + ';\n';
    script += 'for (var i = 0; i < indices.length; i++) {\n';
    script += '  var srcEffect = sourceEffects(indices[i]);\n';
  } else {
    script += 'for (var i = 1; i <= sourceEffects.numProperties; i++) {\n';
    script += '  var srcEffect = sourceEffects(i);\n';
  }

  script += '  if (srcEffect) {\n';
  script += '    var newEffect = targetEffects.addProperty(srcEffect.matchName);\n';
  script += '    if (newEffect) {\n';
  script += '      newEffect.name = srcEffect.name;\n';
  // Copy property values
  script += '      for (var p = 1; p <= srcEffect.numProperties; p++) {\n';
  script += '        try {\n';
  script += '          var srcProp = srcEffect(p);\n';
  script += '          var tgtProp = newEffect.property(srcProp.name);\n';
  script += '          if (tgtProp && srcProp.canSetValue) {\n';
  script += '            tgtProp.setValue(srcProp.value);\n';
  script += '          }\n';
  script += '        } catch (e) {}\n';
  script += '      }\n';
  script += '      copiedEffects.push(newEffect.name);\n';
  script += '    }\n';
  script += '  }\n';
  script += '}\n';

  script += 'var result = ({\n';
  script += '  copiedEffects: copiedEffects,\n';
  script += '  count: copiedEffects.length\n';
  script += '});\n';
  script += 'result;\n';

  return wrapInUndoGroup(script, 'Copy Effects');
}

/**
 * Generate script to list effects on a layer
 */
export function generateListEffects(params: {
  compId?: number;
  compName?: string;
  layerIndex?: number;
  layerName?: string;
}): string {
  let script = '';
  script += generateProjectCheck();
  script += generateCompAccess(params.compId, params.compName);
  script += generateLayerAccess('comp', params.layerIndex, params.layerName);

  script += 'var effects = layer.property("Effects");\n';
  script += 'var effectList = [];\n';

  script += 'for (var i = 1; i <= effects.numProperties; i++) {\n';
  script += '  var effect = effects(i);\n';
  script += '  effectList.push({\n';
  script += '    index: i,\n';
  script += '    name: effect.name,\n';
  script += '    matchName: effect.matchName,\n';
  script += '    enabled: effect.enabled\n';
  script += '  });\n';
  script += '}\n';

  script += 'effectList;\n';

  return script;
}

/**
 * Get available effect templates
 */
export function getEffectTemplates(): Record<string, string> {
  const templates: Record<string, string> = {};
  for (const name in EFFECT_TEMPLATES) {
    templates[name] = EFFECT_TEMPLATES[name].description;
  }
  return templates;
}
