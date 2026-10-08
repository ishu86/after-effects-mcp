/**
 * Shape Layer Generators
 *
 * Bezier path creation / reading / animation, plus shape operators
 * (Trim Paths, Repeater, etc).
 *
 * IMPORTANT: every property lookup in here uses matchNames, never English
 * display names. `rect.property("Size")` returns null on a non-English After
 * Effects; `rect.property("ADBE Vector Rect Size")` always works.
 *
 * Match names verified empirically against After Effects 26.5 and cross-checked
 * against docsforadobe/after-effects-scripting-guide.
 */

import {
  escapeString,
  arrayToES3,
  colorToES3,
  positionToES3,
  generateCompAccess,
  generateLayerAccess,
  generateProjectCheck,
  generateResultObject,
  wrapInUndoGroup
} from './helpers.js';

/**
 * Shape layer structural match names.
 */
export const SHAPE_MATCH_NAMES = {
  rootContents: 'ADBE Root Vectors Group',
  group: 'ADBE Vector Group',
  groupContents: 'ADBE Vectors Group',
  pathGroup: 'ADBE Vector Shape - Group',
  path: 'ADBE Vector Shape',
  fill: 'ADBE Vector Graphic - Fill',
  fillColor: 'ADBE Vector Fill Color',
  stroke: 'ADBE Vector Graphic - Stroke',
  strokeColor: 'ADBE Vector Stroke Color',
  strokeWidth: 'ADBE Vector Stroke Width'
};

/**
 * Shape operators, all verified against AE 26.5.
 *
 * NOTE: Pucker & Bloat is "ADBE Vector Filter - PB". The plausible-looking
 * "ADBE Vector Filter - PuckerBloat" is NOT a valid match name and passing it
 * to addProperty() hard-crashes After Effects with no exception and no dialog.
 */
export const SHAPE_OPERATORS: Record<string, string> = {
  trimPaths: 'ADBE Vector Filter - Trim',
  repeater: 'ADBE Vector Filter - Repeater',
  roundCorners: 'ADBE Vector Filter - RC',
  zigZag: 'ADBE Vector Filter - Zigzag',
  twist: 'ADBE Vector Filter - Twist',
  puckerBloat: 'ADBE Vector Filter - PB',
  offsetPaths: 'ADBE Vector Filter - Offset',
  wigglePaths: 'ADBE Vector Filter - Roughen',
  wiggleTransform: 'ADBE Vector Filter - Wiggler',
  mergePaths: 'ADBE Vector Filter - Merge',
  gradientFill: 'ADBE Vector Graphic - G-Fill',
  gradientStroke: 'ADBE Vector Graphic - G-Stroke'
};

/**
 * Per-operator property match names, so callers can set values without
 * knowing the raw ADBE strings.
 */
