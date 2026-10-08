import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';
import * as schemas from '@modelcontextprotocol/sdk/types.js';
import * as validator from '@modelcontextprotocol/sdk/validation/ajv';
import * as generators from './ae-integration/scriptGenerator.js';
import * as errors from './ae-integration/errorHandler.js';

type Handler = (request: any) => Promise<any>;
type Tool = { name: string; inputSchema: any; generator: (params: any) => string };

// Load the real registration/handler code with only the transport and AE IPC
// mocked. This exercises dispatch without starting AE or creating command files.
function createServer() {
  const handlers = new Map<unknown, Handler>();
  const scripts: string[] = [];
  class Server {
    setRequestHandler(schema: unknown, handler: Handler) { handlers.set(schema, handler); }
    async connect() {}
  }
  class FileCommunicator {
    async executeScript(script: string) {
      new vm.Script(script);
      scripts.push(script);
      return { success: true, data: { accepted: true } };
    }
  }
  const modules: Record<string, unknown> = {
    '@modelcontextprotocol/sdk/server/index.js': { Server },
    '@modelcontextprotocol/sdk/server/stdio.js': { StdioServerTransport: class {} },
    '@modelcontextprotocol/sdk/types.js': schemas,
    '@modelcontextprotocol/sdk/validation/ajv': validator,
    './ae-integration/file-communicator.js': { FileCommunicator },
    './ae-integration/scriptGenerator.js': generators,
    './ae-integration/errorHandler.js': errors
  };
  const source = readFileSync(new URL('./stdio-server.ts', import.meta.url), 'utf8');
  const compiled = ts.transpileModule(source + '\nexport { TOOLS };', {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 }
  }).outputText;
  const exports: { TOOLS?: Tool[] } = {};
  vm.runInNewContext(compiled, {
    exports,
    require(name: string) {
      assert.ok(name in modules, 'Unexpected module dependency: ' + name);
      return modules[name];
    },
    console: { error() {} },
    process: { exit(code: number) { throw new Error('Unexpected server exit: ' + code); } }
  });
  return {
    tools: exports.TOOLS!,
    scripts,
    list: () => handlers.get(schemas.ListToolsRequestSchema)!({}),
    call: (name: string, args: unknown) => handlers.get(schemas.CallToolRequestSchema)!({
      params: { name, arguments: args }
    })
  };
}

