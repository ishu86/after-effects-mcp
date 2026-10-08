/**
 * Motion Graphics Template Generators
 *
 * Generates ES3-compatible ExtendScript for creating motion graphics templates
 * like lower thirds, title cards, transitions, and logo reveals.
 */

import {
  escapeString,
  generateProjectCheck,
  generateCompAccess,
  generateLayerAccess,
  colorToES3,
  positionToES3,
  wrapInUndoGroup,
  generateResultObject,
  generateJustification
} from './helpers.js';

/**
 * Lower third style configurations
 */
const LOWER_THIRD_STYLES = {
  modern: {
    barHeight: 60,
    barOffset: 10,
    titleSize: 32,
    subtitleSize: 18,
    animationDuration: 0.5
  },
  corporate: {
    barHeight: 80,
    barOffset: 0,
    titleSize: 36,
    subtitleSize: 20,
    animationDuration: 0.6
  },
  news: {
    barHeight: 70,
    barOffset: 0,
    titleSize: 28,
    subtitleSize: 16,
    animationDuration: 0.4
  },
  minimal: {
    barHeight: 0,
    barOffset: 20,
    titleSize: 28,
    subtitleSize: 16,
    animationDuration: 0.3
  },
  social: {
    barHeight: 50,
    barOffset: 15,
    titleSize: 24,
    subtitleSize: 14,
    animationDuration: 0.4
  }
};

/**
 * Generate script to create a lower third
 */
