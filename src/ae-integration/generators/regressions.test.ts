import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import vm from 'node:vm';
import { generateApplyExpressionTemplate, generateBatchSetExpressions, getExpressionTemplates } from './expressionGenerators.js';
import { generateControlRender } from './renderQueueGenerators.js';
import { generateScaleKeyframeTiming, generateOffsetKeyframes } from './keyframeGenerators.js';
import { generateRenderFrame } from './compositionGenerators.js';
import { validatePathPoints, generateSetPathKeyframes } from './shapeGenerators.js';
import { generateSetMaskKeyframes, generateSetMaskProperties } from './maskGenerators.js';

function runGenerator(script: string, property: object = {}, extra: Record<string, unknown> = {}) {
  const prop = Object.assign(property, { property: () => prop });
  class CompItem {
    duration = 10;
    frameRate = 30;
    name = 'Test';
    layer() { return prop; }
  }
  const comp = new CompItem();
  Object.assign(comp, extra.comp);
  return vm.runInNewContext(script, {
    app: { project: { activeItem: comp } }, CompItem, ...extra
  });
}

function expression(template: string, params?: Record<string, unknown>) {
  const prop = { expression: '' };
  runGenerator(generateApplyExpressionTemplate({
    layerIndex: 1, property: 'rotation', template, params
  }), prop);
  return prop.expression;
}

type SpeedKey = { time: number; value: number; hold?: boolean };
function speedAt(keys: SpeedKey[], time: number, inPoint = 0, value: number | number[] = 0) {
  const slider = {
    numKeys: keys.length,
    value: 10,
    key: (i: number) => keys[i - 1],
    valueAtTime(t: number) {
      if (!keys.length) return this.value;
      if (t <= keys[0].time) return keys[0].value;
      for (let i = 1; i < keys.length; i++) {
        const a = keys[i - 1], b = keys[i];
        if (t < b.time) {
          return a.hold ? a.value : a.value + (b.value - a.value) * (t - a.time) / (b.time - a.time);
        }
      }
      return keys[keys.length - 1].value;
    }
  };
  return vm.runInNewContext(expression('speedControl'), {
    effect: () => () => slider, time, inPoint, value, Array
  });
}

describe('speed integration', () => {
  it('does not reinterpret a completed HOLD segment as a ramp', () => {
    const keys = [{ time: 0, value: 100, hold: true }, { time: 1, value: 0 }];
    assert.equal(speedAt(keys, 0.5), 50);
    assert.equal(speedAt(keys, 1), 100);
    assert.equal(speedAt(keys, 2), 100);
    assert.ok(Math.abs(speedAt(keys, 1 - 1e-8) - speedAt(keys, 1)) < 1e-5);
  });

  it('clips integration to inPoint, including a partially visible key interval', () => {
    const keys = [{ time: 0, value: 10 }, { time: 1, value: 20 }, { time: 2, value: 30 }];
    assert.equal(speedAt(keys, 1, 1.5), 0);
    assert.equal(speedAt(keys, 1.5, 1.5), 0);
    assert.equal(speedAt(keys, 2, 1.5), 13.75);
    assert.equal(speedAt(keys, 3, 1.5), 43.75);
    assert.equal(speedAt(keys, 4, 3), 30);
  });

  it('integrates linear ramps, including partial intervals and constant tails', () => {
    const keys = [{ time: 0, value: 0 }, { time: 2, value: 360 }, { time: 3, value: 0 }];
    assert.equal(speedAt(keys, 1), 90);
    assert.equal(speedAt(keys, 2), 360);
    assert.equal(speedAt(keys, 2.5), 495);
    assert.equal(speedAt(keys, 4), 540);
    assert.equal(speedAt([{ time: 2, value: 10 }], 3), 30);
    assert.equal(speedAt([], 3, 1), 20);
    assert.deepEqual(Array.from(speedAt([], 3, 1, [5, 10])), [25, 30]);
  });
});

describe('render bridge contract', () => {
  it('returns a native render result only after synchronous render completes', () => {
    const rq = {
      numItems: 1, rendering: false, completed: false,
      render() { this.rendering = true; this.completed = true; this.rendering = false; }
    };
    const result = vm.runInNewContext(generateControlRender({ action: 'start' }), {
      app: { project: { renderQueue: rq } }
    });
    assert.equal(rq.completed, true);
    assert.equal(result.rendering, false);
    assert.equal(result.action, 'start');
  });
});

describe('expression compatibility and escaping', () => {
  it('batch expressions navigate friendly aliases to the actual transform property', () => {
    const prop = { expression: '' };
    const transform = {
      property(name: string) { assert.equal(name, 'ADBE Position'); return prop; }
    };
    class CompItem {
      layer() {
        return { property(name: string) { assert.equal(name, 'ADBE Transform Group'); return transform; } };
      }
    }
    const result = vm.runInNewContext(generateBatchSetExpressions({
      layerIndex: 1, expressions: [{ property: 'position', expression: 'value + [10, 20]' }]
    }), { app: { project: { activeItem: new CompItem() } }, CompItem });
    assert.equal(result[0].success, true);
    assert.equal(prop.expression, 'value + [10, 20]');
  });

  it('keeps legacy bounce parameters and exposes gravity bounce separately', () => {
    const templates = getExpressionTemplates();
    assert.ok(templates.bounce.params?.amplitude);
    assert.ok(templates.bounce.params?.frequency);
    assert.ok(templates.bounce.params?.decay);
    assert.ok(templates.bounceBack.params?.gravity);
    const source = expression('bounce', { amplitude: 0, frequency: 4, decay: 6 });
    const result = vm.runInNewContext(source, {
      numKeys: 1, key: () => ({ time: 0 }), nearestKey: () => ({ index: 1 }),
      time: 0.1, value: 42, velocityAtTime: () => 100, thisComp: { frameDuration: 1 / 30 }
    });
    assert.equal(result, 42);
  });

  it('escapes newlines and quotes in expression string parameters', () => {
    const name = 'Speed\n"quoted"\\name';
    const source = expression('speedControl', { controlName: name });
    vm.runInNewContext(source, {
      effect: (actual: string) => {
        assert.equal(actual, name);
        return () => ({ numKeys: 0, value: 10, valueAtTime: () => 10 });
      },
      time: 1, inPoint: 0, value: 0
    });
  });
});

