/**
 * Layer-related Script Generators
 *
 * Generates ES3-compatible ExtendScript for layer operations.
 */

import {
  escapeString,
  generateProjectCheck,
  generateCompAccess,
  generateLayerAccess,
  colorToES3,
  positionToES3,
  arrayToES3,
  wrapInUndoGroup,
  generateResultObject,
  generateJustification,
  generateBlendMode,
  generateLightType,
  generateCameraType
} from './helpers.js';

/**
 * Generate script to add a solid layer
 */
export function generateAddSolidLayer(params: {
  compId?: number;
  compName?: string;
  name: string;
  color: { r: number; g: number; b: number };
  width?: number;
  height?: number;
  duration?: number;
  startTime?: number;
}): string {
  let script = '';
  script += generateProjectCheck();
  script += generateCompAccess(params.compId, params.compName);

  const width = params.width || 'comp.width';
  const height = params.height || 'comp.height';

  script += 'var solidWidth = ' + width + ';\n';
  script += 'var solidHeight = ' + height + ';\n';
  script += 'var layer = comp.layers.addSolid(\n';
  script += '  ' + colorToES3(params.color) + ',\n';
  script += '  "' + escapeString(params.name) + '",\n';
  script += '  solidWidth,\n';
  script += '  solidHeight,\n';
  script += '  1\n'; // pixel aspect ratio
  script += ');\n';

  if (params.duration !== undefined) {
    script += 'layer.outPoint = layer.inPoint + ' + params.duration + ';\n';
  }
  if (params.startTime !== undefined) {
    script += 'layer.startTime = ' + params.startTime + ';\n';
  }

  script += generateResultObject({
    index: 'layer.index',
    name: 'layer.name',
    inPoint: 'layer.inPoint',
    outPoint: 'layer.outPoint'
  });

  return wrapInUndoGroup(script, 'Add Solid Layer');
}

/**
 * Generate script to add a text layer
 */
export function generateAddTextLayer(params: {
  compId?: number;
  compName?: string;
  text: string;
  name?: string;
  position?: { x: number; y: number };
  fontSize?: number;
  fontFamily?: string;
  color?: { r: number; g: number; b: number };
  justification?: string;
}): string {
  let script = '';
  script += generateProjectCheck();
  script += generateCompAccess(params.compId, params.compName);

  script += 'var layer = comp.layers.addText("' + escapeString(params.text) + '");\n';

  if (params.name) {
    script += 'layer.name = "' + escapeString(params.name) + '";\n';
  }

  // Get text document for styling
  script += 'var textProp = layer.property("Source Text");\n';
  script += 'var textDoc = textProp.value;\n';

  if (params.fontSize) {
    script += 'textDoc.fontSize = ' + params.fontSize + ';\n';
  }
  if (params.fontFamily) {
    script += 'textDoc.font = "' + escapeString(params.fontFamily) + '";\n';
  }
  if (params.color) {
    script += 'textDoc.fillColor = ' + colorToES3(params.color) + ';\n';
  }
  if (params.justification) {
    script += 'textDoc.justification = ' + generateJustification(params.justification) + ';\n';
  }

  script += 'textProp.setValue(textDoc);\n';

  if (params.position) {
    script += 'layer.property("Position").setValue(' + positionToES3(params.position) + ');\n';
  }

  script += generateResultObject({
    index: 'layer.index',
    name: 'layer.name',
    text: '"' + escapeString(params.text) + '"'
  });

  return wrapInUndoGroup(script, 'Add Text Layer');
}

/**
 * Generate script to add an advanced text layer with more options
 */
