// Web Worker: load Pyodide + SymPy and execute a restricted dispatcher.
//
// This file lives under /public so it can use importScripts() easily.
// It is loaded via: new Worker('/workers/sympy-worker.js')

/* global loadPyodide */

const PYODIDE_CDN_VERSION = '0.23.4';
const PYODIDE_INDEX_URL = `https://cdn.jsdelivr.net/pyodide/v${PYODIDE_CDN_VERSION}/full/`;

// Minimal deterministic executor: expects a JSON spec, runs known operations, returns latex + text.
const PYTHON_DISPATCHER = `
import json
import sympy

from sympy import Eq, latex, simplify, diff, integrate
from sympy.solvers.ode import dsolve
from sympy import Function, Symbol
from sympy.parsing.sympy_parser import (
    parse_expr,
    standard_transformations,
    implicit_multiplication_application,
    convert_xor,
)

TRANSFORMS = standard_transformations + (implicit_multiplication_application, convert_xor)

def _parse(s: str):
    if s is None:
        raise ValueError('Missing expression')
    s = str(s).strip()
    if not s:
        raise ValueError('Empty expression')
    # Parse with implicit multiplication (2x -> 2*x) and ^ -> **
    return parse_expr(s, transformations=TRANSFORMS)

def process_spec(spec_json: str):
    try:
        spec = json.loads(spec_json)
    except Exception as e:
        return {"ok": False, "error": f"Invalid spec JSON: {e}"}

    op = (spec.get('op') or '').strip()
    try:
        if op == 'verify':
            lhs = _parse(spec.get('lhs'))
            rhs = _parse(spec.get('rhs'))
            diff_expr = simplify(lhs - rhs)
            truth = 'true' if diff_expr == 0 else 'false'
            return {
                "ok": True,
                "op": op,
                "result_latex": latex(Eq(lhs, rhs)),
                "result_text": str(Eq(lhs, rhs)),
                "meta": {
                    "truth": truth,
                    "difference_latex": latex(diff_expr),
                    "difference_text": str(diff_expr),
                },
                "warnings": [],
            }

        if op == 'simplify':
            expr = _parse(spec.get('expr'))
            res = simplify(expr)
            return {"ok": True, "op": op, "result_latex": latex(res), "result_text": str(res), "meta": {}, "warnings": []}

        if op == 'diff':
            expr = _parse(spec.get('expr'))
            var = spec.get('var')
            if var:
                v = _parse(var)
                res = diff(expr, v)
            else:
                res = diff(expr)
            return {"ok": True, "op": op, "result_latex": latex(res), "result_text": str(res), "meta": {}, "warnings": []}

        if op == 'integrate':
            expr = _parse(spec.get('expr'))
            var = spec.get('var')
            if var:
                v = _parse(var)
                res = integrate(expr, v)
            else:
                res = integrate(expr)
            return {"ok": True, "op": op, "result_latex": latex(res), "result_text": str(res), "meta": {}, "warnings": []}

        if op == 'solve':
            # Intentionally conservative: only accept lhs/rhs and return solve(Eq(lhs,rhs))
            lhs = _parse(spec.get('lhs'))
            rhs = _parse(spec.get('rhs'))
            eq = Eq(lhs, rhs)
            sol = sympy.solve(eq)
            return {"ok": True, "op": op, "result_latex": latex(sol), "result_text": str(sol), "meta": {}, "warnings": []}

        if op == 'dsolve':
            # Support either:
            #   - legacy payload: { ode: "y'' + 9y = 0" }
            #   - structured payload: { lhs: "Derivative(y(x), x, 2) + 9*y(x)", rhs: "0" }

            ode_raw = spec.get('ode')
            lhs_raw = spec.get('lhs')
            rhs_raw = spec.get('rhs')

            if ode_raw is None and (lhs_raw is None or rhs_raw is None):
                raise ValueError("Missing ode (provide 'ode' or 'lhs'+'rhs')")

            # Variable/function defaults
            var_name = (spec.get('var') or 'x').strip() or 'x'
            func_name = (spec.get('func') or 'y').strip() or 'y'

            x = Symbol(var_name)
            y = Function(func_name)

            # If already structured, prefer that.
            if lhs_raw is not None and rhs_raw is not None:
                lhs = parse_expr(str(lhs_raw).strip(), transformations=TRANSFORMS, local_dict={var_name: x, func_name: y})
                rhs = parse_expr(str(rhs_raw).strip(), transformations=TRANSFORMS, local_dict={var_name: x, func_name: y})
                eq = Eq(lhs, rhs)
                sol = dsolve(eq)
                return {"ok": True, "op": op, "result_latex": latex(sol), "result_text": str(sol), "meta": {}, "warnings": []}

            # Otherwise allow common notation: y'' + 9y = 0
            s = str(ode_raw)
            # Strip common leading prose like "Find the general solution ...:"
            if '=' in s and (':' in s or '\\n' in s):
                # Take substring from last ':' or newline before the first '='
                eqi = s.find('=')
                left_cut = max(s.rfind(':', 0, eqi), s.rfind('\\n', 0, eqi))
                if left_cut >= 0:
                    s = s[left_cut+1:]
            s = s.strip()
            # Normalize unicode primes and whitespace
            s = s.replace('′', "'")
            # Ensure it uses '='
            if '=' not in s:
                raise ValueError('ODE must contain =')

            # Replace y'' and y' with Derivative(y(x), x, n)
            # Note: simple string replacement; for complex cases use LLM/spec.
            s = s.replace(f"{func_name}'''", f"Derivative({func_name}({var_name}), {var_name}, 3)")
            s = s.replace(f"{func_name}''", f"Derivative({func_name}({var_name}), {var_name}, 2)")
            s = s.replace(f"{func_name}'", f"Derivative({func_name}({var_name}), {var_name})")
            s = s.replace(f"{func_name}({var_name})", f"{func_name}({var_name})")
            # Replace bare y with y(x) when it appears as a symbol
            # (very heuristic; avoids breaking "y'" cases already handled)
            s = s.replace(f" {func_name} ", f" {func_name}({var_name}) ")
            s = s.replace(f" {func_name}", f" {func_name}({var_name})")
            s = s.replace(f"{func_name} ", f"{func_name}({var_name}) ")

            # Parse equation
            parts = s.split('=')
            lhs = parse_expr(parts[0].strip(), transformations=TRANSFORMS, local_dict={var_name: x, func_name: y})
            rhs = parse_expr(parts[1].strip(), transformations=TRANSFORMS, local_dict={var_name: x, func_name: y})
            eq = Eq(lhs, rhs)
            sol = dsolve(eq)
            return {"ok": True, "op": op, "result_latex": latex(sol), "result_text": str(sol), "meta": {}, "warnings": []}

        return {"ok": False, "error": f"Unsupported op: {op}"}
    except Exception as e:
        return {"ok": False, "error": str(e)}
`;