export function generateCreateLowerThird(params: {
  compId?: number;
  compName?: string;
  style: string;
  name: string;
  title: string;
  subtitle?: string;
  duration?: number;
  animateIn?: boolean;
  animateOut?: boolean;
  primaryColor?: { r: number; g: number; b: number };
  secondaryColor?: { r: number; g: number; b: number };
  textColor?: { r: number; g: number; b: number };
  position?: string;
}): string {
  let script = '';
  script += generateProjectCheck();
  script += generateCompAccess(params.compId, params.compName);

  const style = LOWER_THIRD_STYLES[params.style as keyof typeof LOWER_THIRD_STYLES] || LOWER_THIRD_STYLES.modern;
  const duration = params.duration || 5;
  const animateIn = params.animateIn !== false;
  const animateOut = params.animateOut !== false;
  const primaryColor = params.primaryColor || { r: 0.2, g: 0.4, b: 0.8 };
  const secondaryColor = params.secondaryColor || { r: 0.1, g: 0.2, b: 0.4 };
  const textColor = params.textColor || { r: 1, g: 1, b: 1 };

  // Calculate positions
  script += 'var compW = comp.width;\n';
  script += 'var compH = comp.height;\n';
  script += 'var margin = 50;\n';
  script += 'var barHeight = ' + style.barHeight + ';\n';
  script += 'var barOffset = ' + style.barOffset + ';\n';
  script += 'var yPos = compH - margin - barHeight - barOffset;\n';

  // Position based on alignment
  let xPosScript = 'margin';
  if (params.position === 'bottomRight') {
    xPosScript = 'compW - margin';
  } else if (params.position === 'bottomCenter') {
    xPosScript = 'compW / 2';
  }
  script += 'var xPos = ' + xPosScript + ';\n';

  // Create precomp for lower third
  script += 'var ltComp = app.project.items.addComp(\n';
  script += '  "' + escapeString(params.name) + '",\n';
  script += '  comp.width,\n';
  script += '  200,\n'; // Height for lower third elements
  script += '  1,\n';
  script += '  ' + duration + ',\n';
  script += '  comp.frameRate\n';
  script += ');\n';

  // Add background bar if style uses one
  if (style.barHeight > 0) {
    script += 'var barLayer = ltComp.layers.addSolid(\n';
    script += '  ' + colorToES3(primaryColor) + ',\n';
    script += '  "Bar",\n';
    script += '  ltComp.width,\n';
    script += '  ' + style.barHeight + ',\n';
    script += '  1\n';
    script += ');\n';
    script += 'barLayer.property("Position").setValue([ltComp.width/2, ltComp.height/2]);\n';

    // Animate bar
    if (animateIn) {
      script += 'barLayer.property("Scale").setValueAtTime(0, [0, 100]);\n';
      script += 'barLayer.property("Scale").setValueAtTime(' + style.animationDuration + ', [100, 100]);\n';
      script += 'var scaleKeys = barLayer.property("Scale");\n';
      script += 'var numDims = scaleKeys.value.length;\n';
      script += 'for (var k = 1; k <= scaleKeys.numKeys; k++) {\n';
      script += '  var easeArr = [];\n';
      script += '  for (var d = 0; d < numDims; d++) {\n';
      script += '    easeArr.push(new KeyframeEase(0, 80));\n';
      script += '  }\n';
      script += '  scaleKeys.setTemporalEaseAtKey(k, easeArr, easeArr);\n';
      script += '}\n';
    }
  }

  // Add title text
  script += 'var titleLayer = ltComp.layers.addText("' + escapeString(params.title) + '");\n';
  script += 'titleLayer.name = "Title";\n';
  script += 'var titleDoc = titleLayer.property("Source Text").value;\n';
  script += 'titleDoc.fontSize = ' + style.titleSize + ';\n';
  script += 'titleDoc.fillColor = ' + colorToES3(textColor) + ';\n';
  script += 'titleDoc.font = "Arial-BoldMT";\n';
  script += 'titleLayer.property("Source Text").setValue(titleDoc);\n';
  script += 'titleLayer.property("Position").setValue([margin, ltComp.height/2 - 10]);\n';
  script += 'titleLayer.property("Anchor Point").setValue([0, titleDoc.fontSize]);\n';

  // Animate title
  if (animateIn) {
    script += 'titleLayer.property("Opacity").setValueAtTime(0, 0);\n';
    script += 'titleLayer.property("Opacity").setValueAtTime(' + (style.animationDuration * 0.8) + ', 100);\n';
    script += 'titleLayer.property("Position").setValueAtTime(0, [margin - 30, ltComp.height/2 - 10]);\n';
    script += 'titleLayer.property("Position").setValueAtTime(' + style.animationDuration + ', [margin, ltComp.height/2 - 10]);\n';
  }

  // Add subtitle if provided
  if (params.subtitle) {
    script += 'var subLayer = ltComp.layers.addText("' + escapeString(params.subtitle) + '");\n';
    script += 'subLayer.name = "Subtitle";\n';
    script += 'var subDoc = subLayer.property("Source Text").value;\n';
    script += 'subDoc.fontSize = ' + style.subtitleSize + ';\n';
    script += 'subDoc.fillColor = ' + colorToES3(textColor) + ';\n';
    script += 'subDoc.font = "ArialMT";\n';
    script += 'subLayer.property("Source Text").setValue(subDoc);\n';
    script += 'subLayer.property("Position").setValue([margin, ltComp.height/2 + 20]);\n';
    script += 'subLayer.property("Anchor Point").setValue([0, subDoc.fontSize]);\n';

    if (animateIn) {
      script += 'subLayer.property("Opacity").setValueAtTime(0, 0);\n';
      script += 'subLayer.property("Opacity").setValueAtTime(' + style.animationDuration + ', 100);\n';
    }
  }

  // Animate out if requested
  if (animateOut) {
    const outStart = duration - style.animationDuration;
    if (style.barHeight > 0) {
      script += 'barLayer.property("Scale").setValueAtTime(' + outStart + ', [100, 100]);\n';
      script += 'barLayer.property("Scale").setValueAtTime(' + duration + ', [0, 100]);\n';
    }
    script += 'titleLayer.property("Opacity").setValueAtTime(' + outStart + ', 100);\n';
    script += 'titleLayer.property("Opacity").setValueAtTime(' + duration + ', 0);\n';
    if (params.subtitle) {
      script += 'subLayer.property("Opacity").setValueAtTime(' + outStart + ', 100);\n';
      script += 'subLayer.property("Opacity").setValueAtTime(' + duration + ', 0);\n';
    }
  }

  // Add precomp to main comp
  script += 'var ltInMain = comp.layers.add(ltComp);\n';
  script += 'ltInMain.property("Position").setValue([xPos, yPos]);\n';
  script += 'ltInMain.property("Anchor Point").setValue([0, 0]);\n';

  script += generateResultObject({
    precompId: 'ltComp.id',
    precompName: 'ltComp.name',
    layerIndex: 'ltInMain.index'
  });

  return wrapInUndoGroup(script, 'Create Lower Third');
}

