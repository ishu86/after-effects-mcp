/**
 * Expression-related Script Generators
 *
 * Generates ES3-compatible ExtendScript for expression operations.
 */

import {
  escapeString,
  generateProjectCheck,
  generateCompAccess,
  generateLayerAccess,
  generatePropertyAccess,
  getPropertyPath,
  wrapInUndoGroup,
  generateResultObject
} from './helpers.js';

// Finds the most recent keyframe at or before `time` (n = 0 if none), and the
// time since it. Shared by the physics templates.
const PREV_KEY = [
  'var n = 0;',
  'if (numKeys > 0) {',
  '  n = nearestKey(time).index;',
  '  if (key(n).time > time) { n--; }',
  '}',
  'var t = (n > 0) ? time - key(n).time : 0;'
].join('\n');

// Velocity arriving at key n: sampled a tenth of a frame before it.
const V_IN = 'velocityAtTime(key(n).time - thisComp.frameDuration / 10)';

// Expression templates library
const EXPRESSION_TEMPLATES: Record<string, {
  expression: string;
  description: string;
  params?: Record<string, { type: string; default: any; description: string }>;
}> = {
  // Wiggle expressions
  wiggle: {
    expression: 'wiggle({{frequency}}, {{amplitude}})',
    description: 'Basic wiggle effect',
    params: {
      frequency: { type: 'number', default: 2, description: 'Oscillations per second' },
      amplitude: { type: 'number', default: 50, description: 'Maximum deviation' }
    }
  },
  wiggleSmooth: {
    expression: 'var freq = {{frequency}};\nvar amp = {{amplitude}};\nvar octaves = {{octaves}};\nvar mult = {{mult}};\nvar time_offset = {{timeOffset}};\nwiggle(freq, amp, octaves, mult, time + time_offset)',
    description: 'Smooth wiggle with octaves',
    params: {
      frequency: { type: 'number', default: 2, description: 'Oscillations per second' },
      amplitude: { type: 'number', default: 50, description: 'Maximum deviation' },
      octaves: { type: 'number', default: 1, description: 'Noise octaves' },
      mult: { type: 'number', default: 0.5, description: 'Amplitude multiplier' },
      timeOffset: { type: 'number', default: 0, description: 'Time offset' }
    }
  },
  wiggleFadeIn: {
    expression: 'var freq = {{frequency}};\nvar amp = {{amplitude}};\nvar fadeTime = {{fadeTime}};\nvar t = Math.min(time / fadeTime, 1);\nwiggle(freq, amp * t)',
    description: 'Wiggle that fades in over time',
    params: {
      frequency: { type: 'number', default: 2, description: 'Oscillations per second' },
      amplitude: { type: 'number', default: 50, description: 'Maximum deviation' },
      fadeTime: { type: 'number', default: 1, description: 'Fade in duration (seconds)' }
    }
  },
  wiggleFadeOut: {
    expression: 'var freq = {{frequency}};\nvar amp = {{amplitude}};\nvar fadeTime = {{fadeTime}};\nvar fadeStart = {{fadeStart}};\nvar t = Math.max(0, 1 - (time - fadeStart) / fadeTime);\nwiggle(freq, amp * t)',
    description: 'Wiggle that fades out over time',
    params: {
      frequency: { type: 'number', default: 2, description: 'Oscillations per second' },
      amplitude: { type: 'number', default: 50, description: 'Maximum deviation' },
      fadeTime: { type: 'number', default: 1, description: 'Fade out duration (seconds)' },
      fadeStart: { type: 'number', default: 2, description: 'Start time for fade out' }
    }
  },

  // Loop expressions
  loopCycle: {
    expression: 'loopOut("cycle")',
    description: 'Loop keyframes in a cycle'
  },
  loopPingpong: {
    expression: 'loopOut("pingpong")',
    description: 'Loop keyframes ping-pong style'
  },
  loopOffset: {
    expression: 'loopOut("offset")',
    description: 'Loop keyframes with continuous offset'
  },
  loopContinue: {
    expression: 'loopOut("continue")',
    description: 'Continue last keyframe velocity'
  },

  // Time expressions
  time: {
    expression: 'time',
    description: 'Current time in seconds'
  },
  clock: {
    expression: 'var d = new Date();\nvar h = d.getHours();\nvar m = d.getMinutes();\nvar s = d.getSeconds();\n(h < 10 ? "0" : "") + h + ":" + (m < 10 ? "0" : "") + m + ":" + (s < 10 ? "0" : "") + s',
    description: 'Current time as HH:MM:SS'
  },
  countdown: {
    expression: 'var total = {{totalSeconds}};\nvar remaining = Math.max(0, total - time);\nvar m = Math.floor(remaining / 60);\nvar s = Math.floor(remaining % 60);\n(m < 10 ? "0" : "") + m + ":" + (s < 10 ? "0" : "") + s',
    description: 'Countdown timer',
    params: {
      totalSeconds: { type: 'number', default: 60, description: 'Total countdown time in seconds' }
    }
  },
  frameNumber: {
    expression: 'Math.floor(time * {{frameRate}}) + {{offset}}',
    description: 'Current frame number',
    params: {
      frameRate: { type: 'number', default: 30, description: 'Frames per second' },
      offset: { type: 'number', default: 1, description: 'Starting frame number' }
    }
  },

  // Linking expressions
  matchPosition: {
    expression: 'var targetLayer = thisComp.layer("{{targetLayer}}");\ntargetLayer.transform.position',
    description: 'Match position of another layer',
    params: {
      targetLayer: { type: 'string', default: 'Target', description: 'Name of target layer' }
    }
  },
  offsetPosition: {
    expression: 'var targetLayer = thisComp.layer("{{targetLayer}}");\nvar offset = [{{offsetX}}, {{offsetY}}];\ntargetLayer.transform.position + offset',
    description: 'Offset from another layer position',
    params: {
      targetLayer: { type: 'string', default: 'Target', description: 'Name of target layer' },
      offsetX: { type: 'number', default: 100, description: 'X offset' },
      offsetY: { type: 'number', default: 0, description: 'Y offset' }
    }
  },
  inverseRotation: {
    expression: 'var targetLayer = thisComp.layer("{{targetLayer}}");\n-targetLayer.transform.rotation',
    description: 'Inverse rotation of another layer',
    params: {
      targetLayer: { type: 'string', default: 'Target', description: 'Name of target layer' }
    }
  },
  followPath: {
    expression: 'var pathLayer = thisComp.layer("{{pathLayer}}");\nvar path = pathLayer.content("{{shapeName}}").path;\nvar progress = {{progress}};\npath.pointOnPath(progress)',
    description: 'Follow a path shape',
    params: {
      pathLayer: { type: 'string', default: 'Path Layer', description: 'Layer containing the path' },
      shapeName: { type: 'string', default: 'Path 1', description: 'Name of the shape path' },
      progress: { type: 'expression', default: 'time / thisComp.duration', description: 'Progress expression (0-1)' }
    }
  },

  // Physics expressions.
  //
  // These all react to the most recent keyframe at or before the playhead
  // (PREV_KEY), so they act after EVERY keyframe. The originals keyed off
  // key(numKeys) and only ever affected the motion after the final keyframe.
  // Incoming velocity is sampled a tenth of a frame before the key, so it is
  // the velocity arriving at the key rather than leaving it.
  overshoot: {
    // Damped sine, divided by the angular frequency w so the wobble starts at
    // exactly the incoming velocity - no kink at the keyframe. The original
    // measured value - lastKey.value, which is 0 after the last key, so it
    // did nothing.
    expression: [
      PREV_KEY,
      'var freq = {{frequency}};',
      'var decay = {{decay}};',
      'if (n > 0 && t > 0) {',
      '  var v = ' + V_IN + ';',
      '  var w = freq * Math.PI * 2;',
      '  value + v * Math.sin(w * t) / Math.exp(decay * t) / w;',
      '} else {',
      '  value;',
      '}'
    ].join('\n'),
    description: 'Wobbles past each keyframe and settles, continuing the incoming velocity',
    params: {
      frequency: { type: 'number', default: 3, description: 'Oscillations per second. Higher = tighter, smaller overshoot' },
      decay: { type: 'number', default: 5, description: 'How quickly the wobble dies away' }
    }
  },
  bounce: {
    // Preserve the existing amplitude/frequency/decay API. The gravity-based
    // rebound is a separate template, not a silent replacement for this one.
    expression: [
      PREV_KEY,
      'var amplitude = {{amplitude}};',
      'var frequency = {{frequency}};',
      'var decay = {{decay}};',
      'if (n > 0 && t > 0) {',
      '  var v = ' + V_IN + ';',
      '  value + v * amplitude * Math.sin(frequency * t * 2 * Math.PI) / Math.exp(decay * t);',
      '} else {',
      '  value;',
      '}'
    ].join('\n'),
    description: 'Bouncy overshoot after each keyframe, using the original amplitude/frequency/decay parameters',
    params: {
      amplitude: { type: 'number', default: 0.1, description: 'Bounce amplitude' },
      frequency: { type: 'number', default: 3, description: 'Bounce frequency' },
      decay: { type: 'number', default: 5, description: 'Decay rate' }
    }
  },
  bounceBack: {
    // Bounce-back: the property rebounds off the keyframe value like a ball
    // off a floor - gravity pulls it back, each rebound keeps `elasticity` of
    // the speed, and rebounds get shorter and more frequent as energy is lost.
    // The original was a damped-sine overshoot under this name.
    expression: [
      PREV_KEY,
      'var e = {{elasticity}};',
      'var g = {{gravity}};',
      'var nMax = {{maxBounces}};',
      'if (n > 0 && t > 0) {',
      '  var v = -' + V_IN + ' * e;',
      '  var isArr = (v instanceof Array);',
      '  var vl = isArr ? length(v) : Math.abs(v);',
      '  var vu = isArr ? (vl > 0 ? normalize(v) : v) : (v < 0 ? -1 : 1);',
      '  var tCur = 0;',
      '  var seg = 2 * vl / g;',
      '  var tNext = seg;',
      '  var nb = 1;',
      '  while (tNext < t && nb <= nMax) { vl *= e; seg *= e; tCur = tNext; tNext += seg; nb++; }',
      '  if (nb <= nMax) {',
      '    var d = t - tCur;',
      '    value + vu * d * (vl - g * d / 2);',
      '  } else {',
      '    value;',
      '  }',
      '} else {',
      '  value;',
      '}'
    ].join('\n'),
    description: 'Rebounds off each keyframe value under gravity, like a ball hitting a floor',
    params: {
      elasticity: { type: 'number', default: 0.7, description: 'Fraction of speed kept on each rebound (0-1)' },
      gravity: { type: 'number', default: 5000, description: 'Pull back toward the keyframe value, in units per second squared' },
      maxBounces: { type: 'number', default: 9, description: 'Stop after this many rebounds' }
    }
  },
  inertia: {
    // Coasts on in the incoming direction and slows to a stop.
    expression: [
      PREV_KEY,
      'var friction = {{friction}};',
      'if (n > 0 && t > 0) {',
      '  var v = ' + V_IN + ';',
      '  value + v * (1 - Math.exp(-friction * t)) / friction;',
      '} else {',
      '  value;',
      '}'
    ].join('\n'),
    description: 'Drifts on past each keyframe in the direction of travel and eases to a stop',
    params: {
      friction: { type: 'number', default: 5, description: 'How quickly the drift stops' }
    }
  },
  springy: {
    // Underdamped spring. Divides by the DAMPED frequency wd, which is the one
    // it oscillates at, so it starts at the incoming velocity. The original
    // divided by the undamped omega and started about 13% slow.
    expression: [
      PREV_KEY,
      'var mass = {{mass}};',
      'var stiffness = {{stiffness}};',
      'var damping = {{damping}};',
      'if (n > 0 && t > 0) {',
      '  var omega = Math.sqrt(stiffness / mass);',
      '  var zeta = damping / (2 * Math.sqrt(mass * stiffness));',
      '  if (zeta < 1) {',
      '    var wd = omega * Math.sqrt(1 - zeta * zeta);',
      '    var v = ' + V_IN + ';',
      '    value + v / wd * Math.exp(-zeta * omega * t) * Math.sin(wd * t);',
      '  } else {',
      '    value;',
      '  }',
      '} else {',
      '  value;',
      '}'
    ].join('\n'),
    description: 'Spring past each keyframe (no effect when critically or over-damped)',
    params: {
      mass: { type: 'number', default: 1, description: 'Mass' },
      stiffness: { type: 'number', default: 100, description: 'Spring stiffness' },
      damping: { type: 'number', default: 10, description: 'Damping. Must stay below 2 * sqrt(mass * stiffness) to oscillate' }
    }
  },

  // Speed control
  speedControl: {
    // Integrates a keyframed "units per second" slider over time. Multiplying
    // the slider by time instead makes the property run BACKWARDS whenever the
    // speed eases off, because expressions have no memory of earlier frames.
    // Midpoint areas are exact for linear and HOLD intervals; eased keys are
    // approximate. Sampling inside an interval avoids the discontinuity at a
    // HOLD key's right endpoint. Clip every interval to the visible start.
    expression: [
      'var s = effect("{{controlName}}")("ADBE Slider Control-0001");',
      'var mult = {{multiplier}};',
      'var acc = 0;',
      'var start = inPoint;',
      'if (time > start) {',
      '  for (var k = 1; k <= s.numKeys && start < time; k++) {',
      '    var end = Math.min(time, s.key(k).time);',
      '    if (end > start) {',
      '      acc += s.valueAtTime((start + end) / 2) * (end - start);',
      '      start = end;',
      '    }',
      '  }',
      '  if (start < time) { acc += s.valueAtTime((start + time) / 2) * (time - start); }',
      '}',
      'acc *= mult;',
      'if (value instanceof Array) {',
      '  var out = [];',
      '  for (var i = 0; i < value.length; i++) { out.push(value[i] + acc); }',
      '  out;',
      '} else {',
      '  value + acc;',
      '}'
    ].join('\n'),
    description: 'Accumulates a speed slider from the layer inPoint. Exact for linear and HOLD keys; midpoint approximation for eased keys. Use linear/HOLD keys for predictable speed integration. Add a Slider Control first (add_expression_control)',
    params: {
      controlName: { type: 'string', default: 'Speed', description: 'Name of the Slider Control on this layer holding units per second' },
      multiplier: { type: 'number', default: 1, description: 'Scales the accumulated amount (e.g. to convert units)' }
    }
  },

  // Wiggle variants
  loopingWiggle: {
    // Crossfades a wiggle sampled at t with one sampled at t - loopTime, so the
    // end of each cycle lands exactly on its start.
    expression: [
      'var freq = {{frequency}};',
      'var amp = {{amplitude}};',
      'var loopTime = {{loopTime}};',
      'var t = time % loopTime;',
      'var w1 = wiggle(freq, amp, 1, 0.5, t);',
      'var w2 = wiggle(freq, amp, 1, 0.5, t - loopTime);',
      'linear(t, 0, loopTime, w1, w2);'
    ].join('\n'),
    description: 'Wiggle that repeats seamlessly every loopTime seconds',
    params: {
      frequency: { type: 'number', default: 2, description: 'Oscillations per second' },
      amplitude: { type: 'number', default: 50, description: 'Maximum deviation' },
      loopTime: { type: 'number', default: 3, description: 'Loop length in seconds' }
    }
  },
  wiggleOneAxis: {
    expression: [
      'var ax = {{axis}};',
      'var w = wiggle({{frequency}}, {{amplitude}});',
      'if (value instanceof Array) {',
      '  var r = [];',
      '  for (var i = 0; i < value.length; i++) { r.push(i === ax ? w[i] : value[i]); }',
      '  r;',
      '} else {',
      '  w;',
      '}'
    ].join('\n'),
    description: 'Wiggle along one axis only; the other axes keep their keyframed values',
    params: {
      axis: { type: 'number', default: 0, description: '0 = x, 1 = y, 2 = z' },
      frequency: { type: 'number', default: 2, description: 'Oscillations per second' },
      amplitude: { type: 'number', default: 50, description: 'Maximum deviation' }
    }
  }
};

