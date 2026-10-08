/**
 * After Effects Type Definitions
 */

export interface AEColor {
  r: number;
  g: number;
  b: number;
  a?: number;
}

export interface AEPosition {
  x: number;
  y: number;
  z?: number;
}

export interface AESize {
  width: number;
  height: number;
}

export interface AEKeyframe {
  time: number;
  value: number | number[] | string;
  inType?: KeyframeInterpolationType;
  outType?: KeyframeInterpolationType;
  inEase?: AEEase;
  outEase?: AEEase;
  spatialTangent?: AESpatialTangent;
}

export interface AEEase {
  speed: number;
  influence: number;
}

export interface AESpatialTangent {
  inTangent: number[];
  outTangent: number[];
}

export type KeyframeInterpolationType =
  | 'LINEAR'
  | 'BEZIER'
  | 'HOLD';

export type LayerType =
  | 'solid'
  | 'text'
  | 'shape'
  | 'null'
  | 'adjustment'
  | 'camera'
  | 'light'
  | 'av'
  | 'precomp';

export type BlendMode =
  | 'NORMAL'
  | 'ADD'
  | 'MULTIPLY'
  | 'SCREEN'
  | 'OVERLAY'
  | 'SOFT_LIGHT'
  | 'HARD_LIGHT'
  | 'COLOR_DODGE'
  | 'COLOR_BURN'
  | 'DARKEN'
  | 'LIGHTEN'
  | 'DIFFERENCE'
  | 'EXCLUSION'
  | 'HUE'
  | 'SATURATION'
  | 'COLOR'
  | 'LUMINOSITY';

export type TextJustification =
  | 'LEFT'
  | 'CENTER'
  | 'RIGHT'
  | 'FULL_JUSTIFY_LASTLINE_LEFT'
  | 'FULL_JUSTIFY_LASTLINE_CENTER'
  | 'FULL_JUSTIFY_LASTLINE_RIGHT'
  | 'FULL_JUSTIFY_LASTLINE_FULL';

export interface CompositionInfo {
  id: number;
  name: string;
  width: number;
  height: number;
  frameRate: number;
  duration: number;
  numLayers: number;
  workAreaStart: number;
  workAreaDuration: number;
}

export interface LayerInfo {
  index: number;
  name: string;
  type: string;
  inPoint: number;
  outPoint: number;
  startTime: number;
  enabled: boolean;
  solo: boolean;
  shy: boolean;
  locked: boolean;
  hasVideo: boolean;
  hasAudio: boolean;
  is3D: boolean;
  parent?: number;
}

export interface ProjectInfo {
  name: string;
  path: string;
  numItems: number;
  bitsPerChannel: number;
  timeDisplayType: number;
}

export interface MarkerInfo {
  time: number;
  comment: string;
  duration: number;
  chapter?: string;
  url?: string;
  frameTarget?: string;
  cuePointName?: string;
}

export interface EffectInfo {
  name: string;
  matchName: string;
  enabled: boolean;
  index: number;
}

// Animation preset types
export type EasingType =
  | 'linear'
  | 'easeIn'
  | 'easeOut'
  | 'easeInOut'
  | 'easeInQuad'
  | 'easeOutQuad'
  | 'easeInOutQuad'
  | 'easeInCubic'
  | 'easeOutCubic'
  | 'easeInOutCubic'
  | 'easeInExpo'
  | 'easeOutExpo'
  | 'easeInOutExpo'
  | 'spring'
  | 'bounce'
  | 'elastic';

export interface SpringConfig {
  mass: number;
  stiffness: number;
  damping: number;
  overshoot: boolean;
}

export interface InterpolateConfig {
  inputRange: number[];
  outputRange: number[];
  easing: EasingType;
}

// Expression library types
export type ExpressionCategory =
  | 'wiggle'
  | 'loop'
  | 'time'
  | 'linking'
  | 'physics'
  | 'math'
  | 'random';

export interface ExpressionTemplate {
  name: string;
  category: ExpressionCategory;
  expression: string;
  parameters: ExpressionParameter[];
  description: string;
}

export interface ExpressionParameter {
  name: string;
  type: 'number' | 'string' | 'boolean' | 'array';
  default: any;
  description: string;
}

// Effect template types
export interface EffectTemplate {
  name: string;
  matchName: string;
  properties: EffectPropertySetting[];
  category: string;
  description: string;
}

export interface EffectPropertySetting {
  property: string;
  value: number | number[] | string | boolean;
}

// Motion graphics template types
export type LowerThirdStyle =
  | 'modern'
  | 'corporate'
  | 'news'
  | 'minimal'
  | 'social';

export type TitleStyle =
  | 'cinematic'
  | 'documentary'
  | 'social'
  | 'minimal';

export type TransitionType =
  | 'wipe_left'
  | 'wipe_right'
  | 'wipe_up'
  | 'wipe_down'
  | 'dissolve'
  | 'push'
  | 'slide'
  | 'zoom';

export interface LowerThirdConfig {
  style: LowerThirdStyle;
  name: string;
  title: string;
  subtitle?: string;
  duration: number;
  animateIn: boolean;
  animateOut: boolean;
  primaryColor?: AEColor;
  secondaryColor?: AEColor;
  textColor?: AEColor;
}

export interface TitleCardConfig {
  style: TitleStyle;
  title: string;
  subtitle?: string;
  duration: number;
  fontFamily?: string;
  fontSize?: number;
  color?: AEColor;
  backgroundColor?: AEColor;
}

