/**
 * Marker and Timeline Script Generators
 *
 * Generates ES3-compatible ExtendScript for marker and timeline operations.
 */

import {
  escapeString,
  generateProjectCheck,
  generateCompAccess,
  generateLayerAccess,
  wrapInUndoGroup,
  generateResultObject
} from './helpers.js';

/**
 * Generate script to add a composition marker
 */
export function generateAddCompositionMarker(params: {
  compId?: number;
  compName?: string;
  time: number;
  comment?: string;
  duration?: number;
  chapter?: string;
  url?: string;
  frameTarget?: string;
  cuePointName?: string;
}): string {
  let script = '';
  script += generateProjectCheck();
  script += generateCompAccess(params.compId, params.compName);

  script += 'var marker = new MarkerValue("' + escapeString(params.comment || '') + '");\n';

  if (params.duration !== undefined) {
    script += 'marker.duration = ' + params.duration + ';\n';
  }
  if (params.chapter) {
    script += 'marker.chapter = "' + escapeString(params.chapter) + '";\n';
  }
  if (params.url) {
    script += 'marker.url = "' + escapeString(params.url) + '";\n';
  }
  if (params.frameTarget) {
    script += 'marker.frameTarget = "' + escapeString(params.frameTarget) + '";\n';
  }
  if (params.cuePointName) {
    script += 'marker.cuePointName = "' + escapeString(params.cuePointName) + '";\n';
  }

  script += 'var markerProp = comp.markerProperty;\n';
  script += 'var markerIndex = markerProp.addKey(' + params.time + ');\n';
  script += 'markerProp.setValueAtKey(markerIndex, marker);\n';

  script += generateResultObject({
    markerIndex: 'markerIndex',
    time: String(params.time),
    comment: '"' + escapeString(params.comment || '') + '"'
  });

  return wrapInUndoGroup(script, 'Add Composition Marker');
}

/**
 * Generate script to add a layer marker
 */
export function generateAddLayerMarker(params: {
  compId?: number;
  compName?: string;
  layerIndex?: number;
  layerName?: string;
  time: number;
  comment?: string;
  duration?: number;
}): string {
  let script = '';
  script += generateProjectCheck();
  script += generateCompAccess(params.compId, params.compName);
  script += generateLayerAccess('comp', params.layerIndex, params.layerName);

  script += 'var marker = new MarkerValue("' + escapeString(params.comment || '') + '");\n';

  if (params.duration !== undefined) {
    script += 'marker.duration = ' + params.duration + ';\n';
  }

  script += 'var markerProp = layer.property("Marker");\n';
  script += 'var markerIndex = markerProp.addKey(' + params.time + ');\n';
  script += 'markerProp.setValueAtKey(markerIndex, marker);\n';

  script += generateResultObject({
    markerIndex: 'markerIndex',
    time: String(params.time),
    layerName: 'layer.name'
  });

  return wrapInUndoGroup(script, 'Add Layer Marker');
}

/**
 * Generate script to get markers
 */
export function generateGetMarkers(params: {
  compId?: number;
  compName?: string;
  layerIndex?: number;
  layerName?: string;
}): string {
  let script = '';
  script += generateProjectCheck();
  script += generateCompAccess(params.compId, params.compName);

  script += 'var markers = [];\n';

  if (params.layerIndex || params.layerName) {
    script += generateLayerAccess('comp', params.layerIndex, params.layerName);
    script += 'var markerProp = layer.property("Marker");\n';
    script += 'var source = "layer";\n';
  } else {
    script += 'var markerProp = comp.markerProperty;\n';
    script += 'var source = "composition";\n';
  }

  script += 'for (var i = 1; i <= markerProp.numKeys; i++) {\n';
  script += '  var markerValue = markerProp.keyValue(i);\n';
  script += '  var m = {};\n';
  script += '  m.index = i;\n';
  script += '  m.time = markerProp.keyTime(i);\n';
  script += '  m.comment = markerValue.comment;\n';
  script += '  m.duration = markerValue.duration;\n';
  script += '  m.chapter = markerValue.chapter ? markerValue.chapter : null;\n';
  script += '  m.url = markerValue.url ? markerValue.url : null;\n';
  script += '  m.cuePointName = markerValue.cuePointName ? markerValue.cuePointName : null;\n';
  script += '  markers.push(m);\n';
  script += '}\n';

  script += 'var result = {};\n';
  script += 'result.source = source;\n';
  script += 'result.count = markers.length;\n';
  script += 'result.markers = markers;\n';
  script += 'result;\n';

  return script;
}