export function generateAddTextLayerAdvanced(params: {
  compId?: number;
  compName?: string;
  text: string;
  name?: string;
  position?: { x: number; y: number };
  fontSize?: number;
  fontFamily?: string;
  color?: { r: number; g: number; b: number };
  justification?: string;
  tracking?: number;
  leading?: number;
  baselineShift?: number;
  strokeColor?: { r: number; g: number; b: number };
  strokeWidth?: number;
  strokeOverFill?: boolean;
}): string {
  let script = '';
  script += generateProjectCheck();
  script += generateCompAccess(params.compId, params.compName);

  script += 'var layer = comp.layers.addText("' + escapeString(params.text) + '");\n';

  if (params.name) {
    script += 'layer.name = "' + escapeString(params.name) + '";\n';
  }

  script += 'var textProp = layer.property("Source Text");\n';
  script += 'var textDoc = textProp.value;\n';

  if (params.fontSize) {
    script += 'textDoc.fontSize = ' + params.fontSize + ';\n';
  }
  if (params.fontFamily) {
    script += 'textDoc.font = "' + escapeString(params.fontFamily) + '";\n';
  }
  if (params.color) {
    script += 'textDoc.fillColor = ' + colorToES3(params.color) + ';\n';
  }
  if (params.justification) {
    script += 'textDoc.justification = ' + generateJustification(params.justification) + ';\n';
  }
  if (params.tracking !== undefined) {
    script += 'textDoc.tracking = ' + params.tracking + ';\n';
  }
  if (params.leading !== undefined) {
    script += 'textDoc.leading = ' + params.leading + ';\n';
  }
  if (params.baselineShift !== undefined) {
    script += 'textDoc.baselineShift = ' + params.baselineShift + ';\n';
  }
  if (params.strokeColor) {
    script += 'textDoc.applyStroke = true;\n';
    script += 'textDoc.strokeColor = ' + colorToES3(params.strokeColor) + ';\n';
  }
  if (params.strokeWidth !== undefined) {
    script += 'textDoc.strokeWidth = ' + params.strokeWidth + ';\n';
  }
  if (params.strokeOverFill !== undefined) {
    script += 'textDoc.strokeOverFill = ' + params.strokeOverFill + ';\n';
  }

  script += 'textProp.setValue(textDoc);\n';

  if (params.position) {
    script += 'layer.property("Position").setValue(' + positionToES3(params.position) + ');\n';
  }

  script += generateResultObject({
    index: 'layer.index',
    name: 'layer.name',
    text: '"' + escapeString(params.text) + '"'
  });

  return wrapInUndoGroup(script, 'Add Text Layer');
}

/**
 * Generate script to add a shape layer
 */
export function generateAddShapeLayer(params: {
  compId?: number;
  compName?: string;
  name?: string;
  shape?: string;
  size?: { width: number; height: number };
  position?: { x: number; y: number };
  fillColor?: { r: number; g: number; b: number };
  strokeColor?: { r: number; g: number; b: number };
  strokeWidth?: number;
  points?: number;
  innerRadius?: number;
  outerRadius?: number;
  roundness?: number;
}): string {
  let script = '';
  script += generateProjectCheck();
  script += generateCompAccess(params.compId, params.compName);

  script += 'var layer = comp.layers.addShape();\n';

  if (params.name) {
    script += 'layer.name = "' + escapeString(params.name) + '";\n';
  }

  // Add shape content.
  // Everything below addresses properties by matchName rather than English
  // display name. property("Size") returns null on a non-English After Effects
  // and the script then dies on a null dereference.
  script += 'var contents = layer.property("ADBE Root Vectors Group");\n';
  script += 'var shapeGroup = contents.addProperty("ADBE Vector Group");\n';
  script += 'var shapeContents = shapeGroup.property("ADBE Vectors Group");\n';

  const shape = params.shape || 'rectangle';
  const sizeW = params.size?.width || 200;
  const sizeH = params.size?.height || 200;

  if (shape === 'rectangle') {
    script += 'var rect = shapeContents.addProperty("ADBE Vector Shape - Rect");\n';
    script += 'rect.property("ADBE Vector Rect Size").setValue([' + sizeW + ', ' + sizeH + ']);\n';
    if (params.roundness !== undefined) {
      script += 'rect.property("ADBE Vector Rect Roundness").setValue(' + params.roundness + ');\n';
    }
  } else if (shape === 'ellipse') {
    script += 'var ellipse = shapeContents.addProperty("ADBE Vector Shape - Ellipse");\n';
    script += 'ellipse.property("ADBE Vector Ellipse Size").setValue([' + sizeW + ', ' + sizeH + ']);\n';
  } else if (shape === 'polygon') {
    script += 'var poly = shapeContents.addProperty("ADBE Vector Shape - Star");\n';
    // Polystar Type is 1 = STAR, 2 = POLYGON (verified: Inner Radius is only
    // settable under 1). These were reversed, so 'polygon' silently drew a star.
    script += 'poly.property("ADBE Vector Star Type").setValue(2);\n'; // polygon
    script += 'poly.property("ADBE Vector Star Points").setValue(' + (params.points || 6) + ');\n';
    script += 'poly.property("ADBE Vector Star Outer Radius").setValue(' + (params.outerRadius || 100) + ');\n';
  } else if (shape === 'star') {
    script += 'var star = shapeContents.addProperty("ADBE Vector Shape - Star");\n';
    script += 'star.property("ADBE Vector Star Type").setValue(1);\n'; // star
    script += 'star.property("ADBE Vector Star Points").setValue(' + (params.points || 5) + ');\n';
    script += 'star.property("ADBE Vector Star Outer Radius").setValue(' + (params.outerRadius || 100) + ');\n';
    script += 'star.property("ADBE Vector Star Inner Radius").setValue(' + (params.innerRadius || 50) + ');\n';
  }

  // Add fill
  if (params.fillColor) {
    script += 'var fill = shapeContents.addProperty("ADBE Vector Graphic - Fill");\n';
    script += 'fill.property("ADBE Vector Fill Color").setValue(' + colorToES3(params.fillColor) + ');\n';
  }

  // Add stroke
  if (params.strokeColor) {
    script += 'var stroke = shapeContents.addProperty("ADBE Vector Graphic - Stroke");\n';
    script += 'stroke.property("ADBE Vector Stroke Color").setValue(' + colorToES3(params.strokeColor) + ');\n';
    if (params.strokeWidth !== undefined) {
      script += 'stroke.property("ADBE Vector Stroke Width").setValue(' + params.strokeWidth + ');\n';
    }
  }

  // Position
  script += 'var xform = layer.property("ADBE Transform Group");\n';
  if (params.position) {
    script += 'xform.property("ADBE Position").setValue(' + positionToES3(params.position) + ');\n';
  } else {
    // Center in comp
    script += 'xform.property("ADBE Position").setValue([comp.width/2, comp.height/2]);\n';
  }

  script += generateResultObject({
    index: 'layer.index',
    name: 'layer.name'
  });

  return wrapInUndoGroup(script, 'Add Shape Layer');
}

