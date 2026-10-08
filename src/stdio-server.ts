/**
 * AE-MCP Stdio Server
 *
 * MCP server implementation using stdio transport.
 * Handles all tool definitions and communication with After Effects.
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { AjvJsonSchemaValidator } from '@modelcontextprotocol/sdk/validation/ajv';
import type { Tool } from '@modelcontextprotocol/sdk/types.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  ListResourcesRequestSchema,
  ReadResourceRequestSchema,
  ListPromptsRequestSchema,
  GetPromptRequestSchema
} from '@modelcontextprotocol/sdk/types.js';

import { FileCommunicator } from './ae-integration/file-communicator.js';
import * as generators from './ae-integration/scriptGenerator.js';
import { createErrorResponse } from './ae-integration/errorHandler.js';
import { Logger } from './types/mcpTypes.js';

// Create logger
const logger: Logger = {
  debug: (msg, meta) => console.error(`[DEBUG] ${msg}`, meta ? JSON.stringify(meta) : ''),
  info: (msg, meta) => console.error(`[INFO] ${msg}`, meta ? JSON.stringify(meta) : ''),
  warn: (msg, meta) => console.error(`[WARN] ${msg}`, meta ? JSON.stringify(meta) : ''),
  error: (msg, meta) => console.error(`[ERROR] ${msg}`, meta ? JSON.stringify(meta) : '')
};

// Shared schemas for the newly exposed integration tools only. Legacy tools
// retain their generator-level coercion of stringified numbers and arrays.
const POSITIVE_INDEX_SCHEMA = { type: 'integer', minimum: 1 };
const NONEMPTY_NAME_SCHEMA = { type: 'string', minLength: 1, pattern: '\\S' };
const RGB_SCHEMA = {
  type: 'object',
  properties: {
    r: { type: 'number', minimum: 0, maximum: 1 },
    g: { type: 'number', minimum: 0, maximum: 1 },
    b: { type: 'number', minimum: 0, maximum: 1 },
    a: { type: 'number', minimum: 0, maximum: 1 }
  },
  required: ['r', 'g', 'b']
};
const POSITION_SCHEMA = {
  type: 'object',
  properties: { x: { type: 'number' }, y: { type: 'number' }, z: { type: 'number' } },
  required: ['x', 'y']
};
const FEATHER_SCHEMA = {
  anyOf: [
    { type: 'number' },
    { type: 'array', items: { type: 'number' }, minItems: 2, maxItems: 2 }
  ],
  description: 'Feather in pixels: scalar for both axes, or [x, y]'
};
const LAYER_TARGETED_TOOLS = new Set([
  'get_path', 'set_path_keyframes', 'add_shape_operator', 'set_3d_layer',
  'set_material_options', 'set_geometry_options', 'set_camera_options', 'set_light_options',
  'add_mask', 'list_masks', 'get_mask_path', 'set_mask_path', 'set_mask_keyframes',
  'set_mask_properties', 'delete_mask', 'batch_set_expressions'
]);
const INTEGRATION_TOOLS = new Set([
  ...LAYER_TARGETED_TOOLS, 'create_path', 'add_to_render_queue', 'list_render_queue',
  'list_render_templates', 'set_render_queue_item', 'remove_from_render_queue',
  'control_render', 'queue_in_ame', 'set_comp_renderer', 'get_3d_info',
  'list_project_items', 'set_active_composition', 'set_proxy', 'remove_proxy',
  'get_current_time', 'set_current_time', 'snap_to_marker', 'get_nearest_marker', 'navigate_markers'
]);

// Tool definitions
const TOOLS: Array<Tool & { generator: (params: any) => string }> = [
  // ============================================
  // PROJECT TOOLS
  // ============================================
  {
    name: 'create_project',
    description: 'Create a new After Effects project',
    inputSchema: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Optional project name' }
      }
    },
    generator: generators.generateCreateProject
  },
  {
    name: 'open_project',
    description: 'Open an existing After Effects project',
    inputSchema: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Path to the project file' }
      },
      required: ['path']
    },
    generator: generators.generateOpenProject
  },
  {
    name: 'save_project',
    description: 'Save the current project',
    inputSchema: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Optional path to save as' }
      }
    },
    generator: generators.generateSaveProject
  },
  {
    name: 'close_project',
    description: 'Close the current project',
    inputSchema: {
      type: 'object',
      properties: {
        save: { type: 'boolean', description: 'Save before closing' }
      }
    },
    generator: generators.generateCloseProject
  },
  {
    name: 'get_project_info',
    description: 'Get information about the current project',
    inputSchema: {
      type: 'object',
      properties: {}
    },
    generator: generators.generateGetProjectInfo
  },
  {
    name: 'import_footage',
    description: 'Import footage file into the project',
    inputSchema: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Path to the file to import' },
        name: { type: 'string', description: 'Optional name for the imported item' },
        sequence: { type: 'boolean', description: 'Import as image sequence' },
        forceAlphabetical: { type: 'boolean', description: 'Force alphabetical order for sequences' }
      },
      required: ['path']
    },
    generator: generators.generateImportFootage
  },

  // ============================================
  // COMPOSITION TOOLS
  // ============================================
  {
    name: 'create_composition',
    description: 'Create a new composition',
    inputSchema: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Composition name' },
        width: { type: 'number', description: 'Width in pixels' },
        height: { type: 'number', description: 'Height in pixels' },
        frameRate: { type: 'number', description: 'Frame rate' },
        duration: { type: 'number', description: 'Duration in seconds' },
        backgroundColor: {
          type: 'object',
          properties: {
            r: { type: 'number' },
            g: { type: 'number' },
            b: { type: 'number' }
          },
          description: 'Background color (0-1 range)'
        }
      },
      required: ['name', 'width', 'height', 'frameRate', 'duration']
    },
    generator: generators.generateCreateComposition
  },
  {
    name: 'modify_composition',
    description: 'Modify an existing composition',
    inputSchema: {
      type: 'object',
      properties: {
        compId: { type: 'number', description: 'Composition ID' },
        compName: { type: 'string', description: 'Composition name (alternative to ID)' },
        name: { type: 'string', description: 'New name' },
        width: { type: 'number', description: 'New width' },
        height: { type: 'number', description: 'New height' },
        frameRate: { type: 'number', description: 'New frame rate' },
        duration: { type: 'number', description: 'New duration' },
        backgroundColor: { type: 'object', description: 'New background color' }
      }
    },
    generator: generators.generateModifyComposition
  },
  {
    name: 'duplicate_composition',
    description: 'Duplicate a composition',
    inputSchema: {
      type: 'object',
      properties: {
        compId: { type: 'number', description: 'Composition ID' },
        compName: { type: 'string', description: 'Composition name' },
        newName: { type: 'string', description: 'Name for the duplicate' }
      }
    },
    generator: generators.generateDuplicateComposition
  },
  {
    name: 'delete_composition',
    description: 'Delete a composition',
    inputSchema: {
      type: 'object',
      properties: {
        compId: { type: 'number', description: 'Composition ID' },
        compName: { type: 'string', description: 'Composition name' }
      }
    },
    generator: generators.generateDeleteComposition
  },
  {
    name: 'list_compositions',
    description: 'List all compositions in the project',
    inputSchema: {
      type: 'object',
      properties: {}
    },
    generator: generators.generateListCompositions
  },
  {
    name: 'get_composition_info',
    description: 'Get detailed information about a composition',
    inputSchema: {
      type: 'object',
      properties: {
        compId: { type: 'number', description: 'Composition ID' },
        compName: { type: 'string', description: 'Composition name' }
      }
    },
    generator: generators.generateGetCompositionInfo
  },
  {
    name: 'render_frame',
    description: 'Render a single frame of a composition to a PNG file on disk. Returns the file path so the AI can inspect what the comp actually looks like.',
    inputSchema: {
      type: 'object',
      properties: {
        compId: { type: 'number', description: 'Composition ID' },
        compName: { type: 'string', description: 'Composition name' },
        time: { type: 'number', description: 'Time in seconds of the frame to render' },
        outputDir: { type: 'string', description: 'Output folder (default: ~/Desktop/ae_probe)' },
        fileName: { type: 'string', description: 'Output file name (default: <comp>_t<time>s.png)' }
      },
      required: ['time']
    },
    generator: generators.generateRenderFrame
  },
  {
    name: 'get_comp_report',
    description: 'Full composition report: every layer with geometry, text data, fonts (used vs installed), expressions, keyframes, and animated values sampled over time (at markers by default). Use it to verify the real state of a comp.',
    inputSchema: {
      type: 'object',
      properties: {
        compId: { type: 'number', description: 'Composition ID' },
        compName: { type: 'string', description: 'Composition name' },
        sampleTimes: { type: 'array', items: { type: 'number' }, description: 'Times in seconds to sample animated values (default: comp markers, else 5 uniform points)' },
        textPreview: { type: 'number', description: 'Max characters of text per layer (default 120)' }
      }
    },
    generator: generators.generateGetCompReport
  },

  // ============================================
  // LAYER TOOLS
  // ============================================
  {
    name: 'add_solid_layer',
    description: 'Add a solid color layer to a composition',
    inputSchema: {
      type: 'object',
      properties: {
        compId: { type: 'number', description: 'Composition ID' },
        compName: { type: 'string', description: 'Composition name' },
        name: { type: 'string', description: 'Layer name' },
        color: {
          type: 'object',
          properties: { r: { type: 'number' }, g: { type: 'number' }, b: { type: 'number' } },
          description: 'Color (0-1 range)'
        },
        width: { type: 'number', description: 'Width (defaults to comp width)' },
        height: { type: 'number', description: 'Height (defaults to comp height)' },
        duration: { type: 'number', description: 'Duration in seconds' },
        startTime: { type: 'number', description: 'Start time in seconds' }
      },
      required: ['name', 'color']
    },
    generator: generators.generateAddSolidLayer
  },
  {
    name: 'add_text_layer',
    description: 'Add a text layer to a composition',
    inputSchema: {
      type: 'object',
      properties: {
        compId: { type: 'number', description: 'Composition ID' },
        compName: { type: 'string', description: 'Composition name' },
        text: { type: 'string', description: 'Text content' },
        name: { type: 'string', description: 'Layer name' },
        position: { type: 'object', properties: { x: { type: 'number' }, y: { type: 'number' } } },
        fontSize: { type: 'number', description: 'Font size in pixels' },
        fontFamily: { type: 'string', description: 'Font family name' },
        color: { type: 'object', description: 'Text color (0-1 range)' },
        justification: { type: 'string', enum: ['LEFT', 'CENTER', 'RIGHT'] }
      },
      required: ['text']
    },
    generator: generators.generateAddTextLayer
  },
  {
    name: 'add_text_layer_advanced',
    description: 'Add a text layer with advanced styling options',
    inputSchema: {
      type: 'object',
      properties: {
        compId: { type: 'number' },
        compName: { type: 'string' },
        text: { type: 'string', description: 'Text content' },
        name: { type: 'string' },
        position: { type: 'object' },
        fontSize: { type: 'number' },
        fontFamily: { type: 'string' },
        color: { type: 'object' },
        justification: { type: 'string' },
        tracking: { type: 'number', description: 'Letter spacing' },
        leading: { type: 'number', description: 'Line height' },
        baselineShift: { type: 'number' },
        strokeColor: { type: 'object' },
        strokeWidth: { type: 'number' },
        strokeOverFill: { type: 'boolean' }
      },
      required: ['text']
    },
    generator: generators.generateAddTextLayerAdvanced
  },
  {
    name: 'add_shape_layer',
    description: 'Add a shape layer to a composition',
    inputSchema: {
      type: 'object',
      properties: {
        compId: { type: 'number' },
        compName: { type: 'string' },
        name: { type: 'string', description: 'Layer name' },
        shape: { type: 'string', enum: ['rectangle', 'ellipse', 'polygon', 'star'], description: 'Shape type' },
        size: { type: 'object', properties: { width: { type: 'number' }, height: { type: 'number' } } },
        position: { type: 'object' },
        fillColor: { type: 'object', description: 'Fill color (0-1 range)' },
        strokeColor: { type: 'object', description: 'Stroke color (0-1 range)' },
        strokeWidth: { type: 'number' },
        points: { type: 'number', description: 'Number of points for polygon/star' },
        innerRadius: { type: 'number', description: 'Inner radius for star' },
        outerRadius: { type: 'number', description: 'Outer radius for polygon/star' },
        roundness: { type: 'number', description: 'Corner roundness (rectangle only)' }
      }
    },
    generator: generators.generateAddShapeLayer
  },
  {
    name: 'create_path',
    description: 'Create an editable bezier path on a shape layer. Creates a new shape layer unless layerIndex/layerName is given. Tangents are RELATIVE to their own vertex, not absolute coordinates.',
    inputSchema: {
      type: 'object',
      properties: {
        compId: { type: 'number' },
        compName: { type: 'string' },
        layerIndex: { type: 'number', description: 'Existing shape layer to add the path to' },
        layerName: { type: 'string', description: 'Existing shape layer to add the path to' },
        name: { type: 'string', description: 'Name for the new layer (when creating one)' },
        pathName: { type: 'string', description: 'Name for the path group' },
        groupIndex: { type: 'number', description: 'Which shape group to add to (default: first, created if none)' },
        vertices: {
          type: 'array',
          description: 'Array of [x, y] points in layer space. At least 2 required.',
          items: { type: 'array', items: { type: 'number' } }
        },
        inTangents: {
          type: 'array',
          description: 'Optional [x, y] per vertex, RELATIVE to that vertex. Defaults to corner points.',
          items: { type: 'array', items: { type: 'number' } }
        },
        outTangents: {
          type: 'array',
          description: 'Optional [x, y] per vertex, RELATIVE to that vertex. Defaults to corner points.',
          items: { type: 'array', items: { type: 'number' } }
        },
        closed: { type: 'boolean', description: 'Close the path (default true)' },
        fillColor: { type: 'object', description: 'Fill color (0-1 range)' },
        strokeColor: { type: 'object', description: 'Stroke color (0-1 range)' },
        strokeWidth: { type: 'number' },
        position: { type: 'object', description: 'Layer position {x, y}' }
      },
      required: ['vertices']
    },
    generator: generators.generateCreatePath
  },
  {
    name: 'get_path',
    description: 'Read a bezier path back from a shape layer, including all keyframes if it is animated. Returns vertices, inTangents, outTangents and closed.',
    inputSchema: {
      type: 'object',
      properties: {
        compId: { type: 'number' },
        compName: { type: 'string' },
        layerIndex: { type: 'number' },
        layerName: { type: 'string' },
        pathName: { type: 'string', description: 'Which path to read; omit for the first path found' }
      }
    },
    generator: generators.generateGetPath
  },
  {
    name: 'set_path_keyframes',
    description: 'Animate a bezier path by writing shape keyframes. Each keyframe needs its own full vertex list; vertex counts may differ between keys but AE interpolates best when they match.',
    inputSchema: {
      type: 'object',
      properties: {
        compId: { type: 'number' },
        compName: { type: 'string' },
        layerIndex: { type: 'number' },
        layerName: { type: 'string' },
        pathName: { type: 'string', description: 'Which path to animate; omit for the first path found' },
        keyframes: {
          type: 'array',
          description: 'Array of { time, vertices, inTangents?, outTangents?, closed? }',
          items: {
            type: 'object',
            properties: {
              time: { type: 'number', description: 'Time in seconds' },
              vertices: { type: 'array', items: { type: 'array', items: { type: 'number' } } },
              inTangents: { type: 'array', items: { type: 'array', items: { type: 'number' } } },
              outTangents: { type: 'array', items: { type: 'array', items: { type: 'number' } } },
              closed: { type: 'boolean' }
            },
            required: ['time', 'vertices']
          }
        }
      },
      required: ['keyframes']
    },
    generator: generators.generateSetPathKeyframes
  },
  {
    name: 'add_shape_operator',
    description: 'Add a shape operator (Trim Paths, Repeater, Round Corners, Zig Zag, Twist, Pucker & Bloat, Offset Paths, Wiggle Paths, Wiggle Transform, Merge Paths, Gradient Fill/Stroke) to a shape layer. NOTE: gradient COLOR STOPS cannot be set by scripting - After Effects exposes ADBE Vector Grad Colors as NO_VALUE - so gradients will render with default colors.',
    inputSchema: {
      type: 'object',
      properties: {
        compId: { type: 'number' },
        compName: { type: 'string' },
        layerIndex: { type: 'number' },
        layerName: { type: 'string' },
        operator: {
          type: 'string',
          enum: [
            'trimPaths', 'repeater', 'roundCorners', 'zigZag', 'twist', 'puckerBloat',
            'offsetPaths', 'wigglePaths', 'wiggleTransform', 'mergePaths',
            'gradientFill', 'gradientStroke'
          ],
          description: 'Which operator to add'
        },
        groupIndex: { type: 'number', description: 'Which shape group to add to (default: first)' },
        name: { type: 'string', description: 'Rename the operator' },
        properties: {
          type: 'object',
          description: 'Operator properties by friendly name, e.g. { start: 0, end: 50 } for trimPaths or { copies: 6 } for repeater'
        }
      },
      required: ['operator']
    },
    generator: generators.generateAddShapeOperator
  },
  {
    name: 'set_comp_renderer',
    description: 'Set a composition\'s 3D renderer. This is the unlock for extrusion, bevel, environment layers and reflections - all of which are inert under the Classic renderer. NOTE: the internal name "ADBE Advanced 3d" is the CLASSIC renderer, not Advanced 3D, and it is the default for new comps.',
    inputSchema: {
      type: 'object',
      properties: {
        compId: { type: 'number' },
        compName: { type: 'string' },
        renderer: {
          type: 'string',
          description: 'classic (no extrusion), advanced (extrusion + shadow colour), cinema4d (extrusion + reflections). A raw "ADBE ..." string is also accepted.',
          anyOf: [{ enum: ['classic', 'advanced', 'cinema4d'] }, { pattern: '^ADBE .+' }]
        }
      },
      required: ['renderer']
    },
    generator: generators.generateSetCompRenderer
  },
  {
    name: 'get_3d_info',
    description: 'Read a composition\'s renderer and available renderers, and optionally a layer\'s 3D state with current Material, Camera, Light and Geometry values. Use this before setting 3D properties to see what is actually available.',
    inputSchema: {
      type: 'object',
      properties: {
        compId: { type: 'number' },
        compName: { type: 'string' },
        layerIndex: { type: 'number' },
        layerName: { type: 'string' }
      }
    },
    generator: generators.generateGet3DInfo
  },
  {
    name: 'set_3d_layer',
    description: 'Enable or disable 3D on a layer and set its 3D transform. Position is set through the combined property because the separated X/Y/Z Position properties are read-only unless Separate Dimensions is enabled.',
    inputSchema: {
      type: 'object',
      properties: {
        compId: { type: 'number' },
        compName: { type: 'string' },
        layerIndex: { type: 'number' },
        layerName: { type: 'string' },
        enable3D: { type: 'boolean', description: 'Turn the layer\'s 3D switch on or off' },
        anchorPoint: { type: 'array', items: { type: 'number' }, description: '[x, y, z]' },
        position: { type: 'array', items: { type: 'number' }, description: '[x, y, z]' },
        scale: { type: 'array', items: { type: 'number' }, description: '[x, y, z] percent' },
        orientation: { type: 'array', items: { type: 'number' }, description: '[x, y, z] degrees' },
        rotationX: { type: 'number', description: 'Degrees' },
        rotationY: { type: 'number', description: 'Degrees' },
        rotationZ: { type: 'number', description: 'Degrees' },
        opacity: { type: 'number', description: 'Percent' }
      }
    },
    generator: generators.generateSet3DLayer
  },
  {
    name: 'set_material_options',
    description: 'Set Material Options on a 3D layer - shadows, lights, ambient/diffuse/specular, metal, reflection and transparency. Properties refused by the current renderer are reported in "failed" rather than aborting the call.',
    inputSchema: {
      type: 'object',
      properties: {
        compId: { type: 'number' },
        compName: { type: 'string' },
        layerIndex: { type: 'number' },
        layerName: { type: 'string' },
        castsShadows: { type: 'boolean' },
        lightTransmission: { type: 'number', description: 'Percent' },
        acceptsShadows: { type: 'boolean' },
        acceptsLights: { type: 'boolean' },
        shadowColor: { type: 'object', description: 'Colour (0-1 range). Advanced renderer only.' },
        appearsInReflections: { type: 'boolean', description: 'CINEMA 4D renderer only' },
        ambient: { type: 'number', description: 'Percent' },
        diffuse: { type: 'number', description: 'Percent' },
        specularIntensity: { type: 'number', description: 'Percent' },
        specularShininess: { type: 'number', description: 'Percent' },
        metal: { type: 'number', description: 'Percent' },
        reflectionIntensity: { type: 'number', description: 'Percent. CINEMA 4D renderer only.' },
        reflectionSharpness: { type: 'number', description: 'Percent' },
        reflectionRolloff: { type: 'number', description: 'Percent' },
        transparency: { type: 'number', description: 'Percent' },
        transparencyRolloff: { type: 'number', description: 'Percent' },
        indexOfRefraction: { type: 'number' }
      }
    },
    generator: generators.generateSetMaterialOptions
  },
  {
    name: 'set_geometry_options',
    description: 'Set Geometry Options on a 3D layer. Extrusion and bevel apply to text and shape layers only and REQUIRE the advanced or cinema4d renderer - the call fails fast with an actionable message otherwise, rather than surfacing After Effects\' opaque "property is hidden" error. Curvature and segments apply to the plane geometry group.',
    inputSchema: {
      type: 'object',
      properties: {
        compId: { type: 'number' },
        compName: { type: 'string' },
        layerIndex: { type: 'number' },
        layerName: { type: 'string' },
        extrusionDepth: { type: 'number', description: 'Text and shape layers only; needs advanced/cinema4d renderer' },
        bevelStyle: { type: 'number', description: '1 none, 2 angular, 3 concave, 4 convex' },
        bevelDirection: { type: 'number' },
        bevelDepth: { type: 'number' },
        holeBevelDepth: { type: 'number', description: 'Percent' },
        curvature: { type: 'number', description: 'Plane geometry curvature, percent' },
        segments: { type: 'number', description: 'Plane geometry subdivisions' }
      }
    },
    generator: generators.generateSetGeometryOptions
  },
  {
    name: 'set_camera_options',
    description: 'Set Camera Options on a camera layer - zoom, depth of field, focus, aperture, blur, and the iris/highlight controls',
    inputSchema: {
      type: 'object',
      properties: {
        compId: { type: 'number' },
        compName: { type: 'string' },
        layerIndex: { type: 'number' },
        layerName: { type: 'string' },
        zoom: { type: 'number', description: 'Pixels' },
        depthOfField: { type: 'boolean' },
        focusDistance: { type: 'number', description: 'Pixels' },
        aperture: { type: 'number', description: 'Pixels' },
        blurLevel: { type: 'number', description: 'Percent' },
        focusAreaWidth: { type: 'number' },
        nearFarBlurLevel: { type: 'number' },
        irisShape: { type: 'number', description: 'Iris shape index' },
        irisRotation: { type: 'number', description: 'Degrees' },
        irisRoundness: { type: 'number', description: 'Percent' },
        irisAspectRatio: { type: 'number' },
        irisDiffractionFringe: { type: 'number' },
        highlightGain: { type: 'number' },
        highlightThreshold: { type: 'number' },
        highlightSaturation: { type: 'number' }
      }
    },
    generator: generators.generateSetCameraOptions
  },
  {
    name: 'set_light_options',
    description: 'Set Light Options on a light layer - intensity, colour, cone angle and feather, falloff, shadows, and the environment-light background controls',
    inputSchema: {
      type: 'object',
      properties: {
        compId: { type: 'number' },
        compName: { type: 'string' },
        layerIndex: { type: 'number' },
        layerName: { type: 'string' },
        intensity: { type: 'number', description: 'Percent' },
        color: { type: 'object', description: 'Colour (0-1 range)' },
        coneAngle: { type: 'number', description: 'Degrees; spot lights' },
        coneFeather: { type: 'number', description: 'Percent; spot lights' },
        falloff: { type: 'number', description: '1 none, 2 smooth, 3 inverse square clamped' },
        radius: { type: 'number' },
        falloffDistance: { type: 'number' },
        castsShadows: { type: 'boolean' },
        shadowDarkness: { type: 'number', description: 'Percent' },
        shadowDiffusion: { type: 'number', description: 'Pixels' },
        backgroundVisible: { type: 'boolean', description: 'Environment lights' },
        backgroundOpacity: { type: 'number', description: 'Environment lights' },
        backgroundBlur: { type: 'number', description: 'Environment lights' }
      }
    },
    generator: generators.generateSetLightOptions
  },
  {
    name: 'add_mask',
    description: 'Add a mask to a layer, optionally with a bezier path. Tangents are RELATIVE to their own vertex.',
    inputSchema: {
      type: 'object',
      properties: {
        compId: { type: 'number' },
        compName: { type: 'string' },
        layerIndex: { type: 'number' },
        layerName: { type: 'string' },
        name: { type: 'string', description: 'Mask name' },
        vertices: { type: 'array', description: 'Array of [x, y] points in layer space', items: { type: 'array', items: { type: 'number' } } },
        inTangents: { type: 'array', description: 'Optional [x, y] per vertex, relative to that vertex', items: { type: 'array', items: { type: 'number' } } },
        outTangents: { type: 'array', description: 'Optional [x, y] per vertex, relative to that vertex', items: { type: 'array', items: { type: 'number' } } },
        closed: { type: 'boolean', description: 'Close the path (default true)' },
        mode: { type: 'string', enum: ['none', 'add', 'subtract', 'intersect', 'lighten', 'darken', 'difference'] },
        inverted: { type: 'boolean' },
        rotoBezier: { type: 'boolean' },
        feather: { type: 'number', description: 'Feather in pixels, applied to both axes' },
        opacity: { type: 'number', description: 'Mask opacity percent' },
        expansion: { type: 'number', description: 'Mask expansion in pixels' },
        color: { type: 'object', description: 'Mask outline color (0-1 range)' }
      }
    },
    generator: generators.generateAddMask
  },
  {
    name: 'list_masks',
    description: 'List every mask on a layer with its mode, feather, opacity, expansion and whether its path is animated',
    inputSchema: {
      type: 'object',
      properties: {
        compId: { type: 'number' },
        compName: { type: 'string' },
        layerIndex: { type: 'number' },
        layerName: { type: 'string' }
      }
    },
    generator: generators.generateListMasks
  },
  {
    name: 'get_mask_path',
    description: 'Read a mask path back, including every keyframe when the path is animated',
    inputSchema: {
      type: 'object',
      properties: {
        compId: { type: 'number' },
        compName: { type: 'string' },
        layerIndex: { type: 'number' },
        layerName: { type: 'string' },
        maskIndex: { type: 'number', description: '1-based mask index' },
        maskName: { type: 'string' }
      }
    },
    generator: generators.generateGetMaskPath
  },
  {
    name: 'set_mask_path',
    description: 'Replace a mask path with new vertices and tangents',
    inputSchema: {
      type: 'object',
      properties: {
        compId: { type: 'number' },
        compName: { type: 'string' },
        layerIndex: { type: 'number' },
        layerName: { type: 'string' },
        maskIndex: { type: 'number' },
        maskName: { type: 'string' },
        vertices: { type: 'array', items: { type: 'array', items: { type: 'number' } } },
        inTangents: { type: 'array', items: { type: 'array', items: { type: 'number' } } },
        outTangents: { type: 'array', items: { type: 'array', items: { type: 'number' } } },
        closed: { type: 'boolean' }
      },
      required: ['vertices']
    },
    generator: generators.generateSetMaskPath
  },
  {
    name: 'set_mask_keyframes',
    description: 'Animate a mask path. Each keyframe carries its own full vertex list.',
    inputSchema: {
      type: 'object',
      properties: {
        compId: { type: 'number' },
        compName: { type: 'string' },
        layerIndex: { type: 'number' },
        layerName: { type: 'string' },
        maskIndex: { type: 'number' },
        maskName: { type: 'string' },
        keyframes: {
          type: 'array',
          description: 'Array of { time, vertices, inTangents?, outTangents?, closed? }',
          items: {
            type: 'object',
            properties: {
              time: { type: 'number', description: 'Time in seconds' },
              vertices: { type: 'array', items: { type: 'array', items: { type: 'number' } } },
              inTangents: { type: 'array', items: { type: 'array', items: { type: 'number' } } },
              outTangents: { type: 'array', items: { type: 'array', items: { type: 'number' } } },
              closed: { type: 'boolean' }
            },
            required: ['time', 'vertices']
          }
        }
      },
      required: ['keyframes']
    },
    generator: generators.generateSetMaskKeyframes
  },
  {
    name: 'set_mask_properties',
    description: 'Change a mask\'s mode, inversion, lock, feather, opacity, expansion or color without touching its path. A locked mask is temporarily unlocked so the changes apply.',
    inputSchema: {
      type: 'object',
      properties: {
        compId: { type: 'number' },
        compName: { type: 'string' },
        layerIndex: { type: 'number' },
        layerName: { type: 'string' },
        maskIndex: { type: 'number' },
        maskName: { type: 'string' },
        name: { type: 'string', description: 'Rename the mask' },
        mode: { type: 'string', enum: ['none', 'add', 'subtract', 'intersect', 'lighten', 'darken', 'difference'] },
        inverted: { type: 'boolean' },
        locked: { type: 'boolean' },
        rotoBezier: { type: 'boolean' },
        feather: { type: 'number' },
        opacity: { type: 'number' },
        expansion: { type: 'number' },
        color: { type: 'object', description: 'Mask outline color (0-1 range)' }
      }
    },
    generator: generators.generateSetMaskProperties
  },
  {
    name: 'delete_mask',
    description: 'Delete a mask from a layer',
    inputSchema: {
      type: 'object',
      properties: {
        compId: { type: 'number' },
        compName: { type: 'string' },
        layerIndex: { type: 'number' },
        layerName: { type: 'string' },
        maskIndex: { type: 'number' },
        maskName: { type: 'string' }
      }
    },
    generator: generators.generateDeleteMask
  },
  {
    name: 'add_to_render_queue',
    description: 'Add a composition to the render queue, optionally applying render settings and output module templates and an output path',
    inputSchema: {
      type: 'object',
      properties: {
        compId: { type: 'number' },
        compName: { type: 'string' },
        outputPath: { type: 'string', description: 'Absolute output file path. NOTE: the output module template decides the actual container/extension - passing a .mov path while the module is set to H.264 produces a .mp4. Check the returned outputPath.' },
        renderSettingsTemplate: { type: 'string', description: 'Name of an existing render settings template (see list_render_templates)' },
        outputModuleTemplate: { type: 'string', description: 'Name of an existing output module template (see list_render_templates)' },
        timeSpanStart: { type: 'number', description: 'Render start time in seconds' },
        timeSpanDuration: { type: 'number', description: 'Render duration in seconds' },
        skipFrames: { type: 'number', description: 'Frames to skip between rendered frames (0 renders every frame)' }
      }
    },
    generator: generators.generateAddToRenderQueue
  },
  {
    name: 'list_render_queue',
    description: 'List every render queue item with its status, time span and output modules before or after native rendering. Cannot poll during control_render start because native rendering blocks the CEP bridge.',
    inputSchema: { type: 'object', properties: {} },
    generator: generators.generateListRenderQueue
  },
  {
    name: 'list_render_templates',
    description: 'List the render settings and output module templates configured in this After Effects install, so renders can reuse existing presets by name',
    inputSchema: { type: 'object', properties: {} },
    generator: generators.generateListRenderTemplates
  },
  {
    name: 'set_render_queue_item',
    description: 'Change an existing render queue item - output path, templates, time span, or whether it is queued to render',
    inputSchema: {
      type: 'object',
      properties: {
        itemIndex: { type: 'number', description: '1-based render queue index' },
        outputPath: { type: 'string' },
        renderSettingsTemplate: { type: 'string' },
        outputModuleTemplate: { type: 'string' },
        outputModuleIndex: { type: 'number', description: 'Which output module to change (default 1)' },
        timeSpanStart: { type: 'number' },
        timeSpanDuration: { type: 'number' },
        skipFrames: { type: 'number' },
        render: { type: 'boolean', description: 'Whether this item is checked for the next render pass' }
      },
      required: ['itemIndex']
    },
    generator: generators.generateSetRenderQueueItem
  },
  {
    name: 'remove_from_render_queue',
    description: 'Remove one render queue item, or clear the entire queue with all: true',
    inputSchema: {
      type: 'object',
      properties: {
        itemIndex: { type: 'number', description: '1-based render queue index' },
        all: { type: 'boolean', description: 'Clear the whole queue' }
      }
    },
    generator: generators.generateRemoveFromRenderQueue
  },
  {
    name: 'control_render',
    description: 'Start synchronous native rendering or show the Render Queue panel. WARNING: start blocks the CEP bridge until rendering finishes; polling and stop/pause/resume are unavailable. A command timeout does NOT cancel rendering. Use queue_in_ame for long jobs; do not retry or modify the queue after a timeout until rendering finishes in AE.',
    inputSchema: {
      type: 'object',
      properties: {
        action: { type: 'string', enum: ['start', 'showWindow'] }
      },
      required: ['action']
    },
    generator: generators.generateControlRender
  },
  {
    name: 'queue_in_ame',
    description: 'Send the render queue to Adobe Media Encoder. Returns immediately because AME renders in its own process, which makes it the better choice for long jobs. Set renderImmediately to start AME processing rather than only queueing.',
    inputSchema: {
      type: 'object',
      properties: {
        renderImmediately: { type: 'boolean', description: 'Also start AME processing its queue (default false)' }
      }
    },
    generator: generators.generateQueueInAME
  },
  {
    name: 'list_project_items',
    description: 'List every item in the project, optionally filtered by type',
    inputSchema: {
      type: 'object',
      properties: {
        type: { type: 'string', enum: ['composition', 'footage', 'folder'], description: 'Only return items of this type' }
      }
    },
    generator: generators.generateListProjectItems
  },
  {
    name: 'set_active_composition',
    description: 'Open a composition in the viewer and make it the active item',
    inputSchema: {
      type: 'object',
      properties: {
        compId: { type: 'number' },
        compName: { type: 'string' }
      }
    },
    generator: generators.generateSetActiveComposition
  },
  {
    name: 'set_proxy',
    description: 'Attach a proxy file to a project item',
    inputSchema: {
      type: 'object',
      properties: {
        itemId: { type: 'number' },
        itemName: { type: 'string' },
        proxyPath: { type: 'string', description: 'Absolute path to the proxy file' }
      },
      required: ['proxyPath']
    },
    generator: generators.generateSetProxy
  },
  {
    name: 'remove_proxy',
    description: 'Detach the proxy from a project item',
    inputSchema: {
      type: 'object',
      properties: {
        itemId: { type: 'number' },
        itemName: { type: 'string' }
      }
    },
    generator: generators.generateRemoveProxy
  },
  {
    name: 'get_current_time',
    description: 'Get the current playhead time of a composition, in seconds and frames',
    inputSchema: {
      type: 'object',
      properties: {
        compId: { type: 'number' },
        compName: { type: 'string' }
      }
    },
    generator: generators.generateGetCurrentTime
  },
  {
    name: 'set_current_time',
    description: 'Move the playhead of a composition. Give either time (seconds) or frame.',
    inputSchema: {
      type: 'object',
      properties: {
        compId: { type: 'number' },
        compName: { type: 'string' },
        time: { type: 'number', description: 'Time in seconds' },
        frame: { type: 'number', description: 'Frame number (used when time is omitted)' }
      }
    },
    generator: generators.generateSetCurrentTime
  },
  {
    name: 'snap_to_marker',
    description: 'Move the playhead to a specific marker, on the composition or on a layer',
    inputSchema: {
      type: 'object',
      properties: {
        compId: { type: 'number' },
        compName: { type: 'string' },
        markerIndex: { type: 'number', description: '1-based marker index' },
        layerIndex: { type: 'number', description: 'Use a layer marker instead of a comp marker' },
        layerName: { type: 'string', description: 'Use a layer marker instead of a comp marker' }
      },
      required: ['markerIndex']
    },
    generator: generators.generateSnapToMarker
  },
  {
    name: 'get_nearest_marker',
    description: 'Find the marker closest to a given time',
    inputSchema: {
      type: 'object',
      properties: {
        compId: { type: 'number' },
        compName: { type: 'string' },
        time: { type: 'number', description: 'Time in seconds; defaults to the current playhead' },
        direction: { type: 'string', enum: ['previous', 'next', 'nearest'], description: 'Which way to look (default nearest)' }
      }
    },
    generator: generators.generateGetNearestMarker
  },
  {
    name: 'navigate_markers',
    description: 'Jump the playhead to the first, last, previous or next composition marker',
    inputSchema: {
      type: 'object',
      properties: {
        compId: { type: 'number' },
        compName: { type: 'string' },
        direction: { type: 'string', enum: ['first', 'last', 'previous', 'next'] }
      },
      required: ['direction']
    },
    generator: generators.generateNavigateMarkers
  },
  {
    name: 'batch_set_expressions',
    description: 'Set several expressions on one layer in a single operation',
    inputSchema: {
      type: 'object',
      properties: {
        compId: { type: 'number' },
        compName: { type: 'string' },
        layerIndex: { type: 'number' },
        layerName: { type: 'string' },
        expressions: {
          type: 'array',
          description: 'Array of { property, expression }',
          items: {
            type: 'object',
            properties: {
              property: { type: 'string', description: 'Friendly property alias, e.g. "position", or a raw slash-separated match-name path' },
              expression: { type: 'string' }
            },
            required: ['property', 'expression']
          }
        }
      },
      required: ['expressions']
    },
    generator: generators.generateBatchSetExpressions
  },
  {
    name: 'add_null_layer',
    description: 'Add a null object layer',
    inputSchema: {
      type: 'object',
      properties: {
        compId: { type: 'number' },
        compName: { type: 'string' },
        name: { type: 'string', description: 'Layer name' }
      }
    },
    generator: generators.generateAddNullLayer
  },
  {
    name: 'add_adjustment_layer',
    description: 'Add an adjustment layer',
    inputSchema: {
      type: 'object',
      properties: {
        compId: { type: 'number' },
        compName: { type: 'string' },
        name: { type: 'string', description: 'Layer name' }
      }
    },
    generator: generators.generateAddAdjustmentLayer
  },
  {
    name: 'add_camera_layer',
    description: 'Add a camera layer',
    inputSchema: {
      type: 'object',
      properties: {
        compId: { type: 'number' },
        compName: { type: 'string' },
        name: { type: 'string' },
        type: { type: 'string', enum: ['ONE_NODE', 'TWO_NODE'] },
        zoom: { type: 'number' }
      }
    },
    generator: generators.generateAddCameraLayer
  },
  {
    name: 'add_light_layer',
    description: 'Add a light layer',
    inputSchema: {
      type: 'object',
      properties: {
        compId: { type: 'number' },
        compName: { type: 'string' },
        name: { type: 'string' },
        type: { type: 'string', enum: ['PARALLEL', 'SPOT', 'POINT', 'AMBIENT'] },
        color: { type: 'object' },
        intensity: { type: 'number' }
      }
    },
    generator: generators.generateAddLightLayer
  },
  {
    name: 'add_av_layer',
    description: 'Add a footage item as a layer',
    inputSchema: {
      type: 'object',
      properties: {
        compId: { type: 'number' },
        compName: { type: 'string' },
        itemId: { type: 'number', description: 'Project item ID' },
        itemName: { type: 'string', description: 'Project item name' },
        startTime: { type: 'number' }
      }
    },
    generator: generators.generateAddAVLayer
  },
  {
    name: 'precompose_layers',
    description: 'Precompose selected layers into a new composition',
    inputSchema: {
      type: 'object',
      properties: {
        compId: { type: 'number' },
        compName: { type: 'string' },
        layerIndices: { type: 'array', items: { type: 'number' }, description: 'Layer indices to precompose' },
        name: { type: 'string', description: 'Name for the new precomp' },
        moveAttributes: { type: 'boolean', description: 'Move attributes to new comp' }
      },
      required: ['layerIndices', 'name']
    },
    generator: generators.generatePrecomposeLayers
  },
  {
    name: 'modify_layer',
    description: 'Modify layer properties',
    inputSchema: {
      type: 'object',
      properties: {
        compId: { type: 'number' },
        compName: { type: 'string' },
        layerIndex: { type: 'number' },
        layerName: { type: 'string' },
        name: { type: 'string' },
        enabled: { type: 'boolean' },
        solo: { type: 'boolean' },
        shy: { type: 'boolean' },
        locked: { type: 'boolean' },
        inPoint: { type: 'number' },
        outPoint: { type: 'number' },
        startTime: { type: 'number' },
        stretch: { type: 'number' },
        blendMode: { type: 'string' },
        parent: { type: 'number' },
        is3D: { type: 'boolean' },
        collapseTransformation: { type: 'boolean', description: 'Collapse Transformations / Continuously Rasterize. On a precomp layer, effects then render in this comp\'s space instead of being clipped to the precomp\'s bounds. Not available on raster footage.' },
        position: { type: 'object' },
        scale: { type: 'array', items: { type: 'number' } },
        rotation: { type: 'number' },
        opacity: { type: 'number' }
      }
    },
    generator: generators.generateModifyLayer
  },
  {
    name: 'delete_layer',
    description: 'Delete a layer',
    inputSchema: {
      type: 'object',
      properties: {
        compId: { type: 'number' },
        compName: { type: 'string' },
        layerIndex: { type: 'number' },
        layerName: { type: 'string' }
      }
    },
    generator: generators.generateDeleteLayer
  },
  {
    name: 'list_layers',
    description: 'List all layers in a composition',
    inputSchema: {
      type: 'object',
      properties: {
        compId: { type: 'number' },
        compName: { type: 'string' }
      }
    },
    generator: generators.generateListLayers
  },
  {
    name: 'get_layer_info',
    description: 'Get detailed information about a layer',
    inputSchema: {
      type: 'object',
      properties: {
        compId: { type: 'number' },
        compName: { type: 'string' },
        layerIndex: { type: 'number' },
        layerName: { type: 'string' }
      }
    },
    generator: generators.generateGetLayerInfo
  },

  // ============================================
  // KEYFRAME TOOLS
  // ============================================
  {
    name: 'set_keyframe',
    description: 'Set a keyframe on a property',
    inputSchema: {
      type: 'object',
      properties: {
        compId: { type: 'number' },
        compName: { type: 'string' },
        layerIndex: { type: 'number' },
        layerName: { type: 'string' },
        property: { type: 'string', description: 'Property name (e.g., "position", "scale", "opacity")' },
        time: { type: 'number', description: 'Time in seconds' },
        value: {
          oneOf: [
            { type: 'number' },
            { type: 'array', items: { type: 'number' } },
            { type: 'string' },
            {
              type: 'object',
              properties: {
                x: { type: 'number' },
                y: { type: 'number' },
                z: { type: 'number' }
              },
              required: ['x', 'y']
            }
          ],
          description: 'Property value: number, array of numbers (e.g. [540, 960]), {x,y,z?} object, or string'
        }
      },
      required: ['property', 'time', 'value']
    },
    generator: generators.generateSetKeyframe
  },
  {
    name: 'set_keyframe_advanced',
    description: 'Set a keyframe with easing options',
    inputSchema: {
      type: 'object',
      properties: {
        compId: { type: 'number' },
        compName: { type: 'string' },
        layerIndex: { type: 'number' },
        layerName: { type: 'string' },
        property: { type: 'string' },
        time: { type: 'number' },
        value: {
          oneOf: [
            { type: 'number' },
            { type: 'array', items: { type: 'number' } },
            { type: 'string' },
            {
              type: 'object',
              properties: {
                x: { type: 'number' },
                y: { type: 'number' },
                z: { type: 'number' }
              },
              required: ['x', 'y']
            }
          ],
          description: 'Property value: number, array of numbers, {x,y,z?} object, or string'
        },
        inType: { type: 'string', enum: ['LINEAR', 'BEZIER', 'HOLD'] },
        outType: { type: 'string', enum: ['LINEAR', 'BEZIER', 'HOLD'] },
        inEase: { type: 'object', properties: { speed: { type: 'number' }, influence: { type: 'number' } } },
        outEase: { type: 'object', properties: { speed: { type: 'number' }, influence: { type: 'number' } } }
      },
      required: ['property', 'time', 'value']
    },
    generator: generators.generateSetKeyframeAdvanced
  },
  {
    name: 'apply_easy_ease',
    description: 'Apply easy ease to keyframes',
    inputSchema: {
      type: 'object',
      properties: {
        compId: { type: 'number' },
        compName: { type: 'string' },
        layerIndex: { type: 'number' },
        layerName: { type: 'string' },
        property: { type: 'string' },
        keyframeIndex: { type: 'number', description: 'Specific keyframe (optional, applies to all if omitted)' },
        type: { type: 'string', enum: ['IN', 'OUT', 'BOTH'] }
      },
      required: ['property']
    },
    generator: generators.generateApplyEasyEase
  },
  {
    name: 'set_temporal_ease',
    description: 'Set temporal ease on a keyframe',
    inputSchema: {
      type: 'object',
      properties: {
        compId: { type: 'number' },
        compName: { type: 'string' },
        layerIndex: { type: 'number' },
        layerName: { type: 'string' },
        property: { type: 'string' },
        keyframeIndex: { type: 'number' },
        inSpeed: { type: 'number' },
        inInfluence: { type: 'number' },
        outSpeed: { type: 'number' },
        outInfluence: { type: 'number' }
      },
      required: ['property', 'keyframeIndex']
    },
    generator: generators.generateSetTemporalEase
  },
  {
    name: 'offset_keyframes',
    description: 'Offset all keyframes in time',
    inputSchema: {
      type: 'object',
      properties: {
        compId: { type: 'number' },
        compName: { type: 'string' },
        layerIndex: { type: 'number' },
        layerName: { type: 'string' },
        property: { type: 'string' },
        offset: { type: 'number', description: 'Time offset in seconds' }
      },
      required: ['property', 'offset']
    },
    generator: generators.generateOffsetKeyframes
  },
  {
    name: 'scale_keyframe_timing',
    description: 'Scale keyframe timing (speed up or slow down)',
    inputSchema: {
      type: 'object',
      properties: {
        compId: { type: 'number' },
        compName: { type: 'string' },
        layerIndex: { type: 'number' },
        layerName: { type: 'string' },
        property: { type: 'string' },
        scale: { type: 'number', description: 'Scale factor (2 = twice as slow, 0.5 = twice as fast)' },
        anchorTime: { type: 'number', description: 'Anchor point for scaling' }
      },
      required: ['property', 'scale']
    },
    generator: generators.generateScaleKeyframeTiming
  },
  {
    name: 'reverse_keyframes',
    description: 'Reverse keyframe order',
    inputSchema: {
      type: 'object',
      properties: {
        compId: { type: 'number' },
        compName: { type: 'string' },
        layerIndex: { type: 'number' },
        layerName: { type: 'string' },
        property: { type: 'string' }
      },
      required: ['property']
    },
    generator: generators.generateReverseKeyframes
  },
  {
    name: 'copy_keyframes',
    description: 'Copy keyframes from one property to another',
    inputSchema: {
      type: 'object',
      properties: {
        compId: { type: 'number' },
        compName: { type: 'string' },
        sourceLayerIndex: { type: 'number' },
        sourceLayerName: { type: 'string' },
        sourceProperty: { type: 'string' },
        targetLayerIndex: { type: 'number' },
        targetLayerName: { type: 'string' },
        targetProperty: { type: 'string' },
        timeOffset: { type: 'number' }
      },
      required: ['sourceProperty']
    },
    generator: generators.generateCopyKeyframes
  },
  {
    name: 'get_keyframes',
    description: 'Get all keyframes from a property',
    inputSchema: {
      type: 'object',
      properties: {
        compId: { type: 'number' },
        compName: { type: 'string' },
        layerIndex: { type: 'number' },
        layerName: { type: 'string' },
        property: { type: 'string' }
      },
      required: ['property']
    },
    generator: generators.generateGetKeyframes
  },

  // ============================================
  // EXPRESSION TOOLS
  // ============================================
  {
    name: 'set_expression',
    description: 'Set an expression on a property',
    inputSchema: {
      type: 'object',
      properties: {
        compId: { type: 'number' },
        compName: { type: 'string' },
        layerIndex: { type: 'number' },
        layerName: { type: 'string' },
        property: { type: 'string' },
        expression: { type: 'string', description: 'JavaScript expression' }
      },
      required: ['property', 'expression']
    },
    generator: generators.generateSetExpression
  },
  {
    name: 'get_expression',
    description: 'Get the expression from a property',
    inputSchema: {
      type: 'object',
      properties: {
        compId: { type: 'number' },
        compName: { type: 'string' },
        layerIndex: { type: 'number' },
        layerName: { type: 'string' },
        property: { type: 'string' }
      },
      required: ['property']
    },
    generator: generators.generateGetExpression
  },
  {
    name: 'remove_expression',
    description: 'Remove expression from a property',
    inputSchema: {
      type: 'object',
      properties: {
        compId: { type: 'number' },
        compName: { type: 'string' },
        layerIndex: { type: 'number' },
        layerName: { type: 'string' },
        property: { type: 'string' }
      },
      required: ['property']
    },
    generator: generators.generateRemoveExpression
  },
  {
    name: 'enable_expression',
    description: 'Enable or disable an expression',
    inputSchema: {
      type: 'object',
      properties: {
        compId: { type: 'number' },
        compName: { type: 'string' },
        layerIndex: { type: 'number' },
        layerName: { type: 'string' },
        property: { type: 'string' },
        enabled: { type: 'boolean' }
      },
      required: ['property', 'enabled']
    },
    generator: generators.generateEnableExpression
  },
  {
    name: 'add_expression_control',
    description: 'Add an expression control effect to a layer',
    inputSchema: {
      type: 'object',
      properties: {
        compId: { type: 'number' },
        compName: { type: 'string' },
        layerIndex: { type: 'number' },
        layerName: { type: 'string' },
        controlType: { type: 'string', enum: ['slider', 'color', 'point', 'checkbox', 'dropdown', 'angle', 'layer'] },
        controlName: { type: 'string' },
        defaultValue: {}
      },
      required: ['controlType', 'controlName']
    },
    generator: generators.generateAddExpressionControl
  },
  {
    name: 'apply_expression_template',
    description: 'Apply a pre-built expression template. The physics templates (overshoot, bounce, inertia, springy) act after every keyframe on the property. speedControl needs a Slider Control on the layer (see add_expression_control).',
    inputSchema: {
      type: 'object',
      properties: {
        compId: { type: 'number' },
        compName: { type: 'string' },
        layerIndex: { type: 'number' },
        layerName: { type: 'string' },
        property: { type: 'string' },
        template: {
          type: 'string',
          enum: [
            'wiggle', 'wiggleSmooth', 'wiggleFadeIn', 'wiggleFadeOut',
            'loopingWiggle', 'wiggleOneAxis',
            'loopCycle', 'loopPingpong', 'loopOffset', 'loopContinue',
            'time', 'clock', 'countdown', 'frameNumber',
            'matchPosition', 'offsetPosition', 'inverseRotation', 'followPath',
            'overshoot', 'bounce', 'inertia', 'springy',
            'speedControl'
          ]
        },
        params: {
          type: 'object',
          description: 'Template parameters. overshoot: frequency, decay. bounce: elasticity (0-1), gravity, maxBounces. inertia: friction. springy: mass, stiffness, damping. speedControl: controlName (slider name, units per second), multiplier. loopingWiggle: frequency, amplitude, loopTime. wiggleOneAxis: axis (0 x, 1 y, 2 z), frequency, amplitude. Numeric parameters must be numbers.'
        }
      },
      required: ['property', 'template']
    },
    generator: generators.generateApplyExpressionTemplate
  },
  {
    name: 'link_properties',
    description: 'Link two properties with an expression',
    inputSchema: {
      type: 'object',
      properties: {
        compId: { type: 'number' },
        compName: { type: 'string' },
        sourceLayerIndex: { type: 'number' },
        sourceLayerName: { type: 'string' },
        sourceProperty: { type: 'string' },
        targetLayerIndex: { type: 'number' },
        targetLayerName: { type: 'string' },
        targetProperty: { type: 'string' },
        offset: { description: 'Offset value (number or array)' }
      },
      required: ['sourceProperty', 'targetProperty']
    },
    generator: generators.generateLinkProperties
  },

  // ============================================
  // EFFECT TOOLS
  // ============================================
  {
    name: 'apply_effect',
    description: 'Apply an effect to a layer',
    inputSchema: {
      type: 'object',
      properties: {
        compId: { type: 'number' },
        compName: { type: 'string' },
        layerIndex: { type: 'number' },
        layerName: { type: 'string' },
        effect: { type: 'string', description: 'Effect name or match name' },
        properties: { type: 'object', description: 'Effect property values' }
      },
      required: ['effect']
    },
    generator: generators.generateApplyEffect
  },
  {
    name: 'apply_effect_template',
    description: 'Apply a pre-configured effect template',
    inputSchema: {
      type: 'object',
      properties: {
        compId: { type: 'number' },
        compName: { type: 'string' },
        layerIndex: { type: 'number' },
        layerName: { type: 'string' },
        template: {
          type: 'string',
          enum: [
            'gaussianBlur', 'directionalBlur', 'glassBlur',
            'curves', 'colorBalance', 'brightnessContrast', 'vibrance',
            'glow', 'dropShadow', 'vignette',
            'cinematicLook', 'vhsRetro', 'neonGlow', 'filmGrain',
            'chromaticAberration', 'duotone'
          ]
        },
        intensity: { type: 'number', description: 'Effect intensity (0-100)' },
        customParams: { type: 'object', description: 'Custom effect parameters' }
      },
      required: ['template']
    },
    generator: generators.generateApplyEffectTemplate
  },
  {
    name: 'modify_effect_properties',
    description: 'Modify properties of an existing effect',
    inputSchema: {
      type: 'object',
      properties: {
        compId: { type: 'number' },
        compName: { type: 'string' },
        layerIndex: { type: 'number' },
        layerName: { type: 'string' },
        effectIndex: { type: 'number' },
        effectName: { type: 'string' },
        properties: { type: 'object' }
      },
      required: ['properties']
    },
    generator: generators.generateModifyEffectProperties
  },
  {
    name: 'remove_effect',
    description: 'Remove an effect from a layer',
    inputSchema: {
      type: 'object',
      properties: {
        compId: { type: 'number' },
        compName: { type: 'string' },
        layerIndex: { type: 'number' },
        layerName: { type: 'string' },
        effectIndex: { type: 'number' },
        effectName: { type: 'string' }
      }
    },
    generator: generators.generateRemoveEffect
  },
  {
    name: 'reorder_effects',
    description: 'Reorder effects on a layer',
    inputSchema: {
      type: 'object',
      properties: {
        compId: { type: 'number' },
        compName: { type: 'string' },
        layerIndex: { type: 'number' },
        layerName: { type: 'string' },
        effectIndex: { type: 'number' },
        newIndex: { type: 'number' }
      },
      required: ['effectIndex', 'newIndex']
    },
    generator: generators.generateReorderEffects
  },
  {
    name: 'copy_effects',
    description: 'Copy effects from one layer to another',
    inputSchema: {
      type: 'object',
      properties: {
        compId: { type: 'number' },
        compName: { type: 'string' },
        sourceLayerIndex: { type: 'number' },
        sourceLayerName: { type: 'string' },
        targetLayerIndex: { type: 'number' },
        targetLayerName: { type: 'string' },
        effectIndices: { type: 'array', items: { type: 'number' } }
      }
    },
    generator: generators.generateCopyEffects
  },
  {
    name: 'list_effects',
    description: 'List all effects on a layer',
    inputSchema: {
      type: 'object',
      properties: {
        compId: { type: 'number' },
        compName: { type: 'string' },
        layerIndex: { type: 'number' },
        layerName: { type: 'string' }
      }
    },
    generator: generators.generateListEffects
  },

  // ============================================
  // TEMPLATE TOOLS (Motion Graphics)
  // ============================================
  {
    name: 'create_lower_third',
    description: 'Create a lower third graphic with animated text',
    inputSchema: {
      type: 'object',
      properties: {
        compId: { type: 'number' },
        compName: { type: 'string' },
        style: { type: 'string', enum: ['modern', 'corporate', 'news', 'minimal', 'social'] },
        name: { type: 'string', description: 'Person/entity name' },
        title: { type: 'string', description: 'Title/role' },
        subtitle: { type: 'string', description: 'Optional subtitle' },
        duration: { type: 'number', description: 'Duration in seconds' },
        animateIn: { type: 'boolean' },
        animateOut: { type: 'boolean' },
        primaryColor: { type: 'object' },
        secondaryColor: { type: 'object' },
        textColor: { type: 'object' },
        position: { type: 'string', enum: ['bottomLeft', 'bottomRight', 'bottomCenter'] }
      },
      required: ['style', 'name', 'title']
    },
    generator: generators.generateCreateLowerThird
  },
  {
    name: 'create_title_card',
    description: 'Create a title card with animations',
    inputSchema: {
      type: 'object',
      properties: {
        compId: { type: 'number' },
        compName: { type: 'string' },
        style: { type: 'string', enum: ['cinematic', 'documentary', 'social', 'minimal'] },
        title: { type: 'string' },
        subtitle: { type: 'string' },
        duration: { type: 'number' },
        fontFamily: { type: 'string' },
        fontSize: { type: 'number' },
        color: { type: 'object' },
        backgroundColor: { type: 'object' }
      },
      required: ['style', 'title']
    },
    generator: generators.generateCreateTitleCard
  },
  {
    name: 'create_transition',
    description: 'Create a transition effect layer',
    inputSchema: {
      type: 'object',
      properties: {
        compId: { type: 'number' },
        compName: { type: 'string' },
        type: { type: 'string', enum: ['wipe_left', 'wipe_right', 'wipe_up', 'wipe_down', 'dissolve', 'push', 'slide', 'zoom'] },
        duration: { type: 'number' },
        easing: { type: 'string', enum: ['linear', 'easeIn', 'easeOut', 'easeInOut'] },
        color: { type: 'object' }
      },
      required: ['type']
    },
    generator: generators.generateCreateTransition
  },
  {
    name: 'create_logo_reveal',
    description: 'Create an animated logo reveal',
    inputSchema: {
      type: 'object',
      properties: {
        compId: { type: 'number' },
        compName: { type: 'string' },
        logoItemId: { type: 'number', description: 'Project item ID of logo' },
        logoItemName: { type: 'string', description: 'Project item name of logo' },
        style: { type: 'string', enum: ['fade', 'scale', 'slide', 'spin', 'glitch', 'particle'] },
        duration: { type: 'number' },
        backgroundColor: { type: 'object' }
      }
    },
    generator: generators.generateCreateLogoReveal
  },
  {
    name: 'create_text_animator',
    description: 'Add a text animator to a text layer',
    inputSchema: {
      type: 'object',
      properties: {
        compId: { type: 'number' },
        compName: { type: 'string' },
        layerIndex: { type: 'number' },
        layerName: { type: 'string' },
        animatorType: { type: 'string', enum: ['typewriter', 'fadeInChars', 'scaleInChars', 'slideInChars', 'randomize', 'wave'] },
        duration: { type: 'number' },
        delay: { type: 'number', description: 'Delay between characters' }
      },
      required: ['animatorType']
    },
    generator: generators.generateCreateTextAnimator
  },

  // ============================================
  // ASSET TOOLS
  // ============================================
  {
    name: 'import_folder',
    description: 'Import all files from a folder',
    inputSchema: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Folder path' },
        recursive: { type: 'boolean', description: 'Include subfolders' }
      },
      required: ['path']
    },
    generator: generators.generateImportFolder
  },
  {
    name: 'replace_footage',
    description: 'Replace footage item with a new file',
    inputSchema: {
      type: 'object',
      properties: {
        itemId: { type: 'number' },
        itemName: { type: 'string' },
        newPath: { type: 'string', description: 'Path to new footage file' }
      },
      required: ['newPath']
    },
    generator: generators.generateReplaceFootage
  },
  {
    name: 'organize_project_items',
    description: 'Organize project items into folders',
    inputSchema: {
      type: 'object',
      properties: {
        structure: { type: 'string', enum: ['type', 'usage', 'custom'] },
        customFolders: { type: 'array', items: { type: 'string' } }
      }
    },
    generator: generators.generateOrganizeProjectItems
  },
  {
    name: 'find_missing_footage',
    description: 'Find all missing footage items in the project',
    inputSchema: {
      type: 'object',
      properties: {}
    },
    generator: generators.generateFindMissingFootage
  },
  {
    name: 'collect_files',
    description: 'Collect project files to a folder',
    inputSchema: {
      type: 'object',
      properties: {
        outputPath: { type: 'string', description: 'Output folder path' },
        includeFootage: { type: 'boolean' },
        includeFonts: { type: 'boolean' }
      },
      required: ['outputPath']
    },
    generator: generators.generateCollectFiles
  },
  {
    name: 'reduce_project',
    description: 'Remove unused items from project',
    inputSchema: {
      type: 'object',
      properties: {
        compId: { type: 'number' },
        compName: { type: 'string' }
      }
    },
    generator: generators.generateReduceProject
  },

  // ============================================
  // MARKER TOOLS
  // ============================================
  {
    name: 'add_composition_marker',
    description: 'Add a marker to a composition',
    inputSchema: {
      type: 'object',
      properties: {
        compId: { type: 'number' },
        compName: { type: 'string' },
        time: { type: 'number', description: 'Time in seconds' },
        comment: { type: 'string' },
        duration: { type: 'number' },
        chapter: { type: 'string' },
        url: { type: 'string' },
        frameTarget: { type: 'string' },
        cuePointName: { type: 'string' }
      },
      required: ['time']
    },
    generator: generators.generateAddCompositionMarker
  },
  {
    name: 'add_layer_marker',
    description: 'Add a marker to a layer',
    inputSchema: {
      type: 'object',
      properties: {
        compId: { type: 'number' },
        compName: { type: 'string' },
        layerIndex: { type: 'number' },
        layerName: { type: 'string' },
        time: { type: 'number' },
        comment: { type: 'string' },
        duration: { type: 'number' }
      },
      required: ['time']
    },
    generator: generators.generateAddLayerMarker
  },
  {
    name: 'get_markers',
    description: 'Get all markers from a composition or layer',
    inputSchema: {
      type: 'object',
      properties: {
        compId: { type: 'number' },
        compName: { type: 'string' },
        layerIndex: { type: 'number' },
        layerName: { type: 'string' }
      }
    },
    generator: generators.generateGetMarkers
  },
  {
    name: 'delete_marker',
    description: 'Delete a marker',
    inputSchema: {
      type: 'object',
      properties: {
        compId: { type: 'number' },
        compName: { type: 'string' },
        layerIndex: { type: 'number' },
        layerName: { type: 'string' },
        markerIndex: { type: 'number' }
      },
      required: ['markerIndex']
    },
    generator: generators.generateDeleteMarker
  },
  {
    name: 'set_work_area',
    description: 'Set the work area of a composition',
    inputSchema: {
      type: 'object',
      properties: {
        compId: { type: 'number' },
        compName: { type: 'string' },
        start: { type: 'number', description: 'Start time in seconds' },
        duration: { type: 'number', description: 'Duration in seconds' }
      },
      required: ['start', 'duration']
    },
    generator: generators.generateSetWorkArea
  }
];

// Create tool lookup map
// Complete the advertised schemas before compiling the very same objects for
// runtime validation. Do not apply strict validation to the 67 legacy tools.
const schemaValidator = new AjvJsonSchemaValidator();
const inputValidators = new Map<string, ReturnType<AjvJsonSchemaValidator['getValidator']>>();
for (const tool of TOOLS) {
  if (!INTEGRATION_TOOLS.has(tool.name)) continue;
  const schema = tool.inputSchema;
  const properties = schema.properties!;
  if ('layerIndex' in properties) properties.layerIndex = POSITIVE_INDEX_SCHEMA;
  if ('layerName' in properties) properties.layerName = NONEMPTY_NAME_SCHEMA;
  if (LAYER_TARGETED_TOOLS.has(tool.name)) {
    schema.anyOf = [{ required: ['layerIndex'] }, { required: ['layerName'] }];
  }
  if (tool.name === 'set_proxy' || tool.name === 'remove_proxy') {
    properties.itemId = POSITIVE_INDEX_SCHEMA;
    properties.itemName = NONEMPTY_NAME_SCHEMA;
    schema.anyOf = [{ required: ['itemId'] }, { required: ['itemName'] }];
  }
  if (tool.name === 'create_path') {
    properties.fillColor = RGB_SCHEMA;
    properties.strokeColor = RGB_SCHEMA;
    properties.position = POSITION_SCHEMA;
  }
  if (tool.name === 'add_mask' || tool.name === 'set_mask_properties') {
    properties.color = RGB_SCHEMA;
    properties.feather = FEATHER_SCHEMA;
  }
  if (tool.name === 'set_material_options') properties.shadowColor = RGB_SCHEMA;
  if (tool.name === 'set_light_options') properties.color = RGB_SCHEMA;
  inputValidators.set(tool.name, schemaValidator.getValidator(schema));
}

const toolMap = new Map<string, typeof TOOLS[0]>();
TOOLS.forEach(tool => toolMap.set(tool.name, tool));

// Create communicator
const communicator = new FileCommunicator({ logger });

// Create MCP server
const server = new Server(
  {
    name: 'ae-mcp',
    version: '1.0.0'
  },
  {
    capabilities: {
      tools: {},
      resources: {},
      prompts: {}
    }
  }
);

// List tools handler
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: TOOLS.map(tool => ({
      name: tool.name,
      description: tool.description,
      inputSchema: tool.inputSchema
    }))
  };
});

// Call tool handler
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  const tool = toolMap.get(name);
  if (!tool) {
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({ success: false, error: `Unknown tool: ${name}` })
        }
      ],
      isError: true
    };
  }

  try {
    // Native render blocks CEP's single command channel; these operations
    // cannot interrupt it. Reject even stale clients before generating/IPC.
    if (name === 'control_render' && ['stop', 'pause', 'resume'].includes((args as any)?.action)) {
      throw new Error('The CEP bridge cannot stop, pause or resume a synchronous native render, or poll it while it runs. Use After Effects UI controls or queue_in_ame for long jobs.');
    }
    const params = args ?? {};
    const validate = inputValidators.get(name);
    if (validate) {
      const result = validate(params);
      if (!result.valid) throw new Error(`Invalid arguments for ${name}: ${result.errorMessage}`);
    }
    // Generate the script only after input validation.
    const script = tool.generator(params);

    // Execute in After Effects
    const result = await communicator.executeScript(script);

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(result)
        }
      ],
      isError: !result.success
    };
  } catch (error) {
    const errorResponse = createErrorResponse(error instanceof Error ? error : String(error));
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(errorResponse)
        }
      ],
      isError: true
    };
  }
});

// List resources handler
server.setRequestHandler(ListResourcesRequestSchema, async () => {
  return {
    resources: [
      {
        uri: 'ae://project/current',
        name: 'Current Project',
        description: 'Information about the current After Effects project',
        mimeType: 'application/json'
      },
      {
        uri: 'ae://compositions',
        name: 'Compositions',
        description: 'List of all compositions in the project',
        mimeType: 'application/json'
      }
    ]
  };
});

// Read resource handler
server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
  const { uri } = request.params;

  try {
    let script: string;

    if (uri === 'ae://project/current') {
      script = generators.generateGetProjectInfo();
    } else if (uri === 'ae://compositions') {
      script = generators.generateListCompositions();
    } else {
      return {
        contents: [
          {
            uri,
            mimeType: 'application/json',
            text: JSON.stringify({ error: 'Unknown resource' })
          }
        ]
      };
    }

    const result = await communicator.executeScript(script);

    return {
      contents: [
        {
          uri,
          mimeType: 'application/json',
          text: JSON.stringify(result.data || result)
        }
      ]
    };
  } catch (error) {
    return {
      contents: [
        {
          uri,
          mimeType: 'application/json',
          text: JSON.stringify({ error: String(error) })
        }
      ]
    };
  }
});

// List prompts handler
server.setRequestHandler(ListPromptsRequestSchema, async () => {
  return {
    prompts: [
      {
        name: 'create-animation',
        description: 'Create an animated composition with common motion graphics elements'
      },
      {
        name: 'setup-project',
        description: 'Set up a new project with standard folder structure'
      }
    ]
  };
});

// Get prompt handler
server.setRequestHandler(GetPromptRequestSchema, async (request) => {
  const { name } = request.params;

  if (name === 'create-animation') {
    return {
      messages: [
        {
          role: 'user',
          content: {
            type: 'text',
            text: 'Help me create an animated composition. I want to add text with entrance animations, shapes, and smooth transitions.'
          }
        }
      ]
    };
  } else if (name === 'setup-project') {
    return {
      messages: [
        {
          role: 'user',
          content: {
            type: 'text',
            text: 'Set up a new After Effects project with organized folders for footage, compositions, and precomps.'
          }
        }
      ]
    };
  }

  return {
    messages: []
  };
});

// Main entry point
async function main() {
  logger.info('Starting AE-MCP server...');

  const transport = new StdioServerTransport();

  await server.connect(transport);

  logger.info('AE-MCP server running');
}

main().catch((error) => {
  logger.error('Fatal error', { error: String(error) });
  process.exit(1);
});
