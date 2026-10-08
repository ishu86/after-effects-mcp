/**
 * 3D Generators
 *
 * Camera, light, material, geometry and 3D transform control.
 *
 * THE CENTRAL PROBLEM this module works around: on a 3D layer,
 * layer.property(matchName) returns a live object even when the property
 * cannot actually be set. Setting it then throws
 *
 *   "Can not 'set value' with this property, because the property or a
 *    parent property is hidden."
 *
 * and .active / .elided / .enabled all report the SAME values in the working
 * and failing cases, so there is no flag to test first. Extrusion on a Classic
 * 3D comp is the common case. Every setter here therefore applies properties
 * individually and reports which landed and which did not, with a renderer hint
 * when the failures look renderer-related, rather than aborting on the first one
 * or silently doing nothing.
 *
 * All match names verified empirically against After Effects 26.5.
 */

import {
  escapeString,
  colorToES3,
  arrayToES3,
  generateCompAccess,
  generateLayerAccess,
  generateProjectCheck,
  generateResultObject,
  wrapInUndoGroup
} from './helpers.js';

/**
 * comp.renderers values, with the capabilities each actually permits.
 *
 * NOTE: "ADBE Advanced 3d" is NOT the Advanced 3D renderer - it is the legacy
 * Classic renderer and the default for new comps. Verified by behaviour:
 * extrusion, environment layers, shadow colour and reflections are all refused
 * under it.
 */
export const RENDERERS: Record<string, string> = {
  classic: 'ADBE Advanced 3d',
  advanced: 'ADBE Calder',
  cinema4d: 'ADBE Ernst'
};

/** Renderers under which extrusion and bevel can actually be set. */
export const EXTRUSION_RENDERERS = ['ADBE Calder', 'ADBE Ernst'];

export const TRANSFORM_3D_PROPERTIES: Record<string, string> = {
  anchorPoint: 'ADBE Anchor Point',
  position: 'ADBE Position',
  scale: 'ADBE Scale',
  orientation: 'ADBE Orientation',
  rotationX: 'ADBE Rotate X',
  rotationY: 'ADBE Rotate Y',
  rotationZ: 'ADBE Rotate Z',
  opacity: 'ADBE Opacity'
};

export const MATERIAL_PROPERTIES: Record<string, string> = {
  castsShadows: 'ADBE Casts Shadows',
  lightTransmission: 'ADBE Light Transmission',
  acceptsShadows: 'ADBE Accepts Shadows',
  acceptsLights: 'ADBE Accepts Lights',
  shadowColor: 'ADBE Shadow Color',
  appearsInReflections: 'ADBE Appears in Reflections',
  ambient: 'ADBE Ambient Coefficient',
  diffuse: 'ADBE Diffuse Coefficient',
  specularIntensity: 'ADBE Specular Coefficient',
  specularShininess: 'ADBE Shininess Coefficient',
  metal: 'ADBE Metal Coefficient',
  reflectionIntensity: 'ADBE Reflection Coefficient',
  reflectionSharpness: 'ADBE Glossiness Coefficient',
  reflectionRolloff: 'ADBE Fresnel Coefficient',
  transparency: 'ADBE Transparency Coefficient',
  transparencyRolloff: 'ADBE Transp Rolloff',
  indexOfRefraction: 'ADBE Index of Refraction'
};

export const CAMERA_PROPERTIES: Record<string, string> = {
  zoom: 'ADBE Camera Zoom',
  depthOfField: 'ADBE Camera Depth of Field',
  focusDistance: 'ADBE Camera Focus Distance',
  aperture: 'ADBE Camera Aperture',
  blurLevel: 'ADBE Camera Blur Level',
  focusAreaWidth: 'ADBE Camera Focus Area Width',
  nearFarBlurLevel: 'ADBE Camera Split Blur Level',
  irisShape: 'ADBE Iris Shape',
  irisRotation: 'ADBE Iris Rotation',
  irisRoundness: 'ADBE Iris Roundness',
  irisAspectRatio: 'ADBE Iris Aspect Ratio',
  irisDiffractionFringe: 'ADBE Iris Diffraction Fringe',
  highlightGain: 'ADBE Iris Highlight Gain',
  highlightThreshold: 'ADBE Iris Highlight Threshold',
  // Adobe's own typo - "Hightlight". Must be spelled wrong to work.
  highlightSaturation: 'ADBE Iris Hightlight Saturation'
};

