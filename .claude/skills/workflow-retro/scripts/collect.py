#!/usr/bin/env python3
"""Collect token, cache, tool-call, duration and concurrency metrics for one Claude Code session.

Reads the session transcript under ~/.claude/projects/<slug>/. Standard library only.

  collect.py [--session ID] [--deep] [--since ISO] [--json]

Used by /workflow-retro deep mode from a forked subagent: the output is a bounded digest
(top-N lists), so the transcripts themselves never enter the caller's context.

Default (summary) mode reads only the parent transcript. Its usage covers the main
session's own API calls; subagents appear only as spawned Agent calls. --deep also
reads <session>/subagents/agent-*.jsonl (every nesting depth) and reports per agent.
"""
import argparse
import glob
import json
import os
import re
import subprocess
import sys
from collections import Counter, defaultdict
from datetime import datetime

BIG_RESULT_CHARS = 20_000


def repo_root():
    try:
        return subprocess.run(["git", "rev-parse", "--show-toplevel"], capture_output=True,
                              text=True, check=True).stdout.strip()
    except (OSError, subprocess.CalledProcessError):
        return os.getcwd()


def project_dir(cwd):
    return os.path.expanduser("~/.claude/projects/" + re.sub(r"[^A-Za-z0-9]", "-", cwd))


def parse_ts(s):
    if not s:
        return None
    try:
        return datetime.fromisoformat(s.replace("Z", "+00:00"))
    except ValueError:
        return None


def records(path):
    with open(path, encoding="utf-8") as f:
        for line in f:
            try:
                yield json.loads(line)
            except json.JSONDecodeError:
                continue


def result_chars(content):
    if isinstance(content, str):
        return len(content)
    if isinstance(content, list):
        return sum(len(c.get("text", "")) for c in content if isinstance(c, dict))
    return 0


def scan(path, since=None):
    """Metrics for one transcript. Assistant messages are split into several records
    that repeat the same message id and usage, so usage is deduped by message id."""
    usage_by_msg = {}
    models = Counter()
    tools = {}  # tool_use id -> (name, input)
    results = []  # (chars, tool name, hint)
    first = last = None
    api_errors = 0
    cost_state = None
    for d in records(path):
        if d.get("type") == "cost-state":
            cost_state = d
            continue
        ts = parse_ts(d.get("timestamp"))
        if since and ts and ts < since:
            continue
        if ts and d.get("type") in ("user", "assistant"):
            first = ts if first is None or ts < first else first
            last = ts if last is None or ts > last else last
        msg = d.get("message") or {}
        if d.get("type") == "assistant":
            if d.get("isApiErrorMessage"):
                api_errors += 1
                continue
            mid = msg.get("id") or d.get("requestId") or d.get("uuid")
            u = msg.get("usage") or {}
            prev = usage_by_msg.get(mid, {})
            usage_by_msg[mid] = {
                k: max(prev.get(k, 0), u.get(k, 0) or 0)
                for k in ("input_tokens", "cache_creation_input_tokens",
                          "cache_read_input_tokens", "output_tokens")
            }
            if msg.get("model"):
                models[msg["model"]] += 0 if mid in prev else 1
            for c in msg.get("content") or []:
                if isinstance(c, dict) and c.get("type") == "tool_use":
                    tools[c.get("id")] = (c.get("name"), c.get("input") or {})
        elif d.get("type") == "user" and isinstance(msg.get("content"), list):
            for c in msg["content"]:
                if isinstance(c, dict) and c.get("type") == "tool_result":
                    name, inp = tools.get(c.get("tool_use_id"), ("?", {}))
                    hint = inp.get("file_path") or inp.get("command") or inp.get("pattern") or ""
                    hint = str(hint)
                    results.append((result_chars(c.get("content")), name,
                                    hint if len(hint) <= 70 else "…" + hint[-69:]))

    u = usage_by_msg.values()
    inp = sum(x["input_tokens"] for x in u)
    cw = sum(x["cache_creation_input_tokens"] for x in u)
    cr = sum(x["cache_read_input_tokens"] for x in u)
    out = sum(x["output_tokens"] for x in u)
    peak = max((x["input_tokens"] + x["cache_creation_input_tokens"] + x["cache_read_input_tokens"]
                for x in u), default=0)
    reads = Counter(i.get("file_path") for n, i in tools.values() if n == "Read" and i.get("file_path"))
    spawns = Counter((i.get("subagent_type") or "general-purpose")
                     for n, i in tools.values() if n in ("Agent", "Task"))
    return {
        "api_calls": len(usage_by_msg),
        "models": dict(models),
        "input": inp, "cache_write": cw, "cache_read": cr, "output": out,
        "cache_hit": cr / (inp + cw + cr) if inp + cw + cr else 0.0,
        "peak_context": peak,
        "tool_calls": len(tools),
        "tools": dict(Counter(n for n, _ in tools.values()).most_common()),
        "reads": dict(reads),
        "spawns": dict(spawns),
        "big_results": sorted([r for r in results if r[0] >= BIG_RESULT_CHARS], reverse=True)[:5],
        "start": first.isoformat() if first else None,
        "end": last.isoformat() if last else None,
        "duration_s": (last - first).total_seconds() if first and last else 0,
        "api_errors": api_errors,
        "cost_state": cost_state,
    }