/**
 * Generate script to add a null layer
 */
export function generateAddNullLayer(params: {
  compId?: number;
  compName?: string;
  name?: string;
}): string {
  let script = '';
  script += generateProjectCheck();
  script += generateCompAccess(params.compId, params.compName);

  script += 'var layer = comp.layers.addNull();\n';

  if (params.name) {
    script += 'layer.name = "' + escapeString(params.name) + '";\n';
  }

  script += generateResultObject({
    index: 'layer.index',
    name: 'layer.name'
  });

  return wrapInUndoGroup(script, 'Add Null Layer');
}

/**
 * Generate script to add an adjustment layer
 */
export function generateAddAdjustmentLayer(params: {
  compId?: number;
  compName?: string;
  name?: string;
}): string {
  let script = '';
  script += generateProjectCheck();
  script += generateCompAccess(params.compId, params.compName);

  // Create solid and set as adjustment layer
  script += 'var layer = comp.layers.addSolid(\n';
  script += '  [1, 1, 1],\n';
  script += '  "' + escapeString(params.name || 'Adjustment Layer') + '",\n';
  script += '  comp.width,\n';
  script += '  comp.height,\n';
  script += '  1\n';
  script += ');\n';
  script += 'layer.adjustmentLayer = true;\n';

  script += generateResultObject({
    index: 'layer.index',
    name: 'layer.name'
  });

  return wrapInUndoGroup(script, 'Add Adjustment Layer');
}

/**
 * Generate script to add a camera layer
 */
export function generateAddCameraLayer(params: {
  compId?: number;
  compName?: string;
  name?: string;
  type?: string;
  zoom?: number;
}): string {
  let script = '';
  script += generateProjectCheck();
  script += generateCompAccess(params.compId, params.compName);

  const cameraType = params.type || 'ONE_NODE';
  script += 'var layer = comp.layers.addCamera(\n';
  script += '  "' + escapeString(params.name || 'Camera') + '",\n';
  script += '  [comp.width/2, comp.height/2]\n';
  script += ');\n';

  // Set camera type
  if (cameraType === 'TWO_NODE') {
    script += 'layer.autoOrient = AutoOrientType.ALONG_PATH;\n';
  }

  if (params.zoom) {
    script += 'layer.property("ADBE Camera Options Group").property("ADBE Camera Zoom").setValue(' + params.zoom + ');\n';
  }

  script += generateResultObject({
    index: 'layer.index',
    name: 'layer.name'
  });

  return wrapInUndoGroup(script, 'Add Camera Layer');
}

