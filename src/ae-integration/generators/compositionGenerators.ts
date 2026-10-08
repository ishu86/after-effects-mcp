/**
 * Composition-related Script Generators
 *
 * Generates ES3-compatible ExtendScript for composition operations.
 */

import {
  escapeString,
  generateProjectCheck,
  generateCompAccess,
  colorToES3,
  wrapInUndoGroup,
  generateResultObject
} from './helpers.js';

/**
 * Generate script to create a new composition
 */
export function generateCreateComposition(params: {
  name: string;
  width: number;
  height: number;
  frameRate: number;
  duration: number;
  backgroundColor?: { r: number; g: number; b: number };
}): string {
  let script = '';
  script += generateProjectCheck();

  script += 'var comp = app.project.items.addComp(\n';
  script += '  "' + escapeString(params.name) + '",\n';
  script += '  ' + params.width + ',\n';
  script += '  ' + params.height + ',\n';
  script += '  1,\n'; // pixel aspect ratio
  script += '  ' + params.duration + ',\n';
  script += '  ' + params.frameRate + '\n';
  script += ');\n';

  if (params.backgroundColor) {
    script += 'comp.bgColor = ' + colorToES3(params.backgroundColor) + ';\n';
  }

  script += generateResultObject({
    id: 'comp.id',
    name: 'comp.name',
    width: 'comp.width',
    height: 'comp.height',
    frameRate: 'comp.frameRate',
    duration: 'comp.duration'
  });

  return wrapInUndoGroup(script, 'Create Composition');
}

/**
 * Generate script to modify an existing composition
 */
export function generateModifyComposition(params: {
  compId?: number;
  compName?: string;
  name?: string;
  width?: number;
  height?: number;
  frameRate?: number;
  duration?: number;
  backgroundColor?: { r: number; g: number; b: number };
}): string {
  let script = '';
  script += generateProjectCheck();
  script += generateCompAccess(params.compId, params.compName);

  if (params.name) {
    script += 'comp.name = "' + escapeString(params.name) + '";\n';
  }
  if (params.width) {
    script += 'comp.width = ' + params.width + ';\n';
  }
  if (params.height) {
    script += 'comp.height = ' + params.height + ';\n';
  }
  if (params.frameRate) {
    script += 'comp.frameRate = ' + params.frameRate + ';\n';
  }
  if (params.duration) {
    script += 'comp.duration = ' + params.duration + ';\n';
  }
  if (params.backgroundColor) {
    script += 'comp.bgColor = ' + colorToES3(params.backgroundColor) + ';\n';
  }

  script += generateResultObject({
    id: 'comp.id',
    name: 'comp.name',
    width: 'comp.width',
    height: 'comp.height',
    frameRate: 'comp.frameRate',
    duration: 'comp.duration'
  });

  return wrapInUndoGroup(script, 'Modify Composition');
}

/**
 * Generate script to duplicate a composition
 */
export function generateDuplicateComposition(params: {
  compId?: number;
  compName?: string;
  newName?: string;
}): string {
  let script = '';
  script += generateProjectCheck();
  script += generateCompAccess(params.compId, params.compName);

  script += 'var newComp = comp.duplicate();\n';

  if (params.newName) {
    script += 'newComp.name = "' + escapeString(params.newName) + '";\n';
  }

  script += generateResultObject({
    id: 'newComp.id',
    name: 'newComp.name',
    width: 'newComp.width',
    height: 'newComp.height',
    frameRate: 'newComp.frameRate',
    duration: 'newComp.duration'
  });

  return wrapInUndoGroup(script, 'Duplicate Composition');
}

/**
 * Generate script to delete a composition
 */
export function generateDeleteComposition(params: {
  compId?: number;
  compName?: string;
}): string {
  let script = '';
  script += generateProjectCheck();
  script += generateCompAccess(params.compId, params.compName);

  script += 'var deletedName = comp.name;\n';
  script += 'comp.remove();\n';

  script += generateResultObject({
    success: 'true',
    deleted: 'deletedName'
  });

  return wrapInUndoGroup(script, 'Delete Composition');
}

/**
 * Generate script to list all compositions
 */