function keyframeProperty(times: number[]) {
  const keys = times.map((time, i) => ({ time, value: i + 1 }));
  const prop = {
    removed: 0,
    get numKeys() { return keys.length; },
    keyTime: (i: number) => keys[i - 1].time,
    keyValue: (i: number) => keys[i - 1].value,
    keyInInterpolationType: () => 1, keyOutInterpolationType: () => 1,
    keyInTemporalEase: () => [], keyOutTemporalEase: () => [],
    removeKey(i: number) { this.removed++; keys.splice(i - 1, 1); },
    addKey(time: number) { keys.push({ time, value: 0 }); return keys.length; },
    setValueAtKey(i: number, value: number) { keys[i - 1].value = value; },
    setInterpolationTypeAtKey() {}, setTemporalEaseAtKey() {}
  };
  return { keys, prop };
}

describe('keyframe retiming safety', () => {
  for (const scale of [1, 0.1]) {
    it(`preserves distinct subframe keys when scaling by ${scale}`, () => {
      const { prop, keys } = keyframeProperty([0, 0.001]);
      runGenerator(generateScaleKeyframeTiming({ layerIndex: 1, property: 'rotation', scale }), prop);
      assert.deepEqual(keys, [{ time: 0, value: 1 }, { time: 0.001 * scale, value: 2 }]);
    });
  }

  for (const params of [{ scale: 2, anchorTime: 2 }, { scale: 1e308 }, { scale: 1e-300, anchorTime: 1e20 }]) {
    it(`rejects invalid computed times before deleting keys: ${JSON.stringify(params)}`, () => {
      const { prop } = keyframeProperty([0, 2]);
      assert.throws(() => runGenerator(generateScaleKeyframeTiming({
        layerIndex: 1, property: 'rotation', ...params
      }), prop), /Nothing was changed/);
      assert.equal(prop.removed, 0);
    });
  }

  it('rejects overflowing offsets without deleting keys', () => {
    const { prop } = keyframeProperty([1e308]);
    assert.throws(() => runGenerator(generateOffsetKeyframes({
      layerIndex: 1, property: 'rotation', offset: 1e308
    }), prop), /Nothing was changed/);
    assert.equal(prop.removed, 0);
  });
});

function render(options: { appearsAt?: number; grows?: boolean; empty?: boolean; stale?: boolean } = {}) {
  let elapsed = 0;
  class File {
    fsName: string;
    constructor(path: string) { this.fsName = path; }
    get exists() { return options.stale || elapsed >= (options.appearsAt ?? 50); }
    get length() { return options.empty ? 0 : options.grows ? elapsed : 100; }
    remove() { return false; }
  }
  class Folder {
    exists = true;
    fsName: string;
    constructor(path: string) { this.fsName = path; }
  }
  return runGenerator(generateRenderFrame({ time: 0 }), {}, {
    File, Folder, $: { sleep: (ms: number) => { elapsed += ms; } },
    comp: { saveFrameToPng() {} }
  });
}

describe('frame render completion', () => {
  it('returns a non-empty stable file', () => {
    assert.equal(render().success, true);
    assert.equal(render().bytes, 100);
  });
  for (const options of [
    { appearsAt: Infinity }, { appearsAt: 14950 }, { grows: true }, { empty: true }, { stale: true }
  ]) {
    it(`does not report incomplete or stale frames as successful: ${JSON.stringify(options)}`, () => {
      assert.throws(() => render(options));
    });
  }
});

describe('path and mask safety', () => {
  it('validates finite vertices and matching finite tangents', () => {
    assert.doesNotThrow(() => validatePathPoints([[0, 0], [1, 1]]));
    assert.throws(() => validatePathPoints([[0, 0], [Infinity, 1]]));
    assert.throws(() => validatePathPoints([[0, 0], [1, 1]], [[0, 0]]));
    assert.throws(() => validatePathPoints([[0, 0], [1, 1]], [[0, 0], [NaN, 0]]));
  });

  for (const generate of [generateSetPathKeyframes, generateSetMaskKeyframes]) {
    it(`${generate.name} rejects invalid key times before executing any script`, () => {
      assert.throws(() => generate({
        layerIndex: 1,
        keyframes: [
          { time: 0, vertices: [[0, 0], [1, 1]] },
          { time: Infinity, vertices: [[0, 0], [1, 1]] }
        ]
      }), /finite number/);
    });
  }

  it('restores a mask lock even if a property update throws', () => {
    const mask = { locked: true, numProperties: 1, setValue() { throw new Error('invalid feather'); } };
    assert.throws(() => runGenerator(generateSetMaskProperties({
      layerIndex: 1, maskIndex: 1, feather: -1
    }), mask), /invalid feather/);
    assert.equal(mask.locked, true);
  });
});