/**
 * Generate script to delete a marker
 */
export function generateDeleteMarker(params: {
  compId?: number;
  compName?: string;
  layerIndex?: number;
  layerName?: string;
  markerIndex: number;
}): string {
  let script = '';
  script += generateProjectCheck();
  script += generateCompAccess(params.compId, params.compName);

  if (params.layerIndex || params.layerName) {
    script += generateLayerAccess('comp', params.layerIndex, params.layerName);
    script += 'var markerProp = layer.property("Marker");\n';
  } else {
    script += 'var markerProp = comp.markerProperty;\n';
  }

  script += 'if (' + params.markerIndex + ' > markerProp.numKeys) {\n';
  script += '  throw new Error("Marker index out of range");\n';
  script += '}\n';

  script += 'markerProp.removeKey(' + params.markerIndex + ');\n';

  script += generateResultObject({
    success: 'true',
    deletedIndex: String(params.markerIndex)
  });

  return wrapInUndoGroup(script, 'Delete Marker');
}

/**
 * Generate script to set work area
 */
export function generateSetWorkArea(params: {
  compId?: number;
  compName?: string;
  start: number;
  duration: number;
}): string {
  let script = '';
  script += generateProjectCheck();
  script += generateCompAccess(params.compId, params.compName);

  script += 'comp.workAreaStart = ' + params.start + ';\n';
  script += 'comp.workAreaDuration = ' + params.duration + ';\n';

  script += generateResultObject({
    workAreaStart: 'comp.workAreaStart',
    workAreaDuration: 'comp.workAreaDuration'
  });

  return wrapInUndoGroup(script, 'Set Work Area');
}

/**
 * Generate script to snap current time to a marker
 */
export function generateSnapToMarker(params: {
  compId?: number;
  compName?: string;
  markerIndex: number;
  layerIndex?: number;
  layerName?: string;
}): string {
  let script = '';
  script += generateProjectCheck();
  script += generateCompAccess(params.compId, params.compName);

  if (params.layerIndex || params.layerName) {
    script += generateLayerAccess('comp', params.layerIndex, params.layerName);
    script += 'var markerProp = layer.property("Marker");\n';
  } else {
    script += 'var markerProp = comp.markerProperty;\n';
  }

  script += 'if (' + params.markerIndex + ' > markerProp.numKeys) {\n';
  script += '  throw new Error("Marker index out of range");\n';
  script += '}\n';

  script += 'var markerTime = markerProp.keyTime(' + params.markerIndex + ');\n';
  script += 'comp.time = markerTime;\n';

  script += generateResultObject({
    time: 'markerTime',
    markerIndex: String(params.markerIndex)
  });

  return script;
}

/**
 * Generate script to get current time
 */
export function generateGetCurrentTime(params: {
  compId?: number;
  compName?: string;
}): string {
  let script = '';
  script += generateProjectCheck();
  script += generateCompAccess(params.compId, params.compName);

  script += 'var result = ({\n';
  script += '  time: comp.time,\n';
  script += '  frame: Math.round(comp.time * comp.frameRate),\n';
  script += '  frameRate: comp.frameRate\n';
  script += '});\n';
  script += 'result;\n';

  return script;
}

/**
 * Generate script to set current time
 */