/**
 * Process expression template with parameters
 */
function processExpressionTemplate(
  templateName: string,
  params?: Record<string, any>
): string {
  const template = EXPRESSION_TEMPLATES[templateName];
  if (!template) {
    throw new Error('Unknown expression template: ' + templateName);
  }

  let expression = template.expression;

  // Replace parameters with values or defaults
  if (template.params) {
    for (const paramName in template.params) {
      const paramDef = template.params[paramName];
      const value = params && params[paramName] !== undefined
        ? params[paramName]
        : paramDef.default;
      const placeholder = '{{' + paramName + '}}';
      // Values are pasted into expression source, so check them first:
      //  - number: must be a finite number, not arbitrary text;
      //  - string: sits inside double quotes, so escape it;
      //  - expression: deliberately inserted as raw code.
      let replacement: string;
      if (paramDef.type === 'number') {
        const num = typeof value === 'number' ? value : Number(value);
        if ((typeof value !== 'number' && typeof value !== 'string') ||
            (typeof value === 'string' && value.trim() === '') || !isFinite(num)) {
          throw new Error(
            'Template "' + templateName + '" parameter "' + paramName + '" must be a number, got: ' + JSON.stringify(value)
          );
        }
        replacement = String(num);
      } else if (paramDef.type === 'string') {
        replacement = escapeString(String(value)).replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029');
      } else {
        replacement = String(value);
      }
      expression = expression.split(placeholder).join(replacement);
    }
  }

  return expression;
}