/**
 * Generate script to create a title card
 */
export function generateCreateTitleCard(params: {
  compId?: number;
  compName?: string;
  style: string;
  title: string;
  subtitle?: string;
  duration?: number;
  fontFamily?: string;
  fontSize?: number;
  color?: { r: number; g: number; b: number };
  backgroundColor?: { r: number; g: number; b: number };
}): string {
  let script = '';
  script += generateProjectCheck();
  script += generateCompAccess(params.compId, params.compName);

  const duration = params.duration || 4;
  const fontFamily = params.fontFamily || 'Arial-BoldMT';
  const fontSize = params.fontSize || 72;
  const textColor = params.color || { r: 1, g: 1, b: 1 };
  const bgColor = params.backgroundColor || { r: 0, g: 0, b: 0 };

  // Create background if needed
  if (params.backgroundColor) {
    script += 'var bgLayer = comp.layers.addSolid(\n';
    script += '  ' + colorToES3(bgColor) + ',\n';
    script += '  "Title Background",\n';
    script += '  comp.width,\n';
    script += '  comp.height,\n';
    script += '  1\n';
    script += ');\n';
    script += 'bgLayer.outPoint = ' + duration + ';\n';
  }

  // Add title
  script += 'var titleLayer = comp.layers.addText("' + escapeString(params.title) + '");\n';
  script += 'titleLayer.name = "Title";\n';
  script += 'var titleDoc = titleLayer.property("Source Text").value;\n';
  script += 'titleDoc.fontSize = ' + fontSize + ';\n';
  script += 'titleDoc.fillColor = ' + colorToES3(textColor) + ';\n';
  script += 'titleDoc.font = "' + escapeString(fontFamily) + '";\n';
  script += 'titleDoc.justification = ParagraphJustification.CENTER_JUSTIFY;\n';
  script += 'titleLayer.property("Source Text").setValue(titleDoc);\n';
  script += 'titleLayer.property("Position").setValue([comp.width/2, comp.height/2]);\n';
  script += 'titleLayer.outPoint = ' + duration + ';\n';

  // Style-specific animations
  const style = params.style;

  if (style === 'cinematic') {
    // Fade in with scale
    script += 'titleLayer.property("Opacity").setValueAtTime(0, 0);\n';
    script += 'titleLayer.property("Opacity").setValueAtTime(1, 100);\n';
    script += 'titleLayer.property("Scale").setValueAtTime(0, [110, 110]);\n';
    script += 'titleLayer.property("Scale").setValueAtTime(1, [100, 100]);\n';
    // Fade out
    script += 'titleLayer.property("Opacity").setValueAtTime(' + (duration - 1) + ', 100);\n';
    script += 'titleLayer.property("Opacity").setValueAtTime(' + duration + ', 0);\n';
  } else if (style === 'documentary') {
    // Typewriter-like reveal via animator
    script += 'titleLayer.property("Opacity").setValueAtTime(0, 0);\n';
    script += 'titleLayer.property("Opacity").setValueAtTime(0.5, 100);\n';
    script += 'titleLayer.property("Position").setValueAtTime(0, [comp.width/2, comp.height/2 + 20]);\n';
    script += 'titleLayer.property("Position").setValueAtTime(0.5, [comp.width/2, comp.height/2]);\n';
  } else if (style === 'social') {
    // Bouncy scale in
    script += 'titleLayer.property("Scale").setValueAtTime(0, [0, 0]);\n';
    script += 'titleLayer.property("Scale").setValueAtTime(0.3, [110, 110]);\n';
    script += 'titleLayer.property("Scale").setValueAtTime(0.5, [100, 100]);\n';
  } else { // minimal
    // Simple fade
    script += 'titleLayer.property("Opacity").setValueAtTime(0, 0);\n';
    script += 'titleLayer.property("Opacity").setValueAtTime(0.5, 100);\n';
    script += 'titleLayer.property("Opacity").setValueAtTime(' + (duration - 0.5) + ', 100);\n';
    script += 'titleLayer.property("Opacity").setValueAtTime(' + duration + ', 0);\n';
  }

  // Add subtitle if provided
  if (params.subtitle) {
    script += 'var subLayer = comp.layers.addText("' + escapeString(params.subtitle) + '");\n';
    script += 'subLayer.name = "Subtitle";\n';
    script += 'var subDoc = subLayer.property("Source Text").value;\n';
    script += 'subDoc.fontSize = ' + Math.floor(fontSize * 0.4) + ';\n';
    script += 'subDoc.fillColor = ' + colorToES3(textColor) + ';\n';
    script += 'subDoc.font = "ArialMT";\n';
    script += 'subDoc.justification = ParagraphJustification.CENTER_JUSTIFY;\n';
    script += 'subLayer.property("Source Text").setValue(subDoc);\n';
    script += 'subLayer.property("Position").setValue([comp.width/2, comp.height/2 + ' + (fontSize * 0.8) + ']);\n';
    script += 'subLayer.outPoint = ' + duration + ';\n';

    // Match title animation
    script += 'subLayer.property("Opacity").setValueAtTime(0, 0);\n';
    script += 'subLayer.property("Opacity").setValueAtTime(0.7, 100);\n';
    script += 'subLayer.property("Opacity").setValueAtTime(' + (duration - 0.5) + ', 100);\n';
    script += 'subLayer.property("Opacity").setValueAtTime(' + duration + ', 0);\n';
  }

  script += generateResultObject({
    titleLayerIndex: 'titleLayer.index',
    duration: String(duration)
  });

  return wrapInUndoGroup(script, 'Create Title Card');
}