/**
 * Generate script to add a light layer
 */
export function generateAddLightLayer(params: {
  compId?: number;
  compName?: string;
  name?: string;
  type?: string;
  color?: { r: number; g: number; b: number };
  intensity?: number;
}): string {
  let script = '';
  script += generateProjectCheck();
  script += generateCompAccess(params.compId, params.compName);

  const lightType = params.type || 'POINT';
  script += 'var layer = comp.layers.addLight(\n';
  script += '  "' + escapeString(params.name || 'Light') + '",\n';
  script += '  [comp.width/2, comp.height/2]\n';
  script += ');\n';

  script += 'layer.lightType = ' + generateLightType(lightType) + ';\n';

  if (params.color) {
    script += 'layer.property("ADBE Light Options Group").property("ADBE Light Color").setValue(' + colorToES3(params.color) + ');\n';
  }
  if (params.intensity !== undefined) {
    script += 'layer.property("ADBE Light Options Group").property("ADBE Light Intensity").setValue(' + params.intensity + ');\n';
  }

  script += generateResultObject({
    index: 'layer.index',
    name: 'layer.name'
  });

  return wrapInUndoGroup(script, 'Add Light Layer');
}

/**
 * Generate script to add an AV (audio/video) layer from project item
 */
export function generateAddAVLayer(params: {
  compId?: number;
  compName?: string;
  itemId?: number;
  itemName?: string;
  startTime?: number;
}): string {
  let script = '';
  script += generateProjectCheck();
  script += generateCompAccess(params.compId, params.compName);

  // Find the source item
  if (params.itemId) {
    script += 'var sourceItem = app.project.itemByID(' + params.itemId + ');\n';
    script += 'if (!sourceItem) {\n';
    script += '  throw new Error("Item not found with ID: ' + params.itemId + '");\n';
    script += '}\n';
  } else if (params.itemName) {
    script += 'var sourceItem = null;\n';
    script += 'for (var i = 1; i <= app.project.numItems; i++) {\n';
    script += '  if (app.project.item(i).name === "' + escapeString(params.itemName) + '") {\n';
    script += '    sourceItem = app.project.item(i);\n';
    script += '    break;\n';
    script += '  }\n';
    script += '}\n';
    script += 'if (!sourceItem) {\n';
    script += '  throw new Error("Item not found: ' + escapeString(params.itemName) + '");\n';
    script += '}\n';
  } else {
    script += 'throw new Error("itemId or itemName must be provided");\n';
  }

  script += 'var layer = comp.layers.add(sourceItem);\n';

  if (params.startTime !== undefined) {
    script += 'layer.startTime = ' + params.startTime + ';\n';
  }

  script += generateResultObject({
    index: 'layer.index',
    name: 'layer.name',
    source: 'sourceItem.name'
  });

  return wrapInUndoGroup(script, 'Add AV Layer');
}

/**
 * Generate script to precompose layers
 */
export function generatePrecomposeLayers(params: {
  compId?: number;
  compName?: string;
  layerIndices: number[];
  name: string;
  moveAttributes?: boolean;
}): string {
  let script = '';
  script += generateProjectCheck();
  script += generateCompAccess(params.compId, params.compName);

  script += 'var layerIndices = ' + arrayToES3(params.layerIndices) + ';\n';
  script += 'var precompName = "' + escapeString(params.name) + '";\n';
  script += 'var moveAttributes = ' + (params.moveAttributes !== false) + ';\n';

  // Precompose
  // precompose() returns the new CompItem, not the new layer. Reading .index on
  // it throws "TypeError: undefined is not an object", which makes the call look
  // like it failed even though the precomposition did happen.
  script += 'var precompItem = comp.layers.precompose(layerIndices, precompName, moveAttributes);\n';
  // The new layer takes the slot of the topmost layer that went into it.
  script += 'var minIdx = layerIndices[0];\n';
  script += 'for (var pi = 1; pi < layerIndices.length; pi++) { if (layerIndices[pi] < minIdx) minIdx = layerIndices[pi]; }\n';
  script += 'var precompLayer = comp.layer(minIdx);\n';

  script += generateResultObject({
    index: 'precompLayer.index',
    name: 'precompLayer.name',
    sourceCompId: 'precompItem.id'
  });

  return wrapInUndoGroup(script, 'Precompose Layers');
}