/**
 * Generate script to set an expression on a property
 */
export function generateSetExpression(params: {
  compId?: number;
  compName?: string;
  layerIndex?: number;
  layerName?: string;
  property: string;
  expression: string;
}): string {
  let script = '';
  script += generateProjectCheck();
  script += generateCompAccess(params.compId, params.compName);
  script += generateLayerAccess('comp', params.layerIndex, params.layerName);
  script += generatePropertyAccess('layer', params.property);

  script += 'prop.expression = "' + escapeString(params.expression) + '";\n';

  script += generateResultObject({
    success: 'true',
    property: '"' + escapeString(params.property) + '"',
    expressionEnabled: 'prop.expressionEnabled'
  });

  return wrapInUndoGroup(script, 'Set Expression');
}

/**
 * Generate script to get expression from a property
 */
export function generateGetExpression(params: {
  compId?: number;
  compName?: string;
  layerIndex?: number;
  layerName?: string;
  property: string;
}): string {
  let script = '';
  script += generateProjectCheck();
  script += generateCompAccess(params.compId, params.compName);
  script += generateLayerAccess('comp', params.layerIndex, params.layerName);
  script += generatePropertyAccess('layer', params.property);

  // NOTE: a bare "{...};" at statement position is parsed by ExtendScript as a
  // BLOCK (labels + SyntaxError), not an object literal. Assign to a var instead.
  script += 'var result = {};\n';
  script += 'result.property = "' + escapeString(params.property) + '";\n';
  script += 'result.expression = prop.expression;\n';
  script += 'result.expressionEnabled = prop.expressionEnabled;\n';
  script += 'result.expressionError = prop.expressionError || null;\n';
  script += 'result;\n';

  return script;
}

