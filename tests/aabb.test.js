const assert = require('assert');
const AABB = require('../aabb_lib.js');

describe('AABB Collision Detection', function() {
    it('should return true for basic overlap', function() {
        const r1 = { x: 0, y: 0, width: 10, height: 10 };
        const r2 = { x: 5, y: 5, width: 10, height: 10 };
        assert.strictEqual(AABB(r1, r2), true);
    });

    it('should return false for separate rectangles (far away)', function() {
        const r1 = { x: 0, y: 0, width: 10, height: 10 };
        const r2 = { x: 20, y: 20, width: 10, height: 10 };
        assert.strictEqual(AABB(r1, r2), false);
    });

    it('should return false when touching right edge', function() {
        const r1 = { x: 0, y: 0, width: 10, height: 10 };
        const r2 = { x: 10, y: 0, width: 10, height: 10 };
        assert.strictEqual(AABB(r1, r2), false);
    });

    it('should return false when touching bottom edge', function() {
        const r1 = { x: 0, y: 0, width: 10, height: 10 };
        const r2 = { x: 0, y: 10, width: 10, height: 10 };
        assert.strictEqual(AABB(r1, r2), false);
    });

    it('should return true for containment (r2 inside r1)', function() {
        const r1 = { x: 0, y: 0, width: 20, height: 20 };
        const r2 = { x: 5, y: 5, width: 5, height: 5 };
        assert.strictEqual(AABB(r1, r2), true);
    });

    it('should return true for same rectangle', function() {
        const r1 = { x: 10, y: 10, width: 10, height: 10 };
        const r2 = { x: 10, y: 10, width: 10, height: 10 };
        assert.strictEqual(AABB(r1, r2), true);
    });

    it('should return false for zero-dimension rectangle', function() {
        const r1 = { x: 0, y: 0, width: 0, height: 0 };
        const r2 = { x: 0, y: 0, width: 10, height: 10 };
        assert.strictEqual(AABB(r1, r2), false);
    });

    it('should return true for small overlap', function() {
        const r1 = { x: 0, y: 0, width: 10, height: 10 };
        const r2 = { x: 9.9, y: 9.9, width: 10, height: 10 };
        assert.strictEqual(AABB(r1, r2), true);
    });

    it('should return false for small gap (x)', function() {
        const r1 = { x: 0, y: 0, width: 10, height: 10 };
        const r2 = { x: 10.1, y: 0, width: 10, height: 10 };
        assert.strictEqual(AABB(r1, r2), false);
    });
});