/**
 * Generate script to create a transition
 */
export function generateCreateTransition(params: {
  compId?: number;
  compName?: string;
  type: string;
  duration?: number;
  easing?: string;
  color?: { r: number; g: number; b: number };
}): string {
  let script = '';
  script += generateProjectCheck();
  script += generateCompAccess(params.compId, params.compName);

  const duration = params.duration || 1;
  const color = params.color || { r: 0, g: 0, b: 0 };

  script += 'var transLayer = comp.layers.addSolid(\n';
  script += '  ' + colorToES3(color) + ',\n';
  script += '  "Transition",\n';
  script += '  comp.width,\n';
  script += '  comp.height,\n';
  script += '  1\n';
  script += ');\n';

  const type = params.type;

  if (type === 'wipe_left' || type === 'wipe_right') {
    // Use linear wipe effect
    script += 'var wipe = transLayer.property("Effects").addProperty("ADBE Linear Wipe");\n';
    script += 'wipe.property("Transition Completion").setValueAtTime(0, 100);\n';
    script += 'wipe.property("Transition Completion").setValueAtTime(' + duration + ', 0);\n';
    if (type === 'wipe_left') {
      script += 'wipe.property("Wipe Angle").setValue(90);\n';
    } else {
      script += 'wipe.property("Wipe Angle").setValue(-90);\n';
    }
  } else if (type === 'wipe_up' || type === 'wipe_down') {
    script += 'var wipe = transLayer.property("Effects").addProperty("ADBE Linear Wipe");\n';
    script += 'wipe.property("Transition Completion").setValueAtTime(0, 100);\n';
    script += 'wipe.property("Transition Completion").setValueAtTime(' + duration + ', 0);\n';
    if (type === 'wipe_up') {
      script += 'wipe.property("Wipe Angle").setValue(180);\n';
    } else {
      script += 'wipe.property("Wipe Angle").setValue(0);\n';
    }
  } else if (type === 'dissolve') {
    script += 'transLayer.property("Opacity").setValueAtTime(0, 100);\n';
    script += 'transLayer.property("Opacity").setValueAtTime(' + duration + ', 0);\n';
  } else if (type === 'push') {
    script += 'transLayer.property("Position").setValueAtTime(0, [comp.width/2, comp.height/2]);\n';
    script += 'transLayer.property("Position").setValueAtTime(' + duration + ', [-comp.width/2, comp.height/2]);\n';
  } else if (type === 'slide') {
    script += 'transLayer.property("Position").setValueAtTime(0, [comp.width * 1.5, comp.height/2]);\n';
    script += 'transLayer.property("Position").setValueAtTime(' + duration/2 + ', [comp.width/2, comp.height/2]);\n';
    script += 'transLayer.property("Position").setValueAtTime(' + duration + ', [-comp.width/2, comp.height/2]);\n';
  } else if (type === 'zoom') {
    script += 'transLayer.property("Scale").setValueAtTime(0, [100, 100]);\n';
    script += 'transLayer.property("Scale").setValueAtTime(' + duration + ', [200, 200]);\n';
    script += 'transLayer.property("Opacity").setValueAtTime(' + (duration * 0.7) + ', 100);\n';
    script += 'transLayer.property("Opacity").setValueAtTime(' + duration + ', 0);\n';
  }

  script += 'transLayer.outPoint = transLayer.inPoint + ' + duration + ';\n';

  script += generateResultObject({
    layerIndex: 'transLayer.index',
    type: '"' + escapeString(type) + '"',
    duration: String(duration)
  });

  return wrapInUndoGroup(script, 'Create Transition');
}