/**
 * Generate script to remove expression from a property
 */
export function generateRemoveExpression(params: {
  compId?: number;
  compName?: string;
  layerIndex?: number;
  layerName?: string;
  property: string;
}): string {
  let script = '';
  script += generateProjectCheck();
  script += generateCompAccess(params.compId, params.compName);
  script += generateLayerAccess('comp', params.layerIndex, params.layerName);
  script += generatePropertyAccess('layer', params.property);

  script += 'prop.expression = "";\n';

  script += generateResultObject({
    success: 'true',
    property: '"' + escapeString(params.property) + '"'
  });

  return wrapInUndoGroup(script, 'Remove Expression');
}

/**
 * Generate script to enable/disable expression
 */
export function generateEnableExpression(params: {
  compId?: number;
  compName?: string;
  layerIndex?: number;
  layerName?: string;
  property: string;
  enabled: boolean;
}): string {
  let script = '';
  script += generateProjectCheck();
  script += generateCompAccess(params.compId, params.compName);
  script += generateLayerAccess('comp', params.layerIndex, params.layerName);
  script += generatePropertyAccess('layer', params.property);

  script += 'prop.expressionEnabled = ' + params.enabled + ';\n';

  script += generateResultObject({
    success: 'true',
    property: '"' + escapeString(params.property) + '"',
    expressionEnabled: 'prop.expressionEnabled'
  });

  return wrapInUndoGroup(script, params.enabled ? 'Enable Expression' : 'Disable Expression');
}

