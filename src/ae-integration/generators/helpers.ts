/**
 * ES3 Helper Functions for Script Generation
 *
 * These helpers ensure all generated ExtendScript code is ES3 compliant.
 * CRITICAL: Never use template literals, arrow functions, const/let, or modern array methods.
 */

import { AE_PROPERTY_PATHS } from '../../types/aeTypes.js';

/**
 * Escape a string for use in generated ES3 code
 */
export function escapeString(str: string): string {
  if (typeof str !== 'string') {
    return String(str);
  }
  return str
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"')
    .replace(/'/g, "\\'")
    .replace(/\n/g, '\\n')
    .replace(/\r/g, '\\r')
    .replace(/\t/g, '\\t');
}

/**
 * Convert a JavaScript array to ES3 array literal string
 */
export function arrayToES3(arr: any[]): string {
  const items: string[] = [];
  for (let i = 0; i < arr.length; i++) {
    const item = arr[i];
    if (typeof item === 'string') {
      items.push('"' + escapeString(item) + '"');
    } else if (typeof item === 'number' || typeof item === 'boolean') {
      items.push(String(item));
    } else if (Array.isArray(item)) {
      items.push(arrayToES3(item));
    } else if (item === null) {
      items.push('null');
    } else if (typeof item === 'object') {
      items.push(objectToES3(item));
    } else {
      items.push(String(item));
    }
  }
  return '[' + items.join(', ') + ']';
}

/**
 * Convert a JavaScript object to ES3 object literal string
 */
export function objectToES3(obj: Record<string, any>): string {
  const pairs: string[] = [];
  for (const key in obj) {
    if (obj.hasOwnProperty(key)) {
      const value = obj[key];
      let valueStr: string;
      if (typeof value === 'string') {
        valueStr = '"' + escapeString(value) + '"';
      } else if (typeof value === 'number' || typeof value === 'boolean') {
        valueStr = String(value);
      } else if (Array.isArray(value)) {
        valueStr = arrayToES3(value);
      } else if (value === null) {
        valueStr = 'null';
      } else if (typeof value === 'object') {
        valueStr = objectToES3(value);
      } else {
        valueStr = String(value);
      }
      pairs.push('"' + escapeString(key) + '": ' + valueStr);
    }
  }
  return '{' + pairs.join(', ') + '}';
}

/**
 * Convert color object to AE color array [r, g, b] or [r, g, b, a]
 */
export function colorToES3(color: { r: number; g: number; b: number; a?: number }): string {
  if (color.a !== undefined) {
    return '[' + color.r + ', ' + color.g + ', ' + color.b + ', ' + color.a + ']';
  }
  return '[' + color.r + ', ' + color.g + ', ' + color.b + ']';
}

/**
 * Convert position object to AE position array [x, y] or [x, y, z]
 */
export function positionToES3(pos: { x: number; y: number; z?: number }): string {
  if (pos.z !== undefined) {
    return '[' + pos.x + ', ' + pos.y + ', ' + pos.z + ']';
  }
  return '[' + pos.x + ', ' + pos.y + ']';
}

/**
 * Get the AE property path from a friendly name
 */
export function getPropertyPath(propertyName: string): string {
  // Check if it's a known property alias
  const knownPath = AE_PROPERTY_PATHS[propertyName];
  if (knownPath) {
    return knownPath;
  }
  // Return as-is (might be a direct path)
  return propertyName;
}

/**
 * Generate ES3 code to get a property by path
 */
export function generatePropertyAccess(layerVar: string, propertyName: string): string {
  const path = getPropertyPath(propertyName);
  const parts = path.split('/');

  let script = '';
  script += 'var prop = ' + layerVar + ';\n';

  for (let i = 0; i < parts.length; i++) {
    const part = parts[i];
    script += 'if (prop) {\n';
    script += '  prop = prop.property("' + escapeString(part) + '");\n';
    script += '}\n';
  }

  script += 'if (!prop) {\n';
  script += '  throw new Error("Property not found: ' + escapeString(propertyName) + '");\n';
  script += '}\n';

  return script;
}

/**
 * Generate ES3 code to get a layer by index or name
 */
export function generateLayerAccess(
  compVar: string,
  layerIndex?: number,
  layerName?: string
): string {
  let script = '';

  if (layerIndex !== undefined) {
    script += 'var layer = ' + compVar + '.layer(' + layerIndex + ');\n';
    script += 'if (!layer) {\n';
    script += '  throw new Error("Layer not found at index: ' + layerIndex + '");\n';
    script += '}\n';
  } else if (layerName !== undefined) {
    script += 'var layer = null;\n';
    script += 'for (var i = 1; i <= ' + compVar + '.numLayers; i++) {\n';
    script += '  if (' + compVar + '.layer(i).name === "' + escapeString(layerName) + '") {\n';
    script += '    layer = ' + compVar + '.layer(i);\n';
    script += '    break;\n';
    script += '  }\n';
    script += '}\n';
    script += 'if (!layer) {\n';
    script += '  throw new Error("Layer not found: ' + escapeString(layerName) + '");\n';
    script += '}\n';
  } else {
    script += 'throw new Error("Layer index or name must be provided");\n';
  }

  return script;
}

/**
 * Generate ES3 code to get a composition by ID or name
 */
export function generateCompAccess(compId?: number, compName?: string): string {
  let script = '';

  if (compId !== undefined) {
    script += 'var comp = app.project.itemByID(' + compId + ');\n';
    script += 'if (!comp || !(comp instanceof CompItem)) {\n';
    script += '  throw new Error("Composition not found with ID: ' + compId + '");\n';
    script += '}\n';
  } else if (compName !== undefined) {
    script += 'var comp = null;\n';
    script += 'for (var i = 1; i <= app.project.numItems; i++) {\n';
    script += '  var item = app.project.item(i);\n';
    script += '  if (item instanceof CompItem && item.name === "' + escapeString(compName) + '") {\n';
    script += '    comp = item;\n';
    script += '    break;\n';
    script += '  }\n';
    script += '}\n';
    script += 'if (!comp) {\n';
    script += '  throw new Error("Composition not found: ' + escapeString(compName) + '");\n';
    script += '}\n';
  } else {
    // Use active composition
    script += 'var comp = app.project.activeItem;\n';
    script += 'if (!comp || !(comp instanceof CompItem)) {\n';
    script += '  throw new Error("No active composition. Please select a composition or provide compId/compName.");\n';
    script += '}\n';
  }

  return script;
}

/**
 * Generate ES3 code for undo group wrapper
 */
export function wrapInUndoGroup(script: string, name: string): string {
  let wrapped = '';
  wrapped += 'app.beginUndoGroup("' + escapeString(name) + '");\n';
  wrapped += 'try {\n';
  // Indent the script
  const lines = script.split('\n');
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].trim()) {
      wrapped += '  ' + lines[i] + '\n';
    } else {
      wrapped += '\n';
    }
  }
  wrapped += '} catch (e) {\n';
  wrapped += '  app.endUndoGroup();\n';
  wrapped += '  throw e;\n';
  wrapped += '}\n';
  wrapped += 'app.endUndoGroup();\n';
  return wrapped;
}

