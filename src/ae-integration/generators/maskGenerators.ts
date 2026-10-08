/**
 * Mask Generators
 *
 * Masks and shape-layer paths both use the same Shape object, so the path
 * building and validation is shared with shapeGenerators rather than
 * reimplemented.
 *
 * Match names verified empirically against After Effects 26.5:
 *   ADBE Mask Parade   the mask group on a layer
 *   ADBE Mask Atom     one mask
 *   ADBE Mask Shape    the path        (Shape-valued)
 *   ADBE Mask Feather  feather         ([x, y], TwoD)
 *   ADBE Mask Opacity  opacity         (percent)
 *   ADBE Mask Offset   expansion       (pixels) - note the name mismatch
 */

import {
  escapeString,
  colorToES3,
  generateCompAccess,
  generateLayerAccess,
  generateProjectCheck,
  generateResultObject,
  wrapInUndoGroup
} from './helpers.js';

import {
  validatePathPoints,
  zeroTangents,
  emitShapeObject
} from './shapeGenerators.js';

export const MASK_MATCH_NAMES = {
  parade: 'ADBE Mask Parade',
  atom: 'ADBE Mask Atom',
  path: 'ADBE Mask Shape',
  feather: 'ADBE Mask Feather',
  opacity: 'ADBE Mask Opacity',
  expansion: 'ADBE Mask Offset'
};

const MASK_MODES = ['none', 'add', 'subtract', 'intersect', 'lighten', 'darken', 'difference'];

/** Map a friendly mode string to its MaskMode constant. */
function maskModeES3(mode: string): string {
  const m = mode.toLowerCase();
  if (MASK_MODES.indexOf(m) === -1) {
    throw new Error('mode must be one of: ' + MASK_MODES.join(', '));
  }
  return 'MaskMode.' + m.toUpperCase();
}

/** Emit ES3 resolving `maskGroup`, and `mask` when a mask is identified. */
function emitMaskAccess(maskIndex?: number, maskName?: string): string {
  let s = '';
  s += 'var maskGroup = layer.property("' + MASK_MATCH_NAMES.parade + '");\n';
  s += 'if (!maskGroup) { throw new Error("Layer does not support masks: " + layer.name); }\n';

  if (maskIndex !== undefined) {
    s += 'if (' + maskIndex + ' < 1 || ' + maskIndex + ' > maskGroup.numProperties) {\n';
    s += '  throw new Error("Mask index ' + maskIndex + ' out of range; layer has " + maskGroup.numProperties + " mask(s)");\n';
    s += '}\n';
    s += 'var mask = maskGroup.property(' + maskIndex + ');\n';
  } else if (maskName !== undefined) {
    s += 'var mask = null;\n';
    s += 'for (var mi = 1; mi <= maskGroup.numProperties; mi++) {\n';
    s += '  if (maskGroup.property(mi).name === "' + escapeString(maskName) + '") {\n';
    s += '    mask = maskGroup.property(mi);\n';
    s += '    break;\n';
    s += '  }\n';
    s += '}\n';
    s += 'if (mask === null) { throw new Error("Mask not found: ' + escapeString(maskName) + '"); }\n';
  } else {
    s += 'if (maskGroup.numProperties === 0) { throw new Error("Layer has no masks: " + layer.name); }\n';
    s += 'var mask = maskGroup.property(1);\n';
  }
  return s;
}

/**
 * Emit the shared mask-settings assignments used by add_mask and
 * set_mask_properties.
 */