export const SHAPE_OPERATOR_PROPERTIES: Record<string, Record<string, string>> = {
  trimPaths: {
    start: 'ADBE Vector Trim Start',
    end: 'ADBE Vector Trim End',
    offset: 'ADBE Vector Trim Offset',
    trimMultipleShapes: 'ADBE Vector Trim Type'
  },
  repeater: {
    copies: 'ADBE Vector Repeater Copies',
    offset: 'ADBE Vector Repeater Offset',
    composite: 'ADBE Vector Repeater Order'
  },
  roundCorners: { radius: 'ADBE Vector RoundCorner Radius' },
  zigZag: {
    size: 'ADBE Vector Zigzag Size',
    ridgesPerSegment: 'ADBE Vector Zigzag Detail',
    points: 'ADBE Vector Zigzag Points'
  },
  twist: { angle: 'ADBE Vector Twist Angle', center: 'ADBE Vector Twist Center' },
  puckerBloat: { amount: 'ADBE Vector PuckerBloat Amount' },
  offsetPaths: {
    amount: 'ADBE Vector Offset Amount',
    lineJoin: 'ADBE Vector Offset Line Join',
    miterLimit: 'ADBE Vector Offset Miter Limit',
    copies: 'ADBE Vector Offset Copies',
    copyOffset: 'ADBE Vector Offset Copy Offset'
  },
  wigglePaths: {
    size: 'ADBE Vector Roughen Size',
    detail: 'ADBE Vector Roughen Detail',
    points: 'ADBE Vector Roughen Points',
    wigglesPerSecond: 'ADBE Vector Temporal Freq',
    correlation: 'ADBE Vector Correlation',
    temporalPhase: 'ADBE Vector Temporal Phase',
    spatialPhase: 'ADBE Vector Spatial Phase',
    randomSeed: 'ADBE Vector Random Seed'
  },
  wiggleTransform: {
    wigglesPerSecond: 'ADBE Vector Xform Temporal Freq',
    correlation: 'ADBE Vector Correlation',
    temporalPhase: 'ADBE Vector Temporal Phase',
    spatialPhase: 'ADBE Vector Spatial Phase',
    randomSeed: 'ADBE Vector Random Seed'
  },
  mergePaths: { mode: 'ADBE Vector Merge Type' },
  gradientFill: {
    type: 'ADBE Vector Grad Type',
    startPoint: 'ADBE Vector Grad Start Pt',
    endPoint: 'ADBE Vector Grad End Pt',
    highlightLength: 'ADBE Vector Grad HiLite Length',
    highlightAngle: 'ADBE Vector Grad HiLite Angle',
    opacity: 'ADBE Vector Fill Opacity'
  },
  gradientStroke: {
    type: 'ADBE Vector Grad Type',
    startPoint: 'ADBE Vector Grad Start Pt',
    endPoint: 'ADBE Vector Grad End Pt',
    opacity: 'ADBE Vector Stroke Opacity',
    strokeWidth: 'ADBE Vector Stroke Width'
  }
};

/**
 * Validate a vertex list and its tangents at generate time, so bad input fails
 * here with a clear message instead of somewhere inside After Effects.
 */
export function validatePathPoints(
  vertices: number[][],
  inTangents?: number[][],
  outTangents?: number[][]
): void {
  if (!vertices || !Array.isArray(vertices) || vertices.length < 2) {
    throw new Error('vertices must be an array of at least 2 [x, y] points');
  }
  for (let i = 0; i < vertices.length; i++) {
    const v = vertices[i];
    if (!Array.isArray(v) || v.length !== 2 || typeof v[0] !== 'number' || typeof v[1] !== 'number' ||
        !Number.isFinite(v[0]) || !Number.isFinite(v[1])) {
      throw new Error('vertices[' + i + '] must be a numeric [x, y] pair');
    }
  }
  const check = (t: number[][] | undefined, label: string) => {
    if (t === undefined) return;
    if (!Array.isArray(t) || t.length !== vertices.length) {
      throw new Error(label + ' must have exactly one [x, y] pair per vertex (' + vertices.length + ')');
    }
    for (let i = 0; i < t.length; i++) {
      const p = t[i];
      if (!Array.isArray(p) || p.length !== 2 || typeof p[0] !== 'number' || typeof p[1] !== 'number' ||
          !Number.isFinite(p[0]) || !Number.isFinite(p[1])) {
        throw new Error(label + '[' + i + '] must be a numeric [x, y] pair');
      }
    }
  };
  check(inTangents, 'inTangents');
  check(outTangents, 'outTangents');
}

/** Zero tangents (corner points) for a vertex list. */
export function zeroTangents(count: number): number[][] {
  const out: number[][] = [];
  for (let i = 0; i < count; i++) {
    out.push([0, 0]);
  }
  return out;
}

/**
 * Emit ES3 that builds a Shape object into the variable `varName`.
 *
 * Tangents are RELATIVE to their own vertex, not absolute comp coordinates.
 * This is the single most common source of mangled curves.
 */