/**
 * Generate ES3 code to format a result object
 */
export function generateResultObject(properties: Record<string, string>): string {
  let script = 'var result = {};\n';
  for (const key in properties) {
    if (properties.hasOwnProperty(key)) {
      script += 'result["' + escapeString(key) + '"] = ' + properties[key] + ';\n';
    }
  }
  script += 'result;\n';
  return script;
}

/**
 * Generate ES3 code for a conditional block
 */
export function generateConditional(
  condition: string,
  thenBlock: string,
  elseBlock?: string
): string {
  let script = '';
  script += 'if (' + condition + ') {\n';
  const thenLines = thenBlock.split('\n');
  for (let i = 0; i < thenLines.length; i++) {
    if (thenLines[i].trim()) {
      script += '  ' + thenLines[i] + '\n';
    }
  }
  script += '}';
  if (elseBlock) {
    script += ' else {\n';
    const elseLines = elseBlock.split('\n');
    for (let i = 0; i < elseLines.length; i++) {
      if (elseLines[i].trim()) {
        script += '  ' + elseLines[i] + '\n';
      }
    }
    script += '}';
  }
  script += '\n';
  return script;
}

/**
 * Generate ES3 code for a for loop
 */
export function generateForLoop(
  iterVar: string,
  start: string,
  end: string,
  body: string
): string {
  let script = '';
  script += 'for (var ' + iterVar + ' = ' + start + '; ' + iterVar + ' < ' + end + '; ' + iterVar + '++) {\n';
  const lines = body.split('\n');
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].trim()) {
      script += '  ' + lines[i] + '\n';
    }
  }
  script += '}\n';
  return script;
}