/**
 * Generate script to create a logo reveal
 */
export function generateCreateLogoReveal(params: {
  compId?: number;
  compName?: string;
  logoItemId?: number;
  logoItemName?: string;
  style?: string;
  duration?: number;
  backgroundColor?: { r: number; g: number; b: number };
}): string {
  // Without this, neither branch below declares logoItem and the script dies
  // with a bare "ReferenceError: logoItem is undefined".
  if (params.logoItemId === undefined && !params.logoItemName) {
    throw new Error('create_logo_reveal animates an existing logo item: pass logoItemId or logoItemName');
  }
  let script = '';
  script += generateProjectCheck();
  script += generateCompAccess(params.compId, params.compName);

  const duration = params.duration || 3;
  const style = params.style || 'scale';

  // Find logo item
  if (params.logoItemId) {
    script += 'var logoItem = app.project.itemByID(' + params.logoItemId + ');\n';
  } else if (params.logoItemName) {
    script += 'var logoItem = null;\n';
    script += 'for (var i = 1; i <= app.project.numItems; i++) {\n';
    script += '  if (app.project.item(i).name === "' + escapeString(params.logoItemName) + '") {\n';
    script += '    logoItem = app.project.item(i);\n';
    script += '    break;\n';
    script += '  }\n';
    script += '}\n';
  }

  script += 'if (!logoItem) {\n';
  script += '  throw new Error("Logo item not found");\n';
  script += '}\n';

  // Add background if specified
  if (params.backgroundColor) {
    script += 'var bgLayer = comp.layers.addSolid(\n';
    script += '  ' + colorToES3(params.backgroundColor) + ',\n';
    script += '  "Logo Background",\n';
    script += '  comp.width,\n';
    script += '  comp.height,\n';
    script += '  1\n';
    script += ');\n';
    script += 'bgLayer.outPoint = ' + duration + ';\n';
  }

  // Add logo layer
  script += 'var logoLayer = comp.layers.add(logoItem);\n';
  script += 'logoLayer.property("Position").setValue([comp.width/2, comp.height/2]);\n';
  script += 'logoLayer.outPoint = ' + duration + ';\n';

  // Apply animation based on style
  if (style === 'fade') {
    script += 'logoLayer.property("Opacity").setValueAtTime(0, 0);\n';
    script += 'logoLayer.property("Opacity").setValueAtTime(1, 100);\n';
    script += 'logoLayer.property("Opacity").setValueAtTime(' + (duration - 0.5) + ', 100);\n';
    script += 'logoLayer.property("Opacity").setValueAtTime(' + duration + ', 0);\n';
  } else if (style === 'scale') {
    script += 'logoLayer.property("Scale").setValueAtTime(0, [0, 0]);\n';
    script += 'logoLayer.property("Scale").setValueAtTime(0.5, [110, 110]);\n';
    script += 'logoLayer.property("Scale").setValueAtTime(0.8, [100, 100]);\n';
    script += 'logoLayer.property("Opacity").setValueAtTime(0, 0);\n';
    script += 'logoLayer.property("Opacity").setValueAtTime(0.3, 100);\n';
  } else if (style === 'slide') {
    script += 'logoLayer.property("Position").setValueAtTime(0, [-200, comp.height/2]);\n';
    script += 'logoLayer.property("Position").setValueAtTime(0.6, [comp.width/2, comp.height/2]);\n';
    script += 'logoLayer.property("Opacity").setValueAtTime(0, 0);\n';
    script += 'logoLayer.property("Opacity").setValueAtTime(0.3, 100);\n';
  } else if (style === 'spin') {
    script += 'logoLayer.property("Rotation").setValueAtTime(0, -180);\n';
    script += 'logoLayer.property("Rotation").setValueAtTime(0.8, 0);\n';
    script += 'logoLayer.property("Scale").setValueAtTime(0, [0, 0]);\n';
    script += 'logoLayer.property("Scale").setValueAtTime(0.8, [100, 100]);\n';
    script += 'logoLayer.property("Opacity").setValueAtTime(0, 0);\n';
    script += 'logoLayer.property("Opacity").setValueAtTime(0.2, 100);\n';
  } else if (style === 'glitch') {
    // Wiggle expression for glitch effect
    script += 'logoLayer.property("Position").expression = "wiggle(30, 5)";\n';
    script += 'logoLayer.property("Opacity").setValueAtTime(0, 0);\n';
    script += 'logoLayer.property("Opacity").setValueAtTime(0.1, 100);\n';
    script += 'logoLayer.property("Opacity").setValueAtTime(0.15, 0);\n';
    script += 'logoLayer.property("Opacity").setValueAtTime(0.2, 100);\n';
    script += 'logoLayer.property("Opacity").setValueAtTime(0.25, 0);\n';
    script += 'logoLayer.property("Opacity").setValueAtTime(0.3, 100);\n';
  } else if (style === 'particle') {
    // "particle" used to be accepted with no implementation, so the logo got no
    // animation. ExtendScript has no particle API, but the bundled particle
    // effects are ordinary effects: add them by match name and set their
    // parameters. Two parts:
    //   1. CC Scatterize on the logo, Scatter animating to 0, so the logo
    //      assembles out of particles.
    //   2. A CC Particle Systems II burst on its own solid at the moment the
    //      logo lands.
    // Effect parameters are addressed by match name ("CC Scatterize-0001"):
    // effect property lists are flat and reuse display names.
    const land = Math.round(duration * 0.5 * 100) / 100;

    script += 'var logoFx = logoLayer.property("ADBE Effect Parade");\n';
    script += 'if (!logoFx.canAddProperty("CC Scatterize")) {\n';
    script += '  throw new Error("CC Scatterize is not available in this After Effects install");\n';
    script += '}\n';
    // Effects are clipped to the layer's own bounds, so Scatterize on a tight
    // logo just fills that rectangle with noise. Give it room first:
    //  - precomps (and solids / vectors) can use Collapse Transformations,
    //    which renders their effects in this comp's space;
    //  - raster footage such as a PNG can't collapse, so Grow Bounds enlarges
    //    the layer's buffer instead. It must sit BEFORE Scatterize in the stack.
    // canSetCollapseTransformation is the reliable test - layer type isn't.
    script += 'var logoExpanded = "none";\n';
    script += 'if (logoLayer.canSetCollapseTransformation) {\n';
    script += '  logoLayer.collapseTransformation = true;\n';
    script += '  logoExpanded = "collapseTransformation";\n';
    script += '} else if (logoFx.canAddProperty("ADBE GROW BOUNDS")) {\n';
    script += '  var grow = logoFx.addProperty("ADBE GROW BOUNDS");\n';
    script += '  grow.property("ADBE GROW BOUNDS-0001").setValue(Math.round(Math.max(comp.width, comp.height) / 3));\n';
    script += '  logoExpanded = "growBounds";\n';
    script += '}\n';
    script += 'var scat = logoFx.addProperty("CC Scatterize");\n';
    script += 'var scatAmount = scat.property("CC Scatterize-0001");\n';
    script += 'var scatTwist = scat.property("CC Scatterize-0002");\n';
    // With room to spread, a bigger scatter reads as a particle cloud. Without
    // it, keep the value modest so the clipped rectangle stays faint.
    script += 'scatAmount.setValueAtTime(0, logoExpanded === "none" ? 150 : 450);\n';
    script += 'scatAmount.setValueAtTime(' + land + ', 0);\n';
    script += 'scatTwist.setValueAtTime(0, 180);\n';
    script += 'scatTwist.setValueAtTime(' + land + ', 0);\n';
    // Decelerate into the assembled logo. One-element ease: these are 1D.
    script += 'var landEase = new KeyframeEase(0, 80);\n';
    script += 'scatAmount.setTemporalEaseAtKey(2, [landEase], [landEase]);\n';
    script += 'scatTwist.setTemporalEaseAtKey(2, [landEase], [landEase]);\n';
    // Fade in across most of the assembly, so the scattered stage stays faint
    // and the layer's bounding box never reads as a solid rectangle.
    script += 'logoLayer.property("Opacity").setValueAtTime(0, 0);\n';
    script += 'logoLayer.property("Opacity").setValueAtTime(' + Math.round(land * 0.85 * 100) / 100 + ', 100);\n';

    script += 'var particleFxOk = true;\n';
    script += 'var burst = null;\n';
    script += 'var probeFx = logoFx.canAddProperty("CC Particle Systems II");\n';
    script += 'if (probeFx) {\n';
    script += '  burst = comp.layers.addSolid([1, 1, 1], "Logo Particles", comp.width, comp.height, 1);\n';
    script += '  burst.outPoint = ' + duration + ';\n';
    script += '  burst.blendingMode = BlendingMode.ADD;\n';
    script += '  var ps = burst.property("ADBE Effect Parade").addProperty("CC Particle Systems II");\n';
    script += '  var logoPos = logoLayer.property("ADBE Transform Group").property("ADBE Position").value;\n';
    script += '  ps.property("CC Particle Systems II-0004").setValue([logoPos[0], logoPos[1]]);\n';
    // Spawn across the logo's footprint. Radius X/Y are NOT pixels: measured
    // on a 1920-wide layer, one unit is roughly layer width / 200 (~9.6 px),
    // so passing the logo's pixel size filled the whole frame.
    script += '  var pxPerRadiusUnit = burst.width / 200;\n';
    script += '  ps.property("CC Particle Systems II-0005").setValue(Math.min(1000, (logoLayer.width / 2) / pxPerRadiusUnit * 0.9));\n';
    script += '  ps.property("CC Particle Systems II-0006").setValue(Math.min(1000, (logoLayer.height / 2) / pxPerRadiusUnit * 0.9));\n';
    script += '  ps.property("CC Particle Systems II-0002").setValue(1);\n';     // longevity
    // Velocity scales with the layer's size, so keep it low on a comp-sized solid.
    script += '  ps.property("CC Particle Systems II-0010").setValue(0.1);\n';   // velocity
    script += '  ps.property("CC Particle Systems II-0012").setValue(0.05);\n';  // gravity
    script += '  ps.property("CC Particle Systems II-0013").setValue(10);\n';    // resistance
    script += '  ps.property("CC Particle Systems II-0019").setValue(0.12);\n';  // birth size
    script += '  ps.property("CC Particle Systems II-0020").setValue(0);\n';     // death size
    script += '  ps.property("CC Particle Systems II-0023").setValue(1);\n';     // max opacity
    // Particle Type popup: 5 = Faded Sphere. The default, 1, draws lines. The
    // indices include menu separators (3, 8 and 16 render almost nothing), so
    // this was picked from a rendered contact sheet, not the menu order.
    script += '  ps.property("CC Particle Systems II-0018").setValue(5);\n';
    script += '  ps.property("CC Particle Systems II-0025").setValue([1, 1, 1, 1]);\n'; // birth colour
    script += '  ps.property("CC Particle Systems II-0026").setValue([1, 1, 1, 1]);\n'; // death colour
    // Birth rate: off, a short burst as the logo lands, off again. HOLD keys
    // so it switches rather than ramping.
    script += '  var rate = ps.property("CC Particle Systems II-0001");\n';
    script += '  rate.setValueAtTime(0, 0);\n';
    script += '  rate.setValueAtTime(' + land + ', 6);\n';
    script += '  rate.setValueAtTime(' + Math.round((land + 0.2) * 100) / 100 + ', 0);\n';
    script += '  for (var rk = 1; rk <= rate.numKeys; rk++) {\n';
    script += '    rate.setInterpolationTypeAtKey(rk, KeyframeInterpolationType.HOLD, KeyframeInterpolationType.HOLD);\n';
    script += '  }\n';
    script += '} else {\n';
    // The reveal still works without the burst.
    script += '  particleFxOk = false;\n';
    script += '}\n';
  }

  const resultProps: Record<string, string> = {
    logoLayerIndex: 'logoLayer.index',
    style: '"' + escapeString(style) + '"',
    duration: String(duration)
  };
  if (style === 'particle') {
    resultProps.particleLayer = 'burst ? burst.name : null';
    resultProps.particleBurstAdded = 'particleFxOk';
    resultProps.logoBoundsExpandedBy = 'logoExpanded';
  }
  script += generateResultObject(resultProps);

  return wrapInUndoGroup(script, 'Create Logo Reveal');
}