export function generateListCompositions(): string {
  let script = '';
  script += generateProjectCheck();

  script += 'var compositions = [];\n';
  script += 'for (var i = 1; i <= app.project.numItems; i++) {\n';
  script += '  var item = app.project.item(i);\n';
  script += '  if (item instanceof CompItem) {\n';
  script += '    compositions.push({\n';
  script += '      id: item.id,\n';
  script += '      name: item.name,\n';
  script += '      width: item.width,\n';
  script += '      height: item.height,\n';
  script += '      frameRate: item.frameRate,\n';
  script += '      duration: item.duration,\n';
  script += '      numLayers: item.numLayers,\n';
  script += '      workAreaStart: item.workAreaStart,\n';
  script += '      workAreaDuration: item.workAreaDuration\n';
  script += '    });\n';
  script += '  }\n';
  script += '}\n';
  script += 'compositions;\n';

  return script;
}

/**
 * Generate script to get detailed composition info
 */
export function generateGetCompositionInfo(params: {
  compId?: number;
  compName?: string;
}): string {
  let script = '';
  script += generateProjectCheck();
  script += generateCompAccess(params.compId, params.compName);

  script += 'var compInfo = {\n';
  script += '  id: comp.id,\n';
  script += '  name: comp.name,\n';
  script += '  width: comp.width,\n';
  script += '  height: comp.height,\n';
  script += '  pixelAspect: comp.pixelAspect,\n';
  script += '  frameRate: comp.frameRate,\n';
  script += '  duration: comp.duration,\n';
  script += '  numLayers: comp.numLayers,\n';
  script += '  workAreaStart: comp.workAreaStart,\n';
  script += '  workAreaDuration: comp.workAreaDuration,\n';
  script += '  bgColor: [comp.bgColor[0], comp.bgColor[1], comp.bgColor[2]],\n';
  script += '  resolutionFactor: [comp.resolutionFactor[0], comp.resolutionFactor[1]],\n';
  script += '  shutterAngle: comp.shutterAngle,\n';
  script += '  shutterPhase: comp.shutterPhase,\n';
  script += '  motionBlur: comp.motionBlur,\n';
  script += '  renderer: comp.renderer\n';
  script += '};\n';

  // Get layer summary
  script += 'compInfo.layers = [];\n';
  script += 'for (var i = 1; i <= comp.numLayers; i++) {\n';
  script += '  var layer = comp.layer(i);\n';
  script += '  compInfo.layers.push({\n';
  script += '    index: layer.index,\n';
  script += '    name: layer.name,\n';
  script += '    enabled: layer.enabled,\n';
  script += '    inPoint: layer.inPoint,\n';
  script += '    outPoint: layer.outPoint\n';
  script += '  });\n';
  script += '}\n';

  script += 'compInfo;\n';

  return script;
}

/**
 * Generate script to set active composition
 */
export function generateSetActiveComposition(params: {
  compId?: number;
  compName?: string;
}): string {
  let script = '';
  script += generateProjectCheck();
  script += generateCompAccess(params.compId, params.compName);

  script += 'comp.openInViewer();\n';

  script += generateResultObject({
    id: 'comp.id',
    name: 'comp.name'
  });

  return script;
}


/**
 * Generate script to render a single frame of a composition to PNG.
 * Gives the AI "eyes": the returned path can be read back by the assistant.
 * Uses CompItem.saveFrameToPng (undocumented but stable since CC2020).
 */
