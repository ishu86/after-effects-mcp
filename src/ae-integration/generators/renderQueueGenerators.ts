/**
 * Render Queue Generators
 *
 * The server previously had no render queue coverage at all - render_frame
 * grabs a single still, but there was no way to actually deliver anything.
 *
 * Verified against the After Effects scripting guide (renderqueue/*).
 */

import {
  escapeString,
  generateProjectCheck,
  generateCompAccess,
  generateResultObject,
  wrapInUndoGroup
} from './helpers.js';

/**
 * Emit an ES3 helper that maps RQItemStatus to a readable string.
 * The enum values are opaque numbers over the bridge, so translate them here.
 */
function emitStatusHelper(): string {
  let s = '';
  s += 'function statusName(st) {\n';
  s += '  if (st === RQItemStatus.WILL_CONTINUE) { return "willContinue"; }\n';
  s += '  if (st === RQItemStatus.NEEDS_OUTPUT) { return "needsOutput"; }\n';
  s += '  if (st === RQItemStatus.UNQUEUED) { return "unqueued"; }\n';
  s += '  if (st === RQItemStatus.QUEUED) { return "queued"; }\n';
  s += '  if (st === RQItemStatus.RENDERING) { return "rendering"; }\n';
  s += '  if (st === RQItemStatus.USER_STOPPED) { return "userStopped"; }\n';
  s += '  if (st === RQItemStatus.ERR_STOPPED) { return "errStopped"; }\n';
  s += '  if (st === RQItemStatus.DONE) { return "done"; }\n';
  s += '  return "unknown";\n';
  s += '}\n';
  return s;
}

/** Emit ES3 resolving `rqItem` from a 1-based render queue index. */
function emitRQItemAccess(itemIndex: number): string {
  let s = '';
  s += 'var rq = app.project.renderQueue;\n';
  s += 'if (' + itemIndex + ' < 1 || ' + itemIndex + ' > rq.numItems) {\n';
  s += '  throw new Error("Render queue index ' + itemIndex + ' out of range; queue has " + rq.numItems + " item(s)");\n';
  s += '}\n';
  s += 'var rqItem = rq.item(' + itemIndex + ');\n';
  return s;
}

/**
 * Add a composition to the render queue.
 */
export function generateAddToRenderQueue(params: {
  compId?: number;
  compName?: string;
  outputPath?: string;
  renderSettingsTemplate?: string;
  outputModuleTemplate?: string;
  timeSpanStart?: number;
  timeSpanDuration?: number;
  skipFrames?: number;
}): string {
  let script = '';
  script += generateProjectCheck();
  script += generateCompAccess(params.compId, params.compName);
  script += emitStatusHelper();

  script += 'var rqItem = app.project.renderQueue.items.add(comp);\n';

  // Render settings template must be applied before output module settings,
  // because applying a render template can reset the output modules.
  if (params.renderSettingsTemplate) {
    script += 'rqItem.applyTemplate("' + escapeString(params.renderSettingsTemplate) + '");\n';
  }
  if (params.outputModuleTemplate) {
    script += 'rqItem.outputModule(1).applyTemplate("' + escapeString(params.outputModuleTemplate) + '");\n';
  }
  if (params.outputPath) {
    script += 'rqItem.outputModule(1).file = new File("' + escapeString(params.outputPath) + '");\n';
  }
  if (params.timeSpanStart !== undefined) {
    script += 'rqItem.timeSpanStart = ' + params.timeSpanStart + ';\n';
  }
  if (params.timeSpanDuration !== undefined) {
    script += 'rqItem.timeSpanDuration = ' + params.timeSpanDuration + ';\n';
  }
  if (params.skipFrames !== undefined) {
    script += 'rqItem.skipFrames = ' + params.skipFrames + ';\n';
  }

  script += generateResultObject({
    queueIndex: 'app.project.renderQueue.numItems',
    compName: 'comp.name',
    status: 'statusName(rqItem.status)',
    outputPath: 'rqItem.outputModule(1).file ? rqItem.outputModule(1).file.fsName : null',
    timeSpanStart: 'rqItem.timeSpanStart',
    timeSpanDuration: 'rqItem.timeSpanDuration'
  });

  return wrapInUndoGroup(script, 'Add to Render Queue');
}