/**
 * Generate script to add an expression control to a layer
 */
export function generateAddExpressionControl(params: {
  compId?: number;
  compName?: string;
  layerIndex?: number;
  layerName?: string;
  controlType: string;
  controlName: string;
  defaultValue?: number | number[] | boolean | string;
}): string {
  // Without this, a missing name was written as the literal text "undefined",
  // so expressions looking the control up by name could never find it.
  if (typeof params.controlName !== 'string' || params.controlName === '') {
    throw new Error('add_expression_control requires controlName - expressions find the control by this name');
  }
  let script = '';
  script += generateProjectCheck();
  script += generateCompAccess(params.compId, params.compName);
  script += generateLayerAccess('comp', params.layerIndex, params.layerName);

  // Map control types to effect match names
  const controlEffects: Record<string, string> = {
    slider: 'ADBE Slider Control',
    color: 'ADBE Color Control',
    point: 'ADBE Point Control',
    checkbox: 'ADBE Checkbox Control',
    dropdown: 'ADBE Dropdown Control',
    angle: 'ADBE Angle Control',
    layer: 'ADBE Layer Control'
  };

  const effectName = controlEffects[params.controlType];
  if (!effectName) {
    script += 'throw new Error("Unknown control type: ' + escapeString(params.controlType) + '");\n';
    return script;
  }

  script += 'var effect = layer.property("Effects").addProperty("' + effectName + '");\n';
  script += 'effect.name = "' + escapeString(params.controlName) + '";\n';

  // Set default value based on control type
  if (params.defaultValue !== undefined) {
    const propNameMap: Record<string, string> = {
      slider: 'Slider',
      color: 'Color',
      point: 'Point',
      checkbox: 'Checkbox',
      angle: 'Angle',
      layer: 'Layer'
    };
    const propName = propNameMap[params.controlType];
    if (propName && params.controlType !== 'dropdown') {
      if (Array.isArray(params.defaultValue)) {
        script += 'effect.property("' + propName + '").setValue([' + params.defaultValue.join(', ') + ']);\n';
      } else if (typeof params.defaultValue === 'boolean') {
        script += 'effect.property("' + propName + '").setValue(' + (params.defaultValue ? 1 : 0) + ');\n';
      } else {
        script += 'effect.property("' + propName + '").setValue(' + params.defaultValue + ');\n';
      }
    }
  }

  script += generateResultObject({
    success: 'true',
    controlName: '"' + escapeString(params.controlName) + '"',
    controlType: '"' + escapeString(params.controlType) + '"',
    effectIndex: 'effect.propertyIndex'
  });

  return wrapInUndoGroup(script, 'Add Expression Control');
}