let pyodideReady = null;
let pyodide = null;

async function initPyodide() {
    if (pyodideReady) return pyodideReady;
    pyodideReady = (async () => {
        importScripts(`${PYODIDE_INDEX_URL}pyodide.js`);
        pyodide = await loadPyodide({ indexURL: PYODIDE_INDEX_URL });
        await pyodide.loadPackage('sympy');
        pyodide.runPython(PYTHON_DISPATCHER);
        return true;
    })();
    return pyodideReady;
}

async function runSpec(spec) {
    await initPyodide();
    const json = JSON.stringify(spec ?? {});
    // Call process_spec(spec_json)
    const globals = pyodide.globals;
    const fn = globals.get('process_spec');
    const outProxy = fn(json);
    const out = outProxy.toJs();
    outProxy.destroy();
    fn.destroy?.();
    return Object.fromEntries(out);
}

self.onmessage = async (evt) => {
    const msg = evt?.data || {};
    const id = msg.id;
    try {
        if (msg.type === 'preload') {
            await initPyodide();
            self.postMessage({ id, ok: true, result: { ok: true, op: 'preload', result_latex: '', result_text: '' } });
            return;
        }

        if (msg.type !== 'run') {
            self.postMessage({ id, ok: false, error: `Unknown message type: ${msg.type}` });
            return;
        }

        const result = await runSpec(msg.spec);
        self.postMessage({ id, ok: true, result });
    } catch (e) {
        self.postMessage({ id, ok: false, error: e && e.message ? e.message : String(e) });
    }
};