export const LIGHT_PROPERTIES: Record<string, string> = {
  intensity: 'ADBE Light Intensity',
  color: 'ADBE Light Color',
  coneAngle: 'ADBE Light Cone Angle',
  // The un-suffixed "ADBE Light Cone Feather" is the deprecated one.
  coneFeather: 'ADBE Light Cone Feather 2',
  falloff: 'ADBE Light Falloff Type',
  radius: 'ADBE Light Falloff Start',
  falloffDistance: 'ADBE Light Falloff Distance',
  castsShadows: 'ADBE Casts Shadows',
  shadowDarkness: 'ADBE Light Shadow Darkness',
  shadowDiffusion: 'ADBE Light Shadow Diffusion',
  backgroundVisible: 'ADBE Light Backgd Visible',
  backgroundOpacity: 'ADBE Light Backgd Opacity',
  backgroundBlur: 'ADBE Light Backgd Blur'
};

/**
 * "Geometry Options" is TWO groups sharing one display name.
 */
export const EXTRUSION_PROPERTIES: Record<string, string> = {
  bevelStyle: 'ADBE Bevel Styles',
  bevelDirection: 'ADBE Bevel Direction',
  bevelDepth: 'ADBE Bevel Depth',
  holeBevelDepth: 'ADBE Hole Bevel Depth',
  extrusionDepth: 'ADBE Extrsn Depth'
};

export const PLANE_PROPERTIES: Record<string, string> = {
  curvature: 'ADBE Plane Curvature',
  segments: 'ADBE Plane Subdivision'
};

const GROUP_MATCH_NAMES = {
  transform: 'ADBE Transform Group',
  material: 'ADBE Material Options Group',
  camera: 'ADBE Camera Options Group',
  light: 'ADBE Light Options Group',
  extrusion: 'ADBE Extrsn Options Group',
  plane: 'ADBE Plane Options Group'
};

/**
 * Emit the shared ES3 helper that applies one property and records the outcome
 * instead of throwing. Defines applied/failed arrays and trySet().
 */
function emitTrySetHelper(): string {
  let s = '';
  s += 'var applied = [];\n';
  s += 'var failed = [];\n';
  s += 'function trySet(group, mn, label, val) {\n';
  s += '  if (!group) {\n';
  s += '    failed.push({ property: label, matchName: mn, reason: "property group not present on this layer" });\n';
  s += '    return;\n';
  s += '  }\n';
  s += '  var p = group.property(mn);\n';
  s += '  if (!p) {\n';
  s += '    failed.push({ property: label, matchName: mn, reason: "property not present on this layer" });\n';
  s += '    return;\n';
  s += '  }\n';
  s += '  try {\n';
  s += '    p.setValue(val);\n';
  s += '    applied.push(label);\n';
  s += '  } catch (e) {\n';
  s += '    var msg = e.toString();\n';
  s += '    msg = msg.replace("Error: After Effects error: ", "");\n';
  s += '    failed.push({ property: label, matchName: mn, reason: msg });\n';
  s += '  }\n';
  s += '}\n';
  return s;
}

/**
 * Which renderers actually permit a given property to be set.
 *
 * Measured directly on AE 26.5 - this is NOT a hierarchy. Each renderer
 * exposes a different subset: the classic camera model (blur level, iris,
 * highlights) exists only under "classic", focus area width and shadow colour
 * only under "advanced", and the reflection properties only under "cinema4d",
 * which hides the camera options entirely.
 *
 * Properties absent from this table are not known to be renderer-gated and get
 * the generic hint instead of a specific one.
 */
const PROPERTY_RENDERER_SUPPORT: Record<string, string[]> = {
  'ADBE Camera Blur Level': ['classic'],
  'ADBE Iris Shape': ['classic'],
  'ADBE Iris Rotation': ['classic'],
  'ADBE Iris Roundness': ['classic'],
  'ADBE Iris Aspect Ratio': ['classic'],
  'ADBE Iris Diffraction Fringe': ['classic'],
  'ADBE Iris Highlight Gain': ['classic'],
  'ADBE Iris Highlight Threshold': ['classic'],
  'ADBE Iris Hightlight Saturation': ['classic'],
  'ADBE Camera Depth of Field': ['classic', 'advanced'],
  'ADBE Camera Focus Distance': ['classic', 'advanced'],
  'ADBE Camera Aperture': ['classic', 'advanced'],
  'ADBE Camera Focus Area Width': ['advanced'],
  'ADBE Shadow Color': ['advanced'],
  'ADBE Appears in Reflections': ['cinema4d'],
  'ADBE Reflection Coefficient': ['cinema4d'],
  'ADBE Extrsn Depth': ['advanced', 'cinema4d'],
  'ADBE Bevel Styles': ['advanced', 'cinema4d'],
  'ADBE Bevel Direction': ['advanced', 'cinema4d'],
  'ADBE Bevel Depth': ['advanced', 'cinema4d'],
  'ADBE Hole Bevel Depth': ['advanced', 'cinema4d']
};