/**
 * Generate script to apply an expression template
 */
export function generateApplyExpressionTemplate(params: {
  compId?: number;
  compName?: string;
  layerIndex?: number;
  layerName?: string;
  property: string;
  template: string;
  params?: Record<string, any>;
}): string {
  const expression = processExpressionTemplate(params.template, params.params);

  return generateSetExpression({
    compId: params.compId,
    compName: params.compName,
    layerIndex: params.layerIndex,
    layerName: params.layerName,
    property: params.property,
    expression: expression
  });
}

/**
 * Generate script to link properties with expression
 */
export function generateLinkProperties(params: {
  compId?: number;
  compName?: string;
  sourceLayerIndex?: number;
  sourceLayerName?: string;
  sourceProperty: string;
  targetLayerIndex?: number;
  targetLayerName?: string;
  targetProperty: string;
  offset?: number | number[];
}): string {
  let script = '';
  script += generateProjectCheck();
  script += generateCompAccess(params.compId, params.compName);

  // Build expression to link properties
  let targetLayerRef: string;
  if (params.targetLayerIndex) {
    targetLayerRef = 'thisComp.layer(' + params.targetLayerIndex + ')';
  } else if (params.targetLayerName) {
    targetLayerRef = 'thisComp.layer("' + escapeString(params.targetLayerName) + '")';
  } else {
    script += 'throw new Error("Target layer must be specified");\n';
    return script;
  }

  let expression = targetLayerRef + '.property("' + escapeString(params.targetProperty) + '").value';

  if (params.offset !== undefined) {
    if (Array.isArray(params.offset)) {
      expression += ' + [' + params.offset.join(', ') + ']';
    } else {
      expression += ' + ' + params.offset;
    }
  }

  // Set the expression on source property
  script += generateLayerAccess('comp', params.sourceLayerIndex, params.sourceLayerName);
  script += generatePropertyAccess('layer', params.sourceProperty);

  script += 'prop.expression = "' + escapeString(expression) + '";\n';

  script += generateResultObject({
    success: 'true',
    sourceProperty: '"' + escapeString(params.sourceProperty) + '"',
    linkedTo: '"' + escapeString(params.targetProperty) + '"'
  });

  return wrapInUndoGroup(script, 'Link Properties');
}

