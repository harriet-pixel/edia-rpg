import test from 'node:test';
import assert from 'node:assert/strict';
import { createEventBus } from '../js/core/events.js';
test('events on/off/emit and returned unsubscribe; buses isolated', () => {
  const bus = createEventBus(), calls = [], fn = value => calls.push(value), stop = bus.on('victory', fn);
  bus.emit('other', 1); bus.emit('victory', { exp: 8 }); assert.deepEqual(calls, [{ exp: 8 }]);
  stop(); bus.emit('victory', 2); assert.equal(calls.length, 1);
  bus.on('victory', fn); bus.off('victory', fn); bus.emit('victory', 3); assert.equal(calls.length, 1);
  createEventBus().emit('victory', 4); assert.equal(calls.length, 1);
});