/**
 * Generate script to modify layer properties
 */
export function generateModifyLayer(params: {
  compId?: number;
  compName?: string;
  layerIndex?: number;
  layerName?: string;
  name?: string;
  enabled?: boolean;
  solo?: boolean;
  shy?: boolean;
  locked?: boolean;
  inPoint?: number;
  outPoint?: number;
  startTime?: number;
  stretch?: number;
  blendMode?: string;
  parent?: number;
  is3D?: boolean;
  collapseTransformation?: boolean;
  position?: { x: number; y: number; z?: number };
  scale?: number[];
  rotation?: number;
  opacity?: number;
}): string {
  let script = '';
  script += generateProjectCheck();
  script += generateCompAccess(params.compId, params.compName);
  script += generateLayerAccess('comp', params.layerIndex, params.layerName);

  if (params.name !== undefined) {
    script += 'layer.name = "' + escapeString(params.name) + '";\n';
  }
  if (params.enabled !== undefined) {
    script += 'layer.enabled = ' + params.enabled + ';\n';
  }
  if (params.solo !== undefined) {
    script += 'layer.solo = ' + params.solo + ';\n';
  }
  if (params.shy !== undefined) {
    script += 'layer.shy = ' + params.shy + ';\n';
  }
  if (params.locked !== undefined) {
    script += 'layer.locked = ' + params.locked + ';\n';
  }
  if (params.inPoint !== undefined) {
    script += 'layer.inPoint = ' + params.inPoint + ';\n';
  }
  if (params.outPoint !== undefined) {
    script += 'layer.outPoint = ' + params.outPoint + ';\n';
  }
  if (params.startTime !== undefined) {
    script += 'layer.startTime = ' + params.startTime + ';\n';
  }
  if (params.stretch !== undefined) {
    script += 'layer.stretch = ' + params.stretch + ';\n';
  }
  if (params.blendMode !== undefined) {
    script += 'layer.blendingMode = ' + generateBlendMode(params.blendMode) + ';\n';
  }
  if (params.parent !== undefined) {
    if (params.parent === 0) {
      script += 'layer.parent = null;\n';
    } else {
      script += 'layer.parent = comp.layer(' + params.parent + ');\n';
    }
  }
  if (params.is3D !== undefined) {
    script += 'layer.threeDLayer = ' + params.is3D + ';\n';
  }
  if (params.collapseTransformation !== undefined) {
    // Precomps, solids and vector layers can collapse; raster footage can't.
    script += 'if (!layer.canSetCollapseTransformation) {\n';
    script += '  throw new Error("Collapse Transformations is not available on this layer (raster footage can\'t collapse; use the Grow Bounds effect to give effects more room): " + layer.name);\n';
    script += '}\n';
    script += 'layer.collapseTransformation = ' + (params.collapseTransformation ? 'true' : 'false') + ';\n';
  }
  if (params.position) {
    script += 'layer.property("Position").setValue(' + positionToES3(params.position) + ');\n';
  }
  if (params.scale) {
    script += 'layer.property("Scale").setValue(' + arrayToES3(params.scale) + ');\n';
  }
  if (params.rotation !== undefined) {
    script += 'layer.property("Rotation").setValue(' + params.rotation + ');\n';
  }
  if (params.opacity !== undefined) {
    script += 'layer.property("Opacity").setValue(' + params.opacity + ');\n';
  }

  script += generateResultObject({
    index: 'layer.index',
    name: 'layer.name'
  });

  return wrapInUndoGroup(script, 'Modify Layer');
}

/**
 * Generate script to delete a layer
 */
export function generateDeleteLayer(params: {
  compId?: number;
  compName?: string;
  layerIndex?: number;
  layerName?: string;
}): string {
  let script = '';
  script += generateProjectCheck();
  script += generateCompAccess(params.compId, params.compName);
  script += generateLayerAccess('comp', params.layerIndex, params.layerName);

  script += 'var deletedName = layer.name;\n';
  script += 'layer.remove();\n';

  script += generateResultObject({
    success: 'true',
    deleted: 'deletedName'
  });

  return wrapInUndoGroup(script, 'Delete Layer');
}