export function emitShapeObject(
  varName: string,
  vertices: number[][],
  inTangents: number[][],
  outTangents: number[][],
  closed: boolean
): string {
  let s = '';
  s += 'var ' + varName + ' = new Shape();\n';
  s += varName + '.vertices = ' + arrayToES3(vertices) + ';\n';
  s += varName + '.inTangents = ' + arrayToES3(inTangents) + ';\n';
  s += varName + '.outTangents = ' + arrayToES3(outTangents) + ';\n';
  s += varName + '.closed = ' + (closed ? 'true' : 'false') + ';\n';
  return s;
}

/**
 * Emit an ES3 helper that finds a path property inside a shape layer by
 * walking Contents recursively. Defines findPathProp(layer, pathName).
 *
 * Passing pathName === null returns the first path found.
 */
function emitFindPathHelper(): string {
  let s = '';
  s += 'function isGroup(p) {\n';
  s += '  return p.propertyType === PropertyType.INDEXED_GROUP || p.propertyType === PropertyType.NAMED_GROUP;\n';
  s += '}\n';
  s += 'function searchPath(group, pathName) {\n';
  s += '  for (var i = 1; i <= group.numProperties; i++) {\n';
  s += '    var child = group.property(i);\n';
  s += '    if (child.matchName === "' + SHAPE_MATCH_NAMES.pathGroup + '") {\n';
  s += '      if (pathName === null || child.name === pathName) {\n';
  s += '        return child.property("' + SHAPE_MATCH_NAMES.path + '");\n';
  s += '      }\n';
  s += '    }\n';
  s += '    if (isGroup(child)) {\n';
  s += '      var found = searchPath(child, pathName);\n';
  s += '      if (found !== null) { return found; }\n';
  s += '    }\n';
  s += '  }\n';
  s += '  return null;\n';
  s += '}\n';
  s += 'function findPathProp(layer, pathName) {\n';
  s += '  var root = layer.property("' + SHAPE_MATCH_NAMES.rootContents + '");\n';
  s += '  if (!root) { throw new Error("Layer is not a shape layer: " + layer.name); }\n';
  s += '  var p = searchPath(root, pathName);\n';
  s += '  if (p === null) {\n';
  s += '    throw new Error(pathName === null ? "No bezier path found on layer: " + layer.name : "Path not found: " + pathName);\n';
  s += '  }\n';
  s += '  return p;\n';
  s += '}\n';
  return s;
}

/**
 * Emit ES3 resolving `targetGroupContents` — the Contents of the shape group
 * we should add things to. Creates a group if the layer has none.
 */
function emitGroupContents(groupIndex?: number): string {
  let s = '';
  s += 'var rootContents = layer.property("' + SHAPE_MATCH_NAMES.rootContents + '");\n';
  s += 'if (!rootContents) { throw new Error("Layer is not a shape layer: " + layer.name); }\n';
  s += 'var vectorGroup = null;\n';
  if (groupIndex !== undefined) {
    s += 'if (' + groupIndex + ' > rootContents.numProperties) {\n';
    s += '  throw new Error("Group index ' + groupIndex + ' out of range; layer has " + rootContents.numProperties + " group(s)");\n';
    s += '}\n';
    s += 'vectorGroup = rootContents.property(' + groupIndex + ');\n';
  } else {
    s += 'for (var gi = 1; gi <= rootContents.numProperties; gi++) {\n';
    s += '  if (rootContents.property(gi).matchName === "' + SHAPE_MATCH_NAMES.group + '") {\n';
    s += '    vectorGroup = rootContents.property(gi);\n';
    s += '    break;\n';
    s += '  }\n';
    s += '}\n';
    s += 'if (vectorGroup === null) {\n';
    s += '  vectorGroup = rootContents.addProperty("' + SHAPE_MATCH_NAMES.group + '");\n';
    s += '}\n';
  }
  s += 'var targetGroupContents = vectorGroup.property("' + SHAPE_MATCH_NAMES.groupContents + '");\n';
  return s;
}

/**
 * Create a bezier path.
 *
 * With no layerIndex/layerName a new shape layer is created; otherwise the path
 * is added to the existing shape layer.
 */