function emitMaskSettings(params: {
  mode?: string;
  inverted?: boolean;
  locked?: boolean;
  rotoBezier?: boolean;
  feather?: number | number[];
  opacity?: number;
  expansion?: number;
  color?: { r: number; g: number; b: number };
  name?: string;
}): string {
  let s = '';
  if (params.name !== undefined) {
    s += 'mask.name = "' + escapeString(params.name) + '";\n';
  }
  if (params.mode !== undefined) {
    s += 'mask.maskMode = ' + maskModeES3(params.mode) + ';\n';
  }
  if (params.inverted !== undefined) {
    s += 'mask.inverted = ' + (params.inverted ? 'true' : 'false') + ';\n';
  }
  if (params.locked !== undefined) {
    // Set locked last where possible - a locked mask rejects further edits.
    s += 'mask.locked = ' + (params.locked ? 'true' : 'false') + ';\n';
  }
  if (params.rotoBezier !== undefined) {
    s += 'mask.rotoBezier = ' + (params.rotoBezier ? 'true' : 'false') + ';\n';
  }
  if (params.color) {
    s += 'mask.color = ' + colorToES3(params.color) + ';\n';
  }
  if (params.feather !== undefined) {
    // Feather is a TwoD property - accept a single number for both axes.
    const f = Array.isArray(params.feather)
      ? '[' + params.feather[0] + ', ' + params.feather[1] + ']'
      : '[' + params.feather + ', ' + params.feather + ']';
    s += 'mask.property("' + MASK_MATCH_NAMES.feather + '").setValue(' + f + ');\n';
  }
  if (params.opacity !== undefined) {
    s += 'mask.property("' + MASK_MATCH_NAMES.opacity + '").setValue(' + params.opacity + ');\n';
  }
  if (params.expansion !== undefined) {
    s += 'mask.property("' + MASK_MATCH_NAMES.expansion + '").setValue(' + params.expansion + ');\n';
  }
  return s;
}

/**
 * Add a mask to a layer, with an optional path.
 */
export function generateAddMask(params: {
  compId?: number;
  compName?: string;
  layerIndex?: number;
  layerName?: string;
  name?: string;
  vertices?: number[][];
  inTangents?: number[][];
  outTangents?: number[][];
  closed?: boolean;
  mode?: string;
  inverted?: boolean;
  rotoBezier?: boolean;
  feather?: number | number[];
  opacity?: number;
  expansion?: number;
  color?: { r: number; g: number; b: number };
}): string {
  if (params.vertices) {
    validatePathPoints(params.vertices, params.inTangents, params.outTangents);
  }

  let script = '';
  script += generateProjectCheck();
  script += generateCompAccess(params.compId, params.compName);
  script += generateLayerAccess('comp', params.layerIndex, params.layerName);

  script += 'var maskGroup = layer.property("' + MASK_MATCH_NAMES.parade + '");\n';
  script += 'if (!maskGroup) { throw new Error("Layer does not support masks: " + layer.name); }\n';
  script += 'var mask = maskGroup.addProperty("' + MASK_MATCH_NAMES.atom + '");\n';

  if (params.vertices) {
    const inT = params.inTangents || zeroTangents(params.vertices.length);
    const outT = params.outTangents || zeroTangents(params.vertices.length);
    const closed = params.closed !== undefined ? params.closed : true;
    script += emitShapeObject('maskShape', params.vertices, inT, outT, closed);
    script += 'mask.property("' + MASK_MATCH_NAMES.path + '").setValue(maskShape);\n';
  }

  script += emitMaskSettings(params);

  // Read values out before anything else can invalidate the reference.
  script += 'var createdMaskName = mask.name;\n';
  script += 'var createdMaskIndex = maskGroup.numProperties;\n';

  script += generateResultObject({
    layerName: 'layer.name',
    maskName: 'createdMaskName',
    maskIndex: 'createdMaskIndex',
    vertexCount: params.vertices ? String(params.vertices.length) : '0'
  });

  return wrapInUndoGroup(script, 'Add Mask');
}

/**
 * List every mask on a layer with its settings.
 */