def peak_concurrency(intervals):
    events = sorted([(s, 1) for s, e in intervals] + [(e, -1) for s, e in intervals],
                    key=lambda x: (x[0], x[1]))
    cur = best = 0
    for _, step in events:
        cur += step
        best = max(best, cur)
    return best


def union_seconds(intervals):
    total, end = 0.0, None
    for s, e in sorted(intervals):
        if end is None or s > end:
            total += (e - s).total_seconds()
            end = e
        elif e > end:
            total += (e - end).total_seconds()
            end = e
    return total


def collect(session, pdir, deep, since):
    main_path = os.path.join(pdir, session + ".jsonl")
    if not os.path.exists(main_path):
        sys.exit(f"transcript not found: {main_path}")
    agents = [{"id": "main", "type": "main", "description": "parent session", "depth": 0,
               "parent": None, **scan(main_path, since)}]
    if deep:
        for path in sorted(glob.glob(os.path.join(pdir, session, "subagents", "agent-*.jsonl"))):
            aid = os.path.basename(path)[len("agent-"):-len(".jsonl")]
            meta_path = path[:-len(".jsonl")] + ".meta.json"
            meta = json.load(open(meta_path)) if os.path.exists(meta_path) else {}
            m = scan(path, since)
            if not m["api_calls"]:
                continue
            agents.append({"id": aid, "type": meta.get("agentType", "?"),
                           "description": meta.get("description", ""),
                           "depth": meta.get("spawnDepth", 1),
                           "parent": meta.get("parentAgentId") or "main", **m})

    subs = [a for a in agents if a["id"] != "main" and a["start"] and a["end"]]
    intervals = [(parse_ts(a["start"]), parse_ts(a["end"])) for a in subs]
    starts = [parse_ts(a["start"]) for a in agents if a["start"]]
    ends = [parse_ts(a["end"]) for a in agents if a["end"]]
    wall = (max(ends) - min(starts)).total_seconds() if starts and ends else 0

    readers = defaultdict(set)
    for a in agents:
        for f in a["reads"]:
            readers[f].add(a["id"])
    shared = sorted(((f, len(ids)) for f, ids in readers.items() if len(ids) >= 2),
                    key=lambda x: -x[1])
    rereads = [(a["id"], f, n) for a in agents for f, n in a["reads"].items() if n >= 2]

    tot = {k: sum(a[k] for a in agents)
           for k in ("api_calls", "input", "cache_write", "cache_read", "output", "tool_calls",
                     "api_errors")}
    denom = tot["input"] + tot["cache_write"] + tot["cache_read"]
    tot["cache_hit"] = tot["cache_read"] / denom if denom else 0.0
    cs = agents[0]["cost_state"]
    return {
        "session": session,
        "mode": "deep" if deep else "summary",
        "since": since.isoformat() if since else None,
        "wall_s": wall,
        "agents": agents,
        "totals": tot,
        "subagents": len(subs),
        "max_depth": max((a["depth"] for a in agents), default=0),
        "peak_concurrency": peak_concurrency(intervals) if intervals else 0,
        "parallelism": (sum((e - s).total_seconds() for s, e in intervals) / union_seconds(intervals))
        if intervals and union_seconds(intervals) else 0.0,
        "shared_reads": shared[:15],
        "rereads": sorted(rereads, key=lambda x: -x[2])[:15],
        "parent_reported": {
            "total_cost_usd": cs.get("totalCostUSD"),
            "model_usage": cs.get("modelUsage"),
        } if cs else None,
    }


def k(n):
    return f"{n / 1e6:.2f}M" if n >= 1e6 else f"{n / 1e3:.1f}k" if n >= 1e3 else str(n)


def dur(s):
    s = int(s)
    return f"{s // 3600}h{s % 3600 // 60:02d}m" if s >= 3600 else f"{s // 60}m{s % 60:02d}s"