/** Emit the support table as an ES3 object literal. */
function emitSupportTable(): string {
  let s = 'var rendererSupport = {};\n';
  for (const mn in PROPERTY_RENDERER_SUPPORT) {
    if (!Object.prototype.hasOwnProperty.call(PROPERTY_RENDERER_SUPPORT, mn)) continue;
    const list = PROPERTY_RENDERER_SUPPORT[mn].map(r => '"' + r + '"').join(', ');
    s += 'rendererSupport["' + mn + '"] = [' + list + '];\n';
  }
  return s;
}

/**
 * Annotate each hidden failure with the renderers that DO expose it, and emit a
 * short summary hint.
 *
 * The earlier version told callers to switch to "advanced" even when they were
 * already on it, which was worse than saying nothing.
 */
function emitRendererHint(): string {
  let s = '';
  s += emitSupportTable();
  s += 'var rendererKey = "unknown";\n';
  s += 'if (comp.renderer === "ADBE Advanced 3d") { rendererKey = "classic"; }\n';
  s += 'else if (comp.renderer === "ADBE Calder") { rendererKey = "advanced"; }\n';
  s += 'else if (comp.renderer === "ADBE Ernst") { rendererKey = "cinema4d"; }\n';
  s += 'var hint = null;\n';
  s += 'var hiddenCount = 0;\n';
  s += 'for (var fi = 0; fi < failed.length; fi++) {\n';
  s += '  if (failed[fi].reason.indexOf("hidden") === -1) { continue; }\n';
  s += '  hiddenCount++;\n';
  s += '  var support = rendererSupport[failed[fi].matchName];\n';
  s += '  if (support) {\n';
  s += '    failed[fi].availableUnderRenderers = support;\n';
  s += '  }\n';
  s += '}\n';
  s += 'if (hiddenCount > 0) {\n';
  s += '  hint = hiddenCount + " property(s) refused as hidden. This comp uses the \\"" + rendererKey + "\\" renderer (" + comp.renderer + "). ';
  s += 'Each renderer exposes a different subset, so check availableUnderRenderers on each failure and switch with set_comp_renderer if needed. ';
  s += 'A property with no availableUnderRenderers is not renderer-gated - it likely needs a prerequisite, such as Depth of Field being enabled, or a layer type that supports it (extrusion is text and shape layers only).";\n';
  s += '}\n';
  return s;
}

/** Convert a JS value into an ES3 literal suitable for setValue. */
function valueToES3(value: unknown): string {
  if (typeof value === 'boolean') {
    // AE checkbox properties take 1/0.
    return value ? '1' : '0';
  }
  if (typeof value === 'number') {
    return String(value);
  }
  if (Array.isArray(value)) {
    return arrayToES3(value as unknown[]);
  }
  if (value && typeof value === 'object') {
    const c = value as { r?: number; g?: number; b?: number };
    if (typeof c.r === 'number' && typeof c.g === 'number' && typeof c.b === 'number') {
      return colorToES3(c as { r: number; g: number; b: number });
    }
  }
  throw new Error('Unsupported value type: ' + JSON.stringify(value));
}

/**
 * Emit trySet() calls for every provided key in a property map.
 * Returns the emitted script plus how many properties were requested.
 */
function emitPropertyApplications(
  groupVar: string,
  map: Record<string, string>,
  params: Record<string, unknown>,
  label: string
): { script: string; count: number } {
  let s = '';
  let count = 0;
  for (const key in params) {
    if (!Object.prototype.hasOwnProperty.call(params, key)) continue;
    if (!Object.prototype.hasOwnProperty.call(map, key)) continue;
    const value = params[key];
    if (value === undefined) continue;
    s += 'trySet(' + groupVar + ', "' + map[key] + '", "' + escapeString(key) + '", ' + valueToES3(value) + ');\n';
    count++;
  }
  if (count === 0) {
    throw new Error(
      'No ' + label + ' properties supplied. Valid keys: ' + Object.keys(map).join(', ')
    );
  }
  return { script: s, count };
}