export function generateCreatePath(params: {
  compId?: number;
  compName?: string;
  layerIndex?: number;
  layerName?: string;
  name?: string;
  pathName?: string;
  groupIndex?: number;
  vertices: number[][];
  inTangents?: number[][];
  outTangents?: number[][];
  closed?: boolean;
  fillColor?: { r: number; g: number; b: number };
  strokeColor?: { r: number; g: number; b: number };
  strokeWidth?: number;
  position?: { x: number; y: number };
}): string {
  validatePathPoints(params.vertices, params.inTangents, params.outTangents);

  const inTangents = params.inTangents || zeroTangents(params.vertices.length);
  const outTangents = params.outTangents || zeroTangents(params.vertices.length);
  const closed = params.closed !== undefined ? params.closed : true;

  let script = '';
  script += generateProjectCheck();
  script += generateCompAccess(params.compId, params.compName);

  const usingExistingLayer = params.layerIndex !== undefined || params.layerName !== undefined;
  if (usingExistingLayer) {
    script += generateLayerAccess('comp', params.layerIndex, params.layerName);
  } else {
    script += 'var layer = comp.layers.addShape();\n';
    if (params.name) {
      script += 'layer.name = "' + escapeString(params.name) + '";\n';
    }
  }

  script += emitGroupContents(params.groupIndex);

  script += 'var pathGroup = targetGroupContents.addProperty("' + SHAPE_MATCH_NAMES.pathGroup + '");\n';
  if (params.pathName) {
    script += 'pathGroup.name = "' + escapeString(params.pathName) + '";\n';
  }
  script += 'var pathProp = pathGroup.property("' + SHAPE_MATCH_NAMES.path + '");\n';
  script += emitShapeObject('shapeObj', params.vertices, inTangents, outTangents, closed);
  script += 'pathProp.setValue(shapeObj);\n';
  // Read the name into a plain string NOW. Calling addProperty() on a group
  // invalidates references already held to that group's other children, so
  // touching pathGroup after the fill/stroke below throws
  // "ReferenceError: Object is invalid".
  script += 'var createdPathName = pathGroup.name;\n';

  if (params.fillColor) {
    script += 'var fill = targetGroupContents.addProperty("' + SHAPE_MATCH_NAMES.fill + '");\n';
    script += 'fill.property("' + SHAPE_MATCH_NAMES.fillColor + '").setValue(' + colorToES3(params.fillColor) + ');\n';
  }
  if (params.strokeColor) {
    script += 'var stroke = targetGroupContents.addProperty("' + SHAPE_MATCH_NAMES.stroke + '");\n';
    script += 'stroke.property("' + SHAPE_MATCH_NAMES.strokeColor + '").setValue(' + colorToES3(params.strokeColor) + ');\n';
    if (params.strokeWidth !== undefined) {
      script += 'stroke.property("' + SHAPE_MATCH_NAMES.strokeWidth + '").setValue(' + params.strokeWidth + ');\n';
    }
  }

  if (params.position) {
    script += 'layer.property("ADBE Transform Group").property("ADBE Position").setValue(' + positionToES3(params.position) + ');\n';
  } else if (!usingExistingLayer) {
    script += 'layer.property("ADBE Transform Group").property("ADBE Position").setValue([comp.width / 2, comp.height / 2]);\n';
  }

  script += generateResultObject({
    layerIndex: 'layer.index',
    layerName: 'layer.name',
    pathName: 'createdPathName',
    vertexCount: String(params.vertices.length),
    closed: closed ? 'true' : 'false'
  });

  return wrapInUndoGroup(script, 'Create Path');
}

/**
 * Read a bezier path back, including its keyframes if it is animated.
 */
