import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

const hostSource = readFileSync(
  new URL('../../cep-extension/jsx/host.jsx', import.meta.url),
  'utf8'
);

function createHost(failAt?: string) {
  const calls: string[] = [];
  const responses: Array<{ success: boolean; data?: unknown; error?: string }> = [];
  const context = vm.createContext({
    JSON,
    app: Object.fromEntries(
      ['beginSuppressDialogs', 'beginUndoGroup', 'endUndoGroup', 'endSuppressDialogs']
        .map(name => [name, () => {
          calls.push(name);
          if (name === failAt) throw new Error(name + ' failed');
        }])
    )
  });
  vm.runInContext(hostSource, context);
  context.writeSuccessResponse = (_file: unknown, data: unknown) => {
    assert.ok(_file, 'response must use the original command file');
    if (failAt === 'writeSuccessResponse') throw new Error('response write failed');
    responses.push({ success: true, data });
  };
  context.writeErrorResponse = (_file: unknown, error: string) => {
    if (failAt === 'writeErrorResponse') throw new Error('error response write failed');
    responses.push({ success: false, error });
  };
  context.markAsProcessed = () => {
    if (failAt === 'markAsProcessed') throw new Error('archive failed');
  };
  function process(script = '({ answer: 42 });') {
    return context.processCommandFile({
      open() {},
      read: () => JSON.stringify({ id: 'test', script }),
      close() {}
    });
  }
  return { context, calls, responses, process };
}

const balancedCalls = [
  'beginSuppressDialogs', 'beginUndoGroup', 'endUndoGroup', 'endSuppressDialogs'
];

describe('CEP host command cleanup', () => {
  it('returns script data and balances successful file commands', () => {
    const host = createHost();
    assert.equal(host.process(), 1);
    assert.equal((host.responses[0].data as { answer: number }).answer, 42);
    assert.deepEqual(host.calls, balancedCalls);
    assert.equal(host.context.AEMCP.commandInProgress, false);
  });

  it('reports script errors and accepts the next command', () => {
    const host = createHost();
    assert.equal(host.process('throw new Error("script failed");'), 1);
    assert.match(host.responses[0].error!, /script failed/);
    assert.deepEqual(host.calls, balancedCalls);
    assert.equal(host.context.AEMCP.commandInProgress, false);
    assert.equal(host.process(), 1);
  });

  it('does not repeat undo cleanup when a success response fails', () => {
    const host = createHost('writeSuccessResponse');
    assert.throws(() => host.process(), /response write failed/);
    assert.deepEqual(host.calls, balancedCalls);
    assert.equal(host.context.AEMCP.commandInProgress, false);
    host.context.writeSuccessResponse = () => {};
    assert.equal(host.process(), 1);
  });

  it('releases the guard when an error response fails', () => {
    const host = createHost('writeErrorResponse');
    assert.throws(() => host.process('throw new Error("script failed");'), /error response write failed/);
    assert.deepEqual(host.calls, balancedCalls);
    assert.equal(host.context.AEMCP.commandInProgress, false);
    assert.equal(host.process(), 1);
  });

  it('releases the guard when archiving fails', () => {
    const host = createHost('markAsProcessed');
    assert.throws(() => host.process(), /archive failed/);
    assert.deepEqual(host.calls, balancedCalls);
    assert.equal(host.context.AEMCP.commandInProgress, false);
  });

  for (const direct of [false, true]) {
    for (const failAt of balancedCalls) {
      it(`cleans up ${direct ? 'direct' : 'file'} commands when ${failAt} throws`, () => {
        const host = createHost(failAt);
        const response = direct
          ? JSON.parse(host.context.executeScript('42;'))
          : (host.process(), host.responses[0]);
        assert.equal(response.success, false);
        assert.match(response.error, new RegExp(failAt));
        const expected = failAt === 'beginSuppressDialogs'
          ? ['beginSuppressDialogs']
          : failAt === 'beginUndoGroup'
            ? ['beginSuppressDialogs', 'beginUndoGroup', 'endSuppressDialogs']
            : balancedCalls;
        assert.deepEqual(host.calls, expected);
        assert.equal(host.context.AEMCP.commandInProgress, false);
      });
    }
  }

  it('balances direct execution and preserves the result', () => {
    const host = createHost();
    assert.deepEqual(JSON.parse(host.context.executeScript('({ answer: 42 });')), {
      success: true, data: { answer: 42 }
    });
    assert.deepEqual(host.calls, balancedCalls);
    assert.equal(host.context.AEMCP.commandInProgress, false);
  });

  it('cleans up a direct script failure and accepts the next call', () => {
    const host = createHost();
    const response = JSON.parse(host.context.executeScript('throw new Error("script failed");'));
    assert.equal(response.success, false);
    assert.match(response.error, /script failed/);
    assert.deepEqual(host.calls, balancedCalls);
    assert.equal(host.context.AEMCP.commandInProgress, false);
    assert.equal(JSON.parse(host.context.executeScript('42;')).data, 42);
  });

  it('does not close undo groups again if direct result serialization fails', () => {
    const host = createHost();
    host.context.JSON = { ...JSON, stringify() { throw new Error('serialization failed'); } };
    assert.throws(() => host.context.executeScript('42;'), /serialization failed/);
    assert.deepEqual(host.calls, balancedCalls);
    assert.equal(host.context.AEMCP.commandInProgress, false);
  });

  it('rejects reentrant calls without releasing the active command guard', () => {
    const host = createHost();
    host.context.AEMCP.commandInProgress = true;
    assert.equal(host.process(), 0);
    assert.equal(JSON.parse(host.context.executeScript('42;')).success, false);
    assert.deepEqual(host.calls, []);
    assert.equal(host.context.AEMCP.commandInProgress, true);
  });

  it('isolates script variables from command bookkeeping', () => {
    const host = createHost();
    assert.equal(host.process('var file = null; var undoGroupStarted = false; 42;'), 1);
    assert.deepEqual(host.calls, balancedCalls);
    assert.equal(host.responses[0].data, 42);
  });
});