/** Reject unknown keys early with a helpful list. */
function rejectUnknownKeys(
  params: Record<string, unknown>,
  map: Record<string, string>,
  reserved: string[],
  label: string
): void {
  for (const key in params) {
    if (!Object.prototype.hasOwnProperty.call(params, key)) continue;
    if (params[key] === undefined) continue;
    if (reserved.indexOf(key) !== -1) continue;
    if (!Object.prototype.hasOwnProperty.call(map, key)) {
      throw new Error(
        'Unknown ' + label + ' property "' + key + '". Valid: ' + Object.keys(map).join(', ')
      );
    }
  }
}

const LAYER_REF_KEYS = ['compId', 'compName', 'layerIndex', 'layerName'];

/**
 * Set the composition's 3D renderer.
 *
 * This is the unlock for most of the rest of this module - extrusion, bevel,
 * environment layers and reflections are all inert under the Classic renderer.
 */
export function generateSetCompRenderer(params: {
  compId?: number;
  compName?: string;
  renderer: string;
}): string {
  let target: string;
  if (Object.prototype.hasOwnProperty.call(RENDERERS, params.renderer)) {
    target = RENDERERS[params.renderer];
  } else if (params.renderer && params.renderer.indexOf('ADBE ') === 0) {
    target = params.renderer;
  } else {
    throw new Error(
      'renderer must be one of: ' + Object.keys(RENDERERS).join(', ') +
      ' (or a raw "ADBE ..." string)'
    );
  }

  let script = '';
  script += generateProjectCheck();
  script += generateCompAccess(params.compId, params.compName);

  script += 'var available = comp.renderers;\n';
  script += 'var found = false;\n';
  script += 'for (var i = 0; i < available.length; i++) {\n';
  script += '  if (available[i] === "' + escapeString(target) + '") { found = true; break; }\n';
  script += '}\n';
  script += 'if (!found) {\n';
  script += '  throw new Error("Renderer \\"' + escapeString(target) + '\\" is not available in this After Effects install. Available: " + available.join(", "));\n';
  script += '}\n';
  script += 'var previous = comp.renderer;\n';
  script += 'comp.renderer = "' + escapeString(target) + '";\n';

  script += generateResultObject({
    compName: 'comp.name',
    previousRenderer: 'previous',
    renderer: 'comp.renderer',
    availableRenderers: 'available',
    supportsExtrusion: 'comp.renderer !== "ADBE Advanced 3d"'
  });

  return wrapInUndoGroup(script, 'Set Comp Renderer');
}

/**
 * Enable 3D on a layer and set its 3D transform properties.
 *
 * Note: the separated X/Y/Z Position properties (ADBE Position_0/1/2) are
 * read-only unless Separate Dimensions is enabled, so position is set through
 * the combined ADBE Position property.
 */
export function generateSet3DLayer(params: {
  compId?: number;
  compName?: string;
  layerIndex?: number;
  layerName?: string;
  enable3D?: boolean;
  anchorPoint?: number[];
  position?: number[];
  scale?: number[];
  orientation?: number[];
  rotationX?: number;
  rotationY?: number;
  rotationZ?: number;
  opacity?: number;
}): string {
  rejectUnknownKeys(
    params as Record<string, unknown>,
    TRANSFORM_3D_PROPERTIES,
    LAYER_REF_KEYS.concat(['enable3D']),
    '3D transform'
  );

  let script = '';
  script += generateProjectCheck();
  script += generateCompAccess(params.compId, params.compName);
  script += generateLayerAccess('comp', params.layerIndex, params.layerName);
  script += emitTrySetHelper();

  if (params.enable3D !== undefined) {
    script += 'if (typeof layer.threeDLayer === "undefined") {\n';
    script += '  throw new Error("Layer does not support 3D: " + layer.name);\n';
    script += '}\n';
    script += 'layer.threeDLayer = ' + (params.enable3D ? 'true' : 'false') + ';\n';
  }

  script += 'var xform = layer.property("' + GROUP_MATCH_NAMES.transform + '");\n';

  // Only emit property applications when at least one was supplied; toggling
  // 3D alone is a valid call.
  const transformKeys = Object.keys(TRANSFORM_3D_PROPERTIES).filter(
    k => (params as Record<string, unknown>)[k] !== undefined
  );
  if (transformKeys.length > 0) {
    script += emitPropertyApplications(
      'xform',
      TRANSFORM_3D_PROPERTIES,
      params as Record<string, unknown>,
      '3D transform'
    ).script;
  }

  script += emitRendererHint();

  script += generateResultObject({
    layerName: 'layer.name',
    is3D: 'layer.threeDLayer',
    applied: 'applied',
    failed: 'failed',
    hint: 'hint'
  });

  return wrapInUndoGroup(script, 'Set 3D Layer');
}