/**
 * Generate script to batch set expressions on multiple properties
 */
export function generateBatchSetExpressions(params: {
  compId?: number;
  compName?: string;
  layerIndex?: number;
  layerName?: string;
  expressions: Array<{ property: string; expression: string }>;
}): string {
  let script = '';
  script += generateProjectCheck();
  script += generateCompAccess(params.compId, params.compName);
  script += generateLayerAccess('comp', params.layerIndex, params.layerName);

  script += 'var results = [];\n';

  for (let i = 0; i < params.expressions.length; i++) {
    const expr = params.expressions[i];
    script += '// Expression ' + (i + 1) + '\n';
    script += 'try {\n';
    script += '  var prop' + i + ' = layer;\n';

    // Navigate to property
    const path = getPropertyPath(expr.property).split('/');
    for (let j = 0; j < path.length; j++) {
      script += '  prop' + i + ' = prop' + i + '.property("' + escapeString(path[j]) + '");\n';
    }

    script += '  prop' + i + '.expression = "' + escapeString(expr.expression) + '";\n';
    script += '  results.push({ property: "' + escapeString(expr.property) + '", success: true });\n';
    script += '} catch (e) {\n';
    script += '  results.push({ property: "' + escapeString(expr.property) + '", success: false, error: e.toString() });\n';
    script += '}\n';
  }

  script += 'results;\n';

  return wrapInUndoGroup(script, 'Batch Set Expressions');
}

/**
 * Get available expression templates
 */
export function getExpressionTemplates(): Record<string, { description: string; params?: Record<string, any> }> {
  const templates: Record<string, { description: string; params?: Record<string, any> }> = {};
  for (const name in EXPRESSION_TEMPLATES) {
    templates[name] = {
      description: EXPRESSION_TEMPLATES[name].description,
      params: EXPRESSION_TEMPLATES[name].params
    };
  }
  return templates;
}