// Property path mappings for After Effects
export const AE_PROPERTY_PATHS: Record<string, string> = {
  // Transform properties
  'anchorPoint': 'ADBE Transform Group/ADBE Anchor Point',
  'position': 'ADBE Transform Group/ADBE Position',
  'xPosition': 'ADBE Transform Group/ADBE Position_0',
  'yPosition': 'ADBE Transform Group/ADBE Position_1',
  'zPosition': 'ADBE Transform Group/ADBE Position_2',
  'scale': 'ADBE Transform Group/ADBE Scale',
  'rotation': 'ADBE Transform Group/ADBE Rotate Z',
  'rotationX': 'ADBE Transform Group/ADBE Rotate X',
  'rotationY': 'ADBE Transform Group/ADBE Rotate Y',
  'rotationZ': 'ADBE Transform Group/ADBE Rotate Z',
  'opacity': 'ADBE Transform Group/ADBE Opacity',

  // Text properties
  'sourceText': 'ADBE Text Properties/ADBE Text Document',
  'textPathOptions': 'ADBE Text Properties/ADBE Text Path Options',
  'textMoreOptions': 'ADBE Text Properties/ADBE Text More Options',
  'textAnimators': 'ADBE Text Properties/ADBE Text Animators',

  // Audio
  'audioLevels': 'ADBE Audio Group/ADBE Audio Levels',

  // Camera
  // A camera's Point of Interest is its anchor point - AE only relabels it.
  // There is no "ADBE Camera Point of Interest" property.
  'pointOfInterest': 'ADBE Transform Group/ADBE Anchor Point',
  'zoom': 'ADBE Camera Options Group/ADBE Camera Zoom',
  'depthOfField': 'ADBE Camera Options Group/ADBE Camera Depth of Field',
  'focusDistance': 'ADBE Camera Options Group/ADBE Camera Focus Distance',
  'aperture': 'ADBE Camera Options Group/ADBE Camera Aperture',
  'blurLevel': 'ADBE Camera Options Group/ADBE Camera Blur Level',

  // Light
  'lightIntensity': 'ADBE Light Options Group/ADBE Light Intensity',
  'lightColor': 'ADBE Light Options Group/ADBE Light Color',
  'coneAngle': 'ADBE Light Options Group/ADBE Light Cone Angle',
  // "ADBE Light Cone Feather" (no suffix) is not on current lights.
  'coneFeather': 'ADBE Light Options Group/ADBE Light Cone Feather 2',
  // Lights reuse the material match name; "ADBE Light Casts Shadows" doesn't exist.
  'castsShadows': 'ADBE Light Options Group/ADBE Casts Shadows',
  'shadowDarkness': 'ADBE Light Options Group/ADBE Light Shadow Darkness',
  'shadowDiffusion': 'ADBE Light Options Group/ADBE Light Shadow Diffusion',

  // Material options (for 3D layers)
  'castsShadows_material': 'ADBE Material Options Group/ADBE Casts Shadows',
  'lightTransmission': 'ADBE Material Options Group/ADBE Light Transmission',
  'acceptsShadows': 'ADBE Material Options Group/ADBE Accepts Shadows',
  'acceptsLights': 'ADBE Material Options Group/ADBE Accepts Lights',
  'ambient': 'ADBE Material Options Group/ADBE Ambient Coefficient',
  'diffuse': 'ADBE Material Options Group/ADBE Diffuse Coefficient',
  'specular': 'ADBE Material Options Group/ADBE Specular Coefficient',
  'shininess': 'ADBE Material Options Group/ADBE Shininess Coefficient',
  'metal': 'ADBE Material Options Group/ADBE Metal Coefficient'
};

// Effect match names
export const EFFECT_MATCH_NAMES: Record<string, string> = {
  // Blur & Sharpen
  'gaussianBlur': 'ADBE Gaussian Blur 2',
  'directionalBlur': 'ADBE Motion Blur',
  'radialBlur': 'ADBE Radial Blur',
  'sharpen': 'ADBE Sharpen',
  'unsharpMask': 'ADBE Unsharp Mask',

  // Color Correction
  'brightnessContrast': 'ADBE Brightness & Contrast 2',
  'curves': 'ADBE CurvesCustom',
  'hueSaturation': 'ADBE HUE SATURATION',
  'levels': 'ADBE Levels2',
  'colorBalance': 'ADBE Color Balance 2',
  'vibrance': 'ADBE Vibrance',
  'exposure': 'ADBE Exposure2',
  'tint': 'ADBE Tint',
  'tritone': 'ADBE Tritone',

  // Distort
  'turbulentDisplace': 'ADBE Turbulent Displace',
  'warp': 'ADBE BEZMESH',
  'spherize': 'ADBE Spherize',
  'bulge': 'ADBE Bulge',

  // Generate
  'fill': 'ADBE Fill',
  'gradient': 'ADBE Ramp',
  'stroke': 'ADBE Stroke',
  'checkerboard': 'ADBE Checkerboard',
  'grid': 'ADBE Grid',

  // Noise & Grain
  'noise': 'ADBE Noise',
  'fractalNoise': 'ADBE Fractal Noise',
  'addGrain': 'ADBE Add Grain',

  // Stylize
  'glow': 'ADBE Glo2',
  'dropShadow': 'ADBE Drop Shadow',
  'mosaic': 'ADBE Mosaic',
  'posterize': 'ADBE Posterize',
  'roughenEdges': 'ADBE Roughen Edges',
  'scatter': 'ADBE Scatter',

  // Transition
  'linearWipe': 'ADBE Linear Wipe',
  'radialWipe': 'ADBE Radial Wipe',
  'venetianBlinds': 'ADBE Venetian Blinds',
  'blockDissolve': 'ADBE Block Dissolve',

  // Text
  'numberEffect': 'ADBE Numbers2',
  'timecode': 'ADBE Timecode',

  // Utility
  'ccComposite': 'CC Composite',
  'setMatte': 'ADBE Set Matte3',
  'simpleChoker': 'ADBE Simple Choker'
};