/**
 * Set Material Options on a 3D layer.
 */
export function generateSetMaterialOptions(params: Record<string, unknown>): string {
  rejectUnknownKeys(params, MATERIAL_PROPERTIES, LAYER_REF_KEYS, 'material');

  let script = '';
  script += generateProjectCheck();
  script += generateCompAccess(params.compId as number, params.compName as string);
  script += generateLayerAccess('comp', params.layerIndex as number, params.layerName as string);
  script += emitTrySetHelper();

  script += 'var matGroup = layer.property("' + GROUP_MATCH_NAMES.material + '");\n';
  script += 'if (!matGroup) {\n';
  script += '  throw new Error("Layer has no Material Options. Enable 3D on it first (set_3d_layer with enable3D: true).");\n';
  script += '}\n';
  script += emitPropertyApplications('matGroup', MATERIAL_PROPERTIES, params, 'material').script;
  script += emitRendererHint();

  script += generateResultObject({
    layerName: 'layer.name',
    applied: 'applied',
    failed: 'failed',
    hint: 'hint'
  });

  return wrapInUndoGroup(script, 'Set Material Options');
}

/**
 * Set Geometry Options - extrusion/bevel, or plane curvature/segments.
 *
 * Extrusion is gated on the comp renderer before anything is attempted, because
 * the failure mode otherwise is an opaque "property is hidden" error.
 */
export function generateSetGeometryOptions(params: Record<string, unknown>): string {
  const combined: Record<string, string> = { ...EXTRUSION_PROPERTIES, ...PLANE_PROPERTIES };
  rejectUnknownKeys(params, combined, LAYER_REF_KEYS, 'geometry');

  const wantsExtrusion = Object.keys(EXTRUSION_PROPERTIES).some(k => params[k] !== undefined);
  const wantsPlane = Object.keys(PLANE_PROPERTIES).some(k => params[k] !== undefined);

  let script = '';
  script += generateProjectCheck();
  script += generateCompAccess(params.compId as number, params.compName as string);
  script += generateLayerAccess('comp', params.layerIndex as number, params.layerName as string);
  script += emitTrySetHelper();

  if (wantsExtrusion) {
    // Fail fast with an actionable message rather than letting AE say "hidden".
    script += 'var rend = comp.renderer;\n';
    script += 'var extrusionOK = false;\n';
    for (let i = 0; i < EXTRUSION_RENDERERS.length; i++) {
      script += 'if (rend === "' + EXTRUSION_RENDERERS[i] + '") { extrusionOK = true; }\n';
    }
    script += 'if (!extrusionOK) {\n';
    script += '  throw new Error("Extrusion and bevel are unavailable under renderer \\"" + rend + "\\" (the Classic renderer). Call set_comp_renderer with \\"advanced\\" or \\"cinema4d\\" first.");\n';
    script += '}\n';
    script += 'if (!layer.threeDLayer) {\n';
    script += '  throw new Error("Layer is not 3D. Call set_3d_layer with enable3D: true first.");\n';
    script += '}\n';
    script += 'var extrGroup = layer.property("' + GROUP_MATCH_NAMES.extrusion + '");\n';
    script += emitPropertyApplications('extrGroup', EXTRUSION_PROPERTIES, params, 'geometry').script;
  }

  if (wantsPlane) {
    script += 'var planeGroup = layer.property("' + GROUP_MATCH_NAMES.plane + '");\n';
    script += emitPropertyApplications('planeGroup', PLANE_PROPERTIES, params, 'geometry').script;
  }

  script += emitRendererHint();

  script += generateResultObject({
    layerName: 'layer.name',
    renderer: 'comp.renderer',
    applied: 'applied',
    failed: 'failed',
    hint: 'hint'
  });

  return wrapInUndoGroup(script, 'Set Geometry Options');
}

/**
 * Set Camera Options on a camera layer.
 */