describe('MCP tool registration and dispatch', () => {
  it('registers every generator exactly once with a matching name', async () => {
    const server = createServer();
    const { tools } = await server.list();
    assert.equal(tools.length, 102);
    assert.equal(new Set(tools.map((tool: Tool) => tool.name)).size, tools.length);
    const normalized = (name: string) => name.replace(/_/g, '').toLowerCase();
    for (const [name, generate] of Object.entries(generators)) {
      if (!name.startsWith('generate')) continue;
      const matches = server.tools.filter(tool => tool.generator === generate);
      assert.equal(matches.length, 1, name + ' must have exactly one registration');
      assert.equal(normalized('generate' + matches[0].name), normalized(name));
    }
    for (const tool of server.tools) {
      assert.equal(typeof tool.generator, 'function', tool.name);
      for (const required of tool.inputSchema.required ?? []) {
        assert.ok(required in tool.inputSchema.properties, tool.name + '.' + required);
      }
    }
  });

  const vertices = [[0, 0], [100, 0], [50, 100]];
  const cases: Record<string, object> = {
    create_path: { vertices },
    get_path: {},
    set_path_keyframes: { keyframes: [{ time: 0, vertices }] },
    add_shape_operator: { operator: 'trimPaths', properties: { end: 50 } },
    add_mask: { vertices },
    list_masks: {},
    get_mask_path: {},
    set_mask_path: { vertices },
    set_mask_keyframes: { keyframes: [{ time: 0, vertices }] },
    set_mask_properties: { opacity: 50, locked: true },
    delete_mask: {},
    add_to_render_queue: { outputPath: '/tmp/output.mov' },
    list_render_queue: {},
    list_render_templates: {},
    set_render_queue_item: { itemIndex: 1, render: false },
    remove_from_render_queue: { itemIndex: 1 },
    control_render: { action: 'showWindow' },
    queue_in_ame: { renderImmediately: false },
    set_comp_renderer: { renderer: 'classic' },
    get_3d_info: {},
    set_3d_layer: { position: [0, 0, 0] },
    set_material_options: { acceptsLights: true },
    set_geometry_options: { extrusionDepth: 10 },
    set_camera_options: { zoom: 1000 },
    set_light_options: { intensity: 100 },
    list_project_items: {},
    set_active_composition: { compName: 'Test' },
    set_proxy: { itemId: 1, proxyPath: '/tmp/proxy.png' },
    remove_proxy: { itemId: 1 },
    get_current_time: {},
    set_current_time: { time: 1 },
    snap_to_marker: { markerIndex: 1 },
    get_nearest_marker: { time: 1 },
    navigate_markers: { direction: 'next' },
    batch_set_expressions: { expressions: [{ property: 'ADBE Transform Group/ADBE Rotate Z', expression: 'time' }] }
  };
  for (const [name, args] of Object.entries(cases)) {
    it(`${name} dispatches to a syntactically valid script`, async () => {
      const server = createServer();
      const params: Record<string, unknown> = { compName: 'Test', layerIndex: 1, ...args };
      const tool = server.tools.find(tool => tool.name === name)!;
      for (const required of tool.inputSchema.required ?? []) {
        assert.ok(required in params, name + ' fixture missing ' + required);
      }
      const result = await server.call(name, params);
      assert.equal(result.isError, false, JSON.stringify(result));
      assert.equal(server.scripts.length, 1);
      assert.equal(JSON.parse(result.content[0].text).data.accepted, true);
    });
  }

  const layerTargets = [
    'get_path', 'set_path_keyframes', 'add_shape_operator', 'set_3d_layer',
    'set_material_options', 'set_geometry_options', 'set_camera_options', 'set_light_options',
    'add_mask', 'list_masks', 'get_mask_path', 'set_mask_path', 'set_mask_keyframes',
    'set_mask_properties', 'delete_mask', 'batch_set_expressions'
  ];
  for (const name of layerTargets) {
    it(`${name} advertises and validates either layer selector before IPC`, async () => {
      const server = createServer();
      const schema = server.tools.find(tool => tool.name === name)!.inputSchema;
      assert.deepEqual(JSON.parse(JSON.stringify(schema.anyOf)), [
        { required: ['layerIndex'] }, { required: ['layerName'] }
      ]);
      const validate = new validator.AjvJsonSchemaValidator().getValidator(schema);
      for (const selector of [{ layerIndex: 1 }, { layerName: 'Target' }]) {
        const args = { ...cases[name], ...selector };
        assert.equal(validate(args).valid, true);
        assert.equal((await server.call(name, args)).isError, false);
      }
      server.scripts.length = 0;
      for (const selector of [{}, { layerIndex: 0 }, { layerIndex: -1 }, { layerIndex: 1.5 },
        { layerIndex: '1' }, { layerName: '' }, { layerName: '  ' }]) {
        const args = { ...cases[name], ...selector };
        assert.equal(validate(args).valid, false);
        const result = await server.call(name, args);
        assert.equal(result.isError, true);
        assert.match(result.content[0].text, /Invalid arguments for/);
      }
      assert.equal(server.scripts.length, 0);
    });
  }

  for (const name of ['set_proxy', 'remove_proxy']) {
    it(`${name} requires a valid project item selector before IPC`, async () => {
      const server = createServer();
      const schema = server.tools.find(tool => tool.name === name)!.inputSchema;
      assert.deepEqual(JSON.parse(JSON.stringify(schema.anyOf)), [
        { required: ['itemId'] }, { required: ['itemName'] }
      ]);
      for (const selector of [{ itemId: 1 }, { itemName: 'Footage' }]) {
        assert.equal((await server.call(name, { proxyPath: '/tmp/proxy.png', ...selector })).isError, false);
      }
      server.scripts.length = 0;
      for (const selector of [{}, { itemId: 0 }, { itemId: 1.5 }, { itemName: '' }, { itemName: ' ' }]) {
        assert.equal((await server.call(name, { proxyPath: '/tmp/proxy.png', ...selector })).isError, true);
      }
      assert.equal(server.scripts.length, 0);
    });
  }

  const colorCases = [
    ['create_path', 'fillColor'], ['create_path', 'strokeColor'],
    ['add_mask', 'color'], ['set_mask_properties', 'color'],
    ['set_material_options', 'shadowColor'], ['set_light_options', 'color']
  ];
  for (const [name, field] of colorCases) {
    it(`${name}.${field} validates RGB and emits a numeric color array`, async () => {
      const server = createServer();
      const base = { ...cases[name], layerIndex: 1 };
      assert.equal((await server.call(name, { ...base, [field]: { r: 0, g: 0.5, b: 1 } })).isError, false);
      assert.match(server.scripts[0], /\[0, 0\.5, 1\]/);
      server.scripts.length = 0;
      for (const color of [{}, { r: 0, g: 1 }, { r: '0', g: 0, b: 0 },
        { r: -0.1, g: 0, b: 0 }, { r: 0, g: 0, b: 1.1 }, { r: NaN, g: 0, b: 0 }, { r: 0, g: 0, b: 0, a: 'bad' }]) {
        assert.equal((await server.call(name, { ...base, [field]: color })).isError, true);
      }
      assert.equal(server.scripts.length, 0);
    });
  }

  it('create_path validates XY/XYZ objects without requiring an existing layer', async () => {
    const server = createServer();
    for (const [position, expected] of [
      [{ x: 10, y: 20 }, '[10, 20]'], [{ x: 10, y: 20, z: 30 }, '[10, 20, 30]']
    ] as const) {
      assert.equal((await server.call('create_path', { vertices, position })).isError, false);
      assert.ok(server.scripts[server.scripts.length - 1].includes(expected));
    }
    server.scripts.length = 0;
    for (const position of [{}, { x: 10 }, { y: 20 }, { x: '10', y: 20 }, { x: 10, y: 20, z: null }]) {
      assert.equal((await server.call('create_path', { vertices, position })).isError, true);
    }
    assert.equal(server.scripts.length, 0);
  });

  for (const name of ['add_mask', 'set_mask_properties']) {
    it(`${name} accepts scalar or exactly two numeric feather axes`, async () => {
      const server = createServer();
      for (const [feather, expected] of [[10, '[10, 10]'], [[10, 20], '[10, 20]']] as const) {
        assert.equal((await server.call(name, { layerIndex: 1, feather })).isError, false);
        assert.ok(server.scripts[server.scripts.length - 1].includes(expected));
      }
      server.scripts.length = 0;
      for (const feather of [[], [10], [10, 20, 30], [10, '20'], '10']) {
        assert.equal((await server.call(name, { layerIndex: 1, feather })).isError, true);
      }
      assert.equal(server.scripts.length, 0);
    });
  }

  it('set_comp_renderer schema and dispatch accept aliases or raw ADBE names only', async () => {
    const server = createServer();
    const schema = server.tools.find(tool => tool.name === 'set_comp_renderer')!.inputSchema;
    const validate = new validator.AjvJsonSchemaValidator().getValidator(schema);
    for (const renderer of ['classic', 'advanced', 'cinema4d', 'ADBE Advanced 3d', 'ADBE Future Renderer']) {
      assert.equal(validate({ renderer }).valid, true);
      assert.equal((await server.call('set_comp_renderer', { renderer })).isError, false);
      if (renderer.startsWith('ADBE ')) {
        assert.ok(server.scripts[server.scripts.length - 1].includes('comp.renderer = "' + renderer + '"'));
      }
    }
    server.scripts.length = 0;
    for (const renderer of ['other', 'ADBE ', '', 1]) {
      assert.equal(validate({ renderer }).valid, false);
      assert.equal((await server.call('set_comp_renderer', { renderer })).isError, true);
    }
    assert.equal(server.scripts.length, 0);
  });

  it('control_render advertises only synchronous start/showWindow and rejects interruption before IPC', async () => {
    const server = createServer();
    const schema = server.tools.find(tool => tool.name === 'control_render')!.inputSchema;
    assert.deepEqual(Array.from(schema.properties.action.enum), ['start', 'showWindow']);
    assert.equal((await server.call('control_render', { action: 'start' })).isError, false);
    assert.match(server.scripts[0], /rq\.render\(\);/);
    server.scripts.length = 0;
    for (const action of ['stop', 'pause', 'resume']) {
      const result = await server.call('control_render', { action });
      assert.equal(result.isError, true);
      assert.match(result.content[0].text, /CEP bridge cannot stop, pause or resume/);
      assert.throws(() => generators.generateControlRender({ action: action as 'stop' }), /CEP bridge/);
    }
    assert.equal(server.scripts.length, 0);
  });

  it('optional layer tools and legacy coercion remain supported', async () => {
    const server = createServer();
    for (const name of ['get_3d_info', 'snap_to_marker', 'get_nearest_marker', 'navigate_markers']) {
      assert.equal((await server.call(name, cases[name])).isError, false);
    }
    // The original keyframe generator intentionally parses numeric strings.
    assert.equal((await server.call('set_keyframe', {
      layerIndex: 1, property: 'position', time: '1', value: '[10,20]'
    })).isError, false);
  });

  it('batch_set_expressions resolves friendly aliases while preserving raw paths', async () => {
    const server = createServer();
    assert.equal((await server.call('batch_set_expressions', {
      layerIndex: 1, expressions: [
        { property: 'position', expression: 'value' },
        { property: 'ADBE Transform Group/ADBE Rotate Z', expression: 'time' }
      ]
    })).isError, false);
    assert.match(server.scripts[0], /prop0\.property\("ADBE Transform Group"\)/);
    assert.match(server.scripts[0], /prop0\.property\("ADBE Position"\)/);
    assert.match(server.scripts[0], /prop1\.property\("ADBE Rotate Z"\)/);
  });

  it('rejects unknown tools and invalid generated inputs without contacting AE', async () => {
    const server = createServer();
    assert.equal((await server.call('unknown_tool', {})).isError, true);
    assert.equal((await server.call('add_shape_operator', { operator: 'invalid' })).isError, true);
    assert.equal((await server.call('scale_keyframe_timing', { scale: 0 })).isError, true);
    assert.equal(server.scripts.length, 0);
  });
});