export function generateSetCurrentTime(params: {
  compId?: number;
  compName?: string;
  time?: number;
  frame?: number;
}): string {
  let script = '';
  script += generateProjectCheck();
  script += generateCompAccess(params.compId, params.compName);

  if (params.time !== undefined) {
    script += 'comp.time = ' + params.time + ';\n';
  } else if (params.frame !== undefined) {
    script += 'comp.time = ' + params.frame + ' / comp.frameRate;\n';
  }

  script += generateResultObject({
    time: 'comp.time',
    frame: 'Math.round(comp.time * comp.frameRate)'
  });

  return script;
}

/**
 * Generate script to get nearest marker to current time
 */
export function generateGetNearestMarker(params: {
  compId?: number;
  compName?: string;
  time?: number;
  direction?: 'previous' | 'next' | 'nearest';
}): string {
  let script = '';
  script += generateProjectCheck();
  script += generateCompAccess(params.compId, params.compName);

  const time = params.time !== undefined ? params.time : 'comp.time';
  const direction = params.direction || 'nearest';

  script += 'var markerProp = comp.markerProperty;\n';
  script += 'var targetTime = ' + time + ';\n';
  script += 'var nearestMarker = null;\n';
  script += 'var nearestDistance = Infinity;\n';

  script += 'for (var i = 1; i <= markerProp.numKeys; i++) {\n';
  script += '  var markerTime = markerProp.keyTime(i);\n';
  script += '  var distance = markerTime - targetTime;\n';

  if (direction === 'previous') {
    script += '  if (distance < 0 && Math.abs(distance) < nearestDistance) {\n';
  } else if (direction === 'next') {
    script += '  if (distance > 0 && distance < nearestDistance) {\n';
  } else {
    script += '  if (Math.abs(distance) < nearestDistance) {\n';
  }

  script += '    nearestDistance = Math.abs(distance);\n';
  script += '    var markerValue = markerProp.keyValue(i);\n';
  script += '    nearestMarker = {\n';
  script += '      index: i,\n';
  script += '      time: markerTime,\n';
  script += '      comment: markerValue.comment,\n';
  script += '      duration: markerValue.duration\n';
  script += '    };\n';
  script += '  }\n';
  script += '}\n';

  script += 'nearestMarker;\n';

  return script;
}

/**
 * Generate script to navigate between markers
 */
export function generateNavigateMarkers(params: {
  compId?: number;
  compName?: string;
  direction: 'first' | 'last' | 'previous' | 'next';
}): string {
  let script = '';
  script += generateProjectCheck();
  script += generateCompAccess(params.compId, params.compName);

  script += 'var markerProp = comp.markerProperty;\n';
  script += 'if (markerProp.numKeys === 0) {\n';
  script += '  throw new Error("No markers in composition");\n';
  script += '}\n';

  const direction = params.direction;

  if (direction === 'first') {
    script += 'var targetIndex = 1;\n';
  } else if (direction === 'last') {
    script += 'var targetIndex = markerProp.numKeys;\n';
  } else if (direction === 'previous') {
    script += 'var targetIndex = null;\n';
    script += 'for (var i = markerProp.numKeys; i >= 1; i--) {\n';
    script += '  if (markerProp.keyTime(i) < comp.time - 0.001) {\n';
    script += '    targetIndex = i;\n';
    script += '    break;\n';
    script += '  }\n';
    script += '}\n';
    script += 'if (targetIndex === null) targetIndex = markerProp.numKeys;\n';
  } else if (direction === 'next') {
    script += 'var targetIndex = null;\n';
    script += 'for (var i = 1; i <= markerProp.numKeys; i++) {\n';
    script += '  if (markerProp.keyTime(i) > comp.time + 0.001) {\n';
    script += '    targetIndex = i;\n';
    script += '    break;\n';
    script += '  }\n';
    script += '}\n';
    script += 'if (targetIndex === null) targetIndex = 1;\n';
  }

  script += 'var markerTime = markerProp.keyTime(targetIndex);\n';
  script += 'comp.time = markerTime;\n';

  script += 'var result = ({\n';
  script += '  markerIndex: targetIndex,\n';
  script += '  time: markerTime,\n';
  script += '  comment: markerProp.keyValue(targetIndex).comment\n';
  script += '});\n';
  script += 'result;\n';

  return script;
}