def report(r):
    t = r["totals"]
    out = [f"# workflow-retro: session {r['session']} ({r['mode']})", ""]
    if r["since"]:
        out.append(f"Window: since {r['since']}")
    out += [
        f"Wall clock: {dur(r['wall_s'])} · Agents: {r['subagents']} subagents, max depth {r['max_depth']}"
        f" · Peak concurrency: {r['peak_concurrency']} · Parallelism: {r['parallelism']:.2f}x",
        f"API calls: {t['api_calls']} · Input: {k(t['input'])} · Cache write: {k(t['cache_write'])}"
        f" · Cache read: {k(t['cache_read'])} · Output: {k(t['output'])} · Cache hit: {t['cache_hit']:.0%}"
        f" · Tool calls: {t['tool_calls']} · API errors: {t['api_errors']}",
        "",
    ]
    if r["mode"] == "summary":
        spawned = r["agents"][0]["spawns"]
        out += ["Summary mode: totals cover the parent session only. Spawned subagents (not counted): "
                + (", ".join(f"{n}×{c}" for n, c in spawned.items()) or "none")
                + ". Re-run with --deep for their usage.", ""]
    out += ["## Per agent", "",
            "| Agent | Type | Depth | Model | Calls | Input | Cache write | Cache read | Output | Hit | Peak ctx | Tools | Duration | Err |",
            "|---|---|---|---|---|---|---|---|---|---|---|---|---|---|"]
    for a in sorted(r["agents"], key=lambda a: -(a["input"] + a["cache_write"] + a["cache_read"] + a["output"])):
        model = ",".join(a["models"]) or "—"
        out.append(f"| {a['id']} | {a['type']} | {a['depth']} | {model} | {a['api_calls']} | {k(a['input'])}"
                   f" | {k(a['cache_write'])} | {k(a['cache_read'])} | {k(a['output'])} | {a['cache_hit']:.0%}"
                   f" | {k(a['peak_context'])} | {a['tool_calls']} | {dur(a['duration_s'])} | {a['api_errors']} |")
    out += ["", "## Tool calls per agent", ""]
    for a in r["agents"]:
        if a["tools"]:
            out.append(f"- {a['id']} ({a['type']}): " + ", ".join(f"{n} {c}" for n, c in a["tools"].items()))
    if r["shared_reads"]:
        out += ["", "## Files read by several agents", ""]
        out += [f"- {f} — {n} agents" for f, n in r["shared_reads"]]
    if r["rereads"]:
        out += ["", "## Files re-read within one agent", ""]
        out += [f"- {aid}: {f} ×{n}" for aid, f, n in r["rereads"]]
    big = [(a["id"], *b) for a in r["agents"] for b in a["big_results"]]
    if big:
        out += ["", f"## Large tool results (≥{k(BIG_RESULT_CHARS)} chars)", ""]
        out += [f"- {aid}: {name} {hint} — {k(chars)} chars"
                for aid, chars, name, hint in sorted(big, key=lambda x: -x[1])[:10]]
    pr = r["parent_reported"]
    if pr:
        out += ["", "## Parent-reported usage (cost-state)", "",
                f"Total cost: ${pr['total_cost_usd']:.2f}" if pr["total_cost_usd"] is not None else "Total cost: —"]
        for model, mu in (pr["model_usage"] or {}).items():
            out.append(f"- {model}: input {k(mu.get('inputTokens', 0))}, cache write "
                       f"{k(mu.get('cacheCreationInputTokens', 0))}, cache read "
                       f"{k(mu.get('cacheReadInputTokens', 0))}, output {k(mu.get('outputTokens', 0))}")
        out.append("Compare with the transcript totals above. A gap means one side misses part of the run"
                   " (cost-state is cumulative for the whole session and ignores --since).")
    return "\n".join(out)


def main():
    p = argparse.ArgumentParser()
    p.add_argument("--session", default=os.environ.get("CLAUDE_CODE_SESSION_ID"))
    p.add_argument("--project-dir", default=project_dir(repo_root()))
    p.add_argument("--deep", action="store_true")
    p.add_argument("--since", help="ISO timestamp; ignore records before it")
    p.add_argument("--json", action="store_true")
    a = p.parse_args()
    if not a.session:
        mains = glob.glob(os.path.join(a.project_dir, "*.jsonl"))
        if not mains:
            sys.exit(f"no transcripts in {a.project_dir}")
        a.session = os.path.basename(max(mains, key=os.path.getmtime))[:-len(".jsonl")]
    since = parse_ts(a.since)
    if since and since.tzinfo is None:
        since = since.astimezone()
    r = collect(a.session, a.project_dir, a.deep, since)
    if a.json:
        for ag in r["agents"]:
            ag.pop("cost_state", None)
        print(json.dumps(r, indent=2, default=str))
    else:
        print(report(r))


if __name__ == "__main__":
    main()