/**
 * Generate script to list all layers in a composition
 */
export function generateListLayers(params: {
  compId?: number;
  compName?: string;
}): string {
  let script = '';
  script += generateProjectCheck();
  script += generateCompAccess(params.compId, params.compName);

  script += 'var layers = [];\n';
  script += 'for (var i = 1; i <= comp.numLayers; i++) {\n';
  script += '  var layer = comp.layer(i);\n';
  script += '  var layerType = "unknown";\n';
  script += '  if (layer instanceof CameraLayer) layerType = "camera";\n';
  script += '  else if (layer instanceof LightLayer) layerType = "light";\n';
  script += '  else if (layer instanceof TextLayer) layerType = "text";\n';
  script += '  else if (layer instanceof ShapeLayer) layerType = "shape";\n';
  script += '  else if (layer.adjustmentLayer) layerType = "adjustment";\n';
  script += '  else if (layer.nullLayer) layerType = "null";\n';
  script += '  else if (layer.source instanceof CompItem) layerType = "precomp";\n';
  script += '  else if (layer.source) layerType = "av";\n';
  script += '  else layerType = "solid";\n';
  script += '  layers.push({\n';
  script += '    index: layer.index,\n';
  script += '    name: layer.name,\n';
  script += '    type: layerType,\n';
  script += '    enabled: layer.enabled,\n';
  script += '    solo: layer.solo,\n';
  script += '    shy: layer.shy,\n';
  script += '    locked: layer.locked,\n';
  script += '    inPoint: layer.inPoint,\n';
  script += '    outPoint: layer.outPoint,\n';
  script += '    startTime: layer.startTime,\n';
  script += '    is3D: layer.threeDLayer,\n';
  script += '    parent: layer.parent ? layer.parent.index : null\n';
  script += '  });\n';
  script += '}\n';
  script += 'layers;\n';

  return script;
}

/**
 * Generate script to get layer info
 */
export function generateGetLayerInfo(params: {
  compId?: number;
  compName?: string;
  layerIndex?: number;
  layerName?: string;
}): string {
  let script = '';
  script += generateProjectCheck();
  script += generateCompAccess(params.compId, params.compName);
  script += generateLayerAccess('comp', params.layerIndex, params.layerName);

  script += 'var layerType = "unknown";\n';
  script += 'if (layer instanceof CameraLayer) layerType = "camera";\n';
  script += 'else if (layer instanceof LightLayer) layerType = "light";\n';
  script += 'else if (layer instanceof TextLayer) layerType = "text";\n';
  script += 'else if (layer instanceof ShapeLayer) layerType = "shape";\n';
  script += 'else if (layer.adjustmentLayer) layerType = "adjustment";\n';
  script += 'else if (layer.nullLayer) layerType = "null";\n';
  script += 'else if (layer.source instanceof CompItem) layerType = "precomp";\n';
  script += 'else if (layer.source) layerType = "av";\n';
  script += 'else layerType = "solid";\n';

  script += 'var info = {\n';
  script += '  index: layer.index,\n';
  script += '  name: layer.name,\n';
  script += '  type: layerType,\n';
  script += '  enabled: layer.enabled,\n';
  script += '  solo: layer.solo,\n';
  script += '  shy: layer.shy,\n';
  script += '  locked: layer.locked,\n';
  script += '  inPoint: layer.inPoint,\n';
  script += '  outPoint: layer.outPoint,\n';
  script += '  startTime: layer.startTime,\n';
  script += '  stretch: layer.stretch,\n';
  script += '  is3D: layer.threeDLayer,\n';
  script += '  parent: layer.parent ? layer.parent.index : null,\n';
  script += '  hasVideo: layer.hasVideo,\n';
  script += '  hasAudio: layer.hasAudio,\n';
  script += '  source: layer.source ? layer.source.name : null\n';
  script += '};\n';

  // Get transform values if available
  script += 'if (layer.property("Transform")) {\n';
  script += '  info.position = layer.property("Position").value;\n';
  script += '  info.scale = layer.property("Scale").value;\n';
  script += '  info.rotation = layer.property("Rotation") ? layer.property("Rotation").value : 0;\n';
  script += '  info.opacity = layer.property("Opacity").value;\n';
  script += '  info.anchorPoint = layer.property("Anchor Point").value;\n';
  script += '}\n';

  script += 'info;\n';

  return script;
}