/**
 * Generate script to add text animator to a text layer
 */
export function generateCreateTextAnimator(params: {
  compId?: number;
  compName?: string;
  layerIndex?: number;
  layerName?: string;
  animatorType: string;
  duration?: number;
  delay?: number;
}): string {
  let script = '';
  script += generateProjectCheck();
  script += generateCompAccess(params.compId, params.compName);
  script += generateLayerAccess('comp', params.layerIndex, params.layerName);

  script += 'if (!(layer instanceof TextLayer)) {\n';
  script += '  throw new Error("Layer is not a text layer");\n';
  script += '}\n';

  const duration = params.duration || 1;
  const delay = params.delay || 0.05;

  script += 'var textProp = layer.property("Text");\n';
  script += 'var animators = textProp.property("Animators");\n';
  script += 'var animator = animators.addProperty("ADBE Text Animator");\n';
  script += 'animator.name = "' + escapeString(params.animatorType) + ' Animator";\n';

  // Add selector
  script += 'var selector = animator.property("Selectors").addProperty("ADBE Text Selector");\n';
  script += 'selector.property("Start").setValueAtTime(0, 0);\n';
  script += 'selector.property("Start").setValueAtTime(' + duration + ', 100);\n';

  // Add properties based on animator type
  const type = params.animatorType;

  if (type === 'typewriter') {
    script += 'var opacityProp = animator.property("Properties").addProperty("ADBE Text Opacity");\n';
    script += 'opacityProp.setValue(0);\n';
  } else if (type === 'fadeInChars') {
    script += 'var opacityProp = animator.property("Properties").addProperty("ADBE Text Opacity");\n';
    script += 'opacityProp.setValue(0);\n';
    script += 'selector.property("Offset").setValueAtTime(0, -100);\n';
    script += 'selector.property("Offset").setValueAtTime(' + duration + ', 100);\n';
  } else if (type === 'scaleInChars') {
    script += 'var scaleProp = animator.property("Properties").addProperty("ADBE Text Scale 3D");\n';
    script += 'scaleProp.setValue([0, 0]);\n';
  } else if (type === 'slideInChars') {
    script += 'var posProp = animator.property("Properties").addProperty("ADBE Text Position 3D");\n';
    script += 'posProp.setValue([0, 50, 0]);\n';
    script += 'var opacityProp = animator.property("Properties").addProperty("ADBE Text Opacity");\n';
    script += 'opacityProp.setValue(0);\n';
  } else if (type === 'randomize') {
    script += 'selector.property("Randomize Order").setValue(1);\n';
    script += 'var opacityProp = animator.property("Properties").addProperty("ADBE Text Opacity");\n';
    script += 'opacityProp.setValue(0);\n';
  } else if (type === 'wave') {
    script += 'var posProp = animator.property("Properties").addProperty("ADBE Text Position 3D");\n';
    script += 'posProp.setValue([0, 20, 0]);\n';
    // Add wiggly selector
    script += 'selector.property("Start").expression = "Math.sin(time * 10) * 50 + 50";\n';
    script += 'selector.property("End").expression = "Math.sin(time * 10) * 50 + 50";\n';
  }

  script += generateResultObject({
    animatorName: 'animator.name',
    layerIndex: 'layer.index'
  });

  return wrapInUndoGroup(script, 'Create Text Animator');
}