export function generateListMasks(params: {
  compId?: number;
  compName?: string;
  layerIndex?: number;
  layerName?: string;
}): string {
  let script = '';
  script += generateProjectCheck();
  script += generateCompAccess(params.compId, params.compName);
  script += generateLayerAccess('comp', params.layerIndex, params.layerName);

  script += 'var maskGroup = layer.property("' + MASK_MATCH_NAMES.parade + '");\n';
  script += 'var masks = [];\n';
  script += 'if (maskGroup) {\n';
  script += '  for (var i = 1; i <= maskGroup.numProperties; i++) {\n';
  script += '    var m = maskGroup.property(i);\n';
  script += '    var pathProp = m.property("' + MASK_MATCH_NAMES.path + '");\n';
  script += '    masks.push({\n';
  script += '      index: i,\n';
  script += '      name: m.name,\n';
  script += '      inverted: m.inverted,\n';
  script += '      locked: m.locked,\n';
  script += '      rotoBezier: m.rotoBezier,\n';
  script += '      numVertices: pathProp.value.vertices.length,\n';
  script += '      pathIsAnimated: pathProp.numKeys > 0,\n';
  script += '      numPathKeys: pathProp.numKeys,\n';
  script += '      feather: m.property("' + MASK_MATCH_NAMES.feather + '").value,\n';
  script += '      opacity: m.property("' + MASK_MATCH_NAMES.opacity + '").value,\n';
  script += '      expansion: m.property("' + MASK_MATCH_NAMES.expansion + '").value\n';
  script += '    });\n';
  script += '  }\n';
  script += '}\n';

  script += generateResultObject({
    layerName: 'layer.name',
    numMasks: 'masks.length',
    masks: 'masks'
  });

  return script;
}

/**
 * Read a mask path back, including keyframes when animated.
 */
export function generateGetMaskPath(params: {
  compId?: number;
  compName?: string;
  layerIndex?: number;
  layerName?: string;
  maskIndex?: number;
  maskName?: string;
}): string {
  let script = '';
  script += generateProjectCheck();
  script += generateCompAccess(params.compId, params.compName);
  script += generateLayerAccess('comp', params.layerIndex, params.layerName);
  script += emitMaskAccess(params.maskIndex, params.maskName);

  script += 'var pathProp = mask.property("' + MASK_MATCH_NAMES.path + '");\n';
  script += 'var current = pathProp.value;\n';
  script += 'var keys = [];\n';
  script += 'for (var k = 1; k <= pathProp.numKeys; k++) {\n';
  script += '  var kv = pathProp.keyValue(k);\n';
  script += '  keys.push({\n';
  script += '    time: pathProp.keyTime(k),\n';
  script += '    vertices: kv.vertices,\n';
  script += '    inTangents: kv.inTangents,\n';
  script += '    outTangents: kv.outTangents,\n';
  script += '    closed: kv.closed\n';
  script += '  });\n';
  script += '}\n';

  script += generateResultObject({
    layerName: 'layer.name',
    maskName: 'mask.name',
    vertices: 'current.vertices',
    inTangents: 'current.inTangents',
    outTangents: 'current.outTangents',
    closed: 'current.closed',
    isAnimated: 'pathProp.numKeys > 0',
    numKeys: 'pathProp.numKeys',
    keyframes: 'keys'
  });

  return script;
}

/**
 * Replace a mask's path.
 */
export function generateSetMaskPath(params: {
  compId?: number;
  compName?: string;
  layerIndex?: number;
  layerName?: string;
  maskIndex?: number;
  maskName?: string;
  vertices: number[][];
  inTangents?: number[][];
  outTangents?: number[][];
  closed?: boolean;
}): string {
  validatePathPoints(params.vertices, params.inTangents, params.outTangents);

  const inT = params.inTangents || zeroTangents(params.vertices.length);
  const outT = params.outTangents || zeroTangents(params.vertices.length);
  const closed = params.closed !== undefined ? params.closed : true;

  let script = '';
  script += generateProjectCheck();
  script += generateCompAccess(params.compId, params.compName);
  script += generateLayerAccess('comp', params.layerIndex, params.layerName);
  script += emitMaskAccess(params.maskIndex, params.maskName);

  script += emitShapeObject('maskShape', params.vertices, inT, outT, closed);
  script += 'mask.property("' + MASK_MATCH_NAMES.path + '").setValue(maskShape);\n';

  script += generateResultObject({
    layerName: 'layer.name',
    maskName: 'mask.name',
    vertexCount: String(params.vertices.length)
  });

  return wrapInUndoGroup(script, 'Set Mask Path');
}

/**
 * Animate a mask path.
 *
 * As with shape paths, Shape-valued properties must be keyed one at a time -
 * setValuesAtTimes() does not work on them.
 */
