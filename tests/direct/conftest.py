"""Test-level shims for direct-mode.

Direct mode ships handlers for `ExecPrompt` (the raw LLM call used by
`gl.nondet.exec_prompt`) but not for `ExecPromptTemplate` — the wrapper
used by `gl.eq_principle.prompt_comparative` and
`gl.eq_principle.prompt_non_comparative`. To keep the contract idiomatic
we patch direct-mode to route `ExecPromptTemplate` requests through the
same LLM mock system, using a synthesized text prompt built from the
template payload so `mock_llm` regexes can match on it.
"""

from __future__ import annotations

import gltest.direct.wasi_mock as wasi_mock

_ORIGINAL_HANDLE_GL_CALL = wasi_mock._handle_gl_call


def _synthesize_prompt(payload: dict) -> str:
    template = str(payload.get("template", "")).strip()
    task = str(payload.get("task", "")).strip()
    criteria = str(payload.get("criteria", "")).strip()
    inp = str(payload.get("input", "")).strip()
    leader = str(payload.get("leader_answer", "")).strip()
    validator = str(payload.get("validator_answer", "")).strip()
    principle = str(payload.get("principle", "")).strip()

    lines = [f"template={template}"]
    if task:
        lines.append(f"task={task}")
    if criteria:
        lines.append(f"criteria={criteria}")
    if principle:
        lines.append(f"principle={principle}")
    if inp:
        lines.append(f"input={inp}")
    if leader:
        lines.append(f"leader_answer={leader}")
    if validator:
        lines.append(f"validator_answer={validator}")
    return "\n".join(lines)


def _patched_handle_gl_call(vm, request):
    if isinstance(request, dict) and "ExecPromptTemplate" in request:
        payload = request["ExecPromptTemplate"]
        synthetic = _synthesize_prompt(payload)
        return wasi_mock._handle_llm_request(vm, {"prompt": synthetic})
    return _ORIGINAL_HANDLE_GL_CALL(vm, request)


wasi_mock._handle_gl_call = _patched_handle_gl_call