/**
 * Validate that a value can be used as a keyframe value
 */
export function formatKeyframeValue(value: number | number[] | string): string {
  if (typeof value === 'number') {
    return String(value);
  } else if (Array.isArray(value)) {
    return arrayToES3(value);
  } else if (typeof value === 'string') {
    // Some MCP transports stringify untyped array arguments (e.g. "[100, 100]")
    // because the set_keyframe `value` param has no declared JSON Schema type.
    // Recover the array so multi-dimensional keyframes (Scale, Position) work
    // instead of being quoted as a string and rejected by AE ("not an array").
    const trimmed = value.trim();
    if (trimmed.charAt(0) === '[' && trimmed.charAt(trimmed.length - 1) === ']') {
      try {
        const parsed = JSON.parse(trimmed);
        if (Array.isArray(parsed)) {
          return arrayToES3(parsed);
        }
      } catch (e) {
        // Not valid JSON — fall through and treat as a literal string value.
      }
    }
    return '"' + escapeString(value) + '"';
  }
  throw new Error('Invalid keyframe value type');
}

/**
 * Generate ES3 code to check if project exists
 */
export function generateProjectCheck(): string {
  let script = '';
  script += 'if (!app.project) {\n';
  script += '  throw new Error("No project is open");\n';
  script += '}\n';
  return script;
}

/**
 * Generate ES3 code for keyframe interpolation type
 */
export function generateInterpolationType(type: string): string {
  const typeMap: Record<string, string> = {
    'LINEAR': 'KeyframeInterpolationType.LINEAR',
    'BEZIER': 'KeyframeInterpolationType.BEZIER',
    'HOLD': 'KeyframeInterpolationType.HOLD'
  };
  return typeMap[type] || 'KeyframeInterpolationType.LINEAR';
}

/**
 * Generate ES3 code for blend mode
 */
export function generateBlendMode(mode: string): string {
  return 'BlendingMode.' + mode;
}

/**
 * Generate ES3 code for text justification
 */
export function generateJustification(just: string): string {
  const justMap: Record<string, string> = {
    'LEFT': 'ParagraphJustification.LEFT_JUSTIFY',
    'CENTER': 'ParagraphJustification.CENTER_JUSTIFY',
    'RIGHT': 'ParagraphJustification.RIGHT_JUSTIFY',
    'FULL_JUSTIFY_LASTLINE_LEFT': 'ParagraphJustification.FULL_JUSTIFY_LASTLINE_LEFT',
    'FULL_JUSTIFY_LASTLINE_CENTER': 'ParagraphJustification.FULL_JUSTIFY_LASTLINE_CENTER',
    'FULL_JUSTIFY_LASTLINE_RIGHT': 'ParagraphJustification.FULL_JUSTIFY_LASTLINE_RIGHT',
    'FULL_JUSTIFY_LASTLINE_FULL': 'ParagraphJustification.FULL_JUSTIFY_LASTLINE_FULL'
  };
  return justMap[just] || 'ParagraphJustification.LEFT_JUSTIFY';
}

/**
 * Generate ES3 code for light type
 */
export function generateLightType(type: string): string {
  const typeMap: Record<string, string> = {
    'PARALLEL': 'LightType.PARALLEL',
    'SPOT': 'LightType.SPOT',
    'POINT': 'LightType.POINT',
    'AMBIENT': 'LightType.AMBIENT'
  };
  return typeMap[type] || 'LightType.POINT';
}

/**
 * Generate ES3 code for camera type
 */
export function generateCameraType(type: string): string {
  const typeMap: Record<string, string> = {
    'ONE_NODE': 'CameraType.ONE_NODE',
    'TWO_NODE': 'CameraType.TWO_NODE'
  };
  return typeMap[type] || 'CameraType.ONE_NODE';
}