/**
 * List the render queue with per-item status and output paths.
 */
export function generateListRenderQueue(_params: Record<string, never> = {} as Record<string, never>): string {
  let script = '';
  script += generateProjectCheck();
  script += emitStatusHelper();

  script += 'var rq = app.project.renderQueue;\n';
  script += 'var items = [];\n';
  script += 'for (var i = 1; i <= rq.numItems; i++) {\n';
  script += '  var it = rq.item(i);\n';
  script += '  var mods = [];\n';
  script += '  for (var m = 1; m <= it.numOutputModules; m++) {\n';
  script += '    var om = it.outputModule(m);\n';
  script += '    mods.push({\n';
  script += '      index: m,\n';
  script += '      name: om.name,\n';
  script += '      file: om.file ? om.file.fsName : null\n';
  script += '    });\n';
  script += '  }\n';
  script += '  items.push({\n';
  script += '    index: i,\n';
  script += '    compName: it.comp.name,\n';
  script += '    status: statusName(it.status),\n';
  script += '    timeSpanStart: it.timeSpanStart,\n';
  script += '    timeSpanDuration: it.timeSpanDuration,\n';
  script += '    skipFrames: it.skipFrames,\n';
  script += '    elapsedSeconds: it.elapsedSeconds,\n';
  script += '    outputModules: mods\n';
  script += '  });\n';
  script += '}\n';

  script += generateResultObject({
    numItems: 'rq.numItems',
    rendering: 'rq.rendering',
    canQueueInAME: 'rq.canQueueInAME',
    items: 'items'
  });

  return script;
}

/**
 * List the available render settings and output module templates, so callers
 * can use the presets already configured in After Effects by name rather than
 * trying to reconstruct settings.
 */
export function generateListRenderTemplates(_params: Record<string, never> = {} as Record<string, never>): string {
  let script = '';
  script += generateProjectCheck();

  // Templates are read off a queue item, so use a temporary one when the queue
  // is empty, then remove it again.
  script += 'var rq = app.project.renderQueue;\n';
  script += 'var tempItem = null;\n';
  script += 'var probe = null;\n';
  script += 'if (rq.numItems > 0) {\n';
  script += '  probe = rq.item(1);\n';
  script += '} else {\n';
  script += '  var tempComp = app.project.items.addComp("__rq_template_probe__", 16, 16, 1, 1, 24);\n';
  script += '  tempItem = rq.items.add(tempComp);\n';
  script += '  probe = tempItem;\n';
  script += '}\n';
  script += 'var renderTemplates = probe.templates;\n';
  script += 'var omTemplates = probe.outputModule(1).templates;\n';
  script += 'if (tempItem !== null) {\n';
  script += '  var tc = tempItem.comp;\n';
  script += '  tempItem.remove();\n';
  script += '  tc.remove();\n';
  script += '}\n';

  script += generateResultObject({
    renderSettingsTemplates: 'renderTemplates',
    outputModuleTemplates: 'omTemplates'
  });

  return script;
}

/**
 * Change settings on an existing render queue item.
 */
export function generateSetRenderQueueItem(params: {
  itemIndex: number;
  outputPath?: string;
  renderSettingsTemplate?: string;
  outputModuleTemplate?: string;
  outputModuleIndex?: number;
  timeSpanStart?: number;
  timeSpanDuration?: number;
  skipFrames?: number;
  render?: boolean;
}): string {
  if (typeof params.itemIndex !== 'number') {
    throw new Error('itemIndex is required (1-based render queue index)');
  }

  const omIndex = params.outputModuleIndex || 1;

  let script = '';
  script += generateProjectCheck();
  script += emitStatusHelper();
  script += emitRQItemAccess(params.itemIndex);

  if (params.renderSettingsTemplate) {
    script += 'rqItem.applyTemplate("' + escapeString(params.renderSettingsTemplate) + '");\n';
  }
  if (params.outputModuleTemplate) {
    script += 'rqItem.outputModule(' + omIndex + ').applyTemplate("' + escapeString(params.outputModuleTemplate) + '");\n';
  }
  if (params.outputPath) {
    script += 'rqItem.outputModule(' + omIndex + ').file = new File("' + escapeString(params.outputPath) + '");\n';
  }
  if (params.timeSpanStart !== undefined) {
    script += 'rqItem.timeSpanStart = ' + params.timeSpanStart + ';\n';
  }
  if (params.timeSpanDuration !== undefined) {
    script += 'rqItem.timeSpanDuration = ' + params.timeSpanDuration + ';\n';
  }
  if (params.skipFrames !== undefined) {
    script += 'rqItem.skipFrames = ' + params.skipFrames + ';\n';
  }
  if (params.render !== undefined) {
    // Controls whether this item is checked/queued for the next render pass.
    script += 'rqItem.render = ' + (params.render ? 'true' : 'false') + ';\n';
  }

  script += generateResultObject({
    index: String(params.itemIndex),
    compName: 'rqItem.comp.name',
    status: 'statusName(rqItem.status)',
    outputPath: 'rqItem.outputModule(' + omIndex + ').file ? rqItem.outputModule(' + omIndex + ').file.fsName : null'
  });

  return wrapInUndoGroup(script, 'Set Render Queue Item');
}