export function generateGetPath(params: {
  compId?: number;
  compName?: string;
  layerIndex?: number;
  layerName?: string;
  pathName?: string;
}): string {
  let script = '';
  script += generateProjectCheck();
  script += generateCompAccess(params.compId, params.compName);
  script += generateLayerAccess('comp', params.layerIndex, params.layerName);
  script += emitFindPathHelper();

  const pathNameArg = params.pathName ? '"' + escapeString(params.pathName) + '"' : 'null';
  script += 'var pathProp = findPathProp(layer, ' + pathNameArg + ');\n';
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
    pathName: 'pathProp.parentProperty.name',
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
 * Animate a bezier path.
 *
 * Shape-valued properties must be keyed ONE AT A TIME with setValueAtTime().
 * The bulk setter setValuesAtTimes() does not work on them — it only works for
 * numeric properties. Getting this wrong fails in confusing ways.
 */
export function generateSetPathKeyframes(params: {
  compId?: number;
  compName?: string;
  layerIndex?: number;
  layerName?: string;
  pathName?: string;
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
  script += emitFindPathHelper();

  const pathNameArg = params.pathName ? '"' + escapeString(params.pathName) + '"' : 'null';
  script += 'var pathProp = findPathProp(layer, ' + pathNameArg + ');\n';

  // One setValueAtTime() per key. See the note above.
  for (let i = 0; i < params.keyframes.length; i++) {
    const kf = params.keyframes[i];
    const inT = kf.inTangents || zeroTangents(kf.vertices.length);
    const outT = kf.outTangents || zeroTangents(kf.vertices.length);
    const cl = kf.closed !== undefined ? kf.closed : true;
    script += emitShapeObject('kfShape' + i, kf.vertices, inT, outT, cl);
    script += 'pathProp.setValueAtTime(' + kf.time + ', kfShape' + i + ');\n';
  }

  script += generateResultObject({
    layerName: 'layer.name',
    pathName: 'pathProp.parentProperty.name',
    keysWritten: String(params.keyframes.length),
    numKeys: 'pathProp.numKeys'
  });

  return wrapInUndoGroup(script, 'Set Path Keyframes');
}

/**
 * Add a shape operator (Trim Paths, Repeater, etc) to a shape layer.
 *
 * Operators are appended to the end of the group's Contents, which is what AE
 * does when you add one from the UI: an operator affects the paths above it in
 * the same group.
 */
export function generateAddShapeOperator(params: {
  compId?: number;
  compName?: string;
  layerIndex?: number;
  layerName?: string;
  operator: string;
  groupIndex?: number;
  name?: string;
  properties?: Record<string, number | number[]>;
}): string {
  const matchName = SHAPE_OPERATORS[params.operator];
  if (!matchName) {
    throw new Error(
      'Unknown shape operator: "' + params.operator + '". Valid operators: ' +
      Object.keys(SHAPE_OPERATORS).join(', ')
    );
  }

  let script = '';
  script += generateProjectCheck();
  script += generateCompAccess(params.compId, params.compName);
  script += generateLayerAccess('comp', params.layerIndex, params.layerName);
  script += emitGroupContents(params.groupIndex);

  script += 'var op = targetGroupContents.addProperty("' + matchName + '");\n';
  if (params.name) {
    script += 'op.name = "' + escapeString(params.name) + '";\n';
  }

  if (params.properties) {
    const propMap = SHAPE_OPERATOR_PROPERTIES[params.operator] || {};
    for (const key in params.properties) {
      if (!params.properties.hasOwnProperty(key)) continue;
      const propMatchName = propMap[key];
      if (!propMatchName) {
        throw new Error(
          'Unknown property "' + key + '" for operator "' + params.operator + '". Valid: ' +
          (Object.keys(propMap).join(', ') || '(none settable)')
        );
      }
      const value = params.properties[key];
      const valueES3 = Array.isArray(value) ? arrayToES3(value) : String(value);
      script += 'op.property("' + propMatchName + '").setValue(' + valueES3 + ');\n';
    }
  }

  script += generateResultObject({
    layerName: 'layer.name',
    operator: '"' + escapeString(params.operator) + '"',
    matchName: 'op.matchName',
    name: 'op.name'
  });

  return wrapInUndoGroup(script, 'Add Shape Operator');
}