export function generateSetCameraOptions(params: Record<string, unknown>): string {
  rejectUnknownKeys(params, CAMERA_PROPERTIES, LAYER_REF_KEYS, 'camera');

  let script = '';
  script += generateProjectCheck();
  script += generateCompAccess(params.compId as number, params.compName as string);
  script += generateLayerAccess('comp', params.layerIndex as number, params.layerName as string);
  script += emitTrySetHelper();

  script += 'var camGroup = layer.property("' + GROUP_MATCH_NAMES.camera + '");\n';
  script += 'if (!camGroup) {\n';
  script += '  throw new Error("Layer is not a camera: " + layer.name);\n';
  script += '}\n';
  script += emitPropertyApplications('camGroup', CAMERA_PROPERTIES, params, 'camera').script;
  script += emitRendererHint();

  script += generateResultObject({
    layerName: 'layer.name',
    applied: 'applied',
    failed: 'failed',
    hint: 'hint'
  });

  return wrapInUndoGroup(script, 'Set Camera Options');
}

/**
 * Set Light Options on a light layer.
 */
export function generateSetLightOptions(params: Record<string, unknown>): string {
  rejectUnknownKeys(params, LIGHT_PROPERTIES, LAYER_REF_KEYS, 'light');

  let script = '';
  script += generateProjectCheck();
  script += generateCompAccess(params.compId as number, params.compName as string);
  script += generateLayerAccess('comp', params.layerIndex as number, params.layerName as string);
  script += emitTrySetHelper();

  script += 'var lightGroup = layer.property("' + GROUP_MATCH_NAMES.light + '");\n';
  script += 'if (!lightGroup) {\n';
  script += '  throw new Error("Layer is not a light: " + layer.name);\n';
  script += '}\n';
  script += emitPropertyApplications('lightGroup', LIGHT_PROPERTIES, params, 'light').script;
  script += emitRendererHint();

  script += generateResultObject({
    layerName: 'layer.name',
    applied: 'applied',
    failed: 'failed',
    hint: 'hint'
  });

  return wrapInUndoGroup(script, 'Set Light Options');
}

/**
 * Read the 3D state of a composition and optionally one layer, so callers can
 * see what is actually settable before trying.
 */
export function generateGet3DInfo(params: {
  compId?: number;
  compName?: string;
  layerIndex?: number;
  layerName?: string;
}): string {
  let script = '';
  script += generateProjectCheck();
  script += generateCompAccess(params.compId, params.compName);

  const hasLayer = params.layerIndex !== undefined || params.layerName !== undefined;
  if (hasLayer) {
    script += generateLayerAccess('comp', params.layerIndex, params.layerName);
  }

  script += 'function readGroup(grp) {\n';
  script += '  if (!grp) { return null; }\n';
  script += '  var vals = {};\n';
  script += '  for (var i = 1; i <= grp.numProperties; i++) {\n';
  script += '    var p = grp.property(i);\n';
  script += '    try { vals[p.matchName] = p.value; } catch (e) { vals[p.matchName] = null; }\n';
  script += '  }\n';
  script += '  return vals;\n';
  script += '}\n';

  const resultProps: Record<string, string> = {
    compName: 'comp.name',
    renderer: 'comp.renderer',
    availableRenderers: 'comp.renderers',
    supportsExtrusion: 'comp.renderer !== "ADBE Advanced 3d"'
  };

  if (hasLayer) {
    script += 'var is3D = layer.threeDLayer ? true : false;\n';
    script += 'var matGroup = layer.property("' + GROUP_MATCH_NAMES.material + '");\n';
    script += 'var camGroup = layer.property("' + GROUP_MATCH_NAMES.camera + '");\n';
    script += 'var lightGroup = layer.property("' + GROUP_MATCH_NAMES.light + '");\n';
    script += 'var extrGroup = layer.property("' + GROUP_MATCH_NAMES.extrusion + '");\n';
    script += 'var planeGroup = layer.property("' + GROUP_MATCH_NAMES.plane + '");\n';
    resultProps.layerName = 'layer.name';
    resultProps.is3D = 'is3D';
    resultProps.materialOptions = 'readGroup(matGroup)';
    resultProps.cameraOptions = 'readGroup(camGroup)';
    resultProps.lightOptions = 'readGroup(lightGroup)';
    resultProps.geometryExtrusion = 'readGroup(extrGroup)';
    resultProps.geometryPlane = 'readGroup(planeGroup)';
  }

  script += generateResultObject(resultProps);

  return script;
}