/**
 * Remove an item from the render queue, or clear the whole queue.
 */
export function generateRemoveFromRenderQueue(params: {
  itemIndex?: number;
  all?: boolean;
}): string {
  let script = '';
  script += generateProjectCheck();
  script += 'var rq = app.project.renderQueue;\n';

  if (params.all) {
    script += 'var removed = rq.numItems;\n';
    script += 'for (var i = rq.numItems; i >= 1; i--) {\n';
    script += '  rq.item(i).remove();\n';
    script += '}\n';
  } else {
    if (typeof params.itemIndex !== 'number') {
      throw new Error('Provide itemIndex, or all: true to clear the queue');
    }
    script += emitRQItemAccess(params.itemIndex);
    script += 'rqItem.remove();\n';
    script += 'var removed = 1;\n';
  }

  script += generateResultObject({
    removed: 'removed',
    remaining: 'rq.numItems'
  });

  return wrapInUndoGroup(script, 'Remove from Render Queue');
}

/**
 * Start synchronous native rendering or show the Render Queue panel.
 * RenderQueue.render() blocks CEP until the queue finishes: the bridge cannot
 * poll, stop, pause or resume it. A command timeout does NOT cancel the render.
 * Use queue_in_ame for long jobs and AE's UI to interrupt native rendering.
 */
export function generateControlRender(params: {
  action: 'start' | 'stop' | 'pause' | 'resume' | 'showWindow';
}): string {
  const action = params.action;
  if (['stop', 'pause', 'resume'].indexOf(action) !== -1) {
    throw new Error('The CEP bridge cannot stop, pause or resume a synchronous native render. Use After Effects UI controls or queue_in_ame for long jobs.');
  }
  const valid = ['start', 'showWindow'];
  if (valid.indexOf(action) === -1) {
    throw new Error('action must be one of: ' + valid.join(', '));
  }

  let script = '';
  script += generateProjectCheck();
  script += emitStatusHelper();
  script += 'var rq = app.project.renderQueue;\n';

  if (action === 'start') {
    script += 'if (rq.numItems === 0) { throw new Error("Render queue is empty"); }\n';
    script += 'rq.render();\n';
  } else {
    script += 'rq.showWindow(true);\n';
  }

  script += generateResultObject({
    action: '"' + action + '"',
    rendering: 'rq.rendering',
    numItems: 'rq.numItems'
  });

  return script;
}

/**
 * Hand the render queue to Adobe Media Encoder.
 *
 * Unlike render(), this returns immediately - AME does the work in its own
 * process - which makes it the better choice for anything long.
 */
export function generateQueueInAME(params: { renderImmediately?: boolean }): string {
  const immediate = params.renderImmediately === true;

  let script = '';
  script += generateProjectCheck();
  script += 'var rq = app.project.renderQueue;\n';
  script += 'if (!rq.canQueueInAME) {\n';
  script += '  throw new Error("Cannot queue in AME. Check that Adobe Media Encoder is installed and that the queue has at least one item needing output.");\n';
  script += '}\n';
  script += 'rq.queueInAME(' + (immediate ? 'true' : 'false') + ');\n';

  script += generateResultObject({
    queuedInAME: 'true',
    startedProcessing: immediate ? 'true' : 'false',
    numItems: 'rq.numItems'
  });

  return script;
}