export function generateRenderFrame(params: {
  compId?: number;
  compName?: string;
  time: number;
  outputDir?: string;
  fileName?: string;
}): string {
  let script = '';
  script += generateProjectCheck();
  script += generateCompAccess(params.compId, params.compName);

  const outputDir = params.outputDir || '~/Desktop/ae_probe';

  script += 'var t = ' + params.time + ';\n';
  script += 'if (t < 0) { t = 0; }\n';
  script += 'if (t > comp.duration) { t = comp.duration; }\n';
  script += 'var outFolder = new Folder("' + escapeString(outputDir) + '");\n';
  script += 'if (!outFolder.exists) {\n';
  script += '  if (!outFolder.create()) {\n';
  script += '    throw new Error("Failed to create output folder: " + outFolder.fsName);\n';
  script += '  }\n';
  script += '}\n';
  // Sanitize custom fileName to a basename with a safe charset so callers cannot
  // escape outputDir via "../" or absolute paths. Default names are already safe.
  if (params.fileName) {
    const base = params.fileName.replace(/\\/g, '/').split('/').pop() || '';
    const safe = base.replace(/[^A-Za-z0-9_\-.]+/g, '_').replace(/^\.+/, '');
    const outName = safe || 'frame.png';
    script += 'var outName = "' + escapeString(outName) + '";\n';
  } else {
    script += 'var safeName = String(comp.name).replace(/[^A-Za-z0-9_\\-]+/g, "_");\n';
    script += 'var outName = safeName + "_t" + String(Math.round(t * 100) / 100).replace(".", "_") + "s.png";\n';
  }
  script += 'var outFile = new File(outFolder.fsName + "/" + outName);\n';
  script += 'if (!comp.saveFrameToPng) {\n';
  script += '  throw new Error("saveFrameToPng is not available in this After Effects version");\n';
  script += '}\n';
  // Remove any previous render first. Otherwise an old file satisfies the
  // existence check below even when nothing new was written.
  script += 'if (outFile.exists && !outFile.remove()) {\n';
  script += '  throw new Error("Cannot remove the previous frame render: " + outFile.fsName);\n';
  script += '}\n';
  script += 'comp.saveFrameToPng(t, outFile);\n';
  // saveFrameToPng returns BEFORE the file is on disk (measured on AE 26.5: it
  // appears ~50 ms later). Checking immediately reported every render as a
  // failure. Wait for the file to appear, then for its size to stop changing,
  // as a best-effort check for an incomplete write.
  script += 'var waitedMs = 0;\n';
  script += 'while (!outFile.exists && waitedMs < 15000) { $.sleep(50); waitedMs += 50; }\n';
  script += 'if (!outFile.exists) {\n';
  script += '  throw new Error("Frame render did not produce a file within 15s: " + outFile.fsName);\n';
  script += '}\n';
  script += 'var lastSize = -1, stableChecks = 0;\n';
  script += 'while (stableChecks < 3 && waitedMs < 15000) {\n';
  script += '  $.sleep(50); waitedMs += 50;\n';
  script += '  if (outFile.length > 0 && outFile.length === lastSize) { stableChecks++; } else { stableChecks = 0; }\n';
  script += '  lastSize = outFile.length;\n';
  script += '}\n';
  script += 'if (stableChecks < 3 || !outFile.exists || outFile.length <= 0) {\n';
  script += '  throw new Error("Frame render did not finish writing within 15s: " + outFile.fsName);\n';
  script += '}\n';

  script += generateResultObject({
    success: 'true',
    time: 't',
    path: 'outFile.fsName',
    bytes: 'outFile.length',
    waitedMs: 'waitedMs'
  });

  return script;
}

/**
 * Generate script for a full composition report: layers with geometry,
 * text data, expressions, keyframes and time samples. Lets the AI verify
 * the real state of a comp instead of trusting its own writes.
 */
