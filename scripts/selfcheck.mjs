import assert from 'node:assert/strict';

/**
 * This is a dependency-free sanity check suite for the client-side proof versioning model.
 *
 * Run:
 *   npm run selfcheck
 */

/** @typedef {{
 *  id: string;
 *  type: 'raw'|'structured';
 *  versionNumber: string;
 *  baseMajor: number;
 *  content?: string;
 *  sublemmas: any[];
 *  userEdited?: boolean;
 *  derived?: boolean;
 * }} ProofVersion */

const uuid = (() => {
    let i = 0;
    return () => `test-${++i}`;
})();

const getMaxRawMajor = (history) =>
    history.reduce((m, v) => (v.type === 'raw' ? Math.max(m, v.baseMajor) : m), 0);

const makeRawVersion = (history, content) => {
    const nextMajor = (getMaxRawMajor(history) || 0) + 1;
    return {
        id: uuid(),
        type: 'raw',
        versionNumber: `${nextMajor}`,
        baseMajor: nextMajor,
        content,
        sublemmas: [],
        userEdited: true,
        derived: false,
    };
};

const makeStructuredVersion = (history, baseMajor, steps, opts = {}) => {
    const minors = history
        .filter((v) => v.baseMajor === baseMajor && v.type === 'structured')
        .map((v) => {
            const parts = (v.versionNumber || '').split('.');
            return parts.length > 1 ? parseInt(parts[1], 10) || 0 : 0;
        });
    const nextMinor = (minors.length ? Math.max(...minors) : 0) + 1;
    const versionNumber = `${baseMajor}.${nextMinor}`;
    return {
        id: uuid(),
        type: 'structured',
        versionNumber,
        baseMajor,
        content: '',
        sublemmas: steps,
        userEdited: !!opts.userEdited,
        derived: opts.derived ?? true,
    };
};

function test(name, fn) {
    try {
        fn();
        console.log(`✓ ${name}`);
    } catch (e) {
        console.error(`✗ ${name}`);
        throw e;
    }
}

// ------------------
// Tests
// ------------------

test('raw majors increment as integers (1,2,3,...)', () => {
    /** @type {ProofVersion[]} */
    const hist = [];
    const v1 = makeRawVersion(hist, 'a');
    hist.push(v1);
    const v2 = makeRawVersion(hist, 'b');
    hist.push(v2);
    const v3 = makeRawVersion(hist, 'c');

    assert.equal(v1.versionNumber, '1');
    assert.equal(v2.versionNumber, '2');
    assert.equal(v3.versionNumber, '3');
    assert.equal(v3.baseMajor, 3);
});

test('structured minors increment per baseMajor (N.1, N.2, ...)', () => {
    /** @type {ProofVersion[]} */
    const hist = [];
    const raw1 = makeRawVersion(hist, 'raw1');
    hist.push(raw1);

    const s11 = makeStructuredVersion(hist, 1, [{}, {}]);
    hist.push(s11);
    const s12 = makeStructuredVersion(hist, 1, [{}, {}]);
    hist.push(s12);

    assert.equal(s11.versionNumber, '1.1');
    assert.equal(s12.versionNumber, '1.2');
});

test('structured minors are independent across baseMajors', () => {
    /** @type {ProofVersion[]} */
    const hist = [];
    const raw1 = makeRawVersion(hist, 'raw1');
    hist.push(raw1);
    hist.push(makeStructuredVersion(hist, 1, [{}]));
    hist.push(makeStructuredVersion(hist, 1, [{}]));

    const raw2 = makeRawVersion(hist, 'raw2');
    hist.push(raw2);
    const s21 = makeStructuredVersion(hist, 2, [{}]);

    assert.equal(s21.versionNumber, '2.1');
});

test('manual structured edits should be marked userEdited=true and derived=false', () => {
    /** @type {ProofVersion[]} */
    const hist = [];
    hist.push(makeRawVersion(hist, 'raw'));
    const s = makeStructuredVersion(hist, 1, [{}], { userEdited: true, derived: false });

    assert.equal(s.userEdited, true);
    assert.equal(s.derived, false);
});

test('override warning condition: user-edited structured exists for same baseMajor', () => {
    /** @type {ProofVersion[]} */
    const hist = [];
    hist.push(makeRawVersion(hist, 'raw'));
    hist.push(makeStructuredVersion(hist, 1, [{}], { userEdited: false, derived: true }));

    const hasUserEdited = (baseMajor) =>
        hist.some((v) => v.type === 'structured' && v.baseMajor === baseMajor && v.userEdited);

    assert.equal(hasUserEdited(1), false);

    hist.push(makeStructuredVersion(hist, 1, [{}], { userEdited: true, derived: false }));
    assert.equal(hasUserEdited(1), true);
});

console.log('\nSelf-check complete.');