export function generateSetMaskKeyframes(params: {
  compId?: number;
  compName?: string;
  layerIndex?: number;
  layerName?: string;
  maskIndex?: number;
  maskName?: string;
  keyframes: Array<{
    time: number;
    vertices: number[][];
    inTangents?: number[][];
    outTangents?: number[][];
    closed?: boolean;
  }>;
}): string {
  if (!params.keyframes || !Array.isArray(params.keyframes) || params.keyframes.length === 0) {
    throw new Error('keyframes must be a non-empty array');
  }
  for (let i = 0; i < params.keyframes.length; i++) {
    const kf = params.keyframes[i];
    if (typeof kf.time !== 'number' || !Number.isFinite(kf.time)) {
      throw new Error('keyframes[' + i + '].time must be a finite number');
    }
    validatePathPoints(kf.vertices, kf.inTangents, kf.outTangents);
  }

  let script = '';
  script += generateProjectCheck();
  script += generateCompAccess(params.compId, params.compName);
  script += generateLayerAccess('comp', params.layerIndex, params.layerName);
  script += emitMaskAccess(params.maskIndex, params.maskName);

  script += 'var pathProp = mask.property("' + MASK_MATCH_NAMES.path + '");\n';

  for (let i = 0; i < params.keyframes.length; i++) {
    const kf = params.keyframes[i];
    const inT = kf.inTangents || zeroTangents(kf.vertices.length);
    const outT = kf.outTangents || zeroTangents(kf.vertices.length);
    const cl = kf.closed !== undefined ? kf.closed : true;
    script += emitShapeObject('mkShape' + i, kf.vertices, inT, outT, cl);
    script += 'pathProp.setValueAtTime(' + kf.time + ', mkShape' + i + ');\n';
  }

  script += generateResultObject({
    layerName: 'layer.name',
    maskName: 'mask.name',
    keysWritten: String(params.keyframes.length),
    numKeys: 'pathProp.numKeys'
  });

  return wrapInUndoGroup(script, 'Set Mask Keyframes');
}

/**
 * Change a mask's settings without touching its path.
 */
export function generateSetMaskProperties(params: {
  compId?: number;
  compName?: string;
  layerIndex?: number;
  layerName?: string;
  maskIndex?: number;
  maskName?: string;
  name?: string;
  mode?: string;
  inverted?: boolean;
  locked?: boolean;
  rotoBezier?: boolean;
  feather?: number | number[];
  opacity?: number;
  expansion?: number;
  color?: { r: number; g: number; b: number };
}): string {
  let script = '';
  script += generateProjectCheck();
  script += generateCompAccess(params.compId, params.compName);
  script += generateLayerAccess('comp', params.layerIndex, params.layerName);
  script += emitMaskAccess(params.maskIndex, params.maskName);

  // Unlock first so the other assignments are not rejected, then re-apply the
  // requested lock state at the end.
  script += 'var wasLocked = mask.locked;\n';
  script += 'try {\n';
  script += '  if (wasLocked) { mask.locked = false; }\n';

  const settings = { ...params };
  delete settings.locked;
  script += emitMaskSettings(settings);
  script += '} finally {\n';

  if (params.locked !== undefined) {
    script += 'mask.locked = ' + (params.locked ? 'true' : 'false') + ';\n';
  } else {
    script += 'mask.locked = wasLocked;\n';
  }
  script += '}\n';

  script += generateResultObject({
    layerName: 'layer.name',
    maskName: 'mask.name',
    locked: 'mask.locked',
    inverted: 'mask.inverted'
  });

  return wrapInUndoGroup(script, 'Set Mask Properties');
}

/**
 * Delete a mask.
 */
export function generateDeleteMask(params: {
  compId?: number;
  compName?: string;
  layerIndex?: number;
  layerName?: string;
  maskIndex?: number;
  maskName?: string;
}): string {
  let script = '';
  script += generateProjectCheck();
  script += generateCompAccess(params.compId, params.compName);
  script += generateLayerAccess('comp', params.layerIndex, params.layerName);
  script += emitMaskAccess(params.maskIndex, params.maskName);

  script += 'var removedName = mask.name;\n';
  script += 'if (mask.locked) { mask.locked = false; }\n';
  script += 'mask.remove();\n';

  script += generateResultObject({
    layerName: 'layer.name',
    removed: 'removedName',
    remainingMasks: 'maskGroup.numProperties'
  });

  return wrapInUndoGroup(script, 'Delete Mask');
}