export function generateGetCompReport(params: {
  compId?: number;
  compName?: string;
  sampleTimes?: number[];
  textPreview?: number;
}): string {
  let script = '';
  script += generateProjectCheck();
  script += generateCompAccess(params.compId, params.compName);

  const preview = params.textPreview || 120;

  // -- helpers (ES3) --
  // Never emit NaN/Infinity: CEP JSON.stringify polyfills turn them into bare
  // tokens that Node JSON.parse rejects, breaking the whole report bridge.
  script += 'function __r2(v) {\n';
  script += '  if (typeof v !== "number" || !isFinite(v)) { return null; }\n';
  script += '  return Math.round(v * 100) / 100;\n';
  script += '}\n';
  script += 'function __vec(v) {\n';
  script += '  if (v === null || v === undefined) { return null; }\n';
  script += '  if (typeof v === "number") { return __r2(v); }\n';
  script += '  if (v instanceof Array) {\n';
  script += '    var o = [];\n';
  script += '    for (var i = 0; i < v.length; i++) {\n';
  script += '      if (typeof v[i] !== "number" || !isFinite(v[i])) { return null; }\n';
  script += '      o.push(__r2(v[i]));\n';
  script += '    }\n';
  script += '    return o;\n';
  script += '  }\n';
  script += '  return null;\n';
  script += '}\n';

  // -- comp info --
  script += 'var report = {};\n';
  script += 'report.comp = { id: comp.id, name: comp.name, width: comp.width, height: comp.height, duration: __r2(comp.duration), frameRate: __r2(comp.frameRate), numLayers: comp.numLayers };\n';

  // -- markers --
  script += 'report.markers = [];\n';
  script += 'try {\n';
  script += '  var mk = comp.markerProperty;\n';
  script += '  for (var mi = 1; mi <= mk.numKeys; mi++) {\n';
  script += '    report.markers.push({ time: __r2(mk.keyTime(mi)), comment: mk.keyValue(mi).comment });\n';
  script += '  }\n';
  script += '} catch (eMk) {}\n';

  // -- sample times: explicit > markers > uniform 5 --
  if (params.sampleTimes && params.sampleTimes.length > 0) {
    const times: string[] = [];
    for (let i = 0; i < params.sampleTimes.length; i++) {
      times.push(String(params.sampleTimes[i]));
    }
    script += 'var sampleTimes = [' + times.join(', ') + '];\n';
  } else {
    script += 'var sampleTimes = [];\n';
    script += 'for (var si = 0; si < report.markers.length && si < 12; si++) { sampleTimes.push(report.markers[si].time); }\n';
    script += 'if (sampleTimes.length === 0) {\n';
    script += '  for (var ui = 1; ui <= 5; ui++) { sampleTimes.push(__r2(comp.duration * ui / 6)); }\n';
    script += '}\n';
  }
  script += 'report.sampleTimes = sampleTimes;\n';

  // -- recursive walk for expressions + keyframes --
  script += 'function __walk(group, path, acc, depth) {\n';
  script += '  if (depth > 5) { return; }\n';
  script += '  var n = 0;\n';
  script += '  try { n = group.numProperties; } catch (eN) { return; }\n';
  script += '  for (var i = 1; i <= n; i++) {\n';
  script += '    var sub = null;\n';
  script += '    try { sub = group.property(i); } catch (eS) { continue; }\n';
  script += '    if (!sub) { continue; }\n';
  script += '    var here = path + "/" + sub.name;\n';
  script += '    if (sub.propertyType === PropertyType.PROPERTY) {\n';
  script += '      var entry = null;\n';
  script += '      try {\n';
  script += '        if (sub.canSetExpression && sub.expression !== "") {\n';
  script += '          entry = { path: here, expression: sub.expression, enabled: sub.expressionEnabled };\n';
  script += '          if (sub.expressionError) { entry.error = sub.expressionError; }\n';
  script += '        }\n';
  script += '      } catch (eE) {}\n';
  script += '      try {\n';
  script += '        if (sub.numKeys > 0) {\n';
  script += '          if (!entry) { entry = { path: here }; }\n';
  script += '          entry.numKeys = sub.numKeys;\n';
  script += '          entry.keys = [];\n';
  script += '          for (var k = 1; k <= sub.numKeys && k <= 10; k++) {\n';
  script += '            entry.keys.push({ t: __r2(sub.keyTime(k)), v: __vec(sub.keyValue(k)) });\n';
  script += '          }\n';
  script += '        }\n';
  script += '      } catch (eK) {}\n';
  script += '      if (entry) { acc.push(entry); }\n';
  script += '    } else {\n';
  script += '      __walk(sub, here, acc, depth + 1);\n';
  script += '    }\n';
  script += '  }\n';
  script += '}\n';

  // -- layers --
  script += 'report.layers = [];\n';
  script += 'for (var li = 1; li <= comp.numLayers; li++) {\n';
  script += '  var ly = comp.layer(li);\n';
  script += '  var L = { index: li, name: ly.name, matchName: ly.matchName, enabled: ly.enabled, inPoint: __r2(ly.inPoint), outPoint: __r2(ly.outPoint) };\n';
  script += '  try { L.threeD = ly.threeDLayer; } catch (e3) {}\n';
  script += '  try { L.parent = ly.parent ? ly.parent.name : null; } catch (eP) {}\n';
  script += '  try {\n';
  script += '    var rc = ly.sourceRectAtTime(ly.inPoint, false);\n';
  script += '    L.rect = { w: Math.round(rc.width), h: Math.round(rc.height), left: Math.round(rc.left), top: Math.round(rc.top) };\n';
  script += '  } catch (eR) {}\n';
  script += '  try { L.position = __vec(ly.property("Position").value); } catch (ePos) {}\n';
  script += '  try { L.anchor = __vec(ly.property("Anchor Point").value); } catch (eA) {}\n';
  script += '  try { L.scale = __vec(ly.property("Scale").value); } catch (eSc) {}\n';
  script += '  try { L.opacity = __r2(ly.property("Opacity").value); } catch (eO) {}\n';
  script += '  try {\n';
  script += '    if (ly.threeDLayer) {\n';
  script += '      L.rotX = __r2(ly.property("X Rotation").value);\n';
  script += '      L.rotY = __r2(ly.property("Y Rotation").value);\n';
  script += '      L.rotZ = __r2(ly.property("Z Rotation").value);\n';
  script += '    } else {\n';
  script += '      L.rotation = __r2(ly.property("Rotation").value);\n';
  script += '    }\n';
  script += '  } catch (eRot) {}\n';
  script += '  if (ly instanceof TextLayer) {\n';
  script += '    try {\n';
  script += '      var td = ly.property("Source Text").value;\n';
  script += '      L.text = { font: td.font, fontFamily: td.fontFamily, fontSize: __r2(td.fontSize), tracking: __r2(td.tracking), preview: String(td.text).substring(0, ' + preview + ') };\n';
  script += '      try { L.text.leading = __r2(td.leading); } catch (eLd) {}\n';
  script += '    } catch (eT) {}\n';
  script += '  }\n';
  script += '  if (ly.matchName === "ADBE Camera Layer") {\n';
  script += '    try { L.zoom = __r2(ly.property("Camera Options").property("Zoom").value); } catch (eZ) {}\n';
  script += '  }\n';
  script += '  var animated = [];\n';
  script += '  __walk(ly, "", animated, 0);\n';
  script += '  if (animated.length > 0) { L.animatedProps = animated; }\n';
  script += '  var samples = [];\n';
  script += '  for (var st = 0; st < sampleTimes.length; st++) {\n';
  script += '    var T = sampleTimes[st];\n';
  script += '    if (T < ly.inPoint || T > ly.outPoint) { continue; }\n';
  script += '    try {\n';
  script += '      var hasAnim = false;\n';
  script += '      var pp = ly.property("Position");\n';
  script += '      var op = ly.property("Opacity");\n';
  script += '      var sp = ly.property("Scale");\n';
  script += '      if (pp && (pp.numKeys > 0 || pp.expressionEnabled)) { hasAnim = true; }\n';
  script += '      if (op && (op.numKeys > 0 || op.expressionEnabled)) { hasAnim = true; }\n';
  script += '      if (sp && (sp.numKeys > 0 || sp.expressionEnabled)) { hasAnim = true; }\n';
  script += '      if (hasAnim) {\n';
  script += '        samples.push({ t: __r2(T), position: __vec(pp.valueAtTime(T, false)), scale: __vec(sp.valueAtTime(T, false)), opacity: __r2(op.valueAtTime(T, false)) });\n';
  script += '      }\n';
  script += '    } catch (eSm) {}\n';
  script += '  }\n';
  script += '  if (samples.length > 0) { L.samples = samples; }\n';
  script += '  report.layers.push(L);\n';
  script += '}\n';

  // -- fonts used vs installed --
  script += 'report.fonts = [];\n';
  script += 'try {\n';
  script += '  var used = {};\n';
  script += '  for (var fi = 0; fi < report.layers.length; fi++) {\n';
  script += '    var lt = report.layers[fi].text;\n';
  script += '    if (lt && lt.font) { used[lt.font] = 1; }\n';
  script += '  }\n';
  script += '  for (var ps in used) {\n';
  script += '    if (!used.hasOwnProperty(ps)) { continue; }\n';
  script += '    var entryF = { postScriptName: ps, installed: "unknown" };\n';
  script += '    try {\n';
  // AE 24+: allFonts is an array of family arrays; older shapes may be flat.
  script += '      entryF.installed = false;\n';
  script += '      if (app.fonts && typeof app.fonts.getFontByPostScriptName === "function") {\n';
  script += '        entryF.installed = !!app.fonts.getFontByPostScriptName(ps);\n';
  script += '      } else {\n';
  script += '        var all = app.fonts.allFonts;\n';
  script += '        for (var ai = 0; ai < all.length; ai++) {\n';
  script += '          var family = all[ai];\n';
  script += '          if (family && family.postScriptName === ps) { entryF.installed = true; break; }\n';
  script += '          if (!(family instanceof Array)) { continue; }\n';
  script += '          for (var fi2 = 0; fi2 < family.length; fi2++) {\n';
  script += '            if (family[fi2] && family[fi2].postScriptName === ps) { entryF.installed = true; break; }\n';
  script += '          }\n';
  script += '          if (entryF.installed) { break; }\n';
  script += '        }\n';
  script += '      }\n';
  script += '    } catch (eF) {}\n';
  script += '    report.fonts.push(entryF);\n';
  script += '  }\n';
  script += '} catch (eFF) {}\n';

  script += 'report;\n';

  return script;
}
